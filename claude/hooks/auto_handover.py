"""
auto_handover.py — Stop hook. Uses transcript_path from hook payload (reliable).
Scans transcript for auto-memory candidates -> memory_staging.md, and for
mistake-admission language -> the current project's own .crisp/MISTAKES.md
(a per-project ledger, not the global memory-vault — see crisp/claude/CLAUDE.md
"Project Ledgers").

Handover-doc writing and turn counting used to live here too, but that duplicated
what TEA (token-efficient-agent-kit, vendored as crisp/engine) already does via
tea-lifecycle-hook.js (session-handoffs/, observations.jsonl) and `tea.js
session-rollover`. This hook now does only what TEA doesn't: categorizing
raw message text into feedback/project/user candidates for the curated memory
files under ~/.claude/projects/<project>/memory/, plus the mistake-ledger draft.
"""
from __future__ import annotations
import json, os, re, sys, traceback
from pathlib import Path

_INJECTED_BLOCK = re.compile(
    r"<system-reminder>.*?</system-reminder>|<task-notification>.*?</task-notification>",
    re.S | re.I)
_INJECTED_LINE = re.compile(
    r"^(?:\[SKILL-SUGGEST\]|Active token-kit learned patterns|Token-kit context:"
    r"|\w+ hook additional context:|# Environment|<command-name>|<local-command).*$",
    re.M | re.I)
_SYNTHETIC_START = re.compile(
    r"^(?:this session is being continued|caveat: the messages below)", re.I)

MEMORY_PATTERNS = {
    "feedback": [r"don.t\s+\w+",r"stop\s+\w+",r"always\s+\w+",r"never\s+\w+",
                 r"prefer\s+\w+",r"from now on",r"please (don.t|always|never|avoid)"],
    "project":  [r"deadline|by [A-Z][a-z]+day",r"blocked on|waiting on",
                 r"decided to|going with|switching to",r"the reason (we|I|this)"],
    "user":     [r"I('m| am) a\b",r"I (prefer|like|want|use)",r"my (workflow|setup|project)"],
}

# Scanned across BOTH user and assistant messages (a mistake can be admitted
# by either side), unlike MEMORY_PATTERNS above which is user-only.
# Deliberately narrow: each must read as an ADMISSION, not as narration about a
# bug. "root cause was" and "this broke because" were removed — they match
# ordinary fix reports ("root cause was X, now fixed"), which is how live
# ledgers filled up with successes mislabelled as mistakes.
MISTAKE_PATTERNS = [
    r"I made a mistake", r"that was wrong", r"my bad\b", r"I should have",
    r"I was wrong", r"I broke\b",
    r"my mistake", r"I misunderstood", r"I got that wrong",
]

ERROR_LOG = Path.home() / ".claude" / "hooks" / "hook-errors.log"

def _log_error(msg: str) -> None:
    """Every failure in here used to vanish into a bare `except: pass`, so
    hook-errors.log had never once been created and nothing this hook got wrong
    was ever visible. Still best-effort — a logging failure must never break the
    Stop event — but it now leaves a trace."""
    try:
        ERROR_LOG.parent.mkdir(parents=True, exist_ok=True)
        from datetime import datetime
        with open(ERROR_LOG, "a", encoding="utf-8") as f:
            f.write(f"{datetime.now().isoformat()} auto_handover: {msg}\n")
    except Exception:
        pass

def _read_transcript(transcript_path: str):
    """Returns (recent_messages, touched_files, all_messages). recent_messages
    is the trailing 20, used for memory-staging categorization same as
    before; all_messages is the full parsed transcript, used by main() to
    apply the per-session mistake-scan watermark (see _load_watermark) so a
    long-running session doesn't re-scan (and re-attempt to save) the same
    old admission every single Stop event for as long as it stays inside the
    trailing-20 window. touched_files are basenames pulled from Edit/Write/
    Read tool_use inputs in the transcript — used to rank mistake-ledger
    relevance by what's actually being worked on this turn, not just by
    recency."""
    msgs = []
    files = set()
    try:
        # encoding="utf-8" is required: transcripts are UTF-8, but read_text()
        # defaults to the platform encoding (cp1252 on Windows), which silently
        # mangles any non-ASCII character — em-dashes became "â€"" in ledgers.
        for line in Path(transcript_path).read_text(encoding="utf-8", errors="ignore").splitlines():
            try:
                obj = json.loads(line)
                msg = obj.get("message", {})
                role = msg.get("role","")
                if role not in ("user","assistant"): continue
                content = msg.get("content","")
                if isinstance(content, list):
                    texts = []
                    for c in content:
                        if not isinstance(c, dict): continue
                        if c.get("type") == "text":
                            texts.append(c.get("text",""))
                        elif c.get("type") == "tool_use":
                            inp = c.get("input", {}) or {}
                            for key in ("file_path", "path", "notebook_path"):
                                val = inp.get(key)
                                if isinstance(val, str) and val:
                                    files.add(Path(val).name.lower())
                    text = " ".join(texts)
                else:
                    text = str(content)
                text = text.strip()
                if text: msgs.append({"role":role,"text":text})
            # One malformed line is expected and skippable. `except Exception`
            # rather than a bare `except` so KeyboardInterrupt and SystemExit
            # still propagate instead of being silently swallowed.
            except Exception: continue
    except Exception as e:
        # A whole-transcript failure is NOT expected. Left unlogged it returns an
        # empty scan, which is indistinguishable from "nothing to report".
        _log_error(f"_read_transcript({transcript_path!r}): {e!r}")
    return msgs[-20:], files, msgs

def _user_said(text):
    """Strip harness-injected text so only what the USER actually typed is scanned.

    Injected content arrives inside the user turn but is not user speech. Treating it as
    feedback is what filled memory-staging with 490 KB of compaction boilerplate. A marker
    line takes its trailing bullet block with it -- the token-kit patterns block is a header
    line followed by "- ..." lines, and stripping only the header left the bullets behind.
    """
    t = _INJECTED_BLOCK.sub(" ", text)
    out, skipping = [], False
    for line in t.splitlines():
        if _INJECTED_LINE.match(line.strip()):
            skipping = True
            continue
        if skipping and (not line.strip() or line.lstrip().startswith(("-", "*"))):
            continue
        skipping = False
        out.append(line)
    t = chr(10).join(out).strip()
    if _SYNTHETIC_START.match(t):
        return ""
    return t


def _clause_around(text, idx, limit=200):
    """Return the sentence containing the match, not the first 200 chars of the message.

    The old code stored text[:200]; a pattern matching at char 5000 saved 200 chars of
    unrelated preamble. The window is clamped near the match so a long run without any
    sentence terminator cannot drag the whole preamble in either.
    """
    floor = max(0, idx - 120)
    starts = [text.rfind(ch, floor, idx) for ch in (".", "!", "?", chr(10))]
    start = max(starts)
    start = idx if start < 0 else start + 1   # no boundary in window: begin at the match itself
    ends = [x for x in (text.find(ch, idx) for ch in (".", "!", "?", chr(10))) if x != -1]
    end = min(ends) + 1 if ends else len(text)
    end = min(end, idx + limit)
    return " ".join(text[start:end].split())[:limit]


def _categorize(msgs):
    found = {"feedback":[],"project":[],"user":[]}
    for m in msgs:
        if m["role"] != "user": continue
        text = _user_said(m["text"])
        if not text or len(text) > 4000:   # empty, or pasted content rather than an instruction
            continue
        for cat, pats in MEMORY_PATTERNS.items():
            for pat in pats:
                hit = re.search(pat, text, re.IGNORECASE)
                if hit:
                    clause = _clause_around(text, hit.start())
                    if len(clause) >= 12 and clause not in found[cat]:
                        found[cat].append(clause)
                    break
    return found


def _scan_mistakes(msgs):
    found = []
    for m in msgs:
        text = m["text"]
        # Skip generated reports: a markdown table is analysis, not an
        # admission. Without this, a write-up *about* a bug gets logged as if it
        # were the bug — the ledger fills with the prose describing the problem.
        if "|---" in text or "| ---" in text: continue
        # Skip THIS HOOK'S OWN Stop feedback. Fixed 2026-09-09 after the ledger
        # grew 44 -> 52 entries in one day across three sessions, six of them
        # containing the words "Stop hook feedback" nested inside each other.
        # The cycle is closed and self-amplifying: the hook writes an entry
        # containing "I should have"; on the next Stop it injects that entry
        # back into the transcript as feedback; this scanner then reads its own
        # feedback, matches the very phrase it just wrote, and logs it again one
        # level deeper. The `|---` guard above does not catch it because the
        # feedback is a bullet list, not a table. Every turn made it worse, and
        # it degrades the signal for every project, since the hook's whole job
        # is to surface REAL past mistakes at the moment they are about to
        # recur.
        if ("Stop hook feedback" in text
                or "repeat a mistake already logged" in text):
            continue
        for pat in MISTAKE_PATTERNS:
            if re.search(pat, text, re.IGNORECASE):
                s = text[:220].replace("\n"," ")
                if s not in found: found.append(s)
                break
    return found

def _repo_root(cwd):
    """Walk up from cwd to the git repo root.

    Both the ledger and the vault staging file used to be derived from the raw
    cwd, with mkdir(exist_ok=True) -- so a session started in ANY subdirectory
    silently minted a whole second ledger tree there instead of using the
    project's. Observed 2026-09-10 in Aurora gatway: three competing
    .crisp/MISTAKES.md (root=81 entries, aurora_scanner/=11, traderlion/=1) and
    seven vault "projects" (output, scan_checkpoints, server, tools,
    aurora_scanner, ...) that are just subdirectory basenames. Seven real
    lessons sat in a file the Stop hook never read from the repo root, one of
    them the very mistake it failed to catch that day.

    Falls back to cwd when there is no .git anywhere above -- a non-repo
    directory keeps the old behaviour rather than erroring.
    """
    try:
        here = Path(cwd).resolve()
    except Exception:
        return Path(cwd)
    for cand in [here, *here.parents]:
        try:
            if (cand / ".git").exists():   # dir for a normal clone, file for a worktree
                return cand
        except Exception:
            continue
    return here


def _project_ledger_path(cwd):
    # Lives INSIDE the project (not ~/.claude/*) so it's git-tracked and
    # survives independently of the global, prunable memory-vault.
    # Anchored to the REPO ROOT, not cwd -- see _repo_root().
    ledger_dir = _repo_root(cwd) / ".crisp"
    ledger_dir.mkdir(parents=True, exist_ok=True)
    return ledger_dir / "MISTAKES.md"

def _watermark_path(cwd):
    # Sidecar next to the ledger, not inside it -- one small JSON file,
    # {session_id: message_count_already_scanned}, so a session doesn't keep
    # re-scanning (and re-attempting to save) the same old admission every
    # single Stop event for as long as it stays inside the trailing-20-message
    # window. Reproduced directly: the write-side substring dedup (`m in
    # existing`) IS correct for a genuine byte-identical repeat -- the real
    # observed failure was the SAME session re-finding and re-saving the same
    # admission many times over several hours, which a per-session watermark
    # prevents at the source (never re-considered) rather than patching after
    # the fact (compared-but-still-attempted). Lives in .crisp/ like the
    # ledger itself, not ~/.claude/*, for the same reason: project-local,
    # git-ignorable, survives independent of the global memory-vault.
    return _repo_root(cwd) / ".crisp" / ".mistake_scan_watermarks.json"


def _load_watermark(cwd, session_id):
    path = _watermark_path(cwd)
    if not path.exists(): return 0
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return int(data.get(session_id, 0))
    except Exception:
        return 0


def _save_watermark(cwd, session_id, total_msg_count):
    path = _watermark_path(cwd)
    data = {}
    if path.exists():
        try: data = json.loads(path.read_text(encoding="utf-8"))
        except Exception: data = {}
    data[session_id] = total_msg_count
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data), encoding="utf-8")
    except Exception:
        pass


def _save_mistakes(session_id, cwd, mistakes):
    if not mistakes: return
    from datetime import datetime
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    ledger = _project_ledger_path(cwd)
    is_new = not ledger.exists()
    # Dedup against what the ledger ALREADY holds, not merely within this call.
    # A byte-identical repeat (the case that actually matters going forward --
    # _read_transcript's own utf-8 fix above means every future read/write is
    # consistently encoded) is caught by a plain substring check; the separate,
    # real problem of the SAME session re-scanning the SAME old admission for
    # hours is handled upstream by the per-session watermark (_load_watermark/
    # _save_watermark), not here.
    existing = ""
    if not is_new:
        try: existing = ledger.read_text(encoding="utf-8", errors="ignore")
        except Exception: existing = ""
    fresh = [m for m in mistakes if m not in existing]
    if not fresh: return
    lines = []
    if is_new:
        lines.append("# Mistakes Ledger\n\nAuto-drafted by auto_handover.py; edit freely — this is a starting point, not a final record.\n")
    lines.append(f"\n## {ts} | {session_id[:8]}\n")
    for item in fresh: lines.append(f"- {item}\n")
    with open(ledger,"a",encoding="utf-8") as f: f.writelines(lines)

_WRITE_TOOLS = {"edit", "write", "multiedit", "notebookedit"}

# A Bash command that modifies something. Deliberately broad on the write side:
# a false positive costs one extra review prompt, while a false negative silently
# disables the gate on a turn that genuinely changed code.
_BASH_WRITE = re.compile(
    r"(?:^|[^0-9<])>>?\s*[^\s|&;<>]"                       # redirect into a file
    r"|\bsed\s+-i\b"
    r"|\b(?:cp|mv|rm|tee|truncate|mkdir|touch|chmod)\s"
    r"|\bgit\s+(?:commit|apply|checkout|reset|revert|merge|rebase|push|add)\b"
    r"""|open\([^)]*['"][wa]""",                           # python open(path, "w")
    re.I,
)


def _wrote_this_turn(transcript_path):
    """True if the CURRENT turn actually modified something.

    The pre-existing touched_files set cannot answer this. It collects file_path from
    Read as well as from Edit/Write, so a purely read-only turn looks like a write; and
    it misses Bash-driven edits entirely -- heredocs, redirects, sed -i -- which is how
    most edits are made in this setup. Wrong in both directions, which is why the review
    gate fired on turns that had nothing to review.

    Only entries after the last real user message are scanned, so this answers "did THIS
    turn change anything", not "did this session ever change anything". A tool_result
    arrives as role=user with no text block, so those envelopes are not mistaken for the
    start of a new turn.

    On any failure it returns True: an unreadable transcript means we cannot prove the
    turn was read-only, and the safe default is to review rather than to skip silently.
    """
    try:
        lines = Path(transcript_path).read_text(encoding="utf-8", errors="ignore").splitlines()
    except Exception:
        return True

    parsed, last_user = [], -1
    for i, line in enumerate(lines):
        try:
            obj = json.loads(line)
        except Exception:
            parsed.append(None)
            continue
        parsed.append(obj)
        msg = obj.get("message", {}) or {}
        if msg.get("role") != "user":
            continue
        content = msg.get("content", "")
        if isinstance(content, str) and content.strip():
            last_user = i
        elif isinstance(content, list) and any(
            isinstance(c, dict) and c.get("type") == "text" and (c.get("text") or "").strip()
            for c in content
        ):
            last_user = i

    for obj in parsed[last_user + 1:]:
        if not obj:
            continue
        content = (obj.get("message", {}) or {}).get("content", "")
        if not isinstance(content, list):
            continue
        for c in content:
            if not isinstance(c, dict) or c.get("type") != "tool_use":
                continue
            name = str(c.get("name", "")).lower()
            if name in _WRITE_TOOLS:
                return True
            if name == "bash" and _BASH_WRITE.search(str((c.get("input") or {}).get("command", ""))):
                return True
    return False


def _relevant_mistakes(cwd, touched_files, limit=5):
    """Bullet entries from .crisp/MISTAKES.md, ranked by relevance to files
    touched this turn — not pure recency. Recency is a weak proxy: a mistake
    logged 3 months ago about auth.py is exactly as relevant today as one
    from yesterday, if auth.py is what's being touched right now. Falls back
    to the most recent entries only when nothing matches (no touched files
    detected, or no ledger entry mentions them) or when the ledger is new.
    Always capped at `limit`, regardless of how long the ledger grows.

    Known limit: matches on file basename only (e.g. "auth.py"), not on
    function/concept names mentioned in the mistake text — a real relevance
    gap, but a cheap, honest improvement over pure recency without needing
    semantic search."""
    ledger = _project_ledger_path(cwd)
    if not ledger.exists(): return []
    try:
        lines = ledger.read_text(encoding="utf-8", errors="ignore").splitlines()
    except Exception:
        return []
    bullets = [l[2:].strip() for l in lines if l.startswith("- ")]
    # Dedup at READ time too, not only at write time. Ledgers written before the
    # write-side fix already contain duplicates, and they are user data that
    # must not be rewritten in place — so the gate filters them on the way out.
    seen, deduped = set(), []
    for b in bullets:
        if b not in seen:
            seen.add(b)
            deduped.append(b)
    bullets = deduped
    if not bullets: return []

    matched = [b for b in bullets if touched_files and any(f in b.lower() for f in touched_files)]
    if matched:
        return matched[-limit:]
    return bullets[-limit:]

def _review_gate(cwd, stop_hook_active, touched_files, wrote_this_turn=True):
    """Block the Stop event once (per Claude Code's Stop-hook schema:
    https://code.claude.com/docs/en/hooks.md) so the model reviews its own
    change against relevant project mistakes before actually finishing.
    stop_hook_active=True means this already fired once this turn — never
    block twice in a row, both to respect Claude Code's own loop guard and
    because the review has already happened once."""
    if stop_hook_active: return None
    # Nothing was changed this turn, so there is no change to review. Without this the
    # gate interrupted read-only turns -- answering a question, reading a file -- which
    # trains the reader to dismiss it, and a gate that gets dismissed by reflex is worse
    # than no gate.
    if not wrote_this_turn: return None
    recent = _relevant_mistakes(cwd, touched_files)
    if not recent: return None
    checklist = "\n".join(f"- {m}" for m in recent)
    # Stop hooks block with a TOP-LEVEL {"decision": "block", "reason": ...}.
    # The permissionDecision/hookSpecificOutput shape is PreToolUse-only and is
    # silently ignored on Stop, which made this gate a no-op for its whole life.
    return {
        "decision": "block",
        "reason": (
            "Before finishing, check your change doesn't repeat a mistake "
            f"already logged in .crisp/MISTAKES.md for this project:\n{checklist}"
        ),
    }

def _vault_dir():
    """The CRISP vault is the single source of truth for memory (decided 2026-09-09).

    Staging used to live in ~/.claude/memory-staging/, a separate store the docs did not
    even point at correctly -- CLAUDE.md named ~/.claude/hooks/memory_staging.md, which was
    0 bytes, so every "promote staged candidates" step silently no-opped while real
    candidates piled up elsewhere. Staging now lives inside the vault, beside the project it
    belongs to, so there is one tree and nothing to keep in sync.
    """
    env = os.environ.get("TEA_MEMORY_DIR")
    if env:
        return Path(env)
    return Path.home() / "tools" / "crisp" / "engine" / "memory-vault"


def _project_staging(cwd):
    # basename of the REPO ROOT, not of cwd -- a session started in a
    # subdirectory used to mint projects/<subdir-name>/ in the vault.
    project = _repo_root(cwd).name.lower().replace(" ","-").replace(chr(92),"").replace("/","")
    staging_dir = _vault_dir() / "projects" / (project or "unassigned")
    staging_dir.mkdir(parents=True, exist_ok=True)
    return staging_dir / "staging.md"


def _save_staging(session_id, cwd, found):
    if not any(found.values()): return
    from datetime import datetime
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    staging = _project_staging(cwd)
    lines = [f"\n## {ts} | {session_id[:8]}\n"]
    for cat,items in found.items():
        for item in items: lines.append(f"- [{cat}] {item}\n")
    with open(staging,"a",encoding="utf-8") as f: f.writelines(lines)

def main():
    import os
    raw = (sys.stdin.read() or "").strip() or "{}"
    try: event = json.loads(raw)
    except Exception as e:
        _log_error(f"main: unparseable hook payload: {e!r}")
        event = {}

    session_id = event.get("session_id") or event.get("sessionId") or "session"
    cwd = event.get("cwd", os.getcwd())
    transcript_path = event.get("transcript_path") or event.get("transcriptPath","")

    msgs, touched_files, all_msgs = _read_transcript(transcript_path) if transcript_path else ([], set(), [])
    found = _categorize(msgs)
    _save_staging(session_id, cwd, found)
    # Mistake-scan watermark: only consider messages added since the LAST
    # time this session's Stop hook ran, not the trailing-20 window every
    # time. Without this, an admission sitting anywhere in a long, quiet
    # stretch gets re-detected and re-attempted on every single turn for as
    # long as it stays inside the last 20 -- reproduced directly against a
    # real duplicate group in this ledger (same session_id, same text,
    # re-saved 9 times over ~4 hours). The write-side substring dedup in
    # _save_mistakes still catches a byte-identical repeat if one somehow
    # gets through; this stops the repeat from being considered at all.
    watermark = _load_watermark(cwd, session_id)
    new_msgs = all_msgs[watermark:] if watermark < len(all_msgs) else []
    mistakes = _scan_mistakes(new_msgs)
    _save_mistakes(session_id, cwd, mistakes)
    _save_watermark(cwd, session_id, len(all_msgs))

    wrote = _wrote_this_turn(transcript_path) if transcript_path else True
    gate = _review_gate(cwd, bool(event.get("stop_hook_active")), touched_files, wrote)
    if gate:
        print(json.dumps(gate))

if __name__ == "__main__":
    try: main()
    except Exception as e:
        # Full traceback, not just str(e): "KeyError: 'message'" alone gives no
        # line to look at, which is why the earlier one-line form would not have
        # helped even if the log had ever been written.
        _log_error(f"main: {e!r}\n{traceback.format_exc()}")
    sys.exit(0)

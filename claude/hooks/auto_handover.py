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
files under ~/.claude/projects/<project>/memory/, plus the mistake-ledger draft,
plus skill observations (P-457 phase 1; see the section above main()).
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
# "I should have" was removed 2026-09-13. It is the loosest phrase here and fires on
# ordinary conversational acknowledgement, not on an admission worth remembering. It
# scraped this sentence into the ledger verbatim, mid-sentence and trailing colon
# included: "Correct - and I should have said that rather than naming only Aurora.
# `memory-vault/*` is a wildcard ... Verifying across all of them rather than asserting
# it:". That is not a lesson, and once written it was replayed as one on every later
# write turn. The remaining phrases all name an actual error ("I broke", "I was wrong").
MISTAKE_PATTERNS = [
    r"I made a mistake", r"that was wrong", r"my bad\b",
    r"I was wrong", r"I broke\b",
    # 2026-09-15: was bare r"my mistake", which also matches "my mistakeS" --
    # so ordinary prose ABOUT the ledger ("my mistakes are committed") was
    # filed as an admission, twice in one session, each time a session
    # explained the previous false entry. Singular is the admission form
    # ("that was my mistake"); plural is talking about the ledger.
    r"my mistake(?!s)", r"I misunderstood", r"I got that wrong",
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
    recency.

    Whole-file read. main() no longer calls it on every Stop: it reads from the
    saved byte offset instead (_new_since_watermark)."""
    msgs, files, _ = _read_new_messages(transcript_path, 0)
    return msgs[-20:], files, msgs


def _message_from_line(line, files):
    """One transcript line -> {"role", "text"}, or None for anything that is not a
    user/assistant message with text. Adds touched file basenames to `files`."""
    obj = json.loads(line)
    msg = obj.get("message", {})
    role = msg.get("role","")
    if role not in ("user","assistant"): return None
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
                        # Real bug found 2026-09-13 (Mohit: "dig deeper on
                        # dcr acronym issue as they keep appearing"): `path`
                        # is also how Bash/Grep/Glob address a DIRECTORY, not
                        # just how Edit/Write/Read address a file. Without
                        # this suffix check, a single directory-scoped tool
                        # call anywhere in the transcript (e.g. a path ending
                        # in ".../aurora_scanner") adds that bare directory
                        # name to `files` forever (the set is kept for the whole
                        # session, see _save_watermark, so it only
                        # grows) -- and because a project-root directory
                        # name is a substring of nearly every file path
                        # under it, `_relevant_mistakes()`'s substring match
                        # then locks onto whichever single ledger bullet
                        # happens to spell out that fully-qualified path
                        # instead of a bare filename, and shows that SAME
                        # entry on every subsequent Stop for the rest of the
                        # session regardless of what's actually being
                        # touched. A directory basename essentially never
                        # has a dot-extension, so requiring one is a cheap,
                        # honest filter -- same "basename only, not
                        # semantic" philosophy this function already uses,
                        # not a new kind of check.
                        p = Path(val)
                        if p.suffix:
                            files.add(p.name.lower())
        text = " ".join(texts)
    else:
        text = str(content)
    text = text.strip()
    return {"role":role,"text":text} if text else None


def _read_new_messages(transcript_path, offset=0):
    """(messages, touched_files, end_offset) for the transcript from byte `offset` on.

    Transcripts only grow, so main() keeps the byte offset it reached and reads from
    there on the next Stop: the cost is this turn's lines, not the whole session. A
    whole-file read took about 100 s on a 1.4 GB transcript on this machine (2026-10-26).
    A last line that does not parse yet is still being written; it is left for the next
    Stop and end_offset stops before it."""
    msgs, files, end = [], set(), offset
    try:
        with open(transcript_path, "rb") as f:
            f.seek(offset)
            data = f.read()
        lines = data.split(b"\n")
        if lines[-1].strip():
            try: json.loads(lines[-1])
            except Exception:
                data = data[:len(data) - len(lines[-1])]
                lines[-1] = b""
        end = offset + len(data)
        # Split on b"\n" and decode per line: utf-8, never the platform encoding
        # (cp1252 on Windows mangled em-dashes into "â€"" in ledgers). A newline byte
        # never falls inside a multi-byte character, so no character is cut.
        for raw in lines:
            try:
                m = _message_from_line(raw.decode("utf-8", "ignore"), files)
                if m: msgs.append(m)
            # One malformed line is expected and skippable. `except Exception`
            # rather than a bare `except` so KeyboardInterrupt and SystemExit
            # still propagate instead of being silently swallowed.
            except Exception: continue
    except Exception as e:
        # A whole-transcript failure is NOT expected. Left unlogged it returns an
        # empty scan, which is indistinguishable from "nothing to report".
        _log_error(f"_read_new_messages({transcript_path!r}, {offset}): {e!r}")
    return msgs, files, end

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


def _is_hook_noise(text):
    """Shared with _scan_mistakes below -- the same self-amplifying loop (this
    hook's own injected feedback gets read back as if it were new user content
    on the next Stop) turned out to hit staging too, not just the mistakes
    ledger it was first fixed for on 2026-09-09. See _scan_mistakes's comment
    for the full mechanism; factored out so a third recurrence isn't possible."""
    return "Stop hook feedback" in text or "repeat a mistake already logged" in text


def _categorize(msgs):
    found = {"feedback":[],"project":[],"user":[]}
    for m in msgs:
        if m["role"] != "user": continue
        if _is_hook_noise(m["text"]): continue
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
        if _is_hook_noise(text):
            continue
        for pat in MISTAKE_PATTERNS:
            hit = re.search(pat, text, re.IGNORECASE)
            if hit:
                # Store the sentence containing the admission, not the first 220 chars of
                # the message. Same defect _categorize had: a match deep in a long message
                # saved unrelated preamble instead of the thing that matched.
                s = _clause_around(text, hit.start(), 220)
                if len(s) >= 12 and s not in found: found.append(s)
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

    A git WORKTREE also has this bug, found 2026-09-30: its .git is a FILE
    (this function's own prior comment already said so) containing
    "gitdir: <main-repo>/.git/worktrees/<name>" -- but the old code just
    returned the worktree directory itself, same as a normal clone, so every
    agent worktree (Aurora runs these routinely) minted its own phantom vault
    "project" (e.g. agent-aa4095ea778b45a74) exactly like the pre-2026-09-10
    subdirectory bug this function was written to fix. Confirmed live:
    .claude/worktrees/agent-aa4095ea778b45a74/.git literally reads
    "gitdir: C:/Users/mohit/Aurora gatway/.git/worktrees/agent-aa4095ea778b45a74".
    Now resolved back through that pointer to the real repo root.
    """
    try:
        here = Path(cwd).resolve()
    except Exception:
        return Path(cwd)
    for cand in [here, *here.parents]:
        try:
            git_path = cand / ".git"
            if git_path.is_dir():
                return cand
            if git_path.is_file():
                try:
                    content = git_path.read_text(encoding="utf-8", errors="ignore").strip()
                except Exception:
                    content = ""
                if content.lower().startswith("gitdir:"):
                    gitdir = content.split(":", 1)[1].strip().replace("\\", "/")
                    marker = "/.git/worktrees/"
                    idx = gitdir.find(marker)
                    if idx != -1:
                        return Path(gitdir[:idx])
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
    """This session's entry: {"offset": bytes read, "files": touched basenames}; a
    bare int is the message count written before 2026-10-26; None when absent."""
    path = _watermark_path(cwd)
    if not path.exists(): return None
    try:
        val = json.loads(path.read_text(encoding="utf-8")).get(session_id)
    except Exception:
        return None
    if isinstance(val, dict):
        try: return {"offset": int(val.get("offset", 0)), "files": list(val.get("files") or [])}
        except Exception: return None
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        return int(val)
    return None


def _save_watermark(cwd, session_id, offset, files):
    # The touched-file set is kept here too: it covers the whole session, and only
    # the lines since `offset` are read on the next Stop.
    path = _watermark_path(cwd)
    data = {}
    if path.exists():
        try: data = json.loads(path.read_text(encoding="utf-8"))
        except Exception: data = {}
    data[session_id] = {"offset": offset, "files": sorted(files)}
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data), encoding="utf-8")
    except Exception:
        pass


def _new_since_watermark(cwd, session_id, transcript_path):
    """(new_messages, touched_files, end_offset): the messages added since this
    session's last Stop, and the files touched over the whole session.

    The usual case reads from the saved byte offset. A legacy message-count entry, or
    no entry, needs one full read (the same cost as before). A transcript shorter than
    the saved offset was rewritten: nothing counts as new, as with the old count."""
    state = _load_watermark(cwd, session_id)
    try: size = os.path.getsize(transcript_path)
    except Exception: size = -1
    if isinstance(state, dict) and state["offset"] <= size:
        new, files, end = _read_new_messages(transcript_path, state["offset"])
        return new, files | set(state["files"]), end
    msgs, files, end = _read_new_messages(transcript_path, 0)
    if isinstance(state, dict):
        return [], files, end
    return msgs[state or 0:], files, end


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
    r"(?:^|\s)>>?\s*[^\s|&;<>]"                            # redirect into a file
    # Preceded by whitespace or start-of-string, NOT merely a non-digit. The looser
    # form matched a Python f-string alignment spec -- print(f"{n:>3}") -- and fired
    # the review gate on read-only inspection turns, which is the exact behaviour the
    # gate was fixed to stop. Misses the space-less "cmd>file" form; that is rare, and
    # a missed redirect still leaves cp/mv/tee/git and the Edit/Write tools covering
    # anything that actually changes a tracked file.
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

    Reads only the tail, doubling the window until the turn's start is in it (cap 64 MB,
    past which it answers True). A whole-file read took about 100 s on a 1.4 GB
    transcript (2026-10-26).
    """
    try:
        size = os.path.getsize(transcript_path)
        window = 1 << 20
        with open(transcript_path, "rb") as f:
            while True:
                start = max(0, size - window)
                f.seek(start)
                lines = f.read().decode("utf-8", "ignore").splitlines()
                if start:
                    lines = lines[1:]          # first line is cut mid-way
                verdict = _turn_wrote(lines, whole=start == 0)
                if verdict is not None:
                    return verdict
                if window >= (64 << 20):
                    return True
                window *= 2
    except Exception:
        return True


def _turn_wrote(lines, whole):
    """_wrote_this_turn over `lines`; None when the turn's start is not in them and
    `whole` is False (more of the file is needed)."""
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
    if last_user < 0 and not whole:
        return None

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


def _project_slug(cwd):
    # basename of the REPO ROOT, not of cwd -- a session started in a
    # subdirectory used to mint projects/<subdir-name>/ in the vault.
    project = _repo_root(cwd).name.lower().replace(" ","-").replace(chr(92),"").replace("/","")
    return project or "unassigned"


def _project_staging(cwd):
    staging_dir = _vault_dir() / "projects" / _project_slug(cwd)
    staging_dir.mkdir(parents=True, exist_ok=True)
    return staging_dir / "staging.md"


def _save_staging(session_id, cwd, found):
    if not any(found.values()): return
    from datetime import datetime
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    staging = _project_staging(cwd)
    # Dedup against what the file already holds, same pattern as _save_mistakes
    # above (that function's own comment explains why: a byte-identical repeat
    # is the case that matters once the watermark in main() stops the SAME
    # window from being rescanned turn after turn -- this is the second line
    # of defense, not the fix for re-scanning itself).
    existing = ""
    if staging.exists():
        try: existing = staging.read_text(encoding="utf-8", errors="ignore")
        except Exception: existing = ""
    lines = []
    for cat, items in found.items():
        fresh = [item for item in items if f"[{cat}] {item}" not in existing]
        for item in fresh: lines.append(f"- [{cat}] {item}\n")
    if not lines: return
    lines.insert(0, f"\n## {ts} | {session_id[:8]}\n")
    with open(staging,"a",encoding="utf-8") as f: f.writelines(lines)


# --- Skill observations (P-457 phase 1: capture only) -----------------------
# Which skills were active this turn, and what went wrong around them. One JSON
# line per (signal, skill) in <vault>/projects/<project>/skill-observations.jsonl.
# Nothing reads this file automatically yet; `tea skills observations` lists it.
# Plan: docs/SELF_IMPROVING_SKILLS_PLAN.md. Phase 1 runs two weeks and is checked
# by hand for false positives before any batch is built on it, because a regex
# detector in this file once filled a ledger from analysis prose (2026-09-08).
#
# Only REAL user speech is scanned for corrections: isMeta entries (skill text,
# Stop-hook feedback), tool results, compaction summaries and injected blocks are
# never user speech. Tool output is only looked at for its is_error flag, never
# its text, so a quoted error inside a tool result cannot become a signal.

# Same pattern as learnInstinctFromPrompt (engine/lib/hook-runtime.js), plus any
# 24+ char run mixing letters and digits, so a key outside the pattern's names is
# dropped too. (Letters-only runs such as MCP tool names are not keys.)
_SECRET = re.compile(
    r"(api[_-]?key|secret|password|passwd|oauth|bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]{12,}"
    r"|token\s*[:=]|private key|recovery phrase)", re.I)
_LONG_TOKEN = re.compile(r"(?=[A-Za-z_+/=-]*[0-9])(?=[0-9_+/=-]*[A-Za-z])[A-Za-z0-9_+/=-]{24,}")

_SKILL_BASE = re.compile(r"^Base directory for this skill:\s*(.+)$", re.M)
_COMMAND_NAME = re.compile(r"<command-name>\s*/?([\w:.-]+)\s*</command-name>")
_COMMAND_TAGS = re.compile(
    r"<(command-name|command-message|command-args|local-command-stdout|side-sessions-event"
    r"|ci-monitor-event|pasted_content)\b[^>]*>.*?</\1>", re.S | re.I)
# Built-in slash commands are not skills.
_BUILTIN_COMMANDS = {
    "model", "compact", "clear", "config", "help", "login", "logout", "memory", "permissions",
    "hooks", "status", "cost", "doctor", "resume", "exit", "mcp", "agents", "add-dir", "ide",
    "vim", "theme", "terminal-setup", "bug", "release-notes", "upgrade", "usage", "context",
    "export", "rewind", "fast", "effort", "output-style", "statusline", "auto-mode-setup",
    "plugin", "plugins", "tasks", "todos", "privacy-settings", "install-github-app", "init",
}

# "The output was wrong", said by the user. Bare "don't"/"never" are left out: they
# are how instructions are phrased, not corrections. A bare leading "no" or "wait"
# is left out too: replayed over 702 real turns (2026-10-26) it fired mostly on
# answers to a question ("no whatever u r doing ... is fine", "wait for this").
CORRECTION_PATTERNS = [
    r"^\s*no\b[\s,.!-]+(?:i (?:meant|mean|said|asked|wanted)|that'?s|it'?s|this is|not\b|wrong)",
    r"\bthat'?s (?:wrong|not (?:right|correct|what i))",
    r"\b(?:this|it) is (?:wrong|not (?:right|correct))",
    r"\bnot what i (?:asked|meant|wanted|said)",
    r"\bi (?:already )?(?:said|told you)\b",
    r"\b(?:you|u) (?:missed|forgot|ignored|skipped)\b",
    r"\bwhy (?:did|are|do) (?:you|u) (?:still )?(?:do|doing|use|using|add|adding|skip|skipping|ignore|ignoring)\b",
    r"^\s*stop(?:[\s,.!]*$| (?:it|that|doing)\b)",
    r"\bwrong (?:file|approach|answer|place|one|thing)\b",
]
# "Don't do that part of the skill", said by the user while a skill is active.
OVERRIDE_PATTERNS = [
    r"\bskip (?:the |this |that )?(?:[\w-]+ )?(?:step|review|tests?|check|phase|plan)\b",
    r"\b(?:don'?t|do not|no need to) (?:run|do|use|follow|bother with|wait for) (?:the |a )?(?:[\w-]+ )?"
    r"(?:step|review|skill|phase|loop|plan|checklist)\b",
    r"\bignore (?:the |that |this )?(?:skill|step|rule|checklist)\b",
    r"\binstead of (?:the |that )?(?:skill|step)\b",
]


def _safe_quote(text, idx=0, words=15, sentence=True):
    """At most `words` words around idx; '' when the clause looks like a secret.
    sentence=False takes the text from its start (commands: a '.' in a path is not
    a sentence end)."""
    if not text:
        clause = ""
    else:
        clause = _clause_around(text, idx, 400) if sentence else " ".join(text[:400].split())
    if not clause or _SECRET.search(clause) or _LONG_TOKEN.search(clause):
        return ""
    return " ".join(clause.split()[:words])


def _skill_name(raw):
    return str(raw or "").strip().lstrip("/").lower()


def _is_real_user(obj, msg):
    """A turn starts at something the user actually sent, not at harness traffic."""
    if obj.get("isMeta") or obj.get("isCompactSummary") or obj.get("isSidechain"):
        return False, ""
    content = msg.get("content", "")
    if isinstance(content, list):
        if any(isinstance(c, dict) and c.get("type") == "tool_result" for c in content):
            return False, ""
        text = " ".join(c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text")
    else:
        text = str(content or "")
    if not _INJECTED_BLOCK.sub(" ", text).strip():
        return False, ""
    return True, text


def _parse_recent_turns(transcript_path, keep=3):
    """The last `keep` turns: [{id, text, skills, files, failures}], oldest first.

    Reads only the tail of the file, doubling the window until `keep` real user
    messages are in it (cap 64 MB). A whole-file read cost 56 s on a 1.4 GB
    transcript on this machine (2026-10-26); the tail read does not grow with
    session length. `failures` counts is_error tool results per (tool, input)."""
    size = os.path.getsize(transcript_path)
    window = 1 << 20
    with open(transcript_path, "rb") as f:
        while True:
            start = max(0, size - window)
            f.seek(start)
            lines = f.read().decode("utf-8", "ignore").splitlines()
            if start:
                lines = lines[1:]          # first line is cut mid-way
            turns = _turns_from_lines(lines, keep)
            if start == 0 or len(turns) >= keep or window >= (64 << 20):
                return turns
            window *= 2


def _turns_from_lines(lines, keep=3):
    parsed, starts = [], 0
    for line in reversed(lines):
        try:
            obj = json.loads(line)
        except Exception:
            continue
        parsed.append(obj)
        msg = obj.get("message") or {}
        if msg.get("role") == "user" and _is_real_user(obj, msg)[0]:
            starts += 1
            if starts >= keep:
                break
    parsed.reverse()

    turns, uses = [], {}
    for obj in parsed:
        msg = obj.get("message") or {}
        role = msg.get("role", "")
        if role == "user":
            real, text = _is_real_user(obj, msg)
            if real:
                turns.append({"id": str(obj.get("uuid") or len(turns))[:8], "text": text,
                              "skills": set(), "files": set(), "failures": {}})
                for name in _COMMAND_NAME.findall(text):
                    if _skill_name(name) not in _BUILTIN_COMMANDS:
                        turns[-1]["skills"].add(_skill_name(name))
                continue
        if not turns:
            continue
        turn = turns[-1]
        content = msg.get("content", "")
        if role == "user" and obj.get("isMeta"):
            text = content if isinstance(content, str) else " ".join(
                c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text")
            m = _SKILL_BASE.search(text or "")
            if m:
                turn["skills"].add(_skill_name(Path(m.group(1).strip()).name))
            continue
        if not isinstance(content, list):
            continue
        for c in content:
            if not isinstance(c, dict):
                continue
            if c.get("type") == "tool_use":
                name, inp = str(c.get("name", "")), c.get("input") or {}
                if name == "Skill" and inp.get("skill"):
                    turn["skills"].add(_skill_name(inp["skill"]))
                fp = next((inp.get(k) for k in ("file_path", "path", "notebook_path")
                           if isinstance(inp.get(k), str) and inp.get(k)), "")
                if fp and Path(fp).suffix:
                    turn["files"].add(Path(fp).name.lower())
                    if name == "Read" and Path(fp).name.lower() == "skill.md":
                        turn["skills"].add(_skill_name(Path(fp).parent.name))
                if isinstance(inp.get("command"), str):
                    key = label = " ".join(inp["command"].split())
                else:   # never quote a tool's raw input (a Write carries a whole file)
                    key = json.dumps(inp, sort_keys=True)
                    label = f"{name} {Path(fp).name}" if fp else name
                uses[c.get("id")] = (name, key, label)
            elif c.get("type") == "tool_result" and c.get("is_error"):
                use = uses.get(c.get("tool_use_id"))
                if use:
                    turn["failures"][use] = turn["failures"].get(use, 0) + 1
    return turns


def _first_hit(patterns, text):
    for pat in patterns:
        hit = re.search(pat, text, re.I | re.M)
        if hit:
            return hit
    return None


def _skill_signals(turns, mistakes):
    """Signals for the LAST turn, each as (kind, skills{name: turns_ago}, evidence, quote, files)."""
    if not turns:
        return []
    cur, prior = turns[-1], turns[:-1]
    before = {}   # skills whose output the user is now reacting to
    for ago, t in enumerate(reversed(prior), start=1):
        for s in t["skills"]:
            before.setdefault(s, ago)
    driving = {s: 0 for s in cur["skills"]}
    for s, ago in before.items():
        driving.setdefault(s, ago)
    prior_files = sorted(set().union(*(t["files"] for t in prior))) if prior else []
    out = []

    said = cur["text"]
    if not _is_hook_noise(said):
        said = _COMMAND_TAGS.sub(" ", _user_said(said)).strip()
        if said and len(said) <= 4000:      # longer is pasted content, not a reply
            hit = _first_hit(CORRECTION_PATTERNS, said)
            if hit:
                out.append(("correction", before, "user corrected an earlier reply",
                            _safe_quote(said, hit.start()), prior_files))
            hit = _first_hit(OVERRIDE_PATTERNS, said)
            if hit and before:
                out.append(("override", before, "user overrode a step while skill active",
                            _safe_quote(said, hit.start()), prior_files))

    if mistakes:
        out.append(("mistake", driving, "mistake admission (same detector as MISTAKES.md)",
                    _safe_quote(mistakes[0]), sorted(cur["files"])))

    repeats = [(use, n) for use, n in cur["failures"].items() if n >= 2]
    if repeats:
        (tool, _key, label), n = max(repeats, key=lambda r: r[1])
        out.append(("retry", driving, f"same {tool} call failed {n} times in one turn",
                    _safe_quote(label, sentence=False), sorted(cur["files"])))
    return out


def _observations_path(cwd):
    d = _vault_dir() / "projects" / _project_slug(cwd)
    d.mkdir(parents=True, exist_ok=True)
    return d / "skill-observations.jsonl"


def _capture_skill_observations(session_id, cwd, transcript_path, mistakes):
    """Never raises: a failure here is logged and the Stop event carries on."""
    try:
        turns = _parse_recent_turns(transcript_path)
        signals = _skill_signals(turns, mistakes)
        if not signals:
            return 0
        path = _observations_path(cwd)
        seen = set()
        if path.exists():
            for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
                try:
                    o = json.loads(line)
                except Exception:
                    continue
                if o.get("session") == session_id:
                    seen.add((o.get("turn"), o.get("kind"), o.get("skill")))
        from datetime import datetime, timezone
        ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
        turn_id, rows = turns[-1]["id"], []
        for kind, skills, evidence, quote, files in signals:
            for skill, ago in (sorted(skills.items()) or [("unknown", None)]):
                key = (turn_id, kind, skill)
                if key in seen:
                    continue
                seen.add(key)
                ev = evidence
                if ago is not None:
                    ev += f"; skill used {ago} turn(s) earlier" if ago else "; skill used this turn"
                rows.append({"ts": ts, "session": session_id, "project": _project_slug(cwd),
                             "turn": turn_id, "skill": skill, "kind": kind, "evidence": ev,
                             "quote": quote, "files": files[:10]})
        if rows:
            with open(path, "a", encoding="utf-8") as f:
                f.writelines(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)
        return len(rows)
    except Exception as e:
        _log_error(f"_capture_skill_observations: {e!r}\n{traceback.format_exc()}")
        return 0


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

    new_msgs, touched_files, end_offset = (_new_since_watermark(cwd, session_id, transcript_path)
                                           if transcript_path else ([], set(), 0))
    # Watermark: only consider messages added since the LAST time this
    # session's Stop hook ran, not the trailing-20 window every time. Without
    # this, an admission (or a staging candidate -- found 2026-09-30, same bug,
    # never applied here even though _scan_mistakes got this fix on 2026-09-09)
    # sitting anywhere in a long, quiet stretch gets re-detected and
    # re-attempted on every single turn for as long as it stays inside the
    # last 20 -- reproduced directly against real duplicate groups in both the
    # mistakes ledger (9 re-saves over ~4 hours) and staging.md (1,711 of 1,961
    # entries were pure re-captured noise, checked 2026-09-30). The write-side
    # dedup in _save_mistakes/_save_staging still catches a byte-identical
    # repeat if one somehow gets through; this stops the repeat from being
    # considered at all, which is what actually keeps the file from filling
    # with duplicates turn after turn rather than just catching them after.
    # Since 2026-10-26 the watermark is a byte offset, so only the new lines are read.

    found = _categorize(new_msgs)
    _save_staging(session_id, cwd, found)

    # A lesson worth keeping comes from a turn that actually changed something. Computed
    # before the scan, not after, so it can gate the scan as well as the review gate:
    # conversational acknowledgement on a read-only turn ("I should have said that rather
    # than naming only Aurora") was being written to the ledger as a durable mistake, then
    # replayed as one on every later write turn.
    wrote = _wrote_this_turn(transcript_path) if transcript_path else True

    mistakes = []
    if wrote:
        mistakes = _scan_mistakes(new_msgs)
        _save_mistakes(session_id, cwd, mistakes)
    _save_watermark(cwd, session_id, end_offset, touched_files)
    gate = _review_gate(cwd, bool(event.get("stop_hook_active")), touched_files, wrote)
    if gate:
        print(json.dumps(gate), flush=True)
    # Last, so a slow or failing capture can never delay the watermark or the gate.
    if transcript_path:
        _capture_skill_observations(session_id, cwd, transcript_path, mistakes)

if __name__ == "__main__":
    try: main()
    except Exception as e:
        # Full traceback, not just str(e): "KeyError: 'message'" alone gives no
        # line to look at, which is why the earlier one-line form would not have
        # helped even if the log had ever been written.
        _log_error(f"main: {e!r}\n{traceback.format_exc()}")
    sys.exit(0)

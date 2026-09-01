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
import json, re, sys
from pathlib import Path

MEMORY_PATTERNS = {
    "feedback": [r"don.t\s+\w+",r"stop\s+\w+",r"always\s+\w+",r"never\s+\w+",
                 r"prefer\s+\w+",r"from now on",r"please (don.t|always|never|avoid)"],
    "project":  [r"deadline|by [A-Z][a-z]+day",r"blocked on|waiting on",
                 r"decided to|going with|switching to",r"the reason (we|I|this)"],
    "user":     [r"I('m| am) a\b",r"I (prefer|like|want|use)",r"my (workflow|setup|project)"],
}

# Scanned across BOTH user and assistant messages (a mistake can be admitted
# by either side), unlike MEMORY_PATTERNS above which is user-only.
MISTAKE_PATTERNS = [
    r"I made a mistake", r"that was wrong", r"my bad\b", r"I should have",
    r"root cause was", r"this broke because", r"I broke\b", r"that('s| is) incorrect",
    r"my mistake", r"I misunderstood", r"I got that wrong",
]

ERROR_LOG = Path.home() / ".claude" / "hooks" / "hook-errors.log"

def _read_transcript(transcript_path: str) -> list[dict]:
    msgs = []
    try:
        for line in Path(transcript_path).read_text(errors="ignore").splitlines():
            try:
                obj = json.loads(line)
                msg = obj.get("message", {})
                role = msg.get("role","")
                if role not in ("user","assistant"): continue
                content = msg.get("content","")
                if isinstance(content, list):
                    text = " ".join(c.get("text","") for c in content if isinstance(c,dict) and c.get("type")=="text")
                else:
                    text = str(content)
                text = text.strip()
                if text: msgs.append({"role":role,"text":text})
            except: pass
    except: pass
    return msgs[-20:]

def _categorize(msgs):
    found = {"feedback":[],"project":[],"user":[]}
    for m in msgs:
        if m["role"] != "user": continue
        for cat, pats in MEMORY_PATTERNS.items():
            for pat in pats:
                if re.search(pat, m["text"], re.IGNORECASE):
                    s = m["text"][:200].replace("\n"," ")
                    if s not in found[cat]: found[cat].append(s)
                    break
    return found

def _scan_mistakes(msgs):
    found = []
    for m in msgs:
        for pat in MISTAKE_PATTERNS:
            if re.search(pat, m["text"], re.IGNORECASE):
                s = m["text"][:220].replace("\n"," ")
                if s not in found: found.append(s)
                break
    return found

def _project_ledger_path(cwd):
    # Lives INSIDE the project (not ~/.claude/*) so it's git-tracked and
    # survives independently of the global, prunable memory-vault.
    ledger_dir = Path(cwd) / ".crisp"
    ledger_dir.mkdir(parents=True, exist_ok=True)
    return ledger_dir / "MISTAKES.md"

def _save_mistakes(session_id, cwd, mistakes):
    if not mistakes: return
    from datetime import datetime
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    ledger = _project_ledger_path(cwd)
    is_new = not ledger.exists()
    lines = []
    if is_new:
        lines.append("# Mistakes Ledger\n\nAuto-drafted by auto_handover.py; edit freely — this is a starting point, not a final record.\n")
    lines.append(f"\n## {ts} | {session_id[:8]}\n")
    for item in mistakes: lines.append(f"- {item}\n")
    with open(ledger,"a",encoding="utf-8") as f: f.writelines(lines)

def _recent_mistakes(cwd, limit=5):
    """Last N bullet entries from .crisp/MISTAKES.md — bounded so the review
    checklist stays small regardless of how long the ledger grows. This is
    NOT the full historical log; see crisp/claude/CLAUDE.md "Project Ledgers"."""
    ledger = _project_ledger_path(cwd)
    if not ledger.exists(): return []
    try:
        lines = ledger.read_text(encoding="utf-8", errors="ignore").splitlines()
    except Exception:
        return []
    bullets = [l[2:].strip() for l in lines if l.startswith("- ")]
    return bullets[-limit:]

def _review_gate(cwd, stop_hook_active):
    """Block the Stop event once (per Claude Code's Stop-hook schema:
    https://code.claude.com/docs/en/hooks.md) so the model reviews its own
    change against recent project mistakes before actually finishing.
    stop_hook_active=True means this already fired once this turn — never
    block twice in a row, both to respect Claude Code's own loop guard and
    because the review has already happened once."""
    if stop_hook_active: return None
    recent = _recent_mistakes(cwd)
    if not recent: return None
    checklist = "\n".join(f"- {m}" for m in recent)
    return {
        "hookSpecificOutput": {
            "hookEventName": "Stop",
            "permissionDecision": "deny",
            "permissionDecisionReason": "Review against project mistake ledger before finishing",
            "systemMessage": (
                "Before finishing, check your change doesn't repeat a mistake "
                f"already logged in .crisp/MISTAKES.md for this project:\n{checklist}"
            ),
        }
    }

def _project_staging(cwd):
    project = Path(cwd).name.lower().replace(" ","-").replace("\\","").replace("/","")
    staging_dir = Path.home() / ".claude" / "memory-staging"
    staging_dir.mkdir(parents=True, exist_ok=True)
    return staging_dir / f"{project}.md"

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
    raw = sys.stdin.read() or "{}"
    try: event = json.loads(raw)
    except: event = {}

    session_id = event.get("session_id") or event.get("sessionId") or "session"
    cwd = event.get("cwd", os.getcwd())
    transcript_path = event.get("transcript_path") or event.get("transcriptPath","")

    msgs = _read_transcript(transcript_path) if transcript_path else []
    found = _categorize(msgs)
    _save_staging(session_id, cwd, found)
    mistakes = _scan_mistakes(msgs)
    _save_mistakes(session_id, cwd, mistakes)

    gate = _review_gate(cwd, bool(event.get("stop_hook_active")))
    if gate:
        print(json.dumps(gate))

if __name__ == "__main__":
    try: main()
    except Exception as e:
        try:
            ERROR_LOG.parent.mkdir(parents=True,exist_ok=True)
            from datetime import datetime
            with open(ERROR_LOG,"a") as f: f.write(f"{datetime.now().isoformat()} auto_handover: {e}\n")
        except: pass
    sys.exit(0)

"""
auto_handover.py — Stop hook. Uses transcript_path from hook payload (reliable).
Scans transcript for auto-memory candidates -> memory_staging.md.

Handover-doc writing and turn counting used to live here too, but that duplicated
what TEA (token-efficient-agent-kit, vendored as crisp/engine) already does via
tea-lifecycle-hook.js (session-handoffs/, observations.jsonl) and `tea.js
session-rollover`. This hook now does only the one thing TEA doesn't: categorizing
raw message text into feedback/project/user candidates for the curated memory
files under ~/.claude/projects/<project>/memory/.
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

if __name__ == "__main__":
    try: main()
    except Exception as e:
        try:
            ERROR_LOG.parent.mkdir(parents=True,exist_ok=True)
            from datetime import datetime
            with open(ERROR_LOG,"a") as f: f.write(f"{datetime.now().isoformat()} auto_handover: {e}\n")
        except: pass
    sys.exit(0)

"""
auto_handover.py — Stop hook. Uses transcript_path from hook payload (reliable).
1. Scans transcript for auto-memory candidates -> memory_staging.md
2. At message threshold -> writes handover doc + Windows notification
"""
from __future__ import annotations
import json, os, re, sys
from datetime import datetime
from pathlib import Path

THRESHOLD    = 13
HANDOVER_DIR = Path.home() / ".claude" / "handovers"
COUNTER_FILE = Path.home() / ".claude" / "hooks" / "_msg_counts.json"
# STAGING_FILE now computed per project in _save_staging()
ERROR_LOG    = Path.home() / ".claude" / "hooks" / "hook-errors.log"

MEMORY_PATTERNS = {
    "feedback": [r"don.t\s+\w+",r"stop\s+\w+",r"always\s+\w+",r"never\s+\w+",
                 r"prefer\s+\w+",r"from now on",r"please (don.t|always|never|avoid)"],
    "project":  [r"deadline|by [A-Z][a-z]+day",r"blocked on|waiting on",
                 r"decided to|going with|switching to",r"the reason (we|I|this)"],
    "user":     [r"I('m| am) a\b",r"I (prefer|like|want|use)",r"my (workflow|setup|project)"],
}

def _load_counts():
    try: return json.loads(COUNTER_FILE.read_text()) if COUNTER_FILE.exists() else {}
    except: return {}

def _save_counts(d):
    COUNTER_FILE.parent.mkdir(parents=True, exist_ok=True)
    COUNTER_FILE.write_text(json.dumps(d))

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
    """Returns project-specific staging file path."""
    project = Path(cwd).name.lower().replace(" ","-").replace("\\","").replace("/","")
    staging_dir = Path.home() / ".claude" / "memory-staging"
    staging_dir.mkdir(parents=True, exist_ok=True)
    return staging_dir / f"{project}.md"

def _save_staging(session_id, cwd, found):
    if not any(found.values()): return
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    project = Path(cwd).name
    staging = _project_staging(cwd)
    lines = [f"\n## {ts} | {session_id[:8]}\n"]
    for cat,items in found.items():
        for item in items: lines.append(f"- [{cat}] {item}\n")
    with open(staging,"a",encoding="utf-8") as f: f.writelines(lines)

def _write_handover(session_id, count, cwd, msgs):
    HANDOVER_DIR.mkdir(parents=True, exist_ok=True)
    ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = HANDOVER_DIR / f"handover_{ts}.md"
    project = Path(cwd).name
    tx = "\n".join(f"{m['role'].upper()}: {m['text'][:300]}" for m in msgs[-12:])
    path.write_text(f"""# Handover {datetime.now().strftime("%Y-%m-%d %H:%M")}
Project: {project} | CWD: {cwd} | Session: {session_id[:12]} | Messages: {count}

## Resume
1. Fresh Claude Code session: cd "{cwd}"
2. First prompt: "Continue from handover - /mem-search {project}"

## Last {len(msgs[-12:])} turns
{tx}

## Staged memory candidates
~/.claude/memory-staging/{project}.md
""")
    return path

def _notify(msg):
    os.system('powershell -WindowStyle Hidden -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show(\'' + msg.replace("'","") + '\', \'Handover\')"')

def main():
    raw = sys.stdin.read() or "{}"
    try: event = json.loads(raw)
    except: event = {}

    session_id     = event.get("session_id") or event.get("sessionId") or "session"
    cwd            = event.get("cwd", os.getcwd())
    transcript_path = event.get("transcript_path") or event.get("transcriptPath","")

    msgs = _read_transcript(transcript_path) if transcript_path else []
    found = _categorize(msgs)
    _save_staging(session_id, cwd, found)

    data  = _load_counts()
    count = data.get(session_id, 0) + 1
    data[session_id] = count
    _save_counts(data)

    if count >= THRESHOLD:
        path = _write_handover(session_id, count, cwd, msgs)
        data[session_id] = 0
        _save_counts(data)
        print(f"\n[HANDOVER] {count} msgs — open fresh session.\nDoc: {path}", file=sys.stderr)
        _notify(f"{count} messages. Open new Claude session. Handover: {path.name}")

if __name__ == "__main__":
    try: main()
    except Exception as e:
        try:
            ERROR_LOG.parent.mkdir(parents=True,exist_ok=True)
            with open(ERROR_LOG,"a") as f: f.write(f"{datetime.now().isoformat()} auto_handover: {e}\n")
        except: pass
    sys.exit(0)



"""
session_start_mem.py — SessionStart hook.
Injects a memory recall instruction into Claude's context at session start.
Claude reads this and automatically runs claude-mem search + file memory scan.
Output to stdout = injected as system context by Claude Code.
"""
import sys, os, json
from pathlib import Path
from datetime import datetime

MEMORY_DIR = Path.home() / ".claude" / "projects"
HANDOVER_DIR = Path.home() / ".claude" / "handovers"
ERROR_LOG = Path.home() / ".claude" / "hooks" / "hook-errors.log"

def latest_handover():
    if not HANDOVER_DIR.exists():
        return None
    docs = sorted(HANDOVER_DIR.glob("handover_*.md"), reverse=True)
    return docs[0] if docs else None

def main():
    try:
        event = json.loads(sys.stdin.read() or "{}")
    except Exception:
        event = {}

    cwd = event.get("cwd", os.getcwd())
    project_name = Path(cwd).name

    handover = latest_handover()
    handover_line = f"- Latest handover: {handover}" if handover else "- No prior handover found"

    # This text is injected into Claude's context at session start
    print(f"""[SESSION START — AUTO MEMORY RECALL]
Project: {project_name} | CWD: {cwd}
{handover_line}

INSTRUCTIONS (execute silently before first response):
1. Search claude-mem for "{project_name}" context using memory_context or smart_search MCP tool
2. Scan ~/.claude/projects/*/memory/MEMORY.md for relevant facts
3. If handover doc exists above, read its "Next steps" section
4. Load only small relevant slices — do not dump everything into context
5. Confirm loaded context in ONE line: "Memory loaded: [X facts, Y decisions]"
""")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        try:
            ERROR_LOG.parent.mkdir(parents=True, exist_ok=True)
            with open(ERROR_LOG, "a", encoding="utf-8") as f:
                f.write(f"{datetime.now().isoformat()} session_start_mem.py: {type(e).__name__}: {e}\n")
        except Exception:
            pass
    sys.exit(0)

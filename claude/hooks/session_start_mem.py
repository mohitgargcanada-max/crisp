"""
session_start_mem.py — SessionStart hook.
Injects a memory recall instruction into Claude's context at session start.
Claude reads this and automatically runs claude-mem search + file memory scan.
Output to stdout = injected as system context by Claude Code.

Handover convention (binding since 2026-09-20 — see claude/CLAUDE.md "Project
Handover"): ONE git-tracked file per project, `.crisp/HANDOVER.md` at the repo
root — not one file per session. Every session reads/writes the SAME file,
adding or updating its own `## Session <8-char-id>` block (newest at top)
instead of minting a new dated file. The old `~/.claude/handovers/<project>/`
per-session-file store this hook used to read is retired (that directory now
holds only a MOVED.md pointer) — pointing at it produced "No prior handover
found" on every session even when `.crisp/HANDOVER.md` had real, current
content, because the two locations had nothing to do with each other.
"""
import sys, os, json
from pathlib import Path
from datetime import datetime

MEMORY_DIR = Path.home() / ".claude" / "projects"
ERROR_LOG = Path.home() / ".claude" / "hooks" / "hook-errors.log"


def _repo_root(cwd):
    """Walk up from cwd to the git repo root. Falls back to cwd when there is
    no .git anywhere above. Mirrors auto_handover.py's _repo_root() -- the
    handover file lives INSIDE the project repo, not necessarily at cwd, so a
    session started in a subdirectory must still find the real root."""
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


def project_handover_path(cwd):
    return _repo_root(cwd) / ".crisp" / "HANDOVER.md"


def latest_session_heading(handover_path):
    """First real `## Session ...` heading in the file (newest-at-top
    convention). Returns None if the file is missing or only holds the
    template row (`## Session <your-8-char-id> — <one-line topic>`)."""
    try:
        lines = handover_path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except Exception:
        return None
    for line in lines:
        if line.startswith("## Session ") and "<your-8-char-id>" not in line:
            return line[3:].strip()
    return None


def main():
    try:
        event = json.loads(sys.stdin.read() or "{}")
    except Exception:
        event = {}

    cwd = event.get("cwd", os.getcwd())
    project_name = Path(cwd).name

    handover_path = project_handover_path(cwd)
    if handover_path.exists():
        latest = latest_session_heading(handover_path)
        if latest:
            handover_line = f"- Handover: {handover_path} (shared file — latest section: {latest})"
        else:
            handover_line = f"- Handover: {handover_path} exists but has no session section yet"
    else:
        handover_line = f"- No handover file yet at {handover_path}"

    # This text is injected into Claude's context at session start
    print(f"""[SESSION START — AUTO MEMORY RECALL]
Project: {project_name} | CWD: {cwd}
{handover_line}

INSTRUCTIONS (execute silently before first response):
1. Search claude-mem for "{project_name}" context using memory_context or smart_search MCP tool
2. Scan ~/.claude/projects/*/memory/MEMORY.md for relevant facts
3. If a handover file exists above, read its latest (topmost) `## Session` section for "Next steps"
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

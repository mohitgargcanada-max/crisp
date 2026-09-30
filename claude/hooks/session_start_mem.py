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
    session started in a subdirectory must still find the real root.

    Also resolves through a git WORKTREE's .git file (fixed 2026-09-30, same
    fix applied to all 4 copies of this function -- see auto_handover.py's
    copy for the full explanation and the live example that proved it)."""
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


VAULT_DIR = Path(r"C:\Users\mohit\tools\crisp\engine\memory-vault")


def _consolidation_nag_line():
    """Weekly nag, notify-only -- never runs consolidation itself (this project's own rule:
    diagnostics/fixes stay separate, nothing consequential happens without approval). Reads
    LOCAL files only, no network -- so it's only as fresh as this machine's last `git pull`,
    which the line says explicitly rather than implying it checked the remote."""
    log_path = VAULT_DIR / "state" / "consolidation-log.jsonl"
    try:
        threshold_days = int(os.environ.get("CRISP_CONSOLIDATE_NAG_DAYS", "7"))
        if not log_path.exists():
            return None
        lines = [l for l in log_path.read_text(encoding="utf-8", errors="ignore").splitlines() if l.strip()]
        if not lines:
            return None
        last = json.loads(lines[-1])
        last_ts = datetime.fromisoformat(last["ts"].replace("Z", "+00:00"))
        days = (datetime.now(last_ts.tzinfo) - last_ts).days
        if days < threshold_days:
            return None
        git_dir = VAULT_DIR / ".git"
        pull_note = ""
        if git_dir.exists():
            fetch_head = git_dir / "FETCH_HEAD"
            if fetch_head.exists():
                pull_age_days = (datetime.now() - datetime.fromtimestamp(fetch_head.stat().st_mtime)).days
                pull_note = f" (as of your last pull, {pull_age_days}d ago)"
        return (f"- Vault consolidation: last run {days}d ago{pull_note} — "
                f"tell Mohit once; do not run `tea vault consolidate` yourself.")
    except Exception:
        return None


def main():
    try:
        event = json.loads(sys.stdin.read() or "{}")
    except Exception:
        event = {}

    cwd = event.get("cwd", os.getcwd())
    project_name = _repo_root(cwd).name
    # Missing/unknown source defaults to "startup" (the common case) rather than silently
    # suppressing the nag on an unexpected payload shape.
    is_startup = event.get("source", "startup") == "startup"

    handover_path = project_handover_path(cwd)
    if handover_path.exists():
        latest = latest_session_heading(handover_path)
        if latest:
            handover_line = f"- Handover: {handover_path} (shared file — latest section: {latest})"
        else:
            handover_line = f"- Handover: {handover_path} exists but has no session section yet"
    else:
        handover_line = f"- No handover file yet at {handover_path}"

    nag_line = _consolidation_nag_line() if is_startup else None

    # This text is injected into Claude's context at session start
    print(f"""[SESSION START — AUTO MEMORY RECALL]
Project: {project_name} | CWD: {cwd}
{handover_line}{chr(10) + nag_line if nag_line else ""}

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

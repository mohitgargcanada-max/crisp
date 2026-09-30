"""
usage_tracker.py -- Stop hook. Logs the real length (words/chars) of every
assistant response to usage-stats/response-log.jsonl.

Why: crisp's README lists caveman-mode savings as "author's benchmark, not
independently verified" -- there was no local data to check that against.
This hook doesn't invent a savings %; it just records what actually gets
sent, turn by turn, so a real trend (and a before/after around the date
caveman mode was enabled) can be read back later via usage_report.py.

Never blocks -- always exits 0.
"""
import json, os, sys
from datetime import datetime
from pathlib import Path

STATS_DIR = Path.home() / ".claude" / "hooks" / "usage-stats"
LOG_FILE  = STATS_DIR / "response-log.jsonl"
ERROR_LOG = Path.home() / ".claude" / "hooks" / "hook-errors.log"


def _repo_root(cwd):
    """Walk up from cwd to the git repo root. Mirrors auto_handover.py's
    _repo_root() -- a session started in any subdirectory must still be
    labeled with the real project, not the subdirectory's own basename.

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


def _last_assistant_text(transcript_path):
    text = ""
    try:
        for line in Path(transcript_path).read_text(errors="ignore").splitlines():
            try:
                obj = json.loads(line)
            except Exception:
                continue
            msg = obj.get("message", {})
            if msg.get("role") != "assistant":
                continue
            content = msg.get("content", "")
            if isinstance(content, list):
                t = " ".join(
                    c.get("text", "") for c in content
                    if isinstance(c, dict) and c.get("type") == "text"
                )
            else:
                t = str(content)
            t = t.strip()
            if t:
                text = t  # keep overwriting -> ends up holding the last turn
    except Exception:
        pass
    return text


def main():
    raw = sys.stdin.read() or "{}"
    try:
        event = json.loads(raw)
    except Exception:
        event = {}

    cwd = event.get("cwd", os.getcwd())
    transcript_path = event.get("transcript_path") or event.get("transcriptPath", "")
    session_id = event.get("session_id") or event.get("sessionId") or "session"

    if not transcript_path:
        return

    text = _last_assistant_text(transcript_path)
    if not text:
        return

    record = {
        "timestamp": datetime.now().isoformat(),
        "session_id": str(session_id)[:12],
        "project": _repo_root(cwd).name,
        "words": len(text.split()),
        "chars": len(text),
    }

    STATS_DIR.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        try:
            ERROR_LOG.parent.mkdir(parents=True, exist_ok=True)
            with open(ERROR_LOG, "a", encoding="utf-8") as f:
                f.write(f"{datetime.now().isoformat()} usage_tracker: {type(e).__name__}: {e}\n")
        except Exception:
            pass
    sys.exit(0)

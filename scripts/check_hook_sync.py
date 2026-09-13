#!/usr/bin/env python3
"""Fail a commit when the repo's hook copies have drifted from the installed ones.

Why this exists
---------------
`claude/hooks/*.py` is the tracked source of truth; `install.ps1`/`install.sh` copy it over
`~/.claude/hooks/`. Fixes get made to the LIVE copy during a session (that is the one actually
running), and three consecutive releases shipped with the tracked copy left behind: 0.1.3 fixed
the drift, 0.1.4 resynced, 0.1.5 resynced again. The 0.1.3 installer backup limits the damage
but nothing ever FAILED, so the drift was only caught when somebody happened to look.

Design constraint: this must never be the reason a commit cannot be made.
Every unexpected condition exits 0 (allow the commit). It blocks on exactly one thing --
a readable pair of files whose normalised contents differ. Specifically it allows the commit when:

  * `~/.claude/hooks/` does not exist (CRISP not installed here -- a fresh clone, or CI)
  * a counterpart file is missing on either side (nothing to compare)
  * python, the filesystem, or this script itself raises anything at all

Line endings are normalised before comparison. The repo copy is CRLF in the working tree via
git's autocrlf and the live copy is LF; comparing raw bytes would report divergence on every
commit forever, which would be a far worse bug than the one this prevents.

`git commit --no-verify` bypasses it, deliberately -- an emergency commit must always be possible.
"""
import sys

EXIT_ALLOW = 0
EXIT_BLOCK = 1


def _normalise(raw: bytes) -> str:
    """Content with every line-ending convention flattened to one.

    CRLF -> LF handles the normal case (git checks the repo copy out as CRLF via autocrlf
    while the live copy is LF). The lone-CR pass matters just as much: without it, any file
    carrying a stray CR compares unequal on every single commit, and this script would then
    block the repo permanently -- a far worse failure than the drift it exists to catch.
    Trailing whitespace on the final line is ignored for the same fail-safe reason.
    """
    text = raw.decode("utf-8", "replace")
    return text.replace("\r\n", "\n").replace("\r", "\n").rstrip()


def main():
    from pathlib import Path

    repo_hooks = Path(__file__).resolve().parent.parent / "claude" / "hooks"
    live_hooks = Path.home() / ".claude" / "hooks"

    if not repo_hooks.is_dir() or not live_hooks.is_dir():
        return EXIT_ALLOW

    drifted = []
    for repo_file in sorted(repo_hooks.glob("*.py")):
        live_file = live_hooks / repo_file.name
        if not live_file.is_file():
            continue  # not installed, or a new file not yet deployed -- not drift
        try:
            a = _normalise(repo_file.read_bytes())
            b = _normalise(live_file.read_bytes())
        except Exception:
            continue  # unreadable pair: cannot judge, so do not block on it
        if a != b:
            drifted.append((repo_file, live_file, len(b.splitlines()) - len(a.splitlines())))

    if not drifted:
        return EXIT_ALLOW

    out = sys.stderr.write
    out("\n  COMMIT BLOCKED - hook copies have drifted\n\n")
    for repo_file, live_file, delta in drifted:
        direction = "live is AHEAD" if delta > 0 else ("repo is AHEAD" if delta < 0 else "same length, content differs")
        out(f"    {repo_file.name}: {direction} ({delta:+d} lines)\n")
    out("\n  The tracked copy under claude/hooks/ is what ships and what install.ps1 copies\n")
    out("  over everyone's live hook. If the live copy has the newer fix, commit it:\n\n")
    for repo_file, live_file, _ in drifted:
        out(f'    cp "{live_file}" "{repo_file}"\n')
    out("\n  If the REPO copy is the correct one, reinstall to push it live instead.\n")
    out("  To bypass (emergency only): git commit --no-verify\n\n")
    return EXIT_BLOCK


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # never let this script be why a commit fails
        sys.stderr.write(f"  [check_hook_sync] skipped, internal error: {exc!r}\n")
        sys.exit(EXIT_ALLOW)

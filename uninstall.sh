#!/usr/bin/env bash
# CRISP uninstaller — macOS / Linux / Git Bash
# Run from the crisp/ directory: ./uninstall.sh          (dry run: lists what it would do)
#                                ./uninstall.sh --apply  (does it)
#
# Reverses install.sh. Nothing is deleted: every file it removes is MOVED into
# ~/.claude/crisp-uninstall-<timestamp>/, so a mistaken run is undone by moving
# them back. Files that hold your own edits as well as CRISP's (CLAUDE.md,
# settings.json, ~/.codex/config.toml) are never edited; it prints what to remove.
# Your memory (engine/memory-vault/, each project's .crisp/) is not touched.
# Keep the hook/skill/agent lists in step with install.sh.
set -e

CRISP="$(cd "$(dirname "$0")" && pwd)"
CLAUDE="$HOME/.claude"
CODEX="$HOME/.codex"
BACKUP="$CLAUDE/crisp-uninstall-$(date +%Y%m%d-%H%M%S)"
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

if [ "$APPLY" = 1 ]; then echo "CRISP uninstaller — APPLY"; else echo "CRISP uninstaller — DRY RUN (add --apply to act)"; fi
echo "========================="

move_to_backup() {  # $1 = path, $2 = path inside the backup
  [ -e "$1" ] || return 0
  if [ "$APPLY" = 1 ]; then
    mkdir -p "$(dirname "$BACKUP/$2")"
    mv "$1" "$BACKUP/$2"
    echo "  moved $2"
  else
    echo "  would move $2"
  fi
}

# 1. Hooks, skills, agents and the resolved settings template the installer copied
echo ""
echo "Claude Code files (moved to $BACKUP)..."
for f in "$CRISP/claude/hooks/"*.py; do
  n="$(basename "$f")"
  move_to_backup "$CLAUDE/hooks/$n" "hooks/$n"
done
for s in token-kit headroom context-engineer agent-orchestration graphify karpathy-guidelines dev-review-pipeline ai-eval; do
  move_to_backup "$CLAUDE/skills/$s" "skills/$s"
done
for a in code-reviewer hallucination-reviewer; do
  move_to_backup "$CLAUDE/agents/$a.md" "agents/$a.md"
done
move_to_backup "$CLAUDE/settings.crisp-hooks.resolved.json" "settings.crisp-hooks.resolved.json"

# 2. Codex: drop the marked block from ~/.codex/AGENTS.md (a copy goes to the backup first)
echo ""
echo "Codex AGENTS.md..."
AGENTS_PATH="$CODEX/AGENTS.md"
START_MARKER="<!-- CRISP:AUTOMATION_SNIPPET:START -->"
END_MARKER="<!-- CRISP:AUTOMATION_SNIPPET:END -->"
if [ -f "$AGENTS_PATH" ] && grep -qF "$START_MARKER" "$AGENTS_PATH"; then
  if [ "$APPLY" = 1 ]; then
    mkdir -p "$BACKUP"
    cp "$AGENTS_PATH" "$BACKUP/codex-AGENTS.md"
    awk -v start="$START_MARKER" -v end="$END_MARKER" '
      index($0, start) { skip = 1; next }
      skip && index($0, end) { skip = 0; next }
      !skip { print }
    ' "$BACKUP/codex-AGENTS.md" > "$AGENTS_PATH"
    echo "  removed CRISP block (old copy: codex-AGENTS.md in the backup)"
  else
    echo "  would remove the CRISP block"
  fi
else
  echo "  no CRISP block found"
fi

# 3. Files that mix your own content with CRISP's: printed, never edited
echo ""
echo "Remove by hand (not auto-edited — they hold your own settings too):"
echo "  ~/.claude/CLAUDE.md     the CRISP sections (start at '# --- CRISP pipeline (auto-added) ---' if appended)"
echo "  ~/.claude/settings.json hook entries pointing at engine/ or ~/.claude/hooks/"
echo "  ~/.codex/config.toml    the token-efficient-agent MCP server and the CRISP notify line"
echo "  Plugins (claude-security etc.) are left installed: claude plugin uninstall <name>"
echo ""
echo "Memory not touched: engine/memory-vault/ and each project's .crisp/."
[ "$APPLY" = 1 ] && echo "Undo: move hooks/ skills/ agents/ in $BACKUP back under ~/.claude/; codex-AGENTS.md is the old ~/.codex/AGENTS.md."
exit 0

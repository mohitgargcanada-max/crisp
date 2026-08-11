#!/usr/bin/env bash
# CRISP installer — Linux / macOS
# Run from the crisp/ directory: ./install.sh

set -e
CRISP="$(cd "$(dirname "$0")" && pwd)"
CLAUDE="$HOME/.claude"
HOOKS="$CLAUDE/hooks"
SKILLS="$CLAUDE/skills"
CODEX="$HOME/.codex"

echo "CRISP installer"
echo "==============="

# 1. Create dirs
mkdir -p "$HOOKS" "$SKILLS" "$CODEX/hooks"

# 2. Copy hooks
echo ""
echo "Installing Claude Code hooks..."
cp "$CRISP/claude/hooks/"*.py "$HOOKS/"
echo "  ✓ headroom_filter.py   -> ~/.claude/hooks/"
echo "  ✓ auto_handover.py     -> ~/.claude/hooks/"
echo "  ✓ session_start_mem.py -> ~/.claude/hooks/"
echo "  ✓ skill_suggest.py     -> ~/.claude/hooks/"

# 3. Copy skills
echo ""
echo "Installing Claude Code skills..."
for skill in token-kit headroom context-engineer superpowers; do
  cp -r "$CRISP/claude/skills/$skill" "$SKILLS/"
  echo "  ✓ $skill -> ~/.claude/skills/$skill"
done

# 4. Copy Codex hooks
echo ""
echo "Installing Codex hooks..."
cp "$CRISP/codex/hooks/"*.js "$CODEX/hooks/"
echo "  ✓ pre-tool.js    -> ~/.codex/hooks/"
echo "  ✓ post-tool.js   -> ~/.codex/hooks/"
echo "  ✓ session-end.js -> ~/.codex/hooks/"

# 5. Merge CLAUDE.md
echo ""
echo "Merging CLAUDE.md..."
if [ -f "$CLAUDE/CLAUDE.md" ]; then
  if grep -q "CRISP" "$CLAUDE/CLAUDE.md" 2>/dev/null; then
    echo "  CRISP already in CLAUDE.md — skipped"
  else
    echo "" >> "$CLAUDE/CLAUDE.md"
    echo "# --- CRISP pipeline (auto-added) ---" >> "$CLAUDE/CLAUDE.md"
    cat "$CRISP/claude/CLAUDE.md" >> "$CLAUDE/CLAUDE.md"
    echo "  ✓ Appended CRISP sections to existing CLAUDE.md"
  fi
else
  cp "$CRISP/claude/CLAUDE.md" "$CLAUDE/CLAUDE.md"
  echo "  ✓ Created new CLAUDE.md"
fi

# 6. Settings
echo ""
echo "Checking settings.json..."
if [ -f "$CLAUDE/settings.json" ]; then
  echo "  Existing settings.json found."
  echo "  Manually merge hook blocks from: $CRISP/claude/settings.json"
  echo "  (Auto-merge skipped to avoid breaking existing config)"
else
  cp "$CRISP/claude/settings.json" "$CLAUDE/settings.json"
  echo "  ✓ Created settings.json from CRISP template"
fi

# 7. Check RTK
echo ""
echo "Checking RTK..."
if command -v rtk &>/dev/null; then
  echo "  ✓ RTK found: $(which rtk)"
else
  echo "  RTK not found. Install it:"
  echo "    cargo install rtk   (requires Rust: https://rustup.rs)"
fi

echo ""
echo "Done. Open a new Claude Code session to activate CRISP."
echo "Verify: you should see [SESSION] Turn counter reset to 0. on startup."

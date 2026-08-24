#!/usr/bin/env bash
# CRISP installer — Linux / macOS
# Run from the crisp/ directory: ./install.sh

set -e
CRISP="$(cd "$(dirname "$0")" && pwd)"
CRISPHOME="$CRISP/engine"
CLAUDE="$HOME/.claude"
HOOKS="$CLAUDE/hooks"
SKILLS="$CLAUDE/skills"
CODEX="$HOME/.codex"

echo "CRISP installer"
echo "==============="

# 1. Create dirs
mkdir -p "$HOOKS" "$SKILLS" "$CODEX"

# 2. Copy Claude Code hooks
echo ""
echo "Installing Claude Code hooks..."
cp "$CRISP/claude/hooks/"*.py "$HOOKS/"
echo "  ✓ headroom_filter.py   -> ~/.claude/hooks/"
echo "  ✓ auto_handover.py     -> ~/.claude/hooks/"
echo "  ✓ session_start_mem.py -> ~/.claude/hooks/"
echo "  ✓ skill_suggest.py     -> ~/.claude/hooks/"
echo "  ✓ usage_tracker.py     -> ~/.claude/hooks/"
echo "  ✓ usage_report.py      -> ~/.claude/hooks/"

# 3. Copy Claude Code skills (includes the vendored third-party skills CRISP depends on)
echo ""
echo "Installing Claude Code skills..."
for skill in token-kit headroom context-engineer agent-orchestration graphify lean-code-agent; do
  cp -r "$CRISP/claude/skills/$skill" "$SKILLS/"
  echo "  ✓ $skill -> ~/.claude/skills/$skill"
done

# 4. Merge CLAUDE.md
echo ""
echo "Merging CLAUDE.md..."
CRISP_MD_BODY="$(sed "s#<CRISP_HOME>#$CRISPHOME#g" "$CRISP/claude/CLAUDE.md")"
if [ -f "$CLAUDE/CLAUDE.md" ]; then
  if grep -q "CRISP" "$CLAUDE/CLAUDE.md" 2>/dev/null; then
    echo "  CRISP already in CLAUDE.md — skipped"
  else
    echo "" >> "$CLAUDE/CLAUDE.md"
    echo "# --- CRISP pipeline (auto-added) ---" >> "$CLAUDE/CLAUDE.md"
    echo "$CRISP_MD_BODY" >> "$CLAUDE/CLAUDE.md"
    echo "  ✓ Appended CRISP sections to existing CLAUDE.md"
  fi
else
  echo "$CRISP_MD_BODY" > "$CLAUDE/CLAUDE.md"
  echo "  ✓ Created new CLAUDE.md"
fi

# 5. Settings
echo ""
echo "Checking settings.json..."
RESOLVED_SETTINGS="$CLAUDE/settings.crisp-hooks.resolved.json"
sed -e "s#<CRISP_HOME>#$CRISPHOME#g" -e "s#<CLAUDE_HOME>#$CLAUDE#g" "$CRISP/claude/settings.json" > "$RESOLVED_SETTINGS"
if [ -f "$CLAUDE/settings.json" ]; then
  echo "  Existing settings.json found."
  echo "  Manually merge the 'hooks' block from: $RESOLVED_SETTINGS"
  echo "  (paths already resolved for this machine; auto-merge skipped to avoid breaking existing config)"
else
  cp "$RESOLVED_SETTINGS" "$CLAUDE/settings.json"
  echo "  ✓ Created settings.json from CRISP template"
fi

# 6. Codex: merge the automation snippet into ~/.codex/AGENTS.md (idempotent, marker-based)
echo ""
echo "Installing Codex integration..."
AGENTS_PATH="$CODEX/AGENTS.md"
SNIPPET_PATH="$CRISPHOME/adapters/codex/AUTOMATION_AGENTS_SNIPPET.md"
START_MARKER="<!-- CRISP:AUTOMATION_SNIPPET:START -->"
END_MARKER="<!-- CRISP:AUTOMATION_SNIPPET:END -->"

SNIPPET_BODY="$(sed "s#<CRISP_HOME>#$CRISPHOME#g" "$SNIPPET_PATH")"

if [ -f "$AGENTS_PATH" ] && grep -qF "$START_MARKER" "$AGENTS_PATH"; then
  awk -v start="$START_MARKER" -v end="$END_MARKER" -v body="$START_MARKER
$SNIPPET_BODY
$END_MARKER" '
    $0 == start { print body; skip=1; next }
    $0 == end { skip=0; next }
    skip { next }
    { print }
  ' "$AGENTS_PATH" > "$AGENTS_PATH.tmp" && mv "$AGENTS_PATH.tmp" "$AGENTS_PATH"
  echo "  ✓ Updated existing CRISP block in ~/.codex/AGENTS.md"
elif [ -f "$AGENTS_PATH" ]; then
  { echo ""; echo ""; echo "$START_MARKER"; echo "$SNIPPET_BODY"; echo "$END_MARKER"; } >> "$AGENTS_PATH"
  echo "  ✓ Appended CRISP block to existing ~/.codex/AGENTS.md"
else
  { echo "$START_MARKER"; echo "$SNIPPET_BODY"; echo "$END_MARKER"; } > "$AGENTS_PATH"
  echo "  ✓ Created ~/.codex/AGENTS.md with CRISP block"
fi

# 7. Codex: print (never auto-edit) the config.toml MCP server snippet
echo ""
echo "Add this to your ~/.codex/config.toml (not auto-edited — it can hold secrets):"
echo "  [mcp_servers.token-efficient-agent]"
echo "  command = \"node\""
echo "  args = [\"$CRISPHOME/mcp-server/server.js\"]"
echo ""
echo "NOTE: the notify-based session-rollover wiring (adapters/codex/notify-multiplexer.ps1)"
echo "is PowerShell/Windows-only today. On Linux/macOS the MCP server + tea.js CLI still"
echo "work fully; only the automatic notify->turn-tracking hook needs a shell port."

# 8. Check RTK (installed separately — binary, not vendored)
echo ""
echo "Checking RTK..."
if command -v rtk &>/dev/null; then
  echo "  ✓ RTK found: $(which rtk)"
else
  echo "  RTK not found. Install it:"
  echo "    cargo install rtk   (requires Rust: https://rustup.rs)"
fi

# 9. Check companion plugins — real Claude Code plugins (namespaced skills,
#    their own hooks) that CRISP recommends but never vendors, since copying
#    their files in flat would break internal cross-references and hook wiring.
echo ""
echo "Checking companion plugins..."
INSTALLED_PLUGINS="$CLAUDE/plugins/installed_plugins.json"
INSTALLED_PLUGINS_TEXT=""
[ -f "$INSTALLED_PLUGINS" ] && INSTALLED_PLUGINS_TEXT="$(cat "$INSTALLED_PLUGINS")"

check_companion_plugin() {
  local key="$1" name="$2" marketplace="$3" install="$4" note="$5"
  if echo "$INSTALLED_PLUGINS_TEXT" | grep -qF "\"${key}"; then
    echo "  ✓ $name found"
  else
    echo "  $name not found — $note"
    if [ -n "$marketplace" ]; then
      echo "    /plugin marketplace add $marketplace"
      echo "    /plugin install $install"
    else
      echo "    check the /plugin menu in Claude Code"
    fi
  fi
}

check_companion_plugin "claude-mem@" "claude-mem" "thedotmack/claude-mem" "claude-mem@thedotmack" \
  "persistent semantic memory across sessions"
check_companion_plugin "superpowers@" "superpowers" "obra/superpowers-marketplace" "superpowers@claude-plugins-official" \
  "the full brainstorm/plan/TDD/debug/review methodology (14 skills) — CRISP's own agent-orchestration skill is a much smaller independent cheatsheet, not a substitute"
check_companion_plugin "code-review@" "code-review" "" "" \
  "Anthropic's own 4-agent PR review plugin, ships with Claude Code — check the /plugin menu if not already available, no separate marketplace needed"
check_companion_plugin "andrej-karpathy-skills@" "andrej-karpathy-skills" "multica-ai/andrej-karpathy-skills" "andrej-karpathy-skills@karpathy-skills" \
  "simplicity/surgical-change coding guidelines — verify the exact marketplace/install name against the repo's own README, naming has drifted across forks"

echo ""
echo "Done."
echo "Claude Code: open a new session — you should see [SESSION] Turn counter reset to 0."
echo "Codex: paste the config.toml block above, then restart Codex."

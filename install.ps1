# CRISP installer — Windows PowerShell
# Run from the crisp/ directory: ./install.ps1

$CRISP      = $PSScriptRoot
$CRISPHOME  = Join-Path $CRISP "engine"
$CLAUDE     = "$env:USERPROFILE\.claude"
$HOOKS      = "$CLAUDE\hooks"
$SKILLS     = "$CLAUDE\skills"
$CODEX      = "$env:USERPROFILE\.codex"

Write-Host "CRISP installer" -ForegroundColor Cyan
Write-Host "===============" -ForegroundColor Cyan

# 1. Create dirs
New-Item -ItemType Directory -Force -Path $HOOKS  | Out-Null
New-Item -ItemType Directory -Force -Path $SKILLS | Out-Null
New-Item -ItemType Directory -Force -Path $CODEX  | Out-Null

# 2. Copy Claude Code hooks
Write-Host "`nInstalling Claude Code hooks..."
Copy-Item "$CRISP\claude\hooks\*.py" $HOOKS -Force
Write-Host "  headroom_filter.py   -> ~/.claude/hooks/" -ForegroundColor Green
Write-Host "  auto_handover.py     -> ~/.claude/hooks/" -ForegroundColor Green
Write-Host "  session_start_mem.py -> ~/.claude/hooks/" -ForegroundColor Green
Write-Host "  skill_suggest.py     -> ~/.claude/hooks/" -ForegroundColor Green
Write-Host "  usage_tracker.py     -> ~/.claude/hooks/" -ForegroundColor Green
Write-Host "  usage_report.py      -> ~/.claude/hooks/" -ForegroundColor Green

# 3. Copy Claude Code skills (includes the vendored third-party skills CRISP depends on)
Write-Host "`nInstalling Claude Code skills..."
$skills = @('token-kit','headroom','context-engineer','agent-orchestration','graphify','karpathy-guidelines')
foreach ($s in $skills) {
    Copy-Item "$CRISP\claude\skills\$s" "$SKILLS\$s" -Recurse -Force
    Write-Host "  $s -> ~/.claude/skills/$s" -ForegroundColor Green
}

# 4. Merge CLAUDE.md
Write-Host "`nMerging CLAUDE.md..."
$claudeMd = "$CLAUDE\CLAUDE.md"
$crispMd  = "$CRISP\claude\CLAUDE.md"
$crispMdBody = (Get-Content $crispMd -Raw) -replace [regex]::Escape('<CRISP_HOME>'), $CRISPHOME
if (Test-Path $claudeMd) {
    $existing = Get-Content $claudeMd -Raw
    if ($existing -notmatch "CRISP") {
        Add-Content $claudeMd "`n`n# --- CRISP pipeline (auto-added) ---`n"
        Add-Content $claudeMd $crispMdBody
        Write-Host "  Appended CRISP sections to existing CLAUDE.md" -ForegroundColor Green
    } else {
        Write-Host "  CRISP already in CLAUDE.md — skipped" -ForegroundColor Yellow
    }
} else {
    Set-Content $claudeMd $crispMdBody
    Write-Host "  Created new CLAUDE.md" -ForegroundColor Green
}

# 5. Merge settings.json hooks
Write-Host "`nMerging settings.json hooks..."
$settingsPath  = "$CLAUDE\settings.json"
$crispSettings = "$CRISP\claude\settings.json"
$crispHomeFwd  = $CRISPHOME -replace '\\','/'
$claudeHomeFwd = $CLAUDE -replace '\\','/'
$resolvedSettings = (Get-Content $crispSettings -Raw) `
    -replace [regex]::Escape('<CRISP_HOME>'), $crispHomeFwd `
    -replace [regex]::Escape('<CLAUDE_HOME>'), $claudeHomeFwd
$resolvedPath = "$CLAUDE\settings.crisp-hooks.resolved.json"
Set-Content $resolvedPath $resolvedSettings
if (Test-Path $settingsPath) {
    Write-Host "  Existing settings.json found." -ForegroundColor Yellow
    Write-Host "  Manually merge the 'hooks' block from: $resolvedPath" -ForegroundColor Yellow
    Write-Host "  (paths already resolved for this machine; auto-merge skipped to avoid breaking existing config)" -ForegroundColor Yellow
} else {
    Copy-Item $resolvedPath $settingsPath
    Write-Host "  Created settings.json from CRISP template" -ForegroundColor Green
}

# 6. Codex: merge the automation snippet into ~/.codex/AGENTS.md (idempotent, marker-based)
Write-Host "`nInstalling Codex integration..."
$agentsPath  = "$CODEX\AGENTS.md"
$snippetPath = "$CRISPHOME\adapters\codex\AUTOMATION_AGENTS_SNIPPET.md"
$startMarker = "<!-- CRISP:AUTOMATION_SNIPPET:START -->"
$endMarker   = "<!-- CRISP:AUTOMATION_SNIPPET:END -->"

$snippet = (Get-Content $snippetPath -Raw) -replace [regex]::Escape('<CRISP_HOME>'), $CRISPHOME
$block   = "$startMarker`n$snippet`n$endMarker"

if (Test-Path $agentsPath) {
    $existing = Get-Content $agentsPath -Raw
    $pattern = [regex]::Escape($startMarker) + "[\s\S]*?" + [regex]::Escape($endMarker)
    if ($existing -match $pattern) {
        $evaluator = [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $block }
        $updated = [regex]::Replace($existing, $pattern, $evaluator)
        Set-Content $agentsPath $updated -NoNewline
        Write-Host "  Updated existing CRISP block in ~/.codex/AGENTS.md" -ForegroundColor Green
    } else {
        Add-Content $agentsPath "`n`n$block`n"
        Write-Host "  Appended CRISP block to existing ~/.codex/AGENTS.md" -ForegroundColor Green
    }
} else {
    Set-Content $agentsPath $block
    Write-Host "  Created ~/.codex/AGENTS.md with CRISP block" -ForegroundColor Green
}

# 7. Codex: print (never auto-edit) the config.toml MCP server + notify snippets
$configTomlPath = "$CODEX\config.toml"
$existingNotify = $null
if (Test-Path $configTomlPath) {
    $tomlText = Get-Content $configTomlPath -Raw
    if ($tomlText -match 'notify\s*=\s*\[(.*?)\]') {
        $existingNotify = $matches[0]
    }
}

Write-Host "`nAdd this to your ~/.codex/config.toml (not auto-edited — it can hold secrets):" -ForegroundColor Yellow
Write-Host @"
[mcp_servers.token-efficient-agent]
command = "node"
args = ["$($CRISPHOME -replace '\\','/')/mcp-server/server.js"]
"@ -ForegroundColor White

Write-Host "`nFor session-rollover turn tracking, set notify to the CRISP multiplexer:" -ForegroundColor Yellow
Write-Host "  notify = [`"powershell`",`"-NoProfile`",`"-ExecutionPolicy`",`"Bypass`",`"-File`",`"$CRISPHOME\adapters\codex\notify-multiplexer.ps1`"]" -ForegroundColor White
if ($existingNotify) {
    Write-Host "`n  You already had a notify command configured:" -ForegroundColor Yellow
    Write-Host "    $existingNotify" -ForegroundColor White
    Write-Host "  Set it as an env var so the multiplexer preserves it:" -ForegroundColor Yellow
    Write-Host "    `$env:CRISP_CODEX_EXISTING_NOTIFY = `"<path to your existing notify exe>`"" -ForegroundColor White
}

# 8. Check RTK (installed separately — binary, not vendored)
Write-Host "`nChecking RTK..."
$rtk = Get-Command rtk -ErrorAction SilentlyContinue
if ($rtk) {
    Write-Host "  RTK found: $($rtk.Source)" -ForegroundColor Green
} else {
    Write-Host "  RTK not found. Install it:" -ForegroundColor Yellow
    Write-Host "    cargo install rtk" -ForegroundColor White
    Write-Host "    (requires Rust: https://rustup.rs)" -ForegroundColor White
}

# 9. Check companion plugins — real Claude Code plugins (namespaced skills,
#    their own hooks) that CRISP recommends but never vendors, since copying
#    their files in flat would break internal cross-references and hook wiring.
Write-Host "`nChecking companion plugins..."
$installedPlugins = "$CLAUDE\plugins\installed_plugins.json"
$installedPluginsText = if (Test-Path $installedPlugins) { Get-Content $installedPlugins -Raw } else { "" }

$companionPlugins = @(
    @{ Key = "claude-mem@"; Name = "claude-mem"; Marketplace = "thedotmack/claude-mem"; Install = "claude-mem@thedotmack"
       Note = "persistent semantic memory across sessions" },
    @{ Key = "superpowers@"; Name = "superpowers"; Marketplace = "obra/superpowers-marketplace"; Install = "superpowers@claude-plugins-official"
       Note = "the full brainstorm/plan/TDD/debug/review methodology (14 skills) — CRISP's own agent-orchestration skill is a much smaller independent cheatsheet, not a substitute" },
    @{ Key = "code-review@"; Name = "code-review"; Marketplace = ""; Install = ""
       Note = "Anthropic's own 4-agent PR review plugin, ships with Claude Code — check the /plugin menu if not already available, no separate marketplace needed" }
)

foreach ($p in $companionPlugins) {
    $found = $installedPluginsText -match [regex]::Escape('"' + $p.Key)
    if ($found) {
        Write-Host "  $($p.Name) found" -ForegroundColor Green
    } else {
        Write-Host "  $($p.Name) not found — $($p.Note)" -ForegroundColor Yellow
        if ($p.Marketplace) {
            Write-Host "    /plugin marketplace add $($p.Marketplace)" -ForegroundColor White
            Write-Host "    /plugin install $($p.Install)" -ForegroundColor White
        } else {
            Write-Host "    check the /plugin menu in Claude Code" -ForegroundColor White
        }
    }
}

Write-Host "`nDone." -ForegroundColor Cyan
Write-Host "Claude Code: open a new session — you should see [SESSION] Turn counter reset to 0." -ForegroundColor White
Write-Host "Codex: paste the config.toml block above, then restart Codex." -ForegroundColor White

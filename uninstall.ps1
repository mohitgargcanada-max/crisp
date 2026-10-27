# CRISP uninstaller — Windows PowerShell
# Run from the crisp/ directory: ./uninstall.ps1          (dry run: lists what it would do)
#                                ./uninstall.ps1 -Apply   (does it)
#
# Reverses install.ps1. Nothing is deleted: every file it removes is MOVED into
# ~/.claude/crisp-uninstall-<timestamp>/, so a mistaken run is undone by moving
# them back. Files that hold your own edits as well as CRISP's (CLAUDE.md,
# settings.json, ~/.codex/config.toml) are never edited; it prints what to remove.
# Your memory (engine/memory-vault/, each project's .crisp/) is not touched.
# Keep the hook/skill/agent lists in step with install.ps1.

param([switch]$Apply)

$CRISP   = $PSScriptRoot
$CLAUDE  = "$env:USERPROFILE\.claude"
$CODEX   = "$env:USERPROFILE\.codex"
$BACKUP  = "$CLAUDE\crisp-uninstall-$(Get-Date -Format yyyyMMdd-HHmmss)"

$mode = if ($Apply) { "APPLY" } else { "DRY RUN (add -Apply to act)" }
Write-Host "CRISP uninstaller — $mode" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan

function Move-ToBackup($path, $rel) {
    if (-not (Test-Path $path)) { return }
    $dst = Join-Path $BACKUP $rel
    if ($Apply) {
        New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
        Move-Item $path $dst
        Write-Host "  moved $rel" -ForegroundColor Green
    } else {
        Write-Host "  would move $rel" -ForegroundColor White
    }
}

# 1. Hooks, skills, agents and the resolved settings template the installer copied
Write-Host "`nClaude Code files (moved to $BACKUP)..."
Get-ChildItem "$CRISP\claude\hooks\*.py" | ForEach-Object {
    Move-ToBackup "$CLAUDE\hooks\$($_.Name)" "hooks\$($_.Name)"
}
$skills = @('token-kit','headroom','context-engineer','agent-orchestration','graphify','karpathy-guidelines','dev-review-pipeline','ai-eval')
foreach ($s in $skills) { Move-ToBackup "$CLAUDE\skills\$s" "skills\$s" }
foreach ($a in @('code-reviewer','hallucination-reviewer')) { Move-ToBackup "$CLAUDE\agents\$a.md" "agents\$a.md" }
Move-ToBackup "$CLAUDE\settings.crisp-hooks.resolved.json" "settings.crisp-hooks.resolved.json"

# 2. Codex: drop the marked block from ~/.codex/AGENTS.md (a copy goes to the backup first)
Write-Host "`nCodex AGENTS.md..."
$agentsPath  = "$CODEX\AGENTS.md"
$pattern     = "(\r?\n)*" + [regex]::Escape("<!-- CRISP:AUTOMATION_SNIPPET:START -->") + "[\s\S]*?" + [regex]::Escape("<!-- CRISP:AUTOMATION_SNIPPET:END -->") + "\r?\n?"
if ((Test-Path $agentsPath) -and ((Get-Content $agentsPath -Raw) -match $pattern)) {
    if ($Apply) {
        New-Item -ItemType Directory -Force -Path $BACKUP | Out-Null
        Copy-Item $agentsPath "$BACKUP\codex-AGENTS.md"
        $updated = [regex]::Replace((Get-Content $agentsPath -Raw), $pattern, "`n")
        Set-Content $agentsPath $updated.TrimEnd() -NoNewline
        Write-Host "  removed CRISP block (old copy: codex-AGENTS.md in the backup)" -ForegroundColor Green
    } else {
        Write-Host "  would remove the CRISP block" -ForegroundColor White
    }
} else {
    Write-Host "  no CRISP block found" -ForegroundColor Yellow
}

# 3. Files that mix your own content with CRISP's: printed, never edited
Write-Host "`nRemove by hand (not auto-edited — they hold your own settings too):" -ForegroundColor Yellow
Write-Host "  ~/.claude/CLAUDE.md     the CRISP sections (start at '# --- CRISP pipeline (auto-added) ---' if appended)" -ForegroundColor White
Write-Host "  ~/.claude/settings.json hook entries pointing at engine/ or ~/.claude/hooks/" -ForegroundColor White
Write-Host "  ~/.codex/config.toml    the token-efficient-agent MCP server and the CRISP notify line" -ForegroundColor White
Write-Host "  Plugins (claude-security etc.) are left installed: claude plugin uninstall <name>" -ForegroundColor White

Write-Host "`nMemory not touched: engine/memory-vault/ and each project's .crisp/." -ForegroundColor Cyan
if ($Apply) { Write-Host "Undo: move hooks/ skills/ agents/ in $BACKUP back under ~/.claude/; codex-AGENTS.md is the old ~/.codex/AGENTS.md." -ForegroundColor Cyan }

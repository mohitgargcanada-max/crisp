# CRISP installer — Windows PowerShell
# Run from the crisp/ directory: ./install.ps1

$CRISP   = $PSScriptRoot
$CLAUDE  = "$env:USERPROFILE\.claude"
$HOOKS   = "$CLAUDE\hooks"
$SKILLS  = "$CLAUDE\skills"
$CODEX   = "$env:USERPROFILE\.codex"

Write-Host "CRISP installer" -ForegroundColor Cyan
Write-Host "===============" -ForegroundColor Cyan

# 1. Create dirs
New-Item -ItemType Directory -Force -Path $HOOKS   | Out-Null
New-Item -ItemType Directory -Force -Path $SKILLS  | Out-Null
New-Item -ItemType Directory -Force -Path "$CODEX\hooks" | Out-Null

# 2. Copy hooks
Write-Host "`nInstalling Claude Code hooks..."
Copy-Item "$CRISP\claude\hooks\*.py" $HOOKS -Force
Write-Host "  headroom_filter.py  -> ~/.claude/hooks/" -ForegroundColor Green
Write-Host "  auto_handover.py    -> ~/.claude/hooks/" -ForegroundColor Green
Write-Host "  session_start_mem.py-> ~/.claude/hooks/" -ForegroundColor Green
Write-Host "  skill_suggest.py    -> ~/.claude/hooks/" -ForegroundColor Green

# 3. Copy skills
Write-Host "`nInstalling Claude Code skills..."
$skills = @('token-kit','headroom','context-engineer','superpowers')
foreach ($s in $skills) {
    Copy-Item "$CRISP\claude\skills\$s" "$SKILLS\$s" -Recurse -Force
    Write-Host "  $s -> ~/.claude/skills/$s" -ForegroundColor Green
}

# 4. Copy Codex hooks
Write-Host "`nInstalling Codex hooks..."
Copy-Item "$CRISP\codex\hooks\*.js" "$CODEX\hooks\" -Force
Write-Host "  pre-tool.js    -> ~/.codex/hooks/" -ForegroundColor Green
Write-Host "  post-tool.js   -> ~/.codex/hooks/" -ForegroundColor Green
Write-Host "  session-end.js -> ~/.codex/hooks/" -ForegroundColor Green

# 5. Merge CLAUDE.md
Write-Host "`nMerging CLAUDE.md..."
$claudeMd = "$CLAUDE\CLAUDE.md"
$crispMd  = "$CRISP\claude\CLAUDE.md"
if (Test-Path $claudeMd) {
    $existing = Get-Content $claudeMd -Raw
    if ($existing -notmatch "CRISP") {
        Add-Content $claudeMd "`n`n# --- CRISP pipeline (auto-added) ---`n"
        Get-Content $crispMd | Add-Content $claudeMd
        Write-Host "  Appended CRISP sections to existing CLAUDE.md" -ForegroundColor Green
    } else {
        Write-Host "  CRISP already in CLAUDE.md — skipped" -ForegroundColor Yellow
    }
} else {
    Copy-Item $crispMd $claudeMd
    Write-Host "  Created new CLAUDE.md" -ForegroundColor Green
}

# 6. Merge settings.json hooks
Write-Host "`nMerging settings.json hooks..."
$settingsPath = "$CLAUDE\settings.json"
$crispSettings = "$CRISP\claude\settings.json"
if (Test-Path $settingsPath) {
    Write-Host "  Existing settings.json found." -ForegroundColor Yellow
    Write-Host "  Manually merge hook blocks from: $crispSettings" -ForegroundColor Yellow
    Write-Host "  (Auto-merge skipped to avoid breaking existing config)" -ForegroundColor Yellow
} else {
    Copy-Item $crispSettings $settingsPath
    Write-Host "  Created settings.json from CRISP template" -ForegroundColor Green
}

# 7. Check RTK
Write-Host "`nChecking RTK..."
$rtk = Get-Command rtk -ErrorAction SilentlyContinue
if ($rtk) {
    Write-Host "  RTK found: $($rtk.Source)" -ForegroundColor Green
} else {
    Write-Host "  RTK not found. Install it:" -ForegroundColor Yellow
    Write-Host "    cargo install rtk" -ForegroundColor White
    Write-Host "    (requires Rust: https://rustup.rs)" -ForegroundColor White
}

Write-Host "`nDone. Open a new Claude Code session to activate CRISP." -ForegroundColor Cyan
Write-Host "Verify: you should see [SESSION] Turn counter reset to 0. on startup." -ForegroundColor White

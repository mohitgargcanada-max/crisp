param(
  [string]$SettingsPath = "$HOME\.claude\settings.json",
  [string]$AgentsPath = "$HOME\.claude\agents",
  [switch]$EnforceTeaRun
)

$ErrorActionPreference = "Stop"
$LifecycleHookPath = Join-Path $PSScriptRoot "..\generic-hooks\tea-lifecycle-hook.js"
$EnforceScriptPath = Join-Path $PSScriptRoot "enforce-tea-run.js"
$HookCommand = "node `"$LifecycleHookPath`""
$EnforceCommand = "node `"$EnforceScriptPath`""
$AgentSourcePath = Join-Path $PSScriptRoot "agents"

function Add-Hook($Settings, $Event, $Command, $Matcher = "", $AppendEventArgs = $true) {
  if (-not $Settings.hooks) {
    $Settings | Add-Member -NotePropertyName hooks -NotePropertyValue ([pscustomobject]@{})
  }
  if (-not $Settings.hooks.$Event) {
    $Settings.hooks | Add-Member -NotePropertyName $Event -NotePropertyValue @()
  }
  $fullCommand = $Command
  if ($AppendEventArgs) {
    $fullCommand = "$Command --host claude-code --event $Event"
  }
  $exists = $false
  foreach ($entry in $Settings.hooks.$Event) {
    foreach ($hook in @($entry.hooks)) {
      if ($hook.command -eq $fullCommand) { $exists = $true }
    }
  }
  if (-not $exists) {
    $Settings.hooks.$Event += [pscustomobject]@{
      matcher = $Matcher
      hooks = @([pscustomobject]@{
        type = "command"
        command = $fullCommand
      })
    }
  }
}

if (-not (Test-Path $SettingsPath)) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $SettingsPath) | Out-Null
  "{}" | Set-Content -LiteralPath $SettingsPath -Encoding UTF8
}

$Backup = "$SettingsPath.bak-token-efficient-$(Get-Date -Format yyyyMMddHHmmss)"
Copy-Item -LiteralPath $SettingsPath -Destination $Backup
$Settings = Get-Content -LiteralPath $SettingsPath -Raw | ConvertFrom-Json

$Events = @(
  "SessionStart",
  "InstructionsLoaded",
  "UserPromptSubmit",
  "UserPromptExpansion",
  "PreToolUse",
  "PermissionDenied",
  "PostToolUse",
  "PostToolUseFailure",
  "PostToolBatch",
  "Notification",
  "SubagentStart",
  "SubagentStop",
  "TaskCreated",
  "TaskCompleted",
  "Stop",
  "StopFailure",
  "PreCompact",
  "PostCompact",
  "SessionEnd",
  "ConfigChange",
  "CwdChanged"
)

foreach ($Event in $Events) {
  Add-Hook $Settings $Event $HookCommand
}

if ($EnforceTeaRun) {
  Add-Hook $Settings "PreToolUse" $EnforceCommand "Bash" $false
}

if (Test-Path $AgentSourcePath) {
  New-Item -ItemType Directory -Force -Path $AgentsPath | Out-Null
  Get-ChildItem -LiteralPath $AgentSourcePath -Filter "*.md" | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $AgentsPath $_.Name) -Force
  }
}

$Settings | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $SettingsPath -Encoding UTF8
Write-Output "claude_hooks_installed: $SettingsPath"
Write-Output "claude_agents_installed: $AgentsPath"
if ($EnforceTeaRun) {
  Write-Output "claude_tea_run_enforced: true"
}
Write-Output "backup: $Backup"

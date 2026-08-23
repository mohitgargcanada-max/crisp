param(
  [string]$TaskName = "TokenEfficientAgentWake",
  [int]$IntervalMinutes = 1,
  [string]$TeaPath = (Join-Path $PSScriptRoot "..\..\cli\tea.js"),
  [string]$RunnerPath = (Join-Path $PSScriptRoot "run-wake-due.ps1")
)

$ErrorActionPreference = "Stop"

if ($IntervalMinutes -lt 1) {
  throw "IntervalMinutes must be >= 1"
}

if (-not (Test-Path $TeaPath)) {
  throw "tea.js not found: $TeaPath"
}

if (-not (Test-Path $RunnerPath)) {
  throw "wake runner not found: $RunnerPath"
}

$taskRun = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$RunnerPath`" -TeaPath `"$TeaPath`""

& schtasks.exe /Create /TN $TaskName /SC MINUTE /MO $IntervalMinutes /TR $taskRun /F | Out-Null
& schtasks.exe /Run /TN $TaskName | Out-Null

Write-Output "wake_task_installed: $TaskName"
Write-Output "interval_minutes: $IntervalMinutes"
Write-Output "runner: $RunnerPath"
Write-Output "tea: $TeaPath"

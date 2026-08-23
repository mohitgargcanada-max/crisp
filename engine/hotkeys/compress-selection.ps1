param(
  [ValidateSet("safe", "balanced", "aggressive")]
  [string]$Mode = "balanced",
  [switch]$ReplaceSelection
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Tea = Join-Path $Root "cli\tea.js"

$shell = New-Object -ComObject WScript.Shell
$shell.SendKeys("^c")
Start-Sleep -Milliseconds 160

$before = Get-Clipboard -Raw
if ([string]::IsNullOrWhiteSpace($before)) {
  throw "Clipboard/selection is empty."
}

$tmp = Join-Path $env:TEMP ("tea-selection-" + [guid]::NewGuid().ToString() + ".txt")
Set-Content -LiteralPath $tmp -Value $before -Encoding UTF8
$compressed = & node $Tea compress $tmp --mode $Mode
Remove-Item -LiteralPath $tmp -Force

Set-Clipboard -Value ($compressed -join "`n")

if ($ReplaceSelection) {
  Start-Sleep -Milliseconds 80
  $shell.SendKeys("^v")
}

Write-Output "Selection compressed to clipboard."

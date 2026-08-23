param(
  [string]$RawFile = $env:TEA_RAW_TASK_FILE,
  [string]$FinalFile = $env:TEA_FINAL_TASK_FILE,
  [string]$Label = $env:TEA_TASK_LABEL
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Tea = Join-Path $RepoRoot "cli\tea.js"

if (-not $RawFile -or -not $FinalFile) {
  Write-Error "Usage: after-task-token-savings.ps1 -RawFile <raw> -FinalFile <final> [-Label <label>]"
}

$TeaArgs = @($Tea, "after-task", $RawFile, $FinalFile)
if ($Label) {
  $TeaArgs += @("--label", $Label)
}

& node @TeaArgs
exit $LASTEXITCODE

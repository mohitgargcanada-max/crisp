param(
  [string]$TeaPath = (Join-Path $PSScriptRoot "..\..\cli\tea.js")
)

$ErrorActionPreference = "Stop"
$result = node $TeaPath wake run-due --json
$data = $result | ConvertFrom-Json

if ($data.firedCount -gt 0) {
  foreach ($plan in $data.fired) {
    $message = "Token kit wake: Claude limit reset time reached for project '$($plan.project)'. Resume prompt copied to clipboard. Handoff: $($plan.handoff_file)"
    try {
      msg $env:USERNAME $message | Out-Null
    } catch {
      # Some Windows editions block msg.exe for local desktop notifications.
    }
  }
}

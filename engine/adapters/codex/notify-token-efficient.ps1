param(
  [string]$Event = "turn-ended"
)

$ErrorActionPreference = "Stop"
$Hook = Join-Path $PSScriptRoot "..\generic-hooks\tea-lifecycle-hook.js"
$Payload = [Console]::In.ReadToEnd()
if (-not $Payload) {
  $Payload = "{`"event`":`"$Event`",`"cwd`":`"$PWD`"}"
}

$HookEvent = switch ($Event) {
  "session-start" { "SessionStart" }
  "turn-ended" { "UserPromptSubmit" }
  "user-prompt-submit" { "UserPromptSubmit" }
  default { $Event }
}

$Payload | node $Hook --host codex --event $HookEvent

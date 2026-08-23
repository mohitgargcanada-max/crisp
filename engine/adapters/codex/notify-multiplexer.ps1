param(
  [string]$Event = "turn-ended"
)

$ErrorActionPreference = "Continue"
# Set CRISP_CODEX_EXISTING_NOTIFY if you already had a `notify` command wired in
# config.toml before installing this (e.g. Codex's own computer-use notify binary).
# The install script attempts to auto-detect and set this for you.
$ExistingNotify = $env:CRISP_CODEX_EXISTING_NOTIFY
$TeaNotify = Join-Path $PSScriptRoot "notify-token-efficient.ps1"
$Payload = [Console]::In.ReadToEnd()

if ($ExistingNotify -and (Test-Path $ExistingNotify)) {
  & $ExistingNotify $Event
}

if (-not $Payload) {
  $Payload = "{`"event`":`"$Event`",`"cwd`":`"$PWD`"}"
}

$Payload | powershell -NoProfile -ExecutionPolicy Bypass -File $TeaNotify -Event $Event

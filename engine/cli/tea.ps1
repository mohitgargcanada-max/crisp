$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Node = "node"
& $Node (Join-Path $ScriptDir "tea.js") @args
exit $LASTEXITCODE

# Codex Adapter

Best path:

1. Use `plugin/token-efficient-agent` as a local Codex plugin scaffold.
2. Or copy `skill/token-efficient-agent` into a Codex skills folder.
3. Add an MCP server later using `adapters/generic-mcp`.

Starter prompt:

```text
Use $token-efficient-agent for this task. Keep output compact and preserve exact commands/errors/code.
```

The plugin scaffold currently contains only a skill. Add MCP once `mcp-server/` exists.

This machine already has the token-efficient MCP server shape:

```toml
[mcp_servers.token-efficient-agent]
command = "node"
args = ["<CRISP_HOME>/mcp-server/server.js"]
```

For Codex behavior, add the snippet from:

```text
<CRISP_HOME>\adapters\codex\AUTOMATION_AGENTS_SNIPPET.md
```

to a global or project `AGENTS.md`.

For lifecycle-style capture, use the notify wrapper:

```powershell
<CRISP_HOME>\adapters\codex\notify-token-efficient.ps1
```

If Codex already has a `notify` command, preserve it with the multiplexer:

```powershell
<CRISP_HOME>\adapters\codex\notify-multiplexer.ps1
```

This maps Codex `turn-ended` notifications to the token kit's `UserPromptSubmit` event so session rollover can track turns. If the notify payload includes prompt/message text, the optional `TEA_ROLLOVER_TOKENS` threshold also tracks estimated prompt tokens.

## After-Task Savings

Codex will not call token-efficient-agent automatically unless a Codex skill, MCP tool, or wrapper is invoked.

For shell tasks, run commands through the wrapper:

```powershell
node <CRISP_HOME>\cli\tea.js run --label "<task name>" -- <command> [args...]
```

When a Codex workflow can write raw and compact/final task text, call:

```powershell
node <CRISP_HOME>\cli\tea.js after-task <raw-task-file> <compact-or-final-file> --label "<task name>"
```

Reusable hook script:

```powershell
<CRISP_HOME>\adapters\generic-hooks\after-task-token-savings.ps1 -RawFile <raw-task-file> -FinalFile <compact-or-final-file> -Label "<task name>"
```

Then check totals:

```powershell
node <CRISP_HOME>\cli\tea.js stats
```

The MCP server also exposes:

- `observe_add`
- `observe_search`
- `memory_health`

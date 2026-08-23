# Claude Code Adapter

Best path:

1. Use plugin form from `plugin/token-efficient-agent`.
2. Or copy `skill/token-efficient-agent` into the user or project skills folder.
3. Optionally add local MCP tools from `adapters/generic-mcp`.
4. Restart Claude Code.

Recommended project prompt:

```text
Use token-efficient-agent by default: compact replies, compact tool summaries, exact code/commands/errors preserved.
```

For shell-heavy work, add terminal aliases from `adapters/terminal`.

Install lifecycle hooks:

```powershell
<CRISP_HOME>\adapters\claude-code\install-hooks.ps1
```

This backs up `~\.claude\settings.json` before adding hooks.

Install limit reset wake watcher:

```powershell
<CRISP_HOME>\adapters\windows\install-wake-task.ps1
```

When Claude Code emits a limit/reset message with a reset time, the lifecycle hook saves a handoff and writes a wake plan. The Windows watcher checks due plans every minute, copies the resume prompt to the clipboard, and writes it under `memory-vault\wake-due`.

Check wake plans:

```powershell
node <CRISP_HOME>\cli\tea.js wake status
```

## After-Task Savings

Claude Code can make this more automatic only when project/user hooks or wrappers call the CLI after a turn/session.

For shell tasks, run commands through the wrapper:

```powershell
node <CRISP_HOME>\cli\tea.js run --label "<task name>" -- <command> [args...]
```

Hook target when raw and compact/final task files already exist:

```powershell
node <CRISP_HOME>\cli\tea.js after-task <raw-task-file> <compact-or-final-file> --label "<task name>"
```

Reusable hook script:

```powershell
<CRISP_HOME>\adapters\generic-hooks\after-task-token-savings.ps1 -RawFile <raw-task-file> -FinalFile <compact-or-final-file> -Label "<task name>"
```

This records an `after-task` row in `.tea-stats\token-savings.jsonl`, so `tea stats` shows task-level estimated savings in addition to compression-command savings.

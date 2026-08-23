# Hermes Adapter

Purpose: use token-efficient-agent behavior in Hermes sessions.

## Manual Prompt

Use this in any Hermes chat/session:

```text
Use token-efficient-agent behavior: compact replies, compact tool summaries, preserve exact code/commands/errors, retrieve raw context only when needed.
```

## Automatic First

Minimum useful Hermes behavior:

- Auto-use compact summaries for noisy tool output when Hermes supports command/plugin rewriting.
- Auto-call the token kit MCP server when Hermes supports MCP.
- Auto-show this receipt after non-trivial tasks when Hermes supports post-task hooks:

```powershell
node <CRISP_HOME>\cli\tea.js receipt
```

Manual fallback is the same command. It prints estimated saved tokens and saved percentage.

## Command Output Compression

If Hermes supports plugin-style command rewriting in your install, route noisy shell commands through a compact command wrapper.

Target command families:

- `git status`
- `git diff`
- `git log`
- `rg` / `grep`
- `cat` / file reads
- test runners
- linters
- build logs

Keep raw fallback available for exact-output debugging.

## MCP Shape

When the kit has an MCP server, use this shape:

```json
{
  "mcpServers": {
    "token-efficient-agent": {
      "command": "node",
      "args": ["C:/path/to/token-efficient-agent-kit/mcp-server/server.js"]
    }
  }
}
```

Check Hermes docs or local config for exact MCP/plugin config path.

## Recommended Behavior Rule

```text
Default to compact workflow. Search before reading. Summarize noisy output. Preserve exact commands, paths, errors, code symbols, IDs, dates, and quoted user requirements. Fetch raw detail only when needed.
```

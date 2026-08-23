# Claude Desktop Adapter

Claude Desktop can use a local MCP server when configured by the desktop app config.

Use `claude_desktop_config.example.json` as shape only. Replace:

`C:/path/to/token-efficient-agent-kit/mcp-server/server.js`

with the real path after the MCP server is built.

Prompt to pin behavior:

```text
Use token-efficient-agent behavior for this chat: compact answers, exact identifiers, raw detail only when needed.
```

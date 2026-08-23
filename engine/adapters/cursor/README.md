# Cursor Adapter

Use project rules plus MCP if your Cursor version supports it.

Project rule:

```text
Use token-efficient-agent behavior. Keep responses compact, use narrow searches/reads, summarize noisy tool output, preserve exact code/commands/errors.
```

MCP config shape:

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

Check current Cursor docs for the exact config file path.

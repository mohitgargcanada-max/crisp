# Cline / Roo Adapter

Use VS Code agent custom instructions plus MCP settings when supported.

Instruction:

```text
Use token-efficient-agent behavior: compact replies, compact tool summaries, preserve exact code/commands/errors, retrieve raw context only when needed.
```

MCP server shape:

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

Keep this repo as shared source. Copy only adapter snippets into each VS Code profile/workspace.

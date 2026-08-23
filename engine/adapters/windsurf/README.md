# Windsurf Adapter

Use workspace rules plus MCP if your Windsurf version supports it.

Workspace rule:

```text
Use token-efficient-agent behavior. Prefer compact command output, narrow file reads, grouped errors, and exact technical identifiers.
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

Check current Windsurf docs for the exact config file path.

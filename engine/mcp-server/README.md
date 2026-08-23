# Token Efficient Agent MCP Server

Dependency-light local MCP server for compacting noisy agent context.

## Tools

- `compress_text`
- `compress_log`
- `compress_diff`
- `compress_file_summary`
- `compress_memory_note`
- `estimate_tokens`
- `lean_ladder`
- `observe_add`
- `observe_search`
- `memory_health`
- `scan_debt_markers`

## Run

```powershell
node <CRISP_HOME>\mcp-server\server.js
```

Most MCP hosts start this command automatically from config.

## Config Shape

```json
{
  "mcpServers": {
    "token-efficient-agent": {
      "command": "node",
      "args": [
        "<CRISP_HOME>/mcp-server/server.js"
      ]
    }
  }
}
```

## Smoke Test

```powershell
node <CRISP_HOME>\mcp-server\smoke-test.js
```

Expected output:

```text
smoke ok
```

## Behavior

The server preserves exact technical anchors:

- commands
- paths
- errors
- API/function/class names
- IDs and dates

It returns compact JSON as MCP text content. If summary is too weak, tools set `raw_needed: true`.

Lean-code tools expose the smallest-code decision ladder and scan local repos for markers like:

```text
lean-debt: <reason>; remove when <condition>
```

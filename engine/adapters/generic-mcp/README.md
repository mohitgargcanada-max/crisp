# Generic MCP Contract

The local MCP server lives at:

`<CRISP_HOME>\mcp-server\server.js`

Use `local-config.example.json` as the base config for MCP-capable hosts.

The server exposes small, deterministic compression tools.

## Tools

### `compress_text`

Input:

```json
{ "text": "...", "mode": "balanced" }
```

Output:

```json
{ "summary": "...", "preserved_exact_anchors": ["..."], "omitted": {} }
```

### `compress_log`

Input:

```json
{ "log": "...", "max_lines": 80 }
```

Output:

```json
{
  "status": "pass|fail|unknown",
  "decisive_lines": ["..."],
  "groups": [{ "kind": "duplicate", "count": 12 }],
  "raw_needed": false
}
```

### `compress_diff`

Input:

```json
{ "diff": "...", "max_hunks": 30 }
```

Output:

```json
{
  "files_changed": ["..."],
  "risk_areas": ["..."],
  "key_hunks": ["..."],
  "raw_needed": false
}
```

### `compress_file_summary`

Input:

```json
{ "path": "src/app.js", "content": "..." }
```

### `compress_memory_note`

Input:

```json
{ "text": "..." }
```

### `estimate_tokens`

Input:

```json
{ "before": "...", "after": "..." }
```

## Safety

Never discard exact strings matching:

- Commands and flags.
- Paths and filenames.
- Error messages.
- Function/class/API names.
- IDs, dates, tickers, and quoted user requirements.

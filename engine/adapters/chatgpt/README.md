# ChatGPT Adapter

Plain ChatGPT web chat cannot auto-start local tools.

Supported practical paths:

1. Custom GPT instructions.
2. ChatGPT Action backed by a hosted API.
3. ChatGPT App/MCP server if available in your workspace.

## Custom GPT Instructions

```text
Use token-efficient-agent behavior:
- Verdict first, evidence second, next action last.
- Keep replies compact.
- Preserve exact code, commands, paths, errors, API names, IDs, dates, and quoted requirements.
- Compress logs/diffs/files by grouping repeated noise and keeping decisive lines.
- Ask for raw detail only when compressed context is insufficient.
```

## Action/API Shape

Expose HTTPS endpoints:

- `POST /compress_text`
- `POST /compress_log`
- `POST /compress_diff`
- `POST /compress_memory_note`
- `POST /estimate_tokens`

Use auth before sending private files/logs.

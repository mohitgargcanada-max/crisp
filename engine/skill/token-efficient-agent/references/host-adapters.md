# Host Adapters

Use this reference only when adapting the skill to a specific host.

## Coding CLI Or IDE Terminal

Use shell aliases, functions, or hooks to route noisy commands through compact wrappers:

- `status`
- `diff`
- `log`
- `test`
- `lint`
- `search`
- `read`

Keep raw fallback commands available.

## Desktop Chat With Local Tools

Use local MCP config to expose compression tools.

Expected tools:

- `compress_text`
- `compress_log`
- `compress_diff`
- `compress_file_summary`
- `compress_memory_note`
- `token_savings_estimate`

## Web Chat

Plain web chat cannot silently run local tools. Use a hosted action or MCP server if automatic tool use is required.

Without hosted tools, paste this instruction:

```text
Use compact agent behavior: verdict first, compact evidence, no filler, preserve exact commands/errors/code symbols, fetch raw details only when needed.
```

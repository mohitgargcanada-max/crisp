# OpenClaw Adapter

Purpose: use token-efficient-agent behavior in OpenClaw-style autonomous/gateway workflows.

OpenClaw runs more like an autonomous assistant/gateway than a normal coding CLI, so prefer instruction, MCP, or API integration over shell-only hooks.

## Manual / Skill Prompt

```text
Use token-efficient-agent behavior for all agent work:
- Verdict first, compact evidence, next action last.
- Search before reading large context.
- Summarize logs, diffs, tool results, and long messages.
- Preserve exact commands, paths, errors, code symbols, IDs, dates, and quoted user requirements.
- Fetch raw detail only when compressed context is insufficient.
```

## Gateway Tool Shape

Expose token-efficient-agent as local tools or gateway actions:

- `compress_text`
- `compress_log`
- `compress_diff`
- `compress_file_summary`
- `compress_memory_note`
- `estimate_tokens`

Use the shared contract in `adapters/generic-mcp`.

## MCP Shape

If your OpenClaw install supports MCP-style external tools, use:

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

Check your local OpenClaw config for exact file path and server format.

## Safety Rules

Because autonomous agents may have broad file, browser, shell, email, or messaging access:

- Keep compression local for private data.
- Do not auto-install untrusted external skills.
- Review any skill that asks to run shell, download scripts, read credentials, access browser data, or handle wallets/secrets.
- Keep raw-output fallback available for security review.
- Never compress away approval prompts, destructive-action warnings, auth scopes, or permission changes.

## Best Use Cases

- Compress long inbound messages before task planning.
- Summarize tool results before next autonomous step.
- Reduce memory notes after task completion.
- Compact run logs for audit trails.
- Keep exact final actions and approvals visible.

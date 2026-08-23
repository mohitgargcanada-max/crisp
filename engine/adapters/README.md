# Adapters

This folder keeps host-specific glue separate from the vendor-neutral core skill.

Use pattern:

1. Install or copy `skill/token-efficient-agent`.
2. Add host adapter config.
3. Restart host app.
4. Test with: `Use token-efficient-agent for this task.`

## Adapter Matrix

| Host | Best Integration | Auto-Start |
|---|---|---:|
| Terminal | profile aliases/functions | yes |
| Claude Code | plugin, skill, hooks, MCP | yes |
| Claude Desktop | MCP config + prompt | yes |
| Codex | skill/plugin/MCP | yes |
| ChatGPT | Custom GPT, Action, hosted MCP/App | partial |
| Cursor | MCP config + project rules | usually |
| Windsurf | MCP config + project rules | usually |
| Cline/Roo | VS Code MCP settings + project rules | usually |
| Gemini CLI | project instructions + shell wrappers | partial |
| Hermes | plugin command rewriting + MCP | usually |
| OpenClaw | gateway skill/instruction + MCP/API | partial |
| Any API client | gateway/proxy or middleware | yes |

Plain web chat cannot launch local executables silently. Use Custom GPT instructions, Actions, or hosted MCP/API for web usage.

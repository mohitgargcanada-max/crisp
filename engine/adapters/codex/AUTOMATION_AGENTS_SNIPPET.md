## Token Efficient Automation

Use the `token-efficient-agent` MCP server by default when available.

At task start:
- Call `observe_search` or `memory_health` only when prior context is likely useful.
- Keep recalled memory small: 3-5 facts max.

During shell-heavy tasks:
- Prefer `tea run --label "<task>" -- <command>` for commands where token metrics and compact observations are useful.
- For normal tool calls, summarize long output compactly and preserve exact paths, commands, errors, IDs, dates, and code names.

At task end:
- Call `observe_add` with a compact non-secret summary of durable facts, decisions, commands that worked, and unresolved blockers.
- Do not save secrets, raw private documents, API keys, passwords, tokens, or sensitive personal information.
- Use `memory_health` if memory seems large or stale.
- For non-trivial tool/code tasks, include a visible compact receipt in the final reply:
  `Token receipt: stats <events>, saved <tokens_saved_est> est (<saved_percent_est>%); rollover <turns>/<threshold>, tokens <tokens>/<token_threshold>.`
- Build the receipt from `node <CRISP_HOME>\cli\tea.js receipt`; omit it for tiny Q&A where running extra commands would waste more tokens than it saves.
- Codex notify can track session rollover when configured through `adapters\codex\notify-multiplexer.ps1`.
- If a session is getting long, check `session-rollover status`; suggest a new chat when the turn threshold or optional token threshold is reached.
- Rollover must stay in the same Codex project/workspace and same cwd/repo unless the user explicitly asks to move.

Session rollover:
- Default turn target: `TEA_ROLLOVER_TURNS`, default `12`.
- Optional estimated token target: `TEA_ROLLOVER_TOKENS`, default `0` disabled.
- Handoffs are saved under `memory-vault\session-handoffs`.
- Handoff prompts include the project label and cwd so the next chat can resume in the same project.

Memory cleanup:
- Never delete memory automatically.
- Use `memory-refresh plan --days 365` first.
- Delete only after explicit user approval with `memory-refresh prune --days 365 --confirm`.

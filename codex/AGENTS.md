# AGENTS.md — CRISP Pipeline for OpenAI Codex

This file configures the CRISP token compression + memory pipeline for Codex CLI.
Codex reads AGENTS.md at startup. All rules here are always active.

Note: Codex has no `.codex/hooks/*.js` mechanism (there's no such thing as a global
Codex hook directory) — Codex automation runs through an MCP server, `tea.js` CLI
calls, and the `notify` command in `config.toml`. See "Wiring" below for the real
setup steps.

## Communication style (Caveman — always on)

Respond terse. Drop: articles, filler words (just/really/basically), pleasantries
(sure/certainly/happy to), hedging. Fragments OK. Short synonyms.

Pattern: [thing] [action] [reason]. [next step].

NOT: "Sure! I'd be happy to help you fix that bug. The issue you're experiencing..."
YES: "Bug in auth. Token expiry check uses < not <=. Fix:"

Drop caveman for: destructive operations, security warnings, multi-step ordered sequences.
Resume after.

## Retrieval behavior (Token-Efficient — always on)

- Search before read. Read slices before whole files.
- If AGENTS.md or a knowledge graph exists, query it before reading source.
- For logs: fatal/error lines only. Group repeats. Drop progress bars.
- For diffs: changed files + key hunks only.
- Response pattern: verdict first, evidence second, next action last.

## Code behavior (Lean — always on)

Before writing any code, check in order:
1. Does this need to exist? If not — skip.
2. Already in codebase? Reuse it.
3. In stdlib? Use that.
4. One obvious line? Keep it one line.
5. Otherwise: smallest working version.

Mark intentional shortcuts: `lean-debt: <reason>; remove when <condition>`

## Graphify first (if graph exists)

If a knowledge graph or index file exists in the project, query it before reading
source files. Only read raw files to edit specific lines.

## Universal rules

1. Diagnostics and fixes are separate tasks. Never auto-fix from diagnostic output.
2. Docs update is part of done. Any behavioral change updates docs in same session.
3. Secrets via env only. Never hardcode API keys, tokens, passwords.
4. Token-efficient always. Root cause in one line. Tables not prose.
5. Session rollover at 10–12 turns. Write compact handoff, suggest fresh session.

<!-- CRISP:AUTOMATION_SNIPPET:START -->
<!-- Content below is copied verbatim from engine/adapters/codex/AUTOMATION_AGENTS_SNIPPET.md
     by install.ps1/install.sh — edit the source file there, not here, so re-installs don't
     silently drop your customizations. -->

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
<!-- CRISP:AUTOMATION_SNIPPET:END -->

## Wiring (what install.ps1/install.sh actually sets up)

1. **MCP server** — registers `token-efficient-agent` in `config.toml`:
   ```toml
   [mcp_servers.token-efficient-agent]
   command = "node"
   args = ["<CRISP_HOME>/mcp-server/server.js"]
   ```
   `config.toml` is never auto-edited (it can hold secrets) — the installer prints
   this block for you to paste in.

2. **Notify wiring** (for session-rollover turn tracking) — points Codex's `notify`
   at `engine/adapters/codex/notify-multiplexer.ps1`, which chains any notify command
   you already had (set via `CRISP_CODEX_EXISTING_NOTIFY`) with
   `notify-token-efficient.ps1`, which forwards the event into the same
   `tea-lifecycle-hook.js` that Claude Code uses — one shared lifecycle engine
   behind both hosts.

3. **This file** — the installer appends the automation snippet above into your
   real `~/.codex/AGENTS.md` (between the `CRISP:AUTOMATION_SNIPPET` markers, so
   re-running the installer updates in place instead of duplicating).

See `<CRISP_HOME>/adapters/codex/README.md` for the full manual-install steps if
you'd rather not use the installer.

# Token Efficient Agent Kit

Plain-English guide: `docs/LAYMAN_GUIDE.md`

Step-by-step block guide: `docs/STEP_BY_STEP_BLOCK_GUIDE.md`

Visual workflow: `docs/automation-infographic.svg`

Product folders:

- `skill/`, `mcp-server/`, `cli/`, `bridge/`, `adapters/`: token-efficient agent kit.
- `memory-vault/`: safe local memory vault home. GitHub includes only the README placeholder; private memory files stay ignored.
- `ai-chat-exporter/`: Chrome extension for exporting AI chats plus prompt compression and local memory bridge buttons.

Default local memory vault: `memory-vault/` inside this repo. Private memory files are ignored by git so they are not pushed accidentally.

Vendor-neutral kit for reducing agent token use across coding sessions, chat workflows, and tool-heavy tasks.

For the plain-English system overview, see [`docs/COMPLETE_GUIDE.md`](docs/COMPLETE_GUIDE.md).

## What This Does

This kit gives an AI agent rules and local tools for:

- Short, precise replies.
- Compact command output.
- Compressed logs, diffs, file reads, and search results.
- Memory/file compression before reuse.
- Lean coding: skip, reuse, stdlib/native APIs, and smallest working code.
- Deletion-first code review and shortcut/debt scans.
- Escalating to raw detail only when exact text matters.

It is built as:

- A standalone skill: `skill/token-efficient-agent/`
- A memory companion skill: `skill/memory-agent/`
- Lean companion skills: `skill/lean-code-agent/`, `skill/lean-code-review/`, `skill/lean-code-audit/`, `skill/lean-code-debt/`
- A Codex-style plugin scaffold: `plugin/token-efficient-agent/`
- A local MCP server: `mcp-server/`
- A local browser bridge: `bridge/`
- A browser exporter extension: `ai-chat-exporter/`
- A local memory vault home: `memory-vault/`

## Folder

Use this folder as the source of truth:

`<CRISP_HOME>`

For GitHub later, make this folder the repo root or copy its contents into a repo named `token-efficient-agent-kit`.

## How It Works

The kit uses six layers:

1. Reply shaping: answer verdict first, then evidence, then next step.
2. Tool-result shaping: summarize noisy outputs and keep exact error lines.
3. Context shaping: prefer targeted reads/searches over dumping whole files.
4. Local MCP compression: expose reusable `compress_*` tools to compatible apps.
5. Lean coding: use the smallest code path before creating new helpers.
6. Recovery path: if compression hides needed detail, fetch raw source only for the missing piece.

The agent should not compress code symbols, commands, paths, API names, function names, error strings, or financial/legal/security facts.

## MCP Server

Local server:

`<CRISP_HOME>\mcp-server\server.js`

Config shape:

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

Available tools:

- `compress_text`
- `compress_log`
- `compress_diff`
- `compress_file_summary`
- `compress_memory_note`
- `estimate_tokens`
- `lean_ladder`
- `scan_debt_markers`
- `observe_add`
- `observe_search`
- `memory_health`
- `cost_report`
- `instincts_add`
- `instincts_recall`
- `cache_prompt_build`
- `cache_prompt_split`
- `wake_status`
- `wake_schedule`

Smoke test:

```powershell
node <CRISP_HOME>\mcp-server\smoke-test.js
```

Expected:

```text
smoke ok
```

## How To Use

Standalone skill:

1. Copy `skill/token-efficient-agent` into your skills folder.
2. Optional: copy `skill/lean-code-*` skills into the same folder.
3. Start a new agent session.
4. Say: `Use $token-efficient-agent for this task.`

Plugin form:

1. Copy `plugin/token-efficient-agent` into a plugin marketplace or local plugin folder.
2. Enable the plugin in the host app.
3. Use prompt: `Use token-efficient-agent to keep this task compact.`

Manual prompt for tools without skills/plugins:

```text
Use token-efficient-agent behavior: verdict first, compact evidence, no filler, preserve exact commands/errors/code symbols, fetch raw details only when needed.
```

Lean-code prompt:

```text
Use lean-code behavior: before writing code, check skip, reuse, stdlib, native platform, installed dependency, one line, then smallest working version. Prefer deletion-first review.
```

Advisory default:

```text
Lean-code suggestions are advisory by default. During normal coding, choose smaller implementation paths silently. Do not delete, rewrite, or shrink existing working code unless I explicitly ask to apply the suggestion.
```

## Host Support

Local coding agents can usually auto-load this through skills, plugins, hooks, or MCP config.

Plain web chat cannot silently start local tools. For web chat, use the manual prompt or build a hosted action/MCP service later.

## Portability Adapters

See `adapters/` for copy-ready starter configs and prompts for popular hosts:

- `terminal/`: PowerShell and Bash profile snippets.
- `claude-code/`: plugin/skill/MCP notes.
- `claude-desktop/`: local MCP config shape.
- `codex/`: Codex skill/plugin notes.
- `windows/`: scheduled wake runner for limit reset handoffs.
- `chatgpt/`: Custom GPT, Actions, and hosted MCP notes.
- `cursor/`: MCP/tooling notes for IDE use.
- `windsurf/`: MCP/tooling notes for IDE use.
- `cline-roo/`: VS Code agent adapter notes.
- `gemini-cli/`: CLI rules and compact shell workflow.
- `hermes/`: Hermes adapter notes for plugin-style command compression and MCP.
- `generic-mcp/`: shared MCP server interface contract.
- `openclaw/`: OpenClaw adapter notes for autonomous-agent/gateway use.

## Pre-Submit Compression

Use these tools when you want to compress a prompt before any LLM sees it.

### 1. Hotkey / Selection Compressor

Select long text in any app, then run:

```powershell
<CRISP_HOME>\hotkeys\compress-selection.ps1
```

Replace selected text directly:

```powershell
<CRISP_HOME>\hotkeys\compress-selection.ps1 -ReplaceSelection
```

Bind that command to PowerToys, AutoHotkey, or a keyboard macro.

### 3. Prompt Pad

Open:

```powershell
start <CRISP_HOME>\prompt-pad\prompt-pad.html
```

Paste/type/dictate the long prompt, click `Compress`, then copy output.

### 4. Browser Extension Integration

Use the AI Chat Exporter integration for browser prompt boxes:

```text
<CRISP_HOME>\integrations\ai-chat-exporter
```

It adds a visible `Compress` button inside chat pages. It previews by replacing the draft text only; it does not silently auto-submit.

### CLI

```powershell
node <CRISP_HOME>\cli\tea.js compress C:\path\prompt.md --out C:\path\prompt.compact.md
node <CRISP_HOME>\cli\tea.js clipboard
node <CRISP_HOME>\cli\tea.js after-task C:\path\raw-task.txt C:\path\final-task.txt --label "repo review"
node <CRISP_HOME>\cli\tea.js run --label "tests" -- npm test
```

## Lean Code Commands

Show the decision ladder:

```powershell
node <CRISP_HOME>\cli\tea.js lean
```

Scan a repo for lightweight shortcut markers:

```powershell
node <CRISP_HOME>\cli\tea.js debt C:\path\repo
```

Show compression gain totals plus lean-code next commands:

```powershell
node <CRISP_HOME>\cli\tea.js gain
```

Use these phrases in Codex/Claude-style hosts:

- `Use lean-code-agent for this coding task.`
- `/lean-review`: deletion-first review.
- `/lean-audit`: repo simplification audit.
- `/lean-debt`: scan or maintain shortcut markers.
- `apply lean fixes`: apply approved suggestions.

## AI Chat Exporter

The full browser extension is included here:

```text
<CRISP_HOME>\ai-chat-exporter
```

Install locally:

1. Open Chrome at `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select `<CRISP_HOME>\ai-chat-exporter`.
5. Refresh ChatGPT, Claude, or your local AI chat page.

It can export chats and, when the local bridge is running, use token compression plus memory recall/save buttons. It does not auto-submit prompts.

## Memory Map And Vault Commands

Initialize a local markdown vault. By default this uses the in-product vault folder:

```text
<CRISP_HOME>\memory-vault
```

```powershell
node <CRISP_HOME>\cli\tea.js vault init
```

Create or connect a private GitHub memory-vault repo:

```powershell
node <CRISP_HOME>\cli\tea.js vault github-init --repo token-efficient-agent-memory-vault
```

Sync memory changes:

```powershell
node <CRISP_HOME>\cli\tea.js vault sync --message "Update memory vault"
```

Check vault git status:

```powershell
node <CRISP_HOME>\cli\tea.js vault status
```

Show the compressed memory map:

```powershell
node <CRISP_HOME>\cli\tea.js memory-map show
```

Recall relevant memory from markdown files:

```powershell
node <CRISP_HOME>\cli\tea.js memory-map recall token-agent-kit
```

Add a durable memory:

```powershell
node <CRISP_HOME>\cli\tea.js memory-map add "decision: lean-code suggestions are advisory"
```

Write a compact copy:

```powershell
node <CRISP_HOME>\cli\tea.js memory-map compress
```

Start the local bridge for AI Chat Exporter / web chat memory:

```powershell
node <CRISP_HOME>\cli\tea.js bridge start
```

Set a custom vault path with `TEA_MEMORY_DIR` or pass a path:

```powershell
$env:TEA_MEMORY_DIR='<CRISP_HOME>\memory-vault'
node <CRISP_HOME>\cli\tea.js vault init
```

Private GitHub sync is optional but now supported. Keep secrets out of the vault.

Record searchable observations:

```powershell
node <CRISP_HOME>\cli\tea.js observe add "pytest failed on auth route" --type error --project my-repo
node <CRISP_HOME>\cli\tea.js observe search "auth route"
node <CRISP_HOME>\cli\tea.js observe get obs_...
node <CRISP_HOME>\cli\tea.js observe timeline obs_...
```

Observations are stored as local JSONL in:

```text
<CRISP_HOME>\memory-vault\observations.jsonl
```

Use observations for cheap lifecycle capture. Use Graphify/knowledge graphs for repo architecture and cross-file relationships, not for every command log by default.



## Token Savings Metrics

The CLI records local estimated savings in `.tea-stats/token-savings.jsonl`.

View totals:

```powershell
node <CRISP_HOME>\cli\tea.js stats
```

Show the compact receipt line, including saved percentage:

```powershell
node <CRISP_HOME>\cli\tea.js receipt
```

JSON output:

```powershell
node <CRISP_HOME>\cli\tea.js stats --json
```

Reset local stats:

```powershell
node <CRISP_HOME>\cli\tea.js stats-reset
```

Browser compression also shows per-compression saved tokens and lifetime page-local totals in a toast after pressing `Compress`.

Token counts are estimates using a lightweight local heuristic, not provider billing numbers.

## Automatic Task Metrics

The kit cannot reduce or measure every Codex/Claude task automatically unless the host invokes it through a hook, wrapper, MCP tool, browser extension, or prompt workflow.

Use `run` when you control the command execution:

```powershell
node <CRISP_HOME>\cli\tea.js run --label "pytest" -- python -m pytest
```

It runs the command, prints the command output, then prints estimated token savings for the captured output. It records only metrics, label, executable, and exit code; it does not store raw stdout/stderr.

It also writes a compact observation with command, cwd, exit code, and token estimates to `observations.jsonl`.

Use `after-task` when a host/hook already wrote raw and compact/final task files:

```powershell
node <CRISP_HOME>\cli\tea.js after-task <raw-task-file> <compact-or-final-file> --label "<task name>"
```

Both commands print estimated before/after/saved tokens and append an event to:

```text
<CRISP_HOME>\.tea-stats\token-savings.jsonl
```

Current automatic surface:

- `tea run -- <command>` shows savings automatically after wrapped terminal tasks.
- CLI/browser compression records savings automatically when invoked.
- `tea stats` and `tea gain` show accumulated savings.
- Host-level automation still requires adapter wiring for Codex, Claude Code, Gemini CLI, etc.

## Host Automation

Claude Code hooks:

```powershell
<CRISP_HOME>\adapters\claude-code\install-hooks.ps1
```

Codex automation guidance:

```text
<CRISP_HOME>\adapters\codex\AUTOMATION_AGENTS_SNIPPET.md
```

Codex notify multiplexer for automatic turn-count rollover:

```powershell
<CRISP_HOME>\adapters\codex\notify-multiplexer.ps1
```

Memory tracker:

```powershell
node <CRISP_HOME>\cli\tea.js memory-health
node <CRISP_HOME>\cli\tea.js memory-refresh plan --days 365
node <CRISP_HOME>\cli\tea.js session-rollover status
node <CRISP_HOME>\cli\tea.js cost report
node <CRISP_HOME>\cli\tea.js instincts list --project token-kit
node <CRISP_HOME>\cli\tea.js cache-prompt build stable.md task.md --out prompt.cache.md --key token-kit
```

Delete old observations only after reviewing the plan:

```powershell
node <CRISP_HOME>\cli\tea.js memory-refresh prune --days 365 --confirm
```

More detail:

```text
<CRISP_HOME>\docs\HOST_AUTOMATION.md
```

## Session Rollover

Claude Code hooks suggest a project label at session start and track user turns plus estimated prompt tokens. After about 12 user prompts, or after an optional token threshold, the hook writes a compact handoff to:

```text
<CRISP_HOME>\memory-vault\session-handoffs
```

It asks whether to continue in a fresh chat from that handoff. It does not auto-submit, stop tools, or abandon the current task; rollover should be suggested after the current request reaches a natural stopping point and should stay in the same project/workspace and cwd/repo unless the user asks to move.

Manual handoff for IDE terminals:

```powershell
node <CRISP_HOME>\cli\tea.js session-rollover handoff --project token-kit --reason manual
```

Optional threshold:

```powershell
$env:TEA_ROLLOVER_TURNS='10'
$env:TEA_ROLLOVER_TOKENS='6000'
```

## Limit Reset Wake

Claude Code hooks can detect common usage-limit messages when the host emits them through `Notification`, `StopFailure`, or related lifecycle events. If the message includes a reset time, the hook saves a compact handoff and writes a wake plan to:

```text
<CRISP_HOME>\memory-vault\wake-plans
```

Install the Windows watcher once:

```powershell
<CRISP_HOME>\adapters\windows\install-wake-task.ps1
```

The watcher runs every minute. When a wake plan is due, it copies the resume prompt to the clipboard and writes it under:

```text
<CRISP_HOME>\memory-vault\wake-due
```

Manual checks:

```powershell
node <CRISP_HOME>\cli\tea.js wake status
node <CRISP_HOME>\cli\tea.js wake schedule --at "5:30 PM" --project token-kit --reason limit-reset
node <CRISP_HOME>\cli\tea.js wake run-due
```

Plain truth: this wakes the local workflow with the handoff ready. It does not auto-submit messages into Claude.

## Hook Runtime Controls

The lifecycle hook can run in three profiles:

```powershell
$env:TEA_HOOK_PROFILE='minimal'
$env:TEA_HOOK_PROFILE='standard'
$env:TEA_HOOK_PROFILE='strict'
```

- `minimal`: session start, user prompts, task/session end, and compaction events.
- `standard`: common lifecycle, tool, rollover, and receipt events.
- `strict`: every installed event.

Temporarily disable specific events:

```powershell
$env:TEA_DISABLED_HOOKS='PreToolUse,claude-code:Notification'
```

Context-pressure suggestions are automatic when the hook payload includes a transcript path. The hook reads token usage from the transcript, stores only compact counters, and suggests a handoff at the next natural boundary. Tune it with:

```powershell
$env:TEA_CONTEXT_THRESHOLD='160000'
$env:TEA_CONTEXT_INTERVAL='60000'
```

## Cost And Usage Metrics

End-of-task hooks write token usage snapshots to:

```text
<CRISP_HOME>\memory-vault\metrics\costs.jsonl
```

Report totals:

```powershell
node <CRISP_HOME>\cli\tea.js cost report
```

This reports input, output, cache-write, and cache-read tokens. Dollar cost is shown only when the host provides a cost value; the kit does not fake billing numbers from stale pricing.

## Project-Scoped Learned Patterns

Learned patterns are tiny memory rules with confidence scores. Project patterns stay under the project folder; global patterns apply everywhere.

Manual add:

```powershell
node <CRISP_HOME>\cli\tea.js instincts add "Prefer narrow rg search before large file reads" --project token-kit --confidence 0.8
```

Recall:

```powershell
node <CRISP_HOME>\cli\tea.js instincts recall "large file reads" --project token-kit
```

Automatic behavior:

- `SessionStart` and `UserPromptSubmit` can inject a capped list of relevant learned patterns.
- Explicit user wording such as `always`, `never`, `remember`, `prefer`, or `for this project` can become a local learned pattern.
- Secret-looking text is refused.

Tune injection:

```powershell
$env:TEA_INSTINCT_CONFIDENCE='0.7'
$env:TEA_MAX_INJECTED_INSTINCTS='6'
```

## Cache-Aware Prompt Layout

Cloud prompt caching works best when the repeated part of the prompt stays first and stays unchanged. This kit cannot force a cloud cache hit from Codex or Claude Code, but it can prepare prompts so the host has the best chance to reuse cached context.

Build a cache-friendly prompt:

```powershell
node <CRISP_HOME>\cli\tea.js cache-prompt build stable.md task.md --out prompt.cache.md --key token-kit
```

Split an existing prompt into stable and dynamic files:

```powershell
node <CRISP_HOME>\cli\tea.js cache-prompt split prompt.md --out-dir prompt-cache
```

Put these in the stable prefix:

- durable project rules
- memory handoff summary
- repo map or architecture summary
- stable tool instructions

Put these in the dynamic tail:

- current user request
- latest error/log snippet
- files changed in this turn
- timestamps, receipts, and fresh run IDs

Cache usage appears in receipts when the host transcript exposes it:

```text
Token receipt: stats <events>, saved <saved> est (<pct>%); cache read/write/cached <read>/<write>/<cached>; rollover <turns>/<threshold>, tokens <tokens>/<token_threshold>.
```

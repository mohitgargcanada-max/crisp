# Step-By-Step Block Guide

This guide explains each block in the Token Efficient Agent Kit, what is automatic, what you must run manually, and what each command does.

Repo root:

```text
<CRISP_HOME>
```

Main command shape:

```powershell
node <CRISP_HOME>\cli\tea.js <command>
```

## 1. Token Engine

Analogy: a smart editor that shortens noisy text but keeps the important names, paths, commands, and errors.

Automatic:

- In Codex/Claude only when the host uses the skill, MCP server, hook, wrapper, or your instruction says to use token-efficient behavior.
- In the browser only when you click the AI Chat Exporter compression button.

Manual commands:

```powershell
node <CRISP_HOME>\cli\tea.js compress C:\path\big-prompt.md --out C:\path\big-prompt.compact.md
```

What it does: reads a long file, creates a shorter version, and prints estimated before/after/saved tokens.

```powershell
node <CRISP_HOME>\cli\tea.js clipboard
```

What it does: compresses the current clipboard text and puts the compact version back on the clipboard.

```powershell
node <CRISP_HOME>\cli\tea.js estimate C:\path\before.txt C:\path\after.txt
```

What it does: compares two files and estimates token savings.

## 2. Terminal Task Wrapper

Analogy: a receipt printer for command work.

Automatic:

- Not automatic for every terminal command.
- It works automatically only for commands you run through `tea run`.

Manual command:

```powershell
node <CRISP_HOME>\cli\tea.js run --label "tests" -- npm test
```

What it does:

- Runs `npm test`.
- Prints normal command output.
- Prints estimated token metrics.
- Saves a compact observation with command, cwd, exit code, and token estimates.
- Appends token savings to `.tea-stats\token-savings.jsonl`.

Use it when: you want a normal command plus an automatic token-savings receipt.

## 3. Token Savings Dashboard

Analogy: a fuel mileage counter for token savings.

Automatic:

- Updated by `compress`, `clipboard`, `after-task`, `run`, and memory-map compression.
- Not updated by random commands that bypass the kit.

Manual commands:

```powershell
node <CRISP_HOME>\cli\tea.js stats
```

Single-line receipt:

```powershell
node <CRISP_HOME>\cli\tea.js receipt
```

What it does: shows total estimated token savings and recent events.

```powershell
node <CRISP_HOME>\cli\tea.js gain
```

What it does: shows savings totals plus suggested lean-code commands.

```powershell
node <CRISP_HOME>\cli\tea.js stats-reset
```

What it does: resets local token stats. Use only when you intentionally want a fresh counter.

## 4. Memory Vault

Analogy: the product notebook and filing cabinet.

Default path:

```text
<CRISP_HOME>\memory-vault
```

Automatic:

- Claude hooks and `tea run` can write compact observations automatically.
- Codex can write memory through MCP tools when the agent invokes them.
- Private memory files are ignored by the main GitHub repo.

Manual commands:

```powershell
node <CRISP_HOME>\cli\tea.js vault init
```

What it does: creates the local memory vault structure from templates.

```powershell
node <CRISP_HOME>\cli\tea.js vault status
```

What it does: shows git status for the memory vault if it has private sync enabled.

```powershell
node <CRISP_HOME>\cli\tea.js vault github-init --repo token-efficient-agent-memory-vault
```

What it does: creates or connects a private GitHub repo for memory-vault sync.

```powershell
node <CRISP_HOME>\cli\tea.js vault sync --message "Update memory vault"
```

What it does: commits and pushes memory-vault changes to the private memory repo if configured.

## 5. Memory Map

Analogy: the index page of the notebook.

Automatic:

- Not fully automatic.
- You add durable memory intentionally.
- Recall is run when you or an agent asks for it.

Manual commands:

```powershell
node <CRISP_HOME>\cli\tea.js memory-map show
```

What it does: prints the current compact memory map.

```powershell
node <CRISP_HOME>\cli\tea.js memory-map add "decision: keep memory private by default"
```

What it does: appends a durable note to the memory map.

```powershell
node <CRISP_HOME>\cli\tea.js memory-map recall token-agent-kit
```

What it does: searches markdown memory files and returns the most relevant small snippets.

```powershell
node <CRISP_HOME>\cli\tea.js memory-map compress
```

What it does: writes a compact version of the memory map and records estimated token savings.

## 6. Observations

Analogy: short sticky notes from tasks.

Stored here:

```text
<CRISP_HOME>\memory-vault\observations.jsonl
```

Automatic:

- `tea run` writes observations.
- Claude hooks write observations.
- Codex MCP can write observations when invoked by the agent.

Manual commands:

```powershell
node <CRISP_HOME>\cli\tea.js observe add "pytest failed on auth route" --type error --project my-repo
```

What it does: saves one searchable compact observation.

```powershell
node <CRISP_HOME>\cli\tea.js observe search "auth route"
```

What it does: searches observations for matching notes.

```powershell
node <CRISP_HOME>\cli\tea.js observe get obs_...
```

What it does: prints one observation by ID.

```powershell
node <CRISP_HOME>\cli\tea.js observe timeline obs_...
```

What it does: prints nearby observations around one observation ID.

## 7. Claude Code Hooks

Analogy: a meeting assistant inside Claude Code.

Automatic:

- Yes, after hooks are installed in Claude Code settings.
- Captures lifecycle moments like session start, prompt submit, tool use, failures, compaction, task completion, and session end.

Install command:

```powershell
<CRISP_HOME>\adapters\claude-code\install-hooks.ps1
```

What it does:

- Installs/updates Claude Code hook settings so Claude can call the generic lifecycle hook.
- Copies visible agent definitions to `%USERPROFILE%\.claude\agents`.

Visible agents after install:

```text
%USERPROFILE%\.claude\agents\token-efficient-agent.md
%USERPROFILE%\.claude\agents\memory-agent.md
```

Hook target:

```powershell
node <CRISP_HOME>\adapters\generic-hooks\tea-lifecycle-hook.js --host claude-code --event <event>
```

What it does: writes compact lifecycle observations and token estimates.

Check result:

```powershell
node <CRISP_HOME>\cli\tea.js observe search "claude-code"
```

Hook profile:

```powershell
$env:TEA_HOOK_PROFILE='minimal'
$env:TEA_HOOK_PROFILE='standard'
$env:TEA_HOOK_PROFILE='strict'
```

What it does: chooses how much background automation runs. `minimal` is quiet, `standard` is normal, and `strict` observes every installed hook event.

Disable noisy events:

```powershell
$env:TEA_DISABLED_HOOKS='PreToolUse,claude-code:Notification'
```

What it does: turns off selected hook events without editing settings files.

## 8. Codex MCP Tools

Analogy: Codex gets a small toolbelt for compression and memory.

Automatic:

- Partly.
- Codex can auto-follow the `AGENTS.md` behavior and use MCP tools, but it is not a low-level event hook for every internal action.

MCP server path:

```text
<CRISP_HOME>\mcp-server\server.js
```

Smoke test:

```powershell
node <CRISP_HOME>\mcp-server\smoke-test.js
```

What it does: confirms the MCP server tools load correctly.

Instruction snippet:

```text
<CRISP_HOME>\adapters\codex\AUTOMATION_AGENTS_SNIPPET.md
```

What it does: tells Codex to use token-efficient behavior, memory search, and compact observations.

Notify wrapper:

```powershell
<CRISP_HOME>\adapters\codex\notify-token-efficient.ps1
```

What it does: helper path for lifecycle-style notifications if Codex notify integration is wired.

Notify multiplexer:

```powershell
<CRISP_HOME>\adapters\codex\notify-multiplexer.ps1
```

What it does: preserves the existing Codex notifier and also sends Codex `turn-ended` events into the token kit as `UserPromptSubmit`, so session rollover can track Codex turns.

Visible final receipt:

```text
Token receipt: stats <events>, saved <tokens_saved_est> est (<saved_percent_est>%); rollover <turns>/<threshold>, tokens <tokens>/<token_threshold>.
```

What it does: makes background stats visible in Codex replies. Codex should use it for non-trivial tool/code tasks, but skip it for tiny Q&A where extra commands would waste tokens.

## 9. Usage And Cost Report

Analogy: an odometer for actual host token usage.

Automatic:

- Claude Code hooks write usage snapshots when the host provides transcript usage.
- Dollar cost is shown only when the host provides cost data.
- The kit does not invent billing numbers.

Manual command:

```powershell
node <CRISP_HOME>\cli\tea.js cost report
```

What it does: shows usage rows, sessions, input tokens, output tokens, cache-write tokens, cache-read tokens, and host-provided cost when available.

Stored here:

```text
<CRISP_HOME>\memory-vault\metrics\costs.jsonl
```

## 10. Cache-Aware Prompts

Analogy: putting the reusable textbook pages before today's worksheet.

Automatic:

- Cloud cache hits happen only inside the host/provider.
- The kit can shape prompts for better cache reuse.
- Receipts show cache read/write/cached counters when the host transcript exposes them.

Manual build:

```powershell
node <CRISP_HOME>\cli\tea.js cache-prompt build stable.md task.md --out prompt.cache.md --key token-kit
```

What it does: creates one prompt with stable context first and the current task last.

Manual split:

```powershell
node <CRISP_HOME>\cli\tea.js cache-prompt split prompt.md --out-dir prompt-cache
```

What it does: writes `stable-prefix.md` and `dynamic-tail.md`.

Stable prefix examples:

- project rules
- memory handoff
- repo map
- stable tool instructions

Dynamic tail examples:

- current request
- latest error/log snippet
- fresh file snippets
- timestamps, token receipts, run IDs

Visible receipt field:

```text
cache read/write/cached <cache_read_tokens>/<cache_write_tokens>/<cached_tokens>
```

## 11. Learned Patterns

Analogy: small sticky-note rules the assistant can remember per project.

Automatic:

- Hooks can inject a capped list of high-confidence learned patterns at session start or user prompt time.
- If you explicitly say `always`, `never`, `remember`, `prefer`, or `for this project`, hooks can save that as a local learned pattern.
- Secret-looking text is refused.

Manual add:

```powershell
node <CRISP_HOME>\cli\tea.js instincts add "Prefer narrow rg search before large file reads" --project token-kit --confidence 0.8
```

What it does: saves a project-scoped learned pattern.

Manual recall:

```powershell
node <CRISP_HOME>\cli\tea.js instincts recall "large file reads" --project token-kit
```

What it does: returns matching learned patterns for that project plus global patterns.

Manual list:

```powershell
node <CRISP_HOME>\cli\tea.js instincts list --project token-kit
```

What it does: lists learned patterns available to a project.

Tune injection:

```powershell
$env:TEA_INSTINCT_CONFIDENCE='0.7'
$env:TEA_MAX_INJECTED_INSTINCTS='6'
```

## 12. AI Chat Exporter

Analogy: a browser-side scanner and export button.

Folder:

```text
<CRISP_HOME>\ai-chat-exporter
```

Automatic:

- Export is manual: you click the exporter.
- Prompt compression is manual: you click `Compress Draft`.
- Memory recall/save needs the local bridge running.
- It never auto-submits your prompt.

Install steps:

1. Open Chrome:

```text
chrome://extensions
```

2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select:

```text
<CRISP_HOME>\ai-chat-exporter
```

5. Refresh ChatGPT, Claude, or your local AI chat page.

What it does:

- Exports conversations to PDF, Word-compatible DOC, HTML, and Markdown.
- Adds browser-side `Compress Draft`.
- Can use local memory buttons when the bridge is running.

## 13. Local Bridge / Context Gateway

Analogy: a local librarian between browser chat and your files/memory.

Automatic:

- Not automatic.
- You start it when you want browser memory recall, save-memory buttons, or local context packs.

Start command:

```powershell
node <CRISP_HOME>\cli\tea.js bridge start
```

What it does:

- Starts the local bridge on `http://127.0.0.1:6768`.
- Gives AI Chat Exporter local compression and memory access.
- Serves the browser context gateway.

Open:

```text
http://127.0.0.1:6768/
```

Use it to build a compact context pack from repo files before pasting into an AI chat.

## 14. Prompt Pad

Analogy: a small local writing desk for prompts.

Automatic:

- Not automatic.
- You open it and click `Compress`.

Open command:

```powershell
start <CRISP_HOME>\prompt-pad\prompt-pad.html
```

What it does: lets you paste or type a long prompt, compress it locally, and copy the result.

## 15. Hotkey / Selection Compressor

Analogy: a keyboard shortcut for shortening selected text.

Automatic:

- Not automatic until you bind it to PowerToys, AutoHotkey, or another hotkey tool.

Manual command:

```powershell
<CRISP_HOME>\hotkeys\compress-selection.ps1
```

What it does: compresses selected text through the local script.

Replace selected text:

```powershell
<CRISP_HOME>\hotkeys\compress-selection.ps1 -ReplaceSelection
```

What it does: replaces the selected text with the compact version.

## 16. Lean Code Agent

Analogy: a builder who checks if a smaller tool already exists before making a new one.

Automatic:

- Advisory when the skill/instructions are loaded.
- It does not delete or rewrite working code unless you explicitly ask.

Manual commands:

```powershell
node <CRISP_HOME>\cli\tea.js lean
```

What it does: prints the lean-code decision ladder.

```powershell
node <CRISP_HOME>\cli\tea.js debt C:\path\repo
```

What it does: scans for `lean-debt:` and shortcut markers.

## 17. Memory Health And Refresh

Analogy: memory storage health check and spring cleaning.

Automatic:

- Health checks are manual.
- Deletion is never automatic.

Check memory size:

```powershell
node <CRISP_HOME>\cli\tea.js memory-health
```

What it does: shows vault path, observation count, size, oldest/newest timestamps, and old-memory count.

Preview cleanup:

```powershell
node <CRISP_HOME>\cli\tea.js memory-refresh plan --days 365
```

What it does: previews observations older than 365 days. It does not delete anything.

Delete after approval:

```powershell
node <CRISP_HOME>\cli\tea.js memory-refresh prune --days 365 --confirm
```

What it does: creates a backup, then deletes old observations.

## 18. Graphify

Analogy: a city map of a codebase.

Automatic:

- Not automatic in this kit by default.
- Use it when you need architecture, relationships, and paths between files/concepts.

Use it for:

- "Which files connect the MCP server to memory?"
- "What modules are related to AI Chat Exporter?"
- "Show the codebase architecture."

Do not use it for every small command log. Observations are cheaper for that.

## 19. Session Rollover

Analogy: a handoff note before a long meeting moves to the next room.

Automatic:

- Claude Code: yes, through `SessionStart` and `UserPromptSubmit` hooks.
- Codex: automatic for turn count when `notify-multiplexer.ps1` is configured; token threshold works when prompt/message text is provided.
- Browser/IDE terminals: manual unless the host calls the hook.
- It does not auto-submit, stop tools, close the chat, abandon the task, start a new chat without you, or move to a different project unless you ask.

What happens automatically in Claude Code:

- At session start, Claude gets a reminder to confirm or ask for a project label.
- Each user prompt increments a local session turn counter.
- Around 12 user turns, or after the optional estimated-token threshold, the hook writes a compact handoff file.
- Claude keeps the current task running and suggests starting the next chat from that handoff only at a natural stopping point in the same project/workspace.

Default folders:

```text
<CRISP_HOME>\memory-vault\session-state
<CRISP_HOME>\memory-vault\session-handoffs
```

Manual status:

```powershell
node <CRISP_HOME>\cli\tea.js session-rollover status
```

What it does: shows tracked sessions, project label, turn count, threshold, and latest handoff.

Manual handoff:

```powershell
node <CRISP_HOME>\cli\tea.js session-rollover handoff --project token-kit --reason manual
```

What it does: creates a compact next-chat handoff in the memory vault with the project label and cwd/repo needed to resume in the same project.

Set threshold for the current shell:

```powershell
$env:TEA_ROLLOVER_TURNS='10'
```

What it does: tells hooks to suggest rollover after 10 user prompts instead of the default 12.

Set token threshold for the current shell:

```powershell
$env:TEA_ROLLOVER_TOKENS='6000'
```

What it does: tells hooks to suggest rollover once captured user prompts reach about 6000 estimated tokens, even if turn count is still low.

## 20. Limit Reset Wake

Analogy: an alarm clock that opens to the right handoff note.

Automatic:

- Claude Code: yes after hooks and the Windows wake task are installed.
- Codex/other terminals: only when their workflow calls the lifecycle hook or `tea wake schedule`.
- It does not auto-submit into Claude, force-open a project, close the old chat, or abandon running work.

Install the watcher once:

```powershell
<CRISP_HOME>\adapters\windows\install-wake-task.ps1
```

What it does: creates a Windows Scheduled Task named `TokenEfficientAgentWake` that checks due wake plans every minute.

What happens automatically in Claude Code:

- Claude emits a lifecycle event containing a limit/reset message.
- The hook parses reset times like `resets at 5:30 PM` or `try again in 45 minutes`.
- The hook saves a compact handoff.
- The hook writes a wake plan to `memory-vault\wake-plans`.
- At the reset time, the scheduled task copies the resume prompt to the clipboard and writes it to `memory-vault\wake-due`.

Manual status:

```powershell
node <CRISP_HOME>\cli\tea.js wake status
```

Manual test schedule:

```powershell
node <CRISP_HOME>\cli\tea.js wake schedule --at "5:30 PM" --project token-kit --reason limit-reset
```

Manual due check:

```powershell
node <CRISP_HOME>\cli\tea.js wake run-due
```

Cancel:

```powershell
node <CRISP_HOME>\cli\tea.js wake cancel <id>
```

## First-Time Setup Checklist

Run these once on a new machine:

```powershell
node <CRISP_HOME>\mcp-server\smoke-test.js
node <CRISP_HOME>\cli\tea.js vault init
node <CRISP_HOME>\cli\tea.js memory-health
node <CRISP_HOME>\cli\tea.js session-rollover status
node <CRISP_HOME>\cli\tea.js cost report
```

Then install AI Chat Exporter from:

```text
<CRISP_HOME>\ai-chat-exporter
```

Optional for browser memory:

```powershell
node <CRISP_HOME>\cli\tea.js bridge start
```

Optional for Claude Code automation:

```powershell
<CRISP_HOME>\adapters\claude-code\install-hooks.ps1
```

Optional for Claude Code limit reset wake:

```powershell
<CRISP_HOME>\adapters\windows\install-wake-task.ps1
```

Optional to force Claude Code shell commands through token metrics:

```powershell
<CRISP_HOME>\adapters\claude-code\install-hooks.ps1 -EnforceTeaRun
```

What it does: blocks raw `Bash` tool commands and tells Claude to rerun them through `tea run`.

Optional for private memory sync:

```powershell
node <CRISP_HOME>\cli\tea.js vault github-init --repo token-efficient-agent-memory-vault
```

## What Is Automatic vs Manual

| Block | Automatic? | Manual action |
| --- | --- | --- |
| Token-efficient replies | Yes when skill/instructions are loaded | Say `Use token-efficient-agent` |
| Terminal token metrics | Only through wrapper | `tea run -- <command>` |
| Token stats | Recorded by kit commands | `tea stats` |
| Memory vault creation | No | `tea vault init` |
| Durable memory-map notes | No | `tea memory-map add ...` |
| Observations | Yes via hooks/wrapper/MCP | `tea observe add/search/get` |
| Claude Code hooks | Yes after install | `install-hooks.ps1` |
| Codex MCP | Partly, when configured and invoked | MCP config plus AGENTS snippet |
| Hook profiles | Yes via env vars | `TEA_HOOK_PROFILE`, `TEA_DISABLED_HOOKS` |
| Usage/cost metrics | Yes when transcript usage is available | `tea cost report` |
| Cache-aware prompt layout | Manual; receipts automatic when host exposes fields | `tea cache-prompt build/split` |
| Learned patterns | Yes for explicit preferences; manual otherwise | `tea instincts add/list/recall` |
| AI Chat Exporter | Manual clicks | Load unpacked extension |
| Local bridge | No | `tea bridge start` |
| Memory cleanup | Never deletes automatically | `memory-refresh plan`, then `prune --confirm` |
| Graphify | No | Run when architecture mapping is needed |
| Session rollover | Claude Code yes; Codex yes via notify multiplexer; others manual | `session-rollover status/handoff`; optional `TEA_ROLLOVER_TOKENS` |
| Limit reset wake | Claude Code yes after hooks and Windows task; others manual | `wake status/schedule/run-due/cancel` |

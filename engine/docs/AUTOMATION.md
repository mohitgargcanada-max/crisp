# Token Efficient Automation

## Verdict

Token-efficient-agent is automatic only where a host invokes it. This repo now has two hook points:

- `tea run`: wrap terminal tasks and show savings after the command finishes.
- `tea after-task`: record savings when a host already wrote raw and compact/final task files.
- lifecycle hooks: capture compact host events, rollover state, usage snapshots, and learned patterns when the host provides event payloads.
- limit reset wake: lifecycle hooks schedule a handoff wake when a host reports a reset time.

## Terminal Wrapper

```powershell
node <CRISP_HOME>\cli\tea.js run --label "tests" -- npm test
```

Behavior:

- runs the command
- prints original stdout/stderr
- computes a compact in-memory summary
- records estimated token savings
- writes a compact observation with command, cwd, exit code, and token estimates
- preserves the command exit code

It records only metrics, label, executable, and exit code. It does not store raw stdout/stderr.

## Host Hook

```powershell
node <CRISP_HOME>\cli\tea.js after-task raw-task.txt final-task.txt --label "repo review"
```

Use this from Codex, Claude Code, Gemini CLI, or other host hooks when the host can provide before/after files.

PowerShell hook helper:

```powershell
<CRISP_HOME>\adapters\generic-hooks\after-task-token-savings.ps1 -RawFile raw-task.txt -FinalFile final-task.txt -Label "repo review"
```

Or set environment variables before invoking the hook:

```powershell
$env:TEA_RAW_TASK_FILE="raw-task.txt"
$env:TEA_FINAL_TASK_FILE="final-task.txt"
$env:TEA_TASK_LABEL="repo review"
<CRISP_HOME>\adapters\generic-hooks\after-task-token-savings.ps1
```

## Review Totals

```powershell
node <CRISP_HOME>\cli\tea.js stats
node <CRISP_HOME>\cli\tea.js gain
```

Metrics are estimates, not provider billing numbers.

## Hook Profiles

Use profiles to control how much the lifecycle hook observes:

```powershell
$env:TEA_HOOK_PROFILE='minimal'
$env:TEA_HOOK_PROFILE='standard'
$env:TEA_HOOK_PROFILE='strict'
```

- `minimal`: session start, user prompts, task/session end, and compaction.
- `standard`: common lifecycle and tool events.
- `strict`: every installed event.

Disable individual events without editing hook files:

```powershell
$env:TEA_DISABLED_HOOKS='PreToolUse,claude-code:Notification'
```

## Context Pressure

When a host passes `transcript_path`, the lifecycle hook reads the latest assistant usage from that transcript and stores only compact counters. It can inject a reminder like: prepare a compact handoff at the next natural boundary.

Tune thresholds:

```powershell
$env:TEA_CONTEXT_THRESHOLD='160000'
$env:TEA_CONTEXT_INTERVAL='60000'
```

This is a suggestion layer, not an auto-close layer. It must not stop active work.

## Limit Reset Wake

Claude Code lifecycle hooks can schedule a wake when a limit/reset message includes a reset time.

Install the Windows watcher once:

```powershell
<CRISP_HOME>\adapters\windows\install-wake-task.ps1
```

Commands:

```powershell
node <CRISP_HOME>\cli\tea.js wake status
node <CRISP_HOME>\cli\tea.js wake schedule --at "5:30 PM" --project token-kit --reason limit-reset
node <CRISP_HOME>\cli\tea.js wake run-due
node <CRISP_HOME>\cli\tea.js wake cancel <id>
```

Automatic behavior: hook detects reset text, saves a handoff, writes a wake plan, and the Windows task copies the resume prompt when due. It does not auto-submit into Claude.

## Cost And Usage

End-of-task hooks write usage snapshots to:

```text
<CRISP_HOME>\memory-vault\metrics\costs.jsonl
```

Report:

```powershell
node <CRISP_HOME>\cli\tea.js cost report
```

Dollar cost appears only when the host provides a cost field. Otherwise the report shows token usage only.

Cache read/write/cached counters are included when host transcripts expose cache fields. The final receipt shows:

```text
cache read/write/cached <cache_read_tokens>/<cache_write_tokens>/<cached_tokens>
```

Some hosts expose `cached_tokens` instead of read/write split. The kit stores that in the usage snapshot and receipt.

## Cache-Aware Prompt Layout

Manual prompt builder:

```powershell
node <CRISP_HOME>\cli\tea.js cache-prompt build stable.md task.md --out prompt.cache.md --key my-project
```

Manual splitter:

```powershell
node <CRISP_HOME>\cli\tea.js cache-prompt split prompt.md --out-dir prompt-cache
```

What should be stable:

- project rules
- memory handoff
- repo map
- reusable tool instructions

What should be dynamic:

- current request
- latest errors/logs
- fresh file snippets
- timestamps and receipts

For Codex and Claude Code, this is a layout helper. Actual cloud cache hits are confirmed only by host/provider usage fields.

## Observations

For automatic memory capture, write compact observations instead of raw logs:

```powershell
node <CRISP_HOME>\cli\tea.js observe add "tests failed in auth route" --type error --project my-repo
node <CRISP_HOME>\cli\tea.js observe search "auth route"
node <CRISP_HOME>\cli\tea.js observe timeline obs_...
```

This is the default memory hot path: cheap JSONL, searchable IDs, no raw stdout/stderr storage.

## Learned Patterns

Learned patterns are small project-scoped rules with confidence scores.

```powershell
node <CRISP_HOME>\cli\tea.js instincts add "Prefer narrow rg search before large file reads" --project my-repo --confidence 0.8
node <CRISP_HOME>\cli\tea.js instincts recall "large file reads" --project my-repo
node <CRISP_HOME>\cli\tea.js instincts list --project my-repo
```

Automatic capture is conservative: explicit user preference wording can create a local learned pattern, secret-looking text is refused, and only a capped list of high-confidence patterns is injected.

## Graphify / Knowledge Graphs

Do not graphify every task by default. Use Graphify as the project-map layer:

- run on repos, docs, or stable project folders
- use incremental updates after meaningful file changes
- query the graph for architecture, paths, dependencies, and cross-file relationships

Use observations for task events and Graphify for durable structure. That combination is more token-efficient than forcing every log, command, and memory note into a graph.

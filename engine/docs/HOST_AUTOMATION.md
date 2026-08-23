# Host Automation

## Goal

Make memory and token metrics automatic where the host supports lifecycle hooks.

## Claude Code

Claude Code supports hooks in `settings.json`. Merge the hooks from:

```text
<CRISP_HOME>\adapters\claude-code\settings.hooks.example.json
```

The installer also copies visible Claude Code agent definitions into:

```text
%USERPROFILE%\.claude\agents
```

Those visible agents are:

- `token-efficient-agent`
- `memory-agent`

Recommended events:

- `SessionStart`: session/resume observation
- `InstructionsLoaded`: rules/context load observation
- `UserPromptSubmit`: compact prompt observation
- `UserPromptExpansion`: slash command expansion observation
- `PreToolUse`: compact planned tool observation
- `PermissionDenied`: denied tool observation
- `PostToolUse`: compact tool observation
- `PostToolUseFailure`: failed tool observation
- `PostToolBatch`: parallel tool batch observation
- `Notification`: notification observation
- `SubagentStart` / `SubagentStop`: subagent lifecycle observations
- `TaskCreated` / `TaskCompleted`: task lifecycle observations
- `Stop`: task/session end observation
- `StopFailure`: failed turn observation
- `PreCompact` / `PostCompact`: compaction observations
- `SessionEnd`: session termination observation
- `ConfigChange` / `CwdChanged`: environment change observations

Skipped by default:

- `MessageDisplay`: can fire while assistant text streams, too noisy for memory.
- `FileChanged`: can fire frequently; use Graphify incremental updates or a project-specific hook when needed.

These hooks call:

```powershell
node <CRISP_HOME>\adapters\generic-hooks\tea-lifecycle-hook.js --host claude-code --event <event>
```

They append:

- compact observations to `<CRISP_HOME>\memory-vault\observations.jsonl`
- token savings estimates to `.tea-stats\token-savings.jsonl`
- session rollover state to `memory-vault\session-state`
- compact next-chat handoffs to `memory-vault\session-handoffs`
- usage snapshots to `memory-vault\metrics\costs.jsonl` when transcript usage is available
- project-scoped learned patterns to `memory-vault\projects\<project>\instincts.jsonl`

Plain truth: hooks/MCP are the automatic background layer. The files in `.claude\agents` are the visible named agents/subagents layer.

## Hook Profiles

Set how much automation should run:

```powershell
$env:TEA_HOOK_PROFILE='minimal'
$env:TEA_HOOK_PROFILE='standard'
$env:TEA_HOOK_PROFILE='strict'
```

- `minimal`: session start, user prompt, task/session end, compaction.
- `standard`: common lifecycle and tool events.
- `strict`: every installed event.

Disable exact events temporarily:

```powershell
$env:TEA_DISABLED_HOOKS='PreToolUse,claude-code:Notification'
```

Context-pressure suggestions use transcript token usage when the host provides `transcript_path`:

```powershell
$env:TEA_CONTEXT_THRESHOLD='160000'
$env:TEA_CONTEXT_INTERVAL='60000'
```

These suggestions are handoff reminders only. They do not stop tools, force-close chats, or move projects.

## Session Rollover

Claude Code session rollover is automatic through the existing `SessionStart` and `UserPromptSubmit` hooks.

What happens:

- `SessionStart` injects a reminder to confirm or add a project label.
- `UserPromptSubmit` increments the session turn count.
- At the threshold, default `12` user turns, the hook writes a compact handoff file.
- If `TEA_ROLLOVER_TOKENS` is set, a handoff can also trigger by estimated prompt-token count.
- Claude is asked to save the handoff, keep working, and suggest starting the next chat only at a natural stopping point in the same project/workspace.

It does not auto-submit, stop running tools, abandon the current task, force-close the current chat, or move the work to a different project unless the user asks.

Default handoff folder:

```text
<CRISP_HOME>\memory-vault\session-handoffs
```

Manual checks:

```powershell
node <CRISP_HOME>\cli\tea.js session-rollover status
node <CRISP_HOME>\cli\tea.js session-rollover handoff --project token-kit --reason manual
```

Optional threshold:

```powershell
$env:TEA_ROLLOVER_TURNS='10'
$env:TEA_ROLLOVER_TOKENS='6000'
```

## Limit Reset Wake

Claude Code hooks can detect common limit/reset messages when the host emits text through `Notification`, `StopFailure`, `PostToolUseFailure`, `Stop`, or `SessionEnd`.

What happens automatically after the Windows watcher is installed:

- the lifecycle hook sees a limit message with a reset time such as `resets at 5:30 PM` or `try again in 45 minutes`
- the hook saves a compact handoff
- the hook writes a wake plan to `memory-vault\wake-plans`
- the Windows scheduled task checks due wake plans every minute
- when due, the runner copies the resume prompt to the clipboard and writes it to `memory-vault\wake-due`

Install the watcher once:

```powershell
<CRISP_HOME>\adapters\windows\install-wake-task.ps1
```

Manual checks:

```powershell
node <CRISP_HOME>\cli\tea.js wake status
node <CRISP_HOME>\cli\tea.js wake schedule --at "5:30 PM" --project token-kit --reason limit-reset
node <CRISP_HOME>\cli\tea.js wake run-due
node <CRISP_HOME>\cli\tea.js wake cancel <id>
```

Plain truth: this prepares and notifies. It does not auto-submit text into Claude Code, force-open a new project, or abandon the old task. The resume prompt points to the saved handoff and same cwd/repo.

### Strict Bash Enforcement

Optional strict mode blocks raw Claude Code `Bash` tool commands unless they run through the token wrapper.

Install/enable:

```powershell
<CRISP_HOME>\adapters\claude-code\install-hooks.ps1 -EnforceTeaRun
```

What it does:

- adds a `PreToolUse` hook with matcher `Bash`
- blocks raw shell commands
- asks Claude to rerun as:

```powershell
node <CRISP_HOME>\cli\tea.js run --label "<task>" -- <command>
```

This forces shell-command output through token metrics and compact observation capture. It does not force Claude's internal reasoning through a hook.

## Codex

Codex already has token-efficient-agent MCP configured in `%USERPROFILE%\.codex\config.toml` on this machine.

The MCP server exposes:

- `observe_add`
- `observe_search`
- `memory_health`

Add this instruction snippet to `AGENTS.md`:

```text
<CRISP_HOME>\adapters\codex\AUTOMATION_AGENTS_SNIPPET.md
```

For lifecycle-style capture, use a notify wrapper/template:

```powershell
<CRISP_HOME>\adapters\codex\notify-token-efficient.ps1
```

Do not replace an existing Codex `notify` command blindly. If another notifier is already present, use:

```powershell
<CRISP_HOME>\adapters\codex\notify-multiplexer.ps1
```

This preserves the existing Codex notifier and also sends `turn-ended` into the token kit as `UserPromptSubmit`. That makes Codex session rollover automatic for turn count. Token-threshold rollover works when the notify payload includes prompt/message text, or when a workflow calls the generic lifecycle hook with that text.

Codex rollover should resume in the same Codex project/workspace and same cwd/repo. The handoff includes the project label and cwd for that reason.

Important: Codex notify output is background state, not visible chat text. To show savings after work, Codex must include a final compact receipt from:

```powershell
node <CRISP_HOME>\cli\tea.js receipt
```

This prints the estimated saved tokens and saved percentage.

## Usage And Learned Pattern Checks

Token/cost usage report:

```powershell
node <CRISP_HOME>\cli\tea.js cost report
```

Learned pattern commands:

```powershell
node <CRISP_HOME>\cli\tea.js instincts add "Prefer narrow rg search before large file reads" --project token-kit --confidence 0.8
node <CRISP_HOME>\cli\tea.js instincts recall "large file reads" --project token-kit
node <CRISP_HOME>\cli\tea.js instincts list --project token-kit
```

Automatic capture is conservative: explicit preference wording can create a learned pattern; secret-looking text is refused; only a capped high-confidence list is injected.

Example Codex notify config:

```toml
notify = [ "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "<CRISP_HOME>\\adapters\\codex\\notify-multiplexer.ps1", "turn-ended" ]
```

## Cleanup / Refresh

Use refresh commands in preview mode first:

```powershell
node <CRISP_HOME>\cli\tea.js memory-health
node <CRISP_HOME>\cli\tea.js memory-refresh plan --days 365
```

Delete old observations only with explicit confirmation:

```powershell
node <CRISP_HOME>\cli\tea.js memory-refresh prune --days 365 --confirm
```

Prune creates a backup before rewriting `observations.jsonl`.

# CRISP architecture

> Checked against the code at commit `f37af84` (VERSION 0.1.7), reading function bodies, not comments.
> Items marked **[unverified]** were not run or confirmed.

## Components

| Component | Where | What it is |
|---|---|---|
| Claude Code hooks (Python) | `claude/hooks/*.py`, installed to `~/.claude/hooks/` | Six small scripts: Headroom filter, handover and ledger writer, session-start recall, reply-length tracker, usage report, skill suggester |
| Lifecycle hook (Node) | `engine/adapters/generic-hooks/tea-lifecycle-hook.js` | One script wired to 21 Claude Code events in `claude/settings.json` (though the default `standard` profile only acts on 13 of them) and to Codex `notify`. Records events, runs rollover and wake logic |
| Engine library | `engine/lib/*.js` | `session-rollover`, `hook-runtime`, `wake-manager`, `vault-sync`, `vault-consolidate`, `machine-state`, `dashboard-html`, `prompt-cache` |
| CLI | `engine/cli/tea.js` (`tea 0.3.0`) | All commands: stats, vault, memory-map, observe, session-rollover, wake, instincts, cost |
| MCP server | `engine/mcp-server/server.js` | Exposes the same memory and observation functions to Codex (and any MCP host) |
| Skills and agents | `claude/skills/`, `claude/agents/`, `engine/skill/` | Instruction cards loaded on demand; subagent definitions |
| Instruction files | `claude/CLAUDE.md`, `codex/AGENTS.md` | Always-loaded rules for the two hosts |
| Memory vault | `engine/memory-vault/` | A separate private git repo (remote `crisp-memory`), nested in the working tree and not a submodule. The public repo ignores it except its README (`engine/.gitignore`) |
| Project ledgers | `<project>/.crisp/` | Per-project, git-tracked: `HANDOVER.md`, `MISTAKES.md`, `BUGS.md` |
| Other host adapters | `engine/adapters/{cursor,windsurf,gemini-cli,chatgpt,...}` | Present in the repo. The installers wire up only Claude Code and Codex |
| External tools | RTK binary, Graphify (vendored skill) | Called from hooks and instructions, not part of the engine |

## Data flow

```
 you type a prompt
        |
        v
 +---------------------+   PreToolUse    +----------------+
 |  Claude Code / Codex |--------------->| rtk hook claude|  rewrites shell commands
 |  (host)              |                +----------------+
 |                      |   PostToolUse   +-------------------+
 |                      |---------------->| headroom_filter.py|  trims big results
 +----------+-----------+                 +-------------------+
            |
            | every event (SessionStart, UserPromptSubmit, Stop, ...)
            v
 +--------------------------------+        +--------------------------------+
 | tea-lifecycle-hook.js          |------->| TELEMETRY (not memory)         |
 |  - append token stats          |        |  engine/.tea-stats/*.jsonl     |
 |  - observe add                 |        |  <vault>/observations.jsonl    |
 |  - cost snapshot, instincts    |        |  <vault>/metrics/              |
 |  - rollover counter, wake      |        |  <vault>/session-state/<id>.json|
 +---------------+----------------+        |  <vault>/session-handoffs/*.md |
                 |                         |  <vault>/wake-plans/           |
                 | (rollover due)          |  ~/.claude/hooks/usage-stats/  |
                 v                         +--------------------------------+
        handoff file written, agent told
        to finish the task then offer a fresh chat

 on Stop:
 +--------------------+  candidates   +--------------------------------+
 | auto_handover.py   |-------------->| <vault>/projects/<p>/staging.md|  raw capture queue
 |                    |  mistakes     +--------------------------------+
 |                    |-------------->| <repo>/.crisp/MISTAKES.md      |  durable, in the repo
 |                    |<--------------| reads it back; may block 1st   |
 +--------------------+  review gate  | stop with a checklist          |
                                      +--------------------------------+
 on SessionStart:
 +--------------------+  reads  <repo>/.crisp/HANDOVER.md (latest ## Session heading)
 | session_start_mem.py|  prints recall instructions into the agent's context
 +--------------------+

 on demand (you run it):
 tea.js vault push|pull|sync  <->  ~/.claude/projects/<p>/memory  <->  vault repo  <->  GitHub (crisp-memory)
 tea.js vault consolidate     cleans staging.md (dry run unless --confirm)
```

## What each hook does (from the code)

**`tea-lifecycle-hook.js`.** For each event it runs, in order:

1. Skip if the event is outside the active profile. `TEA_HOOK_PROFILE` is
   `minimal`, `standard` (default) or `strict`. `TEA_DISABLED_HOOKS` turns off
   single events (`engine/lib/hook-runtime.js`).
2. Append a token-savings row to `engine/.tea-stats/token-savings.jsonl`.
3. Call `tea.js observe add` with a one-line summary of the event. Text that
   looks like a secret (api key, password, bearer token and similar) is
   skipped.
4. On `UserPromptSubmit`, learn an "instinct" from the prompt.
5. Record a cost snapshot.
6. Build one `additionalContext` string from: rollover notice, wake notice,
   learned instincts, context-pressure hint, and (on `PostCompact`) a receipt.
7. Emit that string, except on `Stop`, `StopFailure`, `SubagentStop`,
   `TaskCompleted` and `SessionEnd`. These emit nothing, because emitting text
   on an event that ends a turn re-triggered the hook in a loop (the loop is
   described in the file's comment; the guard is the `TERMINAL_EVENTS` set).
   Wake scheduling still runs on those events.

The vault location is `TEA_MEMORY_DIR` or `engine/memory-vault`.

**Session rollover** (`engine/lib/session-rollover.js`). `SessionStart`
creates `session-state/<session-id>.json`. Each `UserPromptSubmit` increments a
turn count. At the threshold (`TEA_ROLLOVER_TURNS`, default 12; optional
`TEA_ROLLOVER_TOKENS`, default 0 = off) it writes a markdown handoff into
`session-handoffs/` and tells the agent to finish the current task, then ask
whether to start a fresh chat from the handoff. It does not stop the task.

**`enforce-tea-run.js`.** PreToolUse on Bash. Does nothing unless
`TEA_STRICT_BASH=1`; then it denies raw Bash and asks for `tea.js run --`.
It does not cover the PowerShell tool.

**`auto_handover.py`** (Stop). Reads the transcript. It does three things:
(a) stages feedback/project/user memory candidates to
`<vault>/projects/<project>/staging.md`; (b) drafts mistake entries into
`<repo>/.crisp/MISTAKES.md` from admission phrases, with a per-session
watermark in `.crisp/.mistake_scan_watermarks.json` so the same turn is not
re-scanned; (c) if the ledger has relevant entries and this turn wrote files,
returns `{"decision": "block", "reason": ...}` once per turn
(`stop_hook_active` prevents a loop). Relevance is by file basename touched,
not by meaning. Vault path: `TEA_MEMORY_DIR`, else
`~/tools/crisp/engine/memory-vault`.

**`session_start_mem.py`** (SessionStart). Prints a recall instruction block
plus the path and latest session heading of `<repo>/.crisp/HANDOVER.md`. If
the vault's `state/consolidation-log.jsonl` shows no consolidate run for 7
days (`CRISP_CONSOLIDATE_NAG_DAYS`), it adds a one-line reminder. It reads the
vault from a hard-coded path (line 78); see Known gaps.

**`headroom_filter.py`** (PostToolUse on Bash, Read, Grep). Skips outputs
under 500 characters and caps what it returns at 3000. Each firing is logged to
`~/.claude/hooks/usage-stats/headroom-savings.jsonl`.

**`usage_tracker.py`** (Stop) logs reply length to `response-log.jsonl` in the
same folder. **`skill_suggest.py`** (UserPromptSubmit) matches the prompt
against a keyword map and suggests skills. **`usage_report.py`** is run by hand.

## What runs when

| Moment | What runs |
|---|---|
| Session start | Lifecycle hook (`SessionStart`: create session state), turn-counter reset (PowerShell one-liner), `session_start_mem.py` |
| Each prompt | Lifecycle hook (`UserPromptSubmit`: count turn, learn instinct, maybe rollover), turn-counter increment, `skill_suggest.py` |
| Each tool call | `rtk hook claude` (Bash), lifecycle hook (Pre/PostToolUse), `enforce-tea-run.js` (Bash, no-op by default), `headroom_filter.py` (Bash, Read, Grep) |
| Compaction | Lifecycle hook on `PreCompact` and `PostCompact` (receipt) |
| Stop | `auto_handover.py`, `usage_tracker.py`, lifecycle hook |
| Session end | Lifecycle hook (`SessionEnd`; wake scheduling only, no output) |
| Rollover due | Handoff file written; agent is told to offer a fresh chat after the current task |
| When you run it | `tea.js vault ...`, `memory-refresh`, `dashboard`, `usage_report.py` |

The repo's `claude/settings.json` registers 30 hook entries; the live
`settings.json` on the author's machine has 29 (the difference is
`enforce-tea-run.js`, which is a no-op by default).

## Memory versus telemetry

| Kind | Examples | Rule |
|---|---|---|
| Telemetry | `observations.jsonl`, `metrics/`, `session-state/`, `session-handoffs/`, `wake-plans/`, `engine/.tea-stats/`, `usage-stats/` | Records that something happened. Never mined for facts. Not synced to git |
| Raw capture | `<vault>/projects/<p>/staging.md` | Candidates only. Cleaned by `vault consolidate`. Synced to the vault repo |
| Curated memory | `memory-map.md`, `rules.md`, `commands.md`, `concepts/`, `decisions/`, `instincts/` | Distilled, one idea per file |
| Native memory | `~/.claude/projects/<p>/memory/*.md` (written by Claude Code itself) | Copied to `<vault>/projects/<p>/native/` by `vault push` for allow-listed projects (`sync-projects.json`). `MEMORY.md` is never merged between machines |
| Project ledgers | `.crisp/HANDOVER.md`, `MISTAKES.md`, `BUGS.md` | In the project repo, not the vault, so they survive vault pruning and travel with a clone |

Why the split: see `docs/MEMORY_ARCHITECTURE.md` (telemetry mistaken for
memory was the first failure it records).

## Where things live on disk

```
<clone>/                          public repo (MIT)
  claude/  codex/  engine/  scripts/  docs/  install.ps1  install.sh
  engine/memory-vault/            private nested repo (crisp-memory), ignored by the public repo
  engine/.tea-stats/              telemetry, ignored
~/.claude/
  hooks/*.py  skills/  agents/  CLAUDE.md  settings.json
  hooks/usage-stats/              telemetry
  hooks/hook-errors.log           hook failures (hooks exit 0 so failures are silent otherwise)
  projects/<p>/memory/            Claude Code native memory
~/.codex/
  AGENTS.md  config.toml          CRISP block in AGENTS.md; MCP and notify lines pasted by you
<project>/.crisp/                 HANDOVER.md  MISTAKES.md  BUGS.md  .mistake_scan_watermarks.json
```

## Vault sync

`tea vault push|pull|sync` is manual. There is no daemon or schedule. The code
in `engine/lib/vault-sync.js` is described in the vault README as a three-way
(base, local, remote) reconcile that never overwrites content that exists
only on one side and never revives a deliberate local deletion.
**[unverified: I did not read vault-sync.js or run a sync.]**
Per-machine state is written to `machines/<hostname>.json` and rendered into
`dashboard.html`.

## Claude Code and Codex

Both hosts share the engine. Differences, from the repo:

- Claude Code: hooks in `settings.json` call the lifecycle hook directly, plus
  the Python hooks and RTK.
- Codex: instruction-only `AGENTS.md` block, the MCP server, and `notify`
  forwarding into the same lifecycle hook. No Stop hook, so mistake-ledger
  entries are an instruction rather than automatic. The notify forwarder is
  PowerShell only.

## Known gaps

These are things a newcomer will hit. Each was seen in the code.

1. `claude/hooks/session_start_mem.py:78` hard-codes `C:\Users\mohit\tools\crisp\engine\memory-vault`.
2. `claude/hooks/auto_handover.py:535` falls back to `~/tools/crisp/engine/memory-vault` unless `TEA_MEMORY_DIR` is set.
3. The session-start text names claude-mem tools. `docs/SECOND_BRAIN_GROUND_RULES.md` (untracked) says claude-mem is to be retired.
4. `skill_suggest.py` holds a keyword map with the author's own skill names.
5. There is no uninstall script.
6. `install.ps1`/`install.sh` do not install `memory-agent`, although it exists in `engine/skill/`.
7. The live README says the vault is "TEMPLATE ONLY" and lists five failure modes; the vault README describes a working nested repo and `MEMORY_ARCHITECTURE.md` lists six. The live README's file tree omits `dev-review-pipeline` and `ai-eval`.
8. `engine/memory-vault/README.md` is tracked by the public repo and also lives in the nested vault repo, and the two copies differ (the vault copy is newer). **[unverified: which is meant to be the source of truth]**

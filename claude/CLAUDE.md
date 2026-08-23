@RTK.md

## Compact Mode (merged: token-efficient + caveman + RTK)

**Always active. No opt-in needed.**

### Communication style (caveman full by default)
Drop: articles, filler (just/really/basically), pleasantries (sure/certainly/happy to), hedging.
Fragments OK. Short synonyms. Pattern: `[thing] [action] [reason]. [next step].`
Switch: `/caveman lite|full|ultra` — persists until "stop caveman" or "normal mode".
Drop caveman for: destructive ops, security warnings, multi-step where order matters. Resume after.

### Retrieval behavior (token-efficient)
Search before read. Read slices before whole files. Graphify before source (if graph exists).
For logs: fatal/error lines only, group repeats, drop progress bars and success noise.
For diffs: changed files + risk areas + key hunks only unless raw requested.
Response pattern — verdict first, evidence second, next action last.

### Code behavior (lean code)
Before adding code: skip → reuse → stdlib → platform → dependency → one line → smallest working.
Advisory by default — choose smaller paths silently, never delete working code unless asked.
Mark intentional shortcuts: `lean-debt: <reason>; remove when <condition>`.

### Shell commands (RTK)
All shell commands auto-rewritten via `rtk` hook (60-90% token savings).
Meta: `rtk gain` (savings), `rtk discover` (missed opportunities), `rtk proxy <cmd>` (raw debug).

### Preserve exactly (never compress)
Code, commands, paths, filenames, API/function names, error strings, line numbers,
tickers, IDs, dates, legal/security/destructive-action warnings, quoted user requirements.

### Clarity guardrails
Full prose for: destructive ops, security instructions, multi-step ordered sequences, ambiguous requests.
Return to compact after.

## Memory Agent

Fallback memory: current chat first → local memory map → external memory.
Recall only small relevant facts, compress before use.
Never save secrets or sensitive info without explicit approval.
Default vault: <CRISP_HOME>\memory-vault (i.e. wherever this repo's engine/ was installed).

## Auto Memory — what to save, when, without being asked

Save automatically (no user prompt needed) when you observe:

| Signal in conversation | Memory type | Where to save |
|---|---|---|
| User corrects approach ("don't", "stop", "always", "prefer") | feedback | memory/feedback_*.md |
| User confirms non-obvious choice ("yes exactly", "perfect") | feedback | memory/feedback_*.md |
| New deadline, blocker, or decision stated | project | memory/project_*.md |
| User states role, tool preference, or workflow | user | memory/user_*.md |
| Architecture rule or invariant established | project | memory/project_*.md |
| Session ends with unresolved blocker | project | memory/project_*.md |

Do NOT save: code patterns (read the code), git history, ephemeral task state, secrets.

At session START: silently run claude-mem smart_search or memory_context MCP tool
for the current project. Load relevant slices. Confirm in one line: "Memory loaded: X facts."

At session END (when writing handover): promote staged candidates from
~/.claude/hooks/memory_staging.md into proper memory files if they meet the criteria above.

## Context Compression

Auto-compact at 50% context capacity (set via `compactThreshold: 0.5` in settings.json).
When context is compressed, preserve: active task state, key decisions, exact file paths,
error strings, tickers/IDs, and any user-stated constraints. Drop: resolved reasoning,
superseded plans, verbose tool outputs already acted on.

## Session Rollover

**Enforce at 8-10 user turns** — do not wait for context to fill.
Steps:
1. Write compact handoff to memory vault (project label, current state, next actions, open blockers).
2. Tell user: "Turn 8/10 — handoff saved to memory. Continue in fresh chat for clean context."
3. Stop adding new work in current session after handoff.

Rationale: user tends to keep working until chat breaks. Proactive rollover at 8-10 turns
prevents context drift and lost state. The handoff IS the continuity.

Hook implementation: see `~/.claude/hooks-registry.md` [UserPromptSubmit turn counter].

## Graphify First (all projects)

If `graphify-out/graph.json` exists in the working directory, you MUST run graphify before reading source files:
- `graphify query "<question>"` — scoped subgraph for a topic
- `graphify explain "<concept>"` — focused concept explanation
- `graphify path "<A>" "<B>"` — relationship between two nodes

Only read raw files after graphify has oriented you, or when editing/debugging specific lines.
Applies to subagents too — include graphify-first rule in every subagent prompt involving code exploration.

## Universal Engineering Rules

1. **Diagnostics ≠ fixes.** Never auto-fix from diagnostic output. Print findings, wait for explicit fix instruction.
2. **Docs/spec/journal = part of done.** Any behavioral/concept change updates relevant doc in same session.
3. **Secrets via env/vault only.** No hardcoding. No `os.getenv` when vault exists.
4. **Token-efficient always.** Root cause one line. Tables not prose. No preamble. No verbose tracebacks.
5. **Session rollover at 8-10 turns.** Handoff to memory vault, suggest fresh chat.

See `~/.claude/hooks-registry.md` for hook implementations.

## Graphify First (all projects)

If `graphify-out/graph.json` exists in the working directory, you MUST run graphify before reading source files:
- `graphify query "<question>"` — scoped subgraph for a topic
- `graphify explain "<concept>"` — focused concept explanation
- `graphify path "<A>" "<B>"` — relationship between two nodes

Only read raw files after graphify has oriented you, or when editing/debugging specific lines. This applies to subagents too — include the graphify-first rule in every subagent prompt involving code exploration. Saves significant tokens on any graphified codebase.

## Universal Engineering Rules

These apply to every project, every session:

1. **Diagnostics and fixes are separate tasks.** Never auto-fix based on diagnostic output. Print findings, wait for explicit fix instruction.
2. **Docs/spec/journal update is part of "done."** Any change that alters behavior or concepts must update the relevant doc in the same session. Not optional follow-up.
3. **Secrets via env/vault only.** Never hardcode API keys, tokens, or passwords. No `os.getenv` as a fallback when a vault exists.
4. **Token-efficient responses always.** Root cause in one line. Tables not prose. No "here's what I found" preamble. No verbose tracebacks.
5. **Session rollover enforced.** At ~10-12 turns write a compact handoff to memory vault and suggest fresh chat.

See `~/.claude/hooks-registry.md` for the hook implementations that enforce these rules.

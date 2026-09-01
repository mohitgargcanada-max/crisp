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

`compactThreshold` in settings.json is **not a real Claude Code key** — verified
2026-08-31 (see [settings reference](https://code.claude.com/docs/en/settings-reference),
[context window](https://code.claude.com/docs/en/context-window)) and removed
from this repo's `settings.json`; it silently did nothing regardless of value.

The real controls:
- `autoCompactEnabled` (settings.json) — turn auto-compact on/off.
- `autoCompactWindow` (settings.json) — an **absolute token count** (100,000–1,000,000),
  not a percentage.
- `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` (**environment variable**, not settings.json) —
  the actual way to set a percentage-based threshold (e.g. compact at 65% full);
  applies to subagents too. Overridden by Claude Code on the web in cloud
  sessions — only takes effect in local/CLI sessions.

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

These apply to every project, every session:

1. **Diagnostics and fixes are separate tasks.** Never auto-fix based on diagnostic output. Print findings, wait for explicit fix instruction.
2. **Docs/spec/journal update is part of "done."** Any change that alters behavior or concepts must update the relevant doc in the same session. Not optional follow-up.
3. **Secrets via env/vault only.** Never hardcode API keys, tokens, or passwords. No `os.getenv` as a fallback when a vault exists.
4. **Token-efficient responses always.** Root cause in one line. Tables not prose. No "here's what I found" preamble. No verbose tracebacks.
5. **Session rollover enforced.** At ~10-12 turns write a compact handoff to memory vault and suggest fresh chat.
6. **Audit before building.** Before adding anything new — a file, a hook, a tracker, a system — check whether it already exists somewhere in the project or the toolkit and reuse it. Don't build a second version of something that already does the job (this is exactly how CRISP ended up with three overlapping memory systems before the 2026-08-22 consolidation — don't repeat it).
7. **Cite sources, don't fabricate.** When quoting a number, a spec, or a claim from a file/URL/tool result, say where it came from. If you don't know, say so — never guess and present it as fact.
8. **No slop in subagent/tool prompts.** When dispatching an Agent, a Task, or any sub-instruction, write it like briefing a colleague who knows nothing of this conversation — file paths, concrete context, what's already ruled out. A vague prompt produces vague, generic work; that's wasted tokens on both ends.

See `~/.claude/hooks-registry.md` for the hook implementations that enforce these rules.

## Project Ledgers — bugs & mistakes (per-project, not memory-vault)

Two plain files live inside each project's own repo — NOT in the memory-vault,
specifically so they survive `memory-refresh prune` and persist for the life of
the project instead of a session:

- **`.crisp/BUGS.md`** — every real bug found and fixed. One entry: date,
  symptom, root cause, fix (commit hash if committed), status.
- **`.crisp/MISTAKES.md`** — lessons from actual mistakes (mine or the user's
  correction of mine). One entry: date, what happened, why it was wrong, what
  to do differently. This is what lets a *future* session learn from a mistake
  a *past* session already made in this same project.

Both are created on first use (git-tracked, ordinary markdown — no new tooling
to install). `auto_handover.py` auto-detects mistake-admission language
("I made a mistake", "that was wrong", "should have", root-cause phrasing) and
appends a draft entry to `.crisp/MISTAKES.md` automatically; review/edit is
still yours. `.crisp/BUGS.md` entries are written deliberately, by me, when I
actually find and fix a real bug — not regex-detected, since "bug" doesn't
have a reliable text pattern the way a mistake-admission does.

These are separate from the memory-vault's own `feedback`/`project`/`user`
categories above — those stay in the global, prunable memory vault; bugs and
mistakes stay local to the project, permanently.

**Enforcement, not just a log:** `.crisp/MISTAKES.md` is checked, not just
written. On `Stop`, if the project's ledger has entries, `auto_handover.py`
blocks the *first* stop attempt (Claude Code's real Stop-hook blocking
mechanism — `permissionDecision: "deny"`, see
[hooks reference](https://code.claude.com/docs/en/hooks.md)) and hands back
up to 5 entries to check the current change against, before allowing the
response to actually finish. It checks `stop_hook_active` so it only blocks
once per turn, never loops. A written rule only works the first time it's
read; a blocking hook can't be silently skipped the second time.

Entries are picked by **relevance to files touched this turn, not recency** —
a mistake logged months ago about `auth.py` surfaces just as readily as one
from yesterday if `auth.py` is what's being edited right now. Falls back to
the 5 most recent entries only when nothing matches (or nothing was touched
yet). Known limit: matches on file basename only, not on function/concept
names mentioned in the mistake text — cheap and honest, not semantic search.

## Commit & PR Discipline (no new tracker — `gh` already is one)

No separate PR-tracking system: `gh pr list`/`gh pr view` already shows every
open PR, and `gh issue list` already shows every open bug worth formally
tracking. The discipline, not new software, is what was missing:

- Every commit message explains **why**, not just what — the diff already
  shows what changed; the message's job is the part the diff can't show.
- Every PR description explains why this change, links the issue it closes
  (`Closes #N`) if one exists, and states how it was verified.
- A bug worth a formal `gh issue` (vs. just a `.crisp/BUGS.md` line) is one
  that needs to be tracked, assigned, or referenced across multiple PRs —
  file one via `gh issue create` and reference its number in `BUGS.md`
  instead of duplicating detail in both places.

## Task Routing Heuristic (judgment, not automation)

This is a decision rubric I apply by judgment — there's no cost telemetry
wired in yet to make it mechanical, unlike RTK/Headroom which are real code.

- **Parallel vs. sequential:** independent subtasks with no shared state →
  parallel (fan out in one message). Stage 2 needs stage 1's output → sequential.
- **Subagent vs. inline:** open-ended search (10+ files), audits, or anything
  that would bloat the main conversation's context → delegate to a subagent
  and keep only its summary. A known file with a specific edit → inline,
  a subagent round-trip would cost more than it saves.
- **Model/effort tier:** default to inheriting the session's model and effort
  — that's usually right. Override to a cheaper/faster tier only for
  mechanical, low-judgment work (file listing, formatting checks, simple
  greps). Reserve higher effort for genuinely hard judgment calls
  (architecture decisions, ambiguous debugging, adversarial verification of a
  risky change) — not for routine work.
- **Verify redundantly only when it matters:** a second independent check
  (adversarial verify, a different reviewer angle) earns its cost for
  destructive operations, security-sensitive code, or anything hard to
  reverse. For exploratory or low-stakes work, one careful pass is enough —
  redundant verification there is pure cost with no real safety gain.

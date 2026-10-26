# Self-improving skills loop — plan (P-457, 2026-10-26, DRAFT, not built)

Goal (Mohit, 2026-10-26): every skill in CRISP notices its own problems by watching how work is actually done,
and proposes an improvement to itself. Applies to ALL skills (global `~/.claude/skills`, Codex skills, project
skills), not only the engineering loop. The idea of a skill that observes task execution and writes improvement
notes is credited to rebelytics' "Task Observer" skill (github.com/rebelytics/one-skill-to-rule-them-all,
CC BY 4.0). That skill is NOT installed; this is CRISP's own build, reusing CRISP's existing parts.

## Ground rules

1. Observe, propose, never self-edit. No skill file changes without a reviewed patch and Mohit's yes.
2. Evidence or nothing. Every proposal cites the observations behind it (session id, date, file, quote <= 15 words).
3. Reuse, don't add stores. Observations go to the vault's existing per-project tree in JSONL, like instincts.
4. Cheap by default. Capture is regex/hook-level (no model call per turn); the model runs only in the weekly batch.
5. Diagnostics and fixes stay separate (global rule 1): the batch writes proposals; applying one is its own task.
6. No secrets: the same secret filter `learnInstinctFromPrompt` uses runs on every captured line.

## What already exists (reuse)

| Part | Where | Reused for |
|---|---|---|
| Instinct candidates (0.45, `tea instincts promote/drop`) | `engine/lib/hook-runtime.js` | proposal lifecycle shape: candidate -> reviewed -> live |
| Mistake-admission detector + relevance-by-file gate | `claude/hooks/auto_handover.py` (`_scan_mistakes`, `_relevant_mistakes`) | signal source + "show the right lesson at the right time" |
| Vault staging per project | `<vault>/projects/<project>/staging.md` | landing zone for reviewed proposals |
| Response log | `claude/hooks/usage_tracker.py` | turn counts per skill (denominator) |
| MEL roster (`~/.mel/roster.jsonl`) | mohit-engineering-loop | review findings per model/task as a signal for MEL itself |
| Skill keyword map | `claude/hooks/skill_suggest.py` | knowing which skills exist / were suggested |

## Loop

1. **Attribute.** A Stop-hook step (inside `auto_handover.py`, not a new hook) reads the turn's transcript and
   records which skills were active: `Skill` tool calls, `<command-name>` blocks, skill files read.
2. **Capture signals** for that turn, each tied to the active skill(s):
   - user corrections ("no", "don't", "stop", "wrong", "I said") within 2 turns of a skill's output;
   - mistake admissions already detected for MISTAKES.md;
   - tool errors and retries of the same command (>= 2) while the skill drove the work;
   - skill steps skipped or contradicted by the user (skill says X, user overrides);
   - review findings recorded by MEL (`finding`) against work a skill guided;
   - repeated manual sequences (same 3+ tool-call pattern in >= 3 sessions) -> NEW-skill candidate.
   One JSON line per signal in `<vault>/projects/<project>/skill-observations.jsonl`
   `{ts, session, project, skill, kind, evidence, quote, files}`; skill `unknown` when none was active.
3. **Weekly batch** (`tea skills review`, Sunday, or by hand): cluster observations per skill. A pattern seen
   >= 2 times, or in >= 2 projects, becomes a PROPOSAL: problem, evidence list, suggested edit as a unified
   diff against the installed skill, expected effect, how recurrence will be measured. Written to
   `<vault>/skill-proposals/<skill>/<date>-<n>.md` with status `candidate`. One model call per skill with
   observations; skills with none cost nothing.
4. **Review.** The other provider reviews each proposal (Claude-built proposal -> Codex, and vice versa), as
   in MEL plan review. Verdict + findings appended to the proposal.
5. **Approve and apply.** Mohit approves per proposal (`tea skills approve <id>` / `reject <id> --reason`).
   Approved patches are applied to the skill's SOURCE repo on a branch, then installed with backups like MEL
   installs. Rejections are kept so the same proposal is not raised again.
6. **Measure.** After install, the same signal kind for that skill is counted for the next 4 weeks. Fewer
   recurrences = kept; same or more = proposal reopened with the new evidence. This is the eval.

## Build phases

- Phase 1 (capture only, 1 session): attribution + signal capture + `tea skills observations` listing. Run 2
  weeks; check false-positive rate by hand before any batch exists (the 2026-09-08 MISTAKES lesson: regexes on
  analysis prose fabricate entries).
- Phase 2: weekly batch + proposal files + cross-provider review.
- Phase 3: approve/apply/measure + new-skill candidates.

## Decisions (Mohit, 2026-10-26)

1. **Cadence:** every weekly audit is followed by the cross-provider review of its proposals, then the
   patches are applied. Approval stays one yes per weekly batch (Mohit sees the batch list, approves or strikes
   items), so patching is not silent (ground rule 1).
2. **Writer/reviewer (left to Claude):** Codex writes the proposals and patches (more weekly headroom);
   Claude reviews them. If Codex is out of capacity, Claude writes and the review waits for Codex: a writer
   never reviews its own proposal.
3. **Third-party skills are patched too, as owned copies:** the skill is copied into
   `~/tools/skill-forks/<skill>/` (source repo/version and date recorded in `UPSTREAM.md`), the patch is applied
   to the copy, and the copy is installed in place of the original (backup kept). Each weekly audit also
   checks whether the upstream skill changed since the copy; if so, merging the upstream change into the copy
   is listed as a batch item. The original author's licence and credit stay in the copy.

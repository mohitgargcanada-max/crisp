# Bugs found and fixed

## 2026-09-09 — instinct capture stored descriptions as standing rules

**Symptom.** `memory-vault/instincts/global.jsonl` held two garbled sentence fragments at
confidence 0.75, injected into every prompt as "Active token-kit learned patterns":
"i thought graifyf is always incremental" and "u will always find darvas".

**Root cause.** `lib/hook-runtime.js` `learnInstinctFromPrompt` gated on `\b(always|never|...)\b`
appearing anywhere in the text, then stored `text.slice(0, 300)` — the raw prompt prefix.
Descriptive "always" ("X *is always* incremental") is not directive "always" ("*always run* X"),
but the gate could not tell them apart, and the stored value was never the matching part anyway.

**Fix.** Require a directive: clause-initial `always/never/from now on/remember to/don't`, or
`prefer X`, with a DESCRIPTIVE guard rejecting `is|are|was|will|thought|seems + always|never`.
Each clause is judged alone, and only the matching clause is stored. 10/10 test cases pass,
including both real junk entries (rejected) and a mixed message where the descriptive half is
dropped and the directive half kept. Existing two entries quarantined to
`~/.claude/backups/instincts-global.quarantined-*.jsonl`. Status: FIXED.

## 2026-09-09 — staging captured harness text as user feedback

**Symptom.** `~/.claude/memory-staging/aurora-gatway.md` reached 490 KB, almost entirely
"This session is being continued from a previous conversation...".

**Root cause.** `~/.claude/hooks/auto_handover.py` `_categorize` scanned the whole user turn
(which includes injected system reminders, task notifications and hook context) and, on a match,
stored `m["text"][:200]` — the message *prefix*, not the match. A pattern hitting at char 5000
saved 200 chars of unrelated preamble.

**Fix.** Added `_user_said` (strips injected blocks, and a marker line takes its trailing bullet
block with it) and `_clause_around` (returns the sentence containing the match, clamped to a
120-char lookback so a run without punctuation cannot drag in the preamble). 7/7 test cases pass.
Status: FIXED. Note: this had to be fixed BEFORE reconnecting staging promotion, or 490 KB of
boilerplate would have been promoted into the vault.

## 2026-09-09 — Stop hook threw on whitespace-only stdin

**Symptom.** `hook-errors.log`, 2026-09-08: `unparseable hook payload: JSONDecodeError`. One
handover was lost.

**Root cause.** `raw = sys.stdin.read() or "{}"` — a whitespace-only read is truthy, so
`json.loads("\n")` raised instead of falling back to `{}`.

**Fix.** `raw = (sys.stdin.read() or "").strip() or "{}"`. Verified across empty, whitespace,
valid and `stop_hook_active` payloads: all exit 0, no spurious stop-block. Status: FIXED.

## 2026-09-09 — review gate interrupted turns that changed nothing

**Symptom.** The `.crisp/MISTAKES.md` Stop-hook gate blocked on read-only turns — answering a
question, reading a file — where there was no change to review.

**Root cause.** `_review_gate` fell back to the most recent ledger entries whenever
`touched_files` was empty. And `touched_files` was the wrong signal in both directions: it
collects `file_path` from **Read** as well as Edit/Write (so a read-only turn looks like a
write), and it never sees Bash-driven edits at all — heredocs, redirects, `sed -i` — which is
how most edits are made in this setup.

**Fix.** Added `_wrote_this_turn(transcript_path)`: scans only entries after the last real user
message (tool_result envelopes arrive as role=user with no text block and are not mistaken for
a new turn), returns True for Edit/Write/MultiEdit/NotebookEdit or a Bash command matching a
write pattern. `_review_gate` returns None when it is False. On an unreadable transcript it
returns True — it cannot prove the turn was read-only, so it fails toward reviewing.

9/9 tests pass, including the turn-scoping case (a prior turn that wrote, followed by a
read-only turn, correctly reads as read-only) and end-to-end through the hook. Status: FIXED.

**Why it mattered.** A gate that interrupts when there is nothing to check trains the reader to
dismiss it by reflex, and a gate dismissed by reflex is worse than no gate at all.

*(`auto_handover.py` lives in `~/.claude/hooks/`, outside this repo, so only this ledger entry
is committed here.)*

## 2026-09-10 — auto_handover.py drifted out of sync for 3 days on a false belief

**Symptom.** Four real fixes to `auto_handover.py` (2026-09-08 through 2026-09-10 — `_user_said`/
`_clause_around`, the whitespace-stdin crash, `_wrote_this_turn`/`_vault_dir`, and `_repo_root`)
were applied only to the live `~/.claude/hooks/auto_handover.py` and never committed here. The
repo and live copies had been explicitly verified identical on 2026-08-31; by 2026-09-10 they had
diverged by 8.5 KB and four functions.

**Root cause.** The 2026-09-09 BUGS.md entry for the read-only-turn fix stated: *"auto_handover.py
lives in ~/.claude/hooks/, outside this repo, so only this ledger entry is committed here."* That
is false — `claude/hooks/auto_handover.py` has been tracked in this repo since the initial commit
(`b76fd94`, 2026-08-10) and `install.ps1`/`install.sh` copy it with `-Force` on every install. A
session asserted the file was out-of-repo without checking, and the next three fixes inherited the
belief uncorrected. Found during an Aurora gatway session auditing why its own `_repo_root` fix
(same file, row 850 in that project's tracker) had no CRISP-side commit.

**Fix.** Copied the live copy (superset of the repo copy — diffed, confirmed zero functions unique
to the repo version) back over `claude/hooks/auto_handover.py`. Byte-identical to the live copy,
confirmed by hash compare. Backup of the pre-sync repo version at
`claude/hooks/auto_handover.py.bak-20260910-pre-sync`. Corrected here rather than editing the
2026-09-09 entry's false footnote, per this project's own memory-hygiene rule against silently
rewriting a prior record.

**Why it mattered.** `install.ps1` is unconditional (`Copy-Item ... -Force`) with no diff check
and no warning — the next install anywhere would have silently reverted all four fixes, including
the Stop-hook blocking mechanism that itself exists to prevent exactly this class of repeated,
undetected mistake. Status: FIXED.

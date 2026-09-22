# Memory Architecture — and the six ways it goes wrong

This guide exists because we made every mistake in it. Each rule below is followed by the
evidence that produced it, measured on a real installation, not reasoned from theory.

If you are building agent memory — in CRISP or anywhere else — read the failures first. They are
more useful than the design.

---

## The shape that works

```
memory-vault/
  memory-map.md          <- the index. Read this FIRST, always. Keep it compact.
  rules.md               <- durable user rules
  commands.md            <- how to run things
  concepts/              <- distilled knowledge, one idea per file
  decisions/             <- why we chose X over Y (never goes stale)
  projects/<project>/
  session-handoffs/      <- chronological, hook-written (TEA's own, cross-project)
  session-state/         <- <session-id>.json, keyed by session

  observations.jsonl     <- TELEMETRY. Not memory. Never mine for facts.
  metrics/               <- TELEMETRY. Not memory.
```

```
<project-repo>/
  .crisp/HANDOVER.md     <- ONE file per project, git-tracked INSIDE the repo
```

Two axes, both required:

- **Project-wise** — each project's handover lives in that project's own repo, so knowledge
  about one repo never bleeds into another and travels with a clone/PR instead of staying
  behind on one machine's vault.
- **Session-wise, without per-session files** — `.crisp/HANDOVER.md` is ONE file, shared by
  every session that works the project. Each session adds or updates its own `## Session
  <8-char-id> — <topic>` block (newest at top) instead of minting a new dated file. This
  supersedes an earlier two-hop design (`projects/<project>/handovers/<date>_<session-id>.md`
  in the vault, later a per-day `..._SHARED.md`) that was tried first — see the addendum to
  Failure 3 below for why per-session files lost.

Bugs, mistakes, and handovers deliberately live **outside** the vault, in each repo's own
`.crisp/BUGS.md`, `.crisp/MISTAKES.md`, and `.crisp/HANDOVER.md`. They are committed with the
code, survive vault pruning, stay true for the life of the project rather than the life of a
session, and travel with the repo instead of being stranded on whichever machine's vault wrote
them.

---

## Failure 1 — Telemetry is not memory

**What happened.** The vault was never initialized with its own template structure. Lifecycle
hooks began appending event records into the empty folder. Months later it held a 4.7 MB
`observations.jsonl` with 6,286 lines that looked like this:

```
{"type":"PostToolUse","text":"host=claude-code event=PostToolUse cwd=... session_id=..."}
```

Every line a faithful record of *that something happened*. Not one line recording *what was
learned*. The folder was called the memory vault, so everyone assumed memory was in it.

**The rule.** An event log and a memory store are different products with different retention,
different write paths, and different readers. Keep them in separate directories and label the
telemetry explicitly — our `memory-map.md` now says "these are `event=` lines and contain no
knowledge" so no future agent wastes a search on them.

**The tell.** If your memory store grows monotonically with tool calls rather than with
decisions, it is a log.

---

## Failure 2 — Capture must distil, never store raw text

**What happened.** Two separate capture paths both saved the user's literal words instead of the
fact behind them.

A "learned preferences" file scored two fragments at confidence 0.75 and replayed them into
**every subsequent prompt**:

```json
{"trigger":"user-stated preference","confidence":0.75,
 "action":"so we need to fix this... i thought graifyf is always incremental"}
```

That is a typo, mid-thought, with no referent. It was injected on every turn regardless.

Meanwhile a staging file reached **490 KB**, almost entirely this:

```
- [feedback] This session is being continued from a previous conversation that ran out of context...
```

The detector was matching on conversation boilerplate and filing it as user feedback.

**The rule.** A capture step that copies text is not a capture step. It must produce a claim that
survives out of context: *who* decided *what*, and *why*. If the detector cannot produce that,
it should capture nothing. Silence beats noise, because noise is indistinguishable from signal
once it is in the file.

**It is a family, not a bug.** This same defect was eventually found in *five* places across
three subsystems: the learned-preferences store, the staging queue, and — found last, months
after the others — the mistake ledger, which logged the sentence "I should have said that rather
than naming only Aurora" as a durable engineering lesson, trailing colon included, then replayed
it as one on every subsequent turn. Each instance was fixed in place. Fixing them in place did
not stop the class; the sixth was only a matter of time.

The durable answer is one shared capture path that every detector must route through — match
strictly, store a clause, require that the turn actually did something — rather than each site
reimplementing the same three decisions and getting them wrong in its own way.

**The tell.** Read ten random entries. If you cannot act on them without the original
conversation, the capture is broken. Then count how many places in your system can write a
memory: that is how many copies of this bug you have.

---

## Failure 3 — One concept, one location

**What happened.** Session handovers existed in **two** directories under different names,
written by different code paths, holding different subsets. Neither was authoritative.

Worse, the instruction file told agents to promote candidates from a **third** path — one that
nothing had written to in months. It sat at 0 bytes. So every session dutifully checked for
staged knowledge, found an empty file, reported success, and moved on. The promotion step
silently no-opped for months while real candidates piled up somewhere else.

**The rule.** One concept, one location, and the docs must name the path that the *code* writes
to. A documented path that no code writes to is worse than no documentation, because it
manufactures false confidence — the step appears to run and appears to find nothing.

**The tell.** `find` for your memory files. If they turn up in more than one tree, you have a
consistency problem you cannot see from inside any single session.

**Addendum — the same failure, one layer up (handovers, 2026-09-20).** The fix above pointed
handovers at a single vault path, but a single *shared* path is not the same as a single *file*.
Three parallel sessions working the same project the same day each wrote their own
`handover_<date>_<session-id>.md` into that path — correct per the doc, and still three
competing "here's the state" documents with no way to tell which was current. A same-day
`..._SHARED.md` file was tried next: better, but it still lived in the vault, one hop away from
the code the sessions were actually editing, so nothing guaranteed a session would open it
before starting. The design that actually stuck moved the file a second time, into the project's
own repo as `.crisp/HANDOVER.md` — one file, no date in the name, each session keyed by its own
`## Session <id>` heading. Putting it inside the repo did two things a vault path could not:
`git log -- .crisp/HANDOVER.md` shows who touched it when, and a session cannot plausibly miss it
while reading the codebase it is about to edit. The lesson under the lesson: "one location" has
to mean one *file*, not one *directory that different writers can still fragment*.

---

## Failure 4 — A doc rule decays; a hook enforces

**What happened.** The global instruction file grew to 385 lines and, through an "auto-add"
append, ended up holding **two copies of half its own rules**. The copies then drifted: one had
5 engineering rules, the other 8; one had a correct filesystem path, the other a mangled one
where backslash escapes had been eaten. Both were loaded into every session. An agent reading
them had to guess which half was current.

The file even contained a rule warning that prose hides its own staleness — while being the
clearest example of it in the installation.

Separately, a rollover threshold was stated as "8-10 turns" in the doc and "12" in the hook that
actually fires. The hook wins every time, and no one noticed for months.

**The rule.** Anything enforceable belongs in a hook. Instructions are for judgment that cannot
be mechanized. Concretely:

- A written rule is read once, then competes for attention with everything else in context.
- A hook runs whether the agent cooperates or not.

Where both exist, make the doc name the mechanism and its config key, so the two cannot drift
apart silently. When a number appears in two places, one of them must be a pointer.

**The proof, earned the hard way.** This repo ships `claude/hooks/*.py` and installs it over
`~/.claude/hooks/`. Fixes get made to the *live* copy during a session, because that is the one
actually running. Over three days the tracked copy fell 8.5 KB behind, on the strength of a
footnote in this project's own bug ledger claiming the file "lives outside this repo" — written
without checking, then inherited uncorrected by the next three fixes. It had been tracked since
the initial commit.

Then the interesting part. A release fixed it and added an installer backup. **The very next
release drifted again. So did the one after that.** Three consecutive releases each shipped a
resync, by people who had just read the entry explaining the problem. The third time, the only
reason it was caught was that someone happened to be writing a changelog entry about forgetting.

Nothing had ever *failed*. The rule was documented, understood, agreed with, and still lost —
because a rule that relies on remembering is a rule that competes with whatever you were
actually doing. The fix was a pre-commit check that exits non-zero when the two copies diverge.
It has not drifted since, and it cannot, because the commit stops.

If you take one thing from this document, take the gap between "we wrote it down" and "it cannot
happen". Those are not the same control, and the distance between them is three releases.

**The tell.** Grep your instruction file for duplicate headings. Then diff the duplicates. And
for anything that must stay in sync, ask what *fails* when it doesn't — if the answer is
"someone notices", it is not a control.

---

## Failure 5 — Measure before you prune

**What happened.** 97 skills were installed. Their names and descriptions loaded into every
session — roughly 11,300 tokens before the user typed anything.

The temptation is to guess which are unused. Instead we scanned the full transcript history:
28,388 files, 4.3 GB, 940 seconds of I/O. Result: **76 of 97 had zero invocations, ever.** The
21 that survived were the real working set.

Guessing would have got the big cluster right and been wrong at the edges — two skills we would
have called dead had faint traces, and several we assumed were load-bearing had none.

**The rule.** Context budget is a measurable resource. Measure it, prune on evidence, and
**archive rather than delete** so a wrong call costs one `mv` instead of a reinstall.

**The tell.** If you cannot say what your always-on context costs in tokens, that is the first
thing to find out.

---

## Failure 6 — Your checks fail more often than your fixes

**What happened.** In a single session fixing the five failures above, the fixes themselves
survived. The things that broke were the *verifications*:

- `grep -cP '[\x00-\x08]' file || echo 0` — `grep -c` prints `0` and exits non-zero, so the
  fallback appended a second `0`. The two-line value failed a string comparison and printed
  `*** CONTROL CHARS ***` for clean files.
- `find dir -name '*.py' -o -name '*.js' -newermt '-10 minutes'` — `-newermt` binds only to the
  second branch, so every `.py` matched regardless of age.
- `mktemp -d` returned an MSYS path (`/tmp/...`) that Windows Python could not open, so a
  correctly-working hook returned its fail-safe value and *looked* broken.
- Generated regexes lost their word boundaries: `\b` inside a non-raw Python string is the
  backspace character (0x08), so it was written to disk as an invisible control character. The
  file parsed. The module imported. `node -e "require(...)"` printed "loads OK". The pattern
  simply stopped matching, and the symptom read as an over-strict regex rather than a corrupted
  one. `\s` survived untouched — it is not a valid Python escape — which made the corruption
  look impossible.

Four broken checks, zero surviving bugs in the actual fixes.

**The near-miss.** The pre-commit check from Failure 4 was itself the sharpest example. Its first
version compared raw bytes, so a CRLF-vs-LF difference read as drift — and git checks the repo
copy out as CRLF while the live copy is LF. It would have blocked **every commit in the repo,
forever**: far worse than the drift it existed to prevent. It was caught by a must-*allow* test
case before installation, not by a must-block one.

**The rule.**

- Test both directions. Cases that must FAIL are worth as much as cases that must pass, and for
  anything that blocks — a gate, a lint, a pre-commit hook — **the must-allow cases are where
  the real danger lives.** A check that wrongly blocks is worse than the bug it hunts.
- When a check produces a surprising result, suspect the check before the code, and confirm with
  a second, different method before concluding anything.
- "It parses", "it imports", "it loads" are not evidence a fix works. They are evidence the file
  is syntactically valid, which was never in question.
- When generating code, avoid escapes entirely (`chr(10)`, `chr(92)`) or use raw strings, then
  read the generated line back off disk and scan for control characters before running it.

**The tell.** If your test suite has never caught one of your own fixes being wrong, it is
probably only testing that things do not crash.

---

## Applying this to a fresh install

1. Initialize the vault structure **before** any hook writes to it. An uninitialized vault does
   not stay empty; it fills with whatever writes first.
2. Write `memory-map.md` on day one, even nearly empty. It is the contract for where things go.
3. Point every doc at the path the code actually writes to. Verify by writing a test entry and
   finding it.
4. Put the enforcement in hooks. Put the judgment in docs. Never duplicate a value across both.
5. Keep telemetry in its own tree, named so nobody mistakes it for knowledge.
6. Keep memory out of git. `memory-vault/*` is gitignored here by design — concepts and guides
   are public, your project's memory is not.
7. Route every capture through one helper. One place that decides what counts as a memory is one
   place to fix when it is wrong — see Failure 2.
8. For anything that must stay in sync, make divergence *fail*. Not warn, not back up — fail. See
   Failure 4 for what three releases of "we wrote it down" bought.

## Reviewing an existing install

Fastest diagnostic order, cheapest first:

```bash
# 1. duplicate rules in your instruction file
grep '^## ' CLAUDE.md | sort | uniq -d

# 2. how many memory trees do you actually have
find ~ -name 'memory*' -maxdepth 6 -type d

# 3. is your "memory" actually a log
head -3 <vault>/observations.jsonl

# 4. does the documented staging path match the code's path
grep -rn 'staging' CLAUDE.md; grep -rn 'staging' hooks/

# 5. has the shipped copy of your hooks drifted from the installed one
diff <(tr -d '\r' < repo/hooks/x.py) <(tr -d '\r' < ~/.claude/hooks/x.py)

# 6. read the last ten things your system decided to remember
tail -40 <vault>/projects/*/staging.md
```

Every one of those six turned up a real defect on a system its owner considered well built.

Run #6 last and read it properly. It is the only one that tells you whether the memory being
kept is worth keeping, and it is the check people skip — a store that is full looks healthy.

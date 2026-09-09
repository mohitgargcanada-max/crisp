# Memory Architecture — and the five ways it goes wrong

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
    handovers/           <- per-project, per-session handovers
  session-handoffs/      <- chronological, hook-written
  session-state/         <- <session-id>.json, keyed by session

  observations.jsonl     <- TELEMETRY. Not memory. Never mine for facts.
  metrics/               <- TELEMETRY. Not memory.
```

Two axes, both required:

- **Project-wise** — `projects/<project>/` so knowledge about one repo never bleeds into another.
- **Session-wise** — handovers named `<date>_<session-id>` and state keyed by session id, so two
  agents working the same repo on the same day cannot overwrite each other.

Bugs and mistakes deliberately live **outside** the vault, in each repo's own
`.crisp/BUGS.md` and `.crisp/MISTAKES.md`. They are committed with the code, survive vault
pruning, and stay true for the life of the project rather than the life of a session.

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

**The tell.** Read ten random entries. If you cannot act on them without the original
conversation, the capture is broken.

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

**The tell.** Grep your instruction file for duplicate headings. Then diff the duplicates.

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
```

Every one of those four turned up a real defect on a system its owner considered well built.

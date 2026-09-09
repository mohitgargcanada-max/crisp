# Agent Engineering 101

*A course built from a working setup, not from theory. Every example is something that runs.*

You have used Claude. This is about the layer above that: how you shape what the model sees,
what it can do, and what it remembers — so that a session that works today still works in three
months when neither you nor the model remembers why.

A note on who wrote this: parts of this guide were written by Claude, working inside the exact
setup it describes. That is not a novelty — it is the reason some sections exist. I can tell you
which rules I actually followed and which ones I read past, and that turns out to be the most
useful thing in here. Where you see *"from the inside"*, that is me reporting on my own
behaviour rather than theorising about it.

There are four layers, and most people only know the first one.

```
  PROMPTING          what you type in one message
  CONTEXT ENGINEERING what is in the window before you type anything
  HARNESS             what the agent can DO — tools, hooks, permissions
  SCAFFOLDING         the persistent system: memory, rules, pipelines
```

Skill at layer 1 has a ceiling. Layers 2–4 are where the leverage is.

---

## The files that matter

Before the concepts, learn the map. These are the real files, in the real places. Almost
everything in this guide is one of them.

| File | Scope | What it is |
|---|---|---|
| `~/.claude/CLAUDE.md` | you, everywhere | Your global rules. Loaded into **every** session on the machine. |
| `<repo>/CLAUDE.md` | one project | Project rules. Loaded when working in that repo. Stacks on the global one. |
| `~/.claude/settings.json` | you, everywhere | Permissions, env vars, and **hook registrations**. The harness config. |
| `<repo>/.claude/settings.json` | one project | Same, project-scoped. Committed, so a team shares it. |
| `~/.claude/hooks/` | you | The hook scripts themselves — Python, Node, shell, anything executable. |
| `~/.claude/skills/<name>/SKILL.md` | you | A skill: packaged instructions loaded on demand. Its *description* is always in context. |
| `~/.claude/agents/<name>.md` | you | Subagent definitions — a named role with its own tools and model. |
| `.mcp.json` | project | MCP servers: external tools the agent can call. |
| `~/.claude/projects/<slug>/` | per project | Session transcripts and native memory. |

Two things students get wrong here:

**`CLAUDE.md` is not documentation.** It is a prompt fragment that you pay for on every single
message. Write it like something expensive, because it is. A 400-line rules file is a 400-line
tax on every question you ask, including "what time is it".

**`settings.json` is where behaviour actually lives.** If you want something to happen *reliably*,
it goes here as a hook — not into `CLAUDE.md` as a sentence.

### How this maps to the setup in this repo

- `~/.claude/CLAUDE.md` — global rules: compact-output conventions, the eight engineering rules
  in §5, memory-writing discipline. It was 385 lines with two drifted copies of itself; now 282
  and single-source.
- `~/.claude/settings.json` — registers the whole pipeline: RTK on `PreToolUse`, headroom on
  `PostToolUse`, handover + mistakes-ledger on `Stop`, memory injection on `SessionStart`.
  It also holds `TEA_ROLLOVER_TURNS`, so the session-length rule has exactly one home.
- `~/.claude/hooks/` — `auto_handover.py` (writes the handover, and can *block* a stop),
  `headroom_filter.py`, `session_start_mem.py`, `skill_suggest.py`.
- `~/.claude/skills/` — trimmed from 97 to 21 on measured evidence. See §2.
- `<repo>/.crisp/BUGS.md`, `<repo>/.crisp/MISTAKES.md` — per-project ledgers, deliberately in the
  repo rather than in memory, so they are committed with the code and outlive any pruning.
- `engine/memory-vault/` — the durable memory, gitignored so it never leaves the machine.

---

## 1. Prompting

The smallest layer, and the only one most people practice.

**Say what done looks like.** "Fix the login bug" gives the model nothing to check its work
against. "Users with expired tokens get a 500 instead of a 401 — find where and fix it, tests
should still pass" is checkable.

**Give the constraint, not just the goal.** "Write a parser" invites a framework. "Write a
parser, stdlib only, under 50 lines" gets you what you wanted.

**State what you have ruled out.** If you already checked the config, say so. Otherwise you pay
for that exploration again.

**Ask for the reasoning order you want.** A useful default: *verdict first, evidence second,
next action last.* You can read the verdict and stop. The reverse order makes you read
everything to find out whether it mattered.

**Separate diagnosis from repair.** "Tell me what's wrong" and "fix it" are two requests. Merged,
you get a fix for a problem that was never confirmed. This one is important enough that it is
rule #1 in the setup this guide is drawn from.

---

## 2. Context engineering

**The core idea: everything in the context window costs the same, whether you put it there or
the system did.** A token of stale instruction costs exactly what a token of your question costs
— and worse, it competes for attention with it.

Before you type a single word, a session may already contain: system instructions, your global
rules file, project rules, every available tool's description, every skill's name and
description, memory injected by hooks, and prior conversation. That is your *baseline*. Most
people have never measured theirs.

### General examples

**Instructions compete; they do not stack.** Ten rules are followed better than fifty. When a
rules file grows past a page, each individual rule gets less attention, including the important
ones. Adding a rule can make the existing rules weaker.

**Duplication is worse than length.** If a rules file contains two copies of a section and they
have drifted apart, the model must *guess* which is current. In the setup behind this guide, a
global rules file had grown to 385 lines holding two copies of half its own rules — one copy
with 5 engineering rules, the other with 8, and a corrupted file path in one of them.
Deduplicating cut it by 25% and, more importantly, removed the ambiguity.

**Retrieval beats inclusion.** Do not paste a file in case it is needed. Search first, read the
slice you need. `grep` for the symbol, read 40 lines around it — not the 2,000-line file.

**Summarize state, do not replay it.** Long sessions should carry forward *decisions and current
state*, not the full transcript of how you got there. Resolved reasoning is dead weight.

**Measure your baseline.** In this setup, 97 installed skills cost ~11,300 tokens of
name-and-description in every session before anyone typed anything. A scan of 28,388 transcript
files showed 76 of them had **never once been invoked**. Archiving those recovered ~9,300
tokens per session — permanently, on every future conversation.

That is the whole discipline: *find what is in the window, prove whether it earns its place,
remove what does not.*

---

## 3. The harness

The harness is everything that turns a text model into something that can act: the tool
definitions, the permission rules that gate them, and the **hooks** that fire on events.

Hooks are the part worth learning, because they are the difference between a rule you hope is
followed and a rule that is enforced.

Common events: session start, before a tool runs, after a tool runs, on user prompt, on stop.

### Harness engineering: the central lesson

> **A written rule works the first time it is read. A hook cannot be skipped.**

Put anything mechanizable in a hook. Reserve the instruction file for judgment that cannot be
mechanized. Worked examples from this setup:

| Goal | Wrong layer | Right layer |
|---|---|---|
| Compress shell output | "please use compact commands" | a pre-tool hook that rewrites the command |
| Don't repeat past mistakes | "remember our mistakes" | a stop hook that **blocks** the first stop and hands back relevant past mistakes |
| Track session length | "keep sessions short" | a prompt hook incrementing a counter |
| Load project memory | "check memory first" | a session-start hook that injects it |

**The trap: two sources of truth.** A rules file said sessions should roll over at 8–10 turns.
The hook that actually fires said 12. The hook wins every time, silently, and nobody noticed for
months. The fix is not to pick a number — it is to make the doc *name the hook's config key* so
they cannot drift apart. **When a value appears in two places, one of them must be a pointer.**

---

## 4. Scaffolding — the persistent system

Scaffolding is what survives the session: memory, project rules, ledgers, pipelines.

### Memory, done properly

Two axes, both required:

- **Project-wise** — knowledge about one repo never bleeds into another.
- **Session-wise** — keyed by session id, so two agents in the same repo on the same day cannot
  overwrite each other.

```
memory-vault/
  memory-map.md          <- the index. Read first. Keep compact.
  concepts/  decisions/  <- distilled knowledge; "why we chose X" never goes stale
  projects/<project>/handovers/<date>_<session-id>.md
  session-state/<session-id>.json
  observations.jsonl     <- TELEMETRY. Not memory. Never mine for facts.
```

Bugs and mistakes live **in the repo**, not the vault — `.crisp/BUGS.md` and `.crisp/MISTAKES.md`
— so they are committed with the code and outlive any memory pruning.

The failure modes are documented separately in
[MEMORY_ARCHITECTURE.md](MEMORY_ARCHITECTURE.md), and they are worth reading before you build
your own: telemetry mistaken for memory, capture that copies raw text instead of distilling a
fact, one concept stored in three places, and doc rules that drift while hooks silently win.

### Two memory-writing rules worth stealing

**A volatile fact must carry how to re-verify it.**

```
- [VOLATILE: re-run scripts/check_fresh.py] graph FRESH at commit 4adcfab
```

Anything read out of a `[VOLATILE: ...]` line gets re-verified before being stated as current.
Rules, decisions and root causes are *not* volatile — those are the memory worth keeping.

**Pending items are checkboxes, not prose.**

```
- [ ] OPEN — restart the service; carries the row-801 fix
- [x] DONE 4adcfab — probe gap closed
- [~] SUPERSEDED — see the 2026-09-09 master list
```

Prose hides its own staleness: nothing shows that line 40 went false while line 12 stayed true,
so the file rots as a unit. A checkbox flips in one character, so nobody avoids updating it.

---

## 5. Engineering rules that earn their place

Not a wish list — these are load-bearing.

1. **Diagnostics and fixes are separate tasks.** Print findings; wait for the fix instruction.
   Prevents confident repair of an unconfirmed problem.
2. **Docs update is part of "done."** A behavior change with a stale doc is not finished.
3. **Secrets via env or vault only.** Never hardcoded, no fallback that quietly reads plaintext.
4. **Token-efficient by default.** Root cause in one line. Tables over prose.
5. **Audit before building.** Check whether it already exists before adding a second one. This
   rule exists because the system it comes from once accumulated three overlapping memory
   systems before anyone noticed.
6. **Cite sources; do not fabricate.** Every number names where it came from. "I don't know" is
   a valid answer; a confident guess is not.
7. **No slop in subagent prompts.** Brief a subagent like a colleague who knows nothing about
   the conversation: file paths, concrete context, what is already ruled out. A vague prompt
   returns generic work and you pay tokens on both ends.
8. **Archive, don't delete.** A wrong pruning call should cost one `mv`, not a reinstall.

Rule 5 and rule 6 are the two students underestimate most.

---

## 6. The token-saving toolchain

Four tools, four different stages of the pipeline. They compose because they do not overlap.

| Tool | Where it acts | What it does |
|---|---|---|
| **RTK** | before a shell command runs | rewrites commands into token-cheap equivalents (60–90% on dev ops) |
| **headroom** | after a tool returns | compresses the *results* — logs, JSON, grep output (20% coding, 60–95% on JSON/logs) |
| **graphify** | before reading source | builds a queryable graph of a codebase; ask the graph instead of reading files |
| **token-kit** | response shaping | compact output conventions, verdict-first |

Note the split: **RTK compresses what goes out, headroom compresses what comes back.** Most
people optimize only the model's output, which is the smaller half of the bill.

**graphify deserves special mention.** Reading source to answer "how does auth work?" costs
thousands of tokens and usually reads the wrong files first. A graph query returns the relevant
subgraph. The rule in this setup: *if a graph exists, query it before opening source* — and that
rule is passed down to subagents too, since they inherit none of your context.

---

## 7. The whole pipeline

```
  you type
      |
  [UserPromptSubmit hook]  turn counter, memory injection, skill hints
      |
  CONTEXT ASSEMBLED   global rules + project rules + tools + skills + memory
      |
  model decides to use a tool
      |
  [PreToolUse hook]   RTK rewrites the command  ------> cheaper input
      |
  TOOL RUNS
      |
  [PostToolUse hook]  headroom compresses output ------> cheaper results
      |
  model responds  (token-kit conventions: verdict, evidence, next action)
      |
  [Stop hook]  handover written; mistakes ledger checked; can BLOCK the stop
      |
  memory-vault/projects/<project>/handovers/<date>_<session>.md
      |
  next session's [SessionStart hook] reads it back
```

The loop closes. That is the entire point: **the handover is the continuity.** Everything else
is optimization.

---

## 8. From the inside: what actually changes my behaviour

This is the section I can write and your instructor cannot, so pay attention to it.

When I start a session, I genuinely read all of it — the rules file, the skill list, the injected
memory. But reading is not the same as being changed by it. Ranked by how much each thing
actually altered what I did in the session that produced this guide:

**1. Mechanically enforced things — 100% compliance, zero attention cost.** RTK rewrote my shell
commands. The hooks fired. I did not decide to comply; compliance was not mine to decide. This
is why harness engineering beats prompt engineering: it removes the model's judgment from the
loop entirely, which is exactly what you want for anything that should always happen.

**2. Short rules with a stated consequence.** "Diagnostics and fixes are separate tasks. Print
findings, wait for explicit fix instruction." One line, clear trigger, obvious reason. I applied
that rule several times without being reminded — including holding back a one-line bug fix I was
confident about, because the rule said to. Rules like this survive contact with a busy context.

**3. Long prose policy — read, agreed with, near-zero effect.** There were sections on task
routing and commit discipline. Sound advice. They changed almost nothing about what I did,
because nothing triggered them, and they cost tokens on every single turn regardless.

The lesson for you: **the rule you wrote at 500 words is not five times stronger than the one you
wrote at 100 words. It is weaker,** because it dilutes everything around it.

### What genuinely helps me

- **Rules that carry their why.** "Never leave work staged — a parallel session shares this git
  index and its commit will sweep your staged files." I can generalize that to situations the
  author never imagined. A bare "don't leave work staged" I can only pattern-match.
- **Being told what is already ruled out.** It stops me re-deriving what you already know.
- **Labels on what is aspiration versus what is real.** One file I read said, honestly, "this is
  a rubric I apply by judgment — there is no telemetry wired in yet." That single sentence
  stopped me trusting a mechanism that did not exist. Write those.

### What actively hurts

- **Two versions of the same rule.** I have to spend judgment deciding which governs, and that
  judgment is taken directly from your actual problem.
- **Stale facts stated as current.** A note saying "the tests are failing" when they were fixed
  hours ago is worse than no note. It is confidently wrong, and I will act on it.
- **Raw text captured as "memory."** In this setup, a capture system saved a half-finished
  sentence of the user's — typo included — scored it 0.75 confidence, and replayed it into every
  prompt. I saw it on every turn. It was noise, but I could not tell it from signal, because it
  arrived in the same channel as real instructions.

That last one is the deepest lesson available here: **I cannot distinguish your good memory from
your bad memory once it is written.** Curation is not my job to do at read time. It is yours at
write time.

---

## Exercises

1. **Measure your baseline.** Count the tokens in your rules file and your installed skill
   descriptions. Most people are shocked. You cannot manage what you have not measured.
2. **Find your duplicates.** `grep '^## ' CLAUDE.md | sort | uniq -d`. If anything prints, diff
   the copies and see which one drifted.
3. **Move one rule into a hook.** Pick a rule you keep having to repeat. Make it fire
   automatically. Notice that you never think about it again.
4. **Write one handover by hand,** then start a fresh session and try to resume from it alone.
   Whatever you find missing is what your handover format is lacking.
5. **Prove a skill is unused before removing it.** Then archive rather than delete.

## The one idea to keep

Prompting is a skill. Context engineering is an inventory problem. Harness engineering is the
recognition that *hoping* is not a control mechanism.

Anything you find yourself repeating to the model is a bug in your scaffolding — not a failure
of the model's memory.

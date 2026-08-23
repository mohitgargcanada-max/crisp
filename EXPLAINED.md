# CRISP, Explained for Humans

No jargon assumed. Every concept below gets a plain-English explanation, a
real-world analogy, and a concrete example of it firing. If you just want to
install the thing, see [README.md](README.md) — this doc is for understanding
*why* it works.

---

## The one problem everything here solves

Claude (and Codex) charge you — in money, in speed, and in a hard ceiling
called the "context window" — for every word you send them and every word
they send back. Think of it like a phone plan billed per word, with a cap on
how many words fit in a single call before it just... forgets the start of the
conversation.

CRISP is a set of small automatic habits that keep both sides of that
conversation lean: what you show the assistant, and what it says back —
without losing any actual meaning.

**Analogy:** imagine a very smart assistant who's brilliant but has two
constraints: she's paid by the word (both reading and speaking), and she can
only hold about 20 pages of notes in her head at once before the oldest pages
get shredded. CRISP is the set of habits you'd teach her: summarize before
reading, speak in short sentences, keep a notebook outside her head for things
she'll need tomorrow, and know when to start a fresh set of pages.

---

## RTK — "don't hand her the whole filing cabinet"

**What it does:** rewrites shell commands so their output comes back already
trimmed, instead of dumping the raw firehose.

**Analogy:** you ask a coworker "what changed in the budget file?" She could
photocopy the entire 400-page ledger and hand it to you — technically an
answer. Or she could just tell you the three lines that changed. RTK is the
second coworker.

**Example:** you run `git log`. Normally that prints every commit ever made,
full hashes, full messages, forever. RTK quietly turns that into `git log
--oneline` — one line per commit — before it ever reaches the assistant. Same
information, 90%+ less reading.

**Where:** a compiled tool (`rtk` binary), wired as a `PreToolUse` hook for
`Bash` in `claude/settings.json`. Not vendored in this repo — installed via
`cargo install rtk`.

---

## Headroom — "read the report, don't retype it"

**What it does:** after a tool runs (a file read, a grep, a JSON API
response), Headroom looks at the *result* and strips the noise — repeated
lines, giant JSON blobs, progress bars — before it reaches the assistant's
context.

**Analogy:** RTK is "ask for the short version up front." Headroom is the
safety net for when the short version still comes back too long — like a
research assistant who skims a 50-page report and hands you the 2-paragraph
summary, only bothering when the report is actually long enough to be worth
skimming.

**Example:** a tool call returns a 3,000-line JSON API response, but the
assistant only needs the `status` and `id` fields. Headroom extracts just the
top-level keys instead of forwarding all 3,000 lines. It only kicks in when the
saving is worth it (>15%) — for short output, it does nothing at all.

**Where:** `claude/hooks/headroom_filter.py`, a `PostToolUse` hook.

---

## Caveman — "talk like a text message, not a formal letter"

**What it does:** makes the assistant's own replies to you shorter — dropping
filler words, pleasantries, and hedging, while keeping every fact, number,
command, and warning intact.

**Analogy:** the difference between a friend texting you "traffic bad, leaving
now" versus a customer-service email that says "Thank you so much for your
patience! I wanted to reach out and let you know that, due to unforeseen
traffic conditions, I will be departing at this time." Same information. One
costs you 5 seconds to read, the other 30.

**Example:**
- Without Caveman: *"Sure! I'd be happy to help you fix that bug. It looks like
  the issue you're experiencing is related to how the authentication token's
  expiry is being checked..."*
- With Caveman: *"Bug in auth. Expiry check uses `<` not `<=`. Fix:"*

Caveman knows to turn *itself off* for the important stuff — destructive
operations, security warnings, multi-step instructions where the order
matters — because brevity is dangerous exactly where precision matters most.

**Where:** `claude/skills/token-kit/SKILL.md` (merged with the retrieval/lean
rules into one skill).

---

## Graphify — "use the index, don't read the whole book"

**What it does:** builds a searchable map (a "knowledge graph") of a codebase
or document pile *once*, then lets the assistant query that map instead of
opening and reading every file from scratch each time it needs an answer.

**Analogy:** you could find out which chapter of a 900-page textbook discusses
mitochondria by reading the whole book cover to cover. Or you could use the
index at the back and go straight to page 214. Graphify is the index.

**Example:** you ask "how does memory automation work in this project?"
Without Graphify, the assistant might open a dozen files hunting for the
answer. With Graphify, one query (`graphify query "memory automation"`)
returns just the relevant slice — measured at roughly **71× fewer tokens**
than reading the raw files, on a real ~92,000-word codebase.

**Where:** `claude/skills/graphify/` — vendored in full (it's a separate tool,
included here with its own MIT license so the repo is self-contained).

---

## Lean code — "the laziest good developer in the room"

**What it does:** before writing any code, checks a short list in order: does
this even need to exist? Is it already in the codebase? Does the standard
library already do this? Can it be one line? Only after all four "no"s does it
write new code — and it writes the smallest version that works.

**Analogy:** a carpenter who checks the scrap-wood pile and the hardware store
return bin before cutting a fresh plank. Not because they're cheap for its own
sake — because every extra plank is something someone has to store,
understand, and maintain later.

**Example:** asked to "add a function that checks if a list is empty," a
non-lean approach might write a 10-line helper function with edge-case
handling for `None`, custom exceptions, and a docstring. The lean approach
notices `if not my_list:` already does exactly this in one line and stops
there. Shortcuts that *are* taken get flagged explicitly — `lean-debt: <why>;
remove when <condition>` — so nobody mistakes a shortcut for a finished
design.

**Can this be measured?** Not the headline "54% less code" claim — that would
need the same task done twice, once with and once without the discipline,
which normal day-to-day usage never produces. What *is* measurable: how many
real `lean-debt:` markers exist in a repo right now, and whether the codebase
is adding more or less code per commit over time. `tea lean-stats <repo>`
tracks both — real numbers pulled from git and the code itself, not an
estimate — and reports them honestly as a trend, not a savings percentage.

**Where:** `claude/skills/lean-code-agent/`.

---

## The TEA engine — the shared brain behind both Claude Code and Codex

**What it is:** everything above (RTK, Headroom, Caveman, Graphify, Lean code)
is a *habit*. TEA (`engine/` in this repo) is the actual machinery that makes
habits stick across time and across tools — it's a command-line program
(`tea.js`), a background service (an MCP server), and a shared "lifecycle
hook" that fires on every single thing that happens in a session (a prompt
submitted, a tool used, a session starting or ending) — for **both** Claude
Code and Codex, from one shared codebase.

**Analogy:** RTK/Headroom/Caveman/Lean-code are like four separate good
habits a person practices. TEA is the part of the brain that remembers to
actually do them every single time, keeps score of how well they're working,
and takes notes for tomorrow. It's the same brain whether the person is
sitting at their desk (Claude Code) or on the phone (Codex) — same memory,
same habits, two different rooms.

**Example:** you run a long test suite through `tea run --label "full test
suite" -- npm test`. TEA runs the command, shows you the normal output, *and*
prints "saved ~2,400 tokens (68%) vs. raw output" — then quietly files away a
one-line note ("ran full test suite, passed") for later, without storing the
raw pass/fail spam.

**Where:** `engine/cli/tea.js`, `engine/mcp-server/`, `engine/adapters/`.

---

## The memory vault — the assistant's notebook between conversations

**What it is:** a small folder of files that survive after a chat session
ends — a place TEA writes short notes to, and reads short notes from, so the
next conversation doesn't start from zero.

**Analogy:** imagine a substitute teacher who takes over a classroom for one
period only, then never sees those students again — unless the previous
teacher left a notebook: "Room 4B is working on fractions, Aiden struggles
with regrouping, we're picking up on page 42 next." That notebook is the
vault. Without it, every single session is a brand-new substitute teacher who
knows nothing about yesterday.

**Example:** you tell Claude "I prefer terse output, no summaries at the
end." That's a one-time sentence in one conversation. The vault is what turns
it into a fact that's still true three weeks and twelve conversations later,
without you repeating yourself.

Two important boundaries, on purpose:
- Nothing gets deleted automatically, ever.
- Secrets, passwords, and private documents are never written to it — only
  facts, decisions, and preferences.

**Where:** `engine/memory-vault/` (ships as an empty template in this public
repo — your real vault fills up locally and is never committed, since it
contains your actual conversation history).

---

## Session rollover — "start a fresh notebook page, but leave a bookmark"

**What it is:** once a conversation gets long enough (default: 12 turns),
TEA notices and suggests starting a brand-new chat — but first it writes a
short "handoff": what you were doing, what's still open, which project/folder
you were in.

**Analogy:** you're taking notes in a physical notebook and you're near the
last page. Instead of just running out of room mid-sentence, you write "→
continued in new notebook, see: [topic]" and start fresh. The new notebook
opens exactly where the old one left off.

**Example:** after 12 back-and-forth turns fixing a bug, TEA prints a
suggestion to start a new session, along with a ready-made first message for
that new session: *"Continue from handover — fixing the auth token expiry bug
in `server.js`, root cause found, fix not yet applied."*

**Where:** `engine/cli/tea.js session-rollover`, `engine/memory-vault/session-handoffs/`.

---

## Hooks — the nervous system connecting all of this

**What they are:** a "hook" is just "run this small script automatically when
X happens" — X being things like "a new session started," "a tool is about to
run," "the assistant is about to respond." Hooks are *how* RTK, Headroom,
Caveman, and TEA actually get invoked without you ever calling them by hand.

**Analogy:** a hook is like a doorbell wired to a light switch — when
something happens (a visitor presses the button), something else fires
automatically (a light turns on), with no one standing there to flip it
manually.

**Example:** every time you type a message (a "UserPromptSubmit" event),
three things silently fire: TEA's lifecycle hook logs the event, a turn
counter increments (feeding session rollover), and a skill-suggestion hook
checks if a relevant skill isn't installed yet and quietly mentions it.

**Where:** `claude/settings.json` (Claude Code's hook wiring) and
`~/.codex/config.toml` + `~/.codex/AGENTS.md` (Codex's — see below, Codex's
mechanism is different).

---

## MCP server — a phone line to a specialist

**What it is:** MCP (Model Context Protocol) is a standard way for Claude or
Codex to call out to an external program that offers specific tools — like
`observe_add` (save a memory) or `memory_health` (check if memory is stale) —
instead of the assistant having to fake those abilities by writing raw shell
commands.

**Analogy:** instead of the assistant learning to be a locksmith itself
(memorizing lock mechanisms, buying tools), it just picks up the phone and
calls an actual locksmith who already has the right tools on their belt. MCP
is the phone line; the "locksmith" is a small program (`engine/mcp-server/`)
that knows exactly how to search memory, log observations, and check memory
health.

**Example:** Codex calling `observe_search("token receipt format")` is Codex
picking up the phone and asking the memory specialist "have we solved this
before?" — rather than trying to grep through files itself.

**Where:** `engine/mcp-server/server.js`, registered in `~/.codex/config.toml`
under `[mcp_servers.token-efficient-agent]`.

---

## Skills — laminated instruction cards, not code

**What they are:** a "skill" in Claude Code is just a text file (`SKILL.md`)
describing *when* and *how* to behave a certain way — no code runs, it's pure
instruction, loaded into the assistant's context only when it's relevant.

**Analogy:** a laminated card behind a hotel front desk: "If a guest asks
about late checkout, here's the policy and the script." The employee doesn't
memorize every policy card all the time — they pull the relevant one out only
when a guest actually asks about it.

**Example:** you type something about "reviewing this PR for bugs." A hook
notices the word "review" doesn't match any *installed* skill and suggests
`/install-skill code-review` — the laminated card that isn't on the desk yet.

**Where:** `claude/skills/*/SKILL.md` — six are vendored in this repo
(token-kit, headroom, context-engineer, superpowers, graphify, lean-code-agent).

---

## Claude Code vs. Codex — same brain, two different rooms

**What's different:** Claude Code has a real hook system built in — file-based
scripts that fire on named events, configured in one JSON file
(`~/.claude/settings.json`). Codex doesn't have that mechanism at all — its
automation instead runs through three different channels working together: an
MCP server (the "phone line" above), plain-English instructions in a file it
reads at startup (`AGENTS.md`), and a `notify` command it calls whenever a
turn ends.

**Analogy:** two employees who both need to follow the same company policies,
but one has a manager standing over their shoulder tapping them on specific
occasions ("hook: now file the report"), while the other just has the
employee handbook open on their desk and a phone that rings occasionally. Same
policies, very different delivery mechanism.

**Example:** in Claude Code, a session starting *automatically* triggers a
script that resets a turn counter to zero — no one has to remember to do it.
In Codex, the equivalent happens because `AGENTS.md` tells the assistant "call
`tea run` yourself when this happens" — instruction-following rather than a
hard-wired trigger, plus the `notify` → `tea-lifecycle-hook.js` chain filling
in the parts that can be automatic.

**Where:** `claude/` (settings.json + hooks + skills) vs. `codex/AGENTS.md` +
`engine/adapters/codex/`.

---

## Putting it all together: one real task, start to finish

You type: *"why is login failing after deploy?"*

1. **Hook fires** the moment you hit enter — TEA's lifecycle hook logs the
   event, the turn counter ticks up.
2. **Graphify** gets queried first for "login" and "deploy" — returns a scoped
   slice of the codebase instead of the assistant opening every file.
3. The assistant runs `git log` to check recent changes — **RTK** rewrites it
   to `--oneline` before the output comes back.
4. It reads a 2,000-line log file — **Headroom** strips it down to just the
   error lines and groups the repeats.
5. **Lean code** kicks in once the fix is found: instead of writing a new
   validation function, it notices the existing one just has an off-by-one
   check and fixes that one line.
6. The assistant replies — **Caveman** makes the answer three sentences
   instead of three paragraphs: *"Deploy script skipped the token-refresh env
   var. Login checks against expired token. Fix: restore `REFRESH_SECRET` in
   `deploy.yml`, line 42."*
7. At session end, **TEA** writes one compact note to the **memory vault**:
   *"deploy.yml was missing REFRESH_SECRET — fixed 2026-08-23."* Next time
   something breaks after a deploy, that fact is one query away instead of
   forgotten.
8. If the conversation runs long, **session rollover** eventually suggests a
   fresh chat with a ready-made resume prompt.

Eight concepts, one ordinary bug fix, and you never had to think about any of
them — that's the point.

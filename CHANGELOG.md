# Changelog

All notable changes to CRISP. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning is [semver](https://semver.org/).

The single source of truth for the current version is the `VERSION` file at the repo root —
both installers read it rather than hardcoding a copy, so a release touches one place.

## [0.1.5] — 2026-09-13

### Fixed

- **The review gate's write-detector matched a Python f-string alignment spec.** `_BASH_WRITE`
  used `(?:^|[^0-9<])>>?` — any non-digit before a `>` — so `print(f"{n:>3}")` read as a shell
  redirect and the gate fired on read-only inspection turns. That is precisely the behaviour
  0.1.4 fixed it to stop: a gate that interrupts with nothing to review teaches the reader to
  dismiss it. Now requires whitespace or start-of-string before the redirect. It no longer
  matches `{n:>3}`, `a -> b`, or `2>/dev/null`, and still matches `>`/`>>` redirects,
  `cp`/`mv`/`tee`/`sed -i`, `git commit`, and `open(path, "w")`. 12/12 cases, both directions.

  Trade-off recorded: the space-less `cmd>file` form is no longer detected. It is rare, and a
  missed redirect still leaves the tool-name checks (Edit/Write/MultiEdit/NotebookEdit) and the
  `cp`/`mv`/`git` patterns covering anything that actually changes a tracked file.

### Removed

- **Five stray `.crisp/` directories left over from the pre-`_repo_root` fragmentation bug.**
  Four in one project's subdirectories (two empty, two holding only a `MOVED.md` breadcrumb) and
  one inside this repo's own vault handovers folder, holding a single orphaned watermark file.

  Verified as leftovers rather than a live regression: the vault one was written 2026-09-09 18:06
  and `_repo_root()` landed 2026-09-10 14:31, so it predates the fix. `_repo_root()` is working;
  nothing new has been misfiled since. The cleanup refused to touch any directory containing a
  real `BUGS.md` or `MISTAKES.md`, and everything removed was backed up first.

### Known gaps

- Still nothing *fails* when `claude/hooks/*.py` and `~/.claude/hooks/*.py` diverge. This release
  is the third consecutive one to carry a hook resync; the installer backup added in 0.1.3 limits
  the damage but does not prevent the drift. A pre-commit hash comparison would close it, and is
  the obvious next change.

## [0.1.4] — 2026-09-13

Theme: every fix below is the same defect wearing a different hat — **a detector matched loosely
and then stored raw text instead of a distilled fact.** Five instances were found across three
sessions. They are listed separately because they were found separately, but they are one design
assumption repeated in five places.

### Added

- **`docs/MEMORY_ARCHITECTURE.md`** — the memory model (project-wise and session-wise vault,
  telemetry kept separate, memory gitignored) and the five failure modes it exists to avoid.
  Each rule is paired with the measured evidence that produced it rather than with reasoning:
  a 4.7 MB event log mistaken for a memory store, a capture path that replayed raw user
  fragments into every prompt, one concept stored in three places where the documented path was
  0 bytes, an instruction file holding two drifted copies of its own rules, and 76 of 97 skills
  carrying zero invocations across 28,388 transcripts.

- **`docs/AGENT_ENGINEERING_101.md`** — a course-style guide: the four layers (prompting,
  context engineering, harness, scaffolding), a map of the Claude files that matter and how this
  repo uses each, the eight engineering rules, the token-saving toolchain, and the request
  pipeline end to end. Includes a section written from the model's own perspective on what
  actually changes its behaviour — enforced hooks over short rules over long prose.

### Fixed

- **Instinct capture stored descriptions as standing rules.** `engine/lib/hook-runtime.js`
  `learnInstinctFromPrompt` gated on `always|never` appearing anywhere in a prompt, then stored
  `text.slice(0, 300)` — the raw prefix. Descriptive use ("X *is always* incremental") is not
  directive use ("*always run* X"), so ordinary statements of fact became 0.75-confidence
  preferences and were replayed into every subsequent prompt. Two such entries were live:
  a typo-laden half-sentence about base formulas, and "i thought graifyf is always incremental".
  Now requires a directive clause, judges each clause independently, and stores only the matching
  clause. A mixed message keeps "always run graphify before reading source" and drops the
  descriptive half. Secrets filter unchanged. 10/10 cases, both directions.

- **The mistake ledger logged conversational prose as a durable lesson.** Two defects:
  `I should have` was in `MISTAKE_PATTERNS` (the loosest phrase there — it fires on ordinary
  acknowledgement, not on an error), and `_scan_mistakes` stored `text[:220]`, the message
  prefix rather than the matching sentence. Together they wrote a mid-sentence conversational
  line into `.crisp/MISTAKES.md`, trailing colon included, which was then replayed as a lesson
  on every later write turn. Dropped the phrase, switched to `_clause_around`, and gated the
  scan on `_wrote_this_turn` — a lesson worth keeping comes from a turn that changed something.
  6/6 cases plus end-to-end: a read-only turn containing "I was wrong" writes nothing; a write
  turn containing "I broke ..." writes exactly one entry.

- **The review gate interrupted turns that changed nothing.** It fell back to recent ledger
  entries whenever `touched_files` was empty — and `touched_files` is wrong in both directions:
  it collects `file_path` from **Read** as well as Edit/Write (a read-only turn looks like a
  write), and never sees Bash-driven edits at all (heredocs, redirects, `sed -i`), which is how
  most edits are made here. Added `_wrote_this_turn`, scoped to entries after the last real user
  message, failing toward reviewing when the transcript cannot be read. A gate that interrupts
  with nothing to check trains the reader to dismiss it by reflex.

- **`path` also addresses directories, which poisoned mistake relevance.** `_read_transcript`
  harvested `path` from any tool input, but Bash/Grep/Glob use it for a DIRECTORY. One
  directory-scoped call anywhere in a transcript added that bare name to `files` permanently,
  and since a project-root directory name is a substring of nearly every path beneath it, the
  substring match locked onto a single ledger bullet and surfaced that same entry on every
  subsequent Stop for the rest of the session. Now requires a dot-suffix — a directory basename
  essentially never has one.

- **The repo copy of `auto_handover.py` drifted again, immediately after 0.1.3 fixed that very
  class.** The hook changes above were applied to the live `~/.claude/hooks/` copy and committed
  only as ledger prose, so the tracked copy fell 42 lines behind and was additionally missing the
  `path`-suffix fix. Resynced and content-verified (line endings normalised; the repo copy and
  the live copy are now byte-identical after CRLF normalisation).

  Worth recording plainly: 0.1.3 attributed the earlier drift to a false footnote in this
  project's own `.crisp/BUGS.md` claiming the file "lives outside this repo". That footnote was
  written by me, and I repeated the same claim in a later ledger entry before checking. The file
  has been tracked since the initial commit. **The installer backup added in 0.1.3 limits the
  damage but does not prevent the drift** — nothing yet fails when the two copies diverge.

### Changed

- **Staging moved into the vault.** It was a separate store at `~/.claude/memory-staging/` that
  the docs did not even point at correctly — `CLAUDE.md` named `~/.claude/hooks/memory_staging.md`,
  which was 0 bytes, so every "promote staged candidates" step silently no-opped while real
  candidates accumulated elsewhere (490 KB of compaction boilerplate in one project). Staging is
  now `<vault>/projects/<project>/staging.md`, beside the project it belongs to. The boilerplate
  was cleared rather than promoted; promoting it would have poisoned the vault it was about to
  be connected to.

- **Handovers consolidated.** 33 documents across 12 projects moved from `~/.claude/handovers/`
  into `<vault>/projects/<project>/handovers/`, retiring a second store that duplicated
  `session-handoffs/`. The vault was also initialised from `engine/memory-templates/` for the
  first time — it had never been `vault init`-ed, which is why hooks had been appending telemetry
  into an empty folder and that log had become "the vault".

### Known gaps

- Nothing fails when `claude/hooks/*.py` and `~/.claude/hooks/*.py` diverge. The installer backs
  up, but drift is still only caught by someone noticing. A CI check or a pre-commit hash
  comparison would close it.
- The five capture bugs above share one root assumption and were each fixed in place. A single
  shared capture helper — match strictly, store a clause, require a write — would end the class
  rather than waiting for the sixth instance.

## [0.1.3] — 2026-09-10

### Fixed

- **`auto_handover.py`'s ledger, watermark, and vault-staging paths were derived from the
  session's raw cwd, so a session started in ANY subdirectory of a project silently minted a
  second `.crisp/MISTAKES.md` (and a second vault "project") there instead of resolving to the
  actual one.** Discovered when an Aurora gatway session found its mistake ledger had split
  three ways — 81 entries at the repo root, 11 in a stray, 1 in another — and the Stop-hook
  enforcement gate had been silently checking a partial file the whole time. Added `_repo_root()`,
  which walks up from cwd to the nearest `.git` and anchors all three paths on it.

- **The repo copy of `auto_handover.py` had silently drifted 8.5 KB behind the live
  `~/.claude/hooks/` copy it is supposed to mirror.** Four real fixes over three days
  (`_user_said`/`_clause_around`, a whitespace-stdin crash, `_wrote_this_turn`/`_vault_dir`, and
  `_repo_root` above) were applied only to the live file, on the strength of a false footnote in
  this project's own `.crisp/BUGS.md` claiming the file "lives outside this repo." It has been
  tracked here since the initial commit. Resynced the repo copy to match the live copy exactly
  (hash-verified).

### Changed

- **`install.ps1` / `install.sh` no longer silently overwrite a diverged local hook.** Before
  copying `claude/hooks/*.py` over `~/.claude/hooks/`, each installer now hashes the existing
  live file against the one about to replace it; if they differ, the live copy is backed up to
  `<file>.pre-install-backup-<timestamp>` first. The install still proceeds — this doesn't block
  onboarding — but a real local fix can no longer vanish without a trace the way this one did.
  Verified behaviorally on both platforms with a synthetic diverged-file case before landing.

## [0.1.2] — 2026-09-09

### Fixed

- **The context-usage notice was scored against a hardcoded 200k window, so it was wrong
  on every 1M-context model — and wrong in the direction that causes harm.**

  `contextWindowTokens()` in `engine/lib/hook-runtime.js` returned 1,000,000 only when the
  model *name* contained the literal string `"1m"`, and 200,000 otherwise. No Claude model
  id contains `"1m"`. Measured on `claude-opus-5`: the hook injected
  `Token-kit context: about 198k tokens (99% of 200k window). Prepare a compact handoff`
  into every turn while the client's own meter read **20%** — 198k of a real 1M window.

  The failure mode is the point. A heuristic keyed on a string the real inputs never
  contain does not fail loudly; it silently applies its fallback to exactly the models it
  most needed to get right, and it looked like a conservative default while doing so. The
  practical cost was agents being pushed to hand off and start fresh chats at a fifth of
  the context they actually had.

  Window detection now resolves in order: the `TEA_CONTEXT_WINDOW` env override, a literal
  `"1m"` in the model id, the family pattern `/(opus|sonnet|fable)-(5|[6-9])/`, the
  pre-existing observed-tokens backstop (a session already past 200k cannot be on a 200k
  window), then 200,000. Haiku 4.5 correctly stays on 200k.

### Changed

- **The context warning is now a fraction of the real window, not an absolute constant.**
  `contextThreshold()` returned one of two hardcoded token counts (160k / 250k), which is
  why a wrong window produced both a wrong percentage *and* a wrong warning point. It is
  now `CONTEXT_WARN_FRACTION` (0.70) times the detected window — 700k on a 1M model, 140k
  on a 200k model. `TEA_CONTEXT_THRESHOLD` still overrides with an absolute count.

- **`contextWindowTokens` and `contextWindowForTranscript` are now exported.** The bug was
  one wrong constant in one place; a second copy of the model list in another hook would
  re-create it at the next model launch. Callers resolve the window through this one
  definition instead.

- **The turn counter shipped in `claude/settings.json` fired at a hardcoded 8**, while the
  lifecycle hook reads `TEA_ROLLOVER_TURNS` and `session-rollover.js` defaults to 12 —
  three numbers for one policy, silently disagreeing. It now reads `TEA_ROLLOVER_TURNS`
  (falling back to 12) and prints the threshold it used.

### Note

The turn-count rollover policy itself is deliberately left alone. It is a user preference,
not a window assumption, and lowering or raising it is a judgment call for whoever runs
CRISP — the context-based trigger above is the part that was factually broken.

## [0.1.1] — 2026-09-08

### Fixed

- **Every CRISP lifecycle hook was silently dead on Windows.** All 22 hook commands in
  `claude/settings.json` were written as an *unquoted* Windows path (`node <CRISP_HOME>\\adapters\\...\\tea-lifecycle-hook.js --host claude-code --event Stop`).

  Claude Code runs hook commands through `sh` on Windows, which consumes the backslashes as
  escape sequences. The path collapsed to `Usersmohittoolscrisp...` and was then resolved
  relative to the current working directory, so every invocation died with
  `MODULE_NOT_FOUND` — surfacing only as a stray Node stack trace, never as a CRISP error.
  An installed, configured, completely inert hook looks exactly like a working one.

  This took out the whole lifecycle across **21 events** (`SessionStart`, `SessionEnd`,
  `Stop`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `PostCompact`,
  `SubagentStart`/`Stop`, `TaskCreated`/`Completed` and the rest) plus the separate
  `enforce-tea-run.js` hook — so the token receipt, the turn counter, rollover tracking and
  the session-end memory promotion had all been no-ops on Windows while appearing installed.

  Fix: quote the path in the shipped template. Verified against real runs before shipping —
  unquoted fails with `MODULE_NOT_FOUND`, quoted returns the hook's real JSON output, and a
  forward-slash path works too (node accepts `/` on Windows).

  **Existing installs are not rewritten by this change.** Either re-run the installer, or
  quote the paths in `~/.claude/settings.json` by hand.

## [0.1.0] — 2026-09-08

First versioned release. CRISP had shipped unversioned since 2026-08-10 (17 commits, no tags),
so there was no way for an installed copy to say what it was. Starting at `0.1.0` rather than
`1.0.0` is deliberate and honest: this is a month-old personal toolkit in active daily use, not
a stabilised public API.

### Fixed

- **The RTK install instructions pointed at the wrong project.** Every place CRISP mentioned
  installing RTK said `cargo install rtk`. The crates.io crate under that name is
  **Rust Type Kit** (v0.1.0, last published 2025-06-27) — *"query Rust types and produce FFI
  types"* — not **Rust Token Killer**, the CLI output compressor CRISP actually depends on and
  wires up as a `PreToolUse` hook.

  Anyone following the instructions got a working `rtk` binary that does something else
  entirely, and then hit the failure CRISP's own `RTK.md` already documented as a "name
  collision" without ever tracing it back to this instruction. Corrected in `install.ps1`,
  `install.sh`, `README.md`, `EXPLAINED.md` and `CREDITS.md` to the real upstream,
  [rtk-ai/rtk](https://github.com/rtk-ai/rtk) (Apache-2.0):

  ```bash
  brew install rtk-ai/tap/rtk                                                   # macOS / Linux
  curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/develop/install.sh | sh
  # Windows: rtk-x86_64-pc-windows-msvc.zip from https://github.com/rtk-ai/rtk/releases/latest
  rtk init --global
  ```

  Each location now also carries an explicit "do **not** `cargo install rtk`" warning, with
  `rtk gain` given as the one-command way to tell the two projects apart — the wrong one has
  no such subcommand.

- **`CREDITS.md` credited RTK to "Unknown / community."** Now correctly attributed to rtk-ai
  with its real repository and Apache-2.0 licence.

### Added

- `VERSION` file and this changelog.
- Both installers print `CRISP installer v<version>` on start, reading `VERSION` rather than
  carrying their own copy.

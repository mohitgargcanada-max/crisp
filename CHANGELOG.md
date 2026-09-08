# Changelog

All notable changes to CRISP. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning is [semver](https://semver.org/).

The single source of truth for the current version is the `VERSION` file at the repo root —
both installers read it rather than hardcoding a copy, so a release touches one place.

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

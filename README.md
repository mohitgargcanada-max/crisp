# CRISP

CRISP is a set of hooks, skills, agent definitions and a small Node engine
that you install into Claude Code and OpenAI Codex. It does two jobs. It
cuts the tokens an AI coding agent spends on shell output, file reads and
replies. And it gives the agent a memory that survives between sessions:
handover notes, a bug ledger, a mistake ledger and a private memory vault.

CRISP integrates other people's tools (RTK, Headroom, Graphify and others).
It does not replace them. Credits are in [CREDITS.md](CREDITS.md).

## Problems it addresses

| Problem | What CRISP does about it |
|---|---|
| Long shell and file output fills the context window | RTK rewrites shell commands; a Headroom hook trims large tool results |
| Verbose agent replies | The `token-kit` skill and `CLAUDE.md` set a short reply style ("caveman") |
| The agent re-reads the whole repo every session | Graphify knowledge-graph queries are the first step, per `CLAUDE.md` |
| Context is lost when a chat ends | A hook counts turns, writes a handoff file, and tells the agent to suggest a fresh chat |
| Several sessions on one project write conflicting notes | One shared `.crisp/HANDOVER.md` per repo, one `## Session <id>` block per session |
| The same mistake is made twice in one project | `.crisp/MISTAKES.md` is checked on Stop and can block the first stop attempt |
| A skill keeps causing the same problem and nobody notices | The Stop hook records corrections, overrides, repeated failures and mistake admissions against the skills active at the time; `tea.js skills observations` lists them (capture only, see [docs/SELF_IMPROVING_SKILLS_PLAN.md](docs/SELF_IMPROVING_SKILLS_PLAN.md)) |
| Memory that is really a log | Telemetry and memory are kept in separate places; see [docs/MEMORY_ARCHITECTURE.md](docs/MEMORY_ARCHITECTURE.md) |

## Honest numbers

Most token-saving tools publish benchmark numbers from ideal conditions.
Here's what we actually measured from real usage data:

| Tool | Measured on | Real saving | How we know |
|---|---|---|---|
| **RTK** | 9,337 commands over ~3 months | **93.8% on file reads, 15–100% on git diffs** | `rtk gain` — live telemetry |
| **Caveman** | Response length | ~65–75% fewer words | Author's benchmark — not independently verified |
| **Headroom** | Tool output compression | >15% saving threshold before it fires | `usage_report.py` — live telemetry |
| **TEA lifecycle hooks** | 567 hook events | ~0% net saving at hook level | Our own data — TEA adds metadata, doesn't compress |
| **Lean code** | Code length | ~54% less code generated | Author's controlled benchmark — varies by task |

**What this means:** RTK and Headroom are measured from live telemetry. Lean code
and Caveman's *savings* claims are unverified — no shadow "verbose version" is
logged anywhere to diff against — but Caveman's response-length *trend* is
tracked from 2026-08-18, so drift is at least visible. Run `rtk gain` and
`python ~/.claude/hooks/usage_report.py` after a week to see your real numbers.

Lean code's 54% claim specifically can't be measured passively — it would need
the same task run twice, once with and once without the discipline, which
normal usage never produces. What *can* be measured, and now is:
`tea lean-stats <repo>` tracks real `lean-debt:` marker counts (in actual code,
not docs that just mention the convention) plus a git-based code-volume trend
(average lines added per commit, recent half vs. earlier half). It's an
honest proxy — code-volume trend, not a savings percentage — surfaced as a card
in `tea dashboard --repo <path>`.

---

## What gets installed

`install.ps1` (Windows) and `install.sh` (Mac/Linux) do the following.
Source: the two scripts; read them before running.

**Claude Code** (under `~/.claude/`)

| What | From | To |
|---|---|---|
| 6 Python hooks | `claude/hooks/*.py` | `~/.claude/hooks/` (an existing different copy is backed up first as `*.pre-install-backup-<time>`) |
| 8 skills: `token-kit`, `headroom`, `context-engineer`, `agent-orchestration`, `graphify`, `karpathy-guidelines`, `dev-review-pipeline`, `ai-eval` | `claude/skills/` | `~/.claude/skills/` |
| 2 agents: `code-reviewer`, `hallucination-reviewer` | `claude/agents/` | `~/.claude/agents/` |
| Global instructions | `claude/CLAUDE.md` | appended to `~/.claude/CLAUDE.md` if that file does not already contain the word "CRISP"; created if absent |
| Hook wiring | `claude/settings.json` | created as `~/.claude/settings.json` only if none exists. Otherwise a resolved copy is written to `~/.claude/settings.crisp-hooks.resolved.json` and you merge the `hooks` block by hand |

The hook commands in `settings.json` point into the clone's `engine/`
folder. **Keep the clone where it is after installing.**

**Codex** (under `~/.codex/`)

- An automation block is written into `~/.codex/AGENTS.md` between
  `CRISP:AUTOMATION_SNIPPET` markers. Re-running updates it in place.
- `config.toml` is never edited. The installer prints the MCP server
  block and the `notify` line for you to paste in.
- The `notify` multiplexer is a PowerShell script, so automatic turn
  tracking for Codex is Windows-only today.

**Not installed by the scripts**

- RTK. It is a separate binary. Install it from
  [rtk-ai/rtk](https://github.com/rtk-ai/rtk). Do not run `cargo install rtk`
  (that crate is a different project). Check with `rtk gain`.
- The `memory-agent` skill and `memory-agent`/`token-efficient-agent` agents
  exist in `engine/skill/` and `engine/adapters/claude-code/agents/` but
  are not in the installer's lists. **[unverified: whether this is intended]**
- Companion plugins (superpowers, claude-security and others). The
  installer checks for them and prints or runs the install command.

## Quick start

Windows (PowerShell):

```powershell
git clone https://github.com/mohitgargcanada-max/crisp
cd crisp
./install.ps1
```

Mac/Linux:

```bash
git clone https://github.com/mohitgargcanada-max/crisp
cd crisp && chmod +x install.sh && ./install.sh
```

Clone to `~/tools/crisp`. Two hooks assume that location (see
Troubleshooting).

Requirements: Claude Code with hooks, Python 3.8+, Node.js, the RTK binary,
and the Codex CLI if you want the Codex side.

### Verify

```bash
rtk gain                                          # RTK is the right binary and is counting
python ~/.claude/hooks/usage_report.py            # Headroom and reply-length stats
node engine/cli/tea.js session-rollover status    # rollover state
node engine/cli/tea.js stats                      # token-savings log
```

In a new Claude Code session, the start hook prints `[SESSION] Turn counter
reset to 0.` For Codex, look for the `CRISP:AUTOMATION_SNIPPET:START` block in
`~/.codex/AGENTS.md`.

### Uninstall

There is no uninstall script. **[verified: none in the repo]** To remove CRISP
by hand, reverse what the installer did:

1. Delete the six hook files from `~/.claude/hooks/`, the eight skill folders
   from `~/.claude/skills/` and the two agent files from `~/.claude/agents/`.
2. Remove the CRISP-added section from `~/.claude/CLAUDE.md` (it starts at
   `# --- CRISP pipeline (auto-added) ---` if it was appended).
3. Remove the hook entries that point at `engine/` or `~/.claude/hooks/` from
   `~/.claude/settings.json`.
4. Remove the marked block from `~/.codex/AGENTS.md`, and the MCP and `notify`
   lines you pasted into `config.toml`.
5. Your memory is not touched by the above. It lives in `engine/memory-vault/`
   (if you used it) and in each project's `.crisp/` folder.

## Main commands

All run as `node engine/cli/tea.js <command>` from the clone. (`tea.ps1` in
the same folder is a thin wrapper that calls it.) The command list below is
what `node engine/cli/tea.js` prints; run it to see every flag.

| Command | Use |
|---|---|
| `stats`, `receipt`, `gain`, `stats-reset` | Token-savings log from the hooks |
| `dashboard [--repo <path>]` | Static HTML report per service (written to `engine/.tea-stats/dashboard.html`) |
| `lean-stats <path>`, `debt <path>` | Count `lean-debt:` markers and code-volume trend |
| `run -- <cmd>` | Run a command through the token wrapper |
| `compress <file>` | Compress a prompt file |
| `vault init \| status` | Set up or inspect the memory vault |
| `vault push \| pull \| sync [--dry-run]` | Copy Claude Code's native project memory to and from the vault repo |
| `vault consolidate [--confirm]` | Clean the staging queue. Dry run unless `--confirm` |
| `vault dashboard` | Regenerate `dashboard.html` for all machines |
| `memory-map show \| recall <q> \| add <text>` | Read or add to the vault index |
| `observe add \| search \| get \| timeline` | Telemetry events (not memory) |
| `memory-health`, `memory-refresh plan \| prune --confirm` | Check and prune the vault |
| `session-rollover status \| handoff` | Turn counter and handoff files |
| `wake status \| schedule \| run-due \| cancel` | Scheduled resume after a usage limit |
| `instincts add \| list \| recall \| promote \| drop` | Learned patterns, each with a confidence |
| `cost report` | Cost snapshots |
| `bridge start` | Local bridge server |

The vault README and the Memory Vault notes refer to `tea vault ...`. The
bare `tea` name is a shorthand; the verified form is `node engine/cli/tea.js`.
**[unverified: whether a `tea` alias is installed anywhere]**

## Project files CRISP maintains

These live inside each project, git-tracked, so they travel with the repo.

| File | Purpose |
|---|---|
| `.crisp/HANDOVER.md` | One shared handover. Each session owns one `## Session <8-char-id>` block, newest first |
| `.crisp/MISTAKES.md` | Lessons from real mistakes. The Stop hook drafts entries from admission phrases and shows up to 5 relevant ones |
| `.crisp/BUGS.md` | Real bugs found and fixed. Written by hand |

## How it fits with other pieces

- **Mohit Engineering Loop** (skill,
  [github.com/mohitgargcanada-max/mohit-engineering-loop](https://github.com/mohitgargcanada-max/mohit-engineering-loop)).
  A separate skill that coordinates Claude and Codex on an engineering task
  with isolated branches, review and handoffs. It does not need CRISP. When
  CRISP is present, it uses CRISP's compression and `.crisp/HANDOVER.md`,
  and keeps its own task state in `.mel/<task>/state.json`. It does not
  create a second memory vault. Source: its `references/crisp.md`.
- **Second brain (planned, not built).**
  [docs/SECOND_BRAIN_GROUND_RULES.md](docs/SECOND_BRAIN_GROUND_RULES.md) sets
  the rules for a future layer on top of the vault: one durable store, typed
  facts with sources, small retrieval slices, opt-in sources (transcripts
  first, then calendar, then email), and confirmation for every outward
  action. It also plans to retire claude-mem. That file is still untracked in
  git at the time of writing.
- **Memory vault.** A separate private repo nested at `engine/memory-vault/`,
  not a submodule. The public repo ignores everything in it except its README.
  See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Troubleshooting

| Symptom | Likely cause and check |
|---|---|
| `rtk gain` fails or does something else | You may have the wrong `rtk` crate. Remove it and install from rtk-ai/rtk |
| No `[SESSION]` line at session start | Hooks are not in `~/.claude/settings.json`. Merge the `hooks` block from `settings.crisp-hooks.resolved.json` |
| Hooks run but write nothing useful | Read `~/.claude/hooks/hook-errors.log`. The Python hooks append failures there and exit 0, so a failure is silent otherwise |
| Handover or vault paths are wrong on your machine | `session_start_mem.py` and `auto_handover.py` look for the vault at `TEA_MEMORY_DIR`, else `~/tools/crisp/engine/memory-vault`. Set `TEA_MEMORY_DIR`, or clone to `~/tools/crisp` |
| Session start tells the agent to search claude-mem | Same file; the injected text names claude-mem MCP tools. Remove that line if you do not use it |
| Skill suggestions mention skills you do not have | `skill_suggest.py` has a map with the author's own skill names. Edit it |
| A hook change you made disappears | The installer overwrites hooks and backs up a different live copy first. The repo copy and the live copy must match; `scripts/pre-commit` fails a commit when they differ |
| Too many or too few rollover prompts | `TEA_ROLLOVER_TURNS` (engine default 12). Hook set: `TEA_HOOK_PROFILE` = `minimal`, `standard` (default) or `strict`. Disable single events with `TEA_DISABLED_HOOKS` |
| Raw Bash is not forced through `tea.js run` | Intentional. Strict mode is off unless `TEA_STRICT_BASH=1` |
| Codex turn tracking does nothing on Mac/Linux | The notify multiplexer is PowerShell only; a shell port is not built |

Install the drift check per clone with:
`cp scripts/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`.

## Further reading

- [EXPLAINED.md](EXPLAINED.md): every concept in plain English.
- [docs/MEMORY_ARCHITECTURE.md](docs/MEMORY_ARCHITECTURE.md): six ways agent memory goes wrong.
- [docs/AGENT_ENGINEERING_101.md](docs/AGENT_ENGINEERING_101.md): course-style introduction.
- [engine/docs/LAYMAN_GUIDE.md](engine/docs/LAYMAN_GUIDE.md): engine guide.
- [CHANGELOG.md](CHANGELOG.md).

## Credits and licence

MIT for CRISP's own code and `engine/`; see [LICENSE](LICENSE). Third-party
skills keep their upstream licences; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [CREDITS.md](CREDITS.md).

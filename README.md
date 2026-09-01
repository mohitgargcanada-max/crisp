# CRISP — Compressed Retrieval & Intelligent Signal Pipeline

> Full-stack token compression + persistent memory for Claude Code and OpenAI Codex.
> One clone, one installer, both hosts — attacks every stage of the AI coding
> pipeline, not just one end.

New to this? **[EXPLAINED.md](EXPLAINED.md)** covers every concept below in
plain English with real-world analogies and examples — no jargon assumed.

---

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

## What changed (2026-08-22 consolidation)

CRISP used to be three separate, partly-overlapping things: this repo (whose
Codex support was placeholder code that was never actually wired up), a private
`token-efficient-agent-kit` repo (the real engine, including the real Codex
integration), and a now-retired `agent-memory-vault` repo (a dead duplicate).

They're one repo now:
- **`engine/`** — the former `token-efficient-agent-kit`, merged in whole. This is
  the actual engine: `tea.js` CLI, the MCP server, the lifecycle hook shared by
  both Claude Code and Codex, and adapters for a dozen other hosts (Cursor,
  Windsurf, Gemini CLI, ChatGPT, and more — only Claude Code and Codex are
  wired up by `install.ps1`/`install.sh` today, the rest are there if you want them).
- **`codex/AGENTS.md`** now matches what's *actually* live — the token-efficient-agent
  MCP server + `tea.js` commands + notify-based session rollover — instead of the
  invented hook-file scheme it had before.
- **`claude/hooks/auto_handover.py`** was trimmed — it used to write its own
  separate handover docs, duplicating what `engine/`'s lifecycle hook already
  does. It now does only the one thing the engine doesn't: categorizing message
  text into feedback/project/user candidates for Claude Code's own memory files.
- **`agent-memory-vault`** is retired — folded into `engine/memory-vault/`.

### 2026-08-31 — project ledgers, no new PR tracker

- Added `.crisp/BUGS.md` and `.crisp/MISTAKES.md` — per-project (not
  memory-vault) files that persist for the life of the project instead of
  being subject to memory-vault pruning. `auto_handover.py` now auto-drafts
  mistake entries from mistake-admission language in the transcript.
- Deliberately did **not** build a PR/bug-tracker system — `gh pr`/`gh issue`
  already are one. Added a discipline rule instead (commit messages explain
  why, PRs link the issue they close) rather than a new tool.
- Added a written task-routing heuristic to `claude/CLAUDE.md` (parallel vs.
  sequential, when to use a subagent, model/effort tiering) — judgment
  guidance, not automation; there's no cost telemetry behind it yet.
- **Bugfix:** `compactThreshold` (in `claude/settings.json` and referenced in
  `claude/CLAUDE.md`/`context-engineer/SKILL.md`) is not a real Claude Code
  setting — verified against
  [official docs](https://code.claude.com/docs/en/settings-reference), it
  silently did nothing regardless of value. Removed it; documented the real
  controls (`autoCompactEnabled`/`autoCompactWindow` in settings.json, or the
  `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` environment variable for a percentage
  threshold) in its place.
- Ported the same three additions (project ledgers, gh-based tracking,
  routing heuristic) to `codex/AGENTS.md`, adapted for Codex's instruction-only
  model — no Stop hook there, so ledger entries are a direct instruction
  rather than automatic detection. Also fixed real drift found on the live
  Codex side: a stale, unmarked duplicate "Token Efficient Automation" block
  still pointing at the retired `token-efficient-agent-kit` path.
- `.crisp/MISTAKES.md` is now **enforced, not just logged**: `auto_handover.py`
  uses Claude Code's real Stop-hook blocking (`permissionDecision: "deny"`,
  see [hooks reference](https://code.claude.com/docs/en/hooks.md)) to block
  the first stop attempt when the ledger has entries, handing back the 5 most
  recent mistakes to check the current change against. Checks `stop_hook_active`
  so it only blocks once per turn. Capped to 5 entries deliberately — the
  full historical ledger would grow unbounded and defeat the point of a
  token-efficient project.

## The pipeline

```
YOUR PROMPT (nothing touches this — compressing intent loses meaning)
         │
         ▼
STAGE 1 — Graphify: query the knowledge graph before reading raw files
  71.5× token reduction per query vs loading raw files (Graphify-Labs benchmark).
         │
         ▼  PreToolUse hook
STAGE 2 — RTK: shell command output compressed
  grep -r "import pandas" .  →  rtk grep -r "import pandas" .
  Measured: 93.8% avg saving on file reads, 15–100% on diffs.
         │
         ▼  tool executes
STAGE 3 — Headroom: large results filtered before context
  Fires only when saving > 15%. Caps output, dedupes repeated lines.
         │
         ▼
STAGE 4 — Lean code: less code written = fewer output tokens
  Before writing: does this exist? stdlib? one line?
         │
         ▼
STAGE 5 — Caveman: shorter responses
  Drops filler, articles, pleasantries from Claude's replies.
         │
         ▼  Stop hook
STAGE 6 — engine/: the shared lifecycle + memory layer
  tea-lifecycle-hook.js fires on every event, for BOTH Claude Code and Codex.
  Writes observations.jsonl + session-handoffs, tracks session rollover,
  exposes it all through an MCP server (observe_add, observe_search, memory_health...).
```

---

## What's actually in this repo

```
crisp/
├── LICENSE                    # MIT — covers CRISP's own code + engine/
├── THIRD_PARTY_NOTICES.md     # exact upstream license per dependency
├── CREDITS.md                 # who built what
├── claude/
│   ├── CLAUDE.md               # Drop-in global config
│   ├── settings.json           # Hook wiring for Claude Code
│   ├── hooks/
│   │   ├── headroom_filter.py  # PostToolUse: compress tool results, logs gain
│   │   ├── auto_handover.py    # Stop: memory-candidate staging (trimmed, see above)
│   │   ├── usage_tracker.py    # Stop: logs response word/char count
│   │   ├── usage_report.py     # manual: `rtk gain` equivalent for Headroom + response length
│   │   ├── session_start_mem.py # SessionStart: load prior session context
│   │   └── skill_suggest.py    # UserPromptSubmit: suggest missing skills
│   └── skills/
│       ├── token-kit/          # Unified: caveman + TEA + RTK behavior
│       ├── headroom/           # Tool output compression patterns
│       ├── context-engineer/   # Session + CLAUDE.md optimization
│       ├── agent-orchestration/ # CRISP's own short fan-out/pipeline/handoff cheatsheet
│       ├── graphify/           # Vendored as-is (MIT, see LICENSE inside)
│       └── karpathy-guidelines/ # LLM-coding-discipline principles (vendored, MIT)
├── codex/
│   └── AGENTS.md               # Same pipeline for Codex — real wiring, see below
├── engine/                    # ex-token-efficient-agent-kit, merged in whole
│   ├── cli/tea.js              # stats, vault, observe, session-rollover, wake, cost, instincts...
│   ├── mcp-server/              # the token-efficient-agent MCP server
│   ├── adapters/
│   │   ├── generic-hooks/      # tea-lifecycle-hook.js — shared by every host
│   │   ├── claude-code/        # install-hooks.ps1, agent defs
│   │   ├── codex/               # notify-multiplexer.ps1, AUTOMATION_AGENTS_SNIPPET.md
│   │   └── (cursor/, windsurf/, gemini-cli/, chatgpt/, hermes/, ...)
│   ├── memory-vault/            # TEMPLATE ONLY — your real vault populates locally, never committed
│   └── docs/                    # full engine docs (LAYMAN_GUIDE.md is the best start)
├── install.ps1                 # Windows installer — both Claude Code and Codex
└── install.sh                  # Mac/Linux installer — Claude Code fully, Codex partially (see below)
```

---

## Quick start — Windows (both hosts)

```powershell
git clone https://github.com/mohitgargcanada-max/crisp
cd crisp
./install.ps1
```

This installs Claude Code hooks + skills, merges `CLAUDE.md`, and for Codex:
appends the automation block into `~/.codex/AGENTS.md`, prints the MCP server
snippet for you to paste into `~/.codex/config.toml` (never auto-edited — it can
hold secrets), and prints the notify-wiring line for session-rollover tracking.

Install RTK separately (it's a binary, not vendored):
```bash
cargo install rtk
```

Three more things (claude-mem, superpowers, Anthropic's code-review plugin)
are real Claude Code *plugins* — namespaced skills and/or their own hooks, so
copying files in flat would break them. `install.ps1`/`install.sh` check
whether each is installed and print the exact `/plugin marketplace add` +
`/plugin install` command for any that aren't — see
[EXPLAINED.md](EXPLAINED.md#companion-plugins--recommended-not-included) for
what each one does and why it's a companion, not a vendored file. (Andrej
Karpathy's skill is *not* in this list — it's a single self-contained skill
with no cross-references, so it's vendored directly instead, replacing the
old `lean-code-agent`.)

## Quick start — Mac/Linux

```bash
chmod +x install.sh && ./install.sh
```

Claude Code side is fully automated, same as Windows. Codex side: the MCP server
and `tea.js` CLI work fully; the automatic notify→turn-tracking hook
(`engine/adapters/codex/notify-multiplexer.ps1`) is PowerShell/Windows-only today
— a shell port is a known gap, not yet built.

---

## Dashboard — see what each service is actually saving

```powershell
node <path-to-crisp>/engine/cli/tea.js dashboard --repo <path-to-a-code-repo>
```

Generates a self-contained HTML report at `engine/.tea-stats/dashboard.html`
(pass `--out <file>` for a different path, `--json` for raw data instead of
HTML) showing, per service: messages sent, commands run, responses logged,
sessions started, and tokens/characters saved — pulled from what each hook
actually logs (RTK via `rtk gain -f json`, Headroom's own
`headroom-savings.jsonl`, TEA's `token-savings.jsonl`, Caveman's
`response-log.jsonl`, Lean code's `lean-debt:` marker count + git code-volume
trend for whatever repo `--repo` points at, defaulting to the current
directory). No estimates beyond what each tool already records; if a service
hasn't fired yet, its card says so instead of showing a fake zero.

---

## How to verify it's working

**RTK** (after a week of use):
```bash
rtk gain          # total savings
rtk gain --history  # per-command breakdown
```

**Headroom / Caveman trend**:
```
python ~/.claude/hooks/usage_report.py
```

**Session rollover / memory** (either host):
```powershell
node <path-to-crisp>/engine/cli/tea.js session-rollover status
node <path-to-crisp>/engine/cli/tea.js stats
```

**Claude Code**: new session should print `[SESSION] Turn counter reset to 0.`

**Codex**: check `~/.codex/AGENTS.md` for the block between
`<!-- CRISP:AUTOMATION_SNIPPET:START -->` / `:END` markers.

---

## Manual install (no script)

```bash
# Claude Code hooks + skills
cp claude/hooks/*.py ~/.claude/hooks/
cp -r claude/skills/* ~/.claude/skills/
cat claude/CLAUDE.md >> ~/.claude/CLAUDE.md   # append, don't replace
# merge the "hooks" block from claude/settings.json into your existing settings.json

# Codex
cat engine/adapters/codex/AUTOMATION_AGENTS_SNIPPET.md >> ~/.codex/AGENTS.md
# paste the MCP server block (see engine/adapters/codex/README.md) into ~/.codex/config.toml
```

---

## Requirements

- Claude Code with hooks support (~v0.117+)
- Python 3.8+ (Claude Code hook scripts)
- Node.js (engine/ CLI + MCP server)
- RTK binary — install separately, see above
- Codex CLI (for Codex integration)

---

## Credits & License

CRISP is integration work — we wired existing tools together, and (as of this
consolidation) merged our own engine in as part of the same repo. Full credits
in [CREDITS.md](CREDITS.md); exact upstream licenses per dependency in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

**License:** MIT for CRISP's own code and the merged `engine/` — see
[LICENSE](LICENSE). Third-party skills keep their own upstream license; see
THIRD_PARTY_NOTICES.md before redistributing further.

# CRISP — Compressed Retrieval & Intelligent Signal Pipeline

> Full-stack token compression for Claude Code + OpenAI Codex.  
> Attacks every stage of the AI coding pipeline — not just one end.

---

## Honest numbers

Most token-saving tools publish benchmark numbers from ideal conditions.
Here's what we actually measured from real usage data:

| Tool | Measured on | Real saving | How we know |
|---|---|---|---|
| **RTK** | 9,337 commands over ~3 months | **93.8% on file reads, 15–100% on git diffs** | `rtk gain` — live telemetry |
| **Caveman** | Response length | ~65–75% fewer words | Author's benchmark — not independently verified |
| **Headroom** | Tool output compression | >15% saving threshold before it fires | Built-in — fires only when it helps |
| **TEA lifecycle hooks** | 567 hook events | ~0% net saving at hook level | Our own data — TEA adds metadata, doesn't compress |
| **Lean code** | Code length | ~54% less code generated | Author's controlled benchmark — varies by task |

**What this means:** RTK is the proven workhorse. Everything else helps but lacks independent measurement. Your actual results will vary — run `rtk gain` after a week to see your real numbers.

---

## The pipeline

```
YOUR PROMPT (nothing touches this — compressing intent loses meaning)
         │
         ▼
STAGE 1 — TEA: Claude thinks efficiently
  Search before read. Graphify before source. Verdict first.
  No token measurement — it's a behavior change, not a filter.
         │
         ▼  PreToolUse hook
STAGE 2 — RTK: shell command output compressed
  grep -r "import pandas" .  →  rtk grep -r "import pandas" .
  Strips color codes, timestamps, duplicates from output.
  Measured: 93.8% avg saving on file reads, 15–100% on diffs.
         │
         ▼  tool executes
STAGE 3 — Headroom: large results filtered before context
  Fires only when saving > 15%. Caps output at 3000 chars.
  Dedupes repeated lines. Extracts top-level JSON keys.
  No historical data yet — newly added.
         │
         ▼
STAGE 4 — Lean code: less code written = fewer output tokens
  Before writing: does this exist? stdlib? one line?
  Author claims ~54% less code. Unverified in general use.
         │
         ▼
STAGE 5 — Caveman: shorter responses
  Drops filler, articles, pleasantries from Claude's replies.
  Author claims ~65–75% fewer words. Feels accurate in practice.
```

---

## What's actually in this repo

```
crisp/
├── claude/
│   ├── CLAUDE.md              # Drop-in global config
│   ├── settings.json          # Hook wiring for Claude Code
│   ├── hooks/
│   │   ├── headroom_filter.py # PostToolUse: compress tool results
│   │   ├── auto_handover.py   # Stop: memory staging + handover at 13 msgs
│   │   ├── session_start_mem.py # SessionStart: load prior session context
│   │   └── skill_suggest.py   # UserPromptSubmit: suggest missing skills
│   └── skills/
│       ├── token-kit/         # Unified: caveman + TEA + RTK behavior
│       ├── headroom/          # Tool output compression patterns
│       ├── context-engineer/  # Session + CLAUDE.md optimization
│       └── superpowers/       # Multi-agent orchestration patterns
├── codex/
│   ├── AGENTS.md              # Same pipeline for Codex CLI
│   └── hooks/
│       ├── pre-tool.js        # RTK equivalent for Codex
│       ├── post-tool.js       # Headroom equivalent for Codex
│       └── session-end.js     # Memory + handover for Codex
├── examples/
│   └── web-project.md         # Example workflow with real output
├── install.ps1                # Windows installer
└── install.sh                 # Mac/Linux installer
```

---

## Quick start — Claude Code

```bash
# 1. Clone
git clone https://github.com/mohitgargcanada-max/crisp
cd crisp

# 2. Install (Windows)
./install.ps1

# 2. Install (Mac/Linux)
chmod +x install.sh && ./install.sh
```

Then install RTK separately (it's a binary, not included):
```bash
cargo install rtk
```

Open a new Claude Code session. You should see:
```
[SESSION] Turn counter reset to 0.
```
That confirms hooks are active.

---

## Quick start — Codex

```bash
# Copy to your project root
cp crisp/codex/AGENTS.md ./AGENTS.md
mkdir -p .codex/hooks
cp crisp/codex/hooks/*.js .codex/hooks/
```

---

## How to verify it's working

**RTK** (after a week of use):
```bash
rtk gain          # total savings
rtk gain --history  # per-command breakdown
```

**Headroom** (check hook error log):
```
~/.claude/hooks/hook-errors.log  # empty = working fine
```

**Caveman**: just look at Claude's responses — no "Sure! I'd be happy to help..."

**Session rollover**: at turn 8 you'll see `[ROLLOVER] Turn 8 — write handoff...`

---

## Manual install (no script)

```bash
# Hooks
cp claude/hooks/*.py ~/.claude/hooks/

# Skills
cp -r claude/skills/* ~/.claude/skills/

# CLAUDE.md — append, don't replace
cat claude/CLAUDE.md >> ~/.claude/CLAUDE.md

# settings.json — merge the "hooks" block manually into your existing file
# See claude/settings.json for the exact hook entries to add
```

---

## Requirements

- Claude Code with hooks support (~v0.117+)
- Python 3.8+ (hook scripts)
- RTK binary — [install separately](https://github.com/rusttokenkit/rtk)
- Codex CLI v0.9+ (for Codex hooks)

---

## Credits

CRISP is integration work — we wired existing tools together. Full credits in [CREDITS.md](CREDITS.md).

The tools doing the real work:
- **RTK** — the proven savings engine (93.8% on file reads)
- **Caveman** by [JuliusBrussee](https://github.com/JuliusBrussee/caveman)
- **Headroom** by [headroomlabs-ai](https://github.com/headroomlabs-ai/headroom)
- **Lean code / Ponytail** by [DietrichGebert](https://github.com/DietrichGebert/ponytail)
- **TEA** (token-efficient-agent-kit) — session lifecycle management
- **Superpowers** by [obra](https://github.com/obra/superpowers)
- **Claude-mem** by [thedotmack](https://github.com/thedotmack/claude-mem)

---

## License

MIT

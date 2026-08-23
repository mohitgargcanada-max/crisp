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
| **Headroom** | Tool output compression | >15% saving threshold before it fires | `usage_report.py` — live telemetry (added 2026-08-18) |
| **TEA lifecycle hooks** | 567 hook events | ~0% net saving at hook level | Our own data — TEA adds metadata, doesn't compress |
| **Lean code** | Code length | ~54% less code generated | Author's controlled benchmark — varies by task |
| **Caveman** (response length) | N/A yet | not a savings % — no verbose baseline exists | `usage_report.py` — logs real words/response from this date forward |

**What this means:** RTK and Headroom are now both measured from live telemetry. Lean code and Caveman's *savings* claims are still unverified — there's no shadow "verbose version" logged anywhere to diff against — but Caveman's response-length *trend* is tracked starting 2026-08-18, so drift is at least visible even if a clean before/after isn't. Run `rtk gain` and `python ~/.claude/hooks/usage_report.py` after a week to see your real numbers.

---

## The pipeline

```
YOUR PROMPT (nothing touches this — compressing intent loses meaning)
         │
         ▼
STAGE 1 — TEA: Claude thinks efficiently
  Search before read. Graphify before source. Verdict first.
  If graphify-out/graph.json exists → run `graphify query` before reading any file.
  71.5× token reduction per query vs loading raw files (Graphify-Labs benchmark).
  No token measurement at hook level — it's a behavior change, not a filter.
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
  Every firing event logged to usage-stats/headroom-savings.jsonl.
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
         │
         ▼  Stop hook
STAGE 6 — usage_tracker: real response length logged
  Every assistant turn's word/char count -> usage-stats/response-log.jsonl.
  Not a savings % (no verbose baseline) — but makes the trend checkable
  instead of taking Stage 5's claim on faith.
```

---

## What's actually in this repo

```
crisp/
├── claude/
│   ├── CLAUDE.md              # Drop-in global config
│   ├── settings.json          # Hook wiring for Claude Code
│   ├── hooks/
│   │   ├── headroom_filter.py # PostToolUse: compress tool results, logs gain
│   │   ├── auto_handover.py   # Stop: memory staging + handover at 13 msgs
│   │   ├── usage_tracker.py   # Stop: logs response word/char count
│   │   ├── usage_report.py    # manual: `rtk gain` equivalent for Headroom + response length
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

**Headroom** (check hook error log, or real savings):
```
~/.claude/hooks/hook-errors.log     # empty = working fine
python ~/.claude/hooks/usage_report.py # real before/after chars saved
```

**Caveman response-length trend**:
```
python ~/.claude/hooks/usage_report.py  # avg words/response, by week
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
- **Graphify** by [Graphify-Labs](https://github.com/Graphify-Labs/graphify) — knowledge graph for codebase navigation (Stage 1 dependency)
- **Lean code / Ponytail** by [DietrichGebert](https://github.com/DietrichGebert/ponytail)
- **TEA** (token-efficient-agent-kit) — session lifecycle management
- **Superpowers** by [obra](https://github.com/obra/superpowers)
- **Claude-mem** by [thedotmack](https://github.com/thedotmack/claude-mem)

---

## License

MIT

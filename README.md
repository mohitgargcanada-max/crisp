# CRISP — Compressed Retrieval & Intelligent Signal Pipeline

> Full-stack token compression for Claude Code + OpenAI Codex.  
> Attacks every stage of the AI coding pipeline — not just one end.

**~70% fewer tokens. Same answers. No trade-offs on accuracy.**

---

## The problem

Most token-saving tools attack one stage. Your prompts go in raw, tool outputs flood context, and AI responses ramble. CRISP covers all five stages simultaneously.

```
YOUR PROMPT → COMMAND → EXECUTION → RESULT → AI RESPONSE
     ❌            ✅         —          ✅          ✅
  (nothing)      (RTK)              (Headroom)   (Caveman)
```

CRISP closes every gap.

---

## The pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  You type: "find all files importing pandas"                │
└──────────────────────┬──────────────────────────────────────┘
                       │  your prompt goes in raw (intentional)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 1 — TEA (Token-Efficient Agent)                      │
│  Claude thinks: search before read, slices not whole files  │
│  graphify before source, verdict first                      │
│  → decides: grep -r "import pandas" .                       │
└──────────────────────┬──────────────────────────────────────┘
                       │  PreToolUse hook fires
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 2 — RTK (Rust Token Killer)                          │
│  grep -r "import pandas" .                                  │
│  → rtk grep -r "import pandas" .                            │
│  Strips color codes, decorations, boilerplate from output   │
└──────────────────────┬──────────────────────────────────────┘
                       │  tool executes
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  RAW OUTPUT  (200 lines, 8KB)                               │
│  ./fetchers/india.py:3: import pandas as pd                 │
│  ./fetchers/india.py:3: import pandas as pd  ← duplicate   │
│  ... 197 more lines with timestamps, colors, noise ...      │
└──────────────────────┬──────────────────────────────────────┘
                       │  PostToolUse hook fires
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 3 — Headroom                                         │
│  Dedupes, strips noise, caps at 3000 chars                  │
│  [HEADROOM:Grep -71%]                                       │
│  ./fetchers/india.py:3  [×3 repeated]                       │
│  ./engines/kairos.py:1                                      │
│  ... 12 unique files                                        │
└──────────────────────┬──────────────────────────────────────┘
                       │  Claude reads compressed result
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 4 — Lean Code (Ponytail / lean-code-agent)           │
│  Before writing any new code, Claude checks:                │
│  Does this exist already? → reuse                           │
│  Is it stdlib? → use that                                   │
│  Can it be one line? → one line                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 5 — Caveman                                          │
│  "Sure! I found the following files that import pandas..."  │
│  → "12 files: fetchers/india.py:3, engines/kairos.py:1..." │
│  75% fewer words. Same information.                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Token savings by stage

| Stage | Tool | Typical saving |
|---|---|---|
| AI retrieval behavior | TEA | 20–40% fewer tool calls |
| Command output | RTK | 60–90% on shell commands |
| Tool results | Headroom | 20–95% on JSON/logs/grep |
| Code written | Lean code | ~54% less code generated |
| AI responses | Caveman | ~75% shorter responses |

**Combined: 60–80% total token reduction on a typical coding session.**

---

## What's included

```
crisp/
├── claude/
│   ├── CLAUDE.md              # Drop-in global config (caveman + TEA + rules)
│   ├── settings.json          # Hook wiring for Claude Code
│   ├── hooks/
│   │   ├── headroom_filter.py # PostToolUse: compress tool results
│   │   ├── auto_handover.py   # Stop: auto-memory + handover at 13 messages
│   │   ├── session_start_mem.py # SessionStart: load prior context
│   │   └── skill_suggest.py   # UserPromptSubmit: suggest missing skills
│   └── skills/
│       ├── token-kit/         # Merged: caveman + TEA + RTK behavior
│       ├── headroom/          # Tool output compression guide
│       ├── context-engineer/  # Session + CLAUDE.md optimization
│       └── superpowers/       # Multi-agent orchestration patterns
├── codex/
│   ├── AGENTS.md              # Drop-in Codex config (same pipeline)
│   └── hooks/
│       ├── pre-tool.js        # RTK equivalent for Codex
│       ├── post-tool.js       # Headroom equivalent for Codex
│       └── session-end.js     # Handover equivalent for Codex
├── examples/
│   ├── aurora-trading.md      # Real-world: quantitative trading system
│   ├── web-project.md         # Standard web app workflow
│   └── data-pipeline.md       # Data engineering workflow
├── install.sh                 # Linux/Mac installer
└── install.ps1                # Windows installer
```

---

## Quick start — Claude Code

```bash
# 1. Clone
git clone https://github.com/YOUR_HANDLE/crisp
cd crisp

# 2. Install hooks + skills (Windows)
./install.ps1

# 3. Install hooks + skills (Mac/Linux)
./install.sh
```

That's it. Open a new Claude Code session — the full pipeline is active.

**Manual step:** Install [RTK](https://github.com/rusttokenkit/rtk) separately (it's a binary):
```bash
cargo install rtk  # or download from releases
```

---

## Quick start — Codex

```bash
# Copy AGENTS.md to your project root
cp crisp/codex/AGENTS.md ./AGENTS.md

# Copy hooks to your project
cp -r crisp/codex/hooks ./.codex/hooks/
```

Codex reads `AGENTS.md` at startup and hooks fire on the same lifecycle events.

---

## Manual install (no script)

### Claude Code
```bash
# Hooks
cp claude/hooks/*.py ~/.claude/hooks/

# Skills
cp -r claude/skills/* ~/.claude/skills/

# Merge CLAUDE.md (don't replace — append the relevant sections)
cat claude/CLAUDE.md >> ~/.claude/CLAUDE.md

# Wire hooks in settings.json (see claude/settings.json for the hook blocks)
```

### Settings.json hook blocks to add
See [`claude/settings.json`](claude/settings.json) — copy the `hooks` block into your existing `~/.claude/settings.json`.

---

## How each tool triggers

| Tool | Trigger | You do anything? |
|---|---|---|
| TEA + Caveman | Always on (CLAUDE.md) | Nothing |
| RTK | Auto via PreToolUse:Bash hook | Nothing |
| Headroom | Auto via PostToolUse hook | Nothing |
| Lean code | Always on (CLAUDE.md) | Nothing |
| Session memory | Auto via SessionStart + Stop hooks | Nothing |
| Skill suggest | Auto via UserPromptSubmit hook | Nothing |
| Context rollover | Auto at turn 8 + message 13 | Nothing |

**Everything is zero-config after install.**

---

## Requirements

- Claude Code (any version with hooks support, ~v0.117+)
- Python 3.8+ (for hook scripts)
- RTK binary (for shell command compression) — [install separately](https://github.com/rusttokenkit/rtk)
- Codex CLI v0.9+ (for Codex hooks)

---

## Real-world example

This pipeline runs on [AURORA](https://github.com/YOUR_HANDLE/aurora-gateway) — a quantitative trading system covering US, Canada, and India markets with:
- 400+ tickers scanned daily
- 15+ data sources fetched per scan  
- Complex backtesting and signal generation

Before CRISP: sessions hit context limit mid-scan.  
After CRISP: full scan + analysis fits comfortably with 40% context to spare.

See [`examples/aurora-trading.md`](examples/aurora-trading.md) for the full workflow.

---

## Contributing

Issues and PRs welcome. If you add a new stage to the pipeline (prompt compression, memory compression, etc.) open a PR with:
1. The hook script
2. The skill SKILL.md
3. A benchmark showing token savings
4. A real-world example

---

## License

MIT

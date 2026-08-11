# Credits

CRISP is a pipeline assembled from existing best-in-class tools. We built the 
**plumbing** (hooks, wiring, integration, unified config) — not the tools themselves.

## Tools we integrated (full credit to original authors)

### RTK — Rust Token Killer
- **Author:** Unknown / community (open source)
- **Repo:** Install via `cargo install rtk` 
- **What they built:** Binary that rewrites shell commands to produce compressed output.
  60–90% savings on git, npm, test runners, file listings.
- **Our contribution:** Wired as PreToolUse:Bash hook in Claude Code + Codex.

### Caveman
- **Author:** [JuliusBrussee](https://github.com/JuliusBrussee/caveman)
- **Repo:** github.com/JuliusBrussee/caveman
- **What they built:** Claude Code skill that cuts 65% of tokens by making Claude 
  speak in compressed, filler-free prose while keeping full technical accuracy.
  Supports lite/full/ultra intensity levels.
- **Our contribution:** Merged into token-kit skill alongside TEA and RTK guidance.
  Added caveman auto-clarity rules for destructive ops and security warnings.

### Token-Efficient Agent (TEA)
- **Author:** [Mohit Garg](https://github.com/mohitgargcanada) / token-efficient-agent-kit
- **Repo:** C:/Users/mohit/tools/token-efficient-agent-kit (private)
- **What they built:** Full lifecycle hook framework (PreToolUse, PostToolUse, 
  UserPromptSubmit, SessionStart, Stop, and 15+ other events) + MCP server for 
  token tracking + memory vault + session rollover logic.
- **Our contribution:** The plumbing that connects everything. auto_handover.py,
  session_start_mem.py, skill_suggest.py all build on TEA's hook infrastructure.

### Headroom
- **Author:** [headroomlabs-ai](https://github.com/headroomlabs-ai/headroom)
- **Repo:** github.com/headroomlabs-ai/headroom
- **What they built:** Library + proxy + MCP server that compresses tool outputs,
  logs, files, and RAG chunks before they reach the LLM. 65k+ stars.
- **Our contribution:** headroom_filter.py — a lightweight PostToolUse hook 
  implementation of headroom's compression patterns, no external dependency needed.
  Covers the same gap (JSON, logs, grep, file reads) with a 50-line Python script.

### Lean Code Agent / Ponytail
- **Author:** [DietrichGebert](https://github.com/DietrichGebert/ponytail) (ponytail)
  and the Claude Code community (lean-code-agent)
- **Repo:** github.com/DietrichGebert/ponytail
- **What they built:** Skill that installs a "lazy senior developer" mindset — 
  before writing code, checks if it needs to exist, if stdlib covers it, if it's
  one line. ~54% less code generated. 99k+ stars.
- **Our contribution:** Integrated as lean-code-agent skill. Added lean-debt marker
  convention and advisory-mode guardrails.

### Context-Engineer
- **Author:** Community / assembled by CRISP
- **What they built:** Concept of engineering what goes INTO context, not just output.
- **Our contribution:** context-engineer/SKILL.md — original content documenting the 
  4 context layers, per-layer compression rules, and monthly audit process.

### Superpowers
- **Author:** [obra](https://github.com/obra/superpowers) — 94k+ stars, Anthropic marketplace
- **Repo:** github.com/obra/superpowers
- **What they built:** Orchestration primitives for multi-agent Claude Code workflows.
- **Our contribution:** superpowers/SKILL.md — adapted patterns for data pipeline and
  trading system use cases. Added AURORA-specific patterns.

### Claude-Mem
- **Author:** [thedotmack](https://github.com/thedotmack/claude-mem)
- **Repo:** Available as claude-mem@thedotmack plugin
- **What they built:** Persistent semantic memory for Claude — corpus building,
  observation logging, smart search across sessions.
- **Our contribution:** session_start_mem.py wires claude-mem search into SessionStart.
  auto_handover.py stages memory candidates per-project for promotion into claude-mem.

---

## What CRISP contributed (our original work)

| File | What's original |
|---|---|
| `claude/hooks/headroom_filter.py` | Standalone hook implementation (no headroom dependency) |
| `claude/hooks/auto_handover.py` | Project-aware memory staging + transcript-path fix |
| `claude/hooks/session_start_mem.py` | SessionStart memory injection |
| `claude/hooks/skill_suggest.py` | Prompt-pattern → skill suggestion engine |
| `claude/CLAUDE.md` | Unified always-on config (merged caveman + TEA + rules) |
| `claude/settings.json` | Hook wiring blueprint |
| `codex/AGENTS.md` | Codex port of the full pipeline |
| `codex/hooks/*.js` | Codex hook implementations |
| Pipeline concept | Naming, documenting, and connecting all 5 stages |
| This README | Layman-friendly explanation of the full pipeline |

**In short:** CRISP is integration work, not invention. We stood on the shoulders 
of excellent open-source tools and wrote the glue that makes them work together 
as a single unified pipeline.

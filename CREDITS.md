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
- **Author:** Mohit Garg — originally token-efficient-agent-kit, a separate private repo
- **Now:** merged into this repo as `engine/` (2026-08-22 consolidation) — one clone
  gets both the pipeline plumbing and the actual engine. MIT-licensed as part of CRISP.
- **What it is:** Full lifecycle hook framework (PreToolUse, PostToolUse,
  UserPromptSubmit, SessionStart, Stop, and 15+ other events) + MCP server for
  token tracking + memory vault + session rollover logic + the real Claude Code
  *and* Codex integration (`engine/adapters/`).
- **Note:** `engine/memory-vault/` ships as a template only (README + empty
  structure) — the populated version (observations, handoffs) is per-user runtime
  data and is never committed. See the privacy note in the main README.

### Headroom
- **Author:** [headroomlabs-ai](https://github.com/headroomlabs-ai/headroom)
- **Repo:** github.com/headroomlabs-ai/headroom
- **What they built:** Library + proxy + MCP server that compresses tool outputs,
  logs, files, and RAG chunks before they reach the LLM. 65k+ stars.
- **Our contribution:** headroom_filter.py — a lightweight PostToolUse hook 
  implementation of headroom's compression patterns, no external dependency needed.
  Covers the same gap (JSON, logs, grep, file reads) with a 50-line Python script.

### Lean Code Agent / Ponytail — removed 2026-08-23
- Previously credited to [DietrichGebert](https://github.com/DietrichGebert/ponytail)
  (ponytail) / the Claude Code community (lean-code-agent). Removed in favor of
  the Andrej Karpathy Skills below, which cover the same "minimal, non-speculative
  code" territory with a sharper LLM-specific framing. The lean-debt marker
  convention and the reuse/stdlib/one-line ladder itself weren't unique to this
  skill file — they're still enforced directly in `claude/CLAUDE.md` and
  `codex/AGENTS.md`'s "Code behavior (Lean)" section, and by `tea lean-stats`.
  Only the standalone third-party-inspired skill file was dropped.

### Context-Engineer
- **Author:** Community / assembled by CRISP
- **What they built:** Concept of engineering what goes INTO context, not just output.
- **Our contribution:** context-engineer/SKILL.md — original content documenting the 
  4 context layers, per-layer compression rules, and monthly audit process.

### Superpowers
- **Author:** Jesse Vincent ([obra](https://github.com/obra/superpowers))
- **Repo:** github.com/obra/superpowers
- **What they built:** A full agentic development methodology — 14 real skills
  (brainstorming, writing-plans, subagent-driven-development, systematic-debugging,
  test-driven-development, requesting/receiving-code-review, and more), its own
  hooks, and multi-harness plugin packaging. Installed via the plugin marketplace,
  not a file you copy in.
- **Our contribution:** none — not vendored. `install.ps1`/`install.sh` check
  whether it's installed and print the install command if not. CRISP's own
  `claude/skills/agent-orchestration/` is a short, independently-written
  cheatsheet covering a *much* smaller slice of the same idea (fan-out/pipeline/
  handoff patterns) — it does not claim to be, or replace, superpowers.

### Code Review (Anthropic)
- **Author:** Boris Cherny, Anthropic — ships in the `claude-code` repo itself
- **Repo:** github.com/anthropics/claude-code (`plugins/code-review/`)
- **What it does:** 4 parallel agents review a PR/diff (2× CLAUDE.md-compliance,
  1 bug detector, 1 history analyzer) with confidence-based scoring to filter
  false positives. Invoked as `/code-review [--comment]`; needs `gh` + a GitHub repo.
- **Our contribution:** none — it's Anthropic's own plugin, bundled with Claude
  Code. `install.ps1`/`install.sh` just check it's available.

### Andrej Karpathy Skills
- **Author:** forrestchang (original), distilled from
  [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876)
  on LLM coding pitfalls
- **Repo used:** [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)
  (a fork/mirror of forrestchang's original)
- **What it does:** four coding-discipline principles — think before coding
  (surface assumptions, don't guess), simplicity first (minimum code, nothing
  speculative), surgical changes (touch only what you must), goal-driven
  execution (define verifiable success criteria up front).
- **License:** MIT, declared in the upstream `.claude-plugin/plugin.json`
  (the repo itself ships no separate LICENSE file — reproduced at
  `claude/skills/karpathy-guidelines/LICENSE`).
- **Our contribution:** none to the content — **vendored as-is**
  (`claude/skills/karpathy-guidelines/SKILL.md`), unlike Superpowers/Code
  Review/Claude-Mem above: this is a single self-contained skill with no
  internal cross-references to sibling skills, so unlike those it copies in
  safely as a flat file. Replaces the removed `lean-code-agent` skill (see
  above) — same territory, sharper framing.

### Graphify
- **Author:** [Graphify-Labs](https://github.com/Graphify-Labs/graphify)
- **Repo:** github.com/Graphify-Labs/graphify
- **What they built:** Turns any codebase (code, docs, SQL schemas, configs, PDFs) into
  a queryable knowledge graph using local deterministic AST parsing. No vector store,
  no API calls — all local. A `graphify query` returns a scoped subgraph instead of
  loading raw files; on a ~92k-word corpus this is a **71.5× token reduction per query**.
  Works with Claude Code, Cursor, Codex, Gemini CLI, and 17+ other assistants.
- **Our contribution:** Documented graphify as a dependency/complement for CRISP Stage 1
  (TEA). The "graphify before source" rule in CLAUDE.md and the Graphify First section
  in the pipeline are ours; the tool and the savings are entirely theirs.

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
| `codex/AGENTS.md` | Codex port of the full pipeline, wired to the real `engine/adapters/codex/` integration (MCP server + notify + tea.js) |
| `engine/` | TEA, merged in whole — see above |
| Pipeline concept | Naming, documenting, and connecting all stages, across both Claude Code and Codex |
| This README | Layman-friendly explanation of the full pipeline |

**In short:** CRISP is integration work, not invention. We stood on the shoulders 
of excellent open-source tools and wrote the glue that makes them work together 
as a single unified pipeline. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
for exact upstream licenses and what's vendored vs. independently reimplemented.

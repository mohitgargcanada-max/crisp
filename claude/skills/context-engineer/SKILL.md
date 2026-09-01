---
name: context-engineer
description: >
  Reduces prompt token cost by engineering what goes INTO context — not just how Claude responds.
  Use when sessions are getting long, context feels bloated, or you want to structure CLAUDE.md / 
  system prompts for maximum signal-to-noise. Triggers on: "context bloat", "trim CLAUDE.md",
  "slim the prompt", "what's eating my context", "context engineering".
---

# Context Engineer

Goal: cut tokens spent on INPUT, not just output. Every token in context costs as much as every token out.

## The 4 context layers (most expensive to least)
1. **System prompt / CLAUDE.md** — loaded every turn. Bloat here = biggest leak.
2. **Tool outputs** — shell results, file reads, grep results. Compress aggressively.
3. **Conversation history** — grows with turns. Compact at 50%.
4. **User message** — usually small. Not the problem.

## Rules for each layer

### CLAUDE.md / system prompt
- One rule = one line. No prose explanations of rules.
- No examples that exist only to illustrate a rule — remove them.
- No "background context" sections — link to files instead.
- Audit monthly: delete rules not triggered in 30 days.
- Target: under 300 lines total.

### Tool output compression (what to reject before it hits context)
- Bash: never read full `ls -la` — use `ls -1` or `find -name`
- Logs: grep for ERROR/WARN only, first 50 lines max
- File reads: slice by line range, not full file
- JSON: extract only needed keys with `jq` or python one-liner
- Diffs: `git diff --stat` before `git diff` — only expand changed files
- Test output: last 20 lines + failure count only

### Conversation hygiene
- Use `/compact` manually if context is getting heavy; automatic compaction is
  controlled by the real settings (`autoCompactEnabled`/`autoCompactWindow` in
  settings.json, or `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` env var for a percentage
  threshold) — `compactThreshold` is not a real key, don't rely on it
- After compaction: re-state active constraints in next message (compact drops context)
- Don't repeat file contents across turns — reference by path:line

## Session start checklist (run silently)
1. Is graphify-out/graph.json present? → use graphify, not file reads
2. Is MEMORY.md present? → load 5 most relevant entries only
3. Any handover doc? → read "Next steps" section only

## What to strip from any context injection
- Timestamps on every log line (keep only on errors)
- "Successfully completed" / "Done" lines
- Progress bars, percentages, retry counts
- Duplicate stack frames
- Full paths when relative is unambiguous

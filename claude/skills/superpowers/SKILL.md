---
name: superpowers
description: >
  Orchestration primitives for multi-agent and parallel workflows in Claude Code.
  Use when spawning subagents, running parallel tasks, coordinating multi-step pipelines,
  or building agent-to-agent handoffs. Triggers on: "fan out", "parallel agents",
  "subagent", "orchestrate", "pipeline", "multi-step workflow", /superpowers.
---

# Superpowers — Orchestration Primitives

## Core patterns

### Parallel fan-out (independent tasks)
Spawn all at once, collect results. Use the Agent tool with multiple simultaneous calls.
```
Agent(task_A) + Agent(task_B) + Agent(task_C)  ← same message, parallel
```
Never chain independent tasks sequentially — wastes wall-clock time.

### Pipeline (dependent stages)
Stage 2 uses Stage 1's output. Must be sequential.
```
result_1 = Agent(stage_1)
result_2 = Agent(stage_2, context=result_1)
```

### Scoped subagents (protect main context)
Delegate expensive exploration to subagent → get back compact summary only.
Main context stays clean. Use for: file searches, large grep sweeps, audit tasks.

### Handoff pattern
When task is too large for one session:
1. Agent writes findings to a file
2. Main session reads the file (not the full agent output)
3. Next agent picks up from the file

## When to use vs inline work

| Use subagent | Do inline |
|---|---|
| Open-ended search (10+ files) | Known file, specific edit |
| Audit / review task | Quick grep |
| Parallel independent queries | Sequential dependent logic |
| Protecting main context | Small, fast operations |

## AURORA-specific patterns
- Bulk-fill jobs → pipeline(tickers, fetch_stage, store_stage)
- Scan + analysis → parallel(scan_agent, memory_search_agent)
- Audit tasks → subagent with tables-only output, no conclusions
- Cross-market data → parallel per market, merge results

## Token efficiency with superpowers
- Give subagents a strict output schema: "return JSON only, max 500 chars"
- Never let subagents dump full file contents back — return paths + line numbers
- Use `effort: low` for mechanical tasks (file listing, grep, format checks)

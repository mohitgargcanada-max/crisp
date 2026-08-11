---
name: headroom
description: >
  Compresses tool outputs, logs, files, and JSON before they reach LLM context.
  20% fewer tokens for coding agents, 60-95% fewer tokens for JSON/logs.
  Complements RTK (which compresses shell commands) — headroom compresses the RESULTS.
  Use when tool outputs are large, grep results are verbose, or JSON payloads are bloated.
  Triggers on: "compress output", "trim results", "tool output too long", "json bloat".
---

# Headroom — Tool Output Compression

Headroom operates AFTER the tool runs, BEFORE the result enters context.
RTK operates BEFORE the tool runs (rewrites the command).
Together they form a complete compression pipeline.

## What headroom compresses

| Output type | Technique | Typical saving |
|---|---|---|
| JSON payloads | Key filtering + minify | 60-95% |
| Log files | Error-lines only + dedup | 70-90% |
| File reads | Slice to relevant section | 40-80% |
| Bash stdout | Drop boilerplate lines | 30-60% |
| Grep results | First match per file + count | 50-70% |

## Apply headroom to every tool result

### Bash output
Strip: progress bars, timestamps, success lines, repeated errors, blank lines.
Keep: command, exit code, first unique error, line count.

### JSON
```python
# Instead of dumping full JSON, extract keys
import json
data = json.loads(raw)
print({k: data[k] for k in ['status','error','count','result']})
```

### File reads
Never read a file to understand it. Sequence:
1. `graphify query` → understand structure (if graph exists)
2. `grep -n "pattern" file` → find relevant lines
3. Read only line_start to line_end

### Log files
```bash
grep -E "ERROR|WARN|FAIL" logfile.log | tail -50 | sort -u
```

### API responses / OHLCV / financial data
Keep: ticker, date, close, volume, status.
Drop: timestamps in milliseconds, redundant OHLC when only close needed, empty fields.

## Headroom vs RTK vs Caveman

| Tool | Operates on | When |
|---|---|---|
| **Caveman** | Claude's OUTPUT (responses) | Always — strips filler from what Claude says |
| **RTK** | Shell COMMANDS | Before execution — rewrites to compressed form |
| **Headroom** | Tool RESULTS | After execution — strips bloat from what comes back |
| **Context-engineer** | CLAUDE.md + session structure | At design time — trims what's loaded each turn |

All four together = full-stack token efficiency.

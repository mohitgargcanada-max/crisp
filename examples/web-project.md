# Example: Real-world coding session with CRISP

> This is a generic example based on the author's real working system.
> Numbers come from actual `rtk gain` telemetry, not benchmarks.

---

## The scenario

A developer is working on a large Python project with 400+ source files,
multiple data sources, and daily automated jobs. They ask Claude to debug
why a scheduled job isn't triggering for a specific input.

---

## What happens at each stage

### You type the prompt (nothing touches this)

```
"why isn't the daily job triggering for item XYZ"
```

Goes in raw. CRISP never compresses your words — that would lose meaning.

---

### Stage 1 — TEA: Claude thinks before it reads

Without TEA, Claude might read 10 files to understand the codebase.

With TEA + graphify (if a knowledge graph exists):
```
graphify query "daily job trigger flow"
→ returns 150-line subgraph instead of reading 5 source files
```

Saves ~3,000–8,000 tokens before a single tool fires.
*(Behavioral change — not directly measurable, but fewer tool calls are visible in the session.)*

---

### Stage 2 — RTK: shell output compressed

Claude runs a grep to find the trigger logic:
```bash
# What Claude asks for:
grep -r "trigger" . --include="*.py"

# What RTK actually runs:
rtk grep -r "trigger" . --include="*.py"
```

**Real measured result from author's telemetry:**
- Raw grep output: ~900 lines with file paths, line numbers, color codes
- After RTK: ~760 lines, duplicates removed, decoration stripped
- Saving: ~15% on grep (RTK's weakest command)
- On file reads (`rtk read`): **38.8% average** across 722 real calls
- On git diffs: **99.9%** (strips unchanged context, keeps only changed hunks)

---

### Stage 3 — Headroom: large results capped before context

Claude reads a config JSON to check job settings. File is 12KB.

```
Raw JSON: 12,847 chars, 340 keys, deeply nested
Headroom: extracts top-level keys only → 380 chars
[HEADROOM:Read -97%]
{"schedule": "0 9 * * *", "enabled": true, "threshold": 40, "market": "XYZ"}
```

Claude now has the answer in 4 fields instead of 340.
Headroom only fires when saving > 15% — small files pass through unchanged.

---

### Stage 4 — Lean code: the fix stays small

Claude finds the bug: threshold is hardcoded, should read from config.

Without lean code mindset — might add a config class, validation, logging:
```python
# 15 lines of "proper" implementation
class ThresholdConfig:
    def __init__(self, config_path):
        ...
```

With lean code:
```python
# 1 line
threshold = config.get("threshold", 40)
```

Same fix. 14 fewer lines of code to review, test, and maintain.

---

### Stage 5 — Caveman: response is tight

**Without Caveman:**
> "Great question! I've investigated the issue and found that the daily job
> isn't triggering for item XYZ because the threshold value is hardcoded to
> 40 in the scheduler rather than reading from your configuration file.
> I've gone ahead and updated the code to use config.get()..."

**With Caveman:**
> "Bug: threshold hardcoded at 40, not reading config.
> XYZ score=34, needs ≥40. Fix: `threshold = config.get('threshold', 40)`"

Same information. ~80% fewer words.

---

## Cumulative effect over a full session

From the author's real `rtk gain` data across 3 months:

```
rtk gain

Total commands:    9,336
Tokens saved:      96.9M  (93.8% avg)
Biggest win:       rtk read — 69.3M tokens saved across 722 file reads
```

The compounding effect: when every file read, every grep, every git diff
comes back compressed, a session that would hit context limits in 8 turns
runs cleanly for 20+ turns.

---

## What CRISP doesn't do

- **Compress your prompts** — your intent goes in exactly as written
- **Guarantee savings on every call** — Headroom skips calls with <15% gain,
  RTK passes through commands it can't improve
- **Replace good prompting** — a vague prompt still gets a vague answer,
  just in fewer words

---

## Measure your own results

```bash
# After a week of use:
rtk gain              # total savings
rtk gain --history    # per-command breakdown

# Check Headroom is running:
cat ~/.claude/hooks/hook-errors.log   # empty = no errors
```

Your numbers will differ from ours. RTK's biggest wins are on large file reads
and git diffs — if your workflow is grep-heavy, expect 15–25%, not 93%.

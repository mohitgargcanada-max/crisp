---
name: lean-code-audit
description: Use to audit a repo or feature for unnecessary surface area, abstraction debt, duplicated logic, and token-costly context. Triggers: /lean-audit, lean audit, minimal-code audit, simplify this repo.
---

# Lean Code Audit

Goal: find the biggest simplification wins with narrow reads first.

Audit mode is advisory. Suggest simplifications; do not apply or delete code unless the user explicitly asks.

## Workflow

1. Inspect file tree and hotspots before reading full files.
2. Rank by likely code volume, duplicated concepts, and high-churn surfaces.
3. Read only the files needed to prove each issue.
4. Recommend deletion/reuse before rewrite.

## Output

```text
Verdict: <top simplification opportunity>.
Evidence:
- <path>: <why it costs code/tokens>
- <path>: <smaller replacement>
Next:
- <first safe edit/check>
```

Avoid broad rewrites unless the user asks to implement the audit.

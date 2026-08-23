---
name: lean-code-debt
description: Use to track or scan deferred shortcuts and simplification notes. Triggers: /lean-debt, lean debt, shortcut ledger, token debt, scan debt.
---

# Lean Code Debt

Goal: make temporary shortcuts visible without creating a heavy process.

## Marker

Use one-line markers only when a shortcut is intentional:

```text
lean-debt: <reason>; remove when <condition>
```

Good marker:

```text
lean-debt: local heuristic avoids model call; remove when hosted tokenizer is available
```

## Scan Output

Group by path and keep each hit one line:

```text
<path>:<line> <marker>
```

End with total count and the riskiest item.


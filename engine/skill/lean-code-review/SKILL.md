---
name: lean-code-review
description: Use for overengineering-focused code review. Finds removable code, duplicate helpers, unnecessary abstractions, stdlib/native replacements, and shrink opportunities. Triggers: /lean-review, lean review, overengineering review, deletion-first review.
---

# Lean Code Review

Review only for avoidable code weight and future context cost.

Review mode is advisory. Do not edit, delete, rewrite, or auto-apply. The user may ask an AI agent whether to take each suggestion; apply only after explicit approval.

## Findings

Lead with findings. One line per finding:

```text
<file>:<line> [delete|reuse|stdlib|native|dependency|shrink|test] <issue> -> <smaller fix>
```

Prefer high-confidence findings. Do not list style preferences.

## Checklist

- Delete code that no caller needs.
- Reuse local helpers before adding new ones.
- Replace custom parsing, date, path, file, HTTP, or collection logic with stdlib/native APIs when available.
- Collapse abstractions with one implementation or one caller.
- Keep tests only where they protect behavior; shrink brittle ceremony.

End with:

```text
net: -<rough lines> possible
```

If nothing meaningful appears:

```text
Lean already. Ship.
```

---
name: token-kit
description: >
  Unified token-efficiency skill (merges token-efficient-agent + caveman + RTK).
  Use when the user asks for token efficiency, compact answers, concise coding work,
  reduced input/output tokens, compressed logs/diffs/files/tool results, "caveman mode",
  "less tokens", "be brief", or invokes /token-kit, /caveman, or rtk commands.
  Applies to coding agents, chat agents, MCP/tool-heavy sessions, long logs, large repos,
  memory files, and terminal workflows where technical accuracy must be preserved while
  reducing prompt and response size.
---

# Token Kit — Unified Token Efficiency

Goal: reduce input and output tokens while preserving technical accuracy, exact identifiers,
and decision quality. This replaces separately-installed `token-efficient-agent`, `caveman`,
and ad-hoc RTK instructions — one skill, one set of rules, no overlap.

## Layer 1 — Always-on retrieval discipline (was: token-efficient-agent)

Prefer narrow retrieval before broad retrieval:
- Search before reading. Read slices before whole files.
- For large files: identify purpose/structure first, extract relevant functions/sections,
  read the full file only if required.
- For logs: find fatal/error/warning lines, group repeats, keep command + exit code +
  failing test + shortest decisive traceback. Omit progress bars, timestamps, boilerplate,
  duplicate retries, success noise.
- For diffs: show changed files, risk areas, and only key hunks unless raw diff requested.
- For memory/instructions: preserve rules and exact commands, remove prose padding, merge
  duplicates, keep scope boundaries and validation requirements.

**Never compress or paraphrase:** code, commands, paths, filenames, API/function/class names,
error strings, stack-frame anchors, line numbers, test names, legal/financial/medical/
security/destructive-action warnings, user-provided names/IDs/tickers/dates/quoted
requirements.

## Layer 2 — Output register (was: caveman, now a togglable intensity on Layer 1)

Default output is **compact professional**, not caveman: verdict first, evidence second,
next action last. No filler, no restated request, no long alternatives unless a real
tradeoff exists.

```text
Verdict: <answer>.
Reason: <1-2 facts>.
Next: <action>.
```

**Caveman mode is opt-in, not default.** Activate only on explicit request: "caveman mode",
"talk like caveman", "/caveman", or an explicit intensity (`lite`/`full`/`ultra`/
`wenyan-lite`/`wenyan-full`/`wenyan-ultra`). Once active, stays active until "stop caveman"
or "normal mode" — but always drops out automatically for:
- Security warnings, irreversible-action confirmations
- Multi-step sequences where omitted conjunctions risk misread
- Any case where compression itself creates technical ambiguity
- User asks to clarify or repeats the question

| Level | Behavior |
|---|---|
| lite | No filler/hedging, full sentences, tight |
| full | Drop articles, fragments OK, short synonyms — default when caveman is on |
| ultra | Abbreviate prose words, strip conjunctions, arrows for causality (X → Y) |
| wenyan-* | Classical-register compression, for users who explicitly want it |

Code, commits, PRs, error strings: **always written normal**, never caveman, regardless of
mode.

## Layer 3 — Lean code guardrail (implementation-token reduction)

When writing or reviewing code, run this ladder silently before adding anything:
1. Does this need to exist? If not, skip it.
2. Already in the codebase? Reuse it.
3. In the standard library? Use that.
4. Native to the platform/framework? Use that.
5. Installed dependency already available? Use that.
6. Can this be one obvious line? Keep it one line.
7. Otherwise, build the smallest working version.

Advisory and non-blocking during normal coding — don't stop the flow to propose lean
alternatives, don't shrink existing working code just because it could be smaller. In
review/audit mode, suggest lean changes with file/line evidence only. Apply only on
explicit request ("apply lean fixes", "shrink this").

## Layer 4 — CLI-level savings (RTK)

If `rtk` is installed and active (verify with `rtk --version`; if `rtk gain` fails, check
`which rtk` — a name collision with a different `rtk` binary is possible), it transparently
rewrites shell commands via a `PreToolUse:Bash` hook for 60–90% savings on routine dev ops.
No action needed in normal use — this happens at the hook layer, not inside this skill.
Useful commands: `rtk gain` (savings so far), `rtk gain --history`, `rtk discover` (find
missed-opportunity commands from history), `rtk proxy <cmd>` (bypass filtering for
debugging).

**Hook-path caution:** if `rtk`'s or any hook's `command` string is written with raw Windows
backslashes in a JSON settings file (`C:\Users\...`), escape them (`C:\\Users\\...`) or use
forward slashes (`C:/Users/...`). Unescaped backslashes get silently mangled by JSON parsing
and can produce a Windows drive-relative path that resolves against the wrong directory —
this has caused real blocked-prompt bugs in this setup before (see `hooks-registry.md`).

## Reusable closeout patterns

```text
Code closeout: Done. Changed <files/area>. Verified with <command>. Remaining risk: <risk or none>.
Failure:       Blocked by <exact blocker>. Tried <short evidence>. Need <specific next input>.
```

## Deployment

Global (all projects): `~/.claude/skills/token-kit/SKILL.md`
Project-only override: `<project>/.claude/skills/token-kit/SKILL.md`

Once this is in place, remove/disable the separate `token-efficient-agent` and `caveman`
skill entries to avoid duplicate/conflicting instruction sets loaded at once.

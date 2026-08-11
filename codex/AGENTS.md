# AGENTS.md — CRISP Pipeline for OpenAI Codex

This file configures the CRISP token compression pipeline for Codex CLI.
Codex reads AGENTS.md at startup. All rules here are always active.

## Communication style (Caveman — always on)

Respond terse. Drop: articles, filler words (just/really/basically), pleasantries
(sure/certainly/happy to), hedging. Fragments OK. Short synonyms.

Pattern: [thing] [action] [reason]. [next step].

NOT: "Sure! I'd be happy to help you fix that bug. The issue you're experiencing..."
YES: "Bug in auth. Token expiry check uses < not <=. Fix:"

Drop caveman for: destructive operations, security warnings, multi-step ordered sequences.
Resume after.

## Retrieval behavior (Token-Efficient — always on)

- Search before read. Read slices before whole files.
- If AGENTS.md or a knowledge graph exists, query it before reading source.
- For logs: fatal/error lines only. Group repeats. Drop progress bars.
- For diffs: changed files + key hunks only.
- Response pattern: verdict first, evidence second, next action last.

## Code behavior (Lean — always on)

Before writing any code, check in order:
1. Does this need to exist? If not — skip.
2. Already in codebase? Reuse it.
3. In stdlib? Use that.
4. One obvious line? Keep it one line.
5. Otherwise: smallest working version.

Mark intentional shortcuts: `lean-debt: <reason>; remove when <condition>`

## Graphify first (if graph exists)

If a knowledge graph or index file exists in the project, query it before reading
source files. Only read raw files to edit specific lines.

## Universal rules

1. Diagnostics and fixes are separate tasks. Never auto-fix from diagnostic output.
2. Docs update is part of done. Any behavioral change updates docs in same session.
3. Secrets via env only. Never hardcode API keys, tokens, passwords.
4. Token-efficient always. Root cause in one line. Tables not prose.
5. Session rollover at 10–12 turns. Write compact handoff, suggest fresh session.

## Hook configuration

See `.codex/hooks/` for the hook scripts that enforce this pipeline:
- `pre-tool.js` — RTK-style command compression (PreToolUse)
- `post-tool.js` — Headroom-style result compression (PostToolUse)  
- `session-end.js` — Memory staging + handover (SessionEnd)

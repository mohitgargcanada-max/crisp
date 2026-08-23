# Memory Map

Keep this file compact. It is the first fallback memory an agent should read.

## User Rules

- Token-efficient output by default: verdict first, compact evidence, next action last.
- Lean-code suggestions are advisory by default; apply only when explicitly requested.
- Do not save secrets, API keys, passwords, tokens, or private documents as memory.

## Projects

### token-agent-kit

- repo: <CRISP_HOME>
- purpose: compact agent behavior, lean-code guardrails, memory-map workflow, MCP/CLI helpers.

## Commands

- stats: `node <CRISP_HOME>\cli\tea.js stats`
- lean ladder: `node <CRISP_HOME>\cli\tea.js lean`

## Open Loops

- Wire AI Chat Exporter to a local bridge later.
- Add optional Supermemory sync later.


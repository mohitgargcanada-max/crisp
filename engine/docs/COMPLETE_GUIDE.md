# Token Efficient Agent Kit: Complete Guide

This guide explains the whole system in plain English.

The short version:

```text
The agent should remember more, read less, say less, and still keep the important details exact.
```

It is not only a prompt compressor. It is a small operating style for AI agents: compact answers, compact tool output, lean coding habits, durable memory, and optional web-chat helpers.

## The Main Analogy

Think of an AI session like a work desk.

- The context window is the desk.
- Current chat is the paper already on the desk.
- `memory-map.md` is the small notebook beside the desk.
- An Obsidian/GitHub-backed vault is the organized filing cabinet with version history.
- Supermemory is the smart librarian who can find the right page.
- AI Chat Exporter is the browser-side assistant that can prepare text before it is sent.

The mistake is trying to put the entire filing cabinet on the desk. That wastes space and makes the agent slower. The better approach is to keep the desk clean, look up only what matters, and bring back a tiny useful note.

## What Problem This Solves

Claude, Codex, ChatGPT, Cursor, and other agents all have limited working context. They can forget project decisions, paths, commands, user preferences, or why something was built a certain way.

At the same time, adding too much memory to every prompt makes the problem worse. The agent becomes expensive, noisy, and sometimes less accurate.

This kit aims for the middle path:

```text
Do not remember everything in the prompt.
Remember where to look.
Fetch only the useful facts.
Compress those facts before using them.
```

## Product Philosophy

The system should feel like an autopilot, not a control panel.

Most behavior should happen quietly:

- Shorten noisy logs.
- Summarize diffs.
- Preserve exact commands and errors.
- Prefer smaller code.
- Search memory when context is missing.
- Track token savings.

The user should only be interrupted when the action has risk, privacy impact, cost, or destructive potential.

## Behavior Split

### Automatic Background

These are low-risk and should usually happen without asking:

- Use verdict-first replies.
- Compress noisy logs, diffs, and terminal output.
- Search before reading whole files.
- Use the lean-code ladder silently while implementing.
- Recall small project facts when the task clearly needs them.
- Save obvious durable project facts when allowed by the local policy.
- Track estimated token savings.

### Suggest, Then Wait

These should appear as suggestions:

- "Save this decision to memory?"
- "Recall project memory?"
- "Use the memory map for this repo?"
- "This code can be smaller; apply lean fix?"
- "Insert project map into the browser prompt?"

### Require Explicit Approval

These should not happen silently:

- Delete or rewrite working code only because it could be smaller.
- Save personal or sensitive information.
- Save secrets, API keys, passwords, private tokens, or credentials.
- Send private local files to a hosted service.
- Sync a vault to cloud memory.
- Auto-submit a browser prompt.
- Forget or erase memory.
- Install or start background services.

## The Core Layers

### 1. Token Efficient Agent

This is the base behavior.

It tells the agent to:

- Answer with the verdict first.
- Keep evidence compact.
- Preserve exact identifiers.
- Avoid filler.
- Read narrowly.
- Compress noisy inputs.
- Fetch raw detail only when needed.

Good output looks like:

```text
Done. Changed CLI memory-map docs. Verified with node --check. Remaining risk: none.
```

Not:

```text
Absolutely, I would be happy to explain in detail...
```

### 2. Lean Code Agent

This keeps implementation small without interrupting normal coding.

Before writing new code, the agent silently checks:

1. Does this need to exist?
2. Is it already in the codebase?
3. Is it in the standard library?
4. Is it native to the platform or framework?
5. Is an installed dependency already available?
6. Can this be one obvious line?
7. Otherwise, build the smallest working version.

Important rule:

```text
Lean suggestions are advisory by default.
The agent does not delete or shrink existing working code unless the user explicitly asks.
```

### 3. Memory Map

The memory map is the compressed notebook.

It should store the important things the agent often needs:

- User preferences.
- Stable rules.
- Repo paths.
- Project decisions.
- Commands that worked.
- Known setup state.
- Gotchas.
- Open questions.

Example:

```text
## token-agent-kit
- repo: <CRISP_HOME>
- rule: lean-code suggestions are advisory by default
- command: node cli\tea.js stats

## ai-chat-exporter
- repo: <CRISP_HOME>\ai-chat-exporter
- browser rule: reload extension after manifest/content-script changes
```

The memory map should not be a diary of everything. It should be a compact index of what matters.

### 4. Obsidian Vault

An Obsidian vault is just a folder of markdown files.

That makes it useful here because it is:

- Local-first.
- Human-readable.
- Easy to search.
- Easy to back up with Git.
- Easy for agents to read as plain text.

A good vault shape:

```text
<CRISP_HOME>\memory-vault/
  00-index.md
  rules.md
  memory-map.md
  commands.md
  projects/
    token-agent-kit.md
    ai-chat-exporter.md
  decisions/
    2026-06-24-lean-advisory.md
  concepts/
    token-efficiency.md
    memory-map.md
```

Obsidian does not give memory to agents by itself. It gives us a clean markdown source of truth. Agents or Supermemory can then search it.

GitHub can back up and sync this same vault. The safest model is a private repository:

```text
local token-efficient-agent-kit/memory-vault/
-> private GitHub repo
-> another computer clones/pulls it
-> local agents still read markdown from disk
```

GitHub is storage and version history, not semantic search. Supermemory can still be added later as an optional semantic index over approved notes.

### 5. Supermemory

Supermemory is the searchable archive.

The best use is not "load all memories every time." The best use is:

```text
Ask a narrow question.
Get the top few relevant memories.
Compress them.
Inject only the useful facts.
```

Recommended flow:

```text
Current chat first
-> memory-map.md if context is missing
-> Supermemory recall if local map is not enough
-> compressed facts into the task
```

Use project scoping whenever possible:

```text
containerTag: token-agent-kit
containerTag: ai-chat-exporter
containerTag: codex-setup
```

This keeps work, personal context, repos, and experiments separate.

### 6. AI Chat Exporter For Web

Web ChatGPT and Claude.ai usually cannot silently read local files or use local MCP tools.

The browser extension can bridge that gap.

Ideal floating panel:

```text
Compress Draft
Recall Memory
Save Memory
Insert Project Map
Export Chat
```

Safe behavior:

- Never auto-submit.
- Insert or preview only.
- Show token savings.
- Ask before saving sensitive memory.
- Use a local bridge server for filesystem access.

The extension should not read the whole disk. It should call a small local server that exposes only safe endpoints.

Example future bridge:

```text
POST /compress
GET  /memory/recall?q=token-agent-kit
POST /memory/add
GET  /memory/map
```

## How The Agent Should Work In Practice

### Coding Task

User says:

```text
fix the compress button in ai-chat-exporter
```

Agent behavior:

1. Check current chat.
2. Recall project path if missing.
3. Read only relevant extension files.
4. Use lean-code ladder silently.
5. Make small edit.
6. Run focused check.
7. Final reply compactly.
8. Save durable decision if useful.

Possible final:

```text
Done. Merged the compress action into the floating exporter panel. Verified content script syntax. Saved memory: reload extension after content-script changes.
```

### Review Task

User says:

```text
/lean-review this repo
```

Agent behavior:

- Suggest only.
- Do not edit.
- Do not delete.
- Use file and line references.

Example:

```text
cli/tea.js:240 [stdlib] custom path parsing repeats local helper -> reuse path.resolve wrapper
net: -18 lines possible
```

### Memory Task

User says:

```text
what did we decide about lean-code?
```

Agent behavior:

1. Search current chat.
2. Search memory map.
3. Recall from Supermemory only if needed.
4. Return compact answer.

Example:

```text
Decision: lean-code is advisory by default. Normal coding uses it silently; review/audit suggests only; delete/rewrite needs explicit user approval.
```

### Web Chat Task

User is in ChatGPT web and opens the extension.

User clicks:

```text
Recall Memory
```

Extension behavior:

1. Read draft topic.
2. Ask local bridge for relevant memory.
3. Insert a small "Context" block.
4. User reviews and sends manually.

## Memory Quality Rules

Good memories are durable and reusable:

- Repo path.
- Working command.
- User preference.
- Project decision.
- Tool install state.
- Safety rule.
- Repeated gotcha.

Bad memories are noisy:

- One-off frustration.
- Full logs.
- Stack traces without summary.
- Temporary speculation.
- Secrets.
- Large copied files.

Good memory:

```text
decision: lean-code suggestions are advisory; apply only when user explicitly asks.
```

Bad memory:

```text
User talked for 30 minutes about maybe using many memory tools and was excited.
```

## Token Budget Rules

Memory should save tokens, not spend them.

Suggested budget:

- Tiny task: no memory unless needed.
- Normal task: 3 to 5 memories.
- Project restart: 300 to 800 token memory map slice.
- Deep recovery: recall more, then compress before injecting.

Never inject raw history unless the user asks.

## Privacy And Safety Rules

Never save:

- Passwords.
- API keys.
- OAuth tokens.
- Recovery phrases.
- Full private documents.
- Sensitive personal facts unless user explicitly asks.

Ask before saving:

- Personal details.
- Financial details.
- Health details.
- Client-private context.
- Anything that could surprise the user later.

It is fine to save:

- "User prefers concise answers."
- "Repo path is ..."
- "Command X worked."
- "Decision Y was made."

## Commands And Phrases

Useful CLI commands:

```powershell
node <CRISP_HOME>\cli\tea.js compress C:\path\prompt.md
node <CRISP_HOME>\cli\tea.js clipboard
node <CRISP_HOME>\cli\tea.js stats
node <CRISP_HOME>\cli\tea.js lean
node <CRISP_HOME>\cli\tea.js debt C:\path\repo
node <CRISP_HOME>\cli\tea.js vault init
node <CRISP_HOME>\cli\tea.js vault github-init --repo token-efficient-agent-memory-vault
node <CRISP_HOME>\cli\tea.js vault sync
node <CRISP_HOME>\cli\tea.js memory-map recall token-agent-kit
```

Useful agent phrases:

```text
Use token-efficient-agent.
Use lean-code-agent.
/lean-review
/lean-audit
/lean-debt
apply lean fixes
recall memory for token-agent-kit
save this decision to memory
```

Memory commands:

```powershell
node <CRISP_HOME>\cli\tea.js memory-map show
node <CRISP_HOME>\cli\tea.js memory-map recall token-agent-kit
node <CRISP_HOME>\cli\tea.js memory-map add "decision: ..."
node <CRISP_HOME>\cli\tea.js memory-map compress
```

## Recommended Roadmap

### Phase 1: Current Kit

Already available:

- Token-efficient skill.
- Lean-code skills.
- Memory-agent skill.
- Local MCP compression server.
- CLI compression and stats.
- CLI markdown memory-map and vault scaffold.
- AI Chat Exporter compression integration.
- Advisory lean policy.

### Phase 2: Markdown Memory

Available now:

- `memory-templates/`
- ignored private `memory-vault/`
- `tea vault init`
- `tea vault github-init`
- `tea vault sync`
- `tea memory-map show`
- `tea memory-map recall`
- `tea memory-map add`
- `tea memory-map compress`

Next improvement:

- smarter section-aware memory updates
- optional Git-backed personal vault
- optional Obsidian plugin notes

### Phase 3: Supermemory

Add:

- Memory provider docs.
- Supermemory MCP adapter notes.
- Project scoping rules.
- Recall budget policy.
- Optional sync from vault to Supermemory.

### Phase 4: Web Bridge

Available now:

- Local bridge server.
- AI Chat Exporter buttons for memory recall/save.
- Browser-side token savings display.
- Safe preview-only insertion.

Start the bridge:

```powershell
node <CRISP_HOME>\cli\tea.js bridge start
```

## The One-Sentence Rule

If someone only remembers one thing, make it this:

```text
Keep the agent's desk clean: store durable memory outside the prompt, recall only the few facts needed, compress them, and ask before doing anything risky.
```

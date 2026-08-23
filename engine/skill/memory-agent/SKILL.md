---
name: memory-agent
description: Use when the user asks for durable memory, memory maps, Obsidian-style vaults, Supermemory-style recall, project facts, remembered rules, or cross-session context. Keeps memory token-efficient by recalling small relevant slices, not dumping everything.
---

# Memory Agent

Goal: keep useful long-term context available without bloating the prompt.

## Mental Model

```text
Context window = working desk
memory-map.md = compact notebook
markdown vault = filing cabinet
semantic memory = smart librarian
```

Use current chat first. If context is missing, search the memory map. If still missing and tools exist, recall from the memory backend. Inject only compressed facts needed for the task.

## Default Policy

- Recall silently when the task clearly depends on project history, repo paths, commands, stable preferences, or past decisions.
- Limit recall to 3-5 relevant facts by default.
- Compress recalled facts before using them.
- Save obvious durable project facts when safe: repo paths, commands that worked, decisions, stable preferences, install state, repeated gotchas.
- Ask before saving personal, sensitive, private, financial, health, client, or ambiguous information.
- Never save secrets, API keys, passwords, tokens, recovery phrases, or raw private documents.
- Do not inject large memory blobs. Prefer headings and exact facts.

## Memory Map Shape

```text
## User Rules
- <stable rule>

## Projects
### <project>
- repo: <path>
- decision: <durable decision>
- command: <known working command>

## Open Loops
- <question or task>
```

## Output Shape

When memory was used, keep disclosure compact:

```text
Used memory: <1-3 facts>.
Saved memory: <fact or none>.
```

When unsure whether to save:

```text
Suggestion: save this as memory? <short fact>
```


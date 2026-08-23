# Local Bridge Server

The local bridge gives browser pages a safe way to use token compression and markdown memory without giving the browser direct filesystem access.

It is designed for AI Chat Exporter and similar web-chat helpers.

## Start

```powershell
node <CRISP_HOME>\cli\tea.js bridge start
```

Default URL:

```text
http://127.0.0.1:6768
```

Custom port:

```powershell
node <CRISP_HOME>\cli\tea.js bridge start --port 6770
```

## Endpoints

```text
GET  /health
POST /compress
GET  /memory/map
GET  /memory/recall?q=<query>&limit=8
POST /memory/add
```

## Behavior

- Binds to `127.0.0.1` only.
- Uses local markdown memory from `<CRISP_HOME>\memory-vault` by default.
- Initializes the vault from `memory-templates/` if needed.
- Refuses obvious secret-looking memory saves.
- Does not auto-submit prompts.
- Browser callers receive JSON and decide whether to insert text.

## Example

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:6768/health
```

```powershell
Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:6768/memory/recall?q=token-agent-kit'
```

## GitHub-Backed Vault

The bridge reads the same local vault that can be synced to a private GitHub repo:

```powershell
node <CRISP_HOME>\cli\tea.js vault github-init --repo token-efficient-agent-memory-vault
node <CRISP_HOME>\cli\tea.js vault sync
```

GitHub is used only for backup and multi-computer sync. The bridge still reads local markdown files.

## Web Chat Flow

```text
User opens ChatGPT or Claude.ai
-> AI Chat Exporter floating panel appears
-> user clicks Recall Memory or Insert Map
-> extension calls local bridge
-> relevant memory is inserted into the draft
-> user reviews and sends manually
```

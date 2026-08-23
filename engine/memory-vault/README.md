# Memory Vault

This is the in-product home for local memory.

Analogy: this folder is the notebook beside the token-efficient agent. The agent kit decides what to compress, the AI Chat Exporter captures browser/chat context, and this vault stores the useful durable notes.

GitHub includes this README so the folder is visible when someone downloads the repo. Private memory files inside this folder are ignored by git.

Run:

```powershell
node <CRISP_HOME>\cli\tea.js vault init
```

Typical local files after init:

- `00-index.md`: quick map of the vault.
- `memory-map.md`: compact recall map.
- `observations.jsonl`: cheap automatic observations from hooks and commands.
- `session-state/`: private session turn counters.
- `session-handoffs/`: compact next-chat handoffs.
- `projects/`, `decisions/`, `concepts/`: human-readable memory notes.

Private GitHub sync is optional:

```powershell
node <CRISP_HOME>\cli\tea.js vault github-init --repo token-efficient-agent-memory-vault
node <CRISP_HOME>\cli\tea.js vault sync --message "Update memory vault"
```

Keep secrets out of this folder.

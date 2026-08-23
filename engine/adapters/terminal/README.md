# Terminal Adapter

Purpose: make shell output compact before an agent reads it.

## PowerShell Profile Snippet

Add equivalent functions to your PowerShell profile after adjusting paths:

```powershell
function tstatus { git status --short }
function tlog { git log --oneline -n 20 }
function tdiff { git diff --stat; git diff --compact-summary }
function tgrep { param([string]$Pattern, [string]$Path=".") rg -n --hidden --glob '!node_modules' --glob '!dist' --glob '!build' $Pattern $Path }
function tread { param([string]$Path) Get-Content -LiteralPath $Path -TotalCount 220 }
```

If a compact command wrapper is installed, prefer it inside these functions.

## Bash/Zsh Snippet

```bash
alias tstatus='git status --short'
alias tlog='git log --oneline -n 20'
alias tdiff='git diff --stat && git diff --compact-summary'
tgrep() { rg -n --hidden --glob '!node_modules' --glob '!dist' --glob '!build' "$1" "${2:-.}"; }
tread() { sed -n '1,220p' "$1"; }
```

Raw fallback remains normal `git`, `rg`, `cat`, and test commands.

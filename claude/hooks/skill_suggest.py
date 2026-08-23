"""
skill_suggest.py — Auto-skill discovery on every prompt.
Fired by UserPromptSubmit hook. Matches prompt against skill keyword map.
Injects a tiny suggestion note via stdout JSON (Claude sees it, user sees it in context).
Never blocks — always exits 0.
"""
import os, json, sys, re

SKILL_MAP = {
    r"token|context|compress|compact|efficient|caveman|rtk": [
        "token-efficient-agent", "caveman", "token-optimizer"
    ],
    r"review|audit|lint|bug|refactor|clean": [
        "lean-code-review", "code-review", "lean-code-audit", "lean-code-debt", "simplify"
    ],
    r"plan|spec|design|architect|roadmap": [
        "lean-code-agent", "aurora-spec-discipline"
    ],
    r"memory|remember|handoff|rollover|session": [
        "memory-agent", "consolidate-memory", "supermemory"
    ],
    r"chart|graph|plot|dashboard|visual|data.?viz": [
        "dataviz", "graphify"
    ],
    r"search|scrape|web|crawl|fetch|url": [
        "content-research-writer", "lead-research-assistant"
    ],
    r"stock|trade|ticker|backtest|regime|signal|aurora|scanner|equity|market": [
        "aurora-stock-analysis", "stock-analysis", "ibd-canslim-model-book"
    ],
    r"pdf|doc|report|journal|markdown|write": [
        "pdf", "docx", "pptx", "changelog-generator"
    ],
    r"schedule|cron|automat|recurring|loop|daily": [
        "schedule", "loop"
    ],
    r"ui|ux|frontend|react|component|design|style|css": [
        "ui-ux-pro-max", "ui-styling", "artifact-design", "banner-design"
    ],
    r"security|secret|vault|auth|token.?leak|inject": [
        "security-review"
    ],
    r"mcp|tool|plugin|server|gateway|api": [
        "mcp-builder"
    ],
    r"git|commit|pr|pull.?request|branch|merge": [
        "changelog-generator", "code-review"
    ],
}

INSTALLED_PATH = os.path.join(os.path.expanduser("~"), ".claude", "skills")

# Skills that were merged into a newer bundle — don't nag for the old name
# if the bundle that replaced it is already installed.
SUPERSEDED_BY = {
    "token-efficient-agent": "token-kit",
    "caveman": "token-kit",
    "token-optimizer": "token-kit",
}

def get_installed():
    try:
        return set(os.listdir(INSTALLED_PATH))
    except Exception:
        return set()

def main():
    prompt = ""
    try:
        raw = sys.stdin.read()
        if raw.strip():
            data = json.loads(raw)
            prompt = data.get("prompt", "") or data.get("user_message", "") or str(data)
    except Exception:
        pass

    if not prompt:
        return

    installed = get_installed()
    suggestions = []

    for pattern, skills in SKILL_MAP.items():
        if re.search(pattern, prompt.lower()):
            for s in skills:
                if SUPERSEDED_BY.get(s) in installed:
                    continue
                if s not in installed and s not in suggestions:
                    suggestions.append(s)

    if suggestions:
        # UserPromptSubmit: print JSON to stdout to inject as context Claude sees
        note = f"[SKILL-SUGGEST] Skills not installed that may help: {', '.join(suggestions[:5])}. Install with: /install-skill <name>"
        print(json.dumps({"continue": True, "hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": note}}))

if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)

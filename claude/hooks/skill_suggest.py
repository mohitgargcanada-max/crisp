"""
skill_suggest.py — Auto-skill discovery on every prompt.
Fired by UserPromptSubmit hook. Reads prompt from CLAUDE_HOOK_INPUT env var,
matches against skill keyword map, prints suggestions to stdout (shown in Claude Code).
Skills listed here are ones worth downloading if not already installed.
"""
import os, json, sys, re

SKILL_MAP = {
    # token / context
    r"token|context|compress|compact|efficient|caveman|rtk": [
        "token-efficient-agent", "caveman", "token-optimizer"
    ],
    # code review / audit
    r"review|audit|lint|bug|refactor|clean": [
        "lean-code-review", "code-review", "lean-code-audit", "lean-code-debt", "simplify"
    ],
    # planning / spec
    r"plan|spec|design|architect|roadmap": [
        "lean-code-agent", "aurora-spec-discipline"
    ],
    # memory / handoff
    r"memory|remember|handoff|rollover|session": [
        "memory-agent", "consolidate-memory", "supermemory"
    ],
    # data / chart / viz
    r"chart|graph|plot|dashboard|visual|data.?viz": [
        "dataviz", "graphify"
    ],
    # web / search / scrape
    r"search|scrape|web|crawl|fetch|url": [
        "content-research-writer", "lead-research-assistant"
    ],
    # stock / finance / trading
    r"stock|trade|ticker|backtest|regime|signal|aurora|scanner|equity|market": [
        "aurora-stock-analysis", "stock-analysis", "ibd-canslim-model-book"
    ],
    # doc / report / pdf
    r"pdf|doc|report|journal|markdown|write": [
        "pdf", "docx", "pptx", "changelog-generator"
    ],
    # schedule / cron / automate
    r"schedule|cron|automat|recurring|loop|daily": [
        "schedule", "loop"
    ],
    # UI / frontend
    r"ui|ux|frontend|react|component|design|style|css": [
        "ui-ux-pro-max", "ui-styling", "artifact-design", "banner-design"
    ],
    # security
    r"security|secret|vault|auth|token.?leak|inject": [
        "security-review"
    ],
    # mcp / tool / plugin
    r"mcp|tool|plugin|server|gateway|api": [
        "mcp-builder"
    ],
    # git / pr / commit
    r"git|commit|pr|pull.?request|branch|merge": [
        "changelog-generator", "code-review"
    ],
}

INSTALLED_PATH = r"C:\Users\mohit\.claude\skills"

def get_installed():
    try:
        return set(os.listdir(INSTALLED_PATH))
    except Exception:
        return set()

def main():
    prompt = ""
    # Claude Code passes hook input as JSON on stdin
    try:
        raw = sys.stdin.read()
        if raw.strip():
            data = json.loads(raw)
            prompt = data.get("prompt", "") or data.get("user_message", "") or str(data)
    except Exception:
        pass

    if not prompt:
        prompt = os.environ.get("CLAUDE_HOOK_PROMPT", "")

    if not prompt:
        return

    prompt_lower = prompt.lower()
    installed = get_installed()
    suggestions = set()

    for pattern, skills in SKILL_MAP.items():
        if re.search(pattern, prompt_lower):
            for s in skills:
                if s not in installed:
                    suggestions.add(s)

    if suggestions:
        # Output to stderr only — doesn't block prompt, just informational
        import sys as _sys
        print(f"[SKILL-SUGGEST] Consider: {', '.join(sorted(suggestions))}", file=_sys.stderr)

if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)  # never block the prompt

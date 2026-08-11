"""
headroom_filter.py — PostToolUse hook.
Compresses Bash/Read/Grep results before they consume context.
Prints compressed summary to stdout only when savings > 15%.
Never blocks — always exits 0.
"""
import json, re, sys
from pathlib import Path
from datetime import datetime

ERROR_LOG  = Path.home() / ".claude" / "hooks" / "hook-errors.log"
MIN_SIZE   = 500    # chars — skip compression on small outputs
MAX_OUTPUT = 3000   # hard cap on what we pass back

NOISE_RE = re.compile(
    r"^\s*$"                                        # blank lines
    r"|^\s*\[[\d.]+\]\s"                            # [timestamp] prefix
    r"|Successfully (completed|wrote|created|updated|deleted)"
    r"|^Writing to\b"
    r"|^\s*\d+%\|[█▒ ]+\|"                          # progress bars
    r"|^Downloading\s+\d+"
    r"|^\s*(INFO|DEBUG)\s*:"
    r"|^Requirement already satisfied"
    r"|^\s*Retrying\s",
    re.IGNORECASE,
)

def compress_text(text):
    lines = text.splitlines()
    lines = [l for l in lines if not NOISE_RE.match(l)]
    deduped, prev, repeat = [], None, 0
    for l in lines:
        if l == prev:
            repeat += 1
        else:
            if repeat > 0:
                deduped.append(f"  [x{repeat+1} repeated]")
                repeat = 0
            deduped.append(l)
            prev = l
    result = "\n".join(deduped)
    if len(result) > MAX_OUTPUT:
        h = result[:MAX_OUTPUT // 2]
        t = result[-(MAX_OUTPUT // 4):]
        dropped = len(result) - len(h) - len(t)
        result = f"{h}\n... [{dropped} chars compressed] ...\n{t}"
    return result

def compress_json(obj):
    if isinstance(obj, list):
        sample = json.dumps(obj[0], default=str)[:200] if obj else "empty"
        return f"[{len(obj)} items] first: {sample}"
    if isinstance(obj, dict):
        out = {}
        for k, v in list(obj.items())[:20]:
            if isinstance(v, list):   out[k] = f"[{len(v)} items]"
            elif isinstance(v, dict): out[k] = f"{{...{len(v)} keys}}"
            elif isinstance(v, str) and len(v) > 200: out[k] = v[:200] + "..."
            else: out[k] = v
        return json.dumps(out, indent=2, default=str)
    return str(obj)[:MAX_OUTPUT]

def main():
    raw = sys.stdin.read() or "{}"
    try:
        event = json.loads(raw)
    except Exception:
        return

    tool_name = str(event.get("tool_name", "tool"))

    # Extract output — handle multiple possible field names
    output = (
        event.get("tool_result")
        or event.get("output")
        or event.get("result")
        or ""
    )

    # Safely convert to string — no path concatenation
    if isinstance(output, (dict, list)):
        raw_str = json.dumps(output, default=str)
    elif output is None:
        return
    else:
        raw_str = str(output)

    if len(raw_str) < MIN_SIZE:
        return

    # Try JSON compression
    try:
        parsed = json.loads(raw_str)
        compressed = compress_json(parsed)
        before, after = len(raw_str), len(compressed)
        if after < before * 0.85:
            pct = round((1 - after / before) * 100)
            print(f"[HEADROOM:{tool_name} -{pct}%]\n{compressed}")
            return
    except Exception:
        pass

    # Text compression
    compressed = compress_text(raw_str)
    before, after = len(raw_str), len(compressed)
    if after < before * 0.85:
        pct = round((1 - after / before) * 100)
        print(f"[HEADROOM:{tool_name} -{pct}%]\n{compressed}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        try:
            ERROR_LOG.parent.mkdir(parents=True, exist_ok=True)
            with open(ERROR_LOG, "a", encoding="utf-8") as f:
                f.write(f"{datetime.now().isoformat()} headroom: {type(e).__name__}: {e}\n")
        except Exception:
            pass
    sys.exit(0)

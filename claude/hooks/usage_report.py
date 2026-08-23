"""
usage_report.py -- the "rtk gain" equivalent for the parts of the CRISP
pipeline RTK doesn't measure: Headroom (tool-output compression) and
response length (caveman-mode proxy).

Run manually: python usage_report.py
Data sources (written by headroom_filter.py and usage_tracker.py):
  ~/.claude/hooks/usage-stats/headroom-savings.jsonl
  ~/.claude/hooks/usage-stats/response-log.jsonl
"""
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

STATS_DIR    = Path.home() / ".claude" / "hooks" / "usage-stats"
HEADROOM_LOG = STATS_DIR / "headroom-savings.jsonl"
RESPONSE_LOG = STATS_DIR / "response-log.jsonl"


def _read_jsonl(path):
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except Exception:
            continue
    return out


def report_headroom():
    rows = _read_jsonl(HEADROOM_LOG)
    print("Headroom -- tool output compression (measured)")
    print("=" * 60)
    if not rows:
        print("  No events logged yet. Fires only when a Bash/Read/Grep")
        print("  result is >500 chars AND compresses by >15%. Data will")
        print("  accumulate as you keep working normally.\n")
        return

    total_before = sum(r["before"] for r in rows)
    total_after = sum(r["after"] for r in rows)
    saved = total_before - total_after
    pct = round(100 * saved / total_before, 1) if total_before else 0
    print(f"  Events:        {len(rows)}")
    print(f"  Chars before:  {total_before:,}")
    print(f"  Chars saved:   {saved:,} ({pct}%)")

    by_tool = defaultdict(lambda: [0, 0, 0])
    for r in rows:
        t = by_tool[r.get("tool", "?")]
        t[0] += 1
        t[1] += r["before"] - r["after"]
        t[2] += r["before"]
    print("\n  By tool:")
    for tool, (n, saved_t, before_t) in sorted(by_tool.items(), key=lambda x: -x[1][1]):
        p = round(100 * saved_t / before_t, 1) if before_t else 0
        print(f"    {tool:<10} {n:>5} events   {saved_t:>10,} chars saved  ({p}%)")
    print()


def report_responses():
    rows = _read_jsonl(RESPONSE_LOG)
    print("Response length -- caveman-mode trend (measured, NOT a savings %)")
    print("=" * 60)
    if not rows:
        print("  No responses logged yet.\n")
        return

    words = [r["words"] for r in rows]
    avg = sum(words) / len(words)
    print(f"  Responses logged:   {len(rows)}")
    print(f"  Avg words/response: {avg:.0f}  (~{avg / 0.75:.0f} tokens est.)")
    print(f"  Min / Max:          {min(words)} / {max(words)}")

    by_week = defaultdict(list)
    for r in rows:
        try:
            dt = datetime.fromisoformat(r["timestamp"])
            wk = dt.strftime("%G-W%V")
        except Exception:
            continue
        by_week[wk].append(r["words"])
    print("\n  By week:")
    for wk in sorted(by_week):
        ws = by_week[wk]
        print(f"    {wk}   {len(ws):>4} responses   avg {sum(ws) / len(ws):.0f} words")
    print()


def main():
    print("CRISP usage report -- stages RTK doesn't cover\n")
    report_headroom()
    report_responses()
    print("Note: response length is descriptive, not a savings % -- there's")
    print("no verbose baseline to diff against. `rtk gain` remains the only")
    print("stage with a true measured before/after number.")


if __name__ == "__main__":
    main()

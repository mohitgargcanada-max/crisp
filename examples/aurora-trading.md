# Real-world example: AURORA Quantitative Trading System

## The challenge

AURORA scans 400+ tickers across US, Canada, and India daily. Each scan involves:
- Fetching OHLCV data from 15+ sources (yfinance, NSE Bhavcopy, Tapetide, FMP...)
- Running 20+ signal engines (RS, MA stacks, volume, fundamentals)
- Generating charts, Telegram alerts, and weekly reports

Without token compression, sessions hit context limit mid-scan. Claude would forget
earlier scan results before finishing. Cost: ~$8–12 per full session.

## The pipeline in action

### Stage 1 — TEA (Claude thinks efficiently)

User asks: "run India scan and check why RELIANCE isn't triggering"

Without TEA, Claude reads 15 files to understand the scanner.
With TEA + graphify: `graphify query "India scan signal flow"` → gets a 200-line
subgraph instead of reading 5000 lines of source. **Saves ~4000 tokens upfront.**

### Stage 2 — RTK (shell commands stay lean)

Claude runs: `python run_scan.py --market india --ticker RELIANCE`

RTK intercepts. The raw output includes:
```
Downloading: 100%|████████████| 450/450 [00:45<00:00]
INFO 2026-08-10 14:23:01 fetching RELIANCE.NS from yfinance
INFO 2026-08-10 14:23:02 fetching RELIANCE.NS from NSE Bhavcopy  
Successfully fetched 252 rows
INFO 2026-08-10 14:23:03 running MA engine...
...
```

RTK strips timestamps, progress bars, INFO lines. Claude sees:
```
RELIANCE.NS: 252 rows fetched
MA engine: complete
Signal: NO_TRIGGER (RS rank 34, threshold 40)
```
**Saves ~800 tokens per ticker.**

### Stage 3 — Headroom (results don't flood context)

Claude reads the scan output JSON: `aurora_dashboard_india_2026-08-10.json`

Raw file: 85KB, 2200 lines.
Headroom: extracts status fields only → 180 chars.
`[HEADROOM:Read -97%] {status: "complete", triggered: 12, scanned: 447, errors: 0}`

**Saves ~21,000 tokens on a single file read.**

### Stage 4 — Lean code (fixes stay small)

Claude finds the bug: RELIANCE RS threshold is hardcoded to 40, should use config value.

Without lean code: might add a config class, validation, logging, tests.
With lean code: one-line fix.
```python
# Before
threshold = 40

# After  
threshold = config.get("rs_threshold", 40)
```
**Fix is 1 line, not 15. Saves output tokens + future context load.**

### Stage 5 — Caveman (response is tight)

Without Caveman:
> "Great news! I've identified the issue with RELIANCE not triggering. The problem 
> appears to be that the RS threshold is hardcoded to 40 rather than reading from 
> your configuration file. I've gone ahead and updated the code to use..."

With Caveman:
> "Bug: RS threshold hardcoded at 40. Fixed to use config.get('rs_threshold', 40).
> RELIANCE RS=34 → trigger needs RS≥40. Adjust config or threshold."

**Same information. 80% fewer words.**

## Results

| Metric | Before CRISP | After CRISP |
|---|---|---|
| Tokens per full scan session | ~180,000 | ~52,000 |
| Cost per session | ~$8.50 | ~$2.40 |
| Context limit hits | Every 2–3 scans | Never |
| Session length (turns) | 6–8 before degrading | 20+ cleanly |

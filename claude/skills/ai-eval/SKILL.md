---
name: ai-eval
description: >
  Evaluate AI/LLM outputs against a rubric, compare two outputs head-to-head, or track a
  prediction to score later against a real outcome. Use when the user asks to "score this
  output", "which response is better", "set up an eval", "grade this against criteria",
  "is this a good answer", "compare model A vs B", "track this prediction and check it later",
  or any request to judge AI-generated content systematically rather than by feel. Covers
  rubric scoring (LLM-as-judge), A/B comparison, and forward-prediction ledgers with baseline
  controls. Does not cover code correctness (use code-reviewer) or evidence/hallucination
  checking of a diff or response (use hallucination-reviewer) -- this is for judging the
  QUALITY or ACCURACY of an AI output against a rubric or a later-known outcome, not for
  finding bugs or fabrications.
---

# AI Eval

Three patterns, pick the one that matches the request. Don't build more structure than the
task needs -- a one-off "is this answer good" question doesn't need a ledger.

## 1. Rubric scoring (single output, right now)

For "grade this" / "score this against X" / "is this a good response":

1. **Write the rubric first, before looking at the output.** 3-6 concrete criteria, each with
   what a 1/3/5 score looks like. A rubric written after seeing the output is retrofitted to
   justify a verdict, not a real measure.
2. Dispatch a judge (a fresh Agent call, or your own read if the stakes are low) against the
   rubric ONLY -- it should not know what score is expected.
3. Score each criterion separately, then an overall verdict. Never a single vibes-based number
   with no criterion breakdown -- that can't be audited or disputed.
4. State what would have scored higher, concretely. "Good" with no counterexample isn't a
   rubric result, it's an opinion.

## 2. A/B comparison (two outputs, same input)

For "which is better, A or B":

1. Same rubric for both -- never judge A on one dimension and B on another.
2. Blind the judge to which is "yours" / "baseline" / "new" if that framing could bias it --
   label them A/B, not "old approach" vs "new approach".
3. Report a per-criterion winner, not just an overall pick -- A can win on correctness and
   lose on clarity, and that's a more useful result than a single verdict.
4. Ties are a real result. Don't force a winner when the rubric genuinely doesn't distinguish
   them.

## 3. Forward-prediction ledger (score later, against a real outcome)

For tracking a prediction now to check against ground truth once it exists -- forecasts,
market calls, any claim that resolves in the future. This is the only one of the three that
needs a durable file, because the point is comparing a claim made BEFORE the outcome was known
against what actually happened AFTER.

**Never score a prediction against an outcome the predictor could already see** -- a "forward"
test contaminated by hindsight isn't a test.

Ledger row, one JSON object per line (JSONL, append-only):
```json
{"id": "...", "ts_predicted": "<ISO date>", "claim": "<specific, falsifiable prediction>",
 "basis": "<what the prediction was made from>", "resolves_at": "<ISO date or condition>",
 "baseline": false, "outcome": null, "scored_at": null, "correct": null}
```

- **`claim` must be falsifiable**, not vague. "Will likely do well" cannot be scored. "Will be
  above $X by \<date\>" can.
- **A prediction needs a baseline to mean anything.** Track what a naive/random/do-nothing
  baseline would score on the same claims, in the same ledger, tagged `"baseline": true` -- a
  60% hit rate is not evidence of skill if the baseline also hits 60%.
- **Don't score early.** Only fill `outcome` / `scored_at` / `correct` once `resolves_at` has
  actually passed and the real outcome is independently known -- not estimated, not assumed.
- **Don't conclude from too few rows.** State the minimum sample size the claim needs before
  trusting a hit-rate number -- decide that threshold before looking at the data, not after.

## What this skill does NOT do

- Judge code correctness -- that's `code-reviewer`.
- Check whether a response's claims are backed by evidence -- that's `hallucination-reviewer`.
- Replace a real evaluation harness for high-volume/production use (promptfoo, a custom
  dataset runner). This is for setting up the methodology correctly by hand; point to
  dedicated tooling once volume justifies it.

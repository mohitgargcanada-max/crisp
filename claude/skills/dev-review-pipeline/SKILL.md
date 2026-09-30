---
name: dev-review-pipeline
description: "Use when the user wants a full review pass on a change before it ships -- \"review this before I commit\", \"is this safe to merge\", \"full review\", or after finishing a non-trivial piece of work in any project. Runs three focused, independent reviewers in sequence (correctness, evidence/hallucination, security) instead of one do-everything pass, then combines the results. Deliberately NOT a single mega-skill -- see the rationale in this file."
---

# /dev-review-pipeline

Thin orchestrator. Its whole job is calling three narrow, independently-focused reviewers in
sequence and handing back one combined report. It does not itself judge code quality, security,
or evidence -- that's what the three reviewers are for.

## Why three separate reviewers instead of one

A single reviewer asked to check correctness, evidence-discipline, and security in one pass
catches less of each than three reviewers each asked to check one thing -- the same reason
multi-dimension code review tools run one focused pass per dimension rather than one pass trying
to cover everything. Each of the three below has a genuinely different question it's asking:

- **code-reviewer** asks: does this logic actually work?
- **hallucination-reviewer** asks: is every claim made about this change actually backed by
  evidence, or is some of it a plausible-sounding guess?
- **claude-security** (if installed) asks: can this be exploited?

## Steps

1. **Identify scope.** Default to the current uncommitted diff (`git diff`, `git diff --cached`)
   unless the user names a specific file, PR, or commit.
2. **Run `code-reviewer`** (Agent tool, subagent_type: `code-reviewer`) against that scope.
   Wait for its findings.
3. **Run `hallucination-reviewer`** (Agent tool, subagent_type: `hallucination-reviewer`) against
   the same scope AND against code-reviewer's own findings from step 2 -- its findings are claims
   too, and should be held to the same evidence bar as the diff itself.
4. **Security pass:**
   - If the `claude-security` plugin is installed (check `claude plugin list` for
     `claude-security`), tell the user you're invoking it for the "scan changes" job and follow
     its own flow (it asks its own questions and produces patch files on disk -- don't try to
     replicate that here).
   - If it isn't installed, say so plainly and either offer to install it
     (`claude plugin install claude-security@claude-plugins-official --scope user`, needs the
     `claude-plugins-official` marketplace added) or fall back to a lightweight manual check for
     secrets/injection/unsafe deserialization -- state clearly that this fallback is far less
     thorough than the real plugin.
5. **Combine.** One report, ranked most-severe-first across all three passes, each finding tagged
   with which reviewer raised it. Note explicitly if a hallucination-reviewer finding invalidates or
   downgrades a code-reviewer finding (e.g. a "bug" that turned out to be based on a misread
   docstring).

## Scope notes

- This is a review pipeline, not a fix pipeline -- report findings, don't silently apply fixes,
  unless the user explicitly asked for fixes too.
- If the project has its own binding review rules (a `CLAUDE.md`, a `MISTAKES.md`, a bug tracker
  discipline), both subagents are instructed to check for and use those -- you don't need to
  duplicate that instruction here, just make sure the scope you hand them includes enough context
  to find those files (i.e. run this from the project root).

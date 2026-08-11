#!/usr/bin/env node
/**
 * pre-tool.js — Codex PreToolUse hook (RTK equivalent)
 * Rewrites shell commands to produce compressed output before execution.
 * Place in: .codex/hooks/pre-tool.js
 *
 * Codex hook contract: reads JSON from stdin, writes JSON to stdout.
 * Return { command } to rewrite the command, or {} to pass through unchanged.
 */

const REWRITES = [
  // Git — strip decoration, keep hashes + messages
  [/^git log(\s|$)/, cmd => cmd.replace('git log', 'git log --oneline')],
  [/^git diff(\s|$)(?!--stat)/, cmd => `git diff --stat && ${cmd}`],
  [/^git status(\s|$)/, cmd => cmd.replace('git status', 'git status --short')],

  // File listing — names only, no permissions/timestamps
  [/^ls -la?\b/, () => 'ls -1'],
  [/^dir\s/, () => 'dir /b'],

  // npm/pip — errors only
  [/^npm install\b/, cmd => `${cmd} 2>&1 | grep -E "(error|warn|ERR)" || true`],
  [/^pip install\b/, cmd => `${cmd} 2>&1 | grep -Ev "^(Collecting|Downloading|Installing|Requirement already)"`],

  // Test runners — failures only
  [/^pytest\b/, cmd => `${cmd} --tb=short -q`],
  [/^jest\b/, cmd => `${cmd} --no-verbose 2>&1 | tail -30`],

  // Python — suppress progress bars
  [/^python\b/, cmd => `${cmd} 2>&1 | grep -Ev "^(INFO|DEBUG|\\s*\\d+%\\|)"`],
];

function main() {
  let input = '';
  process.stdin.on('data', d => input += d);
  process.stdin.on('end', () => {
    try {
      const event = JSON.parse(input || '{}');
      const cmd = event.command || event.tool_input?.command || '';

      if (!cmd) { process.stdout.write('{}'); return; }

      let rewritten = cmd;
      for (const [pattern, rewriter] of REWRITES) {
        if (pattern.test(cmd)) {
          rewritten = rewriter(cmd);
          break;
        }
      }

      if (rewritten !== cmd) {
        process.stdout.write(JSON.stringify({ command: rewritten }));
      } else {
        process.stdout.write('{}');
      }
    } catch (e) {
      process.stdout.write('{}'); // never block
    }
    process.exit(0);
  });
}

main();

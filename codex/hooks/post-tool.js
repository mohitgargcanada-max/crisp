#!/usr/bin/env node
/**
 * post-tool.js — Codex PostToolUse hook (Headroom equivalent)
 * Compresses tool results before they reach Codex's context window.
 * Place in: .codex/hooks/post-tool.js
 *
 * Codex hook contract: reads JSON from stdin, writes JSON to stdout.
 * Return { output } to replace the tool output, or {} to pass through.
 */

const MIN_SIZE   = 500;   // chars — don't bother on small outputs
const MAX_OUTPUT = 3000;  // hard cap

const NOISE = [
  /^\s*$/,
  /^\s*\[[\d.]+\]\s/,
  /successfully (completed|wrote|created|updated|deleted)/i,
  /^\s*\d+%\|[█▒ ]+\|/,
  /^downloading\s+\d+/i,
  /^\s*(info|debug)\s*:/i,
  /^requirement already satisfied/i,
];

function isNoise(line) { return NOISE.some(r => r.test(line)); }

function compressText(text) {
  const lines = text.split('\n').filter(l => !isNoise(l));
  const deduped = [];
  let prev = null, repeat = 0;
  for (const l of lines) {
    if (l === prev) { repeat++; continue; }
    if (repeat > 0) { deduped.push(`  [x${repeat+1} repeated]`); repeat = 0; }
    deduped.push(l);
    prev = l;
  }
  let result = deduped.join('\n');
  if (result.length > MAX_OUTPUT) {
    const head = result.slice(0, MAX_OUTPUT / 2);
    const tail = result.slice(-(MAX_OUTPUT / 4));
    result = `${head}\n... [${result.length - head.length - tail.length} chars compressed] ...\n${tail}`;
  }
  return result;
}

function compressJson(obj) {
  if (Array.isArray(obj)) {
    const sample = obj[0] ? JSON.stringify(obj[0]).slice(0, 200) : 'empty';
    return `[${obj.length} items] first: ${sample}`;
  }
  if (typeof obj === 'object' && obj !== null) {
    const out = {};
    for (const [k, v] of Object.entries(obj).slice(0, 20)) {
      if (Array.isArray(v))          out[k] = `[${v.length} items]`;
      else if (typeof v === 'object') out[k] = `{...${Object.keys(v).length} keys}`;
      else if (typeof v === 'string' && v.length > 200) out[k] = v.slice(0, 200) + '...';
      else                            out[k] = v;
    }
    return JSON.stringify(out, null, 2);
  }
  return String(obj).slice(0, MAX_OUTPUT);
}

function main() {
  let input = '';
  process.stdin.on('data', d => input += d);
  process.stdin.on('end', () => {
    try {
      const event = JSON.parse(input || '{}');
      const toolName = event.tool_name || 'tool';
      const raw = event.tool_result ?? event.output ?? event.result ?? '';
      const rawStr = typeof raw === 'string' ? raw : JSON.stringify(raw);

      if (rawStr.length < MIN_SIZE) { process.stdout.write('{}'); return; }

      let compressed, pct;

      // Try JSON compression
      try {
        const parsed = JSON.parse(rawStr);
        compressed = compressJson(parsed);
        pct = Math.round((1 - compressed.length / rawStr.length) * 100);
        if (pct > 15) {
          process.stdout.write(JSON.stringify({
            output: `[HEADROOM:${toolName} -${pct}%]\n${compressed}`
          }));
          return;
        }
      } catch (_) {}

      // Text compression
      compressed = compressText(rawStr);
      pct = Math.round((1 - compressed.length / rawStr.length) * 100);
      if (pct > 15) {
        process.stdout.write(JSON.stringify({
          output: `[HEADROOM:${toolName} -${pct}%]\n${compressed}`
        }));
        return;
      }

      process.stdout.write('{}');
    } catch (_) {
      process.stdout.write('{}'); // never block
    }
    process.exit(0);
  });
}

main();

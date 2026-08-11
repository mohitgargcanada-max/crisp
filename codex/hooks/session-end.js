#!/usr/bin/env node
/**
 * session-end.js — Codex SessionEnd hook (handover equivalent)
 * Scans conversation for memory candidates. Writes handover doc at threshold.
 * Place in: .codex/hooks/session-end.js
 */
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const THRESHOLD    = 13;
const HANDOVER_DIR = path.join(os.homedir(), '.codex', 'handovers');
const STAGING_DIR  = path.join(os.homedir(), '.codex', 'memory-staging');
const COUNTER_FILE = path.join(os.homedir(), '.codex', 'msg_counts.json');

const PATTERNS = {
  feedback: [/don.t\s+\w+/i, /stop\s+\w+/i, /always\s+\w+/i, /from now on/i, /prefer\s+\w+/i],
  project:  [/deadline/i, /blocked on/i, /decided to/i, /going with/i],
  user:     [/I('m| am) a\b/i, /I (prefer|like|want)/i, /my (workflow|setup)/i],
};

function loadCounts() {
  try { return JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8')); } catch { return {}; }
}
function saveCounts(d) {
  fs.mkdirSync(path.dirname(COUNTER_FILE), { recursive: true });
  fs.writeFileSync(COUNTER_FILE, JSON.stringify(d));
}

function categorize(messages) {
  const found = { feedback: [], project: [], user: [] };
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    for (const [cat, pats] of Object.entries(PATTERNS)) {
      for (const p of pats) {
        if (p.test(text)) {
          const snippet = text.slice(0, 200).replace(/\n/g, ' ');
          if (!found[cat].includes(snippet)) found[cat].push(snippet);
          break;
        }
      }
    }
  }
  return found;
}

function saveStaging(sessionId, cwd, found) {
  if (!Object.values(found).some(a => a.length)) return;
  const project = path.basename(cwd).toLowerCase().replace(/\s+/g, '-');
  fs.mkdirSync(STAGING_DIR, { recursive: true });
  const file = path.join(STAGING_DIR, `${project}.md`);
  const ts   = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const lines = [`\n## ${ts} | ${sessionId.slice(0, 8)}\n`];
  for (const [cat, items] of Object.entries(found))
    for (const item of items) lines.push(`- [${cat}] ${item}\n`);
  fs.appendFileSync(file, lines.join(''));
}

function writeHandover(sessionId, count, cwd, messages) {
  fs.mkdirSync(HANDOVER_DIR, { recursive: true });
  const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(HANDOVER_DIR, `handover_${ts}.md`);
  const project = path.basename(cwd);
  const tx = messages.slice(-12).map(m => {
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return `${m.role.toUpperCase()}: ${text.slice(0, 300)}`;
  }).join('\n');

  fs.writeFileSync(file, `# Handover ${new Date().toISOString().slice(0, 16)}
Project: ${project} | CWD: ${cwd} | Messages: ${count}

## Resume
1. Fresh Codex session in: ${cwd}
2. First prompt: "Continue from handover — review AGENTS.md then proceed"

## Last turns
${tx}

## Staged memory
${path.join(STAGING_DIR, project.toLowerCase() + '.md')}
`);
  return file;
}

function main() {
  let input = '';
  process.stdin.on('data', d => input += d);
  process.stdin.on('end', () => {
    try {
      const event   = JSON.parse(input || '{}');
      const sid     = event.session_id || event.sessionId || 'session';
      const cwd     = event.cwd || process.cwd();
      const messages = event.messages || [];

      const found = categorize(messages);
      saveStaging(sid, cwd, found);

      const counts = loadCounts();
      const count  = (counts[sid] || 0) + 1;
      counts[sid]  = count;
      saveCounts(counts);

      if (count >= THRESHOLD) {
        const file = writeHandover(sid, count, cwd, messages);
        counts[sid] = 0;
        saveCounts(counts);
        process.stderr.write(`\n[HANDOVER] ${count} messages. Open fresh Codex session.\nDoc: ${file}\n`);
      }
    } catch (_) {}
    process.stdout.write('{}');
    process.exit(0);
  });
}

main();

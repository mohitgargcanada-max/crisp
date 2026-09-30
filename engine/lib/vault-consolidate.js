"use strict";

// Weekly consolidation: the pruning/merging pass sync deliberately never does (sync is
// append-only by design). Formalizes the manual cleanup done by hand to aurora-gatway's
// staging.md on 2026-09-30 (1,961 entries/155KB -> 65 distinct/7.5KB) as a repeatable command,
// with the refinements an Opus design review found the manual pass needed:
//   - strip noise LINE BY LINE, not entry by entry (207 of 1,961 blocks mixed a stub with
//     real content -- entry-level filtering would have dropped the real line too)
//   - keep non-bullet lines (the manual pass accidentally dropped 2 provenance comments)
//   - dry-run by default, matching the existing `memory-refresh prune --confirm` precedent
//   - git history is the archive now (this repo is a real git repo); no more writing a
//     second staging_raw_archive_*.md file that only ever exists on one machine

const fs = require("node:fs");
const path = require("node:path");
const { hostId } = require("./vault-sync");

const HEADER_RE = /^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) \| (\S+)$/;
const STUB_LINE_RE = /^\s*-\s*\[feedback\]\s*Stop hook feedback:\s*$/;
const BULLET_RE = /^\s*-\s*\[(\w+)\]\s*(.+)$/;

function normalizeForDedup(text) {
  return text.trim().toLowerCase().replace(/[.,;:!?'"`]+$/g, "").replace(/\s+/g, " ");
}

// Parses one staging.md into blocks: { header, ts, sessionId, lines: [raw lines] }.
// Non-'## ' content before the first header (if any) is returned separately as `preamble`.
function parseStaging(text) {
  // Normalize CRLF first -- staging.md is CRLF on this machine, and a trailing \r would
  // otherwise break every regex's $ anchor below (found via a real test against the archive
  // file: parsed 0 blocks out of 1,961 real ones before this fix).
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let preamble = [];
  let current = null;
  for (const line of lines) {
    const h = line.match(HEADER_RE);
    if (h) {
      if (current) blocks.push(current);
      current = { header: line, ts: h[1], sessionId: h[2], lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
    else preamble.push(line);
  }
  if (current) blocks.push(current);
  return { preamble: preamble.join("\n"), blocks };
}

// Consolidates ONE staging.md's content. Returns { keptText, stats, reportOnly } -- never
// writes to disk itself, so dry-run and --confirm share the exact same computation.
function consolidateStaging(rawText) {
  const { preamble, blocks } = parseStaging(rawText);
  const seen = new Set(); // normalized bullet text already kept, across the whole file
  const outBlocks = [];
  let stubLinesDropped = 0;
  let dupLinesDropped = 0;
  let nonBulletKept = 0;
  let bulletsKept = 0;

  for (const block of blocks) {
    const keptLines = [];
    for (const line of block.lines) {
      if (!line.trim()) continue;
      if (STUB_LINE_RE.test(line)) { stubLinesDropped++; continue; }
      const bullet = line.match(BULLET_RE);
      if (!bullet) {
        // Non-bullet content (provenance comments, stray prose) -- keep it, per the
        // manual-pass gap Opus found (2 <!-- merged --> comments were dropped by accident).
        keptLines.push(line);
        nonBulletKept++;
        continue;
      }
      const norm = normalizeForDedup(bullet[2]);
      if (seen.has(`${bullet[1]}:${norm}`)) { dupLinesDropped++; continue; }
      seen.add(`${bullet[1]}:${norm}`);
      keptLines.push(line);
      bulletsKept++;
    }
    if (keptLines.length) outBlocks.push({ ...block, lines: keptLines });
  }

  const keptText = preamble.replace(/\n+$/, "")
    + outBlocks.map((b) => `\n\n${b.header}\n${b.lines.join("\n")}`).join("")
    + "\n";

  return {
    keptText,
    stats: {
      blocksIn: blocks.length,
      blocksKept: outBlocks.length,
      stubLinesDropped,
      dupLinesDropped,
      nonBulletKept,
      bulletsKept,
    },
  };
}

// Near-duplicate / short-fragment detection is REPORT-ONLY -- per Opus's review, judging
// whether two differently-worded fragments mean the same thing needs an LLM (the existing
// consolidate-memory skill), not a string-similarity auto-merger baked into a deterministic
// command. This just flags candidates for a human (or that skill) to look at.
function wordOverlap(a, b) {
  const wa = new Set(a.split(" ").filter(Boolean));
  const wb = new Set(b.split(" ").filter(Boolean));
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.max(wa.size, wb.size);
}

function findNearDuplicates(keptText, threshold = 0.8) {
  const { blocks } = parseStaging(keptText);
  const items = [];
  for (const block of blocks) {
    for (const line of block.lines) {
      const bullet = line.match(BULLET_RE);
      if (bullet) items.push({ ts: block.ts, category: bullet[1], text: bullet[2] });
    }
  }
  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].category !== items[j].category) continue;
      const overlap = wordOverlap(normalizeForDedup(items[i].text), normalizeForDedup(items[j].text));
      if (overlap >= threshold && overlap < 1) {
        pairs.push({ a: items[i], b: items[j], overlap: Math.round(overlap * 100) / 100 });
      }
    }
  }
  return pairs;
}

function consolidateOneFile(filePath, { confirm } = {}) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  const { keptText, stats } = consolidateStaging(raw);
  const nearDupes = findNearDuplicates(keptText);
  if (confirm && keptText !== raw) {
    fs.writeFileSync(filePath, keptText, "utf8");
  }
  return { filePath, stats, nearDupes, changed: keptText !== raw, dryRun: !confirm };
}

function findStagingFiles(vaultDir) {
  const projectsDir = path.join(vaultDir, "projects");
  if (!fs.existsSync(projectsDir)) return [];
  const found = [];
  for (const name of fs.readdirSync(projectsDir)) {
    const p = path.join(projectsDir, name, "staging.md");
    if (fs.existsSync(p)) found.push(p);
  }
  return found;
}

function appendConsolidationLog(vaultDir, results) {
  const logPath = path.join(vaultDir, "state", "consolidation-log.jsonl");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const entry = {
    ts: new Date().toISOString(),
    host: hostId(),
    files: results.map((r) => ({
      file: path.relative(vaultDir, r.filePath),
      stubLinesDropped: r.stats.stubLinesDropped,
      dupLinesDropped: r.stats.dupLinesDropped,
      bulletsKept: r.stats.bulletsKept,
      nearDuplicatesFound: r.nearDupes.length,
    })),
  };
  fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
}

function lastConsolidationTime(vaultDir) {
  const logPath = path.join(vaultDir, "state", "consolidation-log.jsonl");
  if (!fs.existsSync(logPath)) return null;
  const lines = fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
  if (!lines.length) return null;
  try {
    return JSON.parse(lines[lines.length - 1]).ts;
  } catch {
    return null;
  }
}

function consolidate(vaultDir, { confirm } = {}) {
  const files = findStagingFiles(vaultDir);
  const results = files.map((f) => consolidateOneFile(f, { confirm })).filter(Boolean);
  if (confirm) appendConsolidationLog(vaultDir, results);
  return results;
}

module.exports = {
  parseStaging,
  consolidateStaging,
  findNearDuplicates,
  consolidateOneFile,
  findStagingFiles,
  consolidate,
  lastConsolidationTime,
};

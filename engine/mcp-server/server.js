#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  recallInstincts,
  saveInstinct,
  summarizeCost,
} = require("../lib/hook-runtime");
const {
  buildCachePrompt,
  splitPrompt,
} = require("../lib/prompt-cache");
const {
  listWakePlans,
  parseResetTime,
  scheduleWakePlan,
} = require("../lib/wake-manager");

const SERVER_INFO = {
  name: "token-efficient-agent-mcp",
  version: "0.1.0",
};

const MAX_TEXT_CHARS = 250000;
const DEFAULT_MAX_LINES = 80;
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_MEMORY_DIR = process.env.TEA_MEMORY_DIR || path.join(ROOT, "memory-vault");
const LEAN_LADDER = [
  "Does this need to exist? If not, skip it.",
  "Is it already in the codebase? Reuse it.",
  "Is it in the standard library? Use that.",
  "Is it native to the platform/framework? Use that.",
  "Is an installed dependency already available? Use that.",
  "Can this be one obvious line? Keep it one line.",
  "Otherwise build the smallest working version.",
];

function asString(value) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function limitInput(text) {
  const value = asString(text);
  if (value.length <= MAX_TEXT_CHARS) return value;
  return value.slice(0, MAX_TEXT_CHARS) + "\n[truncated: input exceeded local safety limit]";
}

function estimateTokenCount(text) {
  const value = asString(text);
  if (!value) return 0;
  return Math.ceil(value.length / 4);
}

function splitLines(text) {
  return limitInput(text).replace(/\r\n/g, "\n").split("\n");
}

function uniquePush(target, value, max = 40) {
  const trimmed = asString(value).trim();
  if (!trimmed || target.includes(trimmed) || target.length >= max) return;
  target.push(trimmed);
}

function lineKind(line) {
  if (/^\s*$/.test(line)) return "blank";
  if (/(fatal|panic|traceback|exception|stack trace)/i.test(line)) return "fatal";
  if (/(error|failed|failure|assertionerror|exit code|non-zero)/i.test(line)) return "error";
  if (/(warn|warning|deprecated|retry|timeout)/i.test(line)) return "warning";
  if (/(permission|denied|unauthorized|forbidden|auth|credential|secret)/i.test(line)) return "security";
  if (/(passed|success|ok\b|done|completed)/i.test(line)) return "success";
  return "other";
}

function isImportantLine(line) {
  return ["fatal", "error", "warning", "security"].includes(lineKind(line))
    || /^\s*(at\s+|File "|\d+\)|Caused by:|FAIL|ERROR|WARN)/.test(line)
    || /(:\d+:\d+|line \d+|Exit code:|Command failed)/i.test(line);
}

function extractExactAnchors(text) {
  const anchors = [];
  const patterns = [
    /[A-Za-z]:\\[^\s"'<>|]+/g,
    /(?:\.{0,2}\/)?[\w.-]+(?:\/[\w.-]+)+/g,
    /`([^`]+)`/g,
    /\b[A-Za-z_$][\w$]*\([^)]{0,80}\)/g,
    /\b[A-Z][A-Za-z0-9_]*(?:Error|Exception|Warning)\b/g,
    /\b[A-Z]{2,10}-\d+\b/g,
    /\b\d{4}-\d{2}-\d{2}\b/g,
  ];
  for (const pattern of patterns) {
    const matches = asString(text).matchAll(pattern);
    for (const match of matches) uniquePush(anchors, match[1] || match[0], 30);
  }
  return anchors;
}

function compactLines(lines, maxLines) {
  const keyLines = [];
  const seenNormalized = new Map();
  const omitted = {
    blank: 0,
    duplicate: 0,
    progress_or_noise: 0,
    low_signal: 0,
  };

  for (const raw of lines) {
    const line = asString(raw);
    const trimmed = line.trim();
    if (!trimmed) {
      omitted.blank += 1;
      continue;
    }

    const normalized = trimmed.replace(/\d+/g, "#").replace(/\s+/g, " ").slice(0, 220);
    const count = seenNormalized.get(normalized) || 0;
    seenNormalized.set(normalized, count + 1);
    if (count > 0) {
      omitted.duplicate += 1;
      continue;
    }

    if (/^(={3,}|-{3,}|\[=+\]|\d+%|progress\b|downloaded\b)/i.test(trimmed)) {
      omitted.progress_or_noise += 1;
      continue;
    }

    if (isImportantLine(trimmed)) {
      uniquePush(keyLines, trimmed, maxLines);
      continue;
    }

    if (keyLines.length < Math.min(12, maxLines) && trimmed.length <= 180) {
      uniquePush(keyLines, trimmed, maxLines);
    } else {
      omitted.low_signal += 1;
    }
  }

  return { keyLines, omitted };
}

function makeStats(before, afterText) {
  const beforeEstimate = estimateTokenCount(before);
  const afterEstimate = estimateTokenCount(afterText);
  const savedPercent = beforeEstimate === 0
    ? 0
    : Math.max(0, Math.round((1 - afterEstimate / beforeEstimate) * 100));
  return {
    before_estimate: beforeEstimate,
    after_estimate: afterEstimate,
    saved_percent: savedPercent,
  };
}

function compressText(args) {
  const text = limitInput(args.text);
  const maxLines = clampNumber(args.max_lines, DEFAULT_MAX_LINES, 10, 250);
  const mode = ["safe", "balanced", "aggressive"].includes(args.mode) ? args.mode : "balanced";
  const lines = splitLines(text);
  const limit = mode === "aggressive" ? Math.min(maxLines, 40) : maxLines;
  const compact = compactLines(lines, limit);
  const exactAnchors = extractExactAnchors(text);
  const summary = compact.keyLines.length
    ? compact.keyLines.slice(0, 6).join(" | ")
    : "No decisive high-signal lines found.";
  const output = {
    mode,
    summary,
    key_lines: compact.keyLines,
    preserved_exact_anchors: exactAnchors,
    omitted: compact.omitted,
    raw_needed: compact.keyLines.length === 0 && text.length > 2000,
  };
  return withStats(output, text);
}

function compressLog(args) {
  const log = limitInput(args.log);
  const maxLines = clampNumber(args.max_lines, DEFAULT_MAX_LINES, 10, 250);
  const lines = splitLines(log);
  const compact = compactLines(lines, maxLines);
  const kinds = compact.keyLines.map(lineKind);
  const status = kinds.includes("fatal") || kinds.includes("error")
    ? "fail"
    : kinds.includes("warning")
      ? "unknown"
      : /pass|success|completed|exit code:\s*0/i.test(log)
        ? "pass"
        : "unknown";
  const output = {
    status,
    decisive_lines: compact.keyLines,
    groups: Object.entries(compact.omitted)
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => ({ kind, count })),
    preserved_exact_anchors: extractExactAnchors(log),
    raw_needed: status === "unknown" && compact.keyLines.length < 3 && log.length > 4000,
  };
  return withStats(output, log);
}

function compressDiff(args) {
  const diff = limitInput(args.diff);
  const maxHunks = clampNumber(args.max_hunks, 30, 5, 120);
  const lines = splitLines(diff);
  const filesChanged = [];
  const keyHunks = [];
  const riskAreas = [];
  let currentFile = "";
  let omittedLines = 0;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      currentFile = line.replace(/^diff --git a\//, "").replace(/ b\/.*$/, "");
      uniquePush(filesChanged, currentFile, 100);
      continue;
    }
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6);
      uniquePush(filesChanged, currentFile, 100);
      continue;
    }
    if (line.startsWith("@@")) {
      uniquePush(keyHunks, `${currentFile || "unknown"} ${line}`, maxHunks);
      continue;
    }
    if (/^[+-]/.test(line) && !/^(---|\+\+\+)/.test(line)) {
      if (/(auth|token|secret|password|permission|delete|drop|migration|schema|payment|trade|order|risk|security)/i.test(line)) {
        uniquePush(riskAreas, `${currentFile || "unknown"}: ${line.trim()}`, 40);
      }
      if (keyHunks.length < maxHunks && isImportantLine(line)) {
        uniquePush(keyHunks, `${currentFile || "unknown"}: ${line.trim()}`, maxHunks);
      } else {
        omittedLines += 1;
      }
    }
  }

  const output = {
    files_changed: filesChanged,
    risk_areas: riskAreas,
    key_hunks: keyHunks,
    omitted_changed_lines: omittedLines,
    raw_needed: filesChanged.length === 0 && diff.length > 1000,
  };
  return withStats(output, diff);
}

function compressFileSummary(args) {
  const content = limitInput(args.content);
  const path = asString(args.path || "unknown");
  const maxLines = clampNumber(args.max_lines, 80, 10, 220);
  const lines = splitLines(content);
  const headings = [];
  const symbols = [];
  const imports = [];
  const keyLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(#|##|###)\s+/.test(trimmed)) uniquePush(headings, trimmed, 40);
    if (/^(import|from|const|let|var)\s+/.test(trimmed)) uniquePush(imports, trimmed, 30);
    if (/(function\s+\w+|class\s+\w+|def\s+\w+|interface\s+\w+|type\s+\w+\s*=)/.test(trimmed)) {
      uniquePush(symbols, trimmed, 60);
    }
    if (isImportantLine(trimmed)) uniquePush(keyLines, trimmed, maxLines);
  }

  const output = {
    path,
    line_count: lines.length,
    headings,
    imports: imports.slice(0, 12),
    symbols,
    key_lines: keyLines,
    preserved_exact_anchors: extractExactAnchors(content),
    raw_needed: symbols.length === 0 && headings.length === 0 && keyLines.length === 0 && content.length > 3000,
  };
  return withStats(output, content);
}

function compressMemoryNote(args) {
  const text = limitInput(args.text);
  const lines = splitLines(text);
  const keep = [];
  const removed = { duplicate: 0, filler: 0, blank: 0 };
  const seen = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      removed.blank += 1;
      continue;
    }
    const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(normalized)) {
      removed.duplicate += 1;
      continue;
    }
    seen.add(normalized);
    if (/^(sure|certainly|of course|happy to|basically|really|just)\b/i.test(trimmed)) {
      removed.filler += 1;
      continue;
    }
    if (
      /must|never|always|prefer|avoid|when|use|do not|exact|path|command|validation|scope|boundary/i.test(trimmed)
      || /[`"'\\/:]/.test(trimmed)
      || keep.length < 20
    ) {
      keep.push(trimmed);
    } else {
      removed.filler += 1;
    }
  }

  const compressed = keep.join("\n");
  const output = {
    compressed,
    rules_preserved: keep.filter((line) => /must|never|always|do not|exact/i.test(line)).slice(0, 30),
    preserved_exact_anchors: extractExactAnchors(text),
    removed,
  };
  return withStats(output, text, compressed);
}

function estimateTokens(args) {
  const before = asString(args.before);
  const after = asString(args.after);
  return makeStats(before, after);
}

function leanLadder() {
  return {
    mode: "lean-code",
    ladder: LEAN_LADDER,
    rules: [
      "Prefer deletion, reuse, stdlib, native APIs, and installed dependencies before new code.",
      "Add abstractions only when they remove real duplication or risk.",
      "Add one small runnable check for non-trivial behavior.",
      "Mark intentional shortcuts with: lean-debt: <reason>; remove when <condition>",
    ],
  };
}

function shouldSkipDir(name) {
  return [".git", "node_modules", ".tea-stats", "dist", "build", ".next", ".cache", "__pycache__"].includes(name);
}

function scanDebtMarkers(args) {
  const root = path.resolve(asString(args.path || process.cwd()));
  const maxHits = clampNumber(args.max_hits, 200, 10, 1000);
  const markers = [
    /lean-debt:\s*(.+)/i,
    /token-debt:\s*(.+)/i,
    /shortcut:\s*(.+)/i,
    /TODO\(token-efficient\):\s*(.+)/i,
  ];
  const hits = [];

  function walk(dir) {
    if (hits.length >= maxHits) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (hits.length >= maxHits) break;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipDir(entry.name)) walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      let text = "";
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > 1024 * 1024) continue;
        text = fs.readFileSync(fullPath, "utf8");
      } catch {
        continue;
      }
      text.split(/\r?\n/).forEach((line, index) => {
        if (hits.length >= maxHits) return;
        for (const marker of markers) {
          const match = line.match(marker);
          if (!match) continue;
          hits.push({
            path: path.relative(root, fullPath) || fullPath,
            line: index + 1,
            marker: match[0].trim(),
          });
          break;
        }
      });
    }
  }

  walk(root);
  return {
    root,
    count: hits.length,
    hits,
    truncated: hits.length >= maxHits,
    riskiest: hits[0] || null,
  };
}

function looksSensitive(text) {
  return /(api[_-]?key|secret|password|passwd|oauth|bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]{12,}|token\s*[:=]|private key|recovery phrase)/i.test(asString(text));
}

function resolveMemoryDir(value) {
  return path.resolve(asString(value || DEFAULT_MEMORY_DIR));
}

function observationsPath(memoryDir) {
  return path.join(resolveMemoryDir(memoryDir), "observations.jsonl");
}

function observationId() {
  return `obs_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${process.pid}_${Math.random().toString(36).slice(2, 7)}`;
}

function readObservations(memoryDir) {
  const file = observationsPath(memoryDir);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function observeAdd(args) {
  const text = asString(args.text).trim();
  if (!text) throw new Error("Missing observation text");
  if (looksSensitive(text)) throw new Error("Refusing to save secret-looking observation.");
  const memoryDir = resolveMemoryDir(args.memory_dir);
  fs.mkdirSync(memoryDir, { recursive: true });
  const observation = {
    id: observationId(),
    ts: new Date().toISOString(),
    type: asString(args.type || "note"),
    project: asString(args.project || ""),
    text,
  };
  fs.appendFileSync(observationsPath(memoryDir), JSON.stringify(observation) + "\n", "utf8");
  return { memory_dir: memoryDir, path: observationsPath(memoryDir), observation };
}

function scoreObservation(observation, terms) {
  const haystack = `${observation.id} ${observation.type} ${observation.project} ${observation.text}`.toLowerCase();
  return terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
}

function observeSearch(args) {
  const terms = asString(args.query).toLowerCase().split(/[^a-z0-9_.:-]+/i).filter((term) => term.length >= 2);
  if (!terms.length) throw new Error("Missing observation search query");
  const memoryDir = resolveMemoryDir(args.memory_dir);
  const limit = clampNumber(args.limit, 12, 1, 50);
  const hits = readObservations(memoryDir)
    .map((observation) => ({ ...observation, score: scoreObservation(observation, terms) }))
    .filter((observation) => observation.score > 0)
    .sort((a, b) => b.score - a.score || asString(b.ts).localeCompare(asString(a.ts)))
    .slice(0, limit);
  return { query: args.query, memory_dir: memoryDir, count: hits.length, hits };
}

function memoryHealth(args) {
  const memoryDir = resolveMemoryDir(args.memory_dir);
  const file = observationsPath(memoryDir);
  const observations = readObservations(memoryDir);
  const times = observations.map((row) => Date.parse(row.ts || "")).filter(Number.isFinite).sort((a, b) => a - b);
  const now = Date.now();
  const olderThan365 = observations.filter((row) => {
    const time = Date.parse(row.ts || "");
    return Number.isFinite(time) && now - time > 365 * 24 * 60 * 60 * 1000;
  }).length;
  return {
    memory_dir: memoryDir,
    observations_file: file,
    observation_count: observations.length,
    observations_bytes: fs.existsSync(file) ? fs.statSync(file).size : 0,
    oldest: times[0] ? new Date(times[0]).toISOString() : null,
    newest: times.length ? new Date(times[times.length - 1]).toISOString() : null,
    older_than_365_days: olderThan365,
  };
}

function costReport(args) {
  const memoryDir = resolveMemoryDir(args.memory_dir);
  return summarizeCost(memoryDir);
}

function instinctsAdd(args) {
  const memoryDir = resolveMemoryDir(args.memory_dir);
  fs.mkdirSync(memoryDir, { recursive: true });
  const result = saveInstinct(memoryDir, {
    action: asString(args.action),
    scope: args.global ? "global" : "project",
    project: asString(args.project || path.basename(process.cwd())),
    trigger: asString(args.trigger || "when relevant"),
    confidence: args.confidence || 0.7,
    domain: asString(args.domain || "workflow"),
    evidence: "mcp",
  });
  return { memory_dir: memoryDir, ...result };
}

function instinctsRecall(args) {
  const memoryDir = resolveMemoryDir(args.memory_dir);
  const query = asString(args.query).trim();
  if (!query) throw new Error("Missing instinct recall query");
  const project = asString(args.project || path.basename(process.cwd()));
  const limit = clampNumber(args.limit, 6, 1, 20);
  const hits = recallInstincts(memoryDir, project, query, limit);
  return { memory_dir: memoryDir, project, query, count: hits.length, hits };
}

function cachePromptBuild(args) {
  const stableText = asString(args.stable_text);
  const dynamicText = asString(args.dynamic_text);
  if (!stableText && !dynamicText) throw new Error("Missing stable_text or dynamic_text");
  return buildCachePrompt({
    stableText,
    dynamicText,
    key: asString(args.cache_key || "token-kit-cache"),
  });
}

function cachePromptSplit(args) {
  const promptText = asString(args.prompt_text);
  if (!promptText) throw new Error("Missing prompt_text");
  return splitPrompt(promptText);
}

function wakeStatus(args) {
  const memoryDir = resolveMemoryDir(args.memory_dir);
  return { memory_dir: memoryDir, plans: listWakePlans(memoryDir) };
}

function wakeSchedule(args) {
  const memoryDir = resolveMemoryDir(args.memory_dir);
  const at = asString(args.at);
  if (!at) throw new Error("Missing at");
  const runAt = parseResetTime(at) || new Date(at);
  if (Number.isNaN(runAt.getTime())) throw new Error(`Invalid wake time: ${at}`);
  return scheduleWakePlan({
    memoryDir,
    runAt,
    project: asString(args.project || path.basename(process.cwd())),
    cwd: asString(args.cwd || process.cwd()),
    host: "mcp",
    event: "wake_schedule",
    reason: asString(args.reason || "manual"),
    handoffFile: asString(args.handoff_file || ""),
  });
}

function withStats(output, before, afterOverride) {
  const afterText = afterOverride || JSON.stringify(output);
  return {
    ...output,
    token_estimate: makeStats(before, afterText),
  };
}

const tools = [
  {
    name: "compress_text",
    description: "Compact arbitrary text while preserving exact technical anchors.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        mode: { type: "string", enum: ["safe", "balanced", "aggressive"] },
        max_lines: { type: "number" },
      },
      required: ["text"],
    },
  },
  {
    name: "compress_log",
    description: "Summarize logs into status, decisive lines, repeated-noise groups, and exact anchors.",
    inputSchema: {
      type: "object",
      properties: {
        log: { type: "string" },
        max_lines: { type: "number" },
      },
      required: ["log"],
    },
  },
  {
    name: "compress_diff",
    description: "Summarize diffs by changed files, key hunks, risk areas, and omitted line count.",
    inputSchema: {
      type: "object",
      properties: {
        diff: { type: "string" },
        max_hunks: { type: "number" },
      },
      required: ["diff"],
    },
  },
  {
    name: "compress_file_summary",
    description: "Summarize a file by headings, imports, symbols, key lines, and exact anchors.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string" },
        path: { type: "string" },
        max_lines: { type: "number" },
      },
      required: ["content"],
    },
  },
  {
    name: "compress_memory_note",
    description: "Compress reusable memory/instruction notes while preserving rules and exact anchors.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
      },
      required: ["text"],
    },
  },
  {
    name: "estimate_tokens",
    description: "Estimate token savings for before/after text using a lightweight local heuristic.",
    inputSchema: {
      type: "object",
      properties: {
        before: { type: "string" },
        after: { type: "string" },
      },
      required: ["before", "after"],
    },
  },
  {
    name: "lean_ladder",
    description: "Return the lean-code decision ladder for minimizing new code and future context load.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "scan_debt_markers",
    description: "Scan a local path for lean-debt, token-debt, shortcut, and TODO(token-efficient) markers.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        max_hits: { type: "number" },
      },
    },
  },
  {
    name: "observe_add",
    description: "Save a compact non-secret observation to the local memory vault.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        type: { type: "string" },
        project: { type: "string" },
        memory_dir: { type: "string" },
      },
      required: ["text"],
    },
  },
  {
    name: "observe_search",
    description: "Search compact observations from the local memory vault by keyword.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
        memory_dir: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_health",
    description: "Report local observation memory size, age, and cleanup candidates.",
    inputSchema: {
      type: "object",
      properties: {
        memory_dir: { type: "string" },
      },
    },
  },
  {
    name: "cost_report",
    description: "Report local token usage snapshots captured by host lifecycle hooks.",
    inputSchema: {
      type: "object",
      properties: {
        memory_dir: { type: "string" },
      },
    },
  },
  {
    name: "instincts_add",
    description: "Save a small non-secret learned pattern for a project or globally.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string" },
        trigger: { type: "string" },
        confidence: { type: "number" },
        domain: { type: "string" },
        project: { type: "string" },
        global: { type: "boolean" },
        memory_dir: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "instincts_recall",
    description: "Recall relevant learned patterns for the current project.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        project: { type: "string" },
        limit: { type: "number" },
        memory_dir: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "cache_prompt_build",
    description: "Build a cache-friendly prompt with stable prefix first and changing task tail last.",
    inputSchema: {
      type: "object",
      properties: {
        stable_text: { type: "string" },
        dynamic_text: { type: "string" },
        cache_key: { type: "string" },
      },
    },
  },
  {
    name: "cache_prompt_split",
    description: "Split a prompt into stable prefix and dynamic tail using markers or headings.",
    inputSchema: {
      type: "object",
      properties: {
        prompt_text: { type: "string" },
      },
      required: ["prompt_text"],
    },
  },
  {
    name: "wake_status",
    description: "List scheduled, fired, and cancelled limit-reset wake plans.",
    inputSchema: {
      type: "object",
      properties: {
        memory_dir: { type: "string" },
      },
    },
  },
  {
    name: "wake_schedule",
    description: "Schedule a local wake plan for a reset time and optional handoff file.",
    inputSchema: {
      type: "object",
      properties: {
        at: { type: "string" },
        project: { type: "string" },
        cwd: { type: "string" },
        reason: { type: "string" },
        handoff_file: { type: "string" },
        memory_dir: { type: "string" },
      },
      required: ["at"],
    },
  },
];

const toolHandlers = {
  compress_text: compressText,
  compress_log: compressLog,
  compress_diff: compressDiff,
  compress_file_summary: compressFileSummary,
  compress_memory_note: compressMemoryNote,
  estimate_tokens: estimateTokens,
  lean_ladder: leanLadder,
  scan_debt_markers: scanDebtMarkers,
  observe_add: observeAdd,
  observe_search: observeSearch,
  memory_health: memoryHealth,
  cost_report: costReport,
  instincts_add: instinctsAdd,
  instincts_recall: instinctsRecall,
  cache_prompt_build: cachePromptBuild,
  cache_prompt_split: cachePromptSplit,
  wake_status: wakeStatus,
  wake_schedule: wakeSchedule,
};

function ok(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function fail(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

function toolResult(result) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

function handleRequest(message) {
  if (!message || message.jsonrpc !== "2.0") return;
  if (message.id === undefined || message.id === null) return;

  try {
    switch (message.method) {
      case "initialize":
        ok(message.id, {
          protocolVersion: message.params?.protocolVersion || "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        });
        break;
      case "ping":
        ok(message.id, {});
        break;
      case "tools/list":
        ok(message.id, { tools });
        break;
      case "tools/call": {
        const name = message.params?.name;
        const args = message.params?.arguments || {};
        const handler = toolHandlers[name];
        if (!handler) {
          fail(message.id, -32602, `Unknown tool: ${name}`);
          return;
        }
        ok(message.id, toolResult(handler(args)));
        break;
      }
      default:
        fail(message.id, -32601, `Method not found: ${message.method}`);
    }
  } catch (error) {
    fail(message.id, -32000, error && error.message ? error.message : String(error));
  }
}

let inputBuffer = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  while (true) {
    const headerEnd = inputBuffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;
    const header = inputBuffer.slice(0, headerEnd).toString("utf8");
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      inputBuffer = inputBuffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (inputBuffer.length < bodyEnd) return;
    const body = inputBuffer.slice(bodyStart, bodyEnd).toString("utf8");
    inputBuffer = inputBuffer.slice(bodyEnd);
    try {
      handleRequest(JSON.parse(body));
    } catch (error) {
      fail(null, -32700, "Parse error");
    }
  }
});

process.stdin.resume();

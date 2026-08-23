#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const {
  DEFAULT_THRESHOLD,
  DEFAULT_TOKEN_THRESHOLD,
  manualHandoff,
  sessionStatus,
} = require("../lib/session-rollover");
const {
  recallInstincts,
  saveInstinct,
  summarizeCost,
} = require("../lib/hook-runtime");
const {
  buildCachePrompt,
  writeCacheSplit,
} = require("../lib/prompt-cache");
const {
  cancelWakePlan,
  listWakePlans,
  parseResetTime,
  runDueWakePlans,
  scheduleWakePlan,
} = require("../lib/wake-manager");

const VERSION = "0.3.0";
const ROOT = path.resolve(__dirname, "..");
const STATS_DIR = path.join(ROOT, ".tea-stats");
const STATS_FILE = path.join(STATS_DIR, "token-savings.jsonl");
const DEFAULT_MEMORY_DIR = process.env.TEA_MEMORY_DIR || path.join(ROOT, "memory-vault");
const MEMORY_TEMPLATE_DIR = path.join(ROOT, "memory-templates");
const LEAN_LADDER = [
  "1. Does this need to exist? If not, skip it.",
  "2. Is it already in the codebase? Reuse it.",
  "3. Is it in the standard library? Use that.",
  "4. Is it native to the platform/framework? Use that.",
  "5. Is an installed dependency already available? Use that.",
  "6. Can this be one obvious line? Keep it one line.",
  "7. Otherwise build the smallest working version.",
];

function usage() {
  return `tea ${VERSION}

Usage:
  node tea.js compress <file> [--out <file>] [--mode safe|balanced|aggressive]
  node tea.js clipboard [--mode safe|balanced|aggressive]
  node tea.js estimate <before-file> <after-file>
  node tea.js after-task <raw-file> <compact-file> [--label <text>] [--json]
  node tea.js run [--label <text>] [--mode safe|balanced|aggressive] -- <command> [args...]
  node tea.js stats [--json]
  node tea.js receipt [path] [--json]
  node tea.js stats-reset
  node tea.js lean
  node tea.js debt [path] [--json]
  node tea.js gain [--json]
  node tea.js vault init [path]
  node tea.js vault github-init [path] [--repo token-efficient-agent-memory-vault]
  node tea.js vault sync [path] [--message <text>]
  node tea.js vault status [path]
  node tea.js memory-map show [path]
  node tea.js memory-map recall <query> [path] [--json]
  node tea.js memory-map add <text> [path]
  node tea.js memory-map compress [path] [--out <file>]
  node tea.js observe add <text> [path] [--type <type>] [--project <name>] [--json]
  node tea.js observe search <query> [path] [--json]
  node tea.js observe get <id> [path] [--json]
  node tea.js observe timeline <id> [path] [--json]
  node tea.js memory-health [path] [--json]
  node tea.js memory-refresh plan [path] [--days 365] [--json]
  node tea.js memory-refresh prune [path] [--days 365] --confirm
  node tea.js session-rollover status [path] [--json]
  node tea.js session-rollover handoff [path] [--project <name>] [--reason <text>] [--turns 12] [--token-threshold <tokens>]
  node tea.js wake status [path] [--json]
  node tea.js wake schedule [path] --at <time> [--project <name>] [--handoff <file>] [--reason <text>]
  node tea.js wake run-due [path] [--json] [--no-clipboard]
  node tea.js wake cancel <id> [path]
  node tea.js cost report [path] [--json]
  node tea.js instincts add <action> [path] [--project <name>] [--global] [--trigger <text>] [--confidence 0.7] [--domain <name>] [--json]
  node tea.js instincts list [path] [--project <name>] [--json]
  node tea.js instincts recall <query> [path] [--project <name>] [--json]
  node tea.js cache-prompt build <stable-file> <dynamic-file> [--out <file>] [--key <name>] [--json]
  node tea.js cache-prompt split <prompt-file> [--out-dir <dir>] [--json]
  node tea.js bridge start [--port 6768]

Examples:
  node tea.js compress C:\\prompts\\big-task.md
  node tea.js compress prompt.md --out prompt.compact.md
  node tea.js after-task raw-task.txt final-task.txt --label "repo review"
  node tea.js run --label "tests" -- npm test
  node tea.js clipboard
  node tea.js stats
  node tea.js receipt
  node tea.js lean
  node tea.js debt C:\\repo
  node tea.js vault init
  node tea.js vault github-init
  node tea.js vault sync
  node tea.js memory-map recall token-agent-kit
  node tea.js observe add "pytest failed on auth route" --type error --project my-repo
  node tea.js observe search "auth route"
  node tea.js memory-health
  node tea.js memory-refresh plan --days 365
  node tea.js session-rollover status
  node tea.js session-rollover handoff --project token-kit --reason manual --token-threshold 6000
  node tea.js wake status
  node tea.js wake schedule --at "5:30 PM" --project token-kit --reason limit-reset
  node tea.js wake run-due
  node tea.js cost report
  node tea.js instincts add "Prefer narrow rg search before large file reads" --project token-kit
  node tea.js instincts recall "large file reads" --project token-kit
  node tea.js cache-prompt build stable.md task.md --out prompt.cache.md --key my-project
  node tea.js cache-prompt split prompt.md --out-dir prompt-cache
  node tea.js bridge start
`;
}

function argValue(args, flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function positionalArgs(args, valueFlags = []) {
  const positions = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (valueFlags.includes(arg)) {
      index += 1;
      continue;
    }
    if (!arg.startsWith("-")) positions.push(arg);
  }
  return positions;
}

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function savings(beforeText, afterText) {
  const beforeTokens = estimateTokens(beforeText);
  const afterTokens = estimateTokens(afterText);
  const savedTokens = Math.max(0, beforeTokens - afterTokens);
  const savedPercent = beforeTokens ? Math.max(0, Math.round((savedTokens / beforeTokens) * 100)) : 0;
  return { beforeTokens, afterTokens, savedTokens, savedPercent };
}

function uniquePush(list, value, max = 80) {
  const trimmed = String(value || "").trim();
  if (!trimmed || list.includes(trimmed) || list.length >= max) return;
  list.push(trimmed);
}

function extractAnchors(text) {
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
    for (const match of String(text || "").matchAll(pattern)) {
      uniquePush(anchors, match[1] || match[0], 50);
    }
  }
  return anchors;
}

function isImportant(line) {
  return /(must|never|always|exact|path|command|error|failed|failure|warning|token|secret|permission|auth|scope|validation|requirement|deliverable|output|install|run|copy|paste|github|mcp|skill|plugin)/i.test(line)
    || /[`"'\\/:]/.test(line)
    || /^#{1,6}\s/.test(line)
    || /^[-*]\s/.test(line)
    || /^\d+\.\s/.test(line);
}

function compressText(text, mode = "balanced") {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const maxLines = mode === "aggressive" ? 80 : mode === "safe" ? 180 : 120;
  const keep = [];
  const seen = new Set();
  let duplicate = 0;
  let blank = 0;
  let filler = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      blank += 1;
      continue;
    }
    const normalized = line.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ");
    if (seen.has(normalized)) {
      duplicate += 1;
      continue;
    }
    seen.add(normalized);
    if (/^(sure|certainly|of course|happy to|please note|basically|really|just)\b/i.test(line)) {
      filler += 1;
      continue;
    }
    if (isImportant(line) || keep.length < maxLines) {
      uniquePush(keep, line, maxLines);
    } else {
      filler += 1;
    }
  }

  const anchors = extractAnchors(text);
  const body = keep.join("\n");
  const stats = savings(text, body);
  const meta = [
    "--- compressed prompt ---",
    `mode: ${mode}`,
    `estimated_tokens_before: ${stats.beforeTokens}`,
    `estimated_tokens_after: ${stats.afterTokens}`,
    `estimated_tokens_saved: ${stats.savedTokens}`,
    `estimated_token_saved_percent: ${stats.savedPercent}`,
    `removed_blank: ${blank}`,
    `removed_duplicate: ${duplicate}`,
    `removed_low_signal: ${filler}`,
    anchors.length ? `preserve_exact: ${anchors.slice(0, 30).join(" | ")}` : "preserve_exact: none detected",
    "---",
    "",
  ].join("\n");
  const output = meta + body.trim() + "\n";
  return { output, body, stats: savings(text, output), bodyStats: stats };
}

function readClipboard() {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", "Get-Clipboard -Raw"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(result.stderr || "Could not read clipboard");
  return result.stdout;
}

function writeClipboard(text) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", "Set-Clipboard -Value ([Console]::In.ReadToEnd())"], {
    input: text,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(result.stderr || "Could not write clipboard");
}

function recordStats(event) {
  fs.mkdirSync(STATS_DIR, { recursive: true });
  const row = {
    timestamp: new Date().toISOString(),
    host: os.hostname(),
    ...event,
  };
  fs.appendFileSync(STATS_FILE, JSON.stringify(row) + "\n", "utf8");
}

function readStats() {
  if (!fs.existsSync(STATS_FILE)) return [];
  return fs.readFileSync(STATS_FILE, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function summarizeStats(rows) {
  const totals = rows.reduce((acc, row) => {
    acc.events += 1;
    acc.beforeTokens += Number(row.beforeTokens || 0);
    acc.afterTokens += Number(row.afterTokens || 0);
    acc.savedTokens += Number(row.savedTokens || 0);
    acc.bySource[row.source || "unknown"] = (acc.bySource[row.source || "unknown"] || 0) + 1;
    return acc;
  }, { events: 0, beforeTokens: 0, afterTokens: 0, savedTokens: 0, bySource: {} });
  totals.savedPercent = totals.beforeTokens ? Math.round((totals.savedTokens / totals.beforeTokens) * 100) : 0;
  return totals;
}

function printStats(json) {
  const rows = readStats();
  const totals = summarizeStats(rows);
  if (json) {
    console.log(JSON.stringify({ statsFile: STATS_FILE, totals, recent: rows.slice(-10) }, null, 2));
    return;
  }
  console.log(`stats_file: ${STATS_FILE}`);
  console.log(`events: ${totals.events}`);
  console.log(`tokens_before_est: ${totals.beforeTokens}`);
  console.log(`tokens_after_est: ${totals.afterTokens}`);
  console.log(`tokens_saved_est: ${totals.savedTokens}`);
  console.log(`saved_percent_est: ${totals.savedPercent}`);
  console.log(`by_source: ${Object.entries(totals.bySource).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}`);
}

function receiptSummary(dirArg) {
  const totals = summarizeStats(readStats());
  const vaultDir = resolveMemoryDir(dirArg);
  const session = sessionStatus(vaultDir)[0] || {};
  const usage = summarizeCost(vaultDir).totals;
  return {
    statsEvents: totals.events,
    tokensSavedEst: totals.savedTokens,
    savedPercentEst: totals.savedPercent,
    rolloverTurns: Number(session.userTurns || 0),
    rolloverThreshold: Number(session.threshold || DEFAULT_THRESHOLD),
    rolloverTokens: Number(session.estimatedPromptTokens || 0),
    rolloverTokenThreshold: Number(session.tokenThreshold || DEFAULT_TOKEN_THRESHOLD),
    cacheReadTokens: Number(usage.cacheReadTokens || 0),
    cacheWriteTokens: Number(usage.cacheWriteTokens || 0),
    cachedTokens: Number(usage.cachedTokens || 0),
    project: session.project || "",
    latestHandoff: session.handoffs && session.handoffs.length ? session.handoffs[session.handoffs.length - 1].file : "",
  };
}

function formatReceipt(summary) {
  return `Token receipt: stats ${summary.statsEvents}, saved ${summary.tokensSavedEst} est (${summary.savedPercentEst}%); cache read/write/cached ${summary.cacheReadTokens}/${summary.cacheWriteTokens}/${summary.cachedTokens}; rollover ${summary.rolloverTurns}/${summary.rolloverThreshold}, tokens ${summary.rolloverTokens}/${summary.rolloverTokenThreshold}.`;
}

function printReceipt(dirArg, json) {
  const summary = receiptSummary(dirArg);
  if (json) {
    console.log(JSON.stringify({ ...summary, receipt: formatReceipt(summary) }, null, 2));
    return;
  }
  console.log(formatReceipt(summary));
}

function printAfterTask(beforeFile, afterFile, label, json) {
  if (!beforeFile || !afterFile) throw new Error("Usage: node tea.js after-task <raw-file> <compact-file> [--label <text>] [--json]");
  const beforePath = path.resolve(beforeFile);
  const afterPath = path.resolve(afterFile);
  const result = savings(fs.readFileSync(beforePath, "utf8"), fs.readFileSync(afterPath, "utf8"));
  const event = {
    source: "after-task",
    label: label || path.basename(afterPath),
    input: beforePath,
    output: afterPath,
    ...result,
  };
  recordStats(event);
  if (json) {
    console.log(JSON.stringify({ statsFile: STATS_FILE, event }, null, 2));
    return;
  }
  console.log(`task: ${event.label}`);
  console.log(`tokens_before_est: ${result.beforeTokens}`);
  console.log(`tokens_after_est: ${result.afterTokens}`);
  console.log(`tokens_saved_est: ${result.savedTokens}`);
  console.log(`saved_percent_est: ${result.savedPercent}`);
  console.log(`stats_file: ${STATS_FILE}`);
}

function runObservedTask(args) {
  const separator = args.indexOf("--");
  if (separator === -1 || separator + 1 >= args.length) {
    throw new Error("Usage: node tea.js run [--label <text>] [--mode safe|balanced|aggressive] -- <command> [args...]");
  }
  const label = argValue(args, "--label", "");
  const mode = argValue(args, "--mode", "balanced");
  const commandArgs = args.slice(separator + 1);
  const startedAt = new Date().toISOString();
  const result = spawnSync(commandArgs[0], commandArgs.slice(1), {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  const exitCode = result.error ? 127 : (typeof result.status === "number" ? result.status : 1);
  const raw = [
    `started_at: ${startedAt}`,
    `exit_code: ${exitCode}`,
    result.error ? `error: ${result.error.message}` : "",
    "--- stdout ---",
    stdout,
    "--- stderr ---",
    stderr,
  ].filter(Boolean).join("\n");
  const compact = compressText(raw, mode);
  recordStats({
    source: "task-run",
    mode,
    label: label || commandArgs[0],
    command: commandArgs[0],
    exitCode,
    ...compact.bodyStats,
  });
  const observation = addObservation([
    `task=${label || commandArgs[0]}`,
    `command=${commandArgs[0]}`,
    `cwd=${process.cwd()}`,
    `exit_code=${exitCode}`,
    `tokens_before_est=${compact.bodyStats.beforeTokens}`,
    `tokens_after_est=${compact.bodyStats.afterTokens}`,
    `tokens_saved_est=${compact.bodyStats.savedTokens}`,
  ].join(" "), DEFAULT_MEMORY_DIR, {
    type: exitCode === 0 ? "task" : "error",
    project: path.basename(process.cwd()),
    silent: true,
  });
  console.log("");
  console.log("--- token-efficient task metrics ---");
  console.log(`task: ${label || commandArgs[0]}`);
  console.log(`exit_code: ${exitCode}`);
  console.log(`observation_id: ${observation.id}`);
  console.log(`tokens_before_est: ${compact.bodyStats.beforeTokens}`);
  console.log(`tokens_after_est: ${compact.bodyStats.afterTokens}`);
  console.log(`tokens_saved_est: ${compact.bodyStats.savedTokens}`);
  console.log(`saved_percent_est: ${compact.bodyStats.savedPercent}`);
  console.log(`stats_file: ${STATS_FILE}`);
  if (result.error) console.error(result.error.message);
  process.exitCode = exitCode;
}

function printLean(json) {
  const output = {
    mode: "lean-code",
    ladder: LEAN_LADDER,
    rules: [
      "Prefer deletion, reuse, stdlib, native APIs, and installed dependencies before new code.",
      "Add abstractions only when they remove real duplication or risk.",
      "Add one small runnable check for non-trivial behavior.",
      "Mark intentional shortcuts with: lean-debt: <reason>; remove when <condition>",
    ],
  };
  if (json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  console.log("lean_code_ladder:");
  for (const line of output.ladder) console.log(line);
  console.log("rules:");
  for (const rule of output.rules) console.log(`- ${rule}`);
}

function shouldSkipDir(name) {
  return [".git", "node_modules", ".tea-stats", "dist", "build", ".next", ".cache", "__pycache__"].includes(name);
}

function copyDirIfMissing(source, target) {
  fs.mkdirSync(target, { recursive: true });
  if (!fs.existsSync(source)) return;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dst = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirIfMissing(src, dst);
      continue;
    }
    if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
  }
}

function resolveMemoryDir(arg) {
  return path.resolve(arg || DEFAULT_MEMORY_DIR);
}

function vaultInit(dirArg) {
  const vaultDir = resolveMemoryDir(dirArg);
  copyDirIfMissing(MEMORY_TEMPLATE_DIR, vaultDir);
  for (const folder of ["projects", "decisions", "concepts"]) {
    fs.mkdirSync(path.join(vaultDir, folder), { recursive: true });
  }
  console.log(`memory_vault: ${vaultDir}`);
  console.log(`memory_map: ${path.join(vaultDir, "memory-map.md")}`);
}

function walkMarkdown(root) {
  const files = [];
  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipDir(entry.name)) walk(fullPath);
        continue;
      }
      if (entry.isFile() && /\.md$/i.test(entry.name)) files.push(fullPath);
    }
  }
  walk(root);
  return files;
}

function memoryMapPath(dirArg) {
  return path.join(resolveMemoryDir(dirArg), "memory-map.md");
}

function showMemoryMap(dirArg) {
  const file = memoryMapPath(dirArg);
  if (!fs.existsSync(file)) throw new Error(`Memory map not found. Run: node tea.js vault init ${path.dirname(file)}`);
  process.stdout.write(fs.readFileSync(file, "utf8"));
}

function queryTerms(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9_.:-]+/i)
    .filter((term) => term.length >= 2);
}

function looksSensitive(text) {
  return /(api[_-]?key|secret|password|passwd|oauth|bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]{12,}|token\s*[:=]|private key|recovery phrase)/i.test(String(text || ""));
}

function recallMemory(query, dirArg, json) {
  const vaultDir = resolveMemoryDir(dirArg);
  if (!fs.existsSync(vaultDir)) throw new Error(`Memory vault not found. Run: node tea.js vault init ${vaultDir}`);
  const terms = queryTerms(query);
  if (!terms.length) throw new Error("Missing recall query");
  const hits = [];

  for (const file of walkMarkdown(vaultDir)) {
    const rel = path.relative(vaultDir, file);
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      const lower = line.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
      if (score > 0) hits.push({ path: rel, line: index + 1, score, text: line.trim() });
    });
  }

  hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line);
  const top = hits.filter((hit) => hit.text).slice(0, 12);
  const output = { query, vaultDir, count: top.length, hits: top };
  if (json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  if (!top.length) {
    console.log(`memory_recall: no hits for "${query}"`);
    return;
  }
  for (const hit of top) console.log(`${hit.path}:${hit.line} ${hit.text}`);
}

function appendMemory(text, dirArg) {
  const vaultDir = resolveMemoryDir(dirArg);
  if (!fs.existsSync(vaultDir)) vaultInit(vaultDir);
  const file = memoryMapPath(vaultDir);
  const line = `- ${new Date().toISOString().slice(0, 10)} ${String(text || "").trim()}`;
  if (!String(text || "").trim()) throw new Error("Missing memory text");
  fs.appendFileSync(file, `\n## Inbox\n\n${line}\n`, "utf8");
  console.log(`memory_added: ${file}`);
}

function compressMemoryMap(dirArg, outArg) {
  const file = memoryMapPath(dirArg);
  if (!fs.existsSync(file)) throw new Error(`Memory map not found. Run: node tea.js vault init ${path.dirname(file)}`);
  const text = fs.readFileSync(file, "utf8");
  const result = compressText(text, "safe");
  const out = path.resolve(outArg || path.join(path.dirname(file), "memory-map.compact.md"));
  const output = `# Compact Memory Map\n\n${result.body.trim()}\n`;
  const stats = savings(text, output);
  fs.writeFileSync(out, output, "utf8");
  recordStats({ source: "memory-map", mode: "safe", input: file, output: out, ...stats });
  console.log(`memory_map_compact: ${out}`);
  console.log(`tokens_est: ${stats.beforeTokens} -> ${stats.afterTokens}; saved ${stats.savedTokens} (${stats.savedPercent}%)`);
}

function observationsPath(dirArg) {
  return path.join(resolveMemoryDir(dirArg), "observations.jsonl");
}

function readObservations(dirArg) {
  const file = observationsPath(dirArg);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function observationTime(row) {
  const time = Date.parse(row && row.ts ? row.ts : "");
  return Number.isFinite(time) ? time : 0;
}

function observationId() {
  return `obs_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${process.pid}_${Math.random().toString(36).slice(2, 7)}`;
}

function addObservation(text, dirArg, options = {}) {
  const value = String(text || "").trim();
  if (!value) throw new Error("Missing observation text");
  if (looksSensitive(value)) throw new Error("Refusing to save secret-looking observation.");
  const vaultDir = resolveMemoryDir(dirArg);
  if (!fs.existsSync(vaultDir)) vaultInit(vaultDir);
  const observation = {
    id: observationId(),
    ts: new Date().toISOString(),
    type: options.type || "note",
    project: options.project || "",
    text: value,
  };
  fs.appendFileSync(observationsPath(vaultDir), JSON.stringify(observation) + "\n", "utf8");
  if (options.silent) return observation;
  if (options.json) {
    console.log(JSON.stringify({ path: observationsPath(vaultDir), observation }, null, 2));
    return observation;
  }
  console.log(`observation_added: ${observation.id}`);
  console.log(`path: ${observationsPath(vaultDir)}`);
  return observation;
}

function scoreObservation(observation, terms) {
  const haystack = `${observation.id} ${observation.type} ${observation.project} ${observation.text}`.toLowerCase();
  return terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
}

function searchObservations(query, dirArg, json) {
  const terms = queryTerms(query);
  if (!terms.length) throw new Error("Missing observation search query");
  const vaultDir = resolveMemoryDir(dirArg);
  const hits = readObservations(vaultDir)
    .map((observation) => ({ ...observation, score: scoreObservation(observation, terms) }))
    .filter((observation) => observation.score > 0)
    .sort((a, b) => b.score - a.score || String(b.ts).localeCompare(String(a.ts)))
    .slice(0, 20);
  const output = { query, vaultDir, count: hits.length, hits };
  if (json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  if (!hits.length) {
    console.log(`observation_search: no hits for "${query}"`);
    return;
  }
  for (const hit of hits) {
    console.log(`${hit.id} ${hit.ts} ${hit.type}${hit.project ? ` project=${hit.project}` : ""} score=${hit.score}`);
    console.log(`  ${hit.text}`);
  }
}

function getObservation(id, dirArg, json) {
  const wanted = String(id || "").trim();
  if (!wanted) throw new Error("Missing observation id");
  const vaultDir = resolveMemoryDir(dirArg);
  const observation = readObservations(vaultDir).find((row) => row.id === wanted);
  if (!observation) throw new Error(`Observation not found: ${wanted}`);
  if (json) {
    console.log(JSON.stringify({ vaultDir, observation }, null, 2));
    return;
  }
  console.log(`${observation.id} ${observation.ts} ${observation.type}${observation.project ? ` project=${observation.project}` : ""}`);
  console.log(observation.text);
}

function timelineObservation(id, dirArg, json) {
  const wanted = String(id || "").trim();
  if (!wanted) throw new Error("Missing observation id");
  const vaultDir = resolveMemoryDir(dirArg);
  const rows = readObservations(vaultDir);
  const index = rows.findIndex((row) => row.id === wanted);
  if (index === -1) throw new Error(`Observation not found: ${wanted}`);
  const window = rows.slice(Math.max(0, index - 3), Math.min(rows.length, index + 4));
  if (json) {
    console.log(JSON.stringify({ vaultDir, id: wanted, observations: window }, null, 2));
    return;
  }
  for (const row of window) {
    console.log(`${row.id} ${row.ts} ${row.type}${row.project ? ` project=${row.project}` : ""}`);
    console.log(`  ${row.text}`);
  }
}

function memoryHealth(dirArg, json) {
  const vaultDir = resolveMemoryDir(dirArg);
  const observations = readObservations(vaultDir);
  const file = observationsPath(vaultDir);
  const bytes = fs.existsSync(file) ? fs.statSync(file).size : 0;
  const times = observations.map(observationTime).filter(Boolean).sort((a, b) => a - b);
  const now = Date.now();
  const olderThan365 = observations.filter((row) => observationTime(row) && now - observationTime(row) > 365 * 24 * 60 * 60 * 1000).length;
  const byType = observations.reduce((acc, row) => {
    acc[row.type || "unknown"] = (acc[row.type || "unknown"] || 0) + 1;
    return acc;
  }, {});
  const output = {
    vaultDir,
    observationsFile: file,
    observationCount: observations.length,
    observationsBytes: bytes,
    oldest: times[0] ? new Date(times[0]).toISOString() : null,
    newest: times.length ? new Date(times[times.length - 1]).toISOString() : null,
    olderThan365,
    byType,
  };
  if (json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  console.log(`vault_dir: ${vaultDir}`);
  console.log(`observations: ${output.observationCount}`);
  console.log(`observations_bytes: ${output.observationsBytes}`);
  console.log(`oldest: ${output.oldest || "none"}`);
  console.log(`newest: ${output.newest || "none"}`);
  console.log(`older_than_365_days: ${output.olderThan365}`);
  console.log(`by_type: ${Object.entries(byType).map(([key, value]) => `${key}=${value}`).join(", ") || "none"}`);
}

function memoryRefreshPlan(dirArg, days, json) {
  const vaultDir = resolveMemoryDir(dirArg);
  const cutoffDays = Math.max(1, Number(days) || 365);
  const cutoff = Date.now() - cutoffDays * 24 * 60 * 60 * 1000;
  const candidates = readObservations(vaultDir)
    .filter((row) => observationTime(row) && observationTime(row) < cutoff)
    .map((row) => ({ id: row.id, ts: row.ts, type: row.type || "unknown", project: row.project || "", text: String(row.text || "").slice(0, 240) }));
  const output = { vaultDir, days: cutoffDays, cutoff: new Date(cutoff).toISOString(), count: candidates.length, candidates };
  if (json) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }
  console.log(`refresh_plan: older than ${cutoffDays} days`);
  console.log(`candidates: ${candidates.length}`);
  for (const row of candidates.slice(0, 30)) console.log(`${row.id} ${row.ts} ${row.type}${row.project ? ` project=${row.project}` : ""} ${row.text}`);
  if (candidates.length > 30) console.log(`... ${candidates.length - 30} more`);
  console.log("No files changed. Re-run with `memory-refresh prune --confirm` to delete after review.");
  return output;
}

function memoryRefreshPrune(dirArg, days, confirmed) {
  if (!confirmed) throw new Error("Refusing to delete memory without --confirm. Run memory-refresh plan first.");
  const vaultDir = resolveMemoryDir(dirArg);
  const file = observationsPath(vaultDir);
  if (!fs.existsSync(file)) {
    console.log(`observations_file: missing ${file}`);
    return;
  }
  const cutoffDays = Math.max(1, Number(days) || 365);
  const cutoff = Date.now() - cutoffDays * 24 * 60 * 60 * 1000;
  const rows = readObservations(vaultDir);
  const keep = rows.filter((row) => !observationTime(row) || observationTime(row) >= cutoff);
  const remove = rows.length - keep.length;
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const backup = path.join(path.dirname(file), `observations.backup.${stamp}.jsonl`);
  fs.copyFileSync(file, backup);
  fs.writeFileSync(file, keep.map((row) => JSON.stringify(row)).join("\n") + (keep.length ? "\n" : ""), "utf8");
  console.log(`observations_pruned: ${remove}`);
  console.log(`remaining: ${keep.length}`);
  console.log(`backup: ${backup}`);
}

function printSessionRolloverStatus(dirArg, json) {
  const vaultDir = resolveMemoryDir(dirArg);
  const rows = sessionStatus(vaultDir).slice(0, 20);
  if (json) {
    console.log(JSON.stringify({ vaultDir, sessions: rows }, null, 2));
    return;
  }
  console.log(`vault_dir: ${vaultDir}`);
  if (!rows.length) {
    console.log("session_rollover: no tracked sessions");
    return;
  }
  for (const row of rows) {
    console.log(`${row.sessionId} project=${row.project} turns=${row.userTurns} threshold=${row.threshold} tokens=${row.estimatedPromptTokens || 0} token_threshold=${row.tokenThreshold || 0} updated=${row.updatedAt}`);
    if (row.handoffs && row.handoffs.length) console.log(`  latest_handoff: ${row.handoffs[row.handoffs.length - 1].file}`);
  }
}

function printCostReport(dirArg, json) {
  const vaultDir = resolveMemoryDir(dirArg);
  const report = summarizeCost(vaultDir);
  if (json) {
    console.log(JSON.stringify({ vaultDir, ...report }, null, 2));
    return;
  }
  const totals = report.totals;
  console.log(`metrics_file: ${report.metricsFile}`);
  console.log(`rows: ${report.rows}`);
  console.log(`sessions: ${totals.sessions}`);
  console.log(`input_tokens: ${totals.inputTokens}`);
  console.log(`output_tokens: ${totals.outputTokens}`);
  console.log(`cache_write_tokens: ${totals.cacheWriteTokens}`);
  console.log(`cache_read_tokens: ${totals.cacheReadTokens}`);
  console.log(`cached_tokens: ${totals.cachedTokens}`);
  if (totals.costRows) {
    console.log(`host_cost_usd: ${totals.estimatedCostUsd.toFixed(6)}`);
  } else {
    console.log("host_cost_usd: unavailable");
  }
}

function printInstinct(row) {
  const project = row.project ? ` project=${row.project}` : "";
  console.log(`${row.id} ${row.scope}${project} confidence=${row.confidence} domain=${row.domain}`);
  console.log(`  trigger: ${row.trigger}`);
  console.log(`  action: ${row.action}`);
}

function addInstinctCommand(dirArg, args, json) {
  const vaultDir = resolveMemoryDir(dirArg);
  if (!fs.existsSync(vaultDir)) vaultInit(vaultDir);
  const action = args[2];
  const result = saveInstinct(vaultDir, {
    action,
    scope: hasFlag(args, "--global") ? "global" : "project",
    project: argValue(args, "--project", path.basename(process.cwd())),
    trigger: argValue(args, "--trigger", "when relevant"),
    confidence: argValue(args, "--confidence", "0.7"),
    domain: argValue(args, "--domain", "workflow"),
    evidence: "manual",
  });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`${result.duplicate ? "instinct_exists" : "instinct_added"}: ${result.row.id}`);
  console.log(`path: ${result.file}`);
}

function listInstinctsCommand(dirArg, args, json) {
  const vaultDir = resolveMemoryDir(dirArg);
  const project = argValue(args, "--project", path.basename(process.cwd()));
  const rows = recallInstincts(vaultDir, project, "", 100);
  if (json) {
    console.log(JSON.stringify({ vaultDir, project, count: rows.length, instincts: rows }, null, 2));
    return;
  }
  console.log(`vault_dir: ${vaultDir}`);
  console.log(`project: ${project}`);
  if (!rows.length) {
    console.log("instincts: none");
    return;
  }
  for (const row of rows) printInstinct(row);
}

function recallInstinctsCommand(query, dirArg, args, json) {
  const terms = String(query || "").trim();
  if (!terms) throw new Error("Missing instinct recall query");
  const vaultDir = resolveMemoryDir(dirArg);
  const project = argValue(args, "--project", path.basename(process.cwd()));
  const rows = recallInstincts(vaultDir, project, terms, 10);
  if (json) {
    console.log(JSON.stringify({ vaultDir, project, query: terms, count: rows.length, instincts: rows }, null, 2));
    return;
  }
  if (!rows.length) {
    console.log(`instinct_recall: no hits for "${terms}"`);
    return;
  }
  for (const row of rows) printInstinct(row);
}

function buildCachePromptCommand(args, json) {
  const stableFile = args[2];
  const dynamicFile = args[3];
  if (!stableFile || !dynamicFile) throw new Error("Usage: node tea.js cache-prompt build <stable-file> <dynamic-file> [--out <file>] [--key <name>]");
  const stablePath = path.resolve(stableFile);
  const dynamicPath = path.resolve(dynamicFile);
  const result = buildCachePrompt({
    stableText: fs.readFileSync(stablePath, "utf8"),
    dynamicText: fs.readFileSync(dynamicPath, "utf8"),
    key: argValue(args, "--key", path.basename(process.cwd())),
  });
  const out = argValue(args, "--out", "");
  const payload = {
    stableFile: stablePath,
    dynamicFile: dynamicPath,
    out: out ? path.resolve(out) : "stdout",
    cacheKey: result.cacheKey,
    ...result.stats,
  };
  if (out) {
    const outPath = path.resolve(out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, result.output, "utf8");
  } else if (!json) {
    process.stdout.write(result.output);
  }
  recordStats({
    source: "cache-prompt",
    mode: "build",
    input: `${stablePath};${dynamicPath}`,
    output: payload.out,
    beforeTokens: result.stats.stableTokens + result.stats.dynamicTokens,
    afterTokens: result.stats.totalTokens,
    savedTokens: 0,
    savedPercent: 0,
  });
  if (json) console.log(JSON.stringify(payload, null, 2));
  else if (out) {
    console.log(`cache_prompt: ${payload.out}`);
    console.log(`cache_key: ${payload.cacheKey}`);
    console.log(`stable_tokens_est: ${payload.stableTokens}`);
    console.log(`dynamic_tokens_est: ${payload.dynamicTokens}`);
    console.log(`stable_share_percent: ${payload.stableSharePercent}`);
  }
}

function splitCachePromptCommand(args, json) {
  const inputFile = args[2];
  if (!inputFile) throw new Error("Usage: node tea.js cache-prompt split <prompt-file> [--out-dir <dir>]");
  const result = writeCacheSplit(inputFile, argValue(args, "--out-dir", ""));
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`stable_prefix: ${result.stableFile}`);
  console.log(`dynamic_tail: ${result.dynamicFile}`);
  console.log(`method: ${result.method}`);
  console.log(`stable_tokens_est: ${result.stableTokens}`);
  console.log(`dynamic_tokens_est: ${result.dynamicTokens}`);
}

function createManualRolloverHandoff(dirArg, args) {
  const vaultDir = resolveMemoryDir(dirArg);
  if (!fs.existsSync(vaultDir)) vaultInit(vaultDir);
  const threshold = Math.max(2, Number(argValue(args, "--turns", DEFAULT_THRESHOLD)) || DEFAULT_THRESHOLD);
  const tokenThreshold = Math.max(0, Number(argValue(args, "--token-threshold", DEFAULT_TOKEN_THRESHOLD)) || DEFAULT_TOKEN_THRESHOLD);
  const result = manualHandoff({
    memoryDir: vaultDir,
    project: argValue(args, "--project", ""),
    reason: argValue(args, "--reason", "manual"),
    threshold,
    tokenThreshold,
  });
  console.log(`session_handoff: ${result.file}`);
  console.log(`project: ${result.state.project}`);
}

function printWakeStatus(dirArg, json) {
  const vaultDir = resolveMemoryDir(dirArg);
  const plans = listWakePlans(vaultDir);
  if (json) {
    console.log(JSON.stringify({ vaultDir, plans }, null, 2));
    return;
  }
  console.log(`vault_dir: ${vaultDir}`);
  if (!plans.length) {
    console.log("wake_plans: none");
    return;
  }
  for (const row of plans.slice(0, 30)) {
    console.log(`${row.id} status=${row.status} run_at=${row.run_at} project=${row.project || ""}`);
    if (row.handoff_file) console.log(`  handoff: ${row.handoff_file}`);
    if (row.due_prompt_file) console.log(`  due_prompt: ${row.due_prompt_file}`);
  }
  if (plans.length > 30) console.log(`... ${plans.length - 30} more`);
}

function scheduleWakeCommand(dirArg, args, json) {
  const vaultDir = resolveMemoryDir(dirArg);
  if (!fs.existsSync(vaultDir)) vaultInit(vaultDir);
  const at = argValue(args, "--at", "");
  if (!at) throw new Error("Usage: node tea.js wake schedule [path] --at <time> [--project <name>]");
  const runAt = parseResetTime(at) || new Date(at);
  if (Number.isNaN(runAt.getTime())) throw new Error(`Invalid wake time: ${at}`);
  const result = scheduleWakePlan({
    memoryDir: vaultDir,
    runAt,
    project: argValue(args, "--project", path.basename(process.cwd())),
    cwd: argValue(args, "--cwd", process.cwd()),
    host: "manual",
    event: "wake schedule",
    reason: argValue(args, "--reason", "manual"),
    handoffFile: argValue(args, "--handoff", ""),
  });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(result.duplicate ? `wake_existing: ${result.plan.id}` : `wake_scheduled: ${result.plan.id}`);
  console.log(`run_at: ${result.plan.run_at}`);
  console.log(`project: ${result.plan.project}`);
  if (result.plan.handoff_file) console.log(`handoff: ${result.plan.handoff_file}`);
}

function runDueWakeCommand(dirArg, args, json) {
  const vaultDir = resolveMemoryDir(dirArg);
  const result = runDueWakePlans(vaultDir, { clipboard: !hasFlag(args, "--no-clipboard") });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`wake_checked: ${result.checkedAt}`);
  console.log(`fired: ${result.firedCount}`);
  for (const row of result.fired) {
    console.log(`${row.id} project=${row.project} prompt=${row.due_prompt_file}`);
    console.log(`clipboard: ${row.clipboard ? "yes" : "no"}`);
  }
}

function cancelWakeCommand(dirArg, id, json) {
  if (!id) throw new Error("Usage: node tea.js wake cancel <id> [path]");
  const vaultDir = resolveMemoryDir(dirArg);
  const result = cancelWakePlan(vaultDir, id);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(result.cancelled ? `wake_cancelled: ${id}` : `wake_missing: ${id}`);
}

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0 && !options.allowFail) {
    throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  }
  return result;
}

function ensureVaultGitignore(vaultDir) {
  const file = path.join(vaultDir, ".gitignore");
  if (fs.existsSync(file)) return;
  fs.writeFileSync(file, [
    ".obsidian/workspace*",
    ".trash/",
    ".tea-stats/",
    "*.tmp",
    "*.log",
    ".env",
    ".env.*",
    "",
  ].join("\n"), "utf8");
}

function ensureGitRepo(vaultDir) {
  vaultInit(vaultDir);
  ensureVaultGitignore(vaultDir);
  if (!fs.existsSync(path.join(vaultDir, ".git"))) run("git", ["init"], vaultDir);
  run("git", ["add", "-A"], vaultDir);
  const diff = run("git", ["diff", "--cached", "--quiet"], vaultDir, { allowFail: true });
  if (diff.status !== 0) run("git", ["commit", "-m", "Initialize memory vault"], vaultDir);
}

function vaultGitStatus(dirArg) {
  const vaultDir = resolveMemoryDir(dirArg);
  if (!fs.existsSync(path.join(vaultDir, ".git"))) {
    console.log(`vault_git: not initialized at ${vaultDir}`);
    return;
  }
  process.stdout.write(run("git", ["status", "-sb"], vaultDir).stdout);
  const remote = run("git", ["remote", "-v"], vaultDir, { allowFail: true }).stdout.trim();
  if (remote) console.log(remote);
}

function hasRemote(vaultDir) {
  return run("git", ["remote", "get-url", "origin"], vaultDir, { allowFail: true }).status === 0;
}

function vaultSync(dirArg, message) {
  const vaultDir = resolveMemoryDir(dirArg);
  ensureGitRepo(vaultDir);
  if (hasRemote(vaultDir)) run("git", ["pull", "--rebase", "origin", "main"], vaultDir, { allowFail: true });
  run("git", ["add", "-A"], vaultDir);
  const diff = run("git", ["diff", "--cached", "--quiet"], vaultDir, { allowFail: true });
  if (diff.status !== 0) run("git", ["commit", "-m", message || "Update memory vault"], vaultDir);
  if (hasRemote(vaultDir)) run("git", ["push", "-u", "origin", "main"], vaultDir);
  console.log(`vault_synced: ${vaultDir}`);
}

function vaultGithubInit(dirArg, repoName) {
  const vaultDir = resolveMemoryDir(dirArg);
  const name = repoName || "token-efficient-agent-memory-vault";
  ensureGitRepo(vaultDir);
  run("git", ["branch", "-M", "main"], vaultDir);
  if (hasRemote(vaultDir)) {
    vaultSync(vaultDir, "Update memory vault");
    return;
  }
  const view = run("gh", ["repo", "view", name, "--json", "nameWithOwner"], vaultDir, { allowFail: true });
  if (view.status === 0) {
    const parsed = JSON.parse(view.stdout || "{}");
    if (!parsed.nameWithOwner) throw new Error(`Could not resolve GitHub repo: ${name}`);
    run("git", ["remote", "add", "origin", `https://github.com/${parsed.nameWithOwner}.git`], vaultDir);
    vaultSync(vaultDir, "Update memory vault");
    return;
  }
  run("gh", ["repo", "create", name, "--private", "--source", vaultDir, "--remote", "origin", "--push"], vaultDir);
  console.log(`vault_github_repo: ${name}`);
}

function scanDebt(root) {
  const markers = [
    /lean-debt:\s*(.+)/i,
    /token-debt:\s*(.+)/i,
    /shortcut:\s*(.+)/i,
    /TODO\(token-efficient\):\s*(.+)/i,
  ];
  const hits = [];

  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
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
      const lines = text.split(/\r?\n/);
      lines.forEach((line, index) => {
        for (const marker of markers) {
          const match = line.match(marker);
          if (match) {
            hits.push({
              path: path.relative(root, fullPath) || fullPath,
              line: index + 1,
              marker: match[0].trim(),
            });
            break;
          }
        }
      });
    }
  }

  walk(root);
  return hits;
}

function printDebt(rootArg, json) {
  const root = path.resolve(rootArg || process.cwd());
  const hits = scanDebt(root);
  const output = {
    root,
    count: hits.length,
    hits,
    riskiest: hits[0] || null,
  };
  if (json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  console.log(`root: ${root}`);
  if (!hits.length) {
    console.log("lean_debt: none");
    return;
  }
  for (const hit of hits) console.log(`${hit.path}:${hit.line} ${hit.marker}`);
  console.log(`total: ${hits.length}`);
  console.log(`riskiest: ${hits[0].path}:${hits[0].line}`);
}

function printGain(json) {
  const rows = readStats();
  const totals = summarizeStats(rows);
  const output = {
    token_savings: totals,
    lean_code_gain: {
      measured: false,
      note: "Run lean review/audit on a repo to estimate removable code. Token savings are recorded for compression commands only.",
    },
  };
  if (json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  console.log(`tokens_saved_est: ${totals.savedTokens}`);
  console.log(`saved_percent_est: ${totals.savedPercent}`);
  console.log("lean_code_gain: run `tea lean` for the ladder and `tea debt <path>` for shortcut markers");
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || hasFlag(args, "--help") || hasFlag(args, "-h")) {
    console.log(usage());
    return;
  }

  if (command === "compress") {
    const file = args[1];
    if (!file) throw new Error("Missing file path");
    const mode = argValue(args, "--mode", "balanced");
    const out = argValue(args, "--out", "");
    const text = fs.readFileSync(file, "utf8");
    const result = compressText(text, mode);
    if (out) {
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      fs.writeFileSync(out, result.output, "utf8");
      console.log(out);
    } else {
      process.stdout.write(result.output);
    }
    recordStats({
      source: "file",
      mode,
      input: path.resolve(file),
      output: out ? path.resolve(out) : "stdout",
      ...result.stats,
    });
    return;
  }

  if (command === "clipboard") {
    const mode = argValue(args, "--mode", "balanced");
    const text = readClipboard();
    const result = compressText(text, mode);
    writeClipboard(result.output);
    recordStats({ source: "clipboard", mode, ...result.stats });
    console.log(`clipboard compressed: ${result.stats.beforeTokens} -> ${result.stats.afterTokens} tokens est. saved ${result.stats.savedTokens} (${result.stats.savedPercent}%)`);
    return;
  }

  if (command === "estimate") {
    const before = fs.readFileSync(args[1], "utf8");
    const after = fs.readFileSync(args[2], "utf8");
    console.log(JSON.stringify(savings(before, after), null, 2));
    return;
  }

  if (command === "after-task") {
    printAfterTask(args[1], args[2], argValue(args, "--label", ""), hasFlag(args, "--json"));
    return;
  }

  if (command === "run") {
    runObservedTask(args.slice(1));
    return;
  }

  if (command === "stats") {
    printStats(hasFlag(args, "--json"));
    return;
  }

  if (command === "receipt") {
    printReceipt(positionalArgs(args.slice(1))[0], hasFlag(args, "--json"));
    return;
  }

  if (command === "stats-reset") {
    if (fs.existsSync(STATS_FILE)) fs.unlinkSync(STATS_FILE);
    console.log("stats reset");
    return;
  }

  if (command === "lean") {
    printLean(hasFlag(args, "--json"));
    return;
  }

  if (command === "debt") {
    printDebt(args.slice(1).find((arg) => !arg.startsWith("-")), hasFlag(args, "--json"));
    return;
  }

  if (command === "gain") {
    printGain(hasFlag(args, "--json"));
    return;
  }

  if (command === "vault") {
    const subcommand = args[1];
    if (subcommand === "init") {
      vaultInit(positionalArgs(args.slice(2))[0]);
      return;
    }
    if (subcommand === "status") {
      vaultGitStatus(positionalArgs(args.slice(2))[0]);
      return;
    }
    if (subcommand === "sync") {
      vaultSync(positionalArgs(args.slice(2), ["--message"])[0], argValue(args, "--message", "Update memory vault"));
      return;
    }
    if (subcommand === "github-init") {
      vaultGithubInit(positionalArgs(args.slice(2), ["--repo"])[0], argValue(args, "--repo", "token-efficient-agent-memory-vault"));
      return;
    }
    throw new Error("Usage: node tea.js vault init|github-init|sync|status");
  }

  if (command === "memory-map") {
    const subcommand = args[1];
    const json = hasFlag(args, "--json");
    if (subcommand === "show") {
      showMemoryMap(positionalArgs(args.slice(2))[0]);
      return;
    }
    if (subcommand === "recall") {
      const query = args[2];
      const dir = positionalArgs(args.slice(3))[0];
      recallMemory(query, dir, json);
      return;
    }
    if (subcommand === "add") {
      const text = args[2];
      const dir = positionalArgs(args.slice(3))[0];
      appendMemory(text, dir);
      return;
    }
    if (subcommand === "compress") {
      const dir = positionalArgs(args.slice(2), ["--out"])[0];
      compressMemoryMap(dir, argValue(args, "--out", ""));
      return;
    }
    throw new Error("Usage: node tea.js memory-map show|recall|add|compress");
  }

  if (command === "observe") {
    const subcommand = args[1];
    const json = hasFlag(args, "--json");
    if (subcommand === "add") {
      const text = args[2];
      const dir = positionalArgs(args.slice(3), ["--type", "--project"])[0];
      addObservation(text, dir, { type: argValue(args, "--type", "note"), project: argValue(args, "--project", ""), json });
      return;
    }
    if (subcommand === "search") {
      const query = args[2];
      const dir = positionalArgs(args.slice(3))[0];
      searchObservations(query, dir, json);
      return;
    }
    if (subcommand === "get") {
      const id = args[2];
      const dir = positionalArgs(args.slice(3))[0];
      getObservation(id, dir, json);
      return;
    }
    if (subcommand === "timeline") {
      const id = args[2];
      const dir = positionalArgs(args.slice(3))[0];
      timelineObservation(id, dir, json);
      return;
    }
    throw new Error("Usage: node tea.js observe add|search|get|timeline");
  }

  if (command === "memory-health") {
    memoryHealth(positionalArgs(args.slice(1))[0], hasFlag(args, "--json"));
    return;
  }

  if (command === "memory-refresh") {
    const subcommand = args[1];
    const dir = positionalArgs(args.slice(2), ["--days"])[0];
    const days = argValue(args, "--days", 365);
    if (subcommand === "plan") {
      memoryRefreshPlan(dir, days, hasFlag(args, "--json"));
      return;
    }
    if (subcommand === "prune") {
      memoryRefreshPrune(dir, days, hasFlag(args, "--confirm"));
      return;
    }
    throw new Error("Usage: node tea.js memory-refresh plan|prune [path] [--days 365] [--confirm]");
  }

  if (command === "session-rollover") {
    const subcommand = args[1];
    const dir = positionalArgs(args.slice(2), ["--project", "--reason", "--turns", "--token-threshold"])[0];
    if (subcommand === "status") {
      printSessionRolloverStatus(dir, hasFlag(args, "--json"));
      return;
    }
    if (subcommand === "handoff") {
      createManualRolloverHandoff(dir, args);
      return;
    }
    throw new Error("Usage: node tea.js session-rollover status|handoff [path] [--project <name>] [--reason <text>]");
  }

  if (command === "wake") {
    const subcommand = args[1];
    const json = hasFlag(args, "--json");
    if (subcommand === "status") {
      printWakeStatus(positionalArgs(args.slice(2))[0], json);
      return;
    }
    if (subcommand === "schedule") {
      const dir = positionalArgs(args.slice(2), ["--at", "--project", "--handoff", "--reason", "--cwd"])[0];
      scheduleWakeCommand(dir, args, json);
      return;
    }
    if (subcommand === "run-due") {
      runDueWakeCommand(positionalArgs(args.slice(2))[0], args, json);
      return;
    }
    if (subcommand === "cancel") {
      const positions = positionalArgs(args.slice(2));
      cancelWakeCommand(positions[1], positions[0], json);
      return;
    }
    throw new Error("Usage: node tea.js wake status|schedule|run-due|cancel");
  }

  if (command === "cost") {
    const subcommand = args[1];
    if (subcommand === "report") {
      printCostReport(positionalArgs(args.slice(2))[0], hasFlag(args, "--json"));
      return;
    }
    throw new Error("Usage: node tea.js cost report [path] [--json]");
  }

  if (command === "instincts") {
    const subcommand = args[1];
    const json = hasFlag(args, "--json");
    if (subcommand === "add") {
      const dir = positionalArgs(args.slice(3), ["--project", "--trigger", "--confidence", "--domain"])[0];
      addInstinctCommand(dir, args, json);
      return;
    }
    if (subcommand === "list") {
      const dir = positionalArgs(args.slice(2), ["--project"])[0];
      listInstinctsCommand(dir, args, json);
      return;
    }
    if (subcommand === "recall") {
      const dir = positionalArgs(args.slice(3), ["--project"])[0];
      recallInstinctsCommand(args[2], dir, args, json);
      return;
    }
    throw new Error("Usage: node tea.js instincts add|list|recall");
  }

  if (command === "cache-prompt") {
    const subcommand = args[1];
    const json = hasFlag(args, "--json");
    if (subcommand === "build") {
      buildCachePromptCommand(args, json);
      return;
    }
    if (subcommand === "split") {
      splitCachePromptCommand(args, json);
      return;
    }
    throw new Error("Usage: node tea.js cache-prompt build|split");
  }

  if (command === "bridge") {
    const subcommand = args[1];
    if (subcommand !== "start") throw new Error("Usage: node tea.js bridge start [--port 6768]");
    const { startBridge } = require("../bridge/bridge-server");
    startBridge({ port: argValue(args, "--port", process.env.TEA_BRIDGE_PORT || 6768) });
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

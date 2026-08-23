"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const END_EVENTS = new Set(["TaskCompleted", "Stop", "SessionEnd", "PostCompact"]);
const PROFILE_EVENTS = {
  minimal: new Set(["SessionStart", "UserPromptSubmit", "TaskCompleted", "Stop", "SessionEnd", "PostCompact"]),
  standard: new Set([
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "Notification",
    "TaskCompleted",
    "Stop",
    "StopFailure",
    "SessionEnd",
    "PreCompact",
    "PostCompact",
    "CwdChanged",
  ]),
  strict: null,
};

function safeSlug(value, fallback = "item") {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function appendJsonl(file, row) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(row) + "\n", "utf8");
}

function shouldRunHook(event, host = "") {
  const profileName = String(process.env.TEA_HOOK_PROFILE || "standard").trim().toLowerCase();
  const profile = Object.prototype.hasOwnProperty.call(PROFILE_EVENTS, profileName) ? profileName : "standard";
  const allowed = PROFILE_EVENTS[profile];
  if (allowed && !allowed.has(event)) return false;

  const disabled = String(process.env.TEA_DISABLED_HOOKS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.toLowerCase());
  const keys = [
    event,
    `${host}:${event}`,
    `${profile}:${event}`,
  ].map((item) => item.toLowerCase());
  return !disabled.some((item) => keys.includes(item));
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function extractUsageFromMessage(message) {
  const usage = message && message.usage ? message.usage : {};
  const details = usage.input_tokens_details || usage.prompt_tokens_details || {};
  return {
    inputTokens: toNumber(usage.input_tokens),
    outputTokens: toNumber(usage.output_tokens),
    cacheWriteTokens: toNumber(usage.cache_creation_input_tokens),
    cacheReadTokens: toNumber(usage.cache_read_input_tokens),
    cachedTokens: toNumber(details.cached_tokens || usage.cached_tokens),
    model: message && message.model ? String(message.model) : "unknown",
  };
}

function readTranscriptUsage(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  let latest = null;
  const total = {
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    cachedTokens: 0,
    model: "unknown",
    assistantTurns: 0,
  };

  for (const line of fs.readFileSync(transcriptPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row = null;
    try { row = JSON.parse(line); } catch { continue; }
    if (row.type !== "assistant" || !row.message || !row.message.usage) continue;
    const usage = extractUsageFromMessage(row.message);
    total.inputTokens += usage.inputTokens;
    total.outputTokens += usage.outputTokens;
    total.cacheWriteTokens += usage.cacheWriteTokens;
    total.cacheReadTokens += usage.cacheReadTokens;
    total.cachedTokens += usage.cachedTokens;
    if (usage.model !== "unknown") total.model = usage.model;
    total.assistantTurns += 1;
    latest = usage;
  }

  if (!latest) return null;
  const latestContextTokens = latest.inputTokens + latest.cacheWriteTokens + latest.cacheReadTokens + latest.cachedTokens;
  return {
    latestContextTokens,
    latest,
    total,
  };
}

function contextWindowTokens(model, latestContextTokens) {
  const lower = String(model || "").toLowerCase();
  if (lower.includes("1m") || latestContextTokens > 200000) return 1000000;
  return 200000;
}

function contextThreshold(windowTokens) {
  const value = process.env.TEA_CONTEXT_THRESHOLD;
  const raw = value === undefined || value === "" ? Number.NaN : Number(value);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return windowTokens > 200000 ? 250000 : 160000;
}

function contextInterval() {
  const value = process.env.TEA_CONTEXT_INTERVAL;
  const raw = value === undefined || value === "" ? Number.NaN : Number(value);
  return Number.isFinite(raw) && raw > 0 ? raw : 60000;
}

function contextBucket(tokens, threshold, interval) {
  if (threshold <= 0 || tokens < threshold) return -1;
  return Math.floor((tokens - threshold) / interval);
}

function contextStateFile(memoryDir, sessionId) {
  return path.join(memoryDir, "session-state", `${safeSlug(sessionId)}.context.json`);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function contextSuggestion({ memoryDir, sessionId, transcriptPath }) {
  const usage = readTranscriptUsage(transcriptPath);
  if (!usage) return "";
  const windowTokens = contextWindowTokens(usage.total.model, usage.latestContextTokens);
  const threshold = contextThreshold(windowTokens);
  const interval = contextInterval();
  const bucket = contextBucket(usage.latestContextTokens, threshold, interval);
  if (bucket < 0) return "";

  const file = contextStateFile(memoryDir, sessionId || "default");
  const state = readJson(file, { lastBucket: -1 });
  if (bucket <= Number(state.lastBucket || -1)) return "";
  writeJson(file, {
    lastBucket: bucket,
    latestContextTokens: usage.latestContextTokens,
    windowTokens,
    updatedAt: new Date().toISOString(),
  });

  const approx = `${Math.round(usage.latestContextTokens / 1000)}k`;
  const percent = Math.round((usage.latestContextTokens / windowTokens) * 100);
  return `Token-kit context: about ${approx} tokens (${percent}% of ${Math.round(windowTokens / 1000)}k window). Prepare a compact handoff at the next natural boundary; do not interrupt active work.`;
}

function costMetricsPath(memoryDir) {
  return path.join(memoryDir, "metrics", "costs.jsonl");
}

function hostCost(payload = {}) {
  const direct = payload.cost_usd || payload.total_cost_usd || payload.estimated_cost_usd;
  const nested = payload.cost && (payload.cost.total_cost_usd || payload.cost.estimated_cost_usd);
  const value = Number(direct ?? nested);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function recordCostSnapshot({ memoryDir, payload = {}, host = "unknown", event = "", sessionId = "" }) {
  if (!END_EVENTS.has(event)) return null;
  const transcriptPath = typeof payload.transcript_path === "string" ? payload.transcript_path : "";
  const usage = readTranscriptUsage(transcriptPath);
  if (!usage) return null;
  const row = {
    timestamp: new Date().toISOString(),
    host,
    event,
    session_id: sessionId || payload.session_id || payload.sessionId || "default",
    transcript_path: transcriptPath,
    model: usage.total.model,
    assistant_turns: usage.total.assistantTurns,
    input_tokens: usage.total.inputTokens,
    output_tokens: usage.total.outputTokens,
    cache_write_tokens: usage.total.cacheWriteTokens,
    cache_read_tokens: usage.total.cacheReadTokens,
    cached_tokens: usage.total.cachedTokens,
    latest_context_tokens: usage.latestContextTokens,
    estimated_cost_usd: hostCost(payload),
  };
  appendJsonl(costMetricsPath(memoryDir), row);
  return row;
}

function readCostSnapshots(memoryDir) {
  return readJsonl(costMetricsPath(memoryDir));
}

function summarizeCost(memoryDir) {
  const rows = readCostSnapshots(memoryDir);
  const latestBySession = new Map();
  for (const row of rows) {
    const key = row.session_id || row.transcript_path || row.timestamp;
    const prev = latestBySession.get(key);
    if (!prev || String(row.timestamp) > String(prev.timestamp)) latestBySession.set(key, row);
  }
  const latest = Array.from(latestBySession.values());
  const totals = latest.reduce((acc, row) => {
    acc.sessions += 1;
    acc.inputTokens += toNumber(row.input_tokens);
    acc.outputTokens += toNumber(row.output_tokens);
    acc.cacheWriteTokens += toNumber(row.cache_write_tokens);
    acc.cacheReadTokens += toNumber(row.cache_read_tokens);
    acc.cachedTokens += toNumber(row.cached_tokens);
    if (row.estimated_cost_usd !== null && row.estimated_cost_usd !== undefined) {
      acc.estimatedCostUsd += toNumber(row.estimated_cost_usd);
      acc.costRows += 1;
    }
    return acc;
  }, { sessions: 0, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, cachedTokens: 0, estimatedCostUsd: 0, costRows: 0 });
  return {
    metricsFile: costMetricsPath(memoryDir),
    rows: rows.length,
    latest,
    totals,
  };
}

function instinctId() {
  return `ins_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${process.pid}_${Math.random().toString(36).slice(2, 7)}`;
}

function instinctsPath(memoryDir, project, scope = "project") {
  if (scope === "global") return path.join(memoryDir, "instincts", "global.jsonl");
  return path.join(memoryDir, "projects", safeSlug(project, "unassigned"), "instincts.jsonl");
}

function readInstincts(memoryDir, project = "") {
  return [
    ...readJsonl(instinctsPath(memoryDir, "", "global")),
    ...readJsonl(instinctsPath(memoryDir, project, "project")),
  ];
}

function saveInstinct(memoryDir, instinct) {
  const action = String(instinct.action || "").trim();
  if (!action) throw new Error("Missing instinct action");
  const scope = instinct.scope === "global" ? "global" : "project";
  const project = instinct.project || "unassigned";
  const row = {
    id: instinct.id || instinctId(),
    ts: instinct.ts || new Date().toISOString(),
    scope,
    project: scope === "global" ? "" : project,
    trigger: instinct.trigger || "when relevant",
    action,
    domain: instinct.domain || "workflow",
    confidence: Math.max(0.1, Math.min(1, Number(instinct.confidence || 0.7))),
    evidence: instinct.evidence || "",
  };
  const file = instinctsPath(memoryDir, project, scope);
  const existing = readJsonl(file);
  const duplicate = existing.find((item) => String(item.action || "").toLowerCase() === row.action.toLowerCase());
  if (duplicate) return { file, row: duplicate, duplicate: true };
  appendJsonl(file, row);
  return { file, row, duplicate: false };
}

function scoreInstinct(row, terms) {
  const haystack = `${row.id} ${row.scope} ${row.project} ${row.trigger} ${row.action} ${row.domain}`.toLowerCase();
  const termScore = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
  return termScore + Number(row.confidence || 0);
}

function recallInstincts(memoryDir, project = "", query = "", limit = 6) {
  const terms = String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9._-]+/)
    .filter(Boolean);
  return readInstincts(memoryDir, project)
    .map((row) => ({ ...row, score: terms.length ? scoreInstinct(row, terms) : Number(row.confidence || 0) }))
    .filter((row) => !terms.length || row.score > Number(row.confidence || 0))
    .sort((a, b) => b.score - a.score || String(b.ts).localeCompare(String(a.ts)))
    .slice(0, limit);
}

function activeInstinctContext(memoryDir, project = "", query = "") {
  const minConfidence = Math.max(0, Math.min(1, Number(process.env.TEA_INSTINCT_CONFIDENCE || 0.7)));
  const limit = Math.max(1, Math.min(12, Number(process.env.TEA_MAX_INJECTED_INSTINCTS || 6)));
  const hits = recallInstincts(memoryDir, project, query, limit)
    .filter((row) => Number(row.confidence || 0) >= minConfidence);
  if (!hits.length) return "";
  return [
    "Active token-kit learned patterns:",
    ...hits.map((row) => `- [${row.scope} ${Math.round(Number(row.confidence || 0) * 100)}%] ${row.action}`),
  ].join("\n");
}

function promptText(payload = {}) {
  return String(payload.prompt || payload.message || payload.user_prompt || payload.text || "").trim();
}

function learnInstinctFromPrompt({ memoryDir, payload = {}, project = "" }) {
  const text = promptText(payload).replace(/\s+/g, " ").trim();
  if (!text || text.length > 1200) return null;
  if (!/\b(always|never|remember|from now on|for this project|preference|prefer)\b/i.test(text)) return null;
  if (/(api[_-]?key|secret|password|passwd|oauth|bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]{12,}|token\s*[:=]|private key|recovery phrase)/i.test(text)) return null;

  const scoped = /\b(for this project|in this repo|this repo|this project)\b/i.test(text);
  return saveInstinct(memoryDir, {
    scope: scoped ? "project" : "global",
    project,
    trigger: "user-stated preference",
    action: text.slice(0, 300),
    domain: "preference",
    confidence: scoped ? 0.8 : 0.75,
    evidence: "captured from explicit user wording",
  });
}

module.exports = {
  END_EVENTS,
  activeInstinctContext,
  contextSuggestion,
  learnInstinctFromPrompt,
  readCostSnapshots,
  readInstincts,
  recallInstincts,
  recordCostSnapshot,
  saveInstinct,
  shouldRunHook,
  summarizeCost,
};

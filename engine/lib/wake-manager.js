"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  createHandoff,
  manualHandoff,
  sessionStatus,
} = require("./session-rollover");

const WAKE_DIR = "wake-plans";
const DUE_DIR = "wake-due";

function safeSlug(value, fallback = "wake") {
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
  return file;
}

function wakePlanDir(memoryDir) {
  return path.join(memoryDir, WAKE_DIR);
}

function dueDir(memoryDir) {
  return path.join(memoryDir, DUE_DIR);
}

function wakePlanPath(memoryDir, id) {
  return path.join(wakePlanDir(memoryDir), `${safeSlug(id)}.json`);
}

function wakeId(project, runAt, sessionId = "") {
  const stamp = new Date(runAt).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `wake_${stamp}_${safeSlug(project || sessionId || "project")}`;
}

function collectText(value, depth = 0, out = []) {
  if (out.join(" ").length > 10000 || depth > 5 || value === null || value === undefined) return out;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 20)) collectText(item, depth + 1, out);
    return out;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value).slice(0, 40)) collectText(item, depth + 1, out);
  }
  return out;
}

function hasLimitSignal(text) {
  return /(usage|rate|message|request|token|context)\s+(limit|quota)|\blimit\s+(reached|exceeded)|try again|resets?\s+(at|in|after)|available again/i.test(text);
}

function parseDuration(text, now) {
  const lower = String(text || "").toLowerCase();
  const hour = lower.match(/\b(?:in|after)\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b/);
  const minute = lower.match(/\b(?:in|after)\s+(\d+(?:\.\d+)?)\s*(minutes?|mins?|m)\b/);
  const combined = lower.match(/\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b.*?\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|m)\b/);
  if (combined) {
    const ms = (Number(combined[1]) * 60 + Number(combined[3])) * 60 * 1000;
    return new Date(now.getTime() + ms);
  }
  if (hour) return new Date(now.getTime() + Number(hour[1]) * 60 * 60 * 1000);
  if (minute) return new Date(now.getTime() + Number(minute[1]) * 60 * 1000);
  return null;
}

function parseClockTime(text, now) {
  const ampm = String(text || "").match(/\b(?:reset|resets|again|available|at|after|until)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = Number(ampm[2] || 0);
    const suffix = ampm[3].toLowerCase();
    if (suffix === "pm" && hour < 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }

  const clock = String(text || "").match(/\b(?:reset|resets|again|available|at|after|until)?\s*([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!clock) return null;
  const next = new Date(now);
  next.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

function parseAbsoluteTime(text) {
  const iso = String(text || "").match(/\b(\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)\b/);
  if (!iso) return null;
  const parsed = new Date(iso[1].replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseResetTime(text, nowArg = new Date()) {
  const now = nowArg instanceof Date ? nowArg : new Date(nowArg);
  const absolute = parseAbsoluteTime(text);
  const duration = parseDuration(text, now);
  const clock = parseClockTime(text, now);
  const parsed = absolute || duration || clock;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  const minDelayMs = Math.max(0, Number(process.env.TEA_WAKE_MIN_DELAY_MS || 30000));
  if (parsed.getTime() - now.getTime() < minDelayMs) return null;
  return parsed;
}

function extractLimitReset(text, nowArg = new Date()) {
  const compact = String(text || "").replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!hasLimitSignal(compact)) return null;
  const resetAt = parseResetTime(compact, nowArg);
  if (!resetAt) return null;
  return {
    resetAt,
    evidence: compact.slice(0, 500),
  };
}

function listWakePlans(memoryDir) {
  const dir = wakePlanDir(memoryDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson(path.join(dir, name), null))
    .filter(Boolean)
    .sort((a, b) => String(a.run_at).localeCompare(String(b.run_at)));
}

function findExistingWake(memoryDir, plan) {
  const runAt = Date.parse(plan.run_at);
  return listWakePlans(memoryDir).find((row) => {
    if (row.status !== "scheduled") return false;
    if ((row.session_id || "") !== (plan.session_id || "")) return false;
    if ((row.project || "") !== (plan.project || "")) return false;
    const rowRunAt = Date.parse(row.run_at);
    return Number.isFinite(rowRunAt) && Math.abs(rowRunAt - runAt) < 5 * 60 * 1000;
  });
}

function resumePrompt(plan) {
  return [
    `Continue project: ${plan.project || "unassigned"}`,
    `Use same cwd/repo when available: ${plan.cwd || ""}`,
    `Use memory-vault handoff: ${plan.handoff_file || ""}`,
    "Claude limit/reset window has passed. Continue from the handoff, recall only relevant memory, and do the next concrete action.",
  ].join("\n");
}

function latestHandoffFor({ memoryDir, payload = {}, host = "unknown", project = "", cwd = process.cwd(), reason = "limit reset wake" }) {
  const sessionId = String(payload.session_id || payload.sessionId || "");
  const sessions = sessionStatus(memoryDir);
  const match = sessions.find((row) => sessionId && row.sessionId === sessionId)
    || sessions.find((row) => row.host === host && row.project === project)
    || sessions.find((row) => row.project === project);
  if (match) return createHandoff(memoryDir, match, reason);
  return manualHandoff({ memoryDir, project, reason, cwd }).file;
}

function scheduleWakePlan({ memoryDir, runAt, project = "", cwd = "", host = "unknown", event = "manual", sessionId = "", reason = "manual", evidence = "", handoffFile = "" }) {
  const runDate = runAt instanceof Date ? runAt : new Date(runAt);
  if (Number.isNaN(runDate.getTime())) throw new Error(`Invalid wake time: ${runAt}`);
  ensureDir(wakePlanDir(memoryDir));
  const plan = {
    id: wakeId(project, runDate, sessionId),
    created_at: new Date().toISOString(),
    run_at: runDate.toISOString(),
    status: "scheduled",
    host,
    event,
    project: project || "unassigned",
    cwd,
    session_id: sessionId,
    reason,
    evidence: String(evidence || "").slice(0, 500),
    handoff_file: handoffFile,
  };
  plan.resume_prompt = resumePrompt(plan);

  const existing = findExistingWake(memoryDir, plan);
  if (existing) return { scheduled: false, duplicate: true, plan: existing, file: wakePlanPath(memoryDir, existing.id) };

  const file = writeJson(wakePlanPath(memoryDir, plan.id), plan);
  return { scheduled: true, duplicate: false, plan, file };
}

function scheduleLimitResetWake({ memoryDir, payload = {}, raw = "", host = "unknown", event = "", project = "" }) {
  if (process.env.TEA_WAKE_DISABLED === "1") return { scheduled: false, disabled: true };
  const text = [raw, ...collectText(payload)].join(" ");
  const reset = extractLimitReset(text);
  if (!reset) return { scheduled: false, matched: false };
  const cwd = payload.cwd || process.cwd();
  const sessionId = String(payload.session_id || payload.sessionId || `${host}-${project || path.basename(cwd)}`);
  const handoffFile = latestHandoffFor({ memoryDir, payload, host, project, cwd });
  return scheduleWakePlan({
    memoryDir,
    runAt: reset.resetAt,
    project: project || path.basename(cwd),
    cwd,
    host,
    event,
    sessionId,
    reason: "limit reset",
    evidence: reset.evidence,
    handoffFile,
  });
}

function copyToClipboard(text) {
  if (process.platform !== "win32" || process.env.TEA_WAKE_NO_CLIPBOARD === "1") return false;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", "Set-Clipboard -Value $env:TEA_WAKE_PROMPT"], {
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, TEA_WAKE_PROMPT: text },
  });
  return result.status === 0;
}

function duePromptPath(memoryDir, plan) {
  return path.join(dueDir(memoryDir), `${safeSlug(plan.id)}.md`);
}

function runDueWakePlans(memoryDir, options = {}) {
  const now = Date.now();
  const fired = [];
  const rows = listWakePlans(memoryDir);
  for (const row of rows) {
    if (row.status !== "scheduled") continue;
    const runAt = Date.parse(row.run_at);
    if (!Number.isFinite(runAt) || runAt > now) continue;
    row.status = "fired";
    row.fired_at = new Date().toISOString();
    row.resume_prompt = row.resume_prompt || resumePrompt(row);
    const promptFile = duePromptPath(memoryDir, row);
    ensureDir(path.dirname(promptFile));
    fs.writeFileSync(promptFile, row.resume_prompt + "\n", "utf8");
    row.due_prompt_file = promptFile;
    row.clipboard = options.clipboard === false ? false : copyToClipboard(row.resume_prompt);
    writeJson(wakePlanPath(memoryDir, row.id), row);
    fired.push(row);
  }
  return { memoryDir, checkedAt: new Date().toISOString(), firedCount: fired.length, fired };
}

function cancelWakePlan(memoryDir, id) {
  const file = wakePlanPath(memoryDir, id);
  const plan = readJson(file, null);
  if (!plan) return { cancelled: false, missing: true, id };
  plan.status = "cancelled";
  plan.cancelled_at = new Date().toISOString();
  writeJson(file, plan);
  return { cancelled: true, plan, file };
}

module.exports = {
  extractLimitReset,
  listWakePlans,
  parseResetTime,
  runDueWakePlans,
  scheduleLimitResetWake,
  scheduleWakePlan,
  cancelWakePlan,
};

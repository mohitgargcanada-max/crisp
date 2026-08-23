#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  DEFAULT_THRESHOLD,
  DEFAULT_TOKEN_THRESHOLD,
  recordPrompt,
  recordSessionStart,
} = require("../../lib/session-rollover");
const {
  activeInstinctContext,
  contextSuggestion,
  learnInstinctFromPrompt,
  recordCostSnapshot,
  shouldRunHook,
} = require("../../lib/hook-runtime");
const {
  scheduleLimitResetWake,
} = require("../../lib/wake-manager");

const ROOT = path.resolve(__dirname, "..", "..");
const TEA = path.join(ROOT, "cli", "tea.js");
const STATS_DIR = path.join(ROOT, ".tea-stats");
const STATS_FILE = path.join(STATS_DIR, "token-savings.jsonl");
const MEMORY_DIR = path.resolve(process.env.TEA_MEMORY_DIR || path.join(ROOT, "memory-vault"));
const ROLLOVER_THRESHOLD = Math.max(2, Number(process.env.TEA_ROLLOVER_TURNS || DEFAULT_THRESHOLD) || DEFAULT_THRESHOLD);
const ROLLOVER_TOKEN_THRESHOLD = Math.max(0, Number(process.env.TEA_ROLLOVER_TOKENS || DEFAULT_TOKEN_THRESHOLD) || DEFAULT_TOKEN_THRESHOLD);

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index === -1 || index + 1 >= process.argv.length ? fallback : process.argv[index + 1];
}

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function looksSensitive(text) {
  return /(api[_-]?key|secret|password|passwd|oauth|bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]{12,}|token\s*[:=]|private key|recovery phrase)/i.test(String(text || ""));
}

function readStdin() {
  return fs.readFileSync(0, "utf8");
}

function pick(payload, keys) {
  const hits = [];
  function walk(value, trail = "") {
    if (hits.length >= 30 || value === null || value === undefined) return;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      const key = trail.split(".").pop();
      if (keys.includes(key)) hits.push(`${trail}=${String(value).slice(0, 800)}`);
      return;
    }
    if (Array.isArray(value)) {
      value.slice(0, 10).forEach((item, index) => walk(item, `${trail}[${index}]`));
      return;
    }
    if (typeof value === "object") {
      for (const [key, item] of Object.entries(value)) walk(item, trail ? `${trail}.${key}` : key);
    }
  }
  walk(payload);
  return hits;
}

function compactPayload(input) {
  let payload = {};
  try { payload = input.trim() ? JSON.parse(input) : {}; } catch { payload = { raw: input }; }
  const host = argValue("--host", process.env.TEA_HOOK_HOST || "unknown");
  const event = argValue("--event", process.env.TEA_HOOK_EVENT || payload.hook_event_name || payload.event || "lifecycle");
  const project = argValue("--project", process.env.TEA_PROJECT || payload.project || payload.project_name || path.basename(payload.cwd || process.cwd()));
  const fields = pick(payload, [
    "hook_event_name", "event", "session_id", "transcript_path", "cwd", "tool_name",
    "matcher", "command", "description", "prompt", "message", "status", "error",
  ]);
  const summary = [
    `host=${host}`,
    `event=${event}`,
    `project=${project}`,
    `cwd=${payload.cwd || process.cwd()}`,
    ...fields,
  ].join(" ").replace(/\s+/g, " ").trim().slice(0, 2500);
  return { payload, host, event, project, summary };
}

function appendStats(raw, summary, meta) {
  const beforeTokens = estimateTokens(raw);
  const afterTokens = estimateTokens(summary);
  const savedTokens = Math.max(0, beforeTokens - afterTokens);
  const savedPercent = beforeTokens ? Math.round((savedTokens / beforeTokens) * 100) : 0;
  fs.mkdirSync(STATS_DIR, { recursive: true });
  fs.appendFileSync(STATS_FILE, JSON.stringify({
    timestamp: new Date().toISOString(),
    host: os.hostname(),
    source: "lifecycle-hook",
    beforeTokens,
    afterTokens,
    savedTokens,
    savedPercent,
    ...meta,
  }) + "\n", "utf8");
}

function observe(summary, meta) {
  if (!summary || looksSensitive(summary)) return;
  const result = spawnSync("node", [
    TEA,
    "observe",
    "add",
    summary,
    MEMORY_DIR,
    "--type",
    meta.event || "lifecycle",
    "--project",
    meta.project || "",
  ], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) process.stderr.write(result.stderr || result.stdout || "");
}

function rolloverContext(compact) {
  try {
    if (compact.event === "SessionStart") {
      const state = recordSessionStart({
        memoryDir: MEMORY_DIR,
        payload: compact.payload,
        host: compact.host,
        project: compact.project,
        threshold: ROLLOVER_THRESHOLD,
        tokenThreshold: ROLLOVER_TOKEN_THRESHOLD,
      });
      const tokenTarget = state.tokenThreshold ? ` or about ${state.tokenThreshold} estimated prompt tokens` : "";
      return [
        `Token kit session project: ${state.project}.`,
        "At the start of the chat, ask the user to confirm or provide a project label if it is not obvious.",
        `Rollover target: create a compact handoff after about ${state.threshold} user turns${tokenTarget}; keep the current task running and suggest a fresh chat only at a natural stopping point in the same project/workspace.`,
      ].join(" ");
    }
    if (compact.event === "UserPromptSubmit") {
      const result = recordPrompt({
        memoryDir: MEMORY_DIR,
        payload: compact.payload,
        host: compact.host,
        project: compact.project,
        threshold: ROLLOVER_THRESHOLD,
        tokenThreshold: ROLLOVER_TOKEN_THRESHOLD,
      });
      if (result.shouldRollover) {
        return [
          `Session rollover recommended for project ${result.state.project}.`,
          `A compact handoff was saved at: ${result.handoffFile}.`,
          "Do not stop, abandon, or interrupt the running task. Finish the current user request, then ask whether to start the next chat from this handoff in the same project/workspace.",
        ].join(" ");
      }
      if (result.state.userTurns === 1) {
        return [
          `Project label for persistent memory: ${result.state.project}.`,
          "If this is wrong or too broad, ask the user for the project name now. Use that project label for future observations and handoffs.",
        ].join(" ");
      }
    }
  } catch (error) {
    process.stderr.write(`session-rollover warning: ${error.message}\n`);
  }
  return "";
}

function emitAdditionalContext(event, context) {
  if (!context) return;
  const output = {
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: context,
    },
  };
  process.stdout.write(JSON.stringify(output));
}

function receiptContext(event) {
  if (!["TaskCompleted", "Stop", "SessionEnd", "PostCompact"].includes(event)) return "";
  const result = spawnSync("node", [TEA, "receipt", MEMORY_DIR], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) return "";
  return String(result.stdout || "").trim();
}

function wakeContext(compact, raw) {
  if (!["Notification", "StopFailure", "PostToolUseFailure", "Stop", "SessionEnd"].includes(compact.event)) return "";
  try {
    const result = scheduleLimitResetWake({
      memoryDir: MEMORY_DIR,
      payload: compact.payload,
      raw,
      host: compact.host,
      event: compact.event,
      project: compact.project,
    });
    if (!result || !result.plan) return "";
    if (result.duplicate) return `Token-kit wake already scheduled for ${result.plan.run_at}; handoff: ${result.plan.handoff_file}.`;
    if (!result.scheduled) return "";
    return `Token-kit wake scheduled for ${result.plan.run_at}; handoff: ${result.plan.handoff_file}. The current task state is saved; resume from the handoff after the limit reset.`;
  } catch (error) {
    process.stderr.write(`wake warning: ${error.message}\n`);
    return "";
  }
}

const raw = readStdin();
const compact = compactPayload(raw);
if (!shouldRunHook(compact.event, compact.host)) process.exit(0);
appendStats(raw, compact.summary, { hookHost: compact.host, hookEvent: compact.event, project: compact.project });
observe(compact.summary, compact);
try {
  if (compact.event === "UserPromptSubmit") {
    learnInstinctFromPrompt({ memoryDir: MEMORY_DIR, payload: compact.payload, project: compact.project });
  }
} catch (error) {
  process.stderr.write(`instinct warning: ${error.message}\n`);
}

try {
  recordCostSnapshot({
    memoryDir: MEMORY_DIR,
    payload: compact.payload,
    host: compact.host,
    event: compact.event,
    sessionId: compact.payload.session_id || compact.payload.sessionId || `${compact.host}-${compact.project}`,
  });
} catch (error) {
  process.stderr.write(`cost warning: ${error.message}\n`);
}

const learnedContext = ["SessionStart", "UserPromptSubmit"].includes(compact.event)
  ? activeInstinctContext(MEMORY_DIR, compact.project, compact.summary)
  : "";
const contextPressure = contextSuggestion({
  memoryDir: MEMORY_DIR,
  sessionId: compact.payload.session_id || compact.payload.sessionId || `${compact.host}-${compact.project}`,
  transcriptPath: compact.payload.transcript_path,
});

emitAdditionalContext(
  compact.event,
  [rolloverContext(compact), wakeContext(compact, raw), learnedContext, contextPressure, receiptContext(compact.event)].filter(Boolean).join(" ")
);

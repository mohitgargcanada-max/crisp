"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_THRESHOLD = 12;
const DEFAULT_TOKEN_THRESHOLD = 0;

function safeSlug(value, fallback = "session") {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function resolveProject(payload = {}, fallbackCwd = process.cwd()) {
  const explicit = process.env.TEA_PROJECT || payload.project || payload.project_name || "";
  if (explicit) return String(explicit).trim();
  const cwd = payload.cwd || fallbackCwd;
  const name = path.basename(String(cwd || "").replace(/[\\/]+$/, ""));
  return name || "unassigned";
}

function sessionId(payload = {}, host = "unknown", project = "unassigned") {
  return String(payload.session_id || payload.sessionId || `${host}-${project}`).trim();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function stateFile(memoryDir, id) {
  return path.join(memoryDir, "session-state", `${safeSlug(id)}.json`);
}

function handoffDir(memoryDir) {
  return path.join(memoryDir, "session-handoffs");
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function loadState(memoryDir, id) {
  return readJson(stateFile(memoryDir, id), null);
}

function saveState(memoryDir, state) {
  const file = stateFile(memoryDir, state.sessionId);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
  return file;
}

function compactPrompt(payload = {}) {
  const text = String(payload.prompt || payload.message || payload.user_prompt || "").trim();
  return text.replace(/\s+/g, " ").slice(0, 500);
}

function promptText(payload = {}) {
  return String(payload.prompt || payload.message || payload.user_prompt || "").trim();
}

function newState({ payload = {}, host = "unknown", project, cwd, threshold, tokenThreshold = DEFAULT_TOKEN_THRESHOLD }) {
  const id = sessionId(payload, host, project);
  return {
    sessionId: id,
    host,
    project,
    cwd,
    threshold,
    tokenThreshold,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userTurns: 0,
    estimatedPromptTokens: 0,
    lastRolloverTurn: 0,
    lastRolloverTokens: 0,
    recentPrompts: [],
    handoffs: [],
  };
}

function createHandoff(memoryDir, state, reason = "threshold") {
  ensureDir(handoffDir(memoryDir));
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const projectSlug = safeSlug(state.project, "project");
  const file = path.join(handoffDir(memoryDir), `${stamp}-${projectSlug}-handoff.md`);
  const recent = (state.recentPrompts || []).slice(-12);
  const body = [
    `# Session Handoff: ${state.project}`,
    "",
    `- created: ${new Date().toISOString()}`,
    `- reason: ${reason}`,
    `- host: ${state.host}`,
    `- session_id: ${state.sessionId}`,
    `- project: ${state.project}`,
    `- cwd: ${state.cwd || ""}`,
    `- user_turns: ${state.userTurns}`,
    `- turn_threshold: ${state.threshold}`,
    `- token_threshold: ${state.tokenThreshold || 0}`,
    `- estimated_session_prompt_tokens: ${state.estimatedPromptTokens || 0}`,
    `- estimated_recent_prompt_tokens: ${estimateTokens(recent.map((row) => row.text).join("\n"))}`,
    "",
    "## Current State",
    "",
    "- Continue from this handoff instead of loading the whole old chat.",
    "- Start the rollover chat in the same host project/workspace when the host supports projects.",
    "- Keep the same cwd/repo unless the user explicitly asks to move.",
    "- If the old chat still has an active task, finish or verify that task before switching contexts.",
    "- Use current repo files and memory search for exact details.",
    "- Preserve exact paths, commands, errors, IDs, and decisions.",
    "",
    "## Recent User Prompts",
    "",
    ...recent.map((row) => `- ${row.ts} turn=${row.turn}: ${row.text || "(no prompt text captured)"}`),
    "",
    "## Next Chat Prompt",
    "",
    "```text",
    `Continue project: ${state.project}`,
    `Use same host project/workspace: ${state.project}`,
    `Use same cwd/repo when available: ${state.cwd || ""}`,
    `Use memory-vault handoff: ${file}`,
    "Recall only relevant memory. Do not load the whole prior chat.",
    "Summarize what you need from the handoff, then continue with the next concrete action.",
    "Do not assume the previous task was stopped; use this handoff as continuity after a safe stopping point.",
    "```",
    "",
  ].join("\n");
  fs.writeFileSync(file, body, "utf8");
  return file;
}

function recordPrompt({ memoryDir, payload = {}, host = "unknown", threshold = DEFAULT_THRESHOLD, tokenThreshold = DEFAULT_TOKEN_THRESHOLD, project: projectArg = "" }) {
  const cwd = payload.cwd || process.cwd();
  const project = projectArg || resolveProject(payload, cwd);
  const id = sessionId(payload, host, project);
  let state = loadState(memoryDir, id) || newState({ payload, host, project, cwd, threshold, tokenThreshold });
  state.project = project;
  state.cwd = cwd;
  state.threshold = threshold;
  state.tokenThreshold = tokenThreshold;
  state.updatedAt = new Date().toISOString();
  state.userTurns += 1;
  const promptTokens = estimateTokens(promptText(payload));
  state.estimatedPromptTokens = (state.estimatedPromptTokens || 0) + promptTokens;
  const text = compactPrompt(payload);
  state.recentPrompts.push({ ts: new Date().toISOString(), turn: state.userTurns, estimatedTokens: promptTokens, text });
  state.recentPrompts = state.recentPrompts.slice(-24);

  let handoffFile = "";
  let shouldRollover = false;
  const turnDue = state.userTurns >= threshold && state.userTurns - (state.lastRolloverTurn || 0) >= threshold;
  const tokenDue = tokenThreshold > 0 && state.estimatedPromptTokens >= tokenThreshold && state.estimatedPromptTokens - (state.lastRolloverTokens || 0) >= tokenThreshold;
  if (turnDue || tokenDue) {
    const reason = tokenDue ? `${tokenThreshold}-token threshold` : `${threshold}-turn threshold`;
    handoffFile = createHandoff(memoryDir, state, reason);
    state.lastRolloverTurn = state.userTurns;
    state.lastRolloverTokens = state.estimatedPromptTokens;
    state.handoffs.push({ ts: new Date().toISOString(), turn: state.userTurns, file: handoffFile });
    state.handoffs = state.handoffs.slice(-20);
    shouldRollover = true;
  }

  saveState(memoryDir, state);
  return { state, handoffFile, shouldRollover };
}

function recordSessionStart({ memoryDir, payload = {}, host = "unknown", threshold = DEFAULT_THRESHOLD, tokenThreshold = DEFAULT_TOKEN_THRESHOLD, project: projectArg = "" }) {
  const cwd = payload.cwd || process.cwd();
  const project = projectArg || resolveProject(payload, cwd);
  const id = sessionId(payload, host, project);
  const state = loadState(memoryDir, id) || newState({ payload, host, project, cwd, threshold, tokenThreshold });
  state.project = project;
  state.cwd = cwd;
  state.threshold = threshold;
  state.tokenThreshold = tokenThreshold;
  state.updatedAt = new Date().toISOString();
  saveState(memoryDir, state);
  return state;
}

function sessionStatus(memoryDir) {
  const dir = path.join(memoryDir, "session-state");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson(path.join(dir, name), null))
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function manualHandoff({ memoryDir, project = "", reason = "manual", cwd = process.cwd(), threshold = DEFAULT_THRESHOLD, tokenThreshold = DEFAULT_TOKEN_THRESHOLD }) {
  const payload = { session_id: `manual-${safeSlug(project || path.basename(cwd))}`, cwd };
  const state = newState({ payload, host: os.hostname(), project: project || resolveProject(payload, cwd), cwd, threshold, tokenThreshold });
  state.userTurns = 0;
  const file = createHandoff(memoryDir, state, reason);
  state.lastRolloverTurn = 0;
  state.handoffs.push({ ts: new Date().toISOString(), turn: state.userTurns, file });
  saveState(memoryDir, state);
  return { state, file };
}

module.exports = {
  DEFAULT_THRESHOLD,
  DEFAULT_TOKEN_THRESHOLD,
  createHandoff,
  manualHandoff,
  recordPrompt,
  recordSessionStart,
  resolveProject,
  sessionStatus,
};

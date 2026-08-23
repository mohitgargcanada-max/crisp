#!/usr/bin/env node
"use strict";

const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "..", "..");
const TEA = path.join(ROOT, "cli", "tea.js");

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parsePayload(raw) {
  try {
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function normalized(text) {
  return String(text || "").replace(/\\/g, "/").replace(/\s+/g, " ").trim().toLowerCase();
}

function isTeaCommand(command) {
  const cmd = normalized(command);
  return cmd.includes("token-efficient-agent-kit/cli/tea.js") || /\btea\.js\b/.test(cmd);
}

function isTeaRun(command) {
  const cmd = normalized(command);
  return isTeaCommand(cmd) && /\btea\.js\s+run\b/.test(cmd);
}

function labelFrom(command) {
  const first = String(command || "").split(/\r?\n/).find(Boolean) || "claude bash";
  return first.replace(/["'`]/g, "").slice(0, 80);
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }));
}

const payload = parsePayload(readStdin());
const tool = payload.tool_name || payload.tool || "";
const command = payload.tool_input?.command || payload.input?.command || payload.command || "";

if (tool !== "Bash" || !command) process.exit(0);

if (isTeaRun(command) || isTeaCommand(command)) process.exit(0);

const label = labelFrom(command);
deny([
  "Raw Bash command blocked by token-efficient strict mode.",
  "Rerun it through the token wrapper so output gets token metrics and compact memory observation.",
  `Use: node ${TEA} run --label "${label}" -- ${command}`,
].join(" "));

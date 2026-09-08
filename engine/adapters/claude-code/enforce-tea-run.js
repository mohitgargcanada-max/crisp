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

// Strict mode is OFF by default. `rtk hook claude` is registered ahead of this
// hook on the same PreToolUse/Bash matcher and already rewrites commands for
// token efficiency, so hard-denying here demanded a SECOND wrapper for a job
// already done — at the cost of blocking 100% of Bash. Set TEA_STRICT_BASH=1 to
// restore the hard deny.
//
// Known limitation of strict mode: settings.json scopes this hook to the `Bash`
// matcher only, so the PowerShell tool bypasses it entirely. On Windows that is
// most of the shell traffic. Add "PowerShell" to the matcher if strict mode is
// meant to be airtight.
const STRICT = /^(1|true|yes|on)$/i.test(String(process.env.TEA_STRICT_BASH || ""));

// Match the command HEAD, not any substring. The old check passed anything
// merely CONTAINING "tea.js", so `echo tea.js; <anything>` sailed straight
// through and strict mode was never actually strict.
function isTeaCommand(command) {
  const cmd = normalized(command);
  return /^(?:[^\s|&;]*\bnode\s+)?(?:"[^"]*tea\.js"|'[^']*tea\.js'|[^\s|&;]*tea\.js)(?:\s|$)/.test(cmd);
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

// Advisory by default: emit nothing and let the call through. Emitting a nudge
// on every Bash call would itself cost tokens on every Bash call, which defeats
// the point of a token-efficiency hook.
if (!STRICT) process.exit(0);

if (isTeaRun(command) || isTeaCommand(command)) process.exit(0);

const label = labelFrom(command);
deny([
  "Raw Bash command blocked by token-efficient strict mode.",
  "Rerun it through the token wrapper so output gets token metrics and compact memory observation.",
  `Use: node ${TEA} run --label "${label}" -- ${command}`,
].join(" "));

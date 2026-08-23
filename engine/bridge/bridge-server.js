#!/usr/bin/env node
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_PORT = Number(process.env.TEA_BRIDGE_PORT || 6768);
const MEMORY_DIR = path.resolve(process.env.TEA_MEMORY_DIR || path.join(ROOT, "memory-vault"));
const TEMPLATE_DIR = path.join(ROOT, "memory-templates");
const MAX_BODY = 1024 * 1024;

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

function uniquePush(list, value, max = 120) {
  const trimmed = String(value || "").trim();
  if (trimmed && !list.includes(trimmed) && list.length < max) list.push(trimmed);
}

function important(line) {
  return /(must|never|always|exact|path|command|error|failed|warning|token|secret|permission|auth|scope|validation|requirement|deliverable|output|install|run|copy|paste|github|mcp|skill|plugin|memory|repo|decision)/i.test(line)
    || /[`"'\\/:]/.test(line)
    || /^#{1,6}\s/.test(line)
    || /^[-*]\s/.test(line)
    || /^\d+\.\s/.test(line);
}

function compressText(text, mode = "balanced") {
  const maxLines = mode === "aggressive" ? 60 : mode === "safe" ? 180 : 120;
  const keep = [];
  const seen = new Set();
  let blank = 0;
  let duplicate = 0;
  let low = 0;

  for (const raw of String(text || "").replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) { blank += 1; continue; }
    const normalized = line.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ");
    if (seen.has(normalized)) { duplicate += 1; continue; }
    seen.add(normalized);
    if (/^(sure|certainly|of course|happy to|please note|basically|really|just)\b/i.test(line)) { low += 1; continue; }
    if (important(line) || keep.length < maxLines) uniquePush(keep, line, maxLines);
    else low += 1;
  }

  const body = keep.join("\n").trim();
  const bodyStats = savings(text, body);
  const output = [
    "--- compressed prompt ---",
    `mode: bridge-${mode}`,
    `estimated_tokens_before: ${bodyStats.beforeTokens}`,
    `estimated_tokens_after: ${bodyStats.afterTokens}`,
    `estimated_tokens_saved: ${bodyStats.savedTokens}`,
    `estimated_token_saved_percent: ${bodyStats.savedPercent}`,
    `removed_blank: ${blank}`,
    `removed_duplicate: ${duplicate}`,
    `removed_low_signal: ${low}`,
    "---",
    "",
    body,
  ].join("\n");
  return { output, stats: savings(text, output), bodyStats };
}

function copyDirIfMissing(source, target) {
  fs.mkdirSync(target, { recursive: true });
  if (!fs.existsSync(source)) return;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dst = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirIfMissing(src, dst);
    } else if (!fs.existsSync(dst)) {
      fs.copyFileSync(src, dst);
    }
  }
}

function ensureVault() {
  copyDirIfMissing(TEMPLATE_DIR, MEMORY_DIR);
  for (const folder of ["projects", "decisions", "concepts"]) fs.mkdirSync(path.join(MEMORY_DIR, folder), { recursive: true });
}

function memoryMapPath() {
  return path.join(MEMORY_DIR, "memory-map.md");
}

function walkMarkdown(root) {
  const files = [];
  function walk(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (![".git", "node_modules", ".tea-stats"].includes(entry.name)) walk(full);
      } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
        files.push(full);
      }
    }
  }
  walk(root);
  return files;
}

function queryTerms(query) {
  return String(query || "").toLowerCase().split(/[^a-z0-9_.:-]+/i).filter((term) => term.length >= 2);
}

function recallMemory(query, limit = 8) {
  ensureVault();
  const terms = queryTerms(query);
  if (!terms.length) return { query, hits: [], context: "" };
  const hits = [];
  for (const file of walkMarkdown(MEMORY_DIR)) {
    const rel = path.relative(MEMORY_DIR, file);
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      const lower = line.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
      if (score > 0 && line.trim()) hits.push({ path: rel, line: index + 1, score, text: line.trim() });
    });
  }
  hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line);
  const top = hits.slice(0, Math.max(1, Math.min(Number(limit) || 8, 20)));
  const context = top.length
    ? ["## Recalled Memory", ...top.map((hit) => `- ${hit.path}:${hit.line} ${hit.text}`)].join("\n")
    : "";
  return { query, hits: top, context };
}

function looksSensitive(text) {
  return /(api[_-]?key|secret|password|passwd|oauth|bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]{12,}|token\s*[:=]|recovery phrase|private key)/i.test(String(text || ""));
}

function addMemory(text) {
  const value = String(text || "").trim();
  if (!value) throw new Error("Missing memory text");
  if (looksSensitive(value)) {
    const error = new Error("Refusing to save secret-looking memory.");
    error.status = 400;
    throw error;
  }
  ensureVault();
  const line = `- ${new Date().toISOString().slice(0, 10)} ${value}`;
  fs.appendFileSync(memoryMapPath(), `\n## Inbox\n\n${line}\n`, "utf8");
  return { path: memoryMapPath(), line };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) {
        reject(Object.assign(new Error("Request body too large"), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { reject(Object.assign(new Error("Invalid JSON body"), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

function send(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function route(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, {});
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    ensureVault();
    return send(res, 200, { ok: true, service: "token-efficient-agent-bridge", memoryDir: MEMORY_DIR });
  }

  if (req.method === "POST" && url.pathname === "/compress") {
    const body = await readBody(req);
    const result = compressText(body.text || "", body.mode || "balanced");
    return send(res, 200, { ok: true, ...result });
  }

  if (req.method === "GET" && url.pathname === "/memory/map") {
    ensureVault();
    return send(res, 200, { ok: true, path: memoryMapPath(), text: fs.readFileSync(memoryMapPath(), "utf8") });
  }

  if (req.method === "GET" && url.pathname === "/memory/recall") {
    const result = recallMemory(url.searchParams.get("q") || "", url.searchParams.get("limit") || 8);
    return send(res, 200, { ok: true, ...result });
  }

  if (req.method === "POST" && url.pathname === "/memory/add") {
    const body = await readBody(req);
    return send(res, 200, { ok: true, ...addMemory(body.text || "") });
  }

  return send(res, 404, { ok: false, error: "Not found" });
}

function startBridge(options = {}) {
  const port = Number(options.port || DEFAULT_PORT);
  const server = http.createServer((req, res) => {
    route(req, res).catch((error) => send(res, error.status || 500, { ok: false, error: error.message || String(error) }));
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`token-efficient-agent bridge listening on http://127.0.0.1:${port}`);
    console.log(`memory_vault: ${MEMORY_DIR}`);
  });
  return server;
}

if (require.main === module) startBridge();

module.exports = { startBridge, compressText, recallMemory, addMemory };

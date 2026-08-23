"use strict";

const fs = require("node:fs");
const path = require("node:path");

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function normalizeStablePrefix(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !/^\s*(generated_at|timestamp|date|time|run_id|receipt|token receipt)\s*[:=]/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeDynamicTail(text) {
  return String(text || "").replace(/\r\n/g, "\n").trim();
}

function cacheKeyFrom(value, fallback = "token-kit-cache") {
  const key = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return key || fallback;
}

function buildCachePrompt({ stableText = "", dynamicText = "", key = "", title = "Cache-Friendly Prompt" }) {
  const stable = normalizeStablePrefix(stableText);
  const dynamic = normalizeDynamicTail(dynamicText);
  const cacheKey = cacheKeyFrom(key);
  const output = [
    `# ${title}`,
    "",
    `cache_key: ${cacheKey}`,
    "",
    "## Stable Prefix",
    "",
    "Keep this section byte-stable across repeated requests when possible. Put durable rules, project summaries, repo maps, and tool instructions here.",
    "",
    stable || "(none)",
    "",
    "## Dynamic Tail",
    "",
    "Put only the current task, changing user request, latest errors, or fresh file snippets here.",
    "",
    dynamic || "(none)",
    "",
  ].join("\n");
  const stableTokens = estimateTokens(stable);
  const dynamicTokens = estimateTokens(dynamic);
  return {
    cacheKey,
    stable,
    dynamic,
    output,
    stats: {
      stableTokens,
      dynamicTokens,
      totalTokens: estimateTokens(output),
      stableSharePercent: stableTokens + dynamicTokens ? Math.round((stableTokens / (stableTokens + dynamicTokens)) * 100) : 0,
    },
  };
}

function splitPrompt(text) {
  const source = String(text || "").replace(/\r\n/g, "\n");
  const marker = source.match(/^##\s+Dynamic Tail\s*$/mi);
  if (marker) {
    const splitAt = marker.index;
    return {
      stable: normalizeStablePrefix(source.slice(0, splitAt)),
      dynamic: normalizeDynamicTail(source.slice(splitAt)),
      method: "marker",
    };
  }

  const lines = source.split("\n");
  let splitIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*(#{1,3}\s*)?(current task|new task|request|user request|question|latest error|dynamic tail)\b/i.test(lines[index])) {
      splitIndex = index;
      break;
    }
  }
  if (splitIndex === -1) splitIndex = Math.max(0, Math.floor(lines.length * 0.7));
  return {
    stable: normalizeStablePrefix(lines.slice(0, splitIndex).join("\n")),
    dynamic: normalizeDynamicTail(lines.slice(splitIndex).join("\n")),
    method: splitIndex === Math.floor(lines.length * 0.7) ? "70-percent-fallback" : "heading",
  };
}

function writeCacheSplit(inputFile, outDir) {
  const sourcePath = path.resolve(inputFile);
  const outputDir = path.resolve(outDir || path.join(path.dirname(sourcePath), "cache-prompt"));
  const split = splitPrompt(fs.readFileSync(sourcePath, "utf8"));
  fs.mkdirSync(outputDir, { recursive: true });
  const stableFile = path.join(outputDir, "stable-prefix.md");
  const dynamicFile = path.join(outputDir, "dynamic-tail.md");
  fs.writeFileSync(stableFile, `${split.stable.trim()}\n`, "utf8");
  fs.writeFileSync(dynamicFile, `${split.dynamic.trim()}\n`, "utf8");
  return {
    input: sourcePath,
    outDir: outputDir,
    stableFile,
    dynamicFile,
    method: split.method,
    stableTokens: estimateTokens(split.stable),
    dynamicTokens: estimateTokens(split.dynamic),
  };
}

module.exports = {
  buildCachePrompt,
  cacheKeyFrom,
  estimateTokens,
  splitPrompt,
  writeCacheSplit,
};

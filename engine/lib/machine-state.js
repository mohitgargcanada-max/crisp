"use strict";

// Per-machine state snapshot for the cross-machine dashboard. Written to
// projects's sibling machines/<hostname>.json in the vault as part of every `tea vault push`,
// so the private repo itself is the aggregation point -- no server, no new infrastructure,
// reuses the sync mechanism already built. Every field here is REAL, measured data (CRISP's
// own VERSION file, git HEAD, installed_plugins.json's actual version numbers, a real hash
// comparison against CRISP's own source) -- not invented or guessed.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { hostId } = require("./vault-sync");

const CRISP_ROOT = path.resolve(__dirname, "..", "..");
const CLAUDE_HOME = path.join(os.homedir(), ".claude");

function run(command, args, cwd) {
  const r = spawnSync(command, args, { cwd, encoding: "utf8", windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

function crispVersion() {
  const f = path.join(CRISP_ROOT, "VERSION");
  try { return fs.readFileSync(f, "utf8").trim(); } catch { return "unknown"; }
}

function crispCommit() {
  const hash = run("git", ["rev-parse", "--short", "HEAD"], CRISP_ROOT);
  const date = run("git", ["log", "-1", "--format=%ci"], CRISP_ROOT);
  const ahead = run("git", ["rev-list", "--count", "@{u}..HEAD"], CRISP_ROOT);
  const behind = run("git", ["rev-list", "--count", "HEAD..@{u}"], CRISP_ROOT);
  return {
    hash: hash || "unknown",
    date: date || null,
    unpushed: ahead ? parseInt(ahead, 10) : null,
    unpulled: behind ? parseInt(behind, 10) : null,
  };
}

function installedPlugins() {
  const f = path.join(CLAUDE_HOME, "plugins", "installed_plugins.json");
  if (!fs.existsSync(f)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(f, "utf8"));
    const out = {};
    for (const [key, entries] of Object.entries(data.plugins || {})) {
      const latest = Array.isArray(entries) ? entries[entries.length - 1] : entries;
      out[key] = latest ? latest.version : null;
    }
    return out;
  } catch {
    return {};
  }
}

function hashFile(p) {
  try {
    return crypto.createHash("sha256")
      .update(fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n"), "utf8")
      .digest("hex").slice(0, 12);
  } catch {
    return null;
  }
}

// Drift is hash/mtime comparison against CRISP's own source, not semantic versioning --
// skills have no version field today. Reports "in-sync", "differs" (installed copy edited
// or CRISP updated since last reinstall), or "missing" (not installed on this machine).
function skillDrift() {
  const sourceDir = path.join(CRISP_ROOT, "claude", "skills");
  const installedDir = path.join(CLAUDE_HOME, "skills");
  const out = {};
  if (!fs.existsSync(sourceDir)) return out;
  for (const name of fs.readdirSync(sourceDir)) {
    const sourceFile = path.join(sourceDir, name, "SKILL.md");
    const installedFile = path.join(installedDir, name, "SKILL.md");
    if (!fs.existsSync(sourceFile)) continue;
    const sourceHash = hashFile(sourceFile);
    if (!fs.existsSync(installedFile)) { out[name] = "missing"; continue; }
    out[name] = hashFile(installedFile) === sourceHash ? "in-sync" : "differs";
  }
  return out;
}

function agentDrift() {
  const sourceDir = path.join(CRISP_ROOT, "claude", "agents");
  const installedDir = path.join(CLAUDE_HOME, "agents");
  const out = {};
  if (!fs.existsSync(sourceDir)) return out;
  for (const file of fs.readdirSync(sourceDir)) {
    if (!file.endsWith(".md")) continue;
    const name = file.replace(/\.md$/, "");
    const sourceHash = hashFile(path.join(sourceDir, file));
    const installedFile = path.join(installedDir, file);
    if (!fs.existsSync(installedFile)) { out[name] = "missing"; continue; }
    out[name] = hashFile(installedFile) === sourceHash ? "in-sync" : "differs";
  }
  return out;
}

function vaultSyncStatus(vaultDir) {
  const status = run("git", ["status", "--porcelain"], vaultDir);
  const lastCommit = run("git", ["log", "-1", "--format=%ci"], vaultDir);
  const ahead = run("git", ["rev-list", "--count", "@{u}..HEAD"], vaultDir);
  return {
    uncommitted: status ? status.split("\n").filter(Boolean).length : 0,
    lastCommitAt: lastCommit || null,
    unpushed: ahead ? parseInt(ahead, 10) : null,
  };
}

function generateSnapshot(vaultDir) {
  return {
    host: hostId(),
    platform: `${os.platform()} ${os.release()}`,
    generatedAt: new Date().toISOString(),
    crisp: { version: crispVersion(), commit: crispCommit() },
    plugins: installedPlugins(),
    skills: skillDrift(),
    agents: agentDrift(),
    vault: vaultSyncStatus(vaultDir),
  };
}

function writeSnapshot(vaultDir) {
  const snapshot = generateSnapshot(vaultDir);
  const dir = path.join(vaultDir, "machines");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${snapshot.host}.json`), JSON.stringify(snapshot, null, 2), "utf8");
  return snapshot;
}

function readAllSnapshots(vaultDir) {
  const dir = path.join(vaultDir, "machines");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try { out.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))); } catch { /* skip malformed */ }
  }
  return out.sort((a, b) => a.host.localeCompare(b.host));
}

module.exports = {
  generateSnapshot,
  writeSnapshot,
  readAllSnapshots,
};

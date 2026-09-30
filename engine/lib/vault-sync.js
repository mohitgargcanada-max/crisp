"use strict";

// Native-memory <-> vault sync. Built from a 2026-09-30 Opus design review that found the
// literal "always append" rule Mohit asked for fails for files that get EDITED IN PLACE
// (MEMORY.md, topic files with a `modified:` frontmatter date after their filename date) --
// refined, with Mohit's sign-off, to: "sync never destroys anything that exists on only one
// side." A 3-way base/local/remote comparison lets genuine edits propagate without ever
// resurrecting a deliberate local deletion or silently dropping one side's new content.
//
// MEMORY.md is never merged across machines -- Claude Code only loads its first 200
// lines/25KB, so appending another machine's content risks pushing real facts past that
// limit, silently dropped on load. Each machine's copy is archived separately instead; pull
// writes an index file pointing at the others.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.status !== 0 && !options.allowFail) {
    throw new Error((result.stderr || result.stdout || `${command} ${args.join(" ")} failed`).trim());
  }
  return result;
}

function hostId() {
  return process.env.CRISP_SYNC_HOST || os.hostname();
}

function nativeProjectsRoot() {
  return process.env.CRISP_NATIVE_PROJECTS_DIR
    || path.join(os.homedir(), ".claude", "projects");
}

// Content hash, normalized to LF first -- native files on this machine are already a mix of
// CRLF/LF (checked: 28 CRLF, 347 LF), and comparing raw bytes would flag every line-ending
// difference as a "change" on a second machine with different git/editor config.
function hashContent(text) {
  const normalized = String(text).replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

function hashFile(filePath) {
  try {
    return hashContent(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function loadSyncProjects(vaultDir) {
  const file = path.join(vaultDir, "sync-projects.json");
  if (!fs.existsSync(file)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data.projects || {};
  } catch {
    return {};
  }
}

// Base-record: per-machine, per-project, hash of each file as of THIS machine's last
// successful sync. Deliberately NOT synced itself (lives in a gitignored folder) -- it
// answers "has MY copy changed since MY last sync", which is inherently local.
function baseRecordPath(vaultDir, project) {
  return path.join(vaultDir, ".sync-state", hostId(), `${project}.json`);
}

function loadBaseRecord(vaultDir, project) {
  const file = baseRecordPath(vaultDir, project);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function saveBaseRecord(vaultDir, project, record) {
  const file = baseRecordPath(vaultDir, project);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(record, null, 2), "utf8");
}

// Real provider-key SHAPES, not generic keywords -- a keyword scan ("secret", "token:") flags
// ~16% of all native-memory files (checked 2026-09-30) on ordinary prose about tokens/secrets
// as a CONCEPT, while catching 0 actual key-shaped strings. Scoped to the staged diff only.
const SECRET_PATTERNS = [
  { name: "anthropic-key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "openai-key", re: /\bsk-proj-[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: "aws-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "google-key", re: /\bAIza[A-Za-z0-9_-]{35}\b/ },
  { name: "private-key-block", re: /-----BEGIN[ A-Z]*PRIVATE KEY-----/ },
  { name: "telegram-bot-token", re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/ },
];

function scanForSecrets(diffText) {
  const hits = [];
  const lines = String(diffText || "").split("\n");
  let file = null;
  lines.forEach((line, i) => {
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (fileMatch) { file = fileMatch[1]; return; }
    if (!line.startsWith("+") || line.startsWith("+++")) return;
    for (const { name, re } of SECRET_PATTERNS) {
      if (re.test(line)) hits.push({ file: file || "?", line: i + 1, pattern: name });
    }
  });
  return hits;
}

function assertNoSecrets(vaultDir) {
  const diff = run("git", ["diff", "--cached"], vaultDir, { allowFail: true }).stdout;
  const hits = scanForSecrets(diff);
  if (hits.length) {
    const lines = hits.map((h) => `  ${h.file}:${h.line} (${h.pattern})`).join("\n");
    throw new Error(`secret-shaped content in staged diff, aborting before commit:\n${lines}`);
  }
}

// Commit-first, then pull --rebase --autostash, abort-on-failure (not allowFail) -- the old
// vaultSync() in tea.js ran pull BEFORE committing, with allowFail hiding a dirty-tree
// rejection, and a failed rebase left conflict markers staged for the next `git add -A` to
// pick up. Found by the 2026-09-30 Opus review; fixed here rather than patched in place,
// since vault-sync.js replaces vaultSync's body per that review's build plan.
function safePull(vaultDir) {
  const result = run("git", ["pull", "--rebase", "--autostash", "origin", "main"], vaultDir, { allowFail: true });
  if (result.status !== 0) {
    run("git", ["rebase", "--abort"], vaultDir, { allowFail: true });
    throw new Error(`git pull --rebase failed, aborted cleanly:\n${(result.stderr || result.stdout).trim()}`);
  }
}

function safePush(vaultDir) {
  const first = run("git", ["push", "origin", "main"], vaultDir, { allowFail: true });
  if (first.status === 0) return;
  safePull(vaultDir);
  run("git", ["push", "origin", "main"], vaultDir);
}

function hasRemote(vaultDir) {
  return run("git", ["remote", "get-url", "origin"], vaultDir, { allowFail: true }).status === 0;
}

// Discover which native-memory project dirs exist on THIS machine and map each to its vault
// project name via sync-projects.json's allowlist (native memory has no .git and no remote,
// so "is this a real project" can't be answered by checking for a repo -- confirmed
// makerznmarvelswebsite and mohit-trading-system both have real memory but no .git).
function discoverProjects(vaultDir, filterProject) {
  const syncProjects = loadSyncProjects(vaultDir);
  const root = nativeProjectsRoot();
  const found = [];
  for (const [project, cfg] of Object.entries(syncProjects)) {
    if (filterProject && project !== filterProject) continue;
    const nativeDir = path.join(root, cfg.native_dir, "memory");
    if (fs.existsSync(nativeDir)) found.push({ project, nativeDir });
  }
  return found;
}

function listMdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("MEMORY.md.bak") && f !== "_synced-from-other-machines.md")
    .sort();
}

// Reconciles ONE file between native (local) and vault (remote) copies for a project,
// using the 3-way base comparison. Mutates disk directly UNLESS dryRun is set, in which case
// it only computes and returns what it WOULD do -- fixed 2026-09-30 after a real incident:
// the first version ran the actual fs.copyFileSync calls regardless of dryRun (only the git
// commit/push step was gated), so a "--dry-run" preview silently performed a real 344-file
// sync. No data was lost (the files landed in the right place and got committed+pushed on
// the very next real run), but "dry run" must actually mean nothing gets written.
function reconcileFile(name, localDir, remoteDir, base, { dryRun = false } = {}) {
  const localPath = path.join(localDir, name);
  const remotePath = path.join(remoteDir, name);
  const localHash = hashFile(localPath);
  const remoteHash = hashFile(remotePath);
  // hadBaseRecord tracks "have we ever recorded a hash for this file" separately from the
  // NORMALIZED baseHash used for comparison below -- a file absent on a side (hash === null)
  // and a file never recorded in base (undefined) must compare as EQUAL ("unchanged"), or a
  // brand-new file that only exists on one side gets misread as "both sides changed" and
  // wrongly treated as a conflict. Found by the test suite, not assumed: this was a real bug.
  const hadBaseRecord = Object.prototype.hasOwnProperty.call(base, name);
  const baseHash = hadBaseRecord ? base[name] : null;

  if (localHash === remoteHash) {
    return { action: "noop", hash: localHash };
  }

  const localChanged = localHash !== baseHash;
  const remoteChanged = remoteHash !== baseHash;

  if (localHash === null && hadBaseRecord && !remoteChanged) {
    // Present in base, now missing locally, remote unchanged since base: a deliberate local
    // deletion (consolidate-memory's normal curation, or manual cleanup). Don't resurrect it.
    return { action: "deletion-respected", hash: baseHash };
  }

  if (remoteHash === null && hadBaseRecord && !localChanged) {
    // Mirror of the above: deleted on the other machine, respected here too.
    return { action: "deletion-respected", hash: baseHash };
  }

  if (localChanged && !remoteChanged) {
    if (localHash === null) return { action: "noop", hash: baseHash }; // both sides now absent
    if (!dryRun) {
      fs.mkdirSync(remoteDir, { recursive: true });
      fs.copyFileSync(localPath, remotePath);
    }
    return { action: "copied-local-to-remote", hash: localHash };
  }

  if (remoteChanged && !localChanged) {
    if (remoteHash === null) return { action: "noop", hash: baseHash };
    if (!dryRun) {
      fs.mkdirSync(localDir, { recursive: true });
      fs.copyFileSync(remotePath, localPath);
    }
    return { action: "copied-remote-to-local", hash: remoteHash };
  }

  if (localChanged && remoteChanged) {
    // Both sides changed (including both-created-new, baseHash undefined) to DIFFERENT
    // content. Never overwrite either -- write a sibling on both sides so nothing is lost,
    // flagged for a human (or `tea vault consolidate`) to actually resolve.
    if (!dryRun) {
      const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
      const stem = name.replace(/\.md$/, "");
      if (localHash !== null) {
        const siblingOnRemote = path.join(remoteDir, `${stem}.conflict-${hostId()}-${ts}.md`);
        fs.mkdirSync(remoteDir, { recursive: true });
        fs.copyFileSync(localPath, siblingOnRemote);
      }
      if (remoteHash !== null) {
        const siblingOnLocal = path.join(localDir, `${stem}.conflict-vault-${ts}.md`);
        fs.mkdirSync(localDir, { recursive: true });
        fs.copyFileSync(remotePath, siblingOnLocal);
      }
    }
    return { action: "conflict-sibling-written", hash: null };
  }

  return { action: "noop", hash: localHash };
}

// MEMORY.md: never merged. Each machine's copy is archived under
// projects/<slug>/native/_hosts/<host>/MEMORY.md; never copied back over another machine's
// own MEMORY.md. See module header for why (Claude Code's 200-line/25KB load limit).
function archiveMemoryMd(localDir, remoteDir, { dryRun = false } = {}) {
  const localMemory = path.join(localDir, "MEMORY.md");
  if (!fs.existsSync(localMemory)) return null;
  const hostDir = path.join(remoteDir, "_hosts", hostId());
  if (!dryRun) {
    fs.mkdirSync(hostDir, { recursive: true });
    fs.copyFileSync(localMemory, path.join(hostDir, "MEMORY.md"));
  }
  return hostDir;
}

// Writes a tool-owned index into native memory listing other machines' files this machine's
// own MEMORY.md doesn't already reference -- read by session_start_mem.py, not written to by
// Claude directly (MEMORY.md itself stays the one file Claude edits).
function writeSyncedIndex(localDir, remoteDir) {
  const hostsDir = path.join(remoteDir, "_hosts");
  if (!fs.existsSync(hostsDir)) return;
  const myMemory = fs.existsSync(path.join(localDir, "MEMORY.md"))
    ? fs.readFileSync(path.join(localDir, "MEMORY.md"), "utf8") : "";
  const lines = ["# Synced from other machines", "",
    "Auto-generated by `tea vault pull` -- do not edit by hand, it's overwritten on every pull.", ""];
  let any = false;
  for (const host of fs.readdirSync(hostsDir)) {
    if (host === hostId()) continue;
    const memPath = path.join(hostsDir, host, "MEMORY.md");
    if (!fs.existsSync(memPath)) continue;
    const text = fs.readFileSync(memPath, "utf8");
    const descMatch = text.match(/description:\s*(.+)/);
    const already = descMatch && myMemory.includes(descMatch[1].trim());
    if (already) continue;
    any = true;
    lines.push(`## ${host}`, "", `See \`${memPath}\``,
      descMatch ? `> ${descMatch[1].trim()}` : "", "");
  }
  if (!any) return;
  fs.writeFileSync(path.join(localDir, "_synced-from-other-machines.md"), lines.join("\n"), "utf8");
}

function syncOneProject(vaultDir, project, nativeDir, direction, { dryRun = false } = {}) {
  const remoteDir = path.join(vaultDir, "projects", project, "native");
  if (!dryRun) fs.mkdirSync(remoteDir, { recursive: true });
  const base = loadBaseRecord(vaultDir, project);
  const nextBase = { ...base };
  const results = [];

  archiveMemoryMd(nativeDir, remoteDir, { dryRun });

  const names = new Set([...listMdFiles(nativeDir), ...listMdFiles(remoteDir)]);
  for (const name of names) {
    const r = reconcileFile(name, nativeDir, remoteDir, base, { dryRun });
    if (r.hash !== null && r.hash !== undefined) nextBase[name] = r.hash;
    else delete nextBase[name];
    if (r.action !== "noop") results.push({ file: name, ...r });
  }

  // Dry-run must never persist the base record -- doing so would make a LATER real run
  // believe these files are already synced (same class of bug as the file-copy fix above:
  // "preview" silently becoming "real" because a side effect wasn't actually gated).
  if (dryRun) return results;

  if (direction === "pull") writeSyncedIndex(nativeDir, remoteDir);
  saveBaseRecord(vaultDir, project, nextBase);
  return results;
}

// Pushes whenever there's anything unpushed, regardless of which step committed it. Fixed
// 2026-09-30 after a real incident: gating the push on "did the LAST diff check find
// something new" meant the pre-sync checkpoint commit could absorb the real changes, leave
// nothing for that final diff check to find, and strand a real commit unpushed with no
// error -- comparing against the remote tracking ref instead catches commits from ANY step.
function pushIfAhead(vaultDir) {
  if (!hasRemote(vaultDir)) return;
  const ahead = run("git", ["rev-list", "--count", "@{u}..HEAD"], vaultDir, { allowFail: true });
  if (ahead.status === 0 && parseInt(ahead.stdout.trim(), 10) > 0) safePush(vaultDir);
}

function push(vaultDir, { project, dryRun } = {}) {
  const projects = discoverProjects(vaultDir, project);
  if (!dryRun && hasRemote(vaultDir)) {
    // Commit whatever's already staged from a prior run before pulling, so pull --rebase
    // never has to run against a dirty tree.
    run("git", ["add", "-A"], vaultDir);
    const dirty = run("git", ["diff", "--cached", "--quiet"], vaultDir, { allowFail: true });
    if (dirty.status !== 0) {
      assertNoSecrets(vaultDir);
      run("git", ["commit", "-m", "vault: pre-sync checkpoint"], vaultDir);
    }
    safePull(vaultDir);
  }
  const allResults = [];
  for (const { project: p, nativeDir } of projects) {
    const results = syncOneProject(vaultDir, p, nativeDir, "push", { dryRun });
    allResults.push({ project: p, results });
  }
  if (dryRun) return allResults;
  run("git", ["add", "-A"], vaultDir);
  const diff = run("git", ["diff", "--cached", "--quiet"], vaultDir, { allowFail: true });
  if (diff.status !== 0) {
    assertNoSecrets(vaultDir);
    run("git", ["commit", "-m", `vault push from ${hostId()}`], vaultDir);
  }
  pushIfAhead(vaultDir);
  return allResults;
}

function pull(vaultDir, { project, dryRun } = {}) {
  if (!dryRun && hasRemote(vaultDir)) safePull(vaultDir);
  const projects = discoverProjects(vaultDir, project);
  const allResults = [];
  for (const { project: p, nativeDir } of projects) {
    const results = syncOneProject(vaultDir, p, nativeDir, "pull", { dryRun });
    allResults.push({ project: p, results });
  }
  return allResults;
}

module.exports = {
  hashContent,
  hashFile,
  hostId,
  nativeProjectsRoot,
  loadSyncProjects,
  loadBaseRecord,
  saveBaseRecord,
  scanForSecrets,
  reconcileFile,
  discoverProjects,
  push,
  pull,
};

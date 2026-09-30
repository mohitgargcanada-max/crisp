"use strict";

// Renders the machines/*.json snapshots into a single static dashboard.html, committed into
// the vault repo. Data is INLINED at generation time (not fetched at view time) -- a local
// file:// page can't reliably fetch sibling JSON files due to browser CORS restrictions on
// the file protocol, so the dashboard has to be regenerated to show fresh data, not just the
// underlying JSON files updated. That regeneration happens automatically as part of
// `tea vault push` (see vault-sync.js), so this is a non-issue in normal use.

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function badge(status) {
  const cls = status === "in-sync" ? "ok" : status === "missing" ? "warn" : "bad";
  const label = status === "in-sync" ? "in sync" : status;
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

function renderMachineCard(snap) {
  const skillRows = Object.entries(snap.skills || {})
    .map(([name, status]) => `<tr><td>${escapeHtml(name)}</td><td>${badge(status)}</td></tr>`)
    .join("");
  const agentRows = Object.entries(snap.agents || {})
    .map(([name, status]) => `<tr><td>${escapeHtml(name)}</td><td>${badge(status)}</td></tr>`)
    .join("");
  const pluginRows = Object.entries(snap.plugins || {})
    .map(([key, version]) => `<tr><td>${escapeHtml(key.replace(/@.*/, ""))}</td><td>${escapeHtml(version || "?")}</td></tr>`)
    .join("");

  const commit = snap.crisp?.commit || {};
  const gitBadge = (commit.unpushed || commit.unpulled)
    ? `<span class="badge warn">${commit.unpushed || 0} unpushed, ${commit.unpulled || 0} unpulled</span>`
    : `<span class="badge ok">up to date</span>`;
  const vaultBadge = (snap.vault?.uncommitted || snap.vault?.unpushed)
    ? `<span class="badge warn">${snap.vault.uncommitted} uncommitted, ${snap.vault.unpushed || 0} unpushed</span>`
    : `<span class="badge ok">clean</span>`;

  const driftCount = Object.values(snap.skills || {}).filter((s) => s !== "in-sync").length
    + Object.values(snap.agents || {}).filter((s) => s !== "in-sync").length;

  return `
  <section class="card">
    <header>
      <h2>${escapeHtml(snap.host)}</h2>
      <span class="platform">${escapeHtml(snap.platform || "")}</span>
      ${driftCount ? `<span class="badge bad">${driftCount} drift</span>` : `<span class="badge ok">no drift</span>`}
    </header>
    <div class="meta">
      <div><span class="label">CRISP</span> v${escapeHtml(snap.crisp?.version || "?")} @ ${escapeHtml(commit.hash || "?")} ${gitBadge}</div>
      <div><span class="label">Vault</span> ${vaultBadge}</div>
      <div><span class="label">Snapshot</span> ${escapeHtml(snap.generatedAt || "")}</div>
    </div>
    <div class="grid">
      <div>
        <h3>Skills</h3>
        <table>${skillRows || "<tr><td>none</td></tr>"}</table>
      </div>
      <div>
        <h3>Agents</h3>
        <table>${agentRows || "<tr><td>none</td></tr>"}</table>
      </div>
      <div>
        <h3>Plugins</h3>
        <table>${pluginRows || "<tr><td>none</td></tr>"}</table>
      </div>
    </div>
  </section>`;
}

function generateDashboardHtml(snapshots) {
  const cards = snapshots.map(renderMachineCard).join("\n");
  const staleCutoffMs = 14 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const staleHosts = snapshots.filter((s) => {
    const t = Date.parse(s.generatedAt || "");
    return !isNaN(t) && now - t > staleCutoffMs;
  }).map((s) => s.host);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CRISP machines</title>
<style>
  :root {
    --bg: #ffffff; --fg: #1a1a1a; --muted: #6b7280; --border: #e5e7eb;
    --ok-bg: #dcfce7; --ok-fg: #166534;
    --warn-bg: #fef3c7; --warn-fg: #92400e;
    --bad-bg: #fee2e2; --bad-fg: #991b1b;
    --card-bg: #f9fafb;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1115; --fg: #e5e7eb; --muted: #9ca3af; --border: #2a2e37;
      --ok-bg: #14301f; --ok-fg: #86efac;
      --warn-bg: #3a2e0a; --warn-fg: #fcd34d;
      --bad-bg: #3a1414; --bad-fg: #fca5a5;
      --card-bg: #161922;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px 16px; background: var(--bg); color: var(--fg);
    font: 14px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif;
  }
  .wrap { max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .subtitle { color: var(--muted); margin: 0 0 20px; font-size: 13px; }
  .stale-warning {
    background: var(--warn-bg); color: var(--warn-fg); padding: 10px 14px;
    border-radius: 8px; margin-bottom: 20px; font-size: 13px;
  }
  .card {
    background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px;
    padding: 18px 20px; margin-bottom: 16px;
  }
  .card header { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
  .card h2 { margin: 0; font-size: 16px; }
  .platform { color: var(--muted); font-size: 12px; }
  .meta { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; font-size: 13px; }
  .meta .label { color: var(--muted); display: inline-block; width: 70px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
  .grid h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 3px 0; border-bottom: 1px solid var(--border); }
  td:last-child { text-align: right; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px;
    font-weight: 600; white-space: nowrap;
  }
  .badge.ok { background: var(--ok-bg); color: var(--ok-fg); }
  .badge.warn { background: var(--warn-bg); color: var(--warn-fg); }
  .badge.bad { background: var(--bad-bg); color: var(--bad-fg); }
  .empty { color: var(--muted); padding: 40px 0; text-align: center; }
</style>
</head>
<body>
<div class="wrap">
  <h1>CRISP machines</h1>
  <p class="subtitle">Generated ${escapeHtml(new Date().toISOString())} — regenerate with <code>tea vault dashboard</code> (run automatically by <code>tea vault push</code>). Data is a snapshot from each machine's last push, not live.</p>
  ${staleHosts.length ? `<div class="stale-warning">Stale (no push in 14+ days): ${staleHosts.map(escapeHtml).join(", ")}</div>` : ""}
  ${cards || '<div class="empty">No machine snapshots yet — run <code>tea vault push</code> on a machine first.</div>'}
</div>
</body>
</html>`;
}

module.exports = { generateDashboardHtml };

# Third-Party Notices

CRISP integrates ideas, patterns, and (in two cases) actual vendored files from
other open-source projects. This file lists each one, its real upstream license
(verified via public search at the time of writing — re-check upstream if this
matters for your use case), and exactly what CRISP does with it: reimplement the
idea independently, or vendor the actual file.

| Dependency | Upstream | License | What CRISP ships |
|---|---|---|---|
| **RTK** | community (`cargo install rtk`) | **Not stated upstream** — no LICENSE file found. Installed as a separate binary, not vendored. | Nothing vendored — installer checks for it and prints `cargo install rtk`. |
| **Caveman** | [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) | **Split**: skill/CLI/SDK surfaces are MIT; the engine/proxy/MCP-server components are BSL-1.1 (source-available, converts to Apache-2.0 after 2030-06-21 or 4 years post-release). | Not vendored — `claude/skills/token-kit/SKILL.md` is CRISP's own independent behavior spec inspired by caveman's compression idea, no upstream code included. |
| **Headroom** | [headroomlabs-ai/headroom](https://github.com/headroomlabs-ai/headroom) | **Apache-2.0** | Not vendored — `claude/hooks/headroom_filter.py` is an independent ~50-line reimplementation of the compression pattern, no upstream code included. |
| **Lean Code Agent / Ponytail** | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | **MIT** | Not a literal copy — `claude/skills/lean-code-agent/` is a related community skill inspired by ponytail's "lazy senior developer" concept, independently written. |
| **Context-Engineer** | Assembled by CRISP | N/A — original | Original content. |
| **Graphify** | [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) | **MIT** (© Safi Shamsi) | **Vendored as-is** — `claude/skills/graphify/` is the actual upstream skill package. MIT license + copyright notice included at `claude/skills/graphify/LICENSE` per MIT's terms. |
| **TEA (token-efficient-agent-kit)** | Originally a private local repo by this project's author | **MIT** (this consolidation) | Vendored in full as `engine/` — this is the actual engine, not a reimplementation. |
| **Superpowers** | [obra/superpowers](https://github.com/obra/superpowers) | **MIT** (© Jesse Vincent) | **Not vendored.** It's a real plugin — 14 skills that cross-reference each other by namespace (`superpowers:brainstorming`, etc.) plus its own hooks — copying the files in flat would break both. `claude/skills/agent-orchestration/` is CRISP's own short, independently-written cheatsheet on a related but much narrower idea; it is explicitly *not* a substitute. Installer checks whether the real plugin is installed and prints the install command. |
| **Code Review (Anthropic)** | [anthropics/claude-code](https://github.com/anthropics/claude-code) `plugins/code-review/` | Part of the `claude-code` repo | Not vendored — it's Anthropic's own plugin, ships with Claude Code itself. Installer just checks it's available. |
| **Andrej Karpathy Skills** | [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) | **MIT** | Not vendored — another real plugin (own `.claude-plugin/` config). Installer checks for it and prints the install command; naming/marketplace has drifted across forks of this skill, verify against the repo's own README before relying on the exact command. |
| **Claude-Mem** | [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) | **Apache-2.0** (older releases used AGPL-3.0 — check the version you install) | Not vendored — it's a live plugin with its own MCP server + database; installer checks it's installed and prints the marketplace command. |

## What this means practically

- Only **Graphify** is a verbatim vendored copy of another project's licensed files — its MIT license+copyright is preserved at `claude/skills/graphify/LICENSE`.
- **Superpowers, Code Review, Andrej Karpathy Skills, and Claude-Mem are real Claude Code plugins** — namespaced skills and/or their own hooks that would break if copied in as flat files. CRISP documents and install-checks them (`install.ps1`/`install.sh`), it doesn't vendor them.
- Everything else CRISP ships is either fully original, or an independent reimplementation of a public *idea/pattern* (which isn't something copyright protects) rather than copied source.
- If you plan to redistribute CRISP further and want airtight compliance, re-verify each upstream license directly — projects change licenses over time (see Claude-Mem's history above as a concrete example).

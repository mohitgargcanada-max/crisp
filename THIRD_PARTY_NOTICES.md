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
| **Superpowers** | [obra/superpowers](https://github.com/obra/superpowers) | **MIT** | `claude/skills/superpowers/SKILL.md` adapts upstream patterns with project-specific additions — if you need the unmodified original, get it from the upstream repo/marketplace. |
| **Graphify** | [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) | **MIT** (© Safi Shamsi) | **Vendored as-is** — `claude/skills/graphify/` is the actual upstream skill package. MIT license + copyright notice included at `claude/skills/graphify/LICENSE` per MIT's terms. |
| **Claude-Mem** | [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) | **Apache-2.0** (older releases used AGPL-3.0 — check the version you install) | Not vendored — it's a live plugin with its own MCP server + database; installer checks it's installed and prints the marketplace command. |
| **TEA (token-efficient-agent-kit)** | Originally a private local repo by this project's author | **MIT** (this consolidation) | Vendored in full as `engine/` — this is the actual engine, not a reimplementation. |

## What this means practically

- Only **Graphify** is a verbatim vendored copy of another project's licensed files — its MIT license+copyright is preserved at `claude/skills/graphify/LICENSE`.
- Everything else CRISP ships is either fully original, or an independent reimplementation of a public *idea/pattern* (which isn't something copyright protects) rather than copied source.
- If you plan to redistribute CRISP further and want airtight compliance, re-verify each upstream license directly — projects change licenses over time (see Claude-Mem's history above as a concrete example).

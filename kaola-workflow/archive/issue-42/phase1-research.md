# Phase 1 - Research / Discovery: issue-42

## Deliverable
Remove `/workflow-next-pr` command and its Codex skill mirror. Replace the functionality with two mechanisms:
1. **Prompt-intent detection** at claim time — agent reads the user's initial prompt; if PR intent is detected, sets `KAOLA_SINK=pr` before the startup call (same `--sink pr` wire as before, now driven by NLU instead of a slash-command shim)
2. **Auto-fallback** at Phase 6 — if `sink: merge` is configured and the merge fails with a merge-impossible error (branch protection, non-fast-forward, permission denied), Phase 6 pivots to `sink: pr`, writes `sink_fallback_reason:` to `workflow-state.md`, and dispatches to `kaola-workflow-sink-pr.js`

## Why
Collapse 4 entry points (2 commands × 2 runtimes) to 1 without capability loss. Sink mode is a property of the work, not a property of the entry command. Phase 6 already reads `sink:` from state — intent capture and auto-fallback are the natural replacements.

## Affected Area

**Files to DELETE:**
- `commands/workflow-next-pr.md` (36 lines) — sets `KAOLA_SINK=pr`, delegates to `/workflow-next`
- `plugins/kaola-workflow/skills/kaola-workflow-next-pr/SKILL.md` (30 lines) — Codex equivalent

**Files to MODIFY:**
| File | Change |
|------|--------|
| `commands/workflow-next.md` L78, L91-100 | Add NLU intent detection block before startup |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` L72-73, L91-100 | Same NLU block |
| `scripts/kaola-workflow-sink-merge.js` L114, L134, L212, L219 | Add exit code 3 for merge-impossible failures |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | Byte-identical mirror |
| `scripts/kaola-workflow-claim.js` L712-724, L769-799 | `sink_fallback_reason` field in `buildSinkBlock()` / `updateSinkLease()` |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-identical mirror |
| `commands/kaola-workflow-phase6.md` L617-653 | Auto-fallback pivot on merge exit 3 |
| `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` L176-228 | Same auto-fallback pivot |
| `scripts/validate-workflow-contracts.js` L299-301 | Remove next-pr existence/line-count assertions |
| `scripts/validate-kaola-workflow-contracts.js` L73 | Remove `'kaola-workflow-next-pr'` from skills array |
| `README.md` L181, L414-418 | Remove skill listing, rewrite PR Sink Mode section |
| `scripts/simulate-workflow-walkthrough.js` ~L1253+ | Add Epic Case 18: branch-protection auto-fallback |
| `CHANGELOG.md` | Add [Unreleased] entry |

## Key Patterns Found

1. **KAOLA_SINK env→flag wire** (`commands/workflow-next.md:91-100`): `KAOLA_SINK_FLAG=""` then `[ -n "${KAOLA_SINK:-}" ] && KAOLA_SINK_FLAG="--sink $KAOLA_SINK"` — the wire exists, intent detection just sets `KAOLA_SINK` before this block
2. **buildSinkBlock / updateSinkLease** (`scripts/kaola-workflow-claim.js:712-799`): writes `## Sink` block fields to `workflow-state.md` — add optional `sink_fallback_reason:` field here
3. **Phase 6 dispatch** (`commands/kaola-workflow-phase6.md:617-653` and `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md:176-228`): two INDEPENDENT copies of sink dispatch; auto-fallback must be added to BOTH
4. **sink-merge.js exit codes** (`scripts/kaola-workflow-sink-merge.js:212,219`): exit 2=FF race, exit 1=generic failure — add exit 3 for merge-impossible; check stderr for `GH006`, `protected branch`, `non-fast-forward`, `permission denied`
5. **Script parity enforcement** (`scripts/validate-script-sync.js`): `kaola-workflow-sink-merge.js` and `kaola-workflow-claim.js` are in COMMON_SCRIPTS — changes must be byte-identical in both `scripts/` and `plugins/kaola-workflow/scripts/`
6. **Validator assertions** (`scripts/validate-workflow-contracts.js:299-301`): asserts `commands/workflow-next-pr.md` exists and ≤40 lines — remove these 3 lines
7. **Skill array** (`scripts/validate-kaola-workflow-contracts.js:73`): `'kaola-workflow-next-pr'` in array — remove one entry (no other count assertion to update separately, as the loop handles all skills in the array)

## Test Patterns
- Framework: hand-rolled `assert()`, no test framework
- Location: `scripts/simulate-workflow-walkthrough.js` (single file)
- Plugin mirror: `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` (byte-identical, not enforced by validate-script-sync.js)
- Structure: `// Epic Case N: description` top-level; `N[A-Z]` uppercase suffix for sub-cases
- Sink tests: Epic Case 2 (sink-merge offline), 3 (sink-merge success), 4 (FF race), 7/7A-7G (PR sink), 16G (worktree cleanup after merge)
- New tests needed: Epic Case 18 — branch-protection auto-fallback; also test transient failure does NOT pivot

## Config & Env
- `KAOLA_SINK` — env var; currently set only by `workflow-next-pr.md` / `kaola-workflow-next-pr/SKILL.md`; consumed by `workflow-next.md` / `kaola-workflow-next/SKILL.md` via `--sink` flag to startup
- `sink:` field in `## Sink` block of `workflow-state.md` — persisted at claim time
- `sink_fallback_reason:` field — new optional field in `## Sink` block (net-new design)
- Exit code 3 for `kaola-workflow-sink-merge.js` — merge-impossible failures (net-new)

## External Docs
N/A — no external library/API behavior needed; all changes are to internal scripts and skill markdown files.

## GitHub Issue
KaolaBrother/Kaola-Workflow#42

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | Internal patterns only; no external API/library behavior needed | |

## Notes / Future Considerations
- **Dual-copy dispatch is the primary consistency risk**: auto-fallback must be added to BOTH `commands/kaola-workflow-phase6.md` and `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` — these are independent prose files, not shared scripts
- **NLU intent detection has no existing precedent** — the Phase 3 plan must define canonical PR-intent keywords list
- **plugin.json is directory-based** (`"skills": "./skills/"`) — deleting `kaola-workflow-next-pr/` directory requires no plugin.json change
- `cross-machine-followups/phase2-ideation.md` may reference `kaola-workflow-next-pr` — check in Phase 3 and update if needed

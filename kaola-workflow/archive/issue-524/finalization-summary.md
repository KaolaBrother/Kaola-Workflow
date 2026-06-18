# Finalization - Summary: issue-524

## Delivered
Priority-first ranking for the `issue-scout` agent (bug #524). The scout now ranks
candidate issues by roadmap **priority/drive-order** first — extracting the
`### Project rules` guardrails and master-epic drive-order (the `Next Step` column /
`next_step:` ordering emitted by `kaola-workflow-roadmap.js`) as a priority signal —
then scope-cohesion, then actionability as a **within-tier tiebreak only**. A documented
"X must not preempt frontier Y" guardrail is honored as a hard constraint; a genuinely
blocked top-priority frontier is surfaced explicitly ("frontier blocked because…")
instead of a silent "actionable proxy" substitution; and a new required `priority_basis`
output field reconciles the pick against the roadmap. Mirrored identically across all 4
byte-coupled scout editions.

## Files Changed
- `agents/issue-scout.md` — priority-first ranking prose (root/github edition)
- `plugins/kaola-workflow/agents/issue-scout.toml` — mirror (codex)
- `plugins/kaola-workflow-gitlab/agents/issue-scout.toml` — mirror (forge-neutral)
- `plugins/kaola-workflow-gitea/agents/issue-scout.toml` — mirror (forge-neutral)
- `CHANGELOG.md` — `[Unreleased]` → `### Fixed` entry (#524)
- `docs/decisions/D-524-01.md` — new ADR

Impl commit: `02345094` (`fix(scout): rank by roadmap priority/drive-order before cohesion (#524)`).
The 3 `.toml` ports are byte-identical (md5 `b62eef3bf1bd292d11c3188b0dfd22de`).

## Test Coverage
N/A by change type — pure agent-instruction prose (the scout's ranking objective lives
in the dispatched LLM agent's reasoning, not a code path). No contract validator pins
scout prose content; there is no meaningful failing unit test for "ranks priority-first."
The binding walls are cross-edition parity + the four `npm` chains (both green below).

## Final Validation Evidence
- **Four-chain gate (#307, cross-edition diff):** `kaola-workflow-run-chains.js` → all four green,
  receipt `headSha 02345094` == HEAD, `workTreeHash: clean`, 0 non-waived red.
  - claude exit 0 (586s) · codex exit 0 (16s) · gitlab exit 0 (191s) · gitea exit 0 (197s)
  - Evidence: `.cache/chain-receipt.json`
- **Adaptive barrier (script-enforced):** `--resume-check` / `--gate-verify` / `--barrier-check` /
  `--verdict-check` all exit 0.
- **n3-review gate (G1):** `verdict: pass`, `findings_blocking: 0` (`.cache/n3-review.md`).
- Validation reuse covers code/test impact through node n4; the finalize-node has no further
  code/test edits (the chain run was against the final impl commit `02345094`).

## Documentation Docking
DOCKED — `.cache/doc-docking.md`. Docs touched: `CHANGELOG.md` + `docs/decisions/D-524-01.md`.
No-impact classes (README / architecture / api / conventions / .env.example / API-schema)
explicitly reasoned: the scout's documented role-level contract (read-only, advisory,
recommends same-scope sets) is unchanged; ranking is internal reasoning prose; `priority_basis`
is captured in the ADR + CHANGELOG.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
None. n3-review recorded 0 blocking findings; no node was reopened or repaired.

## Closure Decision
None needed — no deferred items, unresolved conflicts, partial implementation, open review
follow-ups, or user-decision items across the node ledger / evidence. #524 fully satisfied;
issue closes on sink.

## Commit And Push
Pending final Git gate (contractor `chore: finalize` commit + `--sink` merge). Final hash
reported after push.

## GitHub Issue
#524 — to be closed on sink (acceptance criteria pass; full close, not keep-open).

## Roadmap
Updated yes — `cmdFinalize` removes `.roadmap/issue-524.md` and regenerates `ROADMAP.md` at closure.

## Archive
Pending — `cmdFinalize` archives `kaola-workflow/issue-524/` → `kaola-workflow/archive/issue-524/`.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/n4-docs.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | — | no validation failures |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md (regen at cmdFinalize) | |
| archive completed folder | pending | | |
| final commit and push | ready | git status / chain-receipt / four chains green | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE

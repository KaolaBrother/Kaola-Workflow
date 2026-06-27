# Finalization - Summary: issue-571

## Delivered
Codex agent **profiles** are now global by default (`~/.codex`), achieving Claude-edition "install once, every repo" parity (hooks were already global, #447). Three coordinated changes:
1. Installer `--global` flag (targets `os.homedir()/.codex`, position-robust); positional `projectRoot` form retained as an optional project-local override.
2. Preflight gate `kaola-workflow-codex-preflight.js` accepts **either** a fresh global `~/.codex` scope OR a valid project scope, and **fails closed when neither is valid** (global-first short-circuit; `scopeIsFresh = s.exists && !scopeIsStale(s)`; autofix still targets project-local only).
3. The 3 Codex init SKILLs are scaffolding-only (drop the per-repo `"$PWD"` agent mandate → one-time `--global` install).

## Files Changed
20 tracked files (+ new ADR): preflight ×4, installer ×3, codex walkthrough + 2 forge test-scripts, `test-install-model-rendering.js`, init `commands/workflow-init.md` ×3 + `skills/.../SKILL.md` ×3, 3 contract validators, README.md, docs/architecture.md, docs/api.md, CHANGELOG.md, and new `docs/decisions/D-571-01.md`.

## Test Coverage
New RED-first preflight tests (global-only ⇒ PASS scope:'global'; neither scope ⇒ FAIL CLOSED; stale global ⇒ no short-circuit; `--global` e2e) added to the codex walkthrough + 2 forge test-scripts. Existing preflight tests retrofitted with hermetic temp `HOME`. No coverage % tool in this repo (hand-rolled assert suites); the four edition chains are the coverage gate.

## Final Validation Evidence
- Four edition chains (self-host #307): `kaola-workflow-run-chains.js --project issue-571` → all green. Receipt `.cache/chain-receipt.json` (completedAt 2026-06-27T09:13:25Z): claude exit 0, codex exit 0, gitlab exit 0, gitea exit 0; `accepted_red:false` all. Re-run after the CHANGELOG write so the receipt's codeTreeHash covers the final tree.
- Adaptive barrier (script-enforced): `--resume-check`=0, `--gate-verify`=0, `--barrier-check`=0, `--verdict-check`=0.
- `simulate-workflow-walkthrough.js` green (claude chain).
- Validation reuse boundary: the four-chain receipt covers the full code+test+docs tree through n8's CHANGELOG write; the contractor's archive/roadmap/commit steps that follow touch only inert workflow-state/docs and are outside the rerun trigger (#324).

## Documentation Docking
DOCKED — evidence `.cache/doc-docking.md`. README/architecture/api/ADR (n7) + CHANGELOG (n8); `.env.example` N/A (no new env vars).

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
None. n5's autofix-ON clarification is the pre-existing #266/#332 contract (not a defect); n6's R1/R2 were resolved/nit. No CRITICAL/HIGH findings remain.

## Run gaps
(sweep empty — `sweptClasses: []`; no in-run repairs, deferred chains, or flakes.)

## Closure Decision
None needed. Scanned all node evidence + the G1 review: no deferred items, unresolved conflicts, partial implementation, or user-decision items. Issue #571 is fully implemented; acceptance criteria met.

## Commit And Push
Pending final Git gate (contractor commit + merge sink).

## GitHub Issue
#571 — to be closed by the merge sink after commit.

## Roadmap
To be refreshed by `cmdFinalize` (rm `.roadmap/issue-571.md` if present + regenerate ROADMAP.md).

## Archive
Pending — `cmdFinalize` archives `kaola-workflow/issue-571/` → `kaola-workflow/archive/issue-571/`.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1) | subagent-invoked | .cache/n1-architect.md | |
| tdd-guide (n2) | subagent-invoked | .cache/n2-engine.md | |
| implementer (n3) | subagent-invoked | .cache/n3-init.md | |
| implementer (n4) | subagent-invoked | .cache/n4-contracts.md | |
| adversarial-verifier (n5) | subagent-invoked | .cache/n5-adversarial.md (verdict: pass, findings_blocking: 0) | |
| code-reviewer G1 (n6) | subagent-invoked | .cache/n6-review.md (verdict: pass, findings_blocking: 0) | |
| doc-updater (n7) | subagent-invoked | .cache/n7-docs.md | |
| finalize (n8) | main-session-direct | .cache/n8-finalize.md | sink is non-delegable |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | — | no failures to route |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | contractor Step 7 |
| archive completed folder | pending | | cmdFinalize Step 8b |
| final commit and push | ready | git status/upstream | final gate after this file |

## Status
ARCHIVED AFTER FINAL GIT GATE

# Finalization - Summary: issue-512

## Delivered
Parameterized the run-chains per-chain `spawnSync` kill timeout (#512). A new exported pure
helper `resolveTimeoutMs(env)` reads `KAOLA_RUN_CHAINS_TIMEOUT_MS` and returns it when it parses
to a positive integer, else the **900000** ms (15 min) default (raised from the prior hardcoded
`600000`); non-numeric/zero/negative fall back to the default; no upper clamp. Wired into the
`spawnSync` `timeout:` at `:272`. Applied byte-identically across all four editions; receipt
schema unchanged. The "speed up the chain" alternative was deferred (root cause unconfirmed) per
`docs/decisions/D-512-01.md` — the cheapest-sufficient capture fix.

## Files Changed
- scripts/kaola-workflow-run-chains.js
- plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js (byte-identical codex twin)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js (rename-normalized)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js (rename-normalized)
- scripts/test-run-chains.js (T12 unit coverage)
- docs/api.md, README.md, .env.example, docs/decisions/D-512-01.md (n2-docs)
- CHANGELOG.md (n4-finalize sink)

## Test Coverage
RED→GREEN unit coverage added in scripts/test-run-chains.js (T12): default→900000, valid
override→value, invalid/zero/negative→default. `node scripts/test-run-chains.js` → 54 assertions,
exit 0. `node scripts/validate-script-sync.js` → exit 0 (four-edition family in lockstep).

## Final Validation Evidence
Chain receipt (.cache/chain-receipt.json @ HEAD 6037050f) — all four chains green, no waivers:
- claude exit 0, **605120 ms** (note: this exceeds the OLD 600000 ms ceiling — it would have been
  false-killed before the fix; captured green under the new 900000 default — live dogfood of #512)
- codex exit 0 (15343 ms), gitlab exit 0 (175348 ms), gitea exit 0 (178120 ms)
Finalize gates: `--resume-check`=0, `--gate-verify`=0, `--barrier-check`=0, `--verdict-check`=0,
`--finalize-check`=pass (chain-receipt mode, no `--accept-known-red`).

## Documentation Docking
DOCKED — .cache/doc-docking.md

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
- Speed-up-the-chain track deferred (D-512-01): root cause of the ~600s claude-chain runtime is
  not yet confirmed (genuine suite growth vs. environment). Recorded as a documented decision, not
  an unfiled defect; the owner can reopen the speed-up track if they disagree.

## Run gaps
(gap-sweep swept 0 classes — no waived chains, no deferred reviewer findings, no reopens)

## Closure Decision
Close #512. Acceptance criteria met: the chain-receipt gate now captures a passing-but-slow chain
(605s) green without a waiver — the exact failure #512 reported is resolved and verified by dogfood.

## Commit And Push
[pending final Git gate; final hash reported after push]

## GitHub Issue
close (#512)

## Roadmap
updated (closure removes .roadmap/issue-512.md + regenerates ROADMAP.md at cmdFinalize)

## Archive
pending (cmdFinalize Step 8b)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| workflow-planner (claim + author + freeze) | invoked | workflow-plan.md (plan_hash) | |
| tdd-guide (n1-impl) | invoked | .cache/n1-impl.md | |
| doc-updater (n2-docs) | invoked | .cache/n2-docs.md | |
| code-reviewer (n3-review G1 gate) | invoked | .cache/n3-review.md (verdict: pass) | |
| finalize sink (n4-finalize) | main-session-direct | .cache/n4-finalize.md | non-delegable per plan-run contract |
| documentation docking | invoked | .cache/doc-docking.md | |
| chain receipt | invoked | .cache/chain-receipt.json (4 green) | |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | runs at cmdFinalize |
| archive completed folder | pending | | cmdFinalize Step 8b |
| final commit and push | ready | | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE

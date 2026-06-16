# Finalization - Summary: bundle-513-514

Bundle (all-or-nothing): closes #513 and #514 in one sink.

## Delivered

- **#513** — adaptive: a speculative-open authoring rubric in the `workflow-planner` profile. Teaches the
  planner WHEN to set `## Meta: speculative_open_policy: consent` (a read-only node whose sole unsatisfied
  predecessor is an in-progress, high-probability-pass gate → the executor overlaps it via
  `open-ready --speculative-consent`, verdict:fail rollback). Authoring-only; the #500 mechanism is
  untouched. Meta-key-only control (INV-17, never a hand-added `speculative: true`). Worked in-grammar
  example added. Machine-enforced by a `test-agent-profile-parity.js` needle across all three `.toml` twins
  (parity 15→18).
- **#514** — two cosmetic comment nits from the #500 build review: (R1) reworded the stale "until Slice 3"
  fragment in `adaptive-node.js` (×4 editions; Slice 3 shipped, #463 AC18); (R2) fixed the T9 block-header
  comment `PIN:`→`CARD:` in `test-route-reachability.js` (assert was already correct, unchanged). Comment-only.

## Files Changed

#513 (6): `agents/workflow-planner.md`, `plugins/kaola-workflow/agents/workflow-planner.toml`,
`plugins/kaola-workflow-gitlab/agents/workflow-planner.toml`, `plugins/kaola-workflow-gitea/agents/workflow-planner.toml`,
`scripts/test-agent-profile-parity.js`, `docs/plan-run-cards/speculative-open.md`.
#514 (5): `scripts/kaola-workflow-adaptive-node.js` + the 3 forge ports (`plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js`,
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js`,
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js`), `scripts/test-route-reachability.js`.
Docs (3): `CHANGELOG.md`, `docs/decisions/D-513-01.md`, `docs/decisions/D-514-01.md`.

## Test Coverage

Cross-edition diff (#307: adaptive-node.js ×4, planner `.toml` twins, route-reachability, edition-sync) →
all four chains run sequentially. Node-level: `test-agent-profile-parity.js` 15→18 (needle load-bearing),
`test-route-reachability.js` 146, `test-edition-sync.js` 29 (4-edition byte parity).

## Final Validation Evidence

All four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green (sequential). Standalone
claude chain ran ~222s this session (well under run-chains' 600s ceiling — the #512 slow-chain condition
did not bite). HEAD-bound `.cache/chain-receipt.json` produced by `run-chains.js` over the final commit.

## Documentation Docking

CHANGELOG [Unreleased] (#513 under Changed, #514 under Fixed); D-513-01 + D-514-01 decision records;
speculative-open card § Authoring. No README/api/schema change (agent-profile rubric + comments only).

## Final Validation Failure Ledger

None — no failing chains; no blocking review findings.

## Follow-Up Items

None opened.

## Run gaps

- **n4 review LOW nit (non-blocking)** — the reworded R1 comment ends `...Slice 3, #463 AC18))`; the doubled
  `))` is paren-balanced and correct (inner closes the new parenthetical, outer closes an earlier
  `scheduler (`), just visually dense. `noise: cosmetic paren density in a comment — paren-balanced and
  correct, not worth a follow-up issue.`
- **n1 evidence-path correction (in-run, recovered)** — the #513 implementer first wrote node evidence to the
  worktree-root `.cache/` (non-exempt) instead of the project-qualified `kaola-workflow/{project}/.cache/`,
  tripping a `write_set_overflow` barrier; corrected by relocating the evidence to the canonical path.
  `noise: subagent path mis-resolution, corrected in-run; not a product defect (the executor's own
  open-next/record-evidence resolve the project-qualified path correctly).`

## Closure Decision

CLOSE both #513 and #514. Acceptance met: #513 ships the authoring rubric + worked example + parity needle
(its stated scope; no live makespan probe is required — the rubric is the deliverable, recorded in D-513-01);
#514 both nits fixed, comment-only, all chains green. No deferred scope, no unresolved decisions.

## Required Agent Compliance

- n1 implementer (#513) — complete, evidence recorded.
- n2 implementer (#514) — complete, evidence recorded.
- n3 code-reviewer (#513, opus) — verdict: pass, findings_blocking: 0.
- n4 code-reviewer (#514, sonnet) — verdict: pass, findings_blocking: 0.
- n5 doc-updater — complete, evidence recorded.
- n6 finalize — this step.

## Status

Ready to sink (merge → close #513 + #514 → archive → regenerate ROADMAP once).

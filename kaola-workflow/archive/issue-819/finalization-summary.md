# Finalization Summary — issue-819

project: issue-819
issue: #819 — capability_gap recovery is unreachable
branch: workflow/issue-819
plan_hash: ef3c23fdae2135702f2fe272edb08865e8d70bfa1be8fb7a97c496574ea51915
candidate: 0ae1ed7e742eddaa049b66c263033fda6318f3c5

## Delivered

`substitute-role` — the workflow's mechanical, no-consent escape hatch from a `capability_gap` — had
**no reachable success path on any node that had been opened**, so every gap degraded to a consent
halt regardless of how good an in-kind substitute was available. Two independent seams are repaired:

1. **The P5 guard.** `hasEvidenceBodyBelowHeader` treated the opener's own seed scaffold as a
   recorded body, because `seedEvidenceFile` writes a `<!-- token: paste token here -->` guidance
   comment above every stub token and the predicate's value-check regex does not match a comment
   line. A new three-way `classifyEvidenceBody` (`seeded` / `capability_gap` / `deliverable`)
   distinguishes them, and the predicate now treats a whole-line HTML comment as not-a-body —
   anchored at both ends, so a line that merely starts with a comment and then carries prose still
   counts as a body. P5 still refuses a swap on a genuine deliverable.
2. **The frozen task identity.** `codexTaskNameForNode` derived the Codex task name from the plan's
   frozen `role`, so a substituted node re-presented an identity the runtime had already consumed
   and the spawn was rejected outright. Identity now derives from the card's effective
   `agent_type`; a node with no substitution on record produces a byte-identical dispatch card.

Also adds `substitute_self_noop` (checked at P0, ahead of the idempotent-replay branch) and
`substitute_evidence_reset_failed`. The evidence reset is owned atomically by the subcommand via the
existing binding-preserving `seedEvidenceFile(..., forceRotate=true)` primitive, so no step in the
recovery path requires hand-patching a nonce-bound artifact. `delegation_outcome: capability_gap`
deliberately remains outside the close-time vocabulary — read at substitute time, never admitted at
close.

## Files Changed

16 files, +1689 / −139 against run base `8d881aaf`:

| Area | Files |
| --- | --- |
| Behaviour (4 editions) | `scripts/kaola-workflow-adaptive-node.js` + the codex byte-copy and the gitlab/gitea rendered ports (+183 each) |
| Tests (separate custody) | `scripts/test-adaptive-node.js` (+657) |
| Routing contract | `templates/routing/plan-run.skeleton.md`, `templates/routing/required-blocks.js`, and the six rendered `kaola-workflow-plan-run` surfaces (+28 each) |
| Docs | `docs/api.md`, `CHANGELOG.md`, `docs/decisions/D-819-01.md` (new, 198 lines) |

## Test Coverage

`scripts/test-adaptive-node.js`: 420 scenarios / 3553 assertions, exit 0 unsharded. Baseline before
the fix on the same worktree: 420 scenarios / 3504 passed / **41 failed**, every failure
`#819-`-prefixed — the suite was authored RED by `n3-tests` in separate custody before the
production code existed, and `n4-scripts` never touched the test file.

Coverage is **mutation-proven, not merely green**. `n7-falsify` rebuilt the probe from scratch in an
isolated copy and drove the shipped assertions: **18 mutations applied, 18 killed, zero survivors**
(12 reproducing `n4`'s own table, 6 added independently). The T3b tolerance was separately attacked
with 24 adversarial bodies.

Note recorded by `n1-surface` and confirmed by `n8`: the claude fast gate runs this file at
`--shard auto/12`, so the chains alone do **not** execute the new coverage. Every verification run
was explicitly unsharded (`index 1 of 1`).

## Final Validation Evidence

`.cache/chain-receipt.json` — headSha `0ae1ed7e`, `workTreeHash: clean`, scope `all-four` via
`edition_coupling`, base `8d881aaf`:

| chain | exit | attempts | accepted_red | duration |
| --- | --- | --- | --- | --- |
| claude | 0 | 1 | false | 188s |
| codex | 0 | 1 | false | 17s |
| gitlab | 0 | 1 | false | 88s |
| gitea | 0 | 1 | false | 86s |

All four required (edition-touching diff — three plugin trees modified). No retries, no timeouts, no
accepted-red waivers. Each forge chain independently reports `all 30 surfaces byte-match the
skeleton`, which is direct evidence the six routing surfaces were regenerated rather than hand-edited.

Adaptive barrier: `resume=0 gate=0 barrier=0 verdict=0`.

## Documentation Docking

`DOCKED` — see `.cache/doc-docking.md`. `n6-docs` was the in-plan `doc-updater` node; it verified
every documented name against the shipped diff rather than the spec (the two diverged during this
run) and corrected two pre-existing stale `SPLIT_GUARDED_SUBCOMMANDS` catalogs in `docs/api.md`.
README / architecture / `.env.example` recorded as no-impact with reasons.

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
| --- | --- | --- | --- | --- |
| — | — | — | — | No final-validation failure occurred. All four chains passed on first attempt against the certified candidate. |

## Acceptance Check

| Item | Verdict | What satisfies it |
| --- | --- | --- |
| A1 — gap body does not block the swap; P5 still refuses a deliverable; distinction structural | PASS | `classifyEvidenceBody` three-way classifier; gap arm requires a typed column-0 marker AND no non-empty value for any content-bearing token in the role's own registry row — a value check, not a prose match. `n8` drove the real `seedEvidenceFile` output: seed → `seeded`, both marker forms → `capability_gap`, real content → `deliverable` (refuses). |
| A2 — no hand-patch of a nonce-bound artifact; reset atomic and subcommand-owned | PASS | Reset reuses `seedEvidenceFile(..., forceRotate=true)` (tmp+fsync+rename); binding nonce PRESERVED, not rotated, so evidence still closes against the same barrier baseline. `substitute_evidence_reset_failed` covers both failure modes and records nothing. Mutations M7, M9, M10, M12, M13, M13r all killed. |
| A3 — substituted node dispatchable; identity fresh and replay-stable; unsubstituted card byte-unchanged | PASS | Identity derives from effective `agent_type`. Byte-identity independently verified by `n4` (293 comparisons across 18 roles × 3 tiers × 4 contexts, 0 mismatches) and re-verified by `n7`. The unowned pin `simulate-workflow-walkthrough.js:21452` (`codex_task_name === 'n1_tdd_guide'`) stays green — it is in no write set, so a moved base derivation would have been a write-set overflow. Mutations M6, M17 killed. |
| A4 — self-substitution refused, not recorded | PASS | `substitute_self_noop` at P0, ahead of the idempotent-replay branch (ordering matters: the replay branch previously returned `ok`). Mutations M5, M8 killed. |
| A5 — coverage mutation-proven, not merely green | PASS | 18/18 mutations killed by `n7` in an isolated rebuild driving the shipped assertions; `n4`'s 12 reproduced. |
| A6 — all four editions + all six routing surfaces; validation green across four sequential chains | PASS | `edition-sync --check` = 0, `validate-script-sync` = 0, `generate-routing-surfaces --check` = 0 (30/30 byte-match) on every forge chain. Four-chain receipt above. Forge-neutrality `--forbidden-only` clean on all touched `plugins/` files. |

## Run gaps

- manual:parallel-write (a lane group's per-leg commit sweeps `kaola-workflow/{project}/.cache/node-timings.jsonl` into each leg branch. Both legs ADD it independently, so the group octopus merge always fails add/add on that path even when every real write set is disjoint. The group-stub commit tracks only the evidence seeds, so committing run telemetry per-leg is the deviation. Observed on group lg-n3-tests-n5-prose; repaired by hand (git rm on both leg branches) after 3 close-node refusals.): filed: #820
- manual:parallel-write (`close-node` appends `leg_committed` telemetry to the PARENT worktree copy of node-timings.jsonl before it runs the octopus merge, so an untracked parent copy blocks the fast-forward. Combined with the gap above, a multi-member lane group cannot self-reconcile without operator repair.): filed: #820
- manual:evidence-transport (for a lane-group member the authoritative evidence artifact is the LEG's `kaola-workflow/{project}/.cache/{node}.md`, not the parent worktree's. The dispatch card exposes `leg_path` but its `evidence_file` is a bare relative path, so an orchestrator that hands an agent an absolute parent path gets `evidence_shape_failed` at close with the deliverable stranded. `record-evidence --stdin` resolves the target by cwd, which is what makes the repair possible but is undocumented at the card.): filed: #821
- manual:forward-compat-latent-unreachable-on-the-shipped-library (`classifyEvidenceBody`'s anti-forgery conjunct is VACUOUS for any role with no `ROLE_TOKEN_REGISTRY` row (`workflow-planner`, `finalize`, `expansion-point`): a marker-bearing body would classify `capability_gap` regardless of content. Unreachable today because P2 admits only `kind: producer` and all five producers carry a content token. It becomes reachable the moment `SUBSTITUTABLE_KINDS` widens, which the design record explicitly anticipates as a future change. Found by the change gate; ruled non-blocking for this candidate.): filed: #822
- manual:docs-imprecision-non-blocking-in-this-run-s-own-new-docs (`CHANGELOG.md` and `docs/decisions/D-819-01.md` both say the seed comment is written "for all 15 roles in the manifest"; `ROLE_CAPABILITY_MANIFEST` has 18 entries (15 agent roles + 3 `kind: built-in`) and the measured behaviour covers all 18. It understates rather than misleads, and neither file is an agent-facing prompt surface, so it was not worth reopening a closed node to correct.): filed: #823
- manual:pre-existing-docs-wording-untouched-by-this-diff (`docs/api.md`'s `worktree_authority_split` roster says `record-evidence --stdin`, but the code exempts only `record-evidence --verify`, so a bare `record-evidence` is guarded too.): filed: #823

## Follow-Up Items

- #820 — lane-group barrier cannot self-reconcile; blocks every multi-member group, not just this run.
- #821 — leg/parent evidence path ambiguity; strands a complete deliverable at close time.
- #822 — latent forward-compat hole, reachable only if `SUBSTITUTABLE_KINDS` widens.
- #823 — two documentation-accuracy items.

## Closure Decision

CLOSE. Acceptance A1–A6 all pass; both gates returned clean (`n7-falsify` `not_refuted` /
`findings_blocking: 0`; `n8-code-certify` `approved` / `findings_none`). No deferred work, no
partial implementation, no unresolved review follow-up, and no user-decision item remains inside the
scope of #819. Every run-discovered defect is filed above rather than absorbed.

Scan of node evidence for deferrals: `n2-mechanism` §7 named three residuals — all are captured in
the Run gaps section (#822, #823) or were adjudicated in scope and implemented (the T3b repair).
`n2` did **not** report that role-profile prose must change; it explicitly declined to invoke the
stop-and-expand clause, because the classifier accepts both typed markers and is fail-closed.

## GitHub Issue

#819 — to be closed by the sink (`--issue 819`). Verify state is CLOSED after the sink, not merely
that the command exited 0.

## Roadmap

`.roadmap/issue-819.md` removed and `kaola-workflow/ROADMAP.md` regenerated once, by the finalize
transaction.

## Archive

`kaola-workflow/issue-819/` archived by the finalize transaction.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
| --- | --- | --- | --- |
| doc-updater | invoked | `.cache/n6-docs.md` (in-plan `n6-docs` node, role `doc-updater`) | — |
| documentation docking | invoked | `.cache/doc-docking.md` — verdict `DOCKED` | — |
| final-validation fix executors | N/A | No final-validation failure occurred | Nothing to route |
| roadmap refresh | ready | Owned by the finalize transaction (Step 8b) | — |
| archive completed folder | ready | Owned by the finalize transaction (Step 8b) | — |
| final commit and push | ready | Sink transaction | — |

## Status: ARCHIVED AFTER FINAL GIT GATE

## Attestation
claim_planner_attested: attested

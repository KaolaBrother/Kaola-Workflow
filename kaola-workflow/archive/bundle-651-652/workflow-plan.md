# Adaptive Workflow Plan - bundle-651-652

<!-- plan_hash: d8bdf05cb3f970f463d1bb0906fcc75f4d2627fb69dcebc947fe6f1c3ba4b9cc -->

Close the two 2026-07-10 post-ship-audit findings as one same-scope bundle: a mechanical pre-tag
release gate (check-only `--release-check` beside `--finalize-check`, refusing on a missing, red,
stale, or waived four-chain receipt at the release-candidate sha, wired into the documented release
flow) for issue 651, and the two strictness-lock test gaps (bare-token negative controls + merge-diff
filter narrowing to the production band) for issue 652.

## Meta

labels:
validation_command: npm test
validation_test_consumes: docs/conventions.md
speculative_open_policy: auto

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-release-gate | tdd-guide | - | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js, plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js | 7 | sequence | reasoning |
| n2-strictness-tests | tdd-guide | - | scripts/test-adaptive-node.js | 1 | sequence | standard |
| n3-review | code-reviewer | n1-release-gate, n2-strictness-tests | - | 1 | sequence | reasoning |
| n4-docs | doc-updater | n3-review | docs/conventions.md, docs/api.md, docs/decisions/D-651-01.md, README.md | 4 | sequence | standard |
| n5-adversarial | adversarial-verifier | n4-docs | - | 1 | sequence | reasoning |
| n6-finalize | finalize | n5-adversarial | CHANGELOG.md, kaola-workflow/ROADMAP.md | 2 | sequence | - |

## Node Briefs

### n1-release-gate

Issue 651 AC1 + AC3 + AC4. Add a check-only `--release-check` entry point to the canonical
`scripts/kaola-workflow-plan-validator.js`, then regenerate the codex twin and both forge-renamed
ports with `npm run sync:editions` (the validator is GENERATED edition class — all four files move in
this one node). Semantics: read `.cache/chain-receipt.json` (same receipt format `run-chains.js`
writes; reuse the `--finalize-check` reader and its precedence family, roughly plan-validator
lines 3096-3226: chains_unverified > chains_stale > chains_empty > chains_red) and REFUSE with a
structurally typed reason — never a string-matched decision — when: (a) no receipt / unparseable
receipt; (b) the receipt `headSha` does not EQUAL the release-candidate commit (default HEAD; accept
an explicit `--candidate <sha>`-style flag) — a `headSha` of `unknown`/missing is a refusal, never a
pass (note: `kaola-workflow-release.js`'s own `chainReceiptGreenness` treats `headSha === 'unknown'`
as green — the new gate must NOT copy that leniency); (c) `chains` empty or any chain red; (d) ANY
chain waived (`accepted_red`) — a waiver is legal at adaptive finalize but is a typed refusal for a
release tag (AC demands an UNWAIVED four-chain receipt; give it a distinct reason such as
`chains_waived`). The release gate pins strict headSha EQUALITY — do NOT substitute the
codeTreeHash content-addressed relaxation used by `--finalize-check`; a release tag names an exact
commit. On the sha-mismatch refusal, attach the existing hint-only culprit diagnostics
(`computeChainsStaleDiagnostics` / `attachChainsStaleDiagnostics`, ~line 2373) as `stale_paths` /
`stale_kind`; degrade to the generic refusal on uncertainty, exactly like `chains_stale` does today.
Success is a typed pass envelope. Self-owned only: no CI/CD coupling, no forge calls (AC4). Update
the usage block in the same file. TDD RED phase: author the AC3 walkthrough cases FIRST, in
`scripts/simulate-workflow-walkthrough.js` beside the existing `--finalize-check` receipt/chains_stale
blocks (the issue-648 cases are the pattern to sit next to): green unwaived receipt at candidate sha
passes; missing receipt refuses typed; receipt at an older sha refuses stale-style WITH culprit
hints; waived receipt refuses. Then implement to GREEN. Sequencing fact to verify during RED:
`npm test` enforces tag existence (skipped under `KAOLA_WORKFLOW_OFFLINE=1`), so confirm
`kaola-workflow-run-chains.js` can stamp a green receipt at the candidate sha BEFORE the tag exists —
the documented flow n4-docs writes depends on it (bump commit → run-chains receipt → release-check →
tag → online npm test → push). Scope guard: do NOT modify `kaola-workflow-release.js` — its `--cut`
deliberately does not hard-gate on the receipt (decision record D-632-01 (existing)); this issue
ships the check-only gate plus documented wiring, not a reversal of that decision. Focused
validation: `node scripts/simulate-workflow-walkthrough.js` and `npm run sync:editions` before
closing the node.

Repair scope (adversarial-gate findings, in-run write-set widening): (R2) `releaseCheck` must also
refuse — typed, in the documented precedence family — when the receipt's chain set does not cover
the full resolved chain set (the same self-owned `resolveChains`-style probe over `package.json`
that `--finalize-check` uses); an official `run-chains --chains <subset>` receipt must refuse, with
a walkthrough negative control locking it. (R1) The two forge-helpers suites
(`plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js`,
`plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js`) must be hermetic against an
ambient `KAOLA_WORKFLOW_OFFLINE=1` (they currently assume it unset except where they manage it
internally), so the documented pre-tag sequence — offline four-chain receipt at the untagged bump
commit, then `--release-check` — is executable end-to-end; re-walk the full sequence in a scratch
clone before closing.

### n2-strictness-tests

Issue 652, test-only, root `scripts/test-adaptive-node.js` exclusively — the `checkEvidenceShape`
matcher in `kaola-workflow-adaptive-node.js` (~lines 1072-1160) and the production
`isBarrierInvisible` band in the plan-validator (~lines 249-262) must NOT change. Gap 1: beside the
existing hollow-seed refusal controls (~:409-412 T6b-seed, ~:452-455 T7e-seed — empty `RED: ` /
`GREEN: ` values), add negative controls asserting that a BARE colon-less change-type token
(implementer body carrying e.g. `build-green` with no colon) refuses, and that bare `RED` / `GREEN`
token-name-only lines (tdd-guide body) refuse — each with the correct `missingTokenClass`. These
close the partial-weakening hole: a matcher that accepts bare tokens while still refusing empty
values must go red. Gap 2: narrow the four merge-diff equality filters (~:6378, :6862, :6970, :7043)
from `!s.startsWith('kaola-workflow/')` to the production band shape — project-scoped prefix
(`kaola-workflow/{project}/**` only), mirroring `isBarrierInvisible` — and add a red-first
cross-project-leak case: a synthetic leaked path under `kaola-workflow/other-project/**` must be
CAUGHT by the narrowed filters. RED discipline: land the leak case against the current broad filter
first and observe it slip through, then narrow and watch it bind. Validation:
`node scripts/test-adaptive-node.js` green, plus `node scripts/simulate-workflow-walkthrough.js`.
Claude chain only — no edition trees touched, no four-chain obligation from this node.

### n3-review

Gate over both implementation lanes together. Issue 651 lane: release-check refusal typing is
structural (typed `reason` field, no string matching anywhere), waived receipts refuse, headSha
equality is strict (no `unknown` pass-through, no codeTreeHash substitution), culprit diagnostics are
hint-only and the refusal decision is unchanged by their presence, all four generated validator
editions are byte-true regenerations (`npm run sync:editions` clean), walkthrough cases faithfully
cover the four AC3 outcomes, no CI/CD coupling, `kaola-workflow-release.js` untouched. Issue 652
lane: negative controls assert the correct `missingTokenClass` and would catch a partial matcher
weakening; the four filters match the production band shape; the cross-project-leak case is genuinely
red-first (verify the evidence shows it slipping through pre-narrowing); production files untouched.
Read both nodes' evidence files before verdict.

### n4-docs

Issue 651 AC2 + AC5. `docs/conventions.md` § Release / release-tag sequencing: wire the gate — the
tag step (both the manual tag sequencing bullets and the `kaola-workflow-release.js` cutting section)
runs the new plan-validator release check FIRST, and a red, missing, stale, or waived receipt is a
typed refusal, not a judgment call; state the working sequence (bump commit → run-chains receipt at
the candidate sha → release check → tag → online npm test → push), consistent with the
D-632-01 (existing) tag-before-test posture n1 verified. Record the release-commit hygiene rule
(AC5): a release/tag commit must not bundle unrelated behavior-changing code — version bump plus
release docs only; anything more re-runs the gate. `docs/api.md`: document the new flag and its typed
envelope beside the `--finalize-check` documentation. `docs/decisions/D-651-01.md`: record the
design — check-only gate in the plan-validator family, reuse of the receipt reader and stale-culprit
diagnostics, strict headSha equality, waived-receipt refusal, and the explicit non-reversal of
D-632-01 (existing). `README.md`: update the release checklist only if it names the tag step;
otherwise record skip-with-reason in evidence. `docs/conventions.md` is contract-validator-consumed
prose — after editing, run `node scripts/validate-workflow-contracts.js` to catch any pinned-needle
movement. Read n1's evidence file for the verified sequencing facts before writing. Keep all
agent-facing prompt surfaces untouched; provenance (issue refs, decision ids) is fine in docs/ and
CHANGELOG only.

### n5-adversarial

Refute the bundle against ALL acceptance criteria of both issues, docs included. Attack surfaces:
(1) fail-open paths in the release gate — craft a waived receipt, a receipt with `headSha: unknown`,
an empty `chains[]`, an unparseable receipt, a receipt at a parent sha — each must refuse typed;
(2) culprit-hint correctness on the stale refusal and graceful degradation on uncertainty;
(3) executability of the documented sequence — can a green receipt actually be stamped at the
candidate sha before the tag exists (tag-existence enforcement lives in npm test, not run-chains) —
walk it, don't assume it; (4) cross-edition drift — regenerated ports byte-match canonical;
(5) issue 652 — locally revert the filter narrowing and confirm the cross-project-leak case goes red
(the narrowing binds), and confirm a hypothetical bare-token-accepting matcher would trip the new
negative controls; (6) docs — the conventions.md wiring and hygiene rule actually satisfy AC2/AC5 and
the contract validators still pass. Run focused validation (walkthrough, test-adaptive-node,
sync:editions --check) where useful; record concrete evidence per finding.

### n6-finalize

Apply the CHANGELOG entries for both issues under [Unreleased], regenerate the roadmap (closure
removes the two backlog source files), then run the recorded validation command (`npm test`, all four
chains — the cross-edition obligation comes from n1's edition-tree diff) and stamp the chain receipt
LAST, after the final test-consumed prose edit (CHANGELOG and docs/conventions.md are test-consumed).
Run the finalize gate, close BOTH issues 651 and 652 (verify CLOSED state, not exit 0), push, sink,
and archive the workflow folder.

## Plan Notes

- **Bundle scope.** Issues 651 + 652 are the two 2026-07-10 post-ship-audit filings: one M-effort
  mechanical release gate, one S-effort test-strictness lock, adjacent in scope (the suites 652
  hardens are the regression surface around the machinery 651 extends). Disjoint write sets; n1 and
  n2 are an antichain and co-open in isolated legs under the default scheduler posture.
- **Model dispatch directive (session /goal).** Every node carrying `reasoning` in the model column
  (n1-release-gate, n3-review, n5-adversarial) dispatches with model=fable as a dispatch-time
  override; `fable` is not a plan-column token (the grammar admits only reasoning/standard), so the
  column stays in-grammar and the executor applies the override at Agent dispatch. Standard-tier
  nodes keep their install-profile dispatch.
- **Generated validator coupling.** `kaola-workflow-plan-validator.js` is a generated aggregator, so
  n1 declares the canonical script, the codex twin, and both forge-renamed ports in one node, plus
  the root walkthrough that carries the new release-check cases (the issue-648 shape).
- **Scope guard.** `kaola-workflow-release.js` is deliberately in NO write set: its `--cut` does not
  hard-gate on the chain receipt by decision D-632-01 (existing) — offline pre-cut runs before the
  online npm test that produces the receipt. Issue 651 ships a check-only gate plus documented
  wiring; any reversal of D-632-01 (existing) is a separate issue.
- **Speculative shaping.** n4-docs' sole dependency is the n3-review gate over two well-specified
  lanes, its write set is exact-path and carries no protected file (CHANGELOG stays on the sink), so
  it is speculative-open-eligible under the default auto policy.
- **Decision record numbering.** D-651-01 verified as the next free number on 2026-07-10 (no
  existing D-651-* / D-652-* anywhere in docs/ or CHANGELOG). No decision record for 652 — test-only.
- **Validation.** `validation_command: npm test` (four chains, sequential). Focused per-node checks:
  walkthrough + sync:editions for n1, test-adaptive-node + walkthrough for n2,
  validate-workflow-contracts for n4. `docs/conventions.md` is listed in `validation_test_consumes`
  because the contract validators read it (the five standing test-consumed prose files are already
  built into the validator's own list).

## Node Ledger

| id | status |
| --- | --- |
| n1-release-gate | complete |
| n2-strictness-tests | complete |
| n3-review | complete |
| n4-docs | complete |
| n5-adversarial | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-release-gate) | subagent-invoked | deferred_to_group | |
| tdd-guide (n2-strictness-tests) | subagent-invoked | group_passed | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review 0c046b9156ca | |
| doc-updater (n4-docs) | subagent-invoked | evidence-binding: n4-docs a180e722a236 | |
| adversarial-verifier (n5-adversarial) | subagent-invoked | evidence-binding: n5-adversarial b3fa5f4ba4ab | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize f074eece54ee | |

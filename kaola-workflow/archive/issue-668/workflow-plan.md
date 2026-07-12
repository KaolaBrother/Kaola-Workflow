# Workflow Plan — issue-668

<!-- plan_hash: 8eab4d3c445d48ed2dd0941c40a3dcfb046bcc34387a744ccf9385290dfa6a5d -->

## Meta
speculative_open_policy: auto
labels: workflow:in-progress
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

## Plan Notes

**Goal.** Three LOW, genuinely-independent test/doc-only hygiene items from the post-v6.22.1
audit (2026-07-12), each over a disjoint top-level directory:

- **Item 1 (claude-only test hardening).** `scripts/test-adaptive-node.js` — the #434-b repair
  harness carries a VACUOUS assertion: `assert(reviewerEvidence.includes('verdict: fail') &&
  reviewerEvidence.includes('findings_blocking: 1'), ...)` checks the LOCAL CONSTANT
  `reviewerEvidence` (defined a few lines above) against substrings it was literally built from,
  so it can never fail regardless of `runRepairNode` behavior. Rewrite it to assert on the
  OBSERVED output of `runRepairNode` so it becomes genuinely discriminating.
- **Item 2 (docs).** Neither `docs/conventions.md` (release sequencing) nor `docs/api.md` documents
  the `stale_release_receipt` refusal or its disposal step. Add ONE sentence to EACH: delete
  `.cache/release-receipt.jsonl` (and the stale `chain-receipt.json`) when starting the next
  release's `--prepare`. Also add the CHANGELOG `[Unreleased]` entry here (pre-finalize).
- **Item 3 (gitlab test, cross-edition).** `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
  — #659's clean-nonzero stderr-leak AC is met by construction (module-top hostile exit-97 glab
  shim + never-called sentinel) but has NO wired assertion on the classification OUTPUT text (the
  #659 evidence used a manual grep). Add ONE wired assertion that the classification result text
  carries no leaked stderr.

**Why this shape (compact, faithfully decomposed).** The three work items touch pairwise-disjoint
top-level directories — `scripts/` (n1), `docs/` + root `CHANGELOG.md` (n2), `plugins/` (n3) — with
no data dependency among them, so they form a `parallel_safe` write antichain that co-opens in
isolated legs by default (I add NO dep edge and NEVER hand-annotate `parallel_safe` — the validator
derives it). A single `code-reviewer` (n4) post-dominates the two code-producing test nodes (n1, n3)
to satisfy G1; the docs node (n2) is all-docs (`docs/*.md` + `CHANGELOG.md` all match `isDocsPath`)
so `producesCode()` is false and it needs no review — it joins directly at the sink. `n5-finalize`
is the unique sink and declares `—` (finalize may never carry a model).

**CHANGELOG placement — pre-finalize, NOT on the sink.** `CHANGELOG.md` is barrier-INVISIBLE (in
the allowband) but validation-VISIBLE (`isValidationInvisible('CHANGELOG.md') === false` — the
version-heading is asserted, so it counts as code for the content-addressed validation-receipt
freshness hash). Writing it in n2 (which completes before finalize) keeps the four-chain receipt the
finalize sink computes LAST fresh w.r.t. the CHANGELOG change; a CHANGELOG write ON the sink would
land after the receipt and stale it. The `[Unreleased]` entry does not disturb the contract
validator's `## [<current-version>]` heading assertion (that heading already exists from v6.22.1).

**Cross-edition four-chain obligation (binds at finalize).** Item 3 touches the gitlab plugin tree
(`plugins/kaola-workflow-gitlab/`), so the diff is CROSS-EDITION per the Validation Policy — all
four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains must be green (run
sequentially), recorded before Finalization. A green claude chain alone is insufficient (`npm test`
short-circuits on the first `&&` failure). `validation_command` is set to the four chains
accordingly. Items 1 and 2 are claude-chain / root-docs surfaces; item 3 lands in the gitlab suite.

**Write-set completeness (overflow checklist, walked).**
- `scripts/test-adaptive-node.js` is CLAUDE-ONLY (no `plugins/kaola-workflow/scripts/` twin exists,
  not a COMMON_SCRIPT / GENERATED_AGGREGATOR) → n1 declares exactly that one file; no forge-port
  mirror, no `generated_port_split`.
- `docs/conventions.md` / `docs/api.md` are root-level (not mirrored into any plugin tree) → n2
  declares exactly those two plus `CHANGELOG.md`.
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` is a DIVERGENT forge
  hand-port (not a byte-mirror / rename-normalized twin of the gitea test) → n3 declares exactly
  that one file. Item 3 is scoped to gitlab-only by the issue; no gitea mirror is required.
- No symbol is added or renamed by any node (all three are assertion/prose edits reusing existing
  symbols), so there is no agent-registration surface, no cross-edition symbol propagation, and no
  contract-validator needle/count to move.
- `.cache` node-evidence receipts are recorded parent-side and barrier-exempt; none declared.

**Item-1 direction (n1 implementer — assert on OBSERVED output).** `runRepairNode`
(`scripts/kaola-workflow-adaptive-node.js`) RETURNS `{ evidenceRemoved, deletedDownstreamBaselines,
gatesReset, gatesFolded, baselineReused, ... }`. For the #434-b singleton-code-reviewer case the
reviewer's `review.md` evidence is deliberately RETAINED (not purged) — the CONTRAST is the #664
fan-out case where group receipts ARE purged into `result.evidenceRemoved`. Replace the vacuous
`reviewerEvidence.includes(...)` assertion with one that observes the FUNCTION'S OWN output, e.g.
assert `result.evidenceRemoved` does NOT contain the singleton reviewer's `review.md` (demonstrating
retention), and keep the existing `!removedBaselines.includes('review.md')` check. The assertion
must be genuinely discriminating (would fail if `runRepairNode` ever purged the singleton reviewer's
evidence). No production change — this is a test-hardening edit; verify by running the claude chain.

**Item-3 direction (n3 implementer — wired output assertion).** In `test-gitlab-workflow-scripts.js`,
the genuine-negative clean_nonzero case (~the `#519(gl-b2b)` block, around the
`classifier.classifyIssue(99, root)` call that already asserts `verdict === 'target_unavailable'`)
is the natural home. Add ONE wired assertion that the human classification OUTPUT text
(`result.reasoning`, and/or the verdict/reason fields) contains NO leaked raw stderr — e.g. does not
include the raw stderr string, nor tokens like `Unknown` or `401`. Reuse the existing forge-mock
seam (`withClassifierForge`); name no forge CLI binary in any touched plugin prose.

**Finalize / run-chains gotcha.** `test-adaptive-node.js` (claude chain, ~848 KB) can SIGKILL the
octopus merge / hit ENOBUFS under default run-chains concurrency on this box (audit #666). Run the
four finalize chains with `KAOLA_RUN_CHAINS_CONCURRENCY=serial` (serial, `--project issue-668`) and
verify each chain CLOSED green, not merely exit-0-short-circuited.

**No G2 / G3 / knowledge-lookup / design node.** Labels carry no sensitivity (none of
security/auth/payments/secrets/user-data) → no `security-reviewer`. Every acceptance check is
delegable + machine-checkable (the four chains) → no `main-session-gate`. Every fact is confirmable
locally (verified at plan time against the three target files) → no `knowledge-lookup`. This is an
S-effort hygiene issue with the implementation direction written inline above → no dedicated
`planner`/`code-architect` node.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-fix-assertion | implementer | — | scripts/test-adaptive-node.js | 1 | sequence | standard | test-hardening — rewriting a vacuous assertion in an existing test to observe runRepairNode's real output; no production change and no separate failing unit test precedes a test-file edit; verified by running the claude chain |
| n2-release-docs | doc-updater | — | docs/conventions.md, docs/api.md, CHANGELOG.md | 3 | sequence | standard | — |
| n3-gitlab-leak | implementer | — | plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js | 1 | sequence | standard | test-hardening — adding one wired output assertion to an existing gitlab classifier test; no production change and no separate failing unit precedes a test-file edit; verified by running the gitlab chain |
| n4-review | code-reviewer | n1-fix-assertion, n3-gitlab-leak | — | 1 | sequence | reasoning | — |
| n5-finalize | finalize | n4-review, n2-release-docs | — | 1 | sequence | — | — |

## Node Briefs

### n1-fix-assertion

Intent: make the #434-b repair-harness assertion genuinely discriminating. Approach: in
`scripts/test-adaptive-node.js`, locate the assertion `assert(reviewerEvidence.includes('verdict:
fail') && reviewerEvidence.includes('findings_blocking: 1'), '#434-b: retained reviewer evidence
keeps its blocking body for the reopened writer')` — it checks the LOCAL CONSTANT `reviewerEvidence`
against substrings it was literally constructed from, so it can never fail. Replace it with an
assertion on the OBSERVED output of the `runRepairNode(...)` call captured as `result` in the same
block: the singleton code-reviewer's `review.md` evidence is RETAINED (not purged), so assert that
`result.evidenceRemoved` does NOT include `review.md` (contrast: the #664 fan-out case purges group
receipts INTO `result.evidenceRemoved`). Keep the adjacent `!removedBaselines.includes('review.md')`
check. Key constraint: the new assertion must FAIL if `runRepairNode` ever purged the singleton
reviewer's evidence (real discrimination), and must not otherwise change harness behavior. This is a
claude-only file (no codex twin). Verify: `npm run test:kaola-workflow:claude` green.

### n2-release-docs

Intent: document the `stale_release_receipt` refusal + its disposal step, and record the CHANGELOG
entry. Approach: (1) `docs/conventions.md` release-sequencing area (the "Working sequence" /
"Prepare receipt and resume boundary" material around the `--prepare` description) — add ONE sentence:
starting the NEXT release's `--prepare` requires deleting `.cache/release-receipt.jsonl` (and the
stale `chain-receipt.json`), because a completed `prepared` row for a prior version makes the next
`--prepare` refuse typed `stale_release_receipt`. (2) `docs/api.md` release CLI area (the `--prepare`
/ "Prepare receipt and resume boundary" text) — add ONE matching sentence naming the typed refusal
and the disposal. (3) `CHANGELOG.md` — add one `[Unreleased]` bullet summarizing the three hygiene
items (provenance/issue-ref lives here and in the commit message, never in agent-facing prose). Key
constraints: keep each doc addition to one sentence; do not disturb the existing
`## [<current-version>]` CHANGELOG heading (contract-validator-asserted); no code paths, docs-only.

### n3-gitlab-leak

Intent: wire a real assertion for #659's clean-nonzero stderr-leak AC. Approach: in
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`, at the genuine-negative
clean_nonzero classification case (the `#519(gl-b2b)` block whose `classifier.classifyIssue(99,
root)` already asserts `verdict === 'target_unavailable'`), add ONE wired assertion that the human
classification OUTPUT text (`result.reasoning`, plus the verdict/reason fields as relevant) contains
NO leaked raw stderr — it must not include the raw stderr string nor leaked tokens such as `Unknown`
or `401`. Reuse the existing `withClassifierForge` mock seam. Key constraints: forge-neutral plugin
prose — name no forge CLI binary; the assertion is over classification OUTPUT, not the mock input.
Verify the touched file immediately with the standalone forbidden-only contract check, then the
gitlab chain. This touch makes the whole diff CROSS-EDITION → the four-chain obligation binds at
finalize.

### n4-review

Intent: G1 gate — post-dominate the two code-producing test nodes (n1, n3). Approach: review the two
test-assertion edits for genuine discrimination (each new assertion would fail under the wrong
behavior), scope discipline (only the vacuous/missing assertions touched, no collateral edits), and
forge-neutrality of the gitlab plugin prose (no forge CLI binary named). Emit the machine verdict
block into `.cache/n4-review.md`. Read n1's and n3's evidence files before verdict.

### n5-finalize

Intent: unique sink — closure bookkeeping only (state/ledger + `.cache/final-validation.md`);
declares `—`. Run the four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains
SEQUENTIALLY with `KAOLA_RUN_CHAINS_CONCURRENCY=serial --project issue-668` (the claude
`test-adaptive-node.js` chain can SIGKILL/ENOBUFS under default concurrency, audit #666), confirm
each chain CLOSED green, then record `verdict: pass` bound to the candidate. Do not write CHANGELOG
here (n2 owns it pre-receipt).

## Node Ledger

| id | status |
| --- | --- |
| n1-fix-assertion | complete |
| n2-release-docs | complete |
| n3-gitlab-leak | complete |
| n4-review | complete |
| n5-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (n1-fix-assertion) | subagent-invoked | deferred_to_group | |
| implementer (n3-gitlab-leak) | subagent-invoked | deferred_to_group | |
| doc-updater (n2-release-docs) | subagent-invoked | group_passed | |
| code-reviewer | subagent-invoked | evidence-binding: n4-review e70bc3bac308 | |
| finalize (n5-finalize) | main-session-direct | evidence-binding: n5-finalize 08f50e469896 | |

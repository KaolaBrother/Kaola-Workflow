# Workflow Plan — bundle #658, #659, #660

<!-- plan_hash: e69753f11f9e10b14148d196259867a6b0ebd8805d552fe3033fdd4250f62b2f -->

## Meta
speculative_open_policy: auto
labels: bug, workflow:in-progress, area:workflow-phases, area:scripts
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

Repair the adaptive evidence contract, the shared Markdown section reader, and the GitLab
claim-classification fixture seam as one reliability bundle. Explicit DAG fan-out members use their
frozen node ids as the authoritative evidence membership; section boundaries are found only by a
single fence-aware scan; and default forge unit fixtures have no ambient CLI or network escape.

The fan-out evidence defect and the section-reader defect started as a shared ready frontier over
disjoint production and focused-test surfaces. After their synthesized parent reached review, n3
found five blocking defects spanning both merged lanes. The bounded repair therefore reuses n2's
original pre-frontier baseline and widens n2 to the exact union of both lanes; this keeps the full
accumulated diff visible to one barrier without reopening n1 or treating n1's merged files as
overflow. A single code-review wall still converges the repaired union before two independent
skeptics exercise the repaired fan-out verdict path itself.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-canonical-fanout-evidence | tdd-guide | — | scripts/test-adaptive-node.js | 1 | sequence | standard |
| n2-fence-parser-and-hermetic-fixtures | tdd-guide | n1-canonical-fanout-evidence | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js, scripts/kaola-workflow-classifier.js, plugins/kaola-workflow/scripts/kaola-workflow-classifier.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 16 | sequence | standard |
| n3-review-bundle-contract | code-reviewer | n1-canonical-fanout-evidence, n2-fence-parser-and-hermetic-fixtures | — | 1 | sequence | reasoning |
| n4-adversarial-membership-replay | adversarial-verifier | n3-review-bundle-contract | — | 1 | fanout(bundle-reliability-verification) | reasoning |
| n5-adversarial-parser-hermeticity | adversarial-verifier | n3-review-bundle-contract | — | 1 | fanout(bundle-reliability-verification) | reasoning |
| n6-document-repaired-contracts | doc-updater | n3-review-bundle-contract | docs/api.md, docs/conventions.md | 2 | sequence | standard |
| n7-finalize-bundle | finalize | n3-review-bundle-contract, n4-adversarial-membership-replay, n5-adversarial-parser-hermeticity, n6-document-repaired-contracts | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

- Cross-edition symbol scoping searched `adversarial-verifier-`, `globCache`, `evidence_file`,
  `locateSection`, `sectionBody`, and `listIssueNotes` across root scripts, every plugin script tree,
  contract validators, command/SKILL trees, docs, and the originating #655/#656 archived receipts.
  The moving production surface is the four generated plan-validator files, four generated
  adaptive-node files, root/Codex classifier pair, both divergent forge classifiers, and their
  focused lifecycle/walkthrough/forge test drivers. No agent-set, installer, routing-prose, command,
  SKILL, or financial-agent repository change is in scope; financial-agent remains evidence-only.
- `scripts/kaola-workflow-plan-validator.js` and `scripts/kaola-workflow-adaptive-node.js` are
  `GENERATED_AGGREGATORS`. Repair node n2 owns each canonical root, its Codex twin, and both renamed forge
  ports in the same write set. Edit the canonical roots and run `npm run sync:editions`; generated
  forge ports are never hand-edited. The canonical specification for every port is the full
  accumulated root diff versus the run base, mirrored in every hunk modulo forge-owned names.
- Repair node n2 must define one exact-member resolver from the frozen plan and reuse it for verifier reads,
  open-time dispatch/seed metadata, close-time verification, reopen/reset cleanup, and any
  compatibility lookup. New explicit DAG fan-outs author and consume only `.cache/<node-id>.md`;
  role-prefix receipts are read-only legacy compatibility input, never required output for a new
  run. Group membership is the exact set of frozen nodes sharing the same fanout label and origin,
  so independent groups, foreign files, duplicates, and stale bindings cannot contaminate a tally.
- `scripts/kaola-workflow-classifier.js` and its Codex copy are a `COMMON_SCRIPTS` pair and move
  byte-identically in n2. The GitLab/Gitea classifiers are divergent hand ports, so n2 applies the
  same scanner contract deliberately to both and exercises them in their edition-native test
  drivers. The scanner updates backtick/tilde fence state before considering either the requested
  heading or the next real h2 boundary; longer delimiters and language tags are accepted, malformed
  or ambiguous fencing refuses/returns no section rather than selecting a decoy.
- Node n2 also makes the GitLab claim fixtures hermetic at their owned dependency seam. Every
  classification fixture stubs `listIssueNotes` explicitly; a strict local unexpected-call sentinel
  names any omitted forge dependency before an ambient CLI/network path can run. Audit the analogous
  GitHub/Gitea fixtures in the already-owned test drivers and add only the corresponding deterministic
  stubs/sentinels actually needed. True remote behavior remains outside the default unit chain.
- The two initial TDD nodes were dispatched from a disjoint antichain and synthesized at parent
  commit `1917b9f8`. Review findings R1/R4 belong to n1's original lane; R2/R3/R5 belong to n2's
  original lane. Because both barrier windows opened from the same pre-frontier commit, reopening
  either narrow writer in the synthesized parent would classify the other lane as overflow. The
  repair narrows completed n1's frozen ownership to its focused lifecycle test, then orders n2 after
  n1 and widens n2 to the exact 16-file union. This removes the impossible two-way root/forge-port
  ownership while preserving n1's historical evidence file as an upstream input. It deliberately
  adds no new node and records no fresh baseline: `repair-node` must report `baselineReused: true`
  and retain n2's original barrier ref while folding n3 to pending. n1 must not be reopened or
  re-dispatched in this cycle.
- Node n3 runs or verifies the Meta validation command once, sequentially, after both producers
  converge. `docs/api.md` is already a test-consumed contract surface, so n6 is downstream of review
  and cannot be cited as inert over the receipt. Finalization reuses the fresh consumer receipt and
  reruns only when content-addressed freshness requires it.
- Nodes n4 and n5 are two explicit cardinality-1 members of one read-only adversarial fan-out. This
  intentionally reproduces the topology that exposed #658: normal plan-run seeds only their
  `.cache/<node-id>.md` receipts, and whole-plan verdict-check must aggregate exactly those frozen
  members with no manually-authored role-prefix bridge. With two members, one pass and one refutation
  remains a fail-closed tie under the existing majority-refute rule.
- Evidence for every dispatched node belongs under
  `kaola-workflow/bundle-658-659-660/.cache/<node-id>.md`; no node writes a bare worktree-root `.cache`
  path. The source repository is edited only inside the provisioned bundle worktree during execution;
  this planner has authored and frozen state only at the main root.

## Node Briefs

### n1-canonical-fanout-evidence

This node is already complete. Its retained evidence and focused `scripts/test-adaptive-node.js`
work are upstream input to the consolidated n2 repair. Do not reopen or re-dispatch n1; n2 owns every
new R1-R5 production and test edit, including any further change to `scripts/test-adaptive-node.js`.

### n2-fence-parser-and-hermetic-fixtures

Repair all five blocking n3 findings test-first inside the exact widened union. Read the retained
`n1-canonical-fanout-evidence.md` and `n3-review-bundle-contract.md` evidence before editing; preserve
their bindings and treat R1-R5 as the fixed acceptance list. Do not create a new repair node, move
n2's barrier baseline, reopen n1, or write documentation/changelog files.

For R1, first RED two independent legacy cardinality>1 groups where one group is 2/3 refuted and a
foreign group is 3/3 pass. Both per-node and whole-plan verdict checks must fail closed instead of
globally pooling role-prefix receipts. GREEN legacy compatibility only when a role-prefix set is
uniquely attributable to one frozen group; canonical explicit groups continue to use exact node-id
receipts. For R4, add a real temporary adaptive project that drives `open-ready`, writes only each
returned `dispatch.evidence_file`, closes the explicit skeptic members, and runs real whole-plan
`--verdict-check` with no role-prefix bridge. Include independent groups, foreign/duplicate files,
missing/stale bindings, ties, reset, and reopen nonce rotation.

For R2, update the stale explicit-skeptic walkthrough fixture to write canonical `.cache/<node-id>.md`
receipts and keep a separate narrowly-scoped legacy compatibility control. For R3, make every GitLab
classification fixture explicitly own `viewIssue`, `discoverProject`, and `listIssueNotes`; the
fixture seam must reject any omitted dependency locally before CLI, auth, HOME, network, or remote
notes are reachable. Run the full GitLab driver under an empty HOME and hostile forge-CLI shim, and
prove removing each dependency stub triggers the named local sentinel. For R5, commit a plan-consumer
matrix covering fenced decoys for `## Meta`, `## Nodes`, `## Node Ledger`, and `## Node Briefs`, then
assert parse/hash/freeze/resume across the root/Codex common path and both forge ports, including
backtick/tilde lengths, language tags, adjacent boundaries, duplicates, and unclosed ambiguity.

Focused RED/GREEN order: `node scripts/test-adaptive-node.js`; `node
scripts/simulate-workflow-walkthrough.js`; `node
plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` under the hostile hermetic
environment; and `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`. Then run
`npm run sync:editions`, `node scripts/edition-sync.js --check`, `node
scripts/test-edition-sync.js`, `node scripts/validate-script-sync.js`, and `git diff --check`.
Finally run the Meta four-edition validation command sequentially once and record R1-R5 closure plus
the exact original-baseline-to-repaired-HEAD file set for n3. Any ambient forge diagnostic, missing
integration path, foreign legacy vote acceptance, or short-circuited edition remains blocking.

### n3-review-bundle-contract

Re-review the full repaired union against the retained R1-R5 findings and n1's replacement evidence;
do not accept a scope-limited patch-only review. For fan-out evidence, trace one frozen member list from
plan parse through seed/dispatch, evidence verification, whole-plan tally, reset, reopen, and legacy
compatibility; reject any global role-prefix glob, foreign-group acceptance, duplicate vote,
stale-binding reuse, cross-group purge, or orchestrator bridge requirement. Confirm every generated
aggregator port mirrors the full canonical diff and `scripts/test-adaptive-node.js` executes the
real open-ready-to-verdict-check path using only dispatch-provided evidence paths.

For section parsing, compare all four classifier implementations and prove the scanner updates fence
state before heading recognition, respects family/run length, rejects ambiguous unclosed input, and
preserves valid plan hash/freeze/resume semantics. For hermeticity, inspect every classification
fixture dependency, run the negative missing-stub sentinel, and prove the default forge tests cannot
reach ambient CLI, auth, HOME, network, or remote notes. Run the Meta validation command sequentially
once after focused checks; block on any omitted edition, generated drift, nondeterministic remote
escape, stale receipt, or manual bridge artifact.

### n4-adversarial-membership-replay

Read n1 and n3 evidence, then try to refute exact frozen fan-out membership with executable temporary
projects. Attack two independent groups with reused-looking ids, unrelated legacy role-prefix files,
duplicate/foreign files, missing votes, malformed and stale bindings, one-pass/one-fail ties, reset of
one group, and reopen after nonce rotation. Verify only runtime-seeded `.cache/<node-id>.md` files are
needed and that cleanup neither preserves a stale vote nor deletes another group's evidence. Record a
fail-closed `verdict: pass|fail` and zero repository writes in this node's bound evidence file.

### n5-adversarial-parser-hermeticity

Read n2 and n3 evidence, then try to refute the parser and test-isolation claims across all edition
implementations. Generate backtick/tilde fences of different lengths, language tags, adjacent
boundaries, fake headings before and inside real sections, duplicate genuine headings, and unclosed
fences; compare parsed Meta/Nodes/Ledger/Briefs and freeze/resume results. Run the GitLab claim fixture
under empty HOME, no credentials/network, and an always-fail forge CLI shim, then remove one stub as a
negative control and require the local sentinel rather than remote stderr. Record a fail-closed
verdict and zero repository writes in this node's bound evidence file.

### n6-document-repaired-contracts

Read n1, n2, and n3 evidence before docking the reviewed behavior. Update `docs/api.md` so
`--verdict-check` documents explicit frozen fan-out member ids and canonical
`.cache/<node-id>.md` receipts, group isolation, binding/duplicate/foreign rejection, reset/reopen
freshness, and the narrow read-only legacy compatibility path instead of the obsolete global
`.cache/adversarial-verifier-*.md` contract. Document fence-aware section identity and the structural
malformed-input refusal where the plan parser contract is described. In `docs/conventions.md`, record
the default unit-chain hermeticity rule: every owned remote dependency is explicit and unexpected
forge calls fail locally, while true network behavior belongs only in separately named integration
tests. Keep prose forge-neutral and avoid changing unrelated architecture or setup material.

### n7-finalize-bundle

Finalize only after review, both fan-out skeptic receipts, and documentation docking pass. Add concise
Unreleased `CHANGELOG.md` entries for the node-id fan-out evidence contract, isolated group
aggregation/reset semantics with legacy read compatibility, fence-aware workflow section discovery,
and hermetic forge claim fixtures. Reuse the fresh Meta receipt, preserve changelog style, verify the
plan itself reached Finalization using only n4/n5's runtime-seeded node-id receipts, and do not expand
implementation or documentation scope.

## Node Ledger

| id | status |
| --- | --- |
| n1-canonical-fanout-evidence | complete |
| n2-fence-parser-and-hermetic-fixtures | complete |
| n3-review-bundle-contract | complete |
| n4-adversarial-membership-replay | complete |
| n5-adversarial-parser-hermeticity | complete |
| n6-document-repaired-contracts | complete |
| n7-finalize-bundle | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n2-fence-parser-and-hermetic-fixtures) | subagent-invoked | deferred_to_group | |
| tdd-guide (n1-canonical-fanout-evidence) | subagent-invoked | group_passed | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review-bundle-contract 9a7c513edb66 | |
| adversarial-verifier (n4-adversarial-membership-replay) | subagent-invoked | evidence-binding: n4-adversarial-membership-replay d0c55ea27622 | |
| adversarial-verifier (n5-adversarial-parser-hermeticity) | subagent-invoked | evidence-binding: n5-adversarial-parser-hermeticity 4e9e859a404d | |
| doc-updater (n6-document-repaired-contracts) | subagent-invoked | evidence-binding: n6-document-repaired-contracts 844794d4845a | |
| finalize (n7-finalize-bundle) | main-session-direct | evidence-binding: n7-finalize-bundle df62e7d4461c | |

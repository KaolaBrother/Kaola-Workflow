# Adaptive Workflow Plan — issue-442

<!-- plan_hash: 3efb651463e9dfaf6b778c8281188740844fbaee22fc650fbc6712169144b567 -->

## Meta
issue: 442
title: impl(release): D-420 P4 — kaola-workflow-release.js aggregator (--verify / --cut --version / --push)
labels: enhancement, area:scripts
sink: finalize

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-record-envelope | doc-updater | — | docs/decisions/D-442-01.md | 1 | sequence | sonnet |
| n2-impl-aggregator | tdd-guide | n1-record-envelope | scripts/kaola-workflow-release.js, scripts/test-release.js | 1 | sequence | sonnet |
| n3-port-editions | implementer | n2-impl-aggregator | plugins/kaola-workflow/scripts/kaola-workflow-release.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js, scripts/validate-script-sync.js | 1 | sequence | sonnet |
| n4-wire-test-chain | implementer | n2-impl-aggregator | package.json | 1 | sequence | sonnet |
| n5-review | code-reviewer | n3-port-editions, n4-wire-test-chain | — | 1 | sequence | opus |
| n6-docs | doc-updater | n5-review | docs/conventions.md, README.md, docs/README.md | 1 | sequence | sonnet |
| finalize | finalize | n6-docs | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

Scope: issue #442 is **Part 4 only** of D-420 (the `kaola-workflow-release.js` aggregator). The Part 2
enriched-halt-payload work ([INV-13]..[INV-18] of D-420-02 (existing)) is OUT OF SCOPE — this run touches no
classifier / `runWriteHalt` / `adaptive-node.js` surface. The issue body is the binding spec and it
SETTLES the open questions D-420-02 (existing) left ([INV-19]..[INV-23] still bind): architecture = a new
aggregator that CALLS the validators in place (no extraction from validate-workflow-contracts.js /
release-surface-drift.js); `--verify` derives the closed-issue set from git-log-since-last-tag +
CHANGELOG `[Unreleased]` refs cross-checked against forge state when online, degrading to changelog-only
with `verification: offline` when offline (never a silent pass); `--cut --version X.Y.Z` is REQUIRED and
explicit (no auto-semver), refuses non-monotonic, renames `[Unreleased]` -> `[X.Y.Z] - <date>`, bumps the
three `.codex-plugin` manifests in lockstep + README (the #245-class contract at
validate-workflow-contracts.js ~:469-496); `--cut` creates the tag locally (tag-before-test preserved),
push + `release create --latest` happen ONLY under explicit `--push` (forge-neutral guidance, never a
named forge CLI — [INV-21]); `--verify` consumes the #432 chain receipt (`.cache/chain-receipt.json`,
real per-chain exit codes — never prose, never `cmd | tail`); crash-resume via step-receipt JSONL (#429
pattern), re-run skips completed steps idempotently.

Census (binding, from the issue + D-420-02 (existing):170): there are exactly TWO claude forge plugin manifests
(`plugins/kaola-workflow-{gitlab,gitea}/.claude-plugin/plugin.json`) and THREE codex manifests
(`plugins/kaola-workflow{,-gitlab,-gitea}/.codex-plugin/plugin.json`). The investigation doc's "four
claude manifests" is WRONG and must not drive the bump surface — the aggregator reuses the manifest list
the way validate-workflow-contracts.js:469-496 already enumerates it.

n1 (decision record D-442-01): D-442-01 is the next-free id (no `D-442-*` record exists; this is a new
series). n1 is a doc-updater because `code-architect` is read-only and cannot author a file; the design
verdict below is ALREADY SETTLED at plan time and n1 RECORDS it (no new design latitude). The record must
capture the `--verify`/`--cut --version`/`--push` envelope ([INV-19]..[INV-23]), the step-receipt JSONL
resume contract (#429), the #432 chain-receipt consumption, the forge-neutral closed-issue data source,
AND the registration-surface verdict below. It runs first so n2/n3/n4 read a durable, settled record.

  REGISTRATION-SURFACE VERDICT (settled here; n1 records it; n3 implements it): the issue body's
  propagation note says "New script -> COMMON_SCRIPTS + install manifest (#412 lesson) + three install.sh
  SUPPORT_SCRIPT_NAMES blocks + forge ports". But `kaola-workflow-release.js` is a maintainer release tool
  run OUTSIDE a plan-run on a separate main commit (D-420-02 (existing) §"the aggregator is invoked OUTSIDE a
  plan-run") — exactly the profile of `release-surface-drift.js`, which the install manifest
  (`kaola-workflow-install-manifest.js:58`) EXPLICITLY excludes from SUPPORT_SCRIPTS as a "dev/CI release
  drift checker". VERDICT: IN `COMMON_SCRIPTS` (so the canonical->codex byte-mirror is enforced by
  validate-script-sync.js) + a rename-normalized forge-ports family (the run-chains precedent,
  validate-script-sync.js RENAME_NORMALIZED_FAMILIES:218-253), but NOT in the install-manifest
  SUPPORT_SCRIPTS (it is not a runtime user script). The issue body's "install manifest" line tracks the
  general #412 lesson; the release-surface-drift precedent governs THIS script. n3 must NOT add it to the
  install manifest unless a contract check actually demands it; if a chain goes red demanding manifest
  registration, STOP and surface it rather than silently widening — that would contradict the recorded
  verdict and needs a re-decision.

Cross-edition propagation (#307 — all four chains green, run sequentially, recorded before finalize):
this is a cross-edition diff. The new aggregator is byte-mirrored canonical->codex
(`plugins/kaola-workflow/scripts/kaola-workflow-release.js`) and hand-ported to the gitlab/gitea trees at
the forge-renamed paths `kaola-{forge}-workflow-release.js` (the run-chains naming precedent). The
canonical script carries NO forge identity string, so the forge ports are rename-normalized identical
after the `kaola-workflow-` -> `kaola-{forge}-workflow-` prefix transform — register them in
validate-script-sync.js: add `kaola-workflow-release.js` to COMMON_SCRIPTS (claude<->codex byte pair)
AND a new RENAME_NORMALIZED_FAMILIES entry (gitlab/gitea ports), mirroring the #432 run-chains block
verbatim modulo the script base name.

Forge-port canonical spec (n3): the canonical spec for the codex byte-mirror and the two forge ports is
the FULL accumulated root diff of `scripts/kaola-workflow-release.js` vs the run base
(`git diff <base>..HEAD -- scripts/kaola-workflow-release.js`) — mirror EVERY hunk modulo the forge-name
prefix rename, never a per-concern enumeration. The codex copy is BYTE-identical; the two forge ports are
identical after rename-normalization (the script names no forge CLI — [INV-21] — so the rename is the
only delta).

Forge-neutrality ([INV-17]/[INV-21]): the aggregator and its ports MUST name no forge-specific CLI
binary (`gh`/`glab`/`tea`), no forge brand, no forge-specific request noun. The `--push` publish step is
emitted as forge-neutral guidance ("run the forge release-create command with `--latest`"), never
`gh release create`. The closed-issue read for changelog-completeness stays forge-neutral: derive from
git-log-since-tag + CHANGELOG `#N` mentions (a local, forge-neutral source), with the online forge
cross-check left to the operator/orchestrator as an INJECTED set — the aggregator never shells a forge
query itself.

Test wiring (n4): `scripts/test-release.js` runs ONLY in the claude chain (the codex/gitlab/gitea chains
run validate-script-sync + the contract validators + their simulate walkthroughs, not the standalone
test-*.js suite). Add `node scripts/test-release.js` to the `test:kaola-workflow:claude` `&&`-chain in
package.json (alongside `test-release-surface-drift.js`). package.json is root-level and disjoint from
n3's `scripts/`+`plugins/` write sets, so n4 and n3 are an independent sibling pair after n2 (a shared
ready frontier the executor opens as one batch).

TDD vs implementer (n2 is tdd-guide; n3/n4 are implementer):
  - n2 = tdd-guide: the issue's Tests section lists meaningful failing-unit-test fixtures
    (changelog_incomplete `missing:[n]`; lockstep-violation; non-monotonic version refusal; offline-verify
    receipt; cut-without-push leaves no remote mutation). Test-first is natural — failing test first.
  - n3 = implementer (non_tdd_reason: mechanical byte-mirror + rename-normalized forge ports +
    validate-script-sync registration; behavior-preserving edition-sync work with no natural failing unit
    test — the parity is enforced by validate-script-sync.js / edition-sync.js --check in the chains, not
    a per-port unit test).
  - n4 = implementer (non_tdd_reason: package.json test-chain wiring is config/glue, no natural failing
    unit test).

Gate coverage: n5 (code-reviewer, G1) post-dominates every code-producing node (n2, n3, n4) before n6/
finalize. No security-sensitive surface (labels: enhancement, area:scripts; forge-neutral release tooling,
no secrets/auth/credentials/network-trust change) -> no security-reviewer (G2) node required. No
GPU/visual/device/human-signoff acceptance check -> no main-session-gate (G3) node required. n6 doc-updater
runs before finalize because public-facing release prose + the D-442-01 decision-record index entry change
(docs/conventions.md release §, README.md release-surface § ~524-550, docs/README.md decision index).
finalize is the docs-only sink (CHANGELOG.md).

Models: n5 opus (G1 reviewer over the whole cross-edition + release-mutation surface; a subtle
non-monotonic/lockstep/forge-neutrality miss is exactly what a strong reviewer catches that a cheap
implementer would ship). n1/n2/n3/n4/n6/finalize sonnet (carrying out an already-made decision: record the
settled design, implement against the issue spec + n1 record, mechanical port, package.json glue, doc
update, docs-only sink). The architecture/registration reasoning was completed at plan time and pinned in
these Plan Notes; the in-plan nodes execute it.

## Node Ledger

| id | status |
| --- | --- |
| n1-record-envelope | complete |
| n2-impl-aggregator | complete |
| n3-port-editions | complete |
| n4-wire-test-chain | complete |
| n5-review | complete |
| n6-docs | complete |
| finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater (n1-record-envelope) | subagent-invoked | evidence-binding: n1-record-envelope cd1e4c4e7121 | |
| tdd-guide (n2-impl-aggregator) | subagent-invoked | evidence-binding: n2-impl-aggregator 15c98cbbd5ff | |
| implementer (n3-port-editions) | subagent-invoked | evidence-binding: n3-port-editions da0969be9709 | |
| implementer (n4-wire-test-chain) | subagent-invoked | evidence-binding: n4-wire-test-chain c373080805f7 | |
| code-reviewer | subagent-invoked | evidence-binding: n5-review 419e190b94ee | |
| doc-updater (n6-docs) | subagent-invoked | evidence-binding: n6-docs ea7a1dbe0b4b | |
| finalize (finalize) | main-session-direct | evidence-binding: finalize 086c69ee175e | |

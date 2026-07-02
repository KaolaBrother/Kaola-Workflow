# Workflow Plan — bundle-587-589

<!-- plan_hash: 0e1c6bdaa4f45aa7ed8f8d02fcecf6e7bdf05dd2428a05157d3b255a2d2847a5 -->

## Meta

labels: enhancement, bug, area:scripts
validation_command: npm test

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-fix | tdd-guide | — | scripts/kaola-workflow-classifier.js, plugins/kaola-workflow/scripts/kaola-workflow-classifier.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js, scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/test-adaptive-node.js, scripts/test-commit-node.js, scripts/simulate-workflow-walkthrough.js | 11 | sequence | opus |
| n2-docs | doc-updater | n1-fix | docs/conventions.md, docs/api.md, docs/decisions/D-587-01.md, docs/decisions/D-589-01.md | 4 | sequence | sonnet |
| n3-review | code-reviewer | n2-docs | — | 1 | sequence | opus |
| n4-finalize | finalize | n3-review | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

Both issues are freeze-time correctness fixes in the same validator/classifier surface, and both
edit `kaola-workflow-plan-validator.js` (all four editions). Because the plan-validator write set
is SHARED between them, they cannot be split into parallel write legs — the fixes land atomically in
ONE implementation node (`n1-fix`). Both have crisp, reproducible RED tests (a plan that currently
freezes GREEN must now refuse; an even-width fan-out that currently passes must now refute), so
`tdd-guide` (RED first, then GREEN) is the right role. `n1-fix` is `opus`: it is the run-gating
validator core, the cross-edition port spans a hand-ported classifier (×4) plus a generated
plan-validator (×4) with the case-fold semantic straddling BOTH files, and #587's parallel-group
allowband rule requires reading the freeze-time `parallel_safe` derivation to inject correctly —
getting any of this wrong regresses every future run.

**#587 — three freeze-time disjointness-proof blind spots (all in `n1-fix`).**
- (1) Barrier-invisible allowband (`CHANGELOG.md` / `README.md` / `docs/**`). At freeze, when ≥2
  write nodes form a `parallel_safe` antichain, treat the allowband docs surfaces as an implicit
  shared area for the disjointness proof ONLY — refuse/ASK if two legs of a parallel group both
  plausibly touch docs (issue's cheapest option: require CHANGELOG/docs writes to be declared on
  exactly one leg). Serial-run barrier invisibility stays as-is.
- (2) Cross-node case collision on a case-insensitive FS. Case-fold the cross-node area/path
  comparison in the classifier (`normalizeRepoPath` / `disjointWriteSets` area compare). Prefer
  UNCONDITIONAL case-folding (over-blocking on Linux is the safe direction per the existing
  "over-blocks" hygiene philosophy) — the primary dev box is macOS. `Src/x.js` vs `src/x.js` on two
  parallel legs must refuse at freeze.
- (3) Glob tokens accepted at freeze. Add a glob-token refusal arm (`*`, `?`, `[`, `{`) to the
  write-set hygiene checks, matching the existing dir / `..` / trailing-slash refusals. `**/*.md`
  must refuse at freeze, not surface later as a runtime `write_set_overflow`.
- Each new refusal carries a typed emit-envelope `reason` (no caller string-matching) AND an
  `OPERATOR_HINT_REGISTRY` entry in the plan-validator (per the D-445-01 (existing) vocabulary contract:
  a `write_set_overflow`-family hint references `revert-overflow`, NEVER `drop-base`; every hint is
  forge-neutral — no `gh`/`glab`/`tea` — and provenance-free per the PROVENANCE_BAN guard).

**#589 — even-count tie passes majority-refute (in `n1-fix`).** `verifyVerdictBlock`
(`scripts/kaola-workflow-plan-validator.js`, the `majorityRefute` computation) uses
`refutes * 2 > verdicts.length`; a 1-1 tie resolves to PASS, outvoting a lone genuine refuter and
contradicting the subsystem's "refuted-if-uncertain" burden inversion. Break the tie toward refuted:
`refutes * 2 >= verdicts.length` (require a strict majority to PASS). RED: a 2-instance fan-out with
verdicts `[refuted, pass]` currently passes and must now refute (existing typed
`fanout majority-refute` reason). Odd-width behavior is unchanged (2/3 refute still refutes; 1/3
still passes) — the existing odd-width unit tests stay GREEN.

**Cross-edition (#307 — all four chains green before finalize).**
- Plan-validator is a GENERATED_AGGREGATOR (declaring `scripts/kaola-workflow-plan-validator.js`
  pulls in the codex twin + both forge ports under `generated_port_split`): edit canonical, keep the
  codex twin byte-identical (`validate-script-sync.js`), and REGENERATE the two forge ports via
  `npm run sync:editions` (`edition-sync.js --check` enforces this in the gitlab/gitea chains).
- The classifier is HAND-PORTED (not generated): apply the same function changes to all four
  editions by hand; keep canonical == codex twin byte-identical, and respect the forge-classifier
  `module.exports` SUPERSET guard (do not drop an export a forge classifier needs).
- RED/updated tests live in the claude chain: `scripts/test-adaptive-node.js` (freeze disjointness/
  hygiene + gate-verify majority-refute), `scripts/test-commit-node.js` (barrier gate-verify), and
  `scripts/simulate-workflow-walkthrough.js` (the `verifyVerdictBlock` unit region + freeze cases).
  The codex/forge `simulate-*-walkthrough.js` suites assert only odd-width fan-outs and carry no
  glob/cross-node-case fixtures, so they must stay GREEN UNTOUCHED — coverage of the ports comes
  from edition-sync parity (plan-validator) and behavioral no-new-refusal (classifier).
- Acceptance guard: existing green plans (serial, and genuinely-disjoint parallel) must still freeze
  GREEN — the four chains staying green is the false-positive/over-block check.

**Docs (`n2-docs`).** `docs/conventions.md` documents the freeze-hygiene refusals + the allowband
(this is where the new glob / cross-node-case / parallel-group-allowband rules belong);
`docs/api.md` documents the typed-reason / `operator_hint` refusal vocabulary. Decision records
`D-587-01` (disjointness-proof hardening) and `D-589-01` (tie-break-toward-refuted) are the next
free numbers for each issue (neither exists in `docs/decisions/`). The `finalize` sink writes only
`CHANGELOG.md` (docs/state); no decision-record id is hardcoded in any code write set.

## Node Ledger

| id | status |
| --- | --- |
| n1-fix | complete |
| n2-docs | complete |
| n3-review | complete |
| n4-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-fix) | subagent-invoked | evidence-binding: n1-fix 40d1617d9ce7 | |
| doc-updater (n2-docs) | subagent-invoked | evidence-binding: n2-docs d88fb5121f4b | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review d5d37d511f62 | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize 85e512f538b0 | |

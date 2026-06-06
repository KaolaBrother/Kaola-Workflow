# Workflow Plan — issue-268

<!-- plan_hash: ea6b220578b1985157fd589ca9818fdc779a95667ae7c1d5eb9fdee85d700572 -->

Tighten the adaptive plan validator's **G-SEL-1b** rule so a `select(<group>)` arm with a blank
`selector_source` is a typed refusal instead of a silently-dropped phantom arm. Today `selectGroups`
membership and the G-SEL-1b source-set are built with `.filter(Boolean)`
(`kaola-workflow-plan-validator.js` ~L605 / ~L625), so an arm whose `selector_source` column is empty
is invisible to both the validator's group aggregation and runtime `--selector-check`. That arm runs
unconditionally, defeating the Classify-And-Act single-arm guarantee.

Resolution = the issue's recommended fix: add a pre-check that runs over ALL nodes BEFORE the
`selectGroups` aggregation, requiring that every node with `shape.kind === 'select'` carries a
non-empty `selectorSource`, e.g.:
`G-SEL-1b: arm "<id>" in select group "<group>" has no selector_source declared`. This is purely
additive to the existing G-SEL-1b path — it can only ADD a refusal on a previously-passing malformed
plan; it never relaxes an existing gate. A valid plan (every arm names a source) continues to
validate `in-grammar`.

## Topology rationale

**Why one implement node (not a fan-out).** The pre-check is one logical edit replicated across the
four validator copies, plus new regression coverage. The declared write set is exactly five paths
(≤ FILE_CEILING 6):

1. `scripts/kaola-workflow-plan-validator.js` — canonical fix (new G-SEL-1b phantom-arm pre-check).
2. `plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js` — the GitHub/Codex mirror.
   `validate-script-sync.js` requires paths 1 and 2 **byte-identical**, so they MUST be produced
   together in one node — a fan-out splitting them across two agents could not guarantee byte-identity.
   This alone forbids fan-out.
3. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js` — Gitea port
   (hand-mirrored; not in the byte-identical group because it require()s the forge-specific classifier).
4. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js` — GitLab port (same).
5. `scripts/simulate-workflow-walkthrough.js` — the integration-test regression in
   `testAdaptivePatternLibrary` (issue AC#3): a `select(<group>)` plan with a blank-selector_source
   arm now refuses with `G-SEL-1b: arm "X" ... has no selector_source declared` (AC#1); existing
   positive single-/multi-arm select fixtures (every arm names `classify`) still validate `in-grammar`
   (AC#2). A grep confirms this canonical suite is the ONLY simulate suite carrying `select(`
   coverage (27 hits; gitea/gitlab/both codex variants and the github-plugin suite have zero), so no
   other simulate file needs editing and AC#4 (`npm test` green across all four editions) holds via
   the contract + script-sync checks the four validators already satisfy.

Fan-out is also impossible on disjointness grounds: three of the four validator paths share the
`plugins/` top-level directory, and disjointness is checked at top-level-directory granularity — any
two would collide. One node is both correct and required.

**Why a `code-reviewer` node (G1).** `tdd-guide` flips `producesCode` true and the write set touches
non-docs `.js` logic, so G1 requires `code-reviewer` to post-dominate the implement node. The linear
`implement → review → docs → finalize` chain satisfies post-dominance (review removal disconnects
implement from the sink). The reviewer must confirm the pre-check is strictly additive (element-for-
element identical to G-SEL-1b's existing source set, only appends an error string) and that the four
validator editions carry the same insertion at the same location.

**Why a `doc-updater` node.** `docs/api.md` (~L256) spells out the live G-SEL grammar contract.
#268 closes an enforcement gap in the documented "all arms must name the same selector_source" clause
by adding a new typed-refusal message; the doc node's concrete edit is to document the new
`G-SEL-1b: arm "<id>" ... has no selector_source declared` refusal on the G-SEL contract surface,
mirroring how #271 documented its G-SEL-1 message. This is a public-interface (typed-refusal grammar)
change, so docs are updated before `finalize`.

**Sensitivity / why no `security-reviewer` (G2).** Frozen labels are `bug, area:scripts,
area:workflow-phases` — none in the sensitive set (auth/payments/secrets/user-data). No declared
write path matches a Phase-5 sensitivity pattern: the `.js` validator/test paths and `docs/api.md`
contain no auth/payments/secrets/filesystem/external-API/api-key surface. No G2 node is required
(same call as #271/#263/#269). The fix is zero-blast-radius — it only ADDS a refusal on malformed
select-group plans; no script/role/file is added, so the `validate-*-contracts.js` /
`test-*-workflow-scripts.js` count files are NOT touched (#250 was a role-addition concern; #268 is
pure validator logic).

The `finalize` sink writes only `CHANGELOG.md` (docs/state bookkeeping).

## Meta

labels: bug, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
| --- | --- | --- | --- | --- | --- |
| implement | tdd-guide | — | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, scripts/simulate-workflow-walkthrough.js | 5 | sequence |
| review | code-reviewer | implement | — | 1 | sequence |
| docs | doc-updater | review | docs/api.md | 1 | sequence |
| finalize | finalize | docs | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status | notes |
| --- | --- | --- |
| implement | complete | |
| review | complete | |
| docs | complete | |
| finalize | in_progress | |

## Required Agent Compliance

| node | role | status | evidence |
| --- | --- | --- | --- |
| implement | tdd-guide | complete | RED: validator returned in-grammar on blank selector_source arm (pre-fix); GREEN: validator returns refuse with G-SEL-1b per-arm message (post-fix); simulate-workflow-walkthrough.js exit 0; npm test exit 0; test_thrash=0 |
| code-reviewer | code-reviewer | complete | node=review; verdict: pass; findings_blocking: 0; all 7 focus items confirmed; byte-identity confirmed (sha256 8e8ec953...); npm test exit 0; simulate-workflow-walkthrough.js exit 0; barrier exit 0 |
| doc-updater | doc-updater | complete | node=docs; verdict: pass; findings_blocking: 0; docs/api.md G-SEL-1b typed-refusal message inserted at G-SEL-1 selector_source clause (line ~256); matches validator source L553; barrier exit 0 |

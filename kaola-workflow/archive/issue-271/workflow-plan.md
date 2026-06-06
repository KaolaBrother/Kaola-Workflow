# Workflow Plan — issue-271

<!-- plan_hash: ea6b220578b1985157fd589ca9818fdc779a95667ae7c1d5eb9fdee85d700572 -->

Fix the `selectGroups` keying bug in the adaptive plan validator. `selectGroups` is keyed by the
bare `n.shape.group` string (`kaola-workflow-plan-validator.js:567-568`), so two independent
`select(<group>)` groups in different DAG branches that happen to share a group name merge into one
map entry. G-SEL-1 then counts all arms together (over-blocks) or sees multiple classifier nodes for
one group (misleading "selector_source mismatch" refusal) on a plan that should validate.

Resolution = issue #271 **option 1** (recommended in the issue, simpler, consistent with the
Classify-And-Act exactly-one-arm guarantee): require **globally unique `select(<group>)` names**. A
duplicate group name across independent arm sets is a typed refusal with a clear message, e.g.
`G-SEL-1: select group name "fix" used by arms with different selector_source nodes; use distinct
group names for independent groups`. This is purely additive to the existing G-SEL-1 path — it can
only ADD a refusal on a previously-merged plan; it never relaxes an existing gate.

## Topology rationale

**Why one implement node (not a fan-out).** The keying fix is one logical edit replicated across the
four validator copies, plus the new regression coverage. The declared write set is exactly five
paths (≤ FILE_CEILING 6):

1. `scripts/kaola-workflow-plan-validator.js` — canonical fix (selectGroups keying + new G-SEL-1 refusal).
2. `plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js` — the GitHub/Codex mirror.
   `validate-script-sync.js` (COMMON_SCRIPTS) requires paths 1 and 2 **byte-identical**, so they
   MUST be produced together in one node — a fan-out that split them across two agents could not
   guarantee byte-identity. This alone forbids fan-out.
3. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js` — Gitea port
   (hand-mirrored; not in the byte-identical group because it require()s the forge-specific classifier).
4. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js` — GitLab port (same).
5. `scripts/simulate-workflow-walkthrough.js` — the integration-test regression: two independent
   `select(fix)` groups with DIFFERENT classifiers now refuse (issue AC#1, option 1), and two
   `select(fix)` groups with the SAME classifier refuse (AC#2). Per the issue's "Related" note, the
   multi-group fixture belongs in this canonical Claude walkthrough — it is the only simulate suite
   that carries `select(` coverage, so AC#3 (existing single-group #263/#267 tests still pass) is
   exercised here. The Gitea/GitLab/Codex simulate suites have NO select coverage and the change is
   additive, so they need no edit; AC#4 `npm test` stays green via the contract+sync checks that the
   four validators already satisfy.

Fan-out is also impossible on disjointness grounds: three of the four validator paths share the
`plugins/` top-level directory, and disjointness is checked at top-level-directory granularity — any
two would collide. One node is both correct and required.

**Why a `code-reviewer` node (G1).** `tdd-guide` flips `producesCode` true and the write set touches
non-docs `.js` logic, so G1 requires `code-reviewer` to post-dominate the implement node. The linear
`implement → review → docs → finalize` chain satisfies post-dominance (review removal disconnects
implement from the sink).

**Why a `doc-updater` node.** Option 1 changes the documented public grammar contract: `docs/api.md`
(~L252) spells out the current G-SEL-1 rule ("a select group needs ≥ 2 arms; all arms must name the
same `selector_source`"). The new globally-unique-group-name constraint and its typed-refusal message
are a public-interface change, so `docs/api.md` is updated before `finalize` (docs/public-interface
changed). `docs/workflow-state-contract.md` only enumerates the four shape tokens (not G-SEL rule
detail) and the `docs/investigations/` six-patterns file is a dated historical design record — neither
is the live contract surface for the G-SEL-1 rule, so both are intentionally left untouched.

**Sensitivity / why no `security-reviewer` (G2).** Frozen labels are `bug, area:scripts,
area:workflow-phases` — none in the sensitive set (auth/payments/secrets/user-data). No declared
write path matches a Phase-5 sensitivity pattern: the `.js` validator/test paths and `docs/api.md`
contain no auth/payments/secrets/filesystem/external-API/api-key surface (`api.md` matches neither
`external-?api` nor `api-?key`). No G2 node is required (same call as #263/#269). The fix itself is
zero-blast-radius — it only ADDS a refusal on malformed multi-group plans.

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
| implement | complete | barrier:ok barrier_exit:0 |
| review | complete | barrier:ok barrier_exit:0 verdict:pass |
| docs | complete | barrier:ok barrier_exit:0 |
| finalize | complete | barrier:ok barrier_exit:0 |

## Required Agent Compliance

| node | status | evidence | notes |
| --- | --- | --- | --- |
| tdd-guide (implement) | subagent-invoked | `.cache/implement.md` — RED: AC#1 test `#271 AC#1: duplicate group name with different classifiers must refuse with G-SEL-1 duplicate-group message` failed before fix (validator refused with wrong message "conflicting selector_source(s): classify1, classify2" instead of new G-SEL-1 typed message; test regex did not match; exit non-zero); GREEN: additive pre-pass inserted before `// --- #263 G-SEL` block in all 4 validator editions (root + codex byte-identical diff empty; gitea + gitlab structural apply confirmed); new G-SEL-1 message: `G-SEL-1: select group name "${grp.label}" used by arms with different selector_source nodes; use distinct group names for independent groups`; AC#2 refuses via pre-existing G-SEL-4 (same-classifier + disjoint-writes case structurally undetectable under option 1 — documented as #244 AC#3-unreachable precedent); AC#3 existing single-group select() coverage passes (testAdaptivePatternLibrary: PASSED); AC#4 npm test exits 0 all four suites (claude/codex/gitlab/gitea); validate-script-sync.js: "OK: 14 common scripts and 5 byte-identical file group in sync"; per-node barrier pass (barrierCheck exit:0, 0 errors/sensitiveHits/outOfAllow; gateVerify informational:true; verdictCheck informational:true; selectorCheck ok:true isSelector:false; overallOk:true) | |
| code-reviewer (review) | subagent-invoked | `.cache/review.md` — verdict: pass; pre-pass additivity proven (srcsForName element-for-element identical to G-SEL-1b's srcs; can only append one error string, cannot change any pass/refuse outcome); cross-edition parity: canonical vs codex IDENTICAL, gitea/gitlab byte-identical insertion at same location; AC#1 fixture confirmed refuse with new G-SEL-1 message; AC#2 unreachability call judged sound per #244 precedent; AC#3 existing single-group coverage passes; full walkthrough suite re-run: exit 0; per-node barrier pass (barrierCheck exit:0; verdictCheck ok:true verdict:pass; selectorCheck isSelector:false; overallOk:true barrier_exit:0) | |
| doc-updater (docs) | subagent-invoked | `.cache/docs.md` — file: `docs/api.md`; section: line 252, G-SEL-1 clause within Grammar block; change: extended G-SEL-1 to document globally-unique group name requirement shipped in #271 (new typed refusal message appended verbatim from validator line 607); purely additive — no existing gate relaxed; per-node barrier pass (barrierCheck exit:0, 0 errors/sensitiveHits/outOfAllow; gateVerify informational:true; verdictCheck informational:true; selectorCheck isSelector:false; overallOk:true barrier_exit:0) | |
| finalize (finalize) | sink-complete | no subagent; orchestrator-written CHANGELOG.md; no RED/GREEN; no reviewer verdict; per-node barrier pass (barrierCheck exit:0, 0 errors/sensitiveHits/outOfAllow; gateVerify informational:true; verdictCheck found:false informational:true; selectorCheck isSelector:false; overallOk:true barrier_exit:0) | |

# Workflow Plan — issue-263

<!-- plan_hash: df2cc73a5a60bc07ffb2f32ff0f6589dceb18fbc612075acdac5824ba8eb70e3 -->

Selective execution (Classify-And-Act): a script-decidable selector runs exactly one of N arms.
Scope is concentrated in the adaptive Node-scripts + grammar layer (design doc:
`docs/investigations/2026-06-06-six-workflow-patterns.md`, §"The design"), NOT in command/agent
prose. Three primitives ship together, each replicated across the four editions: (a)
`parseNodeSelector` in the cross-edition byte-identical anchor `kaola-workflow-adaptive-schema.js`
(×4, column-0-anchored, fence-blind, last-match-wins, returns `{ found, selector }`); (b) a
fail-closed routing bracket in `kaola-workflow-commit-node.js` (×4) that, on a `selector_source`
completing, marks every arm except the named one `n/a` and halts on a missing/foreign selector;
(c) the fail-closed validator rules G-SEL-1..4 in `kaola-workflow-plan-validator.js` (×4) —
exactly-one membership, gates-never-selectable, post-dominance over the superset, disjoint-or-identical
arm write sets. Companion: flip the `select()` tripwire in `simulate-workflow-walkthrough.js`'s
`testAdaptivePatternLibrary` from `refuse` to `in-grammar`, byte-sync the schema helper across all
four editions via `validate-script-sync.js`, and move Classify-And-Act from Planned to supported in
the README "Supported adaptive patterns" table.

Topology rationale (why a serialized chain, not a fan-out): every implement family writes BOTH the
`scripts/` and `plugins/` top-level dirs (root copy + forge ports). Fan-out disjointness is checked
at top-level-directory granularity, so any two implement nodes would collide → out-of-grammar. The
work is therefore a SERIALIZED chain of single-family nodes (one reaches the next; no concurrent
antichain pair), each ≤ FILE_CEILING (6 paths), under one trailing `code-reviewer` (G1) that
post-dominates the whole implement chain. This mirrors the #251 precedent (same schema ×4 /
plan-validator ×4 / commit-node ×4 surface). The four editions are: root `scripts/` + the
byte-identical Codex copy under `plugins/kaola-workflow/scripts/` + the renamed gitea/gitlab forge
ports (`kaola-gitea-…` / `kaola-gitlab-…` for the validator and commit-node; the schema module keeps
its name across all four and is the byte-identical drift anchor).

NOTE — this plan IMPLEMENTS the `select(...)` grammar; it does NOT USE it. No node carries a
`select(<group>)` shape: the plan itself is authored entirely in the CURRENT (pre-#263) grammar
(`sequence` only here), so it validates against the live validator.

Sensitivity: labels are `enhancement, area:scripts, area:workflow-phases` — none in the sensitive set
(security/auth/payments/secrets/user-data) — and no declared write-set path matches a sensitivity
pattern (no auth/payments/secrets/filesystem/external-API surface). Therefore no G2 /
`security-reviewer` node is required; the read-only classifier in the feature being built is
zero-blast-radius by design (design doc §5).

README is routed to a dedicated `doc-updater` node placed LINEAR AFTER `review`
(`review → docs → finalize`), never parallel — so it cannot create a path that bypasses the G1
`code-reviewer`. README is docs-only (itself G1-exempt) and is NOT folded into the `finalize` sink.

## Meta

labels: enhancement, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
| --- | --- | --- | --- | --- | --- |
| explore | code-explorer | — | — | 1 | sequence |
| plan | code-architect | explore | — | 1 | sequence |
| impl-schema | tdd-guide | plan | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js | 1 | sequence |
| impl-validator | tdd-guide | impl-schema | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js | 1 | sequence |
| impl-commit-node | tdd-guide | impl-validator | scripts/kaola-workflow-commit-node.js, plugins/kaola-workflow/scripts/kaola-workflow-commit-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-commit-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-commit-node.js | 1 | sequence |
| impl-tests-sync | tdd-guide | impl-commit-node | scripts/simulate-workflow-walkthrough.js, scripts/validate-script-sync.js | 1 | sequence |
| review | code-reviewer | impl-tests-sync | — | 1 | sequence |
| docs | doc-updater | review | README.md | 1 | sequence |
| finalize | finalize | docs | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status | notes |
| --- | --- | --- |
| explore | complete | barrier:0; .cache/explore.md present/non-empty; RED confirmed (12 file paths + seam locations documented); GREEN n/a (read-only node, no writes to production code) |
| plan | complete | barrier:0; .cache/plan.md present/non-empty; RED confirmed (3 open decisions resolved with ground-truthed code seams: Decision A select() in shape branch, Decision B contractor writes n/a ledger rows via Edit, Decision C selector_source as new ## Nodes column); GREEN n/a (read-only forward-reasoning planning node, no writes to production code) |
| impl-schema | complete | barrier:0; .cache/impl-schema.md present/non-empty; RED confirmed (parseNodeSelector: undefined before change); GREEN confirmed (all 4 schema files updated byte-identical, 5 pure-case smoke tests pass, validate-script-sync OK 13 common scripts, walkthrough exit:0) |
| impl-validator | complete | barrier:0; .cache/impl-validator.md present/non-empty; RED confirmed (pre-change tripwire: `invalid shape "select(fix)"` — shape parser rejected select() before changes); GREEN confirmed (parseShape select branch added in all 4 editions, selector_source column parsed, G-SEL-1..4 validation block added, --selector-check CLI mode added, four-edition parity confirmed byte-identical, walkthrough exits 1 at tripwire with shifted error `select group "fix" arms declare no selector_source` — expected mid-run state, impl-tests-sync flips it) |
| impl-commit-node | complete | barrier:0; .cache/impl-commit-node.md present/non-empty; RED confirmed (selectorCheck absent before change — grep returned no output, combineResults destructured only 4 fields, overallOk set to barrierPass alone); GREEN confirmed (selectorCheck step added in all 4 editions: let declaration + shellValidator call + combineResults 5th field; root+Codex byte-identical diff empty; gitea+gitlab 12 occurrences each of selectorCheck/selector-check/selectorPass; test-commit-node.js passes 27 assertions; walkthrough exits 1 at same G-SEL-1 tripwire — no new error introduced; no-ledger-mutation invariant preserved) |
| impl-tests-sync | complete | barrier:0; .cache/impl-tests-sync.md present/non-empty; RED confirmed (walkthrough exits 1 at tripwire assertion B — `select group "fix" arms declare no selector_source` — before changes); GREEN confirmed (walkthrough exits 0, testAdaptiveVerdictCheck+testAdaptivePatternLibrary PASSED; npm test exits 0, all four suites pass; parseNodeSelector 5 pure-case assertions added; --selector-check 4 CLI assertions added; tripwire flipped from refuse→in-grammar; 5 G-SEL typed-refusal cases added; validate-script-sync exits 0 no changes needed) |
| review | complete | barrier:0; .cache/review.md present/non-empty; verdict:pass findings_blocking:0; G1 gate satisfied (code-reviewer post-dominates impl-schema/impl-validator/impl-commit-node/impl-tests-sync); gateVerify informational:true (pre-close state, not blocking); selectorCheck ok:true isSelector:false overallOk:true |
| docs | complete | barrier:0; .cache/docs.md present/non-empty; RED confirmed (Classify-And-Act row as Planned prose paragraph at README.md L583 before change — no table row, pattern not in supported table); GREEN confirmed (new table row inserted between Tournament and Composed at README.md L579 with governance verdict auto-run; Planned paragraph removed entirely; summary sentence updated "first six" → "first seven building blocks"; stale-reference grep clean) |
| finalize | in_progress | base:87beb7cd7a4ac247ecea5ba60aaaff9944f00e20 |

## Required Agent Compliance

| node | status | evidence | notes |
| --- | --- | --- | --- |
| code-explorer (explore) | subagent-invoked | `.cache/explore.md` — READ-ONLY findings: 12 file paths across 4 editions confirmed; parseNodeVerdict seam (adaptive-schema.js L99–111) + parseShape seam (plan-validator.js L94–101) + shapes loop (L544–586) + gate locations (G1 L645, G2 L651) + n/a mechanism (commit-node invariant: no ledger writes) + quorum seam (commit-node shells validator --verdict-check) + validate-script-sync.js (no new entry needed) + tripwire (simulate-workflow-walkthrough.js L6673–6685) + 3 open decisions for planner; per-node barrier pass (no write set; barrierCheck pass, 0 errors/sensitiveHits/outOfAllow); GREEN n/a (read-only node) | |
| code-architect (plan) | subagent-invoked | `.cache/plan.md` — forward-reasoning blueprint: 3 open decisions resolved (A: select() in parseShape shape branch; B: contractor writes n/a ledger rows via Edit; C: selector_source as new column in ## Nodes table); exact diffs + line-number-verified seams for all 5 impl-validator changes + 3 impl-commit-node changes + 4 impl-tests-sync changes documented; per-node barrier pass (no write set; barrierCheck pass, 0 errors/sensitiveHits/outOfAllow); GREEN n/a (read-only planning node, no writes to production code) | |
| tdd-guide (impl-schema) | subagent-invoked | `.cache/impl-schema.md` — RED: parseNodeSelector: undefined (confirmed via node -e typeof check); GREEN: parseNodeSelector inserted + exported in all 4 schema files, byte-identical (3 diffs empty), 5 pure-case smoke tests pass (empty/col-0/indented/last-match-wins/no-selector), validate-script-sync OK (13 common scripts 5 byte-identical groups), walkthrough exit:0; write-set deviation noted (walkthrough not in write set; smoke tests run inline in $TMPDIR equivalent); per-node barrier pass (barrierCheck exit:0, 0 errors/sensitiveHits/outOfAllow) | |
| tdd-guide (impl-validator) | subagent-invoked | `.cache/impl-validator.md` — RED: pre-change tripwire produced `invalid shape "select(fix)"` (shape parser rejected select() before changes, tripwire assertion B confirmed); GREEN: parseShape select branch added in all 4 editions (`if ((m = s.match(/^select\(([^)]+)\)$/)))`), selector_source column parsed (selectorSource via get()/idx() pattern, back-compat with 6-column plans), G-SEL-1..4 validation block added (G-SEL-1a: >=2 arms; G-SEL-1b/c/d/e: selector_source; G-SEL-2: gate roles excluded; G-SEL-3: NO-OP by design; G-SEL-4: RED write-set overlap), --selector-check CLI mode confirmed (non-selector/valid-arm/missing-cache/foreign-selector all correct), four-edition parity confirmed (root+codex byte-identical diff empty; gitea+gitlab structural apply confirmed via grep non-zero G-SEL/--selector-check/parseNodeSelector), walkthrough exits 1 at tripwire with shifted error `select group "fix" arms declare no selector_source` (G-SEL-1 fires instead of shape parser — expected mid-run state), npm test exits 1 due to walkthrough tripwire only (all other sub-suites pass cleanly); per-node barrier pass (barrierCheck exit:0, 0 errors/sensitiveHits/outOfAllow) | |
| tdd-guide (impl-commit-node) | subagent-invoked | `.cache/impl-commit-node.md` — RED: selectorCheck completely absent before change (grep returned no output; combineResults destructured only { recordBase, barrierCheck, gateVerify, verdictCheck }, overallOk set to barrierPass alone); GREEN: selectorCheck step added in all 4 editions (let selectorCheck=null declaration, shellValidator call after verdictCheck, combineResults 5th arg, selectorPass computed and threaded into overallOk as `barrierPass && selectorPass`); root+Codex byte-identical (diff empty); gitea+gitlab 12 occurrences each of selectorCheck/selector-check/selectorPass; test-commit-node.js passes 27 assertions (null/undefined back-compat via == null guard); walkthrough exits 1 at same G-SEL-1 tripwire — no new error introduced; no-ledger-mutation invariant preserved (no fs.writeFileSync to plan file); per-node barrier pass (barrierCheck exit:0, gateVerify informational, verdictCheck informational, selectorCheck ok:true isSelector:false, overallOk:true) | |
| tdd-guide (impl-tests-sync) | subagent-invoked | `.cache/impl-tests-sync.md` — RED: walkthrough exits 1 at tripwire assertion B with error `select group "fix" arms declare no selector_source` (G-SEL-1 fired but error message did not match expected `invalid shape "select(fix)"` — fixture lacked selector_source column); GREEN: walkthrough exits 0, testAdaptiveVerdictCheck PASSED + testAdaptivePatternLibrary PASSED; npm test exits 0 all four suites (claude/codex/gitlab/gitea); parseNodeSelector 5 pure-case unit tests added (col-0/last-match-wins/empty/indented/no-keyword); --selector-check 4 CLI assertions added (non-selector/missing-cache/valid-selector/foreign-selector); tripwire flipped to assert result===in-grammar + decision===auto-run; 5 G-SEL typed-refusal inline fixtures added (G-SEL-1a/G-SEL-2/G-SEL-1d/G-SEL-1e/G-SEL-4); validate-script-sync exits 0, no edit needed (parseNodeSelector already listed in byte-identical group); per-node barrier pass (barrierCheck exit:0, gateVerify informational, verdictCheck informational, selectorCheck ok:true isSelector:false, overallOk:true) | |
| code-reviewer | subagent-invoked | `.cache/review.md` — verdict:pass findings_blocking:0; G1 gate (code-reviewer post-dominating impl-schema/impl-validator/impl-commit-node/impl-tests-sync) satisfied; 3 non-blocking observations (MEDIUM: G-SEL-1b phantom-arm gap; LOW: selectGroups keying; LOW: G-SEL-1b partial fixture coverage); barrier exit:0 overallOk:true; gateVerify informational:true | |
| doc-updater (docs) | subagent-invoked | `.cache/docs.md` — RED: Classify-And-Act was a standalone Planned prose paragraph below the supported-patterns table (no table row, not in the supported set); GREEN: new table row inserted between Tournament and Composed (README.md L579) with governance verdict auto-run pinned from live validator; Planned paragraph removed entirely; summary sentence updated "first six" → "first seven building blocks"; stale-reference grep clean (grep returns only new supported row at L579); per-node barrier pass (barrierCheck exit:0, gateVerify informational:true, selectorCheck ok:true isSelector:false overallOk:true) | |

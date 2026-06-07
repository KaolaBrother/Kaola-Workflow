# Adaptive Workflow Plan — issue-289

<!-- plan_hash: f1520166953bd8dc613e00f96f004734cf62a2960bf575370590d952e7642f20 -->

adaptive: parseNodeFindings value-casing fails open (#289). parseNodeFindings (added in #279)
lowercases finding KEYS but not VALUES, while the sibling parseNodeVerdict lowercases its verdict
token. A mis-cased finding (`scope=In_Scope action=Fix status=Open`) therefore parses but does NOT
match the `unresolvedInScopeFixes` predicate, so `--verdict-check` passes when it should block. Fix:
lowercase the recognized finding VALUES for the gate-relevant fields ONLY — scope, action, status,
fix_role — at the single assignment site (schema.js ~line 158), matching parseNodeVerdict's
value-lowercasing discipline; leave id, severity, raw, and unknown keys at original case. Minimal
linear chain implement → review → finalize: code-reviewer post-dominates the single code producer
(G1); no `*security*` filename in any write-set and no security label (G2 not triggered); finalize
is the unique docs/state sink (CHANGELOG.md only).

## Meta

labels: bug, workflow:in-progress, area:scripts

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| implement | tdd-guide | — | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| review | code-reviewer | implement | — | 1 | sequence |
| finalize | finalize | review | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
| --- | --- |
| implement | complete |
| review | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (implement) | subagent-invoked | # Node implement (tdd-guide) — issue #289 fail-open fix | |

| code-reviewer | subagent-invoked | # Node review (code-reviewer, G1) — issue #289 | |
| finalize (finalize) | subagent-invoked | # Node finalize (sink) — issue #289 | |
## Design Notes

Goal: close the #289 fail-open hole where a mis-cased finding value silently bypasses the #279
verdict gate. Case-normalization ONLY — do NOT expand to "unknown values fail closed" (out of scope
per the issue).

- implement node (tdd-guide, RED→GREEN): lowercase the recognized finding VALUES for the
  gate-relevant fields (scope, action, status, fix_role) at the single assignment site in
  parseNodeFindings (~line 158) across the 4 byte-identical adaptive-schema copies, matching
  parseNodeVerdict's value-lowercasing discipline. id, severity, raw, and unknown keys stay at
  original case. The natural failing-first unit test (added to the existing #279
  `unresolvedInScopeFixes` block in `testAdaptiveVerdictCheck`, right after the "low severity still
  blocks" case) asserts a mixed-case finding `scope=In_Scope action=Fix status=Open` is treated
  identically to lowercase and BLOCKS the gate (unresolvedInScopeFixes returns it non-empty). The 4
  schema copies MUST stay byte-identical (validate-script-sync checks this under full npm test).
  Verification = full `npm test` (it supersets the walkthrough and runs the 4-edition
  validate-script-sync byte-identity check + forge contract validators); the walkthrough alone is
  NOT sufficient.
- review node (code-reviewer, G1): post-dominates the single code producer (implement). No
  write-set path is sensitive (no *security* filename) and no security label ⇒ code-reviewer alone
  suffices; no security-reviewer node required.
- finalize node: the unique docs/state sink (CHANGELOG.md only). No public-interface or doc change
  beyond the changelog — the fix makes the gate match its already-documented #279 contract — so no
  doc-updater node is required.

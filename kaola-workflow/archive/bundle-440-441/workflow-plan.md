# Adaptive Workflow Plan — bundle-440-441

<!-- plan_hash: 33eb64f0de4963effd4a013fba831a8006d214e96ff1b9147d1ac2450bd8f714 -->

## Meta
issue: 440
title: bundle(adaptive/auto) D-420 P2+P3 — consent-halt triage payloads (#440) + goal-conditioned bundles (#441)
labels: enhancement, area:scripts
sink: finalize

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-record-440 | doc-updater | — | docs/decisions/D-440-01.md | 1 | sequence | opus |
| n2-record-441 | doc-updater | — | docs/decisions/D-441-01.md | 1 | sequence | opus |
| n3-schema | tdd-guide | n1-record-440 | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js | 4 | sequence | sonnet |
| n4-validator | tdd-guide | n3-schema, n2-record-441 | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js | 4 | sequence | opus |
| n5-halt-triage | tdd-guide | n4-validator | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js | 5 | sequence | sonnet |
| n6-receipt-field | tdd-guide | n2-record-441 | scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js | 4 | sequence | sonnet |
| n7-finalize-seat | tdd-guide | n6-receipt-field | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js | 4 | sequence | sonnet |
| n8-scout | implementer | n2-record-441 | agents/issue-scout.md, plugins/kaola-workflow/agents/issue-scout.toml, plugins/kaola-workflow-gitlab/agents/issue-scout.toml, plugins/kaola-workflow-gitea/agents/issue-scout.toml | 4 | sequence | sonnet |
| n9-prose-halt | doc-updater | n5-halt-triage | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md | 4 | sequence | sonnet |
| n10-prose-goal | doc-updater | n4-validator, n7-finalize-seat, n8-scout | commands/kaola-workflow-finalize.md, commands/workflow-next.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md | 5 | sequence | sonnet |
| n11-review | code-reviewer | n5-halt-triage, n7-finalize-seat, n8-scout, n9-prose-halt, n10-prose-goal | — | 1 | sequence | opus |
| n12-docs | doc-updater | n11-review | README.md, docs/conventions.md, docs/README.md | 3 | sequence | sonnet |
| finalize | finalize | n12-docs | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

**Bundle scope.** This is a 2-issue bundle (issue_numbers 440,441; all_or_nothing) implementing TWO
parts of the D-420 goal-driven-automation cluster. #440 is **P2 only** (the enriched consent-halt
triage payload, D-420-02 (existing) [INV-13]..[INV-18]) — the P4 release aggregator from the same ADR
is OUT OF SCOPE (already shipped as #442 / D-442-01 (existing)). #441 is **P3 only** (goal-conditioned
bundles, D-420-01 (existing) [INV-7]..[INV-12]) — the P1 autopilot loop from the same ADR is OUT OF
SCOPE. Both issue BODIES are the binding spec; each settles the open questions its ADR left, captured
durably by the two `doc-updater` record nodes (n1, n2) so downstream implementers read a settled record.

**Decision records (n1, n2).** `D-440-01` and `D-441-01` are the next-free ids — neither series exists
(`docs/decisions/` has D-420-01 (existing), D-420-02 (existing), and D-442-01 (existing) only). These are `doc-updater` nodes (not
`code-architect`, which is read-only and cannot author a file): the design is ALREADY settled in each
issue body, so the record TRANSCRIBES the binding settlements, it does not open new design latitude.
n1 records #440's OQ-P2-a/b/c + threading settlements; n2 records #441's OQ-3 + env-pin + blocking-
semantics + seat settlements. Each is the head of its issue's lane so implementers read a durable record.

**The single contested seam — `plan-validator.js` is a GENERATED AGGREGATOR (n4), so BOTH issues'
validator edits live in ONE atomic node.** `plan-validator.js` is in edition-sync's
`GENERATED_AGGREGATORS`, so the #431/#291 generated-port-split freeze-wall REQUIRES the canonical +
codex twin + both gitlab/gitea forge ports to be edited ATOMICALLY in the SAME node (a split ships
forge-port drift). Both #440's three `barrierCheck` subtypes ([INV-14]) AND #441's `parseGoal` reader
([INV-9]) edit this same generated-aggregator family, so they CANNOT be two nodes (that would either
split the ports or collide on the same exact paths). They merge into **n4-validator**: ONE `tdd-guide`
node editing all four plan-validator copies atomically, implementing BOTH features. The two features are
disjoint REGIONS of the same file (the `reason`-envelope precedence block vs. the `## Meta` reader
block) with a SHARED canonical spec per copy: each forge port mirrors the FULL accumulated root diff
(subtypes + parseGoal) modulo forge nouns (#328 — never a per-concern half-mirror). n4 depends on n3
(the subtype table) AND n2 (the #441 parseGoal settlement record). opus: subtle cross-edition
precedence + reader work over four byte-/rename-aligned trees.

**Cross-edition propagation model (×4) — confirmed by symbol-grep + `validate-script-sync.js` +
`edition-sync.js` GENERATED_AGGREGATORS.**
- GENERATED aggregators (edited atomically in ONE node, canonical+codex+gitlab+gitea ports together):
  `plan-validator.js` (n4) and `adaptive-node.js` (n5). For these the gitlab/gitea copies are
  EDITION-NAMED ports (`kaola-gitlab-workflow-*.js` / `kaola-gitea-*`) the #431 wall pins to the same
  node; n5 edits adaptive-node's full four-copy set atomically.
- 4-tree BYTE-IDENTICAL groups (`validate-script-sync.js` BYTE_IDENTICAL_GROUPS): `adaptive-schema.js`
  (n3) and `closure-contract.js` (n6). The four paths carry IDENTICAL bytes; the gitlab/gitea copies
  keep the BASE filename (`kaola-workflow-…`), so they are NOT edition-named ports — a single atomic
  4-file node is correct and the byte group enforces identity.
- COMMON_SCRIPTS non-generated with edition-named ports: `claim.js` (n7). It is NOT a generated
  aggregator, so the #431 wall does not bind it, but its gitlab/gitea copies ARE edition-named ports;
  it is written by exactly ONE node here, so the #340 same-node atomic-mirror carve-out applies — a
  single 4-file node with each port mirroring n7's full claim.js diff is correct.
- No node adds a NEW script file, so NO `validate-script-sync.js` / install-manifest / contract-
  validator count-surface edit is required (the registries are EXACT-MATCH on file PRESENCE, and the
  set of installed files is unchanged — only their bytes change, identically across the copies). The
  #340 agent-registration / count-bump checklist was consciously evaluated and found N/A.

**#440 lane (n3→n4→n5).**
- n3 (OQ-P2-a, [INV-17]): the lockfile/mirror/count-surface classification table is a forge-neutral
  literal-pattern set living in `adaptive-schema.js` (the byte-identical forge-neutral constants home,
  the cross-edition drift anchor) — never a forge token. Consumed by n4.
- n4 #440 half (OQ none; [INV-14]): three STRUCTURAL subtypes — `lockfile_write`, `mirror_write`,
  `count_bump` — NARROWING `write_set_overflow` in `barrierCheck`'s precedence-ordered `reason`
  envelope (`plan-validator.js:753`-772), exactly as #404 placed `write_set_granularity` under it. Pure
  literal-pattern test over `outOfAllow`; NO fs, NO mutation, NO re-freeze. NEVER a fifth precedence
  family (the D-419-02 (existing) [INV-13] do-not-fork-the-taxonomy lesson).
- n5 (OQ-P2-b/c, threading; [INV-13]/[INV-15]/[INV-16]/[INV-17]): `runWriteHalt` attaches the classified
  `triage: { class, testDelta?, proposed_repair? }` to its EXISTING return — purely additive; the
  marker-writing transaction (state-then-ledger ordering, the consent→consent+security coupling) is
  UNCHANGED. `proposed_repair` is the STRUCTURED `{ kind: write_set_swap|add_to_write_set|
  revert_overflow|repair_node, node, paths[] }` vocabulary (#440 settlement 2 — NOT a literal diff;
  #434 primitives + plan-repair-via-`--freeze`); it is COMPUTED and ATTACHED, never APPLIED. Threading
  is `write-halt --triage-json <path|->` consuming the `barrierOut` envelope (#440 settlement 4;
  close-and-open-next already returns it, `adaptive-node.js:1230`-1237). The overflow `barrier_failed`
  refusal envelope carries the SAME `triage` shape (#440 settlement 5 — one shape on both channels).
  `test_thrash` delta from the #432 chain receipt when present, else the node-evidence RED/GREEN lines
  (#440 settlement 3). Unknown class degrades to `class: unclassified` (never blocks the halt itself).
  Tests in `test-adaptive-node.js`. Forge-neutral JSON — no `gh`/`glab`/`tea` token anywhere
  ([INV-17]); preserves the byte-identity contract. adaptive-node is a generated aggregator → its four
  copies (root+codex+gitlab+gitea ports) are edited atomically in this one node (#431 wall).

**#441 lane (n2→{n4-half, n6→n7, n8}).**
- n4 #441 half (OQ-3 prose form; [INV-8]/[INV-9]/[INV-10]): `parseGoal` reads `^goal:[ \t]*(.*)$`
  `## Meta`-scoped via the SAME `classifier.sectionBody(content, 'Meta')` reader `parseLabels` uses
  (decoy-immune). READER only, NO gate — freeze accepts goal-absent plans unchanged; the line is hash-
  covered for free because `computePlanHash` covers the whole `## Meta` body (`plan-validator.js:783`-
  799). Tampering the goal trips `plan_hash_mismatch` on `--resume-check`, exactly as `labels:` does.
- n6 ([INV-12] receipt field): the `goal_check: ['satisfied','unsatisfied','absent']` field added to
  `closure-contract.js` `CLOSURE_RECEIPT_FIELDS` + seeded in `emptyReceipt()` (byte-identical ×4). The
  single machine-readable receipt source of truth; n7 flips it.
- n7 (#441 settlements 1+3+4; [INV-12]): the attestation is emitted by `cmdFinalize` in `claim.js` —
  NOT `sink-merge.js` (per #427 the live flow never invokes it; #441 settlement 4 seats it at finalize).
  ADVISORY in v1 — `cmdFinalize` writes typed `goal_check: satisfied|unsatisfied|absent` into the
  finalize receipt (#441 settlement 3; flip-to-blocking deferred to #429). The AC-vs-goal check is
  AGENT-judged (prose goal, OQ-3). `KAOLA_GOAL` is the operator-side env entry only; because subagent
  shells do not inherit it (#430), the goal text ALSO travels in the scout/planner dispatch prompts
  (operator/orchestrator concern — n7 only pins the env NAME and the receipt emission).
- n8 (#441 settlement 5; [INV-11]): issue-scout md + 3 toml twins gain the goal input + a
  `goal_alignment` note in the recommendation; cross-ref #430 (target-set integrity) so a goal-
  conditioned bundle still validates its claimed set. `implementer` (not `tdd-guide`): agent-profile
  prose has no natural failing unit test. non_tdd_reason: agent-profile markdown + toml edit
  (documentation surface); regression-green is the four-chain pass.
  **Forge-neutral toml ([INV-17], #341):** the three `issue-scout.toml` twins are byte-identical
  edition mirrors — name NO forge CLI binary; mirror the existing edition-neutral style. The contract
  validators forbid `gh`/`glab`/`tea` tokens; verify the touched toml with the standalone forbidden-
  only check before the chains.

**Prose split (n9, n10) — the ×6 adaptive-prose surfaces (#400), split by issue to stay ≤ FILE_CEILING.**
Both issues add prose touchpoints; the combined set exceeds 6 files, so it SPLITS into two disjoint
same-role nodes (a clean `sequence` split, never a directory grant):
- n9-prose-halt (#440): the halt-triage operator touchpoints — `plan-run` command + the 3 plan-run
  SKILL packs (4 files). Canonical spec: mirror the command's halt-triage wording verbatim into the
  three SKILLs modulo forge nouns (#309 shared-canonical-spec, so the editions converge by construction).
- n10-prose-goal (#441): the goal-attestation + scout-goal touchpoints — `finalize` command +
  `workflow-next` command + the 3 finalize SKILL packs (5 files). Same shared-canonical-spec discipline.
The route-reachability contract (`test-route-reachability.js` + the four contract validators) machine-
enforces the structural wiring tokens; these prose nodes must not remove an existing pinned token.

**Gate (n11, G1).** `code-reviewer` post-dominates EVERY code-producing node — n3,n4,n5,n6,n7,n8 and
both prose nodes — the validator enforces G1 post-dominance (n11 depends on the lane heads n5/n7/n8 and
both prose nodes; n3/n4/n6 reach the sink only through descendants n5/n7/n9/n10, all of which fan into
n11). opus: the review must catch cross-edition byte/precedence drift across four trees and the
additive-not-substitutive halt-return contract — a strong reviewer over cheap implementers. No G2:
labels are `enhancement, area:scripts` (no `area:security`); no node writes a Phase-5 sensitive area, so
no `security-reviewer` is required. No `main-session-gate`: the only non-trivial acceptance check is the
four `npm run test:kaola-workflow:*` chains, which a subagent CAN run (delegable verification, NOT a
GPU/visual/human-signoff gate); chain verification is driven inside the review/docs flow, not via a
non-delegable gate. **Cross-edition evidence (#307):** all four chains (`claude,codex,gitlab,gitea`)
MUST be green, run SEQUENTIALLY — a green claude chain alone is insufficient (the `&&` short-circuit
hides a red forge chain).

**Docs + sink (n12, finalize).** n12 updates README / docs/conventions.md / docs/README.md (the docs-
map surfaces) for the new triage payload + goal line; CHANGELOG.md is reserved for the `finalize` sink
(docs/state-only write) to avoid a contested-file overlap with n12. The sink writes ONLY CHANGELOG.md
(a non-docs write on the sink would trip code-reviewer).

## Node Ledger

| id | status |
| --- | --- |
| n1-record-440 | complete |
| n2-record-441 | complete |
| n3-schema | complete |
| n4-validator | complete |
| n5-halt-triage | complete |
| n6-receipt-field | complete |
| n7-finalize-seat | complete |
| n8-scout | complete |
| n9-prose-halt | complete |
| n10-prose-goal | complete |
| n11-review | complete |
| n12-docs | complete |
| finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater (n1-record-440) | subagent-invoked | evidence-binding: n1-record-440 fef5a62c5581 | |
| doc-updater (n2-record-441) | subagent-invoked | evidence-binding: n2-record-441 22464eb8ff38 | |
| tdd-guide (n3-schema) | subagent-invoked | evidence-binding: n3-schema 436bc84824ae | |
| tdd-guide (n4-validator) | subagent-invoked | evidence-binding: n4-validator c3ea0575521d | |
| tdd-guide (n5-halt-triage) | subagent-invoked | evidence-binding: n5-halt-triage cfd7a9cab29a | |
| tdd-guide (n6-receipt-field) | subagent-invoked | evidence-binding: n6-receipt-field 49642035aa92 | |
| tdd-guide (n7-finalize-seat) | subagent-invoked | evidence-binding: n7-finalize-seat 3e67288f81aa | |
| implementer (n8-scout) | subagent-invoked | evidence-binding: n8-scout 9656fefff04e | |
| doc-updater (n9-prose-halt) | subagent-invoked | evidence-binding: n9-prose-halt cb0a79c61ff2 | |
| doc-updater (n10-prose-goal) | subagent-invoked | evidence-binding: n10-prose-goal 9033c9d3b411 | |
| code-reviewer | subagent-invoked | evidence-binding: n11-review 061763cf66a4 | |
| doc-updater (n12-docs) | subagent-invoked | evidence-binding: n12-docs cf43cd012dc2 | |
| finalize (finalize) | main-session-direct | evidence-binding: finalize 9f4bd2f6fb38 | |

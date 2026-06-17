<!-- plan_hash: a7c1585446403b6650d95ec586dfe6a95c876c699cdb69279dcc71c49a1e12d6 -->
<!-- workflow-plan: adaptive -->

## Meta

issue: 505
project: issue-505
labels: bug, area:scripts
sink: merge

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-enforce-coverage | implementer | — | scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/test-route-reachability.js, scripts/test-bash-block-guards.js | 1 | sequence | sonnet |
| n2-review-bite | code-reviewer | n1-enforce-coverage | — | 1 | sequence | opus |
| n3-finalize | finalize | n2-review-bite | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

This issue closes three enforcement-coverage gaps in ONE mechanism class (#505): a
fail-closed guard or cross-edition parity contract that the green `npm` suite does NOT
actually enforce. All three are cross-edition (#307) and all four chains
(`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`, run SEQUENTIALLY) must be
green at finalize. The three items share the contract-validator surface heavily (items 1
and 3 both add pins to all four validators), and the item-1 bash-block test is the same
FOREIGN_ARCHIVE coverage as the item-1 validator pin — splitting them would be the #309
half-a-change trap, so they live in ONE implementer node. Write-role fan-out
serial-degrades today (#463) so a disjoint antichain split would buy zero makespan and add
divergence risk; single node is both correct and cheapest.

### n1-enforce-coverage — implementer (sonnet)

`non_tdd_reason`: adding enforcement coverage (contract-validator substring/shared-fn pins
+ a guard-runner bash-block case + a hardened T5 assert) OVER existing, already-shipped
guards and parity contracts; every new assert is GREEN-ON-ARRIVAL by construction (the
guards/functions already exist and pass against current reality), so there is no new
behavior with a natural failing unit test. Bite-verification (a mutation must turn a chain
RED) is the mutation check assigned to the opus code-reviewer gate (n2).

CRITICAL — pins MUST match CURRENT shipped reality. The forge ports and finalize commands
were edited by several recent merges (#508/#517/#518, #519/#510/#511, #501/#509). BEFORE
writing any pin, GREP the ACTUAL current guard text and the ACTUAL current top-level
function names in each target and pin THOSE exact strings — never a remembered/stale value
— or the chains go RED. Confirmed-present anchors at authoring time (re-verify before
pinning): FOREIGN_ARCHIVE guard text lives in `commands/kaola-workflow-finalize.md`
(~:665 `## Staging Guard`, ~:674 `FOREIGN_ARCHIVE=$(git diff --cached ...`, ~:680
`exit 1`) + the two forge mirrors `plugins/kaola-workflow-{gitlab,gitea}/commands/kaola-workflow-finalize.md`
(NOTE: gitlab/gitea finalize.md differ in size from root — pin each edition's OWN text).
Shared forge-port function names present now (re-grep): gitlab/gitea
`claim` (e.g. `closeIssueIdempotent`, `buildBranchName`, `checkDispatchAttestations`),
`classifier` (`isSharedInfra`, `isProtected`, `areaForPath`/`readPlanNodes`),
`repair-state` (`isAdaptiveWorkflowState`, `adaptiveStateValid`, `isSafeName`),
`roadmap` (`readRoadmapIssues`, `roadmapDir`), `sink-merge` (`deriveMemberSet`,
`readStateIssueNumbers`, `probeIssueClosed`).

ITEM 1 — FOREIGN_ARCHIVE staging guard (HIGH, the #294 fail-open class). The Phase-6
archive-pollution guard is bash-in-markdown that `npm test` never executes;
`FOREIGN_ARCHIVE`/`Staging Guard` has 0 matches across the four contract validators +
`test-bash-block-guards.js` + walkthroughs.
  (a) Add a SUBSTRING pin (the #492 `assertIncludes` pattern) in the contract validators
      asserting the guard text is present in the finalize command of each edition: root +
      codex validators pin `commands/kaola-workflow-finalize.md` (FOREIGN_ARCHIVE + the
      exit-1 BLOCKED message); the gitlab validator pins ITS finalize.md, the gitea
      validator pins ITS finalize.md (edition-specific path + edition-specific text — do
      NOT cross-wire gitlab nouns into gitea or vice-versa).
  (b) Add a `test-bash-block-guards.js` case that EXTRACTS the Staging Guard bash block
      (use the existing `extractBashBlocks` + a named marker; add the marker comment in the
      finalize.md if extraction needs one — if so, the finalize.md edit is OUT of this
      node's write set, so prefer extracting by the existing `## Staging Guard` heading
      WITHOUT editing the .md, OR escalate as a finding), RUNS it in a tmp fixture with a
      foreign `archive/<other>/` band staged, and asserts the block `exit`s 1 (the
      fail-CLOSED behavior). Follow the existing harness style (`spawnSync('bash', ...)`,
      assert `res.status`).

ITEM 2 — T5 route-reachability self-disarm. `scripts/test-route-reachability.js:152-169`:
the 6-surface (#400) `<!-- PIN: frontier unit -->` propagation check blocks ONLY
`if (anyHasPin)`; the else-branch `console.warn`s (line ~168) and the suite passes if the
pin is removed from ALL six surfaces. FLIP the else-branch to a HARD ASSERT requiring ≥1
pin to exist (`assert(anyHasPin, '...')`), promoting the in-flight TODO. The pin is
currently present on the surfaces, so this is green-on-arrival.

ITEM 3 — forge data-layer shared-function-presence guard. The hand-ported
`claim`/`sink-merge`/`classifier`/`roadmap`/`repair-state` forge ports are in no static
shared-function parity check (only ad-hoc token pins; #492 is the one principled instance).
GENERALIZE the #492 `assertIncludes` approach: in the gitlab contract validator, assert the
shared function NAMES (grepped current, see anchors above) are present in each
`kaola-gitlab-workflow-{claim,classifier,roadmap,repair-state,sink-merge}.js`; mirror the
same in the gitea contract validator for the `kaola-gitea-workflow-*.js` ports. (The
root/codex validators may pin the canonical `scripts/kaola-workflow-*.js` shared fns
likewise if that strengthens parity, but the gap is specifically the FORGE ports — focus
there.) Each validator pins its OWN edition's ports only.

CROSS-EDITION DISCIPLINE (validator self-check will NOT catch these):
  - `scripts/validate-workflow-contracts.js` ↔
    `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` are a BYTE-IDENTICAL
    pair locked by `scripts/validate-script-sync.js`. Item-1 and item-3 pins added to one
    MUST be IDENTICAL text in the other, or the claude/codex chain goes red.
  - gitlab validator pins gitlab's finalize.md + gitlab port fn names; gitea pins gitea's
    — no cross-wiring.
  - Adding pins does NOT change any agent/script COUNT, and the contract validators are NOT
    in GENERATED_AGGREGATORS (#431 `generated_port_split` does not apply — verified), so no
    count-bump or four-port-edition split is required.
  - ESCALATION: the "match current reality" constraint cuts both ways. If grep shows a
    guard is CURRENTLY fail-open (a #294 recurrence) or a shared function is MISSING from a
    forge port, that is a real bug — surface it as a finding and fix/escalate rather than
    pin around it.
  - VERIFY before handing to review: after editing, run the four chains SEQUENTIALLY
    (`npm run test:kaola-workflow:claude && ... :codex && ... :gitlab && ... :gitea`) and
    confirm all four are green; capture real exit codes (never gate on a piped `| tail`).
  Write node evidence to `kaola-workflow/issue-505/.cache/n1-enforce-coverage.md` with the
  literal lowercase `build-green` sentinel and the four-chain results.

### n2-review-bite — code-reviewer (opus), G1 gate

"Enforce the enforcer" mutation-bite gate. These changes are subtle — a green review without
a DEMONSTRATED bite is exactly the failure the owner is paying opus to prevent. Verify each
new assert actually BITES: temporarily MUTATE a guard / drop a pinned shared function / strip
a pinned guard substring and CONFIRM the relevant `npm` chain now goes RED; then REVERT the
mutation. Specifically confirm: (1) removing the FOREIGN_ARCHIVE substring from a finalize.md
turns the corresponding contract-validator chain red AND the new bash-block-guards case fails
when the guard is made fail-open; (2) removing the `<!-- PIN: frontier unit -->` from all six
surfaces now turns route-reachability RED (no longer a silent warn); (3) dropping a pinned
shared function name from a forge port turns the gitlab/gitea chain red. Also confirm the
root↔codex validator byte-pair stayed identical and no edition cross-wiring. Emit lowercase
`verdict: pass` / `findings_blocking: 0` (Phase-6 `--verdict-check` requires it). Write
evidence to `kaola-workflow/issue-505/.cache/n2-review-bite.md`.

### n3-finalize — finalize sink

Docs/state only. Add a CHANGELOG.md entry under `[Unreleased]` describing the #505
enforcement-coverage closures (FOREIGN_ARCHIVE substring pin + bash-block-guard case; T5
hard-assert; forge shared-function parity pins). No public interface or routing/finalize-wiring
prose changed, so the #400 six-surface propagation does NOT fire and no doc-updater node is
needed. No decision record required (gap-filling, not an architecture decision); if recording
the #492-generalization pattern is desired it is `D-505-01` (free) but it does NOT gate. Write
evidence to `kaola-workflow/issue-505/.cache/n3-finalize.md`.

## Node Ledger

| id | status |
| --- | --- |
| n1-enforce-coverage | complete |
| n2-review-bite | complete |
| n3-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (n1-enforce-coverage) | subagent-invoked | evidence-binding: n1-enforce-coverage 3185c6a963ff | |
| code-reviewer | subagent-invoked | evidence-binding: n2-review-bite f148399b7997 | |

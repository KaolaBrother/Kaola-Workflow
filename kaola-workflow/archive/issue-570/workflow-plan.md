# Workflow Plan — issue-570

<!-- plan_hash: f492856401f5b99d49f61d47bbaee391c94b4c4a6b20fd0df92cca0736a9cf06 -->

## Meta
labels: —
validation_command: npm test

## Plan Notes

Issue #570 is a **prose / routing fix, not a code-logic change** (the issue states no script
logic change is required by the AC). The self-host-vs-consumer branch (#475) is documented in the
finalize *prerequisite* section and enforced at the `--finalize-check` gate, but the two
OPERATIONAL steps that invoke `kaola-workflow-run-chains.js` are stated **unconditionally** and do
not pre-branch. The fix gates those two points of use on self-host detection (presence of
`test:kaola-workflow:*` scripts in the repo's `package.json`) and routes consumer repos directly
to: "run the plan's `## Meta` `validation_command`, then record `.cache/final-validation.md` with a
column-0 `verdict: pass`; do NOT invoke `run-chains.js`." Self-host behavior is unchanged
(run-chains → `chain-receipt.json` → contractor verifies).

**Two points of use → two disjoint write nodes (parallel antichain).**
- n1 (plan-run): §5 "All done" step — the `node …/kaola-workflow-run-chains.js --project {project}`
  invocation.
- n2 (finalize): the pre-contractor step — "Before dispatching/delegating the contractor: run
  `kaola-workflow-run-chains.js` …".

n1 and n2 touch **pairwise-disjoint** file sets (plan-run surfaces vs finalize surfaces) and neither
depends on the other → left as an antichain so the scheduler co-opens them (D-419-01 (existing) /
#542 default-on parallel writes).

**Cross-edition propagation (#307 / #400) — each node owns its full SIX routing surfaces.** Each
point of use propagates to 6 surfaces: 3 commands (claude root + gitlab command port + gitea command
port) + 3 Codex SKILL packs (github-codex + gitlab + gitea). This is the exact surface set the
route-reachability contract (`scripts/test-route-reachability.js` T5/T6) and the four
`validate-*-contracts.js` machine-enforce. The local `.opencode/command/*.md` mirrors are
**untracked** (`git ls-files` returns nothing) — generated/installed copies, NOT repo source — so
they are out of every write set.

**Parity discipline (#309).** The consumer-vs-self-host branch is ONE semantic change applied at two
points of use. The 6 surfaces inside each node are NOT byte-mirror SYNC peers (`edition-sync.js
--check` pins no mirror group for these files — they differ by forge nouns and codex-vs-claude
framing), so each must be written edition-appropriately. **Shared canonical spec for BOTH nodes
(so the two locations and all editions converge):** the gated step must read — "self-host (npm,
`test:kaola-workflow:*` present) → run `run-chains.js` as today; consumer (non-npm) → run the plan's
`## Meta` `validation_command` and record `.cache/final-validation.md` with a column-0 `verdict:
pass`; do NOT invoke `run-chains.js`." Mirror this branch verbatim modulo forge nouns and the
codex SKILL framing across all 6 surfaces of each node; keep every existing PIN comment intact
(plan-run: `<!-- PIN: frontier unit -->`; finalize: `<!-- PIN: closure-audit -->`) — the
route-reachability suite REDs if any pin is dropped from any surface. Forge-neutral plugin prose
(#341): the SKILL/forge-command surfaces must not name a forge-specific CLI binary.

**No contract-validator needle is removed.** The gitlab/gitea/github-codex contract validators assert
the finalize SKILL/command still mentions `final-validation.md` (#475); the change ADDS the consumer
branch at the operational invocation point and PRESERVES that needle. No validator allowlist/count
moves, so no `validate-*-contracts.js` file is in any write set.

**No script logic change.** `kaola-workflow-run-chains.js` and `--finalize-check` consumer
auto-detection already behave correctly; this is prose pushing the existing branch up to the point of
use. The `chains_config_missing` refusal stays as the defense-in-depth backstop.

Decision record: next free number is **D-570-01** (no D-570 record exists).

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-planrun-prose | implementer | — | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md | 6 | sequence | sonnet | prose/routing edit across 6 edition surfaces; correctness is asserted by route-reachability + contract validators (prose presence), not by a unit test — no natural failing-unit-test exists |
| n2-finalize-prose | implementer | — | commands/kaola-workflow-finalize.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md | 6 | sequence | sonnet | prose/routing edit across 6 edition surfaces; correctness is asserted by route-reachability + contract validators (prose presence), not by a unit test — no natural failing-unit-test exists |
| n3-review | code-reviewer | n1-planrun-prose, n2-finalize-prose | — | 1 | sequence | opus | — |
| n4-finalize | finalize | n3-review | CHANGELOG.md, docs/decisions/D-570-01.md | 2 | sequence | — | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-planrun-prose | complete |
| n2-finalize-prose | complete |
| n3-review | complete |
| n4-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (n1-planrun-prose) | subagent-invoked | evidence-binding: n1-planrun-prose f656f40c435c | |
| implementer (n2-finalize-prose) | subagent-invoked | evidence-binding: n2-finalize-prose 45b1a22143b3 | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review 0f57c8f21ddf | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize 868be9a6e118 | |

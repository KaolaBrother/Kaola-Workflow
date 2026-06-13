# Workflow Plan — issue-443

<!-- plan_hash: ffd3aa6ef629d88f102d587fa5531311b5f70dd3c731e8462c13a638d0d2161e -->

## Meta

issue: 443
labels: area:scripts, area:workflow-phases, enhancement
goal: ship the D-420 P1 autopilot driver (kaola-workflow-autopilot.js stage aggregator + slim /kaola-workflow-auto command) wired to the merged #427/#428/#429/#430/#432/#435/#440/#441 receipt contracts, in its disjoint lane, all four chains green

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-architect | code-architect | — | — | 1 | sequence | opus |
| n2-autopilot | tdd-guide | n1-architect | scripts/kaola-workflow-autopilot.js, plugins/kaola-workflow/scripts/kaola-workflow-autopilot.js | 2 | sequence | sonnet |
| n3-schema-route | implementer | n1-architect | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js | 4 | sequence | sonnet |
| n4-scout-contract | implementer | n1-architect | agents/issue-scout.md, plugins/kaola-workflow/agents/issue-scout.toml, plugins/kaola-workflow-gitlab/agents/issue-scout.toml, plugins/kaola-workflow-gitea/agents/issue-scout.toml | 4 | sequence | sonnet |
| n5-commands | implementer | n2-autopilot, n3-schema-route | commands/kaola-workflow-auto.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-auto.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-auto.md, plugins/kaola-workflow/skills/kaola-workflow-auto/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-auto/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-auto/SKILL.md | 6 | sequence | sonnet |
| n6-registration | implementer | n2-autopilot | scripts/kaola-workflow-install-manifest.js, plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js, scripts/validate-script-sync.js | 3 | sequence | sonnet |
| n7-forge-ports | implementer | n2-autopilot, n6-registration | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-autopilot.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-autopilot.js | 2 | sequence | sonnet |
| n8-reachability | implementer | n3-schema-route, n5-commands | scripts/test-route-reachability.js, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 6 | sequence | sonnet |
| n9-tests | tdd-guide | n2-autopilot | scripts/test-autopilot.js, package.json | 2 | sequence | sonnet |
| n10-review | code-reviewer | n2-autopilot, n3-schema-route, n4-scout-contract, n5-commands, n6-registration, n7-forge-ports, n8-reachability, n9-tests | — | 1 | sequence | opus |
| n11-docs | doc-updater | n10-review | CHANGELOG.md, docs/architecture.md, docs/decisions/D-443-01.md | 3 | sequence | sonnet |
| n12-finalize | finalize | n11-docs | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

This is the D-420 P1 autopilot driver — deliberately LAST in the D-420 family. ALL hard
dependencies are CLOSED+merged on main (#427, #428, #429, #430, #432, #435, #440, #441). The
autopilot script is a thin **stage state-machine aggregator** that READS the already-merged receipt
and envelope contracts and OWNS stage atomicity + receipts; the AGENT owns selection/consent/dispatch
(the lean-orchestrator boundary #44 holds — a script NEVER dispatches agents).

**PARALLEL-SAFETY (critical, #443 lane discipline).** A second session shares this origin and may
claim a hub issue (#439/#445/#446/#451) at any moment. #443 stays in its disjoint lane: NO node
write set touches `scripts/kaola-workflow-adaptive-node.js`, `kaola-workflow-plan-validator.js`,
`kaola-workflow-next-action.js`, `kaola-workflow-commit-node.js`, `kaola-workflow-parallel-batch.js`,
or the EXISTING `kaola-workflow-plan-run` ×6 prose. #443 only ADDS the new autopilot script, the new
`/kaola-workflow-auto` command surface, route-reachability pins, scout profiles, install manifest,
tests, and docs. If any node discovers it genuinely needs to edit a hub file, STOP and surface it as
a blocker (`stop: typed_refusal`) rather than authoring it.

**n1-architect (design — READ-ONLY).** code-architect is a read-only role (no write set). It SETTLES
the design that constrains every downstream node and emits it as its `.cache` evidence; the durable
decision record `docs/decisions/D-443-01.md` (verified next free id — no D-443 record exists; series
continues from D-442-01 (existing)) is WRITTEN by the n11-docs doc-updater after review (a doc
artifact, and the only write role that may carry it). The settled design: the autopilot stage
state-machine (scout→claim→plan→run→finalize); the `next --goal <text> [--project X] --json` / `digest`
CLI surface; the stop-payload schema `{ stop, stage, project, details, receipt_path }` with reasons
`goal_satisfied | backlog_empty | consent_halt | security_halt | typed_refusal | repair_limit`; the
`KAOLA_AUTOPILOT_REPAIR=ask` default vs `auto` (auto applies ONLY a mechanical-class `proposed_repair`
from the #440 triage payload, logged to digest; else halts); the digest
`kaola-workflow/{project}/.cache/autopilot-digest.jsonl` (append-only, one line per transition
`{ts, stage, result, receipt_path}`, crash-resume = replay last line); v1 = ONE bundle per invocation,
exits `goal_progress` with the scout's next recommendation; and the GROUND-TRUTH bindings:
finalize/sink leg gates on #429's `sink-receipt.json` step-receipt (NOT direct sink-merge.js,
NOT prose), tests-green = #432 `.cache/chain-receipt.json`, goal semantics include #435 (filing
run-discovered gap issues SATISFIES the goal — read `goal_check` from cmdFinalize's #441 closure
receipt), barrier overflows surface as `stop: typed_refusal` carrying the #440 `triage` object.
opus because its decisions constrain all downstream work; critical-path root.

**n2-autopilot (the script, tdd-guide).** Canonical `scripts/kaola-workflow-autopilot.js` + the
byte-identical codex twin `plugins/kaola-workflow/scripts/kaola-workflow-autopilot.js`. Forge-neutral
aggregator — names NO forge CLI binary (it composes over the already-merged receipt/envelope shapes,
never invoking sink-merge.js or a forge command directly), exactly the run-chains / release / gap-sweep
pattern (byte-identical claude↔codex; gitlab/gitea ports are rename-normalized). tdd-guide because the
stop-taxonomy resolution, digest append/replay, and repair-class gating are all cleanly unit-testable
(failing-test-first). It READS the merged #440 `triage`/`proposed_repair` families (kinds
`write_set_swap|add_to_write_set|revert_overflow|repair_node`) and #441
`parseGoal`/`goal_check`/`KAOLA_GOAL` — it does NOT re-implement or mutate them.

**n3-schema-route (route constants, implementer).** Adds `AUTO_COMMAND='/kaola-workflow-auto'` /
`AUTO_SKILL='kaola-workflow-auto'` to `kaola-workflow-adaptive-schema.js` and exports them. The schema
is a `mirror_write` ×4 byte-identical group (md5-locked across all four trees) — all four copies in
ONE node with the shared canonical spec "mirror the canonical schema edit verbatim; the schema carries
no forge vocabulary" so the four copies converge by construction (#309). Disjoint from n2.

**n4-scout-contract (backlog_empty extension, implementer).** Extends the issue-scout output contract
with the `{ backlog_empty: true, recommended_bundle: null }` output shape (the scout today always
returns `recommended_bundle`). Semantically-coupled cross-edition prose (#309): the Claude
`agents/issue-scout.md` + 3 byte-mirrored `plugins/*/agents/issue-scout.toml` twins in ONE node,
shared canonical spec "add the backlog_empty output shape to the Output Format section; mirror the md
into each toml twin's edition-neutral style; name no forge CLI." NOT an agent-set delta (the scout
profile already exists — no registration-surface fan-out). Disjoint from n2/n3.

**n5-commands (the ×6 routing surface, implementer).** The new `/kaola-workflow-auto` command
propagates to all SIX prose surfaces (#400): 3 Claude commands (`commands/`, gitlab, gitea) + 3 Codex
SKILL packs (github-codex `plugins/kaola-workflow/skills/`, gitlab, gitea). Semantically-coupled
cross-edition prose (#309) → ONE node at the 6-file ceiling, shared canonical spec: "slim entry
command that shells `kaola-workflow-autopilot.js next --goal … --json`, surfaces the stop payload, and
keeps the #44 selection-aloud boundary (script never dispatches); forge-neutral SKILL prose — name no
forge CLI binary, the forge contract validators forbid `\bgh\b`/`/pull request/i`/cross-tree
`plugins/kaola-workflow/scripts` in SKILLs." Depends n2 (script exists) + n3 (route constant exists).

**n6-registration (install manifest + sync family, implementer).** Adds
`'kaola-workflow-autopilot.js'` to the install-manifest `SUPPORT_SCRIPTS` frozen array (byte-pair:
both `scripts/kaola-workflow-install-manifest.js` and the codex twin) — this single-source edit feeds
all three install.sh SUPPORT_SCRIPT_NAMES blocks AND derives the forge-port names via renameIfPorted.
Also enrolls the script in `scripts/validate-script-sync.js` COMMON_SCRIPTS (canonical↔codex byte
parity) + adds the `autopilot forge ports` entry to RENAME_NORMALIZED_FAMILIES (the run-chains/release/
gap-sweep template). Depends n2 (script must exist for renameIfPorted's on-disk check). 3 files.

**n7-forge-ports (gitlab/gitea ports, implementer).** Mechanical rename-normalized mirrors of the
canonical autopilot script: `kaola-gitlab-workflow-autopilot.js` + `kaola-gitea-workflow-autopilot.js`.
Canonical spec = the FULL accumulated root diff of `scripts/kaola-workflow-autopilot.js` vs the run
base (`git diff <base>..HEAD -- scripts/kaola-workflow-autopilot.js`) — mirror EVERY hunk modulo the
`kaola-workflow-` → `kaola-{forge}-workflow-` prefix transform; the script carries no forge CLI tokens
so the ports are body-identical after the prefix rename (the edition-sync `--check` byte-compares
against the regenerated reference). Depends n2 (canonical body) AND n6 (RENAME_NORMALIZED_FAMILIES
entry must exist or `validate-script-sync.js`/`edition-sync --check` cannot verify the ports). 2 files.

**n8-reachability (route-reachability pins, implementer).** Appends the new `AUTO_COMMAND`/`AUTO_SKILL`
targets to the registry-driven reachability arrays so every edition's contract validator + the
`test-route-reachability.js` twin assert the new route resolves to an installed surface: T2
`emittedCommandTargets` in the claude validator byte-pair (`scripts/validate-workflow-contracts.js` +
`plugins/kaola-workflow/scripts/validate-workflow-contracts.js`), T1 `emittedSkillTargets` in the
github-codex `scripts/validate-kaola-workflow-contracts.js` + the two forge validators, and BOTH
arrays in `scripts/test-route-reachability.js`. Depends n3 (schema constants exist) + n5 (the 6
surfaces exist, or the pin reds). 6 files at the ceiling.

**n9-tests (autopilot test suite, tdd-guide).** New `scripts/test-autopilot.js` (the run-chains/release
naming convention): stage walk over a mock project (scout→…→finalize) with digest replay after kill;
each stop reason from a fixture; `repair=ask` halts where `repair=auto` applies-and-logs; backlog_empty
round-trip. Wires the test into the claude chain in `package.json`
(`scripts."test:kaola-workflow:claude"`, before `simulate-workflow-walkthrough.js`); the codex/gitlab/
gitea chains cover the forge ports via their walkthroughs + `validate-script-sync`/`edition-sync
--check` (the forge-neutral aggregator has no per-edition behavior to assert separately). Depends n2.

**n10-review (G1 code-reviewer, opus).** Post-dominates every code-producing node (n2–n9) — the only
gate required: labels (`area:scripts, area:workflow-phases, enhancement`) are NOT in SENSITIVE_LABELS
and no write-set path matches a Phase-5 SENSITIVE_PATTERN, so G2 (security-reviewer) is NOT triggered.
opus reviewer over the cheap implementers (strong-reviewer-over-cheap-implementer heuristic), and the
receipt-binding correctness (gates on the RIGHT seam: #429 step-receipt not direct sink-merge.js) is
subtle enough to warrant deep reasoning.

**n11-docs (doc-updater).** CHANGELOG `[Unreleased]` entry (write "×6" for the command surface and
"×4" for the script editions — NOT the recurring "×4" propagation-gap symptom for the command) +
docs/architecture.md autopilot section + the durable decision record `docs/decisions/D-443-01.md`
(next free id, capturing the n1-architect design). Depends n10 (review pass) so docs describe the
reviewed shape.

**n12-finalize (sink).** Docs-only sink write (CHANGELOG.md). No model (the sink is never dispatched
as a subagent). Cross-edition diff (#307): all four `npm run
test:kaola-workflow:{claude,codex,gitlab,gitea}` chains must be green — run sequentially — recorded
before finalization (a green claude chain alone is insufficient: npm test `&&`-chains and
short-circuits).

## Node Ledger

| id | status |
| --- | --- |
| n1-architect | complete |
| n2-autopilot | complete |
| n3-schema-route | complete |
| n4-scout-contract | complete |
| n5-commands | complete |
| n6-registration | complete |
| n7-forge-ports | complete |
| n8-reachability | complete |
| n9-tests | complete |
| n10-review | complete |
| n11-docs | complete |
| n12-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1-architect) | subagent-invoked | evidence-binding: n1-architect 4eccce4834fc | |
| tdd-guide (n2-autopilot) | subagent-invoked | evidence-binding: n2-autopilot d01e2785629d | |
| implementer (n3-schema-route) | subagent-invoked | evidence-binding: n3-schema-route 9524c5aae726 | |
| implementer (n4-scout-contract) | subagent-invoked | evidence-binding: n4-scout-contract 47f89c4b8b6e | |
| implementer (n5-commands) | subagent-invoked | evidence-binding: n5-commands dbff7e8f3eac | |
| implementer (n6-registration) | subagent-invoked | evidence-binding: n6-registration daf295857520 | |
| implementer (n7-forge-ports) | subagent-invoked | evidence-binding: n7-forge-ports 7e1981214a10 | |
| implementer (n8-reachability) | subagent-invoked | evidence-binding: n8-reachability 1e819ecd382e | |
| tdd-guide (n9-tests) | subagent-invoked | evidence-binding: n9-tests d9741bfadbf2 | |
| code-reviewer | subagent-invoked | evidence-binding: n10-review 3473e72f6af1 | |
| doc-updater (n11-docs) | subagent-invoked | evidence-binding: n11-docs 951099118ade | |
| finalize (n12-finalize) | main-session-direct | evidence-binding: n12-finalize 0032ac3688b3 | |

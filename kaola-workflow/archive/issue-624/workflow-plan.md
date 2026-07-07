# Workflow Plan — issue 624

<!-- plan_hash: 77cc08943b33ae2dbd5f0838e21d681336c014af6ffd8b1449c462c9f6fecf7d -->

## Meta
speculative_open_policy: auto
labels:
validation_command: npm test

## Plan Notes

**Goal (624).** The adaptive finalize four-gate merge barrier prose is broken on 5 of its 6
surfaces — the historic forge-codex dead zone (#400) is live again and was NOT machine-caught (all
four chains green at HEAD). Two coupled defects:

1. **The two forge-codex finalize SKILLs are missing the ENTIRE adaptive prerequisite block.**
   `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md` and its gitea twin branch
   only on `fast` (defaults to `full` when absent) — NO `workflow_path: adaptive` branch, NO
   `validator_script` resolver, NO `--resume-check/--gate-verify/--barrier-check/--verdict-check`
   block. Worse, each forge SKILL's Chain-Receipt Gate says "resolved the same way as
   `validator_script` above" but `validator_script` is defined NOWHERE — a dangling reference. The
   github-codex SKILL (`plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md:15-70`) carries
   the correct block; it never reached the two forge packs even though both fully support adaptive
   execution. Impact: an adaptive run on the GitLab/Gitea Codex runtime reaches finalize with no
   instruction to run the script-enforced pre-merge barrier, and "defaults to full" pushes the agent
   toward phase-5 artifacts that do not exist in an adaptive run — gates silently skipped.

2. **All three Claude finalize COMMANDS say "three gates" above a four-gate block.**
   `commands/kaola-workflow-finalize.md:25` and both forge command twins say "script-enforced by
   three gates — run all three" followed by FOUR invocations (`--resume-check`, `--gate-verify`,
   `--barrier-check`, `--verdict-check`). An agent trusting the prose count when reconstructing the
   check from summarized context drops `--verdict-check`, reopening the silently-passing-gate leak
   the fourth gate exists to close. The github-codex SKILL already says "run all four gates".

**Canonical spec — port VERBATIM, modulo forge nouns (no free-form re-authoring).** The single
source of truth for the ported adaptive block is
`plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` lines 15-70: the `If workflow_path:
adaptive, the adaptive path replaces Phase 1-5 ...` branch sentence (which DEFINES the dangling
`validator_script` and resolves the Chain-Receipt-Gate reference), the "The adaptive completion check
is **script-enforced** ... run all four gates" bash block, the four flag bullets
(`--resume-check`/`--gate-verify`/`--barrier-check`/`--verdict-check`), and the closing typed-refusal
sentence. Insert it AFTER the fast-branch paragraph and BEFORE the `### Chain-Receipt Gate` heading in
each forge SKILL. Mirror byte-for-byte EXCEPT the validator script name + cache-find path:
- gitlab: `validator_script="plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js"`
  and the find fallback `-path '*/kaola-workflow-gitlab/*/scripts/kaola-gitlab-workflow-plan-validator.js'`.
- gitea: `validator_script="plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js"`
  and the find fallback `-path '*/kaola-workflow-gitea/*/scripts/kaola-gitea-workflow-plan-validator.js'`.
Keep the block forge-neutral otherwise (no `gh`/`glab`/`tea` binary, no forge brand nouns — the github
block names none). Do NOT introduce provenance (`#NNN`, `D-NNN`, `[INV-NN]`) into the SKILL/command
prose — these are agent-facing surfaces (CLAUDE.md). Provenance belongs only in the CHANGELOG and the
`.js` contract-validator comments.

**Command gate-count fix (3 files).** In `commands/kaola-workflow-finalize.md`,
`plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md`, and the gitea twin, replace the
literal `three gates — run all three` with `four gates — run all four`. Surgical substring edit only;
the four invocations below it already exist and are unchanged.

**Machine pin (the RED test — this is why the node is `tdd-guide`, not `implementer`).** The whole
point of #624 is that this surface hollowed out and NO machine check caught it. Add, to EACH forge
contract validator (`plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
and `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`), an additive
`assert(...)` block — modeled on the existing #345 finalize-COMMAND four-gate pin already in those
files — that asserts the finalize SKILL carries the adaptive branch marker (`workflow_path: adaptive`)
AND the four-gate barrier (`validator_script`, `--resume-check`, `--gate-verify`, `--barrier-check`,
`--verdict-check`). RED before the SKILL block is ported (the forge SKILLs lack `workflow_path:
adaptive` today → `npm run test:kaola-workflow:{gitlab,gitea}` fails on the new assertion); GREEN once
the block lands. The pin `.js` files carry provenance comments (scripts, not agent prompts), so the
`#624/#400` reference belongs there. This is a silently-passing-gate bug whose fix IS the regression
oracle — write the failing assertion first, watch it fail, then satisfy it (`tdd-guide`).

**Write-set cohesion — one node, no fan-out.** All seven files are ONE semantic change (restore the
finalize four-gate barrier consistency across the six routing surfaces). The contract-validator pins
are the RED/GREEN oracle for the SKILL ports, so they MUST move atomically with them (splitting the
pin from the SKILL would strand a forge chain RED). The two forge SKILL ports share a single canonical
source and would risk prose divergence if split into parallel legs; the profile's cross-edition rule
keeps semantically-coupled cross-edition prose in ONE node. The change is small and file-coupled with
no genuinely-independent second lane, so a wider fan-out would only fragment context for zero makespan
gain (CLAUDE.md precedence #3: cheapest sufficient mechanism). Not a `generated_port_split` set: the
forge contract validators are per-edition hand-maintained (not GENERATED_AGGREGATORS), and the finalize
SKILLs are DIVERGENT forge hand-ports (not byte-synced) — hand-edit each.

### DAG shape / scheduling rationale

- **Linear pipeline, right-sized (no fan-out).** `n1-finalize-barrier` (all 7 files) →
  `n2-review` (G1 gate) → `n3-finalize` (sink). Serialize on the true dependencies only; there is no
  disjoint independent lane worth co-opening.
- **`n2-review` (`code-reviewer`, `reasoning`) post-dominates every code-producing node on every path
  to the sink (G1).** `n1` writes `.js` contract validators (code) plus workflow SKILL/command prose;
  the reviewer runs `validation_command` (the four chains — this IS a cross-edition diff, #307) as the
  falsifiable proof, and verifies: all six surfaces state "four gates"; each forge SKILL carries the
  FULL block with a DEFINED `validator_script` resolver (no dangling reference); the forge find-paths
  are forge-scoped (`*/kaola-workflow-gitlab/*` / `*/kaola-workflow-gitea/*`, never `*/kaola-workflow/*`);
  the block stays forge-neutral (no CLI binary / brand noun); and the new pins actually go RED without
  the block. `reasoning` because the review is reasoning-bound (a silently-passing-gate leak that four
  green chains failed to catch), not a mechanical diff — this is where the correctness floor lives.
- **`n3-finalize` (sink) writes CHANGELOG.md only.** No docs/*.md content is wrong: `--verdict-check`
  and the four-gate barrier are already correctly documented in `docs/api.md` /
  `docs/architecture.md`; the bug was purely that the FORGE SKILLs did not INSTRUCT running it. So the
  only documentation of record is a CHANGELOG `### Fixed` entry, which the sink writes by convention
  (mirroring the archived issue-616 plan, where `finalize` wrote CHANGELOG.md). No separate
  `doc-updater` node — there is no docs/*.md to transcribe into, so a doc-updater would duplicate the
  sink for a single changelog line (cheapest sufficient mechanism). No decision record: restoring
  dropped prose + adding a pin is not an architectural decision; CHANGELOG + commit provenance suffice.
- **No `security-reviewer`, `adversarial-verifier`, `main-session-gate`, or `knowledge-lookup`.** No
  sensitive surface (empty labels; finalize prose + doc-contract pins touch no auth/crypto/secret/
  network path → no G2); every acceptance check is a delegable contract chain (no non-delegable
  GPU/device/human gate → no `main-session-gate`); every fact is local to the repo's own finalize
  surfaces and the github-codex canonical block (no external library/API knowledge → no
  `knowledge-lookup`). The reasoning-tier reviewer + the two new forge pins + the four contract chains
  are a sufficient external oracle. Speculative-open is a no-op here: the only post-gate node is the
  PROTECTED, unique `finalize` sink (speculative-ineligible), so `speculative_open_policy: auto` never
  fires.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-finalize-barrier | tdd-guide | — | plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md, commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 7 | sequence | standard | — |
| n2-review | code-reviewer | n1-finalize-barrier | — | 1 | sequence | reasoning | — |
| n3-finalize | finalize | n2-review | CHANGELOG.md | 1 | sequence | — | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-finalize-barrier | complete |
| n2-review | complete |
| n3-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-finalize-barrier) | subagent-invoked | evidence-binding: n1-finalize-barrier 42551f908fc9 | |
| code-reviewer | subagent-invoked | # Review: n2-review (issue-624) — adaptive finalize four-gate barrier propagatio | |

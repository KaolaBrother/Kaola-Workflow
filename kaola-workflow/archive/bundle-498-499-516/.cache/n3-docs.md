evidence-binding: n3-docs a717b721945c

# n3-docs (doc-updater) — bundle #498 + #499 + #516

All edits run from /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-498-499-516.

## Files touched (7)

1. `commands/kaola-workflow-plan-run.md`
2. `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md`
3. `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md`
4. `plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md`
5. `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md`
6. `plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md`
7. `docs/plan-run-cards/resume.md`

## #498 — what changed (6 plan-run surfaces)

**Frontmatter `description:` (all 6 surfaces):** replaced "when lane containment is off" with
"when the write-parallelism conjunction is not met". The old phrasing implied `KAOLA_LANE_CONTAINMENT`
alone gates write parallelism; the new phrasing defers to the three-way conjunction without naming
only one toggle.

**Body bullet (all 6 surfaces):** replaced "write parallelism requires `KAOLA_LANE_CONTAINMENT=true`"
with "write parallelism requires the full conjunction — `KAOLA_LANE_CONTAINMENT`, `KAOLA_LEG_ISOLATION`,
and `--write-overlap-consent` — see the activation recipe below." The recipe PIN block
(`<!-- PIN: leg-isolation-recipe -->`) was already correct and left intact in all 6 surfaces.

PIN preserved: `<!-- PIN: leg-isolation-recipe -->` and `--write-overlap-consent` literal present
in all 6 surfaces (verified by test-route-reachability.js T8).

## #499 — what changed (docs/plan-run-cards/resume.md)

**Orient command invocation:** removed fabricated `--plan`/`--ledger` arguments; all command
invocations now use `--project {project}` matching the verified CLI interface.

**Field table (§1):** replaced three fabricated fields (`plan_frozen`, `resume_state`, `active_node`)
with verified real orient fields: `result`, `resumeCheck.ok`, `resumeCheck.reasonCode`,
`inProgressNode`, `cacheState`, `requires_redispatch`, `allDone`, `consentHalt`.

**§2 Interpreting orient output:** restructured around `inProgressNode` (null vs set) and
`result: "refuse"` for running-set crashes, replacing the `resume_state` states.

**§3–§8:** all subcommand invocations switched from `--plan`/`--ledger` form to `--project` form;
`{active_node}` placeholder replaced with `{inProgressNode}`.

**§6:** Unfrozen plan detection changed from `plan_frozen: false` to `resumeCheck.ok: false` with
discrimination via `resumeCheck.reasonCode` (`"plan_not_frozen"` vs `"plan_hash_mismatch"`).

**§7:** changed `reason: plan_hash_mismatch` to `reasonCode: plan_hash_mismatch` (the typed token
lives in `reasonCode`, not `reason`); changed `result: ok` to `result: pass` (matching the
`--resume-check` validator emission verified in plan-validator.js line 1591); noted that `open-next`
now carries the integrity layer (#499 fix).

**Quick decision tree:** rewritten using real field names.

## Verified orient field names (#499 anti-fabrication)

Fields confirmed via two sources:
1. `runOrient` return statement (scripts/kaola-workflow-adaptive-node.js lines 1496-1518)
2. Live execution: `node scripts/kaola-workflow-adaptive-node.js orient --project bundle-498-499-516 --json`

Real fields emitted: `result`, `resumeCheck` (sub-object: `ok`, `result`, `reasonCode`, `planHash`),
`nextAction`, `consentHalt`, `escalatedToFull`, `bundleId`, `issueNumbers`, `closurePolicy`,
`primaryIssue`, `inProgressNode`, `cacheState`, `inProgressNodes`, `batch`, `runningSet`,
`allDone`, `enterBatch`, `requires_redispatch` (present-only-when-true), `frontier`.

NOT present in the standard path (card previously cited these — now corrected): `plan_frozen`, `active_node`.
`resume_state` exists only on the `bundle_state_incoherent` refuse path (emitted as `resume_state: 'corrupt_incoherent_bundle'`);
the fabricated `clean|mid_node|crashed` enum the card had cited does not exist and has been removed.

## Verify exit codes (all 0/green)

- node scripts/test-route-reachability.js → EXIT 0 (170 assertions, PIN T8 intact on all 6 surfaces)
- node scripts/simulate-workflow-walkthrough.js → EXIT 0 (Workflow walkthrough simulation passed)
- node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js → EXIT 0
- node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js → EXIT 0

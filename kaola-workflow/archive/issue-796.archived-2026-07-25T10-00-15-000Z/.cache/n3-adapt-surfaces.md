evidence-binding: n3-adapt-surfaces 6c3eb73607ed
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: glue/wiring — hand-porting an agent-facing entry contract, dispatch-prompt field, and rendering table across 6 command/SKILL prose surfaces per a binding spec (§2 of n1-route-spec); no new runtime logic, so no meaningful failing unit test fits — verified instead by keeping the existing contract-validator/route-reachability regression suite green before and after.
<!-- regression-green|build-green|smoke-integration -->
regression-green: ran `node scripts/validate-workflow-contracts.js` (exit 0, "Workflow contract validation passed"), `node scripts/validate-kaola-workflow-contracts.js` (exit 0, "Kaola-Workflow Codex contract validation passed"), `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md` (exit 0, "passed (1 file(s))"), `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md` (exit 0), `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md` (exit 0), `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md` (exit 0), and `node scripts/test-route-reachability.js` (exit 0, "Route-reachability test passed (2221 assertions)") — all green both structurally (no pre-existing pin broke) and on my new prose (P5-shaped needles all present on all six surfaces). Exit codes captured directly via `echo "exit=$?"` immediately after each command, never through a piped `| tail`.
<!-- OPEN n1-route-spec's evidence file and append its line-1 binding nonce as the value below -->
upstream_read: n1-route-spec 4fbcce962322

## What changed

Implemented §2 (F2, the task-description route) of `n1-route-spec.md` on all six adapt surfaces
in my declared write set — nothing else:

- `commands/kaola-workflow-adapt.md`
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md`
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md`
- `plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md`
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md`
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md`

Five edits, applied identically (byte-identical new prose; only pre-existing forge-noun/script-name
lines around them differ) to all six files:

1. **§2.1 — frontmatter `argument-hint`** (3 command surfaces only; the 3 SKILLs carry no
   `argument-hint`): `<issue number>` → `[issue number | issue set | task description]`.
2. **§2.2 — new `## Entry contract — what this surface receives` section**, inserted immediately
   before `## Front end: claim + author …` (commands) / `## Front end: claim + author (the
   `workflow-planner` agent role)` (SKILLs). Documents the four entry shapes (issue number/project,
   issue set, free-form task description, empty) and the three-arm fail-closed resolution procedure
   for the task-description shape (exactly-one-match / file-new-issue / ambiguous-or-offline-STOP),
   verbatim per the spec.
3. **§2.3 — the "router enters with" sentence.** Command surfaces: `{issue}` →
   `{issue-or-project}` with the shape enumeration. SKILL surfaces: "the agent-selected target
   issue" → "the agent-selected target … an issue number, an issue set, or the issue a task
   description resolved to … or with NO target at all …".
4. **§2.4 — the literal planner dispatch prompt** (the HARD CONSTRAINT surface). Command `prompt=`
   line and SKILL `message:` line both gain one field: `Binding scope: {task-description-or-none}.`
   (commands) / `Binding scope: <task-description-or-none>.` (SKILLs) — no double-quote character
   introduced, five pinned terms (`Repository root:`, `Selected issue/set/project:`,
   `workflow-planner`, `agents/workflow-planner.md`, `bounded durable handoff packet`) and
   `subagent_type="workflow-planner"` / `model="{WORKFLOW_PLANNER_MODEL}"` all untouched. Added the
   4-row rendering table immediately after the dispatch block on all six surfaces. SKILL surfaces
   additionally gained the `no_target` task-suffix sentence beside the existing sanitize
   instruction.
5. **§2.5 — pre-claim ordering.** Prepended the "Resolve the entry shape first …" sentence directly
   before `**Before the claim (main session):**` (commands) / `**Entry guard (this session, before
   the delegation).**` (SKILLs).

§2.6 (Bundle Lane, re-plan control plane, claim-escalate PIN block, Question/bug-shaped section)
was left untouched, as instructed — no provenance (issue refs / decision IDs) was added anywhere.

## Verification detail

- Confirmed no `"` character inside any `prompt="…"` value (`grep -o '"' | wc -l` = 2, the
  enclosing pair only, on all three command files).
- Confirmed the five pinned prompt terms + `subagent_type="workflow-planner"` +
  `model="{WORKFLOW_PLANNER_MODEL}"` are present verbatim in all three command files.
- Confirmed `Entry contract`, `Binding scope:`, and `no target named; run no-target survey mode`
  (the P5 needle set) are present on all six surfaces.
- Diffed the root vs. gitlab vs. gitea command files, and the gitlab vs. gitea SKILL files: every
  remaining diff line is a pre-existing forge-noun / script-name difference (e.g.
  `kaola-workflow-claim.js` vs `kaola-gitlab-workflow-claim.js`, `--sink pr` vs `--sink mr`) — none
  of my new prose diverges across editions.
- Ran the four validators/tests above (all exit 0) both as a project-wide regression check and as
  confirmation that my six-surface edit set introduced no forge-forbidden token
  (`gh`/`GitHub`/`pull request` for gitlab; `glab`/`GitLab`/`merge request` for gitea) and broke no
  existing route-reachability pin.
- Did not touch `templates/routing/required-blocks.js`, `scripts/test-route-reachability.js`, or
  any contract validator — no write-set finding to report; nothing in my lane needed to reach
  outside the six declared files.

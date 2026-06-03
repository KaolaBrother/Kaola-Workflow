# Fast Summary: issue-240

## Status
PASSED

## Scope
- Write Set: scripts/kaola-workflow-roadmap.js, plugins/kaola-workflow/scripts/kaola-workflow-roadmap.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js, scripts/simulate-workflow-walkthrough.js, docs/api.md, docs/workflow-state-contract.md, CHANGELOG.md
- Acceptance: node scripts/simulate-workflow-walkthrough.js (exit 0 + "Workflow walkthrough simulation passed"); node scripts/validate-script-sync.js (exit 0); npm test (all four lanes green); 3 port smoke-tests (gitlab/gitea/github-plugin generate+validate with a `_rules.md` fixture)

## Plan
Teach the roadmap generator to append an optional project-local `kaola-workflow/.roadmap/_rules.md`
to the `## Rules` section under a `### Project rules` sub-heading. Thread a `dir` argument into
`buildRoadmapContent(issues, dir)` (guarded so the exported one-arg contract stays safe) and pass it
from every call site (generate + validate, plus gitlab/gitea `refresh`). No-op when the file is
absent → byte-identical to today. Ships across all four editions. See `.cache/planner.md` for the
exact per-file edits and the #1 invariant (all call sites within a script must thread `dir`
consistently or validate goes false-stale / refresh drops rules).

Fast-path eligibility: approach_ambiguity=no (single mechanical approach, cross-edition repetitive
edit); no mechanical write-set ceiling exists (parseFileCount is report-only) and there is direct
precedent for 7-file cross-edition fast-path write sets.

## Implementation Evidence
- Builder change applied to all four roadmap scripts: `buildRoadmapContent(issues, dir)` with a
  `dir`-guarded `_rules.md` append (`path.join` inside `if (dir)` so the exported one-arg call is safe).
  `dir` threaded through every call site: github canonical+plugin = regenerate + cmdValidate (2 sites,
  byte-identical); gitlab/gitea = refresh-inline + regenerate + cmdValidate (3 sites each).
- New regression test `testRoadmapProjectRulesAppend` (3 phases: absent no-op, present append +
  built-in-rules-preserved, validate-not-stale), registered in `main()`.
- TDD: RED captured before implementation (PHASE 2 failed); GREEN after.
- `node scripts/simulate-workflow-walkthrough.js` → exit 0, "Workflow walkthrough simulation passed".
- `node scripts/validate-script-sync.js` → exit 0 ("11 common scripts and 5 byte-identical file group in sync").
- `npm test` → exit 0 across all four lanes (Claude / Codex / GitLab / Gitea walkthroughs + contracts).
- Mutation check: neutering the `rules += '\n\n### Project rules\n' + extra` line turns PHASE 2 red (exit 1); line restored byte-exact (sync re-confirmed OK).
- Port smoke-tests (scratch git repos): gitlab / gitea / github-plugin each → generate appends
  `### Project rules` + marker, validate `ok`, absent `_rules.md` → no-op + validate `ok`.

## Review
code-reviewer (opus): the #240 feature code PASSED all 7 review checks (acceptance, call-site
threading invariant, guard correctness, no-op byte-fidelity, test teeth, scope discipline, security).
The reviewer returned BLOCK on ONE issue that was NOT #240 code: `kaola-workflow/ROADMAP.md` had been
overwritten with Gitea content by the tdd-guide agent's smoke run from the repo root. Orchestrator
restored it (`git checkout -- kaola-workflow/ROADMAP.md`; `validate` → `ok`); this is a state-file
cleanup, not a code defect, so no escalation. Net: clean PASS. See `.cache/code-reviewer.md`.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| tdd-guide | invoked | .cache/tdd-guide.md | |
| code-reviewer | invoked | .cache/code-reviewer.md | |

## Escalation
N/A

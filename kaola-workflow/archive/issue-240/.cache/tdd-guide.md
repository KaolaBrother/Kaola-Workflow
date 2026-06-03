# tdd-guide output — issue #240 (fast path execute)

## RED evidence (before production change)
```
Error: PHASE 2: ROADMAP.md must include ### Project rules when _rules.md is present
    at assert (scripts/simulate-workflow-walkthrough.js:22:25)
    at testRoadmapProjectRulesAppend (scripts/simulate-workflow-walkthrough.js:458:3)
    at main (scripts/simulate-workflow-walkthrough.js:6297:5)
EXIT=1
```
PHASE 1 (absent no-op) passed; PHASE 2 (present append) failed as expected.

## Edits
- `scripts/simulate-workflow-walkthrough.js`: added `testRoadmapProjectRulesAppend(tmp)` after
  `testRoadmapGenerateAtomicReplace`; registered call in `main()` right after that test.
- `scripts/kaola-workflow-roadmap.js`: builder `(issues, dir)` + guarded `_rules.md` append;
  threaded `dir` at `regenerateRoadmap` and `cmdValidate`.
- `plugins/kaola-workflow/scripts/kaola-workflow-roadmap.js`: `cp` from canonical (byte-identical).
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js`: builder + 3 call sites
  (inline refresh, regenerateRoadmap, inline cmdValidate) threaded.
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js`: same 3-site change.

## GREEN evidence (agent-reported; orchestrator re-verifies independently)
- `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed", EXIT=0
- `node scripts/validate-script-sync.js` → "OK: 11 common scripts and 5 byte-identical file group in sync.", EXIT=0
- gitlab/gitea behavioral smoke → "project rules present"

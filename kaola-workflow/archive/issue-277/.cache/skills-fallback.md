# skills-fallback node evidence

non_tdd_reason: skill prose edit — removing an inline-fallback grant from 3 finalize SKILL.md files and tightening the escape clause in the adapt SKILL.md; no behavioral logic exists that could have a failing unit test.

build-green: diff scope = exactly 4 declared files (git diff --stat HEAD scoped to the 4 paths: 4 files changed, 4 insertions(+), 4 deletions(-)); grant-tightening confirmed by grep — "when that subagent is available" returns zero hits across all 3 finalize files; `local-fallback-tool-unavailable` present in each finalize file (delegation paragraph at lines 76/71/71 + pre-existing step 2/3/table rows) and in adapt SKILL.md line 108 with the new logging clause ("MUST be recorded as `local-fallback-tool-unavailable` in the compliance ledger"); preserved-vocabulary confirmed — `local-fallback-explicit` still present in all 3 finalize files (step 2 acceptance check, step 3 doc-updater, and compliance table row); forbidden-token grep on added lines only returns zero hits (no `gh` word, `github.com`, `GitHub`, `PR URL`, `PR number`, `pull request`, `./scripts`, or `plugins/kaola-workflow/scripts` introduced).

## Write set
- plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md

## Verification commands

```
git diff --stat HEAD -- <4 files>
# exit 0; output: 4 files changed, 4 insertions(+), 4 deletions(-)

grep -n "when that subagent is available" <3 finalize files>
# exit 1 (no matches) → PASS

grep -n "local-fallback-tool-unavailable" <3 finalize files>
# hits in step 2, step 3, delegation paragraph (line 76/71/71), and table → PRESENT

grep -n "local-fallback-explicit" <3 finalize files>
# hits in step 2, step 3, and table rows → PRESENT

git diff HEAD -- <4 files> | grep '^+' | grep -v '^+++' | grep -E '\bgh\b|github\.com|...'
# exit 1 (no matches) → PASS: no forbidden tokens in added lines
```

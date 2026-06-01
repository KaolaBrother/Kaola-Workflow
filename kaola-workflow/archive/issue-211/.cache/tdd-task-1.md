# tdd-guide raw output — Task 1 (issue-211)

## Modified files (write-set only)
- scripts/validate-workflow-contracts.js
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js

## Commands run
- Orientation: read validator fully; grep DC heading + resume marker across 3 SKILL.md; awk DC-body slice; sed -n resume-pair lines.
- GREEN baseline: `node scripts/validate-workflow-contracts.js` → "Workflow contract validation passed".
- Edits: Block 1 (sectionBody + resumeClausePair helpers) after assertEveryDispatchHasModel; Block 2 (nextSkillEditions baseline-compare loop) after codex-manifest loop, before CHANGELOG assert.
- GREEN post-insertion: validator pass.
- RED A: `sed -i '' '29s/$/ /' plugins/kaola-workflow-gitlab/.../SKILL.md` (line 29 = `Codex subagent delegation is the default...`, inside DC body 27→53); validator exit 1; `git checkout --` revert.
- RED B: `sed -i '' '233s/absent/absebt/' plugins/kaola-workflow-gitea/.../SKILL.md` (line 233 = 2nd line of resume clause, after marker on 232); validator exit 1; `git checkout --` revert.
- GREEN again: validator pass.
- Mirror: `cp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js`.
- Byte-sync: `node scripts/validate-script-sync.js` → "OK: 11 common scripts and 2 byte-identical file group in sync."

## RED evidence
- Direction A (gitlab DC body): exit 1, message:
  `Error: plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md "## Delegation Contract" section must byte-match the github baseline plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md (issue #211 cross-forge parity)`
- Direction B (gitea resume clause): exit 1, message:
  `Error: plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md resume clause ("On resume, extract and reassign" line + next line) must byte-match the github baseline plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md (issue #211 cross-forge parity)`
- Messages not crossed (A fired DC assertion, B fired resume assertion).

## GREEN evidence
- Before edits: "Workflow contract validation passed".
- After all reverts: "Workflow contract validation passed".

## Final git status --porcelain
```
A  kaola-workflow/.roadmap/issue-211.md
 M plugins/kaola-workflow/scripts/validate-workflow-contracts.js
 M scripts/validate-workflow-contracts.js
?? kaola-workflow/issue-211/
```
Two ` M` = write-set files. Staged `.roadmap/issue-211.md` + untracked `kaola-workflow/issue-211/` are workflow scaffolding from startup/claim (not touched this task).

## Deviations
None. No SKILL.md, package.json, Codex validator, or forge validators touched.

# Documentation Docking — issue-278

## Changed files reviewed (git diff)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js — new `deleteIssueNote` helper + export (internal forge wrapper)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js — `clearAdvisoryClaim` marker deletion + slug threading
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js — 5 new tests
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js — new `deleteIssueComment` helper + export (internal forge wrapper)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js — `clearAdvisoryClaim` marker deletion + slug threading
- plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js — 5 new tests
- CHANGELOG.md — [Unreleased] → Fixed entry (#278)

## Acceptance vs. issue #278
- AC: GitLab/Gitea claim ports must delete the `<!-- kw:claim project=<slug> -->` marker on discard/release/finalize (parity with #275). MET — both ports list and delete the marker via the new forge delete helpers; project-scoped match preferred, generic-regex fallback; all 4 call sites thread the slug; OFFLINE + try/catch preserved.

## Documents checked
| Document class | Impact | Action |
|----------------|--------|--------|
| CHANGELOG.md | YES | Added [Unreleased] Fixed entry (#278). |
| README.md | none | No user-facing feature/usage/env-var change; bug fix to internal claim-port behavior. |
| docs/api.md | none | No public API/schema/CLI-output change; `deleteIssueNote`/`deleteIssueComment` are internal forge wrappers, not documented external contracts. |
| docs/architecture.md | none | No structural/data-flow change; the claim/clear lifecycle is unchanged in shape — only the missing marker-delete step is added, mirroring the already-documented GitHub #275 behavior. |
| .env.example | none | No new environment variables. |
| Inline comments | n/a | Code carries the #278/#275 rationale inline at the deletion block, mirroring the GitHub edition. |

## Gaps found and fixed
None. CHANGELOG is the only doc class with impact and it is updated. n4's frozen write-set is `CHANGELOG.md` only, which matches the actual doc impact — no out-of-lane doc edit is warranted or permitted.

## Final verdict
DOCKED

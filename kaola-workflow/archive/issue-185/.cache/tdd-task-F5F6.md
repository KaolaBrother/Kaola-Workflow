# TDD Task F5+F6 — Fix: GitLab and Gitea forge

## Status: complete (GREEN)

## Changes made
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js:12`: `? n :` → `? Math.min(n, 600000) :`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js:14`: `? n :` → `? Math.min(n, 600000) :`

## Validation
`npm test`: all 4 suites GREEN (gitlab + gitea suites exercise these via their forge modules)

evidence-binding: n8-scout 9656fefff04e
non_tdd_reason: agent-profile markdown + toml edit (documentation surface); no natural failing unit test — changes are prose additions to an agent instruction file and its three forge-neutral toml mirrors.
regression-green: node scripts/simulate-workflow-walkthrough.js passed (exit 0, "Workflow walkthrough simulation passed")

## verification_tier

regression-green

## Files changed

- agents/issue-scout.md
- plugins/kaola-workflow/agents/issue-scout.toml
- plugins/kaola-workflow-gitlab/agents/issue-scout.toml
- plugins/kaola-workflow-gitea/agents/issue-scout.toml

## Verification commands

```
node scripts/simulate-workflow-walkthrough.js
# exit 0 — "Workflow walkthrough simulation passed"

node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only plugins/kaola-workflow-gitlab/agents/issue-scout.toml
# exit 0 — "Kaola-Workflow GitLab forbidden-only check passed (1 file(s))"

node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only plugins/kaola-workflow-gitea/agents/issue-scout.toml
# exit 0 — "Kaola-Workflow Gitea forbidden-only check passed (1 file(s))"

diff plugins/kaola-workflow/agents/issue-scout.toml plugins/kaola-workflow-gitlab/agents/issue-scout.toml
diff plugins/kaola-workflow/agents/issue-scout.toml plugins/kaola-workflow-gitea/agents/issue-scout.toml
# both diffs empty — byte-identical confirmed

node scripts/validate-script-sync.js
# exit 0 — "OK: 22 common scripts, 30 byte-identical groups, 5 rename-normalized families, and 1 config/hooks.json family in sync."
```

## before_result

Workflow walkthrough simulation passed (exit 0) — no changes at that point.

## after_result

Workflow walkthrough simulation passed (exit 0).
All forge-neutral forbidden-only checks passed.
All three toml files byte-identical (diff empty).
validate-script-sync: 30 byte-identical groups in sync (exit 0).

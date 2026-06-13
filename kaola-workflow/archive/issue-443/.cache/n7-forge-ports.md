evidence-binding: n7-forge-ports 8ea1792871b1

REPAIR (reopened): re-mirror the two stale forge ports after the canonical kaola-workflow-autopilot.js received the `\Z`→`$(?![\s\S])` regex fix in n2.

non_tdd_reason: mechanical re-mirror — rename-normalization transform of an existing canonical into two forge-port files; no behavioral logic, no natural failing unit test for byte-identity port regeneration (migration/data-shape rename pass). Oracle = validate-script-sync.

verification_tier: build-green

transform:
  sed 's/kaola-workflow-/kaola-gitlab-workflow-/g' scripts/kaola-workflow-autopilot.js > <gitlab port>
  sed 's/kaola-workflow-/kaola-gitea-workflow-/g'  scripts/kaola-workflow-autopilot.js > <gitea port>

verification (build-green):
- BEFORE: validate-script-sync exit 1 (drift on both autopilot forge ports — expected stale state after n2 fix).
- AFTER: `node scripts/validate-script-sync.js` exit 0 — "OK: 23 common scripts, 30 byte-identical groups, 6 rename-normalized families, and 1 config/hooks.json family in sync."
- smoke: gitlab port `next --goal x --json` → {"stage":"scout","action":"dispatch_issue_scout",...} exit 0.

write_set (exactly the two declared): plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-autopilot.js + plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-autopilot.js.

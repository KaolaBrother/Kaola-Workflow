# forge-final-ports evidence — issue #328

non_tdd_reason: behavior-preserving forge ports — mirror of root adaptive-node bundle fields modulo forge nouns; roadmap ports unchanged (root needed no change); coverage is root tests + forge chains at finalize

## Task

Mirror the `runOrient` bundle-identity additions from root `scripts/kaola-workflow-adaptive-node.js` into the GitLab and Gitea edition-named adaptive-node ports. Confirm the forge roadmap ports need no change.

## Files Changed

- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js` — added bundle identity parse block + four fields (`bundleId`, `issueNumbers`, `closurePolicy`, `primaryIssue`) to all three runOrient return points
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js` — same additions

## Files Confirmed Unchanged (roadmap ports)

- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js` — no change needed; forge-neutral regenerate logic already parallel to root; root made zero changes to roadmap.js
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js` — same

## Roadmap Port Rationale

Root `kaola-workflow-roadmap.js` was included in the finalization write set only to verify zero change needed (per design §finalization: "roadmap.js regenerateRoadmap — NO CHANGE / forge-neutral"). Confirmed: root regenerate logic reads remaining `.roadmap/issue-*.md` sources and regenerates — no bundle-specific code needed. Forge ports are parallel. Both left unchanged.

## Verification Commands

### Before (baseline)

```
node scripts/simulate-workflow-walkthrough.js
# Workflow walkthrough simulation passed
# EXIT:0

node scripts/validate-script-sync.js
# OK: 18 common scripts and 7 byte-identical file group in sync.
# EXIT:0
```

### node -c syntax checks

```
node -c plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js
# EXIT:0

node -c plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js
# EXIT:0

node -c plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js
# EXIT:0

node -c plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js
# EXIT:0
```

### Grep parity — bundle field counts

```
grep -c "bundleId\|issueNumbers\|closurePolicy\|primaryIssue" scripts/kaola-workflow-adaptive-node.js
# 16

grep -c "bundleId\|issueNumbers\|closurePolicy\|primaryIssue" plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js
# 16

grep -c "bundleId\|issueNumbers\|closurePolicy\|primaryIssue" plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js
# 16
```

Root and both forge ports: identical count (16 each = 4 const declarations + 4×3 return points).

### runOrient function body diff against root

```
diff <(sed -n '/^function runOrient/,/^\/\/ ---------.*runOpenNext/p' scripts/kaola-workflow-adaptive-node.js) \
     <(sed -n '/^function runOrient/,/^\/\/ ---------.*runOpenNext/p' plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js)
# (empty — zero diff)

diff <(sed -n '/^function runOrient/,/^\/\/ ---------.*runOpenNext/p' scripts/kaola-workflow-adaptive-node.js) \
     <(sed -n '/^function runOrient/,/^\/\/ ---------.*runOpenNext/p' plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js)
# (empty — zero diff)
```

The runOrient function is byte-identical between root and both forge ports (no forge noun substitution needed inside runOrient — state field names are forge-neutral).

### After

```
node scripts/simulate-workflow-walkthrough.js
# Workflow walkthrough simulation passed
# EXIT:0

node scripts/validate-script-sync.js
# OK: 18 common scripts and 7 byte-identical file group in sync.
# EXIT:0
```

build-green

## Notes

- Forge ports are NOT byte-locked to root (intentional drift per task constraints); validate-script-sync does NOT compare them — parity is verified by the runOrient diff above.
- Full forge npm chains (`test:kaola-workflow:gitlab` + `test:kaola-workflow:gitea`) are deferred to the contracts-registration node per task instructions.
- No agent-count assertions were bumped (contracts-registration owns that).

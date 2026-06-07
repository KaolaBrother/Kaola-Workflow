# script-registration node evidence — issue #266

## task
Register 3 new scripts from prior nodes (kaola-workflow-codex-preflight.js,
kaola-workflow-task-mirror.js, kaola-workflow-codex-compact-resume.js) into
install.sh's three SUPPORT_SCRIPT_NAMES blocks and into the 4 contract validators,
so that manual (non-plugin) installs include all new Codex harness scripts.

## non_tdd_reason

non_tdd_reason: glue/wiring — install.sh SUPPORT_SCRIPT_NAMES registration + contract-validator assertion strings; verified by running validators + npm test (build-green), no natural unit test exists for the act of listing a script name in an install array or validator assert block.

Category: **glue / wiring** — connecting new scripts to the existing install and
contract-validator wiring without adding behavioral logic. Registration is verified
by running the contract validators + npm test (build-green). No natural failing unit
test exists for the act of listing a script name in an array or install.sh block.

## write_set
- install.sh — 3 SUPPORT_SCRIPT_NAMES blocks (github, gitlab, gitea)
- scripts/validate-workflow-contracts.js — byte-identical pair (claude)
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js — byte-identical pair (codex)
- scripts/validate-kaola-workflow-contracts.js — codex-only validator
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js

## install.sh edits

**github block** (lines 160-162 added):
- kaola-workflow-codex-preflight.js (base-named, 4-tree byte-identical)
- kaola-workflow-task-mirror.js (base-named, claude+codex byte-identical)
- NOTE: kaola-workflow-codex-compact-resume.js intentionally OMITTED from github block.
  The github lane sources from scripts/ (claude tree); compact-resume has no claude
  scripts/ copy (codex-only by design). The install verifier at line 793-797 checks
  all listed github scripts actually exist after install — adding compact-resume there
  would fail the test suite (confirmed: first attempt failed with
  "Install verification failed: missing support script: ...kaola-workflow-codex-compact-resume.js").

**gitlab block** (lines 194-196 added):
- kaola-workflow-codex-preflight.js (base-named — 4-tree byte-identical)
- kaola-gitlab-workflow-task-mirror.js (edition-named port)
- kaola-gitlab-workflow-codex-compact-resume.js (edition-named, codex-only)

**gitea block** (lines 228-230 added):
- kaola-workflow-codex-preflight.js (base-named — 4-tree byte-identical)
- kaola-gitea-workflow-task-mirror.js (edition-named port)
- kaola-gitea-workflow-codex-compact-resume.js (edition-named, codex-only)

## validator edits

**scripts/validate-workflow-contracts.js + plugins/kaola-workflow/scripts/validate-workflow-contracts.js**
(BYTE-IDENTICAL PAIR — identical edit applied to both):
Added after the #272 adaptive-node assertIncludes block:
```
// #266: Codex harness scripts (preflight, task-mirror, compact-resume) must be in
// install.sh per-edition SUPPORT_SCRIPT_NAMES allowlist. preflight is base-named (4-tree
// byte-identical); task-mirror is base-named in github/codex, edition-named in gitlab/gitea;
// compact-resume is codex-only (no claude scripts/ copy) — asserted in codex-only validator.
assert(exists('scripts/kaola-workflow-codex-preflight.js'), '#266 codex preflight script missing from scripts/');
assert(exists('scripts/kaola-workflow-task-mirror.js'), '#266 task-mirror script missing from scripts/');
assertIncludes('install.sh', 'kaola-workflow-codex-preflight.js');
assertIncludes('install.sh', 'kaola-workflow-task-mirror.js');
assertIncludes('install.sh', 'kaola-gitlab-workflow-task-mirror.js');
assertIncludes('install.sh', 'kaola-gitea-workflow-task-mirror.js');
```
compact-resume NOT asserted here (no claude scripts/ copy; would fail exists('scripts/...')).

**scripts/validate-kaola-workflow-contracts.js** (codex-only):
- Added 'kaola-workflow-codex-preflight.js' and 'kaola-workflow-task-mirror.js' to
  sharedScripts[] array (lines ~261-270) — these are byte-identical claude↔codex pairs,
  the sharedScripts loop verifies both exist AND are byte-identical.
- Added standalone assert for compact-resume (codex-plugin only, no claude copy):
  ```
  assert(exists(`${pluginRoot}/scripts/kaola-workflow-codex-compact-resume.js`),
    '#266 codex compact-resume hook missing from Codex plugin');
  ```

**plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js**:
- Added to scriptFiles[]: kaola-workflow-codex-preflight.js, kaola-gitlab-workflow-task-mirror.js,
  kaola-gitlab-workflow-codex-compact-resume.js
- Added to installSupportScripts[]: same 3 names (parity check against install.sh)

**plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js**:
- Added to scriptFiles[]: kaola-workflow-codex-preflight.js, kaola-gitea-workflow-task-mirror.js,
  kaola-gitea-workflow-codex-compact-resume.js
- Added to installSupportScripts[]: same 3 names (parity check against install.sh)

## byte-identity result

```
cmp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js
cmp-exit:0
```
Files are IDENTICAL after edits (same edit applied symmetrically to both).

## verification_commands

### Baseline (before changes)
```
node scripts/validate-script-sync.js
# OK: 17 common scripts and 7 byte-identical file group in sync.
# exit:0

node scripts/validate-workflow-contracts.js
# Workflow contract validation passed
# exit:0

node scripts/validate-kaola-workflow-contracts.js
# Kaola-Workflow Codex contract validation passed
# exit:0

npm test (captured to /tmp/npm-baseline.log)
# npm-exit:0  (background task blxb014pj exit code 0)
```

### After changes
```
node scripts/validate-script-sync.js
# OK: 17 common scripts and 7 byte-identical file group in sync.
# exit:0

node scripts/validate-workflow-contracts.js
# Workflow contract validation passed
# exit:0

node scripts/validate-kaola-workflow-contracts.js
# Kaola-Workflow Codex contract validation passed
# exit:0

cmp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js
# cmp-exit:0  (byte-identical)

npm test (captured to /tmp/npm-final.log, /tmp/npm-gate.log)
# npm-exit:0  (background task bwafurks8 exit code 0)
# Gitea Codex workflow walkthrough simulation passed  (final sentinel)
```

## regression-green

All verification commands passed with real exit code 0:
- validate-script-sync.js: regression-green (exit 0, "OK: 17 common scripts and 7 byte-identical file group in sync.")
- validate-workflow-contracts.js: regression-green (exit 0, "Workflow contract validation passed")
- validate-kaola-workflow-contracts.js: regression-green (exit 0, "Kaola-Workflow Codex contract validation passed")
- npm test: regression-green (exit 0, background task bwafurks8 confirmed "exit code 0")
- byte-identity cmp: regression-green (cmp-exit:0 — validate-workflow-contracts.js pair identical)

## git status
Only the 6 declared files modified (plus kaola-workflow/issue-266/ .cache artifacts and
untracked new scripts from prior nodes — all within scope):
- M install.sh
- M plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
- M plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
- M plugins/kaola-workflow/scripts/validate-workflow-contracts.js
- M scripts/validate-kaola-workflow-contracts.js
- M scripts/validate-workflow-contracts.js
(validate-script-sync.js and SKILL.md also modified — from prior nodes, not this node)

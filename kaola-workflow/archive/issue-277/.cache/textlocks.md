# Node Evidence: textlocks (M3)

## task
Reconcile the contract validators with the relocated procedure: ADD the missing
contractor-dispatch text-lock (`subagent_type="contractor"`), DROP the inline-body
`assertBefore` locks whose tokens moved to `agents/contractor.md`, and REPOINT the
adaptive-authoring `assertConcept` from `commands/kaola-workflow-adapt.md` (now a
dispatch-handle-only file) to `agents/workflow-planner.md` (sole home).

## non_tdd_reason
**Config / IaC** — these are contract-validator assertion files (drift guards), not
behavioral logic files. The "correct" state is "the validators are green against
the new document reality"; there is no failing unit test that can encode this — the
validators ARE the tests. The verification check is: run the validators and confirm
they exit 0 (build-green pattern).

## write_set
- `scripts/validate-workflow-contracts.js`
- `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (byte-identical copy)
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`
- `kaola-workflow/issue-277/.cache/textlocks.md` (this file)

## changes_made

### scripts/validate-workflow-contracts.js (+ Codex byte-identical copy)

**DROPped** (assertBefore calls — tokens relocated to agents/contractor.md; cross-file
ordering is not expressible via assertBefore):
```
assertBefore('commands/kaola-workflow-phase6.md', 'commit -m "chore: finalize {project}"', 'kaola-workflow-sink-merge.js');
assertBefore('commands/kaola-workflow-phase6.md', 'SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"', 'node "$CLAIM_JS" finalize');
```

**ADDed** (contractor-dispatch HANDLE lock — the core M3 deliverable):
```javascript
assertIncludes('commands/kaola-workflow-phase6.md', 'subagent_type="contractor"');
```

**REPOINTed** (adaptive authoring assertConcept):
- From: `assertConcept('commands/kaola-workflow-adapt.md', ...)` with `FANOUT_CAP`, `post-dominate`
- To:   `assertConcept('agents/workflow-planner.md', ...)` with same token set

`--keep-worktree` assertion against `commands/kaola-workflow-phase6.md` was **kept**:
the token is still present in phase6.md (embedded in the contractor dispatch prompt
string), so the assertion is factually correct and must stay.

### plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js

**ADDed** contractor-dispatch HANDLE lock:
```javascript
assert(
  read(pluginRoot + '/commands/kaola-workflow-phase6.md').includes('subagent_type="contractor"'),
  'GitLab Phase 6 command must dispatch the mechanical finalization to the contractor subagent'
);
```

**REPOINTed** assertConcept from `pluginRoot + '/commands/kaola-workflow-adapt.md'`
to `'agents/workflow-planner.md'` (repo-root relative — shared file, not plugin-local).

### plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js

Same changes as GitLab above (mirrored for Gitea).

## verification_commands

```
node scripts/validate-workflow-contracts.js
node scripts/validate-kaola-workflow-contracts.js
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
node scripts/validate-script-sync.js
```

## before_result

```
node scripts/validate-workflow-contracts.js
Error: commands/kaola-workflow-phase6.md must include: commit -m "chore: finalize {project}"
  at assertBefore (...:38:3)
  at Object.<anonymous> (...:382:1)
EXIT: 1

node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
Error: plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md must document adaptive authoring; missing: post-dominate, finalize, FANOUT_CAP
  at assertConcept (...:479:1)
EXIT: 1

node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
Error: plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md must document adaptive authoring; missing: post-dominate, finalize, FANOUT_CAP
  at assertConcept (...:484:1)
EXIT: 1

node scripts/validate-kaola-workflow-contracts.js
Kaola-Workflow Codex contract validation passed
EXIT: 0 (was already green)
```

## after_result

```
node scripts/validate-workflow-contracts.js
Workflow contract validation passed
EXIT: 0

node scripts/validate-kaola-workflow-contracts.js
Kaola-Workflow Codex contract validation passed
EXIT: 0

node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
Kaola-Workflow GitLab contract validation passed
EXIT: 0

node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
Kaola-Workflow Gitea contract validation passed
EXIT: 0

node scripts/validate-script-sync.js
OK: 15 common scripts and 5 byte-identical file group in sync.
EXIT: 0
```

All 5 commands exit 0.

## addendum — Codex contractor seam lock (completeness fix)

M3 lands the contractor-dispatch text-lock on ALL FOUR editions. The first pass added it
to Claude/GitLab/Gitea (all have a `commands/kaola-workflow-phase6.md`), but Codex has no
command file — its contractor "handle" lives in the finalize SKILL.md, which the node-4
skills-fallback rewrite made the SOLE HOME of the mechanical finalization (delegate-by-
contract; inline only on a logged `local-fallback-tool-unavailable` escape).

**ADDed to `scripts/validate-kaola-workflow-contracts.js`** (Codex contract validator):
```javascript
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'The `contractor` Codex agent role is the SOLE HOME of this procedure and the session MUST delegate it');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'local-fallback-tool-unavailable');
```

These prove the Codex finalize seam delegates to the contractor (SOLE HOME + MUST delegate)
and is not inline-by-preference (the only inline path is the logged tool-unavailable escape).

Note: this is the separate Codex contract validator — NOT the byte-identical Claude/Codex
`validate-workflow-contracts.js` pair, which was untouched here.

**Re-verification (all five exit 0):**
```
node scripts/validate-kaola-workflow-contracts.js                                  EXIT: 0
node scripts/validate-workflow-contracts.js                                        EXIT: 0
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js  EXIT: 0
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js    EXIT: 0
node scripts/validate-script-sync.js                                               EXIT: 0
```

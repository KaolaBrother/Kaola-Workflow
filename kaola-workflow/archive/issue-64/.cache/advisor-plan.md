# Advisor — Issue #64 Plan

## Verdict

The blueprint is solid and detailed. Ready to write `phase3-plan.md` and route to Phase 4 after folding in three flags below.

## Verifications performed

### 1. `field()` section-handling

```
$ grep -n "^function field" scripts/kaola-workflow-claim.js
24:function field(content, name) {
```

Body (lines 24-28):

```js
function field(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp('^' + escaped + ':[ \\t]*(.+)$', 'm'));
  return match ? match[1].trim() : '';
}
```

**Naive multiline regex — first match anywhere in content, no section scoping.**
Current schema has `issue_number:` only in `## Sink` and `session_id:` only in
`## Lease`, so the function works coincidentally. Phase 4 must NOT introduce a
schema where `issue_number:` or `session_id:` could appear elsewhere; the plan
documents this contract.

### 2. External callers of deleted functions

```
$ grep -rn "activeStateSessions\|activeStateProjects\|activeStateIssueNumbers" scripts plugins
scripts/kaola-workflow-claim.js:358 (def activeStateSessions)
scripts/kaola-workflow-claim.js:378 (def activeStateProjects)
scripts/kaola-workflow-claim.js:414 (call activeStateProjects in ownedActiveProject)
scripts/kaola-workflow-claim.js:427 (def activeStateIssueNumbers)
scripts/kaola-workflow-claim.js:446 (call activeStateIssueNumbers in issueAlreadyClaimed)
scripts/kaola-workflow-claim.js:1890 (comment referencing activeStateIssueNumbers)
[+ identical hits in plugins/kaola-workflow/scripts/kaola-workflow-claim.js]
```

Only intra-file callers. Safe to delete after migrating callers and updating
the comment at line 1890 to reference `readActiveFolders`.

## Three flags folded into the plan

### Flag A — Task 4 rationale (correction)

Replace "keep `readLockFiles` call in `issueAlreadyClaimed` because lock-based
sweep paths (lines 1867, 1979, 2031, 2252) must not be affected" with:

> Phase α conservatism — the lock substrate stays authoritative for in-process
> claim detection; folder check is added as an additional guard. Tightening to
> folder-only happens in #63 Phase β.

(Same code, accurate rationale. The sweep paths call `readLockFiles` directly,
not through `issueAlreadyClaimed`.)

### Flag B — 6F semantics change (contract change, not fixture-only)

After Step 3, a lock-without-folder no longer triggers `cmdClassify`'s
already-claimed gate (`exit 2`). 6F's assertion shape changes: previously
"lock check catches it", now "folder check catches it". Adding the folder
fixture preserves the SCENARIO outcome but the underlying contract changed.
The plan must call this out as a contract change in 6F, not a fixture-only
fix, so Phase 5 reviewers don't see it as silent semantics drift.

### Flag C — Comment at line 1890 referencing `activeStateIssueNumbers`

The comment at `scripts/kaola-workflow-claim.js:1890`:

```
// finds this issue via activeStateIssueNumbers after the lock is gone.
```

References a function that Task 4 deletes. Update the comment to reference
`readActiveFolders` so future readers find the right helper.

## Sync gates

Step-by-step sync gates after each caller migration are correctly placed. Each
of Steps 2/3/4 ends with:

```
node scripts/validate-script-sync.js && node scripts/simulate-workflow-walkthrough.js
```

These must run after each migration step, not once at the end.

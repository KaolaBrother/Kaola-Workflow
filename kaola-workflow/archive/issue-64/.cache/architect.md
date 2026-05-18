# Code Architect — Issue #64

## Design Decisions

- Option B confirmed: export `readActiveFolders` and `isIssueClosed` from `scripts/kaola-workflow-claim.js`; classifier consumes them via `require('./kaola-workflow-claim.js')`, mirroring the `kaola-workflow-sink-merge.js:5` precedent.
- `readActiveFolders` is a NEW function added to claim.js between the existing `activeStateIssueNumbers` block (line 442) and `issueAlreadyClaimed` (line 444). It deduplicates projects seen in both `coordRoot` and `root` trees, requires `workflow-state.md` with `status: active`, carries `{ project, issueNumber, session_id, status, path, stateContent }`, and allocates a per-call `closedMemo` Map.
- `scanClaimedOverlap` 4th param renamed `claimedLocks` → `claimedFolders`. Inner loop body switches from `lock.project + path.join(root, ...)` to `folder.project + folder.path` directly. Dead `root` param kept (deferred cosmetic).
- `activeStateSessions` (line 358): zero callers — delete.
- `activeStateProjects` (line 378): single caller `ownedActiveProject:414` — after migration, delete.
- `activeStateIssueNumbers` (line 427): single live caller `issueAlreadyClaimed:446` — inline into `issueAlreadyClaimed` to use `readActiveFolders` directly, then delete.
- `ownedActiveProject` second branch (line 414): switches to iterate `readActiveFolders(coordRoot, root)` — that's why `readActiveFolders` must surface `session_id`.
- Existing Epic Case 6 simulator fixtures (6B/6C/6C2/6C3/6C4/6C5/6H) create project folders + lock files but NO `workflow-state.md`. Under the new contract they would vanish from the claimed set. Patch these to write minimal `workflow-state.md` (status: active + issue_number) BEFORE migrating the classifier.
- Epic 6F (line 1046): plants a `.lock` with `issue_number: 10` and NO folder — asserts already-claimed → exit 2. After migration the lock-based already-claimed branch is removed from `cmdClassify`. Fix by ALSO writing a folder + `workflow-state.md` for `another-project`.
- Epic 6I (line 1172): "ghost lock" — lock with no folder — already tests the lock-without-folder contract; new scenario 6N is a lightweight explicit-regression mirror.

## Files to Create

None.

## Files to Modify

| File | Concrete Change | Reason |
|------|----------------|--------|
| `scripts/kaola-workflow-claim.js` | Add `readActiveFolders` (~lines 443-485); add `session_id` field to returned objects; inline `activeStateIssueNumbers` body into `issueAlreadyClaimed`; delete `activeStateSessions` (358-376); delete `activeStateProjects` (378-401); delete `activeStateIssueNumbers` (427-442); update `ownedActiveProject` second branch (414); add `isIssueClosed` and `readActiveFolders` to `module.exports` (2888) | New canonical folder reader; dead code removal |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-for-byte mirror | Sync requirement |
| `scripts/kaola-workflow-classifier.js` | Add `require('./kaola-workflow-claim.js')` destructuring after line 6; delete `readLockFiles` (87-99); delete `readActiveStateIssueNumbers` (101-116); update `scanClaimedOverlap` 4th param + inner loop (242-294); update `classify` param (311, 328); update `cmdClassify` lock + folder reads (370-374, 394, 419) | Migrate to canonical folder reader |
| `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` | Byte-for-byte mirror | Sync requirement |
| `scripts/simulate-workflow-walkthrough.js` | (A) Patch 6B/6C/6C2/6C3/6C4/6C5/6H/6F fixtures to write `workflow-state.md`; (B) Add scenarios 6K/6L/6M/6N/6O after 6J at ~line 1250 | Existing tests survive migration; new scenarios prove new contract |

`plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` is the Codex variant and is NOT touched.

## Data Flow

Before: `cmdClassify` → `readLockFiles` → lock array → `scanClaimedOverlap(…, claimedLocks, root)` → reads `lock.project` → builds `projectDir = path.join(root, 'kaola-workflow', lock.project)` → reads phase files.

After: `cmdClassify` → `readActiveFolders(coordRoot, root)` → folders array (pre-resolved `path`) → `scanClaimedOverlap(…, claimedFolders, root)` → reads `folder.path` directly → reads phase files. Internal `closedMemo` filters closed-issue folders before they enter the pipeline.

## Build Sequence

### Step 1 — Pre-migration simulator fixture patch (additive, safe)

Patch `scripts/simulate-workflow-walkthrough.js` only. After each `fs.mkdirSync(claimedDir, …)`/`earlyDir`/`claimedDir6H`, insert `fs.writeFileSync(path.join(<dir>, 'workflow-state.md'), 'status: active\nissue_number: N\n')` with the correct `N` matching the existing lock's `issue_number`. For 6F, add `fs.mkdirSync(path.join(epic6Tmp, 'kaola-workflow', 'another-project'), {recursive:true})` + workflow-state.md.

Validate gate: `node scripts/simulate-workflow-walkthrough.js` exits 0.

### Step 2 — Add `readActiveFolders` + export `isIssueClosed`

In `scripts/kaola-workflow-claim.js`:
- Insert `readActiveFolders` function after line 442.
- Add `isIssueClosed` and `readActiveFolders` to `module.exports` at line 2888.

Mirror to `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (cp).

Validate gate: `node scripts/validate-script-sync.js && node scripts/simulate-workflow-walkthrough.js`.

### Step 3 — Migrate classifier

In `scripts/kaola-workflow-classifier.js`:
- Add `const { readActiveFolders } = require('./kaola-workflow-claim.js');` after existing requires (~line 6).
- Delete `readLockFiles` (87-99).
- Delete `readActiveStateIssueNumbers` (101-116).
- Rename `scanClaimedOverlap` 4th param `claimedLocks` → `claimedFolders`; update inner loop: `lock.project` → `folder.project`; `path.join(root, 'kaola-workflow', lock.project)` → `folder.path`. Keep existence guard as defense-in-depth.
- Update `classify(issue, claimedLocks, root)` 2nd param name → `claimedFolders`.
- In `cmdClassify` (line 370): replace `const locks = readLockFiles(coordRoot, root);` with `const claimedFolders = readActiveFolders(coordRoot, root);`; replace `const activeStateIssues = readActiveStateIssueNumbers(root);` (line 371) by absorbing; replace line 374 check `locks.some(l => l.issue_number === args.issue) || activeStateIssues.has(args.issue)` with `claimedFolders.some(f => f.issueNumber === args.issue)`. Replace `classify(issue, locks, root)` calls at 394 and 419 with `classify(issue, claimedFolders, root)`.

Mirror to `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` (cp).

Validate gate: `node scripts/validate-script-sync.js && node scripts/simulate-workflow-walkthrough.js`.

### Step 4 — Claim.js internal cleanup

- `issueAlreadyClaimed(coordRoot, root, issue)` body: `return readLockFiles(coordRoot, root).some(l => l.issue_number === issue) || readActiveFolders(coordRoot, root).some(f => f.issueNumber === issue);` — keep `readLockFiles` for lock-substrate enforcement.
- Update `ownedActiveProject` second branch (line 414): `for (const folder of readActiveFolders(coordRoot, root))` reading `folder.project`, `folder.issueNumber`, `folder.session_id` from stateContent.
- Delete `activeStateSessions` (358-376).
- Delete `activeStateProjects` (378-401).
- Delete `activeStateIssueNumbers` (427-442).

Mirror to plugin tree.

Validate gate: `node scripts/validate-script-sync.js && node scripts/simulate-workflow-walkthrough.js`.

### Step 5 — New simulator scenarios

Add 6K/6L/6M/6N/6O to `scripts/simulate-workflow-walkthrough.js` after 6J close at ~line 1250.

Validate gate: `node scripts/simulate-workflow-walkthrough.js` exits 0 with "Workflow walkthrough simulation passed".

## Task List

| # | Action | File(s) | Write Set | Depends | Group | Implement | Validate |
|---|--------|---------|-----------|---------|-------|-----------|---------|
| 1 | MODIFY | `scripts/simulate-workflow-walkthrough.js` | 6B/6C/6C2/6C3/6C4/6C5/6H workflow-state.md inserts; 6F folder+state | none | serial | Insert minimal workflow-state.md after each `mkdirSync` for existing fixtures; for 6F also create the `another-project` folder | `node scripts/simulate-workflow-walkthrough.js` |
| 2 | MODIFY | `scripts/kaola-workflow-claim.js` | Add `readActiveFolders` after line 442; update `module.exports` at line 2888 | #1 | serial | See Step 2 | — |
| 2m | MODIFY | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-for-byte mirror | #2 | serial | `cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | `node scripts/validate-script-sync.js && node scripts/simulate-workflow-walkthrough.js` |
| 3 | MODIFY | `scripts/kaola-workflow-classifier.js` | Add require; delete 87-99, 101-116; update 242-294, 311, 328, 370-374, 394, 419 | #2m | serial | See Step 3 | — |
| 3m | MODIFY | `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` | Byte-for-byte mirror | #3 | serial | `cp scripts/kaola-workflow-classifier.js plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` | `node scripts/validate-script-sync.js && node scripts/simulate-workflow-walkthrough.js` |
| 4 | MODIFY | `scripts/kaola-workflow-claim.js` | Inline `activeStateIssueNumbers` into `issueAlreadyClaimed`; rewrite `ownedActiveProject` second branch; delete `activeStateSessions`/`activeStateProjects`/`activeStateIssueNumbers` | #3m | serial | See Step 4 | — |
| 4m | MODIFY | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-for-byte mirror | #4 | serial | `cp` | `node scripts/validate-script-sync.js && node scripts/simulate-workflow-walkthrough.js` |
| 5 | MODIFY | `scripts/simulate-workflow-walkthrough.js` | Add scenarios 6K/6L/6M/6N/6O after line 1250 | #4m | serial | See Step 5; reuse `gh` shim pattern from 6E/6G | `node scripts/simulate-workflow-walkthrough.js` exits 0 with passing message |

## External Dependencies

None.

## Test File Locations

### Existing scenarios to patch (Step 1)

`scripts/simulate-workflow-walkthrough.js`:
- 6B (claimedDir ~line 913-914)
- 6C/6C2/6C3/6C4 (lines 934, 962, 972, 973)
- 6C5 (earlyDir ~line 982-983)
- 6H (claimedDir6H ~line 1136-1138)
- 6F (another-project lock ~line 1046-1053)

### New scenarios (Step 5)

Insert after 6J close at ~line 1250:

- **6K — folder-based RED**: folder with workflow-state.md (status:active, issue_number:70) + phase3-plan.md referencing `scripts/kaola-workflow-claim.js`; no lock; candidate issue 71 touches same file → verdict `red`.
- **6L — folder-based YELLOW**: same setup but candidate touches `scripts/new-helper.js` (SHARED_INFRA area `scripts`) → verdict `yellow`.
- **6M — closed-issue residue ignored**: gh shim returns `{"state":"closed"}` for issue 80; folder for issue 80 with phase3-plan.md touching `commands/something.md`; candidate issue 81 touches same area → verdict `green`.
- **6N — lock-without-folder ignored** (regression mirror of 6I): plant only `.locks/ghost-n.lock` with `issue_number: 90`; no folder; candidate issue 91 → `green`.
- **6O — status:released excluded**: folder with `status: released` + phase3-plan.md touching `commands/something.md`; candidate issue 92 → `green`.

## Out of Scope

- Modifying `readLockFiles` in `claim.js` — stays for lease enforcement.
- Removing the dead `root` param from `scanClaimedOverlap`/`classify` — cosmetic, deferred.
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` (Codex variant) — not on allowlist.
- `validate-kaola-workflow-contracts.js`, `kaola-workflow-repair-state.js`, `kaola-workflow-roadmap.js`, `kaola-workflow-sink-pr.js`, `kaola-workflow-sink-merge.js` — none affected.
- GitLab work.
- Phase β (locks/sessions/tickers/heartbeat removal) — separate issue.

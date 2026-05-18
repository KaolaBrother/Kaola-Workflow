# Phase 3 — Plan: issue-64

## Blueprint

### Selected approach (recap)

Option B: export `readActiveFolders` and `isIssueClosed` from
`scripts/kaola-workflow-claim.js`. Classifier consumes them via
`require('./kaola-workflow-claim.js')`, mirroring
`scripts/kaola-workflow-sink-merge.js:5`.

### Files to Create

| File | Purpose | Key Interfaces |
|------|---------|----------------|
| (none) | Option B avoids new files. | — |

### Files to Modify

| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-claim.js` | Add `readActiveFolders(coordRoot, root, opts)` after line 442 returning `{project, issueNumber, session_id, status, path, stateContent}` with internal `closedMemo`; inline `activeStateIssueNumbers` body into `issueAlreadyClaimed`; rewrite `ownedActiveProject` second branch (line 414) to use `readActiveFolders`; delete `activeStateSessions` (358-376), `activeStateProjects` (378-401), `activeStateIssueNumbers` (427-442); update the comment at line 1890 to reference `readActiveFolders`; add `isIssueClosed` and `readActiveFolders` to `module.exports` (line 2888) | New canonical folder reader exposed for both consumers; dead-code removal once internal callers migrate |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-for-byte mirror | Enforced by `scripts/validate-script-sync.js` (`COMMON_SCRIPTS` allowlist) |
| `scripts/kaola-workflow-classifier.js` | Add `const { readActiveFolders } = require('./kaola-workflow-claim.js');` after existing requires; delete `readLockFiles` (87-99); delete `readActiveStateIssueNumbers` (101-116); rename `scanClaimedOverlap` 4th param `claimedLocks` → `claimedFolders` and update inner loop (242-294) to read `folder.project` and `folder.path` directly; rename `classify` 2nd param (line 311) and pass through to internal name (line 328); update `cmdClassify` (370-374, 394, 419) to call `readActiveFolders` instead of `readLockFiles` + `readActiveStateIssueNumbers` and to use `claimedFolders.some(f => f.issueNumber === args.issue)` as the already-claimed predicate | Migrate classifier to canonical folder reader; remove duplicated readers |
| `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` | Byte-for-byte mirror | Enforced by `validate-script-sync.js` |
| `scripts/simulate-workflow-walkthrough.js` | (A) Patch existing fixtures 6B/6C/6C2/6C3/6C4/6C5/6H to write `workflow-state.md` next to each existing lock file; (B) Patch 6F so the `another-project` lock is accompanied by a folder + `workflow-state.md`; (C) Append new scenarios 6K/6L/6M/6N/6O after the 6J close at ~line 1250 | Existing tests survive the contract change; new scenarios prove the new contract |

`plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` is the
Codex variant and is intentionally not on the `COMMON_SCRIPTS` allowlist — it
is NOT modified.

### Build Sequence

1. **Step 1 — Pre-migration simulator fixture patch.** Add minimal
   `workflow-state.md` to each existing Epic Case 6 lock-only fixture so the
   later folder-based contract change does not regress those scenarios. Gate:
   `node scripts/simulate-workflow-walkthrough.js` passes.
2. **Step 2 — Add `readActiveFolders` and export `isIssueClosed`.** Edit
   `scripts/kaola-workflow-claim.js`, then `cp` to the plugin tree. Gate:
   `node scripts/validate-script-sync.js && node scripts/simulate-workflow-walkthrough.js`.
3. **Step 3 — Migrate classifier.** Edit
   `scripts/kaola-workflow-classifier.js`, then `cp` to the plugin tree. Gate:
   `node scripts/validate-script-sync.js && node scripts/simulate-workflow-walkthrough.js`.
4. **Step 4 — Claim.js internal cleanup.** Inline `activeStateIssueNumbers`
   into `issueAlreadyClaimed`, update `ownedActiveProject` second branch,
   delete the three dead helpers, update the line-1890 comment. Mirror to
   plugin tree. Gate:
   `node scripts/validate-script-sync.js && node scripts/simulate-workflow-walkthrough.js`.
5. **Step 5 — Add new simulator scenarios 6K/6L/6M/6N/6O.** Gate:
   `node scripts/simulate-workflow-walkthrough.js` exits 0 with the standard
   "Workflow walkthrough simulation passed" message.

### Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| serial | 1 → 2 → 2m → 3 → 3m → 4 → 4m → 5 | All steps edit the same two files (`claim.js`, `classifier.js`, `simulate-workflow-walkthrough.js`); sync gates after every migration require linear ordering. No parallelization opportunities. |

### External Dependencies

None. No new npm packages, no new system tools beyond `node` (already required)
and `gh` (already required for online tests).

## Task List

### Task 1: Patch existing simulator fixtures for the folder contract

- File: `scripts/simulate-workflow-walkthrough.js`
- Test File: (same file)
- Write Set: blocks around lines 913-914 (6B), 934/962/972/973 (6C-series),
  982-983 (6C5), 1136-1138 (6H), 1046-1053 (6F)
- Depends On: none
- Parallel Group: serial
- Action: MODIFY
- Implement: For each existing fixture that plants a `.lock` for an "already
  claimed" project but no `workflow-state.md`, insert immediately after the
  existing `fs.mkdirSync(<dir>, {recursive: true})`:

  ```js
  fs.writeFileSync(path.join(<dir>, 'workflow-state.md'),
    '# Kaola-Workflow State\n\n## Project\nname: <project>\nstatus: active\n\n## Sink\nbranch: workflow/issue-<N>\nissue_number: <N>\nsink: merge\n');
  ```

  For 6F, also create the `another-project` folder
  (`fs.mkdirSync(path.join(epic6Tmp, 'kaola-workflow', 'another-project'), {recursive:true})`)
  before writing its state file. `<N>` matches the existing lock's `issue_number`.
- Mirror: existing Epic 6F2 pattern at lines 1061-1089 (the canonical "plant a
  state file" form).
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0.

### Task 2: Add `readActiveFolders` and export `isIssueClosed` in `claim.js`

- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: insertion after line 442 (~lines 443-490); `module.exports` block
  at line 2888.
- Depends On: Task 1
- Parallel Group: serial
- Action: MODIFY
- Implement:

  ```js
  function readActiveFolders(coordRoot, root, opts = {}) {
    const includeClosedIssues = opts.includeClosedIssues === true;
    const closedFn = opts.isIssueClosedFn || isIssueClosed;
    const closedMemo = new Map();
    const isClosedMemo = (n) => {
      if (n == null) return false;
      if (!closedMemo.has(n)) closedMemo.set(n, !!closedFn(n));
      return closedMemo.get(n);
    };
    const seen = new Set();
    const out = [];
    const roots = [];
    if (coordRoot) roots.push(path.join(coordRoot, 'kaola-workflow'));
    if (root) roots.push(path.join(root, 'kaola-workflow'));
    for (const wfDir of roots) {
      if (!fs.existsSync(wfDir)) continue;
      let entries;
      try { entries = fs.readdirSync(wfDir, { withFileTypes: true }); }
      catch (_) { continue; }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'archive' || entry.name.startsWith('.')) continue;
        if (seen.has(entry.name)) continue;
        const projectPath = path.join(wfDir, entry.name);
        const statePath = path.join(projectPath, 'workflow-state.md');
        if (!fs.existsSync(statePath)) continue;
        let stateContent;
        try { stateContent = fs.readFileSync(statePath, 'utf8'); }
        catch (_) { continue; }
        const status = field(stateContent, 'status');
        if (status !== 'active') continue;
        const issueRaw = field(stateContent, 'issue_number');
        const issueNumber = issueRaw && /^\d+$/.test(issueRaw) ? parseInt(issueRaw, 10) : null;
        if (!includeClosedIssues && issueNumber != null && isClosedMemo(issueNumber)) continue;
        const sessionId = field(stateContent, 'session_id') || null;
        seen.add(entry.name);
        out.push({
          project: entry.name,
          issueNumber,
          session_id: sessionId,
          status,
          path: projectPath,
          stateContent
        });
      }
    }
    return out;
  }
  ```

  Then update `module.exports` (line 2888) to include `isIssueClosed,
  readActiveFolders`.

- Mirror: existing `activeStateProjects` (lines 378-401) for iteration pattern;
  `isIssueClosed` (lines 2120-2128) for offline behaviour; `readLockFiles`
  dual-root scan pattern (lines 310-324) for `coordRoot + root` enumeration.
- Validate: defer (state-only addition; verification happens after sync).

### Task 2m: Mirror Task 2 to plugin tree

- File: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Write Set: full file (byte-identical mirror)
- Depends On: Task 2
- Parallel Group: serial
- Action: MODIFY
- Implement: `cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Validate: `node scripts/validate-script-sync.js && node scripts/simulate-workflow-walkthrough.js`.

### Task 3: Migrate classifier

- File: `scripts/kaola-workflow-classifier.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: top-of-file require (after existing requires ~line 6); function
  deletions at lines 87-99 and 101-116; function-signature + body edits at
  lines 242-294 (`scanClaimedOverlap`); param rename at 311 and call-through
  at 328 (`classify`); call-site edits at 370-374, 394, 419 (`cmdClassify`).
- Depends On: Task 2m
- Parallel Group: serial
- Action: MODIFY
- Implement:
  - Insert `const { readActiveFolders } = require('./kaola-workflow-claim.js');`
    after the existing require block.
  - Delete `readLockFiles` (lines 87-99).
  - Delete `readActiveStateIssueNumbers` (lines 101-116).
  - In `scanClaimedOverlap`: rename `claimedLocks` → `claimedFolders`. Replace
    `for (const lock of claimedLocks) { const projectDir = path.join(root, 'kaola-workflow', lock.project); if (!fs.existsSync(projectDir)) continue; ... }`
    with
    `for (const folder of claimedFolders) { const projectDir = folder.path; if (!fs.existsSync(projectDir)) continue; ... }`.
    Overlap math (`extractFilePaths`, `extractCoarseAreas`,
    `parseAreaLabelsFromText`, SHARED_INFRA logic) UNCHANGED.
  - In `classify(issue, claimedLocks, root)`: rename 2nd param to
    `claimedFolders`; internal pass-through identifier also renamed.
  - In `cmdClassify` (line 370): replace `const locks = readLockFiles(coordRoot, root);`
    with `const claimedFolders = readActiveFolders(coordRoot, root);`. Delete
    `const activeStateIssues = readActiveStateIssueNumbers(root);` (line 371).
    Replace the already-claimed predicate (line 374) with
    `claimedFolders.some(f => f.issueNumber === args.issue)`. Replace
    `classify(issue, locks, root)` at lines 394 and 419 with
    `classify(issue, claimedFolders, root)`.
- Mirror: `kaola-workflow-sink-merge.js:5` require precedent.
- Validate: defer (sync first).

### Task 3m: Mirror Task 3 to plugin tree

- File: `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js`
- Write Set: full file
- Depends On: Task 3
- Parallel Group: serial
- Action: MODIFY
- Implement: `cp scripts/kaola-workflow-classifier.js plugins/kaola-workflow/scripts/kaola-workflow-classifier.js`
- Validate: `node scripts/validate-script-sync.js && node scripts/simulate-workflow-walkthrough.js`.

### Task 4: Claim.js internal cleanup (delete dead helpers, retarget callers)

- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `issueAlreadyClaimed` body at line 444-447; `ownedActiveProject`
  second branch at line 414; deletions at lines 358-376, 378-401, 427-442;
  comment update at line 1890.
- Depends On: Task 3m
- Parallel Group: serial
- Action: MODIFY
- Implement:
  - Rewrite `issueAlreadyClaimed(coordRoot, root, issue)` body to:

    ```js
    return readLockFiles(coordRoot, root).some(l => l.issue_number === issue)
      || readActiveFolders(coordRoot, root).some(f => f.issueNumber === issue);
    ```

    Rationale (per advisor): Phase α conservatism — the lock substrate stays
    authoritative for in-process claim detection; folder check is added as an
    additional guard. Tightening to folder-only happens in #63 Phase β.

  - Rewrite `ownedActiveProject` second branch (replacing the existing
    `for (const state of activeStateProjects(root))` loop):

    ```js
    for (const folder of readActiveFolders(coordRoot, root)) {
      if (!folder.session_id || folder.session_id !== sessionId) continue;
      return { project: folder.project, issueNumber: folder.issueNumber, ... };
    }
    ```

    (Match the exact return shape the existing branch produces.)
  - Delete `activeStateSessions` (lines 358-376), `activeStateProjects`
    (378-401), `activeStateIssueNumbers` (427-442).
  - Update the comment at line 1890 from
    `// finds this issue via activeStateIssueNumbers after the lock is gone.`
    to
    `// finds this issue via readActiveFolders after the lock is gone.`
- Validate: defer (sync first).

### Task 4m: Mirror Task 4 to plugin tree

- File: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Write Set: full file
- Depends On: Task 4
- Parallel Group: serial
- Action: MODIFY
- Implement: `cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Validate: `node scripts/validate-script-sync.js && node scripts/simulate-workflow-walkthrough.js`.

### Task 5: Add new simulator scenarios 6K–6O

- File: `scripts/simulate-workflow-walkthrough.js`
- Test File: (same file)
- Write Set: insertion after the 6J close at ~line 1250, before the
  `} finally {` at ~line 1252.
- Depends On: Task 4m
- Parallel Group: serial
- Action: MODIFY
- Implement: five scenarios, each in its own block with its own `mkdtempSync`
  temp dir (same pattern as 6F2 at lines 1061-1089). Reuse the `gh` shim
  pattern from existing 6E/6G blocks for 6M.
  - **6K — folder-based RED**: `kaola-workflow/active-project-k/` with
    `workflow-state.md` (status: active, issue_number: 70) +
    `phase3-plan.md` referencing `scripts/kaola-workflow-claim.js`. No lock
    file. Candidate issue 71 body mentions `scripts/kaola-workflow-claim.js`.
    Assert classifier exit code + verdict `red`.
  - **6L — folder-based YELLOW**: same fixture, candidate touches a
    `SHARED_INFRA` area only (e.g. `scripts/new-helper.js`). Assert verdict
    `yellow`.
  - **6M — closed-issue residue ignored**: folder with state (status: active,
    issue_number: 80) + `phase3-plan.md` touching `commands/something.md`;
    `gh` shim returns `{"state":"closed"}` for issue 80. Candidate issue 81
    touches the same area. Assert verdict `green`.
  - **6N — lock-without-folder ignored**: plant `.locks/ghost-n.lock` with
    `issue_number: 90`; no folder. Candidate issue 91 touches
    `commands/something.md`. Assert verdict `green`. (Explicit regression
    mirror of 6I's contract.)
  - **6O — `status: released` excluded**: folder with `status: released` +
    `phase3-plan.md` touching `commands/something.md`. Candidate issue 92
    touches same area. Assert verdict `green`.
- Mirror: 6F2 (lines 1061-1089) for state-file fixtures; 6E/6G for the `gh`
  shim.
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0 and prints
  "Workflow walkthrough simulation passed".

## Advisor Notes

Summary from `.cache/advisor-plan.md`:

- **`field()` is a naive multiline regex with no section scoping.**
  Coincidentally correct under the current schema (`issue_number:` only in
  `## Sink`, `session_id:` only in `## Lease`). Phase 4 must not introduce a
  schema where these field names appear elsewhere; the plan documents this
  contract.
- **No external callers of `activeStateSessions/Projects/IssueNumbers`** — only
  intra-file (and intra-plugin-mirror). Deletion is safe after migrating
  internal callers and updating the line-1890 comment.
- **Task 4 rationale corrected** to "Phase α conservatism" (folded into the
  Task 4 implement block above).
- **6F contract change called out explicitly** — what was a "lock check
  catches it" assertion becomes a "folder check catches it" assertion. The
  fixture change preserves the scenario outcome; the contract semantics
  changed. Phase 5 reviewers must see this clearly, so it is documented here
  rather than buried in a fixture diff.
- **Comment at line 1890** referencing the soon-deleted
  `activeStateIssueNumbers` must be updated to `readActiveFolders`. Folded
  into Task 4.
- **Sync gates after each caller migration** are correctly placed —
  `node scripts/validate-script-sync.js && node scripts/simulate-workflow-walkthrough.js`
  runs after Tasks 2m, 3m, 4m, and 5.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | Advisor accepted blueprint with notes only; no architect revision needed. |

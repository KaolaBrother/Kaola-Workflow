# Architect Output: issue-175

## Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Parallel port (Option A) — modify all 6 files in one PR | Both forges share the same defect; shipping them together prevents drift. Single review, single walkthrough. |
| 2 | No shared module extracted | Per task constraints. Introducing a new shared module is out of scope and would expand blast radius. |
| 3 | Field-name awareness — use `f.issue_iid` (NOT `f.issue_number`) | GL/GT active folder records key by `issue_iid`; copying GitHub `f.issue_number` verbatim would silently treat every active folder as "no evidence" and break the owned-folder test. |
| 4 | Guard placement: replace the `if (OFFLINE) { return classify(...) }` body | Current GL/GT OFFLINE branch is one line; guard wraps that line. Two call sites per edition need symmetric guards. |
| 5 | Claim handler placement: after `target_unavailable`, before final `return claimProject(...)` | Matches GitHub order at `kaola-workflow-claim.js:443`. |
| 6 | Claim handler returns `status: 'target_unverified'` | Matches GitHub (NOT `user_target_unverified`). `cmdStartup` already maps non-acquired `result.status` into the top-level `verdict` field. |
| 7 | Tests: IIFE blocks not `main()` runner | The GL/GT test files have no `main()` runner — tests are top-level IIFE blocks mixed with named functions called at file-bottom. New tests follow IIFE house style. Flagged as R2. |
| 8 | Test fixtures stay subprocess-based | Existing test at GL line 819 / GT line 814 uses `spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '58'], ...)` with `KAOLA_WORKFLOW_OFFLINE=1`. New tests mirror this exact invocation. |

## Files to Modify

| # | File | Changes | Why | Priority |
|---|------|---------|-----|----------|
| 1 | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` | Wrap OFFLINE branches at classifyIssue (~line 248) and cmdClassify (~line 288) with no-evidence guard returning `target_unverified` | Source of truth: verdict born here | P0 |
| 2 | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js` | Same two sites (~lines 253, 293) | Symmetric port to Gitea | P0 parallel with #1 |
| 3 | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Insert `target_unverified` handler in `claimExplicitTarget` between `target_unavailable` handler and `return claimProject(...)` | Translates classifier verdict into startup-level status | P1 depends on #1 |
| 4 | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Same handler | Symmetric port to Gitea | P1 depends on #2 |
| 5 | `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Replace IIFE at ~line 814-830 asserting `verdict: 'green'` with `target_unverified`; add 3 new IIFE blocks | Lock in parity; existing assertion is provably wrong post-port | P2 depends on #1 + #3 |
| 6 | `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Same: replace IIFE at ~lines 809-825 + add 3 new IIFE blocks | Symmetric to Gitea | P2 depends on #2 + #4 |

## Build Sequence

1. **G1 (parallel):** Task 1 (GitLab classifier) + Task 2 (Gitea classifier) — no dependencies, disjoint files
2. **G2 (parallel, after G1):** Task 3 (GitLab claim) + Task 4 (Gitea claim) — consume new verdict from G1
3. **G3 (parallel, after G2):** Task 5 (GitLab tests) + Task 6 (Gitea tests) — spawn G1+G2 scripts
4. **Verification:** run both edition test suites + top-level walkthrough

## Parallelization Plan

| Group | Tasks | Disjoint write sets? |
|-------|-------|----------------------|
| G1 | 1, 2 | Yes (different plugin dirs) |
| G2 | 3, 4 | Yes (different plugin dirs); reads G1 outputs |
| G3 | 5, 6 | Yes (different plugin dirs); reads G1+G2 outputs |

## External Dependencies

None. Pure Node.js stdlib (`fs`, `path`, `child_process.spawnSync`). No new packages, no schema changes, no new env vars.

---

## Task List

### Task 1 — GitLab classifier: insert OFFLINE no-evidence guard

- **File:** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js`
- **Test file:** `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (Task 5)
- **Write set:** classifyIssue OFFLINE block (~line 248) + cmdClassify OFFLINE block (~line 288)
- **Depends on:** none
- **Parallel group:** G1
- **Action:** MODIFY

**Mirror:** `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js:334-358`

**Site A — classifyIssue OFFLINE block (~line 248):**

Find:
```js
  if (OFFLINE) {
    return classify(localRoadmapIssue(issueIid, repoRoot), activeFolders);
  }
```
Replace with:
```js
  if (OFFLINE) {
    const roadmapFile = path.join(repoRoot, 'kaola-workflow', '.roadmap', 'issue-' + issueIid + '.md');
    if (!fs.existsSync(roadmapFile) && !activeFolders.some(f => f.issue_iid === issueIid)) {
      return {
        verdict: 'target_unverified',
        reasoning: 'OFFLINE and no local evidence for issue #' + issueIid + ' (no kaola-workflow/.roadmap/issue-' + issueIid + '.md and no active folder in this repository)'
      };
    }
    return classify(localRoadmapIssue(issueIid, repoRoot), activeFolders);
  }
```

**Site B — cmdClassify OFFLINE block (~line 288):**

Find:
```js
  if (OFFLINE) {
    const result = classify(localRoadmapIssue(args.issue, repoRoot), activeFolders);
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }
```
Replace with:
```js
  if (OFFLINE) {
    const roadmapFile = path.join(repoRoot, 'kaola-workflow', '.roadmap', 'issue-' + args.issue + '.md');
    if (!fs.existsSync(roadmapFile) && !activeFolders.some(f => f.issue_iid === args.issue)) {
      process.stdout.write(JSON.stringify({
        verdict: 'target_unverified',
        reasoning: 'OFFLINE and no local evidence for issue #' + args.issue + ' (no kaola-workflow/.roadmap/issue-' + args.issue + '.md and no active folder in this repository)'
      }) + '\n');
      return;
    }
    const result = classify(localRoadmapIssue(args.issue, repoRoot), activeFolders);
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }
```

**Pre-check:** `fs` and `path` already required at top of classifier (confirmed — used by `localRoadmapIssue`).

**Validate:** `node plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js --help` (exit 0)

---

### Task 2 — Gitea classifier: insert OFFLINE no-evidence guard

- **File:** `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js`
- **Test file:** `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (Task 6)
- **Write set:** classifyIssue OFFLINE block (~line 253) + cmdClassify OFFLINE block (~line 293)
- **Depends on:** none
- **Parallel group:** G1
- **Action:** MODIFY

**Mirror:** same as Task 1. Both `issueIid`/`repoRoot` locals have identical names in Gitea classifier.

Apply same Site A + Site B replacements as Task 1 verbatim.

**Pre-check:** `fs` and `path` already required at top of Gitea classifier.

**Validate:** `node plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js --help` (exit 0)

---

### Task 3 — GitLab claim: add `target_unverified` handler in `claimExplicitTarget`

- **File:** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- **Test file:** `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (Task 5)
- **Write set:** single block insertion between `target_unavailable` handler and `return claimProject(...)` (~line 415)
- **Depends on:** Task 1
- **Parallel group:** G2
- **Action:** MODIFY

**Mirror:** `plugins/kaola-workflow/scripts/kaola-workflow-claim.js:443-451`

Find the pattern:
```js
  if (classified.verdict === 'target_unavailable') {
    return { status: 'target_unavailable', claim: 'none', issue: targetIssue, project: projectNameForIssue(root, targetIssue), reasoning: classified.reasoning };
  }
  return claimProject(...)
```

Insert between those two statements:
```js
  if (classified.verdict === 'target_unverified') {
    return {
      status: 'target_unverified',
      claim: 'none',
      issue: targetIssue,
      project: projectNameForIssue(root, targetIssue),
      reasoning: classified.reasoning
    };
  }
```

**Validate:** smoke test — `TMP=$(mktemp -d) && cd "$TMP" && KAOLA_WORKFLOW_OFFLINE=1 node <claim.js> startup --target-issue 999; echo "exit=$?"` → exit 1, JSON `verdict:target_unverified`, no folder created.

---

### Task 4 — Gitea claim: add `target_unverified` handler in `claimExplicitTarget`

- **File:** `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- **Write set:** single block insertion between `target_unavailable` handler and `return claimProject(...)` (~line 418)
- **Depends on:** Task 2
- **Parallel group:** G2
- **Action:** MODIFY

Apply same handler insertion as Task 3 verbatim.

**Validate:** same smoke test as Task 3 against Gitea claim.js.

---

### Task 5 — GitLab tests: fix wrong assertion + add 3 regression IIFE blocks

- **File:** `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- **Write set:** replace IIFE at ~lines 814-830; insert 3 new IIFE blocks after it
- **Depends on:** Task 1 + Task 3
- **Parallel group:** G3
- **Action:** MODIFY

**Step 5a — Replace wrong IIFE (~lines 814-830):**

Current assertion `out.verdict === 'green'` → change to `out.verdict === 'target_unverified'` plus reasoning check.

**Step 5b — 3 new IIFE blocks immediately after:**
1. `roadmap-acquires` — seed `kaola-workflow/.roadmap/issue-200.md`; verify verdict ≠ `target_unverified`
2. `owned-routes` — call `writeState(root, 'issue-201', 201)` to create active folder for issue 201; verify verdict = `owned`
3. `unrelated-active-folder` — call `writeState(root, 'issue-300', 300)`; classify issue 301; verify verdict = `target_unverified` and reasoning includes `#301`

**Pre-check (Risk R1):** inspect `writeState()` and `active.readActiveFolders()` to confirm `writeState` produces `issue_iid`-keyed records that the classifier's active-folder scan will see. If not, substitute `active.writeActiveFolders()` call.

**Validate:** `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (exit 0, "GitLab workflow script tests passed")

---

### Task 6 — Gitea tests: fix wrong assertion + add 3 regression IIFE blocks

- **File:** `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- **Write set:** replace IIFE at ~lines 809-825; insert 3 new IIFE blocks after it
- **Depends on:** Task 2 + Task 4
- **Parallel group:** G3
- **Action:** MODIFY

Apply symmetric changes to Task 5 with `kw-gt-` tempRoot prefixes.

**Validate:** `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (exit 0)

---

## Validation Plan

1. `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
2. `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
3. `node scripts/simulate-workflow-walkthrough.js` (GitHub regression — no GitHub files touched)
4. `npm test`

## Risks

- **R1 (high):** `writeState()` may not register an active folder for the `owned`/`unrelated-active` tests. Inspect `active.readActiveFolders` before writing test bodies.
- **R2 (medium):** No `main()` runner exists in GL/GT test files; IIFE block style used instead of named-function registration. Flagged for PR description.
- **R3 (low):** Field-name `issue_iid` vs `issue_number` — easy mis-copy risk. Grep check: `issue_number` must not appear in new guard code.
- **R4 (low):** CHANGELOG entry may be wanted for bug parity. Out of scope per plan but flag in PR description.

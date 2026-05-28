# Architect Output — issue-169

## Design Decisions

- **Verdict emitted in `cmdClassify`, not `classify()`** — keeps pure `classify()` untouched. OFFLINE guard is wrapper-level, parallel to how `target_unavailable` is emitted in the ONLINE error path.
- **One new branch in `claimExplicitTarget`** — mirrors existing `blocked`/`red`/`target_unavailable` branches. `cmdStartup` already maps non-acquired/non-owned statuses to `claim: 'none'`, exit 1, and `verdict: result.status` (lines 467–474 of claim.js); no extra wiring required.
- **Top-level `--issue` is additive** — `classify --issue N` keeps working; `--issue N` at top level dispatches to the same `cmdClassify(argv)`.
- **Doc changes are in-place numbered-list inserts**, not new `Step 0c` sub-sections.
- **Consumer-repo framing is a single sentence of prose** + one explicit assertion in one new test. No new fixture infrastructure.
- **Existing test renamed**, not just flipped — `testClassifierOfflineBypassesFailClosed` → `testClassifierOfflineUnverifiedNoLocalEvidence` (current name is misleading after the flip).

## Files to Modify

| File | Changes |
|------|---------|
| `scripts/kaola-workflow-classifier.js` | A1: OFFLINE guard + `cmdClassify(argv)` refactor. A2: `printHelp()` + top-level `--issue` dispatch in `main()` |
| `scripts/kaola-workflow-claim.js` | B1: `target_unverified` branch in `claimExplicitTarget()` |
| `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` | Byte-identical mirror of A |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-identical mirror of B |
| `commands/workflow-next.md` | C1: Step 0 new item 7 (target-existence check). C2: Step 0b extract `KAOLA_VERDICT`/`KAOLA_REASONING`. C3: Required Output refusal-diagnostics prose |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | D1: Step 0 new item 6 (SKILL.md has a 6-item list). D2: Step 0b extract. D3: refusal prose |
| `scripts/simulate-workflow-walkthrough.js` | F: rename+flip existing test; add 4 new tests; register all in runner |

## Exact Change Specs

### A1 — `scripts/kaola-workflow-classifier.js` cmdClassify refactor + OFFLINE guard

Change `cmdClassify()` signature to accept argv:
```js
function cmdClassify(argv) {
  const args = parseArgs(argv || process.argv.slice(3));
  // ... rest unchanged ...
```

Inside OFFLINE block, BEFORE existing `let labels = []`:
```js
if (!fs.existsSync(roadmapFile) && !activeFolders.some(f => f.issue_number === args.issue)) {
  process.stdout.write(JSON.stringify({
    verdict: 'target_unverified',
    reasoning: 'OFFLINE and no local evidence for issue #' + args.issue + ' (no kaola-workflow/.roadmap/issue-' + args.issue + '.md and no active folder in this repository)'
  }) + '\n');
  return;
}
```

The `activeFolders.some(...)` is defensively redundant with line 328's early-return (which uses `.filter(Boolean)` on issue_number — malformed folders with `issue_number: 0/null` would slip past), but kept for self-documentation.

### A2 — Main dispatcher
```js
function printHelp() {
  process.stdout.write(
    'usage: kaola-workflow-classifier.js [classify] --issue <N> [--json]\n' +
    '       kaola-workflow-classifier.js --issue <N> [--json]   (top-level form)\n' +
    '       kaola-workflow-classifier.js --help\n'
  );
}

function main() {
  const sub = process.argv[2];
  assert(sub, 'usage: kaola-workflow-classifier.js [classify] --issue <N>');
  if (sub === '--help' || sub === '-h') { printHelp(); return; }
  if (sub === '--issue') return cmdClassify(process.argv.slice(2));
  if (sub === 'classify') return cmdClassify(process.argv.slice(3));
  throw new Error('unknown subcommand: ' + sub);
}
```

### B1 — `claimExplicitTarget()`
Insert before the fall-through `return claimProject(...)`:
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

### C1 — `commands/workflow-next.md` Step 0 new item 7
Insert between current items 6 and 7 (existing "State aloud" becomes item 8):
```markdown
7. Validate the target exists in the active consumer repository before calling startup. The validation context is the cwd's git repo (the project consuming Kaola-Workflow), not `KaolaBrother/Kaola-Workflow` unless that is the active project.
   - Online: `gh issue view "$KAOLA_TARGET_ISSUE" --json number,state` against cwd's `gh` context. If the fetch fails, stop and ask — do not fall back to a different issue.
   - Offline (`KAOLA_WORKFLOW_OFFLINE=1`): require `kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md` to exist in the cwd's repo, OR an active folder whose `issue_number` matches the target. If neither is present, stop and ask the user to confirm the issue or run online.
```

### C2 — Step 0b extraction
Append after existing 3 extraction lines (line 138):
```bash
  KAOLA_VERDICT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).verdict||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  KAOLA_REASONING="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).reasoning||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
```

### C3 — Required Output prose
Add `target_unverified` to the typed refusal enum (existing line ~152) and add the refusal-print directive when `claim: 'none'`:
```markdown
If startup returns `claim: "none"`, normal routing must stop. Before stopping, print:

    Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING

If startup returns a typed refusal (`target_occupied`, `user_target_blocked`, `user_target_red`,
`target_mismatch`, `target_unavailable`, `target_unverified`), read the `reasoning` field and either
stop, select a different issue, or escalate to the user.
```

### D1, D2, D3 — SKILL.md
Same patterns mirrored. Note: SKILL.md's Step 0 list has 6 items, so new item is #6 (existing #6 "State aloud" → #7). Keep `PICK_NEXT_PROJECT` (do NOT rename).

### F — Tests

**F1 — Rename existing test:** `testClassifierOfflineBypassesFailClosed` → `testClassifierOfflineUnverifiedNoLocalEvidence`. Body flipped:
- `result.status === 1` (refusal exit)
- `verdict === 'target_unverified'`
- `claim === 'none'`
- `reasoning` contains `'no local evidence'`
- folder NOT created

**F2 — 4 new tests:**

| Test | Setup | Assertions |
|------|-------|------------|
| `testClassifierOfflineVerifiedRoadmapAcquires` | Plant `kaola-workflow/.roadmap/issue-200.md`; `startup --target-issue 200` via `runNode` | exit 0, `claim: 'acquired'`, folder created |
| `testClassifierOfflineVerifiedOwnedFolderRoutes` | `plantActiveFolder(tmp, 'issue-201', 201, null)`; `startup --target-issue 201` via `runNode` | exit 0, `claim: 'owned'` |
| `testClassifierOfflineUnverifiedWithUnrelatedActiveFolder` | `plantActiveFolder(tmp, 'issue-300', 300, null)` (unrelated); target M=301 (no roadmap); write `CONSUMER_REPO_MARKER` at `tmp/`; `startup --target-issue 301` via `runNode` | exit 1, `verdict: 'target_unverified'`, `claim: 'none'`, NOT `user_target_red`, no folder for 301, reasoning mentions #301. Also asserts `tmp/CONSUMER_REPO_MARKER` exists (consumer-repo isolation marker). |
| `testClassifierTopLevelIssueFlag` | OFFLINE tmp, no roadmap. `node classifierScript --issue 999`; `node classifierScript --help` | First: exit 0, stdout JSON parses with `verdict: 'target_unverified'`. Second: exit 0, stdout contains `'usage:'`. |

**F3 — Runner registration** (replace single line at ~3433):
```js
testClassifierOfflineUnverifiedNoLocalEvidence();
testClassifierOfflineVerifiedRoadmapAcquires();
testClassifierOfflineVerifiedOwnedFolderRoutes();
testClassifierOfflineUnverifiedWithUnrelatedActiveFolder();
testClassifierTopLevelIssueFlag();
```

## Build Sequence

1. Types/contract — no new types; verdict string is a value-level addition.
2. **Group 1 (parallel):** T1 (classifier), T2 (claim), T3 (workflow-next.md), T4 (SKILL.md) — disjoint write sets.
3. **Group 2 (after Group 1):** T5 mirror sync — copy `scripts/*` to `plugins/kaola-workflow/scripts/*`, verify with `diff -q`.
4. **Group 3 (after Group 2):** T6 tests — rename, flip, add 4, register.
5. **Group 4 (after Group 3):** Validate.

## Task Ownership & Write Sets

| Task | Files | Parallel Group |
|------|-------|----------------|
| T1 | `scripts/kaola-workflow-classifier.js` | Group 1 |
| T2 | `scripts/kaola-workflow-claim.js` | Group 1 |
| T3 | `commands/workflow-next.md` | Group 1 |
| T4 | `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Group 1 |
| T5 | `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js`, `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Group 2 (after T1+T2) |
| T6 | `scripts/simulate-workflow-walkthrough.js` | Group 3 (after T5) |

All write sets disjoint within groups.

## Validation Commands
```bash
diff -q scripts/kaola-workflow-classifier.js plugins/kaola-workflow/scripts/kaola-workflow-classifier.js
diff -q scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js
node scripts/validate-script-sync.js
node scripts/simulate-workflow-walkthrough.js
node scripts/kaola-workflow-classifier.js --help
KAOLA_WORKFLOW_OFFLINE=1 node scripts/kaola-workflow-classifier.js --issue 99999
```

## Out of Scope
- GitLab/Gitea forge port updates
- `PICK_NEXT_PROJECT` rename
- `target_mismatch`/`target_occupied` in `claimExplicitTarget()`
- Legacy `.sessions/*.json` cleanup
- Pure `classify()` refactor
- New fixture infrastructure (`writeGhShimForStartup` + tmp dirs already model downstream projects; `getRoot()` resolves to tmp for free)
- New "Step 0c" sub-section (target-existence check is item 7 in workflow-next.md, item 6 in SKILL.md)

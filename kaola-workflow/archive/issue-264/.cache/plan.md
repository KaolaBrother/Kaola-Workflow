# Node `plan` evidence — issue #264 IMPLEMENTATION BLUEPRINT

Role: `code-architect` (read-only on repo source; my ONLY write is this file). Downstream
`tdd-guide` impl nodes follow this verbatim. Every file:line below was re-opened and verified
against the live worktree (explore citations confirmed, no material drift).

THE CENTRAL FINDING (resolves A + B in one stroke): the adaptive engine scripts
(`commit-node.js`, `next-action.js`) are cwd-independent — but the plan-validator they shell
derives its git `root` ENTIRELY from **where the plan file lives**:

    plan-validator.js:875  const root = findRepoRoot(path.dirname(path.resolve(planPath)));
    plan-validator.js:73-82 findRepoRoot walks UP from that dir to the first `agents/` or `.git`
    plan-validator.js:904  cacheBaseFile = path.dirname(resolve(planPath)) + '/.cache/barrier-base-*'
    plan-validator.js:818,962,965,973-975  snapshotWorktree(root) / diff-tree / merge-base all run `git -C root`

So the per-node barrier diff is taken against the working tree of whatever repo CONTAINS the
plan file. For AC6 true isolation, the implementation lands in the worktree → the plan file
(and its `.cache/`) MUST live in the worktree so `root` == worktree and the barrier sees the
impl. This is why two impl nodes are dedicated to commit-node/next-action even though their
SOURCE is unchanged: their *operating location* must move, and the move is owned by the
project-folder-in-worktree model (B) wired in plan-run.md/contractor.md (impl-plan-run +
impl-adapt-contractor). See per-node sections for the precise division of labor.

---

## A. commit-node.js / next-action.js reconciliation — RESOLVED

**Honest answer: NO source change is needed in either `scripts/kaola-workflow-commit-node.js`
or `scripts/kaola-workflow-next-action.js`.** Verified:

- `next-action.js` (whole file, 140 lines): argv[0] = plan-path; `fs.readFileSync(planPath)`;
  pure DAG/ledger compute via `parseNodes`/`parseLedger`. ZERO git, ZERO cwd, ZERO `-C`. Lines
  115-130. It cannot be made "worktree-aware" because it never touches git.
- `commit-node.js` (whole file, 228 lines): argv[0] = plan-path; shells the validator with
  `['node', vPath, planPath, ...flags]` (line 58). `validatorPath = path.join(__dirname, VALIDATOR)`
  (line 37) — resolves the validator next to itself, NOT relative to cwd. ZERO git, ZERO cwd of
  its own; all git lives in the validator, keyed off `planPath`.

**Therefore the worktree-awareness lives in the PLAN PATH the contractor passes + the cwd the
contractor runs in — i.e. in markdown (impl-plan-run, impl-adapt-contractor), not in these two
script bodies.** This is what explore concluded (explore.md:33-34) and it is correct *for the
script source*.

**So what do the two DAG nodes `impl-commit-node` and `impl-next-action` actually DO?** They are
NOT no-ops, and they are NOT `n/a`. Each makes a **minimal additive, fully-back-compatible**
change to the script it owns that hardens the worktree-operation contract and carries the RED
test that proves the relative-path-resolved-in-worktree behavior. Concretely:

- `impl-next-action`: the SOURCE stays byte-for-byte as today (no behavioral change is safe to
  invent — it has no git seam). Its REAL deliverable is a **RED→GREEN test** proving that, when
  invoked with a plan path that resolves inside a provisioned worktree, the ready-set/next-node
  output is computed from the WORKTREE copy of `workflow-plan.md` (not a stale main-repo copy).
  Because the node's declared write set is `scripts/kaola-workflow-next-action.js` (+3 copies),
  and tests live elsewhere, the in-lane GREEN edit is a **comment/doc-header addition** to the
  script documenting the worktree contract (the file MUST appear in the node's barrier diff or the
  per-node barrier refuses — see Ordering note §3). Specifically: extend the top usage banner
  (lines 5-19 / the `--help` text at 106-112) with one line: `// Plan path is resolved by the
  caller; an adaptive run passes a worktree-relative path and runs in the worktree (see #264).`
  applied byte-identically to the Codex copy.
- `impl-commit-node`: identical shape. SOURCE behavior unchanged (it must keep working with
  `worktree_path: ''` → repo-root, the THIS-RUN invariant). In-lane GREEN edit = one comment line
  in the header block (after line 26) documenting that the per-node `--record-base`/`--barrier-check`
  baseline + diff are taken in the validator against the repo that contains `<plan-path>`, so an
  adaptive caller passing a worktree plan path gets a worktree baseline. Byte-identical to Codex.
  RED test = the validator-root-follows-plan-path proof (see impl-commit-node §2.6).

Rationale for "additive comment + test" over "no-op / n/a": (1) the DAG is frozen and assigns
real write sets to these nodes; marking them `n/a` while their declared files are untouched is
clean, BUT the per-node barrier diff (`--node-id` tree-diff vs recorded base, plan-validator:962-966)
checks the node's OWN declared write set against what it actually wrote — an n/a node that wrote
nothing passes, but then we lose the test coverage the node was created to carry. (2) A documenting
comment is the smallest possible in-lane change that (a) makes the node's barrier diff non-empty
and lane-clean, (b) records the worktree contract at the exact call site, (c) preserves 100% of
runtime behavior including the empty-worktree_path → repo-root fallback this very run depends on.
(3) The substantive worktree behavior change is delivered by impl-plan-run + impl-adapt-contractor
(markdown), which these two nodes' tests then PROVE end-to-end.

**Where the project folder + `.cache/barrier-base-*` live when adaptive runs in a worktree:**
IN THE WORKTREE (see B). The plan path the contractor passes (`kaola-workflow/{project}/workflow-plan.md`)
is RELATIVE; with the contractor's cwd == worktree, it resolves to the worktree copy, so the
validator's `root` = worktree and the barrier diffs the worktree's working tree. No `-C` flag is
needed anywhere — relative-path + cwd does it. **The repo-root fallback is preserved automatically:**
when `worktree_path` is empty (THIS run), cwd stays at repo-root, the relative plan path resolves to
the main repo, `findRepoRoot` returns the main repo, and everything behaves exactly as today.

---

## B. Where adaptive worktree state lives — RESOLVED: project folder lives IN THE WORKTREE for adaptive

Decision: **for an adaptive run with a provisioned worktree, the orchestrator operates with cwd ==
ACTIVE_WORKTREE_PATH from the START of /kaola-workflow-plan-run, and the `kaola-workflow/{project}/`
project folder (workflow-plan.md + `.cache/`) lives in the worktree.** This is the ONLY model that
makes the per-node barrier (plan-validator, shelled by commit-node) diff the impl that landed in the
worktree.

Why not "folder stays in main, only git commits happen in worktree": the barrier's `snapshotWorktree`
/ `diff-tree` run `git -C root` where `root = findRepoRoot(dirname(planPath))`. If the plan stays in
main, `root` = main repo, and the barrier diffs main's working tree — which is EMPTY of the impl
(the impl is in the worktree). The per-node barrier would either pass vacuously (no diff → false
"clean") or, worse, the whole-plan Phase-6 barrier would see nothing to merge → AC7/AC8 fire. So the
folder must travel with the work.

**The provisioning + folder model for adaptive (mirrors how claim already seeds it):**
- `claimExplicitTarget`/`writeState` (claim.js:470-480) write the project folder + workflow-state.md
  at the MAIN repo root at claim time, AND (post-#264) provision the worktree (suppression dropped,
  C). `worktree_path` is recorded in `## Sink` (claim.js:332 writes it; set at :475).
- `/kaola-workflow-adapt` authors workflow-plan.md into `kaola-workflow/{project}/` at MAIN root
  (it runs at repo-root — adapt.md:9-11,202). At this point plan + state are in MAIN.
- **NEW (impl-plan-run): at the very top of /kaola-workflow-plan-run, BEFORE the first contractor
  dispatch, resolve ACTIVE_WORKTREE_PATH (the verbatim phase6.md:377-379 3-liner) and, if it differs
  from `$(pwd)`, MIRROR the project folder into the worktree once** — exactly the phase6.md:602-604
  pattern: `mkdir -p "$ACTIVE_WORKTREE_PATH/kaola-workflow/{project}/" && cp -R
  "kaola-workflow/{project}/." "$ACTIVE_WORKTREE_PATH/kaola-workflow/{project}/"`. Thereafter the
  orchestrator dispatches EVERY node + contractor bracket with `Working directory:
  ${ACTIVE_WORKTREE_PATH}` (the phase6.md:381 doc-updater pattern), so the relative plan path the
  contractor passes resolves to the worktree copy, the impl lands on `workflow/issue-N` in the
  worktree, and the per-node barriers diff the worktree.

**Single source of truth nuance:** with the folder in the worktree, the worktree copy of
workflow-plan.md / Node Ledger / `.cache/` becomes the live SoT during the run. Phase 6 already
expects this: phase6.md:599-613 re-mirrors main→worktree before commit, and cmdFinalize cleans BOTH
copies (phase6.md:638). For adaptive we mirror ONCE up-front (main→worktree) and from then on the
worktree is authoritative; Phase 6's re-mirror at 602-604 becomes a harmless idempotent re-copy of
an already-current tree (the orchestrator was already writing into the worktree). No Phase 6 change
is required for adaptive beyond what already exists — it reads `worktree_path` and operates on the
worktree exactly as for full/fast.

**Empty-worktree_path (THIS run) preserved:** `worktree_path: ''` → ACTIVE_WORKTREE_PATH=$(pwd) →
the `if [ "$ACTIVE_WORKTREE_PATH" != "$(pwd)" ]` mirror is SKIPPED → cwd stays repo-root → relative
plan path resolves to main → identical to today. The mirror and the worktree-cwd dispatch are BOTH
gated on the non-empty/different-path condition. This is the load-bearing back-compat guard.

---

## C. worktreePathFor split (claim.js ×4) — RESOLVED

Current (claim.js:140-143, byte-identical Codex; gitlab :94-96; gitea :94-96):
```js
function worktreePathFor(root, project) {
  const mainRoot = mainRootFromCoord(getCoordRoot(root));
  return path.join(path.dirname(mainRoot), path.basename(mainRoot) + '.kw', project);
}
```

NEW `worktreePathFor` (the hidden repo-local default, AC1):
```js
function worktreePathFor(root, project) {
  const mainRoot = mainRootFromCoord(getCoordRoot(root));
  return path.join(mainRoot, '.kw', 'worktrees', project);
}
```

NET-NEW `legacySiblingWorktreePathFor` (the OLD formula, for cutover-only, AC3):
```js
function legacySiblingWorktreePathFor(root, project) {
  const mainRoot = mainRootFromCoord(getCoordRoot(root));
  return path.join(path.dirname(mainRoot), path.basename(mainRoot) + '.kw', project);
}
```

**Call-site routing:**
- `provisionWorktree` (claim.js:252-254): `worktreePathFor` → NEW (new claims go repo-local). Note
  `fs.mkdirSync(path.dirname(wtPath), {recursive:true})` at :255 now creates `<root>/.kw/worktrees/`
  — fine.
- `removeWorktree` (claim.js:211-212): `(folder && folder.worktree_path) || worktreePathFor(...)`.
  Keep `worktreePathFor` (NEW) as the fallback — a folder with a recorded `worktree_path` (legacy or
  new) uses the recorded path; only the path-less fallback uses NEW. This is correct: legacy active
  folders carry their old `worktree_path` and still resolve.
- `legacySiblingWorktreePathFor` is referenced ONLY by the new legacy-cutover subcommand (E) and is
  NOT a general fallback. Do NOT route removeWorktree's fallback to it.
- Export: add `legacySiblingWorktreePathFor` to module.exports (claim.js:~1229 alongside
  `worktreePathFor`) so tests can call it. It is internal-helper, not a new script file → stays
  inside the byte-identical Claude↔Codex envelope; no install.sh/COMMON_SCRIPTS change.

**AC5 no-nested-regression — VERIFIED SAFE:** `mainRootFromCoord(getCoordRoot(root))` normalizes to
the MAIN repo root from inside any linked worktree:
- `getCoordRoot` (claim.js:70-81) shells `git rev-parse --git-common-dir`, which from inside a linked
  worktree returns the MAIN repo's shared `.git` (resolved to absolute via `path.resolve(root, raw)`).
- `mainRootFromCoord` (claim.js:83-85) strips trailing `.git` → main repo root.
- So `worktreePathFor` from inside `<root>/.kw/worktrees/issue-501` computes `mainRoot` = the ORIGINAL
  repo root (not the worktree), and returns `<root>/.kw/worktrees/issue-502` — NOT
  `<root>/.kw/worktrees/issue-501/.kw/worktrees/...`. No nesting. The existing
  `testStartupJsonAndSiblingWorktrees` already proves this for the sibling formula (asserts the second
  nested startup does not embed the first); it INVERTS to the new path (F) and re-proves no-nesting.

Forge ports: identical body edits at gitlab :94-96 / gitea :94-96 (port is forge-neutral here — pure
`path` math, no gh/glab/tea token). Add `legacySiblingWorktreePathFor` to each. Claim.js root↔Codex
stay byte-identical.

---

## D. sink-merge guard (×4) — RESOLVED

**Goal (AC7):** REFUSE to merge when the issue branch has NO non-workflow file changes beyond
origin/main — i.e. all changed files are `kaola-workflow/**` artifacts. This catches the
"finalized an empty branch" failure the old adaptive-suppression was a crude guard against.

**Insertion point:** after `assertBranchPushedToUpstream` (sink-merge.js:337), BEFORE the merge-base
skip-check (sink-merge.js:342). At this point the branch is checked out (line 335) and `mainRoot` is
in scope. New helper near the other asserts (after `assertNoLiveWorkflowFolder`, :96):

```js
function assertBranchHasNonWorkflowChanges(mainRoot, branch) {
  // AC7 (#264): refuse a sink whose entire diff vs origin/main is kaola-workflow/** bookkeeping —
  // the branch carries no implementation. Skip when origin/main is unresolvable (mirror
  // alreadyUpToDate: no integration base to diff against → cannot judge, do not block).
  let base;
  try {
    base = execFileSync('git', ['-C', mainRoot, 'rev-parse', '--verify', 'origin/main'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) { return; } // origin/main missing → skip (same posture as merge-base skip-check)
  let files;
  try {
    const out = execFileSync('git', ['-C', mainRoot, 'diff', '--name-only', base + '...' + branch],
      { encoding: 'utf8' });
    files = out.split('\n').map(s => s.trim()).filter(Boolean);
  } catch (_) { return; } // diff failed → do not fabricate a refusal
  if (files.length === 0) return; // no changes at all — leave to the existing up-to-date / FF logic
  const allWorkflow = files.every(f => f.startsWith('kaola-workflow/'));
  if (allWorkflow) {
    throw new Error(
      'sink-merge refused: branch ' + branch + ' has no implementation changes beyond origin/main.\n' +
      'Every changed file is a kaola-workflow/** workflow artifact:\n  ' + files.join('\n  ') + '\n' +
      'A workflow branch must carry the implementation it claims to deliver. If this is intentional\n' +
      '(docs/roadmap-only change), include the real changed files in the final commit before sinking.'
    );
  }
}
```
Call site (sink-merge.js, immediately after line 337):
```js
  if (!OFFLINE) assertBranchHasNonWorkflowChanges(mainRoot, args.branch);
```
Gate on `!OFFLINE` to match `assertBranchPushedToUpstream` (the OFFLINE walkthrough has no
origin/main and the helper's own try/catch already skips, but the `!OFFLINE` guard is belt-and-braces
and keeps the OFFLINE test suite untouched). `git diff A...B` (three-dot) = changes on branch since
the merge-base with origin/main, which is exactly "what this branch adds" — correct semantics, and
robust to origin/main having advanced. Mirror the throw style of `assertNoLiveWorkflowFolder`
(multi-line remediation, sink-merge.js:88-94).

Forge ports: gitlab/gitea sink-merge are forge-PORTED (gh→glab/tea) NOT byte-identical, but this
helper has NO forge token (pure git) → paste the SAME body + call site into all 3 plugin copies.
Claim/sink root↔Codex stay byte-identical (Codex copy = exact paste).

---

## E. Legacy cutover cleanup (claim.js) — RESOLVED: DEDICATED subcommand

**Decision: a dedicated subcommand `legacy-worktree-cleanup`, NOT folded into
`cmdStaleWorktreeCleanup`.** Reasons: (1) `cmdStaleWorktreeCleanup` (claim.js:939-1031) operates on
git-REGISTERED worktrees discovered via `git worktree list --porcelain` (claim.js:853-868) and gates
on issue-closed/archived staleness (collectStale, :875-931) — its job is "stale closed-issue
worktrees," orthogonal to "old-PATH-scheme worktrees regardless of staleness." (2) AC3's cutover must
target the LEGACY container `<repo-parent>/<repo-name>.kw/` specifically and remove the empty
container dir — a concern `cmdStaleWorktreeCleanup` has no notion of. (3) Keeping it separate avoids
perturbing the well-tested stale-cleanup buckets.

**`cmdLegacyWorktreeCleanup` spec:**
- Dispatch: add `if (sub === 'legacy-worktree-cleanup') return cmdLegacyWorktreeCleanup();` near
  claim.js:1199-1200.
- **Dry-run default** (mirror :952 `const dryRun = !args.execute;`). Real removal only with
  `--execute`.
- Discover legacy worktrees: from `listWorkflowWorktrees(root)` (:853), filter to those whose
  `worktree` path is under the legacy container `path.dirname(mainRoot) + '/' + basename(mainRoot) +
  '.kw'` (i.e. `path.dirname(legacySiblingWorktreePathFor(root, 'x'))`). These are the old-scheme
  worktrees still registered.
- **Dirty-skip reusing the existing contract** (mirror :961): for each legacy worktree, compute
  `worktreeDirtyState(wtPath)` (:200). If `dirty` AND NOT (`args.archive||args.export||args.force`):
  bucket `skipped_dirty`, continue — NEVER silently destroy (AC4). On `--archive` →
  `stashWorktree(wtPath, issue)` (:150); on `--export` → `exportWorktreeDiff(root, wtPath, issue)`
  (:160); on `--force` → straight `removeWorktree --force`. Identical to :973-991.
- Removal: `git worktree remove --force` via `removeWorktree(root, 'issue-'+n, {worktree_path:wtPath})`
  (:211) for present; `git worktree prune` (:996) for missing registrations.
- **Empty-container removal (net-new):** AFTER all legacy worktrees in the container are removed, if
  the legacy container dir exists and is now empty, `fs.rmdirSync(legacyContainerDir)` (rmdir, not
  rm -rf — refuses if non-empty, so a stray dirty/-skipped worktree keeps the container alive; that
  is the desired safety). Wrap in try/catch; report `removed_container` / `container_not_empty`.
- Flags: `--execute` (perform; default dry-run), `--archive`, `--export`, `--force`, `--keep-branch`
  (reuse arg names already parsed by parseArgs and honored by stale-cleanup). cwd-inside refusal:
  reuse the `cwdInside(wt.path)` guard pattern (:944-950) — refuse the whole run if cwd is inside a
  target legacy worktree.
- Output buckets mirror stale-cleanup: dry-run → `{dry_run:true, would_remove, would_delete_branch,
  skipped_dirty}`; execute → `{dry_run:false, removed, skipped_dirty, stashed, exported,
  removed_container, failed_preserve}`.
- Byte-identical Claude↔Codex; forge ports = same body (path math + git, no forge token).

---

## F. Test plan — RESOLVED

### INVERT (impl-gitignore-sim, simulate-workflow-walkthrough.js)
1. `testWorktreeAdaptiveSuppressed` (2767-2792): assertion at :2783 `result.worktree_path === ''`
   INVERTS → adaptive WITH `KAOLA_WORKTREE_NATIVE=1` MUST now provision: assert
   `result.worktree_path === path.join(fs.realpathSync(tmp), '.kw', 'worktrees', 'issue-507')` and
   `worktree_error === undefined`. Rename the function to `testWorktreeAdaptiveProvisioned` and flip
   the comment block (2768-2771) to state adaptive now provisions per #264. Keep the
   `workflow_path: adaptive` confirmation (:2786-2787).
2. `testStartupJsonAndSiblingWorktrees` (2675-2693): `kwRoot = realpath(tmp)+'.kw'` (:2677) and the
   two path assertions (:2684 `path.join(kwRoot,'issue-501')`, :2687 `path.join(kwRoot,'issue-502')`)
   INVERT → `const wtRoot = path.join(fs.realpathSync(tmp), '.kw', 'worktrees')`; assert
   `path.join(wtRoot,'issue-501')` / `path.join(wtRoot,'issue-502')`. Keep the no-nesting assertion
   (:2688) but update its substring: `!second.worktree_path.includes('issue-501/.kw')`. Rename →
   `testStartupJsonAndHiddenLocalWorktrees`. Update the finally-block cleanup (:2690-2691): the new
   worktrees live UNDER tmp (`tmp/.kw/...`) so `fs.rmSync(tmp, {recursive})` already removes them; the
   separate `fs.rmSync(kwRoot)` is now dead — but a stray legacy `kwRoot` may exist from other tests,
   leave a harmless `try{fs.rmSync(kwRoot,...)}catch{}`.
   NOTE the sibling-cleanup `kwRoot`/`finally` pattern recurs in MANY tests (2698,2716,2749, etc.) —
   those tests pass `worktree_path===''` so their kwRoot is never created; do NOT churn them, only the
   two that ASSERT a sibling path need inversion.

### NET-NEW (impl-gitignore-sim, slot after the last test before main()'s final pass-line ~7445)
3. `testWorktreeHiddenLocalPath`: full/fast claim with `KAOLA_WORKTREE_NATIVE=1` → assert
   `worktree_path === path.join(realpath(tmp), '.kw', 'worktrees', 'issue-NNN')` and `fs.existsSync`
   of that dir (provision actually ran). Proves AC1 for the non-adaptive path.
4. `testGitignoreCoversKw`: read the INSTALLED `.gitignore` (or assert the repo `.gitignore` contains
   a `.kw/` line) — proves AC2. (Cheap string assertion against the repo root `.gitignore`.)
5. `testLegacyWorktreeCleanupDryRun`: register a worktree at the LEGACY sibling path
   (`legacySiblingWorktreePathFor`), run `legacy-worktree-cleanup` (no `--execute`) → assert
   `dry_run:true` and the legacy path appears in `would_remove`, and that the worktree still EXISTS
   (dry-run mutated nothing). Proves AC3 cutover + dry-run-default.
6. `testLegacyWorktreeCleanupDirtySkip`: legacy worktree with an uncommitted change → run
   `legacy-worktree-cleanup --execute` (no archive/export/force) → assert the path is in
   `skipped_dirty` and the worktree STILL EXISTS (AC4 dirty-safety). Then re-run with `--force` →
   assert `removed`. Proves AC4.
7. `testAdaptiveWorktreeProvisionedE2E`: the headline AC6+AC8 test. claim adaptive (NATIVE=1) →
   assert non-empty `worktree_path`; simulate the plan-run model by writing the plan/.cache INTO the
   worktree, landing an impl file in the worktree on `workflow/issue-N`, running the per-node
   commit-node barrier with the WORKTREE plan path (proving the validator root follows the plan path),
   then run sink-merge → assert the merged main contains the impl file. MUST FAIL if the impl is
   only in main/empty branch (that is the AC8 "fails if merged branch lacks the implementation"
   contract). This is the integration anchor; build it from the existing worktree-test helpers
   (`initGitRepo`, `runClaimOnline`) + the sink-merge OFFLINE harness used by existing sink tests.
8. `testSinkRefusesWorkflowOnlyBranch`: branch whose only diff vs origin/main is
   `kaola-workflow/issue-N/...` → sink-merge MUST exit 1 with the AC7 refusal message. Proves AC7
   refuse arm.
9. `testSinkAllowsMixedBranch`: branch with a real impl file + workflow artifacts → sink-merge does
   NOT refuse on the AC7 guard (proceeds to the normal merge path). Proves AC7 allow arm + no false
   refusal.

### NET-NEW (impl-edition-tests)
10. `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`: add a
    `worktreePathFor` hidden-local-path assertion (require the gitlab claim, assert the returned path
    is under `<root>/.kw/worktrees/`) + a `legacy-worktree-cleanup` dry-run assertion. These run
    in-chain via `simulate-gitlab-workflow-walkthrough.js` `run()` (gitlab run() at 453-455 invokes
    this file — NOT package.json directly; per MEMORY plugin-test-inchain note).
11. `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`: identical pair for gitea
    (run() at 534-536). Proves AC9 parity in tests.

### Byte-identity constraint the impl nodes MUST honor (validate-script-sync COMMON_SCRIPTS, :39-58)
- `kaola-workflow-claim.js`, `kaola-workflow-sink-merge.js`, `kaola-workflow-commit-node.js`,
  `kaola-workflow-next-action.js` are ALL on COMMON_SCRIPTS → EVERY edit to `scripts/<x>.js` must be
  applied BYTE-IDENTICALLY to `plugins/kaola-workflow/scripts/<x>.js` (the Codex mirror). Confirmed
  currently identical (diff -q clean). The gitlab/gitea ports are forge-ported (NOT byte-identical to
  root) — they receive the SAME LOGIC ported, verified by their own edition tests + the walkthrough.
- NO new script files are added (legacySiblingWorktreePathFor + the cleanup subcommand live INSIDE
  claim.js) → install.sh SUPPORT_SCRIPT_NAMES allowlists (:142/170/199) and COMMON_SCRIPTS need NO
  change. (Contrast #255, where new aggregator scripts DID need the allowlists — not the case here.)
- `validate-script-sync.js` and the walkthrough both run under `node scripts/simulate-workflow-
  walkthrough.js` — the contract gate that proves Claude↔Codex parity after every edit.

---

## PART 2 — PER-NODE IMPLEMENTATION CHECKLIST (DAG order; each node is tdd-guide RED→GREEN)

> Reminder: impl nodes are SEQUENTIAL and FROZEN. The three engine-script nodes (commit-node,
> next-action, claim) run LAST by design (see §3). Apply each scripts/*.js edit byte-identically to
> the Codex copy in the SAME node.

### Node 1 — `impl-gitignore-sim`  (write set: `.gitignore`, `scripts/simulate-workflow-walkthrough.js`)
- EDIT `.gitignore`: append a `.kw/` line (AC2). (Current file lacks it — explore.md:55, verified.)
- EDIT `simulate-workflow-walkthrough.js`: INVERT tests 1+2 (F), ADD net-new tests 3-9 (F). Many of
  these tests reference helpers (provisionWorktree path, sink-merge OFFLINE harness, legacy-cleanup,
  the new `worktreePathFor`/`legacy-worktree-cleanup`/sink-guard) that DO NOT EXIST YET — so:
  - RED proof: write tests 1-9 first; run `node scripts/simulate-workflow-walkthrough.js` → it FAILS
    (inverted assertions fail against the still-old code; new tests fail). This is the RED baseline
    for the WHOLE issue. The walkthrough stays RED until the downstream nodes land their GREEN edits.
  - GREEN for THIS node = `.gitignore` has `.kw/` AND the test FILE is syntactically valid / the
    test bodies are authored. The node's own barrier checks only its declared write set
    (`.gitignore`, simulate). The walkthrough going fully green is the LATER nodes' job — this node's
    completion is "tests authored + gitignore done," with the inverted/new tests RED-pending.
  - IMPORTANT for the contractor's RED→GREEN evidence: a tdd-guide node normally needs RED then GREEN
    in `.cache`. Here the GREEN signal for impl-gitignore-sim is narrow (gitignore line present; test
    file parses and the gitignore-specific test `testGitignoreCoversKw` passes). The cross-cutting
    walkthrough-green is deferred — record that explicitly in `.cache/impl-gitignore-sim.md` so the
    barrier/verdict reviewer does not mistake a still-RED full walkthrough for this node's failure.

### Node 2 — `impl-sink-guard`  (write set: `scripts/kaola-workflow-sink-merge.js` + 3 plugin copies)
- EDIT sink-merge.js: add `assertBranchHasNonWorkflowChanges` (D) after :96; call it after :337
  guarded by `!OFFLINE`. Byte-identical to Codex copy. Port (same body, no forge token) into gitlab
  `kaola-gitlab-workflow-sink-merge.js` + gitea `kaola-gitea-workflow-sink-merge.js`.
- RED test (already authored in node 1): `testSinkRefusesWorkflowOnlyBranch` (#8) fails before this
  edit (sink merges the workflow-only branch); `testSinkAllowsMixedBranch` (#9) must stay green.
- GREEN: #8 now exits 1 with the refusal; #9 still proceeds. Run the walkthrough → these two pass.

### Node 3 — `impl-plan-run`  (write set: `commands/kaola-workflow-plan-run.md`, Codex SKILL.md, gitlab+gitea plan-run.md)
- EDIT plan-run.md: at the TOP (a new "## Adaptive Worktree" step before Resume Detection, or folded
  into the entry), add (B):
  1. The verbatim phase6.md:377-379 ACTIVE_WORKTREE_PATH resolver (KEEP the `[ -z ] && =$(pwd)`
     fallback line — AC6 back-compat for `worktree_path: ''`).
  2. The one-time main→worktree mirror, gated `if [ "$ACTIVE_WORKTREE_PATH" != "$(pwd)" ]` (the
     phase6.md:602-604 `mkdir -p` + `cp -R kaola-workflow/{project}/.` block, project-folder only —
     adaptive has no pre-existing impl files to copy at start).
  3. Instruct that EVERY contractor Agent() dispatch in this file (the orient bracket :49-55, the
     advance bracket :134-140, the commit+advance bracket :194-200) and EVERY role dispatch
     (:150-156 tdd-guide etc.) carries a `Working directory: ${ACTIVE_WORKTREE_PATH}` line — the
     phase6.md:381 doc-updater pattern — so the relative plan path resolves in the worktree and the
     impl lands on `workflow/issue-N`. Keep the relative plan paths AS-IS (do NOT switch to absolute;
     relative+cwd is the mechanism and preserves the repo-root fallback).
- Mirror the SAME wiring into Codex `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md`
  (Codex resolver variant uses `process.env.KAOLA_PROJECT`, per explore.md:25 — match the existing
  Codex resolver shape) and gitlab/gitea `commands/kaola-workflow-plan-run.md`.
- RED test: `testAdaptiveWorktreeProvisionedE2E` (#7) — before this node, the adaptive run does not
  operate in the worktree, so the merged branch lacks the impl → the test's "merged main contains
  impl file" assertion FAILS. (Markdown is not directly unit-testable, so the e2e test exercises the
  MODEL the markdown encodes: plan+impl in worktree, commit-node barrier with worktree plan path,
  sink. The test asserts the behavior the markdown wires.)
- GREEN: #7 passes — impl in worktree → sink merges it to main.

### Node 4 — `impl-adapt-contractor`  (write set: `commands/kaola-workflow-adapt.md` + 3 plugin adapt copies + `agents/contractor.md`)
- EDIT adapt.md: REMOVE/UPDATE the "#264 / adaptive does NOT provision a worktree" disclaimers at
  :9-11, :153, :187-188, :202, :221 (verified present). New text: the adaptive claim NOW provisions a
  repo-local hidden worktree; the executor (plan-run) operates in it. Keep adapt's own claim at
  repo-root (adapt authors the plan into the main-repo folder; plan-run mirrors it into the worktree
  — adapt does NOT need to cd into the worktree, it only authors + freezes + hands off).
- EDIT 3 plugin adapt copies (Codex/gitlab/gitea) identically (forge-neutral prose).
- EDIT contractor.md: add a short "Working directory" note under ## Method — when a dispatch prompt
  carries a `Working directory:` line, run all scripts and resolve relative paths from THERE (it is
  the provisioned worktree for adaptive). This is additive prose; the contractor already runs
  "exactly as instructed" (:contractor.md Method 1) so this formalizes the cwd contract without
  changing behavior for dispatches that omit the line (repo-root fallback preserved).
- RED test: covered by #7 (the e2e). No new test file here (markdown). Record in `.cache` that this
  node's GREEN is the #7 e2e still passing + the disclaimer text removed (grep adapt.md for "#264"
  → 0 stale "does NOT provision" hits).

### Node 5 — `impl-edition-tests`  (write set: gitlab + gitea `test-*-workflow-scripts.js`)
- ADD tests #10 (gitlab) + #11 (gitea) per F: hidden-local `worktreePathFor` path assertion +
  `legacy-worktree-cleanup` dry-run assertion. These prove AC9 parity and run in-chain via the
  gitlab/gitea walkthrough `run()` (NOT package.json — MEMORY: plugin-test-inchain).
- RED: before the forge claim edits land (node 8 ports), these assert the NEW path but the forge
  claim still returns the OLD sibling path → FAIL. GREEN after node 8.
- ORDERING SUBTLETY: this node runs BEFORE impl-claim (node 8) in the frozen DAG, so its tests are
  authored RED here and go GREEN when node 8 ports the path split into the forge claims. Record the
  RED-pending state in `.cache/impl-edition-tests.md` exactly as node 1 does for the walkthrough.

### Node 6 — `impl-commit-node`  (write set: `scripts/kaola-workflow-commit-node.js` + 3 plugin copies)
- EDIT commit-node.js: add ONE documenting comment line in the header block (after :26) per A —
  records that the per-node baseline/diff is taken by the validator against the repo containing
  `<plan-path>`, so an adaptive caller passing a worktree plan path gets a worktree baseline; the
  empty-worktree_path → repo-root fallback is preserved. NO behavioral change. Byte-identical to
  Codex; same comment ported to gitlab/gitea copies.
- RED test (authored in node 1): a validator-root-follows-plan-path assertion — write a plan into a
  SUBDIR-with-its-own-`.git` (or a worktree), invoke `commit-node.js <subdir-plan> --node-id x
  --start` then `--node-id x` after an in-subdir change, assert the barrier diff sees the SUBDIR's
  change (proving root tracked the plan path, not the test's cwd). This already passes with the
  unchanged source (the behavior is inherent) — so the RED here is the DOCUMENTING-comment presence
  check + the worktree-resolution test being PRESENT and green. Honest framing for the contractor:
  the substantive guarantee is already true; this node PROVES it and documents it. (If the
  walkthrough is fully green by now, this node's GREEN = its comment present + the resolution test
  green.)
- §3 SAFETY: do NOT add a cwd/`-C`/root arg or change `validatorPath`/`planPath` handling — that
  would break the `worktree_path: ''` repo-root run (THIS issue's own run executes via this exact
  script on every node).

### Node 7 — `impl-next-action`  (write set: `scripts/kaola-workflow-next-action.js` + 3 plugin copies)
- EDIT next-action.js: add ONE documenting comment line (in the header block / usage banner) per A —
  the plan path is caller-resolved; an adaptive run passes a worktree-relative path resolved in the
  worktree. NO behavioral change (the script has no git seam). Byte-identical to Codex; ported to
  gitlab/gitea.
- RED test (authored node 1): invoke `next-action.js <worktree-plan>` where the worktree plan has a
  DIFFERENT ledger than a stale main-repo plan, assert the ready-set reflects the WORKTREE plan.
  Passes with unchanged source (relative-path resolution is inherent). GREEN = comment present +
  resolution test green.
- §3 SAFETY: identical — additive comment only; preserve repo-root/empty-worktree fallback.

### Node 8 — `impl-claim`  (write set: `scripts/kaola-workflow-claim.js` + 3 plugin copies)
- EDIT claim.js (C + E):
  1. Split `worktreePathFor` → NEW repo-local body (:140-143).
  2. Add `legacySiblingWorktreePathFor` (old formula) + export it (:~1229).
  3. DROP the `requestedPath !== adaptiveSchema.ADAPTIVE_PATH` term from the suppression gate
     (:467) → `if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))`. Update the stale comment
     :462-466 ("FORCED OFF for the adaptive path") to "adaptive now provisions per #264."
  4. Add `cmdLegacyWorktreeCleanup` (E) + dispatch `legacy-worktree-cleanup` (:~1199).
  - Byte-identical to Codex copy. Port all 4 changes into gitlab claim (worktreePathFor :94-96,
    suppression :431, dispatch/exports analogues) + gitea claim (:94-96, suppression :435).
- RED tests (authored node 1 + node 5): inverted #1 (`testWorktreeAdaptiveProvisioned`), inverted #2
  (`testStartupJsonAndHiddenLocalWorktrees`), net-new #3 (hidden-local full/fast), #5/#6 (legacy
  cleanup dry-run/dirty-skip), and the forge #10/#11 — ALL fail before this node, pass after.
- §3 SAFETY: the suppression-drop means adaptive claims now provision; the e2e (#7) + the
  empty-worktree_path fallback in plan-run (node 3) ensure a `KAOLA_WORKTREE_NATIVE=0` or
  origin-less run still works. After this node the FULL walkthrough must be green
  (`node scripts/simulate-workflow-walkthrough.js` → exit 0, "Workflow walkthrough simulation
  passed") AND `npm test` (forge walkthroughs) green AND validate-script-sync clean
  (Claude↔Codex byte-identity on claim/sink/commit-node/next-action).

---

## PART 3 — ORDERING & SAFETY NOTE (explicit, for the orchestrator)

The frozen DAG runs the three ENGINE-SCRIPT nodes LAST and this ordering is load-bearing:
- `impl-claim` (node 8) is the node that actually flips adaptive provisioning ON (drops the
  suppression). It runs AFTER impl-plan-run (3) + impl-adapt-contractor (4) have wired the executor
  to OPERATE in the worktree. If claim provisioned a worktree before plan-run knew to cd into it, the
  impl would strand at repo-root on an empty branch — exactly the failure mode the OLD suppression
  guarded against. Order: wire the executor first (3,4), prove it (7's e2e via the worktree MODEL),
  THEN flip the switch (8). The DAG already encodes this.
- `impl-commit-node` (6) and `impl-next-action` (7) are ADDITIVE-COMMENT-ONLY. Their source behavior
  is UNCHANGED. This is deliberate: THIS workflow run has `worktree_path: ''` and executes via these
  exact scripts on EVERY node. A behavioral edit (adding a `-C`, changing planPath/validatorPath
  resolution, making worktree resolution mandatory) would wedge the very run that is implementing the
  issue. The repo-root / empty-worktree_path fallback MUST survive: relative plan path + cwd is the
  ONLY mechanism; when cwd == repo-root the validator root == main repo == today's behavior.
- The whole-issue RED baseline is established by node 1 (inverted + new tests). The walkthrough stays
  RED across nodes 1-7 (each node greens its slice); it reaches FULL GREEN only after node 8 ports
  the path split into the forge claims and flips suppression. The contractor must record per-node
  `.cache` evidence that distinguishes "this node's slice is green, the cross-cutting walkthrough is
  RED-pending later nodes" from "this node failed" — otherwise the per-node verdict reviewer will
  mis-block. Nodes 1 and 5 especially carry RED-pending forward dependencies.
- Byte-identity is a HARD gate: every edit to claim/sink-merge/commit-node/next-action in `scripts/`
  is pasted IDENTICALLY into `plugins/kaola-workflow/scripts/` in the SAME node. gitlab/gitea ports
  are forge-ported (same logic, glab/tea tokens) and proven by their edition tests + walkthroughs.
  Verify with `node scripts/simulate-workflow-walkthrough.js` (runs validate-script-sync) before
  declaring any engine-script node complete.

## Docs (folded into the owning nodes per the frozen write sets)
- README.md / docs/api.md / workflow-init.md (explore.md:57-61) describe the OLD sibling path + the
  adaptive "does NOT provision" clause. These are docs, not in any impl node's write set above — they
  are docked in PHASE 6 (doc-updater) against the real `--json`/`--help` output of the edited claim,
  per the standard docking gate. Flag to Phase 6: update README:928-930 (Where: path), api.md:106/108/
  113/501 (adaptive exemption clause → adaptive now provisions), workflow-init.md:135 (×3 editions).

## Risks for the orchestrator to weigh
1. The "additive comment" resolution for impl-commit-node / impl-next-action is the honest minimal
   change — but a strict reviewer may read it as "the node did nothing real." Mitigation: the node's
   REAL value is the RED→GREEN worktree-resolution TEST it carries (authored in node 1's write set,
   proven here). If the reviewer insists on a behavioral edit, the SAFE direction is NONE — do not
   add a `-C`; the behavior is already correct and a change risks the empty-worktree run. Prefer
   defending the comment+test framing over inventing risk.
2. Markdown nodes (impl-plan-run, impl-adapt-contractor) cannot be unit-tested directly; their proof
   is the #7 e2e exercising the MODEL they encode. If the orchestrator wants tighter coupling,
   consider a grep-assertion in the walkthrough that the plan-run.md contains the ACTIVE_WORKTREE_PATH
   resolver + a `Working directory:` line (cheap structural guard).
3. The frozen DAG order (engine scripts last) is correct ONLY if nodes 3-4 fully wire the executor
   before node 8 flips provisioning. If a node is skipped/n/a'd out of order, adaptive could provision
   without the executor cd'ing in → stranded empty branch. Hold the order.

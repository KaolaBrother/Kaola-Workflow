# design (code-architect) — issue #328 same-scope multi-issue bundle lane

Read-only implementation blueprint. The downstream `implement` / `tdd-guide` nodes follow this
VERBATIM. The plan write-sets are FROZEN — every edit below lands inside an existing node's
declared write set. Two plan-repair candidates are flagged explicitly (§Decision-2, §Decision-5)
and BOTH are resolved to the no-repair path. Net: this run needs NO plan-repair.

THE LOAD-BEARING INVARIANT (AC#1): the feature is purely ADDITIVE. `--target-issue N` /
`KAOLA_TARGET_ISSUE` single-issue behavior is byte-unchanged. A single-issue project writes NO
`issue_numbers` / `bundle_id` / `closure_policy` lines. Every new branch is gated on a bundle
signal (targetIssues set / issue_numbers field present); the scalar path never enters it.

---

## THE FIVE DESIGN DECISIONS (closed)

### Decision 1 — ISSUE_SCOUT_MODEL placeholder: NOT NEEDED. issue-scout follows the adversarial-verifier pattern.

VERIFIED in the tree (grep evidence):
- `adversarial-verifier` has NO `{ADVERSARIAL_VERIFIER_MODEL}` token in any `commands/*.md` or
  `plugins/**/SKILL.md`. It appears only as routing PROSE ("the adversarial-verifier fan-out",
  "a gate/skeptic role (... adversarial-verifier)"). It is dispatched inline, never via an
  `Agent(model="{X_MODEL}")` block.
- `model_for_placeholder()` (install.sh ~L472-487) has 12 entries; `render_command_file`'s
  `placeholders=( … )` array (~L526-539) has the SAME 12. `ADVERSARIAL_VERIFIER_MODEL` is in
  NEITHER. (The 12 = code-explorer, knowledge-lookup, planner, code-architect, tdd-guide,
  implementer, build-error-resolver, code-reviewer, security-reviewer, doc-updater, contractor,
  workflow-planner.)
- `adversarial-verifier` IS in `REQUIRED_AGENTS` (L40) and IS in `default_agent_model()` (L429).

`issue-scout` is read-only and selection-only (like code-explorer / adversarial-verifier): the
main orchestrator dispatches it via routing PROSE in `commands/workflow-next.md` (routing-core
node) before claim — never via a `model="{ISSUE_SCOUT_MODEL}"` Agent block. THEREFORE:

EXACT install.sh edits the `scout-registration` node makes (and ONLY these):
1. `REQUIRED_AGENTS` array (L40): append `"issue-scout"` (13 → 14 entries). This auto-iterates the
   install loop (L361), `emit_agent_model_manifest()` loop (L497), and verification loop (L802) —
   no further edits there.
2. `default_agent_model()` case (L429): add `issue-scout` to the existing `sonnet` alternation:
   `code-explorer|knowledge-lookup|code-architect|tdd-guide|implementer|build-error-resolver|code-reviewer|security-reviewer|adversarial-verifier|contractor|issue-scout)`.
3. DO NOT touch `model_for_placeholder()` (L472-487). DO NOT touch the `render_command_file`
   `placeholders=( )` array (L526-539). NO `ISSUE_SCOUT_MODEL` placeholder anywhere.

Also in `scout-registration` (resolve-agent-model.js ×4 byte-identical): add
`'issue-scout': 'sonnet',` to `DEFAULT_AGENT_MODELS` (root ~L8-22, 13 entries → 14) in ALL FOUR
copies (root + claude-plugin + gitlab + gitea, same filename `kaola-workflow-resolve-agent-model.js`).
Place it adjacent to the other `'sonnet'` roles (recommended: right after `'adversarial-verifier'`),
identically in all four so the byte-identical group stays clean.

### Decision 2 — compact-context.js bundle display: OUT OF SCOPE. AC#I satisfied by runOrient. NO plan-repair.

VERIFIED: `kaola-workflow-compact-context.js` (Claude-only hook, NOT in COMMON_SCRIPTS) reads ONLY
`name`, `phase`, `step`, `next_command`, `inline_emergency_fallback_authorized` (L86-90) and emits
a fixed resume blurb. It is NOT in the `resume-display` write set (which is `adaptive-node.js` byte
pair + `test-adaptive-node.js` ONLY).

AC#I (issue §I) asks resume/compact output to surface bundle id / primary / issue set / closure
policy / next frontier. The AUTHORITATIVE resume surface for an adaptive run is `runOrient` in
`adaptive-node.js` — it already returns the full resume model the orchestrator reads on every
`/kaola-workflow-plan-run` resume. Surfacing bundle identity in `runOrient`'s `result:'ok'` return
(see §Contract-runOrient) FULLY satisfies AC#I. The compact hook is a best-effort terse pre-read
that points at the state file; bundle identity is one `field()` read away in the same file.

DECISION: do NOT add bundle fields to compact-context.js. It is out of write-set; adding it would
be a PLAN-REPAIR (add `scripts/kaola-workflow-compact-context.js` to resume-display) for ZERO
acceptance value. additive-minimal interpretation: full `orient` suffices. If a reviewer insists,
the repair is a one-node write-set extension (NOT taken).

### Decision 3 — issue_numbers state-file format: comma-separated integers, ONE line. Three additive fields only.

LOCKED serialization in `workflow-state.md`, written by `writeState` under `## Sink`, ONLY on the
bundle path:
```
issue_number: 42
issue_numbers: 42,47,53
bundle_id: bundle-42-47-53
closure_policy: all_or_nothing
```
- `issue_number` stays the PRIMARY (= lowest member = first sorted; see §Naming). Compatibility:
  every existing reader (`activeByIssue`, classifier, finalize null-folder fallback, compact hook)
  keeps working unchanged on the scalar.
- THREE additive fields ONLY: `issue_numbers`, `bundle_id`, `closure_policy`. Do NOT write a
  separate `primary_issue:` line — `issue_number` IS the primary (the issue §D mock showing both
  `primary_issue` and `issue_number` is illustrative, not binding; Decision-3 commits to three
  additive fields). Do NOT write `bundle_mode`/`workflow_path` as NEW bundle fields here
  (`workflow_path` already exists for all paths; `bundle_mode` is durable evidence in the optional
  `.cache/issue-bundle.json`, which is NOT required by any AC and is out of the frozen write-sets —
  do NOT introduce it in v1).

EXACT parse expression (in `parseStateFile`, active-folders.js, ADDITIVE — see §Contract-active-folders):
```js
const issueNumbersRaw = field(content, 'issue_numbers'); // existing field() regex; '' if absent
const issue_numbers = issueNumbersRaw
  ? issueNumbersRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0)
  : [];
```
The existing `field()` regex `^name:[ \t]*(.+)$` matches the whole comma list on one line.

AC#1 CONFIRMED: a single-issue claim calls `writeState` WITHOUT `issue_numbers`/`bundle_id`/
`closure_policy` in `data`. `writeState` must push these lines ONLY when present (mirror the
existing `if (data.worktree_path) lines.push(...)` guard pattern):
```js
if (Array.isArray(data.issue_numbers) && data.issue_numbers.length) {
  lines.push('issue_numbers: ' + data.issue_numbers.join(','));
  lines.push('bundle_id: ' + data.bundle_id);
  lines.push('closure_policy: ' + (data.closure_policy || 'all_or_nothing'));
}
```
A single-issue project's state file is byte-identical to today's.

### Decision 4 — test-bundle-*.js placement: root-only scripts/, in the claude test chain, NOT COMMON_SCRIPTS.

VERIFIED package.json: `test:kaola-workflow:claude` is a long `&&` chain invoking root test files
directly: `… && node scripts/test-adaptive-node.js && node scripts/test-parallel-batch.js && … &&
node scripts/simulate-workflow-walkthrough.js`. These root `scripts/test-*.js` and
`simulate-workflow-walkthrough.js` are NOT in COMMON_SCRIPTS (no byte-pair; root-only by design).

DECISION:
- The three new files — `scripts/test-bundle-state.js`, `scripts/test-bundle-claim.js`,
  `scripts/test-bundle-finalize.js` — live in root `scripts/` ONLY. NOT added to COMMON_SCRIPTS in
  `validate-script-sync.js` (no plugin byte-pair). NOT given a BYTE_IDENTICAL_GROUPS entry.
- `contracts-registration` node edits `package.json` `test:kaola-workflow:claude`: insert the three
  into the `&&` chain. RECOMMENDED insertion point: immediately after `node scripts/test-adaptive-node.js`
  and before `node scripts/test-parallel-batch.js`, in the order state → claim → finalize:
  `… && node scripts/test-adaptive-node.js && node scripts/test-bundle-state.js && node scripts/test-bundle-claim.js && node scripts/test-bundle-finalize.js && node scripts/test-parallel-batch.js && …`
  (Exact position is not load-bearing as long as they are in the claude chain; this keeps the
  bundle units grouped near the adaptive units.)
- Each test file uses the repo's hand-rolled assert convention (no framework) and on success prints
  a sentinel line + exits 0. Keep them OFFLINE-safe (`KAOLA_WORKFLOW_OFFLINE=1`) or mock via
  `KAOLA_GH_MOCK_SCRIPT`, like the existing claim tests, so the chain runs without network.

### Decision 5 — closure-contract.js CLOSURE_INVARIANTS: NO constant change. Per-issue application in claim.js. NO plan-repair.

VERIFIED `kaola-workflow-closure-contract.js`: `CLOSURE_INVARIANTS` is a list of `{id, description}`
SINGLE-issue invariants (roadmap-source-absent, roadmap-mirror-clean, in-progress-label-removed, …).
`checkClosureInvariants` (claim.js L930-984) iterates these by `.find(i => i.id === '…')` against a
RECEIPT whose `issue_number` is scalar. closure-contract.js is byte-locked ×4 (BYTE_IDENTICAL_GROUPS)
and is in NO node's write set.

The bundle invariant is "EACH member issue's source is absent + label removed" — i.e. the SAME
invariants APPLIED PER ISSUE, not a NEW invariant. THEREFORE:

DECISION: do NOT change the `CLOSURE_INVARIANTS` constant list (no byte-locked-×4 edit → no
plan-repair). Instead, `checkClosureInvariants` (claim.js, in the `finalization` write set) LOOPS
the per-issue roadmap-source-absent + roadmap-mirror-clean + in-progress-label-removed checks across
`receipt.issue_numbers` when that array is present, falling back to the scalar `receipt.issue_number`
when it is absent. The invariant `id`/`description` strings are reused verbatim (so the existing
`.find()` lookups still resolve). This is the no-contract-change path and it is VIABLE — taken.

>> ADVISOR-FLAGGED TRAP (BLOCKING for the finalization implementer): the closure-RECEIPT field
>> additions (`closed_issues`, `failed_issue_closures`, `roadmap_sources_removed`) are a SEPARATE
>> concern from CLOSURE_INVARIANTS and hit a DIFFERENT byte-locked constant: `CLOSURE_RECEIPT_FIELDS`
>> in closure-contract.js. `buildClosureReceipt` (claim.js L1470) copies a `steps` key ONLY
>> `if (Object.prototype.hasOwnProperty.call(CLOSURE_RECEIPT_FIELDS, key))`. The three new bundle
>> fields are NOT in `CLOSURE_RECEIPT_FIELDS`, so passing them through `buildClosureReceipt(..., {
>> closed_issues: [...] })` SILENTLY DROPS them. DO NOT add them to closure-contract.js (byte-locked
>> ×4, out of write-set → would be a plan-repair). INSTEAD: attach them to the receipt object AFTER
>> `buildClosureReceipt` returns, in `cmdFinalize` (claim.js, in write-set):
>>   const closureReceipt = buildClosureReceipt(args.project, issueNumber, { … });
>>   if (Array.isArray(issueNumbers) && issueNumbers.length) {
>>     closureReceipt.closed_issues = closedIssues;            // number[]
>>     closureReceipt.failed_issue_closures = failedIssueClosures; // number[]
>>     closureReceipt.roadmap_sources_removed = roadmapSourcesRemoved; // string[] of 'issue-N.md'
>>   }
>> Bypassing the `steps` filter is intentional and correct. (Alternative-if-a-reviewer-insists:
>> add the three to CLOSURE_RECEIPT_FIELDS ×4 via plan-repair to add closure-contract.js to the
>> finalization write set — NOT taken; the post-return attach is additive and write-set-clean.)

---

## CORE CONTRACT — claim.js bundle additions (deterministic so implementers do not diverge)

### Entry points (parseArgs, claim.js L96-119)
Add explicit `--target-issues` handling. The generic `--flag value` branch (L110) already captures
`args.targetIssues = "42,47,53"` (string). Normalize it to a sorted unique int array. Recommended:
in `parseArgs`, after the loop, alongside the existing scalar coercion (L116-118):
```js
const envTargets = process.env.KAOLA_TARGET_ISSUES;
if (args.targetIssues == null && envTargets) args.targetIssues = envTargets;
if (typeof args.targetIssues === 'string') {
  args.targetIssues = args.targetIssues.split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0);
  // sort ascending + dedupe — load-bearing for bundle_id/collision (see §Naming)
  args.targetIssues = Array.from(new Set(args.targetIssues)).sort((a, b) => a - b);
}
```
`KAOLA_TARGET_ISSUE` (scalar) is unchanged. BOTH a scalar target AND `targetIssues` set →
`target_ambiguity` (decided at the cmdStartup router, see below).

### claimExplicitBundle(root, args) — the bundle analog of claimExplicitTarget
Signature mirrors `claimExplicitTarget(root, args)`. Returns the same SHAPE of object
(`{ status, claim, issue, project, reasoning, ... }`) so `cmdStartup`'s output wrapper is reused.
Control flow (ALL refusals return BEFORE any mutation; the only post-mutation refusal is
`target_set_label_rollback_failed`):

```
claimExplicitBundle(root, args):
  targets = args.targetIssues  // already sorted-unique int[]
  1. if !Array.isArray(targets) || targets.length === 0
        -> { status:'target_set_empty', claim:'none', reasoning:'--target-issues <A,B,...> required' }
  2. max = parseInt(process.env.KAOLA_BUNDLE_MAX_ISSUES || '4', 10); if !finite||<=0 -> 4
     if targets.length > max
        -> { status:'target_set_too_large', reasoning:'bundle of '+targets.length+' exceeds KAOLA_BUNDLE_MAX_ISSUES='+max }
  3. adaptive-path gate (REUSE the claimProject toggle guard logic):
     requestedPath = args.workflowPath || process.env.KAOLA_PATH || 'full'
     if requestedPath !== adaptiveSchema.ADAPTIVE_PATH
        -> { status:'target_set_not_adaptive', reasoning:'bundle lane is adaptive-only; got workflow_path "'+requestedPath+'"' }
     (also run the existing isLegalWorkflowPath switch-off guard -> 'workflow_path_refused' as today)
  4. PER-ISSUE validation loop (NO mutation yet) — for each n in targets:
       a. existing = activeByIssue(root, n)  // now bundle-aware (state-foundation change)
          if existing -> { status:'target_set_conflicts_active_work', issue:n, reasoning:'#'+n+' is already claimed by project '+existing.project }
          (this single code covers recon's "claimed" + the issue's "contains_claimed_issue" +
           "conflicts_active_work"; one code, message names the issue)
       b. classified = classifyIssue(root, n)
          verdict 'owned'  -> target_set_conflicts_active_work (same as 4a)
          verdict 'blocked'-> { status:'target_set_conflicts_active_work', issue:n, reasoning: classified.reasoning }
          verdict 'red'    -> { status:'target_set_red', issue:n, reasoning: classified.reasoning }
          verdict 'target_unavailable' -> { status:'target_set_unavailable', issue:n, reasoning: classified.reasoning }
          verdict 'target_unverified'  -> { status:'target_set_unverified', issue:n, reasoning: classified.reasoning }
          (DEPENDENCY: classifier already surfaces a depends-on label as a blocked/dep signal; an
           external dependency NOT in the bundle therefore lands as 'red'/'blocked' here — see
           target_set_has_external_dependency note below.)
       c. probe = probeIssueState(n)
          state 'closed'      -> { status:'target_set_has_closed_issue', issue:n, reasoning:'#'+n+' is closed' }
          state 'unavailable' (and !OFFLINE) -> { status:'target_set_unavailable', issue:n, reasoning:'#'+n+' state probe failed' }
  5. all valid -> derive project/branch (§Naming), then ALL-OR-NOTHING provision (§Rollback).
  6. on partial-failure teardown that itself fails -> { status:'target_set_label_rollback_failed', ... }
```

NOTE on `claimBundle` vs `claimExplicitBundle`: keep the SAME two-function split the single path
uses. `claimExplicitBundle` = validate (steps 1-4) + delegate the actual provision to an internal
`claimBundle(root, { targets, project, branch, ... })` (steps 5-6, the mutation), exactly as
`claimExplicitTarget` validates then delegates to `claimProject`. `claimBundle` does the
provision+writeState+per-issue postAdvisoryClaim+rollback; `claimExplicitBundle` does the
classifier/probe validation. This keeps `cmdClaim`-style direct callers possible and matches the
existing layering. Both exported in module.exports alongside `claimExplicitTarget`/`claimProject`.

### Typed refusal codes — RECONCILED v1 set (the tests assert these EXACT strings)

The "nine + target_ambiguity" count in Plan Notes is GUIDANCE (Plan Notes are outside `plan_hash`);
the authoritative set is reconciled below. v1 = 8 bundle codes + `target_ambiguity`:

| code | v1? | implementing primitive / trigger |
|------|-----|----------------------------------|
| `target_ambiguity` | v1 | cmdStartup: BOTH scalar target AND targetIssues set |
| `target_set_empty` | v1 | targets array empty/missing |
| `target_set_too_large` | v1 | targets.length > KAOLA_BUNDLE_MAX_ISSUES (default 4) |
| `target_set_not_adaptive` | v1 | requestedPath !== adaptiveSchema.ADAPTIVE_PATH |
| `target_set_conflicts_active_work` | v1 | activeByIssue hit OR classifier 'owned'/'blocked' (covers issue's contains_claimed_issue) |
| `target_set_has_closed_issue` | v1 | probeIssueState === 'closed' (covers issue's contains_closed_issue) |
| `target_set_red` | v1 | classifier verdict 'red' |
| `target_set_unavailable` | v1 | classifier 'target_unavailable' OR probe 'unavailable' (online) |
| `target_set_unverified` | v1 | classifier 'target_unverified' (OFFLINE no-evidence) |
| `target_set_label_rollback_failed` | v1 | post-mutation teardown step itself failed |
| `target_set_not_same_scope` | DEFERRED (NOT v1) | see #44 ruling below |
| `target_set_has_external_dependency` | FOLDED into `target_set_red`/`_conflicts` v1 | classifier depends-on signal already routes here; a dedicated code is deferred unless a test requires the distinct string |

#44 RULING on `target_set_not_same_scope` — DROPPED from v1. A claim SCRIPT refusing an
explicitly-user-named set on "scope" = a script overriding explicit user intent, which #44 forbids
("when the user names an issue, use that exact issue; scripts validate and claim but must not fall
back"). Same-scope-ness is the issue-scout's AUTO-mode judgment surfaced to the orchestrator BEFORE
claim (AC#5: agent states the set, scripts validate availability only). So scope is never a
claim-script refusal. The `state-foundation`/`claim-startup` tests must NOT assert
`target_set_not_same_scope`. (If a reviewer wants it documented, it belongs in the issue-scout role
prose + routing docs as advisory, not as a claim refusal.)

`target_set_has_external_dependency` — v1-OPTIONAL. The classifier already reads a `depends-on:#M`
label (classifier.js OFFLINE path L541-543 and the online path). An out-of-bundle open dependency
surfaces as classifier `red`/`blocked` → `target_set_red`/`target_set_conflicts_active_work` in
step 4b. v1 does NOT mint a distinct `target_set_has_external_dependency` string (folded into the
above). If the `test-bundle-claim.js` author wants an explicit dependency assertion, ADD the
distinct code at step 4b when `classified.reasoning` matches a depends-on pattern — but it is NOT
required and is not assumed by any other node. Document whichever choice in the test.

### bundle project name + branch derivation (§Naming)
- Members are SORTED ASCENDING and DEDUPED at parseArgs (load-bearing — see below).
- `bundle_id` / project name = `'bundle-' + targets.join('-')` → `bundle-42-47-53`.
- branch = `'workflow/' + project` → `workflow/bundle-42-47-53`. `buildBranchName(null, project, args.branch)`
  ALREADY produces this: with `issueNumber` null and `project='bundle-42-47-53'`, the
  `Number.isFinite(issueNumber)` guard (L196) is false → returns `'workflow/' + project`. CONFIRMED —
  no buildBranchName change needed; bundle calls it with `issueNumber=null`.
- PRIMARY issue = `targets[0]` = the LOWEST member (because sorted ascending). Written as
  `issue_number: <primary>` in state.
- WHY SORT IS LOAD-BEARING (not cosmetic): `--target-issues 53,42,47` and `--target-issues 42,47,53`
  MUST yield the SAME `bundle_id`/project/branch, else `activeByProject` collision detection and the
  duplicate-claim guard fail and you get two folders for one logical bundle. Sorting is the
  canonicalization that makes the collision guard correct. The dedupe prevents `42,42,47` minting a
  malformed id.

### all-or-nothing rollback algorithm (§Rollback) — claimBundle steps 5-6
APPLY order (forward), each step recorded so teardown can reverse exactly what succeeded:
```
applied = { dir:false, worktree:false, labeled:[] /* issue numbers that got postAdvisoryClaim */ }
try:
  1. project = bundle-…; branch = workflow/bundle-…
  2. mkdir projectDir(root, project)         -> applied.dir = true
     (if EEXIST + stateFile present -> target_set_conflicts_active_work, no rollback needed: nothing applied yet)
  3. provisionWorktree(root, project, branch) (when !OFFLINE && WORKTREE_NATIVE && hasGitHistory)
                                              -> applied.worktree = true (record wtPath)
     (or in-place checkout block, same as claimProject)
  4. writeState(root, { project, issue_number: targets[0], issue_numbers: targets,
       bundle_id: project, closure_policy: 'all_or_nothing', branch, sink, worktree_path,
       workflow_path: 'adaptive', runtime, status:'active' })
  5. for n of targets: postAdvisoryClaim(n, project); applied.labeled.push(n)
return { status:'acquired', verdict:'green', claim:'acquired', issue: targets[0],
         issue_numbers: targets, project, bundle_id: project, branch, worktree_path }
catch (err):  // REVERSE order teardown
  rollbackOk = true
  a. for n of applied.labeled.reverse(): try clearAdvisoryClaim(n, 'bundle claim rolled back', project)
        (this removes label + deletes the kw:claim marker comment per issue); on throw -> rollbackOk=false
  b. if applied.worktree: removeWorktree(root, project, {worktree_path}); on failure -> rollbackOk=false
  c. if applied.dir: fs.rmSync(projectDir, {recursive,force}); on failure -> rollbackOk=false
  if rollbackOk: return { status: <the original refusal that triggered the catch, or 'target_set_unavailable'>, ... }
  else:          return { status:'target_set_label_rollback_failed', issue_numbers: targets, project,
                          reasoning:'partial claim could not be fully rolled back; manual cleanup may be required',
                          partial: applied }
```
KEY: validation (steps 1-4 of claimExplicitBundle) happens BEFORE any mutation, so the COMMON case
is "refuse with nothing applied" (no rollback at all). Rollback only runs if a mutation step
(provision/label) throws mid-bundle. `target_set_label_rollback_failed` is the ONLY post-mutation
refusal and reports `partial` for manual cleanup (AC#3: "no partial … except explicitly reported
rollback failure").

### cmdStartup routing (claim.js L702-719) — the target_ambiguity gate
```js
function cmdStartup() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  const scalarTarget = args.targetIssue || args.issue;
  const bundleTargets = Array.isArray(args.targetIssues) ? args.targetIssues : null;
  if (scalarTarget && bundleTargets && bundleTargets.length) {
    output({ verdict:'target_ambiguity', claim:'none', project:null, issue:null,
      reasoning:'both --target-issue and --target-issues set; choose one' }, 1);
    return;
  }
  if (bundleTargets && bundleTargets.length) {
    const result = claimExplicitBundle(root, args);
    output(<same wrapper as scalar, with selected_issue=result.issue (primary),
            and pass through issue_numbers/bundle_id when acquired>,
           result.status === 'acquired' || result.status === 'owned' ? 0 : 1);
    return;
  }
  // ... existing scalar path UNCHANGED ...
}
```
`cmdPickNext` (L721-727): when `args.targetIssues` set (no scalar), delegate to cmdStartup (it now
handles the bundle branch). Single line addition mirroring the existing `if (target) return cmdStartup();`.

### writeState (claim.js L368-422) — additive, see Decision 3 for the exact guarded push block.

---

## CONTRACT — active-folders.js (state-foundation node)

`parseStateFile` (L72-88): add the `issue_numbers` parse (Decision 3 expression) and include it in
the returned object:
```js
return { content, status, issue_number, issue_numbers, /* ...existing... */ };
```
`readActiveFolders` (L94-134): add `issue_numbers: state.issue_numbers` to the pushed `item`
(alongside `issue_number`). AC#1: an old single-issue folder has no `issue_numbers` field → `[]`.

`activeByIssue` (claim.js L498-499) — bundle-aware (state-foundation touches active-folders.js; this
line is in claim.js, FROZEN to the claim-startup/finalization nodes — see EXECUTION-ORDER NOTE):
```js
function activeByIssue(root, issueNumber) {
  return readActiveFolders(root).find(folder =>
    folder.issue_number === issueNumber ||
    (Array.isArray(folder.issue_numbers) && folder.issue_numbers.includes(issueNumber))
  ) || null;
}
```
CROSS-FILE NOTE: this `activeByIssue` array-check depends on `readActiveFolders` ALREADY returning
`issue_numbers` (the state-foundation change in active-folders.js). The DAG order guarantees it, but
the implementer of the claim.js edit must know the return-shape change lives in a DIFFERENT file
already merged upstream. (The `activeByIssue` edit itself: claim-startup node owns claim.js — fold
it into claim-startup, NOT state-foundation, since claim.js is not in state-foundation's write set.)

## CONTRACT — classifier.js cmdClassify (state-foundation node, L506-524)
After `activeStateIssues` (L518), add a bundle-membership check so a candidate issue that is a member
of ANY live bundle early-exits (exit 2, no stdout — the "owned" signal claim.js maps to blocked):
```js
const bundleMemberIssues = new Set();
for (const f of activeFolders) for (const n of (f.issue_numbers || [])) bundleMemberIssues.add(n);
if (activeStateIssues.has(args.issue) || bundleMemberIssues.has(args.issue)) {
  process.exitCode = 2;
  return;
}
```
(Replaces the existing single `if (activeStateIssues.has(args.issue))` block at L521-524.) AC#4:
direct claim of #47 refuses when a live bundle `[42,47,53]` exists, AND another overlapping bundle
refuses (each member is checked through this set in step 4a of claimExplicitBundle).

---

## CONTRACT — finalization (finalization node: claim.js + roadmap.js)

### archiveProjectDir (claim.js L813-928) — plural roadmap-source removal
- L818-821: read `issue_numbers` alongside the scalar:
  `const archiveIssueNumbers = (field(content,'issue_numbers')||'').split(',').map(s=>parseInt(s.trim(),10)).filter(n=>Number.isFinite(n)&&n>0);`
  Keep `archiveIssueNumber` (scalar primary) for the existing single-issue path.
- L883-919 (the `if (statusValue === 'closed')` block): when `archiveIssueNumbers.length` use it;
  else fall back to `[archiveIssueNumber]`. LOOP the existing per-issue removal logic (the
  `fs.unlinkSync(roadmapFilePath)` + the #297 MAIN-repo staged-source reconcile) over EACH issue N.
  Accumulate removed sources into a `removedSources` string[] of `'issue-N.md'`.
- regenerateRoadmap(root) is called ONCE after the loop (already once; just move it after the loop).
- Return shape gains a plural field WITHOUT breaking the scalar one:
  `return { archived:true, dest, roadmap_source_removed, roadmap_regenerated, roadmap_sources_removed: removedSources };`
  (`roadmap_source_removed` scalar stays for single-issue + existing callers; `roadmap_sources_removed`
  is the new plural array. Field name `roadmap_sources_removed` per issue §H — NOT recon L35's
  `removed_roadmap_sources` typo; §H wins.)

### cmdFinalize (claim.js L987-1069) — close every member, attach bundle receipt fields
- After computing `issueNumber` (primary, L1030-1040), also read the member array from the archived
  state (same null-folder fallback path): `issueNumbers = folder?.issue_numbers || <parse from result.dest state>`.
- clearAdvisoryClaim PER ISSUE: when `issueNumbers.length`, loop
  `clearAdvisoryClaim(n, 'finalized', args.project)` for each; the PRIMARY's status feeds
  `claim_label_removed` (so checkClosureInvariants' single-label check still resolves); collect a
  per-issue map for the receipt. Single-issue path unchanged (one call).
- remote close: today cmdFinalize only PROBES `state` (the actual `gh issue close` is the
  orchestrator/contractor's job per finalize choreography — cmdFinalize records `already_closed`/
  `skipped_offline`). KEEP that posture; for bundles record per-issue `remote_issue_closed` in the
  receipt fields. closed_issues = members whose probe reads closed (or empty offline);
  failed_issue_closures = members whose probe failed online (AC#13 warning-first — record, do not
  hard-block).
- closureReceipt: build with the PRIMARY via `buildClosureReceipt(args.project, issueNumber, {...})`,
  then ATTACH the three bundle fields AFTER the call (see Decision-5 trap block) ONLY when
  `issueNumbers.length`:
  ```js
  closureReceipt.closed_issues = closedIssues;             // number[]
  closureReceipt.failed_issue_closures = failedIssueClosures; // number[]
  closureReceipt.roadmap_sources_removed = result.roadmap_sources_removed || []; // string[] 'issue-N.md'
  ```
  EXACT field names (issue §H): `closed_issues`, `failed_issue_closures`, `roadmap_sources_removed`.
  Plus `primary_issue` is the existing `issue_number` on the receipt (no separate field needed; the
  issue §H mock lists `primary_issue` + `issue_numbers` — map `primary_issue := receipt.issue_number`
  and add `issue_numbers` if a test asserts it: `closureReceipt.issue_numbers = issueNumbers;`).

### checkClosureInvariants (claim.js L930-984) — per-issue loop, NO contract change (Decision 5)
- The `roadmap-source-absent` + `roadmap-mirror-clean` checks (L934-948): when `receipt.issue_numbers`
  is a non-empty array, LOOP both checks over each member N (build the `.roadmap/issue-N.md` path and
  the `#N` mirror scan per issue); else use the scalar `receipt.issue_number` exactly as today. Reuse
  the SAME invariant `id` strings ('roadmap-source-absent', 'roadmap-mirror-clean') so the
  `CLOSURE_INVARIANTS.find(i => i.id === ...)` lookups resolve unchanged. A violation names the
  offending issue in its `description` suffix.
- `in-progress-label-removed` (L950-954): single-label primary check stays (the per-issue label
  clearing is verified by the warn-first receipt + the per-issue clearAdvisoryClaim return values;
  AC#13 warning-first means a single failed remote close does NOT hard-block).
- `active-folder-absent` / `archive-state-closed` / `branch-worktree-resolved`: ONE bundle folder →
  unchanged (project-scoped).

### roadmap.js regenerateRoadmap (L197-206) — NO CHANGE
Forge-neutral: it regenerates ROADMAP.md from whatever `.roadmap/issue-*.md` source files REMAIN.
Removing N sources then calling it once produces a correct mirror. The roadmap.js byte pair is in
the finalization write set only so the implementer can VERIFY no change is needed (and keep the
root↔claude pair byte-identical if any incidental touch occurs). Expected: zero diff.

### Release/discard/watch-pr (AC#13) — cmdWatchPr loop (claim.js ~L1412-1460), cmdDiscard (~L1089-1116)
These already call `archiveProjectDir` + `clearAdvisoryClaim(folder.issue_number, ...)` per folder.
For a bundle folder: clearAdvisoryClaim must run PER MEMBER (loop `folder.issue_numbers`), and the
per-folder receipt picks up `roadmap_sources_removed` from the now-plural archiveProjectDir return.
This is in the SAME claim.js the finalization node owns — fold these loop edits into the
`finalization` node (claim.js is in its write set). Single-issue folders (`issue_numbers` absent)
keep the scalar single call.

---

## CONTRACT — runOrient (resume-display node: adaptive-node.js byte pair)
runOrient reads `statePath` into `stateContent` (L398-399) and already pattern-matches
`escalated_to_full:` (L401). ADD the same `field()`-style reads right after, then surface them on
BOTH the `result:'ok'` return (L552-567) and the orphan/incomplete refuse returns (so resume always
shows bundle identity). Use a self-contained match (no import of active-folders — keep the forge
ports verbatim-copyable):
```js
const m1 = stateContent.match(/^issue_numbers:\s*(.+)$/m);
const issueNumbers = m1 ? m1[1].trim().split(',').map(s=>parseInt(s.trim(),10)).filter(n=>Number.isFinite(n)&&n>0) : [];
const m2 = stateContent.match(/^bundle_id:\s*(.+)$/m);
const bundleId = m2 ? m2[1].trim() : null;
const m3 = stateContent.match(/^closure_policy:\s*(.+)$/m);
const closurePolicy = m3 ? m3[1].trim() : null;
const m4 = stateContent.match(/^issue_number:\s*(\d+)$/m);
const primaryIssue = m4 ? parseInt(m4[1], 10) : null;
```
ADD to the `result:'ok'` return object (and the refuse returns) these four fields:
`bundleId, issueNumbers, primaryIssue, closurePolicy`. AC#1: a single-issue project →
`issueNumbers:[]`, `bundleId:null`, `closurePolicy:null`, `primaryIssue:<n>` (harmless;
single-issue resume is otherwise byte-identical and the orchestrator ignores empty bundle fields).
`test-adaptive-node.js`: assert a bundle state surfaces the four fields and a single-issue state
leaves `bundleId:null`/`issueNumbers:[]`.

---

## CONTRACT — issue-scout role profile (scout-role node)
- `agents/issue-scout.md` (root): YAML frontmatter `name: issue-scout`, `model: sonnet`, a
  description matching the role; markdown body = read-only backlog-clustering role + the standard
  Prompt Defense Baseline header used by other agents. MUST NOT claim write tools. Behavioral
  contract (issue §A): may read forge issues / `.roadmap/issue-*.md` / ROADMAP mirror / active
  folders / archived summaries; MUST NOT claim issues, write repo files, author workflow-plan.md,
  close issues, or dispatch agents. Recommended output = the §A JSON `recommended_bundle` shape
  (primary_issue, issues[], scope, confidence, rationale, expected_write_areas, risks, rejected[]).
- `plugins/kaola-workflow{,-gitlab,-gitea}/agents/issue-scout.toml`: TOML `name`/`description`/`model`
  mirroring the root frontmatter (model = sonnet). Same read-only contract in the description/body.
- issue-scout is NOT added to WRITE_ROLES / IMPLEMENT_ROLES / GATE_VERDICT_ROLES anywhere.

## CONTRACT — validator-roles node (CANONICAL_ROLES 11 → 12)
Add `'issue-scout'` to `CANONICAL_ROLES` in ALL FOUR validators:
- root `scripts/kaola-workflow-plan-validator.js` (L51-55, currently 11 entries) and its claude
  byte pair `plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js`.
- gitlab port `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js` (L51).
- gitea port `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js` (L51).
Append after `'implementer'`: `… 'adversarial-verifier', 'implementer', 'issue-scout',`. This is a
DIFFERENT count (11→12 canonical roles) from the agent-profile-install count (13→14) — DO NOT conflate.
DO NOT add a count literal to the ROOT contract validators (grep-confirmed: they assert no agent count).

## CONTRACT — contracts-registration node (counts + test runner)
EXACT edits (separate bases — verified line numbers):
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js:143`
  `assert(agentFiles.length === 13, 'expected 13 GitLab agent profiles')` → `14` + 'expected 14 …'.
- `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:142`
  `assert(agentFiles.length === 13, 'expected 13 Gitea agent profiles, got ' + agentFiles.length)` → `14` + 'expected 14 …'.
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js:~1988-1990` the
  `assert.strictEqual(fs.readdirSync(...).length, 13, 'should install 13 agent TOML files')` → `14` +
  'should install 14 agent TOML files'.
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js:~2037-2040` same `13` → `14`.
- `scripts/validate-script-sync.js`: NO COMMON_SCRIPTS / BYTE_IDENTICAL_GROUPS additions for the new
  test-bundle-*.js (root-only). Verify the new files do not trip an existing sync assertion (they
  shouldn't — they have no plugin counterpart).
- `package.json`: add the three `node scripts/test-bundle-*.js` to `test:kaola-workflow:claude`
  (Decision 4).

## CONTRACT — forge ports (forge-claim-ports / forge-final-ports nodes)
MIRROR the root behavioral logic VERBATIM modulo forge nouns (#254 parity lesson — do NOT re-derive).
Canonical spec = the matching ROOT script edited above. gitlab/gitea
`kaola-{forge}-workflow-{claim,active-folders,classifier,roadmap,adaptive-node}.js` get the SAME
function-level changes (bundle parse, claimExplicitBundle/claimBundle, activeByIssue array-check,
archiveProjectDir plural, cmdFinalize per-issue, runOrient bundle fields). roadmap port: expected zero
diff (verify against root). Use the forge edition's issue/MR nouns where the root uses gh/issue nouns.

## CONTRACT — routing (routing-core / routing-forge nodes)
`commands/workflow-next.md` Step 0 + skill mirrors: document (a) explicit-bundle entry
(`--target-issues A,B,C` / `KAOLA_TARGET_ISSUES`, with the compat note that `--target-issue` is
UNCHANGED and both-set → target_ambiguity), and (b) auto-bundle entry (dispatch the read-only
issue-scout role to recommend ONE same-scope bundle; the orchestrator STATES the set before claim;
scripts validate, never select — #44). adaptive-only (bundle lane requires workflow_path=adaptive).
Keep semantically identical across all four editions (root = canonical; forge nouns only).

---

## EXECUTION-ORDER NOTE (for the implement nodes — read before editing)

The build DAG is LINEAR and edits `scripts/kaola-workflow-claim.js` across TWO ordered nodes:
1. `claim-startup` (runs first) adds: parseArgs `--target-issues`, `claimExplicitBundle`/`claimBundle`,
   the `target_ambiguity` gate in `cmdStartup`, the bundle-aware `activeByIssue`, the additive
   `writeState` bundle-field push, and the per-issue rollback. These edits LAND in claim.js.
2. `finalization` (runs AFTER claim-startup) adds: `archiveProjectDir` plural roadmap removal,
   `cmdFinalize` per-issue close + post-return receipt-field attach, `checkClosureInvariants`
   per-issue loop, and the watch-pr/discard per-member clearAdvisoryClaim loops.

THE FINALIZATION IMPLEMENTER IS EDITING THE SAME claim.js THE CLAIM-STARTUP NODE ALREADY MODIFIED.
It MUST: (a) READ the current claim.js file state first (it already contains claim-startup's bundle
additions — `claimExplicitBundle`, the bundle-aware `activeByIssue`, the additive `writeState`); (b)
build ON TOP of those edits — do NOT revert, do NOT re-add functions that already exist, do NOT
assume a clean baseline; (c) reuse `claimExplicitBundle`'s sorted-unique `issue_numbers` parsing
convention for consistency. The per-node barrier accumulates edits on the SAME file across the two
sequential nodes (no antichain → no disjointness conflict).

CROSS-FILE DEPENDENCY: claim-startup's bundle-aware `activeByIssue` (in claim.js) RELIES on
state-foundation having already added `issue_numbers` to `readActiveFolders`' returned item shape
(in active-folders.js, a DIFFERENT file in an EARLIER node). The DAG order guarantees it; the
claim-startup implementer should not re-add the parse in active-folders.js (already done upstream).

CROSS-EDITION GREP DISCIPLINE (#291/#254): before sealing EACH node, grep the changed symbols
(`target-issues`, `issue_numbers`, `bundle_id`, `issue-scout`, the count literal `13`) across
`scripts/` AND every `plugins/*/scripts/` AND commands/skills. The edition-NAMED forge ports
(`kaola-gitlab-workflow-*`, `kaola-gitea-workflow-*`) are NOT found by base-filename `find` and are
NOT bounded by validate-script-sync — a missed PRODUCTION file makes the Phase-6 barrier refuse, not
the self-check. The finalize gate is CLAUDE-ONLY: run all FOUR
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains SEQUENTIALLY yourself before sink
(a green claude chain alone is insufficient — npm test short-circuits on `&&`).

---

## NO-PLAN-REPAIR SUMMARY
- Decision 1: install.sh REQUIRED_AGENTS + default_agent_model + resolve-agent-model ×4 ONLY; no placeholder. IN write-set.
- Decision 2: compact-context.js NOT touched (out of write-set, AC#I met by runOrient). NO repair.
- Decision 3: three additive state fields, comma-separated, guarded push. IN write-set.
- Decision 4: root-only test files + package.json chain. IN write-set.
- Decision 5: per-issue application of existing invariants + post-return receipt-field attach;
  closure-contract.js NOT touched (CLOSURE_INVARIANTS and CLOSURE_RECEIPT_FIELDS both unchanged).
  NO repair.

This run requires NO plan-repair. Every edit above lands inside an existing frozen node write set.

Design is complete.

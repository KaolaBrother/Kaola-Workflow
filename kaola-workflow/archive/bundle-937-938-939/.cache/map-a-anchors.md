# Map A — corrected anchors + the Direction-2 census

Measured at HEAD `42559b1c` by reading the files. Every claim below carries a `file:line`.
Issues #937/#938/#939 cite line numbers read at `ecdb2c88`; `40d4a5c9` (#936) has landed since and
edited both `scripts/kaola-workflow-claim.js` and `scripts/kaola-workflow-sink-merge.js`.

Method note: this agent has no shell, so nothing here is a `git diff` against `ecdb2c88`. Drift is
established by reading HEAD and comparing against the cited number — i.e. "what is at the cited line
NOW" vs "where the cited shape lives NOW". That is sufficient to re-anchor, and it is stated so the
verdicts are not over-read.

---

## Part 1 — corrected anchor table

### 1. `clearAdvisoryClaim` — `scripts/kaola-workflow-claim.js`

Cited span 958-975. **At HEAD the function is 962-986** (signature 962, closing brace 986). The
cited span is both shifted AND short of the closing brace.

| what | cited | current | drifted? | code at HEAD |
|---|---|---|---|---|
| signature | :958 (span start) | **:962** | yes, +4 | `function clearAdvisoryClaim(issueNumber, reason, project, opts) {` |
| (a) offline early-return | :958 | **:963** | yes, +5 | `  if (OFFLINE \|\| issueNumber == null) return 'skipped_offline';` |
| (b) marker construction | :972 | **:977** | yes, +5 | `    const marker = project ? ('<!-- kw:claim project=' + project + ' -->') : null;` |
| (c) ternary predicate | :974-975 | **:980** (one line) | yes, +5/+6 | `      if (marker ? comment.body.includes(marker) : /<!--\s*kw:claim\s+project=/.test(comment.body)) {` |

All three cited **shapes are byte-unchanged**. Only their line numbers moved.

**STALE PREMISE (1) — the signature gained a fourth parameter.** `#936` added `opts` and threads it
into every one of the four `ghExec` calls. Any issue text quoting a three-argument
`clearAdvisoryClaim(issueNumber, reason, project)` is describing a signature that no longer exists.
`scripts/kaola-workflow-claim.js:962-986`:

```js
function clearAdvisoryClaim(issueNumber, reason, project, opts) {
  if (OFFLINE || issueNumber == null) return 'skipped_offline';
  let status = 'failed';
  try {
    ghExec(['issue', 'edit', String(issueNumber), '--remove-label', CLAIM_LABEL], opts);
    status = 'removed';
  } catch (_) {}
  if (reason) {
    try { ghExec(['issue', 'comment', String(issueNumber), '--body', 'Kaola-Workflow advisory claim cleared: ' + reason], opts); } catch (_) {}
  }
  // Delete the project-scoped kw:claim marker comment so the remote-claim detector
  // no longer blocks re-claiming this issue after discard/release/finalize (#275).
  try {
    const raw = ghExec(['api', 'repos/{owner}/{repo}/issues/' + String(issueNumber) + '/comments'], opts);
    const comments = JSON.parse(raw || '[]');
    const marker = project ? ('<!-- kw:claim project=' + project + ' -->') : null;
    for (const comment of comments) {
      if (!comment || !comment.body || !comment.id) continue;
      if (marker ? comment.body.includes(marker) : /<!--\s*kw:claim\s+project=/.test(comment.body)) {
        try { ghExec(['api', '--method', 'DELETE', 'repos/{owner}/{repo}/issues/comments/' + String(comment.id)], opts); } catch (_) {}
      }
    }
  } catch (_) {}
  return status;
}
```

A new five-line `#936` header comment sits at `:957-961` — that is most of the +4/+5 shift.

**Cross-check, independent of me:** the walkthrough's own seam map already records this at
`scripts/simulate-workflow-walkthrough.js:7565-7568` and names `claim.js:977-980` as the DELETER and
`classifier.js:215` as the DETECTOR. Both agree with the measurements here.

### 2. The `cmdFinalize` claim-clearing loop

Cited 4598-4612 → **HEAD `scripts/kaola-workflow-claim.js:4603-4617`** (+5). Shape unchanged.

```js
  // #328: clearAdvisoryClaim per bundle member; primary's status feeds claim_label_removed
  // for the existing checkClosureInvariants in-progress-label-removed check.
  // Single-issue path: issueNumbers is empty; falls through to scalar call below (unchanged).
  let claimLabelRemoved;
  if (issueNumbers.length > 0) {
    // Bundle: clear label for each member; primary's status is the canonical one.
    for (const n of issueNumbers) {
      const labelStatus = clearAdvisoryClaim(n, 'finalized', args.project);
      if (n === issueNumber) claimLabelRemoved = labelStatus;
    }
    if (claimLabelRemoved == null) claimLabelRemoved = 'failed';
  } else {
    // Single-issue path (unchanged)
    claimLabelRemoved = clearAdvisoryClaim(issueNumber, 'finalized', args.project);
  }
```

Note both calls pass **three** arguments — no `opts`. That is correct for this caller (cmdFinalize
does not chdir out of the repo), but it means the cmdFinalize path and the sink path now differ in
arity at the same helper.

### 3. The null-folder fallback

Cited 4578-4596 → **HEAD `scripts/kaola-workflow-claim.js:4578-4602`**. The cited START line 4578 is
**exact** at HEAD; the block simply runs four lines longer than the citation implies.

```js
  let issueNumber = folder && folder.issue_number;
  // #328: read bundle member array — from folder (live) or archive dest (null-folder fallback)
  let issueNumbers = (folder && Array.isArray(folder.issue_numbers) && folder.issue_numbers.length)
    ? folder.issue_numbers : [];
  // null-folder fallback: archiveProjectDir ran first, so dest is the archive path
  if ((issueNumber == null || issueNumbers.length === 0) && result.dest) {
    try {
      const statePath = path.join(result.dest, 'workflow-state.md');
      if (fs.existsSync(statePath)) {
        const stateContent = fs.readFileSync(statePath, 'utf8');
        if (issueNumber == null) {
          const n = parseInt(field(stateContent, 'issue_number'), 10);
          issueNumber = Number.isFinite(n) ? n : null;
        }
        if (issueNumbers.length === 0) {
          const rawNums = (field(stateContent, 'issue_numbers') || '').trim();
          if (rawNums) {
            issueNumbers = rawNums.split(',')
              .map(s => parseInt(s.trim(), 10))
              .filter(n => Number.isFinite(n) && n > 0);
          }
        }
      }
    } catch (_) {}
  }
```

**Does it recover a project slug too? NO — explicitly not.** It reads exactly two fields from the
archived `workflow-state.md`: `issue_number` (:4589) and `issue_numbers` (:4593). No `project` read,
no assignment to any slug variable. The slug handed to `clearAdvisoryClaim` twelve lines later is
`args.project` (:4610, :4616) — the CLI flag, never the recovered state. This is load-bearing for
Direction 2: the null-folder path can lose the issue number and recover it, but it can never lose
the slug, because the slug never came from the folder in the first place.

### 4. The six `cmdFinalize` refusal returns

**CONFIRMED: still exactly six.** `cmdFinalize` spans `:4142-5179`. Reading the whole body from
:4142 to the claim-clearing loop at :4607, every `return` in cmdFinalize's own scope is listed below
(returns inside the two locally-defined arrow helpers `flushFinalizeFindings` :4195-4209 and
`pathsNotStaged` :4220-4229 are not cmdFinalize exits and are excluded).

| # | reason | cited | current `output(` / `return` | drifted? | code at HEAD |
|---|---|---|---|---|---|
| 1 | `finalize_mirror_refused` (project-folder mirror) | 4248 | **:4240 / :4253** | block moved ~0; cited 4248 still lands INSIDE it | `reason: 'finalize_mirror_refused',` at :4242 |
| 2 | `finalize_gate_unverified` | 4277 | **:4274 / :4282** | inside; cited 4277 is now `gate: 'workflow_state',` | `reason: 'finalize_gate_unverified',` at :4276 |
| 3 | `implementation_commit_missing` | 4328 | **:4322 / :4333** | inside; cited 4328 is now a hint line | `reason: 'implementation_commit_missing',` at :4324 |
| 4 | staging guard (`guard.reason`) | 4343 | **:4339 / :4348** | inside; cited 4343 is now `staged: guard.detail,` | `reason: guard.reason,` at :4341 |
| 5 | `archive_refused` | 4379 | **:4377 / :4384** | **cited line is EXACT** | `reason: result.reason \|\| 'archive_refused',` at :4379 |
| 6 | `archive_incomplete` | 4414 | **:4404 / :4419** | inside; cited 4414 is now a `reasoning` continuation | `reason: 'archive_incomplete',` at :4406 |

**Verdict for #939: the count is unchanged at six, and every one of the six cited line numbers still
lands inside the refusal block it named.** cmdFinalize's refusal ladder did not move — #936's edits
to this file are above it (the `clearAdvisoryClaim` comment block) and below it. The single most
important number in #939 survives re-verification.

Two things that are NOT refusals but are exits before the claim loop, listed so nobody re-counts
them as a seventh and eighth:

- `:4145` — `assert(args.project, '--project required');` throws (does not `output` a refusal).
- `:4157-4161` — the `--check` one-pass pre-flight: `output({ project, ok, checks, reasons,
  authority }, ok ? 0 : 1); return;`. Read-only, zero side effect, no `result: 'refuse'`.

Adjacent measurement, offered so it is not chased as a defect: the comment at `:4183-4189` says the
findings accumulator is "flushed at every exit from the block below — including the refusing ones",
and none of the six refusal returns calls `flushFinalizeFindings()`. That is fine — every
`recordFinalizeFinding(` call site is at :4759, :4870, :4911, :4969, :5028, :5076, :5119, all
strictly after the last refusal return (:4419), so the accumulator is provably empty at all six. The
five flush calls are at :4980, :5091, :5130, :5144, :5154.

### 5. `activeByProject`

Cited 1123-1125 → **HEAD `scripts/kaola-workflow-claim.js:1128-1130`** (+5).

**The cited lines now land in a DIFFERENT function.** `:1123-1125` at HEAD is the body of
`activeByIssue` (`:1120-1126`). Anyone re-reading #937/#938/#939's citation literally will read the
wrong function.

```js
function activeByProject(root, project) {
  return readActiveFolders(root).find(folder => folder.project === project) || null;
}
```

**Still a strict `===` over directory entry names — confirmed.** `folder.project` is set at
`scripts/kaola-workflow-active-folders.js:262` (`project: name`), where `name` is `entry.name` from
`fs.readdirSync(workflowDir, { withFileTypes: true })` (:238, :248), gated by `isSafeName(entry.name)`
at :241.

### 6-8. `scripts/kaola-workflow-classifier.js`

| what | cited | current | drifted? | code at HEAD |
|---|---|---|---|---|
| claim-marker DETECTOR regex | :215 | **:215** | **no — exact** | `      if (!comment \|\| !comment.body \|\| !/<!--\s*kw:claim\s+(project\|sess)=/.test(comment.body)) return false;` |
| 24-hour expiry | :216-217 | **:216-217** | **no — exact** | `      if (!comment.updated_at) return true;`<br>`      return Date.now() - new Date(comment.updated_at).getTime() < 24 * 60 * 60 * 1000;` |
| `blocked` short-circuit (label OR marker) | :371-374 | **:371-374** | **no — exact** | see below |
| blocked message | :390 | **:392** | yes, +2 | `    process.stdout.write(JSON.stringify({ verdict: 'blocked', reasoning: 'issue #' + args.issue + ' has a remote workflow claim' }) + '\n');` |

```js
371  let blocked = issueHasWorkflowInProgressLabel(issue.labels || []);
372  if (!blocked) {
373    try {
374      blocked = issueHasRemoteClaimComment(args.issue);
```

The `if (blocked) {` opener is at `:391`; the message is at `:392`. The cited `:390` is two short —
between the short-circuit (exact) and the message there is a transient-fault arm at `:375-389`, so
the cited number was already slightly off rather than having drifted (classifier.js is not in
`40d4a5c9`'s edit set, per the CHANGELOG's #936 entry, which names claim.js and the sink only).

Also note the marker's expiry asymmetry, since #936's CHANGELOG leans on it: the **marker** expires
after 24h (`:216-217`); the **label** has no expiry anywhere.

### Bonus — `scripts/kaola-workflow-closure-audit.js`

**No claim-MARKER sweep exists. Label-only, on both the detection and the repair side.** `kw:claim`
appears nowhere in the file.

- Detection: `:407` — `ghExec(['issue', 'list', '--state', 'closed', '--label', CLAIM_LABEL, '--json', 'number,title,url'])`, feeding `detectStaleLabels()` (called at `:499`).
- Repair: **`:628` — cited line is EXACT** — `try { ghExec(['issue', 'edit', String(it.number), '--remove-label', CLAIM_LABEL]); labelsRemoved.push(it.number); }`
- `CLAIM_LABEL` is `'workflow:in-progress'` at `:47`.

Doubly out of scope for an orphaned marker: the audit's class (c) is documented at `:9` as *"closed
remote issues still carrying the workflow:in-progress label"* — so an issue left **open** carrying a
stale marker is invisible to it on both axes (wrong artifact, wrong issue state).

---

## Part 2 — the Direction-2 census

### THE COUNT IS 11, NOT 8.

#937 enumerated **eight** call sites at `ecdb2c88`. That was the count in `claim.js` alone. At HEAD
there are **11 production call sites** in the canonical (github) edition: the same 8 in `claim.js`,
plus **3 in `kaola-workflow-sink-merge.js` that #936 created or converted**. The sink could not have
had any before #936, because #936 is what exported the helper and what made the sink call it — see
`CHANGELOG.md:7-31` and the export comment at `claim.js:6577-6578`.

**All 11 are PROVABLY-NON-EMPTY.** #937's conclusion survives; its arithmetic does not.

| # | file:line | enclosing function | `project` arg | provenance | verdict |
|---|---|---|---|---|---|
| 1 | `scripts/kaola-workflow-claim.js:4610` | `cmdFinalize` (bundle loop) | `args.project` | `assert(args.project, '--project required')` at `:4145` dominates | PROVABLY-NON-EMPTY |
| 2 | `scripts/kaola-workflow-claim.js:4616` | `cmdFinalize` (scalar) | `args.project` | same assert at `:4145` | PROVABLY-NON-EMPTY |
| 3 | `scripts/kaola-workflow-claim.js:5266` | `cmdRelease` (bundle loop) | `folder.project` | `folder` from `activeByProject`/`activeByIssue` at `:5183`, null-guarded at `:5184`; `.project` = dir entry name past `isSafeName` | PROVABLY-NON-EMPTY |
| 4 | `scripts/kaola-workflow-claim.js:5271` | `cmdRelease` (scalar) | `folder.project` | same | PROVABLY-NON-EMPTY |
| 5 | `scripts/kaola-workflow-claim.js:6175` | `cmdWatchPr`, `state === 'MERGED'` (bundle loop) | `folder.project` | loop variable of `readActiveFolders(root, …)` at `:6132` | PROVABLY-NON-EMPTY |
| 6 | `scripts/kaola-workflow-claim.js:6180` | `cmdWatchPr`, MERGED (scalar) | `folder.project` | same | PROVABLY-NON-EMPTY |
| 7 | `scripts/kaola-workflow-claim.js:6275` | `cmdWatchPr`, `state === 'CLOSED'` (bundle loop) | `folder.project` | same | PROVABLY-NON-EMPTY |
| 8 | `scripts/kaola-workflow-claim.js:6280` | `cmdWatchPr`, CLOSED (scalar) | `folder.project` | same | PROVABLY-NON-EMPTY |
| **9** | `scripts/kaola-workflow-sink-merge.js:971` | `postMergeCleanup` (`:822`), keep-open primary | `args.project` | `assert(args.project && isSafeName(args.project), '--project must be a safe folder name')` at `:3036`; `postMergeCleanup` has exactly one caller, `:3238`, downstream of it | PROVABLY-NON-EMPTY |
| **10** | `scripts/kaola-workflow-sink-merge.js:985` | `postMergeCleanup`, keep-open bundle member | `args.project` | same assert at `:3036` | PROVABLY-NON-EMPTY |
| **11** | `scripts/kaola-workflow-sink-merge.js:2892` | `runSinkTransaction`, keep-open terminal else-arm | `args.project` | same assert at `:3036`; `runSinkTransaction` called at `:3055`, downstream | PROVABLY-NON-EMPTY |

Rows 9-11 are the three #936 added. Row 11 is the arm #936 created from nothing (the closure step
had no `else`); rows 9-10 were label-only `ghExec` calls that #936 rerouted through the helper.

The proof for rows 3-8 in one place — `scripts/kaola-workflow-active-folders.js`:

```js
238    for (const entry of fs.readdirSync(workflowDir, { withFileTypes: true })) {
239      if (!entry.isDirectory()) continue;
240      if (entry.name === 'archive' || entry.name.startsWith('.')) continue;
241      if (!isSafeName(entry.name)) continue;
...
262        project: name,
```

with `isSafeName` at `:14-18` requiring `typeof name === 'string' && name.length > 0`. A `folder`
object cannot carry a falsy `.project`.

### Is `clearAdvisoryClaim` exported at HEAD? YES.

`scripts/kaola-workflow-claim.js:6579`, with an explanatory comment naming the reason:

```js
  // #936: sink-merge require()s this — the sink's keep-open terminals leave an issue OPEN and must
  // release BOTH claim artifacts, and this is the one place that knows the kw:claim marker format.
  clearAdvisoryClaim,
```

Consumed at `scripts/kaola-workflow-sink-merge.js:6`. The prior measurement that "exporting it costs
zero port edits" is now **moot rather than pending** — #936 already exported it on every edition:
gitlab `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:6225`, gitea
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:6217`.

### The other editions

`plugins/kaola-workflow/` (the claude plugin edition) is a **line-identical mirror** of `scripts/`:
its call sites are at the same 11 line numbers (`claim.js:4610/4616/5266/5271/6175/6180/6275/6280`,
`sink-merge.js:971/985/2892`). Same 11 sites, not 22 distinct ones.

The forge ports carry their own copies with a **different signature** —
`clearAdvisoryClaim(issueIid, reason, projectInfo, project, opts)`, where the slug is the **fourth**
argument, not the third:

| edition | claim.js sites | sink-merge sites | note |
|---|---|---|---|
| gitlab | `kaola-gitlab-workflow-claim.js` :4325, :4331, :4940, :4945, :5281, :5286, :5381, :5386 (8) | `kaola-gitlab-workflow-sink-merge.js` :885, :897, :2501 (3) | all pass `args.project` / `folder.project` |
| gitea | `kaola-gitea-workflow-claim.js` :4321, :4327, :4935, :4940, :5276, :5281, :5376, :5381 (8) | routed through a wrapper `releaseClaimArtifacts` (`:374`, single `clearAdvisoryClaim(…)` at `:375`), called at :895, :908, :2511 (3) | gitea adds a label-only fallback at `:376-378` when `projectInfo.full_name` is unresolved |

Same 8+3 shape on every edition. Nothing passes a falsy slug anywhere in production.

### STALE PREMISE (2) — the falsy arm DOES have a producer. It is a test, on two editions.

#937 frames the falsy branch as unreachable. In **production** that holds (11/11 above). But the
match-everything semantics are **pinned by tests that deliberately pass `null`**:

- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js:214` —
  `claim.clearAdvisoryClaim(42, 'discarded', projectInfo, null);` — asserted at `:224`:
  `'clearAdvisoryClaim: generic-regex fallback deletes all project= markers — passed'`
- `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js:281` — the same leg.

The canonical (github) side has **no** null-slug leg: the walkthrough's three
`clearAdvisoryClaim` legs (`scripts/simulate-workflow-walkthrough.js:7293`, `:7366` cross-project,
`:7409` offline) all pass a real slug.

Two consequences worth stating before anyone touches this arm:

1. **A canonical-only change to the falsy branch is invisible to every suite.** No github-edition
   test exercises it. A green four-chain receipt would prove nothing about it.
2. **A four-edition change reds the gitlab and gitea forge-helper suites**, because those two
   suites assert the current match-everything behaviour by name. Per test custody, those pins are
   deleted with the mechanism, never repaired ahead of it — so flipping the arm to match-nothing is
   a test-deletion decision on two editions, not a one-line edit.

---

## Summary of stale premises found

1. **`clearAdvisoryClaim` is now a 4-arg function** (`opts` added by #936, threaded into all four
   `ghExec` calls, on all four editions). Any 3-arg quote is stale. `claim.js:962`.
2. **The Direction-2 count is 11, not 8** — #936 added three sink-merge call sites. All 11 still
   pass a provably-non-empty slug, so #937's *conclusion* stands and only its *count* is stale.
3. **The falsy arm is not producerless** — two forge-edition tests pass `null` on purpose and pin
   match-everything. Canonical pins nothing there.
4. **`activeByProject`'s cited lines 1123-1125 now point at `activeByIssue`.** Correct anchor:
   `claim.js:1128-1130`.
5. Everything else re-anchors cleanly: the six refusal returns are still six and still where they
   were named; `classifier.js:215` and `:216-217` and `:371-374` are byte-exact at the cited lines;
   `closure-audit.js:628` is byte-exact and there is still no marker sweep anywhere in that file.

# Closure-receipt write-surface survey

Read-only. Surveyed in worktree `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-992-993-994`.
All `file:line` citations are relative to that worktree root (paths are identical in the main root).

Target fields (NOT implemented — surface map only):

```
issues_closed: <n>
follow_ups_filed: <n>
follow_up_numbers: <a,b,c>
net_backlog_delta: <+n|-n|0>
```

---

## 1. The `## Closure` block writer

### 1a. The serializer — `scripts/kaola-workflow-claim.js:2410-2427`

```js
// #333: append a compact terminal receipt to the ARCHIVED state. Presence-guarded
// (idempotent across crash-resume re-runs). Swallow-on-error.
function appendClosureBlock(destDir, fields) {
  try {
    const p = path.join(destDir, 'workflow-state.md');
    let s = fs.readFileSync(p, 'utf8');
    if (/^## Closure$/m.test(s)) return false;
    s = s.trimEnd() + '\n\n## Closure\n' +
      'archived_at: ' + new Date().toISOString() + '\n' +
      'issue_disposition: ' + fields.issueDisposition + '\n' +
      'claim_label_removed: ' + fields.claimLabelRemoved + '\n' +
      'worktree_removed: ' + fields.worktreeRemoved + '\n' +
      'closure_invariants: ' + fields.closureInvariants + '\n';
    // Atomic: this is the same workflow-state.md whose torn form readActiveFolders silently skips.
    writeFile(p, s);
    return true;
  } catch (_) { return false; }
}
```

**Full current field set, in emission order** — exactly five, all column-0 `key: value` lines:

| # | field | source arg |
|---|---|---|
| 1 | `archived_at` | computed in-writer (`new Date().toISOString()`) |
| 2 | `issue_disposition` | `fields.issueDisposition` |
| 3 | `claim_label_removed` | `fields.claimLabelRemoved` |
| 4 | `worktree_removed` | `fields.worktreeRemoved` |
| 5 | `closure_invariants` | `fields.closureInvariants` |

Three properties that constrain any addition:

- **Presence-guarded by the HEADING, not by field set.** `if (/^## Closure$/m.test(s)) return false;`
  — a destination that already carries the block is a no-op. Adding fields does **not** backfill an
  existing block, and (see §2) it means the FIRST writer on a lane wins.
- **The `fields` object is free-form.** It does not pass through `buildClosureReceipt`, so it is not
  filtered by `CLOSURE_RECEIPT_FIELDS` — a new field needs no `closure-contract.js` schema entry to
  land in the markdown block. (It WOULD need one to survive into the JSON `closure_receipt`; see §5.)
- **Swallow-on-error, boolean return.** No caller checks the return value at any of the four call
  sites.

`appendClosureBlock` is exported at `scripts/kaola-workflow-claim.js:6641` and consumed by
`scripts/kaola-workflow-sink-merge.js:6` (destructured require).

### 1b. Call site 1 — `cmdFinalize`, `scripts/kaola-workflow-claim.js:4783-4796`

```js
  // #333: disposition is DECISION-derived on cmdFinalize (the orchestrator closes the issue after
  // sink-merge, so the default merge lane is honestly close-pending, never a false `closed`).
  const issueDisposition = keepIssueOpen ? 'kept-open'
    : (remoteIssueClosed === 'already_closed' ? 'closed' : 'close-pending');
  // #333: append the compact terminal receipt to the archived state (facts only known after the
  // rename: claim/worktree disposition + issue disposition). Presence-guarded / idempotent.
  if (result.dest) {
    appendClosureBlock(result.dest, {
      issueDisposition: issueDisposition,
      claimLabelRemoved: claimLabelRemoved,
      worktreeRemoved: worktreeRemoved,
      closureInvariants: invariantResult.ok ? 'ok' : ('violations:' + invariantResult.violations.length)
    });
  }
```

### 1c. The envelope builder — `scripts/kaola-workflow-claim.js:5185-5203`

```js
  const finalizeEmit = Object.assign({ status: 'closed' }, result, {
    claim_label_removed: claimLabelRemoved,
    archive_state_stamped: archiveStateStamped,
    issue_disposition: issueDisposition,
    validation: finalizeValidation,
    changed_paths: finalizeChangedPaths,
    closure_receipt: closureReceipt,
    closure_invariants: invariantResult,
    finalize_transaction: finalizeTx
  });
  if (finalizeChangedProbe !== 'measured') finalizeEmit.changed_paths_probe = finalizeChangedProbe;
  // #970: present only when the run wrote a record, so a run without one emits the envelope it
  // emitted before. A record that agrees with itself still reports — a zero count is the
  // measurement, and its absence would be indistinguishable from a report that never ran.
  if (finalizeMissionList) finalizeEmit.mission_list = finalizeMissionList;
  // #937: present only when a name was actually corrected, so a run given the exact spelling emits
  // the envelope it emitted before.
  if (projectSlug.note) finalizeEmit.resolved_project_note = projectSlug.note;
  output(finalizeEmit, strictFailCode);
```

Note the JSON envelope and the markdown `## Closure` block are **separate write surfaces** that
happen to share three of five values (`issue_disposition`, `claim_label_removed`, `closure_invariants`).
`worktree_removed` and `archived_at` are block-only; `validation` / `changed_paths` /
`closure_receipt` / `finalize_transaction` / `mission_list` are envelope-only.

### 1d. The other two `appendClosureBlock` call sites

- **`cmdWatchPr` MERGED lane** — `scripts/kaola-workflow-claim.js:6248-6258`. Disposition here is
  **OBSERVATION**-derived (`probeIssueState`), not decision-derived (`:6215-6217`, quoted in §3).
- **`persistSinkClosureMetadata`** — `scripts/kaola-workflow-sink-merge.js:1986-2000`:

  ```js
  function persistSinkClosureMetadata(mainRoot, args, sinkReceipt, archiveResult) {
    const dest = archiveResult && archiveResult.dest;
    if (!dest) return;
    try {
      const keepOpen = deriveSinkKeepOpen(mainRoot, args, sinkReceipt);
      appendClosureBlock(dest, {
        issueDisposition: keepOpen ? 'kept-open' : 'close-pending',
        claimLabelRemoved: 'close-pending',
        worktreeRemoved: 'removed',
        closureInvariants: 'pending',
      });
    } catch (e) {
      if (e instanceof TypeError || e instanceof ReferenceError) throw e;
    }
  }
  ```

  Called once, at `scripts/kaola-workflow-sink-merge.js:2393`, only when the sink is the SOLE
  archiver. Its own header (`:1971-1977`) states the fields are "honestly PENDING here".

### 1e. Is the block parsed back anywhere? — **No production reader exists.**

Exhaustive grep for `## Closure`, `issue_disposition`, `archived_at` across `scripts/`, `templates/`,
`agents/`, `commands/`, `hooks/`, `docs/`:

- **Producers only** in `scripts/kaola-workflow-claim.js` (`:2416`, `:2417`, `:2419`) and
  `scripts/kaola-workflow-sink-merge.js` (`:1991`).
- **`scripts/kaola-workflow-closure-audit.js` reads `workflow-state.md` but NOT the `## Closure`
  block** — its parse keys on `status`/`step` (`:127`, `:150-157`, `:254-266`); zero hits for
  `## Closure` or `issue_disposition` in that file.
- `deriveSinkKeepOpen` reads `workflow-state.md`, but keys on the `## Sink` field
  `issue_action`, not the Closure block (`scripts/kaola-workflow-sink-merge.js:1966`).
- Everything else is **tests** (§6) and **prose** (`docs/api.md`, `docs/architecture.md:276`,
  `docs/workflow-state-contract.md:291`, `docs/decisions/D-653-01.md`).

**Conclusion: nothing breaks on new fields.** No parser, no whitelist, no field-count assertion.
The only structural risk is the heading presence-guard (which pre-exists) and any test doing an
exact-block string compare — none found (§6: all tests use `includes()` / `/^## Closure$/m`).

---

## 2. Data availability at stamp time

### 2a. `issue_numbers` — in scope, two sources

`scripts/kaola-workflow-claim.js:4544-4568`:

```js
  let issueNumber = folder && folder.issue_number;
  // #328: read bundle member array — from folder (live) or archive dest (null-folder fallback)
  let issueNumbers = (folder && Array.isArray(folder.issue_numbers) && folder.issue_numbers.length)
    ? folder.issue_numbers : [];
  // null-folder fallback: archiveProjectDir ran first, so dest is the archive path
  if ((issueNumber == null || issueNumbers.length === 0) && result.dest) {
    ...
        if (issueNumbers.length === 0) {
          const rawNums = (field(stateContent, 'issue_numbers') || '').trim();
          if (rawNums) {
            issueNumbers = rawNums.split(',')
              .map(s => parseInt(s.trim(), 10))
              .filter(n => Number.isFinite(n) && n > 0);
          }
        }
```

Caveat from `writeState` (`:952-957`): `issue_numbers:` is emitted **only for a true bundle**
(`length > 1`). A single-issue run leaves `issueNumbers === []` and carries only `issueNumber`.
The canonical "claimed set" expression already exists at `:4743`:

```js
    const issueSet = issueNumbers.length > 0 ? issueNumbers : (issueNumber ? [issueNumber] : []);
```

### 2b. `issue_action` IS the keep-open discriminator

`scripts/kaola-workflow-claim.js:4264-4274`:

```js
  // #336: keep-open terminal mode — explicit flag OR the durable ## Sink issue_action field.
  // State-field derivation makes the durable record the source of truth (a caller that
  // forgets the flag cannot silently close-mode the run); the flag covers the crash-resume case
  // where the live state file is already archived (archiveProjectDir returns source-missing
  // without reading state).
  let keepIssueOpen = !!args.keepOpen;
  if (!keepIssueOpen) {
    try {
      keepIssueOpen = field(fs.readFileSync(stateFile(root, args.project), 'utf8'), 'issue_action') === 'comment_keep_open';
    } catch (_) {}
  }
```

The keep-open close path (`:4623-4640`):

```js
  if (keepIssueOpen) {
    remoteIssueClosed = 'kept_open';
    if (!OFFLINE) {
      // probe each member (bundle) or the scalar issue; never abort.
      const probeNums = issueNumbers.length > 0 ? issueNumbers : (issueNumber ? [issueNumber] : []);
      for (const n of probeNums) {
        try {
          const probe = probeIssueState(n);
          if (probe.state === 'closed') {
            closedIssues.push(n);
            keepOpenWarnings.push('keep-open requested but the remote issue is already closed (issue #' + n + ')');
          }
        } catch (_) {}
      }
      if (closedIssues.length > 0 && (issueNumbers.length === 0 || closedIssues.length === issueNumbers.length)) {
        remoteIssueClosed = 'already_closed';
      }
    }
  }
```

The sink-side twin, `deriveSinkKeepOpen` (`scripts/kaola-workflow-sink-merge.js:1958-1968`), is the
"ONE derivation" over three sources: `--keep-issue-open`, `receipt.keep_open_requested`, or
`issue_action: comment_keep_open` in live-or-archived state.

### 2c. Per-issue close result — **YES, a structured roll-up already exists in scope**

`scripts/kaola-workflow-claim.js:4741-4751`, computed ~40 lines BEFORE the `appendClosureBlock` call:

```js
  // #427: structured closure roll-up (post-build — not a flat schema field; Decision-5 trap).
  {
    const issueSet = issueNumbers.length > 0 ? issueNumbers : (issueNumber ? [issueNumber] : []);
    closureReceipt.closure = {
      attempted:       issueSet,
      closed:          closedIssues.slice(),
      failed:          failedIssueClosures.slice(),
      skipped_offline: OFFLINE ? issueSet : [],
      kept_open:       keepIssueOpen ? issueSet : [],
    };
  }
```

Plus the bundle-only flat arrays at `:4755-4760`:

```js
  if (issueNumbers.length > 0) {
    closureReceipt.issue_numbers = issueNumbers;
    closureReceipt.closed_issues = closedIssues;
    closureReceipt.failed_issue_closures = failedIssueClosures;
    closureReceipt.open_issues = openIssues; // #369: members still open while online (visible, never silent)
  }
```

The three bucket arrays are declared at `:4613-4617` and every member lands in exactly one:

```js
  let remoteIssueClosed = 'skipped_offline';
  const closedIssues = [];       // members probed as closed
  const failedIssueClosures = []; // members whose probe threw/returned unavailable
  const openIssues = [];          // #369: members probed STILL OPEN while online (never silent-neither)
  const keepOpenWarnings = [];   // #336: probe-truth warnings under keep-open
```

**THE CRITICAL CONSTRAINT — on the normal merge lane, `cmdFinalize` closes ZERO issues.**
`scripts/kaola-workflow-claim.js:4674-4680`:

```js
  // #427: execute `gh issue close` for each open member. Probe-before-close: members already
  // closed or probed-unavailable are handled without a double-close attempt.
  // ONLY when online, ONLY when not keep-open, ONLY for finalize-only flows (not a merge-lane
  // run — #617 derives that from durable state via mergeLaneDeferred, not just the caller
  // remembering --keep-worktree — where sink-merge is responsible for closing after the merge
  // is verified). Runs AFTER archive+verify+delete.
  if (!keepIssueOpen && !OFFLINE && !mergeLaneDeferred) {
```

and `mergeLaneDeferred` fails TOWARD deferral (`:4283-4288`):

```js
  let mergeLaneDeferred = !!args.keepWorktree;
  if (!mergeLaneDeferred) {
    try {
      mergeLaneDeferred = field(fs.readFileSync(stateFile(root, args.project), 'utf8'), 'sink') !== 'pr';
    } catch (_) { mergeLaneDeferred = true; }
  }
```

`sink:` defaults to `merge`, and the shipped finalize command surface passes `--keep-worktree`
(`commands/kaola-workflow-finalize.md:300-303`). So on **the** production lane:
`closedIssues === []`, `remoteIssueClosed === 'close_pending'`, and `issue_disposition:
close-pending`. Pinned by test: `scripts/test-bundle-finalize.js:986-995` asserts
`closure.closed` is `[]` and `:993-996` asserts **zero** `gh issue close` calls.

The real closes happen later, in `scripts/kaola-workflow-sink-merge.js:2917-2974` (`closeOne`,
buckets `closed`/`failed`, records `receipt.closed_issues` at `:2956`). That result lands in
`sink-receipt.json` (`.cache/sink-receipt.json`, path resolution at `:1358-1360`) — **after**
`cmdFinalize` has already written the `## Closure` block, and `appendClosureBlock` is
heading-guarded, so the sink can never revise it.

**Bottom line for `issues_closed`:** at stamp time on the default lane the honest value is not a
count of closes — it is either the claimed-set size (`attempted`) or a degraded token. Only the
`--sink pr` / offline-less finalize-only lane and the keep-open lane have a truthful non-zero close
count in scope.

### 2d. `## Run gaps` — how finalize gets at them today: **it does not.**

- **No coupling exists.** `scripts/kaola-workflow-claim.js` has exactly two `run-gaps` mentions and
  both are comments/data: `:5857` ("Non-.md artifacts (run-gaps.json, chain-receipt.json … are not
  evidence") and `:5861` (`'run-gaps-manual.md'` in `ARCHIVE_CACHE_SIDECAR_MD`). Zero `require`,
  zero `execFileSync` of gap-sweep, zero parse of `## Run gaps`.
- The gate is an **agent step**, not a script call: `commands/kaola-workflow-finalize.md:202-216`
  (Step 7) runs `kaola-workflow-gap-sweep.js --project {project} --check`; the finalize transaction
  is Step 10 (`:292`). Generated from `templates/routing/finalize.skeleton.md:240` +
  `templates/routing/slots.js:148` (`fz-gapsweep-run`) + `templates/routing/required-blocks.js:359`.

**The scanner DOES write an artifact to disk.** `scripts/kaola-workflow-gap-sweep.js:206-215`:

```js
  // Ensure output directory exists.
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const artifact = { project, sweptClasses };
  // `run-gaps.json` is a kernel Evidence record — the sweep result the finalization gate reads back,
  // and one this writer deliberately refuses to recompute over a prior cycle. So it takes the
  // crash-safe atomic replace like every other record write: a half-written artifact would parse as
  // a SHORTER swept-class list, and the gate would pass on gaps that were swept but never stored.
  require('./kaola-workflow-adaptive-schema').writeFileAtomicReplace(
    outputPath, JSON.stringify(artifact, null, 2) + '\n');
```

- **Path** (default, `:568-571`): `kaola-workflow/<project>/.cache/run-gaps.json`.
- **Shape**: `{ project: string, sweptClasses: [ { reasonClass, sample, count } ] }`.
  `reasonClass` is a closed enum: `deferred_red_chain` or `manual:<kebab-slug>` (`:36-38`,
  producers at `:70-83` and `:87-115`).
- **`sweptClasses` carries NO issue numbers.** Filing refs (`filed: #N`) live only in the
  `## Run gaps` **prose section of `finalization-summary.md`**, parsed by
  `parseGapSection` (`:232-294`) with the strict grammar
  `/^-\s+(\S+)\s+\((.+?)\):\s+(filed:\s*#(\d+)|noise:\s+(.+))$/` (`:265`).

**Does `--check --json` emit `{mapped, filed, noise}`? YES — two emission sites.**
Vacuous pass, `:371-381`:

```js
  // Vacuous pass only when BOTH sides are empty.
  if (sweptClasses.length === 0 && (gapEntries === null || gapEntries.length === 0)) {
    if (asJson) {
      process.stdout.write(JSON.stringify({
        result: 'pass',
        mapped: 0,
        filed: 0,
        noise: 0,
      }) + '\n');
    }
    return 0;
  }
```

Full pass, `:449-459`:

```js
  const out = {
    result: 'pass',
    mapped: sweptClasses.length,
    filed: filedCount,
    noise: noiseCount,
  };
  if (verification !== undefined) out.verification = verification;

  if (asJson) {
    process.stdout.write(JSON.stringify(out) + '\n');
  }
```

`filedCount` / `noiseCount` are accumulated at `:406-417`; `mapped` is `sweptClasses.length`, i.e.
**gaps swept**, not gaps filed. The refuse shapes are `{result:'refuse', reason:'artifact_missing'}`
(`:322-327`), `'observed_gap_unseeded'` + `unseeded[]` (`:352-358`), and `'gaps_unswept'` +
`unmapped[]` (`:386-391`, `:420-425`).

**Is it readable from the claim.js closure path WITHOUT a new forge call or subprocess?**

- **`run-gaps.json`: YES, trivially.** It is plain JSON on disk, and `cmdFinalize` has already
  computed both candidate dirs at `scripts/kaola-workflow-claim.js:4765-4771`:

  ```js
  // archiveProjectDir runs first and renames the live folder to result.dest, so the live cache is
  // gone by now; every .cache probe below checks the archive candidate first, then live as fallback.
  const liveCacheDir = path.join(root, 'kaola-workflow', args.project, '.cache');
  const archiveCacheDir = result.dest ? path.join(result.dest, '.cache') : null;
  ```

  `probeSelectionEvidence([archiveCacheDir, liveCacheDir])` (`:2434-2443`) is the exact
  archive-then-live probe precedent, sitting one line above the closure-block call.
- **BUT `run-gaps.json` alone cannot answer `follow_ups_filed` / `follow_up_numbers`** — it carries
  no `filed: #N`. Those live in `finalization-summary.md`'s `## Run gaps` section, which is also in
  scope (written pre-archive at `:4365-4366`, then moved to `result.dest`), but the parser
  (`parseGapSection`) **is not exported**: `scripts/kaola-workflow-gap-sweep.js:587` is
  `module.exports = { main };` only. Reuse would require either exporting it, re-implementing the
  regex in claim.js, or shelling out.
- Ordering is favourable: Step 6 writes the summary, Step 7 runs the sweep, Step 10 runs finalize —
  so both artifacts exist on disk when the block is stamped. `run-gaps.json` is explicitly excluded
  from the archive-evidence `.md` filter (`:5857-5858`) but IS carried by `copyDir`'s full recursion.
- **`## Follow-Up Items`** exists as a heading in the summary template
  (`commands/kaola-workflow-finalize.md:194`) but **no script reads it** — zero hits for
  `Follow-Up Items` / `follow_up` across `scripts/*.js`, `templates/routing/*.js`, `docs/*.md`.
- **`net_backlog_delta` has no producer at all today** — it is a derived quantity over
  `issues_closed` and `follow_ups_filed`, both of which are themselves degraded on the default lane.

---

## 3. Malformed/missing degradation precedent — the house pattern

Four examples, in decreasing closeness to a new closure field.

**(a) `finalize_commit: 'unknown'` — the canonical "honest token" precedent.**
`scripts/kaola-workflow-claim.js:5159-5167`:

```js
      } else if (residueProbe === 'failed' || finalizeTx.finalize_commit_probe === 'failed') {
        // #907: `nothing_to_commit` is a claim about the WORKING TREE, and neither of those faults
        // supports it — one could not enumerate what to stage, the other could not read what was
        // staged. `unknown` is the honest token; the finding beside it says which fault produced it.
        finalizeTx.finalize_commit = 'unknown';
      } else {
        // Nothing left to commit — the branch already carries the final candidate commit.
        finalizeTx.finalize_commit = 'nothing_to_commit';
      }
```

**(b) `changed_paths_probe` — a separate `measured | unavailable` companion field.**
`scripts/kaola-workflow-claim.js:3852-3859`:

```js
  // `base` scopes the diff to a project's OWN divergence on a shared multi-issue branch. A git
  // failure yields null — reported as "not measured", never as a verdict either way.
  const changed = adaptiveSchema.changedPathsSinceBase(gateRoot, base || 'main', project);
  return {
    validation,
    changed_paths: changed || [],
    changed_paths_probe: changed === null ? 'unavailable' : 'measured',
  };
```

…and its durable half distinguishes "not measured" from "measured zero" in prose
(`:3901-3911`):

```js
function persistChangedPathsToSummary(projectDir, changed, probe) {
  const lines = [];
  if (probe === 'unavailable') {
    lines.push('not measured — the branch diff could not be enumerated.');
  } else if (!changed || !changed.length) {
    lines.push('none outside the run-state and documentation bands.');
```

The envelope only carries the probe token when it is NOT the happy value (`:5195`):
`if (finalizeChangedProbe !== 'measured') finalizeEmit.changed_paths_probe = finalizeChangedProbe;`

**(c) `issue_disposition: 'unknown'` — already used on the SAME block, watch-pr lane.**
`scripts/kaola-workflow-claim.js:6212-6217`:

```js
      // #333: observe the primary issue's state at archive time (a merged PR does NOT imply a
      // closed issue — no close keyword keeps the issue open, the keep-open PR-sink case). watch-pr
      // is online by construction (OFFLINE early-returns above); probeIssueState catches/degrades.
      const dispProbe = probeIssueState(folder.issue_number);
      const issueDisposition = dispProbe.state === 'closed' ? 'closed'
        : (dispProbe.state === 'open' ? 'kept-open' : 'unknown');
```

**(d) `classification: 'unknown'` in the summary writer.**
`scripts/kaola-workflow-claim.js:3892-3899`:

```js
function persistValidationToSummary(projectDir, validation) {
  const v = validation || {};
  const lines = ['classification: ' + (v.classification || 'unknown'),
    'green: ' + (v.green === true)];
```

Also relevant: `scripts/kaola-workflow-claim.js:6349` — *"A probe outage while ONLINE is 'unknown',
not 'pending'"*, and `:6143` `checks.merged_into_sink_target = 'unknown';`.

**The two rules the pattern encodes:** (1) a value that could not be MEASURED never degrades to a
plausible number — it degrades to a named token; (2) "measured zero" and "not measured" must be
distinguishable, either by an `unknown` token in the same field or by a companion `*_probe` field.
Note that a numeric field named `issues_closed: <n>` cannot carry `unknown` and stay numeric — the
house precedent for that shape is (b), a companion probe token.

---

## 4. `docs/workflow-state-contract.md`

**The section that would gain rows** — `docs/workflow-state-contract.md:291-292`, the *last* bullet
of `## Workflow State Fields` (heading at `:232`):

```markdown
- `## Closure` — appended at archive time by `appendClosureBlock`: `archived_at`,
  `issue_disposition`, `claim_label_removed`, `worktree_removed`, and `closure_invariants`.
```

**Formatting convention** — not a table. `## Workflow State Fields` is a flat markdown **bullet
list, one bullet per state BLOCK**, in the file's own block order, each of the form
`` - `## BlockName` — <prose naming its fields in emission order> ``. Field names are inline code
spans, comma-separated, with a serial "and" before the last. Bullets that need more get an indented
sub-list (`## Current Position` at `:237-243`) or bolded sub-bullets after a prose paragraph
(`## Sink` at `:270-286`). Neighbours for calibration (`:288-292`):

```markdown
- `## Last Evidence` — `last_command` and `last_result`, the terminal disposition tokens the closure
  paths stamp (for example `closed_keep_open`).
- `## Lease` — legacy, deprecated. Preserved for backward compatibility on read only.
- `## Closure` — appended at archive time by `appendClosureBlock`: `archived_at`,
  `issue_disposition`, `claim_label_removed`, `worktree_removed`, and `closure_invariants`.
```

The current bullet lists all five fields **in exact emission order**, so four new fields append to
that enumeration (and the wrap is at ~99 cols).

**Second doc surface in the same file** — `## Closure contract cross-reference` (`:401-407`):

```markdown
The closure contract — the invariants a completed issue must satisfy, the closure receipt schema,
and which path populates which field — lives in `api.md` § Closure Contract, with its
machine-readable half in `scripts/kaola-workflow-closure-contract.js`. The archived
`workflow-state.md` carries the same terminal facts in its `## Closure` block.
```

**Third doc surface — `docs/api.md` § Closure Contract** (`:1023`), whose `### Closure receipt
schema` (`:1076-1110`) is a fenced JSON block plus explanatory bullets. Note the explicit
post-build note at `:1103-1105`:

> `anchored_root` and `closure` are attached **after** `buildClosureReceipt()` returns, because the
> builder filters by `CLOSURE_RECEIPT_FIELDS`.

Also `:1152-1157` states, of this very block: *"`appendClosureBlock` writes no attestation field to
the `## Closure` block."*

Both contract validators assert a term list over `docs/api.md` — `scripts/validate-workflow-contracts.js:384-395`
and `scripts/validate-kaola-workflow-contracts.js:198-208` (`assertConcept('docs/api.md', 'closure
contract invariants and receipt schema', ['## Closure Contract', 'closure invariants',
'remote_issue_closed', 'claim_label_removed', 'kaola-workflow-closure-contract.js', 'kept_open',
'#162', '#163', '#164', '#165'])`). These are **presence** assertions — new fields do not trip them,
but the heading and every listed token must survive any edit.

---

## 5. Edition copies

### 5a. Where the four `claim.js` copies live

| tree | path | class |
|---|---|---|
| canonical (claude) | `scripts/kaola-workflow-claim.js` | reference |
| codex plugin | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | **byte-identical** |
| gitlab plugin | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | **hand-ported / divergent** |
| gitea plugin | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | **hand-ported / divergent** |

Verified at HEAD: `diff -q scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
→ identical.

**opencode and kimi hold NO in-repo `claim.js` copy.** `find . -name "*claim*.js"` returns exactly
the four above (plus four `scripts/test-*claim*.js`). They are additive runtime editions that
deploy from the canonical/forge trees at install time (`scripts/sync-opencode-edition.js:402-419`,
`scripts/sync-kimi-edition.js:382-401` — they rewrite the `kaola_script` resolver, not the scripts).

### 5b. The mechanism and the guard that fails on drift

`kaola-workflow-claim.js` is member #1 of `COMMON_SCRIPTS` — `scripts/validate-script-sync.js:45-47`:

```js
const COMMON_SCRIPTS = [
  'kaola-workflow-claim.js',
  'kaola-workflow-active-folders.js',
```

`COMMON_SCRIPTS` pins **canonical ↔ codex byte-identity only**. `scripts/edition-sync.js:46` imports
it (`const { COMMON_SCRIPTS, BYTE_IDENTICAL_GROUPS, checkCommittedKernelParity } = require('./validate-script-sync');`)
and `--write` copies canonical → codex (`:250-253`). **The gitlab/gitea claim ports are neither
generated nor rename-normalized** — they appear in no `GENERATED_AGGREGATORS`,
`RENAME_NORMALIZED_FAMILIES`, or `BYTE_IDENTICAL_GROUPS` entry (grep for `gitlab-workflow-claim` /
`gitea-workflow-claim` in `validate-script-sync.js` and `edition-sync.js`: **zero hits**; the only
hit anywhere is `scripts/test-edition-sync.js:95`, a rename-map assertion about a `require()` string).
They are hand-mirrored, and only their own forge chains catch a divergence.

**Guards that would fail on drift:**
- `scripts/validate-script-sync.js` — the `COMMON_SCRIPTS` byte check (canonical vs codex). This is
  the one that reds on a claim.js edit landed in only one of the two.
- `node scripts/edition-sync.js --check` / `--write` (`npm run sync:editions`).
- The two contract validators (`validate-workflow-contracts.js` /
  `validate-kaola-workflow-contracts.js`) for the `docs/api.md` § Closure Contract term list.
- Per-forge suites (`plugins/kaola-workflow-git{lab,ea}/scripts/simulate-git*-workflow-walkthrough.js`)
  for the hand-ported gitlab/gitea behaviour — e.g.
  `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js:580-583`.

Because both hand-ported forge trees are touched, this is an **edition-touching diff**: per
`CLAUDE.md` § Validation Policy, `run-chains.js` fails closed to **all four chains** at finalize.

### 5c. `kaola-workflow-adaptive-schema.js` — no Closure constant

Four copies (`scripts/`, and each of the three plugin trees — note all four carry the **base**
name, un-renamed), pinned as a 4-tree byte-identical group at
`scripts/validate-script-sync.js:93-96` under the label *"adaptive-schema kernel copies
(cross-edition drift anchor)"* (`:208`).

Grep for `CLOSURE|Closure|closure` in `scripts/kaola-workflow-adaptive-schema.js` returns three hits,
**none of them Closure-block related**:
- `:187` `closure_policy: nonEmptyString(input.closure_policy, 'claim_closure_policy_invalid'),`
- `:275` `'closure_policy',` (a field-name list)
- `:923` a comment naming `docs/api.md` and the validators

`closure_policy` is a **claim-time** field, unrelated to the `## Closure` block. The schema module
does contribute `writeFileAtomicReplace` (used by gap-sweep) and `MISSION_LIST_FILE`, but holds no
constant a new Closure field would need.

**The real schema module is `kaola-workflow-closure-contract.js`** — 4-tree byte-identical
(`scripts/validate-script-sync.js:125-129`, label *"closure-contract module copies"*). Its
`CLOSURE_RECEIPT_FIELDS` (`:20-83`) is the **JSON receipt** whitelist that `buildClosureReceipt`
filters against (`scripts/kaola-workflow-claim.js:6367-6387`):

```js
      if (Object.prototype.hasOwnProperty.call(fields, key) && steps[key] !== undefined) {
        receipt[key] = steps[key];
      }
```

The markdown `## Closure` block bypasses that filter entirely. So the four new fields need a
`closure-contract.js` edit **only if** they must also ride the JSON `closure_receipt` — and even
then the house has a documented alternative (post-build attachment, the "Decision-5 trap" comments
at `:4731-4736`, `:4741`, `:4752-4754`).

---

## 6. Test surface

### 6a. Files asserting on the `## Closure` block itself

**`scripts/simulate-workflow-walkthrough.js`** — the primary home. Four sites:

- `:299-360` `testKeepOpenArchiveStamp()` (`#333`) — **the closest existing fixture.** Full
  claim → `finalize --project issue-333 --keep-open` cycle, then:
  ```js
  assert(result.issue_disposition === 'kept-open',
    '#333: JSON output issue_disposition must be kept-open, got: ' + JSON.stringify(result.issue_disposition));
  ...
  assert(/^## Closure$/m.test(st), '#333: keep-open archived state must carry a ## Closure block');
  assert(st.includes('issue_disposition: kept-open'),
    '#333: keep-open archived ## Closure must record issue_disposition: kept-open');
  ```
  Helpers it establishes: `seedClassifierVerdictFromBody(333, '')`, `initGitRepo(tmp)`,
  `seedAdaptiveFinalizeFixture(tmp, 'issue-333')`, `statePath()`, `runNode(claimScript, …)`, `json()`.
- `:400` — the **negative control**: `assert(st1.includes('status: active') && !/^## Closure$/m.test(st1), …)`.
- `:4936-4944` — the `finalize --keep-worktree` lane: the append must land inside the
  `chore: archive` commit and leave the feature worktree clean:
  ```js
  const cleanAfterFinalize = G.git(wt850, ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim();
  assert(cleanAfterFinalize === '', …);
  ...
  assert(/^## Closure$/m.test(archivedState850),
    '#333: archived state must carry a ## Closure block after finalize --keep-worktree');
  ```
  **A new field changes the block's bytes, so it must stay inside the same commit** or this assert reds.
- `:5537-5542` — the `watch-pr` MERGED lane:
  ```js
  assert(archivedState860.includes('issue_disposition: kept-open'),
    '#333: watch-pr MERGED archive of an open issue must record issue_disposition: kept-open (probe-derived), got: ' + archivedState860);
  ```
- `:10939` — a hand-built `## Closure` fixture inside a worktree state file (fields: `archive: closed`),
  not an assertion.

**`scripts/test-sink-merge.js`** — the sole-archiver lane. Header at `:16`, assertion at `:530-540`:

```js
    assert(stateAtHead && /^## Closure$/m.test(stateAtHead), '#700 c: archived workflow-state.md must carry a ## Closure block at HEAD');
```

### 6b. Files asserting on the JSON `closure_receipt` / `closure_invariants`

- **`scripts/test-bundle-finalize.js`** — the richest close-bucket fixtures. `:442-443`, `:475-476`,
  `:523`, `:577`, `:590`, `:667`, `:682-683`, `:970-995` (`#508` merge-lane: `remote_issue_closed ===
  'close_pending'`, `closed_issues.length === 0`, `close_disposition === 'close_pending'`,
  `closure.closed.length === 0`, **zero `gh issue close` calls**), `:1157-1158` (`#617 A`),
  `:1277-1278` (a literal receipt fixture), `:1530-1531`. It uses a `gh` mock with a call log
  (`readLog(logFile)`, entries prefixed `issue-close:`) — **this is where an `issues_closed` count
  test belongs**, because it is the only suite that can assert a count against actual forge calls.
- **`scripts/test-finalize-door.js`** — the finalize-transaction suite, T1…T13
  (`:444`, `:465`, `:499`, `:577`, `:656`, `:779`, `:949`, `:1032`, `:1233`, `:1340`, `:1532`,
  `:1593`, `:1986`, `:2101`, `:2127`, `:2284`, `:2487`, `:2597`). Its Closure references are in
  T-header prose only (`:1599`, `:1797`, `:2131` — "exit 0, `closure_invariants.ok: true`"), not
  assertions on the block. This is the house's home for **"nothing refuses" / degradation-token**
  legs, so a `follow_ups_filed`-cannot-be-measured leg fits here (T13 at `:2597` is the most recent
  precedent, four-edition red-before-fix).
- **`scripts/test-claim-hardening.js`** — `:1802`, `:1852` (`r.json.closure_receipt`), `:3128-3130`
  (`claim_label_removed === 'skipped_offline'` on the offline cleanup lane).
- **`scripts/test-forge-archive-scoping.js`** — `:581-586`, `closure_receipt.archive` +
  `closure_invariants` in the failure message.
- **`scripts/test-gap-sweep.js`** — the gap-sweep suite (T1…T9+). Fixture writer at `:71-76`:
  ```js
  // Write finalization-summary.md with an optional ## Run gaps section.
  ...
      content += '## Run gaps\n\n' + gapLines.join('\n') + '\n';
  ```
  T3 (`:175-186`) is the `filed: #123` mapping fixture — the ready-made shape for any
  `follow_up_numbers` extraction test.

### 6c. Forge-edition twins (must be mirrored by hand)

- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js:445-479` — the codex twin
  of `testKeepOpenArchiveStamp` (byte-identical logic, different line numbers).
- `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js:580-583` — asserts
  the block is present **and** that it does **not** carry a retired field:
  ```js
    assert.ok(/^## Closure$/m.test(stateContent),
      'gitea closure persistence: archived workflow-state.md must carry ## Closure');
    ...
      'gitea closure persistence: archived workflow-state.md ## Closure block must not carry the retired claim_planner_attested field, got: ' + stateContent);
  ```
  (A negative-assertion precedent: the house pins field ABSENCE as well as presence.)
- The gitlab twin lives in `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`.

---

## Summary of load-bearing constraints for the four fields

1. **No production reader parses `## Closure`** — additive fields break nothing structurally.
2. **The heading presence-guard means the FIRST writer on a lane wins**; the sink cannot revise the
   block with its authoritative close results.
3. **On the shipped merge lane `cmdFinalize` closes zero issues** (`mergeLaneDeferred` defaults
   true). `issues_closed` is therefore not measurable as "closes performed" at stamp time — only
   `closureReceipt.closure.attempted` (the claimed set) is.
4. **`follow_ups_filed` / `follow_up_numbers` have a machine source only in the summary's
   `## Run gaps` prose**, whose parser (`parseGapSection`) is not exported; `run-gaps.json` carries
   swept classes but no issue numbers, and `## Follow-Up Items` has no reader at all.
5. **The house degrades unmeasurable values to a named token, never a number** — `unknown`
   (`:5163`, `:6217`) or a companion `*_probe` field (`changed_paths_probe`, `:3858`).
6. Four claim.js copies; canonical↔codex byte-pinned by `COMMON_SCRIPTS`, gitlab/gitea hand-ported
   with no automated guard. An edition-touching diff fails closed to all four chains.

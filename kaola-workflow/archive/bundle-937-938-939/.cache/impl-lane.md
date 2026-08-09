# Implementation lane — #937 Direction 1 (slug resolution) and #938 (offline claim-release finding)

baseline: `42559b1c8df312e462816f139080f3508df48370`
worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-937-938-939`
(branch `workflow/bundle-937-938-939`)

Two production files touched, both canonical. No test file, no `plugins/**`, no `docs/`, no
`kaola-workflow-classifier.js`. No new env var, no new file, no new script.

```
scripts/kaola-workflow-claim.js      | 138 +++++++++++++++++++++++++++++---
scripts/kaola-workflow-sink-merge.js |  51 ++++++++++---
2 files changed, 168 insertions(+), 21 deletions(-)
```

---

## Change 1 — resolve the project slug, and report the correction (#937 Direction 1)

### 1a. `resolveProjectSlug(requested, names)` — the one resolver and the one wording

`scripts/kaola-workflow-claim.js:334-370`, placed immediately after `unreservedProjectName` because
it is the same class of correction (#933's reserved name) and takes the same ruling: resolve, never
refuse, and say so.

Pure: it takes the supplied name plus a list of the names the store actually records, and returns
`{ project, note }`. Exact match, or no case-insensitive match, or a match equal to the supplied
string ⇒ `{ project: supplied, note: null }` and the caller emits exactly what it emitted before.
`names` is a PARAMETER rather than read inside, because the two callers genuinely read different
stores (below) and neither can reach the other's.

Exported at `scripts/kaola-workflow-claim.js:6698`, next to `clearAdvisoryClaim` and for the same
reason #936 exported that one: sink-merge `require()`s it, so the resolution and the sentence exist
once and are read twice.

### 1b. `cmdFinalize` — resolved once, before anything is composed from it

`scripts/kaola-workflow-claim.js:4197-4211`, immediately after `assert(args.project, '--project
required')` and BEFORE the `--check` pre-flight. Candidate names are the DIRECTORY ENTRIES of
`kaola-workflow/` and `kaola-workflow/archive/` (`fs.readdirSync(..., {withFileTypes:true})`,
directories only) — the same primitive `readActiveFolders` uses in its first pass, and forge-free.
`readActiveFolders` itself is NOT used: it makes a `gh issue list` prefetch and filters folders
whose issue is closed, so it would answer "no such folder" for exactly the runs finalize is for.

`args.project` is REWRITTEN in place. Every one of the ~40 downstream reads (the archive, the
roadmap paths, the removal pathspec, the marker, the receipt) then sees the resolved spelling with
no further edit. Patching the five `clearAdvisoryClaim` call sites individually would have left the
archive-naming and pathspec symptoms standing; the drives established all three share one cause.

The report:
- `scripts/kaola-workflow-claim.js:4226-4230` — `--check`'s envelope gains `resolved_project_note`
  when a name was corrected (the pre-flight predicts the run, so it must name the same folder).
- `scripts/kaola-workflow-claim.js:5282-5284` — the finalize envelope gains `resolved_project_note`,
  using the existing conditional-field idiom one line above it (`changed_paths_probe`).

Both are the field only when `note` is non-null.

### 1c. `sink-merge.js` — resolved once, from the BRANCH's tree

`scripts/kaola-workflow-sink-merge.js:3052-3076`, right after the existing
`assert(args.project && isSafeName(args.project), ...)` — `isSafeName` tests SHAPE and never the
filesystem, which is why a mis-cased name gets past it.

`coordRoot` / `mainRoot` are hoisted out of the two entry-point branches (they were computed
identically in each, in the same position relative to the asserts) so the resolution has a root.
The duplicate declarations at the old `:3055-3056` and `:3072-3073` are gone.

**The candidate names come from `git ls-tree -d --name-only <branch>:kaola-workflow` and
`<branch>:kaola-workflow/archive`, not from the filesystem.** This is the one place the two scripts
had to differ, and it is not a preference: the sink runs from the DEFAULT-BRANCH checkout, which
does not carry the run folder until the merge step puts it there. Both test fixtures prove it —
`buildSoleArchiverFixture` creates the live folder on the feature branch only
(`scripts/test-sink-merge.js:336-352`), and `buildLegacyKeepOpenFixture` creates the archive on the
feature branch only (`:4878-4890`). A filesystem read at `main()` time finds nothing in either.
Git's tree also records the name case-sensitively, which is precisely the authority the removal
pathspec and the archive name need. An unresolvable ref yields no candidates and the supplied name
stands, exactly as today.

The report rides `sinkEmit` (`scripts/kaola-workflow-sink-merge.js:105-110`) off a module-scoped
`resolvedProjectNote` (`:95-99`), mirroring the `sinkFindings` accumulator two lines above it. One
edit covers both terminals (`runSinkTransaction`'s `status:sinked` and the legacy `status:merged`)
and every refusal raised after the resolution, instead of two call-site edits that would each have
to be repeated for the next envelope.

### Not regressed, checked

- **#936's cwd handling**: untouched. `forgeOpts = { cwd: mainRoot }` still reaches every `ghExec`;
  the sink suite's `REJECTED-wrong-cwd` assertion (`test-sink-merge.js:5083`) is green on all four
  #937 legs.
- **Marker scoping not widened**: the resolution happens on the SLUG, before the marker is built;
  `clearAdvisoryClaim`'s exact-substring match at `claim.js:977/980` is byte-unchanged. The
  `issue-OTHER` marker and the ordinary human comment survive on every leg.

---

## Change 2 — the offline finalize reports a conditional typed finding (#938)

### 2a. Which members were skipped

`scripts/kaola-workflow-claim.js:4684-4703`. The bundle loop keeps only the primary's status, so the
skipped members are collected as the loop runs (`claimReleaseSkipped.push(n)` when
`clearAdvisoryClaim` returns `skipped_offline`), plus the scalar arm's own issue number. Nothing
about `claim_label_removed` itself changed.

### 2b. The finding

`scripts/kaola-workflow-claim.js:4705-4720`, through the existing
`recordFinalizeFinding('claim_release_skipped_offline', summary, lines)`. Fires only when at least
one real issue number had its release skipped — an online run collects nothing and raises nothing.

The wording is CONDITIONAL, verbatim:

> This finalize released no claim: KAOLA_WORKFLOW_OFFLINE=1, so the release returned before making
> any forge call. Nothing local records whether this run was ever claimed online, so this does not
> assert the artifacts are there — but IF the claim was posted, the `workflow:in-progress` label and
> the `kw:claim` marker comment are still on the issues below. The marker expires after 24h; the
> label does not, and either one blocks a later claim of that issue until it is removed.

followed by `Issues whose claim release was skipped:` and one `- #N` line per member.

`closure_invariants.ok` stays `true` and `claim_label_removed` stays `skipped_offline` — nothing in
`checkClosureInvariants` was touched. This is a report, not a gate.

### 2c. THE ONE THING THE BRIEF DID NOT ANTICIPATE — the durable write ordering

The brief said "no new plumbing is required". That is true of the envelope half and false of the
durable half, and the full walkthrough caught it:

```
Error: #296 B1: working tree must be clean after finalize re-entry, got: " M kaola-workflow/archive/issue-296b1/finalization-summary.md\n"
  at Object.testFinalizeIncompleteWorktreeReentryFix [.../simulate-workflow-walkthrough.js:13450:5]
```

`flushFinalizeFindings` runs at the END of the `--keep-worktree` commit block, AFTER both
`chore: archive` and `chore: finalize`. Every finding that existed before this change fires only
when a git step FAILED, so the tree was already dirty and nobody noticed. A finding that fires on a
HEALTHY offline run makes the transaction append to an already-committed archived summary and then
declare the tree clean. `testFinalizeIncompleteWorktreeReentryFix` and the #217 second-finalize
assertion both read that tree.

Fixed by making the flush REPEATABLE and calling it once before the residue is enumerated:

1. `appendSummarySection(projectDir, heading, lines, replace)` —
   `scripts/kaola-workflow-claim.js:4048-4075`. A new optional 4th argument RESTATES an existing
   section instead of declining to write it (cut from the heading to the next `## ` heading — never
   a `### ` sub-heading, which is three hashes — then re-append). Every existing caller passes three
   arguments and is byte-identical. This is the one edit outside the `cmdFinalize` region.
2. `flushFinalizeFindings` — `scripts/kaola-workflow-claim.js:4258-4285`. The once-only
   `finalizeFindingsFlushed` boolean becomes `finalizeFindingsWritten` (a count). `finalizeTx.findings`
   is recomputed on every call; the durable write happens only when the accumulated set has grown
   since the last write, and it restates the WHOLE set with `replace: true`.
3. `scripts/kaola-workflow-claim.js:5096-5102` — one `flushFinalizeFindings()` immediately before
   the `git status --porcelain` residue probe, inside the `--keep-worktree` block. The modified
   summary is then enumerated as residue (`claim.js:5087-5090` already admits
   `kaola-workflow/archive/<project>/…`), staged, and carried by `chore: finalize`. Tree clean.

Why not simply flush early with the once-guard: `test-forge-finalize-findings.js` part A holds an
`index.lock` and asserts a durable `### residue_stage_failed` section (`:349-352`) alongside
`### archive_stage_failed` and `### archive_unstage_failed`. `residue_stage_failed` is recorded
AFTER the residue probe. A once-only early flush would have dropped it. Measured green after the
change on all four editions.

---

## Verification

Every command run with cwd = the worktree and an absolute script path under it.

### The ten red pins — all GREEN

**`node scripts/test-sink-merge.js`** — pins `#937 a` and `#937 c` (6 + 3 red assertions at baseline):

```
before: Sink-merge (#694/#700/#705/#707/#715/#746/#832/#893/#923/#931) test suite FAILED: 9 failed, 821 passed.   exit 1
after:  Sink-merge (#694/#700/#705/#707/#715/#746/#832/#893/#923/#931) test suite passed: 830 assertions.          exit 0
```

830 = 821 + 9. Every baseline assertion still runs; the nine that failed now pass. The positive
controls `#937 b` and `#937 d` print and pass.

**`node scripts/test-bundle-finalize.js`** — pins `#937 e` (4 red) and `#937 f` (3 red):

```
before: test-bundle-finalize: 7 test(s) FAILED, 172 passed   exit 1
after:  test-bundle-finalize: all 179 tests passed           exit 0
```

Positive control `#937 g` prints and passes.

**`node scripts/simulate-workflow-walkthrough.js --only testFinalizeOfflineReportsSkippedClaimRelease`** — pin #938:

```
before: Error: #938: an offline finalize releases NO claim ... Raise the typed finding
        "claim_release_skipped_offline" on finalize_transaction.findings; got: []          exit 1
after:  testFinalizeOfflineReportsSkippedClaimRelease: PASSED
        Walkthrough --only subset passed (1 scenarios)                                      exit 0
```

All four #938 assertions (envelope type, durable section, both member numbers) plus the two premise
clauses (`claim_label_removed === 'skipped_offline'`, `closure_invariants.ok === true`) and the
ONLINE control pass.

### The named neighbours

```
node scripts/simulate-workflow-walkthrough.js --only testFinalizeRemovesClaimLabel \
  --only testFinalizeOfflineSkipsLabelInvariant --only testFinalizeOfflineClosureReceiptSkipped \
  --only testFinalizeIncompleteWorktreeReentryFix --only testFinalizeOfflineReportsSkippedClaimRelease
→ all 5 PASSED, exit 0
```

### Full-scope walkthrough

```
node scripts/simulate-workflow-walkthrough.js
##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":209,"ran":209,"passed":209,"failed":0}
Workflow walkthrough simulation passed
exit 0
```

Not a shard — 209 of 209.

### The other required suites

| command | before | after |
|---|---|---|
| `node scripts/test-claim-hardening.js` | exit 0, 766 assertions | exit 0, **766 assertions** |
| `node scripts/test-finalize-door.js` | exit 1, 28 failures / 430 passed | exit 1, 40 failures / 450 passed |
| `node scripts/validate-script-sync.js` | — | exit 1 (edition drift, expected) |

**`test-finalize-door.js` is red for reasons that are not mine, before and after.** All 40 failures
are in `T12` and `T12b`, two blocks another agent ADDED to this shared worktree during this session
(`git diff --stat scripts/test-finalize-door.js` → `325 ++++`, pure insertions; the file's mtime
moved from 11:21 to 11:40, i.e. between my baseline run and my after run — `T12b` did not exist at
baseline and accounts for exactly the 12-failure increase). Every one of them asserts that a REFUSAL
must name `release` in its `operator_hint` / `reasoning`:

```
FAIL: T12(root finalize_gate_unverified): the refusal must name `release` as the way to give the claim back ...
FAIL: T12b(root archive_refused): ... got reasoning="archival did not return an explicit success result; ..."
```

My diff adds no refusal and edits no `operator_hint` or `reasoning` string. The same suite passes at
the pristine repo root (`exit 0, 394 assertions`), which carries neither T12/T12b nor my change.
`findings.length === 0` at `:2175`/`:2194` is unaffected — that leg runs `KAOLA_WORKFLOW_OFFLINE: '0'`
(runner env at `:222`/`:245`/`:1710`) and is green in both runs.

**`validate-script-sync.js`** — RED exactly as predicted, and only on edition drift:

```
Out of sync (scripts/ vs plugins/kaola-workflow/scripts/):
  - kaola-workflow-claim.js
  - kaola-workflow-sink-merge.js
  - forge claim module.exports superset: plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js omits canonical export(s) [resolveProjectSlug] — a forge script require()s these by name, so an omission TypeErrors on a failing path (#550 class)
  - forge claim module.exports superset: plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js omits canonical export(s) [resolveProjectSlug] — a forge script require()s these by name, so an omission TypeErrors on a failing path (#550 class)
```

### The predicted consequence, measured

`node scripts/test-forge-finalize-findings.js` → exit 1, **128 passed, 5 failed**. Every behavioural
leg (part A and part C) passes on all four editions — which is the evidence that the flush-ordering
change did not cost `residue_stage_failed` its durable section. All five failures are part B, the
static registry guard, exactly as the test author predicted:

```
FAIL: static: canonical and codex must raise the same finding types; canonical-only: ["claim_release_skipped_offline"], codex-only: []
FAIL: static: the canonical/gitlab finding-type delta must be exactly ["archive_unstage_failed"], got ["archive_unstage_failed","claim_release_skipped_offline"]
FAIL: static: the canonical/gitea finding-type delta must be exactly ["archive_unstage_failed"], got ["archive_unstage_failed","claim_release_skipped_offline"]
FAIL: static: the docs `findings` row must enumerate exactly the canonical registry.
FAIL: static: docs/api.md says canonical and Codex raise seven finding types; measured 8
  raised but not documented: ["claim_release_skipped_offline"]
```

---

## Deliberately NOT done

1. **The three edition ports.** `plugins/kaola-workflow/` (codex, line-identical mirror),
   `plugins/kaola-workflow-gitlab/`, `plugins/kaola-workflow-gitea/`. Canonical only, per the brief;
   this is what `validate-script-sync.js` reds on. The forge ports carry a DIFFERENT
   `clearAdvisoryClaim` signature (slug is the 4th arg) — see `map-a-anchors.md` Part 2.
2. **`docs/api.md`.** The `findings` table row (`:368`), the per-edition count sentence, and the
   `:385` sentence "a good finalize reports `staged`/`staged`/`committed` with no `findings`" —
   which an offline run now contradicts. Also undocumented: `resolved_project_note` on the finalize,
   `--check` and sink envelopes, and `appendSummarySection`'s `replace` argument.
3. **`CHANGELOG.md`.**
4. **Any test file.** `test-forge-finalize-findings.js` part B and the `docs/api.md` rows above are
   its subject, not mine to edit.
5. **`kaola-workflow-classifier.js`** — another agent owns it.
6. **The six `folder.project` call sites** (`claim.js` release ×2, watch-pr ×4). They pass a
   directory entry name and were already correct.

## One deviation from the brief, stated plainly

The brief said: *"Do not change the existing case-SENSITIVE-volume behaviour, where the run already
refuses with `finalize_gate_unverified` / `archive_authority_missing`."*

**This change does alter it, and there is no way to resolve early that does not.** On a
case-sensitive volume, `kaola-workflow/Issue-N` genuinely does not exist, so today the authority
gate finds nothing and refuses. After this change the name is resolved to `issue-N` BEFORE that gate
reads it, so the gate opens and the run completes — reporting the correction, exactly as it now does
on a case-insensitive volume.

I chose this over gating the resolution on an `fs.existsSync` probe of the supplied spelling, for
two reasons. First, the sink resolves from a git tree and has no filesystem to probe at that point,
so the probe would give the two scripts different semantics for the same operator mistake — against
"one rule, one wording". Second, that refusal is not a designed door: it is
`archive_authority_missing`, an incidental "I cannot find your run", and it is the same refusal the
owner explicitly DECLINED for this class. Resolve-and-report is neither silent nor destructive.

Unmeasurable here either way — every volume on this box is case-insensitive APFS, and the two
drives' case-sensitive legs used a `hdiutil` sparse image that no longer exists. **If the owner
wants the case-sensitive refusal preserved, say so and I will add the probe to the claim.js side and
leave the sink resolving unconditionally, with the divergence declared.**

## One thing worth watching (recorded, not built)

`clearAdvisoryClaim` returns `skipped_offline` for `issueNumber == null` as well as for `OFFLINE`.
The #938 finding does NOT fire in the null-issue case (there would be no issue number to name), so
a scalar finalize that cannot recover its issue number still reports nothing about its claim. No
drive observed that shape; naming it here rather than building for it.

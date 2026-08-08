# Investigation: #936 — which door leaves a `kw:claim` marker on an OPEN issue?

## Setup

- Commit: `ecdb2c88e359ca77bf99bf692309ba58bff0ac6a`, branch `main`. Tree clean at start and at
  finish (`git status --porcelain` = `?? kaola-workflow/issue-936/` only, both times). No tracked
  file was edited; no live forge write call was made.
- Platform: darwin 25.6.0. **Filesystem is CASE-INSENSITIVE (APFS)** — measured
  (`touch casetest/aaa` then `[ -e casetest/AAA ]` → true). This is load-bearing for door (b).
- Every fixture is a fresh `mkdtemp` under the scratchpad, driving the REAL
  `scripts/kaola-workflow-claim.js` / `scripts/kaola-workflow-sink-merge.js` as subprocesses.
- Harness files (scratch, not repo):
  `…/scratchpad/harness.js`, `harness2.js`, `exp1.js`, `exp2.js`, `exp3.js`, `exp4.js`, `exp4b.js`,
  `exp5.js`, `exp6.js`, `exp7.js`, `probe.js`
  (under `/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/4fe0bbe4-8533-453f-9bae-e85abcd77f90/scratchpad/`).

### The forge-stub mechanism (deliverable 3)

**`KAOLA_GH_MOCK_SCRIPT`** — an env var naming a Node script that stands in for the `gh` binary.

- Consumed at five sites, all the same shape:
  `scripts/kaola-workflow-claim.js:213`, `scripts/kaola-workflow-active-folders.js:39`,
  `scripts/kaola-workflow-classifier.js:25`, `scripts/kaola-workflow-closure-audit.js:57`,
  `scripts/kaola-workflow-sink-merge.js:323`.
- The dispatch is `kaola-workflow-claim.js:211-217`:
  ```js
  function ghExec(args, opts) {
    if (OFFLINE) return '';
    const mock = process.env.KAOLA_GH_MOCK_SCRIPT;
    if (mock) return execFileSync(process.execPath, [mock, ...args], …).trim();
    return execFileSync('gh', args, …).trim();
  }
  ```
  So the mock receives the gh argv verbatim on `process.argv.slice(2)` and answers on stdout.
- **How to point a script at it**: spawn the script under test with
  `env: { …process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_GH_MOCK_SCRIPT: '/abs/path/gh.js' }`.
  `KAOLA_WORKFLOW_OFFLINE` must be `'0'` — `ghExec` short-circuits before the mock when OFFLINE.
- **Prior art to copy for a regression test**: `scripts/test-bundle-finalize.js:237-337`
  (`writeGhMockScript`, which appends one line per call to a log file) and its driver
  `runFinalize` at `:339-353`. `scripts/test-finalize-door.js:166` and
  `scripts/test-bundle-claim.js:31` use the same pattern. A sibling seam
  `KAOLA_CLASSIFIER_MOCK_SCRIPT` exists at `kaola-workflow-claim.js:1048`.
- Routes a marker-aware mock must answer: `repo view`, `issue view N [--json state --jq .state]`,
  `issue close N`, `issue edit N --add-label/--remove-label`, `issue comment N`, `label create`,
  `api repos/{owner}/{repo}/issues/N/comments` (returns the comment array), and
  `api --method DELETE repos/{owner}/{repo}/issues/comments/<id>`.

### The two rules under measurement

| role | file:line | predicate |
|---|---|---|
| **producer** | `claim.js:937` (and `:1602` for bundles) | posts `<!-- kw:claim project=<project> -->` |
| **deleter** | `claim.js:972-977` | `comment.body.includes('<!-- kw:claim project=' + project + ' -->')` — **exact string**, where `project` is `args.project` |
| **detector** | `classifier.js:214-218` | `/<!--\s*kw:claim\s+(project|sess)=/` — **any project**, if `updated_at` is within 24h |
| **blocked** | `classifier.js:371-374` | `label OR marker` — either artifact alone blocks |

The deleter is narrower than the detector. Any marker whose `project=` differs from `args.project`
survives finalize **and still blocks**. That asymmetry is the engine behind door (b).

## Observations

| # | Measurement | Command / leg | Result | Exit |
|---|---|---|---|---|
| E0 | bundle finalize, no keep-open | `finalize --project bundle-936` | DELETE 111+222; remove-label 201+202 | 0 |
| E1 | bundle finalize, keep-open | `finalize --project bundle-936 --keep-issue-open` | DELETE 111+222; remove-label 201+202 | 0 |
| E2a | same, full receipt | as E1 | `issue_disposition: kept-open`, `keep_open_requested: true` — keep-open genuinely engaged | 0 |
| E2b | state with **no** `issue_numbers:` line | `finalize … --keep-issue-open` | DELETE **[111] only**; remove-label **[201] only** | 0 |
| E3a | #202's marker says `project=issue-202` | `finalize --project bundle-936 --keep-issue-open` | LIST on 201+202; DELETE **[111] only** → 222 survives on OPEN #202 | 0 |
| E3b | #202 carries two markers (`issue-202`, `bundle-936`) | as E3a | DELETE [111, 222]; **221 survives** | 0 |
| E3c | **finalize under `KAOLA_WORKFLOW_OFFLINE=1`** | `finalize … --keep-issue-open` | **0 gh calls**; `status: closed`, `claim_label_removed: skipped_offline` | 0 |
| E5-CTL | `--sink`, **no** keep-open (positive control) | `sink-merge --branch … --issue 201 --issue-numbers 201,202 --sink` | 8 gh calls incl. `issue edit 201 --remove-label` and `issue edit 202 --remove-label` | 1* |
| E5-SUB | `--sink` **with** `--keep-issue-open` | same + `--keep-issue-open` | **2 gh calls, both `issue view` probes.** 0 close, 0 remove-label, 0 comment, 0 DELETE. `status: sinked`, `closure: done` | 0 |
| E6 | finalize twice (2nd = resume, folder archived) | `finalize … --keep-issue-open` ×2 | both runs DELETE 111+222; archived state retains `issue_numbers: 201,202` | 0, 0 |
| E7e | **`finalize --project Bundle-936`** (case variant) | `finalize --project Bundle-936 --keep-issue-open` | `result: closed`; LIST on 201+202; **DELETE []**; remove-label 201+202 | 0 |
| E7b/c/d | `--project bundle-936/`, `kaola-workflow/bundle-936`, `./bundle-936` | finalize | refuse `archive_exception` / `finalize_gate_unverified`; **0 gh calls** | 1 |
| P | `readActiveFolders` probe | `probe.js` | projects `["bundle-936"]`; strict find `'Bundle-936'` → **null**; `stateFile(root,'Bundle-936')` **exists** | 0 |

\* E5-CTL's exit 1 is a mock artifact — my `issue view` keeps reporting `open` after `issue close`, so
`closeOne` buckets both members as failed → `sink_incomplete`. Irrelevant to the control's purpose:
the `--remove-label` calls at `sink-merge.js:2829` and `:2840` **fired** and were logged, which is
what the control had to establish. Without it, E5-SUB's silence would be indistinguishable from a
broken instrument.

Static enumerations (no execution needed, no file edited):

- `grep -n "issues/.*comments\|--method DELETE\|kw:claim" scripts/kaola-workflow-sink-merge.js`
  → **exit 1, zero matches.** sink-merge has no marker-deletion capability at all, in any mode.
- `writeState` has exactly two call sites: `claim.js:1282` (`claimProject` — writes **no**
  `issue_numbers`) and `claim.js:1729` (`claimBundle` — writes the full member list). The two
  `updateState` call sites (`claim.js:5335` patch-branch, `claim.js:6008` sink-fallback) touch only
  `branch:`, `sink:`, `last_result:`. **Nothing reduces `issue_numbers` after the claim.**
- `claim.js:910` emits the `issue_numbers:` line only when `length > 1`.
- `removeLegacyStateBlocks` (`claim.js:941-955`) strips only `session_id`, `owner_session_id`,
  `last_heartbeat`, `claim_comment_id`, `expires` — never `issue_numbers`.

## Reproduction

**Reproduces.** Three independent doors leave a marker on an OPEN issue; one of them also leaves the
label, matching the reporter's symptom exactly.

## Narrowing

### (a) the reduced set never reached `cmdFinalize` — **CLOSED as stated**

- E1/E2a eliminate the plain hypothesis: a keep-open bundle finalize visits **every** member
  (`claim.js:4602-4608`) and deletes both markers.
- E6 eliminates the resume variant: the archived `workflow-state.md` still carries
  `issue_numbers: 201,202`, the null-folder fallback (`claim.js:4578-4596`) recovers it, and a second
  finalize clears both again.
- The static enumeration above eliminates "a split at closure time": no code path rewrites
  `issue_numbers` after the claim transaction.
- **The shape that would do it exists but has no producer.** E2b proves that a state file with no
  `issue_numbers:` line drops the non-primary member entirely (DELETE `[111]`, remove-label `[201]`).
  But `claim.js:910` omits that line only for a 1-element list, so a genuine two-issue bundle always
  writes it. The reachable way into E2b's shape is a run that was **never a state-level bundle** —
  two issues grouped only in the mission list, with `claimProject` claiming one. In that case the
  second issue never received a marker either, so it is not this defect.

### (b) `args.project` ≠ the marker's `project=` — **OPEN, reproduced**

- E3a is the mechanism in isolation: the deleter's `includes()` on an exact project string fails, the
  comment list call still happens, and the marker survives on an open issue.
- **E7e is the reachable reproduction**, and `probe.js` explains it exactly:
  1. `activeByProject` (`claim.js:1123-1125`) is a strict `===` over the directory names, so
     `activeByProject(root, 'Bundle-936')` → **null**;
  2. every *path*-based operation (the finalize-authority gate, `archiveProjectDirSafely`) resolves
     `kaola-workflow/Bundle-936/…` successfully on the case-insensitive filesystem;
  3. the null-folder fallback recovers `issue_number` and `issue_numbers` from the archived state, so
     both members are visited and both labels are removed;
  4. **`args.project` is never recovered from state** — it stays the operator's spelling, and
     `claim.js:972` builds the marker from it, so `includes()` fails for every member;
  5. finalize emits `result: closed`, exit 0. No warning, nothing in the receipt.
- Generalization: `args.project` is the *only* input to the deleter's predicate that finalize does not
  reconcile against the durable record. Any divergence — case, or a marker left by a differently-named
  earlier claim (E3b) — survives silently.
- Scope note: step 2 depends on a case-insensitive filesystem. On a case-sensitive volume the same
  argument refuses instead (the E7b/c/d shape). The reporter is on darwin/APFS.

### (c) the sink ran without the `cmdFinalize` leg — **OPEN, and broader than reported**

- The static grep proves sink-merge can *never* delete a marker, in any mode. So (c) guarantees marker
  survival by construction, not by accident.
- E5-SUB proves it is worse than "no marker deletion": under `--sink --keep-issue-open` the sink does
  **no forge claim-teardown at all** — no comment, no label removal, on the primary or any member —
  while reporting `status: sinked`, `closure: done`, exit 0. The `--sink` closure step's entire
  teardown body sits inside `if (!keepIssueOpen)` (`sink-merge.js:2809-2864`); the `--remove-label`
  calls at `:2829` and `:2840` are inside that block.
- E5-CTL is the control that makes E5-SUB's zero meaningful.
- Therefore **on a keep-open run both the label and the marker depend entirely on `cmdFinalize`.** If
  `cmdFinalize` does not run, runs offline, or refuses, both artifacts survive on every member and the
  sink still reports a clean terminal state.

## Inferences

- **The single door that reproduces the reporter's symptom exactly — both label and marker retained —
  is an OFFLINE finalize (E3c).** `clearAdvisoryClaim` returns at `claim.js:958`
  (`if (OFFLINE || issueNumber == null) return 'skipped_offline'`) before touching the forge, yet
  finalize still emits `status: closed`. — confidence: high for the mechanism (directly measured,
  zero gh calls); **moderate** for it being what actually happened, since the reporter cleared the
  state by hand and no run record survives. Refuted by: a run record showing `KAOLA_WORKFLOW_OFFLINE`
  unset and `claim_label_removed: removed` in the finalize envelope.
- A closed member alongside an offline finalize is consistent with GitHub closing it from commit
  prose (`fixes #N`) at merge, which needs no workflow forge call. — confidence: moderate;
  refuted by: the merge commit for that run containing no close keyword for the closed member.
- **The reporter's (c) plus the `--sink` keep-open gap is the most likely compound**: any of the six
  pre-clear refusals in `cmdFinalize` (`claim.js:4248, 4277, 4328, 4343, 4379, 4414` — each an exit-1
  return before the clear loop at `:4605`) leaves everything, and the subsequent `--sink` reports
  success while doing nothing. — confidence: moderate; refuted by: evidence that finalize exited 0.
- Marker survival is only *observable* for 24 hours: `classifier.js:216-217` ignores a marker whose
  `updated_at` is older than that. The next run hit the block, so the surviving marker was fresh. —
  confidence: high (read directly from the predicate).

## Fourth doors the reporter did not name (deliverable 4)

- **D1 — OFFLINE finalize.** E3c. Zero forge calls, `status: closed`, `claim_label_removed:
  skipped_offline`. Both artifacts survive on every member. The only door measured that reproduces
  *both* retained artifacts from a single cause.
- **D2 — finalize refused before the clear loop.** Six early returns at `claim.js:4248` (project-folder
  mirror), `:4277` (`finalize_gate_unverified`), `:4328` (`implementation_commit_missing`), `:4343`
  (staging guard), `:4379` (`archive_refused`), `:4414` (archive incomplete). All exit 1 before
  `clearAdvisoryClaim` at `:4605`. Measured incidentally in E7b/E7c/E7d: zero gh calls each.
- **D3 — the two closure implementations disagree.** `postMergeCleanup` (`sink-merge.js:926-973`)
  *does* perform keep-open teardown: the keep-open comment at `:931`, `--remove-label` for the primary
  at `:961`, and a per-member comment + `--remove-label` loop at `:967-973`. The `--sink` transaction
  has none of it. `main()` at `sink-merge.js:3017-3028` routes `--sink` to `runSinkTransaction` and
  `return`s, so `postMergeCleanup` (called at `:3209`) is unreachable in `--sink` mode. The keep-open
  teardown that was written lives only on the path the workflow does not take.
- **D4 — stale markers accumulate and are never collectable.** E3b: only the exactly-matching marker is
  deleted. A marker from any earlier differently-named claim survives every subsequent finalize
  forever, and blocks for 24h whenever it is refreshed. Note the inverse at `claim.js:972-975`: when
  `project` is *falsy* the deleter falls back to the generic regex and removes **all** markers — so a
  missing `--project` over-deletes while a wrong one under-deletes.

## Minimal reproduction recipes (deliverable 2)

All three leave a `kw:claim` marker on an OPEN issue. Fixture common to all: a bundle project
`bundle-936` with `issue_numbers: 201,202`, markers seeded as `project=bundle-936` on both.

1. **Door (b), exact repro — `exp7.js` leg E7e** (needs a case-insensitive filesystem):
   ```
   node scripts/kaola-workflow-claim.js finalize --project Bundle-936 --keep-issue-open
   #   env: KAOLA_WORKFLOW_OFFLINE=0  KAOLA_GH_MOCK_SCRIPT=<mock>
   #   → exit 0, result: closed, comment LIST on 201 and 202, DELETE calls: NONE
   ```
2. **Door D1, offline — `exp3.js` leg E3c**:
   ```
   KAOLA_WORKFLOW_OFFLINE=1 node scripts/kaola-workflow-claim.js finalize \
       --project bundle-936 --keep-issue-open
   #   → exit 0, status: closed, ZERO gh calls; label AND marker survive on 201 and 202
   ```
3. **Door (c)/D3, sink-only — `exp5.js` leg E5-SUBJECT**:
   ```
   node scripts/kaola-workflow-sink-merge.js --branch workflow/bundle-936 --project bundle-936 \
       --issue 201 --issue-numbers 201,202 --keep-issue-open --sink --json
   #   → exit 0, status: sinked, closure: done, 2 gh calls (both `issue view`), no teardown
   ```
   Its control (drop `--keep-issue-open`) produces 8 gh calls including both `--remove-label`s.

## Open

- **Which door actually fired for #936 is not recoverable.** The reporter cleared the remote state by
  hand before capturing evidence, and neither the finalize envelope nor the sink receipt for that run
  survives. D1 fits both retained artifacts from one cause; (c)+D2 fits as a compound. I did not
  find a run record in the repo that would decide between them.
- I did not measure the GitLab or Gitea ports. The three doors above are all in canonical
  `claim.js` / `sink-merge.js`; whether the ports carry the same predicates is unmeasured.
- I made no live forge call and mutated no real issue, per the mission constraint, so no measurement
  here confirms real `gh` behaviour — only the argv the scripts emit.
- E5-CTL's exit 1 is a limitation of my mock (`issue view` does not reflect a prior `issue close`),
  not a finding about the sink. A regression test should make the mock's `issue view` honour a
  preceding `issue close` so the non-keep-open leg exits 0.

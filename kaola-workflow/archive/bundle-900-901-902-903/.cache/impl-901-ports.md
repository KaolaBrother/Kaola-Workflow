# Implementation notes — issue #901, GitLab + Gitea forge ports

**Verification tier: `smoke-integration` + `regression-green`.** The #901 behaviour in each port is
proven by driving that port's real sink end-to-end on the premise report's own fixture, before and
after, on **both** archiver postures, with a mutation-proven positive control for the new blob gate.
No test covers #901 in any edition yet (see "Where a test is needed"), so the authored suites can only
be a non-regression signal — they were green before and after in both editions.

Work is UNCOMMITTED in `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903`
on branch `workflow/bundle-900-901-902-903`.

---

## Answer up front

| port | had the defect? | fixed? | blob gate armed? |
|---|---|---|---|
| GitLab | **YES** — measured, both postures | **YES** | **YES** — mutation-proven |
| Gitea | **YES** — measured, both postures | **YES** | **YES** — mutation-proven |

Both ports reproduced #901 **exactly** as the canonical sink did: exit 0, `status:"sinked"`,
`steps.archive_commit:"done"`, `archived_paths` naming 3 of 8 files, and all five `.cache` evidence
files absent from HEAD, from the pushed remote and from a fresh clone. The premise report's inference
that `check-ignore` is forge-neutral is now a **measurement**, not an expectation.

---

## Files changed (2 — exactly my write set)

| file | insertions |
|---|---|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | +151 / −3 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | +151 / −3 |

`git diff --stat` over the two: **296 insertions, 6 deletions**. No other tracked file touched. No test
file touched. **No `module.exports` line touched in either port** — the canonical file adds no export,
so adding one here would have broken `FORGE_EXPORT_SUPERSET_FAMILY`
(`scripts/validate-script-sync.js:485-486`). Verified: `git diff | grep -c "module.exports"` = 0.

`node scripts/validate-script-sync.js` exits **0** and reports
`OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families
… and 6 forge export-superset families in sync.` My files are absent from its output (`grep sink-merge`
exit 1). Note this differs from what impl-901.md recorded: the sibling `closure-audit.js` drift it saw
has since been resolved, so the whole check is green rather than exit 1.

---

## Structural divergence from canonical — what I had to adapt

The two ports' `step === 'archive_commit'` regions were **byte-identical to each other** before my edit
(`diff` of gitlab:1846-1941 vs gitea:1839-1934 → exit 0), and remain so after. Relative to the
canonical sink the ports are a *condensed hand-port* — same seams, same order, different local names
and one-line `try/catch` formatting. Three adaptations, all naming, none behavioural:

| canonical | port | note |
|---|---|---|
| `projectPathspec` | `ps` | the archive pathspec; used for the `ignoredUntrackedUnder` scope |
| `excludeReceipt` / `excludeFallback` / `excludeLiveReceipt` / `excludeLiveFallback` | `exRcpt` / `exFb` / `exLiveRcpt` / `exLiveFb` | the #520 four-path journal exclusion, untouched |
| `archiveReceiptPath` | `archRcptPath` | the post-gate receipt relocation, untouched |
| `runSinkTransaction(rawArgs, …)` | `runSinkTransaction(args, …)` | the port has no `rawArgs`; my refusal reads `args.branch`, matching the #700 refusal directly above it |

Everything the canonical fix needed was already present in both ports: `fs`, `path`, `execFileSync`,
`GIT_MAX_BUFFER` (`:106`), `SINK_STAGE_SKIP`, `sinkLandStagedUnion`, `stagedPathsUnder`,
`persistArchivedPathsToSummary`, `writeSinkReceipt`, `receiptPath`, `sinkEmit`. **No function the
canonical fix modified was missing**, so this is a transplant, not a re-derivation.

**No forge-vocabulary substitution applies.** `docs/api.md:886-890` records the deliberate MR/PR noun
divergences (`unarchived_mr_folders`, `mr_url`/`mr_state`, lowercase state matching). The three new
fields — `archive_forced_paths`, `archive_missing_paths`, `archive_add_errors` — carry no PR/MR noun
and describe git-local facts, so the **identical** names in all three editions are correct.

**Zero new port-to-port divergence.** A normalized `diff` between the two ports (`gitlab`→`FORGE`,
`mr_`→`PR_` vs `gitea`→`FORGE`, `pr_`→`PR_`) was **193 lines before my edit and 193 lines after** — my
change is byte-identical in both files.

---

## Functions changed, with line refs (post-edit)

Line numbers differ by exactly 7 between the ports (gitea is 7 lines shorter above the region).

| change | gitlab | gitea |
|---|---|---|
| `requiredArchiveFiles(mainRoot, archiveRel)` — new module helper, after `sinkLandStagedUnion` | :1370-1386 | :1363-1379 |
| `ignoredUntrackedUnder(mainRoot, pathspec)` — new module helper | :1395-1401 | :1388-1394 |
| `blobPathsUnder(mainRoot, commitish, pathspec)` — new module helper | :1406-1412 | :1399-1405 |
| **seam 1** — per-FILE ignore probe beside the existing dir probe; `requiredPaths` + `forcePaths` | :1956-1961 | :1949-1954 |
| **seam 2** — `stageArchive()` replaces the first `catch (_) {}`; both add statuses **returned** | :1971-1983 | :1964-1976 |
| `receipt.archive_forced_paths` + the stderr NOTE naming every force-added path | :1984-1993 | :1977-1986 |
| **seam 3** — the second staging site calls `stageArchive()` too, so `archived_paths` (computed between them) names the forced files | :2003 | :1996 |
| **seam 4** — `missingBlobs`, measured unconditionally against `ls-tree -r` blobs at HEAD | :2024-2029 | :2017-2022 |
| the #832 declined arm — unchanged decision, warning now names the uncommitted count; receipt itemizes every missing file | :2037-2047 | :2030-2040 |
| **new refusal** — `!archiveIgnored && missingBlobs.length` → `archive_commit:'failed'`, `sinkEmit({result:'refuse', reason:'sink_incomplete', step:'archive_commit', …}, 1)`, returned **before teardown** | :2065-2084 | :2058-2077 |

The pre-existing dir probe, the #520 exclusion, the #893 `archived_paths` derivation, the #521
commit-side exclude, the #700 `archiveAtHead` tree test and its refusal are all **unchanged**; the new
gate is added after #700's, never in place of it.

---

## Evidence

All exit codes read with `echo $?` **directly on the command**, or from `spawnSync().status` in the
drivers. Never through a pipe; never `${PIPESTATUS[0]}`.

Drivers and logs:
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/impl901ports/`
- `drive-port.js` — keep-worktree posture, 4 legs (`ignored`/`control`/`band`/`armed`), adapted from
  `impl901/drive.js` with `KW_SINK_SCRIPT` and `KW_FORGE` parametrized.
- `drive-port-sole.js` — sole-archiver posture, 2 legs, adapted from `impl901/drive-sole.js`.
- Logs: `BEFORE-{gitlab,gitea}.log`, `AFTER-{gitlab,gitea}.log`,
  `BEFORE-armed-{gitlab,gitea}.log`, `AFTER-armed-{gitlab,gitea}.log`,
  `BEFORE-sole-{gitlab,gitea}.log`, `AFTER-sole-{gitlab,gitea}.log`, plus the suite logs.

**BEFORE is the main root at `9b68b096`**, whose two port files are byte-identical to the worktree's
pre-edit copies (`cmp` exit 0 for both, and `git status --porcelain` on the two was empty before I
started). That also isolates my before-measurement from the sibling agents' in-flight edits to the
forge `claim.js` / `closure-audit.js` copies in the worktree.

The forge CLI is mocked per port (`KAOLA_GLAB_MOCK_SCRIPT` / `KAOLA_TEA_MOCK_SCRIPT`) with the stateful
protocol the ports' own suites use (`test-gitlab-sinks.js:1270-1277`,
`test-gitea-sinks.js:512-521`) — `issue(s) view` reports open until a matching `issue(s) close` has
been logged, so the post-close probe buckets a real close as closed.

**POSITIVE CONTROL on the environment:** `KAOLA_WORKFLOW_OFFLINE` is passed to the sink as `'0'`
**explicitly**, not inherited — the offline flag is not silently disabling the staging under test. Every
leg prints this. A real bare remote is used and every leg re-clones it.

### A. The measured defect, before and after — keep-worktree posture

`.gitignore` body is the only axis. Identical numbers for both ports.

| leg | `.gitignore` | | exit | `status` | `steps.archive_commit` | `.cache` blobs missing at HEAD | missing from a FRESH CLONE | missing from `archived_paths` |
|---|---|---|---|---|---|---|---|---|
| IGNORED | `.cache/` | **before** | 0 | `sinked` | `done` | **5** | **5** | **5** |
| IGNORED | `.cache/` | **after** | 0 | `sinked` | `done` | **0** | **0** | **0** |
| CONTROL | `node_modules/` | before | 0 | `sinked` | `done` | 0 | 0 | 0 |
| CONTROL | `node_modules/` | after | 0 | `sinked` | `done` | 0 | 0 | 0 |
| BAND (#832) | `kaola-workflow/archive/` | before | 0 | `sinked` | `done` (`archive_commit:"skipped_gitignored"`) | 5 | 5 | 5 |
| BAND (#832) | `kaola-workflow/archive/` | after | 0 | `sinked` | `done` (`archive_commit:"skipped_gitignored"`) | 5 | 5 | 5 |

Per-file ignore granularity, measured in-fixture on both ports:
`check-ignore -v` on the archive **directory** exits **1** under `.cache/` (hence the old blind
`archiveIgnored=false`) and **0** under `kaola-workflow/archive/` (hence the band probe still decides
#832 correctly). `check-ignore -v` on `<archive>/.cache/final-validation.md` exits **0** under
`.cache/`, reporting `.gitignore:1:.cache/`.

The archive commit itself went from **3 files changed** to **8 files changed** in both ports
(gitlab `1123944`, gitea `92702d0`):

```
 .../archive/issue-330/.cache/doc-docking.md        |  3 +++
 .../archive/issue-330/.cache/doc-updater.md        |  3 +++
 .../archive/issue-330/.cache/final-validation.md   |  3 +++
 .../archive/issue-330/.cache/run-gaps-manual.md    |  3 +++
 .../archive/issue-330/.cache/run-gaps.json         |  1 +
 .../archive/issue-330/finalization-summary.md      | 19 +++++++++++++++++++
 kaola-workflow/archive/issue-330/mission-list.md   |  4 ++++
 kaola-workflow/archive/issue-330/workflow-state.md | 22 ++++++++++++++++++++++
 8 files changed, 58 insertions(+)
```

`receipt.archive_forced_paths` names exactly the five, in both ports, and the stderr NOTE names them.
A fresh `git clone` of the pushed bare remote now carries all five.

**#832 preserved**: the BAND leg's decision is byte-for-byte the same before and after —
`skipped_gitignored`, exit 0, archive retained on disk, `archive_forced_paths` **undefined** (the
force-add is declined, as designed). The only change is that its receipt now itemizes the 8
uncommitted required files in `archive_missing_paths`.

### B. Sole-archiver posture (`receipt.archive_dest` SET, so the #700 guard is live)

| leg | | exit | `status` | `archive_dest` | `.cache` blobs at HEAD | `archived_paths` | `archive_forced_paths` |
|---|---|---|---|---|---|---|---|
| IGNORED | before | 0 | `sinked` | set | **0** | 3 | — |
| IGNORED | after | 0 | `sinked` | set | **5** | **8** | the 5 |
| CONTROL | before | 1 | — (`refuse`, `sink_blocked`) | — | 0 | 0 | — |
| CONTROL | after | 1 | — (`refuse`, `sink_blocked`) | — | 0 | 0 | — |

Identical for both ports. The CONTROL leg's `sink_blocked`/`foreign_dirt` refusal is **unchanged before
and after** — the premise report already identified it as an artifact of the hand-built fixture (with no
`.cache/` rule those untracked live files are visible to preflight and classified bucket-3), not a
finding. The keep-worktree CONTROL (section A) is the leg that isolates the axis cleanly.

### C. Positive control — the blob gate is ARMED in each port, not merely green

Same fixture as the IGNORED leg with **one axis** changed: `.cache/run-gaps.json` is mode `000`, so no
`git add` (forced or not) can index it. Axis verified in-run: `cat <file>` exit **1**.

| | shipped port | fixed port | (identical for gitlab and gitea) |
|---|---|---|---|
| exit | **0** | **1** | |
| `result` | `"ok"` | `"refuse"` | |
| `reason` | — | `"sink_incomplete"` | |
| `step` | — | `"archive_commit"` | |
| `status` | `"sinked"` | absent | |
| `steps.archive_commit` | `"done"` | absent (left NOT done → resumable) | |
| `archive_missing_paths` | absent | all 5 `.cache` paths | |
| `archive_add_errors` | absent | present | |

The shipped port reports success over a file it demonstrably could not commit; the fixed port refuses
and names it. The captured `archive_add_errors` contains exactly the signal `catch (_) {}` discarded —
**both** entries, the ordinary add and the forced add:

```
git add: Command failed: git -C <root> add -- kaola-workflow/archive/issue-330/ … :(exclude)…
The following paths are ignored by one of your .gitignore files:
kaola-workflow/archive/issue-330/.cache
hint: Use -f if you really want to add them.
…
git add -f: Command failed: git -C <root> add -f -- kaola-workflow/archive/issue-330/.cache/doc-d…
```

**Retention proven**, both ports: `git rev-parse --verify workflow/issue-330` exit **0** (the branch was
retained — contrast the happy legs, where teardown removes it and the same probe exits 128), and the
on-disk archive still holds all five `.cache` files plus the run-record trio. The recoverable source is
not what this refusal destroys.

### D. #520 non-regression under the new force-add

The force-add is the one new way a transaction journal could leak into a commit. On the forced IGNORED
leg, in both ports: `git ls-files | grep -E "sink-(receipt|fallback)\.json"` exits **1** — no journal is
tracked — while 13 paths are. `archive_forced_paths` names the five evidence files and no journal.

---

## Suites run (real exit codes)

BEFORE = the main root at `9b68b096` (shipped ports). AFTER = this worktree.

| suite | before | after |
|---|---|---|
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | **0** | **0** |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | **0** | **0** |
| `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | **0** | **0** |
| `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` | **0** | **0** |
| `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js` | not run | **0** |
| `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js` | not run | **0** |
| `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | not run | **0** |
| `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | not run | **0** |
| `node scripts/simulate-workflow-walkthrough.js` (**FULL scope, not a shard**) | not run | **0** — `{"index":1,"total":1,"scenarios":184,"ran":184,"passed":184,"failed":0}`, 1958 spawns |
| `node scripts/validate-script-sync.js` | **0** | **0** — my files absent from its output |
| `node scripts/edition-sync.js --check` | not run | **0** |
| `node scripts/test-spawn-classification.js` | not run | **0** — 591 sites / 60 files, 136 slots of slack |
| `node --check` both ports | — | **0** / **0** |

The four forge walkthroughs each run their edition's sink suite internally
(`simulate-gitlab-workflow-walkthrough.js:754`, `simulate-gitea-workflow-walkthrough.js:841`, and the
two codex variants at `:140`), so `test-{gitlab,gitea}-sinks.js` is covered twice per edition.

**Caveat on the "after" column:** the worktree also carries sibling agents' uncommitted edits to
`kaola-workflow-claim.js`, `kaola-workflow-closure-audit.js`, `kaola-workflow-adaptive-schema.js` and
`kaola-workflow-validation-runner.js` (canonical + all three plugin copies). A green run there is green
*including* their changes; it is not an isolation of mine. My isolation evidence is sections A–D, where
the axis is the sink script path only.

---

## Where a test is needed (for `tdd-guide` — I did not author one)

The premise report's two reasons no existing test can catch this shape hold in the forge editions too:
every `.gitignore` fixture in `test-{gitlab,gitea}-sinks.js` and both forge walkthroughs writes
`kaola-workflow/archive/`, an anchored `/.cache/`, or ignores the whole `kaola-workflow/` tree; and no
forge test asserts that archived `.cache` files became git **blobs**.

The five pins impl-901.md asks for are all needed **per forge edition**, in
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` and
`plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`, with the two structural notes below:

1. The IGNORED scenario asserting on **`git ls-tree -r`**, not `fs.existsSync` — without the `ls-tree`
   assertion the test passes against the shipped bug, which is what hid #901 in all three editions.
2. The armed-gate pin (`chmod 000` on one required file → `result:"refuse"`, `reason:"sink_incomplete"`,
   `step:"archive_commit"`, `archive_missing_paths` naming it, `steps.archive_commit` NOT `done`, branch
   still resolvable). This is the only pin that distinguishes the gate from a no-op.
3. #832 non-regression sharpened: BAND must still yield `skipped_gitignored` **and must NOT force-add**
   (`archive_forced_paths` undefined).
4. `archive_forced_paths` must never name a #520 journal; `git ls-files` must still show
   `sink-receipt.json` untracked after a forced run.
5. **Structural note for whoever writes these:** each edition's suite defends its own copy — there is no
   cross-edition coverage comparison, so a canonical pin does not cover the ports. The forge suites need
   the forge CLI mock (`KAOLA_GLAB_MOCK_SCRIPT` / `KAOLA_TEA_MOCK_SCRIPT`) with the **stateful** view
   protocol, or the post-close probe mis-buckets the close; and `KAOLA_WORKFLOW_OFFLINE` must be set to
   `'0'` **explicitly**, since an inherited `'1'` disables the push/clone half of the durability check.
   Working fixtures for all four legs, both postures, both ports, are in `impl901ports/`.
6. The claim-side disposal-gate pin (impl-901.md's item 5) is **not** covered here — the forge `claim.js`
   ports are outside my write set and belong to another agent.

---

## Open / could not verify

- **The forge `claim.js` ports** (`kaola-gitlab-workflow-claim.js`, `kaola-gitea-workflow-claim.js`)
  carry the canonical fix's claim-side half — `classifyArchiveDisposition`'s dir probe, the
  `ignoredArchiveEvidence` NOTE and the `archiveProjectDir` disposal gate. Explicitly **not mine** per
  the brief; a sibling owns them. I did not measure them.
- **`docs/api.md` / `CHANGELOG.md` / `README.md`** — the three new output fields are user-visible and
  need documenting. Outside my write set; other agents own those surfaces. Worth confirming that whoever
  documents them notes the fields are **forge-neutral** (no MR/PR substitution), unlike the
  closure-audit contract at `docs/api.md:886-890`.
- **The opencode/kimi editions** were not examined — additive runtime editions, outside my two files.
- **I did not run `npm test`** (the four chains) or the fast gate. Chain selection belongs to the
  producer at finalize, and a chain run now would be stale the instant a sibling lands. I ran both forge
  editions' walkthroughs, contracts validators and sink suites directly instead, plus the canonical
  walkthrough at full scope.
- **The `archive_add_errors` message text is `execFileSync`'s** — it embeds the full argv and git's
  stderr. Verbose, but it appears only on the refusal envelope, and it is the diagnosis.
- **The new required-set walk includes every file the archive holds on disk.** If a future archive ever
  legitimately contains something git cannot turn into a blob under that path (symlinks and nested
  `.git/` are already excluded for exactly this reason), the new gate would refuse. I found no such case
  in either forge corpus and all the suites are green, but it is the one place my change could produce a
  refusal the old code did not — the same caveat the canonical implementer recorded.
- **git's own "The following paths are ignored…" advice still prints twice** on the IGNORED leg, in both
  ports, immediately followed by our accurate NOTE naming what was force-added. Not suppressed, matching
  canonical: `-c advice.addIgnoredFile=false` also flips the exit to 0 on this git (2.50.1), and the fix
  must not depend on advice config coupling to exit status.

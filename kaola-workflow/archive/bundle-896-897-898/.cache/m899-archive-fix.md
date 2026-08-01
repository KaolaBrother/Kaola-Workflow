# m899 — the swallowed archive failure

## THE FIX

**What it keys on: what `archiveProjectDir` SAID it did, never the presence of a destination.**

The finalize step now carries one variable, `archiveFailure`, set from two places and read once:

1. **The catch arm.** `TypeError` / `ReferenceError` still rethrow, untouched (#555 export drift).
   Everything else — the class that used to be dropped on the floor — is now recorded as
   `{ reason: 'archive_exception', detail: <error.message> }` instead of swallowed.
2. **A positive confirmation after the call returns.** `archived === true` is the only report that an
   archive happened; `skipped === 'source-missing'` is the only report that none was required.
   Anything else sets `archiveFailure` with the returned `reason` (or `archive_not_performed`).

After the try/catch, a set `archiveFailure` writes `receipt.archive_refusal`, persists the journal,
emits `{ result: 'refuse', reason: 'sink_incomplete', step: 'finalize', archive_refusal, detail }`
at exit 1, and returns **before** `stepDone('finalize')` — so `push_main` and `closure` never run and
the step stays retryable. The dest block is additionally gated on `!archiveFailure`, so
`persistSinkClosureMetadata` can never write terminal closure metadata into an archive that failed.

### Why this distinguishes failure from the two legitimate no-dest cases

`receipt.archive_dest` is unset in **three** situations, and only one is a failure. The discriminator
cannot be the dest, because:

- **(a) keep-worktree** — the branch already archived and committed, so `archiveProjectDir` returns
  `{ skipped: 'source-missing' }`. `nothingToArchive` is true → no failure. No dest by design.
- **(b) nothing to archive** — no live folder at all; same `{ skipped: 'source-missing' }` return,
  same handling. Pinned by test `(x2)` at `test-sink-merge.js:2493`, still green.
- **(c) the defect** — an EACCES throw out of `fs.renameSync` / `copyDir`. There is no return value
  at all, so neither `archived` nor `skipped` is present → failure.

The three shapes are indistinguishable by their *receipt*, and completely distinguishable by their
*return*. That is the whole fix.

Two more shapes were checked against the same rule and behave correctly:

- **(#832) the `.gitignore`-covered archive** returns `archived: true` with a dest. The finalize step
  passes it straight through; `archive_commit` still records `archive_commit: 'skipped_gitignored'`
  exactly as before. `#832 q` and `#893 w10` stay green.
- **(#746) `archive_incomplete`** returns before my check runs, on its own pre-existing refusal path.
  Untouched.

- **(#555) export drift** — the rethrow arm is byte-for-byte the same condition it always was; the
  new code sits strictly *after* it. `(x3)` at `test-sink-merge.js:2540` stays green, including its
  undoctored-mirror control.

## FOUR EDITIONS

Ported by meaning, not by offset. Each edition's own comment density was matched (the forge ports
condense the finalize step and inline their catch; the canonical copy is verbose).

| file | change |
|---|---|
| `scripts/kaola-workflow-sink-merge.js` | canonical. `let archiveFailure = null;` before the try; the positive confirmation after the `archive_incomplete` branch; `!archiveFailure &&` added to the dest guard; the catch's non-programmer arm records instead of swallowing; the stop block before `persistSinkFindingsToSummary` / `stepDone('finalize')`. |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | byte mirror of the canonical (confirmed identical to `HEAD:scripts/…` before the edit); copied over wholesale so it stays byte-identical. |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | same four insertions, condensed comments. Its one-line `} catch (e) { … }` was expanded to a block to hold the record. `require('./kaola-gitlab-workflow-claim')`. |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | same as gitlab, at its own offsets. `require('./kaola-gitea-workflow-claim')`. |

`validate-script-sync.js` classifies this file as a **forge export-superset** family (not a byte
mirror across forges), and the github plugin copy as a byte-identical group with the canonical — both
constraints hold after the port.

No test file was written, edited, or read-for-repair. `scripts/kaola-workflow-claim.js` was read only.

## ORACLE RESULT

All exit codes captured with `$?` directly, never through a pipe.

| # | command | exit | result |
|---|---|---|---|
| 1 | `node scripts/test-sink-merge.js` | **0** | `test suite passed: 283 assertions` (baseline before the fix: exit 1, `8 failed, 274 passed`) |
| 2 | `node scripts/validate-script-sync.js` | **0** | `15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families, 6 forge export-superset families in sync` + `committed kernel parity: 4 Oracle Kernel copies identical at HEAD` |
| 3 | `node scripts/test-finalize-door.js` | **0** | `finalize-door tests passed (156 assertions)` — including `T6: an archive that drops a file refuses` |
| 4 | reproduction rebuilt from scratch | see below | the defect is closed |
| + | `node scripts/simulate-workflow-walkthrough.js` | **0** | `184 scenarios, ran 184, passed 184, failed 0` — **FULL scope**, `index 1 / total 1`, not a shard. Run unasked because CLAUDE.md mandates it for workflow changes and the walkthrough drives the sink in ~155 places. Includes `testSinkTransactionCleanEndToEnd`, `testSinkTransactionCrashResume` and `testArchiveCallersFailClosed699`. |

`node --check` on all four copies: clean.

### 4 — the `chmod 555` reproduction, rebuilt independently

Script: `<scratch>/m899/repro.js` (written from scratch; it does not `require` the suite). It builds a
sole-archiver fixture, `chmod 555`s `kaola-workflow/archive`, proves the directory is genuinely
unwritable, and drives the sink twice on two identical fixtures — once against a scratch mirror of
`scripts/` carrying the **pre-fix** sink read from `HEAD`, once against the shipped worktree copy.

| observable | BEFORE (pre-fix, from `HEAD`) | AFTER (shipped) |
|---|---|---|
| exit code | `0` | `1` |
| envelope status / reason | `"sinked"` | `"sink_incomplete"` |
| `archive_refusal` | `undefined` | `"archive_exception"` |
| detail | *(none)* | `archiving kaola-workflow/issue-77002/ did not happen (archive_exception): EACCES: permission denied, rename …` |
| `origin/main` advanced | **true** | **false** |
| live run files on `origin/main` | `["workflow-state.md","mission-list.md"]` | `[]` |
| gh calls | `["close:77001","label-removed:77001"]` | `[]` |
| journal survived / finalize step | `false` / `null` | `true` / `"pending"` |

One divergence from the reported symptom list, stated for accuracy: in *my* fixture the pre-fix run
left main **clean**, not dirty — because it committed and pushed the live run folder rather than
leaving it uncommitted. The harm is the same and worse in kind (the run record was published); the
dirty-tree symptom just depends on fixture shape.

The AFTER run leaves main dirty with the live project folder (`workflow-state.md` terminal-stamped,
`.cache/` journal). That is the intended resumable residue and matches what the pre-existing
`archive_incomplete` refusal leaves: the live folder is deliberately not deleted so a re-run retries.

## FORCE_ARCHIVE_REFUSAL

**Closed**, deliberately, and proven by measurement rather than by reading the code.

`KAOLA_WORKFLOW_FORCE_ARCHIVE_REFUSAL=1` reaches false success by a *return*
(`claim.js:2405` → `{ archived: false, reason: 'archive_forced_refusal' }`), not a throw, so a fix
written at the catch alone would have left it open. The positive confirmation catches it because
`archived !== true` and `skipped !== 'source-missing'`.

Proven with `<scratch>/m899/repro-forced.js` — same two-fixture before/after harness, no `chmod`,
the env var set instead:

| observable | BEFORE | AFTER |
|---|---|---|
| exit code | `0` | `1` |
| envelope status / reason | `"sinked"` | `"sink_incomplete"` |
| `archive_refusal` | `undefined` | `"archive_forced_refusal"` |
| `origin/main` advanced | **true** | **false** |
| live run files on `origin/main` | `["workflow-state.md","mission-list.md"]` | `[]` |
| gh calls | `["close:78001","label-removed:78001"]` | `[]` |

No test in any suite depended on the sink succeeding under that env var: the only two consumers are
`simulate-workflow-walkthrough.js:9746` and `:9779`, and both drive `claim.js` (`finalize`, `release`,
`watch-pr`) — never the sink. `claim.js` was not edited.

## ANYTHING NOT DELIVERED

- **`CHANGELOG.md` / `docs/api.md` / `README.md` were not touched.** This is a user-visible behaviour
  change (a new `archive_refusal` value and a new stop shape at `step: finalize`) and CLAUDE.md asks
  for a `[Unreleased]` entry and an API-doc line. Both files are explicitly owned by other agents in
  this worktree (`docs/api.md` is already modified by one), so writing them would have collided. The
  entries are **owed** — orchestrator to route.
- **`npm test` / the four chains were not run.** Out of the assigned scope, and this worktree
  currently carries several other agents' uncommitted edits, so a chain result would not be
  attributable to this change. (The walkthrough — the heaviest single member — was run at full
  scope and is green.)
- **Nothing was committed**, per the brief.

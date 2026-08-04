# Finalization — Summary: issue-932

Issue: **#932** — *claim: the reclaim rollback rm -rf's a reserved directory, destroying the backlog
on a mid-claim throw*. Branch `workflow/issue-932`, implementation commit `652c2d5b`.

## Delivered

The issue's demanded result, verbatim: **a failed claim must not delete anything the claim did not
create.**

The claim's `fs.mkdirSync(dir)` is non-recursive, and its `EEXIST` arm **adopts** any directory
carrying no `workflow-state.md` — the orphaned-stateless-dir reclaim. The rollback was an unscoped
`fs.rmSync(dir, { recursive: true, force: true })` over that whole adopted tree, so a throw between
adoption and the completed write destroyed a directory the claim had merely found.

The teardown is now scoped by the `EEXIST` signal the mkdir already produces. A directory this claim
**created** is still removed whole; an adopted one gives back only the transaction's own two
artifacts — the selection record and `workflow-state.md` — and only whichever of them was not
already on disk, pruning parent directories only where the transaction created them and left them
empty. Two file-local helpers, `probeAdoptedDir` and `rollbackAdoptedDir`, beside
`persistSelectionRecord`.

Fixed at **both** sites. The issue cited only the scalar lane; `claimBundle` carried the same defect
at its step (c), under a comment that already read *"Remove project dir if created"* while
`applied.dir = true` recorded arrival rather than creation.

**Reproduced before it was built on.** Destroyed `kaola-workflow/.roadmap/` and its sources through
the shipped CLI, with a negative control (same fault, same rollback, a *created* directory — nothing
uncreated touched) establishing that adoption, not the fault, caused the loss. Evidence:
`.cache/repro-932.md`.

### Three corrections to the issue, all measured

1. **The validator it cites does not exist.** `adaptive-schema.js:400-430` is `isParkedLanePath`, a
   clean-check ignore predicate, not a name gate. The only filter on the claim path is `isSafeName`
   (path safety); `isReservedWorkflowDirName` exists but had exactly one call site, in
   `archiveProjectDir`.
2. **The second site is `claimBundle`**, not `claimExplicitBundle` (its validating wrapper, whose
   hardcoded `'bundle-' + targets.join('-')` makes the reserved-name variant unreachable there).
3. **The framing was too narrow, and this changed the fix.** An **ordinary** project name loses data
   identically: a plain `kaola-workflow/issue-777/` left stateless by the very crash the reclaim
   exists to recover — or by a human staging notes — is adopted and deleted whole. A reserved-name
   refusal, the shape #930 used on the archive side, would have closed the filed symptom and left
   the defect standing. Scoping created-vs-adopted is also the *smaller* change: no name list, no
   new refusal.

Blast radius also included the `archive/` band, which the issue did not mention.

## Files Changed

| file | + / − | what |
|---|---|---|
| `scripts/kaola-workflow-claim.js` | +82/−3 | canonical fix, both sites |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | +82/−3 | byte-identical copy (`diff -q` clean, 386986 bytes each) |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | +82/−3 | hand-port |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | +82/−3 | hand-port |
| `scripts/simulate-workflow-walkthrough.js` | +258 | two scenarios + two header corrections |
| `scripts/test-bundle-claim.js` | +120 | bundle-lane scenario |
| `scripts/test-forge-claim-rollback-scoping.js` | +379 (new) | per-edition suite |
| `package.json` | +10/−5 | wiring, 5 chain entries |
| `CHANGELOG.md` | +44 | `[Unreleased]` entry |

The three divergent copies changed 44 code-only lines each, **sorted-identical** across all three —
only line order differs, which is what a faithful hand-port of one change looks like.

## Test Coverage

Authored under separate custody (`tdd-guide`); the implementer read and ran them but wrote none.

- `testClaimNeverDeletesWhatItDidNotCreate932` — scalar lane, reserved (`.roadmap`) **and** ordinary
  (`issue-9322`) names.
- `testClaimRollbackRemovesOnlyWhatItCreated932` — created-vs-adopted with one variable; the created
  leg is the **negative control** (a created folder must still be removed) and doubles as the
  adopted leg's liveness witness.
- `Test (8d)/#932` in `test-bundle-claim.js` — bundle lane. Pre-existing Test (8) is that lane's
  created-side control, so it was not duplicated.
- `test-forge-claim-rollback-scoping.js` — 4 editions × 4 legs, 120 assertions, each driving its own
  edition's CLI. Covers the branch no other test reaches (the record actually written into an
  adopted folder, then taken back out with its dirs pruned) and its sharper twin (a record
  *predating* the claim survives — created-vs-adopted at file rather than folder granularity).

**Mutation-proven, one site and one edition at a time.** Reverting site 1 reds only the walkthrough
scenarios; reverting site 2 reds only the bundle suite; each edition's mutant reds only its own
edition's assertions (25 failed / 95 passed, four times over). Neither site covers for the other, and
the negative controls stayed green throughout — confirming a scoping, not a stop-deleting.

**A vacuous fixture was caught by that proof, not by review.** The first draft of two forge legs was
built on `--branch` with a newline, but `assertSafeBranchArg` rejects newlines at the front door
before the mkdir, so the claim refused with zero mutation and the folders survived for a reason
unrelated to the rollback. The signature was two legs reding under *no* mutant while the others reded
under every one. Rebuilt on a fault that fires after the record write and A/B'd against a reverted
tree; that A/B is now written into the suite header as a standing rule.

Test-tier finding worth carrying forward: `test-claim-hardening.js`, the file that *looks* like the
home for this, runs only in `test:kaola-workflow:claude:full` and never in the mandated fast gate — a
red test placed there would have been invisible to `npm test` and to the four-chain receipt.

## Validation

Four chains **GREEN** at `652c2d5be3fdfd066eaec76980d5a3946743c762`, receipt at
`.cache/chain-receipt.json`, transcript at `.cache/chains.log`. Read per chain off the receipt rather
than off the wrapper's compound status — exit 0, `signal: null` (not killed), `timed_out: false`,
`accepted_red: false` (nothing waived), `attempts: 1`:

| chain | duration |
|---|---|
| claude | 365s |
| codex | 9s |
| gitlab | 94s |
| gitea | 91s |

Run **serial** (`KAOLA_RUN_CHAINS_CONCURRENCY=serial`) so no chain's result could be confounded by a
sibling mutating the same worktree. `scope.decision: no_narrowing` — all four actually ran.
`receipt.headSha == HEAD` exactly, working tree clean at run time.

Then the gap a green chain cannot close: the claude chain samples the walkthrough at
`--shard auto/12`, so green means *the slice that came up passed*. Ran it unsharded against the same
commit — `scenarios: 205, ran: 205, passed: 205, failed: 0`, exit 0, log at
`.cache/walkthrough-full.log`.

## Changed Paths

Reported by the finalize transaction. As checked pre-transaction: `package.json`, the four claim
copies, `simulate-workflow-walkthrough.js`, `test-bundle-claim.js`,
`test-forge-claim-rollback-scoping.js`; `dirty_paths` empty.

## Documentation Docking

**DOCKED** — `.cache/doc-docking.md`. `CHANGELOG.md` updated under a new `[Unreleased]`; `README.md`,
`docs/api.md`, `docs/architecture.md`, `docs/workflow-state-contract.md`, `docs/decisions/` and
`.env.example` each carry an explicit no-impact reason, verified against source and live command
output rather than assumed. Done inline rather than via `doc-updater`, for the reason stated in that
file.

## Run gaps

- manual:claim-adopts-reserved-dir (the claim ADOPTS a reserved directory and SUCCEEDS at exit 0): filed: #933

## Follow-Up Items

- **#933** (OPEN, verified) — adopting a reserved directory still **succeeds**, at exit 0, writing
  run state into the backlog or archive band with nothing deleted and nothing reported. Separate from
  this fix: no deletion occurs, so scoping the rollback does not address it. Closing it requires a
  claim-site refusal, and whether the claim *should* refuse is a value call — the owner ruled on
  2026-08-04 to fix the rollback here and file this separately, and the issue body says so explicitly
  so whoever picks it up asks rather than assumes.
- **Recorded, not built** — a selection record already in an adopted folder survives but is
  **overwritten** with the new run's bytes. Measured independent of this fix (a *succeeding* claim
  over the same fixture leaves identical bytes), so it is `persistSelectionRecord`'s unconditional
  "the record is the authority" write. #932 demands not-deleted, not not-overwritten; restoring prior
  bytes would need a content-snapshot mechanism nothing has asked for.
- **Checked and dismissed, so nobody re-files it** — a report that `claim.js:369-374` misattributes
  newline rejection to `isSafeBranchArg` does not hold: that comment sits above `assertSafeBranchArg`
  and describes it accurately (line 380 calls `assertNoNewline`), and the `isSafeBranchArg` comment
  above claims only `-` and NUL.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-932/.cache/chain-receipt.json
- kaola-workflow/archive/issue-932/.cache/chains.log
- kaola-workflow/archive/issue-932/.cache/dispatch-log.jsonl
- kaola-workflow/archive/issue-932/.cache/doc-docking.md
- kaola-workflow/archive/issue-932/.cache/impl-932.md
- kaola-workflow/archive/issue-932/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-932/.cache/repro-932.md
- kaola-workflow/archive/issue-932/.cache/run-gaps-manual.md
- kaola-workflow/archive/issue-932/.cache/run-gaps.json
- kaola-workflow/archive/issue-932/.cache/tests-932.md
- kaola-workflow/archive/issue-932/.cache/walkthrough-full.log
- kaola-workflow/archive/issue-932/finalization-summary.md
- kaola-workflow/archive/issue-932/mission-list.md
- kaola-workflow/archive/issue-932/workflow-state.md

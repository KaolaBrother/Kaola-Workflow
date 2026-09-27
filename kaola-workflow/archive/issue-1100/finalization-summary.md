# Finalization - Summary: issue-1100

## Delivered

The stale-worktree sweep's LANE arm now carries the same sink-resumability pin the integration arm
has had since 57fc4c67, closing the follow-up #1100 found in #1097's repair round.

`collectStale`'s lane arm (`for (const wt of registeredWorktrees)`, the `.kw/worktrees/<branch>`
worktrees) classified on `(isClosed || isArchived) && !inActiveSet` — the identical rule the
integration arm used — with no resumability guard of its own. Because `readActiveFolders` drops a
CLOSED issue's folder on its default path, the active-set guard protects nothing in the window after
an issue closes and before the run finishes with its lane worktree, so an operator-run
`stale-worktree-cleanup --execute` could classify a live run's own checkout stale and remove it.

Rather than duplicating the integration arm's receipt loop, the guard was extracted into one private
helper, `sinkReceiptResumable(root, projectName)`, now called by BOTH arms — so the two
classifications cannot drift, and the integration arm's behavior is byte-for-byte unchanged. A lane
or integration worktree is never stale while its project holds a `sink-receipt.json` (live
`kaola-workflow/<project>/.cache/` first, then `kaola-workflow/archive/<project>/.cache/` once
closure moved the folder) whose `steps` are not all `done`. A missing receipt (pre-receipt legacy
leftover) or an all-done one (a completed run's leftover) sweeps exactly as before — the pin is
receipt-driven, never a blanket exemption.

Ported identically to all four claim copies (root, Codex, GitLab, Gitea).

## Files Changed

9 files (+421/-48 vs the claim baseline `46fbe12d`): `scripts/kaola-workflow-claim.js`,
`plugins/kaola-workflow/scripts/kaola-workflow-claim.js`,
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`,
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`,
`scripts/test-claim-hardening.js`,
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`,
`plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`, `CHANGELOG.md`, `docs/api.md`.

Three commits on `workflow/issue-1100`, all authored `KaolaBrother <yanleichen@hotmail.com>`:
- `83209934` test(#1100): RED lane-arm stale-sweep cases
- `26710cea` fix(#1100): pin the LANE worktree arm with the sink-resumability guard
- `66a077d7` test(#1100): assert the pinned lane worktree's BRANCH survives, not a report field that
  does not exist

## Test Coverage

Hand-rolled assert suites (no coverage tooling). New behavioral sub-cases in all three suites, each
in two halves — the pin holds, and the unpinned paths sweep as before:

- `scripts/test-claim-hardening.js`: a CLOSED issue + a mid-flight receipt must leave the clean lane
  worktree registered and its branch undeleted; the same fixture with an all-done receipt must sweep
  it; a second fixture with NO receipt at all must sweep it.
- gitlab/gitea `workflow-scripts`: `sc2c` (mid-flight receipt pins, all-done sweeps) and `sc2d`
  (no receipt sweeps).

## Test-First Evidence (RED before GREEN)

The RED commit is tests-only (it touches no production file). Reconstructed by checking the
corrected tests (`66a077d7`) over the production files at the claim baseline `46fbe12d`:

- `node scripts/test-claim-hardening.js` → exit 1, **4 genuine failures**: the pinned lane worktree
  was removed; its branch was deleted; the all-done fixture was NOT swept. (871 passed.)
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` → exit 1 (sc2c).
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` → exit 1 (sc2c).

After `26710cea`, the same three suites exit 0. No existing assertion was deleted, weakened, or
reinterpreted.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- CHANGELOG.md
- docs/api.md
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js
- scripts/kaola-workflow-claim.js
- scripts/test-claim-hardening.js

## Documentation Docking

DOCKED — `.cache/doc-docking.md`. `CHANGELOG.md` gained an `[Unreleased] → Fixed` entry;
`docs/api.md`'s `stale-worktree-check` section gained the resumability-pin paragraph (it previously
documented neither arm's pin). `README.md`, the ADRs, architecture docs, and the docs index were
checked and are no-impact with reasons recorded.

## Follow-Up Items

Two non-blocking review findings were filed, both verified against the code before filing and BOTH
pre-existing baseline gaps that this change inherited rather than introduced (the integration arm
has had the same shape since 57fc4c67):

- **filed: #1102** (bug, area:scripts, P3) — the pin derives its project name as `issue-<N>`, so a
  bundle/custom-named run (`bundle-1045`, `branch-issue-merge-sink`, …) is never pinned.
- **filed: #1103** (bug, area:scripts, P3) — the pin's two hard-coded receipt paths miss an
  `archive/issue-<N>.archived-<ts>/` collision-renamed folder, even though `isArchived` elsewhere in
  the same file already tolerates that suffix.

Both were confirmed OPEN with non-empty bodies and tiered labels.

## Ledger Accuracy Note

The run's mission ledger (`archive/issue-1100/mission-ledger.jsonl`) contains two known
inaccuracies in lines 1 and 3. Those lines are `done` and therefore immutable — they were
deliberately NOT edited, and this note is the correction:

- Line 3 states the net diff as `+427/-48`. The authoritative figure is **+421/-48** (mission 3's
  own `git diff --shortstat 46fbe12d HEAD` at final HEAD). The `+427` figure was written before the
  assertion-correction commit `66a077d7` was accounted for.
- Line 1 attributes the fourth RED failure imprecisely. The accurate statement is recorded under
  Test-First Evidence above: the four baseline failures were (a) the pinned lane worktree removed,
  (b) its branch deleted, (c) the all-done fixture not swept, and (d) the removed-list assertion for
  the pinned worktree. The fourth is the pinned-worktree `removed` assertion, not the all-done case.

Neither inaccuracy affects the delivered behavior, the validation receipt, or the RED/GREEN
evidence: both are prose about measurement, and the authoritative numbers and the reconstructed RED
run are stated above.

## Final Readiness Status

READY — all three missions done; four chains green at candidate `66a077d7`; both required headings
left empty for the finalize transaction; documentation docked; follow-ups filed. Issue #1100 closes
on the verified merge (merge sink), and the run folder archives to
`kaola-workflow/archive/issue-1100/`.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1100/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1100/.cache/doc-docking.md
- kaola-workflow/archive/issue-1100/.cache/final-validation.md
- kaola-workflow/archive/issue-1100/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1100/finalization-summary.md
- kaola-workflow/archive/issue-1100/mission-ledger.jsonl
- kaola-workflow/archive/issue-1100/workflow-state.md

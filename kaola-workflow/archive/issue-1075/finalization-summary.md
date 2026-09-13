# Finalization summary — issue-1075

Candidate: `250c1fd3968d94fe9ea03aa30673393b9b52a80c` on `workflow/issue-1075`
(rebased onto main `115cca57`; first validated as `c1496281` on `2b1af448`).

## Delivered

- `sinkPreflight` no longer refuses a sibling run's untracked live claim folder
  `kaola-workflow/<sibling>/…` as foreign dirt when the sibling is a verified co-active run of
  this main root. `coActiveSiblingProjects` certifies a folder only when its own
  `workflow-state.md` reads `status: active`, its `main_root` realpath-equals this checkout, and
  its `worktree_path` realpath resolves to a worktree registered in this repository
  (`git worktree list --porcelain`) checked out on the claim's own branch — never the main
  checkout, never this sink's project or branch, neither folder nor state file a symlink, and at
  most one folder per registered worktree. The arm matches a full path segment and is
  classification-only (`continue`); everything failing verification still refuses as bucket-3
  foreign dirt with zero mutation. Canonical script, byte-equal Codex mirror, and compact GitLab
  and Gitea ports.
- Restored the #893 own-archive "carried and byte-equal → exempt" content read, whose
  `archiveKey` variable had been removed in `3973af23` (the read always threw and every
  branch-carried path fell through to foreign dirt).
- Used in anger before merging: the validated candidate's sink script (run from this worktree
  against the main root) completed the previously blocked `bundle-1065-1066-1067` sink beside
  the live `issue-1072`, `issue-1073`, and `issue-1075` claim folders, which were classified
  and never touched (main `2b1af448..115cca57`, #1065/#1066/#1067 closed).

## Files Changed

7 files, +511/−2 (`git diff --stat main...HEAD`): `scripts/kaola-workflow-sink-merge.js`,
`plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`,
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`,
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`,
`scripts/test-sink-merge.js`, `CHANGELOG.md`, `docs/api.md`.

## Test Coverage

- `test-sink-merge.js` (#1075 a): a registered sibling worktree plus a real-shaped live claim
  folder → sink completes (`status: sinked`), sibling bytes byte-identical, worktree still
  registered.
- `test-sink-merge.js` (#1075 b): eight look-alikes in one fixture each named in `foreign_dirt`
  with porcelain byte-identical before/after — wrong `main_root`, unregistered `worktree_path`,
  branch mismatch, `status: closed`, symlinked folder, name-prefix look-alike beside a verified
  sibling, this sink's own branch, and two folders claiming one worktree.
- `test-sink-merge.js` (#893 w11): branch-carried byte-equal own-archive copy is absent from
  `foreign_dirt`; RED proof recorded with the one-token fix reverted (4 failures), GREEN after.
- Suite totals: 1102 assertions on the rebased candidate; `test-issue-1067-archive-identity.js`
  4 × 21 checks; `test-spawn-classification.js` unchanged site count.

Acceptance legs executed: automated only (chains, walkthrough, focused suites, the real
bundle sink above). No device, service, or UAT leg applies.

## Validation

verdict: pass
command: `node plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js --project issue-1075`
receipt: `kaola-workflow/issue-1075/.cache/chain-receipt.json` — `headSha` 250c1fd3,
`workTreeHash: clean`, scope `all-four`, preamble clean.
chains: claude (exit 0), codex (exit 0), gitlab (exit 0), gitea (exit 0).
walkthrough: `node scripts/simulate-workflow-walkthrough.js` — 178/178 at 250c1fd3.
also: `node scripts/test-sink-merge.js` — 1102 assertions, exit 0 at 250c1fd3.

## Changed Paths

Reported by `finalize --check` (`checks.changed_paths`, `dirty_paths: []`):

- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- `scripts/kaola-workflow-sink-merge.js`
- `scripts/test-sink-merge.js`

Documentation paths (`CHANGELOG.md`, `docs/api.md`) are listed under Files Changed.

## Documentation Docking

`.cache/doc-docking.md` — DOCKED at 250c1fd3.

## Follow-Up Items

None filed. Residual observed while writing #893 w11, recorded here rather than as a defect
claim: when the branch already carries a byte-equal copy of an own-archive file that is also
untracked at the main root, preflight now exempts it but the later `git checkout <branch>` in
the main checkout refuses to overwrite the untracked file. This shape does not arise from the
documented `finalize --keep-worktree` sequence (the linked worktree cannot stage the main-root
archive, so the branch never carries it) and was not observed in any run.

## Sink Findings

First `--sink` at 250c1fd3 refused `sink_blocked` over `kaola-workflow/archive/issue-1072/…`: a
sibling run its own session had already finalized (`--keep-worktree`, archive untracked at the
main root, worktree still registered) and left waiting for its sink. On owner direction this is a
scheduling-order matter, not a product gap: the idle `issue-1072` archive was preserved outside
the repository (manifest with original paths and sha256 of every file, fresh destination), this
sink ran, and the archive was restored byte-identically before its own sink.

## Closure decision

Close #1075. No release or version bump is part of this run.

## Readiness

Both missions done; validation receipt green and bound to the frozen candidate; documentation
docked. Ready for the finalize transaction, merge sink, and closure audit.

archived_paths:
- kaola-workflow/archive/issue-1075/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1075/.cache/doc-docking.md
- kaola-workflow/archive/issue-1075/.cache/mirror-digest.json
- kaola-workflow/archive/issue-1075/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1075/finalization-summary.md
- kaola-workflow/archive/issue-1075/mission-list.md
- kaola-workflow/archive/issue-1075/workflow-state.md

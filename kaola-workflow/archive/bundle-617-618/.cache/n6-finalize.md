evidence-binding: n6-finalize 44ca5a2952dc

# Finalize documentation pass — bundle-617-618 (issues #617, #618)

verdict: pass

## Grounding

- Read the full landed diff (`git diff 866421aa HEAD -- scripts/kaola-workflow-sink-merge.js
  scripts/kaola-workflow-claim.js scripts/kaola-workflow-run-chains.js
  scripts/kaola-workflow-plan-validator.js package.json`) and `docs/decisions/D-617-01.md`
  (already written by a prior node — not duplicated here).
- Confirmed `docs/workflow-state-contract.md` was already updated by a prior node
  (`remote_closed_after_publish: "verified" | "failed"` line present at line 220) — not touched
  by this node.

## What actually landed (verified against the diff)

- #617 (`kaola-workflow-sink-merge.js`, `kaola-workflow-claim.js`):
  - `SINK_STEPS` reordered: `closure` moved from position 6 (before `stash_restore`/
    `archive_commit`/`push_main`) to the LAST position (after `push_main`).
  - `checkClosureInvariants(root, receipt, archiveDest, opts)` gained an optional 4th param;
    when `opts.implRef`/`opts.sinkTarget` supplied, runs `git merge-base --is-ancestor` and sets
    `receipt.remote_closed_after_publish` (`'verified'`/`'failed'`), pushing a violation on
    failure. No-op when `opts` omitted.
  - `postMergeCleanup` captures the feature branch SHA before branch deletion and passes it as
    `implRef`/`sinkTarget` to `checkClosureInvariants`.
  - The relocated `closure` step body re-resolves the branch's live tip and re-runs the ancestor
    check as a hard gate, refusing with `remote_closed_after_publish_unverified` (exit 1, no
    issue closed, step left not-done) on failure.
  - `cmdFinalize` now computes `mergeLaneDeferred` from the durable `sink:` field in
    `workflow-state.md` (default `merge` ⇒ deferred) instead of relying solely on
    `--keep-worktree`; fails toward deferral on an unreadable/absent field.
  - New `cmdVerifySink` / `verify-sink` subcommand: read-only audit checking impl-commit
    ancestry + no lingering worktree/branch/active-folder; typed `reasons[]` array, non-zero
    exit on any failing leg.
- #618 (`kaola-workflow-run-chains.js`, `kaola-workflow-plan-validator.js`, `package.json`):
  - `runChainSync`: `status == null && (signal || error)` now forces `exitCode = 1` (previously
    could fall through to the `r.error ? 1 : 0` false-green branch on a pure signal death).
  - `runChainAsync`'s `child.on('close', ...)`: `code == null` (signal-terminated, no exit code)
    now forces `exitCode = 1` unconditionally, alongside the pre-existing `timedOut` case.
  - Both paths now record `signal` (OS signal name or `null`) on the chain result and receipt.
  - `plan-validator.js --finalize-check`: an empty `chains[]` array now refuses with a typed
    `chains_empty` reason (new operator hint added), evaluated before the red-chain filter,
    precedence-ordered between `chains_stale` and `chains_red`.
  - `package.json`'s `test:kaola-workflow:claude` chain now runs `node scripts/test-run-chains.js`
    (previously unwired into any npm chain).

Both CHANGELOG entries above were checked sentence-by-sentence against this diff; no claim in
either entry goes beyond what the diff shows.

## Documentation Update Checklist disposition

- [x] **CHANGELOG.md** — added a new `## [Unreleased]` section (the prior section was
      `## [6.20.3] - 2026-07-04`, i.e. no `[Unreleased]` existed at HEAD — confirmed via
      `git show ccad2b13 -- CHANGELOG.md`, the release-cut commit that last renamed
      `[Unreleased]` → `[6.20.3]`) with a `### Fixed` subsection containing two entries, one per
      issue, each ending in the `#617`/`#618` provenance tag per this project's CHANGELOG
      convention (provenance belongs in CHANGELOG/ADRs/commits, never in agent-facing prompts).
      This is the only file this node wrote — `git status --porcelain` after the edit shows
      exactly one modified tracked file (`M CHANGELOG.md`); `docs/decisions/D-617-01.md` and
      `docs/workflow-state-contract.md` are untracked/modified by a prior node, not this one.
- [ ] README.md — no impact. Neither fix changes any public feature list, CLI usage example, or
      env var; `verify-sink` is an internal audit subcommand of an already-documented internal
      script, not a new user-facing feature surface.
- [ ] API docs (`docs/api.md`) — no impact. No external API/endpoint changed; these are internal
      workflow scripts (sink-merge, claim, run-chains, plan-validator) and their contract is
      already partially reflected in `docs/workflow-state-contract.md`, which a prior node
      already updated (`remote_closed_after_publish` field documented there).
- [ ] Architecture docs (`docs/architecture.md`) — no impact. Both are bug fixes to existing
      sink/chain logic (step reordering, an added hard gate, exit-code mapping correctness); no
      new component, module, or data-flow path was introduced.
- [ ] .env.example — no impact. No new environment variable was introduced by either fix.
- [ ] Inline comments — no impact from this node. The diff already carries extensive `#617`/
      `#618`-tagged inline comments (verified in the diff read above); those were added by the
      implementer nodes (n1-fix-617, n2-fix-618), not this finalize node.

## Verdict

pass — CHANGELOG.md updated under `[Unreleased]` with two grounded, diff-verified entries
carrying `#617`/`#618` provenance; all other checklist items confirmed no-impact and left
untouched; no file outside this node's declared write set (`CHANGELOG.md`) was modified.


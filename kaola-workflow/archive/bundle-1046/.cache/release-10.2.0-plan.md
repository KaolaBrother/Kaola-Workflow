# Kaola-Workflow 10.2.0 release convergence plan

This is a run-local preparation record. It authorizes no tag, push, release publication, Cloud
environment Save, or account action.

## Version decision

- Current package and latest GitHub Release: `10.1.1`.
- Target: `10.2.0`.
- Derivation: the repository's SemVer contract assigns MINOR to backward-compatible workflow
  capabilities, install features, or automation. The machine-global contract, nine-host
  transaction, and subtractive project migration are new capabilities rather than a patch-only fix.

## Required order

1. Record the owner's explicit Claude acceptance exception (install, static render,
   SessionStart/compact hook, composition, and regressions pass; live model response not executed
   because `claude auth status` is `loggedIn:false`) and the Cursor Cloud candidate boundary:
   Draft Build install/exact boot passes, while an exact-Build subagent is an isolated all-null
   negative control and cannot replace the post-release saved-Active-Build top-level test.
2. Update GitHub Issue #1046 from the final local body, close both Mission List items with exact
   evidence, then enter Kaola-Workflow Finalization.
3. Finalize/sink/archive/close #1046 and verify the publication commit is present on fetched
   `origin/main`.
4. Run release prepare for `10.2.0`; commit only the documented release surface.
5. At the clean release-only commit run the full four-chain producer command with
   `KAOLA_WORKFLOW_OFFLINE=1`, then `--release-check`. No waiver or subset is acceptable.
6. Create the checked local tag with `kaola-workflow-release.js --tag --version 10.2.0`; run
   canonical `npm test` with the tag present.
7. Push only `kaola-workflow--v10.2.0`, publish the GitHub Release against that exact tag, and prove
   the remote tag/release target.
8. From the released tree run `./install-all.sh --yes` and `./install-all.sh --check`; restore a
   no-nonce formal global receipt.
9. Re-run fresh released-runtime probes for Codex, OpenCode, Kimi, Grok, Cursor CLI, Cursor App
   local, and ZCode. For Claude, re-run the released install/check, static render,
   SessionStart/compact-hook, composition, and regression mechanics and retain the explicit
   owner-authorized no-live-model exception.
10. In Cursor Cloud create a default-branch Build from the released commit, ask for action-time user
    confirmation immediately before Save, then start a new top-level same-repository Agent whose
    boot record names that Active Build and run the no-tool semantic probe.
11. Audit the forge open list, active folders, worktrees, package/tag/release versions, and every
    runtime receipt before declaring the thread goal complete.

## Official release commands after #1046 closes

```bash
node scripts/kaola-workflow-release.js --prepare --version 10.2.0
git add CHANGELOG.md README.md package.json \
  plugins/kaola-workflow{,-gitlab,-gitea}/.codex-plugin/plugin.json \
  plugins/kaola-workflow-{gitlab,gitea}/.claude-plugin/plugin.json
git commit -m "chore: release 10.2.0"
KAOLA_WORKFLOW_OFFLINE=1 node scripts/kaola-workflow-run-chains.js
node scripts/kaola-workflow-run-chains.js --release-check
node scripts/kaola-workflow-release.js --tag --version 10.2.0
npm test
git push origin kaola-workflow--v10.2.0
node scripts/kaola-workflow-release.js --push
```

`--push` emits guidance only. The GitHub Release still needs an explicit release publication against
the already-pushed exact tag. Any production or release-surface commit after chain stamping makes
the receipt stale and requires restamping before tag creation.

## Current preflight evidence

- main: `3546d3598de25caf3660ac54731bb446c76078e0`, aligned with `origin/main` at observation time;
- issue candidate: `bd766e8f47ca04ae716870d441bc9f4d8ea17d50`, clean worktree;
- Cloud probe: `4ac80cf3e6e4eea1aaea1bb6826eb7fa2584abd2`;
- `finalize --check --json`: `ok:true`, with `validation:chains_stale` reported rather than hidden;
- latest GitHub Release: `kaola-workflow--v10.1.1`, published 2026-08-28.
- forge audit: Issue #1046 is the only open Issue, there are zero open PRs, and `bundle-1046` is
  the only active local run.

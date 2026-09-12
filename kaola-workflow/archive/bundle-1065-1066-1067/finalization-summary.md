# Finalization summary — bundle-1065-1066-1067

Candidate: `a153c215ec5cdb3c03814222e161eba9155fd330` on `workflow/bundle-1065-1066-1067`
(base `2b1af448ba5aebbe13bde6deef130a84b409b67e`).

## Delivered

- **#1067 — same-name archive collision.** Canonical `kaola-workflow-claim.js`,
  `kaola-workflow-sink-merge.js`, `kaola-workflow-closure-audit.js` and their Codex, GitLab and
  Gitea ports: a fresh main-only live claim mirrors into its linked worktree despite a tracked
  same-name historical archive; an already archived matching claim keeps the crash-resume path;
  sink journal and durable findings follow the current claim's or the exact receipt's
  `archive_dest`; scoped closure audit resolves live state first and leaves historical doc-only
  findings outside scope; multiple claimed histories without a live anchor stay
  `archive_authority_ambiguous` (newest-timestamp selection was reviewed and rejected). No
  coordination registry or new name scheme. Correction comment 5646400226 on #1067.
- **#1066 — dead command placeholder rendering.** `install.sh` no longer carries
  `resolve_agent_model_for_install`, `model_for_placeholder`, or the `render_command_file`
  placeholder loop; commands are copied verbatim. `agent_source_file` is retained because it is
  still used. Old renderer output equals source bytes for all 9 shipped command files.
- **#1065 — dispatch evidence overclaims.** Evidence and wording correction only: native tool
  events establish a dispatch, findings/artifacts establish its outcome, artifact existence alone
  does not prove child authorship, and a narrated reply is not a dispatch. The retained #1063
  summary cannot substitute for the absent raw exports; simulation does not explain the real
  rejection. Fresh Fusion `sidekick` event completed a native child read with the child model
  unknown. Comments 5646286996 and 5646351712 on #1065. No new gate, schema, field, or proof
  system. Devin adapter `native_routes` now states that native routes follow the live schema
  (profile-based `run_subagent`/`read_subagent` or Fusion `sidekick`).

## Files Changed

24 files, +679/−174 (`git diff 2b1af448 a153c215 --stat`):

- Production: `scripts/kaola-workflow-{claim,sink-merge,closure-audit}.js` and the three forge
  ports under `plugins/kaola-workflow*/scripts/`; `install.sh`; `package.json` (suite
  registration); `templates/agents/runtime-capabilities.json` (Devin `native_routes`).
- Tests: `scripts/test-issue-1067-archive-identity.js` (new; in-process four-edition loop),
  `scripts/test-sink-merge.js` (CLI transaction over a collision archive).
- Docs: `README.md`, `CHANGELOG.md`, `docs/README.md`, `docs/api.md`, `docs/architecture.md`,
  `docs/devin-edition.md`, `docs/runtime-capabilities.md`.

Commits: `bb4b7e6f` (implementation), `0be4de1a` (Devin adapter wording + docs correction),
`a153c215` (archive-identity test runs in-process).

## Test Coverage

- New `test-issue-1067-archive-identity.js`: 21 checks × 4 editions = 84, covering linked
  crash resume, suffix journal/audit routing, divergent foreign work, and directory/state
  symlink refusal. Baseline failures and final results under
  `/Users/ylpromax5/Documents/Codex/issue-1062-validation/1067-regression-evidence/`.
- `test-sink-merge.js` extended with the complete CLI sink over a same-name archive.
- #1066: `bash -n install.sh`, `test-install-model-rendering.js`, `test-install-upgrade-rewrite.js`
  exit 0; 9/9 command files byte-equal between the old renderer and source. No tests removed.
- Additive-runtime suites (9), parity, and both generator checks passed
  (`bundle-editions.log`, `bundle-parity.log`).

Acceptance legs: automated (chains, walkthrough, focused suites) executed. Live platform probes
(Codex, Grok, Cursor CLI, Kimi, OpenCode, Devin Fusion) were captured outside the repository under
`/Users/ylpromax5/Documents/Codex/issue-1062-validation/` and are not committed. Not executed:
authenticated Claude live session (no account; offline producer chain stands in), Cursor App and
Cursor Cloud UI probes, ZCode expanded tool UI — these remain with the independent validator.

## Validation

verdict: pass
command: `node plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js --project bundle-1065-1066-1067`
receipt: `kaola-workflow/bundle-1065-1066-1067/.cache/chain-receipt.json` — `headSha` a153c215,
`workTreeHash: clean`, scope `all-four` (edition coupling, 24 changed files), 11/11 preamble
steps exit 0.
chains: claude (exit 0, 53 steps, 1 attempt), codex (exit 0), gitlab (exit 0), gitea (exit 0).
walkthrough: `node scripts/simulate-workflow-walkthrough.js` — 178/178 scenarios passed at a153c215.

History of the frozen candidate: the bb4b7e6f chain failed on
`test-runtime-agent-architecture` (Devin adapter lost the "native routes" phrase; log
`bundle-final-chains.log`), and 0be4de1a then failed on `test-spawn-classification` (the new
archive-identity test respawned itself per edition; log `bundle-final-chains-0be4de1a.log`).
Both were repaired at the source and re-frozen; no ceiling was raised and no test was weakened.
The a153c215 stdout logs were not persisted; the receipt is the artifact of record.

## Changed Paths

Reported by `finalize --check` (`checks.changed_paths`, `dirty_paths: []`):

- `install.sh`
- `package.json`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- `scripts/kaola-workflow-claim.js`
- `scripts/kaola-workflow-closure-audit.js`
- `scripts/kaola-workflow-sink-merge.js`
- `scripts/test-issue-1067-archive-identity.js`
- `scripts/test-sink-merge.js`
- `templates/agents/runtime-capabilities.json`

Documentation paths (`README.md`, `CHANGELOG.md`, `docs/*`) are listed under Files Changed.

## Documentation Docking

`.cache/doc-docking.md` — DOCKED at a153c215.

## Follow-Up Items

- Merge sink refused (`sink_blocked`) because the co-active runs `issue-1072` and `issue-1073`
  hold untracked live claim folders in the main root, which `sinkPreflight` classifies as
  foreign dirt; zero mutation occurred. filed: #1075 (P2, area:scripts; verified OPEN,
  non-empty body). This run does not touch those folders.
- Corrections landed on their own issues (#1065: 5646286996, 5646351712; #1067: 5646400226).

## Sink Findings

First `--sink` attempt at a153c215: `{"result":"refuse","reason":"sink_blocked"}` over the six
sibling live-folder paths of `issue-1072` and `issue-1073`. The owner directed the blocker be fixed
rather than deferred: #1075 was claimed as its own run and its validated candidate `c1496281`
(chains all-four green, walkthrough 178/178) verifies co-active sibling claims instead of refusing
them. The sink below was resumed with that candidate's `kaola-workflow-sink-merge.js`, run from the
`issue-1075` worktree against this main root; sibling folders were classified, never touched.

## Closure decision

Close all three (#1065, #1066, #1067) together; all-or-nothing policy per `workflow-state.md`.
No release or version bump is part of this run.

## Readiness

All four missions done; validation receipt green and bound to the frozen candidate;
documentation docked. Ready for finalize check, transaction, merge sink, closure audit, and
installation convergence.

archived_paths:
- kaola-workflow/archive/bundle-1065-1066-1067/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-1065-1066-1067/.cache/doc-docking.md
- kaola-workflow/archive/bundle-1065-1066-1067/.cache/mirror-digest.json
- kaola-workflow/archive/bundle-1065-1066-1067/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-1065-1066-1067/finalization-summary.md
- kaola-workflow/archive/bundle-1065-1066-1067/mission-list.md
- kaola-workflow/archive/bundle-1065-1066-1067/workflow-state.md

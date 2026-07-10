evidence-binding: n1-release-gate af77ad8fe2fc
RED: R2 — new walkthrough case #651 (11) failed pre-fix exactly on the adversary's finding: `#651 (11): a subset (claude-only) receipt must refuse chains_incomplete naming the missing chains, got status 0 {"result":"pass","mode":"release-check","candidate":"f8afae0061b9f818cd77e6aee264e59d921eafba","chains":[{"name":"claude","exitCode":0,"accepted_red":false}]}` (a legitimately-produced `run-chains --chains claude` subset receipt PASSED release-check). R1 — both forge-helpers suites reproduced RED under ambient offline: `KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js` → exit 1, `AssertionError [ERR_ASSERTION]: project-scoped: only issue-278 marker deleted` (expected [101] got []) at test-gitlab-forge-helpers.js:186; gitea identically at test-gitea-forge-helpers.js:253; both suites exit 0 without ambient OFFLINE (baseline).
GREEN: `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed" (exit 0) with all 13 #651 cases green (10 original + 3 new negative controls); both forge-helpers suites exit 0 in ALL FOUR combos (gitlab/gitea × with/without ambient KAOLA_WORKFLOW_OFFLINE=1); `node scripts/test-adaptive-node.js` → "adaptive-node tests passed (1642 assertions)"; `npm run sync:editions` → "write complete (3 file(s) updated)" then idempotent re-run "0 file(s) updated — tree already in sync"; end-to-end re-walk passed both legs (quoted below).

## Repair window note

This is the R1+R2 repair window after the adversarial gate refuted the bundle; the original AC1/AC3/AC4 work (base `--release-check` + 10 walkthrough cases) is already merged at 2c70c97f. This window adds the R2 coverage arm, the R1 suite hermeticity fix, 3 new walkthrough negative controls, and the mandatory end-to-end re-walk.

## FINDING R2 fix (AC1: subset receipt passed)

TDD RED first: walkthrough cases (11)-(13) added beside the existing #651 block; case (11) failed with the pass envelope quoted in RED above; case (12) failed chains_red≠chains_incomplete; case (13) failed (no-package.json repo passed).

Implementation (canonical `scripts/kaola-workflow-plan-validator.js`, regenerated to the 3 edition copies):
- COVERAGE arm in `releaseCheck` after `chains_empty`, before `chains_red`: resolves the expected chain set from `<git-toplevel>/package.json` — `['claude','codex','gitlab','gitea'].filter(n => typeof scripts['test:kaola-workflow:'+n] === 'string')`, the exact KNOWN_CHAINS predicate run-chains' resolveChains and the finalize repo-kind discriminator use, so producer and gate never disagree.
- Missing coverage → NEW typed reason `chains_incomplete` with STRUCTURAL payload `missingChains` + `expectedChains` (+ operator hint naming the missing chains); never string-matched.
- Unresolvable chain set (missing/unreadable/unparseable package.json, or zero declared chains) → fail-CLOSED `repo_kind_undetermined` (reused reason): an empty expected set would make coverage vacuous (a fail-open). Deliberately stricter than finalize's ENOENT→consumer downgrade — a release is self-host-by-definition.
- Precedence family now: chains_unverified > chains_stale > chains_empty > repo_kind_undetermined (unresolvable chain set) > chains_incomplete > chains_red > chains_waived. Coverage-before-greenness extends the family's existing empty > red ordering. LOCKS: case (8) locks empty ABOVE incomplete (an empty receipt is also incomplete but refuses chains_empty); case (12) locks incomplete ABOVE red (single claude chain, red, unwaived → chains_incomplete); case (13) locks the fail-closed probe.
- `mkReleaseRepo` fixtures now declare all four `test:kaola-workflow:*` scripts (committed with the /.cache/ gitignore) so the original 10 cases' verdicts are unchanged.
- Usage block + releaseCheck doc comment updated with the new precedence and coverage semantics.

## FINDING R1 fix (AC2: documented sequence dead-ended under blanket OFFLINE)

RED reproduced (quoted above): the claim modules capture KAOLA_WORKFLOW_OFFLINE at REQUIRE time, so an ambient value flipped the online-path sub-tests (Tests 2-4) into the offline short-circuit — `clearAdvisoryClaim` returned before marker deletion, deletedIds [] vs expected [101].

Fix (test-suite hermeticity ONLY; zero production-script changes): both `plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js` and `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js` now `delete process.env.KAOLA_WORKFLOW_OFFLINE` at suite top BEFORE any require that captures it, with a comment naming the require-time capture hazard. The deliberate OFFLINE sub-test is unaffected — it already sets '1', cache-busts the claim module, and restores by delete (consistent with the hermetic unset default).

GREEN: all four combos exit 0 — gitlab-offline=0, gitlab-plain=0, gitea-offline=0, gitea-plain=0.

## End-to-end re-walk (adversary-mandated; scratch clone under $TMPDIR, never the worktree)

Setup: repair tree rsynced (sans .git/.kw/node_modules) into $TMPDIR/kw-651-rewalk-31978, fresh `git init -b main`, zero tags. Hygiene bump: added `## [Unreleased]` CHANGELOG entry, then `KAOLA_WORKFLOW_OFFLINE=1 node scripts/kaola-workflow-release.js --cut --version 6.21.6 --codex-version 4.21.6 --json` → `{"result":"ok","version":"6.21.6",...,"steps_completed":["codex_resolution","changelog","package_json","codex_manifest_0","codex_manifest_1","codex_manifest_2","claude_manifest_0","claude_manifest_1","readme","git_tag"]}` (observed: --cut EDITS the bump files but does NOT commit them — its tag pointed at pre-bump HEAD; release.js untouched per scope guard). Bump files committed as candidate `ee0a50a8737005bc22b7689ca7418488bf2d2915`; local tag deleted → UNTAGGED candidate, `tags=[]`.

Leg 1 (documented sequence goes green): `KAOLA_WORKFLOW_OFFLINE=1 KAOLA_RUN_CHAINS_CONCURRENCY=serial node scripts/kaola-workflow-run-chains.js --json` at the untagged candidate → `{"result":"pass","failed":[],"receipt":".../.cache/chain-receipt.json"}`; receipt: `{"headSha":"ee0a50a8737005bc22b7689ca7418488bf2d2915","workTreeHash":"clean","chains":[{"name":"claude","exitCode":0,"accepted_red":false},{"name":"codex","exitCode":0,"accepted_red":false},{"name":"gitlab","exitCode":0,"accepted_red":false},{"name":"gitea","exitCode":0,"accepted_red":false}]}` — an ALL-FOUR-GREEN unwaived clean-stamped receipt BEFORE any tag exists (this run itself exercised the R1-fixed suites inside the gitlab/gitea chains under blanket ambient OFFLINE — the exact previously-dead sequence). Then `node scripts/kaola-workflow-plan-validator.js --release-check --json` → `{"result":"pass","mode":"release-check","candidate":"ee0a50a8737005bc22b7689ca7418488bf2d2915","chains":[{"name":"claude","exitCode":0,"accepted_red":false},{"name":"codex","exitCode":0,"accepted_red":false},{"name":"gitlab","exitCode":0,"accepted_red":false},{"name":"gitea","exitCode":0,"accepted_red":false}]}`, exit 0.

Leg 2 (subset refuses typed): `KAOLA_WORKFLOW_OFFLINE=1 KAOLA_RUN_CHAINS_CONCURRENCY=serial node scripts/kaola-workflow-run-chains.js --chains claude --json` → producer pass (subset receipts are official output); then `--release-check --json` → `{"result":"refuse","reason":"chains_incomplete","operator_hint":"Chain receipt does not cover the full declared chain set — missing: codex, gitlab, gitea. ...","missingChains":["codex","gitlab","gitea"],"expectedChains":["claude","codex","gitlab","gitea"],"errors":[...]}`, exit 1.

## Validation record (worktree, post-all-changes)

- `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed", exit 0.
- Forge suites: gitlab-offline=0, gitlab-plain=0, gitea-offline=0, gitea-plain=0.
- `node scripts/test-adaptive-node.js` → "adaptive-node tests passed (1642 assertions)", exit 0.
- `npm run sync:editions` → idempotent: "0 file(s) updated — tree already in sync" on re-run.
- `git status` non-untracked delta = exactly the 7 declared write-set files + this evidence file (README.md / docs/api.md / docs/conventions.md modifications are n4-docs's, pre-existing at repair start, untouched).

## Files touched this window (repo-relative)

- scripts/kaola-workflow-plan-validator.js (coverage arm + chains_incomplete hint + doc comment + usage block)
- plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js (generated)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js (generated)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js (generated)
- scripts/simulate-workflow-walkthrough.js (mkReleaseRepo package.json + cases 11-13 + block comment)
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js (hermeticity, hand-edited)
- plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js (hermeticity, hand-edited)

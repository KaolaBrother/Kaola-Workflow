# Code review — Issue #1052 C1 grouped host gate

candidate: SHA `ba368eabb3385bfd5e389432603a116b52524298` on `workflow/issue-1052`
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
prior FAIL: `kaola-workflow/issue-1052/.cache/code-review-c1-host-gate.md` on `282238bb` (unparenthesized A&&B||C&&D)
surface: generated Next first Resume fence and concatenated startup/resume fences
reviewed: 2026-09-07
did_not_run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`
did_not_touch: `kaola-workflow/bundle-1051`, `.kw/worktrees/bundle-1051`, tests, candidate production files

## How the chain was generated and executed

1. `node scripts/sync-cursor-edition.js --write --tree-root=/tmp/kw-1052-c1-parens/gen-{github,gitlab,gitea} --forge={github,gitlab,gitea}`
2. Clean-shell eval of the exact grouped `if { A && B; } || { C && D; }; then`
3. Isolated `install-cursor.sh --global --yes`. Named `kaola-workflow-claim.js` copied under `$CURSOR_HOME/kaola-workflow/scripts/`. `node` wrapped to log argv.
4. First `## Resume` fence via `bash --noprofile --norc`: unset; `CURSOR_PRODUCT=cli` `CURSOR_HOST=local` only; `KAOLA_CURSOR_*` twins only.
5. Concatenate every generated startup/resume fence: unset; CURSOR pair only; KAOLA twins only.
Did not use sibling-`agent` inference (Issue #1052 forbids it). Did not spawn `claim.js --product app` as a substitute for generated fences.

## C1

### Prior unparenthesized ELSE — closed

Generated `cursorCliHostGateOpen` is:

`if { [ "${CURSOR_PRODUCT:-}" = cli ] && [ "${CURSOR_HOST:-}" = local ]; } || { [ "${KAOLA_CURSOR_PRODUCT:-}" = cli ] && [ "${KAOLA_CURSOR_HOST:-}" = local ]; }; then`

github/gitlab/gitea first Resume fences contain that grouped gate; CLI-stamped argv stays inside `then`; `else` is unstamped `--runtime cursor`. Zero CLI stamps outside `if`.

Clean bash: unset ELSE; CURSOR pair only THEN; KAOLA twins only THEN; all four THEN.

### Generated consumer execution (GitHub named claim.js)

- unset first Resume: `resume --runtime cursor`; `cursor_prep` null; no implementer agents.
- CURSOR pair only first Resume: `resume --runtime cursor --product cli --host local --cursor-workspace <opened>`; `cursor_prep.status=materialized`; agents written.
- KAOLA twins only first Resume: same then-arm stamp and materialize.
- concatenate every fence, unset (App-like): three unstamped invocations only; no `--product cli --host local`; no agents.
- concatenate with CURSOR pair only: then-arm startup and resume include cli/local plus `--cursor-workspace`; agents written.
- concatenate with KAOLA twins only: same then-arm stamp; agents written.

App-like unset no longer forges CLI identity. Documented CURSOR pair is sufficient for the then-arm. The suite now drives CURSOR-pair-only and KAOLA-twins-only (not only all four).

### Observation (not blocking) — Cursor CLI export of CURSOR_PRODUCT

README/`docs/api.md` still say this tree does not record that Cursor CLI exports `CURSOR_PRODUCT` or `CURSOR_HOST`. No installer or helper in the candidate sets those names. That is skippable-by-omission **unless** an operator or future measured CLI exports the documented pair (or the KAOLA twins).

Issue #1052 forbids App/Cloud forging CLI ensure and forbids inferring CLI from a sibling `agent` binary. It also requires CLI/local prep on the standalone CLI path. Those two cannot both hold without a discriminator. The grouped env gate is that discriminator. Treating missing Cursor-native export as a blocking C1 would demand a host signal the issue forbids inventing (sibling binary) while also demanding App unset never forge. Recorded as observation only.

## C2 C3 C4

Remain resolved. `--cursor-workspace` still rides the then-arm; first Resume still inlines `CLAIM_JS=` outside the `if`; README still states the gate.

finding: id=C1 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=host-gate-skippable-and-unparen-or
finding: id=C2 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=generated-next-omits-cursor-workspace
finding: id=C3 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=cold-resume-claim-js-unbound
finding: id=C4 scope=in_scope action=fix status=resolved severity=medium fix_role=doc-updater rationale=readme-omits-user-visible-prep
verdict: pass
findings_blocking: 0
review_conclusion: Frozen ba368eab closes C1: grouped host gate makes the documented CURSOR pair and KAOLA twins take then-arm cli/local with GitHub materialize, while App-like unset concatenates without forging identity.

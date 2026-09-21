# Finalization summary — bundle-1087 (#1087)

## Delivered

Runtime decoupling per the sealed design #1086 (shared blocks + reference counting), implemented in
two parallel lanes and integrated:

- Lane A (F1/F2): per-runtime uninstall ownership (uninstall.sh scoped to Claude; Codex removal via
  install-codex-agent-profiles.js --uninstall); shared reference registry
  scripts/kaola-workflow-shared-refs.js (runtime-id set semantics; registry itself is the last
  cleaned shared block; operator override); config-block lifecycle wired on the uninstall side of
  every uninstaller.
- Lane B (F3/F4/F5): per-target global-contract mode (--target-id/--runtime; one record per target
  under ~/.config/kaola-workflow/global-contract-targets/; one conflict cannot fail another;
  cross-runtime DRIFT advisory); DORMANT ownership rows replacing NOT_INSTALLED evidence drops
  (returning runtime re-validates, no OWNER_CONFLICT); every installer installs its own carrier
  last; install-all.sh pure orchestrator with working --skip.
- Integration: laneB merged (79ae109f); per-target carrier uninstall wired into every Lane-A
  uninstaller (478c5635); CONFIG_BLOCK_ID='kaola-config' unified; registry production-real
  (test-only stub via KAOLA_SHARED_REFS_MODULE); registry published through the repo's atomic
  replace + lane-B spawn sites classified (d0b3c483); upgrade note + uninstall warning semantics
  documented (16755cc4).

## Files Changed

See `git diff --stat main..workflow/bundle-1087` (8 commits, both lanes + integration + docs).
Key: uninstall.sh, install-{codex-agent-profiles,global-contract,shared-refs}.js (+ ×4 mirrors),
all install-*.sh install/--uninstall sections, install-all.sh, docs (installation/api/edition),
CHANGELOG [Unreleased], new test-issue-1087-lane-{a,b}.js.

## Test Coverage

test-issue-1087-lane-a.js 93 assertions (mutant-verified); test-issue-1087-lane-b.js 181 passed;
test-uninstall-forge-branches, test-cursor-edition (611), test-suite-registration,
validate-script-sync, bash -n on all touched scripts; #1055 render oracle green.

## Validation

`node scripts/kaola-workflow-run-chains.js --project bundle-1087` — four forge chains green,
unwaived, receipt bound to candidate HEAD 16755cc4 (clean tree, completed 2026-09-21T16:34:21Z):
claude 55 steps / codex / gitlab / gitea all zero non-zero exits. Walkthrough passed.
Receipt: kaola-workflow/bundle-1087/.cache/chain-receipt.json.

## Changed Paths

(Finalize transaction reports the authoritative list; expect the union of both lanes plus
integration docs: installers, shared kernel scripts + mirrors, uninstall.sh, install-all.sh,
docs/*, CHANGELOG.md, package.json chain registrations, two new lane suites.)

## Documentation Docking

DOCKED — .cache/doc-docking.md.

## Follow-Up Items

- Plugin-cache Codex copies report carrier UNAVAILABLE by design (preflight auto-repair preserved).
- Devin has no uninstaller (pre-existing gap, now documented).
- Known ruled-upon behaviors: zero-reference config deletion kept (#1086 F2 semantics); uninstall
  OWNER_CONFLICT is a warning, exit 0 (reference-release warning pattern).

## Measured

- All acceptance evidence measured hermetically at 16755cc4 (fixture homes; no real runtime home
  touched; ~/.dsh read-only throughout).

## Hypothesis

- None.

searched: `gh issue list --state open` before opening #1087 — duplicate probe showed no existing
implementation issue (open set was #1086 only, closed by then).

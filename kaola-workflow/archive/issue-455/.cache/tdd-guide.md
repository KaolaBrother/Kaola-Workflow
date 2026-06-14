# tdd-guide implementation evidence — issue #455

## Round 1 — primary fix (RED→GREEN)
RED: rewrote T5 + added derive-major / explicit-override / non_monotonic_codex_version /
codex_version_underivable cases + fixture additions (claudeVersion opt, 3 claude-install README
lines, 2 .claude-plugin manifests). 24 assertions failing (codex==5.1.0 not 3.1.0, etc.).
GREEN: implemented A1–A8 in scripts/kaola-workflow-release.js:
- new CLAUDE_MANIFEST_RELPATHS (forge-port-safe), bumpKind()/deriveCodexVersion() helpers
- codex-version resolution + codex_version_underivable + non_monotonic_codex_version guards in the
  PRE-MUTATION block (after lockstep, before Step 1)
- Step 3 codex bump → codexVersion; NEW Step 3b → 2 .claude-plugin manifests to ROOT version
- Step 4 README: codex lines → codexVersion; ADD claude-install lines → root version
- JSON envelope: codex_version + codex_version_source
→ all 78 assertions passed. test_thrash 0.
Propagation: gitlab/gitea ports regenerated via renameNormalize() (raw cp FAILS validate-script-sync
because the canonical has 2 self-name tokens the normalizer rewrites: the `// kaola-workflow-release.js`
header comment + the `kaola-workflow-release: usage` string); edition-sync.js --write refreshed the
codex byte copy. validate-script-sync.js exit 0.

## Round 2 — crash-resume idempotency fix (code-reviewer CRITICAL BLOCK; RED→GREEN)
Bug: codex resolution read the LIVE (mutable) lockstep.baseline + re-guarded against it, so a
resume after the codex bump but before the git tag (a) re-derived a WRONG version (3.2.0) into
README+envelope while manifests stayed 3.1.0 (mismatch), and (b) on the explicit path bricked
resume forever (baseline==target → non_monotonic_codex_version refuse).
RED: added T12 (derived face) + T13 (explicit face) crash-resume tests + simulatePartialCrash helper
(deletes tag, removes git_tag+readme receipt lines, resets README codex lines, leaves manifests
bumped + codex_resolution receipt present). 4 assertions failing.
GREEN: made resolution idempotent — load receipt at top of the resolution block; if a prior
`{ step: 'codex_resolution', version: <root version> }` exists (resume), reuse prior.codexVersion/
prior.source and SKIP derive+monotonic-guard; else run derive/override+guards against the still-
original baseline and persist `codex_resolution` AFTER guards pass, BEFORE Step 1 changelog (so a
first-run refusal stays half-mutation-free; T5e no-mutation still green).
→ all 94 assertions passed. test_thrash 0.
Re-propagated via renameNormalize() + edition-sync --write; validate-script-sync.js exit 0.

## Files changed (worktree)
- scripts/kaola-workflow-release.js (logic, both rounds)
- scripts/test-release.js (RED tests + fixture + crash-resume regression, both rounds)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js (regenerated port)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js (regenerated port)
- plugins/kaola-workflow/scripts/kaola-workflow-release.js (auto-synced codex byte copy)

## Acceptance
node scripts/test-release.js → all 94 assertions passed (exit 0).
Live repo versions untouched (5.16.0 / 3.16.0).

## Noted (pre-existing, OUT OF SCOPE — possible follow-up)
The runCut full-completion idempotent short-circuit (fires when git_tag already done) returns an
envelope that omits codex_version/codex_version_source. Predates #455; minor observability gap, not
a correctness issue (the release is already complete). Surfaced for the owner to decide a follow-up.

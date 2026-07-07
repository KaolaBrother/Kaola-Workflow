evidence-binding: n5-reconcile fd983d3da9d2

## Outcome: GENUINE NEAR-NOOP — finalize was already fully manifest-covered by n2

n5-reconcile touched ZERO files. n2-manifest already added all 5 finalize blocks to
templates/routing/required-blocks.js and wired the derived-universe checker in
scripts/test-route-reachability.js to obligate FN×6. My job was to CONFIRM that coverage
is real and correct, and to add ONLY a genuine gap. There was no gap. No change invented.

### FN×6 manifest coverage is REAL (not a silently-empty obligation)
All 5 finalize blocks present: fn-closure-audit, fn-gate-barrier, fn-bundle-closure,
fn-fast-compliance-backstop, fn-final-validation-gate. Each is runtime=both/surf=both, so
deriveObligated expands to 6 surfaces apiece → 30 finalize obligated file-checks total
(5 × 6). Directly recomputed the obligated set and asserted every content_token is present
(norm-normalized) on every obligated surface:
  fn-closure-audit             obligates 6 surfaces  ALL TOKENS PRESENT
  fn-gate-barrier              obligates 6 surfaces  ALL TOKENS PRESENT
  fn-bundle-closure            obligates 6 surfaces  ALL TOKENS PRESENT
  fn-fast-compliance-backstop  obligates 6 surfaces  ALL TOKENS PRESENT
  fn-final-validation-gate     obligates 6 surfaces  ALL TOKENS PRESENT
The 6 finalize surfaces (all present): commands/kaola-workflow-finalize.md +
plugins/kaola-workflow-{gitlab,gitea}/commands/kaola-workflow-finalize.md +
plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md +
plugins/kaola-workflow-{gitlab,gitea}/skills/kaola-workflow-finalize/SKILL.md.

### n2's narrowing of fn-final-validation-gate was CORRECT (verified, not a gap)
Spec §5.3 table proposed two tokens for fn-final-validation-gate (`final-validation.md`,
`final_validation_unverified`), but n2 kept only `final-validation.md`. Verified this is a
coverage-correct narrowing, NOT a drop: per-surface grep of `final_validation_unverified`
shows counts [claude-cmd=1, gitlab-cmd=0, gitea-cmd=0, claude-skill=1, gitlab-skill=1,
gitea-skill=1] — it is ABSENT on the gitlab/gitea COMMAND twins. Obligating it over FN×6
would false-red. It is instead retained as a residual pin over [claude-cmd, claude-skill]
in the RR superset proof (test-route-reachability.js:708) with its existing validator
assertions intact. `final-validation.md` (present on all 6: counts 7,4,4,4,4,4) is the
correct FN×6 token. Nothing to add — adding the un-foldable token would break the checker.

### #624-fix gate-flag pins — ALL INTACT (grep counts, unchanged from before this build)
VW scripts/validate-workflow-contracts.js: --resume-check ×2, --gate-verify ×1,
  --barrier-check ×1, --verdict-check ×1, `workflow_path: adaptive` ×1.
VK scripts/validate-kaola-workflow-contracts.js: `workflow_path: adaptive` ×1.
VGL plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js:
  --resume-check/--gate-verify/--barrier-check/--verdict-check finalize-command cluster at
  :369-372 + bare-path ban :373; SKILL workflow_path:adaptive + four flags :383-387.
VGT plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:
  same cluster :376-379 + bare-path ban :380; SKILL workflow_path:adaptive + four flags :390-394.

### Deliberate gitea/gitlab `mr|pr)` finalize-sink contract pins — ALL INTACT
VGL: :296 (command) + :335 (SKILL) — `.includes('mr|pr)')`.
VGT: :303 (command) + :342 (SKILL) — `.includes('mr|pr)')`.
Exactly at the spec-cited lines (VGL:296,335 / VGT:303,342). Unchanged; not folded/relaxed.
The manifest is additive over these forge-specific pins (record has no forge_tag).

### Write set touched: NONE
git status shows only prior-node changes (package.json [n4], test-route-reachability.js [n2],
templates/routing/ [n2/n3/n4], the two generator scripts [n3/n4]). n5 added no edit to any of
the 6 finalize surfaces, required-blocks.js, test-route-reachability.js, or the 4 validators.
No byte-mirror edit needed (validate-workflow-contracts.js untouched).

### Verification exit codes (all 0)
  node scripts/test-route-reachability.js .......................... EXIT=0  (281 assertions; MANIFEST incl FN×6 green)
  node scripts/validate-workflow-contracts.js (VW) ................. EXIT=0
  node scripts/validate-kaola-workflow-contracts.js (VK) ........... EXIT=0
  plugins/.../validate-kaola-workflow-gitlab-contracts.js (VGL) .... EXIT=0
  plugins/.../validate-kaola-workflow-gitea-contracts.js (VGT) ..... EXIT=0
  node scripts/validate-script-sync.js (byte mirror) .............. EXIT=0
  node scripts/generate-routing-surfaces.js --check (12 gen) ...... EXIT=0

RED: MANIFEST FN×6 obligation would be VACUOUS if fn-final-validation-gate carried the un-foldable token `final_validation_unverified` — recomputed obligated set proves it is ABSENT on 2/6 surfaces (gitlab-cmd=0, gitea-cmd=0), which WOULD have red-failed checkManifest missing-token on those surfaces had n2 not narrowed to `final-validation.md` (pre-confirm signature of the coverage gap this node guards against).
GREEN: n5 confirms FN×6 fully covered — 30/30 finalize obligated file-checks pass (5 blocks × 6 surfaces, ALL TOKENS PRESENT); test-route-reachability 281/281 assertions green + VW/VK/VGL/VGT + validate-script-sync + generate-routing-surfaces --check all EXIT=0; #624 gate flags + `mr|pr)` pins intact. Zero edits (genuine near-noop).

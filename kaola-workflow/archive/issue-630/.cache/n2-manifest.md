evidence-binding: n2-manifest 48f955b37a69

# n2-manifest — Layer-1 required-block MANIFEST + derived-universe checker + red-proof battery

## RED
RED: test-route-reachability manifest checker — planted `PLANTED_ABSENT_GATE_TOKEN` into fn-gate-barrier.content_tokens; run reds with `FAIL: MANIFEST missing-token: block fn-gate-barrier token "PLANTED_ABSENT_GATE_TOKEN" absent from commands/kaola-workflow-finalize.md` (+ the other 5 finalize surfaces), `Route-reachability test FAILED: 7 failure(s), 280 passed`, exit 1. This is the exact #624 whole-block/finalize-token drift class the pre-manifest T-pin regime passed silently.

## GREEN
GREEN: plant reverted; `node scripts/test-route-reachability.js` → `Route-reachability test passed (281 assertions)`, exit 0 — T1..T15 (148 prior assertions) + the manifest real-run (90 obligated file-checks over 18 surfaces) + superset proof (35 legacy pairs fold-or-residual) + all 6 red-proof cases assert-red green.

## What was built (ADDITIVE-SUPERSET, never rip-and-replace)
- CREATE `templates/routing/required-blocks.js` — the single-source manifest, `module.exports = { REQUIRED_BLOCKS, TOPICS:['plan-run','finalize','next'] }`. **18 blocks**: 9 plan-run + 5 finalize + 4 next. Every content_token grep-verified as a VERBATIM (norm-normalized) substring of the real committed surface across every edition the block obligates.
- EDIT `scripts/test-route-reachability.js` — appended AFTER T15, BEFORE the final `if (failed)`: the pure `checkManifest({blocks, readSurface, editions, topicBasename, foreignMarkers})`, the real-run invocation, the superset proof, and the 6-case red-proof battery. Purely additive (`git diff --stat`: 327 insertions, 0 deletions). T1..T15 BYTE-FOR-BYTE unchanged.

## Manifest block count per topic
- plan-run (9): pr-frontier-unit, pr-leg-isolation-recipe, pr-speculative-open, pr-gate-instrumentation, pr-dispatch-card-visibility (both/both); pr-teammate-mode, pr-join-protocol-claude (claude-live/command); pr-codex-dispatch, pr-join-protocol-codex (codex-live/skill).
- finalize (5): fn-closure-audit, fn-gate-barrier, fn-bundle-closure, fn-fast-compliance-backstop, fn-final-validation-gate (all both/both).
- next (4): nx-claim-escalate, nx-adaptive-route (both/both); nx-codex-dispatch-mode (codex-live/skill); nx-router-command (claude-live/command).

## Derived-universe guarantee (4-of-6 structurally impossible)
Obligated file set is COMPUTED, never hand-typed: surface types resolve from runtime_tag (claude-live→command, codex-live→skill, both→expand surface_type_tag) with tag-consistency asserted; plan-run basenames READ FROM THE SCHEMA REGISTRY (`schema.PLAN_RUN_COMMAND`/`PLAN_RUN_SKILL`) — the same emitted-target anchor T1/T2 use, so a rename or a 7th edition follows automatically; crossed with the 3 editions from the existing `claudeEditions`/`codexEditions` tables. next is ASYMMETRIC (command basename `workflow-next`, skill basename `kaola-workflow-next`) and is handled by the per-surface-type basename map.

## Red-proof battery — all 6 assert failures.length>0 (in-memory fixtures, NO real-tree mutation)
1. DROPPED — token removed from one obligated surface → missing-token red.
2. HOLLOWED — marker kept, distinctive 2nd token gone → red (proves bare markers insufficient).
3. NEW-SURFACE-MISSING — a 2nd synthetic edition auto-obligated by a both/both block, its file absent → absent-surface red (proves auto-obligation).
4. ORPHAN-MANIFEST — inconsistent tags (claude-live + skill) → orphan-manifest red.
5. ORPHAN-SURFACE — forward pass clean, a rogue `<!-- PIN: rogue -->` on a surface → reverse-sentinel red (asserted the failure message starts `orphan-surface`; catches R2 self-disarm).
6. SUPERSET-PROOF — an unfolded, non-allow-listed legacy token → `foldsGeneric` returns false → red.

## Superset proof (no-weaker-than-today) + accepted residuals
35 legacy in-scope (token, surface-set) pairs asserted to fold into a manifest block whose derived set ⊇ the legacy surfaces, OR be on `RESIDUAL_ALLOWLIST`. Explicitly covers the #624-fix gate flags (`--resume-check`/`--gate-verify`/`--barrier-check`/`--verdict-check`) + `workflow_path: adaptive` (fn-gate-barrier over FN×6 ⊇ legacy). Two tokens are accepted residuals (present on a strict subset of a block's obligated set; existing T-pins stay):
- `watch-pr` — forge-renamed to `watch-mr` on the gitlab next command (VW:217 github-command pin stays).
- `final_validation_unverified` — github command+skill only; the gitlab/gitea finalize COMMANDS are the 2:1 rewrite and lack it (VW:479-480 / VK:175 pins stay). `final-validation.md` itself IS present on all 6 → it is the fn-final-validation-gate content token.

## Reverse orphan-sentinel scoping (foreign markers)
Five CARD markers physically on the plan-run surfaces but OUTSIDE the #630 manifest scope and UNPINNED by any validator (`frontier-batch`, `governance`, `reopen-complete-node`, `repair-routing`, `resume`) are declared in `FOREIGN_MARKERS` so the reverse sentinel reds only on a rogue/self-disarmed marker, never on a legitimately-foreign one. This reconciles the authoritative 18-block inventory (§1.2) with the all-surface reverse scan (§2.4) without weakening the checker.

## Two token corrections vs the spec table (verified against the real surface, not the validator)
- `nx-router-command`: `Skip this entire step when \`KAOLA_PATH=adaptive\`` needs the backticks (verbatim on all 3 next commands); dropped `watch-pr` (forge-renamed → residual).
- `fn-final-validation-gate`: content_tokens narrowed to `['final-validation.md']`; `final_validation_unverified` moved to residual (absent on gitlab/gitea finalize commands).

## Additivity confirmation
- T1..T15 untouched: `git diff scripts/test-route-reachability.js` shows 327 insertions, ZERO deletions.
- No validator or byte-mirror edited. `git status --short`: only `M scripts/test-route-reachability.js` + new `templates/routing/`. The n4/n5 nodes own any validator/byte-mirror edits; validate-script-sync.js stays green because the byte mirror `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` was not touched (byte-identical to `scripts/validate-workflow-contracts.js`).

## Verification exit codes (one pass; npm chains not looped)
1. `node scripts/test-route-reachability.js` → exit 0 (Route-reachability test passed (281 assertions))
2. `node scripts/validate-workflow-contracts.js` → exit 0
3. `node scripts/validate-kaola-workflow-contracts.js` → exit 0
4. `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` → exit 0
5. `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` → exit 0
6. `node scripts/validate-script-sync.js` → exit 0 (byte mirror intact)

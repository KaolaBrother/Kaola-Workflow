evidence-binding: n6-review a74380f7b065
verdict: pass
findings_blocking: 0
finding: id=R1 scope=out_of_scope action=none status=deferred severity=low fix_role=none rationale=edition-dir tables duplicated between generate-routing-surfaces.js and the checker; drift fails closed via --check MISSING red — acceptable, noted for awareness
finding: id=R2 scope=out_of_scope action=none status=deferred severity=low fix_role=none rationale=superset-proof LEGACY_PAIRS enumerates representative T12 announce-line tokens not all three; zero coverage loss (T1..T15 still run unchanged + those are manifest tokens pr-dispatch-card-visibility)

## n6-review — code review of #630 two-layer generation seam (APPROVE)

Repo left BYTE-CLEAN (git hash-object identical before/after all probes; final git status = pre-review state).

### 1. Behavior-preserving no-op capture — CONFIRMED
Diff vs merge-base 3907a3e9 = exactly 2 files: package.json (+8/-4) + scripts/test-route-reachability.js (+327/-0). Rest new/untracked (templates/routing/, scripts/generate-routing-surfaces.js, scripts/test-generate-routing-surfaces.js). All 12 template-shaped surfaces BYTE-UNCHANGED (6 commands empty git diff individually; 6 SKILLs covered by the 2-file diff-stat). generate --check exit 0 "all 12 byte-match". NO @generated in-file banner (impossible by construction; documented out-of-band at generate-routing-surfaces.js:30-31).

### 2. Layer-1 guarantee real, not vacuous — CONFIRMED (LIVE-PROVEN)
deriveObligated (test-route-reachability.js:547-568) COMPUTES each block's obligated file set from topic×runtime_tag×surface_type_tag over claudeEditions/codexEditions; plan-run basename anchored to schema.PLAN_RUN_COMMAND/PLAN_RUN_SKILL (same anchor as T1/T2). NO per-block hand-typed file list — a both/both block structurally obligates all 6. Arithmetic cross-check: 90 obligated file-checks = plan-run 42 + finalize 30 + next 18, matches manifest. All 6 red-proof cases genuinely red (expectRed requires failures.length>0; case5 asserts orphan-surface prefix; case6 asserts foldsGeneric===false; case3 proves derived universe auto-expands). **LIVE plant→revert: removed all 3 `--verdict-check` from plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md → test-route-reachability.js EXITED 1 with `MANIFEST missing-token: block fn-gate-barrier token "--verdict-check" absent from …finalize/SKILL.md`; restored via git checkout --; git hash-object identical. THE #624 WHOLE-BLOCK-DROP CLASS IS CLOSED by the new layer.** Reverse orphan-sentinel sound (markerToBlock; 5 FOREIGN_MARKERS = structural CARDs by other contracts; a manifest-block deletion whose marker survives reds — case5).

### 3. Additive superset, no coverage lost — CONFIRMED
Checker diff has ZERO deletion lines; T1..T15 byte-untouched; new block inserted between T15 and exit tail. #624-fix pins (--resume-check/--gate-verify/--barrier-check/--verdict-check + workflow_path: adaptive) live in the 4 validators (validate-workflow-contracts.js:528, gitlab :372/:388, gitea :379/:395) — ALL FOUR ZERO DIFF; superset proof also folds all 5 explicitly (:698-702). mr|pr) finalize-sink pins (gitlab :296/:335, gitea :303/:342) untouched. Legacy pins correctly OUT of manifest: T11 adaptive-default-contract (different topics), sonnet/absent NEGATIVE assertions (anti-token can't fold into presence manifest). Residuals (watch-pr forge-rename, final_validation_unverified github-only) documented allow-list entries matching reality.

### 4. Byte mirror — CONFIRMED
diff scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js → empty; neither in diff.

### 5. Oracle — ALL GREEN
test-route-reachability.js (281), validate-workflow-contracts.js, validate-kaola-workflow-contracts.js (codex), gitlab contracts, gitea contracts, validate-script-sync.js (24 common/25 byte-identical), generate-routing-surfaces.js --check (12/12), test-generate-routing-surfaces.js (33) — all exit 0. package.json wiring matches spec (--check in all 4 chains; engine self-test claude-only).

### 6. Engine/checker code quality — sound
renderSkeleton pure (no fs); paths from static tables (no user input → path); --write targets only the 12 derived paths. REGION nesting via depth-count; unterminated REGION / unknown SLOT/SPLICE throw (fail-closed at --check). applyRenames exact-substring split/join (no regex injection; forge names don't contain canonical substring → no double-rename). GENERATED_SURFACES deriveSurfacePath matches checker derivation. condMatches unknown-tag typo fails closed (region drops everywhere → --check red).

### Summary: CRITICAL 0 / HIGH 0 / MEDIUM 0 / LOW 2 (both out_of_scope action=none) → APPROVE. Genuine behavior-preserving no-op: 12/12 byte-identical + generator-reproducible; Layer-1 obligation universe DERIVED, LIVE-red-proven vs #624, strictly additive over untouched T1..T15 + validator pins; all oracles green; repo byte-clean.

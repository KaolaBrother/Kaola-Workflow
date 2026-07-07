evidence-binding: n7-adversary a7c5c76c29f9
verdict: pass
findings_blocking: 0
finding: id=R1 scope=pre_existing action=follow_up status=deferred severity=low fix_role=none rationale=fn-closure-audit 2nd content_token `closure-audit` is a substring of its own `<!-- PIN: closure-audit -->` marker, so a marker-preserving INTERIOR gut of that one finalize block stays green (vacuous against hollowing) — equal to pre-#630 T6 strength, ZERO regression, spec-documented accepted finalize residual (finalize is Layer-1-only, no byte-gen); NOT the #624 whole-block-drop class (P2: deleting the block deletes the marker → reds on both layers). Follow-up: add a distinctive interior token (e.g. sink_incomplete) to fn-closure-audit.content_tokens.

## n7-adversary — CHANGE-GATE adversarial verification of #630 (NOT-REFUTED, high confidence)

Repo BYTE-CLEAN (27-file baseline hash snapshot verified identical after all plants; git status = start state). Change-gate (post-dominates the code nodes) → verdict-check relevant.

### Baseline / no-op capture / chains
- test-route-reachability.js exit 0 (281 assertions incl the 6-case red-proof battery + superset proof + manifest layer over 90 obligated file-checks). generate-routing-surfaces.js --check 12/12 byte-match exit 0. test-generate-routing-surfaces.js 33 assertions exit 0. All four validate-*-contracts.js + validate-script-sync.js exit 0.
- git diff main over ALL commands/ + the three plugins/*/{commands,skills} trees + the four validators = 0 lines — the 12 generated + 6 finalize surfaces are byte-identical to main. --write rendered 12 surfaces + produced ZERO modifications (idempotent no-op live). No @generated banner in any of the 12. Scope exact: only package.json (chain wiring, 4/4 lines) + test-route-reachability.js (327 insertions / 0 deletions) modified; only generator/template files new.

### 8 LIVE falsification plants — every one REDS through the correct layer
- P1 hollow: removed `fast_compliance_unresolved` from gitea finalize SKILL, kept its PIN → FAIL MANIFEST missing-token, exit 1.
- P2 whole-block drop (#624 class): deleted the entire closure-audit block from plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md → MANIFEST reds on both tokens PLUS legacy T6 — TWO independent layers.
- P3 surface-file delete (gitea next SKILL): exit 1 (a pre-existing legacy readFileSync ENOENT crash before the manifest's labeled message — ungraceful but fail-closed; the manifest's own absent-surface path is proven by red-proof case 3).
- **P4 — the drift the OLD regime provably MISSES**: mutated one unpinned prose word on the github plan-run SKILL → reachability test AND codex validator stayed GREEN, but `--check` REDS (exit 1) with a precise committed/rendered diff — and --check is wired into all four chains. LIVE-PROVES the new guarantee class for the 12 generated surfaces.
- P5 rogue marker on the (non-generated) github finalize command → orphan-surface red.
- P7a/P7b manifest self-disarm: deleting fn-gate-barrier from the manifest → superset-proof reds ×5 (the #624 gate flags); deleting fn-closure-audit → 6× orphan-surface + superset red.
- P8 obligation-shrink: re-tagging fn-gate-barrier both/both → claude-live/command (obligating 3-of-6 w/o deleting anything) → superset-proof reds ×5.

### Superset / no-weaker / derivation
Checker diff 0 deletions (T1..T15 byte-unchanged); validators byte-identical to main (no legacy pin dropped, every legacy assertion still executes); mr|pr) gitlab/gitea finalize-sink pins + --resume-check/--gate-verify/--barrier-check/--verdict-check + workflow_path:adaptive confirmed present by grep. Obligated sets DERIVED by deriveObligated from topic+tags × reused edition tables, basenames from schema registry (generate-routing-surfaces.js:84-107 computes paths identically); P8 proved hand-shrinking reds. All 5 FOREIGN_MARKERS live only on Layer-2-covered plan-run surfaces.

### The one residual (R1, non-blocking) — see finding line
The sole green-surviving mutation was gutting the closure-audit block INTERIOR on the gitea finalize SKILL while surgically keeping the bare marker (2nd token `closure-audit` ⊂ marker). Ran the ENTIRE gitea chain against that plant — all green. Does NOT refute: (a) the claimed class is whole-block drop which deletes the marker + reds (P2); (b) byte-identical to the pre-existing T6 pin — zero lost coverage; (c) spec explicitly documents the finalize present-but-wrong-prose residual as accepted (finalize Layer-1 only). The twin pr-frontier-unit has NO such residual — on generated surfaces any byte change reds --check (P4). Follow-up: add `sink_incomplete` (or similar distinctive interior token) to fn-closure-audit.content_tokens.

### Verdict
NOT-REFUTED (high confidence) — 8 planted drifts all red through the correct layer; the old-regime-invisible drift class is now caught (P4); manifest self-disarm + obligation-shrink self-defended; no-op capture + idempotence proven live; T1..T15 + all legacy pins byte-untouched; repo byte-clean. The single surviving mutation is a pre-existing, spec-documented, non-#624-class residual on one finalize block. verdict: pass, findings_blocking: 0.

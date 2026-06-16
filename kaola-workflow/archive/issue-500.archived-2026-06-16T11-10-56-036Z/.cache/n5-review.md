evidence-binding: n5-review 9b6e842ab553

# n5-review — G1 gate over n2 (code) + n3 (prose)

verdict: pass
findings_blocking: 0

Post-dominates n2+n3. Reviewed full accumulated diff (13 files +372/-71) + the new card. n4 already mutation-proved the coupling non-vacuous; this is the standard quality + parity + regression gate.

## Executed evidence (real exit codes)
- `node scripts/edition-sync.js --check` → EXIT 0 ("12 forge aggregator ports in rename-normalized parity with canonical")
- `node scripts/test-adaptive-node.js` → EXIT 0 (1007 assertions)
- `node scripts/test-route-reachability.js` → EXIT 0 (122 assertions, +24 from T8/T9)
- `node scripts/simulate-workflow-walkthrough.js` → EXIT 0

## Dimensions (all PASS)
1. Four-edition parity: codex byte-twin of canonical; leg-couple line byte-identical ×4 (gitlab/gitea 1-line rename offset). 
2. Forge-neutrality: no github/gitlab/gitea/gh/glab/tea vocab leaked into edition ports or SKILLs; new tokens (writeOverlapConsent, resolveLegIsolation, --write-overlap-consent) forge-neutral; recipe block byte-identical (md5 63f10fa6) across 6 surfaces.
3. L1 code quality: only the 3 spec'd edits (4th param :3353, conditional append :3357, leg-couple forward :3824 mirroring provisioning :3908). Formation decision + both degrade branches UNTOUCHED. Disjoint-green byte-identical. No console.log/TODO/debugger.
4. L2 comment reword: comment-only (zero behavior change); adopts ADR-0010 "containment, not construction".
5. L3 prose: 6 surfaces consistent (PIN: leg-isolation-recipe, CARD: speculative-open, --write-overlap-consent ×2, --speculative-consent); card well-formed + README-registered; route-reachability pins unconditional (T6 shape, disavows the T5 anyHasPin self-disarm bug).
6. Regression: all 3 fast scripts EXIT 0.

## Safety claim grounded (not aspirational)
The recipe's "serial-degrades safely — no cross-contamination, no silent loss" is enforced: formation gate :3824 couples a shared-infra group's formation to leg provisioning (no legs ⇒ no group ⇒ serial degrade), and the close-side member_vacuity guard :4306-4307 probes the leg via legCtx — an agent writing parent-side instead of its leg yields an empty leg → loud member_vacuity refusal at close, never a silent empty merge.

## Findings (LOW, non-blocking — filed as follow-up #514)
finding: id=R1 scope=in_scope action=follow_up status=open severity=low fix_role=none rationale=stale "until Slice 3" fragment in reworded L2 comment at adaptive-node.js:3374 (+3 ports); Slice 3 shipped (AC18 PASS); zero-behavior comment wording — filed #514
finding: id=R2 scope=in_scope action=follow_up status=open severity=low fix_role=none rationale=T9 block-header comment says PIN:speculative-open but assert correctly checks present CARD:speculative-open marker (test-route-reachability.js); cosmetic, assertion correct — filed #514

VERDICT: PASS — mergeable, no blocking defects. Four full edition chains remain the FINALIZE node's job.

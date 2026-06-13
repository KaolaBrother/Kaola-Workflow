evidence-binding: adversarial 621619a634e4

verdict: pass
findings_blocking: 0

adversarial-verifier (opus, read-only, burden inverted: refuted-if-uncertain) — attempted to DISPROVE "#453 removed the per-node FILE_CEILING and weakened NO other write-safety wall." NOT-REFUTED (high confidence). Probed dynamically (executing validatePlan/freezePlan/barrierCheck on adversarial fixtures) across all 4 editions.

Structural: the diff deletes ONLY the FILE_CEILING const+export (adaptive-schema ×4) and the single `if (n.writeSet.size > schema.FILE_CEILING)` comparison at plan-validator.js:~1074 (×4). That block sat AFTER the per-token shape loop and is independent of every disjointness loop and of barrierCheck (pure set-membership). Errors accumulate (no early return) → only behavioral delta is the count refusal's disappearance. No surviving live `.FILE_CEILING` read anywhere (`'FILE_CEILING' in schema === false`), so attack #11's `x > undefined` concern has no comparison left.

12 attacks — each STILL REFUSED with its reason code:
1. directory-shaped `src/`/`./lib/`/`src//` → directory-shaped. 2. `..` tokens → contains '..'. 3. absolute/`C:\`/backslash → absolute_path / backslash_in_path. 4. bare existing dir → directory_shaped_bare. 5. case-collision → case_collision. 6. empty-normalized → token_empty_normalized. 7. canonical aggregator alone → generated_port_split (names 3 missing peers). 8. read-only role + write set → refuse. 9. KEY NEW RISK — large (12-file) antichain siblings with the shared file placed LAST → "parallel non-fanout write overlap"; large select arms overlap → refuse; large fanout members overlap → refuse; large DISJOINT fan-out/select → in-grammar. The count-wall removal did NOT short-circuit the pairing loops. 10. code node with no post-dominating reviewer → G1. 11. no surviving schema.FILE_CEILING read. 12. barrier: 12-file declared + out-of-set write `src/EVIL.js` → write_set_overflow; sensitive out-of-set → refuse; all-in-set (incl last file) → pass. Size-independent.

Positive capability confirmed: a 12-exact-file node freezes in-grammar on all 4 editions; full walkthrough exits 0.

Verdict: PASS — could not construct any dangerous plan that now freezes in-grammar; every other wall refuses exactly as before with unchanged reason codes across all 4 editions.

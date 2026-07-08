evidence-binding: n5-review 3964e5c08696

verdict: pass
findings_blocking: 0

finding: id=R4-REREVIEW scope=in_scope action=none status=resolved severity=high fix_role=none rationale=hollow-stub guard confirmed correct, complete, RED-proven, edition-faithful, zero regression

## n5-review RE-REVIEW — R4 fix delta (#634 metric-optimizer, checkEvidenceShape hollow-stub guard)

Verdict: APPROVE. The R4 repair is correct and complete; nothing regressed.

1. House pattern — conforms. New `role === 'metric-optimizer'` branch (adaptive-node.js:1074-1086) sits after the universal n/a carve-out exactly like tdd-guide/implementer siblings; same return shapes ({ok:false,kind:'absent',missingTokenClass:'non-empty'} on missing; {ok:false,kind:'shape',missingTokenClass:<token>,reason,expected} on FIRST empty token; {ok:true} when all present); presence/non-empty only via `^<token>:[ \t]*(\S.*)$` (never validates value, per contract). Four token literals contain only _/- (no regex metachars) → un-escaped new RegExp safe.
2. Token set exact. ROLE_TOKEN_REGISTRY['metric-optimizer'] (plan-validator.js:210) = [evidence-binding, metric_baseline, metric_final, iterations_used, regression-green]; branch enforces the four non-binding tokens (evidence-binding at function top). None missed/extra.
3. Edition ports faithful. edition-sync --check → "10 forge aggregator ports in rename-normalized parity"; validate-script-sync → "OK: 24 common, 27 byte-identical groups, 8 rename-normalized families, 2 hooks.json families in sync". Machine-proven regen, not hand-edits.
4. Test genuinely RED-first. T7m block (test-adaptive-node.js:411-463) imports the real exported checkEvidenceShape; hollow-stub fixture byte-mirrors seedEvidenceFile output (adaptive-node.js:614-641). Independently proved RED without mutating repo: extracted HEAD pre-fix checkEvidenceShape → hollow stub → {ok:true} (pre-fix ACCEPTED, defect real); fixed code refuses with kind:'shape',missingTokenClass:'metric_baseline'. T7m also covers partial-fill/full/absent.
5. No regression. test-adaptive-node.js → "adaptive-node tests passed (1491 assertions)" exit 0; walkthrough → "passed" exit 0. tdd-guide/implementer/main-session-gate branches byte-untouched; generic tail unchanged. optimizeDispatchCtx/buildDispatch in the same file are the previously-approved dispatch threading, untouched by R4.

Considered and dropped: #319 missingTokenClass header enumeration not extended — already non-exhaustive for prior additions, matches house style; test-run-chains not raised (#635-class known non-issue).

## Review Summary: CRITICAL 0 / HIGH 0 / MEDIUM 0 / LOW 0 → APPROVE — R4 fix correct, complete, edition-faithful, RED-proven, regression-free.

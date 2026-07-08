evidence-binding: n3-review 3ad8d13438cb
verdict: pass
findings_blocking: 0
finding: id=R1 scope=out_of_scope action=follow_up status=deferred filed=#640 severity=low fix_role=none rationale=OPT-2 metric_paths shape filter omits the write-wall's bare-existing-directory (statSync) and backslash-path shapes; inert today (backslash dies at dispatch on POSIX; bare-dir depends on the runtime consumer + OPT-5 verifier backstop); out-of-scope of the scoped R1/R2/R5/R3/R7 rules which are all correct. FILED as #640.

## Review Summary: CRITICAL 0 / HIGH 0 / MEDIUM 0 / LOW 1 (out-of-scope follow-up, non-blocking, filed #640) → APPROVE — both legs correct, nothing regressed. All checks run live in the worktree.

### #638 leg (edition-sync.js + test-edition-sync.js) — APPROVED
- Hole real; now closed, proven old-vs-new on the SAME planted tree: scratch copy, drifted the COMMON_SCRIPTS codex mirror (kaola-workflow-adaptive-schema.js) + deleted a byte-group copy (plugins/kaola-workflow/hooks/kaola-workflow-pre-commit.sh). origin/main --check GREEN exit 0; new --check exit 1 PARITY FAILED naming both (missing + differs); restore → green exit 0 (no false positive; T10 on real tree).
- Shared primitive genuinely reused: checkMirrors (edition-sync.js:134) calls checkByteIdenticalGroup imported from validate-script-sync.js:409 — the exact primitive; COMMON_SCRIPTS as a degenerate 2-file [canonical,codex] group. No hand-rolled copy.
- runWrite untouched (zero hunks); runCheck not exported (main-only) → mismatch-format change has no external consumer.
- RED-first: checkMirrors absent on origin/main (T9/T10 cannot pass there). test-edition-sync green (41 assertions).

### #639 leg (plan-validator canonical + 3 ports + walkthrough) — APPROVED
- Direct old-vs-new red-proof: ran the new fixture shapes as standalone plans vs origin/main validator (full old scripts tree in scratch) and the new one. All six refusal cases in-grammar on origin/main (real freeze holes) and refuse on the new validator with the right marker: R1 absent metric_command → OPT-2; R2 bench/ dir + bench/*.js glob → OPT-2; R5 bench/../src/hot.js → OPT-2 (classifier.normalizeRepoPath leaves ../ unresolved → alias string-distinct pre-fix); R3 duplicate optimize(opt) → OPT-1; R7 fenced-decoy duplicate in ## Meta → OPT-1. Accepts unchanged: single well-formed block + nested exact-file bench/nested/suite.js metric_path still FREEZE.
- R6 documentation-only correct: cap binds on CONVERTED value — budget_iterations 0x64(=100)/1e3(=1000) refuse OPT-3; in-cap 0x14(=20) freezes. No separate numeric-form rule.
- optimizeHeaderCounts (plan-validator.js:510) uses the byte-identical headerRe + same classifier.sectionBody(content,'Meta') body as parseOptimizeContracts (:455) → parser/counter can't disagree; fenced-decoy refusal verified live; the last-wins clobber (Map.set at flush) is real.
- No OPT-1..6 fixture regressed: full walkthrough green (incl testMetricOptimizerContract battery).

### Cross-edition + provenance
- edition-sync --check green (10 forge ports + 24 COMMON mirrors + 27 byte groups in parity); validate-script-sync green. 3 ports faithful regen, not hand edits.
- Provenance: every added non-comment line in canonical validator + edition-sync scanned for #NNN/D-NNN → CLEAN. Issue refs only in comments (allowed); OPT-1/OPT-2 error strings + logic prose provenance-free.
- test-run-chains.js not raised (#635-class non-issue).

Verdict: APPROVE.

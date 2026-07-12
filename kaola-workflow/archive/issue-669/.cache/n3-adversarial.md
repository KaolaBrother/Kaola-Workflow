evidence-binding: n3-adversarial 5df54e41a01e
verdict: pass
findings_blocking: 0

# n3-adversarial (CHANGE-GATE adversarial-verifier) — issue #669

## Claim Under Test
"For issue #669, node n1 made the plan-validator `--parent-clean-check` dirty-fence truly FAIL-CLOSED
on porcelain-probe failure (it no longer reads a huge/failed `git status --porcelain` as a clean tree),
the `maxBuffer: GIT_MAX_BUFFER` cap was applied to every in-scope porcelain content site across all
editions, and the change is regression-safe."

## Disproof Attempts (all live executions against the REAL patched validator; mutants ran ONLY as
## scratchpad copies — zero repo files touched beyond this evidence file)

### Attack 1 — every error path, not just ENOBUFS: FAILED TO REFUTE
Read the full handler (scripts/kaola-workflow-plan-validator.js:3229-3291): the catch at :3268 has NO
error-type branch — ANY execFileSync throw lands in the typed refuse (`cannot_prove_clean`,
process.exitCode=1, immediate return). Live fault injections, each on a repo with a REAL production
dirty file (src-leak.js), all via a fresh makeLaneRepo-equivalent fixture + the exact runVal invocation
shape from the suite:
- corrupt `.git/index` (n1's regression, reproduced independently):
  {"exitCode":1,"result":"refuse","reason":"cannot_prove_clean"} — never pass.
- chmod 000 `.git/index` (EACCES — a fault family n1 did NOT test):
  {"exitCode":1,"result":"refuse","reason":"cannot_prove_clean"}.
- `.git` deleted entirely (findRepoRoot fallback + root-pin path):
  {"exitCode":1,"result":"refuse","reason":"root_mismatch"} — refused BEFORE the probe; still closed.
- TRUE ENOBUFS PAST THE 64 MB CAP: 140,000 untracked files x ~509-byte porcelain lines = ~68.5 MB
  (> GIT_MAX_BUFFER = 67,108,864). Result:
  {"exitCode":1,"result":"refuse","reason":"cannot_prove_clean","err":["...spawnSync git ENOBUFS"]}
  — the headline scenario (overflow past even the raised cap) refuses in 0.56s, never passes.
Sanity inversions: genuinely clean tree -> {"result":"pass"}; single dirty file -> parent_dirty with
the path enumerated; the 1.26 MB (6000-file) in-suite fixture -> parent_dirty, dirtyCount:6000.

### Attack 2 — sentinel fail-open / upstream swallow: FAILED TO REFUTE
All four handler exits traced (root_mismatch :3246, cannot_prove_clean :3269, parent_dirty :3286,
pass :3289): each refuse sets exitCode=1 and `return`s; the ONLY pass emission requires a successful
probe AND zero non-exempt paths. Upstream: plan read failure -> typed plan_unreadable refuse (:2736);
findRepoRoot (:431) never throws (falls back to startDir, and a non-repo root then FAILS the probe ->
the new catch, proven live above); root-pin catch collapses to toplevel='' -> root_mismatch refuse.
The catch cannot set porcelain to a sentinel: it returns before the parse. `cannot_prove_clean` is
registered in OPERATOR_HINT_REGISTRY (:151) — getOperatorHint cannot throw. Both consumers read
directly: parentCarriesProductionDirt (adaptive-node.js:4263-4269) and the last-member close fence
(adaptive-node.js:5904-5907) both use the literal `fence.exitCode !== 0 || fence.result !== 'pass'`
predicate — the new reason classifies as dirt/refuse with zero consumer changes.

### Attack 3 — masked-fix detection (mutation testing, scratchpad copies only): FAILED TO REFUTE
Built two mutants of the validator in the scratchpad (requires rewired to $WT/scripts; repo untouched):
MASKED = cap kept + catch reverted to `porcelain = ''`; ORIGINAL = no cap + swallow (pre-#669 shipped
shape). Matrix (identical fixtures, identical invocation):
- PATCHED:  corrupt-index -> refuse cannot_prove_clean (1); 1.26MB-dirty -> refuse parent_dirty (1).
- MASKED:   corrupt-index -> {"exitCode":0,"result":"pass"}  <-- BARE PASS;
            1.26MB-dirty -> refuse parent_dirty (1)          <-- ENOBUFS fixture alone would NOT catch it.
- ORIGINAL: corrupt-index -> bare pass; 1.26MB-dirty -> bare pass  <-- the original fail-open bug, live.
Therefore the PARENT-CLEAN-CHECK-CANNOT-PROVE-CLEAN assertion (test-adaptive-node.js: `r.result ===
'refuse' && r.reason === 'cannot_prove_clean' && r.exitCode !== 0`) goes RED against a masked fix —
the corrupt-index test IS what pins the catch semantics, proven by execution, not inspection. The only
unpinned mutant direction is flip-kept/cap-removed, which fails SAFE (refuses cannot_prove_clean at
>1MB instead of enumerating parent_dirty — noisier, never a false pass): not a defect, no finding.

### Attack 4 — deferred residuals genuinely pre-existing: FAILED TO REFUTE
`git show HEAD:scripts/kaola-workflow-adaptive-node.js` (4519-4524) and `HEAD:scripts/
kaola-workflow-claim.js` (479-488) show both catches (`dirty = ''`; `return 'missing'`) byte-identical
BEFORE this diff — the diff adds ONLY the maxBuffer option (verified in git diff), strictly reducing
each site's failure probability. n2's corrections verified against source: adaptive-node.js:7110-7111
does say leg provisioning is "LIVE since #542 ... no longer dormant" (n1's 'dormant' support was
stale); the leg_omitted_from_merge check (plan-validator.js:3181-3196) verifies branch resolution +
`merge-base --is-ancestor legHead M` ONLY — no content-completeness check (blind spot real);
cmdSweepLegacyWorktrees (claim.js:~3455) branches only on state==='dirty' for protection. Deferral is
in-mandate: the frozen plan (step 3/4) says ":3253 is the one that categorically MUST fail closed" and
asks decide-and-justify for the rest; n2 carries both as open follow_up findings (action=follow_up,
non-blocking by vocabulary). Neither residual falsifies the fence claim, the cap claim, or
regression-safety.

### Attack 5 — regression-safety + cap coverage sweep: FAILED TO REFUTE
- node scripts/test-adaptive-node.js -> "adaptive-node tests passed (1770 assertions)" (= n1/n2 count).
- node scripts/simulate-workflow-walkthrough.js -> "Workflow walkthrough simulation passed", exit 0.
- node scripts/edition-sync.js --check -> "10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, and
  27 byte-identical groups in parity with canonical." (no silent GENERATED-aggregator drift).
- Independent AST-adjacent sweep over all 4 edition trees: 79 `status --porcelain` sites total; 42
  capped with GIT_MAX_BUFFER = exactly the plan's enumerated in-scope list (canonical 10 + mirrors);
  the 37 uncapped are test harnesses (walkthrough/test-*) plus closure-audit.js:166/173 and
  release.js:44 (+ mirrors) — both OUTSIDE the plan's enumerated list AND verified fail-closed on
  their own catch (`return true` = dirty per #563 comment; `{ok:false, reason:
  'worktree_status_unavailable'}`), so an overflow there refuses, never passes. Converse held: 26
  `git worktree list --porcelain` sites, 0 capped (out of scope by design). The flip + the new
  operator-hint entry are present in all 4 validator copies (grep cannot_prove_clean).
- Standing obligation (not a hole in this node): the diff touches the edition trees, so all four
  npm run test:kaola-workflow:{claude,codex,gitlab,gitea} chains remain REQUIRED before finalize.

## Verdict
NOT-REFUTED (confidence: high) — every constructed counterexample refused fail-closed; the regression
pair is execution-proven discriminating; the cap sweep is exactly the mandated set; suites green.

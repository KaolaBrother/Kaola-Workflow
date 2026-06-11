705b2e520c27
evidence-binding: review 705b2e520c27
verdict: fail
findings_blocking: 1

finding: id=R1 scope=in_scope action=fix status=open severity=high fix_role=implementer rationale=stray-debug-token governance_ack_stale_TEST_PROBE appended to agents/workflow-planner.md:302 (out-of-scope leftover write, not legitimate prose)

# G1 Code-Review Gate — bundle #414/#418/#422

## Verdict: FAIL (1 blocking finding)

One stray out-of-scope write must be removed before finalize. Every other
check point passed: the test coverage, forge smoke scenarios, install-manifest
pair, gitea claim twin, validate-script-sync TOML/config families, parity test,
and validator pins are all correct, byte-parallel where required, and green in
isolation.

---

## BLOCKING FINDING

### [HIGH] R1 — stray debug token in agents/workflow-planner.md
File: agents/workflow-planner.md:302
The bundle diff appends a single orphan line `governance_ack_stale_TEST_PROBE`
after the final paragraph. It is:
  - not legitimate prose (no surrounding sentence, dangling token)
  - referenced NOWHERE else (grep across .js/.md/.toml → only this one hit)
  - NOT a curated FEATURE_TOKEN in test-agent-profile-parity.js
  - the ONLY change this bundle makes to planner.md (the legitimate
    main-session-gate / write_set_granularity content was already at HEAD via #413)
Why the chain did not catch it: every validator uses substring assertIncludes
on planner.md (append-tolerant), the parity test only enforces curated tokens,
and standalone agents/*.md have no byte-identity contract. So the write is
invisible to CI yet still an illegitimate out-of-scope artifact.
FIX: delete line 302 (`governance_ack_stale_TEST_PROBE`); planner.md should be
byte-identical to HEAD for this bundle.

---

## PASSING CHECK POINTS

### 1. #414 sink-side test coverage — PASS
- testSinkMergeBareRemoteDeleteOrder asserts the real ordering via a PATH-first
  `git` trace shim: iDelete < iAncestor < iBranchD. The trace patterns
  ('push origin --delete', 'merge-base --is-ancestor', /branch -D /) match the
  actual sink-merge.js choreography (lines 509/514/518). Order assertions are
  meaningful — they fail if reordered.
- traceLog reset (writeFileSync '') is right BEFORE the sink call, after setup. Correct.
- finally block removes tmp, remotePath, binDir, traceLog. Correct.
- shim placed binDir-first on PATH; execs real git. Correct.
- Ran in the full walkthrough: testSinkMergeBareRemoteDeleteOrder PASSED.
- test-claim-hardening.js: defaultBranch added to destructure; two probe-chain
  assertions test distinct scenarios (symbolic-ref hit → 'trunk'; no-remote
  fallback → 'main', matching the claim.js probe chain). GIT_CONFIG_GLOBAL/
  NOSYSTEM saved+restored around each assertion. Runs green (41 assertions).

### 2. #418.5 forge walkthrough smoke — PASS
- gitlab + gitea testFork...AdaptiveFreezeChecked are byte-parallel (modulo
  forge naming + tmp prefix). SPAWN-1 (--freeze-checked → in-grammar, frozen
  false, planHash non-empty, no plan_hash written) verified by direct run.
  SPAWN-2 (mutated plan + stale governance-ack → refuse/governance_ack_stale,
  frozen false, no write).
- assert.strictEqual/assert.ok correct: both files `const assert = require('assert')`.
- Plan grammar is in-grammar for the fork validator (confirmed by live run:
  result in-grammar). Both forge walkthroughs exit 0.

### 3. #418.2/#418.4 install-manifest + gitea claim twin — PASS
- scripts/ and plugins/ install-manifest copies are BYTE-IDENTICAL (diff empty).
- Exclusion logic accurate: all named exclusions have 0 occurrences in
  SUPPORT_SCRIPTS; ledger-compare.js has exactly 1 (matches the "IS in this
  list" note).
- gitea claim #369 two-line comment is at the BUNDLE-member probe site
  (issueNumbers.length>0 branch, line 1758-1759), NOT the single-issue site
  (line 1761). Matches the gitlab twin byte-for-byte.

### 4. #422.1 TOML triple byte-group — PASS
- fs.readdirSync over plugins/kaola-workflow/agents enumerates all 20 .toml
  files (codex=gitlab=gitea=20, parity holds); uses the existing top-of-file
  `fs` binding (line 6), not an inline require. Three paths correct.
- validate-script-sync.js runs green: "30 byte-identical groups" (10 static + 20 triples).

### 5. #418.1 config/hooks.json family — PASS
- normalizeConfigHooks normalizes ONLY kaola-workflow-codex-compact-resume →
  kaola-{forge}-workflow-codex-compact-resume. Verified the live diff: the
  compact-resume command is the SOLE per-forge difference; the three .sh hook
  tokens (pre-commit/subagent-dispatch-log/write-lane) stay base-named.
- Check loop compares portText vs normalized refStr; reference = codex tree
  plugins/kaola-workflow/config/hooks.json. CONFIG_HOOKS_FAMILY +
  normalizeConfigHooks both exported.

### 6. #422.2 test-agent-profile-parity.js — PASS
- Iterates all agents/*.md; skips profiles lacking a full toml triple (line 46);
  only enforces a token present in the .md. Assertion msg names file/token/path.
- FEATURE_TOKENS (write_set_granularity, main-session-gate) GREEN at HEAD: both
  present in workflow-planner.md AND all three toml twins. Test passes (6 assertions).

### 7. #422.3 validator pins (4 validators) — PASS
- Each validator reads package.json (packageJson binding in the two
  contracts.js copies; read('package.json') in the three forge/codex
  validators) and asserts the claude chain includes test-agent-profile-parity.js.
- Root + plugins validate-workflow-contracts.js are BYTE-IDENTICAL after edit.
- Pin placed before the final console.log in each. All four contract validators
  exit 0 (canonical codex-chain entry validate-kaola-workflow-contracts.js green).

### 8. package.json chain — PASS
- test-parallel.js --self-test inserted after test-parallel-batch.js (correct).
- test-agent-profile-parity.js inserted after test-route-reachability.js, before
  validate-workflow-contracts.js (correct). Chain syntactically valid (no double
  &&, no missing spaces). test-parallel.js exists + supports --self-test.

### 9. Cross-edition parity — PASS
- install-manifest pair byte-identical; validate-workflow-contracts pair
  byte-identical; gitea claim edit at the correct bundle-member site matching
  the gitlab twin; forge walkthroughs byte-parallel.

### 10. Out-of-scope writes — ONE FOUND (R1)
- 14 of 15 modified files are exactly the declared write-set. The 15th,
  agents/workflow-planner.md, contains ONLY the stray R1 token — an out-of-scope
  illegitimate write.

---

## PRE-EXISTING / OUT-OF-SCOPE (non-blocking)

finding: id=R2 scope=pre_existing action=none status=open severity=low fix_role=none rationale=test-bash-block-guards.js fails identically on the untouched main-repo baseline (#361/#412 worktree-mirror + ledger-compare fixtures); NOT modified by this bundle, NOT a regression
finding: id=R3 scope=out_of_scope action=none status=open severity=low fix_role=none rationale=install-manifest exclusion comment names three files with a kaola-workflow- prefix (kaola-workflow-edition-sync.js / -fixtures-orphan-legality.js / -release-surface-drift.js) whose real filenames have NO prefix (edition-sync.js etc.); comment-accuracy nit only, SUPPORT_SCRIPTS array is correct

- R2: the full claude chain exits 1 ONLY at test-bash-block-guards.js, which is
  NOT touched by this bundle and fails identically on the clean main-repo
  baseline. Pre-existing, out of scope for #414/#418/#422.
- R3: minor comment-accuracy nit in the install-manifest exclusion enumeration
  (three names carry a spurious kaola-workflow- prefix). Behavior unaffected;
  optional follow-up.
- The bare plugins/kaola-workflow/scripts/validate-workflow-contracts.js run
  trips a pre-existing path-resolution assumption (commands/ relative base) when
  invoked directly; it is byte-identical to the green root copy and the codex
  chain invokes it via the validate-kaola-workflow-contracts.js entry, which
  passes. Not a bundle defect.

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 1     | block  |
| MEDIUM   | 0     | pass   |
| LOW      | 2     | note   |

Verdict: BLOCK — remove the stray `governance_ack_stale_TEST_PROBE` line from
agents/workflow-planner.md:302 (restore planner.md to its HEAD bytes), then the
bundle is mergeable. All other check points pass.

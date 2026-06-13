evidence-binding: n2-code-review 7e8e4bd4e3f9
verdict: pass
findings_blocking: 0

# n2-code-review — issue-449 (isStepDone version-blindness)

Reviewed the G1 gate for issue #449: `isStepDone()` in `kaola-workflow-release.js`
was version-blind, allowing a stale receipt from version A to short-circuit a
later `--cut` of version B in the same workspace and fabricate `result:ok` while
package.json / tag stayed at A.

## Checklist verification

### (a) RED test drives the real subprocess CLI and fails pre-fix / passes post-fix — CONFIRMED
- T11 invokes the release script via `run()` which uses
  `spawnSync(process.execPath, [RELEASE_SCRIPT, ...args])` against the real
  `RELEASE_SCRIPT = path.join(__dirname, 'kaola-workflow-release.js')`. Not a
  stubbed function call.
- Mutation check: ran the full test suite against the PRE-FIX
  `scripts/kaola-workflow-release.js` (via `git show HEAD:`). T11 failed RED with
  the exact fabricated-pass signature:
    FAIL: T11: result:ok claimed but 5.2.0 tag is absent — fabricated-pass detected; tags=""
    FAIL: T11: result:ok claimed but package.json still at 5.1.0 — fabricated-pass detected
    FAIL: T11: result:ok claimed but CHANGELOG does not contain [5.2.0] — fabricated-pass detected
    test-release: 3 test(s) FAILED, 49 passed
- Against post-fix code T11 passes (all 52 assertions green, see (f)).

### (b) isStepDone is version-keyed; all call sites pass version — CONFIRMED
- `isStepDone(receipt, step, version)` now matches on
  `r.step === step && r.status === 'done' && r.version === version`
  (scripts/kaola-workflow-release.js:247-248).
- All five call sites in runCut pass `version` as the third arg:
  changelog (449), package_json (467), codex_manifest_<i> (479), readme (489),
  git_tag (505).

### (c) git_tag step correctly handled — CONFIRMED (stamps version)
- Pre-fix, every receipt row EXCEPT git_tag already stamped `version`; only the
  git_tag row lacked it. The diff adds `version` to the git_tag append
  (scripts/kaola-workflow-release.js:511:
   `appendReceipt(root, { step: 'git_tag', status: 'done', tag: tagName, version });`).
- This makes the uniform version-keyed isStepDone correct for git_tag too. Every
  step row now carries `version`, so single-version idempotency holds and
  cross-version short-circuit is blocked.

### (d) Single-version idempotent re-run preserved — CONFIRMED
- T10 (R2 regression) cuts 5.1.0 twice with the same version; second run must
  return `{result:'ok', idempotent:true}`, not refuse. Passes post-fix.
- T2/T3/T5/T8 (lockstep, non-monotonic, cut-without-push, crash-resume receipt)
  all pass. Because all rows already carried `version`, the new
  `r.version === version` predicate is satisfied for a same-version re-run, so the
  short-circuit still fires.

### (e) All four edition files carry identical (rename-normalized) change — CONFIRMED
$ node scripts/edition-sync.js --check
edition-sync: 12 forge aggregator ports in rename-normalized parity with canonical.
[exit 0]

$ node scripts/validate-script-sync.js
OK: 21 common scripts, 30 byte-identical groups, 4 rename-normalized families, and 1 config/hooks.json family in sync.
[exit 0]

Diff confirms identical hunks in:
- scripts/kaola-workflow-release.js (canonical)
- plugins/kaola-workflow/scripts/kaola-workflow-release.js (byte-identical copy)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js (rename-normalized)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js (rename-normalized)

### (f) Full test suite — CONFIRMED
$ node scripts/simulate-workflow-walkthrough.js
Workflow walkthrough simulation passed
[exit 0]

$ node scripts/test-release.js
test-release: all 52 assertions passed
[exit 0]

## Findings

finding: id=R1 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=All G1 criteria (a-f) verified; version-keyed isStepDone is correct, RED test is real-subprocess and fails pre-fix, idempotency preserved, four editions in sync, both suites green.

No blocking findings. Change is surgical, well-tested, and cross-edition in sync.

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 0     | pass   |
| LOW      | 0     | pass   |

Verdict: APPROVE — version-blind isStepDone bug fixed correctly, real-subprocess regression test added, all four editions in sync, full suite green.

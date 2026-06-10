verdict: pass
findings_blocking: 0

# review — G1 gate evidence (issue #358, code-reviewer, opus)

## Scope reviewed (uncommitted working-tree vs HEAD)
NEW scripts/test-parallel.js (runner + embedded --self-test); package.json one "test:parallel" key; probeTimeoutEnv() byte-verbatim x3 + 13 load-sensitive probe substitutions across the three edition drivers.

## Runner correctness — ALL CORRECT
Never-short-circuit (Promise.allSettled, runChain only resolves); per-chain Buffer[] isolation (self-test d1-d3); exit propagation (null code->1, process.exitCode=anyFailed?1:0, main never throws); child 'error' resolves code 1; TEST_PARALLEL='1' into every child env (self-test e); spawn shell:false + npmCmd() win32 switch — no maxBuffer hazard (spawn streams, not exec); deterministic input-order summary + roll-up + TAIL_LINES=50 failing tails via injectable logFn; --self-test 13/13 assertions genuinely exercise the claimed behaviors.

## Probe substitutions — ALL CORRECT
Helper byte-identity x3 (uniq -c => 1 line count 3; full 34-line block md5 ce4a8f39517445fc0546fe31c132e5b3 identical x3). Exactly 13 load-sensitive sites substituted (claude 6769/6791/6895/6924/6989; gitlab 2859/2881/3039/3062; gitea 2774/2796/2896/2919). 6 parse-behavior literal sites untouched. No assertion depends on 300ms (outcome-string assertions only) — scaling monotonically safe. 2000ms << 60000ms outer spawnSync ceiling (~58s slack, never escalates to harness kill). testProbeTimeoutEnv exercised in-chain in all three drivers (gitlab/gitea via run() execFileSync at gitlab:710/gitea:788).

## package.json — minimal
Exactly one added key "test:parallel"; "test" + four chain command strings byte-unchanged (gitea line re-emitted only for trailing comma, command byte-identical).

## Acceptance fit — MET x4
All-four-to-completion regardless of failures; per-chain PASS/FAIL summary + failing tail; non-zero exit iff any failed; #307 &&-masking ended.

## MANDATORY #307 FOUR-CHAIN GATE (sequential, recorded)
- claude: exit 0 — "Workflow walkthrough simulation passed"
- codex:  exit 0 — "Kaola-Workflow walkthrough simulation passed"
- gitlab: exit 0 — "GitLab Codex workflow walkthrough simulation passed"
- gitea:  exit 0 — "Gitea Codex workflow walkthrough simulation passed"
All four GREEN.

## Self-test
node scripts/test-parallel.js --self-test → exit 0, "self-test: 13 assertions passed, 0 failed".

## Findings
finding: id=R1 scope=in_scope action=none status=open severity=low fix_role=none rationale=dead helper makeShimSpawnFn at scripts/test-parallel.js:195-206 inside selfTest() never called (nodeShimSpawn is the used shim); test-only, zero production effect — optional cleanup, not blocking

Verdict: APPROVE — zero blocking findings.

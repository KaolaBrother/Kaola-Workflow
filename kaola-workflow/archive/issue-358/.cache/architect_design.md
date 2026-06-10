# architect_design — blueprint (code-architect, read-only)

## Verified recon
- Probe-bearing files (ONLY 3): scripts/simulate-workflow-walkthrough.js sites 6735,6757,6861,6890,6955; plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js sites 2825,2847,3005,3028; plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js sites 2740,2762,2862,2885. Codex sims carry zero probe sites.
- Do-NOT-touch siblings: invalid/over-cap parse tests (claude 6814/6843, gitlab 2902/2928, gitea 2817/2844) keep literal values.
- NO timing assertion depends on 300ms (grep Date.now/hrtime/elapsed/duration near probes: empty); all probe assertions are outcome strings (skipped_timeout/detection_timeout/timeout) -> scaling the margin is monotonically safe, no assertion edits.
- Named flake: testClosureAuditExecuteLabelRemovalTimeoutBreaks (conventions.md:39) — probe site claude:6890/gitlab:3005/gitea:2862, in the scaled set.
- runClosureAudit(args,cwd,binDir,extraEnv) is the single env seam (claude:2914, gitlab:133, gitea:131); substitution is call-site-only.
- validate-script-sync.js COMMON_SCRIPTS: test-parallel.js NOT added (no codex mirror needed) — no byte-sync gate.

## Contract (a) runner — scripts/test-parallel.js + package.json
- spawn (shell:false), npmCmd() platform switch; NOT exec (maxBuffer truncation).
- Promise.allSettled over 4 chains spawned at t=0; runChain never rejects, resolves {name, code, stdout, stderr}; child 'error' resolves code 1.
- Per-chain Buffer[] accumulators; TAIL_LINES=50 failing-tail policy; deterministic summary in input order (claude,codex,gitlab,gitea) + roll-up line; process.exitCode = anyFailed?1:0.
- TEST_PARALLEL=1 injected into every child env (the bridge to contract b).
- Testable seam: runParallel({chains, spawnFn, log}) fully injectable; fake chains via node -e shims run in ms.
- Exports: runParallel, runChain, DEFAULT_CHAINS, TAIL_LINES, tail.

## ORCHESTRATOR RULING (write-set constraint)
The barrier refuses ANY undeclared production write (plan-validator.js:478, no +1 grace). A separate scripts/test-test-parallel.js is OUT OF LANE -> the runner unit test ships as a `--self-test` mode INSIDE scripts/test-parallel.js (declared file): `node scripts/test-parallel.js --self-test` drives runParallel with fake node -e shim chains (RED before the file exists; GREEN after) asserting: (1) all four fake chains run to completion despite an early failure, (2) per-chain PASS/FAIL summary lines, (3) exitCode 1 iff any failed / 0 all pass, (4) per-chain buffer isolation, (5) TEST_PARALLEL=1 visible in child env. package.json gains ONLY the test:parallel entry; npm test and all four chain entries stay byte-unchanged.

## Contract (b) flake_margin — ONE canonical helper, byte-verbatim x3
function probeTimeoutEnv() { return { KAOLA_GH_REMOTE_TIMEOUT_MS: process.env.TEST_PARALLEL === '1' ? '2000' : '300' }; }
- Placed adjacent to runClosureAudit in each driver; substitute the 13 load-sensitive call-sites with probeTimeoutEnv(); leave invalid/over-cap sites untouched.
- Margin 2000ms (~6.7x): absorbs 4-chain scheduling starvation; well under runClosureAudit outer timeout 60000 so never escalates to harness kill.
- RED seam: direct assertion probeTimeoutEnv() returns '2000' under TEST_PARALLEL=1 and '300' otherwise (added within the three declared driver files).

## Build order
flake_margin FIRST, then runner (first real parallel run already flake-hardened); both before review. Cross-edition diff (gitlab/gitea trees) -> review node must record all four chains green sequentially (#307); test:parallel is the convenience runner, NOT the gate-of-record.

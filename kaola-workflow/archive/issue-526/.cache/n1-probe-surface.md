evidence-binding: n1-probe-surface 9d13b7632bfa

# n1-probe-surface — cost & race surface of the test chains (read-only probe)

All facts cited from code read in the worktree. Timing figures (~122s/~160s) are from the issue/D-523-01, not re-measured here (that is n3's job).

## 1. Chain structure (`package.json`)

Four chains `test:kaola-workflow:{claude,codex,gitlab,gitea}` (package.json ~lines 37-41). Command counts:
- **claude: 37 `&&`-chained commands** (the dominant chain). codex: 3. gitlab: 5. gitea: 5.
- Claude chain units split by category: ~10 static-analysis validators (validate-script-sync, validate-vendored-agents, edition-sync, validate-workflow-contracts, test-gap-sweep, test-route-reachability, test-agent-profile-parity, test-release-surface-drift, test-edition-sync, bash -n install.sh), ~24 unit tests (test-*.js), and **2 dominant integration units**:
  - `test-adaptive-node.js` (~122s): real `git init` / `git worktree add/remove` / `git commit-tree` / `git update-ref` in `$TMPDIR` scratch repos via `makeLaneRepo()`; 30+ scaffolds. ~34% of chain.
  - `simulate-workflow-walkthrough.js` (~160s, ~246 scenarios): async serial runner; each self-contained scenario allocates its own `mkdtempSync` root. ~44% of chain.
  - Together ≈ 75% of claude-chain wall-clock (matches issue).
- **`&&` exit mechanics:** shell stops at first non-zero exit; the failing command IS the attribution; aggregate exit = first failure's code; subsequent commands never run (fail-fast). No aggregation layer.

## 2. Walkthrough registry (`scripts/simulate-workflow-walkthrough.js`)

- **`SHARED_TMP_NAMES` (~line 12731): 15 members.** They share ONE `tmp = fs.mkdtempSync(os.tmpdir()+'kw-active-folders-')` root allocated in `main()` (~line 13047) and passed by reference through `runSharedTmpGroup(tmp)` (~line 12712). Runner logic (~13042): if ANY selected entry is in the shared-tmp group, run the WHOLE group. This is one indivisible serial unit by construction (D-523-01 constraint #2). Members include the most state-mutating paths: testFinalize, testClaimStatusRelease, testRepair, roadmap tests.
- **231 self-contained scenarios** registered via `add()` in `buildRegistry()` (~12753). Each entry `{name, fn, sharedTmp:boolean}`. Self-contained = `sharedTmp:false`, carries its real fn; shared-tmp = `sharedTmp:true`, fn is a guard-throw placeholder run only via runSharedTmpGroup.
- **FACT — a machine-readable split already exists:** the `sharedTmp` flag marks parallelizable vs must-be-serial. `--only <token>` (exact name or prefix) and `--list` are existing selector handles. `run-chains.js` has `--chains <name,...>`.

## 3. Real-transaction RACE surface

- **Per-scenario isolation is hermetic at the FS layer.** Every self-contained scenario (231/231) + every sub-test in test-adaptive-node.js allocates its own `fs.mkdtempSync(os.tmpdir(), '<unique-prefix>-')` (OS guarantees a unique random suffix). ~170 distinct mkdtemp call-sites in the walkthrough, 15+ in test-adaptive-node.js. No two collide.
- Git ops are all ROOTED inside the scenario's unique tree: `worktree add/remove` (test-adaptive-node LEG-PROVISION ~5391-5421; walkthrough testE2EGitHubMergeFullChain ~6302), `merge --ff-only` (kaola-workflow-sink-merge.js ~412, each scenario builds its own bare remote at `tmp+'-remote'` via initGitRepoWithBareRemote ~4372), `commit-tree`/`update-ref` (makeLaneRepo ~5968/~5725), ledger splices + `--sink` step-ledger (`<tmp>/kaola-workflow/<project>/.sink-tx.json`). **No shared remote, no shared repo, no shared branch across self-contained scenarios.**
- Git config isolation is applied PER-SPAWN: `GIT_CONFIG_GLOBAL=/dev/null` + `GIT_CONFIG_NOSYSTEM=1` (GIT_ISOLATION_ENV ~4357-4360) and `runNode()` (~39-56) scrubs all `KAOLA_*` then re-adds only `KAOLA_ENABLE_ADAPTIVE='0'`. Caveat: per-spawn → only protects spawns that include it; a new concurrent dispatcher must replicate it.
- **RACE HAZARDS — only relevant to IN-PROCESS parallelism (none today because each unit is its own OS process):**
  - module-top `process.env.KAOLA_ENABLE_ADAPTIVE='0'` (walkthrough ~line 19) — harmless serial; a hazard only if scenarios shared one process.
  - `testHarnessSelfCheck` mutates/restores `process.env[KAOLA_TEST_SELFCHECK_SENTINEL_357]` (~12373-12389, restored in finally) — hazard only under in-process concurrency.
  - **The 15-member shared-tmp group is the ONLY intra-walkthrough shared mutable state** (sequential writes into one tmp dir → must stay serial).
- **The four edition chains are fully FS-independent** (separate processes, separate temp roots, no shared writable path). `~/.config/kaola-workflow/config.json` is read-only and neutralized by the KAOLA_* scrub.

## 4. Existing parallelism / isolation infra

- `kaola-workflow-run-chains.js` (~252-287): runs chains STRICTLY serial (`for (const name of chains)` + spawnSync), writes `chain-receipt.json` (per-chain exitCode/duration_ms/accepted_red), has `--chains` subset + `--mock-chain` test hook. **No concurrency primitive, no worker pool.**
- walkthrough `main()` (~13000): fully serial (`await runSharedTmpGroup(tmp)` then `for..of` over registry). Only `--list`/`--only` controls.
- `test-parallel.js` tests `kaola-workflow-parallel-batch.js`; it is NOT a test-runner framework.

## 5. Attribution & exit-code mechanics

- **walkthrough = FAIL-FAST**: `assert()` (~35) throws on first failure; `main().catch` (~14363) prints stack + child stdout/stderr tail (30 lines), sets exitCode=1. First failure stops everything → exact scenario + assertion attribution.
- **test-adaptive-node.js = FAIL-ACCUMULATE**: `assert()` (~77) increments a `failed` counter (no throw); end (~7649) sets exitCode=1 if failed>0. ALL sub-tests run; ALL failures reported.
- A concurrent runner MUST preserve: per-unit exit code (already separate processes), first-failure attribution (which unit + its captured output), aggregate exit 0 iff all pass, and FULL stderr/stdout of failing units (today inline on the terminal → a parallel runner must BUFFER and surface per-unit).

## 6. Decomposition opportunities (for n2-assume)

- **Cross-chain (largest, lowest-risk win):** the 4 chains are independent → run as 4 parallel OS processes. The makespan floor is then the slowest single chain (claude ~574s), so cross-chain parallelism alone does NOT cut the claude chain itself.
- **Intra-claude:** the ~10 pure static-analysis validators read source only (read-only) → trivially parallel with each other and with the 2 heavy units. Critical-path = max(test-adaptive-node ~122s, walkthrough ~160s) if everything overlaps perfectly → theoretical floor ≈ 160s + contention, vs ~574s serial. BUT both heavy units spawn deep subprocess trees → contention risk is real (n3 must measure).
- **Intra-walkthrough (most complex):** 231 self-contained scenarios are FS-isolated → an N-worker dispatcher using `--only` subsets (or process-per-scenario) could overlap them; the 15-member shared-tmp group must run as ONE serial unit in a single worker. Output must be buffered per-unit to keep attribution.
- **Hard constraints any design must keep:** race-safety on real git transactions (met by unique mkdtemp roots IF a new runner replicates the per-spawn env isolation and never shares a repo); shared-tmp group serial; first-failure attribution + clean aggregate exit; #307 four-chain parity (changing the `&&` runner or the 6-copy walkthrough family must keep all four green).

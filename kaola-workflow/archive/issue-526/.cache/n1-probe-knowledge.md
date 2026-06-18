evidence-binding: n1-probe-knowledge 1c35b4411782

# n1-probe-knowledge — external race-safe Node test-parallelism knowledge (read-only)

Retrieved 2026-06-18. Cited sources at bottom. Suite is hand-rolled Node scripts `&&`-chained in package.json (no jest/vitest); dominant units run real git worktree/merge/update-ref/--sink in $TMPDIR.

## 1. Process-level concurrency mechanisms (comparison)

| Mechanism | Exit-code | First-failure attribution | Per-unit output | Isolation | Verdict for this suite |
|---|---|---|---|---|---|
| `node --test --test-concurrency N` | exit 1 if any fail (boolean) | per-file pass/fail (not original code) | buffered per file | child process per file | Viable IF scripts exit 0/non-zero (they do); must pass files explicitly (names don't match default `*.test.js` glob); does NOT scrub env by default |
| GNU `parallel --group --halt soon,fail=1 --joblog` | last-failing job's code (default = count of failures) | `--joblog` (seq, runtime, exit status, cmd) | `--group` buffers per job | process per job | Viable CLI option; `--group`+`--joblog` recover attribution |
| `xargs -P` | 123 (any 1-125), not original code | none (interleaved) | interleaved | process | Too weak — loses ordering + real exit code |
| `npm-run-all --parallel --aggregate-output` / `concurrently --kill-others-on-fail` | non-zero if any fail | per-script label | buffered (aggregate-output) | npm subprocess | Operates on npm SCRIPT names → would need package.json restructure |
| Custom Node orchestrator (spawn + p-limit) | exact per-child code | full, buffered per child | fully buffered | child process w/ explicit env | **Best fit** — most control, reuses existing `runNode()` env scrub |
| Worker threads | n/a | n/a | shared stream | shared process | **WRONG** — `process.chdir()` unavailable in workers; shared env; unsafe for git/fs tests |

**Best fit = custom Node orchestrator OR `node --test --test-concurrency`** (process-per-unit, exit-code-driven, buffered output). The existing `runNode()` helper already does correct env scrubbing.

## 2. Hermetic per-unit isolation (git + filesystem)

- **Unique temp root per unit:** `fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'prefix-'))` — 6 random chars guarantee uniqueness; `realpath` matters on macOS (os.tmpdir() is a symlink `/var/folders/...`). NEVER share a fixed subdir name across concurrent units (the dominant fs race). The suite already uses mkdtempSync per scenario.
- **Git config isolation per process:** `GIT_CONFIG_GLOBAL=/dev/null` + `GIT_CONFIG_NOSYSTEM=1` (the suite already does this at ~44-46). For concurrency, pass each child its OWN env copy (child_process `env:`), never worker_threads SHARE_ENV. `GIT_CONFIG_COUNT/KEY_n/VALUE_n` can inject user.name/email per-process without a file.
- **Child processes, not worker threads:** workers can't `chdir` and share the process handle → wrong for cwd-sensitive git tests. The suite's spawnSync-with-explicit-cwd model is already correct.
- **Concurrent `git worktree add/remove` against the SAME repo RACES** on: `$GIT_DIR/worktrees/` registry, `refs/heads` + `refs/remotes` namespace (`<ref>.lock`), `.git/packed-refs` (`packed-refs.lock`), `.git/config`. Object store writes are safe (atomic rename). Contention → transient `fatal: cannot lock ref ...`. **Mitigation (established practice):** separate repos per worker (gold standard; the suite already uses separate mkdtemp repos per scenario), OR same parent + unique branch + unique worktree path + `git worktree add --lock`, plus retry-on-`.lock` (3-5x, ~200ms backoff) as a secondary guard, NOT the primary strategy.
- **For THIS suite:** because each self-contained scenario has its own mkdtemp repo, cross-scenario git ops do NOT contend. The binding constraint is the 15-member shared-tmp group (one tmp root → one serial lane).

## 3. Deterministic first-failure attribution under concurrency

- Serial `A && B && C` gives: exact first-failure identity, exit = that command's code, zero interleaving, zero re-attribution ambiguity. All weaken under concurrency without mitigation.
- **Established solution (all major parallel runners):** each worker writes stdout/stderr to a per-unit BUFFER/temp file; flush as a cohesive unit on completion; aggregator computes per-unit pass/fail + combined exit + ordered report. This preserves the serial diagnostic value per-unit.
- Fail-fast (`--halt soon,fail=1` / `killOthersOnFail`) vs run-to-completion. For a correctness GATE, **fail-fast + buffered output matches serial behavior** (stop at first failure, emit its full output, exit non-zero) — the right posture.
- TAP 14 has no provision for interleaved concurrent output (strict 4-space indentation; concurrent raw stdout = invalid TAP) → needs per-worker independent TAP streams aggregated post-hoc. The hand-rolled suite has no TAP; the equivalent is recording (script-name, exit-code, stdout, stderr) per run.

## 4. Measurement integrity (makespan net of contention)

- **`hyperfine`**: ≥10 runs / ≥3s default; `-w N` warmup (critical for IO-heavy: stabilizes disk cache); mean±stddev + outlier detection; `--export-json`. For IO-bound suites use `-w 2` minimum.
- **D-523-01 found ~28% run-to-run jitter** (walkthrough 140s→180s same machine). → a single serial-vs-parallel comparison is NOT credible evidence; a false ~40s "speedup" sits inside the noise. Minimum credible method: `hyperfine -w 2 -r 5`, compare MEDIANS, win must exceed ~2× the serial stddev.
- **Contention can erase or invert the win:** concurrent units each spawn subprocess trees; on a 4-core machine, N concurrent heavy scripts = N× subprocess fan-out → IO/scheduler saturation. The two dominant units (test-adaptive-node ~34%, walkthrough ~44%) both spawn heavy trees; overlapping THEM is the biggest potential win but the biggest contention risk. Measure N=2 and N=4 to find the knee (where adding concurrency regresses).

## 5. When SERIAL is the right posture (authoritative)

- "Parallel execution doesn't create problems — it exposes problems that existed due to shared state." Integration tests touching shared resources are the classic failure case.
- "Too many parallel processes amplify flaky tests" — latent timing-sensitive tests that pass serially become flaky under CPU/IO jitter.
- Consensus: **serial is correct when isolation cannot be GUARANTEED; isolation must be DEMONSTRATED, not assumed**, especially for fs/git-mutating tests. A flaky gate (false negatives = shipped bugs + false positives = wasted investigation) is strictly worse than a slow-but-correct gate — matches CLAUDE.md precedence #1 and D-523-01's "flaky gate worse than a slow one."
- The shared-tmp group (testFinalize/testClaimStatusRelease/testRepair/roadmap) is the most state-mutating code and is the binding serial constraint — a design that can't isolate it to its own serial lane cannot fully parallelize the suite.

## Sources
- Node.js Test Runner (`--test-concurrency`, child-process-per-file, exit-code semantics): https://nodejs.org/api/test.html
- Node.js worker_threads (no chdir, shared handle): https://nodejs.org/api/worker_threads.html
- GNU parallel (`--group`/`--halt`/`--joblog`/exit codes): https://www.gnu.org/software/parallel/man.html
- xargs(1) exit codes + indeterminate output: https://man7.org/linux/man-pages/man1/xargs.1.html
- git-worktree (shared registry/refs): https://git-scm.com/docs/git-worktree
- git-config (GIT_CONFIG_GLOBAL/NOSYSTEM/COUNT): https://git-scm.com/docs/git-config
- TAP 14 spec: https://testanything.org/tap-version-14-specification.html
- hyperfine (warmup/medians/json): https://github.com/sharkdp/hyperfine
- npm-run-all (--parallel/--aggregate-output): https://github.com/mysticatea/npm-run-all
- fs.mkdtemp secure temp dirs: https://advancedweb.hu/secure-tempfiles-in-nodejs-without-dependencies/
- Worktree lock contention (parallel agents): https://github.com/anthropics/claude-code/issues/55724
- Parallel test flakiness amplification: https://makandracards.com/makandra/495461-many-parallel-test-processes-amplify-flaky-tests ; https://deflaky.com/blog/parallel-test-execution-flaky
- Local: docs/decisions/D-523-01.md, package.json, scripts/simulate-workflow-walkthrough.js

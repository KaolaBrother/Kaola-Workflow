#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-gitea-workflow-run-chains.js (issue #432 — D-432-01)
//
// Machine-verifiable chain receipts. Runs the four test chains via
// child_process (NOT shell pipes — captures real exit codes), writes a
// structured chain receipt to .cache/chain-receipt.json, and exits 0 iff every
// non-waived chain passed.
//
// CONCURRENCY (#529): the four chains are independent OS process trees (separate
// $TMPDIR roots, read-only config — proven race-safe + attribution-preserving in
// #528/D-528-01). On a host with real core headroom they run CONCURRENTLY, cutting
// the four-chain makespan from sum-of-chains (~25-28 min) toward max-of-chains (~the
// slowest single chain, ~12 min). The dispatch is CORE-COUNT-GATED: a constrained
// host (< MIN_CORES_FOR_CONCURRENCY cores — the ≤4-core case D-528-01 could not prove
// safe) falls back to the byte-equivalent SERIAL path. Out-of-order completion is
// re-sorted to canonical KNOWN_CHAINS order before the receipt is written, so
// per-chain attribution + receipt ordering are preserved.
//
// Usage:
//   node kaola-gitea-workflow-run-chains.js [options]
//
// Options:
//   --chains <name,...>           Comma-separated chain names to run (default: claude,codex,gitlab,gitea)
//   --accept-known-red <name>:<issue>  Waive a known-failing chain (repeatable)
//   --project <issue-N>           Write the receipt under kaola-workflow/<issue-N>/.cache/chain-receipt.json
//                                 (the plan-dir the validator --finalize-check reads). Resolved against
//                                 the git top-level so it matches whether run from the worktree root or
//                                 the repo root. See --plan for an explicit plan path.
//   --plan <plan-path>            Write the receipt under <dir-of-plan>/.cache/chain-receipt.json — the
//                                 EXACT plan-dir the validator derives from its plan-path argument.
//   --output <path>               Override the receipt output path (default: .cache/chain-receipt.json)
//   --mock-chain <name>:<script>  (for testing) Replace a chain's command with a shell script
//   --json                        Emit a brief summary JSON to stdout after completion
//
// RECEIPT PATH (#546): plan-validator --finalize-check reads the chain receipt from
// <plan-dir>/.cache/chain-receipt.json where plan-dir == path.dirname(<plan-path>). Run from the
// worktree root (the #466 contract), the producer's bare cwd default (.cache/chain-receipt.json)
// lands at the WORKTREE ROOT, not under kaola-workflow/<project>/ — so the gate reads nothing and
// refuses chains_unverified. Pass --project <issue-N> (or --plan <path>) to land the receipt where
// the gate reads it. Precedence when several are given: --output > --plan > --project > cwd default.
//
// Env:
//   KAOLA_RUN_CHAINS_CONCURRENCY  auto (default) | serial | <N>  — pool size for the chain
//                                 dispatch. "auto" gates on core count; "serial"/"1" forces the
//                                 serial fallback; "<N>" forces a pool of N (clamped to chainCount).
//   KAOLA_RUN_CHAINS_TIMEOUT_MS   per-chain timeout in ms (default 1800000 / 30 min, #608 —
//                                 raised from the prior 900000/15min default, #512; a killed
//                                 chain's receipt entry carries `timed_out: true`, see below).
//   KAOLA_RUN_CHAINS_RETRY        max attempts PER CHAIN on a transient-infra fault (default 2 —
//                                 i.e. one retry; #550). Clamped to a >=1 integer; invalid -> default.
//
// RETRY (#550): a chain that exits non-zero is re-run ONLY when its captured output carries a
// POSITIVE transient-infra signature (TLS/handshake/ETIMEDOUT/ECONNRESET/429/EAI_AGAIN/5xx — the
// classifier's exported `isTransientFetchStderr`). A determinate red (non-zero with NO transient
// signature) is NEVER retried (precedence #1: retry must never flip a determinate red to green); a
// 900s timeout kill is non-retryable by default (a 12-min hang re-run doubles makespan for little
// gain). Retry is PER-SPEC inside the concurrent worker, so a transient on one chain never re-runs
// the other three. The receipt records the FINAL attempt's exit code + the attempt count.
//
// Receipt schema (.cache/chain-receipt.json):
//   {
//     "headSha": "<git HEAD sha>",
//     "workTreeHash": "<sha256 of git diff HEAD, or 'clean'>",
//     "codeTreeHash": "<#547: sha256 of the code-relevant landable tree — the freshness key the",
//                      // --finalize-check gate recomputes (replaces the headSha pin: a docs-only /
//                      // workflow-state-only commit no longer forces a re-run). null on git failure.>
//     "validationTestConsumes": ["<#547: the plan's validation_test_consumes band widening, replayed",
//                                // by the gate so it computes the identical band; [] when none.>"],
//     "startedAt": "<ISO timestamp>",
//     "completedAt": "<ISO timestamp>",
//     "scope": {                        // #725 (B1): the finalize-scoped chain-selection decision.
//       "decision": "claude-only",       // claude-only | all-four | explicit | no_narrowing
//       "reason": "non_edition_diff",    // non_edition_diff | edition_coupling | base_unresolved | ...
//       "base": "<merge-base sha>",       // the diff base finalize scoped against (null if unresolved)
//       "touchedEditionPaths": [],        // the changed paths that forced all-four (diff evidence)
//       "changedFileCount": 3             // # of changed files vs the base
//     },                                  // AUTO-SET only for a finalize-context run (--project/--plan)
//                                         // with no --chains/--mock; the bare release path is unscoped.
//     "preamble": {                      // #725 (B2): steps HOISTED out of >1 chain, run ONCE.
//       "steps": [ { "command": "...", "duration_ms": 12, "exitCode": 0 } ]
//     },
//     "chains": [
//       {
//         "name": "claude",
//         "exitCode": 0,
//         "command": "npm run test:kaola-workflow:claude",
//         "duration_ms": 12345,
//         "accepted_red": false,
//         "accepted_red_issue": null,
//         "steps": [                    // #725 (B0): the per-step timing/verdict decomposition (a
//                                        // hoisted repeat lives in receipt.preamble, not here). A
//                                        // one-step (mocked) chain carries a single entry.
//           { "command": "node scripts/...", "duration_ms": 234, "exitCode": 0 }
//         ],
//         "attempts": 1,                // #550: how many times this chain ran (>1 == a transient retry)
//         "retried_transient": false,   // #550: true iff a transient signature triggered a re-run
//         "timed_out": false,           // #608: true iff the FINAL attempt was killed by the per-chain
//                                        // timeout (KAOLA_RUN_CHAINS_TIMEOUT_MS); absent on a legacy
//                                        // receipt predating this field ⇒ treated as false by readers.
//         "signal": null                // #618: the OS signal name (e.g. "SIGKILL") that terminated the
//                                        // FINAL attempt's child process, or null on a normal exit. A
//                                        // signal death (status===null) ALWAYS maps exitCode to 1 —
//                                        // never a false green — whether it is our own timeout kill
//                                        // (timed_out: true, signal usually "SIGTERM") or an EXTERNAL
//                                        // kill unrelated to our timer (timed_out: false, e.g. an
//                                        // OOM-kill / operator SIGKILL, signal "SIGKILL").
//       }
//     ]
//   }
//
// FORGE-NEUTRAL: this file carries no forge-specific CLI tokens and makes no
// forge API calls. The codex plugin copy is byte-identical; the gitlab/gitea
// ports are rename-normalised identical.
//
// SELF-HOST-ONLY (#475): this producer runs the built-in npm edition chains for the
// Kaola-Workflow self-host. A consumer (non-npm) product repo does NOT run it — its
// finalize gate is the agent-recorded `.cache/final-validation.md` evidence, enforced
// by `plan-validator --finalize-check` (consumer mode). The v6.2.0 `kaola-workflow/chains.json`
// consumer escape hatch is retired (Pure option A — no opt-in middle-ground).
// ---------------------------------------------------------------------------

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const crypto = require('crypto');
// #550: REUSE the classifier's single transient-infra signature surface (do NOT copy the array — one
// drift surface). isTransientFetchStderr returns true iff captured stdout/stderr carries a known
// transient-infra signature (TLS/handshake/ETIMEDOUT/ECONNRESET/429/EAI_AGAIN/5xx, classifier ~:853).
const { isTransientFetchStderr } = require('./kaola-gitea-workflow-classifier.js');

// #666: cap unbounded-in-repo-size git spawnSync/execFileSync calls at 64 MB — Node's default
// maxBuffer is 1 MB, and a repo-size-scaling diff/listing can exceed it and crash with ENOBUFS.
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

// Crash-safe durable write for the chain receipt: tmp + fsync + atomic rename (+ a fail-soft parent
// directory fsync, since a rename's directory entry is not itself durable until the containing
// directory is synced). A bare writeFileSync opens O_TRUNC, so a crashed RE-RUN destroys the prior
// receipt before it can replace it — throwing away a 20-25 minute artifact and forcing a full re-run.
// It has no fsync either. This is a COST guarantee, not a gate: both readers (--finalize-check /
// --release-check) already fail closed on unparseable JSON with `chains_unverified`.
//
// Deliberately a LOCAL copy of the adaptive-schema primitive rather than a require of it: this file
// is a rename-normalized forge family, so the gitlab/gitea ports are byte-derived by rewriting every
// `kaola-workflow-<name>` token to `kaola-{forge}-workflow-<name>`. adaptive-schema is base-named in
// ALL four trees (it is the cross-edition byte anchor), so a require of it here would normalize to a
// `kaola-{forge}-workflow-adaptive-schema` module that does not exist and break both forge ports.
// The helper below carries no forge-renameable token.
function writeReceiptAtomic(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, '.' + path.basename(filePath) + '.' + process.pid + '.'
    + Date.now() + '.' + Math.random().toString(16).slice(2) + '.tmp');
  let fd;
  try {
    fd = fs.openSync(tmp, 'wx');
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, filePath);
  } catch (err) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) {} }
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw err;
  }
  let dirFd;
  try {
    dirFd = fs.openSync(dir, 'r');
    fs.fsyncSync(dirFd);
  } catch (_) {
    // fail-soft: some platforms/filesystems refuse to open or fsync a directory. The rename above
    // already succeeded; never turn a settled write into a failure here.
  } finally {
    if (dirFd !== undefined) { try { fs.closeSync(dirFd); } catch (_) {} }
  }
}

const KNOWN_CHAINS = ['claude', 'codex', 'gitlab', 'gitea'];

const CHAIN_COMMANDS = {
  claude: 'npm run test:kaola-workflow:claude',
  codex:  'npm run test:kaola-workflow:codex',
  gitlab: 'npm run test:kaola-workflow:gitlab',
  gitea:  'npm run test:kaola-workflow:gitea',
};

// Parse a command string into [cmd, ...args] for spawnSync (no shell).
// For `npm run <script>` we use the npm executable directly.
function parseCommand(cmd) {
  const parts = cmd.split(/\s+/).filter(Boolean);
  return parts;
}

// #529: core-count-gated concurrent chain dispatch.
//
// Each chain spawns a subprocess TREE (node -> npm -> walkthrough -> git/finalize/sink),
// so concurrent chains need real core headroom or they oversubscribe and INVERT the win
// (the ≤4-core regime D-528-01 measured). resolveConcurrency returns the dispatch pool
// size (1 == serial). Auto policy: SERIAL below MIN_CORES_FOR_CONCURRENCY cores (the
// constrained-host case D-528-01 could not prove safe — stays on the byte-equivalent
// fallback), else min(chainCount, floor(cores / CORES_PER_CHAIN)).
//
// Env KAOLA_RUN_CHAINS_CONCURRENCY: unset / "auto" -> auto by core count; "serial" / "1"
// -> force serial; "<N>" (positive int) -> force pool size N (clamped to [1, chainCount]).
const MIN_CORES_FOR_CONCURRENCY = 8;
const CORES_PER_CHAIN = 2;
function resolveConcurrency(env, cpuCount, chainCount) {
  const cores = (Number.isFinite(cpuCount) && cpuCount > 0) ? Math.floor(cpuCount) : 1;
  const n = Math.max(1, chainCount || 1);
  const raw = ((env && env.KAOLA_RUN_CHAINS_CONCURRENCY) || '').trim().toLowerCase();
  if (raw === 'serial' || raw === '1') return 1;
  if (raw && raw !== 'auto') {
    const forced = parseInt(raw, 10);
    if (Number.isFinite(forced) && forced > 0) return Math.min(forced, n);
    // any other non-empty value (typo) falls through to auto — never crash the gate.
  }
  if (n <= 1) return 1;                                  // nothing to overlap
  if (cores < MIN_CORES_FOR_CONCURRENCY) return 1;       // constrained host -> serial (D-528-01 safety)
  return Math.min(n, Math.floor(cores / CORES_PER_CHAIN));
}

// #725 (B0): split a chain's package.json script into its `&&`-joined step commands (read-only —
// package.json stays the single source of truth so each chain remains standalone-runnable via
// `npm run test:kaola-workflow:<edition>`). The self-host edition scripts carry no `&&` inside a
// quoted argument, so a bare `&&` split is faithful.
function parseChainStepList(scriptStr) {
  return String(scriptStr).split('&&').map((s) => s.trim()).filter(Boolean);
}

// Resolve a chain name into a step-decomposed dispatch spec (ordered steps + waiver disposition).
// Shared by the serial and concurrent paths so both produce IDENTICAL per-chain result shapes.
// A MOCKED chain (or a real chain whose script does not parse) reduces to a SINGLE step — the
// pre-#725 whole-command behavior — so every mock-based test path is byte-unchanged. A REAL chain
// decomposes into per-step `sh -c "<step>"` invocations so each step is individually timed and a
// hoisted repeat can be deduped.
function resolveChainSteps(name, ctx) {
  const isMocked = Object.prototype.hasOwnProperty.call(ctx.mocks, name);
  const isWaived = Object.prototype.hasOwnProperty.call(ctx.waivers, name);
  // The receipt records the canonical npm command even for a mocked chain (so a mock run's receipt
  // reads like a real run); a mock with no canonical mapping records its own script.
  const canonical = ctx.resolvedCommands[name] || CHAIN_COMMANDS[name] || (isMocked ? ctx.mocks[name] : ('npm run test:kaola-workflow:' + name));
  let steps;
  if (isMocked) {
    steps = [{ command: canonical, cmdParts: [ctx.mocks[name]] }];
  } else {
    const stepStrs = parseChainStepList((ctx.scripts && ctx.scripts['test:kaola-workflow:' + name]) || '');
    steps = stepStrs.length
      ? stepStrs.map((s) => ({ command: s, cmdParts: ['sh', '-c', s] }))
      : [{ command: canonical, cmdParts: parseCommand(canonical) }];   // fallback: run the whole npm command as one step
  }
  return {
    name,
    command: canonical,
    mocked: isMocked,
    accepted_red: isWaived,
    accepted_red_issue: isWaived ? ctx.waivers[name] : null,
    steps,
  };
}

// Serial chain run — spawnSync, byte-equivalent to the historical dispatch-loop body.
// #550: capture r.stdout/r.stderr into `_output` (the serial path previously DROPPED them) so the
// retry layer can classify a non-zero exit by transient signature — mirrors runChainAsync's _output.
// spawnSync exposes timeout kills via r.signal (SIGTERM) / r.error.code==='ETIMEDOUT'; surface that
// as `_timedOut` so a timeout stays non-retryable like the concurrent path.
function runChainSync(spec, cwd, timeoutMs) {
  const t0 = Date.now();
  const r = spawnSync(spec.cmdParts[0], spec.cmdParts.slice(1), {
    cwd,
    stdio: 'pipe',
    shell: false,
    encoding: 'utf8',
    env: spec.env || process.env,
    timeout: timeoutMs,
  });
  const duration_ms = Date.now() - t0;
  let exitCode = (r.status != null) ? r.status : (r.error ? 1 : 0);
  // #618: a signal-killed child (status === null — e.g. an external OOM-kill or operator SIGKILL,
  // NOT necessarily our own timeout, which is handled by r.error/ETIMEDOUT below via the SAME
  // fail-closed rule) must never fall through to the `r.error ? 1 : 0` ternary's false-green 0
  // branch when r.error is unset (a pure signal death raises no spawnSync `error`). ANY status===null
  // with either a signal or an error present is a red, full stop.
  if (r.status == null && (r.signal || r.error)) exitCode = 1;
  const timedOut = !!(r.signal === 'SIGTERM' || (r.error && r.error.code === 'ETIMEDOUT'));
  return {
    name: spec.name,
    exitCode,
    command: spec.command,
    duration_ms,
    accepted_red: spec.accepted_red,
    accepted_red_issue: spec.accepted_red_issue,
    _output: String(r.stdout || '') + String(r.stderr || '') + (r.error ? ('\n' + String((r.error && r.error.message) || r.error)) : ''),
    _timedOut: timedOut,
    _signal: r.signal || null,
  };
}

// Give one logical chain (including all of its transient retries) a private temp root without
// mutating the runner's own environment. TMP and TEMP follow TMPDIR because child libraries use
// different variables across platforms. Cleanup checks the directory identity captured at creation
// time, so a child that removes/replaces its root cannot make the runner recursively remove the
// replacement. A foreign replacement is deliberately left untouched.
function createIsolatedChainSpec(spec) {
  const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-chain-')));
  const ownedStat = fs.lstatSync(tempRoot);
  return {
    spec: Object.assign({}, spec, {
      env: Object.assign({}, process.env, {
        TMPDIR: tempRoot,
        TMP: tempRoot,
        TEMP: tempRoot,
      }),
    }),
    tempRoot,
    ownedStat,
  };
}

function cleanupIsolatedChain(isolation) {
  let current;
  try {
    current = fs.lstatSync(isolation.tempRoot);
  } catch (error) {
    if (error && error.code === 'ENOENT') return;
    return;
  }
  if (current.isSymbolicLink() || !current.isDirectory()
      || current.dev !== isolation.ownedStat.dev || current.ino !== isolation.ownedStat.ino) {
    return;
  }
  try {
    fs.rmSync(isolation.tempRoot, { recursive: true, force: true });
  } catch (_) {
    // Cleanup is best-effort: a chain's verdict must not be replaced by a temp-cleanup exception.
  }
}

// #550: re-run a SINGLE command spec ONLY on a POSITIVE transient-infra signature, up to
// maxAttempts, WITHOUT creating an isolated TMPDIR (the caller owns isolation — one per chain, so
// a chain's steps share the chain's private temp root). `runOne(spec, cwd, timeoutMs)` is either
// runChainSync (sync) or runChainAsync (Promise); `await` handles both uniformly. Returns the LAST
// attempt's result, augmented with `attempts` and `retried_transient`. PRECEDENCE #1 (accuracy): a
// determinate red — exitCode!==0 with NO transient signature in _output — is NEVER retried; a
// timeout kill (_timedOut) is non-retryable by default. Retry therefore can never flip a determinate
// red to green; a still-red-after-retry spec stays red.
async function runSpecWithRetry(spec, cwd, timeoutMs, runOne, maxAttempts) {
  const max = Math.max(1, maxAttempts | 0);
  let attempt = 0;
  let result;
  let retried = false;
  for (;;) {
    attempt++;
    result = await runOne(spec, cwd, timeoutMs);
    if (result.exitCode === 0) break;                       // green — done
    const retryable = attempt < max
      && !result._timedOut                                  // a timeout kill is non-retryable
      && isTransientFetchStderr(result._output);            // POSITIVE transient signature required
    if (!retryable) break;                                  // determinate red OR budget exhausted
    retried = true;
    await delayMs(retryBackoffMs(attempt));                 // small backoff before re-running THIS spec
  }
  result.attempts = attempt;
  result.retried_transient = retried;
  return result;
}

// #550: isolation + retry for a SINGLE command spec — the backward-compatible wrapper (a one-step
// chain / the hoisted-preamble runner). Creates one private TMPDIR, runs the spec (with transient
// retry) inside it, cleans up. A multi-step chain uses runChainSteps (below) instead, which owns a
// single isolation across ALL of the chain's steps.
async function runChainWithRetry(spec, cwd, timeoutMs, runOne, maxAttempts) {
  const isolation = createIsolatedChainSpec(spec);
  try {
    return await runSpecWithRetry(isolation.spec, cwd, timeoutMs, runOne, maxAttempts);
  } finally {
    cleanupIsolatedChain(isolation);
  }
}

// #725 (B0): record ONE executed step for the receipt's per-chain steps[] array — the additive
// per-step timing/verdict decomposition. Promotes the internal _timedOut/_signal markers only when
// set (a green step carries neither), keeping the entry minimal.
function stepEntry(command, r) {
  const e = { command, duration_ms: r.duration_ms, exitCode: r.exitCode };
  if (r._timedOut) e.timed_out = true;
  if (r._signal) e.signal = r._signal;
  return e;
}

// #725 (B0/B3): run ONE chain as its ORDERED step list inside a SINGLE per-chain isolated TMPDIR
// (so a chain's steps share one private temp root, and concurrent chains never collide). Steps run
// sequentially with `&&` short-circuit — a determinate step failure stops the chain. `skip` (a Set
// of hoisted commands already run in the shared preamble) is neither re-run nor recorded here; the
// chain inherits those steps' verdicts from the preamble. Returns the aggregated chain result:
// exitCode (the first failing step, else 0), duration_ms (sum of EXECUTED steps), attempts /
// retried_transient / _timedOut / _signal promoted from the failing step (or defaults), and a
// steps[] recording each executed step. A one-step (mocked / whole-npm) chain reduces to exactly the
// pre-#725 single-spawn shape (one isolation, one step, verdict == that step) — byte-compatible.
//
// #725 (R2): the KAOLA_RUN_CHAINS_TIMEOUT_MS bound is PER CHAIN, not per step (as the header
// documents). Each step spawn is given only the REMAINING per-chain budget — the full timeout minus
// the chain's cumulative wall-clock so far — so once the chain's wall-clock reaches the bound the
// running or next step is killed and the chain is marked timed out. Without this, every step got the
// full timeout and the effective bound was steps x timeout (a false green on a slow multi-step
// chain). A single-step (mocked) chain still gets effectively the full budget.
async function runChainSteps(chainSpec, cwd, timeoutMs, runOne, maxAttempts, skip) {
  const isolation = createIsolatedChainSpec(chainSpec);
  const chainStart = Date.now();                              // #725 (R2): per-chain wall-clock origin
  try {
    const stepEntries = [];
    let failing = null;
    let totalMs = 0, maxAttemptsSeen = 1, anyRetried = false;
    for (const st of chainSpec.steps) {
      if (skip && skip.has(st.command)) continue;             // hoisted — verified once in the preamble
      // #725 (R2): the REMAINING per-chain wall-clock budget for this step's spawn. When it is
      // already spent the chain has reached its per-chain bound: kill HERE (record a synthetic
      // timed-out step; never grant a fresh full timeout) so the aggregate can never exceed the bound.
      const remaining = timeoutMs - (Date.now() - chainStart);
      if (remaining <= 0) {
        const killed = {
          name: chainSpec.name, exitCode: 1, duration_ms: 0, attempts: 1, retried_transient: false,
          _timedOut: true, _signal: 'SIGTERM',
          _output: 'run-chains: per-chain wall-clock budget (' + timeoutMs + 'ms) exhausted before step "' + st.command + '"',
        };
        stepEntries.push(stepEntry(st.command, killed));
        failing = killed;
        break;
      }
      const stepSpec = {
        name: chainSpec.name, cmdParts: st.cmdParts, command: st.command,
        accepted_red: chainSpec.accepted_red, accepted_red_issue: chainSpec.accepted_red_issue,
        env: isolation.spec.env,
      };
      const r = await runSpecWithRetry(stepSpec, cwd, remaining, runOne, maxAttempts);
      totalMs += r.duration_ms || 0;
      maxAttemptsSeen = Math.max(maxAttemptsSeen, r.attempts || 1);
      anyRetried = anyRetried || r.retried_transient === true;
      stepEntries.push(stepEntry(st.command, r));
      if (r.exitCode !== 0) { failing = r; break; }            // && short-circuit (incl. a per-chain-budget timeout kill)
    }
    return {
      name: chainSpec.name,
      command: chainSpec.command,
      accepted_red: chainSpec.accepted_red,
      accepted_red_issue: chainSpec.accepted_red_issue,
      exitCode: failing ? failing.exitCode : 0,
      duration_ms: totalMs,
      attempts: maxAttemptsSeen,
      retried_transient: anyRetried,
      _timedOut: failing ? !!failing._timedOut : false,
      _signal: failing ? (failing._signal || null) : null,
      _output: failing ? failing._output : '',
      steps: stepEntries,
    };
  } finally {
    cleanupIsolatedChain(isolation);
  }
}

// #550: small fixed-ish backoff between transient retries (linear by attempt). Kept tiny so the gate
// is not slowed materially; bounded so a flapping host doesn't stall. Async (Promise) so it composes
// inside both the serial map and the concurrent worker (the worker is already async).
function retryBackoffMs(attempt) {
  return Math.min(2000, 250 * Math.max(1, attempt));
}
function delayMs(ms) {
  return new Promise((resolve) => { if (ms <= 0) resolve(); else setTimeout(resolve, ms); });
}

// Concurrent chain run — async spawn with per-child env copy + drained, buffered stdio
// (draining is REQUIRED: an undrained pipe deadlocks a chatty child once its buffer fills).
// spawn() has no `timeout` option, so the 900s per-chain bound is a manual setTimeout -> kill.
// exitCode mirrors spawnSync: timeout/error -> 1; a clean exit uses the child's code.
function runChainAsync(spec, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const base = {
      name: spec.name,
      command: spec.command,
      accepted_red: spec.accepted_red,
      accepted_red_issue: spec.accepted_red_issue,
    };
    let child;
    try {
      child = spawn(spec.cmdParts[0], spec.cmdParts.slice(1), {
        cwd,
        stdio: 'pipe',
        shell: false,
        env: spec.env || { ...process.env },
      });
    } catch (e) {
      resolve(Object.assign({}, base, { exitCode: 1, duration_ms: Date.now() - t0, _output: 'spawn threw: ' + String((e && e.message) || e) }));
      return;
    }
    const outBufs = [];
    if (child.stdout) child.stdout.on('data', (d) => outBufs.push(d));
    if (child.stderr) child.stderr.on('data', (d) => outBufs.push(d));
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGTERM'); } catch (_) {} }, timeoutMs);
    const done = (result) => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    // 'error' (e.g. ENOENT) may fire WITHOUT 'close' — resolve from whichever lands first.
    child.on('error', (err) => done(Object.assign({}, base, {
      exitCode: 1, duration_ms: Date.now() - t0, _output: 'spawn error: ' + String((err && err.message) || err),
    })));
    child.on('close', (code, signal) => done(Object.assign({}, base, {
      // #618: `close(null, SIGKILL)` with timedOut===false (an EXTERNAL signal death — an OOM-kill or
      // an operator SIGKILL unrelated to our own per-chain timer) previously fell through to the
      // `(code != null) ? code : 0` branch's false-green 0. code == null (no exit code — the process
      // was terminated by a signal, not a normal exit) is now ALWAYS red, whether or not it was our
      // own timeout kill (timedOut, already fail-closed) or an external one (the #618 fix).
      exitCode: (timedOut || code == null) ? 1 : code,
      duration_ms: Date.now() - t0,
      _output: Buffer.concat(outBufs).toString('utf8'),
      _timedOut: timedOut,
      _signal: signal || null,
    })));
  });
}

// #725 (B2): run the HOISTED shared preamble ONCE, serially, before any chain dispatch. Each
// hoisted command (a step that appears in more than one selected real chain — all such steps in the
// self-host chains are read-only validators, so running once is equivalent to running per chain)
// executes in its own private TMPDIR with transient retry. Returns the per-command results map (each
// chain reads its hoisted steps' verdicts here) + the receipt's preamble step entries.
async function runPreamble(preambleSteps, cwd, timeoutMs, maxAttempts) {
  const results = new Map();
  const entries = [];
  for (const st of preambleSteps) {
    const spec = { name: 'preamble', cmdParts: st.cmdParts, command: st.command, accepted_red: false, accepted_red_issue: null };
    const r = await runChainWithRetry(spec, cwd, timeoutMs, runChainSync, maxAttempts);
    results.set(st.command, r);
    entries.push(stepEntry(st.command, r));
  }
  return { results, entries };
}

// #725: dispatch ONE chain, honoring the hoisted preamble. When hoisting is active and a hoisted
// step this chain contains FAILED in the preamble, the chain is red at that step (skip its own
// steps — in the un-hoisted `&&` order it would have stopped there anyway; the overall run is
// already red, so running fewer steps only saves work — never a false green). Otherwise the chain's
// hoisted steps are skipped (verified in the preamble) and its OWN steps run.
async function dispatchChain(spec, cwd, timeoutMs, runOne, maxAttempts, hoistSet, preambleResults) {
  if (spec.mocked || !hoistSet || hoistSet.size === 0) {
    return runChainSteps(spec, cwd, timeoutMs, runOne, maxAttempts, null);
  }
  const hoistedForChain = spec.steps.filter((st) => hoistSet.has(st.command));
  const failed = hoistedForChain.find((st) => { const pr = preambleResults.get(st.command); return pr && pr.exitCode !== 0; });
  if (failed) {
    const pr = preambleResults.get(failed.command);
    return {
      name: spec.name, command: spec.command, accepted_red: spec.accepted_red, accepted_red_issue: spec.accepted_red_issue,
      exitCode: pr.exitCode, duration_ms: 0, attempts: 1, retried_transient: false,
      _timedOut: false, _signal: null, _output: pr._output || '', steps: [], preamble_failed: failed.command,
    };
  }
  const skip = new Set(hoistedForChain.map((st) => st.command));
  return runChainSteps(spec, cwd, timeoutMs, runOne, maxAttempts, skip);
}

// Dispatch every selected chain (serial or bounded-concurrent pool). Concurrent results are
// collected out-of-order then RE-SORTED to `specs` order (== the canonical KNOWN_CHAINS-filtered
// order) so the receipt is deterministic. #725: each chain runs its ordered, hoist-deduped step
// list in its own isolated TMPDIR; concurrency (B3) is preserved — the per-chain isolation still
// holds under step decomposition.
async function dispatchChains(specs, cwd, timeoutMs, maxAttempts, concurrency, hoistSet, preambleResults) {
  if (concurrency <= 1) {
    const out = [];
    for (const spec of specs) {
      out.push(await dispatchChain(spec, cwd, timeoutMs, runChainSync, maxAttempts, hoistSet, preambleResults));
    }
    return out;
  }
  const results = new Map();
  let next = 0;
  async function worker() {
    while (next < specs.length) {
      const spec = specs[next++];
      results.set(spec.name, await dispatchChain(spec, cwd, timeoutMs, runChainAsync, maxAttempts, hoistSet, preambleResults));
    }
  }
  const pool = Math.max(1, Math.min(concurrency, specs.length));
  await Promise.all(Array.from({ length: pool }, () => worker()));
  return specs.map((s) => results.get(s.name));   // canonical-order re-sort
}

// #725 (B1): resolve the diff base finalize scopes against — the KAOLA_FINALIZE_BASE override, else
// the merge-base of HEAD with the default branch (local symbolic-ref, offline-safe, then common
// default names). Returns the merge-base sha, or null when UNRESOLVED (a git failure / no default
// branch) — the caller fails CLOSED to all four on null.
function resolveDiffBase(cwd, env) {
  const override = ((env && env.KAOLA_FINALIZE_BASE) || '').trim();
  const candidates = [];
  if (override) {
    candidates.push(override);
  } else {
    const ref = spawnSync('git', ['-C', cwd, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { encoding: 'utf8' });
    if (ref.status === 0 && !ref.error && ref.stdout.trim()) candidates.push(ref.stdout.trim());
    candidates.push('origin/main', 'main', 'origin/master', 'master');
  }
  for (const c of candidates) {
    const mb = spawnSync('git', ['-C', cwd, 'merge-base', 'HEAD', c], { encoding: 'utf8' });
    if (mb.status === 0 && !mb.error) {
      const sha = mb.stdout.trim();
      if (sha) return sha;
    }
  }
  return null;
}

// #725 (B1): the changed-file set vs `baseSha` — tracked committed+staged+unstaged (git diff) PLUS
// untracked new files (fail-closed: a new plugins/ file must count). Returns null on a git failure
// (the caller fails closed to all four).
function computeChangedFiles(cwd, baseSha) {
  const diff = spawnSync('git', ['-C', cwd, 'diff', '--name-only', baseSha], { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER });
  if (diff.status !== 0 || diff.error) return null;
  const tracked = diff.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  const others = spawnSync('git', ['-C', cwd, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER });
  const untracked = (others.status === 0 && !others.error) ? others.stdout.split('\n').map((s) => s.trim()).filter(Boolean) : [];
  return [...new Set([...tracked, ...untracked])];
}

// #725 (B1): the root scripts/hooks a FORGE (codex/gitlab/gitea) chain executes — extracted from the
// package.json edition scripts (the SAME read-only source B0 decomposes). A diff touching one of
// these means a forge chain would be affected, so it forces all four. Returns a Set of
// forward-slashed path tokens ending in .js/.sh.
function forgeReferencedScripts(scripts) {
  const set = new Set();
  for (const ed of ['codex', 'gitlab', 'gitea']) {
    const s = scripts && scripts['test:kaola-workflow:' + ed];
    if (typeof s !== 'string') continue;
    for (const tok of s.split(/\s+/)) {
      const t = tok.trim().replace(/^['"]|['"]$/g, '');
      if (/\.(?:js|sh)$/.test(t)) set.add(t.replace(/\\/g, '/'));
    }
  }
  return set;
}

// #725 (R1): ROOT cross-edition READ surfaces — files a NON-CLAUDE chain's contract validator reads
// for byte-parity / content assertion, but which live OUTSIDE the classes recognized below
// (plugins/, package.json, the forge-referenced scripts, the codex-mirrored scripts/). A diff
// confined to one of these is NOT genuinely claude-only: the codex/forge chain that asserts on it
// would go red where a claude-only receipt is falsely green (the B1 fail-open hole). Derived by
// auditing the root reads of the three non-claude contract validators; each entry over-approximates
// its CLASS (any path under a listed directory prefix couples) so a newly-added command / agent /
// doc / marketplace / profile file is covered without editing this list — fail-closed by
// construction. Self-contained (pure path checks, no cross-script import a forge port could not
// resolve).
//   - commands/  : Claude command files, cross-checked byte-for-byte against the codex/forge SKILLs
//   - agents/    : Claude agent role definitions, asserted against the forge agent profiles
//   - .agents/   : the Codex marketplace registry + agent profiles (read by all three validators)
//   - docs/      : root docs the codex validator content-asserts (api / workflow-state-contract / conventions)
const ROOT_EDITION_READ_PREFIXES = ['.agents/', 'commands/', 'agents/', 'docs/'];
//   - CLAUDE.md / README.md      : content-asserted by the codex validator
//   - install.sh / uninstall.sh  : run / read by the gitlab / gitea validators
const ROOT_EDITION_READ_FILES = new Set(['CLAUDE.md', 'README.md', 'install.sh', 'uninstall.sh']);

// #725 (B1): does this changed path couple to a non-claude edition (so the diff needs all four)? Any
// path under plugins/ (the codex twin + both forge trees), package.json (the chain definitions), a
// script a forge chain executes, a root scripts/ file mirrored into the codex tree (a
// COMMON_SCRIPTS / byte-group / rename-family member — detected by filesystem existence so this stays
// self-contained with NO cross-script import, which a forge port could not resolve), or a ROOT
// cross-edition READ surface a non-claude contract validator asserts on (#725 R1 — the constants
// above). Everything else is claude-exclusive. Fail-closed by construction: unsure -> all four.
function isEditionCouplingPath(rel, cwd, forgeRefs) {
  const p = String(rel).replace(/\\/g, '/');
  if (p.indexOf('plugins/') === 0) return true;             // any edition tree (codex twin + both forges)
  if (p === 'package.json') return true;                    // the chain-script definitions
  if (forgeRefs && forgeRefs.has(p)) return true;           // a script a forge chain executes
  const m = /^scripts\/(.+\.(?:js|sh))$/.exec(p);
  if (m) {
    try { if (fs.existsSync(path.join(cwd, 'plugins', 'kaola-workflow', 'scripts', m[1]))) return true; } catch (_) {}
  }
  // #725 (R1): a root cross-edition read surface asserted by a codex/forge contract validator.
  for (const pref of ROOT_EDITION_READ_PREFIXES) if (p.indexOf(pref) === 0) return true;
  if (ROOT_EDITION_READ_FILES.has(p)) return true;
  return false;
}

// #725 (B1): classify the finalize-scoped chain selection for a self-host run. Resolves the diff base
// and the changed-file set; if ANY changed path couples to a non-claude edition (or the base/diff is
// UNRESOLVED), selects all four (fail-closed); otherwise the claude chain only (the subset receipt
// the adaptive finalize gate already tolerates). Returns { decision, reason, base, touchedEditionPaths,
// changedFileCount, chains } — recorded verbatim in the receipt as scope evidence.
function classifyScope(cwd, env, availableNames, scripts) {
  const base = resolveDiffBase(cwd, env);
  if (!base) {
    return { decision: 'all-four', reason: 'base_unresolved', base: null, touchedEditionPaths: [], changedFileCount: null, chains: [...availableNames] };
  }
  const changed = computeChangedFiles(cwd, base);
  if (changed == null) {
    return { decision: 'all-four', reason: 'diff_unresolved', base, touchedEditionPaths: [], changedFileCount: null, chains: [...availableNames] };
  }
  const forgeRefs = forgeReferencedScripts(scripts);
  const touched = changed.filter((rel) => isEditionCouplingPath(rel, cwd, forgeRefs));
  if (touched.length > 0) {
    return { decision: 'all-four', reason: 'edition_coupling', base, touchedEditionPaths: touched.slice(0, 50), changedFileCount: changed.length, chains: [...availableNames] };
  }
  if (availableNames.includes('claude')) {
    return { decision: 'claude-only', reason: 'non_edition_diff', base, touchedEditionPaths: [], changedFileCount: changed.length, chains: ['claude'] };
  }
  return { decision: 'all-four', reason: 'claude_chain_absent', base, touchedEditionPaths: [], changedFileCount: changed.length, chains: [...availableNames] };
}

// #546: resolve the git top-level so a --project receipt lands at the SAME absolute path whether
// run-chains is invoked from the worktree root (the #466 contract) or the repo root. Mirrors the
// validator's `git -C <cwd> rev-parse --show-toplevel` discriminator; falls back to cwd when git
// cannot resolve it (e.g. not a checkout) so the flag still produces a deterministic path.
function getGitTopLevel(cwd) {
  const r = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  if (r.status !== 0 || r.error) return cwd;
  return r.stdout.trim() || cwd;
}

// #546: resolve the receipt output path from the parsed flags, honoring precedence
// --output > --plan > --project > cwd default. --project <issue-N> -> the plan-dir
// kaola-workflow/<issue-N>/.cache (resolved against the git top-level); --plan <path> -> the EXACT
// plan-dir the validator derives (path.dirname(<plan-path>))/.cache. The validator reads
// <plan-dir>/.cache/chain-receipt.json, so both flags land the receipt where the gate looks.
function resolveOutputPath(opts, cwd) {
  if (opts.output != null) return path.resolve(cwd, opts.output);
  if (opts.plan != null) {
    return path.join(path.dirname(path.resolve(cwd, opts.plan)), '.cache', 'chain-receipt.json');
  }
  if (opts.project != null) {
    return path.join(getGitTopLevel(cwd), 'kaola-workflow', opts.project, '.cache', 'chain-receipt.json');
  }
  return path.join(cwd, '.cache', 'chain-receipt.json');
}

// Resolve the HEAD sha in the current working directory.
function getHeadSha(cwd) {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  if (r.status !== 0 || r.error) return 'unknown';
  return r.stdout.trim();
}

// Compute a hash of `git diff HEAD` output. Returns 'clean' when the diff is empty.
function getWorkTreeHash(cwd) {
  const r = spawnSync('git', ['diff', 'HEAD'], { cwd, encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER });
  const diff = (r.status === 0 && !r.error) ? (r.stdout || '') : '';
  if (diff.length === 0) return 'clean';
  return crypto.createHash('sha256').update(diff).digest('hex');
}

// #475 (supersedes the #464 consumer escape hatch): run-chains.js is now SELF-HOST-only.
// The v6.2.0 per-repo `kaola-workflow/chains.json` consumer contract is RETIRED — there is no
// opt-in middle-ground (Pure option A). A consumer (non-npm) product repo no longer authors
// chains.json + re-runs a suite to produce a chain receipt; its finalize gate is the agent's
// recorded `.cache/final-validation.md` evidence ("Agent Owns Reasoning; Scripts Own Atomicity",
// #44), enforced by `plan-validator --finalize-check` in consumer mode. resolveChains therefore
// resolves ONLY the built-in npm edition chains for the KNOWN_CHAINS whose `test:kaola-workflow:<name>`
// script is declared in package.json (the self-host); otherwise a typed `chains_config_missing`
// refusal (a consumer repo simply never runs this producer).
function readJsonOr(p, dflt) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return dflt; }
}
function resolveChains(cwd) {
  const pkg = readJsonOr(path.join(cwd, 'package.json'), null);
  const scripts = (pkg && pkg.scripts && typeof pkg.scripts === 'object') ? pkg.scripts : {};
  const npmNames = KNOWN_CHAINS.filter(n => typeof scripts['test:kaola-workflow:' + n] === 'string');
  if (npmNames.length) {
    const commands = {};
    for (const n of npmNames) commands[n] = CHAIN_COMMANDS[n];
    return { source: 'npm-default', commands, names: npmNames };
  }
  return {
    error: 'chains_config_missing',
    detail: 'package.json declares no test:kaola-workflow:* scripts — this repo cannot run the npm edition chains. A consumer (non-npm) repo gates finalize on the agent-recorded .cache/final-validation.md (#475), not a chain receipt.',
  };
}

async function main(argv) {
  const args = argv.slice(2);

  let requestedChains = null; // null = run all resolved chains (config or npm-default)
  // #546: collect the receipt-path flags; resolve AFTER parsing so precedence (--output > --plan >
  // --project > cwd default) holds regardless of argument order.
  const pathOpts = { output: null, plan: null, project: null };
  const waivers = {};   // name -> issue token
  const mocks = {};     // name -> shell script path (test hook)
  let asJson = false;

  // Parse arguments.
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--chains') {
      const val = args[++i];
      if (!val) {
        process.stderr.write('run-chains: --chains requires a value\n');
        return 1;
      }
      requestedChains = val.split(',').map(s => s.trim()).filter(Boolean);
    } else if (a === '--accept-known-red') {
      const val = args[++i];
      if (!val || !val.includes(':')) {
        process.stderr.write(
          'run-chains: --accept-known-red requires format <name>:<issue-number> (colon-separated)\n' +
          '  example: --accept-known-red codex:234\n'
        );
        return 1;
      }
      const colonIdx = val.indexOf(':');
      const name = val.slice(0, colonIdx).trim();
      const issue = val.slice(colonIdx + 1).trim();
      if (!name || !issue) {
        process.stderr.write(
          'run-chains: --accept-known-red: both <name> and <issue-number> must be non-empty\n' +
          '  got: ' + JSON.stringify(val) + '\n'
        );
        return 1;
      }
      // Chain-name validity is checked AFTER chain resolution (against the resolved npm-default
      // edition names + any --mock-chain name), not against a hardcoded list.
      waivers[name] = issue;
    } else if (a === '--output') {
      const val = args[++i];
      if (!val) { process.stderr.write('run-chains: --output requires a path\n'); return 1; }
      pathOpts.output = val;
    } else if (a === '--project') {
      // #546: write the receipt under kaola-workflow/<issue-N>/.cache (the validator's plan-dir).
      const val = args[++i];
      if (!val) { process.stderr.write('run-chains: --project requires a value (e.g. issue-546)\n'); return 1; }
      pathOpts.project = val;
    } else if (a === '--plan') {
      // #546: write the receipt under <dir-of-plan>/.cache (the EXACT plan-dir the validator derives).
      const val = args[++i];
      if (!val) { process.stderr.write('run-chains: --plan requires a plan-file path\n'); return 1; }
      pathOpts.plan = val;
    } else if (a === '--mock-chain') {
      const val = args[++i];
      if (!val || !val.includes(':')) {
        process.stderr.write('run-chains: --mock-chain requires format <name>:<script-path>\n');
        return 1;
      }
      const colonIdx = val.indexOf(':');
      mocks[val.slice(0, colonIdx)] = val.slice(colonIdx + 1);
    } else if (a === '--json') {
      asJson = true;
    } else if (a === '-h' || a === '--help') {
      process.stdout.write(
        'Usage: kaola-gitea-workflow-run-chains.js [--chains name,...] [--accept-known-red name:issue ...]\n' +
        '                                    [--project issue-N | --plan plan-path | --output path] [--json]\n' +
        '\n' +
        'Runs the four test chains (claude, codex, gitlab, gitea) and writes a chain receipt.\n' +
        'Exit 0 when all non-waived chains pass; non-zero otherwise.\n' +
        '\n' +
        'Receipt path (#546): plan-validator --finalize-check reads <plan-dir>/.cache/chain-receipt.json.\n' +
        '  --project issue-N  -> kaola-workflow/issue-N/.cache/chain-receipt.json (resolved at the git top-level)\n' +
        '  --plan plan-path   -> <dir-of-plan>/.cache/chain-receipt.json (the exact plan-dir the validator derives)\n' +
        '  --output path      -> explicit override; default is <cwd>/.cache/chain-receipt.json\n' +
        'Precedence: --output > --plan > --project > cwd default.\n' +
        '\n' +
        'On a host with core headroom the chains run CONCURRENTLY (max-of-chains makespan);\n' +
        'a constrained host falls back to serial. Override with KAOLA_RUN_CHAINS_CONCURRENCY\n' +
        '(auto | serial | <N>).\n'
      );
      return 0;
    } else {
      process.stderr.write('run-chains: unknown argument: ' + a + '\n');
      return 1;
    }
  }

  const cwd = process.cwd();
  // #546: resolve the receipt path now that cwd is known + all flags are parsed.
  const outputPath = resolveOutputPath(pathOpts, cwd);

  // #475: resolve the npm edition chain set for this repo (npm-default > chains_config_missing refuse).
  // The chains.json repo-config tier is retired (consumer repos gate on final-validation.md).
  // `--mock-chain` (a test hook) supplies a command for a name directly, so a mocked name is
  // available even when no config/npm exists — the refusal only fires when there is nothing to run.
  const resolved = resolveChains(cwd);
  const mockNames = Object.keys(mocks);
  if (resolved.error && mockNames.length === 0) {
    // #475: run-chains.js is self-host-only. A consumer (non-npm) repo does NOT run this producer —
    // its finalize gate is the agent-recorded .cache/final-validation.md, enforced by
    // plan-validator --finalize-check in consumer mode. So the only refusal is chains_config_missing
    // (this repo declares no edition test scripts), and the hint points at the consumer contract.
    const hint = 'This repo declares no test:kaola-workflow:* scripts, so it cannot run the npm edition chains. Only the Kaola-Workflow self-host runs these; a consumer (non-npm) repo does NOT run run-chains.js — finalize gates on the agent-recorded .cache/final-validation.md (#475).';
    if (asJson) {
      process.stdout.write(JSON.stringify({ result: 'refuse', reason: resolved.error, operator_hint: hint, errors: [resolved.detail] }) + '\n');
    } else {
      process.stderr.write('run-chains: ' + resolved.error + ' — ' + resolved.detail + '\n  ' + hint + '\n');
    }
    return 1; // typed refusal, no receipt (a non-npm repo gets no misleading 4-red receipt)
  }
  const resolvedCommands = resolved.commands || {};
  const availableNames = [...new Set([...(resolved.names || []), ...mockNames])];
  const chainSource = resolved.error ? 'mock' : resolved.source;
  const pkgScripts = (readJsonOr(path.join(cwd, 'package.json'), null) || {}).scripts || {};

  // #725 (B1): FINALIZE-scoped chain selection. When the caller neither pins --chains nor mocks a
  // chain, and this is a finalize-context invocation (--project / --plan — the adaptive finalize
  // path always passes --project; the release/default path uses the bare cwd receipt and is left
  // UNSCOPED so its all-four receipt is untouched), auto-select the chain set from the diff scope:
  // a non-edition (claude-only) diff runs the claude chain only; an edition-coupling diff (or an
  // unresolved base) fails closed to all four. The decision + diff evidence is recorded in the
  // receipt below. A pinned --chains, a mock run, or a bare (no --project/--plan) run keeps the
  // pre-#725 behavior (the requested subset, else every resolved chain).
  let scopeInfo;
  let chains;
  const finalizeContext = (pathOpts.project != null || pathOpts.plan != null);
  if (requestedChains == null && mockNames.length === 0 && !resolved.error && finalizeContext) {
    scopeInfo = classifyScope(cwd, process.env, availableNames, pkgScripts);
    chains = scopeInfo.chains;
  } else {
    chains = requestedChains != null ? requestedChains : [...availableNames];
    scopeInfo = {
      decision: requestedChains != null ? 'explicit' : 'no_narrowing',
      reason: requestedChains != null ? 'explicit_chains' : (finalizeContext ? 'mock_or_unresolved' : 'no_project_context'),
      base: null, touchedEditionPaths: [], changedFileCount: null, chains: [...chains],
    };
  }

  // Refuse an EMPTY effective chain set with NO receipt. Otherwise a zero-chain run would
  // write a `chains: []` receipt, and the name-agnostic finalize-check gate (which only filters
  // for red chains) would PASS it — a zero-chains-verified finalization. Reachable via
  // `--chains ","` (splits/filters to []) or a config that resolves to nothing.
  if (chains.length === 0) {
    if (asJson) {
      process.stdout.write(JSON.stringify({ result: 'refuse', reason: 'no_chains', operator_hint: 'No chains to run. Pass --chains with at least one valid edition chain name (a declared `test:kaola-workflow:*` script). A consumer (non-npm) repo does not run chains — finalize gates on the agent-recorded .cache/final-validation.md (#475).' }) + '\n');
    } else {
      process.stderr.write('run-chains: no chains to run — the resolved/requested chain set is empty\n');
    }
    return 1; // no receipt — never write an empty-chains receipt that would pass the gate
  }

  // Validate requested chain names against the RESOLVED set (not a hardcoded list).
  for (const name of chains) {
    if (!availableNames.includes(name)) {
      process.stderr.write(
        'run-chains: unknown chain name ' + JSON.stringify(name) +
        ' (available in this repo [' + chainSource + ']: ' + availableNames.join(', ') + ')\n'
      );
      return 1;
    }
  }
  // Validate waiver names against the resolved set too.
  for (const name of Object.keys(waivers)) {
    if (!availableNames.includes(name)) {
      process.stderr.write(
        'run-chains: --accept-known-red: unknown chain name ' + JSON.stringify(name) +
        ' (available in this repo [' + chainSource + ']: ' + availableNames.join(', ') + ')\n'
      );
      return 1;
    }
  }

  const startedAt = new Date().toISOString();
  const headSha = getHeadSha(cwd);
  const workTreeHash = getWorkTreeHash(cwd);
  // #547 (D-547-01): the code-relevant-tree content hash — the chain-receipt freshness key the
  // plan-validator --finalize-check gate recomputes. Computed via the SAME exported helper the gate
  // calls (require, like next-action.js) so producer and gate never disagree. The plan's optional
  // `validation_test_consumes` band widening is read from the frozen plan and RECORDED in the receipt
  // so the gate replays the IDENTICAL band. Any failure → null/[] → the gate falls back to the headSha
  // pin (fail-closed). Self-host-only, so the require is reached only on the Kaola-Workflow repo.
  const planValidator = require('./kaola-gitea-workflow-plan-validator.js');
  const gitTop = getGitTopLevel(cwd);
  let validationTestConsumes = [];
  try {
    let planContent = null;
    if (pathOpts.plan) planContent = fs.readFileSync(pathOpts.plan, 'utf8');
    else if (pathOpts.project) planContent = fs.readFileSync(path.join(gitTop, 'kaola-workflow', pathOpts.project, 'workflow-plan.md'), 'utf8');
    if (planContent) validationTestConsumes = planValidator.parseValidationTestConsumes(planContent);
  } catch (_) { validationTestConsumes = []; }
  const codeTreeHash = planValidator.computeCodeTreeHash(gitTop, pathOpts.project || null, validationTestConsumes);

  // Ensure .cache directory exists before running chains.
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  // Build per-chain step-decomposed dispatch specs in canonical (chains == KNOWN_CHAINS-filtered)
  // order. #725 (B0): a real chain carries its ordered step list (parsed from package.json); a
  // mocked chain carries a single step.
  const ctx = { mocks, waivers, resolvedCommands, scripts: pkgScripts };
  const specs = chains.map((name) => resolveChainSteps(name, ctx));
  const timeoutMs = resolveTimeoutMs(process.env);
  // #550: per-step transient-retry budget (default 2 == one retry). Each step is wrapped in the
  // transient-retry loop so a transient-infra fault re-runs ONLY that step of that chain.
  const maxAttempts = resolveChainRetry(process.env);

  // #725 (B2): compute the HOISTED shared preamble — commands appearing in MORE THAN ONE selected
  // REAL chain (a mocked chain never contributes; its single step is a unique test hook). Every such
  // repeat in the self-host chains is a read-only validator, so running it ONCE (attributed to the
  // preamble) and skipping it in the individual chains is equivalent — and cuts the duplicated work
  // of the all-four run. First-seen order across the real chains.
  const realSpecs = specs.filter((s) => !s.mocked);
  const cmdCounts = new Map();
  for (const s of realSpecs) for (const st of s.steps) cmdCounts.set(st.command, (cmdCounts.get(st.command) || 0) + 1);
  const hoistSet = new Set([...cmdCounts].filter(([, n]) => n > 1).map(([c]) => c));
  const preambleSteps = [];
  {
    const seen = new Set();
    for (const s of realSpecs) for (const st of s.steps) {
      if (hoistSet.has(st.command) && !seen.has(st.command)) { seen.add(st.command); preambleSteps.push(st); }
    }
  }

  // #529: core-count-gated serial-vs-concurrent dispatch. concurrency <= 1 -> the serial fallback;
  // > 1 -> a bounded concurrent pool, results re-sorted to canonical order. Both paths produce
  // identical per-chain result shapes. #725: the hoisted preamble always runs serially FIRST; then
  // each chain runs its ordered, hoist-deduped step list (each within its own isolated TMPDIR).
  const concurrency = resolveConcurrency(process.env, os.cpus().length, specs.length);
  const preamble = await runPreamble(preambleSteps, cwd, timeoutMs, maxAttempts);
  const dispatchResults = await dispatchChains(specs, cwd, timeoutMs, maxAttempts, concurrency, hoistSet, preamble.results);
  // Surface each FAILED chain's captured output so a failure is debuggable from the run-chains
  // output alone (concurrent runs are not watchable live; a serial run is, but this is harmless).
  for (const ch of dispatchResults) {
    if (ch.exitCode !== 0 && ch._output) {
      process.stderr.write(
        '\n===== chain "' + ch.name + '" failed (exit ' + ch.exitCode +
        (ch._timedOut ? ', TIMED OUT' : '') + (ch.preamble_failed ? ', hoisted step "' + ch.preamble_failed + '" failed' : '') + ') =====\n' + ch._output + '\n'
      );
    }
  }

  // Strip the internal _output field (kept as _timedOut is PROMOTED below). #550: the receipt
  // additively records `attempts` (the FINAL attempt's exitCode is the chain verdict) and
  // `retried_transient`. #608: `timed_out` promotes the internal _timedOut marker so a receipt
  // reader (the plan-validator finalize gate, an operator) can distinguish a timeout kill from a
  // genuine test failure without re-running anything. #725 (B0): `steps` records the per-step
  // decomposition. Readers index by name/exitCode/accepted_red (plan-validator --finalize-check,
  // #522 schema test), so these are backward-compatible additions.
  const chainResults = dispatchResults.map((ch) => ({
    name: ch.name,
    exitCode: ch.exitCode,
    command: ch.command,
    duration_ms: ch.duration_ms,
    accepted_red: ch.accepted_red,
    accepted_red_issue: ch.accepted_red_issue,
    attempts: (typeof ch.attempts === 'number' && ch.attempts >= 1) ? ch.attempts : 1,
    retried_transient: ch.retried_transient === true,
    timed_out: ch._timedOut === true,
    // #618: the OS signal name that killed the FINAL attempt's child (e.g. "SIGKILL"/"SIGTERM"), or
    // null on a normal exit — recorded so a reader can distinguish a signal death from a genuine
    // non-zero test exit without re-running anything.
    signal: (typeof ch._signal === 'string' && ch._signal) ? ch._signal : null,
    // #725 (B0): the per-step timing/verdict decomposition for this chain (hoisted steps live in
    // receipt.preamble, not here).
    steps: Array.isArray(ch.steps) ? ch.steps : [],
    // #725 (B2): present only when this chain was marked red because a hoisted preamble step failed.
    ...(ch.preamble_failed ? { preamble_failed: ch.preamble_failed } : {}),
  }));

  const completedAt = new Date().toISOString();

  const receipt = {
    headSha,
    workTreeHash,
    codeTreeHash,
    validationTestConsumes,
    startedAt,
    completedAt,
    source: chainSource,
    // #725 (B1): the finalize-scoped chain-selection decision + diff evidence.
    scope: scopeInfo,
    // #725 (B2): the hoisted shared steps, run once across the combined run.
    preamble: { steps: preamble.entries },
    chains: chainResults,
  };

  // Write receipt (always — a red receipt is still a record). Atomic: a crashed re-run leaves the
  // PRIOR receipt byte-intact instead of O_TRUNC-ing a completed four-chain artifact away.
  writeReceiptAtomic(outputPath, JSON.stringify(receipt, null, 2) + '\n');

  // Determine exit code: 0 iff all non-waived chains passed.
  const failed = chainResults.filter(ch => ch.exitCode !== 0 && !ch.accepted_red);
  const overallExitCode = failed.length > 0 ? 1 : 0;

  if (asJson) {
    process.stdout.write(JSON.stringify({
      result: overallExitCode === 0 ? 'pass' : 'fail',
      failed: failed.map(ch => ch.name),
      receipt: outputPath,
    }) + '\n');
  } else if (overallExitCode !== 0) {
    // #608: label a TIMED-OUT chain distinctly from a determinate red in the failure summary line
    // itself, naming the remedy env var — an operator scanning stderr (not the JSON receipt) can
    // tell "raise the timeout" from "fix the test" at a glance.
    const label = (ch) => ch.name + (ch.timed_out
      ? ' (TIMEOUT at ' + Math.round(timeoutMs / 1000) + 's — raise KAOLA_RUN_CHAINS_TIMEOUT_MS or investigate a hang)'
      : '');
    process.stderr.write(
      'run-chains: ' + failed.length + ' chain(s) failed: ' + failed.map(label).join(', ') + '\n'
    );
  }

  return overallExitCode;
}

// #512/#608: per-chain spawnSync/spawn timeout — overridable so a passing-but-slow chain is
// captured, not killed. Default raised to 1800000 (30 min) from the prior 900000 (15 min, #512),
// which was itself raised from a hardcoded 600000: live runs on a constrained host exceeded 900s
// (a red receipt at exactly the old bound, indistinguishable from a genuine failure without
// re-reading the run) — the receipt's `timed_out` field (see the schema comment above) now
// surfaces that distinction directly, and the failure summary names this env var as the remedy.
function resolveTimeoutMs(env) {
  const v = parseInt((env && env.KAOLA_RUN_CHAINS_TIMEOUT_MS) || '', 10);
  return (Number.isFinite(v) && v > 0) ? v : 1800000;
}

// #550: max attempts PER CHAIN on a transient-infra fault (default 2 == one retry). Mirrors the
// resolveTimeoutMs/resolveConcurrency env-resolver style. Clamped to a sane >=1 integer; any invalid
// value (non-numeric / <1) falls back to the default so a typo never disables the gate or loops.
function resolveChainRetry(env) {
  const v = parseInt((env && env.KAOLA_RUN_CHAINS_RETRY) || '', 10);
  return (Number.isFinite(v) && v >= 1) ? v : 2;
}

if (require.main === module) {
  main(process.argv).then(
    (code) => process.exit(code),
    (err) => { process.stderr.write('run-chains: fatal: ' + ((err && err.stack) || err) + '\n'); process.exit(1); }
  );
}

module.exports = { main, KNOWN_CHAINS, CHAIN_COMMANDS, resolveChains, resolveTimeoutMs, resolveConcurrency, resolveChainRetry, runChainWithRetry, runChainSync, runChainAsync, resolveOutputPath, getGitTopLevel, parseChainStepList, resolveChainSteps, classifyScope, resolveDiffBase, computeChangedFiles, forgeReferencedScripts, isEditionCouplingPath };

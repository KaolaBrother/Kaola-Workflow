evidence-binding: n1-survey 1c4c9e7e41dc

# n1-survey — C1 cross-chain parallelism surface of run-chains.js

Read-only survey (code-explorer). Findings recorded parent-side (role has no Write tool).

## 1. Serial dispatch core — `scripts/kaola-workflow-run-chains.js`

- Canonical order constant (`run-chains.js:56`): `const KNOWN_CHAINS = ['claude', 'codex', 'gitlab', 'gitea'];`
- Command map (`:58-63`): each chain → `npm run test:kaola-workflow:<name>`.
- Effective list (`:208`): `const chains = requestedChains != null ? requestedChains : [...availableNames];` where `availableNames` (`:204`) = `resolveChains()` filtering `KNOWN_CHAINS` against package.json's declared scripts (inherits KNOWN_CHAINS order).
- **Serial dispatch loop (`:252-287`)**: `for (const name of chains) { ... const r = spawnSync(cmdParts[0], cmdParts.slice(1), { cwd, stdio:'pipe', shell:false, encoding:'utf8', timeout: resolveTimeoutMs(process.env) }); ... chainResults.push({ name, exitCode, command, duration_ms, accepted_red, accepted_red_issue }); }`
- `parseCommand` (`:67`): `cmd.split(/\s+/).filter(Boolean)` → `['npm','run','test:kaola-workflow:<name>']`.

## 2. Per-chain receipt (`chain-receipt.json`, written `:291-301`)

Top-level: `headSha`, `workTreeHash` (sha256 of `git diff HEAD` or `'clean'`), `startedAt`, `completedAt`, `source`, `chains[]`. All are PRE-loop snapshots except the per-chain array.

Per-chain object fields (`:279-286`) — **all six must survive out-of-order completion**:
`name`, `exitCode`, `command`, `duration_ms`, `accepted_red` (bool), `accepted_red_issue` (token|null).

**Ordering guarantee is IMPLICIT in serial iteration.** `chainResults` is built by one `push` per serial iteration in KNOWN_CHAINS order. Under concurrency, results arrive in COMPLETION order → a concurrent impl MUST explicitly `sort` by `KNOWN_CHAINS.indexOf(name)` before writing the receipt. `startedAt`/`completedAt` currently bracket the whole serial loop → under concurrency they become per-chain timestamps.

## 3. `--accept-known-red` waiver path

- Registration (`:133-154`): `--accept-known-red <name>:<issue>` → `waivers[name]=issue`; name validity checked post-resolution against `availableNames` (`:234-242`).
- Per-chain (`:277`): `isWaived = hasOwnProperty(waivers, name)`.
- Aggregate exit (`:304-305`): `const failed = chainResults.filter(ch => ch.exitCode !== 0 && !ch.accepted_red); const overallExitCode = failed.length > 0 ? 1 : 0;` → exit 0 iff every NON-waived chain passed. Parallel-safe (pure post-hoc filter over collected results).
- **stderr is captured by `spawnSync` (`r.stderr`, stdio:'pipe') but NOT persisted to the receipt** — `--json` only emits `failed: failed.map(ch=>ch.name)`. Full buffered stderr is discarded today. (Concurrency would need per-child buffers; AC#2 asks to PRESERVE full failing-chain stderr — an enhancement either way.)

## 4. `KAOLA_RUN_CHAINS_TIMEOUT_MS` per-chain timeout (D-512-01)

- `resolveTimeoutMs(env)` (`:322-327`): `parseInt(env.KAOLA_RUN_CHAINS_TIMEOUT_MS)` if finite & >0 else `900000` (900s).
- Applied per chain at `:272` (`timeout:` option of each `spawnSync`). **No serial assumption** in the timeout itself.
- **CONCURRENCY GOTCHA:** `spawn` (async) has NO built-in `timeout` option (unlike `spawnSync`). A concurrent rewrite must implement per-child `setTimeout` → `child.kill()` to preserve the 900s per-chain bound.

## 5. Four edition copies (#307 lockstep)

| Path | Role |
|---|---|
| `scripts/kaola-workflow-run-chains.js` | canonical root (claude) — 334 lines |
| `plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js` | codex — **byte-identical** to root |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js` | gitlab — rename-normalized identical |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js` | gitea — rename-normalized identical |

- Codex byte-identity confirmed by direct read (char-for-char, 334 lines). Enforced by `validate-script-sync.js` `COMMON_SCRIPTS` + `a.equals(b)` (`:82`, `:376-384`).
- Forge ports differ ONLY in filename-occurrence strings via `renameNormalize` (`validate-script-sync.js:363-365`): `kaola-workflow-<name>` → `kaola-<forge>-workflow-<name>`. For run-chains that is the header comment (`:6`) + the `--help` usage filename (`:169`). Enforced by `RENAME_NORMALIZED_FAMILIES` (`:260-270`).
- `validate-script-sync.js` runs FIRST in both `test:kaola-workflow:claude` and `:codex` chains → any drift fails before walkthroughs.

## 6. Race-safety preconditions — CONFIRMED

(a) **Independent OS processes / separate state** — CONFIRMED. Each chain = `spawnSync(... shell:false)` of a separate `npm run` process tree (claude→simulate-workflow-walkthrough.js, codex→simulate-kaola-workflow-walkthrough.js, gitlab→simulate-gitlab-..., gitea→simulate-gitea-...). run-chains.js is single-process, stateless between iterations (only in-process `chainResults` accumulates).

(b) **No $TMPDIR subdir-name collision across editions** — CONFIRMED. `mkdtemp` prefixes are edition-namespaced: claude `kw-*`, codex `kw-codex-*`/`kw-<issue>-*`, gitlab `kw-gl-*`, gitea `kw-gt-*`. `mkdtempSync` also appends an OS random suffix → no collision even within an edition.

(c) **`~/.config/kaola-workflow/config.json` read-only during runs** — CONFIRMED. `readAdaptiveConfig()` (claim.js:28-34) is "Read-only here — never creates the file"; returns `{}` on error. Every config.json WRITE in test code targets a `mkdtempSync` tmp dir (test-claim-hardening.js:355,819; simulate-workflow-walkthrough.js:6284,6290), never `~/.config`. Concurrent reads are safe.

- run-chains.js has NO `process.env` write (only `resolveTimeoutMs(process.env)` read at `:272`). In-process env mutations exist inside walkthroughs (e.g. simulate-workflow-walkthrough.js:19 sets KAOLA_ENABLE_ADAPTIVE='0' at module top) but are confined to each spawned chain process — cannot cross chain boundaries.

## Recommendations for a follow-on build (if warranted)

- Build on `spawn` + a bounded pool (N≤4) / `Promise.all`, not `spawnSync`.
- `sort` chainResults by `KNOWN_CHAINS.indexOf(ch.name)` before writing the receipt (preserve canonical ordering).
- Per-child `setTimeout`→kill to keep the 900s bound (`spawn` lacks `timeout`).
- Per-child env copy `{...process.env}` + per-child stderr buffer (no interleave).
- All other logic (waiver, aggregate exit, command building) is already per-chain/stateless → parallel-safe; the four edition copies change ONLY in the dispatch loop.

## Open questions deferred to n4 measurement

- Per-chain wall-clock breakdown (static analysis can't give it) — needed to size the real makespan win.
- Whether concurrent `npm run` subprocess trees oversubscribe a ≤4-core host enough to invert the win (the make-or-break question for AC#3).

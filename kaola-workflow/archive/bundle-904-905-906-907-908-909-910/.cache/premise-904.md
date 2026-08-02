# Premise check — #904 (validation-runner sandbox TMPDIR vs macOS `sun_path`)

## VERDICT: **HOLDS — with two corrections that change the fix**

The mechanism is real, reproduces on demand, and is a deterministic length overflow, not a race or a
flake. Two corrections to the issue's framing, both of which a fixer must respect:

1. **The lengths in the issue are slightly off on this box, and the direction matters.** Measured
   here: sandbox `tmp` = **143** chars (issue says ~146), tsx pipe = **162** chars (issue says ~165).
   Same conclusion, but the budget arithmetic below is what a fix must be checked against, not the
   issue's numbers.
2. **"Shorten the seed" is NOT sufficient by itself, and the issue's own suggested direction is the
   only one that works.** Keeping the directory name `kaola-workflow-validation` and truncating the
   seed all the way to 8 hex still overflows on this box — by 2 characters. Measured, not computed:
   a real `net.createServer().listen()` at that exact path returns `EINVAL`. A fixer who only
   truncates the seed ships a change that does not fix the bug here. The `kaola-workflow-validation`
   directory component must shrink too (issue's `/tmp/kwv-<8hex>` sketch is on the right side of the
   line; a `kwv/<8hex>` shape under `os.tmpdir()` is also fine).

Third finding, not in the issue: **the seed's *length* is not load-bearing for anything.** Its
*determinism* is (it keeps `command_id` stable across runs — measured). A shorter deterministic seed
preserves that property exactly. Details in "What the seed is actually for".

The sibling cargo/`.rustup` finding also **reproduces exactly**, and `--env-allowlist` is confirmed
by measurement to be the **only** in-runner remedy — allowlisting `HOME` itself is silently ignored.

---

## Setup

- Commit: `2018521f` (branch `main`, clean at start)
- Platform: Darwin 25.6.0, Apple Silicon, uid 501
- `TMPDIR` (env, trailing slash): `/var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/` — len **49**
- `os.tmpdir()` (normalized, no trailing slash): `/var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T`
  — len **48**
- Fixtures under `/private/tmp/claude-501/.../scratchpad`; **no tracked file was modified.**
- Note for the fixer: an active worktree exists at
  `.kw/worktrees/bundle-904-905-906-907-908-909-910/` and holds its own four copies (all at the same
  hash). The fix lands there, not in main's checkout.

---

## 1. Exact construction of the sandbox root

`scripts/kaola-workflow-validation-runner.js:727-730`:

```js
function defaultSandboxPaths(repoRoot, policy) {
  const seed = sha256(canonicalJson({ repo_root_sha256: sha256(path.resolve(repoRoot)), policy }));
  const root = path.join(os.tmpdir(), 'kaola-workflow-validation', seed);
  return { root, home: path.join(root, 'home'), tmp: path.join(root, 'tmp') };
}
```

Literal components, in order:

| # | component | source | len here |
|---|---|---|---|
| 1 | `os.tmpdir()` | invoking env's `TMPDIR`, else `/tmp` | 48 |
| 2 | `kaola-workflow-validation` | hard-coded literal | 25 |
| 3 | `<seed>` | `sha256(canonicalJson({repo_root_sha256, policy}))` — full 64-hex | 64 |
| 4 | `home` \| `tmp` | hard-coded literal | 4 / 3 |

The seed's input is the resolved repo root's own sha256 plus the **entire normalized policy**
(`command`, `cwd`, `repetitions`, `pass_rule`, `timeout_minutes`, `env_allowlist`) — so it changes
whenever any of those change.

Only **three lines in the whole repo** carry the literal directory name, and they are all inside the
runner itself (lines 177, 178, 728) — replicated across the four byte-identical copies. There is a
second, *different* default at lines 177–178 (`$TMPDIR/kaola-workflow-validation/{home,tmp}` — **no
seed**) used only when `buildScrubbedEnvironment` is called without explicit isolated paths; the
`run` path never reaches it, since `runValidation` always passes `sandbox.home`/`sandbox.tmp`.

Consumers of the root inside the runner:

- `prepareSandbox()` (`:732`) — `rmSync(root, {recursive, force})` then `mkdirSync(home/tmp)`.
- `buildScrubbedEnvironment()` (`:184`, `:193`) — sets child `HOME` and `TMPDIR` to these paths.
- `collectExecutionIdentity()` (`:767-768`) — the paths reach the identity only as
  `sha256(value)` inside `effective_environment`.
- `normalizeFailureSignature()` (`:808`) — `absolute_paths: [repoRoot, cwdAbs, sandbox.home,
  sandbox.tmp]`, i.e. the paths are **scrubbed out** of the failure signature.

**The literal path never appears in the receipt.** `normalizeOutputText` (`:621-631`) additionally
replaces *any* absolute-looking path with `<ABS_PATH>` (line 628, a blanket regex), so the failure
signature is path-independent regardless of the root's shape.

Origin: commit `bee90116` (2026-07-16, #693/#696/#697/#698). `docs/decisions/D-697-01.md:52-56`
specifies the scrubbed environment and what `command_id` binds; **it says nothing about the sandbox
path shape or the seed's width.** The 64-hex width is `sha256`'s natural output, used unmodified.

---

## 2. Measured lengths on this box

```
$ printf 'TMPDIR=[%s] len=%s\n' "$TMPDIR" "${#TMPDIR}"
TMPDIR=[/var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/] len=49
```

Real seed computed through the runner's own exported `sha256`/`canonicalJson`/`normalizePolicy` for
policy `{command:"node /probe.js", cwd:".", repetitions:1, pass_rule:"all", timeout_minutes:1,
env_allowlist:""}` against a scratch repo root:

```
seed         = 5cd8c4b2ceba7e609498dd4d8c68eead0e57cca01721ee8f593960655bc80879   len 64
root         = /var/folders/.../T/kaola-workflow-validation/5cd8c4b2…0879           len 139
sandbox tmp  = …/5cd8c4b2…0879/tmp                                                  len 143
sandbox home = …/5cd8c4b2…0879/home                                                 len 144
tsx pipe     = …/5cd8c4b2…0879/tmp/tsx-501/12345.pipe                               len 162
```

---

## 3. The failure mechanism, proven directly

### 3a. Threshold on this box — exact

`scratchpad/sock-threshold.js` binds `net.createServer().listen(path)` at paths of length 95…115
under a short base directory:

| path length | result |
|---|---|
| 95 … **104** | **OK** |
| **105** … 115 | `FAIL EINVAL :: listen EINVAL: invalid argument <path>` |

**Threshold: the last length that binds is 104; 105 is the first that fails.** This is the macOS
`sun_path` 104-byte field, and the observed boundary is *inclusive of* 104 (Node does not appear to
need a byte for the terminator here — measured, not assumed).

### 3b. A/B at the runner's exact sandbox paths

Both legs use `env -i` with exactly the runner's deterministic keys (`LANG=C LC_ALL=C TZ=UTC HOME=…
TMPDIR=…` + `PATH`) and the same probe, which reproduces tsx's pipe shape
(`$TMPDIR/tsx-<uid>/<pid>.pipe`):

**Leg A — runner-exact sandbox TMPDIR (len 143):**

```
pipe=/var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/kaola-workflow-validation/5cd8c4b2…0879/tmp/tsx-501/12240.pipe len=162
Error: listen EINVAL: invalid argument /var/folders/…/tmp/tsx-501/12240.pipe
EXIT=1
```

**Leg B — short sandbox TMPDIR `/tmp/kwv-a1b2c3d4/tmp` (len 21):**

```
pipe=/tmp/kwv-a1b2c3d4/tmp/tsx-501/12244.pipe len=40
listen OK
EXIT=0
```

Axis varied: **the sandbox TMPDIR length, and nothing else.** Same probe, same PATH, same LANG/TZ,
same uid.

### 3c. End-to-end through the real runner (CLI)

```
$ node scripts/kaola-workflow-validation-runner.js run \
    --command "node <scratch>/probe-tsx-pipe.js" --timeout-minutes 1 --repo-root <scratch>/fixture-repo
EXIT=1
receipt: outcome = "fail", runs[0].exit_code = 1, stderr_sha256 = 17dfc577…
```

Control leg, same runner, same policy, only `isolated_home`/`isolated_tmp` overridden to
`/tmp/kwv-a1b2c3d4/{home,tmp}` (programmatic `runValidation` — **there is no CLI flag for this**):

```
outcome: pass
exit_code: 0
```

The only axis between the two is the sandbox root. **Confirms the issue's claim end-to-end.**

Also confirmed from that receipt: `reasons` is `undefined` and the run carries only
`stdout_sha256`/`stderr_sha256`/`failure_signature_sha256` — **the red receipt is undiagnosable by
construction**, exactly as the issue's separately-filed sibling complaint says.

### 3d. Candidate shapes — actual socket binds, not arithmetic

`scratchpad/bind-shapes.js` binds at `os.tmpdir()/<dirname>/<n-hex>/tmp/tsx-501/12345.pipe`:

| dirname | seed width | pipe len | bind |
|---|---|---|---|
| `kaola-workflow-validation` | 64 | 162 | **FAIL EINVAL** |
| `kaola-workflow-validation` | 16 | 114 | **FAIL EINVAL** |
| `kaola-workflow-validation` | 8 | 106 | **FAIL EINVAL** |
| `kwv` | 16 | 92 | **BIND OK** |
| `kwv` | 8 | 84 | **BIND OK** |

**This is the load-bearing row of the whole report.** Truncating the seed alone — even to 8 hex —
does not clear the limit on this box. The 25-char directory literal must shrink as well.

### 3e. Budget

```
104 (measured limit)
 - 48  os.tmpdir() on this box
 - 19  "/tsx-501/12345.pipe"  (5-digit pid; kern.maxproc = 16000, highest live pid seen 99531)
 -  4  "/tmp"
 =  33 characters left for "/<dirname>/<seed>"
```

So `len(dirname) + len(seed) <= 31`. `kwv` + 16-hex = 19 (12 spare); `kwv` + 8-hex = 11 (20 spare).
`kaola-workflow-validation` + anything = 25 + n > 31 for every n >= 7.

---

## 4. Everywhere else the length could matter; what pins the current shape

**Nothing pins it.** Measured:

- The literal `kaola-workflow-validation` (as a *directory*, i.e. not followed by `-runner`) appears
  in exactly **three source lines**, all inside the runner, replicated across the four copies. Every
  other hit repo-wide is the *filename* `kaola-workflow-validation-runner.js`. (grep run with
  dot-directories named explicitly; `.opencode`/`.kimi` carry **no** copy of the runner and no
  reference to it.)
- `defaultSandboxPaths` is **not exported** (`module.exports`, `:1486-1516`) — no test can call it.
- `scripts/test-validation-runner.js` touches the sandbox only through **explicit** overrides:
  `isolated_home: '/isolated/home'` / `'/fixture/home'` (`:75-76`, `:249-250`). Those never reach
  `defaultSandboxPaths`.
- **No test anywhere invokes the runner's `run` subcommand.** The only `'run'` hits in the test corpus
  are `npm run …` in `scripts/test-parallel.js`. `simulate-workflow-walkthrough.js` does not reference
  the runner at all. `test-finalize-door.js` uses only the `record` verb, which builds no sandbox.
- No hard-coded 64-hex hash literal in `test-validation-runner.js` corresponds to a receipt digest —
  all `'1'.repeat(64)` style constants are synthetic identity inputs.

**Baseline, run just now:**

```
$ node scripts/test-validation-runner.js       -> EXIT=0   "test-validation-runner: PASSED"
$ node scripts/validate-script-sync.js         -> EXIT=0
   OK: 15 common scripts, 27 byte-identical groups, … committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
```

**Tests that would break if the root were shortened: none found.** That is itself a defect worth
naming — the default sandbox path shape is currently exercised by zero tests, which is why a 139-char
root shipped. Whoever fixes this should expect to add the first test that reaches
`defaultSandboxPaths`.

---

## 5. The four copies are byte-identical, and what enforces that

```
$ shasum -a 256 scripts/… plugins/kaola-workflow/scripts/… plugins/kaola-workflow-gitlab/scripts/… plugins/kaola-workflow-gitea/scripts/…
992fad7193324f203d139bae4357bba080e70566190515565df61ac9627db2e7   (all four, identical)
```

The four copies inside `.kw/worktrees/bundle-904-905-906-907-908-909-910/` are at the **same** hash.

Enforcement: `scripts/validate-script-sync.js:138-143` declares a `BYTE_IDENTICAL_GROUPS` entry
labelled `'validation-runner module copies'` listing exactly those four paths.
`scripts/test-validate-script-sync.js:304-309` looks that group up **by label** and mutation-proves
it (`:319`, `:335` build missing-file and drift fixtures). `scripts/kaola-workflow-install-manifest.js:66`
carries the filename in the support-script list; `scripts/validate-kaola-workflow-contracts.js:655-662`
asserts presence in all editions and in the manifest.

**Consequence for the fix: all four copies change together, byte-for-byte, or `validate-script-sync`
fails.**

---

## 6. The sibling finding: `.rustup` and `--env-allowlist`

Reproduced on this box (`~/.cargo` and `~/.rustup` exist; `cargo` is a rustup shim —
`~/.cargo/bin/cargo -> rustup`):

| leg | command | result |
|---|---|---|
| real HOME | `cargo --version` | `cargo 1.94.0 (85eff7c80 2026-01-15)` — **exit 0** |
| sandboxed empty HOME, no `*_HOME` | same, `env -i … HOME=<empty dir>` | `error: rustup could not choose a version of cargo to run, because one wasn't specified explicitly, and no default is configured.` — **exit 1** |
| sandboxed HOME + `CARGO_HOME`/`RUSTUP_HOME` | same, both set | `cargo 1.94.0 …` — **exit 0** |

Axis varied: presence of `CARGO_HOME`/`RUSTUP_HOME` only. **The issue's account is exact.**

**Is `--env-allowlist` the only remedy? Measured: yes, within the runner.** `buildScrubbedEnvironment`
(`:196-204`) snapshots its own deterministic keys into a `Set` and then does `if (deterministic.has(key))
continue;` for every allowlisted key. So allowlisting `HOME` is **silently ignored** — no error, no
warning:

```
$ buildScrubbedEnvironment({source_env:{TMPDIR:"/tmp", HOME:"/Users/ylpromax5", …},
                            allowlist:["TMPDIR","HOME","CARGO_HOME","RUSTUP_HOME"], …})
{ LANG:"C", LC_ALL:"C", TZ:"UTC",
  HOME:"/SANDBOX/home",          <-- allowlist did NOT restore it
  TMPDIR:"/SANDBOX/tmp",         <-- nor this
  PATH:"/usr/bin",
  CARGO_HOME:"/Users/ylpromax5/.cargo",
  RUSTUP_HOME:"/Users/ylpromax5/.rustup" }
```

So: a tool that reads `$HOME/<dotdir>` is recoverable **only if it offers its own env override** and
the operator knows to allowlist it. A tool with no such variable has no remedy at all.

**Does the runner have any notion of "tools that need HOME"? No.** `HOME` is written at exactly one
line (`:184`) and read nowhere else. `TOOLCHAIN_FILES` (`:54-76`) lists 22 lockfile/version-file names
including `Cargo.lock`, `rust-toolchain`, `rust-toolchain.toml` — but that list is used purely for
*identity binding* (hashing files in the repo), never for provisioning the child's environment. There
is no mapping from a detected toolchain to the env keys that toolchain needs.

(Reported as found, per instruction — no design proposed.)

---

## 7. What the seed is actually for, and the shortest root that keeps it

### The seed's determinism is load-bearing; its *width* is not.

`HOME` and `TMPDIR` are hashed into `command_identity.effective_environment`, which feeds
`command_id` → `vector_id` → `receipt_sha256`. So the sandbox path value **is** inside the identity
chain, as a digest. Measured — two consecutive CLI `run` invocations of the same policy against the
same repo:

```
run1 command_id: 13915f3799a51f063af022c30306efb3f9ae826e277460306a8056e9704fc7ab
run2 command_id: 13915f3799a51f063af022c30306efb3f9ae826e277460306a8056e9704fc7ab
STABLE: true
```

A deterministic-but-shorter seed reproduces this exactly. A `mkdtemp`-style random root would **not** —
that is the property to protect, and the only one.

### What the seed does *not* buy

- **Not cross-machine reproducibility.** `command_id` already embeds `sha256(os.tmpdir()/…)`, and
  `os.tmpdir()` here is `/var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T` — per-user, per-machine. Two
  boxes can never agree on `command_id` today. Shortening the root trades away nothing here because
  there is nothing to trade.
- **Not concurrency safety.** `prepareSandbox` (`:733`) does `rmSync(root, {recursive:true, force:true})`
  before `mkdir`. Two concurrent runs of the **same** policy on the same repo already share one root
  and already wipe each other. A truncated seed extends that hazard only to *near-identical* policies,
  and only if they collide.
- **Not attribution.** The path appears in no receipt field; both `normalizeFailureSignature`'s
  explicit `absolute_paths` scrub and the blanket `<ABS_PATH>` regex remove it from output.

### Recommended shortest sufficient root

`os.tmpdir()/kwv/<16-hex prefix of the same seed>/{home,tmp}` — measured pipe length **92**, 12 chars
of headroom past the measured 104 limit, and 16 hex = 64 bits of collision space, i.e. birthday
collision at ~4 billion concurrent sandbox roots.

`kwv/<8-hex>` also binds (pipe 84, 20 spare) but drops to 32 bits; **the extra 8 hex costs 8
characters and there are 12 to spare, so 16 is free.**

**What you trade away at 16 hex: nothing measurable.** Determinism is unchanged, cross-machine
comparability was never available, and concurrency safety was already absent for identical policies.
The only property genuinely reduced is seed collision resistance, from 2^256 to 2^64, against a
population of at most a handful of live sandbox roots.

**What you must NOT do:** keep `kaola-workflow-validation` as the directory component. Measured at
3d: it overflows at every seed width down to 8.

---

## Constraint list a fixer must respect

1. **Change the directory literal AND the seed width.** Seed-only truncation is measured not to fix
   it here (106 > 104 at 8 hex). Target: `len(dirname) + len(seed) <= 31` for this box's 48-char
   `os.tmpdir()`.
2. **Keep the seed deterministic** — a function of `{repo_root, policy}` and nothing else. A random
   root breaks `command_id` stability, which is measured to hold today.
3. **All four copies change identically.** `validate-script-sync.js:138-143` enforces byte-identity
   under the label `'validation-runner module copies'`; `test-validate-script-sync.js:304-309`
   mutation-proves it. Edit in the worktree
   `.kw/worktrees/bundle-904-905-906-907-908-909-910/`, all four paths.
4. **Two default sites, not one.** Lines 727-730 (`defaultSandboxPaths`, seeded) *and* lines 177-178
   (`buildScrubbedEnvironment`'s unseeded fallback) both hard-code `kaola-workflow-validation`.
   Leaving 177-178 behind is a live inconsistency even though the `run` path never reaches it.
5. **No test currently reaches `defaultSandboxPaths`** — it is not exported, and the `run` subcommand
   is invoked by no suite. Whatever guard is added is the first coverage this code has ever had; it
   must be mutation-proven, since a green suite proves nothing about a path shape nothing reads.
6. **Do not weaken the sandbox's containment to buy length.** `/var/folders/…/T` is `drwx------`
   owned by the user; `/tmp` (→ `/private/tmp`) is `drwxrwxrwt`, world-writable. Moving the root to
   `/tmp` on POSIX would buy 44 characters and cost the private-directory property. Staying under
   `os.tmpdir()` with a short dirname buys enough (12 chars headroom) without that trade — and note
   that with `TMPDIR` unset, `os.tmpdir()` already returns `/tmp` (measured: len 4).
7. **The receipt digests will change** for any given policy (the `HOME`/`TMPDIR` `value_sha256` rows
   move, so `command_id`/`vector_id`/`receipt_sha256` move). Nothing in-repo compares them across
   commits, but any consumer holding an inherited `{command_id, required_pass_vector_id}` obligation
   (`docs/decisions/D-697-01.md:70`) from before the change will see it invalidated. Worth a
   `CHANGELOG` line.
8. **Headroom is for unknown consumers.** tsx's 19-char suffix is one sample. Prefer the shape with
   the most spare characters among those that satisfy 1-2.

---

## Inferences (labeled — these are mine, not measurements)

- **This is not macOS-only in principle** — confidence: moderate. Linux's `sun_path` is 108 bytes.
  With `os.tmpdir()` = `/tmp` on Linux, the current shape yields `5+1+25+1+64+4+19 = 119` > 107, so
  the same overflow should occur there. **Not measured — no Linux box available.** Refuted by running
  `scratchpad/sock-threshold.js` on Linux and finding the pipe binds.
- **The bug has been latent since `bee90116` (2026-07-16)** and surfaced only now because it needs a
  consumer that binds a unix socket under `TMPDIR`. Confidence: high — the seeded root landed in that
  commit and has not changed since (`git log -S`), and no suite exercises it.
- **The undiagnosable red receipt is what made this expensive**, not the overflow itself — confidence:
  high. Measured at 3c: the receipt carries only digests and an empty `reasons`, so an operator seeing
  `outcome: fail` has no path from the receipt to the cause. The issue files that separately; it is
  the same surface and worth fixing in the same pass.

## Open (unmeasured, and why)

- Real `tsx` was not exercised — it is not installed here and the reproduction did not need it; the
  probe binds the identical path shape the issue documents. If a fixer wants the literal tsx path,
  the pid width is the only unknown and it is bounded at 5 digits by `kern.maxproc = 16000`
  (highest live pid observed: 99531).
- Windows was not measured. `buildScrubbedEnvironment` sets `TEMP`/`TMP` there and named pipes have
  no `sun_path` limit, so it is very likely unaffected — but that is an inference, not a measurement.
- Whether any *other* tool in a consumer repo binds under `TMPDIR` with a longer suffix than tsx's 19
  chars — unenumerable; hence constraint 8.

## Artifacts

- `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/8070a702-f33f-4c74-8c66-4434a7ea9c6d/scratchpad/sock-threshold.js`
- `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/8070a702-f33f-4c74-8c66-4434a7ea9c6d/scratchpad/probe-tsx-pipe.js`
- `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/8070a702-f33f-4c74-8c66-4434a7ea9c6d/scratchpad/bind-shapes.js`
- `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/8070a702-f33f-4c74-8c66-4434a7ea9c6d/scratchpad/receipt-long.json` (the failing receipt)

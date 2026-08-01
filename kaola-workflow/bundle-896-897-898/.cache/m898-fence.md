# m898 — re-measuring issue #898 and costing the candidate fence

## Setup

- **Commit measured:** `3e2019f6f7ff8fc4663db6bc5a08ff9949ec32cf` (`main`, clean apart from the
  untracked `kaola-workflow/bundle-896-897-898/`).
- **Real repo: never mutated.** Verified at start and end — `scripts/kaola-workflow-adaptive-schema.js`
  and all three plugin copies hash `f426052054624557` before and after every experiment.
- **Where the mutations ran:** a `git clone --local` mirror at
  `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/176fc27c-8e46-48f3-80d7-313c6ebcdc4b/scratchpad/m898/mirror`,
  with a private `TMPDIR` at `…/scratchpad/m898/tmp`.
- **Node:** v24.14.0. **Platform:** darwin 25.6.0.

### Measurement hazard hit, and how it was removed

The first attempt put the mirror at `…/scratchpad/mirror` and ran suites while a background
walkthrough was in flight. It produced five reds, **all spurious**: `uv_cwd` ENOENT crashes and a
`testE2EGitHubPrFullChain` failure, and finally the mirror directory itself vanished mid-run. The
scratchpad is **shared with the other agents in this session** (it contained `ab-helpers.js`,
`kw-ab-*`, `m897/`, `render/`, etc., none of them mine), and a teammate's `rm -rf …/mirror` removed
my tree. Combined with the known "this suite cannot be parallelized" property, every leg below was
re-run **strictly serially, one suite at a time, under a private TMPDIR, at a uniquely-named path**.
The numbers reported here are from those clean re-runs. Nothing in the first attempt is reported.

### Mutations used

Both were reconstructed **verbatim from the deletion in `6fdbf714`** (`git show 6fdbf714 --
scripts/kaola-workflow-adaptive-schema.js`), not re-derived by hand.

| leg | mutation |
|---|---|
| **L0** | pristine (control) |
| **L1 "narrow"** | `evaluateReleasePrepCarryOver` + `firstJsonDifference` + `RELEASE_VERSIONED_JSON_FILES` restored exactly; ancestry check, `RELEASE_FILES` confinement, version-only JSON deep-equality all present |
| **L2 "broad"** | same, with the `offSurface` confinement block replaced by a comment — any ancestor binds |

Each leg was propagated to the three plugin copies with `edition-sync.js --materialize-kernel`,
i.e. exactly what the npm chains do as their first step.

**Arming proof for the mutations** (fixture: green four-chain receipt at commit A; commit B bumps
only `package.json` + `CHANGELOG.md`):

| kernel | `--release-check --json` exit | verdict |
|---|---|---|
| pristine | 1 | `chains_stale`, `stale_paths: ["CHANGELOG.md","package.json"]` |
| narrow | **0** | `result: pass` |
| broad | **0** | `result: pass` |

The mutations are genuinely live and flip the gate. Nothing below is measured against a dead patch.

---

## CORRECTED FACTS

### Claim 1 — "#888 deleted a release-prep carry-over from `evaluateReleaseReceipt`" — **TRUE**

Confirmed by `git show 6fdbf714`. The deleted unit was `evaluateReleasePrepCarryOver(root,
receiptSha, candidateSha)` plus its two helpers, and a three-way edit inside `evaluateReleaseReceipt`
(binding branch, pass envelope `binding`/`carryOver` keys, and the doc comment). Introduced by
`aa7179d2`. No ancestor/`merge-base` logic survives anywhere in the release path today —
`grep -n "merge-base\|isAncestor\|ancestor"` over `kaola-workflow-adaptive-schema.js`,
`kaola-workflow-run-chains.js` and `kaola-workflow-release.js` returns only prose comments plus the
unrelated finalize diff-base at `run-chains.js:599-613`.

### Claim 2 — "re-adding a narrow carry-over leaves every named suite EXIT=0" — **TRUE, reproduced**

Every run serial, private TMPDIR, real `$?` captured (never through a pipe):

| suite | L0 pristine | L1 narrow |
|---|---|---|
| `simulate-workflow-walkthrough.js` (full scope, unsharded) | **0** | **0** |
| `simulate-workflow-walkthrough.js --only testReleaseCheckPreTagGate` | 0 | **0** |
| `test-finalize-door.js` | 0 | **0** |
| `test-release.js` | 0 | **0** |
| `test-run-chains.js` | 0 | **0** |
| `test-oracle-kernel.js` | 0 | **0** |
| `test-kernel-conformance.js` | 0 | **0** |
| `validate-workflow-contracts.js` | 0 | **0** |
| `validate-kaola-workflow-contracts.js` | 0 | **0** |
| `edition-sync.js --check` | 0 | **0** |
| `validate-script-sync.js` | 0 | **0** |

The core claim of #898 reproduces exactly. **Nothing authored today notices the narrow route
returning.**

Structural corroboration for why: `chains_stale` appears in only two suites outside the walkthrough
— `test-release.js:116-117` and `test-finalize-door.js` — and every non-equal-sha fixture in both
uses a **non-resolvable** sha (`'deadbeef'` at `test-release.js:116`, `'0'.repeat(40)` at
`test-finalize-door.js:664`). A non-resolvable sha fails `merge-base --is-ancestor`, so the
carry-over refuses there for the wrong reason and the assertions stay green. `test-oracle-kernel.js`,
`test-kernel-conformance.js` and both contract validators contain **zero** occurrences of
`chains_stale`, `evaluateReleaseReceipt` or `RELEASE_FILES`.

### Claim 2b (bonus, not in the issue) — a base-only kernel edit **is** caught by `validate-script-sync.js`, but the chain preamble erases that

| step | exit |
|---|---|
| `validate-script-sync.js`, narrow applied to `scripts/` only | **1** (caught) |
| `edition-sync.js --check`, same state | 0 (does not cover this file) |
| `edition-sync.js --materialize-kernel` (fast-gate step 1) | 0 — copies base → all three plugins |
| `validate-script-sync.js` **after** materialize | **0** |

So the cross-edition parity guard would flag a hand-edited kernel, but the chains' own
`--materialize-kernel` preamble runs first and auto-propagates the edit, making the divergence
invisible by the time the guard runs. This is not a defect — materialization is the documented
design (`edition-sync.js:213`) — but it means "the parity anchor would catch it" is **not** an
available answer here.

### Claim 3 — "a broad relaxation is caught by exactly ONE test, `#651 (4)`" — **FALSE**

Two separate assertions catch it, and the issue's line numbers are off.

**Real locations** (`scripts/simulate-workflow-walkthrough.js`, all inside
`testReleaseCheckPreTagGate`, which begins at line 1048):

| case | issue says | actually |
|---|---|---|
| `#651 (4)` OLDER-SHA | `1109-1133` | comment `1115-1116`, block **`1117-1129`**, assertion **`1125-1128`** |
| `#651 (9)` EXPLICIT `--candidate` | not mentioned | block **`1179-1193`**, the catching assertion **`9b` at `1190-1192`** |

`#651 (4)` fires first and the hand-rolled `assert` throws, so a plain run hides `9b`. Measured by
neutering **only** `#651 (4)`'s assertion in the mirror and re-running under the broad kernel:

```
Error: #651 (9b): the same receipt must refuse chains_stale against the advanced HEAD, got status 0
  {"result":"pass","mode":"release-check","candidate":"8821ff9d…","chains":[…]}
```

`9b`'s fixture commits `later.js` after the receipt — an off-surface path — so a broad relaxation
turns its expected refusal into a pass. It is a genuine second catcher, not a duplicate.

### Claim 4 — "so on any given fast-gate run there is roughly a 1-in-12 chance the only defending test ran" — **FALSE**

The premise about the direct invocation is right; the conclusion is wrong, because the fast gate
runs the walkthrough **twice**, and only one of the two is sharded.

`test-kernel-conformance.js` is **step 16 of 40** in `test:kaola-workflow:claude`. It lists
`simulate-workflow-walkthrough.js` as a vehicle (`scripts/test-kernel-conformance.js:327-331`) and
spawns it at `:463-470` with argv `[<script>]` — **no `--shard` flag** — then asserts
`result.status === 0` at `:471-472`. With no `--shard`, `test-shard-lib.selector` returns
`{sharded:false, total:1, owns:()=>true}` (`scripts/test-shard-lib.js:98-108, 111-114`), so **every
one of the 185 ordinals runs**. The sharded direct invocation is step 36.

Measured: under the broad kernel, `test-kernel-conformance.js` **EXIT=1**, failing at
`vehicle stays green under observation: simulate-workflow-walkthrough.js`. The fast gate is
`&&`-chained, so it reds at step 16 **deterministically, every run** — not 1-in-12.

The escape hatch `KAOLA_KERNEL_CONFORMANCE_LOG` (`test-kernel-conformance.js:453`) would skip the
vehicles, but it is set nowhere in `package.json` or any script — it exists only as a documented
developer convenience at `:29`.

(Corollary worth knowing beyond this issue: the "fast gate samples the walkthrough at 1/12" rule of
thumb understates coverage — the fast gate does run the walkthrough at full scope, just under a
different suite's name, before the sampled run.)

---

## BINDING ROUTES TODAY

`evaluateReleaseReceipt` lives at **`scripts/kaola-workflow-adaptive-schema.js:1450-1550`** (contract
comment `1423-1449`). It is defined **once**, in the byte-identical kernel; the three plugin copies
are byte-identical duplicates, not variants. It has exactly **two** callers:

- `scripts/kaola-workflow-run-chains.js:820-823` — `runReleaseCheck`, the `--release-check` CLI
- `scripts/kaola-workflow-release.js:227-231` — `chainCheck`, called from `--tag` at `:293`

### Every branch, in order

| # | line | condition | outcome |
|---|---|---|---|
| 1 | 1464-1467 | receipt file unreadable | refuse `chains_unverified` |
| 2 | 1470-1472 | receipt not parseable JSON / not an object | refuse `chains_unverified` |
| 3 | 1479-1483 | `headSha` empty or `'unknown'` | refuse `chains_stale` |
| 4 | 1485-1490 | candidate did not `rev-parse` | refuse `chains_stale` |
| 5 | **1491-1496** | **`stamped !== candidate`** | refuse `chains_stale` |
| 6 | 1497-1500 | `workTreeHash !== 'clean'` | refuse `chains_stale` |
| 7 | 1502-1505 | `chains[]` empty / not an array | refuse `chains_empty` |
| 8 | 1517-1520 | chain set unresolvable from `package.json` | refuse `repo_kind_undetermined` |
| 9 | 1523-1529 | declared chain missing from receipt | refuse `chains_incomplete` |
| 10 | 1530-1538 | any `exitCode !== 0` without `accepted_red` | refuse `chains_red` |
| 11 | 1539-1547 | any `accepted_red === true` | refuse `chains_waived` |
| **12** | **1548-1549** | everything above passed | **the only `return { ok: true … }` in the function** |

**Yes — exact `headSha` equality is genuinely the only binding route.** There is one `ok: true`
return, and reaching it requires passing branch 5 verbatim. No `codeTreeHash` relaxation, no
ancestry, no path-confinement carve-out. This matches `docs/api.md:392-397` and
`docs/conventions.md:545-554`, both of which already state it and already record the #888 derivation.

### The pass envelope, as callers actually emit it

This is the decisive fact for the candidate fence, and it is not visible from the kernel alone.

`runReleaseCheck` does **not** forward the kernel's return object. It rebuilds the JSON key by key
at `kaola-workflow-run-chains.js:831-833`:

```js
JSON.stringify({ result: 'pass', mode: 'release-check', candidate: verdict.candidate, chains: verdict.chains })
```

`chainCheck` narrows even harder — `{ ok: true, chainHeadSha: verdict.candidate }`
(`kaola-workflow-release.js:230`). Measured key sets on the identical narrow-carry-over fixture:

| kernel | CLI envelope keys (`--release-check --json`) | kernel return keys |
|---|---|---|
| pristine | `["result","reason","operator_hint","errors","stale_paths","stale_kind"]` (refuses) | `["ok","reason","operator_hint","errors","stale_paths","stale_kind"]` |
| narrow | `["result","mode","candidate","chains"]` | `["ok","mode","candidate","chains","binding","carryOver"]` |
| broad | `["result","mode","candidate","chains"]` | `["ok","mode","candidate","chains","binding","carryOver"]` |

**The CLI pass envelope is byte-shape-identical whether the binding was exact equality or a
re-added carry-over.** The `binding` and `carryOver` keys are dropped by the caller.

---

## SAMPLING REALITY

- **The flag:** `package.json:40` — `node scripts/simulate-workflow-walkthrough.js --shard auto/12`,
  step 36 of 40 in `test:kaola-workflow:claude`.
- **How the slice is chosen:** `scripts/test-shard-lib.js:66-78`. Seed = `KAOLA_SHARD_SEED` if set,
  else `git rev-parse HEAD`. Hash `h = ((h*31) + charCodeAt(i)) >>> 0` over the 40-char sha;
  index = `(h % 12) + 1`. So it rotates **on the commit sha**, deterministic within a commit
  (a red is reproducible), different across commits.
- **Partition:** stride, `owns(ordinal) === (ordinal % 12) === (index - 1)`
  (`test-shard-lib.js:111-114`).
- **Ordinal space:** 196 registry entries, 12 of them in the shared-tmp group which registers as a
  single indivisible ordinal 0 → **185 ordinals (0…184)**.
- **`testReleaseCheckPreTagGate` is ordinal 146**, therefore owned by shard **`(146 % 12) + 1 = 3`**.
- **At HEAD `3e2019f6`, `auto/12` resolves to index 12 — not 3.** So on the fast gate at the exact
  commit under review, the *direct* walkthrough invocation does **not** run the release-gate scenario.
  Across the last 40 commits, 5 selected shard 3 (12.5%, consistent with 1/12).

**But `#651 (4)` and `#651 (9b)` are not subject to that sampling in practice**, for the reason in
Claim 4: step 16, `test-kernel-conformance.js`, spawns the walkthrough unsharded and asserts exit 0.
Measured — broad kernel, `test-kernel-conformance.js` EXIT=1.

**Net sampling verdict:**

| relaxation | caught by | fast-gate probability |
|---|---|---|
| broad (off-surface paths pass) | `#651 (4)` + `#651 (9b)` | **1.0** (via step 16, deterministic) |
| **narrow (RELEASE_FILES-confined)** | **nothing** | **0.0** |

The real exposure is not a 1-in-12 gamble. It is a **hole with probability zero of being caught**,
sitting next to a wall that is solid.

---

## THE CANDIDATE ASSERTION

### The literal wording in the issue is not implementable as stated

"An assertion that the pass envelope carries no binding route other than exact `headSha` equality"
reads as an **envelope-shape** check. Measured above: the CLI pass envelope is identical under all
three kernels. A key-set assertion at the CLI level is **structurally unarmable** — it cannot
distinguish the routes. At the kernel level a `binding`-key assertion *would* have caught my faithful
re-add, but it only catches a re-adder who also adds the key; dropping one line of bookkeeping evades
it entirely. That is a fence against a naming convention, not against a behaviour.

### What is implementable: the same intent, asserted behaviourally

**Where:** `scripts/test-finalize-door.js`, inside the existing `T5_releaseCheck` IIFE
(`:629-721`), inserted immediately before `T5i` at `:715`. That block already owns a self-host
fixture repo whose `initSelfHostRepo` (`:80-99`) writes `package.json`, `README.md` and
`CHANGELOG.md` — i.e. real `RELEASE_FILES` members — plus `writeRootReceipt`, `releaseCheck`,
`refusedWith` and a green `base_` receipt. No new fixture is needed.

**Which suite:** `test-finalize-door.js` is **step 18 of 40** in `test:kaola-workflow:claude`. It is
unsharded and unconditional, so this runs on every fast-gate run and every chain run. Test custody
is respected: the fence is a test artifact, authored by whoever holds tests, not by the implementer.

**Size:** **16 added lines** (5 comment, 11 code), +3 assertions
(153 → 156 in `test-finalize-door.js`). Exact text as measured:

```js
// --- T5j: NO SECOND BINDING ROUTE. An ANCESTOR receipt whose entire intervening diff lies
// inside the release-prep surface (RELEASE_FILES) still refuses. This is the shape #881's
// release-prep carry-over accepted and #888 deleted; it is asserted behaviourally rather than
// by envelope shape because run-chains.js builds the pass envelope key-by-key and would drop a
// `binding` field a re-added route set. Mutation-armed: re-adding the carry-over turns this red.
writeRootReceipt(base_);                       // green receipt stamped at `head`
const pkgPath = path.join(repo, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = '0.0.1';                         // version-only bump: the release-prep shape
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
fs.writeFileSync(path.join(repo, 'CHANGELOG.md'), '# Changelog\n\n## [0.0.1] - 2026-01-01\n');
G.commitPaths(repo, ['package.json', 'CHANGELOG.md'], 'release prep');
assert(G.head(repo) !== head, 'T5j: the release-prep commit advanced HEAD (fixture is real)');
x = releaseCheck();
refusedWith(x.r, x.out, 'chains_stale', 'T5j (ancestor receipt, release-prep-only diff)');
```

The `G.head(repo) !== head` line is a non-vacuity guard: without it, a fixture whose commit silently
no-op'd would make the whole assertion pass for the wrong reason.

### Mutation-arming proof — **YES, provably armed**

Written into the mirror and run against all three kernels, serially:

| kernel under the fence | `test-finalize-door.js` exit | detail |
|---|---|---|
| pristine | **0** | `finalize-door tests passed (156 assertions)` |
| **narrow carry-over** | **1** | `FAIL: T5j (ancestor receipt, release-prep-only diff): exits non-zero; got 0` |
| **broad relaxation** | **1** | `FAIL: T5j (ancestor receipt, release-prep-only diff): exits non-zero; got 0` |
| pristine again (residue check) | **0** | `finalize-door tests passed (156 assertions)` |

It closes the *entire* hole — both the narrow route (which nothing catches today) and the broad one
(which is already double-covered) — and it goes red at fast-gate step 18 with probability 1.

### Cost, honestly

- 16 lines in one already-existing test block; no new file, no new fixture, no production code.
- No propagation: it is a test artifact, so no four-edition kernel copy, no routing skeleton, no
  `templates/routing/` regeneration.
- Runtime: negligible — one extra git commit and one extra `--release-check` spawn inside a block
  that already does nine of them.
- It pins the *absence* of a mechanism. If the owner ever decides to re-introduce a carry-over
  deliberately, this test is deleted with that decision, which is exactly the project's stated
  custody rule (a test dies with its mechanism, never gets repaired ahead of it).

---

## OBSERVED-OR-DERIVED

### What a watch-list row requires

`kaola-workflow/.roadmap/issue-878.md` is a stub whose `next_step` says *"REFERENCE ONLY — do not
schedule. Consult when one of its failure classes is observed."* The GitHub body points at the real
table: `docs/decisions/0017-the-mission-list.md:121-135`, three columns —
**failure class | observation that would arm it | mechanism already sized**.

The middle column is not a hypothesis. Every row names a **concrete event that has not happened yet**
and that a person could witness. The sharpest one (`:134`):

> any typed `reason:` code appearing on a runtime surface **at all** — the enforcement domain
> becoming non-zero. Today it is 0 of 62

And the ADR's own gloss at `:137-144` explains the discipline: the additive-edition row "was derived
by symmetry, and symmetry is exactly the argument this list exists to refuse," while the two rows
that *were* built each "was armed by an observed failure" — a real token reaching real surfaces.

### What was actually observed in #898

Being precise, because the distinction is fine and the issue itself is careful about it:

**OBSERVED (a real, reproducible fact about the repo, re-confirmed today):** with the carry-over
present, eleven suites including the full-scope walkthrough all exit 0. That is a *coverage
measurement*. It reproduces. It is not a hypothesis.

**NOT OBSERVED (no such event has occurred):**
- No carry-over has been re-introduced. #888 removed it and it is gone.
- No release was ever tagged against an unverified tree via this route. The audit trail says the
  opposite: the route "could not fire in the only release sequence the workflow has"
  (`kaola-workflow-adaptive-schema.js:1431-1434`), because the sink's `chore: archive <project>`
  commit always interposes off-surface paths.
- The deletion itself was verified safe, "including a byte-for-byte check that removing
  `receiptBindsTo` restored the pre-#881 line rather than silently making a `chains_stale` arm
  unreachable" (#898's own opening).

**So the harm is DERIVED, and the coverage gap is OBSERVED.** They are different objects and the
issue conflates them in one sentence ("the exposure"). Stated exactly:

> **Observed:** *"the suite does not distinguish this behaviour."*
> **Derived:** *"therefore a future change could reintroduce it and ship."*

Nobody reintroduced it. No release went out unverified. What was seen is a *test-suite silence* that
someone had to go looking for by writing a mutation nobody had asked for.

### How that maps onto the watch-list test

By #878's own standard, "the observation that would arm it" here would be something like: **a change
lands that re-introduces or widens a release-gate binding route, and it reaches `main` green.** That
has not happened. The failure class is *regression in a mechanism that was deliberately removed* —
and the mechanism was removed **three commits ago**, with its derivation written into
`docs/conventions.md:545-554`, `docs/api.md:392-397`, the kernel comment at
`kaola-workflow-adaptive-schema.js:1429-1434`, the walkthrough header at
`simulate-workflow-walkthrough.js:1037-1043`, and the T5 header at `test-finalize-door.js:625-627`.
That is five independent prose surfaces telling a future reader not to bring it back.

The strongest counter-argument to filing this as watch-list-only, stated fairly: **#878's rows are
about mechanisms that were never built and failure classes with no history in this repo. This one has
history.** #881 built the carry-over, #888 measured it unreachable and deleted it. The class here is
"a removed mechanism comes back" — and the repo *has* seen a version of it (#881 shipped a route that
could not fire and read as a live feature for weeks). Whether that counts as "observed" for the
purposes of arming depends on whether you read the class as *the route returning* (never observed) or
*a release-binding route existing that nobody's tests exercised* (observed, and it was #881 itself).

That is a values call about how the derive-additively rule reads, and it is yours.

### The evidence the tradeoff turns on

| | build the fence | leave it recorded |
|---|---|---|
| what it costs | 16 lines, 1 file, 3 assertions, no propagation, mutation-proven armed | 0 |
| what it buys | narrow-route detection goes 0.0 → 1.0 at fast-gate step 18 | nothing new; 5 prose surfaces already say "do not bring this back" |
| the rule it strains | "add only what an **observed failure** demands" — no failure has occurred | "silence is an answer" applies cleanly |
| what it also does | pins the deliberate absence of a mechanism, so a future intentional re-introduction must delete a test to proceed | leaves the deliberate absence unpinned |
| the asymmetry | the thing it guards is a **release tag** — irreversible and published | the sink's archive commit still makes the route unreachable in practice |

Two facts that do not fit neatly on either side:

1. The `--materialize-kernel` preamble means the cross-edition parity anchor cannot be leaned on as a
   backstop here (Claim 2b). If the fence is not built, there is no second line.
2. The issue's stated cheapest-honest-fence — an envelope-shape assertion — **does not work**, so
   "cheapest honest fence" is 16 behavioural lines rather than a one-liner. That is still cheap, but
   it is 16× the issue's implied cost.

---

## OPEN

- **Not measured: the fast gate end to end** (~25 min under `KAOLA_RUN_CHAINS_CONCURRENCY=serial`).
  The claim that it reds under broad rests on `test-kernel-conformance.js` (step 16) exiting 1 in
  isolation plus the `&&` chaining in `package.json:40` — deduction from two measured facts, not one
  direct measurement. Confidence high; the chaining is not subtle.
- **Not measured: the other three edition chains** (`codex`, `gitlab`, `gitea`). They run their own
  forked walkthroughs (`plugins/*/scripts/simulate-*-walkthrough.js`), which may or may not carry a
  `#651`-equivalent. Given the cross-edition rule that each edition's suite defends its own copy,
  this is worth a look if the fence is built, but it does not change the fast-gate answer.
- **Not measured: `release.js --tag` end to end under the mutations.** `chainCheck`
  (`kaola-workflow-release.js:227-231`) calls the same kernel function and `test-release.js` stayed
  green under both legs, so the door is the same door; I did not separately drive a tag creation.
  #898 reports it did, and that part of its account is consistent with what I measured at the kernel.
- **`#651 (9b)`'s catching power was proven by neutering `#651 (4)` in the mirror.** I did not
  enumerate whether a *third* assertion sits behind `9b` — the same first-throw shadowing applies. It
  does not matter for the verdict: the narrow route is caught by zero of them either way.

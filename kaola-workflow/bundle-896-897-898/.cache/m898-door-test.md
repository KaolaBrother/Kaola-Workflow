# m898 — the release-binding fence, authored and mutation-proven

**Baseline:** `3e2019f6f7ff8fc4663db6bc5a08ff9949ec32cf` (the worktree's HEAD; the mirror was cloned
from it and verified at that sha).
**Delivered file:** `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-896-897-898/scripts/test-finalize-door.js`
(sha256 prefix `6af8f448a578bd21`, 928 lines, `+17 −0` vs baseline). **Not committed.**
**Node:** v24.14.0. **Platform:** darwin 25.6.0.

---

## WHAT WAS ADDED

One scenario, `T5j`, at `scripts/test-finalize-door.js:720-735` — inside the existing
`T5_releaseCheck` IIFE, immediately **after** `T5i`, reusing that block's fixture repo, its
`writeRootReceipt` / `releaseCheck` / `refusedWith` helpers and its green `base_` receipt. No new
file, no new fixture, no production code, no cross-edition propagation.

(The investigation costed this block *before* `T5i`. It is delivered *after* instead, purely so the
labels read `T5a…T5i, T5j` rather than `…T5h, T5j, T5i`. The block is self-contained — its first
statement re-creates the receipt `T5i` deletes — and **all four mutation legs below were re-run on
the final, reordered bytes**, not on the investigation's ordering.)

**What it asserts, behaviourally:** a chain receipt that is green, unwaived, four-chain,
clean-stamped and stamped at a commit that is a **direct ancestor** of the release candidate, where
the *entire* intervening diff is confined to the release-prep surface (`package.json` version-only
bump + `CHANGELOG.md` rewrite — both `RELEASE_FILES` members), **must still refuse `chains_stale`**.

That is the exact shape #881's release-prep carry-over accepted and #888 deleted. It pins CLAUDE.md's
rule — *"bound to the tagged commit by exact `headSha` equality"* — as the **only** binding route,
by exercising the one input that would distinguish a second route from none.

Concretely the block: writes the green receipt stamped at the original `head`; bumps
`package.json`'s `version` `0.0.0 → 0.0.1` re-serialized in the fixture's own format so the diff is
version-only; rewrites `CHANGELOG.md`; commits **only those two paths**; asserts HEAD actually
advanced; then runs `--release-check --json` and requires a non-zero exit carrying `chains_stale`.

**Why behavioural and not the envelope-shape assertion #898 proposed.** I did not re-derive this —
the investigation measured it and I took it as given: `run-chains.js:831-833` rebuilds the pass
envelope key by key as `{result, mode, candidate, chains}`, so a re-added route's `binding` /
`carryOver` keys never reach stdout. A key-set assertion is identical under pristine, narrow and
broad kernels and therefore **cannot go red**. The reason is recorded in the block's own comment so
a future reader does not "simplify" it back into an unarmable shape.

**Non-vacuity guard.** `assert(G.head(repo) !== head, …)` — without it, a fixture whose commit
silently no-op'd would leave `stamped === candidate`, and the scenario would then pass for entirely
the wrong reason.

---

## FOUR-LEG MUTATION PROOF

All work in a private mirror at
`…/scratchpad/finalize-door-tests/mirror` (`git clone --local`, verified at `3e2019f6`), with a
private `TMPDIR` at `…/scratchpad/finalize-door-tests/tmp`. Every suite run **serially**, one at a
time. Exit codes captured from `$?` on the `node` invocation directly — never through a pipe. Each
leg re-materialized to the three plugin copies with `edition-sync.js --materialize-kernel`, exactly
as the npm chains do as their first step. **The real repo and the worktree were never mutated**:
the worktree kernel hashes `f426052054624557` (its baseline value) after all of this, and the only
worktree file I touched is `scripts/test-finalize-door.js`.

**Mutations**, reconstructed from `git show 6fdbf714 -- scripts/kaola-workflow-adaptive-schema.js`
rather than re-derived by hand. That file diff has 9 hunks; 6 of them mention the carry-over
(`evaluateReleasePrepCarryOver`, `RELEASE_VERSIONED_JSON_FILES`, `firstJsonDifference`, the
`BINDING` branch, the `binding`/`carryOver` return keys) and 3 are unrelated #888-bundle deletions
(`CURATED_ROOT_PATHS`, `docs/mission-list.md`, a `module.exports` entry). Only the 6 carry-over
hunks were reverse-applied, so nothing outside the release binding moved. `git apply -R --check`
passed at exact line numbers.

| leg | kernel state | `carryOver` fn | `offSurface` block | kernel sha256 | **`node scripts/test-finalize-door.js`** |
|---|---|---|---|---|---|
| 1 | **pristine** | absent | absent | `f426052054624557` | **EXIT 0** — `finalize-door tests passed (156 assertions)` |
| 2 | **NARROW** carry-over re-added verbatim (ancestry + `RELEASE_FILES` confinement + version-only JSON deep-equality all present) | present | present | `051a72c2ce03aa24` | **EXIT 1** |
| 3 | **BROAD** — narrow, with the `RELEASE_FILES` confinement block replaced by a comment, so any ancestor binds | present | removed | `37866b2d7bd7622d` | **EXIT 1** |
| 4 | **pristine again** (residue check; kernel byte-identical to leg 1) | absent | absent | `f426052054624557` | **EXIT 0** — 156 assertions |

**Failure signature, legs 2 and 3 (identical text on both):**

```
FAIL: T5j (ancestor receipt, release-prep-only diff): exits non-zero; got 0
FAIL: T5j (ancestor receipt, release-prep-only diff): carries the typed token chains_stale; got {"result":"pass"}
finalize-door tests FAILED (2 failures, 154 passed)
```

Two things worth naming in that signature. First, `got 0` and `{"result":"pass"}` are the gate
itself flipping — the mutation is **genuinely live**, not a dead patch the test merely noticed, and
this is the same measurement the investigation reported for `--release-check --json` (exit 1 → 0).
Second, **only T5j's two assertions fail** under either mutation; the other 154 are untouched, so
the reds are attributable to this scenario and nothing else in the file.

Assertion count moved `153 → 156` (+3), matching the investigation's estimate exactly.

---

## ATTRIBUTION UNDER NARROW

The question that matters: under the narrow re-add, does `test-finalize-door.js` red **alone**?
Measured, all under the narrow kernel, serially, real `$?`:

| suite | exit under NARROW |
|---|---|
| **`scripts/test-finalize-door.js`** | **1** ← the only red |
| `scripts/simulate-workflow-walkthrough.js` — **full scope, unsharded** | 0 (`184/184 passed`) |
| `scripts/test-kernel-conformance.js` | 0 (254 assertions) |
| `scripts/simulate-workflow-walkthrough.js --only testReleaseCheckPreTagGate` | 0 |
| `scripts/test-release.js` | 0 |
| `scripts/test-run-chains.js` | 0 |
| `scripts/test-oracle-kernel.js` | 0 |
| `scripts/validate-workflow-contracts.js` | 0 |

**Nothing else reds.** `test-finalize-door.js` is the sole discriminator for the narrow route — the
0.0 → 1.0 detection change #898 exists for.

Two structural facts that support the measurement rather than resting on it:

- `--release-check` is invoked from **exactly one** walkthrough scenario,
  `testReleaseCheckPreTagGate` (a scan of every `release-check` occurrence in
  `simulate-workflow-walkthrough.js` returns that scenario's 12 `runNode(runChainsScript,
  ['--release-check', …])` sites plus prose comments in the header block above it). That scenario
  passing under narrow is why the full walkthrough passes under narrow.
- `test-finalize-door.js` is **not** one of `test-kernel-conformance.js`'s three vehicles
  (`test-sink-merge.js`, `test-claim-hardening.js`, `simulate-workflow-walkthrough.js`), so the
  kernel-conformance result above is not confounded by my own new assertion.

**On BROAD, proving little about this test — confirmed.** The investigation's finding holds:
`test-kernel-conformance.js` spawns the walkthrough unsharded, so the broad case is already caught
at fast-gate step 16 with probability 1.0. Leg 3 going red is therefore *consistent* with the fence
working but is **not** evidence that this test is what closes the hole. Leg 2 is the whole proof.

---

## CLEAN RUN

Delivered bytes, run in the worktree (`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-896-897-898`),
private `TMPDIR`:

```
node scripts/test-finalize-door.js  →  EXIT 0
finalize-door tests passed (156 assertions)
```

Not committed, as instructed. `git status` shows `scripts/test-finalize-door.js` as the only file
modified by me; every other modified path in that worktree belongs to a concurrently-running
teammate.

---

## NOT DELIVERED, AND WHY

- **No production-code change.** Test custody: this role writes tests only. Nothing here needed one
  — the invariant already holds at the baseline; the fence pins it.
- **The envelope-shape assertion #898 literally proposed is not delivered.** It is structurally
  unarmable (see above). What is delivered asserts the same intent behaviourally. This is a
  deliberate substitution, not an omission — flagging it because the issue text and the artifact do
  not match word for word.
- **The other three edition chains (`codex`, `gitlab`, `gitea`) were not run.** `test-finalize-door.js`
  is a base-`scripts/` suite in the `claude` chain only; it has no plugin twin, so an edition run has
  nothing new to execute. The three plugin kernels *were* re-materialized on every leg, so no leg
  measured a half-propagated tree.
- **The fast gate was not run end to end** (~25 min). Its step-18 behaviour is inherited directly
  from the isolated `test-finalize-door.js` runs above plus the `&&` chaining in `package.json`; I
  did not spend a full gate run to re-confirm a chained `&&`.
- **`release.js --tag` was not driven end to end under the mutations.** `chainCheck`
  (`kaola-workflow-release.js:227-231`) calls the same kernel function, and `test-release.js` stayed
  green under narrow — consistent with the investigation, and it is the same door either way.
- **No existing assertion was weakened, renamed or deleted.** The `+17 −0` diff is purely additive.
- **The `T5` header comment was left as-is.** It already states the invariant ("Strict headSha
  equality is the ONLY binding: #881's release-prep carry-over is gone"); `T5j` is that sentence's
  pin, and restating it in two places would violate one-rule-one-wording.

**A values call left to the owner, not decided here.** This fence pins the *deliberate absence* of a
mechanism. If a release-prep carry-over is ever re-introduced on purpose, `T5j` must be **deleted
with that decision** — never repaired to keep passing against machinery that is coming back. The
investigation also raised, and did not settle, whether #898 is watch-list material at all: the
coverage gap is **observed** (reproduced here), while the harm is **derived** (no carry-over has
been re-introduced and no release ever shipped through this route). That question is the owner's;
this report only supplies the measurement it turns on.

# Adversarial verification — the four deletions

**Claim under test:** *no deletion in this bundle removed something still reachable, and no test was
repaired ahead of its mechanism.*

**Surface:** the four deletions in `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-888-889-890-892-893-894-895`
against baseline `fa5157b3`. Read-only: no tracked file was edited; the worktree is byte-identical
to how it was found (64 modified paths, no untracked additions, `scripts/kaola-workflow-adaptive-schema.js`
still `3f221dea0665d0c61c9d482a46b29cf8`). All mutation work ran in a scratch mirror at
`/private/tmp/.../scratchpad/verify-del/mirror`. No `git checkout --`, no `git stash`.

**Analytical result: NOT REFUTED.** Every counterexample I could construct failed. No defect found.

| # | deletion | verdict |
|---|---|---|
| 1 | #888 — the release-prep carry-over | **CONFIRMED SAFE** |
| 2 | #894 site 1 — the installer compare-and-swap half | **CONFIRMED SAFE** |
| 3 | #894 site 2 — the curated-root vocabulary | **CONFIRMED SAFE** |
| 4 | #892 — `docs/mission-list.md` | **CONFIRMED SAFE** |

One measured, non-blocking **coverage** fact is recorded at the end (§6). It is not a defect in the
candidate: it is what the suite would and would not notice afterwards, measured rather than assumed.

---

## 1. #888 — the release-prep carry-over

### 1a. The `receiptBindsTo` hazard — the restoration claim is TRUE

The report claims deleting `receiptBindsTo` restores the pre-#881 line byte-for-byte. Verified
independently against `git show 523f1241^:scripts/kaola-workflow-release.js`:

```
pre-#881   :143   if (r.headSha && r.headSha !== head && r.headSha !== 'unknown') return { green: false, reason: 'chains_stale', receiptHead: r.headSha, currentHead: head };
candidate  :147   if (r.headSha && r.headSha !== head && r.headSha !== 'unknown') return { green: false, reason: 'chains_stale', receiptHead: r.headSha, currentHead: head };
```

Identical, including whitespace and the returned key order. The `&& !receiptBindsTo(root, head)`
conjunct is gone and nothing replaced it, so the arm is a plain three-conjunct staleness test again.

**The arm is not merely present, it FIRES.** Driven end to end (`binding-probe.js` CASE 3): a receipt
stamped at an ancestor with a release-prep-only gap gives

```
chain_greenness {"green":false,"reason":"chains_stale","receiptHead":"6d7b20ce…","currentHead":"35a7d567…"}
chain_warning   "chains_stale"
```

and the control (receipt re-stamped at HEAD) gives `{"green":true}` with no `chain_warning`. The
documented asymmetry also survives: `headSha:"unknown"` still reads green in `--verify` while
`--release-check` refuses `chains_stale` on the same receipt.

*(My probe's own assertion that `--verify` exits 0 was wrong, not the code: the fixture's
`[Unreleased]` section is consumed by `--prepare`, so `--verify` refuses `changelog_incomplete`.
Envelope confirmed by direct inspection; the greenness arm is unaffected.)*

### 1b. Same-class sweep — no surviving expression went constant

I diffed every changed line carrying `if (`, `&&`, `||`, a ternary or a boolean return across the
whole bundle. Exactly two surviving conditionals lost a conjunct, and both are correct:

- `chainReceiptGreenness` — above.
- `assertAtomicTarget`'s `expectedVersion === undefined ? 'atomic_stage_unsafe' : 'atomic_stage_conflict'`
  → the literal `'atomic_stage_unsafe'`. Correct because `expectedVersion` was **always** `undefined`
  (§2). The collapsed ternary preserves the only value it could ever have produced.

Everything else in the diff is a whole-block deletion or an addition. No `if` became unfalsifiable,
no error path became unreachable that was reachable before.

### 1c. Exact-`headSha` binding, constructed from scratch at BOTH entry points

I did not trust the report. `binding-probe.js` builds the deleted carry-over fixture from first
principles — green four-chain receipt at C, `--prepare`, one release-only commit — and asserts the
preconditions the old route needed actually hold before testing the verdict:

```
CASE 1: prep-only gap (the deleted carry-over route)
  ok  fixture non-vacuity: receipt sha != candidate (6093403d vs a0bed5fa)
  ok  fixture: receipt IS an ancestor of the candidate (the old precondition)
  ok  fixture: the gap is EXACTLY the release-prep surface (all 8 RELEASE_FILES)
  ok  --release-check REFUSES chains_stale
  ok  --tag REFUSES chains_stale
  ok  no tag created, no ref moved
  ok  the two entry points agree on the reason
  ok  no binding/carryOver keys leak into the refusal envelope
CASE 2: receipt re-stamped at the candidate (the mandatory run)
  ok  --release-check PASSES; envelope keys are EXACTLY candidate,chains,mode,result
  ok  --tag SUCCEEDS; publication rows bind chainHeadSha === candidate
  ok  re-running --tag stays idempotent
CASE 4: precedence over a prep-only gap — waived / red / subset / empty
  ok  both entry points refuse with the SAME reason in all four
```

Both entry points reach the same verdict on every shape; the pass envelope matches `docs/api.md:412`
byte-for-byte in key set. `stale_paths` / `stale_kind` diagnostics survive on the mismatch arm — a
mixed prep+code gap still returns `stale_kind "mixed"`, `stale_paths ["CHANGELOG.md","scripts/sneak.js"]`,
`operator_hint` present.

### 1d. Did any of the ~160 deleted assertions pin a SURVIVING behaviour?

Enumerated and mapped:

| deleted assertion | survivor |
|---|---|
| T5j / #877 (14) — the carry-over PASS | mechanism gone; nothing to survive |
| **T5k / #877 (15) — `stale_paths` names the culprit** | **`#651 (4)` at `simulate-workflow-walkthrough.js:1115-1129` — VERIFIED by reading both: it asserts `out.stale_kind === 'code'` AND `JSON.stringify(out.stale_paths) === JSON.stringify(['newcode.js'])`, a strictly stronger array assertion than T5k's `.includes()`.** The report's claim is TRUE. |
| T5l / #877 (16) — non-version `package.json` | reduces to a sha mismatch; T5b + `#651 (4)` |
| T5m / #877 (17) — non-ancestor receipt | T5b (`headSha: '0'.repeat(40)`), test-release `cases` row `chain(d,{headSha:'deadbeef'})` |
| T5n / #877 (18) — dirty stamp | T5e, `#651 (10)`, test-release `cases` row `chain(d,{workTreeHash:'dirty'})` |
| the 8-row `carryOverCases` reason table | the surviving `--tag` refusal matrix pins **all seven** chain reasons (`chains_unverified` ×2, `chains_stale` ×2, `chains_empty`, `chains_incomplete`, `chains_red`, `chains_waived`) |
| **`gateReason === tagReason` on one fixture** | no direct survivor — see §6 |

`stale_kind === 'mixed'` is unpinned — but it was unpinned at `fa5157b3` too (T5k asserted
`stale_paths` only, never `stale_kind`). Pre-existing, unchanged by the candidate.

### 1e. The kept half of #881 is still guarded — mutation-proven

The report keeps `chainCheck`'s delegation to the kernel as "#881's non-carry-over half". I attacked
whether anything still guards it. In the scratch mirror I re-introduced the pre-#881 divergence
(`chainCheck` collapsing every verdict to `chains_stale`):

```
baseline   test-release  EXIT=0  247 assertions passed
M4         test-release  EXIT=1  6 test(s) FAILED, 241 passed
restored   test-release  EXIT=0  247 assertions passed
```

The surviving refusal matrix catches it. The kept mechanism is not left naked.

### 1f. Consumers of the deleted symbols — zero, in both checkouts

`fs.readdirSync` walker (not `grep`; ugrep skips dot-directories) over the **whole** worktree and the
**whole** main checkout, skipping only `.git`/`node_modules`/`.kw`, for `evaluateReleasePrepCarryOver`,
`firstJsonDifference`, `RELEASE_VERSIONED_JSON_FILES`, `receiptBindsTo`, `release_prep_carry_over`,
`carriedPaths`:

- worktree: `CHANGELOG.md` only (the entry announcing the removal) plus this run's own `.cache/`
  and `kaola-workflow/archive|.origin` history.
- main checkout: the unchanged `main` copies (expected — `main` does not carry this branch) and
  **zero hits** in `.opencode`, `.opencode-gitea`, `.opencode-gitlab`, `.kimi`, `.kimi-gitea`,
  `.kimi-gitlab`, `.claude`, `.codex`, `.agents`, `.cache`.

All four kernel copies are byte-identical (`3f221dea…` ×4); `edition-sync --check` reports 8 forge
aggregator ports in parity; `validate-script-sync.js` is green (the propagation debt the report
deferred has since landed).

---

## 2. #894 site 1 — the installer compare-and-swap half

**The dropped parameter shifted nothing.** In all three byte-identical baseline copies
(`b4f27cd6…` ×3) the only call site is

```
:1241   atomicWriteSameDirectory(target, fs.readFileSync(source));      // 2 args
```

so `expectedVersion` was **always `undefined`**, `captureAtomicTargetVersion` had **zero** callers,
and the `atomic_stage_conflict` arm inside `assertAtomicTarget` was already unreachable. Verified
directly, not from the report. Neither function is exported (`module.exports` read in full), no
`arguments` object is used anywhere in the file (the single `arguments` hit is the word inside a
comment), and there is no `.length`, `.apply`, `.call` or `.bind` on either function. No call site
anywhere passes three arguments.

**`assertAtomicTarget` is still called on both sides** — once before the stage loop (the inlined
`lstatIfPresent` block) and once at `:1133` immediately before `renameSync`. Both of its throw
branches remain reachable (a concurrently-replaced destination).

**`atomic_stage_conflict` is still throwable** from `createOwnedHookFileBackup` at `:1870` — the path
the report names.

**No helper was orphaned:** `sameFileVersion`, which `readAtomicTargetVersion` used, still has a live
caller at `:1410`.

**Behavioural equivalence, executed.** One probe run against the candidate and against
`git show fa5157b3:…` — identical results on both:

```
ok  fresh copy returns the sorted toml basenames
ok  fresh copy wrote alpha.toml byte-exactly / non-toml source skipped / result is a regular file
ok  OVERWRITE replaced stale content and the inode CHANGED (still rename-atomic, not in-place)
ok  no stage file left behind
ok  symlinked profile destination      -> atomic_stage_unsafe
ok  symlinked target file              -> atomic_stage_unsafe
ok  target occupied by a directory     -> atomic_stage_unsafe
```

The overwrite case is the one that used to enter the deleted `else` arm; it behaves identically.

**No test was repaired:** at `fa5157b3`, `git grep 'atomic_stage_conflict|captureAtomicTargetVersion|expectedVersion'`
over `scripts/test-*`, `scripts/validate-*`, `scripts/simulate-*` returns **nothing**. There was no
test to delete and none was written to cover the gap.

The three copies remain byte-identical after the edit (`65c60236…` ×3).

---

## 3. #894 site 2 — the curated-root vocabulary

**Zero consumers, swept by a walker rather than by `grep`.** Same `fs.readdirSync` sweep as §1f, over
both checkouts, for `CURATED_ROOT_PATHS`, `CURATED_ROOT_LC`, `extractCuratedRootPaths`,
`CURATED_ROOT_SET`, `canonicalCuratedRoot`, `isCuratedRoot`. Live hits: **none**. Only `CHANGELOG.md`
release history and archived run records.

All four classifiers (`scripts/`, `plugins/kaola-workflow/`, gitea, gitlab) `require` the kernel for
`LANE_STALENESS_MS` alone; none destructures or calls any curated-root symbol, so the dropped export
cannot surface as `undefined is not a function`. Require-time smoke on all four kernel copies, all
four classifiers and all three installers: **11/11 load clean** (`CURATED_ROOT_LC`'s module-level
`new Map(CURATED_ROOT_PATHS.map(…))` initializer is gone with its input, so nothing throws at load).

`install.sh`, `install-all.sh`, `install-opencode.sh`, `install-kimi.sh`, `uninstall.sh`: no reference
to any deleted symbol.

> **Correction to `888-894s2.md`.** That report states *"`.opencode*` and `.kimi*` do not exist in
> this repo at all"* and infers this from `git ls-files`. **They do exist** — six generated trees in
> the worktree and six more in the main checkout; they are gitignored, which is why `git ls-files`
> shows nothing. The report's *conclusion* survives (I swept all twelve trees directly and found zero
> consumers), but the premise as written would mislead the next sweep.

---

## 4. #892 — `docs/mission-list.md`

**Nothing reads the path at runtime.** Walker sweep for the literal `docs/mission-list.md` over the
whole worktree: three hits, **all** in `CHANGELOG.md` (two historical, one announcing the deletion).
Zero in `install.sh` / install manifests / any doc-scaffolding code / the six additive-edition trees /
the rendered command and SKILL surfaces. No dangling markdown link
(`git grep -E '\]\((\./)?(docs/)?mission-list\.md\)'` → none).

> The two items `892-impl.md` recorded as *carved out* — `docs/conventions.md:5` and the
> `SELF_HOST_TEST_CONSUMED` line in the ×4 kernel — **have since landed.** The dead-pointer sweep the
> report predicted would "go to zero" is now zero.

**`SELF_HOST_TEST_CONSUMED` — the band question, answered.** `testConsumes` is an exact-path
membership test (`SELF_HOST_TEST_CONSUMED.indexOf(rel) !== -1`), so removing one entry can affect
exactly that one path and no other. No change to any other file becomes citable-as-unchanged.

And the guard that would catch the failure mode is **armed** — mutation-proven in the mirror. Adding
a `'docs/mission-list.md'` reference to a validator makes `test-validation-allowband.js` fail with
the real exit code:

```
mutated   REAL allowband EXIT=1
          FAIL: validator-referenced allowband prose "docs/mission-list.md" is NOT in testConsumes …
restored  EXIT=0   (17 assertions; 5 validator-referenced prose files all kept as CODE)
```

That file was **not** edited by this bundle: it derives its scan set from the chain scripts, so it is
a guard the deletion had to satisfy rather than one the deletion could adjust.

**The replaced pins are armed, not decorative.** All six shipped `next` surfaces carry both new
literals. Mutating one SKILL in the mirror:

| mutation | validate-workflow-contracts | test-route-reachability | test-generate-routing-surfaces | generate-routing-surfaces --check |
|---|---|---|---|---|
| `nothing depends on a stable ID` → `items carry no ID` | **1** | **1** | **1** | **1** |
| `absent fields are simply absent` → `unused fields are omitted` | **1** | **1** | — | — |
| control (unrelated word) | **1** (harness bites) | — | — | — |
| restored | 0 | 0 | 0 | 0 |

**No test was repaired ahead of its mechanism.** Every touched assertion follows the mechanism:
`exists('docs/mission-list.md')` and the `LEGACY_PAIRS` row were **deleted** (325 → 323 assertions,
exactly two); `assertIncludes(file,'docs/mission-list.md')` was replaced by two asserts on the
content that now ships in its place; the `test-route-reachability.js:156` RED-ON-FIX conjunct was
re-pointed at the inlined fact, not dropped. No field was re-added to satisfy a test.

---

## 5. Cross-cutting — the comment edits inside test files

Every comment another agent edited inside a test file it did not own the assertions of was checked
against the code it describes. All four are accurate:

| edit | claim | verified |
|---|---|---|
| `test-release.js:104-107` | the two surviving `chains_stale` rows are an unresolvable-sha pin and a dirty-worktree pin | TRUE — `chain(d,{headSha:'deadbeef'})` and `chain(d,{workTreeHash:'dirty'})` |
| `test-finalize-door.js:625-627` | strict equality is the only binding | TRUE — matches the kernel and my probe |
| `test-ledger-compare.js:11,29` | re-points at `docs/decisions/0017-the-mission-list.md` | TRUE — that file exists; no assertion depended on the path |
| `simulate-workflow-walkthrough.js:846-856` | released-status coverage lives in `scripts/test-bundle-claim.js` | TRUE — `test-bundle-claim.js:1346`, `status: 'released'` row |

One surviving assertion **changed shape** rather than being deleted:
`test-install-model-rendering.js` `columns[2] === '3'` → a separate
`assert.strictEqual(columns[2], String(reviewerGenerator.REVIEWER_BEHAVIOR_CONTRACT_VERSION))`.
Not a weakening and not tautological: the manifest column is written from
`installedIdentity.behavior_contract_version`, parsed out of the **installed bytes**
(`install.sh:272-275`), so it is still an installer-vs-source comparison. De-hardcoding, same
strength.

---

## 6. The one measured coverage fact (non-blocking, orchestrator's call)

The deletions are correct and nothing reachable was removed. What the suite would *notice*
afterwards, measured:

**Re-introducing the exact mechanism #888 deleted is invisible to every authored suite.** In the
scratch mirror I re-added a narrow carry-over inside `evaluateReleaseReceipt` — ancestor receipt plus
a gap confined to `RELEASE_FILES`. My own probe proves the mutation is live (`--release-check` and
`--tag` both flip from `chains_stale` to a **pass**, and a tag is created). Every suite stayed green:

```
simulate-workflow-walkthrough --shard 147/999999  EXIT=0   (testReleaseCheckPreTagGate PASSED)
test-finalize-door.js                             EXIT=0   153 assertions
test-release.js                                   EXIT=0   247 assertions
test-run-chains.js                                EXIT=0   238 assertions
test-oracle-kernel.js                             EXIT=0    48 assertions
validate-workflow-contracts.js                    EXIT=0
validate-kaola-workflow-contracts.js              EXIT=0
```

A *broad* relaxation (accept any ancestor) **is** caught, by exactly one test —
`simulate-workflow-walkthrough.js` `#651 (4)`, whose gap carries an off-surface `newcode.js`:

```
M5  walkthrough --shard 147/999999  EXIT=1
    Error: #651 (4): a receipt at an older sha must refuse chains_stale …, got status 0 {"result":"pass",…}
M5  test-finalize-door / test-release            EXIT=0 / EXIT=0   (both blind — their fixtures use
                                                  non-ancestor shas: '0'×40 and 'deadbeef')
```

Since the fast gate samples the walkthrough at a rotating 1/12 shard, even that single guard is
absent from most fast-gate runs.

This is **not** a defect in the candidate and nothing here is claimed falsely — the CHANGELOG's own
coverage claim is confined to `stale_paths` and the dirty stamp, both of which I verified do survive.
Under *derive additively* this is a fact to record, not a gate to build. Recording it so the decision
is the orchestrator's and not an omission.

---

## 7. Executed evidence

Full walkthrough at full scope, in the worktree:

```
##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,
            "scenarios":184,"ran":184,"passed":184,"failed":0}
Workflow walkthrough simulation passed          EXIT=0
```

(The RED case (14) that `888-894s2.md` handed back is gone — the handback landed.)

| command | result |
|---|---|
| `node scripts/test-release.js` | 0 — 247 assertions |
| `node scripts/test-finalize-door.js` | 0 — 153 assertions |
| `node scripts/test-validation-allowband.js` | 0 — 17 assertions, 5 prose files kept as CODE |
| `node scripts/test-route-reachability.js` | 0 — 323 assertions |
| `node scripts/test-generate-routing-surfaces.js` | 0 — 432 assertions |
| `node scripts/generate-routing-surfaces.js --check` | 0 — 18 surfaces byte-match |
| `node scripts/test-ledger-compare.js` | 0 — 40 assertions |
| `node scripts/test-install-model-rendering.js` | 0 |
| `node scripts/test-suite-registration.js` | 0 — 472 assertions |
| `node scripts/test-oracle-kernel.js` | 0 — 48 assertions |
| `node scripts/test-kernel-conformance.js` | 0 — 254 assertions |
| `node scripts/test-run-chains.js` | 0 — 238 assertions |
| `node scripts/test-parallel.js` | 0 — 4 passed (255s) |
| `node scripts/test-edition-sync.js` | 0 — 30 assertions |
| `node scripts/test-validate-script-sync.js` | 0 — 59 assertions |
| `node scripts/validate-workflow-contracts.js` | 0 |
| `node scripts/validate-kaola-workflow-contracts.js` | 0 |
| `node scripts/validate-vendored-agents.js` | 0 — 14 agents |
| `node scripts/edition-sync.js --check` | 0 — 8 ports in parity |
| `node scripts/validate-script-sync.js` | 0 — kernel parity ×4 |

Probes written for this review (scratchpad, reusable):

```
verify-del/binding-probe.js    <repo-root>   # #888, both entry points, from scratch
verify-del/installer-probe.js  <module>      # #894 site 1, candidate vs fa5157b3
verify-del/sweep.js / sweep2.js <roots…>     # dot-directory-inclusive symbol sweep
```

---

finding: id=V1 scope=pre_existing action=none status=open severity=low fix_role=none rationale=after #888 the exact-binding rule is pinned by exactly one walkthrough case (#651 (4)); a narrow re-introduction of the carry-over is invisible to every authored suite — measured, recorded per derive-additively, not a candidate defect

verdict: pass
findings_blocking: 0

Analytical result: **not_refuted**. Confidence: high for #888, #894 site 1 and #894 site 2 (each
closed by executed counterexample attempts plus an exhaustive consumer sweep); high for #892
(closed by an armed, mutation-proven guard the bundle did not author). The strongest attacks — the
reconstructed carry-over fixture at both entry points, the baseline-vs-candidate installer
equivalence run, the dot-directory-inclusive sweep of both checkouts, and five mirror mutations —
all failed to break the claim.

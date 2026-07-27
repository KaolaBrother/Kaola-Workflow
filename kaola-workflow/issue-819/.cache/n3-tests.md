evidence-binding: n3-tests bcb81dd402a2
RED: #819-T1 — `FAIL: #819-T1: a self-persisted capability_gap body is exactly the state substitution exists to serve and must NOT wedge the swap, got {"result":"refuse","reason":"substitute_node_closed","node_id":"n1","from_role":"code-explorer","to_role":"investigator","status":"in_progress","detail":"evidence for \"n1\" already carries a recorded body; substitution applies only before a deliverable exists"}` — 41 failures / 3504 passed / 420 scenarios, `node scripts/test-adaptive-node.js` unsharded, real exit 1
red_baseline: bcb81dd402a2
upstream_read: n1-surface c88971e73a76
upstream_read: n2-mechanism cb782b26822d

# n3-tests — the RED regression for issue 819

**Write set touched: `scripts/test-adaptive-node.js` ONLY.** No production script edited. Leg
`3c378313`, `git status` shows exactly one modified file.

**Baseline before my change (re-measured, matches n1 6A): 413 scenarios / 3431 assertions / exit 0.
After: 420 scenarios / 3545 assertions (3504 pass + 41 fail) / exit 1. All 41 failures carry a
`#819-` prefix; ZERO previously-green assertions regressed.** The suite was run UNSHARDED with the
real exit code captured via `$?`, not read through a pipe — the fast gate runs this file at
`--shard auto/12` and would not have executed the block at all.

---

## §1 — THE ONE THING `n4` MUST READ BEFORE IMPLEMENTING (a contested assertion)

**`n2` §1's classifier, implemented exactly as specified, does NOT make recovery reachable on the
most common gap path. I measured this rather than reasoned to it, and I wrote the pin for it anyway
(`#819-T3b`), so it is RED against both today's code and against `n2` as written.**

`n1` 1B measured that the production `seedEvidenceFile` scaffold alone trips P5 for all 15 roles. I
reproduced that independently. Now trace `n2`'s `classifyEvidenceBody` over that same scaffold —
`hasEvidenceBodyBelowHeader` returns **true** (the `<!-- findings: paste findings here -->` line is
neither blank nor a `token:` line), and there is no typed marker, so the first two lines return
`'deliverable'` and the swap refuses. `n2` §1 explicitly keeps `hasEvidenceBodyBelowHeader`
"unchanged, as the `seeded` test", so this is the spec's behaviour, not a misreading of it.

I ran the classifier prototype over every fixture body, correct and under each of `n2`'s named
mutations (bodies indented so this file's own close-time token scan cannot mistake the quotation for
my tokens):

```
  body                    CORRECT               drop-token-conjunct   unanchor              no-deliverable-arm
  T1/T13 reference gap    capability_gap        capability_gap        capability_gap        capability_gap        [expects capability_gap]
  U1 keyed gap            capability_gap        capability_gap        capability_gap        capability_gap        [expects capability_gap]
  T2c indented-only       deliverable           deliverable           capability_gap <-RED  capability_gap <-RED  [expects deliverable]
  T2 deliverable          deliverable           deliverable           deliverable           deliverable           [expects deliverable]
  T2b forged              deliverable           capability_gap <-RED  deliverable           deliverable           [expects deliverable]
  T3b production seed     deliverable <-RED     deliverable <-RED     deliverable <-RED     capability_gap <-RED  [expects seeded]
```

Row 6 is the finding: **`n2`'s correct classifier fails T3b.**

Why this is not a nit. The shipped routing prose — and `n2`'s own §6.3 replacement text — instruct a
gapping role: *"never `record-evidence` it, and never hand-edit the seeded evidence file to clear
it."* A role that OBEYS writes nothing, so the file is left at exactly the opener's scaffold, which
is row 6. `n2` §0's recovery works only for the role that DISobeyed and self-persisted a marker. The
compliant path stays wedged, which is `n1`'s I2 ("a marker-only fix satisfies A1's letter and not its
intent") holding against the final mechanism.

**Minimal repair, inside `n4`'s existing write set and consistent with the rest of `n2`:** make
`hasEvidenceBodyBelowHeader` skip `<!-- … -->` lines the same way it already skips blank lines and
valueless `token:` lines. Those comment lines are written by `seedEvidenceFile`'s `freshSeed()` and
by nothing else. I verified the predicate has exactly ONE call site in the whole file
(`adaptive-node.js:14854`, inside `runSubstituteRole`), so the tolerance change cannot reach the
close gate, the barrier, or any other guard. Under that repair every other row of the table above is
unchanged — a role's real deliverable still carries a non-empty token value and is still refused.

**This is `n4`'s call to make, or the orchestrator's to route back to `n2`. I did not re-decide it —
I recorded it as a failing assertion, which is the only thing a test author should do with a claim
the mechanism does not satisfy.** If the decision is that T3b is out of scope, delete that one block
and say so; do not weaken it into something that passes.

---

## §2 — What was written

Everything is in `scripts/test-adaptive-node.js`. Two edits to the existing `#798` block, then seven
new `scenario(...)` blocks appended before `shardLib.reportCoverage`, so **no existing scenario
ordinal shifts**.

### 2a — Edits to the existing `#798` scenario

| site | change |
|---|---|
| the seed-only case (was `:25497-25502`) | kept green; added `evidence_reset === false` + a bytes-unchanged assertion (`n2` T3), and a comment stating that this hand-written two-line shape is NOT what the seeder emits, with a pointer to T3b |
| the `findings: already delivered` case (`:25491-25496`) | **UNCHANGED, deliberately.** `n1` §5C row 1 flags it as pinning behaviour #819 changes; it does not. `n2` T2 requires that exact outcome to survive, and it does — the body is a deliverable before and after. Leaving it is the correct read of both notes. |

### 2b — New shared fixtures (file scope, above the new scenarios)

- `SUBROLE_SHA` / `SUBROLE_NONCE` — the baseline and its 12-char prefix, so the binding and
  `.cache/barrier-base-n1` agree by construction. **`subroleFixture` writes the barrier baseline by
  DEFAULT** (`baseline: false` opts out). The existing `#798` `fixture()` writes none, which `n2` §5
  flagged: without it `readNonce` returns null and every reset would refuse for the wrong reason.
- `SUBROLE_GAP_BODY` — the `n2` §0 bytes verbatim, adapted to node `n1`. Its marker is the column-0
  `delegation_outcome` line the real role emitted unprompted; the only `capability_gap` *phrase* is
  indented inside another token's value; both content tokens are empty.
- `SUBROLE_GAP_BODY_KEYED`, `SUBROLE_GAP_BODY_INDENTED_ONLY`, `SUBROLE_DELIVERABLE_BODY`,
  `SUBROLE_FORGED_BODY`.
- `subroleCall(label, fn)` — **load-bearing.** `shardLib.runScenario` does NOT catch (verified at
  `test-shard-lib.js:127-133`), so an exception out of a not-yet-existing export would abort the
  process and hide every other RED signal. This converts a throw into one failed assertion.

### 2c — Coverage map (brief item → assertions)

| brief item | ids |
|---|---|
| 1 · gap body substitutes, correctly bound, no hand intervention | T1, T13 |
| 2 · a genuine deliverable still refuses (the control) | T2, T2b, T2c, T12, T12b |
| 3 · a seed-only file stays substitutable | T3 (hand-written, green), **T3b (production seed, contested)** |
| 4 · fresh identity, stable across replay | T4, T4b, T5 |
| 5 · no substitution ⇒ byte-identical card | T6 |
| 6 · self-substitution refused, nothing recorded | T7, T7b, T10/P0 |
| 7 · the atomic reset surface, incl. re-invocation | T8, T8-w1, T8b, T9, T10 |
| standing invariant | T11 |
| `n2` §8 (export + operator hints) | U1, U2 |

---

## §3 — Assertion table: expected state, and the mutation that must turn each RED

`R` = RED now (the fix does not exist). `G` = green at baseline, a guard-preservation pin. Every `G`
row carries a mutation I can name; where I could only verify the discrimination analytically rather
than by running it, I say so.

| id | now | asserts | mutation that must turn it RED | discrimination verified |
|---|---|---|---|---|
| T1 | **R** | gap body + baseline ⇒ `ok`, `evidence_reset:true`, `idempotent:false`, one record; file equals a fresh `investigator` seed **computed by the shipped seeder**, line 1 byte-identical, no `capability_gap` trace | make `classifyEvidenceBody` return `'deliverable'` for a marker-bearing body | run (RED now) |
| T2 | G | `findings: already delivered` ⇒ refuse `substitute_node_closed`; bytes unchanged; no store | delete the P5b arm entirely (permit every body). **Honest correction to `n2`'s wording:** the sub-mutations *inside* the classifier do not move this row — see the §1 table — so its discriminator is deleting the arm, not weakening the classifier | run (prototype table) |
| T2b | G | forged marker over real `findings` ⇒ refuse; bytes unchanged | drop the "no non-empty required token" conjunct | **run — flips to `capability_gap`** |
| T2c | G | indented-only occurrence + all tokens empty ⇒ refuse | unanchor `CAPABILITY_GAP_MARKERS` (`/^…/m` → `/…/`) | **run — flips to `capability_gap`** |
| T3 | **R** | hand-written seed-only ⇒ `ok`, `evidence_reset:false`, bytes unchanged | make the reset unconditional | run (RED now) |
| T3b | **R** | **production seed** ⇒ `ok`, `evidence_reset:false`, bytes unchanged | see §1 — RED against today AND against `n2` as written | **run — the contested row** |
| T4 | **R** | post-swap card: `agent_type` investigator, `agent_type_frozen` code-explorer, `codex_task_name` `n1_investigator` ≠ pre-swap `n1_code_explorer` | revert `codexTaskNameForNode` to the frozen role | run (RED now) |
| T4b | **R** | the derivation direct: 2-arg overrides, `null`/`undefined`/`''` fall back to frozen | drop the optional second parameter | run (RED now) |
| T5 | **R** | replay ⇒ `idempotent:true`, one row, identical `codex_task_name` across both | derive the name from a counter, timestamp, or record `ts` | run (RED now) |
| T6 | G | no record ⇒ `n1_code_explorer`, key set equals the **measured** 25-key golden, none of the four substitution keys | append any suffix unconditionally, or attach a substitution key unconditionally | analytic + the golden is measured at this commit |
| T7 | **R** | `--to-role <frozen>` ⇒ refuse `substitute_self_noop`, store file absent | remove P0 | run (RED now) |
| T7b | **R** | active record → investigator, then revert ⇒ refuse; store still ONE row; the surviving record still governs the card | make P0 conditional on "no active record" (P0 must precede the replay branch) | run (RED now) |
| T8 | **R** | crash window {seeded, record}: replay ⇒ `ok`, `idempotent:true`, `evidence_reset:false`, one row, bytes untouched | move C1 after C3 | run (RED now) |
| T8-w1 | **R** | crash window {seeded, NO record}: resume ⇒ `ok`, `evidence_reset:false`, exactly one row, bytes untouched | as above | run (RED now) |
| T8b | **R** | `.cache` at `0o555` + gap body ⇒ refuse `substitute_evidence_reset_failed`, no record, file byte-intact or absent (never a torn prefix) | swallow `seedEvidenceFile`'s `ok:false` and record anyway | run (RED now) |
| T9 | **R** | gap body, no `barrier-base-n1` ⇒ refuse `substitute_evidence_reset_failed`, no record, bytes unchanged | fall back to an empty-string nonce instead of refusing | run (RED now) |
| T10 | 1R/6G | table over P0/P1/P2/P3/P4/P5a/P5b: after each refusal the evidence bytes, the substitutions file, AND the frozen plan are unchanged. Each row carries a real baseline and (except P5b) a gap body, so a hoisted reset fires and is caught | move C1 above the guard block | P0 row RED now; the other six green and analytic |
| T11 | G | `sanitizeCodexTaskName` injective over the 18-row `ROLE_CAPABILITY_MANIFEST` | add a colliding role name. **Labelled honestly in the test comment as a STANDING invariant that guards a future change, not a #819 regression — it passes before and after by design** | analytic |
| T12 | G | `complete` row + gap body ⇒ still refuse `substitute_node_closed`, `status: complete`, detail names the status; nothing reset, nothing recorded | reset at classification time instead of in the commit phase (caught by the bytes-unchanged clause). **Correction to `n2`:** its stated mutation "run P5b before P5a" does NOT move this row — on a gap body both orderings still refuse — so T12b below carries the ordering claim | run + analytic |
| T12b | G | `complete` row + **deliverable** ⇒ refuse, and the detail names the STATUS | run P5b before P5a: the detail would name the evidence body instead. This is the fixture that actually pins the ordering | analytic (the two refusals have distinct, mutually exclusive `detail` strings) |
| T13 | **R** | end-to-end: gap ⇒ substitute ⇒ re-seeded file is CLEAN (no `capability_gap` trace, empty stub) ⇒ substitute delivers ⇒ `checkEvidenceShape` binds ⇒ `runCloseNode` returns `ok` ⇒ compliance row carries `role_substituted: code-explorer→investigator` + the basis ⇒ ledger `complete` | rotate the nonce in C1 instead of preserving it | **run — I drove both arms by hand: preserved ⇒ close `ok` + the compliance row; rotated ⇒ `refuse: evidence_stale`** |
| U1 | **R** | `classifyEvidenceBody` exported; 8 direct cases (absent, header-only, production seed, reference gap, keyed gap, indented-only, forged, plain deliverable) | any classifier change; this is the unit-level twin of T1/T2/T2c/T3b | run (RED now) |
| U2 | **R** | both new codes carry an `OPERATOR_HINT_REGISTRY` entry, neither falls through to "Run orient", both name `write-halt`, and the reset hint forbids the hand edit | leave the two codes out of the registry (today all five `substitute_*` codes ship with no hint) | run (RED now) |

**T13 is the single most load-bearing row** — it is the only one that tests `n2` §2's *preserve, do
not rotate* decision against the real close gate, and I confirmed both arms by hand before writing
it. **T2b is the second** — it is the answer to "can the returning role forge the distinction?", and
the prototype table above proves it flips.

---

## §4 — Fixture corrections I made to `n2` §5 (each with its reason)

Three, all so the pin actually discriminates the mutation `n2` named:

1. **T2c** — `n2` specifies "indented-only marker … **with a non-empty `findings:`**". With a
   non-empty token the unanchoring mutation cannot move the verdict: the token conjunct returns
   `'deliverable'` either way, so the pin would guard nothing. My fixture keeps every token EMPTY,
   which makes the anchoring the only thing standing between that body and an `ok`. Verified in the
   §1 table (column `unanchor`, row `T2c indented-only`).
2. **T12** — `n2`'s mutation "run P5b before P5a" does not move a gap-body-on-a-complete-row (both
   orderings refuse). Kept T12 as the "ledger arm untouched" pin and added **T12b** (a *deliverable*
   on a complete row) to carry the ordering claim, where the two arms' `detail` strings differ.
3. **T2** — `n2`'s "delete the `'deliverable'` arm" reads as a classifier sub-mutation; measured, it
   is not one. Recorded in §3 as "delete the P5b arm entirely" so nobody mistakes T2 for a classifier
   pin. T2 is a P5-survival pin.

Also, per `n2` §3 row 4 ("either inject a fixture registry or assert the derivation directly"), T4b
asserts `codexTaskNameForNode` directly for a second target (`knowledge-lookup`) rather than trying
to drive a second `runSubstituteRole` swap from the real library, which `n1` C2 proves is impossible.

---

## §5 — Verified against source, not assumed

- `hasEvidenceBodyBelowHeader` has **exactly one** call site (`adaptive-node.js:14854`). This is what
  makes §1's proposed repair surgical.
- `readNonce` reads `.cache/barrier-base-<sanitized id>` and slices 12 chars — confirmed with a live
  fixture returning `abc123abc123`.
- `seedEvidenceFile(..., forceRotate=true)` routes to `writeFileAtomicReplace`; its catch arm
  (`:2292-2304`) returns `{ok:false, reason:'evidence_seed_failed'}` and unlinks. T8b's admissible
  post-states follow from that arm, not from a guess.
- `ROLE_TOKEN_REGISTRY` rows for `code-explorer` and `investigator` are both
  `["evidence-binding","findings"]` — P4's identical-contract claim holds, so re-seeding with
  `toRole` is provably equivalent to `fromRole` here.
- The golden 25-key dispatch card in T6 was **measured** at this commit, not transcribed.
- `runCloseNode` is drivable with injected `shell`/`readFile`/`writeFile`/`cacheExists`/`unlink`/
  `readdir` (the established pattern at `test-adaptive-node.js:1538-1543`), which is how T13 reaches
  the real compliance fold-in without a git fixture.
- **T8b did NOT need skipping**: `process.getuid()` is 501, so `chmod 0o555` genuinely denies writes.
  The skip branch is present and honest for a root environment, and it records a reason rather than
  passing vacuously.
- One weak clause, stated rather than hidden: T8b's "no record written" is partly self-fulfilling —
  an unwritable `.cache` also blocks the substitutions write. The load-bearing half is the refusal
  CODE, which is what the assertion leads with.

## §6 — For `n8`

`node scripts/test-adaptive-node.js` **unsharded** is mandatory. `n1` 6B measured that the fast gate
samples this file at `--shard auto/12` and did not execute the substitute-role scenario at
`8d881aaf`; my seven new scenarios are ordinals 413-419 and will be sampled the same way. A green
claude chain is not evidence these assertions ran.

## Tie-breaker derivation (optional, audit-only)

§1 was a live fork: write T3b as specified by `n2` (green after the fix, guards nothing on the
compliant path) or write it against the acceptance intent (RED, contests a frozen upstream). Axiom 1
(correct first) settles it — a suite that passes while the defect the issue was filed over is still
reachable is the most expensive possible outcome, because it certifies the rework away. Axiom 3 does
not get to argue: a test that passes for the wrong reason costs more than the assertion it saved.

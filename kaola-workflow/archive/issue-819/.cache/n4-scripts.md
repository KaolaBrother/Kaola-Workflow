evidence-binding: n4-scripts 62e0af8d9649
tests-green: `node scripts/test-adaptive-node.js` UNSHARDED — exit 0, 420 scenarios / 420 ran / 3553 passed / 0 failed. Baseline before my change on the same worktree: exit 1, 420 scenarios / 3504 passed / 41 failed, every failure `#819-`-prefixed. All 41 are now green, INCLUDING the contested `#819-T3b`. Supporting: `node scripts/edition-sync.js --check` exit 0, `node scripts/validate-script-sync.js` exit 0, `node scripts/simulate-workflow-walkthrough.js` unsharded exit 0 (280/280).
verification_tier: tests-green
upstream_read: n1-surface c88971e73a76
upstream_read: n2-mechanism cb782b26822d
upstream_read: n3-tests bcb81dd402a2

# n4-scripts — the #819 mechanism, implemented across all four adaptive-node editions

**task**: make `n3`'s RED `#819-T*` assertions green by implementing the `n2` mechanism (the P5
gap-versus-deliverable distinction, the atomic evidence reset, the self-substitution refusal, and the
dispatch-target task identity) in the canonical `scripts/kaola-workflow-adaptive-node.js`, then
propagate to the three ports by regeneration.

**verification_tier**: tests-green

---

## write_set — exactly the four declared files, nothing else

    M scripts/kaola-workflow-adaptive-node.js                                        (canonical, hand-edited)
    M plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js                 (byte copy, regenerated)
    M plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js   (rendered, regenerated)
    M plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js     (rendered, regenerated)

`git status --porcelain` (tracked) lists these four and only these four. `git diff --stat` reports
**183 changed lines in each of the four**, identical across editions — the ports are faithful renders,
not hand-edits. `npm run sync:editions` reported exactly three files updated and touched no other
plugin surface. No port was hand-edited at any point.

`scripts/test-adaptive-node.js` was NOT touched. No assertion was weakened, deleted, or skipped.

---

## What was implemented (against `n2` §1–§4b, §8, plus the orchestrator's adjudicated T3b addition)

### 1 · `hasEvidenceBodyBelowHeader` — the T3b repair (canonical `:14908`)

Ruled in scope by the orchestrator. One added clause, alongside the existing blank-line and
valueless-`token:` tolerances:

    if (/^<!--(?:(?!-->)[\s\S])*-->$/.test(t)) return false;

Anchored at BOTH ends so a line that merely starts with a comment and then carries prose is still a
body. This is a tolerance for a line shape `seedEvidenceFile`'s `freshSeed()` writes and nothing else
writes — the guidance comment above every stub token. I independently confirmed the predicate's
single call site before relying on the safety argument: `grep -n hasEvidenceBodyBelowHeader` returns
the definition plus **one** call, `:14879` inside `runSubstituteRole`. It cannot reach
`checkEvidenceShape`, the barrier, or any other guard.

Not a general loosening, and I proved that rather than asserting it: `#819-T2c` (a body whose only
`capability_gap` occurrence is indented inside a value, every token empty) and `#819-T2b` (a forged
marker over real findings) both still refuse, and the classifier probe below shows a body with real
content alongside comments still classifies `deliverable`.

### 2 · `CAPABILITY_GAP_MARKERS` + `classifyEvidenceBody` (canonical `:14918`, `:14936`)

Transcribed from `n2` §1 without redesign. Both typed markers are accepted — the column-0
`capability_gap:` key AND the column-0 `delegation_outcome` gap line the real role emitted unprompted
— each `/^…/m`-anchored, so the em-dash-versus-`--` divergence `n1` C3 measured in the `.toml`
editions is never keyed on. The value-presence regex is the byte-identical one from
`checkEvidenceShape` (`:2928`), so the two gates cannot disagree about what "a token carries a value"
means. Exported alongside `hasEvidenceBodyBelowHeader` per `n2` §8.

### 3 · `runSubstituteRole` — the rewritten guard order (canonical `:14778`)

Implements `n2` §4b's table exactly: **P0** (`substitute_self_noop`, new, first — above P1 and above
the replay branch) → P1 → **P2/P3/P4 moved above the replay branch** → P5a (ledger, untouched) →
**P5b** (the classification) → `isReplay` detection with no return → **C1** (the reset) → **C2** (the
replay return, moved into the commit phase) → C3 (record). Both `ok` returns now carry
`evidence_reset: <boolean>`.

C1 resolves the nonce with `readNonce` and re-seeds via `seedEvidenceFile(..., forceRotate=true)`,
which routes to `writeFileAtomicReplace` (tmp + fsync + rename) — no new writer was written. Both
failure modes map to the one new code `substitute_evidence_reset_failed` and write no record. The
binding is PRESERVED, not rotated.

### 4 · The task identity (canonical `:3060`, `:3121`)

`codexTaskNameForNode` gains an optional second parameter; `buildDispatch` resolves the substitution
above the task-name computation and derives from `agentType`. `sanitizeCodexTaskName`,
`dispatchSummarySegments`, and every other card key are untouched, per `n2` §3's deliberate
non-changes.

### 5 · `OPERATOR_HINT_REGISTRY` (canonical `:535`) and the usage line (`:15026`)

The two new codes get the `n2` §8 entries verbatim; the five older `substitute_*` codes keep their
fall-through, as specified. The `substitute-role` usage parenthetical now names the reset. **No new
subcommand was added**, so the other four in-file registration lists `n1` PART 3 enumerated (the
dispatch switch, `SPLIT_GUARDED_SUBCOMMANDS`, `REPLAN_GUARDED_SUBCOMMANDS`,
`LEDGER_MUTATING_SUBCOMMANDS`) are correctly unchanged — `substitute-role` is already a member of the
two guard sets.

---

## before_result / after_result

| command | before (HEAD `88d97b8a`, canonical unmodified) | after |
|---|---|---|
| `node scripts/test-adaptive-node.js` (unsharded) | **exit 1** — 420 scenarios / 3504 passed / **41 failed**, all `#819-` | **exit 0** — 420 scenarios / 420 ran / **3553 passed / 0 failed** |
| `node scripts/edition-sync.js --check` | exit 0 | **exit 0** — `12 forge aggregator ports in parity with canonical.` |
| `node scripts/validate-script-sync.js` | exit 0 | **exit 0** — `22 common scripts, 24 byte-identical groups, …` |
| `node scripts/simulate-workflow-walkthrough.js` (unsharded) | exit 0 (n1 6C) | **exit 0** — 280 scenarios / 280 passed |

3553 after versus 3545 total before (3504 + 41) is fully accounted for: `#819-U1`'s eight classifier
cases sit behind an `if (typeof mod.classifyEvidenceBody === 'function')` guard that could not
execute until the export existed. 3545 + 8 = 3553.

## verification_commands — real captured exit codes, never a piped `| tail`

Every exit code below was captured with `$?` on the command itself (output redirected to a file, then
read). None was read through a pipe.

    node scripts/test-adaptive-node.js                                              exit 0
    node scripts/edition-sync.js --check                                            exit 0
    node scripts/validate-script-sync.js                                            exit 0
    node scripts/simulate-workflow-walkthrough.js                                   exit 0
    npm run sync:editions                                                           exit 0   (3 files updated)
    node scripts/validate-workflow-contracts.js                                     exit 0
    node scripts/validate-kaola-workflow-contracts.js                               exit 0
    node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js   exit 0
    node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js     exit 0
    …-gitlab-contracts.js --forbidden-only <gitlab port> <codex port>               exit 0   (2 files)
    …-gitea-contracts.js  --forbidden-only <gitea port>  <codex port>               exit 0   (2 files)

The four validation chains are `n8`'s, not mine. This is a cross-edition diff (three plugin trees),
so `n8` owes all four chains sequentially; a green claude chain alone is insufficient, and per `n1`
6B the fast gate samples `test-adaptive-node.js` at `--shard auto/12` and may not execute these
scenarios at all — **the unsharded invocation is mandatory**.

---

## `#819-T3b` — GREEN, and mutation-proven non-vacuous

**T3b is green.** It is not green by accident of the suite: I built isolated mutant copies of the
module in a scratch tree (the repository files were never mutated) and drove the #819 fixtures
through each. Twelve named mutations, twelve discriminated — none survived.

    mutation                                            probe that moved            control  ==>  mutant
    M1  drop the HTML-comment skip                      T3b production seed         ok/reset=false  ==>  substitute_node_closed
    M2  classifier never returns capability_gap         T1, T9, T8b, T13            ok/reset=true   ==>  substitute_node_closed
    M3  drop the no-non-empty-token conjunct            T2b forged                  refuse          ==>  ok (body destroyed)
    M4  unanchor the markers                            T2c indented-only           refuse          ==>  ok (body destroyed)
    M5  remove P0                                       T7 self-substitution        refuse/no store ==>  ok/store written
    M6  derive the task name from the frozen role       T4 fresh identity           ->n1_investigator ==> ->n1_code_explorer
    M7  rotate the nonce in the reset                   T1 line1, T13 close         line1=true      ==>  line1=false, shapeOk=false
    M8  hoist the reset above the guard block           T1, T2, T2b, T2c, T10/P4    bytes=true      ==>  bytes=false on every refusal
    M9  swallow seedEvidenceFile ok:false               T8b unwritable .cache       typed refusal   ==>  EACCES escapes
    M10 fall back to an empty nonce                     T9 no baseline              refuse/no store ==>  ok/store written
    M11 run P5b before P5a                              T12b complete+deliverable   statusDetail=true ==> statusDetail=false
    M12 move C1 after C3                                T1, T9, T8b, T13            reset=true      ==>  reset=false, gap survives

M1 is the T3b row: dropping the one added clause turns the production seed straight back into
`substitute_node_closed`, which is `n1`'s measured 1B. Without the repair the fix would serve only a
role that DISOBEYED the contract and self-persisted a marker; the compliant role that writes nothing
would stay wedged.

Control column, for the record:

    T1 gap body                      ok/reset=true/clean=true/line1=true
    T3b production seed              ok/reset=false/bytes=true
    T2 deliverable                   substitute_node_closed/bytes=true/store=false
    T2b forged                       substitute_node_closed/bytes=true
    T2c indented-only                substitute_node_closed/bytes=true
    T7 self-substitution             substitute_self_noop/store=false
    T4 fresh identity                n1_code_explorer -> n1_investigator
    T9 no baseline                   substitute_evidence_reset_failed/bytes=true/store=false
    T8b unwritable cache             substitute_evidence_reset_failed/store=false/intactOrAbsent=true
    T10/P4 refusal purity            substitute_token_contract_mismatch/bytes=true
    T12b complete+deliverable        substitute_node_closed/statusDetail=true
    T13 close after reset            shapeOk=true

---

## Byte-identity of the UNSUBSTITUTED dispatch card — PROVEN, not assumed

The brief required proof, so I did not rely on `#819-T6`'s golden key list alone. I materialised the
pre-change module (`git show HEAD:scripts/kaola-workflow-adaptive-node.js` into a full copy of
`scripts/` in a scratch tree, diffed against `HEAD` to confirm the copy is exact) and compared
`JSON.stringify(buildDispatch(...))` — key ORDER included — between the old and new modules over:

- every one of the **18** roles in `ROLE_CAPABILITY_MANIFEST`,
- x 3 model tiers (`standard`, `reasoning`, `null`),
- x 4 contexts (project on disk / no project on disk / `runtime: 'codex'` / `opencode_provider` set),
- plus `codexTaskNameForNode` one-argument calls over 18 roles x 4 node-id shapes, plus 5 degenerate
  inputs (`{}`, id-only, role-only, `null`, `undefined`).

The measurement: **293 comparisons, 0 mismatches**, exit 0. The unsubstituted card and the one-argument
derivation are byte-identical to before.

The consequence `n1` 5B flagged holds: `scripts/simulate-workflow-walkthrough.js:21452`
(`d.codex_task_name === 'n1_tdd_guide'`) is preserved by construction. I did not merely infer it — I
ran the walkthrough **unsharded**, exit 0, 280/280, so the pin executed. `n1`'s I3 is confirmed and
no write-set overflow occurred.

---

## What P5 still guarantees (checked, not assumed)

A change that made every substitution succeed would have removed the guard rather than fixed it, so
each surviving refusal was exercised:

- A genuine deliverable still refuses `substitute_node_closed`, bytes untouched, no store (T2, and
  the T10 P5b row).
- A typed marker stamped ON TOP of real findings is a **deliverable**, not a gap — the forgery cannot
  launder work into a reset (T2b; M3 proves the conjunct is what stops it).
- An indented / quoted occurrence inside another token's value is prose, not a marker (T2c; M4).
- The ledger arm is untouched and still decides FIRST: a `complete` row refuses regardless of body,
  and T12b's `detail` proves which arm decided (M11).
- Every refusal is a byte-for-byte no-op on disk — evidence bytes, substitutions file, and the frozen
  plan all unchanged across all seven T10 rows (M8).
- There is no flag, env var, or argument that overrides either arm. No override path was added.

## The close-time asymmetry is preserved deliberately

I verified rather than trusted it. `DELEGATION_OUTCOME_VOCABULARY` is unchanged
(`completed | returned_partial | interrupted_unresponsive | interrupted_obsolete`), and driving
`checkEvidenceShape` over a body carrying the gap marker returns:

    ok=false, kind=shape, missingTokenClass=delegation_outcome,
    reason: "… evidence has unknown delegation_outcome \"capability_gap\" (allowed: completed | …)"

The marker is READ at substitute time and still REFUSED at close time. A gap may never close a node.
No shared constant changed, so nothing reached `kaola-workflow-adaptive-schema.js` (in nobody's write
set).

## Cross-edition parity, verified per port

Beyond `--check` and `validate-script-sync`, I loaded each of the three ports and exercised the new
behaviour directly. All three return `seeded` / `capability_gap` / `deliverable` on the three probe
bodies and `n1_investigator` / `n1_code_explorer` on the two-argument and one-argument derivations —
identical to canonical. Forge-neutrality confirmed by both `--forbidden-only` runs over the shipped
`plugins/` files, and the two new operator hints name only `write-halt --reason consent`, no forge
CLI, brand, or request noun.

---

## Findings for downstream nodes (no action taken by me)

1. **One stated behaviour change beyond the acceptance items, exactly as `n2` §4b specified**: moving
   the replay return into the commit phase means a replay now re-validates P2–P4. This matters only
   if the role library changed mid-run; refusing a no-longer-admissible recorded swap is the
   fail-closed answer. `n7`/`n8` should treat it as specified, not as an accident.
2. **`n2` §4b's accepted precedence consequence is live**: a `--to-role <frozen role>` whose frozen
   role has no manifest row now refuses `substitute_self_noop` rather than `substitute_unknown_role`.
   Deliberate.
3. **`n6` will meet `n1`'s 5D pre-existing drift**: `docs/api.md:318` and `:344` both under-list the
   guarded subcommand sets against `SPLIT_GUARDED_SUBCOMMANDS` / the scheduler-lock derivation. That
   drift predates this issue and is outside my write set; I did not touch it.
4. **`n2` §7 residual 2 stands unaddressed and out of scope**: `reopen-node` rotates the nonce but not
   the task identity, so a re-dispatched COMPLETE node still presents `id__role`. My derivation
   composes with a later attempt-ordinal suffix conditional on `attempt > 1` without disturbing
   byte-identity.
5. No test looked wrong. Every `#819-T*` assertion was satisfiable by implementing the mechanism as
   specified plus the adjudicated T3b repair; nothing was reported back as defective.

## Tie-breaker derivation (optional, audit-only)

At the T3b repair there was a live fork between the narrowest possible tolerance (skip only the exact
`<!-- token: paste token here -->` string the seeder emits) and a whole-line comment tolerance. Axiom
1 (correct first) picks the whole-line form: the seeder emits at least four distinct comment shapes
(the alternation header, the `domain_outcome` vocabulary note, the routable-anchor note, the
upstream-read instruction), and a literal-matched subset would silently re-wedge whichever role's seed
uses a shape the literal missed. Both ends are anchored so the tolerance cannot widen into "a line
that begins with a comment".

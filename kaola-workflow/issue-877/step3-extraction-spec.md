# Step 3 — the extraction spec

ADR 0017 build sequence step 3: *extract what is load-bearing for something other than node
execution, before the host dies.* This is the authored spec. It is the contract both the
implementation and its tests are written against, and neither may quietly widen it.

Design of record: `docs/decisions/0017-the-mission-list.md`. Format: `docs/mission-list.md`.

**Tooling trap:** `scripts/kaola-workflow-adaptive-node.js` and its three edition copies carry a NUL
byte near line 8400. ripgrep calls them binary and returns matches only below it. Use `grep -a` /
`rg --text` / line-range reads on those four files.

## The destination

Everything relocated lands in **`scripts/kaola-workflow-adaptive-schema.js`**. ADR 0017 names it as
the required survivor location: it is the cross-edition byte-identical drift anchor, and it is
already required by `claim.js`, `run-chains.js`, `sink-merge.js` and the contract validators. **Do
not rename that file** — the name is odd once the DAG is gone, but renaming it churns four editions
and the materializer for nothing. Do not create a new script.

## What moves, verbatim where possible

From `scripts/kaola-workflow-plan-validator.js` into `adaptive-schema.js`, with their private
helpers (`isValidationInvisible`, `filterVisiblePaths`, `visibleChangedPathsSince`,
`snapshotWorktree`, `detectSelfHostNpm`, `STALE_PATHS_LIMIT`, `GIT_MAX_BUFFER`, … — follow the call
graph and take what it needs):

| Source | Line | Destination name | Note |
|---|---|---|---|
| `isBarrierInvisible` | 457 | `isBookkeepingPath` | **Rename.** "Barrier" names a mechanism that no longer exists. Behaviour unchanged: repo-root `CHANGELOG.md`/`README.md`, `docs/**`, `kaola-workflow/{project}/**`. |
| `resolveFinalizeCheckRoot` | 747 | same | plan-independent already |
| `computeCodeTreeHash` | 5915 | same | plan-independent already; keep the 4-arg signature |
| `headAdvanceIsValidationInvisible` | 5983 | same | |
| `attachChainsStaleDiagnostics` | 6009 | same | |
| `parseGoal` | (plan-validator) | `parseGoal` | re-point at the mission list's H1 instead of the plan's `## Meta` `goal:` line |
| the `--finalize-check` **validation arm** | 7319–7473 | `evaluateChainReceipt(root, opts)` | see below |
| `releaseCheck` | 6042 | `evaluateReleaseReceipt(root, opts)` | see below |

`parseValidationTestConsumes` (plan-validator:1034) does **not** move. It read a `## Meta` field off
the plan, and the plan is gone. Replace it with one exported constant in `adaptive-schema.js`:

```js
// Paths this repo's own validation READS but the default code band treats as invisible
// (docs/** is invisible so a doc edit does not invalidate a receipt). Widening this makes the
// freshness key STRICTER, never looser. 32 archived plans declared such a widening per-run; almost
// all of them named docs/plan-run-cards/**, which this campaign deletes.
const VALIDATION_TEST_CONSUMES = Object.freeze([]);
```

Both the producer (`run-chains.js`) and the gate (`claim.js`) read that one constant, so they cannot
disagree — that shared-reference property is the whole reason the original was passed by require,
and it must survive. Today's effective value is `[]`, so this is behaviour-preserving.

## The finalize door, rewritten

`claim.js:3783 probeFinalizeValidationGate` today shells `plan-validator --finalize-check` and
propagates a refusal as `finalize_gate_unverified` from `cmdFinalize` (`claim.js:4111-4124`), plus a
read-only second call site in `evaluateFinalizePreconditions` (`claim.js:3898`). The validator's
`--finalize-check` has three arms. They are not equal and must not be treated as one.

**Arm A — validation (the chain receipt). SURVIVES as a verdict.** Ported to
`adaptiveSchema.evaluateChainReceipt`, called **in process** — no spawn, no plan path. Keep the
dual-mode repo-kind discriminator (self-host iff the git top-level `package.json` declares
`test:kaola-workflow:*`; present-but-unparseable → `repo_kind_undetermined`, fail-closed), the
self-host arm reading `.cache/chain-receipt.json` with `codeTreeHash` freshness and the `headSha`
fallback, the consumer arm reading `.cache/final-validation.md`, and the typed precedence family
`chains_unverified > chains_stale > chains_empty > chains_red`. This is First Principle 5 — own your
own verdicts — and it is the one place a finalize may still stop.

**Arm B — the attribution sweep. BECOMES A REPORT. It must not refuse.** Its teeth came entirely
from *declared write sets*: a machine-checkable path set authored before the work. ADR 0017 removes
declared write sets and names this an accepted loss. A mission-list `result` is free text and is
therefore not a path set; parsing one back out would re-invent the declaration. So:

- compute `git diff <base>...HEAD --name-only`, drop everything `isBookkeepingPath` covers;
- **do not compare it to anything and do not refuse.** Emit it as `changed_paths` on the finalize
  envelope with `result: 'pass'`, and write it durably into
  `kaola-workflow/{project}/finalization-summary.md` under a `## Changed Paths` heading.

The durable write is not optional. ADR 0016: *when a refusal becomes a report, the report must
durably capture what the refusal was freezing; a conversion that emits a verdict and drops the state
is a deletion, not a conversion.*

Delete with arm B: `resolveEpochLineagePlans`, the sealed-epoch union, the final-fix register
(`FINAL_FIX_*`, `classifyFinalFixSurface`, the `final-fix-commit` route), and
`unattributed_change` itself.

**Arm C — gate execution / post-dominance (`verifyGateExecution`, G1–G4). DELETED OUTRIGHT.**
Nothing in the list form post-dominates anything. Note for whoever reads the old test corpus: the
two `test-adaptive-node` failures that were "not token flips" (`#802-AC6-FINALIZE`) were caused by
this arm being promoted into `--finalize-check`; they are answered by deleting it, not by fixing a
fixture.

`adaptive_plan_missing` is deleted — there is no plan to be missing. A finalize with no
`mission-list.md` is not an error either: the file is a convention, not a precondition.

## The release gate

`--release-check` (`plan-validator.js:6042`) is a live, load-bearing pre-tag gate and its host dies.
Move its body to `adaptiveSchema.evaluateReleaseReceipt` and expose it as a **`--release-check` verb
on `scripts/kaola-workflow-run-chains.js`**, which already produces the receipt, already survives,
and already owns `resolveChains` for the coverage arm. Keep every documented delta from the finalize
arm: strict `headSha` equality against the candidate, `headSha` missing/`unknown` refuses, a
dirty-stamped receipt refuses, any waived chain refuses `chains_waived`, a subset receipt refuses
`chains_incomplete`, and an unresolvable chain set fails closed to `repo_kind_undetermined`. Update
the `--release-check` mention in `kaola-workflow-release.js:318` to name the new command.

## Archive completeness

`claim.js:5316 listRecordedNodeEvidence` proves an archive is lossless by deriving a required set
from the ledger — every `complete` row implies `.cache/<id>.md`. `verifyArchiveComplete`
(`claim.js:5349`) refuses on that basis. The ADR did not name this; it is the same declared-set
problem one layer down, and it dies with the ledger.

Replace the derivation, keep the property: **the archive is complete iff every file present under
`kaola-workflow/{project}/` before the move is present under `kaola-workflow/archive/{project}/`
after it.** That is a stronger check than the old one (it covers files no ledger row implied), it
needs no declaration, and it is a measurement. Keep the refusal — losing a durable record during an
archive move is exactly the irreversible harm a refusal is for.

## The consent path

ADR 0017 is explicit: *a durable valve is only needed once a question must outlive the process that
asked it; until that is observed, conversation is the mechanism*, and the valve sits on the watch
list. So the durable machinery is **deleted, not relocated** — the `consent_halt: pending` marker
(which lives inside the dying plan's ledger section anyway), `.cache/consent-halts.json`,
`.cache/consent-grants.json`, `consentScopeDigest`, `haltParkScope`, `write-halt` / `clear-halt`,
and the `halt_pending` refusal.

What survives is the **rule, in prose**, and it must appear in all three surviving commands and
their three Codex SKILL twins: *irreversible and value-laden calls belong to the user — ask, in
conversation, before taking one.* Losing that sentence is losing the mechanism.

## Nonces

Delete. The nonce is derived from the barrier baseline tree SHA at `adaptive-node.js:7999` / `8797`
and is consumed only by evidence binding, the close-time staleness check, fan-out member binding and
the `upstream_read` proof — all node execution. Nothing outside node execution reads one. The
watch-list row "stale / replayed / cross-copied evidence → provenance stamps" is its generalisation
and stays unbuilt.

## Acceptance

1. `claim.js` and `run-chains.js` no longer `require` `kaola-workflow-plan-validator.js`. Nothing
   outside the retiring set does.
2. A finalize over a green, fresh receipt passes with no plan file present anywhere.
3. A finalize over a stale receipt refuses `chains_stale`; over a missing receipt,
   `chains_unverified`; over a red receipt, `chains_red`. Precedence holds when several apply.
4. A finalize whose diff touches paths no record describes **passes**, reports them on
   `changed_paths`, and leaves them in `finalization-summary.md` under `## Changed Paths`.
5. `run-chains.js --release-check` reproduces every refusal the plan-validator verb produced:
   `chains_stale` on a sha mismatch, on a missing/`unknown` `headSha`, and on a dirty-stamped
   receipt; `chains_waived` on any waiver; `chains_incomplete` on a subset receipt;
   `repo_kind_undetermined` on an unresolvable chain set.
6. An archive that would drop any file under the run folder refuses; one that moves everything
   passes.
7. The producer and the gate compute the same `codeTreeHash` for the same tree — one shared
   constant, one shared helper, no second copy.

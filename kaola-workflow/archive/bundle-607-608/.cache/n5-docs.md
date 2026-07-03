evidence-binding: n5-docs 1fe7f8a3b392

docs-updated: CHANGELOG.md, docs/decisions/D-607-01.md, docs/decisions/D-608-01.md, docs/workflow-state-contract.md, docs/conventions.md, docs/architecture.md

## Summary

**CHANGELOG.md** — added a new `## [Unreleased]` section at the top (above `## [6.19.0]`, which
is untouched) with `### Fixed` entries for #608 (receipt `timed_out` field, TIMEOUT-labelled
failure summary + `chains_red` operator hint naming `KAOLA_RUN_CHAINS_TIMEOUT_MS`, default
900000→1800000) and #607 (the three-layer main-session-gate write fence: upstream
instrumentation provisioning, the `kind:'gate'` running-set state channel + write-lane hook
rule (c), and the `instrumentation:` evidence token), each referencing its decision record.

**docs/decisions/D-607-01.md** (new) — three-layer fence design (upstream provisioning /
runtime write fence / close-time evidence token), the kind-consumer audit conclusion (every
write-oriented scheduler count excludes `kind:'gate'`; the one behavioral delta —
`write_awaits_drain` instead of co-open for an independent writer ready alongside a live gate —
is a non-correctness makespan effect in an unreachable DAG shape), the narrowed Layer 3
interpretation (token carries no paths; enforced as "named node exists in the ledger and is a
writer"), the three honest residual holes (Bash-mediated writes uncovered by the hook;
pre-existing `.cache`-anywhere carve-out; sticky fence after a mid-gate crash as an intended
fail-closed tripwire), and an explicit "Narrow exception to [INV-2]" section reconciling this
change against D-419-01's hard byte-identity invariant ("`open-next` MUST NOT begin writing a
`running-set.json`") — narrowing its literal scope to exclude the gate state channel while
preserving its write-concurrency purpose.

**docs/decisions/D-608-01.md** (new) — observability-first design (promote the already-computed
internal `_timedOut` marker into the persisted receipt as `timed_out`, no new computation), the
30-minute recalibration rationale (the reference box's live run exceeded the prior 900s bound —
the second such recalibration after #512's 600s→900s), and explicit non-goals (no auto-scaling
or adaptive per-chain budgets; no retry-on-timeout; no change to receipt pass/fail semantics).

**docs/workflow-state-contract.md** — added a `kind: 'gate'` member sub-bullet immediately after
the existing `running-set.json` bullet (before the `lane_group` extension bullet), documenting
the entry shape, when it's written/removed, the reconcile-preserves-a-crashed-lone-gate
behavior, and the write-oriented-count exclusions, cross-referencing D-607-01 and the
architecture.md `[INV-2]` narrowing note. Did NOT add a `timed_out` schema note here — the
chain-receipt.json schema is documented in docs/api.md/architecture.md/conventions.md, never in
this file's own state-field inventory, so there was no existing schema block to extend without
introducing a new one (out of surgical scope for this file); the `timed_out` field is documented
in conventions.md instead (see below).

**docs/conventions.md** — two additions: (1) a `Per-chain kill ceiling and timeout
observability (#608)` paragraph inserted into the existing `## Chain receipt is the only valid
greenness evidence (#432)` section, documenting the raised default, the `timed_out` field, the
TIMEOUT-labelled failure summary, and the `chains_red` hint change; (2) a new `## Main-session-
gate write fence and upstream instrumentation provisioning (#607)` section at the end of the
file, documenting the gate-window fence (default-ON, `KAOLA_GATE_WINDOW_FENCE=0` opt-out, the
intentional sticky-fence-after-crash behavior and its recovery) and the upstream-provisioning
rule (instrumentation authored by an upstream writer inside its own declared write set; the
plan states the durability decision; the gate never authors or deletes files; the required
`instrumentation:` evidence token).

**docs/architecture.md** — one surgical addition. The file's restatement of D-419-01's `[INV-2]`
hard byte-identity invariant ("Any refactor that makes `open-next` begin writing a
`running-set.json` violates [INV-2] and is rejected") is now literally contradicted by #607's
`recordGateInRunningSet`, which makes `open-next`/`close-and-open-next` write a
`running-set.json` precisely when opening a `main-session-gate`. This is flagged in D-607-01.md
as a disclosed, deliberate narrowing (the invariant's write-concurrency PURPOSE holds; only its
literal text is scoped), and a new paragraph — "Narrow #607 exception to [INV-2]" — is inserted
immediately after the existing INV-2 paragraph in architecture.md so a future reader does not
find the two documents in silent tension. No other part of architecture.md's running-set/
scheduler description needed updating (the write-lane hook's own rule detail lives in docs/api.md,
out of this node's write set — see Deviations below).

## Verification

- `node scripts/validate-workflow-contracts.js` → `Workflow contract validation passed`, EXIT=0.
- `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed`, EXIT=0 (full suite, no failures — confirmed via background run tail, last scenarios `testRunProgressMirror605: PASSED` etc.).
- `git status --porcelain` in the worktree lists exactly the 6 declared files (`CHANGELOG.md`,
  `docs/architecture.md`, `docs/conventions.md`, `docs/workflow-state-contract.md` modified;
  `docs/decisions/D-607-01.md`, `docs/decisions/D-608-01.md` untracked/new) plus the project's own
  `kaola-workflow/bundle-607-608/` state directory (expected, not part of the barrier write set).

## Deviations from the dispatch brief

- **`docs/api.md` is stale but out of this node's declared write set — not touched.** It documents
  `KAOLA_RUN_CHAINS_TIMEOUT_MS` (default `900000`, at line ~170/~381) and the `KAOLA_LANE_CONTAINMENT`
  write-lane hook (line ~689) at schema-level detail this change alters (`timed_out` field, the raised
  1800000 default, the new gate-window fence rule (c) and `KAOLA_GATE_WINDOW_FENCE` variable are
  entirely undocumented there). Per the dispatch brief's own fallback instruction ("if the env var
  tables live only in README — README is OUT of your write set — put the env-var documentation here
  in conventions.md"), I applied the same reasoning to docs/api.md (also out of scope) and put the
  env-var/schema documentation in `docs/conventions.md` instead. **Flagging for the reviewer/finalize
  node: docs/api.md's `KAOLA_RUN_CHAINS_TIMEOUT_MS` table entry and its `KAOLA_LANE_CONTAINMENT` hook
  description are now stale and should be updated by whichever node owns that file.**
- **`README.md` and `.env.example` are also out of this node's write set and were not touched.**
  `README.md` documents `KAOLA_RUN_CHAINS_TIMEOUT_MS` with the now-stale `900000` default (line
  ~801) and does not mention `KAOLA_GATE_WINDOW_FENCE` at all; `.env.example` exists but was not
  inspected in detail beyond confirming its presence — both are flagged as the same class of gap
  as docs/api.md above, for the reviewer/finalize node to route to an owner.
- No other deviations. All 6 declared files were touched exactly as scoped; no file outside the
  declared write set was modified.

## Delta — write set widened to include docs/api.md, README.md, .env.example

Following the team lead's plan re-freeze widening the declared write set, the gap flagged above
was closed:

- **docs/api.md** — three edits: (1) the `KAOLA_RUN_CHAINS_TIMEOUT_MS` Timeout Control entry
  (~line 170) now states the 1800000 default, the two-step recalibration history (600000→900000
  #512 → 1800000 #608), and describes the `timed_out` field + TIMEOUT-labelled failure summary +
  `chains_red` hint; (2) the chain-receipt JSON schema example (~line 359-377) gained
  `"timed_out": false` on every illustrative chain entry plus a sentence defining the field and
  its legacy-absence-means-false rule, and the "Configurable kill ceiling" paragraph (~line 381)
  now cites 1800000/#608 instead of 900000/#512-only; (3) a new bullet immediately after the
  existing `KAOLA_LANE_CONTAINMENT` bullet (~line 689) documents `KAOLA_GATE_WINDOW_FENCE` as a
  second, independent, default-ON switch on the same write-lane hook, arming rule (c) evaluated
  first, with the carve-outs (workflow bands, `.kw/` band, member worktrees, co-open declared
  lanes) and the unchanged fail-open exits when no gate is open.
- **README.md** — the `KAOLA_RUN_CHAINS_TIMEOUT_MS` env-table row (~line 801) default corrected to
  `1800000` with the recalibration + `timed_out` rationale; a new `KAOLA_GATE_WINDOW_FENCE` row
  added directly below it (default `1`/ON, fences an open gate window, `=0` opt-out, carve-outs
  summarized).
- **.env.example** — the `KAOLA_RUN_CHAINS_TIMEOUT_MS` commented block (~line 8-10) updated to the
  1800000 default with the #608/#512 history in the comment; a new commented
  `KAOLA_GATE_WINDOW_FENCE` block added directly after the `KAOLA_LANE_CONTAINMENT`/
  `KAOLA_LEG_ISOLATION` advanced-knobs block (~line 63), matching the file's existing
  comment-then-`# VAR=value` convention.

**Re-verification:** `node scripts/validate-workflow-contracts.js` → `Workflow contract
validation passed`, EXIT=0 (confirms no pinned needle in docs/api.md/README.md broke).
`node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed`,
EXIT=0 (full suite, no failures — confirmed via background run tail through
`testRunProgressMirror605: PASSED`). `git status --porcelain` now lists exactly the 9 declared
files: `.env.example`, `CHANGELOG.md`, `README.md`, `docs/api.md`, `docs/architecture.md`,
`docs/conventions.md`, `docs/workflow-state-contract.md` (all modified) plus
`docs/decisions/D-607-01.md`, `docs/decisions/D-608-01.md` (new) — plus the project's own
`kaola-workflow/bundle-607-608/` state directory (expected, not part of the barrier write set).

No further gaps identified in this widened scope.

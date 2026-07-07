evidence-binding: n4-cards-planner-topup afb40637ccbc

## Task

n4-cards-planner-topup — bundle-623-627-628, serial write node (runs directly in this worktree,
not a leg). Owns #628 (card corrections) + #623 (card + planner topup-scope) per the frozen plan's
`### n4-cards-planner-topup` bullet and the `### Shared canonical spec` Plan Note.

## non_tdd_reason

category: docs/prose corrections against an exact canonical spec (three-tier speculation +
freeze-legal example + rolling-topup scope-fix) — no natural failing unit test applies; this is
agent-facing/docs prose, not behavioral logic. Verified by the standing machine-pinned guardrails
(route-reachability + contract validator + walkthrough) staying green before and after, matching
the plan's own stated verification method for this node.

## verification_tier

regression-green

(full existing suite green before AND after the docs/prose edit — the three standing guardrail
scripts named in the dispatch brief.)

## write_set (files actually changed)

- docs/plan-run-cards/frontier-batch.md
- agents/workflow-planner.md

(No other file touched; `git status --short` confirms only these two show `M`.)

## Work performed

### #628 §1 — speculation-is-consent-only (STALE) — docs/plan-run-cards/frontier-batch.md

Three spots in the card still framed speculation as consent-gated only; updated all three to the
three-tier reality (`auto` = default-on, no per-run consent, both READ and leg-contained-WRITE
eligible; `consent` = opt-in tier; `off` = serial, the DEGRADED path), matching n1's already-landed
framing on `commands/kaola-workflow-plan-run.md` (`<!-- CARD: speculative-open -->` section,
"Speculative gate-overlap is default-on ... the three tiers are auto / consent / off ... plain
serial waiting is the DEGRADED path").

1. §3 bullet (was "Speculative read fallback ... speculative_open_policy: consent"), now:
   "Speculative fallback (`speculative_open_policy` in `## Meta` — three tiers, `auto` / `consent`
   / `off`): ... Under `auto` (the freeze-time default) `open-ready` fans these out automatically
   — no per-run consent, no flag needed; under `consent` ... requires `--speculative-consent` ...
   (the opt-in tier); under `off` it never happens and plain serial waiting is the DEGRADED path."
2. §7 table row (was a single "Speculative read fallback | Only with --speculative-consent AND
   speculative_open_policy: consent" row), replaced with three rows — one per tier (`auto`
   default/no-flag row, `consent` opt-in row, `off` serial-degrade row).

Acceptance check (#628 AC): `grep -ri "speculative" docs/plan-run-cards/frontier-batch.md` shows
NO remaining consent-only framing of the default tier — every speculative-policy mention in the
file now states `auto` is the default with no per-run consent. (Note: this node's declared write
set is limited to frontier-batch.md + workflow-planner.md; `docs/plan-run-cards/README.md` line 17
and `speculative-open.md` are outside this node's write set and were left untouched — the latter
already carries the correct three-tier framing, `auto (default)` / `consent` / `off`, so it needed
no fix.)

### #628 §2 — freeze-illegal example — docs/plan-run-cards/frontier-batch.md §2 JSON example

Replaced the directory-shaped write-set entries `"api/"` / `"cli/"` (refused at freeze —
`hasUnresolvableEntry` in `scripts/kaola-workflow-plan-validator.js` treats a trailing-slash token
as unprovable-disjointness) with exact file paths `"api/routes.js"` / `"cli/main.js"` — confirmed
against `hasUnresolvableEntry` (scripts/kaola-workflow-plan-validator.js:756-763): a token is
unresolvable only if it ends with `/` or contains a glob metacharacter (`*?[]{}`); neither
replacement path does either, so both are freeze-legal exact-path entries.

### #623 topup-scope — BOTH files, per the Shared canonical spec (Surfaces 2 and 3)

Truth encoded (matching n1's Surface 1 wording on `commands/kaola-workflow-plan-run.md`): rolling
slot-level top-up (`open-ready` admitting a new member as a slot frees) is a READ-frontier
behavior only. A WRITE frontier wider than `FANOUT_CAP` does NOT top up into a live lane group —
group membership / `write_union` / baseline are fixed at group formation — so it runs as fixed
group waves (first ≤cap members form a group and run to completion, each wave paying its own
synthesizer-merge + group barrier, then the next wave forms as a new group).

- **Surface 3 — docs/plan-run-cards/frontier-batch.md §6 (Fan-out caps).** Was: "`open-ready` opens
  the remainder on the next call as members close" (unscoped). Now scoped: READ frontier tops up
  the remainder on the next call (rolling admission into the same live set); WRITE frontier wider
  than the cap runs as fixed group waves instead (explicit wave/group-barrier language, matching
  n1's Surface 1 prose).
- **Surface 2 — agents/workflow-planner.md ~:76-77.** Was: "The executor opens up to `FANOUT_CAP`
  legs and drains the rest via rolling bounded dispatch (queue the overflow, top up as slots
  free)" (unscoped — read the sentence as applying to any fan-out, including write). Now scoped:
  "for a READ frontier wider than the cap it drains the rest via rolling bounded dispatch (queue
  the overflow, top up as slots free) — for a WRITE frontier wider than the cap, group membership
  is fixed at formation, so it runs as fixed group waves instead: the first ≤cap members form a
  group and run to completion (each wave paying its own merge + group barrier) before the next
  wave forms."

Provenance-ban check on `agents/workflow-planner.md` (PROVENANCE-scanned, agent-facing): the diff
introduces no `#NNN` / `D-NNN-NN` / `INV-NN` / ADR token — confirmed via
`git diff -- agents/workflow-planner.md | grep -E '^\+' | grep -E '#[0-9]+|D-[0-9]+-[0-9]+|INV-[0-9]+|ADR'`
(no matches, exit 1).

## verification_commands (before / after)

Ran identically before touching either file and again after the edits; both runs green (the
baseline plan state at claim was already green from n1/n2/n3's prior work — this node's edits are
docs/prose-only and could not regress any of the three).

1. `node scripts/test-route-reachability.js`
   - before: `Route-reachability test passed (260 assertions).` exit 0
   - after: `Route-reachability test passed (260 assertions).` exit 0
2. `node scripts/validate-workflow-contracts.js`
   - before: `Workflow contract validation passed` exit 0
   - after: `Workflow contract validation passed` exit 0
3. `node scripts/simulate-workflow-walkthrough.js`
   - before: `Workflow walkthrough simulation passed` exit 0
   - after: `Workflow walkthrough simulation passed` exit 0

## before_result

All three guardrail scripts green prior to editing (inherited from n1/n2/n3's completed, merged
state in this same worktree — verified by re-running them at the start of this node's work).

## after_result

All three guardrail scripts still green after the docs/prose edits to `frontier-batch.md` and
`workflow-planner.md` (re-run post-edit, see verification_commands above). `git status --short`
confirms exactly the 2 declared files show `M`; the remaining untracked entries are the seeded
plan/state/.cache scaffolding for this bundle run.

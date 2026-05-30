# Fast-path widening: admit mechanical-medium issues on the uncertainty axis

**Date:** 2026-05-30
**Status:** Design — for review before filing as GitHub issues
**Supersedes/extends:** `docs/investigations/fast-path-workflow-2026-05-17.md`

---

## Mission

The fast path is a good harness, and we want it to finish more issues — not
just trivial ones, but **medium-scoped issues whose approach is obvious**.
This design widens what fast path accepts, **without** weakening the
correctness safety that protects the finalize stage.

The change is deliberately *not* "raise the file count from 2 to 5." That
moves the wrong lever on the wrong axis. The change is: **select on
uncertainty, keep the escalation hatch, and close the one gap that widening
exposes.**

## What the current standard actually is (verified)

The numeric scoring gate proposed in the original design doc
(`fast-path-workflow-2026-05-17.md` — `analyzeIssue()` returning
`recommended_path` from a pro/anti signal table) **was never built**. The
only `analyzeIssue()` in `kaola-workflow-claim.js` classifies priority
labels. The operative "standard" today is two separate mechanisms:

1. **Selection rubric** — agent judgment in `commands/workflow-next.md`
   (Step 0a-1, lines 80-117). Fast is chosen only if *all* hold: **≤ 2
   closely related files**, no new external deps, no public
   API/schema/migration change, no security/auth/encryption concern, no
   `depends-on:#N` label, single area. "When in doubt, full."
2. **Escalation hatch** — inside `commands/kaola-workflow-fast.md`
   (Mid-Flight Escalation, lines 42-59). Bail to full on: scope larger than
   one or two closely related files, `test_thrash` (≥ 3 consecutive failing
   cycles), security/architecture/breaking-change concern, discovered
   dependency, new external package, reviewer BLOCK or CRITICAL/HIGH.

The number `2` lives in the fast command's eligibility contract; the router
prose mirrors it. There is **no escalation telemetry** anywhere
(`grep` for `escalated_to_full` in `scripts/` returns nothing).

## Evidence that brackets the question

Two archived real runs frame the decision precisely:

- **issue-74 — PASSED.** A 5-concern, multi-area change (startup + sibling
  worktree pathing + fast-path state + remote-claim detection + finalize
  cleanup) went through fast path and passed. The harness *can* absorb
  medium work. **But** it used **self-review**, not the delegated
  `code-reviewer` the contract calls for on production-path code. It widened
  scope and took the review shortcut at the same time.
- **issue-75 — ESCALATED cleanly.** "6 files across scripts/, commands/,
  plugins/ … 6 distinct lifecycle gaps." The hatch fired correctly at gross
  overflow and re-routed to full.

Reading: the rubric (`≤ 2`) is **demonstrably conservative** — fast already
stretched past it and succeeded. The hatch works for **gross overflow**. The
danger lives in the **middle band**: medium scope where it neither obviously
trips the hatch nor is trivial — and where the temptation to self-review
rises.

## Design principles

1. **Asymmetric failure (unchanged from v1).** False-full costs *time*.
   False-trivial costs *correctness* — a wrong implementation reaches Phase 6
   finalize. Widening must not increase un-caught false-trivials.
2. **Two levers, opposite risk.** Relaxing **selection** (what fast is
   *chosen* for) is cheap, because a mis-pick just escalates. Relaxing the
   **escalation bounds** (how far fast *runs* before bailing) is dangerous,
   because it removes the backstop. → **Widen selection; keep the hatch.**
3. **The axis is uncertainty, not size.** What Phases 1-2 buy is uncertainty
   reduction. Fast's real precondition is "the approach is unambiguous." File
   count is a crude proxy. The discriminator we want is **mechanical-medium
   (fast) vs design-medium (full)**.
4. **Measure before moving the line.** No corpus exists, but every fast run
   leaves an archived `fast-summary.md` with Status + Escalation reason. The
   corpus is recoverable retroactively, cheaply.
5. **Escalation is partial-waste, not total-waste.** It preserves the
   in-progress artifact and feeds the planner's findings into Phase 1. The
   per-occurrence cost still grows with admitted scope — another reason to
   gate on uncertainty rather than just a bigger number.

## The design

### Pillar 0 — Calibration audit (measure first, lands first)

A new read-only script `scripts/kaola-workflow-fast-audit.js` that scans
`kaola-workflow/archive/*/fast-summary.md` (and any active
`kaola-workflow/*/fast-summary.md`) and reports:

- total fast runs; counts of `PASSED` / `ESCALATED` / `IN_PROGRESS` / `REVIEW`
- escalation-reason histogram (parsed from the `## Escalation` field)
- file-count distribution where parseable from `## Scope`
- **review mode per run**: delegated `code-reviewer` invoked vs self-review
  (parsed from the `## Required Agent Compliance` table)

Output a human table by default, `--json` for machines. Always exit 0; it is
a report, not a gate. This converts "where should the line be?" from opinion
into data, and it has **zero blast radius** (new file, `scripts/` only).

### Pillar 1 — Select on the uncertainty axis

Reframe the eligibility contract (the source of truth is the Mid-Flight
Escalation / eligibility section of `kaola-workflow-fast.md`; the router
rubric in `workflow-next.md` mirrors it).

**New fast-eligible definition (all must hold):**

- The approach is **unambiguous and mechanical** — exactly one sensible way
  to do it. Mechanical examples: rename/move a symbol across files; thread an
  existing field/param through a known call path; behavior-preserving
  refactor; repetitive parallel edits (e.g. the 3-runtime parity edits);
  a bug fix whose root cause is already located.
- Single area; no new external deps; no public API/schema/migration change;
  no security/auth/encryption concern; no `depends-on:#N`; no
  breaking-change/architecture concern. *(All v1 vetoes retained — these are
  what protect correctness; none are relaxed.)*
- Files within a raised ceiling: **≤ 5** (was ≤ 2), **and** within a single
  area, **and** mechanical per above.

**Anything with ≥ 2 materially-different viable approaches stays on full**,
regardless of size — that is design-medium, where Phase 2 ideation earns its
keep. File count alone no longer disqualifies; ambiguity does.

The router's one-line path announcement (`workflow-next.md` line 107-113)
must state the discriminator it used, e.g.
`Path: fast (mechanical, single-area, 4 files)` or
`Path: full (≥2 viable approaches — design choice)`.

### Pillar 2 — Harden the escalation hatch

Widening the door requires reinforcing the net, not loosening it.

- **New trigger — approach ambiguity.** In Step 1 (Plan), the `planner` must
  explicitly answer: *"Is there exactly one sensible approach, or ≥ 2
  materially-different ones?"* If ≥ 2, the orchestrator writes
  `escalated_to_full: approach_ambiguity` and routes to Phase 1. This is the
  surgical substitute for the Phase 2 ideation that fast skips — it closes
  the one gap (wrong-approach) the hatch does not currently catch.
- **File overflow becomes relative-to-plan, plus an absolute backstop.**
  Today: escalate at `> 2` files (absolute). New: the planner declares a
  write set of N files (N ≤ 5); escalate during Execute if files touched
  **exceed the declared write set by more than 1** (scope creep we
  underestimated) **or** exceed an absolute hard ceiling of **6**. This makes
  the trigger about "we got the scope wrong," not a fixed small number.
- **Retained unchanged:** `test_thrash` (≥ 3), security/arch/breaking
  concern, discovered dependency, new external package, reviewer
  BLOCK/CRITICAL/HIGH.

### Pillar 3 — Mandatory delegated review above the trivial band

Close the issue-74 self-review loophole. The current contract allows
self-review for "fixes too small to warrant a delegated reviewer"; at medium
scope that is exactly where review matters most.

**New rule:** delegated `code-reviewer` is **mandatory** whenever the change
touches **> 1 file** *or* any production-path file (anything outside `docs/`,
`*.md`, `tests/`). Self-review remains allowed only for the trivial band
(single docs/comment/markdown edit). The Trivial Inline Edit exemption for
applying a one-line reviewer fix is unchanged.

### Pillar 4 — Parity, validators, tests

Every contract change is mirrored across all runtimes and asserted:

- **Claude:** `commands/kaola-workflow-fast.md`, `commands/workflow-next.md`.
- **Codex skills:** `plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md`,
  `.../kaola-workflow-next/SKILL.md`.
- **GitLab + Gitea editions:** the twin `commands/` and `skills/` under
  `plugins/kaola-workflow-gitlab/` and `plugins/kaola-workflow-gitea/`.
- **Validators:** `scripts/validate-workflow-contracts.js` and
  `scripts/validate-kaola-workflow-contracts.js` (+ gitlab/gitea twins) —
  assert the new ceiling, the `approach_ambiguity` trigger, and the mandatory
  delegated-review rule are present; `scripts/validate-script-sync.js` keeps
  mirrors byte-identical.
- **Walkthrough:** `scripts/simulate-workflow-walkthrough.js` (+ gitlab/gitea
  simulators) gains cases: (a) mechanical-medium (4 files) → fast → PASSED;
  (b) design-medium (≥ 2 approaches) → `approach_ambiguity` escalation;
  (c) scope creep beyond declared write set → file-overflow escalation;
  (d) >1-file change attempting self-review → rejected, delegated review
  enforced.

### Out of scope (explicitly)

- The full numeric statistical gate. Still deferred. We improve the agent
  rubric and add measurement instead.
- User-configurable thresholds / signal weights.
- A "fast-plus" intermediate tier. The binary fast/full split stays.
- Central escalation telemetry beyond the archive-scan audit.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Wider selection lets a design-medium issue in | New `approach_ambiguity` escalation at the planner step; ≥2-approaches stays on full by definition |
| Bigger fast changes ship un-reviewed | Pillar 3 makes delegated review mandatory above the trivial band |
| File-creep sails under a raised ceiling | Relative-to-plan overflow trigger + absolute backstop of 6 |
| We pick the wrong new ceiling | Pillar 0 audit calibrates it from real runs before Pillar 1 lands |
| Runtime parity drift (Claude/Codex/GitLab/Gitea) | Pillar 4 mirrors + validators + script-sync assertions |
| Late escalation wastes medium-scope work | Escalation preserves the artifact and feeds Phase 1; uncertainty-gating keeps admitted work mechanical (low re-work) |

## Acceptance criteria (whole effort)

- [ ] `kaola-workflow-fast-audit.js` reports PASSED/ESCALATED counts,
  escalation-reason histogram, file-count distribution, and review-mode per
  run over the archived fast-summaries; exits 0.
- [ ] Eligibility contract reframed to mechanical-vs-design with a single
  ceiling of ≤ 5 files; all v1 vetoes retained; router announces the
  discriminator.
- [ ] `approach_ambiguity` escalation trigger present in the fast command and
  all skill twins; planner is asked the one-vs-many-approaches question.
- [ ] File-overflow trigger is relative-to-declared-write-set + absolute
  backstop of 6.
- [ ] Delegated `code-reviewer` mandatory for >1-file or production-path
  changes; self-review limited to the trivial band.
- [ ] All four walkthrough cases pass;
  `node scripts/simulate-workflow-walkthrough.js` exits 0.
- [ ] Both contract validators + script-sync pass across Claude/GitLab/Gitea.
- [ ] README + CHANGELOG updated.

## Issue decomposition (proposed)

Three of the four pillars (1-3) converge on the same files
(`kaola-workflow-fast.md` + skill twins + the walkthrough), so they are one
coherent contract change, not three parallel ones. The audit is independent
and should land first to calibrate the ceiling.

| # | Title | Scope | Depends on | Labels |
|---|---|---|---|---|
| A | Fast-path calibration audit script | Pillar 0 — new `scripts/kaola-workflow-fast-audit.js`, scans archived fast-summaries; read-only; +tests | — | `enhancement`, `area:scripts` |
| B | Widen fast path to mechanical-medium issues | Pillars 1-3 — eligibility reframe + ≤5 ceiling + `approach_ambiguity` trigger + relative file-overflow + mandatory delegated review; parity + validators + walkthrough + docs | A | `enhancement`, `area:workflow-phases`, `area:workflow-router` |

Optional finer split of B (only if smaller PRs are preferred — note B's
sub-parts all edit `kaola-workflow-fast.md`, so they must be sequenced, not
parallelized):

- **B1** Selection axis + ≤5 ceiling (router + eligibility contract).
- **B2** Hatch hardening (`approach_ambiguity` + relative file-overflow).
- **B3** Mandatory delegated review above trivial band.

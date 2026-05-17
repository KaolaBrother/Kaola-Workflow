# Fast-path workflow: a compressed 1-phase track for trivial issues, gated and overridable

**Date:** 2026-05-17
**Status:** Design draft — for review before filing as a GitHub issue

---

## Mission

For trivial work (a typo, a one-line bug fix, a doc tweak), the full
6-phase workflow is overhead. Research → Ideation → Plan → Execute → Review →
Finalize is the right shape for substantive changes; it is wasteful for
changes whose plan is "edit one line." The user proposes a **fast path** —
a single compressed pass of Plan + Execute + Review that ends in the
existing Finalize machinery — selected by a gate at claim time with a hard
user-prompt override.

This document designs that fast path with explicit attention to:

1. **A trustworthy gate.** Trust does not come from day-one statistical
   correctness — there is no historical-issue corpus to calibrate against.
   Trust comes from three properties the design must guarantee: (a) the
   gate's decision and signals are printed at startup, (b) the user can
   override with one word in the next turn, (c) the fast path escalates
   itself mid-flight when it discovers it underestimated the work.
2. **A hard user-prompt override** that wins over the gate, in both
   directions, with a defined conflict rule and a hard-coded warning when
   user intent contradicts the signals.

## Premise check (stress-test before committing)

| Premise | Where it holds | Where it breaks |
|---|---|---|
| "Easy to describe issues are easy to implement" | Typos, doc edits, single-file syntax fixes, label corrections | "Easy" bug whose root cause is in a different subsystem than the symptom; one-line fix that turns out to need a schema migration; "trivial refactor" that touches 12 files |
| "6 phases is wasteful for trivial work" | Yes, holds. Research and Ideation add no value when the fix is obvious. | Only if the gate correctly identifies trivial work. False-trivial → broken implementation faster. |

**Asymmetric failure modes.** False-full (full workflow on a trivial issue)
costs time. False-trivial (fast path on a complex issue) costs
**correctness** — a broken implementation gets to Phase 6 finalize and is
hard to undo. The design must lean conservative on the gate and lean
aggressive on the escalation hatch.

## Current state (verified)

| Component | File:line | What it does |
|---|---|---|
| Router | `commands/workflow-next.md:55-77` | Calls `kaola-workflow-claim.js startup`, reads `STARTUP_OUT`, routes to a phase command |
| Phase artifact chain | `commands/kaola-workflow-phase{1..6}.md` | Each phase reads the prior phase's artifact as a hard prerequisite (e.g. `phase2.md:14-18` blocks if `phase1-research.md` is missing; `phase6.md:14-19` blocks if `phase5-review.md` status ≠ `PASSED*`) |
| Largest phase | `commands/kaola-workflow-phase6.md` (647 lines) | Sink dispatch, GitHub issue close, archive, roadmap refresh, final commit |
| Compact phases | Phase 1 (352), 2 (195), 3 (225), 4 (353), 5 (284) | Phases 1+2 are research/strategy with no code changes |
| Codex twins | `plugins/kaola-workflow/skills/kaola-workflow-{research,ideation,plan,execute,review,finalize}/SKILL.md` | Six skills, one per phase |
| Issue ranking signals | `scripts/kaola-workflow-claim.js:912-953` | `issueLabelNames`, `issueHasLabel`, `parsePriorityTier` — already computed per-issue at claim time |
| Config read | `scripts/kaola-workflow-claim.js:922-934` | `readPriorityConfig` reads `priority_top_tier_labels` from global + local `kaola-workflow/config.json` |
| Walkthrough simulator | `scripts/simulate-workflow-walkthrough.js` (~3500 lines) | Hand-rolled assert harness; covers all six phases end-to-end |

Two important constraints fall out of this:

- **Phase prereq chain is hard.** A clean fast-path cannot skip phases
  silently — every downstream phase will refuse to run. Either modify
  every phase to accept a fast-path bypass flag (high blast radius), or
  introduce **one new internal command** that runs the compressed pass
  end-to-end and writes a single artifact the finalize step can consume.
  The latter is chosen here.
- **#42 entry-surface rule.** Issue #42 prohibits adding parallel **entry**
  commands like `/workflow-next-pr`. This proposal adds an **internal
  phase command** (`/kaola-workflow-fast`), not an entry — the router
  `/workflow-next` remains the sole entry. #42's rule is preserved.

## Proposal

### Shape

One new internal phase command, mirrored as a Codex skill:

- `commands/kaola-workflow-fast.md` (Claude)
- `plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md` (Codex)

`/kaola-workflow-fast {project}` performs **Plan + Execute + Review** in a
single pass and writes **one artifact**:

```text
kaola-workflow/{project}/fast-summary.md
```

with sections:

- `## Plan` — the minimal intended change (files, write set, validation
  command, acceptance check).
- `## Execute` — diff summary, test added/updated, validation output.
- `## Review` — checklist of review-reviewer findings (or "self-reviewed
  by main session with rationale" for fixes too small to warrant a
  delegated reviewer), security review verdict, follow-ups.

`workflow-state.md` carries one new field: `workflow_path: fast | full`.
Default is `full` to preserve backward compatibility for in-flight
workflows.

After `/kaola-workflow-fast`, the router invokes the **existing
finalize machinery** (`/kaola-workflow-phase6`) with a single conditional
read: when `workflow_path: fast`, Phase 6's prereq reads
`fast-summary.md` instead of `phase5-review.md`. Sink dispatch, archive,
GitHub close, roadmap refresh — all unchanged.

### Gate: signal computation (shared with #41 Gap 1)

A new function in `scripts/kaola-workflow-claim.js`:

```text
analyzeIssue(issue, config) → {
  priority_tier:       (existing, from parsePriorityTier)
  recommended_path:    "fast" | "full"
  path_signals:        [{ name, value, weight, kind: "pro_fast"|"anti_fast" }]
  path_confidence:     "high" | "medium" | "low"
}
```

Shared signal computation means #41 Gap 1's top-tier label discovery and
the fast-path gate read labels once, classify together, and emit one
typed record. This avoids the predictable six-months-from-now collision
of two label-reading paths drifting apart.

**Pro-fast signals (each contributes a small positive score):**

| Signal | Threshold | Weight |
|---|---|---|
| Issue body lines | ≤ 30 | +2 |
| Issue body lines | ≤ 60 | +1 |
| Acceptance criteria checkboxes | ≤ 2 | +2 |
| Acceptance criteria checkboxes | ≤ 4 | +1 |
| Label matches `typo|docs|chore|comment|style` | yes | +3 |
| Label matches `good first issue` | yes | +2 |
| File path mentions in issue body | exactly 1 | +2 |
| File path mentions in issue body | 2-3 | +1 |
| Issue body contains a unified-diff block | yes | +2 |
| Issue body cites a single line/range (`file.ext:NN`) | yes | +2 |

**Anti-fast signals (any one is a hard veto, regardless of pro score):**

| Signal | Veto? |
|---|---|
| Label matches `architecture|breaking-change|security|refactor|design` | yes |
| Label matches `area:*` with ≥ 2 distinct areas referenced | yes |
| Issue body references `depends-on:#N` or `blocks:#N` | yes |
| Issue body line count ≥ 200 | yes |
| Acceptance criteria checkboxes ≥ 8 | yes |
| Issue body mentions ≥ 5 distinct file paths | yes |
| Body contains phrase pattern `should|need to|must` ≥ 5 times (proxy for "many requirements") | yes |

**Decision rule:**

```
if any anti-fast signal           → recommended_path = full, confidence = high
elif pro_score ≥ 6 and no anti    → recommended_path = fast, confidence = high
elif pro_score ≥ 4 and no anti    → recommended_path = fast, confidence = medium
else                              → recommended_path = full, confidence = high
```

The default is **full** when uncertain. This is the conservative posture
the asymmetric failure-mode analysis requires.

### Gate: visibility (the first trust property)

At startup, `kaola-workflow-claim.js startup` emits the decision and
signals in `STARTUP_OUT` JSON, and the router prints a one-line summary
the user sees in their terminal:

```text
Selected #245 — fast path (confidence: high, signals: label=typo, body_lines=12, files=1)
```

or

```text
Selected #245 — full path (anti-signals: label=architecture, body_lines=247)
```

A user who disagrees can intervene in the next turn — either by name
(`use full workflow`) or by reissuing the prompt. The decision is not
silent.

### Gate: user-prompt override (the second trust property)

The router (`commands/workflow-next.md` and the Codex twin) reads the
user's initial prompt for path intent **before** computing or honoring the
gate. Same NLU shape as #42's sink-intent capture.

**Full-path override phrases** (force `workflow_path: full`):

- "full workflow", "full effort", "full phases", "all phases"
- "thorough", "thoroughly", "carefully"
- "do the research", "investigate first"
- "design properly", "design carefully"
- "do it right", "properly"

**Fast-path override phrases** (force `workflow_path: fast`):

- "quick fix", "quick win"
- "fast path", "fast track"
- "just patch", "small change", "tiny"
- "no need for research", "skip phases"
- "one-liner", "trivial"

**Conflict rule (hard-coded, not agent judgment):**

| User said | Gate said | Result | Action |
|---|---|---|---|
| nothing | fast | fast | proceed |
| nothing | full | full | proceed |
| fast | fast | fast | proceed silently |
| full | full | full | proceed silently |
| fast | full | **fast** | print hard-coded warning |
| full | fast | **full** | proceed silently |

When user says fast but gate said full, the router prints **exactly this
text** before proceeding:

```text
WARNING: You requested fast path, but the issue shows anti-fast signals
({signal list}). Proceeding with fast path as requested. The mid-flight
escalation hatch is still active — if Phase 4-fast detects scope
overflow, it will switch to full path automatically.
```

The agent does not paraphrase. The agent does not "exercise judgment."
This is the lesson from #41 Gap 3 (phantom-advisor self-attribution) —
hard-code the warning so the artifact trail is auditable.

### Gate: mid-flight escalation (the third trust property)

`/kaola-workflow-fast` enforces three escalation triggers. Hitting any
one writes `escalated_to_full: <reason>` into `workflow-state.md`,
preserves the in-progress `fast-summary.md` as an artifact, and re-routes
to `/kaola-workflow-phase1` with the existing facts already gathered:

| Trigger | Threshold | Reason field |
|---|---|---|
| Files touched | > 3 distinct files | `scope_files` |
| Test runs | ≥ 3 consecutive failed runs | `test_thrash` |
| Subagent escalation | any subagent returns "needs more investigation" or "scope unclear" | `subagent_escalation` |
| Time / token budget | > 25% above the historical median for the gate's confidence tier (computed later; soft cap, warn only on first releases) | `budget_overflow` |

This is the same safety-net shape as #42's merge → PR auto-fallback. It
makes false-trivial recoverable rather than catastrophic.

### Artifact contract changes (the delete radius)

Files that **must** change atomically in the same PR:

1. **Add** `commands/kaola-workflow-fast.md` (the new internal phase
   command, modeled after `phase4.md`'s subagent-orchestration shape but
   compressed).
2. **Add** `plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md`
   (Codex twin).
3. **Modify** `commands/workflow-next.md`:
   - After startup, read `recommended_path` from `STARTUP_OUT`.
   - Read user prompt for path intent; apply conflict rule.
   - Write `workflow_path:` to `workflow-state.md` at claim time.
   - When `workflow_path: fast`, route to `/kaola-workflow-fast`
     instead of `/kaola-workflow-phase1`.
4. **Modify** `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
   (Codex parity for all three router changes above).
5. **Modify** `commands/kaola-workflow-phase6.md`:
   - Add a single conditional read: when `workflow_path: fast`, the
     Phase 5 prereq check reads `fast-summary.md` (with a `## Review`
     section status equivalent to `PASSED` / `PASSED WITH FOLLOW-UPS`)
     instead of `phase5-review.md`.
   - All other Phase 6 logic (sink dispatch, archive, GitHub close,
     roadmap refresh, commit) is unchanged.
6. **Modify** `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
   (Codex parity for the conditional read).
7. **Modify** `scripts/kaola-workflow-claim.js`:
   - Add `analyzeIssue(issue, config)` shared with #41 Gap 1.
   - Emit `recommended_path`, `path_signals`, `path_confidence` in
     `STARTUP_OUT` and the startup receipt.
   - Recognize `workflow_path:` and `escalated_to_full:` fields in
     `workflow-state.md`.
   - Print the one-line gate-decision summary to stderr at startup.
8. **Modify** `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
   (byte-identical mirror per the script-sync validator).
9. **Modify** `scripts/validate-workflow-contracts.js` and
   `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`:
   - Assert `commands/kaola-workflow-fast.md` exists and contains the
     three-section structure.
   - Assert the conditional read exists in Phase 6.
   - Assert the skill-count assertion in
     `validate-kaola-workflow-contracts.js` increments by 1.
10. **Modify** `scripts/simulate-workflow-walkthrough.js`:
    - Add a fast-path happy case: trivial issue → fast → finalize.
    - Add a user-override case: complex issue + "quick fix" prompt →
      warning emitted, fast path runs.
    - Add a mid-flight escalation case: fast starts, exceeds file count,
      escalates to Phase 1.
    - Add a conflict-rule case: trivial issue + "do thorough research"
      prompt → full path runs silently.
11. **Update** `README.md`:
    - One short section "Fast Path" with the signals table summary, the
      override phrases list, and the conflict rule.
12. **Update** `CHANGELOG.md` under `[Unreleased]`.

### Out of scope (explicitly)

- **Multi-stage fast path** ("fast-plus" that adds Phase 1 lite). The
  binary fast/full split is enough; gradations can come later.
- **User configuration of signal weights.** The thresholds are hard-coded
  in v1. Tunable thresholds are a follow-up issue.
- **Statistical replay calibration.** No historical corpus exists; this
  is the right thing to add later but is not a blocker. Trust comes from
  visibility + override + escalation in v1.
- **Cross-runtime escalation telemetry.** Escalation is logged to the
  artifact, not to a central counter. A metrics surface for "how often
  did fast escalate" can come later.
- **Auto-tuning the gate** from past decisions. Out of scope.

### Acceptance criteria

- [ ] A trivial issue (label `docs`, body ≤ 30 lines, 1 file mention) is
  selected and routed to `/kaola-workflow-fast`. Startup prints the
  gate-decision line. `fast-summary.md` is written. Phase 6 runs and
  finalizes from it.
- [ ] An issue with the `architecture` label is routed to
  `/kaola-workflow-phase1` regardless of body length.
- [ ] User prompt `"please use full workflow"` on a trivial issue forces
  full path, silently.
- [ ] User prompt `"quick fix"` on an issue with anti-signals forces
  fast path **and** prints the hard-coded warning verbatim.
- [ ] `/kaola-workflow-fast` touching a 4th file writes
  `escalated_to_full: scope_files` to `workflow-state.md` and the next
  router step routes to `/kaola-workflow-phase1` with the in-progress
  artifact preserved.
- [ ] `node scripts/simulate-workflow-walkthrough.js` exits 0 with all
  four new cases (happy, override-conflict, escalation, conflict-rule).
- [ ] Both contract validators pass.
- [ ] No in-flight full workflow is affected (default `workflow_path:
  full`; absence of field treated as full).
- [ ] README and CHANGELOG reflect the new path.
- [ ] `analyzeIssue` is reused by the #41 Gap 1 implementation; no
  duplicate label-scanning code path exists.

### Risks & mitigations

| Risk | Mitigation |
|---|---|
| Gate false-trivial: rates an "easy" bug fast, breaks because root cause was elsewhere | Conservative default (uncertain → full); anti-signal vetoes; mid-flight escalation hatch on file count and test thrash |
| Fast path skips review and ships a regression | Fast path still has a `## Review` section the agent must populate; for fixes touching production-path code (heuristic: any file outside `docs/`, `*.md`, `tests/`), require a delegated `code-reviewer` agent invocation, not self-review |
| User override surprises: user says "quick" expecting Phase 1 lite, gets fast-finalize | Hard-coded warning text on conflict; README lists the override phrases verbatim so muscle memory matches behavior |
| Codex / Claude parity drift | Atomic PR includes both runtimes; validators assert both skill and command files exist with the matching structure |
| Phase 6 conditional read introduces a hidden coupling | Validator asserts the conditional exists; `fast-summary.md` schema is fixed and walkthrough-tested |
| `analyzeIssue` becomes a god-function | Strict input/output contract; signals returned as data, not boolean fields; weights / thresholds defined in a single constant block at the top |
| User confuses "fast path" with "skip review" | README explicitly states fast path *includes* review (it just consolidates the artifact); CHANGELOG mirrors |

### Suggested labels for the issue

`enhancement`, `area:workflow-router`, `area:workflow-phases`,
`needs-design-review` (the gate signal weights need one pass from a
second reviewer before merge)

---

## Connection to other open issues

- **#41 Gap 1 (top-tier label discovery)** — shares `analyzeIssue`.
  Whichever issue lands first defines the function; the second extends
  it. Coordinate the order of landing in #41's Phase 1/2.
- **#42 (sink consolidation)** — same NLU intent-capture shape;
  `KAOLA_PATH=fast|full` env var is the wire (parallel to `KAOLA_SINK`).
  Reuse the pattern; do not invent a new wire.
- **#40 (worktree-native)** — orthogonal. Fast path works inside the
  same worktree contract; the only branch/worktree change is that fast
  workflows are short-lived and may produce a single commit instead of
  several. Cleanup logic in Phase 6 already handles single-commit cases.
- **#43 (`/workflow-init` invariance)** — confirmed: fast path adds a
  new internal phase command but does not change project-bootstrap
  responsibility. Init remains unchanged by this proposal.

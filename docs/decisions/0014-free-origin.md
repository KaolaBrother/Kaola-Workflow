# 14. Free origin: orchestrator-owned selection behind a typed commitment gate

Date: 2026-07-28
Status: Accepted
Issue: #825
Supersedes: ADR 0006 (planner-first entry, #287) — its *entry lock* only; the control
boundary it protects is retained and restated here.
Related: ADR 0003 (adaptive front-end planner), ADR 0012 (finalize seam is
orchestrator-owned), ADR 0013 (the Successor Test and the Two-Gate Target
Architecture — this decision's Gate 1 is re-examined against its R1 locus rule)

## Context

ADR 0006 answered a real defect: the orchestrator was prescribing the `## Nodes` table
before dispatching `workflow-planner`, which turned a designer into a transcriber. Its
remedy was to lock the whole *entry*: nothing may happen before the planner runs, and the
planner owns backlog survey, selection, claim, and authoring in one dispatch.

That remedy over-reached in one direction and under-reached in another.

**Over-reached.** Locking the entry made the origin phase one fixed ceremony regardless of
what the work needed. A one-line typo fix and a twelve-issue backlog sweep entered
identically, because the only legal shape was "dispatch the planner and let it decide."
Reconnaissance that would have cost one read-only agent could not run at all before the
claim, since the project folder — the only durable evidence home — does not exist until
the claim creates it. Findings that did get gathered lived in run context, the scarcest
resource in the run, and evaporated with it.

**Under-reached.** ADR 0006 recorded its own enforcement honestly:

> Enforcement is behavioral rather than runtime-scriptable, because no script receives
> the dispatch prompt — only the planner does.

Prose plus contract-token pins is what stood between a correct entry and a wrong one. A
run that ignored the prose was not refused; it simply proceeded.

## Decision

**Zero regulation on the route between commitment points; full regulation AT the points.**
Process rules are replaced by one script-enforced commitment gate.

1. **The origin phase is free (B1).** Before any claim the orchestrator may dispatch
   read-only agents, read whatever it needs, and ask the user. One invariant: findings land
   in DURABLE FILES, not context. The staging home is `kaola-workflow/.origin/<target-key>/`,
   where `<target-key>` is the project name the claim will resolve to. `claim.js startup`
   folds that subtree into `kaola-workflow/{project}/.cache/origin/` in the claim
   transaction and removes the staging directory. Absent staging is a clean no-op.

2. **Gate 1 is a script refusal (B2).** `startup` (and `pick-next`, which delegates to it)
   gains `--target-source <user_directed|orchestrator_selected>` and
   `--selection-record <path>`. An `orchestrator_selected` claim without a valid record
   refuses `selection_record_missing`; a present-but-unparseable record, or one whose six
   required fields are not all present and non-empty, refuses `selection_record_invalid`.
   Both refuse with ZERO side effects — resolved before any folder, branch, worktree, or
   forge call. The six fields are `selection_mode`, `selection_bundle`,
   `selection_priority_basis`, `selection_rejected`, `selection_disjointness`, and
   `clarifications`. Validation is fields-present-and-non-empty and nothing deeper: the
   fields carry the orchestrator's REASONING, and a script that graded reasoning would be
   re-deciding what an agent or a human already decided. On every acquiring claim the record
   is persisted at `.cache/origin/selection-record.json` and its sha256 is stamped into
   `workflow-state.md` as `selection_record_digest:`. An explicit-target claim supplies no
   record and startup writes the DEGENERATE one (`selection_mode: explicit-target`), so the
   durable field is never optional and never empty.

   The ranking rules — priority frontier, `### Project rules` guardrails, `lane_bucket`
   co-tenant handling, Bundle Selection Rules, the Frontier-Blocked fall-through — move
   VERBATIM from the planner profile to the orchestrator surfaces. One wording, re-homed,
   not paraphrased. The `backlog_empty` / `selection_indeterminate` verdicts survive; the
   orchestrator becomes their emitter.

3. **The planner narrows to a synthesist (B3).** No-target survey mode is retired from the
   profile. The planner receives the selection record plus reconnaissance evidence PATHS and
   keeps claim/startup execution, plan authorship, freeze via the handoff, and its
   `## Design` / `## Acceptance` obligations. It gains one obligation: **shape around cited
   evidence — do not author a node to re-derive it.** Two clauses bound that obligation so it
   cannot become the thing ADR 0006 existed to prevent:
   - **Consume evidence, never accept a conclusion.** Cited findings are inputs the planner
     may judge insufficient. A deeper, wider, or differently-angled read over the same
     surface is legitimate synthesis; re-running the same read for the same map is the
     forbidden redundancy. An orchestrator may cite what it FOUND, never dictate what the
     plan must CONCLUDE.
   - **Judgment-enforced, no new refusal code.** Node redundancy is not mechanically
     decidable. It ships as prose in the four planner profiles and is deliberately kept OUT
     of the validator. `test-plan-shape-audit.js` asserts the obligation's PRESENCE only.

4. **A typed clarification channel (B4).** `clarification_required` joins the escalate
   family: `{handoff_status: 'clarification_required', result: 'escalate', question,
   context_refs, round}`. It is legal pre-claim (nothing written) and post-claim/pre-freeze
   (claim held, plan unfrozen), so its builder and CLI touch no filesystem path at all. The
   orchestrator asks the user, appends the answer to the record's `clarifications`, and
   re-dispatches. Bounded at three round-trips (`CLARIFICATION_ROUND_CAP`), after which it
   degrades to `clarification_exhausted` / `stop_and_ask` — a fourth ask is a design failure,
   not a question. An empty question fails closed to the same posture.

## The one thing that does NOT move

**The control boundary is UNCHANGED and stays load-bearing.** Evidence and selection flow
IN; a pre-authored `## Nodes` table, an `AUTHOR EXACTLY`, or a `do not redesign` still
refuses `planner_control_boundary_violation`. This is the one place measured history
overrides the freedom principle: a synthesizer handed a conclusion stops synthesizing, and
#287 is the run that measured it. ADR 0006's diagnosis was right; only its remedy —
locking the entry rather than the prescription — is superseded.

## Consequences

**Net enforcement is STRONGER, not weaker.** ADR 0006 protected the entry with prose and
token pins. This ADR protects the commitment point with a script refusal that runs before
any mutation. What was previously "the orchestrator should not" is now "the claim will not."

- **Breaking (major).** `startup --target-source orchestrator_selected` without a valid
  `--selection-record` now refuses. A user-directed claim is unchanged in behavior, but
  every acquiring claim gains `.cache/origin/selection-record.json` and one new
  `selection_record_digest:` line in `workflow-state.md`.
- **Right-sized origin.** A trivial fix costs zero pre-claim dispatches; a backlog sweep
  fans out surveyors. The shape follows the work instead of a fixed ceremony.
- **Evidence survives the origin phase.** Reconnaissance lands in files under
  `.cache/origin/` and is readable by the planner and by every later node, instead of being
  paid for once in context and lost.
- **Identical enforcement per runtime.** Codex, opencode, and Kimi get the same script gate
  and the same prose. Freedom is sized for the weakest harness, never forked per runtime.
- **Acceptance stays human-gated.** Nothing here relaxes the acceptance surface.
- **A CLEAN selection claims autonomously.** Frontier honored and no ambiguity means no ask;
  only ambiguity or a policy conflict routes to the user.

## Non-goals

- No script intercepts the planner's dispatch prompt at runtime. There still is no such
  surface, and Gate 1 does not pretend to be one — it gates the CLAIM, not the brief.
- No validator refusal for node-level redundancy. It is not mechanically decidable and the
  attempt would re-import the prescription problem through the back door.
- The record's field CONTENTS are never graded. Present-and-non-empty is the whole check.

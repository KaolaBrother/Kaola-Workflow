# n2-adr-driver evidence
evidence-binding: n2-adr-driver 2f9da4def4ce

## Node
- Node: n2-adr-driver
- Role: doc-updater
- Issue: #420 — design(adaptive/auto): goal-driven automation
- Scope: Parts 1 (autopilot loop) + 3 (goal-conditioned bundles)

## Deliverable
- Authored `docs/decisions/D-420-01.md` — the ADR for Parts 1+3 of #420.
- Declared write set: `docs/decisions/D-420-01.md` (sole production file).

## Grounding read before writing
- `docs/investigations/2026-06-12-goal-driven-automation-design.md` — the runtime-grounded
  findings cited throughout (§0 summary, §1.1 pipeline stages, §1.2 scout contract,
  §1.3 claim mechanics, §1.4 Part 1 design notes, §1.5/§3.2/§3.3 Part 3 design notes,
  §5 open questions, §6 file/line reference index).
- `docs/decisions/D-419-01.md` — house style (# title, bold fields, ## Context / numbered
  [INV-N] decisions per part / ## Open Questions / ## Consequences); Parts 1+3 pattern.
- `docs/decisions/D-422-01.md` — secondary house-style reference.
- `agents/issue-scout.md` — read-only contract (model: sonnet line 4; hard boundaries
  lines 39-47; bundle rules lines 75-84; `confidence` field line 112; below-high → single
  line 118).
- `scripts/kaola-workflow-adaptive-node.js` — subcommands overview (lines 11-18);
  `runWriteHalt` (lines 1454-1551: valid reasons line 1457; halted node stays in_progress
  lines 1542-1543).

## Invariants defined (12 total across Parts 1+3)
Part 1 (autopilot loop), [INV-1]..[INV-6]:
- [INV-1] selection-aloud (#44): announce the selected issue before cmdStartup.
- [INV-2] confidence-threshold gate: only `confidence:"high"` proceeds; medium/low parks.
- [INV-3] typed stop conditions: goal_satisfied / backlog_empty / confidence_halt /
  error_halt / consent_halt — branched structurally (#406), never string-matched.
- [INV-4] never-silent: every exit (incl. success) emits a typed payload.
- [INV-5] orchestrator-level boundary: driver lives in main session; subagents cannot
  dispatch subagents (#242); an aggregator may compute but the orchestrator dispatches.
- [INV-6] repair-consent boundary: #44 covers selection not repair; repairs need explicit
  consent policy.

Part 3 (goal-conditioned bundles), [INV-7]..[INV-12]:
- [INV-7] goal-satisfied beats backlog-empty as the primary terminal.
- [INV-8] hash-coverage for free (computePlanHash hashes all of `## Meta`; no hash change).
- [INV-9] backwards compatibility: parseGoal READER not gate; old plans stay valid.
- [INV-10] `## Meta`-scoped read, decoy-immune (reuses #B1 label scoping).
- [INV-11] goal flows to scout (KAOLA_GOAL) → planner writes `goal:` into `## Meta`.
- [INV-12] goal is prose, agent-judged at the single sink seam (AC-vs-goal attestation).

## Open Questions recorded (5)
- OQ-1 autopilot home (aggregator vs. prose).
- OQ-2 repair-consent policy.
- OQ-3 goal form prose vs. structured (D-420-02 owns the call).
- OQ-4 digest persistence / crash-resume.
- OQ-5 multi-bundle goal evaluation.

## Constraint compliance
- Wrote ONLY the two files: `docs/decisions/D-420-01.md` and this evidence file.
- Did NOT write D-420-02, CHANGELOG, or any other file.
- Every claim grounded in the investigation doc or a real file/line.
- Followed D-419-01 house style; invariants numbered [INV-1]..[INV-12]; D-420-02 continues
  from [INV-13].

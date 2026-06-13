# Doc-Updater Findings — bundle-436-438

Date: 2026-06-13

## Checklist Verification

### README.md — no update needed
VERIFIED. Searched README.md for `max_concurrent`, `#436`, `#438`, `D-419`, `coordination kernel`. None
of these appear in README.md. The parallelism section already describes the running-set scheduler
(#377) and the #419 design references. No user-facing feature, install, or env var changed in this
bundle. Status: CORRECT — no update needed.

### docs/api.md — no update needed (with caveat)
VERIFIED. docs/api.md does not contain a `running-set.json` schema block. The api.md references
`running-set.json` only in the mutual-exclusion reason-code section (lines 239-243), describing
`scheduler_active` and `closed_member_dropped` error codes — no schema to update. The `max_concurrent`
field is an internal manifest field, not an exported API contract. Status: CORRECT — no update needed.

The `running-set.json` schema lives in `docs/workflow-state-contract.md` (the `.cache/` inventory),
not in api.md. See GAP below.

### CHANGELOG.md — entries complete and correct
VERIFIED. Both #436 and #438 entries are present under `[Unreleased] ### Added`:

- #436 entry: describes `max_concurrent` field, `min(cap, --max || cap)` open-time logic, absence-implies-1
  semantics, `runReconcileRunningSet` ceiling cap, empty-set fallback field survival, three new test
  assertions (D419-INV2, D419-INV7, D419-CLOSE-FIELDSURVIVAL), and "×4 editions". Correctly scoped.

- #438 entry: explicitly states "3 Claude commands + 3 Codex SKILL packs — the #400 x6 surface contract"
  and lists all six surfaces updated. States "×6" not "×4". Status: CORRECT.

### docs/architecture.md — coordination kernel subsection present
VERIFIED. Lines 194-233 of docs/architecture.md contain the "Coordination kernel — serial = running-set
`max_concurrent = 1` (D-419-01 Part 1)" subsection, including:
- The full `running-set.json` schema: `{ state: 'opening'|'open', max_concurrent?: number, nodes: [...], updatedAt }`
- Absence-implies-1 semantics
- [INV-2] byte-identity invariant
- [INV-3] persisted-value-is-witness semantics
- Three-armed guard refusal taxonomy note
- Canonical spec cross-reference to `docs/decisions/D-419-01.md`

Status: CORRECT and complete.

### .env.example — no update needed
VERIFIED. `max_concurrent` is set at runtime (not via env var). `KAOLA_LANE_CONTAINMENT` is a
pre-existing env var. No new environment variables introduced. Status: CORRECT — no update needed.

### Inline comments / scripts
Noted in task as already updated by n1. The checklist item was assessed as complete by the
implementation node. Not re-verified here (barrier is the enforcement path).

### Plan-run ×6 surfaces — VERIFIED PRESENT
All six surfaces confirmed to contain "Scheduler-default posture (D-419 P3)" and "Planner rubric (D-419 P3)":
- commands/kaola-workflow-plan-run.md — confirmed (grep hit lines 216-242)
- plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md — confirmed (grep hit)
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md — confirmed (grep hit)
- plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md — confirmed (grep hit)
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md — confirmed (grep hit)
- plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md — confirmed (grep hit)

### Planner rubric ×4 agent profiles — VERIFIED PRESENT
- agents/workflow-planner.md — confirmed: D-419-01 scheduler-default posture paragraph present (line ~180)
- plugins/kaola-workflow/agents/workflow-planner.toml — confirmed: D-419-01 SCHEDULER-DEFAULT POSTURE paragraph present
- plugins/kaola-workflow-gitlab/agents/workflow-planner.toml — confirmed (grep hit)
- plugins/kaola-workflow-gitea/agents/workflow-planner.toml — confirmed (grep hit)

---

## GAP FOUND AND FIXED

### docs/workflow-state-contract.md — running-set.json schema was stale

BEFORE (pre-fix, lines 46-49):
```
  - `running-set.json` — tracks which nodes are currently in the running set
    (state: `'opening'|'open'`; members list with per-node `id`, `role`, `kind`,
    `baseline`, optional `opening` marker and `openedAt`). Prevents double-open;
    a crashed `opening` state routes to `reconcile-running-set`.
```

The pre-#436 schema description omitted the `max_concurrent?: number` top-level field added by #436.
The `architecture.md` section (lines 214-225) was correctly updated by n2, but the `.cache/` artifact
inventory in `workflow-state-contract.md` was not updated to match.

FIX APPLIED: Updated `docs/workflow-state-contract.md` to include the full schema shape
`{ state: 'opening'|'open', max_concurrent?: number, nodes: [...], updatedAt }` and
the absence-implies-1 semantics for the field.

File updated: /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-436-438/docs/workflow-state-contract.md

---

## Summary

| Item | Status |
|------|--------|
| README.md | CORRECT — no update needed |
| docs/api.md | CORRECT — no update needed (no running-set.json schema there) |
| CHANGELOG.md #436 | CORRECT — complete, properly scoped |
| CHANGELOG.md #438 | CORRECT — says ×6 surfaces, all six listed |
| docs/architecture.md | CORRECT — coordination kernel subsection present with full schema |
| .env.example | CORRECT — no new env vars |
| Plan-run ×6 surfaces | CORRECT — all six contain scheduler-default posture + planner rubric blocks |
| Planner rubric ×4 agents | CORRECT — all four agent profiles contain the D-419-01 rubric paragraph |
| docs/workflow-state-contract.md | GAP — fixed: added max_concurrent? to running-set.json schema |

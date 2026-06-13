# Card: Plan Freeze / Governance-Ack Handshake

**When to read:** The plan-run or the planner raises `plan_not_frozen`,
`governance_ack_stale`, or otherwise requires the two-step freeze / governance-ack handshake
before work can begin.

**Related:** D-445-01 (skeleton/card split), D-440-01 (structured `triage` + `proposed_repair`
halt payload)

---

## 1. Why a two-step handshake?

The adaptive handoff (`kaola-workflow-adaptive-handoff.js`) separates plan validation from plan
mutation so a human operator (or the planner agent) can review the governance payload BEFORE the
plan is written. The two steps are:

| Step | Flag | Effect |
|---|---|---|
| SPAWN 1 | `--freeze-checked --json` | Validates the plan; returns the governance payload WITHOUT writing |
| SPAWN 2 | `--freeze --governance-ack <hash> --json` | Re-validates; asserts hash unchanged; writes atomically |

The `plan_hash` in SPAWN 2 must match the hash returned by SPAWN 1. If the plan is modified
between the two spawns, SPAWN 2 refuses with `governance_ack_stale`.

---

## 2. Running SPAWN 1 — validate without writing

```bash
node scripts/kaola-workflow-adaptive-handoff.js \
  --freeze-checked \
  --json \
  --plan kaola-workflow/{project}/workflow-plan.md
```

Read the output:

- `result: ready_to_run` — plan is in-grammar and governance-clean; proceed to SPAWN 2.
- `result: plan_invalid` — plan has structural errors; fix the plan and re-run SPAWN 1.
  The `operator_hint` field names the exact issue to fix.

Capture the `plan_hash` from the SPAWN 1 output. You will pass it to SPAWN 2.

---

## 3. Reviewing the governance payload

SPAWN 1 returns a governance payload alongside `result`. Review it before proceeding:

- **`risk_assessment`** — lists any sensitive labels (e.g., `security-sensitive`,
  `data-migration`) detected in the plan.
- **`write_role_fan_out`** — the count of write-role nodes. A high fan-out with overlapping
  write sets is a risk signal.
- **`decision`** — either `"ask"` or `"auto-run"`. This is AUDIT METADATA only — both values
  allow the plan to proceed. `decision: ask` does NOT block the freeze; it is a record that the
  planner surfaced the plan for human review.

If the governance payload flags concerns, fix the plan before SPAWN 2 (which will re-validate).

---

## 4. Running SPAWN 2 — freeze and write

```bash
node scripts/kaola-workflow-adaptive-handoff.js \
  --freeze \
  --governance-ack <plan_hash_from_spawn1> \
  --json \
  --plan kaola-workflow/{project}/workflow-plan.md
```

SPAWN 2 outcomes:

| `result` | Meaning |
|---|---|
| `ready_to_run` | Plan frozen successfully; plan-run can begin |
| `governance_ack_stale` | Plan changed after SPAWN 1; re-run SPAWN 1 and repeat |
| `plan_invalid` | Plan is still invalid; fix and re-run from SPAWN 1 |

On `ready_to_run`, SPAWN 2 also folds in `--resume-check` output so you can confirm the frozen
plan's hash is consistent before entering the run loop.

---

## 5. `governance_ack_stale` — plan tampered between spawns

`governance_ack_stale` means the `plan_hash` passed to SPAWN 2 does not match the hash of the
plan on disk. This happens when the plan file is modified between SPAWN 1 and SPAWN 2.

Recovery:
1. Do NOT re-use the stale hash.
2. Re-run SPAWN 1 to get a fresh governance payload and a fresh hash.
3. Review the new payload.
4. Run SPAWN 2 with the new hash.

---

## 6. `decision: ask` vs `decision: auto-run`

Both values are metadata recorded in the governance payload. Neither is a gate that blocks the
freeze or the plan-run. The planner uses `decision: ask` to signal that the plan surfaced for
human review before proceeding; `decision: auto-run` signals the planner determined the plan was
safe to proceed without explicit review. In both cases, SPAWN 2 runs the same validation and
writes the same frozen plan.

Do not treat `decision: ask` as a hard stop. If the operator or planner has reviewed the payload
and is satisfied, proceed to SPAWN 2.

---

## 7. Risk assessment — sensitive labels and write-role fan-out

The governance payload's `risk_assessment` section flags two signal categories:

**Sensitive labels** — nodes tagged `security-sensitive`, `data-migration`, `schema-change`, or
similar. A plan with sensitive-label nodes should have a security-reviewer gate immediately
before the sensitive node. If the `risk_assessment` flags a sensitive node with no reviewer
gate, add one via plan-repair (`--freeze` re-stamps the hash) before proceeding.

**Write-role fan-out** — a high count of write-role nodes in a single frontier. The governance
payload reports the count; values above the fan-out cap (`FANOUT_CAP` in
`kaola-workflow-adaptive-schema.js`) are invalid (SPAWN 1 will return `plan_invalid` with
`reason: fan_out_cap_exceeded`). Reduce the frontier width before re-running SPAWN 1.

---

## Quick reference

```
plan_not_frozen
  |
  +-> SPAWN 1 (--freeze-checked --json) -> review payload + capture plan_hash
        |
        +-- plan_invalid -----> fix plan -> repeat SPAWN 1
        |
        +-- ready_to_run ----> SPAWN 2 (--freeze --governance-ack <hash> --json)
              |
              +-- governance_ack_stale -> plan changed: repeat from SPAWN 1
              |
              +-- plan_invalid ---------> fix plan -> repeat from SPAWN 1
              |
              +-- ready_to_run ---------> plan frozen; re-enter plan-run loop
```

# Node: impl-planner-profile — Evidence

## TDD / Test Cycle Status

n/a: RED/GREEN — prose/contract edit, no test cycle; verification = 3 .toml byte-identical + boundary-text presence + validators green.

This node edits only `agents/workflow-planner.md` and the 3 `.toml` mirrors. There is no executable code path introduced; the changes are agent-profile contract text. No failing test was applicable.

---

## Files Edited

- `agents/workflow-planner.md` — applied blueprint C.1 (a–h) in full
- `plugins/kaola-workflow/agents/workflow-planner.toml` — applied blueprint C.2; edited then `cp` to siblings
- `plugins/kaola-workflow-gitlab/agents/workflow-planner.toml` — byte-identical copy of codex .toml
- `plugins/kaola-workflow-gitea/agents/workflow-planner.toml` — byte-identical copy of codex .toml

---

## Byte-Identity Verification

```
diff plugins/kaola-workflow/agents/workflow-planner.toml plugins/kaola-workflow-gitlab/agents/workflow-planner.toml
# (empty — exit 0)

diff plugins/kaola-workflow/agents/workflow-planner.toml plugins/kaola-workflow-gitea/agents/workflow-planner.toml
# (empty — exit 0)
```

Both diffs produced no output. Exit codes: 0, 0. Byte-identical confirmed.

---

## Forge-Neutral Check

```
grep -nE "adaptive-handoff\.js|gitlab|gitea|github" plugins/kaola-workflow/agents/workflow-planner.toml
# (no output)
```

No forge-specific script name in the codex .toml. Reference reads "the adaptive-handoff script" throughout.

---

## Boundary Text Presence (grep confirmations)

### New boundary present in agents/workflow-planner.md:

```
grep -nE "plan_hash|freezes mechanically|decision:ask|repair" agents/workflow-planner.md
```

Matches confirmed on lines: 3 (frontmatter desc), 40-41 (bullet — "freezes mechanically"), 66 (cardinality note), 94/96/97/98 (overwrite-guard carve-out), 124, 173 (repair loop refs).

```
grep -nE "plan_hash|freezes mechanically|decision:ask|repair" plugins/kaola-workflow/agents/workflow-planner.toml
```

Matches confirmed on lines: 10 (boundary — "Freeze is mechanical"), 16 (overwrite-guard + repair), 20 (repair loop).

### Old absolute prohibition "never freeze" is gone:

```
grep -n "never freeze" agents/workflow-planner.md plugins/kaola-workflow/agents/workflow-planner.toml
# (no output)
```

Completely absent from both files. Reframed: heading changed from "never dispatch, never judge, never freeze (issue #44)" to "never dispatch, never judge risk; freeze is mechanical (issue #44, #255)"; bullet changed from "You never freeze the plan..." to "You run the handoff, which freezes mechanically..."

---

## Validator Results (post-edit)

| Script | Baseline | Post-edit | Status |
|---|---|---|---|
| `validate-vendored-agents.js` | exit 0 | exit 0 | PASS |
| `validate-script-sync.js` | exit 0 | exit 0 | PASS |
| `test-adaptive-handoff.js` | exit 0 (45 assertions) | exit 0 (45 assertions) | PASS |

No regressions introduced.

---

## Key Boundary Phrasing (exact new text)

Frontmatter (agents/workflow-planner.md line 3, excerpt):
> "...runs the plan-validator --json for a self-check, then RUNS the adaptive-handoff script (freezes mechanically on result:in-grammar) and RETURNS its checklist-backed handoff packet. Never JUDGES risk and never asks the user — decision:ask is recorded audit metadata, not a gate."

Heading (.md line 33):
> "## Hard boundary — never dispatch, never judge risk; freeze is mechanical (issue #44, #255)"

Freeze bullet (.md lines 40-43):
> "You run the handoff, which freezes mechanically. After self-check is in-grammar, you RUN `<adaptive-handoff.js>` (Method step 4). It stamps `plan_hash` (`--freeze`) only because the validator returned `result:in-grammar` — mechanical transition, not judgment. You don't decide to freeze; the script does it on in-grammar."

.toml boundary block (line 10):
> "Freeze is mechanical: after self-check is in-grammar you RUN the adaptive-handoff script, which stamps plan_hash (--freeze) BECAUSE validator returned result:in-grammar. You don't decide to freeze; the script does it on in-grammar."

---

## Deviation Note (resolved)

Initially the "Durable return contract (two modes)" subsection was left unmodified as out-of-scope for C.1(a-h). On review it was confirmed that `agents/workflow-planner.md` is in this node's declared write set and NO later node owns that file, so the stale prose had to be corrected here, not deferred.

### Correction applied

The subsection was rewritten and renamed `## Durable return contract (three modes)` to match the handoff-packet flow and stay consistent with the Output contract (C.1.h):
- Removed the stale "orchestrator re-reads those files and re-runs the validator on the durable plan for governance" sentence (pre-handoff governance step is gone).
- Success mode = `handoff_status: ready_to_dispatch_first_node` (plan frozen, node1 opened+baselined, Planning Evidence durable) → orchestrator reads packet checklist + first_node and dispatches first_node.role directly, even on `decision:ask`.
- Handoff refuse mode = validator `result:refuse`, plan never froze, nothing written → `{handoff_status:'plan_invalid', result:'refuse', errors, validator_verdict}` verbatim → orchestrator drives bounded repair loop.
- Claim refusal mode (unchanged in substance) = no `workflow-state.md`, never reached handoff → `{claim_verdict, claim_reasoning}` verbatim.

### .toml mirrors

The 3 `.toml` mirrors had NO analogous "re-reads / re-runs the validator for governance" prose (grep returned nothing), so they were left as-is. Byte-identity re-confirmed below.

### Re-verification (post-correction)

```
grep -niE "re-runs the validator on the durable plan for governance|re-reads.*re-runs the validator|for governance" agents/workflow-planner.md
# (no match — exit 1; stale phrasing gone)

diff plugins/kaola-workflow/agents/workflow-planner.toml plugins/kaola-workflow-gitlab/agents/workflow-planner.toml   # empty, exit 0
diff plugins/kaola-workflow/agents/workflow-planner.toml plugins/kaola-workflow-gitea/agents/workflow-planner.toml    # empty, exit 0
```

| Script | Exit Code |
|---|---|
| `validate-vendored-agents.js` | 0 |
| `validate-script-sync.js` | 0 |
| `test-adaptive-handoff.js` | 0 |

No regressions. Durable-return-contract subsection now corrected and consistent with the Output contract.

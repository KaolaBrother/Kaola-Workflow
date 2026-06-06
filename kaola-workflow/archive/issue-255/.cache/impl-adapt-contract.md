# Node: impl-adapt-contract — evidence

## TDD status

n/a: RED/GREEN — prose/contract edit, no test cycle; verification = old vocab gone + new vocab present (4 editions) + forge tokens correct + validate-workflow-contracts green

## Files edited

1. `commands/kaola-workflow-adapt.md` (GitHub/Claude reference edition)
2. `plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md` (Codex condensed)
3. `plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md` (GitLab forge)
4. `plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md` (Gitea forge)

No other files were touched.

## Edits applied per blueprint D

### D.1a — re-entry pointer (all 4)
Replaced "go straight to **Govern + freeze**" with: "re-run the planner+handoff on it (the planner MAY overwrite an unfrozen invalid plan; never a frozen one), passing prior validator errors. Do NOT route to a separate freeze step — the handoff freezes mechanically."

### D.1b — dispatch prompt tail (all 4)
Replaced old step (4) validator-self-check-only tail with new steps (4)+(5): self-check until in-grammar; then run the forge-appropriate adaptive-handoff.js and RETURN its packet.

### D.1c — section replacement (all 4)
Replaced entire `## Govern + freeze` section (with its two contractor Agent() dispatch blocks, classify + freeze+checkpoint) with new `## Read the handoff packet` section containing the ready_to_dispatch_first_node and plan_invalid routing.

### D.1d — planner boundary one-liner (all 4)
Replaced "it never freezes, judges risk, asks the user, or dispatches" with "it never JUDGES risk or asks the user (decision:ask is recorded metadata); it RUNS the handoff, which freezes mechanically, and returns the packet; it never dispatches."

### SKILL.md additional edits (D.2)
- Re-entry pointer: replaced "go straight to **Govern + freeze**" with re-run planner+handoff text
- Inline "Govern + freeze" section replaced with condensed "Read the handoff packet" prose (no Agent() blocks, bare script names)
- Planner dispatch description updated to include the handoff run step

## Grep confirmations

### Old vocab gone (empty = pass)

```
grep -rno "Govern + freeze|freeze + checkpoint" commands/kaola-workflow-adapt.md plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md
(no output — all 4 files clean)
```

### New vocab present (all 4 files confirmed)

```
grep -rno "Read the handoff packet|ready_to_dispatch_first_node|plan_invalid|repair" <4 files>
plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md:200:plan_invalid
plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md:222:Read the handoff packet
plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md:226:ready_to_dispatch_first_node
plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md:228:plan_invalid
plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md:228:repair
commands/kaola-workflow-adapt.md:202:plan_invalid
commands/kaola-workflow-adapt.md:224:Read the handoff packet
commands/kaola-workflow-adapt.md:228:ready_to_dispatch_first_node
commands/kaola-workflow-adapt.md:230:plan_invalid
commands/kaola-workflow-adapt.md:230:repair
plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md:139:Read the handoff packet
plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md:141:ready_to_dispatch_first_node
plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md:143:plan_invalid
plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md:143:repair
plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md:200:plan_invalid
plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md:222:Read the handoff packet
plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md:226:ready_to_dispatch_first_node
plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md:228:plan_invalid
plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md:228:repair
```

### Forge token correctness

```
grep -no "kaola-gitlab-workflow-adaptive-handoff|kaola-gitea-workflow-adaptive-handoff|kaola-workflow-adaptive-handoff" <4 files>
SKILL.md:128: kaola-workflow-adaptive-handoff     (bare — correct for Codex base plugin)
SKILL.md:139: kaola-workflow-adaptive-handoff     (bare — correct for Codex base plugin)
gitlab/adapt.md:200: kaola-gitlab-workflow-adaptive-handoff  (forge-prefixed — correct)
gitlab/adapt.md:224: kaola-gitlab-workflow-adaptive-handoff  (forge-prefixed — correct)
gitea/adapt.md:200:  kaola-gitea-workflow-adaptive-handoff   (forge-prefixed — correct)
gitea/adapt.md:224:  kaola-gitea-workflow-adaptive-handoff   (forge-prefixed — correct)
commands/adapt.md:202: kaola-workflow-adaptive-handoff       (bare — correct for GitHub edition)
commands/adapt.md:226: kaola-workflow-adaptive-handoff       (bare — correct for GitHub edition)
```

## Validator exit codes

- `node scripts/test-adaptive-handoff.js` → exit 0 ("adaptive-handoff tests passed (45 assertions)")
- `node scripts/validate-workflow-contracts.js` → **exit 1** (BLOCKER — see below)

## BLOCKER: validate-workflow-contracts.js exit 1

```
Error: commands/kaola-workflow-adapt.md must not include: handoff
  at assertNotIncludes (validate-workflow-contracts.js:26:3)
  at Object.<anonymous> (validate-workflow-contracts.js:133:32)
```

**Root cause:** `scripts/validate-workflow-contracts.js` line 103 adds `'hand' + 'off'` (= "handoff") to the `retired` token array, which is asserted absent from all `phaseCommands` including `commands/kaola-workflow-adapt.md`. Blueprint D requires `kaola-workflow-adaptive-handoff.js` and "handoff packet" text in that file. These are irreconcilable without modifying the validator.

**`validate-workflow-contracts.js` is outside the impl-adapt-contract declared write set.** No node in the #255 plan lists it. Editing it without orchestrator authorization would be an out-of-lane mutation (trips whole-plan barrier-check on commit).

**Required fix (orchestrator decision):** Drop `'hand' + 'off'` from line 103 of `retired` in `scripts/validate-workflow-contracts.js`. Line 102 (`can-handoff`) is unrelated and can stay. The old session-lease "handoff" concept is fully retired; any "handoff" in-tree now refers to the new adaptive script concept introduced by #255.

This fix needs an owning node or a write-set amendment authorized by the orchestrator. The 4-file prose deliverable is complete and correct; only this out-of-lane validator update remains.

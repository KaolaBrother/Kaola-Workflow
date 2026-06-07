# Node: planner-profile — Evidence Record

## task
Add the "Author EFFICIENT DAGs" authoring guidance to the workflow-planner agent profile across all 4 editions (root markdown + 3 forge TOML files), satisfying the last unsatisfied contract assertion so `simulate-workflow-walkthrough.js` returns exit 0.

## non_tdd_reason
**Scaffolding / boilerplate** — prose instruction added to agent-profile markdown and three TOML agent definitions; no behavioral code changed, no natural failing unit test exists for agent-profile text content. Verified by the text-presence contract assertions (`EFFICIENT DAGs`) and the walkthrough suite going green.

## write_set
- `agents/workflow-planner.md`
- `plugins/kaola-workflow/agents/workflow-planner.toml`
- `plugins/kaola-workflow-gitlab/agents/workflow-planner.toml`
- `plugins/kaola-workflow-gitea/agents/workflow-planner.toml`

## verification_commands

### grep presence check
```
grep -c "EFFICIENT DAGs" agents/workflow-planner.md plugins/kaola-workflow/agents/workflow-planner.toml plugins/kaola-workflow-gitlab/agents/workflow-planner.toml plugins/kaola-workflow-gitea/agents/workflow-planner.toml
```
Output:
```
agents/workflow-planner.md:1
plugins/kaola-workflow-gitea/agents/workflow-planner.toml:1
plugins/kaola-workflow-gitlab/agents/workflow-planner.toml:1
plugins/kaola-workflow/agents/workflow-planner.toml:1
exit=0
```

### TOML readability check
```
node -e "const fs=require('fs');for(const f of ['plugins/kaola-workflow/agents/workflow-planner.toml','plugins/kaola-workflow-gitlab/agents/workflow-planner.toml','plugins/kaola-workflow-gitea/agents/workflow-planner.toml']){fs.readFileSync(f,'utf8');} console.log('read-ok')"
```
Output: `read-ok` (exit=0)

### Walkthrough suite
```
node scripts/simulate-workflow-walkthrough.js; echo "exit=$?"
```
Output: `Workflow walkthrough simulation passed` (exit=0)

### Contracts validator
```
KAOLA_WORKFLOW_OFFLINE=1 node scripts/validate-workflow-contracts.js; echo "exit=$?"
```
Output: `Workflow contract validation passed` (exit=0)

## before_result
Baseline: `simulate-workflow-walkthrough.js` exit=1  
Failure: `Error: agents/workflow-planner.md must include: EFFICIENT DAGs`  
(contract assertion for `EFFICIENT DAGs` string was unsatisfied)

## after_result
build-green  
All 4 files contain `EFFICIENT DAGs` (1 occurrence each).  
`simulate-workflow-walkthrough.js` exit=0 — "Workflow walkthrough simulation passed".  
`validate-workflow-contracts.js` exit=0 — "Workflow contract validation passed".

## summary
1. Added the canonical "Author EFFICIENT DAGs, not merely valid DAGs." instruction to `agents/workflow-planner.md` in the "The grammar you must author within" section, before the "Capture the frozen issue labels" paragraph.
2. Added the same instruction to all 3 Codex TOML editions (kaola-workflow, kaola-workflow-gitlab, kaola-workflow-gitea), within step 2's grammar guidance, after the caps line.
3. All presence assertions are satisfied; the walkthrough and contracts validator both exit 0.

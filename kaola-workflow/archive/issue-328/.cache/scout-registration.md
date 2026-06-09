# scout-registration evidence — issue #328

## task
Register the `issue-scout` agent (authored by the prior scout-role node) in install.sh and the four
byte-identical `kaola-workflow-resolve-agent-model.js` copies.

## non_tdd_reason
wiring/registration — installer arrays + model-resolver map entries, no behavioral unit. These are
additive entries to an existing role-registry array (REQUIRED_AGENTS), a case alternation
(default_agent_model), and a model-lookup map (DEFAULT_AGENT_MODELS). No business logic is
introduced; all loops and dispatch already exist. Category: **Glue / wiring**.

## write_set
1. `install.sh` — L40 REQUIRED_AGENTS: `"issue-scout"` appended (13→14 entries); L429 default_agent_model() sonnet alternation: `|issue-scout` appended. No other lines touched (`model_for_placeholder()` and `render_command_file` placeholders array left unchanged — adversarial-verifier pattern confirmed).
2. `scripts/kaola-workflow-resolve-agent-model.js` — `'issue-scout': 'sonnet'` added after `'adversarial-verifier': 'sonnet'` in DEFAULT_AGENT_MODELS.
3. `plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js` — cp of root (byte-identical).
4. `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js` — cp of root (byte-identical).
5. `plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js` — cp of root (byte-identical).

## verification_commands

### 1. resolve-agent-model — issue-scout → sonnet
```
node scripts/kaola-workflow-resolve-agent-model.js issue-scout
```
Output: `sonnet`
EXIT: 0

### 2. validate-script-sync — byte-identical group stays in sync
```
node scripts/validate-script-sync.js
```
Output: `OK: 18 common scripts and 7 byte-identical file group in sync.`
EXIT: 0

### 3. simulate-workflow-walkthrough — full suite green
```
node scripts/simulate-workflow-walkthrough.js
```
Output (tail): `Workflow walkthrough simulation passed`
EXIT: 0

### 4. bash -n install.sh — no syntax error
```
bash -n install.sh
```
EXIT: 0

### 4b. grep issue-scout in install.sh (confirms both locations)
```
grep "issue-scout" install.sh
```
Output:
```
REQUIRED_AGENTS=("code-explorer" "knowledge-lookup" "planner" "code-architect" "tdd-guide" "implementer" "build-error-resolver" "code-reviewer" "security-reviewer" "doc-updater" "adversarial-verifier" "contractor" "workflow-planner" "issue-scout")
    code-explorer|knowledge-lookup|code-architect|tdd-guide|implementer|build-error-resolver|code-reviewer|security-reviewer|adversarial-verifier|contractor|issue-scout)
```

### 5. 4-way byte-diff on resolve-agent-model.js
```
diff scripts/kaola-workflow-resolve-agent-model.js plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js
diff scripts/kaola-workflow-resolve-agent-model.js plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js
diff scripts/kaola-workflow-resolve-agent-model.js plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js
```
Output: (no output — all 4 copies byte-identical after edit)

## build-green

All checks passed:

| check | command | exit | note |
|-------|---------|------|------|
| resolve-agent-model | `node scripts/kaola-workflow-resolve-agent-model.js issue-scout` | 0 | prints `sonnet` |
| validate-script-sync | `node scripts/validate-script-sync.js` | 0 | "OK: 18 common scripts and 7 byte-identical file group in sync." |
| simulate-walkthrough | `node scripts/simulate-workflow-walkthrough.js` | 0 | "Workflow walkthrough simulation passed" |
| bash -n install.sh | `bash -n install.sh` | 0 | no syntax errors |
| grep issue-scout | `grep "issue-scout" install.sh` | 0 | appears in REQUIRED_AGENTS and default_agent_model alternation |
| 4-way byte-diff | `diff` across all 4 copies | 0 | no output — byte-identical |

## before_result
- validate-script-sync: EXIT 0, "OK: 18 common scripts and 7 byte-identical file group in sync."
- simulate-workflow-walkthrough: EXIT 0, "Workflow walkthrough simulation passed"
- bash -n install.sh: EXIT 0
- 4-way diff: no output (all 4 copies byte-identical at baseline)

## after_result
- validate-script-sync: EXIT 0, "OK: 18 common scripts and 7 byte-identical file group in sync."
- simulate-workflow-walkthrough: EXIT 0, "Workflow walkthrough simulation passed"
- bash -n install.sh: EXIT 0
- resolve-agent-model issue-scout: "sonnet", EXIT 0
- 4-way diff: no output (all 4 copies byte-identical after edit)
- grep issue-scout in install.sh: 2 lines — REQUIRED_AGENTS and default_agent_model case

## notes
- `model_for_placeholder()` and `render_command_file` placeholders array in install.sh were NOT touched (confirmed adversarial-verifier is absent from both; issue-scout mirrors that pattern).
- Count-assertion bumps in gitlab/gitea validators remain at 13 — those are the contracts-registration node's job.
- `agents/issue-scout.md` confirmed present (prior scout-role node artifact).

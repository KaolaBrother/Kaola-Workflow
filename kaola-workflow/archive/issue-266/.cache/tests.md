# tests — AC-7 evidence for issue #266

Node: `tests` (tdd-guide)
Date: 2026-06-07

## Files modified (declared write set)

- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

The two thin walkthroughs (`simulate-gitlab-codex-workflow-walkthrough.js`,
`simulate-gitea-codex-workflow-walkthrough.js`) delegate to the test files via their
existing `run('test-{forge}-workflow-scripts.js')` pattern — no edit needed; they
exercise the new cases transitively.

## Case mapping

| Case | Description | Where |
|------|-------------|--------|
| 1 | stale `.codex/config.toml` (block missing role) | all 3 files |
| 2 | missing role `.toml` profile | all 3 files |
| 3 | task-mirror regeneration (schema, mappings, determinism, stale-hash) | all 3 files |
| 4 | compact/resume deterministic packet (7 sections, ordering, fields) | all 3 files |
| 5 | no-silent-inline-fallback (preflight refuses; no `subagent-invoked`/`local-fallback`) | all 3 files |

## RED → GREEN per case

### Case 1: stale `.codex/config.toml`

RED (wrong fixture): Replace `[agents.workflow-planner]` inside the managed block
with `[agents.STALE-workflow-planner]`. Run preflight `--no-autofix --json`.
→ exit 1, `status:config_stale`, `missing_roles:["workflow-planner"]`

GREEN (correct fixture): Fresh install via `install-codex-agent-profiles.js`.
Run preflight `--no-autofix --json`.
→ exit 0, `status:ok`

RED discriminator baked in: the fresh-fixture GREEN assertion fires FIRST in the test
function — if it were vacuous (wrong-input also returns ok) it would fail.

Autofix path: stale fixture + run without `--no-autofix` → installer repairs block →
re-verify → exit 0, `status:ok`, `autofixed:true`.

### Case 2: missing role profiles

RED (wrong fixture): Delete `workflow-planner.toml` from
`.codex/agents/kaola-workflow/`. Run preflight `--no-autofix --json`.
→ exit 1, `status:profiles_missing`, `missing_roles:["workflow-planner"]`

GREEN (correct fixture): Restore the `.toml` file. Run preflight `--no-autofix --json`.
→ exit 0, `status:ok`

RED discriminator baked in: case 2 GREEN assertion follows the restore to confirm
the refusal was not vacuous.

### Case 3: task-mirror regeneration

RED (wrong fixture — unfrozen plan): Provide a plan without the `<!-- plan_hash: ... -->`
marker. Run `kaola-workflow-task-mirror.js --project ... --now ... --json`.
→ exit non-zero, `plan_not_frozen` written to stderr

GREEN (frozen plan): Plan with valid `plan_hash` hex + `## Nodes` + `## Node Ledger`.
→ exit 0, correct JSON with `source_plan_hash`, 4 tasks, `last_synced_from_ledger`

Ledger→status mappings verified (all 4):
- `complete` → `status:completed`, `ledger_status:"complete"`
- `in_progress` → `status:in_progress`, `ledger_status:"in_progress"`
- `pending` → `status:pending`, `ledger_status:"pending"`
- `n/a` → `status:completed`, `ledger_status:"n/a"` (the n/a→completed special case)

Determinism: two runs with same `--now` produce identical stdout.

Stale-hash regeneration: Replace the `plan_hash` hex in the fixture with a different
64-hex (`"a".repeat(64)`) → new run produces `source_plan_hash` equal to the fake hash,
NOT the original — confirming the mirror reflects the current plan_hash, not a cached one.

### Case 4: compact/resume packet

RED (wrong fixture — no workflow dir): Empty `$TMPDIR` root with no `kaola-workflow/`
directory. Run compact-resume with `{cwd: emptyRoot}` via stdin.
→ exit 0, stdout empty (script returns silently when no project found)

GREEN (full fixture): `workflow-state.md` + frozen `workflow-plan.md` (with in-progress
`impl` node, pending `gate` node with `code-reviewer` role, `consent_halt: pending`)
+ `workflow-tasks.json`.
→ exit 0, 7-line packet in fixed order:
  - Line 0: `Kaola-Workflow compact resume:`
  - Line 1: `active project: issue-266-compact`
  - Line 2: `next skill/command: kaola-workflow-next`
  - Line 3: `in-progress node: impl (role: implementer)`
  - Line 4: `pending gates: gate`
  - Line 5: `consent-halt markers: consent_halt=pending ...`
  - Line 6: `task mirror: completed: 2, in_progress: 1, pending: 1, in_progress_task: impl`

Determinism: two runs with identical fixture → identical stdout.

### Case 5: no-silent-inline-fallback

RED + discriminating: Delete `workflow-planner.toml` → preflight exits non-zero,
AND stdout does NOT contain `subagent-invoked`, AND stdout does NOT contain
`local-fallback`. Both absence assertions are distinct — they would fail if the script
silently emitted an inline fallback success row.

GREEN: Restore `.toml` → fresh fixture passes with `status:ok`. The contrast confirms
the refusal was driven by the missing profile, not by a vacuous gate.

## Per-file suite exit codes

```
node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
EXIT: 0
Sentinel: "Kaola-Workflow walkthrough simulation passed"

node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js
EXIT: 0
Sentinel: "GitLab Codex workflow walkthrough simulation passed"

node plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js
EXIT: 0
Sentinel: "Gitea Codex workflow walkthrough simulation passed"

node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
EXIT: 0
Sentinel: "GitLab workflow script tests passed"

node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
EXIT: 0
Sentinel: "Gitea workflow script tests passed"
```

## npm test exit code

```
npm test → EXIT: 0
```
(Confirmed via background run completing with exit code 0. All editions GREEN.)

## build-green

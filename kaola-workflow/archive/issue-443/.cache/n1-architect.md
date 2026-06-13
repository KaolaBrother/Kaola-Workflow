evidence-binding: n1-architect 4eccce4834fc

## Architecture: D-420 P1 — Autopilot Driver (`kaola-workflow-autopilot.js`)

Binding implementation spec for issue #443. Downstream implementers (n2-autopilot, n9-tests) follow it literally. Every field name/path/shape verified by reading merged code in this worktree.

### Verified Merged-Contract Field Names

**#440 triage + `proposed_repair`** — lives in `scripts/kaola-workflow-adaptive-node.js`, NOT the schema. Schema (`kaola-workflow-adaptive-schema.js:260-288`) exports only `WRITE_SET_OVERFLOW_SUBTYPES` (frozen, keys `lockfile_write`/`mirror_write`/`count_bump`, each `{key, patterns[]}`). Triage built by `computeTriage(barrierOut, cacheDir, nodeId, readFile)` (`adaptive-node.js:1848`), attached to `barrier_failed` envelope (`:1586-1594`). Shape:
`{ class: 'lockfile_write'|'mirror_write'|'count_bump'|'write_set_overflow'|'unclassified', testDelta?: '<red> / <green>', proposed_repair?: { kind, node, paths[] } }`
`proposed_repair.kind` (verified `:1905-1913`): `count_bump`→`write_set_swap`; `lockfile_write`→`add_to_write_set`; `mirror_write`→`add_to_write_set`; `write_set_overflow`(with paths)→`revert_overflow`; `unclassified`/no paths → NO proposed_repair. There is NO `repair_node` kind (issue parenthetical listed it; it does not exist). Three real kinds: `write_set_swap | add_to_write_set | revert_overflow`.

**#441 goal contract** — `parseGoal` exported by `kaola-workflow-plan-validator.js`, imported into claim.js (`:22-23`); reads `goal:` from `## Meta`. `computeGoalCheck(planDirs)` (`claim.js:1815-1830`): `'satisfied'` if `KAOLA_GOAL` set+non-empty, else `'satisfied'` if any plan has a `goal:` line, else `'absent'`. Enum `'satisfied'|'absent'` ONLY — `'unsatisfied'` reserved/never returned v1. Written as `closureReceipt.goal_check` (`:2162`). Closure receipt is NOT a .cache file — emitted INLINE on cmdFinalize stdout under top-level key `closure_receipt` (`:2228-2233`). Autopilot reads goal_check by parsing cmdFinalize stdout JSON.

**#429 sink step-receipt** — `kaola-workflow-sink-merge.js`. `--sink` (`:617-1064`) writes `sink-receipt.json` (`writeSinkReceipt` `:629`). Path (`resolveSinkReceiptPath` `:637`): live `kaola-workflow/<project>/.cache/sink-receipt.json` first, archive fallback. Shape (`:659-670`): `{project, branch, issue_number, issue_numbers[], resolved_default_branch, started_at, updated_at, stash_ref, removed_duplicates[], steps}`. `steps` maps `SINK_STEPS=['preflight','push_upstream','merge','worktree_sync','finalize','closure','stash_restore','archive_commit','push_main']` (`:626`), each `'pending'`→`'done'`. **Sink success = `steps.push_main === 'done'`** (terminal). Full-completion stdout `{result:'ok', status:'sinked', receipt}` (`:1063`). Autopilot gates finalize/sink leg on THIS receipt — NEVER invokes sink-merge.js, NEVER names a forge CLI.

**#432 chain-receipt** — `kaola-workflow-run-chains.js` writes `.cache/chain-receipt.json` (`:85`). Schema (`:22-38`): `{headSha, workTreeHash, startedAt, completedAt, chains:[{name, exitCode, command, duration_ms, accepted_red, accepted_red_issue}]}`. **tests-green = every chain `exitCode===0 || accepted_red===true`** (mirrors run-chains exit logic `:225`). NOTE: triage `testDelta` reads a DIFFERENT receipt (`receipt.red`/`receipt.green`, `adaptive-node.js:1879`) — not the #432 chain receipt.

**issue-scout output contract** — `agents/issue-scout.md` Output Format `:96-135`. Today always `{recommended_bundle:{...}}`. `backlog_empty` extension = alternative top-level shape `{backlog_empty:true, recommended_bundle:null}` added to that section + the 3 TOML twins. Autopilot never dispatches scout (#44); receives scout JSON via `--scout-result <path>`.

### Design Decisions
- **D1** Pure receipt-reader, zero forge tokens, zero agent dispatch (lean-orchestrator #44 + forge-neutrality).
- **D2** `next` = stateless fn of (goal, project, on-disk receipts, optional scout JSON). Reads latest digest line + relevant stage receipt → NEXT stage descriptor OR typed stop. NO mutation except digest append + (under repair=auto, mechanical triage) a `repair` descriptor the ORCHESTRATOR applies (autopilot never rewrites the plan).
- **D3** Crash-resume via digest replay (append-only; last line + stage receipt → next descriptor; no separate state file).
- **D4** One bundle/invocation (OQ-5). Successful finalize w/ goal_check≠satisfied → `result:'goal_progress'` + scout next rec; operator re-invokes. No in-process chaining.
- **D5** Stop is structural — each reason maps to a ground-truth field/marker; never grep prose.

### Stage Machine: scout → claim → plan → run → finalize
Stage descriptor: `{stage, action, project, goal, inputs:{...}, receipt_path, repair?:{kind,node,paths}}`.
- cold start → `stage:'scout', action:'dispatch_issue_scout'`
- scout done → scout JSON `recommended_bundle` → `stage:'claim', action:'claim_bundle', inputs.issues`; `backlog_empty:true` → `stop:'backlog_empty'`
- claim done → `stage:'plan', action:'dispatch_planner'`; claim refusal → `stop:'typed_refusal'`
- plan done (handoff ready_to_run) → `stage:'run', action:'run_plan'`; handoff plan_invalid → `stop:'typed_refusal'`
- run in progress → re-emit run until `allDone:true`; halts → run-stage stop mapping
- run done (allDone) → `stage:'finalize', action:'sink'`
- finalize done → sink-receipt `steps.push_main==='done'` + goal_check `'satisfied'`→`stop:'goal_satisfied'`; else `result:'goal_progress'`; irrecoverable incomplete sink → `stop:'typed_refusal'`

### Stop Payload + Ground-Truth Bindings
`{stop:'goal_satisfied'|'backlog_empty'|'consent_halt'|'security_halt'|'typed_refusal'|'repair_limit', stage, project, details:{...}, receipt_path}`
- goal_satisfied ← cmdFinalize stdout `closure_receipt.goal_check==='satisfied'` (#441; incl #435 since computeGoalCheck is goal-line/env based). receipt_path = sink-receipt.json
- backlog_empty ← scout JSON `backlog_empty===true && recommended_bundle===null`. receipt_path = --scout-result path
- consent_halt ← state `escalated_to_full: consent` (`adaptive-node.js:1966`) OR ledger `consent_halt: pending` (`adaptive-schema.js:122`)
- security_halt ← state `escalated_to_full: security` (`:1974`). DISAMBIGUATE: a consent halt also writes escalated_to_full:security (`:1966`); if `consent_halt: pending` also present → consent_halt; security-only → security_halt
- typed_refusal ← a `barrier_failed` envelope (`:1586-1594`) carrying #440 triage; OR claim/handoff/validator `{result:'refuse', reason}`. details.triage when present; details.reason. test_thrash surfaces here as details.reason:'test_thrash'
- repair_limit ← repair=auto exhausted bounded retry (1 mechanical repair/node; 2nd same-node barrier_failed after auto-applied repair). details.node, details.attempts

### Repair Consent (OQ-2): KAOLA_AUTOPILOT_REPAIR ∈ {ask(default), auto}
Mechanical-class (auto-applicable) = EXACTLY `{add_to_write_set, write_set_swap}`. NOT mechanical (always halt) = `revert_overflow`, `class:'unclassified'`, absent proposed_repair.
- ask: ANY barrier_failed → `stop:'typed_refusal'` carrying triage.
- auto: mechanical kind → emit descriptor with `repair:{kind,node,paths}` for orchestrator to apply + log digest `{stage:'run', result:'repair_applied', receipt_path, repair}` + re-emit run (bounded: 1 auto-repair/node; 2nd same-node barrier_failed → `stop:'repair_limit'`). Else → `stop:'typed_refusal'` even under auto.
Autopilot NEVER edits the plan — surfaces repair descriptor + logs it; the agent applies the write.

### CLI Surface
`node kaola-workflow-autopilot.js <subcommand> [flags]`
**next**: `--goal <text>` (required), `--project <name>` (required once active), `--scout-result <path>` (required to advance out of scout), `--json`. Emits stage descriptor OR stop. Exit 0 on clean descriptor/stop (a stop is exit 0); exit 1 on internal/arg error.
**digest**: `--project <name>`, `--stage <s>`, `--result <r>`, `--receipt-path <path>` (opt), `--repair <json>` (opt), `--json`. Appends one JSONL line + echoes.
argv: hand-rolled `parseArgs(process.argv.slice(3))` mirroring claim.js (long flags, `--flag value`/`--flag=value`, `--json` bool). Unknown subcommand → `{error:'unknown_subcommand'}` exit 1. `--project` validated with `isSafeName` before path join.

### Digest Write Contract (OQ-4)
Path `kaola-workflow/<project>/.cache/autopilot-digest.jsonl`, append-only, one line/transition:
`{"ts":"<ISO .000Z-trimmed>", "stage":"<scout|claim|plan|run|finalize>", "result":"<advanced|stop:<reason>|repair_applied|goal_progress>", "receipt_path":"<path|null>"}`
Write: `mkdirSync(dir,{recursive:true})` then `appendFileSync(JSON.stringify(line)+'\n')`. ts = `new Date().toISOString().replace(/\.\d{3}Z$/,'Z')` (matches claim.js:2154). Crash-resume = last non-empty line JSON.parse; corrupt/absent → cold start. Never rewrite/truncate.

### Forge-Neutrality + Edition Strategy
Zero forge tokens (no gh/glab/tea, no GitHub/GitLab/Gitea identifiers, no API). Composes purely over receipt SHAPES. Byte-identical claude↔codex (`scripts/` === `plugins/kaola-workflow/scripts/`) + body-identical prefix-rename gitlab/gitea ports. Add the standard forge-neutral header comment block (mirror run-chains.js:40-42).

### Files to Create
- `scripts/kaola-workflow-autopilot.js` (n2) + `plugins/kaola-workflow/scripts/kaola-workflow-autopilot.js` byte-identical (n2)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-autopilot.js` + `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-autopilot.js` prefix-rename body-identical (n7)
- `commands/kaola-workflow-auto.md` + gitlab/gitea command twins + 3 Codex SKILL packs (n5, ×6 #400)
- `scripts/test-autopilot.js` (n9)

### Files to Modify
- `scripts/kaola-workflow-install-manifest.js` (+ codex mirror): add `'kaola-workflow-autopilot.js'` to `SUPPORT_SCRIPTS` (`:62-86`) — single-sources install.sh SUPPORT_SCRIPT_NAMES (`:175-177`) + derives forge-port names via renameIfPorted (n6)
- `scripts/validate-script-sync.js`: COMMON_SCRIPTS + RENAME_NORMALIZED_FAMILIES `autopilot forge ports` entry (n6)
- `scripts/kaola-workflow-adaptive-schema.js` (×4): add `AUTO_COMMAND='/kaola-workflow-auto'` + `AUTO_SKILL='kaola-workflow-auto'` exports (n3)
- `agents/issue-scout.md` Output Format + 3 TOML twins: `{backlog_empty:true, recommended_bundle:null}` shape (n4)
- `scripts/test-route-reachability.js` + 4 `validate-*-contracts.js`: `/kaola-workflow-auto` + SKILL pins ×6 (n8)
- `CHANGELOG.md`, `docs/architecture.md`, `docs/decisions/D-443-01.md`, `.env.example` `KAOLA_AUTOPILOT_REPAIR` (n11)

### Tests n9 must write (scripts/test-autopilot.js)
1. Stage walk over mock `kaola-workflow/<mockproj>/.cache/` w/ fixture receipts: scout→claim→plan→run→finalize → goal_satisfied.
2. Digest replay after kill: partial digest → next resumes from last line's stage.
3. Each stop reason from a fixture: goal_satisfied, backlog_empty, consent_halt (state escalated_to_full:consent + ledger consent_halt:pending), security_halt (security-only), typed_refusal (barrier_failed carrying triage; also claim-refuse envelope), repair_limit (two barrier_failed same node under auto).
4. repair=ask halts on lockfile_write triage where repair=auto emits add_to_write_set descriptor + logs repair_applied.
5. repair=auto STILL halts (typed_refusal) on revert_overflow/unclassified (mechanical-class boundary).
6. backlog_empty round-trip.
7. Forge-neutrality: script body contains zero forge tokens.

### Constraints binding every downstream node
- Driver dispatches NOTHING and names NO forge CLI. Any code calling sink-merge.js/run-chains.js/adaptive-node.js/a forge binary is OUT OF SPEC.
- Finalize leg gates on sink-receipt.json `steps.push_main === 'done'` — not a direct sink call, not prose.
- Mechanical-class = EXACTLY `{add_to_write_set, write_set_swap}`; revert_overflow/unclassified always halt even under auto.
- goal_check enum is `satisfied|absent` only (unsatisfied reserved); goal_satisfied fires on `=== 'satisfied'`.
- Cross-edition (#307): all four chains green; ×6 route-reachability (#400). Single install wiring edit = SUPPORT_SCRIPTS in install-manifest (install.sh single-sources it).

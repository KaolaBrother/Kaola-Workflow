# tests node (tdd-guide) — issue #284 cross-edition AC coverage

ROLE: tdd-guide. RED→GREEN demonstrated per assertion (fixture-controlled). Cross-edition diff → evidence bar = ALL FOUR chains green, run sequentially.

## Assertions added (5 declared files)
### github-codex: plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js (+261 lines)
4 new test fns, registered in main():
- testAC1HooksJson (#284 AC1): installer produces .codex/hooks.json with 4 events each carrying a kaola-workflow:-id entry; SessionStart/compact cmd → kaola-workflow-codex-compact-resume.js; no __KW_PLUGIN_ROOT__ residue; /hooks trust line in stdout; idempotent (1 managed entry/event after 2 installs, user entry survives).
  - RED: raw template contains __KW_PLUGIN_ROOT__ → assertion on installed file would fail pre-install.
  - GREEN: installed file token-resolved, all events present.
- testAC3AttestationSeeded (#284 AC3): seed .cache/dispatch-log.jsonl (workflow-planner + contractor) before finalize → claim_planner_attested==='attested' AND finalize_contractor_attested==='attested'.
  - RED confirmed: without seeding → both 'missing'. GREEN confirmed: with seeding → both 'attested'.
- testAC2CompactPlainStdout (#284 AC2): compact script stdout is plain-text packet (starts with "Kaola-Workflow compact resume:"), NOT a JSON envelope (no leading {, no "hookSpecificOutput").
- testAC4SubagentDispatchLog (#284): spawn kaola-workflow-subagent-dispatch-log.sh with stdin {agent_type:workflow-planner,...} against tmp repo w/ active workflow-state.md → 1 JSONL line appended; exit 0 on empty stdin (fail-open / WARN-first).

### gitlab: test-gitlab-workflow-scripts.js (+54/-1) + simulate-gitlab-codex-workflow-walkthrough.js (+25/-1)
- testInstallProfilesFeaturesTableHandling extended: .codex/hooks.json 4-event loop, compact cmd → kaola-gitlab-workflow-codex-compact-resume.js, no token, /hooks line, idempotency.
- codex sim: replaced false "Codex edition has no dispatch-log hook — M1 deferred to #266" comment; added static assertion config/hooks.json registers SubagentStart dispatch-log (kaola-workflow: id, kaola-workflow-subagent-dispatch-log.sh).
- RED via /tmp fixture tampering (drop SubagentStart / re-inject token) → assertions fire. GREEN: clean install passes.

### gitea: test-gitea-workflow-scripts.js (+35/-1) + simulate-gitea-codex-workflow-walkthrough.js (+25/-1)
- Symmetric to gitlab; compact cmd → kaola-gitea-workflow-codex-compact-resume.js. Same RED demos + GREEN.

## CROSS-EDITION EVIDENCE BAR — all 4 chains GREEN, sequential (exit 0)
```
npm run test:kaola-workflow:claude && :codex && :gitlab && :gitea  → exit 0
```
- claude: full suite passed (validate-script-sync 18 common + 7 byte-identical groups; testSubagentDispatchHookExists; parallel-batch 173 assertions; all adaptive/closure/worktree tests) → "Workflow walkthrough simulation passed".
- codex: validate-script-sync + validate-kaola-workflow-contracts + walkthrough incl testAC1HooksJson/testAC3AttestationSeeded/testAC2CompactPlainStdout/testAC4SubagentDispatchLog all PASSED.
- gitlab: vendored-agents + gitlab contracts + walkthrough + gitlab-codex walkthrough (new config/hooks.json assertion) PASSED.
- gitea: symmetric PASSED.

All 5 changes in-lane (git status confirms only the 5 declared test files unstaged for this node). Per docs/conventions.md #307: the green claude chain is NOT sufficient alone; all four were run sequentially and all are green.

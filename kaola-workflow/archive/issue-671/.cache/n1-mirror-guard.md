evidence-binding: n1-mirror-guard e95390a29996

RED: #671-MIRROR-CRASH-OBSERVABILITY (scripts/test-adaptive-node.js) — 5/6 new assertions FAILED
pre-fix against unmodified scripts/kaola-workflow-task-mirror.js: `node scripts/test-adaptive-node.js`
exited FAILED with `adaptive-node tests FAILED (5 failures, 1781 passed)`. Sample failing assertion
(pattern recurs across all 5 fails):
```
FAIL: #671-MIRROR-CRASH-OBSERVABILITY: NO raw stack-trace frames (at Object.<anonymous> / at Module.) in output, got "node:fs:2397\n    return binding.writeFileUtf8(\n                   ^\n\nError: EISDIR: illegal operation on a directory, open '/private/var/folders/8s/y93yqng93xb4__nl4jlh_g9c0000gn/T/d437-lane-jmU3TL/kaola-workflow/test-project/workflow-tasks.json'\n    at Object.writeFileSync (node:fs:2397:20)\n    at Object.<anonymous> (/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-671/scripts/kaola-workflow-task-mirror.js:143:6)\n    at Module._compile (node:internal/modules/cjs/loader:1803:14)\n    at Module._extensions..js (node:internal/modules/cjs/loader:1934:10)\n    at Module.load (node:internal/modules/cjs/loader:1524:32)\n    at Module._load (node:internal/modules/cjs/loader:1326:12)\n    at TracingChannel.traceSync (node:diagnostics_channel:328:14)\n    at wrapModuleLoad (node:internal/modules/cjs/loader:245:24)\n    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)\n    at node:internal/main/run_main_module:33:47 {\n  errno: -21,\n  code: 'EISDIR',\n  syscall: 'open',\n  path: '/private/var/folders/8s/y93yqng93xb4__nl4jlh_g9c0000gn/T/d437-lane-jmU3TL/kaola-workflow/test-project/workflow-tasks.json'\n}\n\nNode.js v25.5.0\n"
FAIL: #671-MIRROR-CRASH-OBSERVABILITY: NO bare "Error: EISDIR" immediately followed by a stack frame, got (same captured stack-trace text)
FAIL: #671-MIRROR-CRASH-OBSERVABILITY: stdout carries exactly ONE line (the machine envelope), got ""
FAIL: #671-MIRROR-CRASH-OBSERVABILITY: stdout is a concise machine-readable {result:refuse, reason:mirror_write_failed} envelope, got {"stdout":"","envelope":null}
FAIL: #671-MIRROR-CRASH-OBSERVABILITY: envelope message is a single line (no embedded stack dump), got null
adaptive-node tests FAILED (5 failures, 1781 passed)
```
This proves the child crashes via Node's default uncaught-exception handler (`node:fs:2397`,
`at Object.writeFileSync`, `at Object.<anonymous> (.../kaola-workflow-task-mirror.js:143:6)`, the
full `Module._compile`/`Module.load` chain) with stdout completely empty (no envelope reaches the
caller pre-fix) — the 1 assertion that already passed pre-fix (`res.status !== 0`) confirms the
process still exited non-zero, but with zero machine-readable diagnostic.

GREEN: #671-MIRROR-CRASH-OBSERVABILITY passes post-fix; `node scripts/test-adaptive-node.js` →
`adaptive-node tests passed (1786 assertions)` (exit 0). All 6 assertions in the new test are
green: no `at Object.<anonymous>` / `at Module.` frames and no bare `Error: EISDIR` followed by a
stack frame anywhere in the collision path's stdout+stderr; stdout is exactly ONE line parsing to
`{"result":"refuse","reason":"mirror_write_failed","status":"mirror_write_failed","path":"<...>/workflow-tasks.json","message":"EISDIR: illegal operation on a directory, open '<...>'"}`
with a single-line `message` field (no embedded `\n`).

## Fix applied

Wrapped the `fs.writeFileSync(outPath, json, 'utf8')` CLI write site (line 143, inside `main()`,
previously with no local try/catch) in a try/catch. On catch it emits the file's EXISTING shared
envelope helper: `emit(refuse('mirror_write_failed', { status: 'mirror_write_failed', path: outPath,
message: e.message }))` then `process.exit(1)` — a NEW typed reason `mirror_write_failed`, one
compact JSON line, no raw stack trace. Applied identically to all 4 copies:
- `scripts/kaola-workflow-task-mirror.js` (canonical, hand-edited)
- `plugins/kaola-workflow/scripts/kaola-workflow-task-mirror.js` (codex COMMON twin, regenerated
  via `npm run sync:editions` — reported `codex-sync plugins/kaola-workflow/scripts/kaola-workflow-task-mirror.js`)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-task-mirror.js` (RENAMED forge port,
  hand-applied)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-task-mirror.js` (RENAMED forge port,
  hand-applied)

`git diff` on all 4 files shows byte-identical +14/-2 diffs (confirmed by direct comparison).

## Fail-open preserved (invoker untouched)

`git diff --stat -- scripts/kaola-workflow-adaptive-node.js plugins/` shows ONLY the 3 plugin
task-mirror twins changed — `kaola-workflow-adaptive-node.js` is untouched in the canonical tree
and every plugin tree. `refreshTaskMirror` in `kaola-workflow-adaptive-node.js` already swallows
the child's non-zero exit via `shellNode` and surfaces `res.reason` unmodified — this now
naturally resolves to `mirror_write_failed` instead of the prior `null`, with zero caller code
change. The pre-existing `#588-TASKMIRROR-OPEN` / `#588-TASKMIRROR-CLOSE` fail-open pins (ledger
STILL advances despite mirror failure; `taskMirror.status === 'failed'`) remain green in the same
1786-assertion GREEN run above, proving the fail-open contract stayed intact.

## Additional GREEN proofs

- `node scripts/edition-sync.js --check` → `edition-sync: 10 forge aggregator ports, 24
  COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity with canonical.` (clean, exit 0).
- `node scripts/simulate-workflow-walkthrough.js` → last line `Workflow walkthrough simulation
  passed` (exit 0).
- `git status --porcelain` confirms exactly the 5 write-set files modified (plus the untracked
  `kaola-workflow/issue-671/` evidence dir): `scripts/kaola-workflow-task-mirror.js`,
  `plugins/kaola-workflow/scripts/kaola-workflow-task-mirror.js`,
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-task-mirror.js`,
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-task-mirror.js`,
  `scripts/test-adaptive-node.js`.

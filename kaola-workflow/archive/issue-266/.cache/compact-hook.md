# compact-hook — node evidence (issue #266, AC-E + AC-F)

## RED phase

The scratch test at `/tmp/test-compact-resume.js` was run BEFORE implementing
`kaola-workflow-codex-compact-resume.js`. The script did not exist; the test
failed immediately:

```
Test 1: Script exists
  FAIL: Script exists at .../plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js

Script does not exist — this is the expected RED state. Exiting.
Exit code 1
```

## GREEN phase

After implementing all 3 edition copies and applying post-GREEN hardening,
the test suite passes with 31/31:

```
Test 1: Script exists
  PASS

Test 2: 6 sections present in correct order
--- Packet output ---
Kaola-Workflow compact resume:
active project: demo
next skill/command: kaola-workflow-plan-run demo
in-progress node: compact-hook (role: tdd-guide)
pending gates: security-review, code-review
consent-halt markers: consent_halt=none escalated_to_full=unknown inline_emergency_fallback_authorized=no
task mirror: completed: 2, in_progress: 1, pending: 5, in_progress_task: compact-hook
--- End packet ---
  PASS: Section 1: active project line present
  PASS: Section 2: next skill/command line present
  PASS: Section 2: next command value present
  PASS: Section 3: in-progress node line present
  PASS: Section 3: compact-hook (tdd-guide) is in-progress
  PASS: Section 4: pending gates line present
  PASS: Section 4: security-review (gate) present
  PASS: Section 4: code-review (gate) present
  PASS: Section 4: script-registration (non-gate) excluded
  PASS: Section 4: tests (non-gate) excluded
  PASS: Section 4: finalize (non-gate) excluded
  PASS: Section 5: consent-halt markers line present
  PASS: Section 6: task-mirror summary present
  PASS: Section 6: completed count correct
  PASS: Section 6: in_progress count correct
  PASS: Section 6: in_progress_task correct

Test 3: No ISO timestamp in body — PASS

Test 4: Determinism — PASS (Two runs produce identical output)

Test 5: Graceful absent workflow-tasks.json
--- Absent-tasks packet ---
Kaola-Workflow compact resume:
active project: demo
next skill/command: kaola-workflow-plan-run demo
in-progress node: compact-hook (role: tdd-guide)
pending gates: security-review, code-review
consent-halt markers: consent_halt=none escalated_to_full=unknown inline_emergency_fallback_authorized=no
task mirror: not generated
--- End absent-tasks packet ---
  PASS: Absent workflow-tasks.json → "task mirror: not generated"
  PASS: Absent workflow-tasks.json → still emits project name
  PASS: Absent tasks → section 2 still present
  PASS: Absent tasks → section 3 still present
  PASS: Absent tasks → section 4 still present
  PASS: Absent tasks → section 5 still present

Test 6: Section ordering — PASS (project < in-progress < gates < consent < task-mirror)

Test 7: consent_halt marker detected when appended AFTER Node Ledger section
  PASS: consent_halt=pending when marker is in Plan Notes (after Node Ledger section)
  PASS: consent_halt=none when marker is absent

=== Results: 31 passed, 0 failed ===
```

## Post-GREEN hardening: consent_halt fallback-path detection

`adaptive-node.js` has fallback write paths that append `consent_halt: pending` to the end
of the plan file. If a `## Plan Notes` section exists after `## Node Ledger`, the marker
lands outside the `ledgerText` slice captured by `parseSections()`. The initial
implementation scanned only `ledgerText`, which would silently miss this case.

Fix applied: `parseLedger()` now scans `planContent` (the full plan string) for
`/consent_halt:\s*pending/` instead of only `ledgerText`. The string is unique enough
that false positives are nil.

Test 7 was updated to place the marker in `## Plan Notes` (after the ledger section
boundary) to ensure the test actually discriminates placement — a ledgerText-only
scan would fail this test.

## Determinism check

Two successive runs of the hook against the same fixture produced byte-identical
stdout (Test 4 above). No timestamps, no random elements in the packet body.
No `last_synced_from_ledger` or mtime-derived data is emitted in the packet.

## AC-F grep proof (zero CLAUDE_PLUGIN_ROOT / no edition require)

```
$ grep -n 'CLAUDE_PLUGIN_ROOT' plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js
CONFIRMED: zero CLAUDE_PLUGIN_ROOT hits

$ grep -n "require('./" plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js
CONFIRMED: no edition require('./...')

$ grep -n "require(" plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js
5:// AC-F: no Claude plugin-root env reference, no require() of edition code.
6:const fs = require('fs');
7:const path = require('path');
```

Only stdlib `fs` and `path` are required. Zero functional references to
`CLAUDE_PLUGIN_ROOT`. AC-F is satisfied structurally.

## Absent workflow-tasks.json graceful handling

When `workflow-tasks.json` is absent, the script emits a complete 6-section packet
with section 6 = `task mirror: not generated`. No crash, no stderr error, no
partial packet. Shown in Test 5 above.

## Edition consistency

```
$ diff plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js \
       plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-codex-compact-resume.js
2c2
< // kaola-workflow-codex-compact-resume.js
---
> // kaola-gitlab-workflow-codex-compact-resume.js

$ diff plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js \
       plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-codex-compact-resume.js
2c2
< // kaola-workflow-codex-compact-resume.js
---
> // kaola-gitea-workflow-codex-compact-resume.js
```

Only the filename comment (line 2) differs across the 3 edition copies.
Edition-named, not byte-synced (matching compact-context precedent).

## Live reality check (issue-266 artifacts)

```
$ echo '{"cwd":"<worktree-root>"}' | node plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js
Kaola-Workflow compact resume:
active project: issue-266
next skill/command: kaola-workflow-plan-run issue-266
in-progress node: compact-hook (role: tdd-guide)
pending gates: security-review, code-review
consent-halt markers: consent_halt=none escalated_to_full=unknown inline_emergency_fallback_authorized=no
task mirror: not generated
```

Correctly identifies compact-hook as in-progress, the two gate nodes as pending,
no consent halt, and task mirror not yet generated.

## Files produced

- `plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js` (codex)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-codex-compact-resume.js` (gitlab)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-codex-compact-resume.js` (gitea)

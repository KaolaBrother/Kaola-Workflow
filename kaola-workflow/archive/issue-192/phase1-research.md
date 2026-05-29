# Phase 1 - Research / Discovery: issue-192

## Deliverable
Fix `kaola-workflow-closure-audit.js` online mode to replace serial per-archive `gh issue view` probes with a single `gh issue list --state closed` batch call, bounding runtime even with large archive histories (100+ archived issues). Apply the same fix to GitLab and Gitea edition ports. Add a large-archive-set regression test.

## Why
With 143 archived folders (111 with `status: closed`), the online closure audit calls `gh issue view` once per candidate — serially, with a 30-second timeout each — leading to a worst-case 55-minute hang. The audit had to be killed manually during a 2026-05-29 run. Offline mode returned immediately, confirming the bottleneck is the per-issue remote probes.

## Affected Area
- `scripts/kaola-workflow-closure-audit.js` — canonical GitHub edition; `collectClosedSet()` at lines 68–80; `buildAuditReport()` at line 206
- `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` — byte-identical Codex copy; must stay byte-identical per `validate-script-sync.js:43`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js` — GitLab port; same `collectClosedSet` loop (lines 59–71)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js` — Gitea port; same structure (lines 58–70)
- `scripts/kaola-workflow-active-folders.js` — defines `probeIssueState()` (line 56) and `ghExec()` (line 37); shared by GitHub edition
- `scripts/simulate-workflow-walkthrough.js` — test suite; closure-audit section lines 3253–3724; needs new large-archive regression test

## Key Patterns Found

1. **Root cause — serial blocking probe loop** (`scripts/kaola-workflow-closure-audit.js:68–80`): `collectClosedSet()` iterates all candidates (including 111 archived-closed numbers) and calls `probeIssueState(n)` synchronously for each via `execFileSync` with 30s timeout.

2. **Batch pattern to mirror** (`scripts/kaola-workflow-closure-audit.js:142`): `detectStaleLabels()` calls `ghExec(['issue', 'list', '--state', 'closed', '--label', CLAIM_LABEL, '--json', 'number,title,url'])` — one call, returns all matching issues. This is the direct template for fixing `collectClosedSet`.

3. **Archive-only numbers never consumed** (`scripts/kaola-workflow-closure-audit.js:111,128,174,185`): Numbers present only in `archiveClosed` (no roadmap source, no active folder) are probed but their remote result is never used by any detector. `detectStaleRoadmapSources` already uses `archiveClosed.has(n)` directly. These probes can safely be skipped.

4. **Byte-identity constraint** (`scripts/validate-script-sync.js:43`): The canonical `scripts/kaola-workflow-closure-audit.js` and its Codex copy `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` must remain byte-identical. Any fix must be applied to both files identically.

5. **Error handling sentinel pattern** (`scripts/kaola-workflow-closure-audit.js:145,195,271`): Timed-out detectors return string sentinel `'skipped_timeout'` rather than throwing. New batch-call timeout handling must follow this same pattern.

6. **Test mock pattern** (`scripts/simulate-workflow-walkthrough.js:3255`): `closureAuditShim(binDir, [...])` writes a `gh.js` mock via `writeShimFiles`; `runClosureAudit` sets `KAOLA_GH_MOCK_SCRIPT`. Use call-counting shim to verify probe count is bounded.

## Test Patterns
- Framework: Hand-rolled `assert(cond, msg)` (simulate-workflow-walkthrough.js:19–21)
- Location: `scripts/simulate-workflow-walkthrough.js`, closure-audit section lines 3253–3724
- Structure: `fs.mkdtempSync` → plant fixtures → write gh shim → `spawnSync` audit → assert JSON output
- Timeout shim: `['setInterval(() => {}, 1 << 30);']` with `KAOLA_GH_REMOTE_TIMEOUT_MS:'300'` (lines 3556–3574)
- **Gap**: No large-archive-set test exists — must add one that plants 50+ archive entries and asserts `gh issue list` called once (not N times)

## Config & Env
| Env Var | Default | Effect |
|---------|---------|--------|
| `KAOLA_WORKFLOW_OFFLINE` | `'0'` | `=1` bypasses all gh calls; `probeIssueState` returns `{state:'open'}` immediately |
| `KAOLA_GH_REMOTE_TIMEOUT_MS` | `'30000'` | Per-call timeout for `execFileSync`; clamped to 600000ms |
| `KAOLA_GH_MOCK_SCRIPT` | unset | Routes `ghExec` through mock script (tests only) |

No feature flags for batch mode. `execFileSync`-only execution model must be preserved (no async/`Promise.all` in production scripts).

## External Docs
None — fix uses only in-codebase patterns (`gh issue list` already used in `detectStaleLabels()`).

## GitHub Issue
KaolaBrother/Kaola-Workflow#192

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | Internal patterns only; no external library/API behavior needed |

## Notes / Future Considerations
- The GitLab/Gitea ports use `forge.listIssues({ state: 'closed' })` (already a batch call) for `detectStaleLabels` — the same batch approach should map cleanly to their `collectClosedSet` equivalents.
- `gh issue list --limit 1000` is the suggested ceiling; if a repo has more than 1000 closed issues this could miss some candidates. A note in the code or a paginated approach could handle extreme cases, but is out of scope for this fix.
- `validate-script-sync.js` must be run as part of test validation after fixing both the canonical and Codex copy files.

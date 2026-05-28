# Advisor Plan Gate — issue-169

## Verdict
Architect plan approved. All 13 acceptance criteria covered. One blocking item resolved + two non-blocking sharpenings to apply.

## Blocking: dispatch structure ✓ resolved
Architect A2 proposed `main()` function. Read lines 377–390 of `scripts/kaola-workflow-classifier.js` — `main()` already exists. Architect's spec modifies it in place; no restructuring needed.

## Sharpening 1: CONSUMER_REPO_MARKER is theater
Writing a marker file at `tmp/` and asserting it still exists doesn't prove consumer-repo isolation. The classifier never touches random tmp files; the marker's continued existence is trivially true.

**Replace with substantive assertions** (already provided for free):
- `runNode(..., cwd: tmp)` ensures `git rev-parse --show-toplevel` resolves to `tmp`
- `writeGhShimForStartup` returns `name:repo` (non-Kaola)
- Reasoning string references the requested issue number from cwd's context

**Updated approach** for `testClassifierOfflineUnverifiedWithUnrelatedActiveFolder`:
- Assert `reasoning` contains `'#301'` (proves classifier used the requested target, not the unrelated active issue 300)
- Add comment: `// Consumer-repo isolation: getRoot() resolves to tmp via git rev-parse; existing shim returns name:repo (non-Kaola)`
- No marker file needed

## Sharpening 2: T6 doesn't require T5
Tests reference `scripts/*` paths via `claimScript`/`classifierScript` constants, not `plugins/kaola-workflow/scripts/`. T6 can run as soon as T1+T2 are done. T5 mirror is a fan-in that doesn't gate testing. Architect's ordering is conservative; acceptable.

## AC Traceability — All 13 Covered

| AC | Implementation point |
|----|---------------------|
| 1 (extract verdict/reasoning) | C2 |
| 2 (SKILL.md mirror) | D2 |
| 3 (Required Output diagnostics) | C3, D3 |
| 4 (Step 0 validates before 0a-1) | C1, D1 |
| 5 (repo context wording) | C1, D1 |
| 6 (offline + no evidence → stop) | C1, A1 |
| 7 (target_unverified verdict) | A1 |
| 8 (claim:none mapping) | B1 |
| 9 (distinct verdict) | A1, F2 |
| 10 (top-level --issue, --help) | A2, F2 |
| 11 (mirror sync) | T5 |
| 12 (tests + consumer-repo assertion) | F1, F2, F3 |
| 13 (non-regression) | F2, existing testClassifierFailClosedOnRemoteError |

## Conclusion
Proceed to Phase 4. No architect revision needed; apply the two sharpenings inline when writing the Phase 3 plan file.

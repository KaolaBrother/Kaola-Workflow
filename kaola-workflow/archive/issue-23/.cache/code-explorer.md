# Code Explorer Notes - issue-23

Scope: inline read-only exploration of the classifier, claim bootstrap, roadmap metadata, and regression test harness. Subagent delegation was not used because this Codex session only permits spawned agents when the user explicitly asks for parallel agent work.

## Files Inspected

- `scripts/kaola-workflow-classifier.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js`
- `scripts/kaola-workflow-claim.js`
- `scripts/simulate-workflow-walkthrough.js`
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
- `scripts/validate-workflow-contracts.js`
- `scripts/validate-kaola-workflow-contracts.js`
- `README.md`
- `install.sh`
- GitHub issue #23 body and acceptance criteria

## Findings

1. `scripts/kaola-workflow-classifier.js:104` defines `FILE_PATH_REGEX` as a coarse whitelist for `scripts`, `commands`, `hooks`, and `kaola-workflow`; it does not extract `plugins/kaola-workflow/...` paths named in issue #23.
2. `scripts/kaola-workflow-classifier.js:107` exposes only `extractCoarseAreas(text)`, so exact paths are discarded immediately after regex matching.
3. `scripts/kaola-workflow-classifier.js:186` scans active claimed projects by reading `phase3-plan.md` and `phase1-research.md`, which is the right place to add exact path extraction from claimed artifacts.
4. `scripts/kaola-workflow-classifier.js:246` classifies using area sets, dependency labels, area labels, and conservative unknown-scope handling.
5. `scripts/kaola-workflow-claim.js:536` accepts green or yellow classifier verdicts and writes `.cache/parallel-classifier.md` only after a yellow claim.
6. `scripts/kaola-workflow-claim.js:544` writes the yellow shared-infra warning cache file, so classifier reasoning must preserve yellow for directory-only shared infrastructure overlap.
7. `scripts/simulate-workflow-walkthrough.js:788` already has Epic Case 6 for classifier behavior; new subcases should extend this block for exact paths, shared-infra exact paths, area labels, unknown scope, and offline metadata.
8. `scripts/validate-workflow-contracts.js:227` and `scripts/validate-kaola-workflow-contracts.js:145` assert classifier files exist, but they do not yet assert exact-path behavior markers.
9. The repo carries both root scripts and plugin-copied scripts. Any classifier or Codex simulation change should be mirrored where equivalent files exist.

## Risk Notes

- Exact path parsing must avoid treating punctuation, Markdown fences, or trailing commas as part of a path.
- `touches:` metadata should work offline through local `.roadmap/issue-N.md` files as well as ordinary issue body text.
- Existing yellow behavior for directory-only shared-infra overlap is an acceptance criterion and must not regress.

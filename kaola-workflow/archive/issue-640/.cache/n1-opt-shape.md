evidence-binding: n1-opt-shape 392b0e9e3c87
RED: OPT-2 absolute-path fixture (pre-fix) — Error: OPT-2: an absolute-path metric_paths entry must refuse, got: {"result":"in-grammar","decision":"auto-run","planHash":"61b4ef080212c22c98e5b1f1325825ee9fab062dd4b40f04cd6ab088a2f7adb1","sink":"done","risk":{"sensitivity":false,"blastRadius":false,"uncertain":false,"reasons":[]},"nodeCount":5,"diagnostics":{"wideFanout":[]}} — thrown at assert (scripts/simulate-workflow-walkthrough.js:47:25), at testMetricOptimizerContract (scripts/simulate-workflow-walkthrough.js:2372:5). Confirmed all 3 new refuse fixtures (absolute-path, backslash, bare-existing-directory) were in-grammar pre-fix; the run halted on the first (absolute-path) as expected for a hand-rolled assert() harness that stops at the first failure.
GREEN: after implementing the OPT-2 shapeReason extension (absolute_path / backslash_in_path / bare-existing-directory, precedence absolute-before-backslash, local `optRoot` recomputed since freezeRoot is out of scope) in canonical `scripts/kaola-workflow-plan-validator.js`: `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed" (exit 0, all 4 new OPT-2 fixtures pass: 3 refuse + 1 accept-control). `npm run sync:editions` regenerated the 3 ports (plugins/kaola-workflow, kaola-workflow-gitlab, kaola-workflow-gitea) — output: "generated plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js", "generated plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js", "codex-sync plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js", "edition-sync: write complete (3 file(s) updated)". `node scripts/edition-sync.js --check` → "edition-sync: 10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity with canonical." (no drift). Full four-chain `npm test` (claude && codex && gitlab && gitea, run sequentially via the chained npm script) exited 0 — tail of output shows "GitLab workflow walkthrough simulation passed", "GitLab Codex workflow walkthrough simulation passed", "Gitea workflow walkthrough simulation passed", "Gitea Codex workflow walkthrough simulation passed", each preceded by all-PASSED per-test lines, and both "generate-routing-surfaces --check: all 12 surfaces byte-match the skeleton." lines green. Since the npm `test` script chains all four editions with `&&`, exit code 0 is proof all four (claude, codex, gitlab, gitea) passed, not just the last two shown in the tail.

## Implementation summary

Extended the OPT-2 `metric_paths` shape filter in `validatePlan()` (canonical `scripts/kaola-workflow-plan-validator.js`, ~line 1524) to refuse three additional shapes the declared_write_set freeze wall already refuses (~lines 1396-1432) but OPT-2 did not yet mirror:
- absolute path (Unix `/` prefix or Windows drive-letter `C:`) → reason `absolute_path`
- backslash-bearing path → reason `backslash_in_path`
- bare existing-directory (no trailing slash, `fs.statSync(...).isDirectory()` via try/catch; a statSync throw for a not-yet-created file is a clean skip) → reason `bare-existing-directory`

Checks run in the same precedence order as the freeze wall (directory-shaped/glob/'..'-aliasing, then absolute, then backslash, then bare-dir), so a Windows absolute path like `C:\foo` reports `absolute_path` not `backslash_in_path`. A local `optRoot` const is recomputed at the OPT-2 site (`opts.root || process.cwd()`) since the freeze wall's `freezeRoot` is block-scoped to the write-set loop and out of scope here. The refusal message now lists each offending path with its specific reason tag, still prefixed `OPT-2:`.

## Files modified (all within declared write set)

- `scripts/kaola-workflow-plan-validator.js` (canonical — hand-edited)
- `plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js` (regenerated via `npm run sync:editions`)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js` (regenerated)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js` (regenerated)
- `scripts/simulate-workflow-walkthrough.js` (4 new OPT-2 fixtures: absolute-path refuse, backslash refuse, bare-existing-directory refuse, root-file accept-control)

## Verification

- RED: `node scripts/simulate-workflow-walkthrough.js` failed on the absolute-path fixture pre-fix (in-grammar instead of refuse).
- GREEN: `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed" post-fix.
- `npm run sync:editions` then `node scripts/edition-sync.js --check` → 10 forge aggregator ports / 24 COMMON_SCRIPTS mirrors / 27 byte-identical groups in parity (no hand-edit drift).
- `npm test` (four-chain claude && codex && gitlab && gitea) → exit 0.

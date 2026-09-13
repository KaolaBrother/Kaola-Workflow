# Documentation Docking — issue-1076

## Changed files reviewed
templates/routing/{next,finalize}.skeleton.md, templates/routing/required-blocks.js,
scripts/test-issue-1053-next-task-quality.js, 12 generated routing surfaces (commands/ + 3 plugin
mirrors), scripts/fixtures/issue-1055-render-baseline.json, README.md, docs/api.md,
docs/prompt-size.md, docs/decisions/0022-machine-global-workflow-contract.md, CHANGELOG.md.

## Documents checked
README.md, docs/api.md, docs/prompt-size.md, docs/README.md, CHANGELOG.md,
docs/decisions/0022-machine-global-workflow-contract.md, docs/architecture.md,
docs/conventions.md, docs/cursor-edition.md.

## Gaps found and fixed
- `test-issue-1052` pin regression inherited from `4ef4b755` (main red): README lost the pinned
  Cursor CLI `--ensure-target` prep and App-like `--worker-dir` ensure-skip statements. Fixed on
  branch (`cc077eeb`) — compact two-sentence form restored beside the edition-guide link;
  suite re-run 251 assertions green.
- README token table and `docs/prompt-size.md` raw-word table carried pre-#1076 baseline numbers;
  re-measured on the final candidate per the documented method and re-labelled `v12.0.1`
  ahead of the publication commit (`c07d82e3`, `54058d96`).
- CHANGELOG `[Unreleased]` gained a re-measure Documentation bullet; `[12.0.0]` section untouched.

## No-impact reasons
- docs/architecture.md, docs/conventions.md: no behavioural contract changed — the run is a
  prose subtraction; every removed sentence's authority survives in the machine-global contract
  or the same prompt (evidence-1076-dedup.md maps each deletion).
- docs/cursor-edition.md: already carries the full CLI prep contract; README now links + keeps the
  pinned sentences.
- docs/README.md index: prompt-size.md already indexed by `4ef4b755`; no documents added/removed.

## Final verdict
DOCKED

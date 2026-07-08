evidence-binding: n4-docs e585c2bd2d46

## n4-docs — doc-updater

Edited `docs/api.md` (OPT-2 bullet, ~lines 403-413): extended the "exactly-resolvable single file"
enumeration to also name the three new refused shapes — absolute-path, backslash-separated, and
bare existing-directory — alongside the existing directory-shaped/glob/`../`-aliasing set, and
reworded the "reusing…" clause to say the check mirrors the same shape refusals the write-set
freeze-wall already applies (`hasUnresolvableEntry` plus the `../`-segment, absolute-path,
backslash, and `statSync`-based bare-existing-directory checks). No other OPT bullet touched.

Wrote `docs/decisions/D-640-01.md` (new ADR), following the `D-639-01.md` format: records the
decision to mirror the freeze-wall's three shape refusals onto OPT-2's `metric_paths` check
(`shapeReason(p)`, ~`kaola-workflow-plan-validator.js:1537`), the absolute-before-backslash
precedence, the recomputed local `optRoot`, the `OPT-2:`-prefixed refusal reasons, the
`testMetricOptimizerContract` RED-first fixtures (3 refuse + 1 accept-control), and the one
cosmetic non-blocking observation both gates raised (dir-shape-vs-absolute reason-string ordering
divergence between OPT-2 and the freeze-wall, no accept/refuse behavior difference). Verified the
edited OPT-2 bullet reads as valid markdown in place; verified the three new refusal reason tokens
(`absolute_path`, `backslash_in_path`, `bare-existing-directory`) and the test fixtures against
`scripts/kaola-workflow-plan-validator.js:1396-1548` and
`scripts/simulate-workflow-walkthrough.js:2367-2383` directly (not re-derived from the brief).

Files touched: `docs/api.md`, `docs/decisions/D-640-01.md` (new),
`kaola-workflow/issue-640/.cache/n4-docs.md` (this file). No other file touched.

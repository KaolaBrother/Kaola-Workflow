evidence-binding: n2-opt-freeze 66af7ba1ac7d

# n2-opt-freeze (#639) — harden metric-optimizer OPT freeze rules

## RED (bad plans freeze IN-GRAMMAR pre-fix — captured via a standalone validator probe)
RED: all six hardening-target plans returned `result: in-grammar` from `--json` BEFORE the fix:
- R1 `optimize(opt)` with NO `metric_command` → in-grammar (no OPT rule read `c.metric_command`; parser nulls it silently).
- R2 `metric_paths: bench/` (directory-shaped) → in-grammar (exact-string OPT-2 disjointness never matched `bench/suite.js`).
- R2 `metric_paths: bench/*.js` (glob) → in-grammar (exact-string disjointness misses a glob).
- R5 `metric_paths: bench/../src/hot.js` (`..`-alias of write-set `src/hot.js`) → in-grammar (aliases the write set but compares string-distinct).
- R3 two `optimize(opt):` blocks → in-grammar (parseOptimizeContracts Map.set last-wins; the duplicate silently clobbered).
- R7 a fenced-decoy `optimize(opt):` block inside `## Meta` → in-grammar (sectionBody returns the fenced block verbatim; last-win clobber hid a tampered field).

## GREEN (each rule REFUSES post-fix with its typed marker)
GREEN: post-fix `--json` flips every case to `result: refuse` with the intended marker:
- R1 → `OPT-2: optimize(opt) declares no metric_command — the metric harness command must be named`.
- R2 dir-shaped / glob → `OPT-2: … metric_paths bench/ (bench/*.js) are not exactly-resolvable single files (directory-shaped, glob, or '..'-aliasing) …`.
- R5 `..`-alias → same `OPT-2: … not exactly-resolvable single files …` refusal.
- R3 / R7 duplicate + fenced-decoy → `OPT-1: metric-optimizer node opt has 2 optimize(opt) blocks in ## Meta — exactly one optimize contract per node …`.
- R6 (numeric hex/exponent forms) → NO rule added (documentation-only; the cap always binds on the `Number()`-converted value, no unbounded escape).
- Regression: a fully-valid optimize plan still freezes in-grammar; existing OPT-1..OPT-6 accept/refuse fixtures stay green.

`node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed" (new accept + typed-refuse fixtures for R1/R2/R5/R3/R7 added RED-first, all green; incl. an `optimizeHeaderCounts` unit assertion counting duplicate headers = 2).
`npm run test:kaola-workflow:claude` → exit 0, green (proves canonical + codex byte-copy; no red, no #635-flake this run).
`node scripts/edition-sync.js --check` → green ("10 forge aggregator ports in rename-normalized parity with canonical").

## Files changed (declared 5-file write set)
- `scripts/kaola-workflow-plan-validator.js` (canonical, hand-edited): added `optimizeHeaderCounts()` helper + export; OPT-1 duplicate/decoy refusal (R3/R7); OPT-2 `metric_command` presence (R1) + unresolvable `metric_paths` refusal reusing `hasUnresolvableEntry` (dir-shape + glob) and the freeze-wall `..` split (R2/R5).
- `scripts/simulate-workflow-walkthrough.js` (hand-edited): RED-first accept + typed-refuse fixtures for R1/R2/R5/R3/R7 in `testMetricOptimizerContract`.
- `plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js` (codex byte-copy — regenerated via `npm run sync:editions --write`, NOT hand-edited).
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js` (rename-normalized port — regenerated).
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js` (rename-normalized port — regenerated).

Markers: R1→OPT-2 (metric_command required), R2/R5→OPT-2 (unresolvable metric_paths), R3/R7→OPT-1 (duplicate/decoy). R6 got NO rule (documentation-only, per task).

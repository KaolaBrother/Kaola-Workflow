# Planner output — issue #240 (fast path)

## approach_ambiguity: no

Exactly one sensible approach. The issue fixes the mechanism (append `_rules.md` content
under a `### Project rules` sub-heading after the hardcoded `RULES_BLOCK`, guarded, no-op
when absent) and supplies the code sketch. The builder is the single chokepoint both
`generate` (writes) and `validate` (recomputes-and-compares) flow through, so threading
`dir` into the builder is the only place the logic can live without breaking the validate
self-consistency invariant. No competing structural reading exists.

## Verified facts / corrections to the architecture review

- Caller list is exhaustive (repo-wide grep). Live call sites are only the four scripts
  below; `kaola-workflow/archive/**` hits are historical plan docs, not code.
- No external one-arg caller exists; nothing outside the four scripts invokes
  `buildRoadmapContent`; no test calls it directly. The `dir` guard is defensive for the
  export contract — keep it (it is in `module.exports`, costs nothing, prevents future
  regression).
- CORRECTION: the review's one-liner guard `if (dir && fs.existsSync(projRules))` is buggy
  if `projRules = path.join(dir, '_rules.md')` is computed first — `path.join(undefined,…)`
  throws synchronously. The `path.join` MUST be INSIDE the `if (dir)` block.
- CORRECTION: for gitlab/gitea, only `regenerateRoadmap` has a `dir` local. The `refresh`
  (L224) and `cmdValidate` (L244) sites are inline with NO `dir` local; they must pass
  `roadmapDir(root)` explicitly (both have `root` in scope).
- Edit shape is NOT uniform: github canonical + github plugin get an identical 2-call-site
  patch and MUST stay byte-identical (validate-script-sync.js COMMON_SCRIPTS). gitlab/gitea
  each get a distinct 3-call-site patch, not byte-checked against anything.

## #1 correctness invariant

Within each script, every `buildRoadmapContent` call site must thread `dir` consistently.
If one site passes `dir` and another doesn't, generate-output ≠ validate-expected → false
"stale", and (gitlab/gitea) `refresh` silently drops project rules.

## Canonical builder edit (all four scripts)

```js
function buildRoadmapContent(issues, dir) {
  const rows = issues.length > 0 ? issues.map(buildTableRow) : ['| none | No active work | — | — | — |'];
  let rules = RULES_BLOCK;
  if (dir) {
    const projRules = path.join(dir, '_rules.md');
    if (fs.existsSync(projRules)) {
      const extra = fs.readFileSync(projRules, 'utf8').trim();
      if (extra) rules += '\n\n### Project rules\n' + extra;
    }
  }
  return HEADER + '\n' + rows.join('\n') + '\n' + rules + '\n';
}
```
Preserve each file's existing `rows` line verbatim (github = multi-line ternary; gitlab/gitea = single-line).

## Per-file changes

- File 1 `scripts/kaola-workflow-roadmap.js`: L94 builder; L195 `regenerateRoadmap` → `(issues, dir)`; L236 `cmdValidate` → `(issues, dir)`.
- File 2 `plugins/kaola-workflow/scripts/kaola-workflow-roadmap.js`: IDENTICAL to File 1 (byte-sync enforced).
- File 3 `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js`: L94 builder; L224 refresh inline → `…, roadmapDir(root))`; L234 `regenerateRoadmap` → `(issues, dir)`; L244 `cmdValidate` inline → `…, roadmapDir(root))`.
- File 4 `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js`: same 3-site pattern as gitlab.

## Test (canonical home only)

Add `testRoadmapProjectRulesAppend(tmp)` to `scripts/simulate-workflow-walkthrough.js` after
`testRoadmapGenerateAtomicReplace`; register in `main()` right after that test's call.
Two-phase: (1) absent → assert no `### Project rules`; (2) present `_rules.md` → assert
`### Project rules` + exact rule text; (3) `validate` → exit 0 / `ok`. Do NOT touch existing
tests; do NOT add roadmap scaffolding to the other three walkthroughs.

## Docs

- `docs/api.md` L248: `buildRoadmapContent(issues)` → `buildRoadmapContent(issues, dir)` + behavior sentence.
- `docs/workflow-state-contract.md` "Generated Mirrors" (L104-111): document optional `_rules.md`.
- `CHANGELOG.md` `[Unreleased]`: one entry, all four editions, no-op when absent. NO version bump / release.

## Acceptance check commands

- `node scripts/simulate-workflow-walkthrough.js` → exit 0 + "Workflow walkthrough simulation passed".
- `node scripts/validate-script-sync.js` → exit 0 (github canonical ↔ plugin byte-identity).
- `npm test` → green (all four lanes).
- 3 manual port smoke-tests (gitlab/gitea generate+validate+refresh-threading inspection; github plugin generate+validate).

## Residual risk

gitlab/gitea `refresh` (L224) threading is verified only by inspection + smoke run — the
github-only walkthrough won't catch a typo there, and `refresh` calls the forge (network).
Treat L224 in both forks as the highest-attention line.

## Out of scope

Version bump/release/tag; changes to `readRoadmapIssues`/matcher/`RULES_BLOCK`/`HEADER`;
a `_rules.md` schema/format/ordering; roadmap tests in other walkthroughs; an absent-case
standalone test; touching `module.exports`; editing the generated `ROADMAP.md` by hand.

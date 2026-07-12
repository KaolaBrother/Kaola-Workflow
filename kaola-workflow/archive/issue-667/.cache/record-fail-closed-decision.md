evidence-binding: record-fail-closed-decision cb8e33789f50
<!-- docs_updated: paste docs_updated here -->
docs_updated: CHANGELOG.md, docs/decisions/D-667-01.md

## What was written

Read `git diff HEAD` first to ground both docs in the actual shipped consumer-only classifier
change (touches only `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js`,
`scripts/kaola-workflow-classifier.js`, `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js`,
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js`, and their three test
files + `scripts/simulate-workflow-walkthrough.js`). Confirmed facts used, all traceable directly
to the diff:

- `scanClaimedOverlap` now calls `sectionBodyState(fs.readFileSync(fastSummary, ...), 'Scope')`
  instead of `sectionBody(...)` for the claimed fast project's Scope read, in all four classifier
  editions (canonical `scripts/kaola-workflow-classifier.js` + `plugins/kaola-workflow/scripts/...`,
  gitlab, gitea).
- New per-scan flags `hasAmbiguousScope` / `ambiguousScopeProject`, set when
  `fastState.status === 'ambiguous'`; when `fastState.status === 'present'`, the body is folded in
  as before; `absent` status is not folded (unchanged no-write-set behavior).
- `classify()` now checks `hasAmbiguousScope` FIRST (before exact/direct/shared/area-label/curated
  overlap checks) and returns `{ verdict: 'red', reasoning: 'claimed project "<name>"
  fast-summary.md has a structurally ambiguous/unparseable ## Scope section (unclosed fence or
  duplicate heading); write set indeterminate; conservative red' }`.
- The pre-existing #215 regression test (`testClassifierFastScopePreSectionUnclosedFenceRed` in
  the walkthrough, and its per-forge twins in the gitlab/gitea test files) is flipped from
  asserting `green` to asserting `red` for an unclosed pre-Scope fence in a CLAIMED project's
  fast-summary.md — this is the exact fail-open regression #667 fixes.
- A new companion test, `testClassifierFastScopeAbsentNotManufacturedOverlap`, pins that a
  genuinely absent `## Scope` (no heading at all, status `absent`) still classifies `green` — the
  scanner/consumer must not manufacture an overlap from nothing. This confirms the "absent
  unchanged" claim in both docs is accurate, not assumed.
- Scanner primitives (`sectionBody`, `sectionBodyState`) themselves are NOT touched by this diff
  — only their consumer (`scanClaimedOverlap` / `classify`) changed. This matches the "scope of
  the change" claim in both CHANGELOG entry and ADR.

No field names, function signatures, or behavior were invented beyond what's shown in the diff.
The "#660 fail-open regression" framing is the task's settled decision statement (D-661-01/D-660
context confirmed by presence of `docs/decisions/D-661-01.md` in the repo and absence of any
`D-660-*.md` file — #660's trade was never recorded as its own decision, which is exactly why this
ADR exists and says so).

### CHANGELOG.md

Added one bullet under the existing `## [Unreleased]` / `### Fixed` section, appended AFTER the
existing #665 entry (did not disturb #664/#665/#666 entries). Paraphrased into house style
(bold lead sentence ending in `— #667.`, present-tense description, edition-coverage closer,
decision-record pointer at the end matching the `#661` entry's pattern of citing its ADR inline).

### docs/decisions/D-667-01.md (new)

Mirrored the structure of `docs/decisions/D-661-01.md` (title / Date / Status / Related header
block, then `## Context`, `## Decision`, `## Consequences`), adding a `## Scope of the change`
section between Decision and Consequences to explicitly carve out what did NOT change (scanner
primitives, absent-Scope behavior) since that boundary is load-bearing for the fail-closed-not-
overreaching framing. Content follows the task's settled decision statement: FAIL-CLOSED verdict
on ambiguous Scope, context of the #660 regression (sectionBody collapsing ambiguous+absent to
the same `''`), rationale (value call routed via consent, not an auto-derivable fact), scope
carve-out, and consequences (conservative red + the RED-first tests that pin it, referencing the
two flipped/added tests confirmed in the diff/walkthrough).

Provenance (issue #667, decision id D-667-01) kept ONLY in these two doc surfaces — no
provenance added to any agent-facing prompt/command/skill file (none were touched).

## Checks

- `node scripts/simulate-workflow-walkthrough.js` — exit 0, final line
  "Workflow walkthrough simulation passed" (confirmed via background run output, tail included
  `testGateEvidenceNonceRotation654: PASSED` then the pass banner). Docs-only change; no script
  files touched, so this run reconfirms baseline (not a regression check for this node's change,
  but requested and passed).
- `git diff --stat -- CHANGELOG.md docs/decisions/D-667-01.md` shows CHANGELOG.md modified (+2
  lines) and D-667-01.md is a new untracked file (stat only reports the tracked-modified file;
  the new file is present on disk at the path above).
- Write set touched: exactly `CHANGELOG.md` and `docs/decisions/D-667-01.md` — no other files
  edited, no git add/commit performed.

## Result

pass

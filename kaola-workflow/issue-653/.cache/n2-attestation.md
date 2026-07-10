evidence-binding: n2-attestation 7ec679259eca
upstream_read: n1-design 3dee366bd213

RED: `node scripts/simulate-workflow-walkthrough.js --only testAttestationWarningPersistence` failed
before any implementation edit: `Error: attestation persistence: archived finalization-summary.md
must exist` (claim.js persisted the warning only to stdout JSON, never to the archived summary).
Mirrored in the codex edition: `node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
failed identically at `testAttestationWarningPersistenceCodex`: `Error: attestation persistence
(codex): archived finalization-summary.md must exist`. Contract-validator RED (needles added before
the TOML/SKILL/claim.js edits): `node scripts/validate-workflow-contracts.js` -> `Error:
scripts/kaola-workflow-claim.js must include: ## Attestation`; `node
scripts/validate-kaola-workflow-contracts.js` -> `Error: plugins/kaola-workflow/agents/workflow-planner.toml
must include: --attest-planner-spawn`; identical shape (own pluginRoot path) for
`plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` and
`plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`.

GREEN: `node scripts/simulate-workflow-walkthrough.js` (full suite) -> "Workflow walkthrough
simulation passed" (testAttestationWarningPersistence: PASSED, all other cases green). `node
plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` (full suite) -> "Kaola-Workflow
walkthrough simulation passed" (testAttestationWarningPersistenceCodex: PASSED). All 5 contract
validators green: `node scripts/validate-workflow-contracts.js` -> "Workflow contract validation
passed"; `node scripts/validate-kaola-workflow-contracts.js` -> "Kaola-Workflow Codex contract
validation passed"; `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
-> "Kaola-Workflow GitLab contract validation passed"; `node
plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` -> "Kaola-Workflow
Gitea contract validation passed". `node scripts/test-route-reachability.js` -> "Route-reachability
test passed (369 assertions)." `node scripts/validate-script-sync.js` -> "OK: 24 common scripts, 27
byte-identical groups, 8 rename-normalized families, 2 hooks.json families (config + hooks dir), and
7 forge export-superset families in sync." `--forbidden-only` spot-checks on the 4 changed gitlab
files and 4 changed gitea files both passed: "Kaola-Workflow GitLab forbidden-only check passed (4
file(s))" / "Kaola-Workflow Gitea forbidden-only check passed (4 file(s))".

## Anchors verified (against n1-design's claims, before editing)
- `checkDispatchAttestations` scripts/kaola-workflow-claim.js:79-122 confirmed (fields
  claim_planner_attested/finalize_contractor_attested; warnings pushed at :92/:102/:117/:120).
- `appendClosureBlock` at :1734 confirmed (presence-guarded on /^## Closure$/m).
- cmdFinalize call site: `checkDispatchAttestations` at :2565, `computeGoalCheck` at :2568 (both
  matched n1-design's line numbers exactly pre-edit).
- `buildClosureReceipt` / `closureReceipt.warnings` confirmed always an array (seeded by
  `closureContract.emptyReceipt`), and `claim_planner_attested`/`finalize_contractor_attested` are
  declared enum fields in scripts/kaola-workflow-closure-contract.js:35-36.
- `agents/workflow-planner.md:294` already carried `--attest-planner-spawn` pre-run — confirmed via
  the codex/gitlab/gitea validators' pre-existing needle at the same flag on
  `scripts/kaola-workflow-claim.js`; no edit made to agents/workflow-planner.md itself, per spec.

## Implementation summary (A1-A5)

**A1 (TOML trio, byte-identical).** Inserted one sentence after "This creates the worktree +
workflow-state.md." in all three `agents/workflow-planner.toml` (plugins/kaola-workflow,
-gitlab, -gitea), verbatim per n1-design's edit instruction 1. md5 before: `115bf47e09732ea7970b0496a8dae08a`
(matches n1-design's stated pre-edit hash); md5 after (all three identical):
`ead1d06bb9490e8579ce1a6b17b98d5f`.

**A2 (adapt SKILL x3).** Two touch points each in plugins/{kaola-workflow,-gitlab,-gitea}/skills/kaola-workflow-adapt/SKILL.md:
(1) single-issue startup call — appended `--attest-planner-spawn` to the backticked command and the
REQUIRED-flag sentence to the parenthetical (gitlab differs only in its pre-existing `--sink mr` vs
`--sink pr`/`--sink mr` forge noun, already present before my edit — I matched each file's existing
text exactly); (2) bundle startup bash block — inserted `  --attest-planner-spawn \` between
`--target-issues 42,47,53 \` and `$KAOLA_DISPATCH_MODE_FLAG`. No forge-CLI tokens added to TOMLs (A1
text is forge-neutral prose only).

**A3 (claim.js root + codex byte-copy).** Added `persistAttestationToSummary(destDir, receipt)`
beside `appendClosureBlock` (new function, ~28 lines): presence-guarded on `/^## Attestation$/m`,
create-if-absent, filters `receipt.warnings` for entries starting `ATTESTATION WARNING` or
`attestation:`, always writes the two column-0 status fields even when both attested, swallow-on-error.
Call site: `if (result.dest) persistAttestationToSummary(result.dest, closureReceipt);` inserted
immediately after `checkDispatchAttestations([archiveCacheDir, liveCacheDir], closureReceipt);` and
before the `computeGoalCheck` call (single-issue cmdFinalize path). Extended `appendClosureBlock`
with two new lines (`claim_planner_attested`, `finalize_contractor_attested`) so the archived
workflow-state.md `## Closure` block is self-contained; updated its single-issue call site to pass
`claimPlannerAttested: closureReceipt.claim_planner_attested` /
`finalizeContractorAttested: closureReceipt.finalize_contractor_attested`. Also updated the
pre-existing SECOND `appendClosureBlock` call site (the bundle watch-pr merged-closure path at the
former :3277, unrelated to cmdFinalize) to pass the equivalent `folderReceipt` fields — required for
correctness, since leaving them unpassed would have emitted literal `claim_planner_attested:
undefined` into that path's archived Closure block (this call site already runs
`checkDispatchAttestations` and therefore already has the values available). This is the only
touch outside the two hunks n1-design named; it is a mechanical consequence of extending the shared
`appendClosureBlock` function, not new scope. claim.js root<->codex byte-copy confirmed identical:
md5 `b8fce212135edd714601e1986d8ecbc4` both.

Claim.js hunks in this node (for n6's accumulated-diff attribution): (1) `persistAttestationToSummary`
function + its cmdFinalize call site, (2) `appendClosureBlock` field extension + both of its call
sites (single-issue cmdFinalize + bundle watch-pr). No other claim.js hunks.

**A4 (contract-validator needles).** Added to all 5: codex validator (near the existing
`--attest-planner-spawn` pin on claim.js) — asserts on `agents/workflow-planner.toml` and
`skills/kaola-workflow-adapt/SKILL.md`; identical pair added to the gitlab and gitea validators
(each against its own pluginRoot); root/claude validator — asserts `agents/workflow-planner.md`
carries the flag (already true, confirms no drift) plus the persistence-lock needle
`assertIncludes('scripts/kaola-workflow-claim.js', '## Attestation')`. Root <-> codex copy of
validate-workflow-contracts.js kept byte-identical: md5 `ae8da98b68860b09de2a9ae9311791d7` both.

**A5 (finalize prose, kept to the persistence contract only).** Added one "Warning persistence"
paragraph after the existing "Inline-fallback contract" paragraph in
commands/kaola-workflow-finalize.md, and after the existing "Attestation boundary" paragraph in all
3 finalize SKILL.md files (identical wording across all 3 — verified the pre-edit paragraph was
byte-identical across the trio before appending). agents/contractor.md: appended two sentences to
the existing `--attest-contractor-spawn` explanation paragraph. contractor.toml x3: extended the
existing Step 8b one-line description with an inline clause naming the `## Attestation` append,
right before "and renames kaola-workflow/{project}/ into archive/." — kept byte-identical across the
trio (md5 `9a32a83013f8e53f29c13219af6479a4` all three, confirmed both before and after this edit).
No new needles required by A4 in these prose files (only claim.js/TOML/SKILL are pinned) — prose
kept minimal per the task direction ("only as far as the persistence contract requires").

## RED test design (A6, root + codex mirror)
`testAttestationWarningPersistence` (scripts/simulate-workflow-walkthrough.js, inserted immediately
before the existing `testPlannerAttestFlagBackfillsDispatchLog` comment block, registered in the
`add(...)` list right after `testContractorAttestAbsentWarnsNonBlocking338`): startup (no attest
flag), manually seed `.cache/dispatch-log.jsonl` with ONLY a contractor entry (no workflow-planner
entry — the exact inline-bypass scenario the warning exists to catch), run finalize, assert
`status:closed`, `closure_receipt.claim_planner_attested === 'missing'`, archived
`finalization-summary.md` exists and contains column-0 `claim_planner_attested: missing` plus the
verbatim `ATTESTATION WARNING: no workflow-planner dispatch found in dispatch-log` substring, and
archived `workflow-state.md` carries `## Closure` with the same column-0 `claim_planner_attested:
missing` line. `testAttestationWarningPersistenceCodex`
(plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, inserted before
`testKeepOpenArchiveStamp333` and registered right after the existing `testAC3AttestationSeeded()`
call) mirrors the same shape using the codex edition's offline `runClaim`/`plantRoadmap` harness
pattern (following `testAC3AttestationSeeded` as the template).

## Chain posture at close
claude (root walkthrough + root validator) and codex (codex walkthrough + codex validator) both
fully green. gitlab/gitea: contract validators fully green (needles added + passing), forbidden-only
spot-check on the 4 changed files per edition passing; per the node brief, no new gitlab/gitea
walkthrough behavioral scenarios were added (the forge claim-port mirror lags until n6-claim-ports,
so gitlab/gitea claim.js do not yet have `persistAttestationToSummary` — this is expected and
consistent with n1-design's isolation note that n3/n4 contribute zero claim.js hunks and n6 mirrors
n2's hunks into the two forge claim ports).

## Per-file summary
- plugins/{kaola-workflow,-gitlab,-gitea}/agents/workflow-planner.toml — A1 sentence, byte-identical trio.
- plugins/{kaola-workflow,-gitlab,-gitea}/skills/kaola-workflow-adapt/SKILL.md — A2 two touch points each.
- scripts/kaola-workflow-claim.js + plugins/kaola-workflow/scripts/kaola-workflow-claim.js — A3, byte-identical pair.
- scripts/validate-kaola-workflow-contracts.js — A4 codex needle pair.
- scripts/validate-workflow-contracts.js + plugins/kaola-workflow/scripts/validate-workflow-contracts.js — A4 claude needle pair + persistence lock, byte-identical pair.
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js — A4 needle pair.
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js — A4 needle pair.
- scripts/simulate-workflow-walkthrough.js — A6 RED test `testAttestationWarningPersistence` + registration.
- plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js — A6 codex mirror `testAttestationWarningPersistenceCodex` + registration.
- commands/kaola-workflow-finalize.md — A5 "Warning persistence" paragraph.
- plugins/{kaola-workflow,-gitlab,-gitea}/skills/kaola-workflow-finalize/SKILL.md — A5 "Warning persistence" line each.
- agents/contractor.md — A5 two sentences.
- plugins/{kaola-workflow,-gitlab,-gitea}/agents/contractor.toml — A5 inline clause, byte-identical trio.
- scripts/test-route-reachability.js — declared-but-untouched, per n1-design's note (routes did not change); confirmed still green.

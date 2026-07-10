evidence-binding: n5-selection-rungaps f05d57b01682
upstream_read: n1-design 3dee366bd213
upstream_read: n2-attestation 7ec679259eca
upstream_read: n3-sink-journal b039e808d87b
upstream_read: n4-candidate-binding 9c525d832610

RED: (D1 gap-sweep reverse containment) `node scripts/test-gap-sweep.js` failed against the
unmodified `runCheck` before the fix (confirmed by `git stash` on the 4 gap-sweep implementation
files, re-running the flipped test file against the clean tree, then `git stash pop`):
`FAIL: T9: gate exits non-zero on an observed-but-unseeded gap even with empty sweep`,
`FAIL: T9: result = refuse`, `FAIL: T9: reason = observed_gap_unseeded, got undefined`,
`FAIL: T9: unseeded array has exactly 1 entry`, `FAIL: T9: detail names run-gaps-manual.md`
(`gap-sweep tests FAILED (5 failures, 48 passed)`) — proving the exact vacuous-pass hole D1
describes: a hand-typed `## Run gaps` entry with an empty `sweptClasses` passed the gate silently
because `runCheck` returned on the empty-sweep branch before ever reading the summary.

RED: (D3 selection-evidence probe) `node scripts/simulate-workflow-walkthrough.js --only
testSelectionEvidenceDocking` failed against the unmodified `claim.js`/`closure-contract.js`
(confirmed by `git stash` on `scripts/kaola-workflow-claim.js`,
`plugins/kaola-workflow/scripts/kaola-workflow-claim.js`, and all 4
`kaola-workflow-closure-contract.js` copies, re-running, then `git stash pop`): `Error:
selection-evidence: seeded selection-evidence.md must read closure_receipt.selection_evidence
=== present, got: {"project":"issue-653201",...,"goal_check":"absent",...}` — the field is
entirely absent from the emitted closure receipt (no `selection_evidence` key at all), proving
D3's probe/attach never ran before the fix.

GREEN: `node scripts/test-gap-sweep.js` -> `gap-sweep tests passed (55 assertions)` (T1-T8
pre-existing + new T9 observed_gap_unseeded-refuse / T10 seeded-then-passes /
T11 forward-direction-still-refuses-gaps_unswept, all PASSED). `node
scripts/simulate-workflow-walkthrough.js --only testSelectionEvidenceDocking` ->
`testSelectionEvidenceDocking: PASSED`. `node
plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` (codex mirror, full suite)
-> `testSelectionEvidenceDockingCodex: PASSED` amid `Kaola-Workflow walkthrough simulation
passed`. Full root walkthrough -> `node scripts/simulate-workflow-walkthrough.js` ->
`Workflow walkthrough simulation passed` (includes `testSelectionEvidenceDocking: PASSED`
beside all pre-existing cases green, unchanged). All 5 contract validators green: `node
scripts/validate-workflow-contracts.js` -> "Workflow contract validation passed"; `node
scripts/validate-kaola-workflow-contracts.js` -> "Kaola-Workflow Codex contract validation
passed"; `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
-> "Kaola-Workflow GitLab contract validation passed"; `node
plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` -> "Kaola-Workflow
Gitea contract validation passed"; the 5th declared file
(`plugins/kaola-workflow/scripts/validate-workflow-contracts.js`) confirmed byte-identical to root
(md5 match) — non-runnable from a repo checkout per n4's prior note, unaffected by this node.
`node scripts/generate-routing-surfaces.js --check` -> "all 12 surfaces byte-match the skeleton."
`node scripts/validate-script-sync.js` -> "OK: 24 common scripts, 27 byte-identical groups, 8
rename-normalized families, 2 hooks.json families (config + hooks dir), and 7 forge
export-superset families in sync." `node scripts/test-route-reachability.js` -> "Route-reachability
test passed (369 assertions)." Four cross-edition chains, run SEQUENTIALLY (not `&&`-shortcircuited),
each exit 0: `npm run test:kaola-workflow:claude` CLAUDE_CHAIN_EXIT_STATUS=0 (includes
`testSelectionEvidenceDocking: PASSED`, `Workflow walkthrough simulation passed`,
`generate-routing-surfaces --check: all 12 surfaces byte-match the skeleton.`,
`test-generate-routing-surfaces: all 33 assertions passed.`); `npm run test:kaola-workflow:codex`
CODEX_CHAIN_EXIT_STATUS=0 (includes `testSelectionEvidenceDockingCodex: PASSED`, "Kaola-Workflow
walkthrough simulation passed"); `npm run test:kaola-workflow:gitlab` GITLAB_CHAIN_EXIT_STATUS=0
("GitLab workflow walkthrough simulation passed", "GitLab Codex workflow walkthrough simulation
passed"); `npm run test:kaola-workflow:gitea` GITEA_CHAIN_EXIT_STATUS=0 ("Gitea workflow
walkthrough simulation passed", "Gitea Codex workflow walkthrough simulation passed"). All four
green with ZERO gitlab/gitea claim-port changes in this node (n6 mirrors n5's + n2's claim.js
hunks into the two forge claim ports; the gitlab/gitea chains stayed green through n5 because
D3's probe/attach was scoped to root+codex claim.js only, and the closure-contract schema field is
shared/byte-identical, so gitlab/gitea walkthroughs never needed a matching probe call to pass).

## Anchors verified (against n1-design's D section claims, before editing)

- `scanManual` scripts/kaola-workflow-gap-sweep.js:112-140 confirmed (grammar `gap: <class> —
  <text>`, em-dash/ASCII-dash split, `manual:<slug>` reasonClass).
- `runCheck` vacuous pass confirmed at the ORIGINAL :254-264 (returned on `sweptClasses.length
  === 0` before ever calling `parseGapSection` — exactly the hole D1 describes; verified live via
  the RED repro above).
- `parseGapSection` :195-229 confirmed (strict entry regex :216, `- none`-style non-matching lines
  silently ignored, section-absent returns `null` vs section-present-but-empty returns `[]` — this
  distinction is what makes the "vacuous pass only when BOTH sides are empty" rule need `gapEntries
  === null || gapEntries.length === 0`, not just a null check).
- Forward matching loop (the pre-existing `gaps_unswept` check) confirmed unchanged after D1 —
  T2/T3/T4/T5 (pre-existing) still pass byte-for-byte unmodified assertions.
- `CLOSURE_RECEIPT_FIELDS` / `emptyReceipt` scripts/kaola-workflow-closure-contract.js:20-59 /
  85-103 confirmed (the `goal_check`-style null-default pattern D3 names is the exact template
  used for `selection_evidence`).
- `checkDispatchAttestations` call site + `liveCacheDir`/`archiveCacheDir` (archive-first, then
  live fallback) scripts/kaola-workflow-claim.js confirmed at the cmdFinalize single-issue path
  (post-n2-edit line numbers: :2589-2590) — `probeSelectionEvidence` reuses the SAME two
  candidates in the SAME order, per D3's "attach like probe_degraded" instruction.
- `commands/workflow-next.md` "Output → env wiring" section confirmed at the post-n1 line numbers
  (~:177-193 pre-edit) — matched n1-design's anchor before inserting the Selection Evidence
  Docking paragraph.
- `agents/issue-scout.md` Output Format section + issue-scout.toml ×3 Output contract bullet list
  confirmed as the correct one-line insertion points (issue-scout has TWO distinct evidence
  contracts — the plan-node `.cache/{node-id}.md` self-write contract for when it runs as a DAG
  node, and the pre-claim router-persists-verbatim contract for the auto-bundle survey; D2's new
  line is scoped to the SECOND, since only that path lacks a seeded `dispatch.evidence_file`).

## Load-bearing discovery not in n1-design's spec: `commands/workflow-next.md` + the 3 next
## SKILL.md files are GENERATED, not hand-editable

n1-design's D2 instruction named `commands/workflow-next.md` + next SKILLs ×3 as direct edit
targets (matching n3's B3 instruction for the plan-run surfaces, which n3 already discovered were
generated). I initially hand-edited `commands/workflow-next.md` and the 3
`skills/kaola-workflow-next/SKILL.md` files directly — this worked until I ran
`node scripts/generate-routing-surfaces.js --write` for the D4 plan-run-side edit, which
regenerates ALL 12 routing surfaces (both `plan-run` and `next` skeletons) from
`templates/routing/{plan-run,next}.skeleton.md` + `templates/routing/slots.js` and silently wiped
my D2 hand-edits back to the skeleton's pre-edit content. Confirmed via
`generate-routing-surfaces --check` showing all 12 surfaces byte-match the skeleton immediately
after the `--write` call (a clean overwrite, not a detected drift — my hand-edits were simply lost
without any error). Corrected by reverting to the skeleton-only editing discipline: the Selection
Evidence Docking paragraph now lives in `templates/routing/next.skeleton.md` at TWO locations
(the shared body inside `<!-- REGION:command -->` around the "Output → env wiring" bullet list,
which renders identically into `commands/workflow-next.md` AND both forge command mirrors
`plugins/kaola-workflow-{gitlab,gitea}/commands/workflow-next.md`; and the shared body inside
`<!-- REGION:skill -->` at the equivalent point, which renders into all 3
`skills/kaola-workflow-next/SKILL.md` packs) — neither location is nested inside a further
forge-specific sub-region, so a single skeleton edit reaches all 6 "next" surfaces uniformly (no
splice needed, since the paragraph's wording has no forge-specific noun). Re-ran
`generate-routing-surfaces.js --write` then `--check`; confirmed via `grep -c 'Selection Evidence
Docking'` that all 6 next surfaces (command × 3 forges + skill × 3 forges) carry exactly 1
occurrence, and all 6 plan-run surfaces carry exactly 1 occurrence of D4's "Run-Gap Manual
Seeding" paragraph (inserted once in the shared common body of
`templates/routing/plan-run.skeleton.md`, before the per-forge `<!-- REGION:command+github -->`
"Then proceed to finalize" tail — reached by ALL 4 command/skill variant renders since the other 3
variants' "then proceed"/"then delegate" sentence is folded earlier into their own
`pr-alldone-intro` splice text). This is the same class of "extra touch outside the declared
literal hunks" that n2's A3 and n3's B3 both recorded — a mechanical consequence of the
shared-skeleton architecture, not new scope. Confirmed no provenance leaked into any of the
regenerated surfaces: `grep -rln '#653'` across `agents/`, `commands/`, all 3 SKILL packs, the
TOMLs, and `templates/routing/` returns nothing.

## D1 — gap-sweep reverse containment (implementation)

Restructured `runCheck` in all 4 gap-sweep files (root, codex byte-copy, gitlab/gitea
rename-normalized ports) identically: `parseGapSection` now runs FIRST, unconditionally (even
when `sweptClasses` is empty) instead of after the old vacuous-pass early-return. A new reverse
containment block runs immediately after: every strict-regex `## Run gaps` entry (when
`gapEntries !== null && gapEntries.length > 0`) must exist in `sweptClasses` as an exact
`(reasonClass, sample)` tuple via `.some(...)`; any that don't → typed refuse
`observed_gap_unseeded` with `unseeded: [{reasonClass, sample}]` + a `detail` string naming the
`.cache/run-gaps-manual.md` remedy verbatim from n1-design's C3-style hint pattern. The vacuous-pass
check was moved AFTER the reverse-containment block and its condition changed from
`sweptClasses.length === 0` to `sweptClasses.length === 0 && (gapEntries === null ||
gapEntries.length === 0)` — pass only when BOTH sides are empty. The pre-existing forward
`gaps_unswept` check (section-absent-with-nonempty-sweep, and the per-tuple forward match loop)
is byte-unchanged below this point. Applied the IDENTICAL edit text to all 4 files (verified via
`node scripts/validate-script-sync.js` staying green with no new complaints after each edit, and
a direct `md5` match for the root/codex byte-pair).

## D3 — selection-evidence field + probe/attach (implementation)

**closure-contract.js ×4 (byte-identical).** Added `selection_evidence: ['present', 'absent']` to
`CLOSURE_RECEIPT_FIELDS` (comment explains the advisory/no-invariant/no-warning-on-absence
contract) and `selection_evidence: null` to `emptyReceipt()`'s returned object, mirroring the
`goal_check` field's exact template. Edited the root file then `cp`'d it byte-for-byte onto the
codex/gitlab/gitea copies (md5-confirmed identical across all 4 both before my edit and after).

**claim.js root + codex byte-copy.** New helper `probeSelectionEvidence(cacheDirCandidates)`
added beside `persistAttestationToSummary` (same file region as n2's A3 addition): iterates the
candidate dirs in order, `fs.readdirSync` + a `/^selection-evidence\./` regex test per dir,
returns `'present'` on first match, `'absent'` if none of the candidates contain a match or don't
exist (try/catch per dir, never throws). Call site: `closureReceipt.selection_evidence =
probeSelectionEvidence([archiveCacheDir, liveCacheDir]);` inserted immediately after the existing
`if (result.dest) persistAttestationToSummary(...)` line in `cmdFinalize`'s single-issue path —
same `archiveCacheDir`/`liveCacheDir` variables the attestation probe already computed (no new
variable, no new archive-vs-live resolution logic). Applied identically to the codex byte-copy;
`diff` confirms zero drift, md5 match both before and after.

**Claim.js hunks in this node (for n6's accumulated-diff attribution):** exactly ONE
function-plus-call-site pair — (1) `probeSelectionEvidence(cacheDirCandidates)` (new function,
scripts/kaola-workflow-claim.js:1775-1789 post-edit), (2) its single call site in cmdFinalize
(`closureReceipt.selection_evidence = probeSelectionEvidence(...)`, :2610-2612 post-edit,
immediately after n2's `persistAttestationToSummary` call). No other claim.js hunks from this
node. Per n1-design's isolation note, this is the SECOND of the two claim.js hunks n6 needs to
mirror into the two forge claim ports (the first being n2's persistAttestationToSummary +
appendClosureBlock extension).

## D2 — selection-evidence docking prose (implementation)

`templates/routing/next.skeleton.md`: one paragraph ("Selection Evidence Docking") inserted at
two locations (command-region body, skill-region body — see "Load-bearing discovery" above),
identical wording in both except "Startup Step 0a-1"-style vs "Startup transaction"-style phrasing
already established by the surrounding skeleton text at each insertion point. Rule: on the
no-issue-named branch, once the target project's active folder exists (after claim, before
dispatching the executor), the router persists the scout's ENTIRE JSON reply verbatim (fenced) to
`kaola-workflow/{project}/.cache/selection-evidence.md` with a one-line `selection_mode:
auto-bundle|single-issue` header; skipped entirely on the user-named-issue branch. Regenerated all
12 surfaces via `generate-routing-surfaces.js --write`; the paragraph now appears exactly once in
each of the 6 "next" renders (command × 3 forges + skill × 3 forges) — verified by grep count.

`agents/issue-scout.md`: one sentence added after the confidence-fallback paragraph in the Output
Format section, before "### Empty-Backlog Alternative Shape": "When dispatched pre-claim (the
router's auto-bundle survey, before any project exists), the router persists your JSON output
verbatim as the durable selection evidence — return it complete and valid."

`plugins/{kaola-workflow,-gitlab,-gitea}/agents/issue-scout.toml` (byte-identical trio, confirmed
md5 `2d5eb9991315b08918cc7c5a7688a07c` all three both before and after): one bullet added to the
Output contract list, distinguishing the pre-claim (no seeded `dispatch.evidence_file`) case from
the existing plan-node self-write contract: "When dispatched pre-claim (the router's auto-bundle
survey, before any project exists — no dispatch.evidence_file is seeded yet), the router persists
your JSON output verbatim as the durable selection evidence instead; return it complete and
valid."

## D4 — seeding prose (implementation)

`commands/kaola-workflow-finalize.md` + `plugins/{kaola-workflow,-gitlab,-gitea}/skills/kaola-workflow-finalize/SKILL.md`:
one new bullet added to the Run-Gap Sweep Gate section immediately after the existing
`gaps_unswept` bullet, naming the `observed_gap_unseeded` refusal, its trigger (a `## Run gaps`
entry with no matching machine-swept `.cache/run-gaps.json` entry), and its remedy (seed
`.cache/run-gaps-manual.md`, re-run the scanner, re-run `--check`). The gitlab/gitea SKILLs kept
their pre-existing "file a follow-up issue with the forge" wording variant for the sibling
`gaps_unswept` bullet untouched, matching only the shared closing sentence
("These typed refusals are classified structurally...", pluralized from "This typed refusal...").

`templates/routing/plan-run.skeleton.md`: one paragraph ("Run-Gap Manual Seeding") inserted in the
shared common body of the All-done section, after the candidate-hash binding guidance and before
the per-variant "then proceed to finalize" tail — reaches all 6 plan-run renders (command × 3
forges + skill × 3 forges) via a single skeleton edit, verified by grep count = 1 in each.

## D5 — RED tests (implementation)

**scripts/test-gap-sweep.js** — 3 new cases (T9/T10/T11), matching n1-design's exact spec:
- T9: a manual gap-sweep result with `sweptClasses: []` but a `## Run gaps` entry
  `manual:coresim-busy (one transient Busy event): noise: environment` → `--check` refuses
  `observed_gap_unseeded`, `unseeded` array has the exact tuple, `detail` names
  `run-gaps-manual.md`. RED-confirmed (see RED section above): this passed vacuously before D1.
- T10: the SAME gap, now seeded via `.cache/run-gaps-manual.md` (`gap: coresim-busy — one
  transient Busy event`), scanner emits `manual:coresim-busy`, `--check` passes `mapped:1,
  noise:1`.
- T11: reverse containment satisfied (a seeded manual gap mapped correctly) but a SECOND,
  unmapped, swept class (`in_run_repair` from a provenance reopen) still triggers the pre-existing
  forward `gaps_unswept` refusal — proves D1's new reverse check does not weaken or replace the
  forward check.

**scripts/simulate-workflow-walkthrough.js** — `testSelectionEvidenceDocking`, inserted
immediately after `testAttestationWarningPersistence` (both in the function body and the `add(...)`
registration list): case (a) seeds `.cache/selection-evidence.md` before finalize, asserts
`closure_receipt.selection_evidence === 'present'` and the file's survival under
`kaola-workflow/archive/{project}/.cache/selection-evidence.md`; case (b), a second project with
no docked file, asserts `'absent'`. RED-confirmed against the unmodified claim.js/closure-contract
(see RED section above).

**plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js** —
`testSelectionEvidenceDockingCodex`, inserted immediately after `testAttestationWarningPersistenceCodex`
(both in the function body and the registration call list before `testKeepOpenArchiveStamp333()`),
following the SAME `runClaim`/`plantRoadmap` offline-harness template n2 used for its codex mirror.
Mirrors both the present and absent cases.

## Chain posture at close

All four cross-edition chains green, run SEQUENTIALLY (not `&&`-chained): claude, codex, gitlab,
gitea — each exit 0 (see GREEN section above for full detail). `node
scripts/simulate-workflow-walkthrough.js`, the codex walkthrough, `node scripts/test-gap-sweep.js`,
`validate-script-sync.js`, all 5 contract validators, `test-route-reachability.js`, and
`generate-routing-surfaces.js --check` all independently green as the focused-validation checklist
required. No gitlab/gitea walkthrough behavioral scenarios were added for selection-evidence/gap-sweep
in this node (their forge claim ports still lack `probeSelectionEvidence` — n6 mirrors it in; their
closure-contract.js already carries the shared schema field, so their existing tests are unaffected
and stayed green throughout).

## Per-file summary

- `scripts/kaola-workflow-gap-sweep.js` + `plugins/kaola-workflow/scripts/kaola-workflow-gap-sweep.js`
  — D1 reverse-containment restructure, byte-identical pair (md5 confirmed).
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-gap-sweep.js` +
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-gap-sweep.js` — D1, rename-normalized
  identical edit (validate-script-sync.js confirms family intact).
- `scripts/test-gap-sweep.js` — D5 T9/T10/T11 new cases.
- `scripts/kaola-workflow-claim.js` + `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` —
  D3 `probeSelectionEvidence` + call site, byte-identical pair (md5 confirmed); see claim.js hunks
  note above.
- `scripts/kaola-workflow-closure-contract.js` + its 3 byte-identical copies — D3
  `selection_evidence` field + null default.
- `commands/workflow-next.md`, `plugins/{kaola-workflow,-gitlab,-gitea}/skills/kaola-workflow-next/SKILL.md`,
  `plugins/{kaola-workflow-gitlab,kaola-workflow-gitea}/commands/workflow-next.md` — D2, sourced
  through `templates/routing/next.skeleton.md` (see Load-bearing discovery above); no hand-edits
  survive in the final state.
- `agents/issue-scout.md`, `plugins/{kaola-workflow,-gitlab,-gitea}/agents/issue-scout.toml` — D2
  one-line docking-persistence contract, TOML trio byte-identical.
- `commands/kaola-workflow-finalize.md`, `plugins/{kaola-workflow,-gitlab,-gitea}/skills/kaola-workflow-finalize/SKILL.md`
  — D4 `observed_gap_unseeded` refusal row, hand-edited directly (finalize is not a generated-surface
  topic).
- `commands/kaola-workflow-plan-run.md`, `plugins/{kaola-workflow,-gitlab,-gitea}/skills/kaola-workflow-plan-run/SKILL.md`,
  `plugins/{kaola-workflow-gitlab,kaola-workflow-gitea}/commands/kaola-workflow-plan-run.md`,
  `templates/routing/plan-run.skeleton.md` — D4 "Run-Gap Manual Seeding" paragraph, sourced through
  the skeleton.
- `scripts/simulate-workflow-walkthrough.js` — D5 `testSelectionEvidenceDocking` + registration.
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` — D5
  `testSelectionEvidenceDockingCodex` + registration.
- `scripts/validate-kaola-workflow-contracts.js`, `scripts/validate-workflow-contracts.js` (+
  codex byte-copy `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`),
  `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`,
  `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — new needles
  pinning `selection-evidence`, `observed_gap_unseeded`, and `run-gaps-manual.md` across the
  relevant router/finalize/plan-run surfaces.
- `scripts/test-route-reachability.js` — declared-but-untouched, confirmed still green (369
  assertions; routes did not change).
- `templates/routing/slots.js` — declared but NOT touched by this node (no forge-specific noun
  needed in either new paragraph); already present in the working tree from n3's prior edit.

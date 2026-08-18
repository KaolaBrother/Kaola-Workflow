# Adversarial verdict — bundle-1001-1002

Verifier: adversarial (read-only falsifier). Candidate: the uncommitted diff in
`.kw/worktrees/bundle-1001-1002`. Burden inverted: both claims presumed false and attacked.
Every mutation below was made to PRODUCTION files one site at a time, run, quoted, and
byte-reverted (cmp-verified against pre-mutation snapshots).

## Claim 1 — arming proof

Baseline: `test-route-reachability.js` → `Route-reachability test passed (368 assertions).` exit 0.
All five mutations red for the right reason, name the right surface, exit 1:

| # | mutation (one surface, one site) | result |
|---|---|---|
| M1 | deleted the scan line from `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md` only | RED, exit 1: `FAIL: T6c: plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md splices no run-gap SCAN — no live line runs kaola-gitea-workflow-gap-sweep.js with --json...` — names THAT surface, the other five untouched |
| M2 | moved the scan AFTER the gate in `commands/kaola-workflow-finalize.md` | RED, exit 1, both ordering pins fire: `...splices the GATE at line 230 ahead of the SCAN at line 231...` and the grammar-ordering FAIL |
| M3 | placed the scan BETWEEN the row grammar (line 214) and the gate | RED, exit 1, grammar pin fires ALONE: `...states the "## Run gaps" row grammar at line 214 ahead of the SCAN at line 216...` — proves the two ordering pins are independent |
| M4 | stripped ` --project {project}` from the scan line | RED, exit 1: `...runs the scan without --project, which gap-sweep requires...` |
| M5 | rewrote the gitea surface's scan to invoke the GITHUB basename `kaola-workflow-gap-sweep.js` | RED, exit 1: gitea surface reported as splicing no scan — the pin binds each surface to its own forge's basename; one basename copied everywhere cannot satisfy it |

## Claim 1 — vacuity + ordering attacks

- **Universe cannot silently shrink.** T6c derives its 6 surfaces from `GENERATED_SURFACES`
  filtered on `topic === 'finalize'` and asserts `length === 6` before iterating; a filter that
  matches nothing fails that assert (suite exits 1 — the counting assert was proven live by M1–M5).
  `require('./generate-routing-surfaces.js')` is side-effect free (`require.main === module` guard
  at generate-routing-surfaces.js:397), so requiring the registry cannot regenerate/heal a mutated
  surface — M1–M5 confirm this empirically (mutations were seen, not healed).
- **Fresh-worktree immune.** All 6 registry paths are `git ls-files`-tracked (verified per path);
  none live under gitignored `.opencode`/`.kimi` trees. The known edition-suite vacuity trap does
  not apply.
- **Reads what ships.** T6c reads `path.join(REPO, row.path)` — the rendered files. Proven by
  construction: every mutation touched ONLY rendered surfaces (skeleton and slots.js untouched)
  and the suite went red each time. `generate-routing-surfaces --check` ("all 18 surfaces
  byte-match the skeleton") separately polices rendered↔skeleton.
- **Decoy lines.** Each rendered surface carries exactly two live `gap-sweep` mentions (e.g.
  github command: scan at 187, gate at 231; grammar at 215) — no fenced-example or prose decoy the
  line-index pin could latch onto today. `isLive` drops `#`-led lines. Residual (not a finding): a
  line-grep pin is inherently satisfiable by a future non-instruction mention carrying the
  basename + `--json`; nothing in the shipped candidate does so.
- **`$KAOLA_SCRIPTS` is defined in-block.** The scan's fenced block carries the
  `fz-scripts-resolver` line immediately above the invocation on all six surfaces. Executed the
  rendered resolver lines (185–186 of the github command) from the worktree root:
  `RESOLVED=./scripts` and `./scripts/kaola-workflow-gap-sweep.js` exists. Not an unset-variable
  instruction.

## Claim 1 — does the instruction work

Scratch project (`av-e2e/kaola-workflow/issue-4242` with a `.cache/run-gaps-manual.md` gap line and
a receipt carrying one `accepted_red` chain), running the worktree's script exactly as the surface
instructs:

1. **Premise** — gate with no prior scan (fresh `issue-4300`):
   `{"result":"refuse","reason":"artifact_missing","detail":"run-gaps.json not found; run --project issue-4300 first"}` exit 1.
2. **Scanner** — `--project issue-4242 --json`: exit 0, wrote
   `kaola-workflow/issue-4242/.cache/run-gaps.json`, stdout reported
   `"sweptClasses":[{"reasonClass":"deferred_red_chain",...},{"reasonClass":"manual:flaky-test",...}]`.
3. **Reconciliation** — wrote `## Run gaps` rows in the strict grammar from those sweptClasses,
   re-ran `--check --json`: `{"result":"pass","mapped":2,"filed":2,"noise":0,...}` exit 0.

The end-to-end loop the surface now describes genuinely closes.

## Claim 2 — arming proof (per site)

Baseline: `test-finalize-door.js` → `finalize-door tests passed (729 assertions)` exit 0.

- **Site 1 alone** (commented the three `if (diag.stale_*)` lines at
  `scripts/kaola-workflow-claim.js:4166-4168`, site 2 intact): exit 1, **7 failures, all
  envelope-side** — e.g. `FAIL: T15a (code-stale): checks.stale_paths carries the culprit path the
  finding computed, verbatim; got undefined`, plus T15b/T15c equivalents and the anti-aliasing pin.
  Controls and `## Validation` asserts stayed green → site 1 independently pinned, and the red
  measures the drop, not the fixture.
- **Site 2 alone** (commented the stale block at `scripts/kaola-workflow-claim.js:3968-3973`,
  site 1 intact): exit 1, **6 failures, all durable-summary-side** — e.g. `FAIL: T15a (code-stale):
  the durable ## Validation records stale_kind: code on its own line; got ["classification:
  chains_stale","green: false",...]`. Envelope asserts stayed green → site 2 independently pinned.
- `checks.validation` stays the bare string: asserted inside every T15 leg
  (`validation === 'chains_stale'` with an explicit string-shape message).

## Claim 2 — absent-stays-absent

- The ONLY producer is `computeChainsStaleDiagnostics`
  (`scripts/kaola-workflow-adaptive-schema.js:1140`): returns `null` when the receipt has no
  `headSha`, when `workTreeHash !== 'clean'`, when git fails, and when the visible path list is
  empty (`if (!paths || !paths.length) return null;`). It can never emit `stale_paths: []`.
- Every `chains_stale` finding gets its fields via `attachChainsStaleDiagnostics` (five call
  sites, all in adaptive-schema; `diag ? Object.assign : payload`) — no other writer of
  `stale_*` exists in claim.js/run-chains/adaptive-schema (grepped).
- Consumers are conditional pass-throughs: envelope `if (diag.stale_paths)`, summary
  `if (v.stale_paths && v.stale_paths.length)` — nothing forwards `[]`/`null`/`undefined`.
- The degrade legs are live tests, not prose: T15d (dirty-stamped `workTreeHash`) and T15e
  (deleted `headSha`) ran green at baseline asserting `hasOwnProperty` absence on the control,
  the envelope, and `/^stale_(paths|kind)/` absence on the summary lines.

## Claim 2 — four-copy diff

- Extracted the changed hunks per copy: **byte-identical across all four** (`diff` rc=0 for
  canonical vs each of codex/gitlab/gitea), 26 added lines each, zero forge tokens
  (`grep -i 'github|gitlab|gitea'` over the hunks: empty), landing at the same three anchors in
  every copy (`persistValidationToSummary`, the envelope doc comment,
  `evaluateFinalizePreconditions`). Propagation itself is clean and idiomatic (these ports share
  the canonical body at these functions).
- Codex copy: whole-file byte-identical to canonical (cmp), policed — mutating one line in
  `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` turned
  `validate-script-sync.js` RED (exit 1, names `kaola-workflow-claim.js`).

**FINDING (the one refutation): the gitlab and gitea copies are NOT guarded.** Disabled
`if (diag.stale_kind) checks.stale_kind = diag.stale_kind;` in
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (line 3944) and ran every
guard that could plausibly see it:

- `test-edition-sync.js` → `edition-sync tests passed (30 assertions)` exit 0 (claim.js is a
  declared HAND-PORT, exempt from generation/byte checks — edition-sync.js:30-35)
- `validate-script-sync.js` → all green, exit 0 (COMMON_SCRIPTS polices canonical↔codex only;
  the export-superset family checks export NAMES only)
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` → `GitLab workflow
  script tests passed` exit 0
- No gitlab/gitea test file references `chains_stale`, `persistValidationToSummary`, or
  `## Validation` (grepped); T15 spawns only `scripts/kaola-workflow-claim.js`
  (test-finalize-door.js:59); the walkthrough's `stale_paths` assertions (lines 819–843) are the
  #651 release-check on canonical run-chains, not the claim ports.

The repo's own pattern for exactly this class exists —
`testArchiveIntegrityPortedToAllEditions832` in `simulate-workflow-walkthrough.js` (comment: "the
cheap cross-edition pin that catches a hand port which silently skipped a remedy on one forge") —
and carries no #1002 tokens. Today's ports are correct (byte-identical hunks), but the claim says
"enforced by an armed guard across all four `*claim.js` copies", and for two of four copies no
guard reds when the behavior is removed.

finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=#1002 claim-2 guard clause: gitlab/gitea claim.js copies carry the fix but NO guard reds when it is removed there (measured: edition-sync 30-green, validate-script-sync green, test-gitlab-workflow-scripts green over the mutant); T15 pins canonical only, byte-parity pins codex only — the #832 four-copy token-pin pattern is the established cheap remedy and was not extended.

## Regressions

Final sweep on the fully restored tree, all green:
`generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.` ·
`Route-reachability test passed (368 assertions).` · `edition-sync tests passed (30 assertions)` ·
validate-script-sync `OK: 14 common scripts, 27 byte-identical groups, ... in sync` + kernel
parity · `finalize-door tests passed (729 assertions)` exit 0. The #1001 and #1002 changes touch
disjoint files; each other's suites were green throughout the other's mutations.

Note: `docs/api.md` + `CHANGELOG.md` were modified by a concurrent teammate (doc docking) DURING
this verification — see tree note below. I read the api.md hunks: they state exactly the behavior
measured here (stale fields absent-unless-diagnosed, stale_paths ≠ changed_paths, scanner/gate
exclusivity, artifact_missing) — no contradiction.

## Verdict

- **Claim 1 (#1001): SURVIVES.** Six surfaces, scan-before-grammar-before-gate, forge-correct
  basenames, guard mutation-proven armed per surface and per pin, vacuity attacks defeated,
  instruction verified end-to-end against a real scratch project.
- **Claim 2 (#1002): FALSIFIED AS STATED — on its guard clause only.** The behavior itself
  survives every attack (both sites independently pinned on canonical, absent-stays-absent
  proven at producer and both consumers, four copies byte-identical at the changed hunks, codex
  parity-policed). The final clause "enforced by an armed guard across all four `*claim.js`
  copies" is refuted by counterexample: a mutant gitlab copy passes every guard. R1 above.

Analytical result: claim 1 not_refuted; claim 2 refuted (guard clause; counterexample R1).
Confidence: high — every verdict above is backed by an executed command and quoted output.

verdict: fail
findings_blocking: 1

## Tree restored

All five mutated files byte-restored (cmp against pre-mutation snapshots: OK ×5). Final
`git status --short`:

```
 M CHANGELOG.md
 M commands/kaola-workflow-finalize.md
 M docs/api.md
 M plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
 M plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
 M plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
 M plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
 M plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
 M plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
 M plugins/kaola-workflow/scripts/kaola-workflow-claim.js
 M plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
 M scripts/kaola-workflow-claim.js
 M scripts/test-finalize-door.js
 M scripts/test-route-reachability.js
 M templates/routing/finalize.skeleton.md
 M templates/routing/slots.js
```

**16 files, not the 14 the brief predicted — the two extras (`CHANGELOG.md`, `docs/api.md`) were
NOT touched by me.** They appeared mid-verification from a concurrent teammate's doc-docking work
in this shared worktree (the original 14 are all present and unchanged in shape: same +474/-0
insertions as at start). I left them alone.

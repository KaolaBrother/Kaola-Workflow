evidence-binding: n1-fix 2969fd6a6aaa

# n1-fix — bundle-675-676 (#675 gap-sweep archive-awareness, #676 source-relative archive-completeness)

Repair pass after the adversarial change-gate REFUTED the #676 fix (R1, real ship-blocker). The
working-tree code was extended in place; #675 is untouched.

## #675 — gap-sweep not archive-aware (unchanged, correct)

Typed `project_archived` refusal in `runScan` when the active project folder is gone but an archived
copy exists — the scanner only reads the active `.cache/` tree, so it must not recreate a stray
active dir nor clobber the archived `run-gaps.json` via `--output`. `--json` emits
`reason:"project_archived"`; otherwise a stderr message. Never-claimed projects (neither active nor
archived) still scan vacuously (T13 guards against over-firing). Suite: `gap-sweep tests passed (68
assertions)`.

## #676 — source-relative archive-completeness gate + R1 free-form-node-id repair

Base mechanism (from the prior pass, retained): `verifyArchiveComplete(srcDir, destDir)` is
SOURCE-RELATIVE — the copied archive DEST must preserve every evidence file that ACTUALLY EXISTS in
the live SOURCE, never an absolute floor. `workflow-state.md` is kept as the ONE unconditional
archive-identity anchor. Only the copy+verify linked-run path calls the gate; the in-place
`renameSync` path is ungated (atomic whole-dir move drops nothing). Receipt honesty retained
(`archive_incomplete:true` + `missing:[...]` before any deletion; `cmdFinalize` typed
`archive_incomplete` refusal before any roadmap/issue/label side effect).

R1 DEFECT (refuted): `listSourceEvidenceFiles` enumerated `.cache/` node evidence with the glob
`/^n\d*-.+\.md$/`, but `sanitizeNodeId` allows ANY node id in `[A-Za-z0-9_-]+` — there is no
`n<digits>-<slug>` grammar. Proven against real archived runs: `bundle-414-418-422/.cache/` holds
`design.md`, `docs.md`, `finalize.md`, `parity-anchor.md`, `parity-validators.md`, `review.md`,
`t414.md`, `t418-forge-smoke.md`, `t418-manifest-twin.md` — ALL miss the glob; and full/fast runs
(`branch-issue-merge-sink/.cache/`) hold `planner.md`, `code-reviewer.md`, `security-reviewer.md`,
`architect.md`, `code-explorer.md`, `tdd-task-N.md`, etc. — all miss. A lossy copy dropping any of
them returned `{ok:true,missing:[]}` → both live copies deleted → the exact loss the fix claims to
prevent (silent degradation to the pre-fix state-only check for those run shapes).

R1 FIX (`listSourceEvidenceFiles`, all 4 claim editions): require EVERY `.cache/*.md` file present in
the source, regardless of node-id shape, EXCLUDING only the fixed-name finalize/machinery sub-step
sidecars. Broadened enumeration:
```
for each name in readdir(src/.cache):
  if name endsWith '.md' AND name NOT in ARCHIVE_CACHE_SIDECAR_MD:  require it in dest
```
Sidecar denylist (verified via codebase grep as fixed-name literals written by scripts/finalize SKILL,
NOT free-form per-node gate evidence):
- `final-validation.md` — finalize validation-gate evidence (column-0 `verdict: pass`); archiveProjectDir normalizes it by name
- `run-gaps-manual.md` — manual gap-sweep annotations
- `selection-evidence.md` — issue-selection evidence
- `doc-docking.md` — finalize Documentation-Docking sub-step (DOCKED/BLOCKED)
- `doc-updater.md` — finalize doc-updater sub-step output

Non-`.md` artifacts (`run-gaps.json`, `chain-receipt.json`, `barrier-base-*`, `barrier-open-*`,
`dispatch-log.jsonl`, `node-timings.jsonl`, provenance/running-set) are excluded by the `.md` filter.
Over-inclusion is fail-closed-safe: `copyDir` is fully recursive, so a faithful archive already
carries every `.cache/*.md` the source held — requiring extra can NEVER false-refuse a genuine copy
(confirmed: all finalize suites green with zero new refusals). Everything else about the gate (the
anchor, the ungated renameSync path, receipt honesty) is unchanged.

Regression extended in `scripts/simulate-workflow-walkthrough.js` (`testArchiveCompleteSourceRelative676`,
sibling to the #426 `testFinalizeArchiveVerifiesBeforeDelete`), adding DISCRIMINATING cases:
- (8) source with FREE-FORM node evidence (`design.md`, `review.md`, `finalize.md`, `t414.md`) whose
  dest drops `review.md` → MUST refuse (`missing` includes `.cache/review.md`).
- (9) faithful full copy with free-form + role-named evidence (`planner.md`, `code-reviewer.md`,
  `security-reviewer.md`, `n1.md`, `parity-anchor.md`) → PASS (no false-refuse).
- (10) dropping a fixed-name machinery sidecar (`final-validation.md` / `doc-updater.md`) → must NOT
  refuse (denylist scope proof).

RED — the discriminating case run against the pre-fix narrow glob (`listSourceEvidenceFiles`
temporarily reverted to `/^n\d*-.+\.md$/`, `node scripts/simulate-workflow-walkthrough.js --only
testArchiveCompleteSourceRelative676`):
```
Error: #676 src-rel: a dest dropping a FREE-FORM node-id evidence file (review.md) must refuse, got {"ok":true,"missing":[]}
```
(The narrow glob matched none of design/review/finalize/t414, so the dropped `review.md` was invisible
→ `{ok:true}` → both live copies deleted — the R1 evidence-loss bug.)

GREEN — broadened enumeration restored:
```
testArchiveCompleteSourceRelative676: PASSED
Walkthrough --only subset passed (1 scenarios)
```

## Full-suite GREEN (final clean pass)

- `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed`
  (includes the extended `testArchiveCompleteSourceRelative676` + the untouched
  `testFinalizeArchiveVerifiesBeforeDelete`)
- `node scripts/test-gap-sweep.js` → `gap-sweep tests passed (68 assertions)`
- `node scripts/test-bundle-finalize.js` → `test-bundle-finalize: all 135 tests passed` (zero
  false-refuse from the broadened enumeration)
- `node scripts/test-claim-hardening.js` → `claim-hardening tests passed (173 assertions)` (at HEAD)
- `node scripts/test-adaptive-node.js` → `adaptive-node tests passed (1797 assertions)`
- `node scripts/edition-sync.js --check` → parity clean (codex byte-twin in sync)
- `node scripts/validate-script-sync.js` → `OK: … 7 forge export-superset families in sync`
- Forge spot-run: `Gitea workflow walkthrough simulation passed` + `Gitea workflow script tests passed`

## Write-set discipline (barrier-safe)

`git status --porcelain` shows ONLY the declared write-set (10 files): gap-sweep ×4
(`scripts/kaola-workflow-gap-sweep.js` + codex byte-twin + gitlab/gitea hand-ports),
`scripts/test-gap-sweep.js`, claim ×4 (`scripts/kaola-workflow-claim.js` + codex byte-twin +
gitlab/gitea hand-ports), and `scripts/simulate-workflow-walkthrough.js`. `scripts/test-claim-hardening.js`
is NOT present (at HEAD); `scripts/test-adaptive-node.js` is NOT present (never edited); the other 5
walkthroughs are byte-identical to HEAD. No ledger/state/baseline touched; no git commit made.

RED: (R1, #676) against the pre-fix narrow `.cache` glob `/^n\d*-.+\.md$/`, a lossy archive dropping a
FREE-FORM node-id gate-evidence file (`review.md`, and by extension design.md / finalize.md / t414.md
/ planner.md / code-reviewer.md / …, the shapes real runs produce) returns `{ok:true,missing:[]}` →
both live copies deleted — see full RED block above. (#675) T12.1/T12.2 fail pre-fix with
`reason=undefined`/`result=swept` instead of `refuse`/`project_archived`.
GREEN: broadened enumeration requires EVERY `.cache/*.md` minus the 5 fixed-name machinery sidecars →
`testArchiveCompleteSourceRelative676: PASSED` (free-form drop refuses; faithful free-form/role-named
copy still passes — no false-refuse; sidecar drop does not refuse) inside a fully green canonical
walkthrough; gap-sweep 68/68; test-bundle-finalize 135/135 and test-claim-hardening 173/173 GREEN with
zero fixture breakage; test-adaptive-node 1797/1797; gitea walkthrough + script suite green;
edition-sync --check and validate-script-sync clean; all 4 claim editions carry the broadened gate.

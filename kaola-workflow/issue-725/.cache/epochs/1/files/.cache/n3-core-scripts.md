evidence-binding: n3-core-scripts 669b6397e8da
non_tdd_reason: behavior-preserving excision of a retired feature (fast/full paths) across three byte-mirror script families; no observable behavior changes for the surviving adaptive path and nothing to characterize, so there is no natural failing unit test — correctness is the four edition chains at finalize, and this leg's scoped proof is require-load + export-resolution + byte-identity.
build-green: all 12 edited files require-load cleanly (schema loads + its exports resolve; repair-state/compact-context load with the adaptive surface intact), the schema family is 4-way byte-identical, repair-state canonical==codex byte-identical with gitlab/gitea logical parity preserved, and compact-context is 4-way byte-identical.

upstream_read: n1-recon 30aed1d97859
upstream_read: n2-delete 337a3508b716

## task

Behavior-preserving symbol surgery on three byte-mirror families across all four editions, converging
on the Plan Notes symbol contract: adaptive-schema ×4 (`WORKFLOW_PATHS → ['adaptive']`, remove
`resolveInstalledPaths()` + `INSTALLED_PATHS_FIELD` machinery, keep `isLegalWorkflowPath` working for
adaptive, tolerate a stale `installed_paths` field on read / never write it); repair-state ×4 (excise
the PHASES/SKILLS 1-6 maps, `isFastWorkflowState`/`fastStateValid`/fast-project discovery, the full
verifier route, and escalated-fast reconstruction; keep the adaptive ladder + `projectHasAdaptivePlan`);
compact-context ×4 (prose-only removal of fast-summary / "Phase 4" mentions). Scoped verification only
(require-loads + export resolution + byte-identity); the full walkthrough is deliberately NOT run in this
leg (base claim.js still calls the removed symbol — that convergence is proven downstream/at finalize).

## verification_tier

build-green

## write_set (12/12, exact match to the n3-core-scripts row)

**adaptive-schema ×4 (4-way byte-identical, all named kaola-workflow-adaptive-schema.js)**
- scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js

**repair-state ×4 (canonical↔codex byte-identical; gitlab/gitea renamed ports)**
- scripts/kaola-workflow-repair-state.js
- plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-repair-state.js

**compact-context ×4 (all copies byte-identical; gitlab/gitea renamed ports)**
- scripts/kaola-workflow-compact-context.js
- plugins/kaola-workflow/scripts/kaola-workflow-compact-context.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-compact-context.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-compact-context.js

## what changed per family

### adaptive-schema ×4 (edited canonical, then cp byte-identical to the other 3)
- `WORKFLOW_PATHS` def: `Object.freeze(['fast','full','adaptive'])` → `Object.freeze(['adaptive'])`; header
  prose (lines ~20-24) reworded to "the only legal path" + a note that a stale `installed_paths` is
  tolerated on read / never written.
- Removed `const INSTALLED_PATHS_FIELD = 'installed_paths';` and the entire `resolveInstalledPaths(config)`
  function (+ its doc comment); the CONFIG_REL_PATH header prose was rewritten to drop the opt-in-field
  language and state the tolerate-on-read / never-write posture. `CONFIG_REL_PATH` itself is KEPT.
- Removed `INSTALLED_PATHS_FIELD` and `resolveInstalledPaths` from the `module.exports` object.
- `isLegalWorkflowPath(value, installedPaths)` KEPT verbatim (two-arg form): `value === ADAPTIVE_PATH ||
  (Array.isArray(installedPaths) && installedPaths.includes(value))` — with no caller supplying installed
  paths anymore, adaptive is the only legal path, and it stays maximally robust to whatever downstream n4
  passes (`[]`/undefined → adaptive-only). `WORKFLOW_PATHS`/`ADAPTIVE_PATH` exports KEPT.

### repair-state ×4 (canonical edited + cp→codex; gitlab & gitea edited separately as renamed ports)
Retired the fast + full (numbered-phase) machinery, leaving an adaptive-only reconstructor. Excised:
`PHASES`/`SKILLS` 1-6 maps; `isFastWorkflowState`/`fastStateValid`; fast-project discovery
(canonical `projectHasFastSummary`; gitlab/gitea the inline `fast-summary.md` activeProjects disjunct);
`verifyPhase5AtPointOfUse` (the full verifier route — this was the sole surviving dynamic shell of the
now-deleted `full-advance.js`, n1's critical coupling at canonical:415 / forge:201); `phase4TaskRows`/
`allPhase4TasksComplete`/`firstOpenPhase4Task`; the numbered `route()` and `routeFinalization()`;
`fastSummaryStatus`/`routeEscalatedToFull`/`routeFast`. `reconstruct()` reduced to finalization-summary
complete-check + workflow-plan.md → `routeAdaptive` + a typed "no adaptive plan available for repair".
`projectHasActiveState`/`stateLooksValid` reduced to the adaptive-only branch. gitlab/gitea `repair()`
`phase:` readout dropped its `isFastWorkflowState(...) ? 'fast' :` ternary. Removed `phase4TaskRows`/
`allPhase4TasksComplete`/`verifyPhase5AtPointOfUse` from every exports object (no KEPT file consumes them
— verified repo-wide; only the also-deleted tests did). KEPT: `routeAdaptive`, `projectHasAdaptivePlan`
(canonical/codex), `isAdaptiveWorkflowState`, `adaptiveStateValid`, `unresolvedCompliance`,
`delegationPolicyCompliance`, `complianceRows`, `stateContent`, `migrateActiveLegacyFolder`, discovery
infra. TRAP 1 honored: `escalated_to_full` (the adaptive consent-halt token in `routeAdaptive`) preserved
in all 4 copies; the routeAdaptive design-comment (which contrasts against the retired numbered pipeline
and carries `escalated_to_full`) left intact.

### compact-context ×4 (edited canonical + cp byte-identical to the other 3; no forge nouns in this file)
Prose-only edits to the compact-resume hint lines: "the current phase artifact or fast-summary.md and
compliance ledger" → "the frozen workflow-plan.md and its Node Ledger"; "If Phase 4 or Finalization
validation failed" → "If node execution or Finalization validation failed"; "reconstruct conservatively
from phase files or fast-summary.md" → "reconstruct conservatively from the frozen workflow-plan.md". No
code/logic change.

## byte-mirror discipline

- adaptive-schema: edited canonical, `cp` to codex/gitlab/gitea → 4-way byte-identical (cmp -s all pass).
- repair-state: edited canonical, `cp` to codex → byte-identical; gitlab & gitea edited with the same
  logical excisions adapted to their divergent hand-port structure (`'use strict'`, condensed comments,
  `repair()`/JSON `main()`, forge plan-validator require, 'GitLab'/'Gitea' preserved-section noun). Post-
  edit gitlab↔gitea diff contains ONLY the pre-existing formatting/comment-density deltas in KEPT code
  (stateContent positionFields/positionLines, fixOwner, migrateActiveLegacyFolder) — the excisions landed
  identically in both.
- compact-context: all 4 copies were byte-identical at baseline (no forge nouns); edited canonical + `cp`.

## verification_commands + outputs

1. Baseline byte-identity (pre-edit): schema 4-way identical; repair canonical==codex; compact
   canonical==codex — all `cmp` exit 0.
2. Removed-symbol residual sweep (post-edit), `grep`:
   - schema ×4: no `resolveInstalledPaths` / `INSTALLED_PATHS_FIELD` remain (comment/prose `installed_paths`
     tolerate-on-read note intentionally kept).
   - repair-state ×4: no `PHASES`/`SKILLS`/`isFastWorkflowState`/`fastStateValid`/`verifyPhase5AtPointOfUse`/
     `phase4TaskRows`/`allPhase4TasksComplete`/`firstOpenPhase4Task`/`routeEscalatedToFull`/`routeFast`/
     `routeFinalization`/`fastSummaryStatus`/`fast-summary`/`full-advance`/`function route(` → all "clean".
   - compact-context ×4: no `fast-summary` / `Phase 4` / `phase4` → "clean".
3. require-load + export resolution (`node -e require(...)`):
   - schema ×4: load OK; `WORKFLOW_PATHS === ["adaptive"]`; `resolveInstalledPaths`/`INSTALLED_PATHS_FIELD`
     === undefined; `isLegalWorkflowPath('adaptive') === true`, `isLegalWorkflowPath('fast') === false`.
   - repair-state ×4: load OK; `routeAdaptive` is a function; `verifyPhase5AtPointOfUse` === undefined;
     canonical/codex export 10 keys, gitlab/gitea export 11 (pre-existing `repair`+`stateLooksValid`).
   - compact-context ×4: `node <file>` on empty stdin runs OK (exit 0) for all four.
4. Functional smoke (reduced reconstruct, canonical): `reconstruct(root, wd, 'demo')` on an empty project →
   `{"reason":"no adaptive plan available for repair"}` (no throw); `isAdaptiveWorkflowState('workflow_path:
   adaptive') === true`, `isAdaptiveWorkflowState('workflow_path: fast') === false`.
5. TRAP 1: `escalated_to_full` occurrence counts — canonical/codex 2 (doc comment + code), gitlab/gitea 1
   (code; their routeAdaptive doc comment is shorter, pre-existing) — preserved everywhere.
6. Post-edit byte-identity (`cmp -s`): schema 4-way identical; repair canonical==codex identical; compact
   4-way identical — all pass.
7. Scope: `git status --porcelain` shows exactly 12 ` M` tracked files (this node's write set) + n2's staged
   `D` deletions + the untracked `kaola-workflow/issue-725/` project-state dir. No extra path touched.

## before_result

Working tree carried n2's 56 staged deletions; the 12 target files present and (per baseline cmp) in
their respective byte-mirror groups. No build/typecheck pipeline exists (Node scripts only); the leg's
build-green baseline is the per-file require-load, which passed for the kept core scripts before editing.

## after_result

All 12 files edited to the symbol contract and require-load cleanly; schema family 4-way byte-identical;
repair-state canonical==codex byte-identical with gitlab/gitea logical parity; compact-context 4-way byte-
identical. The critical dynamic coupling (repair-state constructing/shelling the deleted `full-advance.js`)
is removed. Per the brief, the full walkthrough / four edition chains are NOT run in this leg — base
claim.js still calls the now-removed `resolveInstalledPaths` (owned by downstream n4), so cross-file
convergence and the four-chain green verdict are proven downstream and at finalize. No commit made.

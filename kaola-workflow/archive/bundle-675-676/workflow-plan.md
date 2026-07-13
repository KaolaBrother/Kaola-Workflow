# Workflow Plan — bundle-675-676

<!-- plan_hash: f32939059d6cdcf939ee83a63657a0689dd0e4c32d18a28236da13e0737e3243 -->

## Meta
labels: area:scripts, bug, enhancement
sink: CHANGELOG.md
validation_command: npm test
speculative_open_policy: auto

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-fix | tdd-guide | — | scripts/kaola-workflow-gap-sweep.js, plugins/kaola-workflow/scripts/kaola-workflow-gap-sweep.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-gap-sweep.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-gap-sweep.js, scripts/test-gap-sweep.js, scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js | 15 | sequence | standard |
| n2-review | code-reviewer | n1-fix | — | 1 | sequence | reasoning |
| n3-adversary | adversarial-verifier | n2-review | — | 1 | sequence | reasoning |
| n4-finalize | finalize | n3-adversary | CHANGELOG.md | 1 | sequence | |

## Node Ledger

| id | status |
| --- | --- |
| n1-fix | complete |
| n2-review | complete |
| n3-adversary | complete |
| n4-finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-fix) | subagent-invoked | evidence-binding: n1-fix cad2ce49bc96 | |

| code-reviewer | subagent-invoked | evidence-binding: n2-review 729f69306d40 | |
| adversarial-verifier (n3-adversary) | subagent-invoked | evidence-binding: n3-adversary 68fabfc80328 | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize 7e5e1bf938cd | |
## Node Briefs

### n1-fix

Fix BOTH archived-evidence-integrity bugs test-first (RED before GREEN), across all four editions. The two fixes touch DISJOINT files (`gap-sweep.js` vs `claim.js`) but share the same four edition trees and the single four-chain cross-edition gate, so they are authored as ONE cohesive node (over-fanning two ~small disjoint edits into isolated legs would add a synthesizer + double edition-sync for negligible makespan gain). Write the failing regressions FIRST for each bug, then implement to GREEN.

**#675 — `gap-sweep.js` scanner is not archive-aware.** `runScan` (~:160) hardcodes `cacheDir = kaola-workflow/{project}/.cache` and unconditionally `fs.mkdirSync`s the output dir + writes an artifact — so a `--json` scan AFTER the project folder is archived (a) recreates a stray `kaola-workflow/{project}/` active dir with an empty sweep and (b) with an explicit `--output` at the archive, clobbers the archived `run-gaps.json` with empty `sweptClasses: []`. NOTE: `--check`/`runCheck` currently has NO archive fallback either (confirmed — grep `archive` in this file returns nothing), so the fix is NEW archive-awareness, not "reuse the --check fallback". **Deterministic contract (primary): REFUSE `project_archived`.** Before any scan/mkdir/write, detect the active project dir `kaola-workflow/{project}` is ABSENT and an archive `kaola-workflow/archive/{project}` EXISTS → emit a typed refusal (`--json`: `{ result: 'refuse', reason: 'project_archived', ... }`; else stderr message + non-zero exit). NEVER mkdir the active output path back into existence, NEVER write an empty artifact, NEVER clobber the archived `run-gaps.json`. Additionally guard the `--output`-at-archive clobber directly: if `--output` names an existing NON-empty `run-gaps.json` and the scan input cache is gone (would produce empty `sweptClasses`), refuse rather than overwrite. (A read-only archive-scan fallback is an ACCEPTABLE alternative to the refuse ONLY if it provably never recreates the active dir and never overwrites a non-empty artifact with empty — but the refuse is the floor and the deterministic RED-test contract.)

**#675 RED (`scripts/test-gap-sweep.js`):** set up a project `.cache`, move it to `kaola-workflow/archive/{project}` (simulate post-`cmdFinalize`), then run a `--json` scan and assert `result:refuse, reason:project_archived`; assert `kaola-workflow/{project}/` was NOT recreated; assert the archived `run-gaps.json` is byte-unchanged. Add the explicit-`--output`-at-archive clobber case. Use `KAOLA_GAP_ROOT` for the temp root (existing test convention).

**#676 — `verifyArchiveComplete` under-verifies.** `verifyArchiveComplete(dest, ['workflow-state.md'])` (:3052, called :1982) only proves `workflow-state.md`, so an adaptive archive missing `workflow-plan.md` + `finalization-summary.md` + ALL per-node `.cache/n*-*.md` gate evidence still passes and both live copies are deleted. CONFIRMED: only the copy+verify (`isLinkedRun`, ~:1977-1993) path routes through the gate; the in-place `renameSync` path (else branch, ~:1996-1999) does NOT verify at all. **Fix:** per-path expected sets checked in the same pre-deletion gate. Detect the workflow path from the SOURCE folder (presence of `workflow-plan.md`, or `workflow_path:` in `workflow-state.md`). Expected sets — adaptive: `workflow-plan.md`, `workflow-state.md`, `finalization-summary.md`, PLUS ≥1 `.cache/n*-*.md` node-evidence file (add a GLOB capability to `verifyArchiveComplete` — it currently only does exact `fs.existsSync` per path); fast/full: `workflow-state.md` + the path's summary artifact (`fast-summary.md` / the full path's summary). **Route BOTH paths through the gate:** the copy+verify path must NOT delete either live copy when incomplete (both survive; return `archive_incomplete` + `missing`); the in-place `renameSync` path must verify BEFORE the move and keep the live folder / stay honest on incomplete — cover BOTH entry paths (the adversary probes exactly this). **Receipt honesty:** `archive_commit: done` only after a VERIFIED complete copy; an incomplete archive carries the `archive_incomplete`/`missing` detail instead.

**#676 RED (`scripts/simulate-workflow-walkthrough.js` + the codex twin `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`, where the #426 verify test already lives ~:16627 / ~:2086):** an adaptive archive missing plan/summary/node-evidence → REFUSED before any live-copy deletion, BOTH live copies survive; a COMPLETE adaptive archive → passes; a fast/full archive → passes on state+summary. Keep the existing #426 (`archive_incomplete` on missing `workflow-state.md`) assertions green.

**Cross-edition (both scripts):** `gap-sweep.js` — COMMON canonical↔codex (byte, via `node scripts/edition-sync.js --write`) + rename-normalized gitlab/gitea forge ports (HAND-EDIT the identical diff modulo the rename map). `claim.js` — COMMON canonical↔codex (byte, `edition-sync --write`) + DIVERGENT gitlab/gitea forge HAND-ports (mirror the per-path expectedFiles logic + glob into the forge-specific bodies; preserve forge-only parts e.g. `ghExec`). Then `node scripts/edition-sync.js --check` MUST be clean and `validate-script-sync` export-superset intact. Because this is a cross-edition diff, run all four chains sequentially — `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` — and reach GREEN on all four before declaring done (a green claude chain alone is insufficient: `npm test` `&&`-short-circuits). The four forge walkthroughs are declared defensively (the divergent-port change could shift a `#426` assertion); edit only where needed to keep each chain green, and add the new #676 coverage at least to the claude + codex twins.

### n2-review

G1 code-review gate over BOTH fixes (post-dominates n1-fix). Verify: (#675) the scanner NEVER recreates the stray active dir and NEVER clobbers a non-empty archived `run-gaps.json` — the `project_archived` refuse fires before any mkdir/write, and the explicit-`--output`-at-archive clobber is guarded. (#676) the fix covers EVERY archive entry path — BOTH the `isLinkedRun` copy+verify path AND the in-place `renameSync` path route through the pre-deletion gate; the per-path expected sets are correct (adaptive: plan+state+summary+≥1 `.cache/n*-*.md` glob; fast/full: state+summary); no live-copy deletion on incomplete; `archive_commit: done` is never emitted over an incomplete archive (receipt honesty). Confirm the DIVERGENT gitlab/gitea claim ports and rename-normalized gap-sweep ports faithfully mirror canonical, `edition-sync --check` is clean, and all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains are green (recorded, run sequentially). Reasoning-tier review; dispatched on the fable model per the operator goal.

### n3-adversary

Adversarial change-gate (read-only; has Bash to RUN scenarios, writes nothing). Try to REFUTE that the fixes close EVERY entry path — this is the silent-loss class (both bugs silently destroy durable evidence), so a single missed path is a ship-blocker. (#676) Construct an INCOMPLETE adaptive archive and drive it through BOTH the in-place `renameSync` path AND the `isLinkedRun` copy+verify path — assert each refuses/keeps and NO evidence is lost (both live copies survive on the copy path); assert a COMPLETE adaptive archive passes; assert a fast/full archive passes on state+summary; assert `archive_commit: done` never appears over an incomplete archive. (#675) Run a post-archive `--json` scan in BOTH the default-output case AND the explicit-`--output`-at-archive case — assert `project_archived` refuse, NO stray active folder recreated, and the archived `run-gaps.json` byte-unchanged. Emit a verdict (pass ONLY if no path leaks; fail with the concrete leak otherwise). Reasoning-tier; dispatched on the fable model per the operator goal.

### n4-finalize

Bundle sink closing BOTH #675 and #676 (all-or-nothing). Add TWO `CHANGELOG.md` `[Unreleased] ### Fixed` bullets (one per issue): #675 — gap-sweep scanner is now archive-aware (refuses `project_archived` instead of recreating a stray active folder / clobbering the archived `run-gaps.json`); #676 — `verifyArchiveComplete` now proves per-path expected sets (adaptive: plan + state + finalization-summary + ≥1 node-evidence `.cache/n*-*.md`; fast/full: state + summary) before any live-copy deletion, with receipt honesty (`archive_incomplete`/`missing`). Each bullet notes the four-edition sync and all-four-chains-green. No decision record needed (both are determinate bug/enhancement fixes with the direction given in the issue — no value-laden fork). Run the run-chains receipt (serial, `--project`) before the sink. Standard tier.

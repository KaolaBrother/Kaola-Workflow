# Workflow Plan — issue #725 (epic Phase A: retire fast/full)

<!-- plan_hash: 5b48fa3f885c37ee7ce88991f6c0c98f3c1010bd9d55845bf8adf4d5773969de -->

## Meta

project: issue-725
labels: area:scripts, area:workflow-phases, area:workflow-router, enhancement
speculative_open_policy: auto
plan_schema_version: 2
contract_version: 2
validation_command: npm test && node scripts/test-opencode-edition.js && node scripts/test-kimi-edition.js
validation_cwd: .
validation_repetitions: 1
validation_pass_rule: all
validation_timeout_minutes: 120
validation_env_allowlist:
code_certifier: n11-code-certify
security_certifier: none
inherited_frontier_digest: none
inherited_frontier_classes: none

## Plan Notes

Scope: this run ships **Phase A ONLY** of epic #725 (retire the fast/full paths). The issue is
explicit that the epic is multi-run and strictly ordered A→B→C→D→E, each phase landing with its own
gate before the next begins, and that it spans several sequential adaptive runs (plan caps). So this
plan retires fast/full and STOPS; the `finalize` node does a **partial close** — it sinks the Phase-A
commit and leaves issue #725 OPEN for Phase B. Do NOT close #725, and do NOT touch #718 (that closes
with Phase D).

Shape (deliberately SERIAL, not parallel): Phase A is one deeply-coupled cross-edition change — the
same symbols (`installed_paths` / `resolveInstalledPaths` / `WORKFLOW_PATHS` / fast-full script names)
thread through claim, schema, install, validators, walkthroughs, package.json and the forge ports, and
the four edition chains only go green when the WHOLE retirement lands together. The issue's execution
constraint is binding: "single-writer gates per leg; never a bundle-wide adversarial gate
post-dominating an antichain of independent writers." schema-2 additionally REQUIRES one common
`code_certifier` code-reviewer wall post-dominating every code producer. A parallel antichain of
producers under that one wall would trip the `repair_requires_replan` antichain hazard on any review
refutation (`uniqueMaximalReviewProducer` finds no unique graph-maximal producer). The only structure
that satisfies both — the common wall AND in-place repairability — is a SERIAL producer chain with the
wall at the tail. Makespan is traded for correctness deliberately (axiom 1 > axiom 2); the coupling
makes safe parallelism impossible here anyway, and the epic is multi-run.

No adversarial-verifier: Phase A is a mechanical retirement (delete + behavior-preserving excision),
not a subtle-bug or high-risk-logic change. Its risk is COMPLETENESS (a missed reference), which the
n1 retirement manifest, the precise per-node briefs, the tail `code-reviewer` wall, and the four-chain
finalize gate cover. No G2/security surface (no sensitive write-set path; labels are not sensitive) →
`security_certifier: none`.

Convergence discipline (the primary correctness mitigation): n1-recon produces ONE authoritative
retirement manifest — the exact deletion inventory, every reference to remove, the target symbol
contract, and trap-1 disambiguation — and EVERY writer reads it before editing so the legs converge on
the same final contract. Because the chain is serial, each writer also sees every upstream change in
its own leg, so it removes references against the already-changed tree (no base-only divergence).

Phase-A traps carried into the briefs (from the issue): (1) NO grep-and-delete of the substring
"full" — `escalated_to_full`, "full envelope", "full diff", "full accumulated root diff" are unrelated
adaptive vocabulary. (2) `classifier.js` and `validation-runner.js` are core adaptive dependencies —
UNTOUCHABLE even though they tolerantly reference the stale `installed_paths` field (Decision 2:
readers ignore the stale field; only the WRITE side is removed). (3) Routing surfaces are GENERATED —
edit `templates/routing/next.skeleton.md`, then `generate-routing-surfaces.js --write`; hand-edits to
the generated command/skill surfaces are wiped. (4) The claim.js `workflow_path` default flip to
adaptive MUST land in the SAME node as the cmdFinalize plan-absent collapse (n4), or absent-field
finalize misroutes. (5) `templates/routing/slots.js` REPAIR_JS wiring references repair-state — shared,
STAYS (confirmed: slots.js carries no fast/full content). (6) Nothing in `agents/` is deletable.

Symbol contract (what n3/n4/n5 converge to): `WORKFLOW_PATHS` → `['adaptive']`; `resolveInstalledPaths`
and the installed-paths field machinery REMOVED from `kaola-workflow-adaptive-schema.js` (×4
byte-identical); every caller of `resolveInstalledPaths` stops calling it (claim ×4, the 3
`install-codex-agent-profiles.js` copies, `validate-workflow-contracts.js` ×2, the 6 walkthroughs, the
2 forge `test-*-workflow-scripts.js`); install.sh stops writing `installed_paths`/`with_fast`/
`with_full` and makes `--with-fast`/`--with-full` unknown-flag errors; claim.js scaffold default flips
to adaptive and cmdFinalize's plan-absent branch collapses to a typed `adaptive_plan_missing` refusal
(never shells full-advance). Existing configs' stale `installed_paths` field is TOLERATED on read.

Cross-edition propagation: `adaptive-schema`/`repair-state`/`compact-context`/`install-manifest`/
`validate-workflow-contracts` are byte-mirrored (canonical↔codex; forge ports rename-normalized);
edit every copy identically (or edit canonical then `edition-sync.js --write` where it applies) and
declare every copy. `claim.js` is COMMON_SCRIPT (canonical↔codex byte) with HAND-PORTED gitlab/gitea
ports (mirror modulo forge nouns). The four editions of each script move atomically in ONE node.
`edition-sync.js --check` and `validate-script-sync.js` must be green at finalize.

Residual-token note: Phase A retires the fast/full PATHS (scripts, tests, commands, skills, path
machinery, forge ports, routing next-surfaces). Any residual fast/full PROSE mention that survives in
Phase-D target surfaces (`plan-run.skeleton.md`, `kaola-workflow-adapt.md`, role agents) is explicitly
deferred to Phase D's prompt diet + regeneration; it is not a Phase-A obligation. The Phase-A gate is
the four edition chains + the opencode/kimi suites green — NOT the epic-final AC1 grep (that lands at
Phase E). n1-recon still sweeps the full AC1-token set so we KNOW the residual surface and can confirm
nothing that survives breaks a chain.

Decision record: `D-725-01` (next free; no `D-725-*` exists) — one SUPERSEDING ADR that retires the
path-opt-in axis and supersedes the opt-in-axis ADRs (ADRs are immutable — supersede, never edit).

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | selector_source | model | wait_budget_minutes | observes | gate_claim | gate_surface | gate_aggregation | certifies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| n1-recon | code-explorer | — | — | 1 | sequence | — | reasoning | — | — | — | — | — | — |
| n2-delete | implementer | n1-recon | scripts/kaola-workflow-fast-advance.js, scripts/kaola-workflow-fast-audit.js, scripts/kaola-workflow-full-advance.js, scripts/kaola-workflow-phase4-advance.js, plugins/kaola-workflow/scripts/kaola-workflow-fast-advance.js, plugins/kaola-workflow/scripts/kaola-workflow-full-advance.js, plugins/kaola-workflow/scripts/kaola-workflow-phase4-advance.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-fast-advance.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-full-advance.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-phase4-advance.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-fast-advance.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-full-advance.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-phase4-advance.js, scripts/test-fast-advance.js, scripts/test-fast-audit.js, scripts/test-full-advance.js, scripts/test-phase4-advance.js, commands/kaola-workflow-fast.md, commands/kaola-workflow-phase1.md, commands/kaola-workflow-phase2.md, commands/kaola-workflow-phase3.md, commands/kaola-workflow-phase4.md, commands/kaola-workflow-phase5.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-fast.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase1.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase2.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase3.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase4.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase5.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-fast.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase1.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase2.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase3.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase4.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase5.md, plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-research/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-ideation/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-plan/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-execute/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-review/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-fast/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-research/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-ideation/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-execute/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-review/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-fast/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-research/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-ideation/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-execute/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-review/SKILL.md, docs/investigations/classifier-fast-overlap-2026-05-31.md, docs/investigations/fast-path-widening-2026-05-30.md, docs/investigations/fast-path-workflow-2026-05-17.md | 56 | sequence | — | standard | — | — | — | — | — | — |
| n3-core-scripts | implementer | n2-delete | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/kaola-workflow-repair-state.js, plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-repair-state.js, scripts/kaola-workflow-compact-context.js, plugins/kaola-workflow/scripts/kaola-workflow-compact-context.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-compact-context.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-compact-context.js | 12 | sequence | — | reasoning | — | — | — | — | — | — |
| n4-claim | implementer | n3-core-scripts | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/test-claim-hardening.js, scripts/test-bundle-state.js, scripts/test-bundle-claim.js | 7 | sequence | — | reasoning | — | — | — | — | — | — |
| n5-install | implementer | n4-claim | install.sh, scripts/kaola-workflow-install-manifest.js, plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js, plugins/kaola-workflow/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js, scripts/test-install-model-rendering.js, scripts/test-install-adaptive-config.js, scripts/test-install-manifest-single-source.js | 9 | sequence | — | reasoning | — | — | — | — | — | — |
| n6-routing | implementer | n5-install | templates/routing/next.skeleton.md, commands/workflow-next.md, plugins/kaola-workflow-gitlab/commands/workflow-next.md, plugins/kaola-workflow-gitea/commands/workflow-next.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md, commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md, scripts/test-route-reachability.js | 11 | sequence | — | standard | — | — | — | — | — | — |
| n7-opencode-kimi | implementer | n6-routing | .opencode/command/kaola-workflow-fast.md, .opencode/command/kaola-workflow-phase1.md, .opencode/command/kaola-workflow-phase2.md, .opencode/command/kaola-workflow-phase3.md, .opencode/command/kaola-workflow-phase4.md, .opencode/command/kaola-workflow-phase5.md, .opencode/command/workflow-next.md, .opencode/command/kaola-workflow-finalize.md, .kimi/skills/kaola-workflow-fast/SKILL.md, .kimi/skills/kaola-workflow-phase1/SKILL.md, .kimi/skills/kaola-workflow-phase2/SKILL.md, .kimi/skills/kaola-workflow-phase3/SKILL.md, .kimi/skills/kaola-workflow-phase4/SKILL.md, .kimi/skills/kaola-workflow-phase5/SKILL.md, .kimi/skills/workflow-next/SKILL.md, .kimi/skills/kaola-workflow-finalize/SKILL.md, scripts/test-opencode-edition.js, scripts/test-kimi-edition.js | 18 | sequence | — | standard | — | — | — | — | — | — |
| n8-walkthroughs | implementer | n7-opencode-kimi | scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js | 6 | sequence | — | reasoning | — | — | — | — | — | — |
| n9-validators | implementer | n8-walkthroughs | scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, scripts/validate-script-sync.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js, package.json | 9 | sequence | — | reasoning | — | — | — | — | — | — |
| n10-docs | doc-updater | n9-validators | README.md, docs/api.md, docs/workflow-state-contract.md, docs/architecture.md, docs/conventions.md, docs/opencode-edition.md, docs/kimi-edition.md, CLAUDE.md, CHANGELOG.md, docs/decisions/D-725-01.md | 10 | sequence | — | standard | — | — | — | — | — | — |
| n11-code-certify | code-reviewer | n10-docs | — | 1 | sequence | — | reasoning | — | — | Phase A retires the fast/full paths completely and correctly with zero adaptive regression: every fast/full script, test, command, skill and forge port is removed; installed_paths/WORKFLOW_PATHS/resolveInstalledPaths machinery is gone with claim.js default flipped to adaptive and cmdFinalize plan-absent collapsed to a typed adaptive_plan_missing refusal in the SAME change; every kept caller of the removed symbols is updated; the next routing surfaces are regenerated without fast/full; the validator/test/install/package.json assertion surface reflects the retired state; opencode/kimi are re-synced; classifier.js and validation-runner.js are untouched; and all four edition chains plus the opencode and kimi suites are green | the full accumulated Phase-A diff vs claim root base 33a1ca57 across all four editions — the deletions (n2), schema/repair/compact symbol surgery (n3), claim.js x4 + its tests (n4), install wiring x6 + install tests (n5), regenerated routing surfaces + finalize.md + reachability (n6), opencode/kimi re-sync (n7), the six walkthroughs (n8), the validator/test/package.json assertion surface (n9), and the docs+ADR delta (n10) — reviewed against the n1 retirement manifest, the symbol contract, and the four-chain-green plus opencode/kimi-green evidence | sequence | — |
| n12-finalize | finalize | n11-code-certify | — | 1 | sequence | — | — | — | — | — | — | — | — |

## Node Briefs

### n1-recon

Read-only recon that produces the authoritative Phase-A **retirement manifest** into this node's
evidence file (`kaola-workflow/issue-725/.cache/n1-recon.md`). Every downstream writer reads it before
editing. Read the issue body (`gh issue view 725`) — it carries the full A1–A5 inventory, traps, and
ACs — and verify it against the CURRENT tree (line numbers in the issue are approximate and have
drifted). Produce:

1. **Deletion inventory** — confirm every one of the 56 n2 targets exists (4 canonical scripts, 9
   forge-port scripts, 4 dead tests, 18 commands, 18 skill SKILL.md, 3 historical investigations) and
   flag any that is already absent. Note: `fast-audit` has NO forge port (canonical only). Confirm the
   3 investigations (`classifier-fast-overlap-2026-05-31`, `fast-path-widening-2026-05-30`,
   `fast-path-workflow-2026-05-17`) are historical, fast/full-only, and have zero runtime coupling
   (safe to delete; the 3rd carries ~22 fast/full tokens and is the same class as the two the issue
   names).
2. **Symbol-removal reference map** — grep every reference to `resolveInstalledPaths`,
   `installed_paths`, `with_fast`/`with_full`/`WITH_FAST`/`WITH_FULL`, `WORKFLOW_PATHS`, and the four
   retired script base-names across ALL four trees (`scripts/` + `plugins/*/scripts/`) plus `install.sh`,
   `package.json`, and `templates/routing/`. For each reference, name the exact file:line and which node's
   declared write set owns its removal (n3 schema/repair/compact, n4 claim + tests, n5 install +
   install tests, n6 routing/reachability, n8 walkthroughs, n9 validators/contract-validators/forge-tests/
   package.json). CRITICAL: flag any reference that lands in a KEPT file NOT in any node's write set —
   that is a write-set gap to surface immediately.
3. **Trap disambiguation (trap 1)** — enumerate every occurrence of the substring "full" that is
   UNRELATED adaptive vocabulary (`escalated_to_full`, "full envelope", "full diff", "full accumulated
   root diff", etc.) and MUST be preserved; contrast with the fast/full-PATH references that must go.
   Explicitly confirm `classifier.js`, `validation-runner.js` (trap 2) and `templates/routing/slots.js`
   REPAIR_JS wiring (trap 5) are UNTOUCHABLE and record that classifier.js's tolerant `installed_paths`
   read stays (Decision 2).
4. **Byte-mirror/rename map** — record which retired/edited scripts are COMMON_SCRIPTS (canonical↔codex
   byte), which forge ports are rename-normalized, and which `validate-script-sync.js` list entries
   (COMMON_SCRIPTS, RENAME_NORMALIZED_FAMILIES, byte-groups) reference the retired scripts and must be
   dropped (n9).
5. **AC1-token residual sweep** — grep the epic AC1 token set (`with-fast|with-full|fast-advance|
   full-advance|phase4-advance|fast-summary|kaola-workflow-fast|kaola-workflow-phase[1-5]`) across the
   whole repo (excluding CHANGELOG/docs/decisions/archive) and record which surviving surfaces are
   Phase-A scope vs Phase-D-deferred prose (plan-run.skeleton, kaola-workflow-adapt, role agents), so the
   gate and finalize know the residual is intentional and chain-safe.

Do not write any tracked file. Bash for grep/read only.

### n2-delete

Read n1's manifest first. `git rm` (or delete) exactly the 56 declared files — the fast/full canonical
scripts, 9 forge ports, 4 dead tests, 18 phase/fast commands (×3 editions), 18 retired skill dirs
(fast/research/ideation/plan/execute/review ×3 editions, each SKILL.md — deleting SKILL.md removes the
now-empty dir from git), and the 3 historical investigations. Non-tdd reason: pure removal of retired
feature artifacts; no unit test; retirement is verified by the four chains at finalize. Trap 1: delete
ONLY these exact paths — do NOT grep-and-delete the substring "full". Scoped verification (this leg
cannot run the full suite — base validators/package.json still reference the deleted files; that is
finalize's integration job): confirm `git status` shows exactly the 56 deletions, and that no KEPT
core script `require()`s a deleted script (n1 confirmed there are no runtime requires — only the
deleted tests required them). Evidence: build-green (kept core scripts still `node -e require(...)`
load) + the deletion list.

### n3-core-scripts

Read n1's manifest. Behavior-preserving symbol surgery on three byte-mirror families, all four editions
each, converging on the symbol contract in Plan Notes. `kaola-workflow-adaptive-schema.js` (×4
byte-identical): `WORKFLOW_PATHS` → `['adaptive']`; REMOVE `resolveInstalledPaths()` and the
installed-paths field machinery; keep `isLegalWorkflowPath` working for adaptive (it becomes the only
legal path); tolerate a stale `installed_paths` field on read (never write it). `repair-state.js` (×4):
excise the PHASES/SKILLS 1-6 maps, `isFastWorkflowState`/`fastStateValid`/`fastProjectExists`, the full
verifier route, and escalated-fast reconstruction; KEEP the adaptive ladder + `projectHasAdaptivePlan`.
`compact-context.js` (×4): prose-only removal of fast-summary / "Phase 4" mentions. Non-tdd reason:
behavior-preserving excision of a retired feature; no natural failing unit test; verified by the four
chains. Byte-mirror discipline: edit every copy identically (canonical + codex keep the canonical name;
gitlab/gitea repair-state/compact-context are the renamed ports); `edition-sync.js --check` +
`validate-script-sync.js` must ultimately be green (n9/finalize). Scoped verification: `node -e
require(...)` each edited file loads; the schema's own exports resolve; do NOT run the full walkthrough
in this leg (base claim.js still calls the removed symbol — that convergence is proven downstream/at
finalize).

### n4-claim

Read n1's manifest. Surgery on `kaola-workflow-claim.js` all four editions (canonical + codex are
byte-identical COMMON_SCRIPT; gitlab/gitea are hand ports — mirror every hunk modulo forge nouns). TRAP
4 (binding): the scaffold `workflow_path` default (currently `|| 'full'`) MUST flip to adaptive AND the
`cmdFinalize` plan-absent branch that shells full-advance MUST collapse to a typed `adaptive_plan_missing`
refusal in THIS SAME node — landing them apart misroutes absent-field finalize. Also: remove the isFast
scaffold block; make `--with-fast`/`--with-full` unknown-flag errors; remove the resume isFast branches;
remove the `fast-summary.md` sweep; stop calling `resolveInstalledPaths` (adaptive is the only legal
path). Update the three coupled claim/bundle tests in the same node — `test-claim-hardening.js`,
`test-bundle-state.js`, `test-bundle-claim.js` — dropping their fast/full/installed_paths assertions and
adding the retirement assertions (install/claim no longer write `installed_paths`; `--with-fast`/
`--with-full` refuse). Non-tdd reason: mostly behavior-preserving retirement + a typed-refusal collapse;
the meaningful checks are the existing tests updated to the retired state (no natural RED-first new
behavior). Scoped verification in this leg (base has n2+n3 applied — schema already lacks
`resolveInstalledPaths`): `node scripts/test-claim-hardening.js && node scripts/test-bundle-state.js &&
node scripts/test-bundle-claim.js` green; claim.js loads and a claim/finalize smoke works.

### n5-install

Read n1's manifest. `install.sh`: remove `WITH_FAST`/`WITH_FULL` vars, usage lines, arg parse,
`EFFECTIVE_*` config union, fast/full command gating, the config-write python block that emits
`with_fast`/`with_full`/`installed_paths`, and the fast/full verification gating; `--with-fast`/
`--with-full` become unknown-flag errors; `bash -n install.sh` clean. `kaola-workflow-install-manifest.js`
(×2 canonical+codex byte): drop the 3 fast/full SUPPORT_SCRIPTS entries; fix the stale fast-audit comment.
The three `install-codex-agent-profiles.js` copies (byte-group): stop calling `resolveInstalledPaths`.
Update the install tests in the same node: `test-install-model-rendering.js` and
`test-install-adaptive-config.js` (delete its AC2a/AC2b opt-in tests; repurpose AC1 into a retirement
regression: flags refused, no fast/full artifacts installed) and `test-install-manifest-single-source.js`
(drop the retired SUPPORT_SCRIPTS expectations). `uninstall.sh` needs NO change (path-agnostic sweep).
Non-tdd reason: install-wiring retirement + assertion updates to the retired state. Scoped verification
(leg has n2-n4 applied): `bash -n install.sh && node scripts/test-install-model-rendering.js && node
scripts/test-install-adaptive-config.js && node scripts/test-install-manifest-single-source.js` green.

### n6-routing

Read n1's manifest. Excise the fast/full routing prose from `templates/routing/next.skeleton.md` (the
route table entries, the fast/full arms, and any mention of the deleted `/kaola-workflow-fast` /
`/kaola-workflow-phaseN` commands), then regenerate the surfaces with
`node scripts/generate-routing-surfaces.js --write`. Only the six `next` surfaces (workflow-next.md ×3 +
kaola-workflow-next/SKILL.md ×3) change; confirm the plan-run surfaces stay byte-identical (`git status`)
— if `--write` touched a plan-run surface, STOP (that is out of Phase-A scope / a skeleton bug). Trap 3:
do NOT hand-edit the generated surfaces; edit the skeleton and regenerate. Trap 5: do NOT touch
`templates/routing/slots.js` (its REPAIR_JS repair-state wiring stays; slots carries no fast/full
content). Separately, hand-edit the three `kaola-workflow-finalize.md` command copies (canonical +
gitlab + gitea, modulo forge nouns) to remove the full-advance plan-absent wiring (now an
`adaptive_plan_missing` refusal per n4). Update `test-route-reachability.js`: drop the fast/full route
tables and surface-list expectations so it matches the regenerated surfaces. Non-tdd reason: generated
prose + reachability-assertion retirement. Scoped verification: `node scripts/generate-routing-surfaces.js
--check && node scripts/test-route-reachability.js && node scripts/test-generate-routing-surfaces.js`
green.

### n7-opencode-kimi

Read n1's manifest. opencode and kimi are ADDITIVE runtime editions (NOT wired into `npm test`);
re-sync them from the now-retired canonical tree and update their own suites. Run
`node scripts/sync-opencode-edition.js --write` and `node scripts/sync-kimi-edition.js --write`. Ensure
the stale fast/full copies are dropped: the 6 `.opencode/command/kaola-workflow-{fast,phase1..5}.md` and
the 6 `.kimi/skills/kaola-workflow-{fast,phase1..5}/SKILL.md` must be removed (delete them explicitly if
the sync does not prune). The re-sync also regenerates `.opencode/command/workflow-next.md` +
`kaola-workflow-finalize.md` and `.kimi/skills/workflow-next/SKILL.md` + `kaola-workflow-finalize/SKILL.md`
from the changed canonical. Update `test-opencode-edition.js` and `test-kimi-edition.js` assertions to the
retired counts/surfaces. If the sync changes a `.opencode`/`.kimi` file NOT in this node's declared write
set, surface it (coupling not foreseen at freeze). Non-tdd reason: mechanical edition re-sync + assertion
updates. Scoped verification: `node scripts/test-opencode-edition.js && node scripts/test-kimi-edition.js`
green.

### n8-walkthroughs

Read n1's manifest. Excise the fast/full sections from all six walkthrough simulators — the canonical
`simulate-workflow-walkthrough.js` and the five forge/codex ports (kaola-workflow, gitlab, gitlab-codex,
gitea, gitea-codex). Remove the fast/full journey blocks, the `isFast`/fast-advance/full-advance/phase4
scenarios, the `installed_paths`/`with_fast`/`WORKFLOW_PATHS`/`fast-summary` references, and any
`resolveInstalledPaths` usage — precisely, preserving every adaptive journey and the unrelated-"full"
vocabulary (trap 1). Non-tdd reason: retirement of test sections for a removed feature. Scoped
verification (leg has n2-n7 applied): each edited walkthrough runs green in its edition
(`node scripts/simulate-workflow-walkthrough.js` and each forge port), now exercising only the adaptive
journeys against the retired tree.

### n9-validators

Read n1's manifest. Update the validator/contract/forge-test assertion surface to the retired state so
the four chains go green: `validate-workflow-contracts.js` (×2 canonical+codex byte-pair) and
`validate-kaola-workflow-contracts.js` — drop the fast/full command/skill/script pins and any
`installed_paths`/`resolveInstalledPaths` assertions; `validate-script-sync.js` — remove the retired
fast-advance/full-advance/phase4-advance entries from COMMON_SCRIPTS + RENAME_NORMALIZED_FAMILIES + any
byte-group referencing them (per n1's byte-mirror map); the gitlab/gitea contract validators
(`validate-kaola-workflow-{gitlab,gitea}-contracts.js`) and forge test scripts
(`test-{gitlab,gitea}-workflow-scripts.js`) — drop fast/full command/skill counts and
`installed_paths`/`resolveInstalledPaths` assertions; `package.json` — drop the 4 dead tests
(test-fast-advance/test-fast-audit/test-full-advance/test-phase4-advance) from the claude chain and fix
the stale "6-phase" description. Non-tdd reason: assertion-surface retirement. Scoped verification (leg
has n2-n8 applied — the full retired tree): run each edited validator and, ideally, each edition chain
(`npm run test:kaola-workflow:claude`, `:codex`, `:gitlab`, `:gitea`) green in this leg — this is the
first node whose leg carries the complete retired+blessed tree, so it is the earliest real integration
check. If a chain is red on a reference this plan did not remove, surface it (write-set gap → repair).

### n10-docs

Read n1's manifest and the upstream evidence. Documentation for the retirement — dictate real content,
never fabricate; diff prose against the actual shipped behavior. Update: `README.md` (feature list,
install usage, env vars — drop fast/full, `--with-fast`/`--with-full`, `installed_paths`);
`docs/api.md` (CLI/subcommands — the `adaptive_plan_missing` refusal, removed fast/full surfaces);
`docs/workflow-state-contract.md` (drop fast-summary / fast state); `docs/architecture.md` (adaptive is
the only path); `docs/conventions.md` (any fast/full mention); `docs/opencode-edition.md` and
`docs/kimi-edition.md` (retired command/skill counts); `CLAUDE.md` (Durable State Contract; the
"Adaptive Is the Default" section becomes "Adaptive Is the Only Path"; Key Scripts — remove the retired
scripts — KEEP the file UNDER 200 lines); `CHANGELOG.md` (one `[Unreleased]` entry for Phase A: fast/full
paths retired, path-opt-in axis dropped, readers tolerate stale `installed_paths`). Author the SUPERSEDING
ADR `docs/decisions/D-725-01.md` (next free id; no `D-725-*` exists): it retires the path-opt-in axis and
SUPERSEDES the opt-in-axis ADRs (immutable — supersede, never edit the superseded records; name them).
No provenance (issue refs / ADR ids) in any agent-facing prompt surface — provenance lives here and in
CHANGELOG/commit. Non-code changes; scoped verification: the docs render and the CHANGELOG/README/api.md
edits are consistent with what shipped.

### n11-code-certify

The named schema-2 common CODE certifier wall for Phase A — post-dominates every code producer
(n2–n10) via the serial chain. Read the issue body, the n1 retirement manifest, and every upstream
evidence file. Verify against the FULL accumulated Phase-A diff vs claim root base `33a1ca57`, all four
editions: (1) all 56 fast/full artifacts are deleted and nothing that survives is a fast/full PATH
script/test/command/skill/forge-port; (2) the symbol contract holds — `WORKFLOW_PATHS = ['adaptive']`,
`resolveInstalledPaths`/installed-paths machinery removed, and NO kept caller still calls the removed
symbol (grep the four trees); (3) trap 4 — claim.js default flipped to adaptive AND cmdFinalize
plan-absent collapsed to a typed `adaptive_plan_missing` refusal in the same node; `--with-fast`/
`--with-full` refuse; (4) traps 1/2/5 respected — unrelated-"full" vocabulary preserved, `classifier.js`
/`validation-runner.js`/`slots.js` untouched, stale `installed_paths` tolerated on read; (5) routing next
surfaces regenerated from the skeleton (not hand-edited) with plan-run surfaces byte-unchanged, finalize.md
full-advance wiring removed; (6) the validator/test/install/package.json assertion surface and the six
walkthroughs match the retired state; (7) opencode/kimi re-synced and their suites green; (8)
cross-edition parity — `edition-sync.js --check` and `validate-script-sync.js` green, forge ports mirror
every hunk; (9) all four edition chains + opencode + kimi suites green over the final tree; (10) CLAUDE.md
under 200 lines and the superseding ADR filed. Record a gate verdict, not implementation advice; zero
findings is valid; admit only concrete candidate-caused defects with an exact trigger. If a finding is
localized to the tail producer (n10) reopen it in place; a finding rooted in an upstream chain node is
the claim-preserving replan path.

### n12-finalize

Unique sink, main-session-direct. This is a PARTIAL close of epic #725 (Phase A of A→E). Run the Meta
`validation_command` once over the final post-documentation tree — all four edition chains sequentially
green via `npm test`, then `node scripts/test-opencode-edition.js` and `node scripts/test-kimi-edition.js`
— and generate the sink chain receipt with `KAOLA_RUN_CHAINS_CONCURRENCY=serial` (this host octopus-merge
SIGKILLs a concurrent run-chains). Verify the named code certifier (n11) is complete and fresh. Then sink
the Phase-A feature commit from `workflow/issue-725`: commit → serial run-chains receipt → cmdFinalize
--keep-worktree → push branch → sink-merge --sink from the main root. DO NOT close issue #725 — the epic
continues with Phase B in a later run; leave #725 OPEN and the `workflow:in-progress` label in place. Do
NOT touch #718 (it closes with Phase D). Optionally post a brief comment on #725 recording that Phase A
(retire fast/full) shipped and Phase B is next. Write no tracked file from this node beyond the sink
transaction's own bookkeeping.

## Node Ledger

| id | status |
| --- | --- |
| n1-recon | complete |
| n2-delete | complete |
| n3-core-scripts | complete |
| n4-claim | complete |
| n5-install | complete |
| n6-routing | complete |
| n7-opencode-kimi | complete |
| n8-walkthroughs | complete |
| n9-validators | complete |
| n10-docs | complete |
| n11-code-certify | pending |
| n12-finalize | pending |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (n1-recon) | subagent-invoked | evidence-binding: n1-recon 30aed1d97859 | |
| implementer (n2-delete) | subagent-invoked | evidence-binding: n2-delete 337a3508b716 | |
| implementer (n3-core-scripts) | subagent-invoked | evidence-binding: n3-core-scripts 669b6397e8da | |
| implementer (n4-claim) | subagent-invoked | evidence-binding: n4-claim 056db2b938fe | |
| implementer (n5-install) | subagent-invoked | evidence-binding: n5-install 214fb0a3e271 | |
| implementer (n6-routing) | subagent-invoked | evidence-binding: n6-routing 662f27013d5a | |
| implementer (n7-opencode-kimi) | subagent-invoked | evidence-binding: n7-opencode-kimi 2b3f8228b832 | |
| implementer (n8-walkthroughs) | subagent-invoked | evidence-binding: n8-walkthroughs b93878b6028c | |
| implementer (n9-validators) | subagent-invoked | evidence-binding: n9-validators ad8d90f7dd37 | |
| doc-updater (n10-docs) | subagent-invoked | evidence-binding: n10-docs efb129378ce0 | |
| code-reviewer (n11-code-certify) | pending | | |
| finalize (n12-finalize) | pending | | |

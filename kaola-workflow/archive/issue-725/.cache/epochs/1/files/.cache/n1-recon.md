evidence-binding: n1-recon 30aed1d97859
findings: 56/56 deletion targets confirmed present (none already absent); 4 write-set gaps found — GAP-1 (HIGH, chain-coupled): plugins/kaola-workflow{,-gitlab,-gitea}/skills/kaola-workflow-finalize/SKILL.md (×3) carry the `full-advance` phase5-verify point-of-use wiring but are in NO node's write set (n6 owns the 3 Claude finalize commands + test-route-reachability that pins them, but not these 3 Codex skill packs); GAP-2 (MED): commands/workflow-init.md + plugins/*/commands/workflow-init.md + plugins/*/skills/kaola-workflow-init/SKILL.md (6 surfaces) carry `--with-fast`/`--with-full`/`installed_paths` install prose, unowned; GAP-3 (MED): install-opencode.sh + install-kimi.sh carry WITH_FAST/WITH_FULL/installed_paths, unowned; GAP-4 (LOW): .env.example carries `installed_paths`/`--with-fast` prose, unowned. Plus one owned-but-underspecified scope note: install-codex-agent-profiles.js (n5) retains the WITH_FAST/WITH_FULL seedKaolaConfig `installed_paths` UNION writer that the symbol contract requires removed.

# Phase-A Retirement Manifest — issue #725 (retire fast/full)

Base: claim root `33a1ca57`. Sources: frozen `workflow-plan.md` Node table + Plan Notes (which digest the #725 body; `gh` was not invoked — the plan's inventories/traps/symbol-contract are authoritative and were verified against the current tree). All paths relative to repo root; line numbers verified against the worktree at this base and may drift as upstream legs land (the chain is serial, so each writer greps its own already-changed files).

## 1 Deletion inventory

All **56** n2 targets exist in the worktree; **none already absent**. Breakdown (4 + 9 + 4 + 18 + 18 + 3 = 56):

- **4 canonical scripts** — `scripts/kaola-workflow-{fast-advance,fast-audit,full-advance,phase4-advance}.js` ✓
- **9 forge-port scripts** — codex (`plugins/kaola-workflow/scripts/kaola-workflow-{fast-advance,full-advance,phase4-advance}.js`), gitlab (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-{fast-advance,full-advance,phase4-advance}.js`), gitea (`.../kaola-gitea-workflow-{fast-advance,full-advance,phase4-advance}.js`) ✓. **Confirmed: `fast-audit` has NO forge port** — no `*-fast-audit.js` exists under any `plugins/*/scripts/` (canonical-only).
- **4 dead tests** — `scripts/test-{fast-advance,fast-audit,full-advance,phase4-advance}.js` ✓. Each `require()`s its retired script (test-fast-advance:19, test-full-advance:26, test-phase4-advance:25, test-fast-audit:22). These are the ONLY static requires of the retired scripts, and they die with the tests.
- **18 commands** — `commands/kaola-workflow-{fast,phase1,phase2,phase3,phase4,phase5}.md` (6) + gitlab (6) + gitea (6) ✓.
- **18 skill SKILL.md** — `plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/skills/kaola-workflow-{fast,research,ideation,plan,execute,review}/SKILL.md` (6 per edition × 3) ✓. (Deleting each SKILL.md removes its now-empty skill dir from git.)
- **3 historical investigations** — `docs/investigations/{classifier-fast-overlap-2026-05-31,fast-path-widening-2026-05-30,fast-path-workflow-2026-05-17}.md` ✓. All three are pure markdown design records (fast/full-dedicated); **zero runtime coupling** (no script `require`s or shells them; they appear only in doc-to-doc greps). Safe to delete. Note: OTHER investigations mention fast/full among mixed topics (`2026-06-01-full-audit.md`, `2026-06-12-goal-driven-automation-design.md`, `dynamic-workflow-composition-2026-06-02.md`, etc.) — these are NOT deletion targets (mixed adaptive-era records), are chain-irrelevant, and stay.

**n2 build-green premise holds:** no KEPT non-test script statically `require()`s a deleted script. The two dynamic couplings — `repair-state.js` constructing `…full-advance.js` by basename-replace (canonical:415; forge:201) and `claim.js` spawning `kaola-*-full-advance.js` (canonical:2884; gitlab:2651; gitea:2648) — live in files owned by n3/n4 respectively. The one kept require is `scripts/test-claim-hardening.js:3175` (`require('./kaola-workflow-full-advance.js')`) — owned by n4.

## 2 Symbol-removal reference map

Symbol contract (all writers converge here): `WORKFLOW_PATHS → ['adaptive']`; `resolveInstalledPaths()` + `INSTALLED_PATHS_FIELD` machinery REMOVED from adaptive-schema (×4); every caller stops calling it; install stops writing `installed_paths`/`with_fast`/`with_full` and makes `--with-fast`/`--with-full` unknown-flag errors; claim scaffold default flips to adaptive + cmdFinalize plan-absent collapses to `adaptive_plan_missing`; stale `installed_paths` is TOLERATED on read (never written).

### Owned references (by node) — anchor file:line

**n3 (schema ×4 / repair-state ×4 / compact-context ×4):**
- `WORKFLOW_PATHS` def/use/export — `kaola-workflow-adaptive-schema.js` ×4 at :24 (`Object.freeze(['fast','full','adaptive'])` → `['adaptive']`), :3296 (`optIn = WORKFLOW_PATHS.filter(...)`), :3756 (export).
- `resolveInstalledPaths` def/export + `INSTALLED_PATHS_FIELD` — adaptive-schema ×4 at :3271 (`const INSTALLED_PATHS_FIELD`), :3294 (fn def), :3919 (export). Header prose :22, :3266.
- repair-state ×4: full-advance verifier route — canonical/codex :415, forge :201; fast-audit parse comment — canonical/codex :547, forge :380 (plus the PHASES/SKILLS 1-6 maps, `isFastWorkflowState`/`fastStateValid`/`fastProjectExists`, escalated-fast reconstruction per brief).
- compact-context ×4: prose-only `fast-summary` / "Phase 4" removal (matched AC1 sweep).

**n4 (claim.js ×4 + 3 tests):**
- `resolveInstalledPaths` call — claim canonical/codex :1113, gitlab :881, gitea :885 (comment :31/:18).
- full-advance shell (cmdFinalize plan-absent, TRAP 4) — claim canonical/codex :2844, :2884, :2891; gitlab :2611, :2651; gitea :2608, :2648.
- `installed_paths` comments — claim :1107/:876/:880. isFast scaffold / resume isFast / fast-summary sweep / `|| 'full'` default flip per brief.
- tests: `test-claim-hardening.js` (:24 seed, :880-1023 #538 legality block, :3175 require full-advance), `test-bundle-state.js` (:32), `test-bundle-claim.js` (:35-489).

**n5 (install.sh + install-manifest ×2 + install-codex-agent-profiles ×3 + 3 install tests):**
- `install.sh`: `WITH_FAST`/`WITH_FULL` :51-52, arg parse :105/:108, `EFFECTIVE_*` union :220-221, config-write python `with_fast`/`with_full`/`installed_paths` :824-838.
- `install-manifest.js` ×2: SUPPORT_SCRIPTS fast/full/phase4-advance entries :87-89; stale fast-audit comment :56.
- `install-codex-agent-profiles.js` ×3: `resolveInstalledPaths` comment :102. **See scope note below** — also carries `WITH_FAST`/`WITH_FULL` :107-108, `seedKaolaConfig(...,WITH_FAST,WITH_FULL)` :3147, and the `installed_paths` UNION writer :2134-2193 / :3141.
- tests: `test-install-model-rendering.js` (:206-340, :3921-3928), `test-install-adaptive-config.js` (AC1/AC2a/AC2b :51-196), `test-install-manifest-single-source.js` (SUPPORT_SCRIPTS expectations).

**n6 (next.skeleton + next surfaces + finalize commands ×3 + test-route-reachability):**
- `templates/routing/next.skeleton.md`: fast/full route arms + tables (:566-575, :1159-1167), `fast-summary.md`/`/kaola-workflow-fast`/`/kaola-workflow-phaseN` refs, `KAOLA_PATH=fast/full` escapes (:313-347, :872-905), dangling refs to deleted `…/kaola-workflow-fast.md` (:910, :916). Regenerate via `generate-routing-surfaces.js --write` → only the 6 `next` surfaces (`workflow-next.md` ×3 + `kaola-workflow-next/SKILL.md` ×3) change; plan-run surfaces MUST stay byte-identical.
- finalize commands ×3: `kaola-workflow-finalize.md` branches `If workflow_path: full (or absent):` (canonical :135, forge :129) shelling `kaola-workflow-full-advance.js phase5-verify` (canonical :142-144), the `workflow_path: fast` read branches (:73, :271/:226), and the `full (or absent)` read branch (:277/:232).
- `test-route-reachability.js`: full-advance generic-find negative (:1185), finalize point-of-use tokens (:1193-1209), **Codex finalize-skill pins (:1210-1226)**, full-advance script-name map + live fresh-shell transaction test (:1273-1290).

**n8 (6 walkthroughs):** `resolveInstalledPaths` I4 contract block (canonical :4947-4963), `installed_paths` seeds/#538/#543 blocks throughout (canonical :10-27, :1436-1527, :5120, :6414-6422, :9408-9421; codex :2634-2787; gitlab/gitea sims :11-28). Remove fast/full journey blocks + isFast/fast-advance/full-advance/phase4 scenarios; preserve adaptive journeys + unrelated-"full" vocab.

**n9 (validators + forge tests + package.json):**
- `validate-workflow-contracts.js` ×2: `resolveInstalledPaths` assertions :906, :911; `assertManifestScript(...fast/full/phase4-advance...)` :521-527.
- `validate-kaola-workflow-contracts.js` :569; `validate-kaola-workflow-{gitlab,gitea}-contracts.js` :704/:709.
- `validate-script-sync.js`: see §4.
- `test-{gitlab,gitea}-workflow-scripts.js`: `resolveInstalledPaths`/`installed_paths` seeds :20-28, fast seeds :1880-1931, #543 seedKaolaConfig `--with-full → ["full"]` :5070-5266.
- `package.json:37` — the claude chain lists the 4 dead tests; drop them + fix stale "6-phase" wording.

**n10 (docs, non-blocking prose):** `docs/api.md` (:1286, :1902-1903), `docs/workflow-state-contract.md` (:772, :857-859), `docs/conventions.md` (:269), `README.md` (:1061, :1074), `CLAUDE.md`, `docs/architecture.md`, `docs/opencode-edition.md`, `docs/kimi-edition.md`, `CHANGELOG.md`, new ADR `D-725-01.md`. (`docs/decisions/D-538-01.md`, `D-543-01.md`, `0004-…md` are IMMUTABLE — supersede, never edit.)

**n7 (opencode/kimi):** `test-opencode-edition.js` (:840-1197 P1-P6/U1 opt-in probes) + `test-kimi-edition.js` (:539-664 P1-P3/U1) — retire opt-in probes to the retired counts. The `.opencode/`/`.kimi/` command/skill files in n7's write set are **gitignored generated artifacts** (`.gitignore:5-6`; they exist only at the install root, not tracked) — regenerated by `sync-opencode-edition.js --write` / `sync-kimi-edition.js --write`, so they carry no tracked-file reference obligation; the tracked surface n7 owns is the two suites.

### UNOWNED references — WRITE-SET GAPS (surface immediately)

| # | Kept tracked file(s) | Reference | Owner? | Severity |
|---|---|---|---|---|
| **GAP-1** | `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`, `…-gitlab/…`, `…-gitea/…` (×3) | full-advance phase5-verify point-of-use block: `KAOLA_FULL_ADVANCE_NAME="…-full-advance.js"` (:228-230) → `node "$KAOLA_FULL_ADVANCE" phase5-verify` (:236); plus `workflow_path: fast`/`full` read branches | **none** | **HIGH — chain-coupled** |
| **GAP-2** | `commands/workflow-init.md` (:146) + `plugins/*/commands/workflow-init.md` (×2) + `plugins/*/skills/kaola-workflow-init/SKILL.md` (×3, :178-192) | `--with-fast`/`--with-full` install commands + `installed_paths` UNION prose | **none** | MED — stale prose |
| **GAP-3** | `install-opencode.sh`, `install-kimi.sh` | `WITH_FAST`/`WITH_FULL` (:66-67/:58-59), `--with-fast`/`--with-full` (:113-114/:108-109), `EFFECTIVE_*` (:143-144/:141-142), seeds `installed_paths` | **none** | MED — additive-edition installers |
| **GAP-4** | `.env.example` (:44-45) | `installed_paths` axis + `install.sh --with-fast`/`--with-full` prose | **none** | LOW — config doc |

**GAP-1 is the critical one.** The finalize-wiring change propagates across the SIX-surface contract (3 Claude commands + 3 Codex SKILL packs). n6 owns the 3 Claude finalize **commands** and `test-route-reachability.js` — but `test-route-reachability.js` itself PINS the 3 Codex finalize **skill packs** (:1210-1226 assert their point-of-use resolver tokens; :1273-1290 run a live fresh-shell test resolving `*-full-advance.js`). Those skill packs shell the deleted `full-advance.js` and are in NO write set. Removing the wiring from 3-of-6 surfaces is a propagation gap the route-reachability/contract machinery is designed to catch, and the skill packs would reference a deleted script. **Recommended remedy:** extend n6's write set to include the 3 `kaola-workflow-finalize/SKILL.md` packs (mirror the command edit, modulo forge nouns) so the finalize retirement lands across all 6 surfaces in one leg.

**Owned-but-underspecified scope note (not an unowned gap, but a convergence risk for n5/n11):** `install-codex-agent-profiles.js` ×3 is in n5's write set, but the n5 brief scopes it only to "stop calling `resolveInstalledPaths`." The file ALSO parses `--with-fast`/`--with-full` (:107-108) and runs the `seedKaolaConfig` UNION writer that WRITES `installed_paths:['fast'/'full']` (:2174-2193, :3147). The symbol contract ("install stops writing `installed_paths`; `--with-fast`/`--with-full` become unknown-flag errors") requires these removed too — otherwise the Codex install remains a live fast/full opt-in and GAP-2's init prose stays factually valid-but-retired. n5 must reconcile this within its owned file.

## 3 Trap disambiguation (trap 1)

**Unrelated "full" vocabulary that MUST be preserved (do NOT grep-and-delete "full"):**
- `escalated_to_full` — the dominant survivor: adaptive review-escalation state token. Present in `kaola-workflow-adaptive-node.js` (~32-35 occ ×4 editions), `test-adaptive-node.js` (~22), `plan-validator.js`, `next.skeleton.md`/`plan-run.skeleton.md`, `agents/workflow-planner.md`, `plugins/*/agents/workflow-planner.toml`, `kaola-workflow-codex-compact-resume.js`. Adaptive vocabulary — KEEP everywhere.
- "full envelope" / "full diff" / "full accumulated root diff" — barrier/gate diff-scope vocabulary (plan Notes, commit-node/plan-validator prose). KEEP.
- git plumbing: `--symbolic-full-name` (next.skeleton :446/:1064), "fast-forward"/"Fast-forward only" (next.skeleton :1070-1079). KEEP.
- `full-review-fix-loop-parity` PIN + "bounded full review/fix loop" in Codex **review** skills — but those review skills are DELETED (in n2 set), so N/A.

**Untouchable core adaptive dependencies:**
- `classifier.js` ×4 (`kaola-workflow-classifier.js` + forge ports) — **TRAP 2, UNTOUCHABLE.** Retains the tolerant `installed_paths` read (`defaults = { parallel_mode:'auto', installed_paths:[] }` :175/:40) — this STAYS per **Decision 2** (readers ignore the stale field; only the write side is removed). It ALSO retains `fast-summary.md` tolerant `## Scope` reads (:281, :572, :583, :692, :697) — defensive parses that simply never fire post-retirement. Not in any write set — **intentional keep, not a gap.**
- `validation-runner.js` — **TRAP 2, UNTOUCHABLE** (core adaptive dependency).
- `templates/routing/slots.js` REPAIR_JS wiring — **TRAP 5, UNTOUCHABLE** (repair-state wiring is shared and carries no fast/full content).
- Everything under `agents/` — **TRAP 6, nothing deletable.** Confirmed: an AC1-token sweep of `agents/**` returns ZERO fast/full-PATH tokens (only `escalated_to_full` adaptive vocab). Role agents are chain-safe as-is.

## 4 Byte-mirror / rename map

**Retired scripts in the sync lists (n9 must DROP these entries in `validate-script-sync.js`):**
- `COMMON_SCRIPTS` (canonical↔codex byte-identical) — drop `kaola-workflow-fast-advance.js` (:94), `kaola-workflow-full-advance.js` (:97), `kaola-workflow-phase4-advance.js` (:100) + their leading comments (:92-93, :95-96, :98-99). **`fast-audit` is NOT in COMMON_SCRIPTS** (canonical-only, no forge port) — nothing to drop there for it.
- `RENAME_NORMALIZED_FAMILIES` — drop the 3 families: `fast-advance forge ports` (:316-324), `full-advance forge ports` (:327-334), `phase4-advance forge ports` (:338-344).
- `BYTE_IDENTICAL_GROUPS` (:103+) — none reference the retired scripts (pre-commit/closure-contract/etc.); no change from the deletions.
- Also drop the `assertManifestScript('…fast/full/phase4-advance…')` pins in `validate-workflow-contracts.js` ×2 (:521-527).

**Retired scripts' own mirror class (all DELETED by n2):** fast/full/phase4-advance were `COMMON_SCRIPTS` (canonical↔codex byte) + rename-normalized forge ports (`kaola-{gitlab,gitea}-workflow-*`). fast-audit was canonical-only.

**Edited-and-KEPT byte families (writers edit EVERY copy identically; these STAY in the sync lists — n9 does NOT drop them):**
- `kaola-workflow-adaptive-schema.js` — **4-way byte-identical** (canonical = codex = gitlab = gitea) → n3 edits all 4 identically.
- `kaola-workflow-repair-state.js` / `kaola-workflow-compact-context.js` — canonical↔codex byte; gitlab/gitea are **rename-normalized** ports (`kaola-{gitlab,gitea}-workflow-repair-state.js` / `…-compact-context.js`) → n3.
- `kaola-workflow-claim.js` — **COMMON_SCRIPT** (canonical↔codex byte) + **hand-ported** gitlab/gitea (`kaola-{gitlab,gitea}-workflow-claim.js`, mirror modulo forge nouns) → n4.
- `kaola-workflow-install-manifest.js` — canonical↔codex byte pair (2 copies only) → n5.
- `validate-workflow-contracts.js` — canonical↔codex byte pair → n9.

`edition-sync.js --check` + `validate-script-sync.js` must be green at finalize (n9/n12).

## 5 AC1 residual sweep

Token set swept: `with-fast|with-full|fast-advance|full-advance|phase4-advance|fast-summary|kaola-workflow-fast|kaola-workflow-phase[1-5]`, whole repo excluding `kaola-workflow/` state, `.kw/`, `node_modules/`, `CHANGELOG.md`, `docs/decisions/`, archived material. (The Phase-A gate is the four edition chains + opencode/kimi suites green — NOT this grep; the epic-final AC1 grep lands at Phase E. This sweep exists so the gate KNOWS the surviving surface is intentional and chain-safe.)

**Category A — Phase-A scope, cleaned this run (owned):** all deleted files (n2); adaptive-schema/repair-state/compact-context ×4 (n3); claim.js ×4 + 3 tests (n4); install.sh + install-manifest ×2 + install-codex-agent-profiles ×3 + 3 install tests (n5); next.skeleton + 6 next surfaces + 3 finalize commands + test-route-reachability (n6); test-opencode/kimi (n7); 6 walkthroughs (n8); validators/forge-tests/package.json (n9); docs (n10). After these land, Category A has zero AC1 residual.

**Category B — intentionally out of Phase-A scope (trap 2 / Decision 2):** `classifier.js` ×4 retains `fast-summary` tolerant `## Scope` reads + `installed_paths:[]` default. UNTOUCHABLE; read-only defensive parses that never fire post-retirement. Chain-safe. The AC1 grep WILL still show `fast-summary` in classifier.js after Phase A — that is expected and correct.

**Category C — Phase-D-deferred prose (residual note; NOT a Phase-A obligation):** `templates/routing/plan-run.skeleton.md` (+ its 6 generated plan-run surfaces) — carries `escalated_to_full` (adaptive vocab, KEEP) plus incidental fast/full prose; n6 confirms plan-run surfaces stay byte-identical, so any prose residual there is Phase-D. `kaola-workflow-adapt` surface + role agents (`agents/workflow-planner.md`, `plugins/*/agents/workflow-planner.toml`) — role agents carry ONLY `escalated_to_full` (zero AC1 tokens; chain-safe). These are Phase-D prompt-diet targets, deferred by design.

**Category D — UNOWNED residual that is NEITHER cleaned nor a named Phase-D surface (the write-set gaps from §2):** GAP-1 finalize skill packs (`full-advance` — chain-coupled, remediate this run), GAP-2 init command+skill surfaces (`--with-fast`/`--with-full`/`installed_paths`), GAP-3 install-opencode.sh/install-kimi.sh (`WITH_FAST`/`WITH_FULL`/`installed_paths`), GAP-4 `.env.example` (`installed_paths`/`--with-fast`). GAP-2/3/4 are prose/config staleness (no deleted-script shell → likely chain-safe, but they leave the retired flags/field documented-as-live, which is a completeness defect — Phase A's stated risk). GAP-1 references a deleted script and is pinned by n6's own reachability test → must be closed this run (extend n6's write set) or a chain goes red / the six-surface finalize propagation fails.

**Chain-safety verdict:** with GAP-1 remediated (finalize skill packs added to a writer's leg), the surviving AC1 residual is confined to Category B (intentional trap-2 tolerant reads), Category C (Phase-D-deferred prose, adaptive-vocab only in role agents), and GAP-2/3/4 (prose/config, no script shell) — none of which breaks the four edition chains or the opencode/kimi suites. GAP-1 left unowned is the one residual that endangers a chain and the finalize six-surface propagation contract.

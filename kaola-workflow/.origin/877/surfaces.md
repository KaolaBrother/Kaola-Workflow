# DAG/node-executor demolition map — file-level inventory

Read for: ADR 0017 (`docs/decisions/0017-the-mission-list.md`) — retires the node/DAG executor, the
plan grammar, declared write sets, post-dominance gates, the antichain/disjointness sweep, the
serializer taxonomy, the freeze chain, epochs/re-plan CAS, the mandatory planner + its control-
boundary refusal, `ROLE_TOKEN_REGISTRY`, `upstream_read` consumed-proof, the hollow-seed refusal.
Does NOT retire: ADR 0016's kernel/substrate (refusal envelope conversion, `isActionableResult`,
kernel-write observer, closure receipt), the four durable records, `claim`/`roadmap`/`sink`/
`run-chains`/install rendering, or the consent valve (now conversational).

Scope note: this is an INVENTORY, not a deletion order. Read-only recon; no file edited.

Notable pre-existing artifact: **`docs/mission-list.md` (97 lines) already exists** and is exactly
ADR 0017 Build-sequence Step 1's deliverable (the file-format spec + write-moments). It is not yet
referenced from `docs/README.md`'s body prose (the index still frames 0013/0016 as prerequisite
reading and lists plan-run-cards as current) and no code produces or consumes it yet.

---

## A. Canonical scripts (`scripts/`)

Line counts are `wc -l`-equivalent (via ripgrep `^` count). "DAG-vocab hits" = occurrences of a
narrow, low-false-positive pattern (`Node Ledger|node-id|nodeId|write.set|post-dominan|plan_hash|
parallel_safe|depends_on|ROLE_TOKEN_REGISTRY|antichain|running-set|freeze-check|frozen plan|
workflow-plan\.md|workflow-plan\.next`) — NOT a bare `freeze`/`node`/`role` sweep, which false-
positives heavily on `Object.freeze(`, `node_modules`, the `node` shebang, and generic "role" prose.

### A1 — Purely DAG (implements node execution, plan grammar, freeze, or epochs; nothing survives)

| File | Lines | Hits | Relationship |
|---|---:|---:|---|
| `scripts/kaola-workflow-adaptive-node.js` | 19,003 | 1,430 | Implements — the entire per-node lifecycle (open-next/open-ready/record-evidence/close-and-open-next/expand/reopen/repair/route-findings/halts/locks/speculation). Largest single DAG file in the repo. **Exception:** its guard prologue (integrity → consent-halt fence → mutual exclusion) is named in ADR 0017 step 3 as load-bearing for something OTHER than node execution ("where the consent path physically lives") — extract before deleting the rest. |
| `scripts/kaola-workflow-plan-validator.js` | 7,981 | 838 | Implements — closed-library + four-shape grammar, post-dominance gates, disjointness, caps, freeze/governance-ack, `plan_hash`. The densest DAG file by hit-ratio (10.5%). |
| `scripts/kaola-workflow-replan.js` | 5,275 | 365 | Implements — claim-preserving re-plan epochs, CAS seams, epoch snapshot/activation. Entirely retired machinery per ADR ("epochs and the re-plan CAS machinery"). |
| `scripts/kaola-workflow-adaptive-handoff.js` | 1,687 | 137 | Implements — planner freeze/orient chain, the two-spawn plan-validator choreography, `ready_to_run`/`plan_invalid` branching. |
| `scripts/kaola-workflow-commit-node.js` | 372 | 37 | Implements — per-node barrier choreography (`--record-base` → `--barrier-check` + `--gate-verify`), shells plan-validator. |
| `scripts/kaola-workflow-next-action.js` | 416 | 9 (low count is aggregator size, not a scope signal) | Implements — ready-set/next-node/resolved-model aggregation from a frozen plan. |
| `scripts/kaola-workflow-task-mirror.js` | 170 | 3 | Implements — generates `workflow-tasks.json` FROM the frozen `## Nodes` + `## Node Ledger`; reuses plan-validator's `planNodesWithExpansions`/`parseLedger`. The #807 task-mirror-staleness surface (prior memory) lives entirely here. |

### A2 — Cross-edition anchor (mixed: some content is DAG, some is the surviving byte-identical constant kernel)

| File | Lines | Hits | Relationship |
|---|---:|---:|---|
| `scripts/kaola-workflow-adaptive-schema.js` | 7,144 | 423 | Mixed — "the cross-edition drift anchor." Carries DAG constants (role tokens, write-set vocabulary, gate names) interleaved with forge-neutral constants that must keep living somewhere (ADR 0017 step 3 names this file explicitly as the required survivor location for surviving constants). Needs a line-by-line split, not a delete. |

### A3 — Mixed (a surviving script with a real, load-bearing DAG-integrity dependency woven in)

| File | Lines | Real hits | Relationship |
|---|---:|---:|---|
| `scripts/kaola-workflow-claim.js` | 6,073 | ~20+ (spread across finalize/sink/repair) | Mixed — claim/release/status/finalize/worktree/sink-fallback all SURVIVE, but finalize validates against the frozen `workflow-plan.md` (plan_hash refresh, `## Node Ledger` proofs, `running-set.json` liveness checks) throughout. This is the file ADR 0017 step 3 flags: "the finalize door currently runs through the plan-validator's whole-plan attribution sweep and must be re-pointed at the recorded per-item locators." Highest-risk extraction target in category A. |
| `scripts/kaola-workflow-sink-merge.js` | 2,303 | 10 | Mixed — sink/merge logic survives; checks `running-set.json` liveness (a live lane-group blocks sink) before allowing merge. |
| `scripts/kaola-workflow-classifier.js` | 993 | 17 (dense: antichain/write-set are its core) | Mixed but DAG-heavy and **easy to miss** — not named in CLAUDE.md's canonical script list at all. Implements `parseWriteSetCell`, the cross-project write-set overlap/antichain scan (`node write sets are pairwise disjoint`), and reads `declared_write_set` from a frozen plan's `## Nodes` table. Consumed by `claim.js`'s `scanClaimedOverlap`. This is core disjointness-proof machinery hiding under a generic name. |
| `scripts/kaola-workflow-repair-state.js` | 642 | 8 | Mixed — state-repair tool; some paths touch `## Node Ledger` / `plan_hash` integrity. |
| `scripts/kaola-workflow-gap-sweep.js` | 578 | 7 | Mixed — provenance-log gap detector; keys `in_run_repair` detection on `nodeId` (counts >1 open events per node). |
| `scripts/kaola-workflow-codex-preflight.js` | 4,152 | 4 real (of 8; rest are `Object.freeze` false positives) | Mixed — Codex agent-profile freshness gate; its REQUIRED-role union pulls "DELEGATED plan roles from `--plan <path>` (`## Nodes` role column)" — ties it to the retiring role vocabulary, but the profile-freshness check itself is not inherently DAG-shaped. |
| `scripts/kaola-workflow-resolve-agent-model.js` | 440 | 1 | Mixed, light — resolves per-node model tier "from the frozen plan's per-node tier, applied by the caller." |
| `scripts/kaola-workflow-compact-context.js` | 111 | 1 | Mixed, light — emits an instruction line: "Read state first, then the frozen workflow-plan.md and its Node Ledger." |
| `scripts/kaola-workflow-closure-audit.js` | 398 | 3 real | Mixed, light — closure-drift reporter; one drift class checks `.roadmap` source vs `plan_hash`/`## Node Ledger`. |
| `scripts/kaola-workflow-closure-contract.js` | 144 | 5 real (`epoch_lineage_preserved` field) | Mixed, light — pure-data closure-receipt schema (issue #161); carries one DAG-shaped field, `epoch_lineage_preserved`, that has no meaning once epochs retire. |

### A4 — False-positive / not DAG-scoped (name or grep hit suggested DAG; content is not)

| File | Lines | Note |
|---|---:|---|
| `scripts/kaola-workflow-install-manifest.js` | 196 | All 5 grep hits are `Object.freeze(` — not DAG. BUT its `SUPPORT_SCRIPTS` constant (see §E) is the single source enumerating every DAG script name for install wiring — a non-DAG file that is nonetheless a required edit site on deletion. |
| `scripts/kaola-workflow-validation-runner.js` | 1,142 | All 4 hits are `Object.freeze(` — not DAG. |
| `scripts/kaola-workflow-prose-census.js` | 773 | 1 hit, false positive (unrelated `freeze`-adjacent word); zero `role` hits despite generic-sounding name. |

### A5 — Zero DAG-vocab hits (pure survivors, confirmed)

`kaola-workflow-roadmap.js` (404 ln) · `kaola-workflow-run-chains.js` (1,198 ln) · `kaola-workflow-active-folders.js` (303 ln) · `kaola-workflow-telemetry-report.js` (314 ln) · `kaola-workflow-release.js` (337 ln) · `kaola-workflow-sink-pr.js` (285 ln) · `kaola-workflow-ledger-compare.js` (117 ln — name suggests DAG but it compares `## Node Ledger` COMPLETENESS for a finalize-mirror-direction guard using its OWN 5-line regex parse, explicitly NOT importing plan-validator's `parseLedger` — a Node-Ledger *consumer* surviving on the record's shape, worth a second look before assuming it dies with the ledger).

### A6 — Adjacent tooling, not itself DAG but DAG-touching by name only

`scripts/kernel-write-observer.js` (test infra, `node --require` preload; ADR 0016 substrate, not DAG) · `scripts/measure-validator-duplication.js`, `scripts/measure-site-execution.js` (dev-tooling that measures plan-validator/claim.js duplication — will need re-pointing or retiring once their subjects are deleted, not read in detail this pass).

---

## B. Tests (`scripts/test-*.js` + `scripts/simulate-workflow-walkthrough.js`)

Same narrow DAG-vocab pattern, extended with script-name tokens (`adaptive-node|adaptive-handoff|
plan-validator|commit-node|next-action|replan\.js`) since tests reference their subject by name.

### B1 — Wholly DAG-scoped (the whole suite dies with its mechanism, per ADR 0017 step 4: "Tests are deleted with their mechanism, never repaired ahead of it")

| File | Lines | Hits |
|---|---:|---:|
| `scripts/test-adaptive-node.js` | 32,542 | 2,670 — **largest test file in the repo** |
| `scripts/test-replan.js` | 8,671 | 388 |
| `scripts/test-adaptive-handoff.js` | 4,135 | 432 |
| `scripts/test-plan-validator.js` | 832 | 74 |
| `scripts/test-commit-node.js` | 1,887 | 148 |
| `scripts/test-next-action.js` | 1,191 | 28 |
| `scripts/test-plan-run.js` | 139 | 7 |
| `scripts/test-plan-shape-audit.js` | 442 | 24 |
| `scripts/test-plan-design-section.js` | 391 | 33 |
| `scripts/test-ledger-chain-tamper.js` | 407 | 22 |
| `scripts/test-barrier-base-integrity.js` | 660 | 52 |
| `scripts/test-interior-gate-freshness.js` | 1,333 | 105 |
| `scripts/test-mega-mutation-spotcheck.js` | 480 | 25 |
| `scripts/test-ledger-compare.js` | 107 | 4 |
| `scripts/simulate-workflow-walkthrough.js` | 23,690 | not separately counted (CLAUDE.md: "integration test suite," node-lifecycle pins throughout) |

### B2 — Mixed (subject script survives; DAG dependency is partial)

| File | Lines | Hits | Note |
|---|---:|---:|---|
| `scripts/test-claim-hardening.js` | 6,251 | 105 | Tests `claim.js`, which is itself mixed (§A3) — needs scenario-level triage, not whole-file deletion. |
| `scripts/test-sink-merge.js` | 1,405 | 19 | Tests `sink-merge.js` (§A3). |
| `scripts/test-gap-sweep.js` | 1,115 | 57 | Tests `gap-sweep.js` (§A3). |
| `scripts/test-route-reachability.js` | 2,100 | 22 | Tests the SIX-surface routing-prose contract (§D); DAG-adjacent (the plan-run skeleton is one of the six) but the mechanism (route reachability across runtimes) is not itself the DAG. |
| `scripts/test-generate-routing-surfaces.js` | 744 | 14 | Same routing-generation mechanism as above. |
| `scripts/test-edition-sync.js` | 179 | 20 | Tests §C's edition-sync/byte-identity machinery, which currently carries ~10 DAG files in `GENERATED_AGGREGATORS` — the sync MECHANISM survives, its DAG cargo does not. |
| `scripts/test-refusal-route-sweep.js` | 2,225 | 63 | Sweeps every refusal code → route → green. Per ADR 0017 "the refusal count reaches zero" — once DAG-specific codes (`plan_invalid`, `governance_ack_stale`, `barrier_failed`, …) are gone, this suite's registry shrinks toward whatever (if anything) remains; worth flagging to whoever plans the deletion order since the suite's PURPOSE (not just its subject) may become moot. |
| `scripts/test-bash-block-guards.js` | 216 | 12 | Light. |
| `scripts/test-bundle-finalize.js` | 1,597 | 10 | Tests finalize bundling; light DAG touch via `claim.js`. |
| `scripts/test-substrate-conversion.js` | 579 | 11 | **Misleading by hit-count — this is ADR 0016 territory, not DAG.** Tests `isActionableResult` / the refusal-envelope conversion invariant ("delete the verdict, keep the measurement"). Survives. |
| `scripts/test-content-locator.js` | 636 | 34 | **Misleading by hit-count — ADR 0016/#864 substrate**, not DAG. Tests the per-node CONTENT locator (barrier resolves by content from a ref-anchored commit) — a `result`-field-shaped concern, arguably a forward-looking analogue for the mission-list's own `result` field. Read before assuming this dies. |
| `scripts/test-outcome-recorder.js` | 1,089 | 24 | **ADR 0013/0016 substrate**, not DAG — refusal/outcome recorder + parent-owned sidecar join. Survives. |
| `scripts/test-oracle-kernel.js` | 959 | 16 | ADR 0016 Oracle Kernel conformance — survives, not DAG despite "kernel" sounding adjacent. |
| `scripts/test-kernel-conformance.js` | 788 | 25 | Same family as above — survives. |
| `scripts/test-kernel-successor.js` | 701 | 27 | Same family — survives ("zero-context successor can continue" axiom, kernel-scoped not DAG-scoped). |
| `scripts/test-test-custody.js` | 361 | 15 | Tests custody rules (#813-815, `isTestLikePath`) — survives; light DAG touch via node-shaped examples. |

### B3 — Zero DAG-vocab hits (confirmed non-DAG)

`test-agent-model-resolver.js` (615 ln) · `test-release-surface-drift.js` (85 ln) · `test-issue-probe-memo.js` (76 ln) · `test-forge-bundle-lane.js` (351 ln) · `test-uninstall-forge-branches.js` (191 ln) · `test-spawn-census.js` (102 ln) · `test-install-all.js` (631 ln) · `test-release.js` (391 ln) · `test-shard-lib.js` (217 ln) · `test-suite-registration.js` (199 ln) · `test-bundle-claim.js` (1,450 ln) · `test-active-folders-field-parity.js` (147 ln) · `test-install-adaptive-config.js` (261 ln) · `test-install-upgrade-rewrite.js` (325 ln) · `test-git-fixture.js` (207 ln) · `test-kimi-edition.js` (1,024 ln) · `test-opencode-edition.js` (1,585 ln) · `test-bundle-state.js` (352 ln) · `test-install-manifest-single-source.js` (162 ln) · `test-agent-profile-parity.js` (614 ln) · `test-validation-allowband.js` (172 ln) · `test-validation-runner.js` (342 ln) · `test-install-model-rendering.js` (4,229 ln) · `test-parallel.js` (492 ln — name suggests running-set scheduler, but zero real hits; check before assuming) · `test-spawn-classification.js` (347 ln) · `test-validate-script-sync.js` (354 ln) · `test-run-chains.js` (1,522 ln).

---

## C. Per-edition duplicates

Four "editions" (github/claude canonical in `scripts/`, codex in `plugins/kaola-workflow/scripts/`,
gitlab in `plugins/kaola-workflow-gitlab/scripts/`, gitea in `plugins/kaola-workflow-gitea/scripts/`)
plus two additive runtimes (opencode, kimi — explicitly NOT wired into the four-chain/edition-sync
system per CLAUDE.md; excluded below).

**Mechanism files** (own the duplication, survive as mechanism even though their DAG cargo does not):
- `scripts/edition-sync.js` (see below for line count) — `--write`/`--check`/`--materialize-kernel`. Two lists matter:
  - `GENERATED_AGGREGATORS` (`scripts/edition-sync.js:52-74`, 10 entries) — auto-rename-ported to gitlab/gitea: `kaola-workflow-adaptive-node.js`, `kaola-workflow-next-action.js`, `kaola-workflow-commit-node.js`, `kaola-workflow-adaptive-handoff.js`, `kaola-workflow-plan-validator.js`, `kaola-workflow-replan.js`, plus 4 non-DAG survivors (`compact-context`, `release`, `gap-sweep`, `run-chains`) promoted here in #868 for an unrelated reason (kernel-require rename trap) — **7 of 10 entries are pure-DAG and would shrink this list to 3 on deletion.**
  - `MATERIALIZED_SHARED` (`scripts/edition-sync.js:93-95`, 1 entry) — `kaola-workflow-adaptive-schema.js` materialized byte-identical into gitlab/gitea/codex. This is §A2's mixed anchor file; the materializer itself is mechanism, not DAG.
- `scripts/validate-script-sync.js` — `COMMON_SCRIPTS` (`:45-104`, 22 entries, the claude↔codex byte-copy set) contains 9 DAG-pure names (`plan-validator`, `next-action`, `commit-node`, `adaptive-handoff`, `adaptive-node`, `replan`, `codex-preflight`, `task-mirror`, plus `install-manifest` which is non-DAG but DAG-listing) interleaved with 13 survivors. `BYTE_IDENTICAL_GROUPS` (`:117+`) 4-tree byte-identity groups include `ledger-compare`, `resolve-agent-model`, `compact-context`, `closure-contract`, `validation-runner` — all §A3/A4 mixed/light files, none pure-DAG.

**Per-forge hand-ported DAG script twins found** (canonical name → `kaola-{gitlab,gitea}-workflow-` prefix rename, one pair per forge unless noted):
`-adaptive-node.js`, `-adaptive-handoff.js`, `-plan-validator.js`, `-replan.js`, `-commit-node.js`,
`-next-action.js`, `-classifier.js`, `-claim.js`, `-closure-audit.js`, `-closure-contract.js` (base-
named, not renamed — 4-tree byte group), `-adaptive-schema.js` (base-named, materialized not
renamed), `-compact-context.js`, `-gap-sweep.js`, `-repair-state.js`, `-sink-merge.js`, `-task-mirror.js`,
`-active-folders.js`, `-roadmap.js`. Codex (`plugins/kaola-workflow/scripts/`) carries the SAME base
names as canonical (byte-identical group / `COMMON_SCRIPTS`, not renamed).

**Edition-specific integration-test walkthroughs** (each pins node-lifecycle behavior independently — category B duplication, not source duplication):

| File | Lines |
|---|---:|
| `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` | 3,036 |
| `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | 2,241 |
| `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` | 2,317 |
| `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js` | 369 |
| `plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js` | 361 |

`npm run sync:editions` = `node scripts/edition-sync.js --write` (`package.json:40`). Additive
runtimes `opencode`/`kimi` (`scripts/sync-opencode-edition.js`, `scripts/sync-kimi-edition.js`,
`scripts/test-opencode-edition.js`, `scripts/test-kimi-edition.js`) had ZERO DAG-vocab hits — their
`.opencode/plugins/kaola-workflow-hooks.js` / `.kimi/skills/` trees do not appear to encode node-
execution semantics; not independently verified this pass.

---

## D. Prompt surfaces

### D1 — `commands/` (3 of 5 are the "six propagation surfaces" per `docs/conventions.md:524`)

| File | Lines | DAG-vocab hits (`node\|ledger\|write.set\|freeze\|plan_hash\|parallel_safe\|depends_on\|epoch\|role`, case-insens.) | Relationship |
|---|---:|---:|---|
| `commands/kaola-workflow-plan-run.md` | 801 | 178 | **A six-surface file.** The adaptive loop skeleton, reduced per conventions.md to a ~150-line loop + `<!-- CARD: -->` pointers into `docs/plan-run-cards/`. Implements/describes the DAG execution loop directly. |
| `commands/kaola-workflow-finalize.md` | 502 | 47 | **A six-surface file.** Describes the finalize door, which per ADR 0017 step 3 must be re-pointed off the plan-validator's whole-plan sweep. |
| `commands/kaola-workflow-adapt.md` | 301 | 37 | **A six-surface file.** Re-plan/epoch entry point — wholly retires with epochs. |
| `commands/workflow-next.md` | 509 | 23 | NOT one of the six; describes `pick-next`/claim flow — mixed (claim survives, but references plan state). |
| `commands/workflow-init.md` | 442 | 23 | NOT one of the six; bootstrap/startup — mixed, light. |

### D2 — `agents/` (Claude subagent prompts, root tree — 15 files)

| File | Lines | Hits | Note |
|---|---:|---:|---|
| `agents/workflow-planner.md` | 512 | 134 | **Heaviest agent prompt by far.** THE plan-authoring agent — freezes the DAG, plan grammar, write sets, node roles. Wholly retires per "the mandatory planner and its control-boundary refusal." |
| `agents/synthesizer.md` | 69 | 15 | Frontier-join/reconciliation role — DAG-adjacent (co-open legs, running-set joins); some of its function (reconciling concurrent subagent output) plausibly re-homes into the mission-list's "the frontier is visible, the agent decides" model rather than disappearing outright — needs a read, not assumed dead. |
| `agents/implementer.md` | 98 | 15 | Write-role prompt; write-set/role-token vocabulary throughout, but "implementer" as a dispatched subagent concept plausibly survives the DAG's retirement (mission-list items still get dispatched to *something*). |
| `agents/metric-optimizer.md` | 74 | 13 | Similar — role-token-scoped prompt for a role that may outlive the DAG shape. |
| `agents/adversarial-verifier.md` | 97 | 10 | Same pattern — the read-frontier "majority-refute fan-out" role; the CONCEPT survives (adversarial verify is named explicitly as a correctness mechanism ADR 0017 does not touch), the PROMPT'S write-set/node vocabulary does not. |
| `agents/investigator.md` | 105 | 7 | Light role-vocabulary touch. |
| `agents/security-reviewer.md` | 109 | 9 | Light. |
| `agents/code-reviewer.md` | 101 | 6 | Light. |
| `agents/build-error-resolver.md` | 137 | 4 | Light. |
| `agents/knowledge-lookup.md` | 99 | 3 | Light. |
| `agents/planner.md` | 158 | 3 | **Distinct from `workflow-planner.md`** — a generic planning role; relationship not fully resolved this pass (needs a read: is it a plan-node role usable inside the old DAG, or the pre-adaptive/legacy planner referenced in `docs/decisions/0003-adaptive-front-end-planner.md`?). |
| `agents/code-architect.md` | 98 | 3 | Light. |
| `agents/code-explorer.md` | 96 | 3 | Light — this agent's own definition file, incidentally (self-referential note only). |
| `agents/doc-updater.md` | 140 | 2 | Light. |
| `agents/tdd-guide.md` | 107 | 14 | Moderate — test-custody role vocabulary (#813-815), likely survives per that memory. |

### D3 — `plugins/*/agents/*.toml` — hand-maintained twins (48 files: 15 roles + `workflow-planner` × 3 forges, + 3 `config/agents.toml` templates; the ADR's explicitly named "no generator owns these")

Line counts and DAG-vocab hits are near-identical across the 3 forge copies of each role (they are
hand-maintained mirrors of the 15 `agents/*.md` files, not a generated set). Representative per-role
figures (gitlab copy; gitea/kaola-workflow copies match within 0-1 lines):

| Role `.toml` | Lines | Hits |
|---|---:|---:|
| `workflow-planner.toml` | 122 | 42 — heaviest, matches `agents/workflow-planner.md` |
| `tdd-guide.toml` | 38 | 11 |
| `adversarial-verifier.toml` | 91 | 10 |
| `implementer.toml` | 40 | 10 |
| `security-reviewer.toml` | 103 | 9 |
| `synthesizer.toml` | 29 | 8 |
| `metric-optimizer.toml` | 31 | 6 |
| `code-architect.toml` | 22 | 6 |
| `code-reviewer.toml` | 95 | 6 |
| `investigator.toml` | 27 | 4 |
| `build-error-resolver.toml` | 23 | 3 |
| `knowledge-lookup.toml` | 21 | 3 |
| `code-explorer.toml` | 22 | 3 |
| `doc-updater.toml` | 23 | 3 |
| `planner.toml` | 21 | 3 |
| `config/agents.toml` (×3, one per forge) | 74 | 4 |

Total: 48 files, ~2,346 lines, 393 real DAG-vocab hits. **These are the surface most likely to be
forgotten** — `agents/*.md` has an obvious generator-adjacent feel (root tree, matches plugin dirs by
name), but per ADR 0017's own text these `.toml` twins are hand-maintained and "no generator owns
them" — a script-driven propagation sweep will walk past them.

### D4 — `plugins/*/skills/*/SKILL.md` — the 3 Codex SKILL packs × 3 forges (the other half of the six-surface set) + 2 non-six packs × 3 forges

| SKILL pack | Six-surface? | Lines (×3 forges, near-identical) | Hits (×3) |
|---|---|---:|---:|
| `kaola-workflow-plan-run/SKILL.md` | **yes** | 903 / 903 / 903 | 163 / 163 / 163 |
| `kaola-workflow-finalize/SKILL.md` | **yes** | 619 / 618 / 618 | 46 / 46 / 46 |
| `kaola-workflow-adapt/SKILL.md` | **yes** | 536 / 536 / 536 | 75 / 75 / 75 |
| `kaola-workflow-next/SKILL.md` | no | 595 / 598 / 597 | 27 / 27 / 27 |
| `kaola-workflow-init/SKILL.md` | no | 323 / 323 / 323 | 13 / 13 / 13 |

Total: 15 files, 8,931 lines, 972 hits.

### D5 — `docs/plan-run-cards/` (pure DAG reference docs, pointed at by the plan-run skeleton's `<!-- CARD: -->` markers, NOT six-surface-replicated)

| File | Lines | Hits |
|---|---:|---:|
| `repair-routing.md` | 504 | 107 |
| `frontier-batch.md` | 346 | 76 |
| `speculative-open.md` | 298 | 58 |
| `reopen-complete-node.md` | 228 | 53 |
| `join-protocol.md` | 210 | 33 |
| `expansion.md` | 173 | 33 |
| `resume.md` | 183 | 54 |
| `governance.md` | 144 | 25 |
| `metric-optimizer.md` | 151 | 27 |
| `README.md` | 42 | 7 |

All 10 files (2,279 lines, 473 hits) are wholly DAG — this is the densest doc directory in the repo
(~21% line-hit ratio) and every file's entire reason to exist is a DAG rare-branch.

### D6 — `hooks/` and `templates/`

`hooks/kaola-workflow-subagent-dispatch-log.sh` + `hooks/hooks.json` — not read this pass; named
forge-neutral in `kaola-workflow-install-manifest.js` comments, likely survives (dispatch logging is
orchestrator-level, not DAG-shaped) but unverified.
`templates/routing/*.js` (rename-table, slots, required-blocks, skeleton `.md` files ×4) — these
GENERATE/validate the six-surface skeletons (D1/D4); the generator mechanism survives, its skeleton
CONTENT is DAG. Not individually read this pass.

---

## E. Wiring

**`package.json`** (`package.json:38-48`) — `scripts` block. All four `test:kaola-workflow:{claude,
codex,gitlab,gitea}` chains invoke `test-adaptive-node.js`, `test-adaptive-handoff.js`,
`test-plan-run.js`, `test-plan-shape-audit.js`, `test-plan-design-section.js`, `test-plan-validator.js`,
`test-commit-node.js`, `test-next-action.js`, `test-replan.js` (claude/full only explicitly; codex/
gitlab/gitea invoke their own `simulate-*-workflow-walkthrough.js` which internally exercises the
same lifecycle) directly by name — these are hard-coded npm-script tokens, not manifest-driven, so
retiring a DAG test means editing `package.json` scripts 4 times (`claude`, `claude:full`, plus the
codex/gitlab/gitea chains only exercise it indirectly via their walkthrough).

**`scripts/kaola-workflow-install-manifest.js:61-87`** — `SUPPORT_SCRIPTS` (25 entries), the SINGLE
SOURCE for install.sh's per-forge support-script list (post-#407; install.sh itself has no literal
script-name strings — `SUPPORT_SCRIPT_NAMES=()` at `install.sh:129` is populated at runtime from this
manifest). 12 of the 25 entries are §A1/§A2 pure-DAG or cross-edition-anchor files: `classifier.js`,
`plan-validator.js`, `next-action.js`, `commit-node.js`, `adaptive-handoff.js`, `adaptive-node.js`,
`replan.js`, `adaptive-schema.js`, `resolve-agent-model.js`, `codex-preflight.js`, `task-mirror.js`,
`ledger-compare.js`. Deleting the DAG shrinks this ONE list from 25 to 13 — no `case "$FORGE"` block
edit required (that triplication was retired by #407, per this file's own header comment).

**`scripts/edition-sync.js:52-74`** — `GENERATED_AGGREGATORS` (10 entries, 7 pure-DAG) — see §C.

**`scripts/validate-script-sync.js:45-104`** — `COMMON_SCRIPTS` (22 entries, 9 pure-DAG + `install-manifest.js` which is DAG-adjacent by content) and `BYTE_IDENTICAL_GROUPS` (`:117+`, several 4-tree groups covering §A3/A4 mixed files, none pure-DAG) — see §C.

**`install.sh` / `install-all.sh`** — no literal DAG script names (manifest-driven, confirmed by a
`adaptive-node|adaptive-handoff|plan-validator|commit-node|next-action|replan\.js` sweep returning
zero hits in both files). `install-opencode.sh` / `install-kimi.sh` not checked this pass but are
additive per CLAUDE.md and excluded from the edition-sync/four-chain system.

**Test-registry / suite-registration**: `scripts/test-suite-registration.js` (199 ln, 0 DAG hits) —
governs the shard-sampling registry the fast gate relies on (`--shard auto/12`); `test-adaptive-node`
and `test-replan` are two of the three heavyweight suites the fast gate SAMPLES rather than runs in
full (`docs/conventions.md:572`) — deleting them removes 2 of the 3 non-full-coverage entries the fast
gate currently carries.

---

## F. Docs

| File | Lines | Hits | Note |
|---|---:|---:|---|
| `docs/api.md` | 4,610 | 707 | Endpoints/schemas/event docs — CLI flag reference for every DAG script (plan-validator flags, adaptive-node subcommands, closure contract). Largest doc file in the repo; needs the heaviest rewrite. |
| `docs/architecture.md` | 1,333 | 279 | System structure — describes the DAG executor's place in the data flow. |
| `docs/workflow-state-contract.md` | 1,385 | 305 | Durable-state schema — `## Node Ledger`, `## Nodes`, `plan_hash`, `## Expansion Records` are schema-level content here. |
| `docs/conventions.md` | 1,049 | 151 | Coding/testing/git rules — the six-surface propagation rule (§D), the two-validation-tiers section naming `test-adaptive-node`/`test-replan` by name, and the plan-run-cards table (`:527-537`) all live here. |
| `docs/agents-source.md` | 139 | 13 | Vendored agent-source documentation — light touch. |
| `docs/README.md` | 34 | 8 | Doc index. Already lists 0017 as "THE CURRENT DESIGN, read first" but has NOT been rewritten per step 6 — still frames 0013/0016 as prerequisite and lists `plan-run-cards/` as live reference material. |
| `docs/mission-list.md` | 97 | 2 | **New/pre-existing** — the ADR 0017 Step-1 deliverable itself. Not a demolition target; it's the replacement's spec. |
| `README.md` | 1,661 | 151 | Project overview — describes the DAG in its own words ("task-shaped DAG of role nodes," per `package.json`'s `description` field too). |
| `AGENTS.md` | 20 | 0 | Consumer-facing generic pointer file — no DAG vocabulary at all; likely just a redirect, unaffected. |
| `CLAUDE.md` | ~199 (repo max) | n/a | Not grepped as a doc target here (it's the file that GOVERNS this campaign); already carries the 0017 banner atop "Design of record" and states "NOT BUILT" — ADR 0017 step 6 explicitly names removing this banner as the LAST step. |

**`docs/decisions/` + `docs/investigations/`** — 205 files total (188 decisions incl. `D-NNN-01`
short-form and 17 `000N-name.md` long-form, plus investigations). NOT individually inventoried here:
these are historical provenance records, not build/prompt surfaces — per CLAUDE.md's own provenance
rule they don't propagate into agent-facing prompts, and per the "Derive, Never Reduce" principle
their content describes decisions made, not code that runs today. The design-authoritative subset
worth knowing by name: `0013-successor-test-two-gate-target-architecture.md` (921 ln), `0016-the-
substrate-bookkeeping-over-gates.md` (272 ln, SURVIVES — completed not superseded by 0017), `0017-
the-mission-list.md` (218 ln, the ADR itself), `0005-plan-run-owns-node-lifecycle.md`,
`0009-freeze-wall-absolute-path-and-finalize-probe-classification.md`, `0010-runtime-neutral-per-leg-
worktree-isolation.md`, `0015-kernel-journaling-as-commits-rejected.md` (SURVIVES, kernel-scoped),
and the `D-419-01`/`D-419-02`/`D-420-*`/`D-440-01`/`D-441-01`/`D-442-01`/`D-446-01` cluster (the
parallelism-v3 + goal-driven-automation + release-aggregator decision chain). None of these need
editing to ship 0017; they stay as the historical record of why the DAG existed.

---

## Coverage caveats

- §D2 (`agents/*.md`) individual role classification (implementer, synthesizer, adversarial-verifier,
  metric-optimizer, tdd-guide, planner.md vs workflow-planner.md) is a first-pass read of grep hits +
  file openings, not a full read of all 15 files — flagged explicitly where uncertain.
- `hooks/`, `templates/`, `install-opencode.sh`, `install-kimi.sh`, and the 205 `docs/decisions/` +
  `docs/investigations/` files were swept by grep/glob only, not individually opened.
- `scripts/measure-validator-duplication.js`, `scripts/measure-site-execution.js`,
  `scripts/generate-reviewer-profiles.js`, `scripts/generate-routing-surfaces.js` were named but not
  content-read this pass.

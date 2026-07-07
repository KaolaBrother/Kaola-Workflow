# Workflow Plan — issue 630

<!-- plan_hash: 3d890ad4ce9efb6a4898852fd7508e2bb25421cdc5eeb4c11368449089afdff0 -->

## Meta
speculative_open_policy: auto
goal: use kaola-workflow skills to finish all issues; delegate subagents as the workflow demands; all reviewer subagents use fable
labels: refactor, area:scripts, area:routing
validation_command: npm test

## Plan Notes

**Goal (630).** Generate the six #400 routing surfaces from ONE canonical source, killing the
propagation-by-copy drift class ("silently dropping a routing block is impossible by construction").
Authored to REALIZE the settled, adversarially-validated two-layer design in
`docs/investigations/2026-07-08-630-636-routing-generation-seam.md` (§"Build Run 2 — #630",
§"Settled design — repaired Candidate D (two-layer)", §"By-construction regression battery",
§"Build-run decomposition"). This BUILDS on the FENCED base: #636 (prerequisite — pin relocation +
the two semantic PIN markers) already SHIPPED + CLOSED on main, so the plan-run surfaces already
carry `<!-- PIN: teammate-mode -->` / `<!-- PIN: codex-dispatch -->` and the runtime-dead blocks are
fenced. The change is CROSS-EDITION (#307): all four `npm run test:kaola-workflow:{claude,codex,
gitlab,gitea}` chains green, run SEQUENTIALLY and recorded before Finalization.

**The 18-surface universe (6 per topic × 3 topics), verified on disk this run.**
- plan-run (6): `commands/kaola-workflow-plan-run.md` + gitlab/gitea command twins; the 3 SKILLs
  `plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/skills/kaola-workflow-plan-run/SKILL.md`.
- next (6): `commands/workflow-next.md` (note the un-prefixed filename) + gitlab/gitea command twins;
  the 3 `.../skills/kaola-workflow-next/SKILL.md`.
- finalize (6): `commands/kaola-workflow-finalize.md` + gitlab/gitea command twins; the 3
  `.../skills/kaola-workflow-finalize/SKILL.md`.

### Two-layer design realized

- **LAYER 1 — presence, ALL 18 surfaces (incl. finalize).** A single-source required-block MANIFEST
  `templates/routing/required-blocks.js` (a CommonJS module the checker `require()`s; each block
  `{ block_id, topic, runtime_tag ∈ {claude-live,codex-live,both}, surface_type_tag ∈ {command,skill,
  both}, content_tokens:[distinctive substrings] }`). A DERIVED-UNIVERSE presence checker (in
  `scripts/test-route-reachability.js`) asserts every `content_token` on every surface the entry
  obligates, where the surface SET is COMPUTED from topic+tags (never hand-typed) — so obligating
  4-of-6 is structurally impossible. Four load-bearing properties (all from the adversary's R2):
  (1) CONTENT tokens, not bare markers; (2) ADDITIVE-SUPERSET over today's T-pins, proven by a
  machine-checked superset proof (every legacy T-pin token — incl. the #624-fix gate flags
  `--resume-check`/`--gate-verify`/`--barrier-check`/`--verdict-check` + `workflow_path: adaptive` —
  is a manifest content_token over a ⊇ surface set); consolidate a T-pin ONLY where the proof
  confirms coverage, else it stays a RESIDUAL additive pin; (3) a T3-style STRUCTURAL RED-PROOF
  self-test (the acceptance battery below); (4) file universe DERIVED from the T1/T2 emitted-targets
  registries (already in `test-route-reachability.js`, sourced from `kaola-workflow-adaptive-schema.js`)
  + a BIDIRECTIONAL orphan-sentinel.
- **LAYER 2 — byte, plan-run + next only (12 surfaces).** A NEW prose-generator engine
  `scripts/generate-routing-surfaces.js` (frontmatter as a two-shape surface-type slot; H1
  forge-suffix token; runtime-conditional slots for the now-fenced teammate-mode/codex-dispatch
  blocks; a forge-noun rename TABLE — NOT a regex, so `resolve-agent-model.js` and like tokens stay
  un-renamed; the 2 sub-sentence splices via SCOPED token substitution) reading canonical skeletons
  `templates/routing/{plan-run,next}.skeleton.md` + per-surface `templates/routing/slots.js` +
  `templates/routing/rename-table.js`, glued to an edition-sync-style `--check`/`--write` byte-compare
  shell. The 12 template-shaped surfaces become `@generated`; a hand-edit to any reds the chains.
- **FINALIZE — Layer 1 ONLY (manifest-guarded, hand-authored, NOT byte-generated).** Its 2:1
  wholesale rewrite makes byte-generation a re-authoring project (a precedence-#1 accuracy risk) for a
  presence guarantee the manifest already delivers. KEEP the #624-fix four-gate pins and the
  deliberate gitea/gitlab `mr|pr)` contract pins (R3: those are machine-pinned contracts, NOT drift —
  touching them reds the forge chain). Accepted residual (R3a): a present-but-wrong-content defect on
  finalize prose OUTSIDE the pinned token set is uncaught; it IS caught for the tokens that matter
  (gate flags, closure-audit, verdict block). Layer 1 is strictly stronger than today's finalize
  regime.

**Planner-pinned file layout (the frozen write set fixes these EXACT paths; n1-plan settles their
internal schema/slot CONTENT, not their existence/extension).** Manifest `templates/routing/
required-blocks.js`; skeletons `templates/routing/plan-run.skeleton.md` + `templates/routing/
next.skeleton.md`; slot data `templates/routing/slots.js`; rename table `templates/routing/
rename-table.js`; engine `scripts/generate-routing-surfaces.js`; engine self-test
`scripts/test-generate-routing-surfaces.js`. All are root-only new files (no forge port, no byte
mirror — parity with `scripts/test-route-reachability.js`, which is single-copy). n1-plan's emitted
spec MUST conform to this frozen layout.

### DAG shape / scheduling rationale (single serial spine + one clean post-review overlap)

- **The builder spine is inherently serial — every edge is a TRUE dependency, not ordering.**
  `n1-plan → n2-manifest → n3-engine → n4-generate → n5-reconcile → n6-review →
  {n7-adversary ∥ n8-docs} → n9-finalize`.
  - `n2-manifest → n3-engine`: the skeletons B authors must PRODUCE surfaces that PASS A's manifest
    checker; authoring B against A's CONCRETE manifest guarantees manifest↔skeleton consistency. This
    matters because the reviewer subagents run at fable (weak) per the standing directive and cannot
    catch a manifest↔skeleton block mismatch — accuracy-first (precedence #1) forces serial here.
  - `n3-engine → n4-generate`: C runs B's engine (`--write`) to regenerate the 12 surfaces.
  - `n4-generate → n5-reconcile` AND the whole A/C/D chain: **A, C, D ALL write the four
    `validate-*-contracts.js` + the byte mirror + `test-route-reachability.js` — the "hidden shared
    surface" false-disjoint trap (`docs/conventions.md:263`). These are EXACT-file overlaps, so the
    three MUST be ONE SERIALIZED FRONTIER (A → C → D), NEVER parallel_safe legs** (an unordered pair
    writing the same exact validator file is a guaranteed shared-worktree clobber → the validator
    refuses it). Serialized ordered pairs are skipped by the antichain disjointness loop, so this is
    in-grammar.
- **The ONLY parallelism is the post-review antichain `n7-adversary ∥ n8-docs`** — both depend on
  `n6-review`, `n7` is read-only (empty write set → trivially disjoint), `n8` writes a disjoint
  decision record + conventions doc. I add NO edge between them and let the validator DERIVE
  `parallel_safe` (never hand-annotated); `n8-docs` overlaps the adversarial gate for free. No
  allowband collision: `n7`'s write set is empty.
- **No wider fan-out is authored.** The 18 mainline + 6 finalize surfaces are a SEMANTICALLY-COUPLED
  cross-edition set (the manifest, checker, and validator consolidation must move atomically; the
  generator reproduces all 12 from one skeleton per topic). Splitting into per-edition legs would
  force the shared validators/manifest/test files to overlap concurrent writers (not disjoint) and
  fragment context for zero makespan gain (CLAUDE.md precedence #3: cheapest sufficient mechanism).
  There is no file-count ceiling forcing a split.

### Gates

- **`n6-review` (`code-reviewer`) post-dominates every code-producing node on every path to the sink
  (G1).** Code nodes are `n2`, `n3`, `n4`, `n5` (all IMPLEMENT_ROLES); each funnels
  `n2→n3→n4→n5→n6` before the sink split `n6→{n7|n8}→n9`, so `n6` is the single cut vertex. The
  reviewer runs `validation_command` (the four chains — this IS a #307 cross-edition diff) as the
  falsifiable proof and verifies: the derived-universe checker obligates ALL 18 surfaces from
  topic+tags; the superset proof covers every legacy T-pin token (incl. the #624-fix gate flags); the
  12 surfaces are byte-reproduced by the generator (`--check` green) and marked `@generated`; the
  finalize #624-fix pins and the gitea/gitlab `mr|pr)` pins are UNTOUCHED; the red-proof battery reds
  each planted defect; no forge surface gained a `gh`/`glab`/`tea` CLI token or forge brand noun; no
  provenance (`#NNN`/`D-NNN`/`[INV-NN]`) leaked into any command/SKILL surface.
- **`n7-adversary` (`adversarial-verifier`) is the design-mandated CHANGE GATE** on this subtle
  four-chain-red-risk, by-construction diff. It lies on a code→sink path (`n5→n6→n7→n9`), so it is a
  full change gate (`--verdict-check` applies). It independently re-runs the red-proof battery + the
  four chains and attacks the by-construction guarantee (can a dropped/hollowed block still pass? can a
  new auto-obligated surface dodge? does a consolidated T-pin lose coverage the manifest doesn't
  restore?). Both `n6` and `n7` are authored at `reasoning` (their accuracy-critical INTENT); the
  executor applies the standing model=fable override on dispatch.
- **No `security-reviewer` (no G2).** No write-set file matches a sensitive pattern
  (no auth/token/secret/session/crypto/network/`.env`/CI path); frozen labels are non-sensitive
  (refactor/routing/scripts) → G2 does not fire.
- **No `main-session-gate`.** Acceptance is FULLY MACHINE-CHECKABLE (the by-construction red-proof
  battery + all four chains green sequentially); there is no non-delegable GPU/device/human check, so
  a main-session-gate is unwarranted.
- **No `knowledge-lookup`.** Every fact is local to this repo's own surfaces/validators/edition-sync
  + the settled shaping doc; no external library/API behavior is in question.

### The by-construction regression battery (acceptance proof — built in n2, extended to finalize in n5)

Modeled on the existing `test-route-reachability.js:104-119` T3 RED-PROOF pattern over a SYNTHETIC
manifest + fixture surfaces, asserting NONZERO exit for each planted defect:
(1) a block DROPPED from one derived surface;
(2) a block HOLLOWED (content_token removed, marker kept);
(3) a NEW surface auto-obligated (synthetic emitted-target) MISSING a block;
(4) an ORPHAN manifest entry (obligates a non-existent surface);
(5) an ORPHAN surface block (a surface block with no manifest entry — the bidirectional sentinel);
(6) the SUPERSET proof (every legacy T-pin token is a manifest content_token over a ⊇ surface set).
Passing this battery is what makes "silently dropping a routing block impossible by construction" hold
and makes a main-session-gate unnecessary. n5 extends cases (1)/(2)/(5) to the 6 finalize surfaces.

### Write-set completeness (recurring-overflow checklist, walked per node)

- **Byte-identical SYNC-GROUP pair.** `scripts/validate-workflow-contracts.js` and
  `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` are byte-identical (verified this
  run); every edit lands identically in BOTH — BOTH declared on every node that touches the validator
  frontier (n2, n4, n5).
- **No `generated_port_split` obligation.** None of the four validators, `test-route-reachability.js`,
  the new generator, or the new templates is a GENERATED_AGGREGATOR (verified against
  `edition-sync.js`: the aggregator list is the five adaptive scripts only). `validate-kaola-workflow-
  contracts.js` (codex/github) has NO plugin byte-mirror (single copy at `scripts/`); the gitlab/gitea
  validators are hand-authored forge ports, each declared explicitly.
- **The four validators + byte mirror + `test-route-reachability.js` are declared on n2 AND n4 AND
  n5** — the serialized validator frontier. Over-declaration is barrier-safe (declared-but-unwritten
  never trips the barrier); it documents the frontier intent.
- **The generator's chain wiring is `package.json` (n4).** The four `npm run test:kaola-workflow:*`
  chains live ONLY in the root `package.json`; n4 adds `node scripts/generate-routing-surfaces.js
  --check` (and the engine self-test) to them.
- **`.cache` receipts are recorded parent-side, barrier-exempt — not declared.**
- **Cross-edition symbol scope.** The manifest content_tokens + the generator's slot/rename tokens
  live ONLY on the 18 routing surfaces + the six validator/test/manifest files enumerated here; no
  other edition tree references them for a decision (the emitted-target registries in
  `test-route-reachability.js` already source the surface universe from `kaola-workflow-adaptive-
  schema.js`).

### Forge-neutrality / provenance discipline (builders must obey)

- The plugin plan-run/next/finalize surfaces stay forge-neutral: NO `gh`/`glab`/`tea` CLI token, NO
  forge brand noun — the rename table maps forge NOUNS/URL shapes only, not CLI binaries. After
  editing forge-touching files, run the standalone forbidden-token check per edition
  (`node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
  --forbidden-only <changed-file>...` and the gitea twin) BEFORE the full chains.
- PROVENANCE_BAN: NO issue refs (`#630`, `#636`), decision IDs (`D-NNN-NN`), or invariant tags in ANY
  command/SKILL surface, skeleton, slot data, or manifest that renders into a surface. State the rule,
  not its origin; provenance lives in CHANGELOG / the decision record / the `.js` contract-validator
  comments only.

### Docs (n8-docs) — dictated content (doc-updater runs at `standard`, never haiku; haiku fabricates)

- `docs/conventions.md` — add a "Routing / adaptive prose" subsection describing the GENERATION model:
  the 12 plan-run/next surfaces are `@generated` from `templates/routing/{plan-run,next}.skeleton.md`
  via `scripts/generate-routing-surfaces.js` (hand-edits red the chains); ALL 18 surfaces (finalize
  included) carry a manifest-derived PRESENCE guarantee via `templates/routing/required-blocks.js` +
  the derived-universe checker in `test-route-reachability.js`; finalize is Layer-1-only
  (manifest-guarded, hand-authored) and its #624-fix + gitea/gitlab `mr|pr)` pins are deliberate,
  retained contracts. Keep the existing #400 SIX-surface rule prose consistent with the new model.
- `docs/decisions/D-630-01.md` — next free number (verified: no `D-630-*` on disk;
  `D-636-01 (existing)` is the prerequisite record). Records the settled two-layer architecture
  (manifest presence across 18 + scoped byte-generation confined to the drift-proven plan-run/next),
  why finalize stays Layer-1-only (2:1-rewrite precedence-#1 risk; accepted R3a residual), the
  additive-superset consolidation discipline, and the ship-#636-first sequencing.

### Acceptance mapping (issue-630 AC → nodes)

- AC "one canonical source; six surfaces generated; hand-edit reds the chains" → n3 (engine +
  skeletons) + n4 (`--write` regen + `--check` wired into all four chains); verified n6/n7.
- AC "a planted missing block is impossible by construction (regeneration restores it)" → the derived
  checker (n2) + the RED-PROOF battery (n2, extended finalize in n5); verified n6/n7.
- AC "all four npm chains + route-reachability green; docs/conventions.md updated" → n6/n7 run
  `validation_command` (`npm test` chains the four with `&&`, run SEQUENTIALLY, recorded; #635 flake
  fixed at `73ca26db` → expect a clean unwaived receipt); n8 updates docs/conventions.md.
- Constraint "md↔toml planner parity + per-surface frontmatter slot-driven" → the generator's
  surface-type frontmatter slot (n3). No paired `.toml` obligation was found for these routing
  surfaces (flip-premise 5 in the shaping doc); if n1-plan discovers one, it is recorded and the
  frozen write set already covers the six surface files per topic.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-plan | planner | — | — | 1 | sequence | reasoning | — |
| n2-manifest | tdd-guide | n1-plan | templates/routing/required-blocks.js, scripts/test-route-reachability.js, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 7 | sequence | reasoning | — |
| n3-engine | tdd-guide | n2-manifest | scripts/generate-routing-surfaces.js, scripts/test-generate-routing-surfaces.js, templates/routing/plan-run.skeleton.md, templates/routing/next.skeleton.md, templates/routing/slots.js, templates/routing/rename-table.js | 6 | sequence | reasoning | — |
| n4-generate | implementer | n3-engine | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, commands/workflow-next.md, plugins/kaola-workflow-gitlab/commands/workflow-next.md, plugins/kaola-workflow-gitea/commands/workflow-next.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md, package.json, scripts/test-route-reachability.js, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 19 | sequence | standard | Mechanical `--write` regeneration of the 12 template-shaped surfaces from the n3 engine plus integration wiring (package.json: the generator `--check` + the engine self-test into all four npm chains; @generated headers; validator pin references to the now-generated files). The acceptance oracle is the engine's byte-regen `--check` equality against the committed post-#636 surfaces plus n2's manifest checker / red-proof battery — integration equalities applied by this node, not a separable failing unit test that precedes the regeneration |
| n5-reconcile | tdd-guide | n4-generate | commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md, templates/routing/required-blocks.js, scripts/test-route-reachability.js, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 13 | sequence | reasoning | — |
| n6-review | code-reviewer | n5-reconcile | — | 1 | sequence | reasoning | — |
| n7-adversary | adversarial-verifier | n6-review | — | 1 | sequence | reasoning | — |
| n8-docs | doc-updater | n6-review | docs/conventions.md, docs/decisions/D-630-01.md | 2 | sequence | standard | — |
| n9-finalize | finalize | n7-adversary, n8-docs | CHANGELOG.md | 1 | sequence | — | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-plan | complete |
| n2-manifest | complete |
| n3-engine | complete |
| n4-generate | complete |
| n5-reconcile | complete |
| n6-review | complete |
| n7-adversary | complete |
| n8-docs | complete |
| n9-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner (n1-plan) | subagent-invoked | evidence-binding: n1-plan ccf64fc6309b | |
| tdd-guide (n2-manifest) | subagent-invoked | evidence-binding: n2-manifest 48f955b37a69 | |
| tdd-guide (n3-engine) | subagent-invoked | evidence-binding: n3-engine 45f1a1faa131 | |
| implementer (n4-generate) | subagent-invoked | evidence-binding: n4-generate 31c72e54f720 | |
| tdd-guide (n5-reconcile) | subagent-invoked | evidence-binding: n5-reconcile fd983d3da9d2 | |
| code-reviewer | subagent-invoked | evidence-binding: n6-review a74380f7b065 | |
| adversarial-verifier (n7-adversary) | subagent-invoked | evidence-binding: n7-adversary a7c5c76c29f9 | |
| doc-updater (n8-docs) | subagent-invoked | evidence-binding: n8-docs 4441d8e91127 | |
| finalize (n9-finalize) | main-session-direct | evidence-binding: n9-finalize c513e4522bdf | |

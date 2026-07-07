evidence-binding: n4-assume-design c979646a2c74
## n4-assume-design — #630 generation seam + #636 coupling: design recommendation

### Framing: "impossible by construction" splits into TWO strengths
The #630 core AC = "silently dropping a routing block is impossible by construction" (the #624 hole: a whole block lost on a subset of surfaces while all 4 chains stay green). Two probe facts reshape the solution:
1. The #624 incident was a FINALIZE block drop; #369/#380 same shape (reaching 4-of-6). The drift class is **whole-block-ABSENT-on-a-subset**, NOT content-divergence-while-present. Block-absence is closed by a **presence check sourced once** — does NOT require byte-generation.
2. Generation tractability is TOPIC-DEPENDENT (n1): plan-run 1.08 (template-shaped, PIN/CARD byte-identical cmd↔SKILL), next 0.85, finalize **0.51 (2:1 rewrite)** — finalize has NO single canonical whose byte-render produces both surfaces without re-architecting it.

So "by construction" = two guarantees:
- **PRESENCE** (no block DROPPED): all 18 surfaces via a single-source **required-block manifest** whose file-list is DERIVED from per-block runtime+surface-type tags (physically cannot obligate 4-of-6 when the 6-set is derived, not hand-typed). Exact literal core AC.
- **BYTE** (no DRIFT at all): only template-shaped topics via generation+byte-compare (edition-sync's proven `expected!==actual`, n2). Adds divergence protection on top of presence.

### Candidate falsification
- **A (full skeleton+slots, all 18):** PASSES plan-run/next, REFUTED for "all 18" — finalize is a 2:1 re-authoring not a slot-fill; generating it requires re-architecting a working finalize surface = precedence-#1 rework hazard for a presence guarantee the manifest already delivers. Over-reaches on its final third.
- **B (single-source only the #636 dead-prose):** REFUTED vs the #630 AC — #624 was a FINALIZE four-gate drop, NOT one of the two dead-prose blocks; B is "#636 with a fancier mechanism," leaves the whole-block-drop class open where #624 actually happened.
- **C (no #630 now; #636 standalone; defer #630):** REFUTED as final answer, VALID as phase 1 — ships #636 (real value now) but leaves propagation-by-copy (the #630 root cause) intact; the finalize hole recurs.
- **D (recommended): two-layer — manifest foundation (all 18) + generation upgrade (plan-run, optionally next); finalize manifest-only.** SATISFIES: (i) manifest closes the drop hole across all 18 incl finalize (derived 6-set → 4-of-6 structurally impossible); (ii) plan-run byte-compare reds a planted drop + `--write` restores, frontmatter is a surface-type slot, the 2 sub-sentence splices handled by scoped token substitution (Opus→non-lowerable-floor swap is REQUIRED anyway for codex B2 model-noun purge → slot does it by construction); (iii) finalize stays hand-authored (no forced 2:1 rewrite) → precedence #1 preserved. NOT refuted.

### RECOMMENDATION: Candidate D (two-layer, manifest-anchored)
- **LAYER 1 — presence, ALL 18 (3 topics).** Single-source required-block manifest (`templates/routing/required-blocks.*`): each block declared ONCE with topic + runtime tag (claude-live/codex-live/both) + surface-type tag. A derived presence-check REPLACES the hand-curated T-pins in test-route-reachability.js (file-list per block COMPUTED from topic+tag, not hand-declared — the crux upgrade; hand-declared T-arrays are exactly what let T5b/T14 mis-target and #624 slip). Layer 1 alone meets the literal core AC on every surface INCLUDING finalize.
- **LAYER 2 — byte, plan-run + next (12 surfaces).** Generate from a canonical skeleton per topic + edition-sync-style `--check`/`--write` byte-compare. Render engine is NEW (n2: edition-sync rename-regex is wrong primitive; closest prior art sync-opencode-edition.js's frontmatter-parse + section-strip + scoped-rewrite + regen-compare, PLUS a new forge-noun rename TABLE — not a regex, resolve-agent-model.js stays un-renamed — PLUS a surface-type[command↔SKILL] axis neither script has). Mechanically enforces the #445 skeleton discipline hand-maintenance failed to hold; by-construction fences the runtime-dead blocks (Codex-dispatch = codex-only slot → absent from generated commands; Teammate-Mode = claude-live slot → absent/reduced in generated SKILLs).
- **Finalize = Layer 1 ONLY (manifest-guarded, NOT byte-generated).** CRITICAL: "hand-authored finalize" must mean MANIFEST-guarded, not needle-pin-guarded — else finalize (where #624 happened) stays weak-regime and the core AC isn't met there.
- **`next`:** include in Layer 2 if the engine is built anyway (its +2 SKILL-only sections are surface-type-conditional slots), OR defer to Layer-1-only for phase 1 (no documented drift like plan-run's #445) and graduate later.

### #636 ↔ #630 COUPLING: ship #636 FIRST standalone; do NOT fold
- #636 is independently tractable + valuable NOW (n3: bounded 6-location script edit; closes deferred #627 fix#2).
- #630 explicitly wants corrected canonicals as input (issue-630: "design+land AFTER #624/#627 — generation starts from corrected canonicals"); #636 IS #627 fix#2 → the fenced surfaces #636 produces are #630's canonical ground truth.
- The fencing FALLS OUT of #630's runtime slot BUT ONLY AFTER the validator relocation exists: a #630-generated fenced plan-run command (Codex-dispatch omitted) WITHOUT T5b relocation would RED T5b-on-command. So #636's validator relocation is a PREREQUISITE for #630's fenced generation, not just a consequence. Ship #636 first → removes the blocker.
- #630's Layer-1 manifest ABSORBS #636's relocation as runtime tags (T5b codex-only→SKILLs; T14 claude-live→commands) — refactor-into-manifest, not redo; standalone #636 ship not wasted.
- SEQUENCING (either path): #636 and #630 both edit the four validate-*-contracts.js (+ byte mirror) → the "hidden shared surface" false-disjoint trap (conventions.md:263) → NEVER parallel legs; serialize. Two runs (#636 then #630) cleanest.

### Build-run shapes
**Run 1 — #636 standalone (small):** planner → 1 builder → reviewer(fable)+adversary(fable) → doc-updater → finalize. Write-set = n3's exact map: test-route-reachability.js:183-190,451-458 (split shared planRunSurfaces into command-only+SKILL-only); validate-workflow-contracts.js:957-961 (del T5b-on-command)+:983-990 (shrink T14 to commands-only)+its byte mirror plugins/kaola-workflow/scripts/validate-workflow-contracts.js; validate-kaola-workflow-contracts.js:642-644 (del T14-on-github-SKILL); gitlab:792-794+gitea:797-799 (split shared cmd+SKILL loop); then FENCE Codex-dispatch out of 3 commands + Teammate-Mode out of 3 SKILLs; CHANGELOG. #307 YES.

**Run 2 — #630 two-layer (large, fresh re-plan on the fenced base):** planner freezes; Node A(builder Sonnet)=manifest single-source + derived presence-check refactor in test-route-reachability.js; Node B(builder Sonnet, Opus only if slot/splice model hits reasoning floor)=canonical skeletons (plan-run,next) + render engine (frontmatter/surface-type/runtime/forge slots + forge-noun rename TABLE + 2 scoped sub-sentence subs) + --check/--write CLI shell; Node C(builder Sonnet)=run --write regen 12 surfaces (become @generated) + wire generator --check into ALL FOUR npm chains + manifest check; Node D(builder Sonnet)=reconcile 6 finalize surfaces to manifest (Layer-1 sentinels only, no generation; validator edits serialize vs A/C — treat 4-validator writes as ONE serialized frontier); reviewer(fable)+adversary(fable) [crux: plant missing block in each of 12 generated → --check reds + --write restores; plant dropped gate in each of 6 finalize → manifest reds; prove frontmatter slot-driven; prove canonical does NOT reproduce existing drift — gitea vestigial mr|, claude/gitlab sentence reorder — skeleton authored from CORRECTED intent not byte-copied]; doc-updater=docs/conventions.md + CHANGELOG; finalize sink.

**Run-2 cross-edition WRITE-SET UNION:**
1. NEW scripts/<prose-generator>.js (new render engine + --check/--write; canonical/COMMON, run from root like edition-sync, NOT forge-ported).
2. NEW templates/routing/{plan-run,next}.skeleton.* + slot data + forge-noun rename TABLE.
3. NEW templates/routing/required-blocks.* (manifest single-source).
4. GENERATED (@generated, stop hand-editing) — 12 template-shaped surfaces: commands/{kaola-workflow-plan-run,kaola-workflow-next}.md + gitlab+gitea command twins + 3 codex skills/{plan-run,next}/SKILL.md triples (verify exact skill dir names at build).
5. MODIFIED (manifest sentinels, stay hand-authored) — 6 finalize surfaces: commands/kaola-workflow-finalize.md + 2 forge command twins + 3 finalize SKILLs.
6. test-route-reachability.js (T-pins → manifest-derived; absorbs #636 tags).
7. the four validate-*-contracts.js + byte mirror plugins/kaola-workflow/scripts/validate-workflow-contracts.js (wire generator --check + manifest check).
8. package.json — wire <generator> --check into ALL FOUR chains (unlike edition-sync --check gitlab/gitea-only) + a sync:routing script (or fold into sync:editions).
9. docs/conventions.md, CHANGELOG.md.

**#307:** YES unambiguous. All four chains sequential+recorded pre-finalize + walkthrough. opencode: NO #307, generator emits NO opencode surface; only run test-opencode-edition.js if the skeleton's inline opencode mentions (:47-49,:184) change. Guards: semantic slot/skeleton markers ONLY (PROVENANCE_BAN trips on #NNN/D-NNN even in comments — PIN/CARD markers prove semantic markers legal; never an issue ref in a marker); B2 model-noun purge on codex SKILLs (Opus→floor scoped swap satisfies by construction); forge-neutral CLI-token ban; #424 non-allowband .md write-set declaration for every generated surface.

### FLIP-premises (what would change the recommendation)
1. If the drift class is CONTENT-divergence not block-absence → manifest insufficient → generation-by-byte-compare mandatory for ALL topics → forces finalize 2:1 re-authoring (flip toward A).
2. If team funds a finalize info-architecture re-authoring (command Steps + SKILL Required-Steps both derive from a shared structured gate-list) → finalize graduates to Layer-2 generation → #630 uniform across 18 (A).
3. If #445 skeleton drift judged tolerable/low-recurrence → even plan-run doesn't need Layer 2 → #630 collapses to Layer 1 everywhere (manifest only, no render engine) — maximal precedence-#3 answer.
4. If standalone #636 is blocked → fold into #630 as first sequential node (delays #627 fix#2, enlarges #630).
5. If a paired .toml parity obligation is discovered for any routing surface (n1 found NONE) → generator needs md↔toml emission. Low prob.

### Bottom line
Leading design = **D** (manifest foundation satisfying the literal core AC across all 18 incl finalize — which A can't reach without a rewrite, B/C don't reach — plus generation upgrade confined to drift-proven plan-run). Ship **#636 first standalone**; build **#630 second on the fenced base** where its manifest absorbs #636's relocation as runtime tags.

delegation_outcome: completed

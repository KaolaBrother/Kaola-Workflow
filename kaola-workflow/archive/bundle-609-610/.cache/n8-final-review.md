evidence-binding: n8-final-review f47f48706dca
verdict: pass
findings_blocking: 0
finding: id=R1 scope=out_of_scope action=note status=noise severity=low fix_role=none rationale=generated opencode workflow-planner mirror carries a lowercase Claude-runtime dispatch sentence ("On this Claude runtime, `reasoning` dispatches via `Agent(model="opus")`") — NOT a capitalized B2 noun (S2 guard passes; 0 capitalized Opus/Sonnet in generated output), consciously accepted by D-610-01 decision point 4 (lowercase Agent literal chosen over a new rewriteClaudeModelNouns pattern); the opencode planner also carries its own correct reasoning→top/standard→second mapping at L491-492
finding: id=R2 scope=out_of_scope action=note status=noise severity=low fix_role=none rationale=carried forward from n6-backcompat R1 — model_invalid error text now lists reasoning/standard + "legacy aliases opus/sonnet"; cosmetic, emitted only for out-of-vocab cells no valid archived plan contains; not a behavior change

## Verdict
APPROVE (pass) — 0 CRITICAL, 0 HIGH, 0 blocking. Two LOW out-of-scope notes (non-blocking).

Holistic review of `git diff abb6a941..HEAD` (n1/n2 legs + synth + n4 schema 171351d7 + n5 prose 328c0c84 + n7 docs 7c50737b) against #609 and #610. Diff is 67 files, +1204/-222. Both issues' acceptance criteria are MET; all four chains are green and HEAD-bound; the opencode suite is green.

## Issue #609 — codex/opencode B2 model-noun purge — AC checklist
- AC1 (codex trees clean of B2 nouns outside B1 mentions): MET. `grep -niE '(opus|sonnet|haiku)'` over the 3 plugin trees' agents/config/skills leaves ONLY B1 legacy-alias mapping mentions: plan-run SKILL:76 (`legacy `model: opus` -> `xhigh` / `model: sonnet` -> `high`…`), adapt SKILL:26 (`the legacy `opus`/`sonnet``), and workflow-planner.toml's rank-phrased `` `opus`/`sonnet` `` alias pair. contractor.toml / synthesizer.toml / config/agents.toml B2 phrases ("The Opus orchestrator", "reasoning-class (Opus)") are rewritten to tier vocabulary. A new `validate-kaola-workflow-contracts.js` B2 purge (scrubs the three B1 forms then flags any surviving opus/sonnet/haiku) enforces it; present in all three codex validators. Codex chain green.
- AC2 (opencode generated output 0 B2 sites, narrowed S2 guard, suite green): MET. `sync --write` then `grep '\b(Opus|Sonnet)\b' .opencode/{agent,command}` → 0 sites. The S2 guard (test-opencode-edition.js) is narrowed from section-scoped-tolerate to a body-wide case-sensitive whole-word `\b(Opus|Sonnet)\b` sweep over every generated agent/command file, with the lowercase B1 tokens exempt automatically. Suite green (499 assertions, exit 0). `rewriteClaudeModelNouns()` (targeted phrase regexes, idempotent, applied in renderAgent + transformCommandBody) is the generation-time purge.
- AC3 (dispatch narratives speak effort tiers): MET. workflow-planner.toml "Model assignment" now speaks "the reasoning tier maps to `xhigh` on the configured Codex model, the standard tier to `high`"; plan-run SKILL maps `model: reasoning` -> `xhigh`; the new `modelDisplay()` envelope emits codex "xhigh reasoning effort"/"high reasoning effort" alongside the raw tier so payload echoes read natively.
- AC4 (six workflow-init surfaces carry the neutral-vocab constraint): MET. All 6 surfaces (root command + 2 forge commands + 3 init SKILLs) carry the exact sentence "Name roles by function and reasoning tier, never by a vendor model name…". Pinned by the root claude validator (`never by a vendor model name`) and the codex validator over all six.
- AC5 (four chains green; opencode separate): MET (see chain summary).

## Issue #610 — runtime-neutral plan tier tokens — AC checklist
- AC1 (zero opus/sonnet/haiku for newly authored plans, end-to-end): MET. `NODE_MODEL_TIERS = ['reasoning','standard']`; new plans author neutral tokens so plan tables, ledger cells, envelope raw `model`, and narratives carry `reasoning`/`standard`. `modelDisplay()` renders native per runtime. The only opus/sonnet remaining anywhere are the B1 legacy-alias DOCUMENTATION mentions, not newly-authored plan content.
- AC2 (archived legacy plan resumes green, identical efforts, unchanged hash): MET. Walkthrough legacy-alias fixture: a frozen `| opus |`/`| sonnet |` plan passes `revalidateForResume` with `computePlanHash` unchanged (no rewrite), `computeNextAction` accepts it preserving the `opus` cell verbatim, and `dispatchEffort('opus')===dispatchEffort('reasoning')==='xhigh'`, `dispatchEffort('sonnet')===dispatchEffort('standard')==='high'`. Independently corroborated by n6-backcompat (NOT-REFUTED, high confidence) against the real bundle-607-608 archived plan across all four forge ports.
- AC3 (model_invalid still refuses out-of-vocab; gate/sink prohibition unchanged): MET. Both enforcement sites (plan-validator:1364-1375, next-action:76-80) validate via `normalizeTier(token)===null` → refuse; message lists the neutral vocabulary + "legacy aliases opus/sonnet are also accepted". The main-session-gate model prohibition and finalize-sink prohibition are untouched (walkthrough #390(c) finalize-sink refusal still passes; n6 confirmed a neutral token does NOT become allowed on a gate).
- AC4 (four chains + opencode green; ADR supersedes; opencode-edition.md updated): MET. D-610-01.md (Accepted) supersedes the "opus/sonnet stay the portable cross-edition vocabulary" ruling in docs/opencode-edition.md + the #537 CHANGELOG note; docs/opencode-edition.md Level-1 mapping + the effort table headers now read reasoning/standard with a legacy-alias note.

## Prose ↔ implementation agreement
Verified the mapping sentences match the shipped schema helpers:
- claude reasoning→Opus/standard→Sonnet = `TIER_MODEL_CLAUDE`/`dispatchModelClaude` (reasoning→'opus', standard→'sonnet').
- codex reasoning→xhigh/standard→high = `dispatchEffort` (reasoning→xhigh, standard→high).
- opencode top/second = `TIER_RANK` (reasoning→'top', standard→'second').
- docs/api.md `model_display` shape `{ claude, codex, opencode }` and its per-runtime string formats ("<effort> reasoning effort", "<rank> effort variant") match `modelDisplay()` byte-for-byte.

## n6-backcompat non-undermined by n5/n7
The dispatch-behavior scripts n6 verified (adaptive-schema, plan-validator, next-action, resolve-agent-model, adaptive-handoff, adaptive-node) were touched ONLY in n4's commit 171351d7. n5 (328c0c84) touched prose (workflow-planner.md/.toml×3, adapt/plan-run SKILLs, ADR, opencode-edition.md) + enforcement PINS (test-route-reachability.js, validate-*-contracts.js×3) — no dispatch behavior. n7 (7c50737b) touched docs/api.md + docs/architecture.md only. Neither touched any behavior-bearing script, and the four chains exercise n5's pins green at HEAD — n6's NOT-REFUTED verdict stands.

## Code quality of the diff
- `normalizeTier(token)`: correct — trims/lowercases, '' → null, neutral pass-through, alias resolve, out-of-vocab → null. Single seam every tier consumer routes through.
- `mapTier` uses `TIER_RANK[normalizeTier(tier)]`; on null, `TIER_RANK[null]` → undefined → `!rank` → null. No crash. (n6's ' opus ' untrimmed-mapTier divergence is unreachable — parseNodes trims+lowercases the cell.)
- `frontierNode(n)`: clean DRY consolidation of the repeated `{id,role,model,declared_write_set}` map with a conditional `model_display`; ignores map index args as intended.
- `modelDisplay()`/envelope attachment: additive everywhere (raw tier retained; key attached only when tier non-null ⇒ untiered dispatch byte-identical to pre-#610).
- `isReasoningClass` inline alias duplication in resolve-agent-model.js: deliberate + documented (the subagent-dispatch-log hook copies the resolver standalone with no schema sibling on disk; a require would break isolated invocation).
- Byte-identity: adaptive-schema.js hashes to 1 value ×4 editions; resolve-agent-model.js hashes to 1 value ×4. Forge node ports (gitlab/gitea) carry modelDisplay+frontierNode (11 refs each, matching root); forge handoffs carry modelDisplay; forge B2-purge validators present.

## Chain receipt summary
Receipt `kaola-workflow/bundle-609-610/.cache/chain-receipt.json`, source npm-default, started 2026-07-03T15:29:39Z, completed 15:51:22Z. headSha 7c50737b5e4c24cdc8d7d4d057b82338d54b09ee == `git rev-parse HEAD`. validationTestConsumes includes docs/api.md, docs/architecture.md, docs/opencode-edition.md (doc-chain HEAD-bound).
- claude:  exitCode 0, timed_out false, 837852ms (~13.96m), attempts 1, accepted_red false
- codex:   exitCode 0, timed_out false, 18152ms (~18s),    attempts 1, accepted_red false
- gitlab:  exitCode 0, timed_out false, 221946ms (~3.70m), attempts 1, accepted_red false
- gitea:   exitCode 0, timed_out false, 224719ms (~3.75m), attempts 1, accepted_red false

## opencode suite (D-530-02, separate from the chains)
`node scripts/sync-opencode-edition.js --write` → tree already in sync (0 files updated); `node scripts/test-opencode-edition.js` → "opencode-edition test passed (499 assertions)", exit 0. Generated `.opencode/{agent,command}` has 0 capitalized B2 sites.

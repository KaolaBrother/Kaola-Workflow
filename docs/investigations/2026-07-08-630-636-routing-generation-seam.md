# Routing-surface generation seam (#630) + cross-runtime dispatch-pin single-sourcing (#636) — settled design

**Date:** 2026-07-08
**Status:** DESIGN INPUTS for two fresh build re-plans (PENDING). Not a shipped decision. #630 and #636 remain OPEN.
**Method:** read-only shaping investigation (probe → assume → adversarially critique → converge), then re-plan the implementation as fresh frozen runs authored from this doc.

## Problem

The six #400 routing surfaces per topic (3 commands + 3 Codex SKILLs, × topics plan-run / finalize / next = 18 markdown files) are kept in sync today by **hand-copy propagation**. This is a documented drift class: a change landing on only 4-of-6 surfaces leaves the two forge-codex SKILLs a "propagation dead zone" (`docs/conventions.md:74`; #369, #380 shipped this way). #624 was the same shape — a whole finalize four-gate block lost on the forge-codex finalize SKILLs while all four chains stayed green.

- **#630** — generate the six routing surfaces from one canonical skeleton, killing the propagation-by-copy drift class. Core AC: **"silently dropping a routing block is impossible by construction."**
- **#636** — single-source the cross-runtime dispatch pins so #627's descoped fix#2 (runtime-dead-prose fencing) becomes possible: the Codex-dispatch block is dead prose on the Claude commands, the Claude Teammate-Mode block is dead prose on the Codex SKILLs, yet both are machine-pinned on all six surfaces — so fencing either out of its non-native runtime currently reds the contract chains.

## Investigation findings (probes)

**Surface divergence (n1).** Common-vs-variant ratio is **topic-dependent**, not uniform:
- **plan-run** ~1.08 (SKILL/command) — mostly-shared skeleton, PIN/CARD blocks byte-identical command↔SKILL → **template-shaped, slot-fillable**.
- **next** ~0.85 — same flow, renamed headings, +2 SKILL-only sections with no command counterpart.
- **finalize** ~0.51 — a **2:1 wholesale rewrite** (989-line 9-Step command vs 475-line Required-Steps SKILL) → **genuinely independent authoring, NOT slot-fillable** without re-architecting a working surface.
- The runtime axis is 3-valued (Claude / Codex / opencode-mentioned-inline). The forge axis within a surface-type is cleanly slot-fillable but needs a **per-script rename table** (not a regex — `resolve-agent-model.js` stays un-renamed). Two divergences are **sub-sentence** splices (a Codex-dead clause sharing a sentence with live prose; an "Opus"↔"non-lowerable floor" swap mid-sentence). #445 already tried a plan-run-only skeleton and drifted **3× past** its own ~150-line target.

**Machinery (n2).** `edition-sync.js` is a rename-only script-port generator — the wrong render primitive for prose. Its reusable asset is the **regenerate-and-byte-compare `--check`** pattern (`expected !== actual`, fail-closed on any deviation). The closest prose-render prior art is `sync-opencode-edition.js` (frontmatter parse + heading-scoped section strip + scoped rewrites + regen-compare). Today's prose drift-detection is a **weak needle/substring regime** (`test-route-reachability.js` + `validate-*-contracts.js`), which catches only the specific pinned literals — not paraphrase, omitted surrounding prose, or a block absent from a surface nobody wrote a pin for.

**Pins/contracts (n3 + adversary correction).** The #636 relocation is a bounded, mapped edit — but the adversary (see below) proved n3's map **incomplete**.

## Adversarial critique (n5) — the design as first drafted would red all four chains

The adversary ran the chains and **empirically confirmed the #624 mode is alive today**: deleting a whole 21-line finalize gate block from a forge-codex finalize SKILL kept route-reachability, all four validators, and both gitea walkthroughs green. It then refuted the first-draft design with three blocking findings, while validating the two-layer architecture as the right shape:

- **R1 — the #636 write-set was incomplete (proven four-chain-red).** The map missed the **#611 unconditional-mandate pin family** — tokens inside the Codex-dispatch block (`on EVERY dispatch, tiered or not`) pinned on all six surfaces including the commands. Fencing the block reds `validate-kaola-workflow-contracts.js` where the map predicted green.
- **R2 — the by-construction guarantee was unspecified.** Under a "sentinel/marker" reading, a hollowed block (marker kept, prose gone) passes; a bare-presence migration could be *weaker* than today's pins on the exact surfaces where #624 happened; deleting a manifest entry silently self-disarms the obligation.
- **R3 — the drift-class premise was overstated + one plank was a booby trap.** #624's own fix commit also fixed a content-divergence-while-present bug ("three gates" over a four-gate block), so block-absence is not the whole class. And the gitea `mr|pr)` case the design told the canonical to "correct" is a **deliberately machine-pinned contract**, not drift — acting on it reds the gitea chain.

## Settled design — repaired Candidate D (two-layer, manifest-anchored)

"Impossible by construction" splits into **two guarantees**, and the design delivers each where it is achievable:

### Layer 1 — presence guarantee, ALL 18 surfaces (incl. finalize)
A single-source **required-block manifest** (`templates/routing/required-blocks.*`): each block declared once as `{ block_id, topic, runtime_tag ∈ {claude-live, codex-live, both}, surface_type_tag ∈ {command, skill, both}, content_tokens: [distinctive substrings] }`. A **derived-universe presence checker** asserts every `content_token` on every surface the entry obligates, where the surface set is **computed** from topic+tag (not hand-typed) — so obligating 4-of-6 is structurally impossible. It is **additive-superset over the existing T-pins**, consolidating a pin only where a machine-checked superset proof confirms token coverage; any token not cleanly expressible stays as a residual additive pin. This alone meets the literal #630 core AC on **every** surface, finalize included, closing the whole-block-absent class that let #624 slip.

Required properties (all from R2, all load-bearing): (1) content tokens not bare markers; (2) migration proven no-weaker than today's pins (superset proof, covering the #624-fix gate flags `--resume-check`/`--gate-verify`/`--barrier-check`/`--verdict-check` + `workflow_path: adaptive`); (3) a T3-style structural red-proof self-test; (4) file universe derived from the T1/T2 emitted-targets registries + a bidirectional orphan-sentinel. The two token-only runtime blocks gain semantic markers `<!-- PIN: teammate-mode -->` / `<!-- PIN: codex-dispatch -->` (PROVENANCE_BAN-safe) for orphan-sentinel completeness and clean Layer-2 slot boundaries.

### Layer 2 — byte guarantee, plan-run + next (12 surfaces)
Generate from a canonical skeleton per topic via a **new render engine** (frontmatter as a two-shape surface-type slot; H1 forge-suffix token; runtime-conditional slots; a forge-noun rename **table**; the two sub-sentence splices via scoped token substitution) glued to an edition-sync-style `--check`/`--write` byte-compare shell. This mechanically enforces the #445 skeleton discipline and by-construction fences the runtime-dead blocks. Confined to the drift-proven, template-shaped topics.

### Finalize — Layer 1 only (manifest-guarded, hand-authored)
Finalize's 2:1 rewrite makes byte-generation a re-authoring project (a precedence-#1 accuracy risk) for a presence guarantee the manifest already delivers. **Accepted residual (R3a):** a present-but-wrong-content defect on finalize prose *outside* the pinned token set is uncaught; it IS caught for the tokens that matter most (the gate flags, closure-audit, verdict block — all manifest content tokens). Layer 1 is strictly stronger than today's finalize regime. Closing the residual fully would require Layer-2 finalize generation (deferred; flip-premise 2).

## #636 ↔ #630 coupling — ship #636 first, standalone

Ship **#636 first** as a standalone run, then **#630** as a fresh re-plan on the fenced base. #636 is a **prerequisite**, not just a consequence: a #630-generated fenced command *without* #636's validator relocation reds T5b and the #611-fork command pins. #636 is independently valuable (the deferred #627 fix#2) and fully mapped. Both runs edit the four validators + the byte mirror → the "hidden shared surface" false-disjoint trap (`docs/conventions.md:263`) → the two runs serialize, and within each run the four-validator writes are one serialized frontier, never parallel legs. #630 later absorbs #636's relocation as manifest runtime tags (refactor, not redo).

## Build Run 1 — #636 (corrected write-set)

**Prose (6):** remove the Codex-dispatch paragraph from the 3 commands (preserving the always-live role-instruction tail); remove the Teammate-Mode block from the 3 plan-run SKILLs; add the two semantic markers.
**Tests/validators (the corrected map — n3's relocation PLUS the #611-fork SKILL-only split the adversary proved missing):**
- `test-route-reachability.js` — T5b array → SKILL-only; T14 array → command-only.
- `validate-workflow-contracts.js` **and its byte mirror** `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — delete the command-side T5b assertion; shrink #606 to command-only; **shrink the #611-fork loop (`:1017-1029`) to SKILL-only** (the single largest correction).
- `validate-kaola-workflow-contracts.js` — delete #606-on-github-SKILL; shrink #611-fork to SKILL-only.
- `validate-kaola-workflow-gitlab-contracts.js` + `-gitea-` — **three-way split** the shared `[command, SKILL]` loop: symmetric families stay; #606 teammate → command-only; #611-fork → SKILL-only. **Do NOT touch the `mr|pr)` contract pins.**
- `CHANGELOG.md`.
**Roles:** planner → 1 builder (Sonnet — the fences and validator splits are tightly coupled; one builder, not legs) → code-reviewer (fable) → adversarial-verifier (fable) → doc-updater → finalize. **#307:** all four chains sequential + recorded. No main-session-gate (fully machine-checkable).

## Build Run 2 — #630 (fresh re-plan on the fenced base)

**Write-set union:** new `scripts/<prose-generator>.js`; new `templates/routing/{plan-run,next}.skeleton.*` + slot data + rename table; new `templates/routing/required-blocks.*` manifest; the 12 generated surfaces (become `@generated`; note the file is `commands/workflow-next.md`); the 6 finalize surfaces (manifest sentinels only — keep the #624-fix pins, do not touch the gitea `mr|pr)` pins); `test-route-reachability.js` (manifest-derived checker + superset proof + red-proof + orphan-sentinel); the four validators + byte mirror; `package.json` (wire `<generator> --check` into all four chains); `docs/conventions.md`; `CHANGELOG.md`.
**Suggested nodes:** A (manifest + derived checker + superset proof + red-proof + orphan-sentinel); B (skeletons + render engine + `--check`/`--write`); C (`--write` regen 12 surfaces + wire `--check` into all four chains); D (finalize reconciliation to manifest). A/C/D all write the four validators → one serialized frontier, never parallel legs. code-reviewer + adversarial-verifier both fable. **#307** yes; opencode unaffected unless the inline opencode mentions change.

## By-construction regression battery (the acceptance proof)

A structural self-test (modeled on `test-route-reachability.js:104-119`) over a synthetic manifest + fixture surfaces, asserting nonzero exit for each planted defect: (1) block dropped from one derived surface; (2) block hollowed (content token removed, marker kept); (3) a new surface auto-obligated (synthetic emitted-target) missing a block; (4) orphan manifest entry; (5) orphan surface block; (6) superset proof — every legacy T-pin token is a manifest content token over a ⊇ surface set. Passing this battery is the machine-checkable acceptance that makes a main-session-gate unnecessary.

## Flip-premises

1. If the dominant drift class is content-divergence (not block-absence), byte-generation becomes mandatory for all topics → forces the finalize rewrite. (Refined: content-divergence is real but the finalize gate-flag tokens are already content-pinned; the residual is narrow and accepted.)
2. If a finalize information-architecture re-authoring is funded (a shared structured gate-list driving both command Steps and SKILL Required-Steps), finalize graduates to Layer-2 generation and closes the R3a residual.
3. If #445's skeleton drift is judged tolerable, plan-run skips Layer 2 and #630 collapses to Layer-1-only everywhere. (n1's 3× drift history argues against.)
4. If standalone #636 is blocked, fold it into #630 as the first sequential node (delays #627 fix#2, enlarges #630).
5. If a paired `.toml` parity obligation is discovered for a routing surface (none found), the generator needs md↔toml emission.
6. If the superset proof finds a legacy pin token not expressible as a content token, it stays a residual additive pin (superset-with-residual).
7. If the team decides gitea should drop the vestigial `mr|` label, that is a separate deliberate contract change (default off; not part of #630).

## Bottom line

The two-layer architecture — a manifest presence guarantee across all 18 surfaces (finalize included) plus scoped byte-generation confined to the drift-proven plan-run/next — is the settled shape, validated by adversarial refutation of every structural attack. Ship #636 first with the corrected write-set (the #611-fork SKILL-only split is mandatory or all four chains red), then #630 on the fenced base.

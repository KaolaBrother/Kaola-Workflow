evidence-binding: n5-next-seam f41520813c2e
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: glue/config — routing-surface pointer prose + enforcement-registry (required-blocks) change generated from a skeleton across six #400 surfaces; no natural failing unit test (content-presence + render-completeness are the correct oracles). Verified by generate-routing-surfaces --check + test-route-reachability + test-install-model-rendering (the #443 render gate) + walkthrough + all four contract validators.
<!-- regression-green|build-green|smoke-integration -->
regression-green: generate-routing-surfaces.js --check (all 12 surfaces byte-match), test-route-reachability.js (329 assertions incl. both new blocks resolve 6/6 + 3/3), test-install-model-rendering.js (installed commands keep NO {ISSUE_SCOUT_MODEL} placeholder — renders to resolved model), simulate-workflow-walkthrough.js ("Workflow walkthrough simulation passed"), + validate-workflow-contracts / validate-kaola-workflow-contracts / gitlab / gitea all green.
<!-- OPEN n1-architect's evidence file and append its line-1 binding nonce as the value below -->
upstream_read: n1-architect 10e1be01f296

## task
Author the #645 First Principles axiom reference line + the #646 governed issue-scout
model placeholder into the GENERATED `next` routing surfaces (workflow-next x3 commands +
kaola-workflow-next x3 skills) by editing the ONE skeleton + regenerating, and extend the
single-source enforcement registry so both insertions are machine-enforced across the
correct surface universe.

## verification_tier
regression-green

## write_set (8 tracked files — matches the frozen 9-path declared set; slots.js correctly
## untouched: no keyed command-region splice was required)
- templates/routing/next.skeleton.md  (the two authored edits — see below)
- templates/routing/required-blocks.js  (enforcement registry: +1 block, +1 token)
- commands/workflow-next.md  (GENERATED via generate-routing-surfaces.js --write)
- plugins/kaola-workflow-gitlab/commands/workflow-next.md  (GENERATED)
- plugins/kaola-workflow-gitea/commands/workflow-next.md  (GENERATED)
- plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md  (GENERATED)
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md  (GENERATED)
- plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md  (GENERATED)

## what was authored in the skeleton
(A) Axiom reference line — SHARED body (all 6 surfaces). One provenance-free pointer
    paragraph inserted OUTSIDE every REGION marker, between `<!-- SLOT:nx-h1 -->` and the
    first `<!-- REGION:command -->`, so it renders identically into all three commands AND
    all three skills. It POINTS to the First Principles axioms (the `## First Principles`
    block in the project's workflow-init CLAUDE.md; canonical source `templates/axioms.md`),
    carries the tie-breaker instruction (resolve by axiom order + record an OPTIONAL one-line
    derivation in the node's `.cache` evidence, never blocks a gate), and the tighten-only
    clause (an axiom may only make you stricter — never cite one to skip a typed gate,
    refusal, or barrier). It is a reference line, not the full block; no #NNN / D-NNN / INV
    tokens.
(B) Scout model placeholder — COMMAND-ONLY region (3 command surfaces). Added an inline
    `model="{ISSUE_SCOUT_MODEL}"` dispatch sentence inside `<!-- REGION:command -->` (after
    the issue-scout read-only paragraph in the Auto-bundle entry section, before the
    github-only sub-region). It is command-region-level, so it renders to all THREE commands
    and NONE of the skills — install.sh renders {X_MODEL} placeholders in COMMANDS only, so a
    placeholder in the shared body would have leaked into the Codex skills and red the render/
    route checks. Confirmed: `{ISSUE_SCOUT_MODEL}` appears in exactly the 3 workflow-next
    commands and zero next SKILL.md files.

## required-blocks.js (single-source #400 REQUIRED_BLOCKS enforcement registry)
- Added block `nx-first-principles` (topic:'next', runtime_tag:'both', surface_type_tag:'both')
  with non-marker content_tokens ['First Principles axioms', 'never cite one to skip a typed
  gate, refusal, or barrier'] → obligates all SIX next surfaces to carry the axiom pointer.
  Non-marker first token, so no reverse orphan-sentinel obligation (mirrors nx-adaptive-route).
- Folded token `model="{ISSUE_SCOUT_MODEL}"` into the existing `nx-router-command` block
  (runtime_tag:'claude-live', surface_type_tag:'command', already carrying 'issue-scout') →
  obligates the THREE command surfaces to carry the placeholder, and by tag does NOT require
  it of the skills.

## verification_commands (+ exit codes)
1. node scripts/generate-routing-surfaces.js --write  → "rendered 12 surfaces", exit 0
2. node scripts/generate-routing-surfaces.js --check  → "all 12 surfaces byte-match the skeleton", exit 0
3. node scripts/test-route-reachability.js  → "Route-reachability test passed (329 assertions)", exit 0
4. node scripts/test-install-model-rendering.js  → "Install model rendering tests passed", exit 0
   (THE #443 RENDER GATE: temp-dir --forge=github install asserts no model="{[A-Z_]+_MODEL}"
    survives install — n3's ISSUE_SCOUT_MODEL wiring in install.sh model_for_placeholder@420 +
    render placeholders@471 is confirmed present, so the placeholder renders to the resolved model.)
5. node scripts/validate-workflow-contracts.js  → "Workflow contract validation passed", exit 0
6. node scripts/validate-kaola-workflow-contracts.js  → "Kaola-Workflow Codex contract validation passed", exit 0
7. node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js  → passed, exit 0
8. node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js  → passed, exit 0
9. node scripts/simulate-workflow-walkthrough.js  → "Workflow walkthrough simulation passed", exit 0

## before_result
Baseline = the n3+n4-merged feature branch. Pre-edit the tree was clean and
generate-routing-surfaces.js --check reported all 12 surfaces byte-matching; n4-axiom's
recorded evidence attests the walkthrough + all four init/routing contract validators green at
that HEAD. install.sh already carried n3's ISSUE_SCOUT_MODEL wiring (grep confirmed lines 420 +
471). git status --short pre-edit showed no tracked modifications in the next-topic write set.

## after_result
All nine verification commands above pass post-change. git status --short shows exactly the 8
tracked write-set files modified (slots.js untouched), plus only orchestrator-managed .cache/
scheduler-state files. No file outside the declared write set was touched.

## notes
- Chose an inline `model="..."` sentence over a fenced Agent() block: workflow-next dispatches
  the scout via prose (not a fenced block), and workflow-next is NOT in validate-workflow-
  contracts phaseCommands, so assertEveryDispatchHasModel does not scan it — an explicit
  dispatch-pin for this surface is n6's job, not mine. I kept the four existing validators green.
- This IS a #307 cross-edition diff (plugins/*/commands+skills + routing generator + registry).
  I ran the claude chain's routing/render/walkthrough/validator set green; the full four-chain
  sequential gate (KAOLA_RUN_CHAINS_CONCURRENCY=serial) belongs to the later all-four-chains node
  per the architect's build sequence (n3→n4→n5→n6→all-four-chains).

# Workflow Plan — bundle-630-636

<!-- plan_hash: 29fcee2b2af56bafe52d596fd2527b9b6bd1156e10bf304845f23a542a2cfea5 -->

## Meta
speculative_open_policy: auto
labels:
validation_command: npm test
goal: use kaola-workflow skills to finish all issues; delegate subagents as the workflow demands; all reviewer subagents use fable

## Plan Notes

DECISION/DESIGN-shaped BUNDLE (#486 Case B — shape-first read-only shaping run, then RE-PLAN as a
FRESH frozen run). #630 (generate the six #400 routing surfaces from ONE canonical skeleton per
command via `scripts/edition-sync.js`, killing the propagation-by-copy drift class) is a genuinely
large, DESIGN-UNSETTLED architecture task; #636 (single-source the cross-runtime dispatch pins so
#627's descoped fix#2 — runtime-dead-prose fencing — becomes possible) is bundled same-scope and its
resolution MAY fall out of #630's generation seam (#636 body: "evaluate during planning whether the
generation seam is cheaper than per-surface pin relocation").

### WHY CASE B, NOT CASE A

The build DAG's SHAPE (write-set, roles, node decomposition, whether #636 folds into #630 or ships as
a standalone pin-relocation run) depends on findings this front-end planner does NOT yet have, AND on
an explicit OPEN design call the issues defer to planning:

- The generation MECHANISM is the deliverable of design, not given. `edition-sync.js` today
  (`GENERATED_AGGREGATORS` + a DECLARED rename map + `renderForgePort`) only reproduces forge SCRIPT
  ports that are byte-identical modulo forge names. The 18 routing surfaces (3 topics × 6 surfaces)
  are NOT byte-identical modulo rename — they diverge by RUNTIME (the Codex v1/v2 dispatch block vs the
  Claude Teammate-Mode block — the very #636 dead-prose), by SURFACE-TYPE (command vs SKILL
  frontmatter), and by FORGE (script-resolver paths, forge nouns). So the seam needs a NEW
  skeleton+slot template engine whose exact shape (slot boundaries, where the canonical skeletons
  live, how frontmatter is slot-driven, how md↔toml planner parity is preserved, what `--check`
  reds a hand-edit) is unknown until the divergence is MEASURED and the machinery studied.
- The #636-vs-#630 COUPLING is an explicit open design decision ("weigh a generation single-sourcing
  seam vs per-surface pin relocation"). If #636 falls out of #630's runtime-dispatch slot, the plan
  is ONE generation build. If it does not, the plan is a separate pin-relocation + fencing run
  (relocate route-reachability T5b→SKILL-only / T14→command-only + mirror the four
  `validate-*-contracts.js`, then remove the dead blocks). These are structurally DIFFERENT DAGs.
- Authoring a build DAG that bakes in a guessed generation mechanism would launder an unvalidated
  design into a frozen plan and sail through a green artifact-vs-plan verdict (the #486 anti-pattern).
  Worse here: #630's CORE AC — "silently dropping a block again is impossible by construction" — is
  the EXACT #624 failure mode (the forge-codex finalize SKILLs lost the entire adaptive four-gate
  block while all four chains stayed green). Getting the design wrong reintroduces the very hole #630
  exists to close. Correctness (precedence #1) demands the design be SYNTHESIZED from evidence and
  ADVERSARIALLY FALSIFIED before any code is authored.

Therefore this run is READ-ONLY: it PROBES (surface divergence, the edition-sync machinery, the
pin/contract surface), ASSUMES (candidate generation designs, each with a falsification test),
CRITIQUES (adversarially refutes the leading design against the #624 by-construction property), and
CONVERGES (records the settled design + recommended build shape + #636-coupling decision). The
orchestrator RE-PLANS the implementation as a FRESH frozen run (new plan_hash) authored FROM the
findings doc. Pure composition of existing roles + the three shapes — no in-place plan mutation,
honoring the freeze-once contract.

### SURFACE TOPOLOGY (verified at authoring)

The #400 "six surfaces" is PER routing topic: 3 commands (`commands/<cmd>.md` claude-root +
`plugins/kaola-workflow-gitlab/commands/<cmd>.md` + `plugins/kaola-workflow-gitea/commands/<cmd>.md`)
+ 3 Codex SKILLs (`plugins/kaola-workflow/skills/<cmd>/SKILL.md` github-codex + gitlab + gitea).
Three topics (plan-run / finalize / next) → 18 markdown files the seam would generate, plus the
`edition-sync.js` machinery + any new canonical skeleton files. `scripts/test-route-reachability.js`
already pins the plan-run six (T5/T5b/T14), the finalize six (T6), and the next six on their file
lists — the standing acceptance harness the generation must keep green.

### PARALLELISM + GATES

n1/n2/n3 are an independent read-only ANTICHAIN (no dep edges among them, all `—` write sets) → the
validator DERIVES `parallel_safe` and the running-set scheduler overlaps them at the read cap (the
shipped #472 read-frontier seam). They are independent read NODES, not a write-partitioning
`fanout(<group>)` (they partition no write set → the correct shape is `sequence`, antichain/read-cap
path). n4 (assume) joins all three; n5 (critique) depends on n4; n6 (converge) depends on n5;
n7 (finalize) depends on n6. Longest chain: n1 → n4 → n5 → n6 → n7; n2/n3 overlap n1 for free.

No code-producing node exists (every non-sink node is read-only; the `finalize` sink writes ONLY
docs/state — `docs/investigations/...md` + `CHANGELOG.md`, both `isDocsPath`), so BY CONSTRUCTION no
G1 (code-reviewer), G2 (security-reviewer), or G3 (main-session-gate) is required. If any node needed
`tdd-guide`/`implementer` that would signal drift into BUILDING — there is none here; building is the
re-plan's job. n5 (adversarial-verifier) is an INVESTIGATION skeptic, not a change gate: no
code/sensitive node forward-reaches it, so it is exempt from the whole-plan `--verdict-check` while
still emitting its per-node `verdict` evidence. No `knowledge-lookup`: every fact
(surfaces, machinery, pins, chains) is confirmable in-repo. n5 is dispatched at model=fable per the
standing reviewer directive (authored `reasoning`; the executor sets the model).

### GOAL CHECKPOINT (read by the finalize / goal_check)

The frozen `goal:` is the standing process goal. THIS run is the SHAPING half of the bundle: its
goal_check is satisfied by using the kaola-workflow skills, delegating the subagents the workflow
demands, dispatching the reviewer (adversary) at fable, and PRODUCING + SURFACING the design inputs —
NOT by the end-state "issues finished." #630 AND #636 MUST stay OPEN after this run; the re-planned
FRESH build run implements the seam (+ #636 fencing) and closes the issues. Do not let the sink
goal_check assert the end-state.

### DECISION-RECORD NUMBERING

No `docs/decisions/D-630-*` or `D-636-*` record exists (verified; no mention in docs/CHANGELOG/README).
This SHAPING run writes NO decision record — the durable artifact is the investigation findings doc.
The settled design decision belongs to the BUILD re-plan, which owns `D-630-01` (next-free) once the
design is chosen/approved. Keeping the number free avoids pre-committing a "pending" decision the
re-plan should own.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-probe-surfaces | code-explorer | — | — | 1 | sequence | standard |
| n2-probe-machinery | code-explorer | — | — | 1 | sequence | standard |
| n3-probe-pins | code-explorer | — | — | 1 | sequence | standard |
| n4-assume-design | planner | n1-probe-surfaces, n2-probe-machinery, n3-probe-pins | — | 1 | sequence | reasoning |
| n5-critique-design | adversarial-verifier | n4-assume-design | — | 1 | sequence | reasoning |
| n6-converge-shape | planner | n5-critique-design | — | 1 | sequence | reasoning |
| n7-finalize | finalize | n6-converge-shape | docs/investigations/2026-07-08-630-636-routing-generation-seam.md, CHANGELOG.md | 2 | sequence | — |

probe_scope[n1-probe-surfaces]: READ-ONLY. Measure the actual divergence across the 18 routing
surfaces — the 3 topics {plan-run, finalize, next} × 6 surfaces {claude-root command, github-codex
SKILL, gitlab command, gitlab SKILL, gitea command, gitea SKILL}. For each topic classify every
section as: (a) byte-identical-modulo-forge-nouns (a pure rename-map slot), (b) RUNTIME-divergent
(the Codex v1/v2 dispatch + `turn_context.effort` block resident on the 3 Claude commands; the Claude
Teammate-Mode Dispatch block resident on the 3 Codex SKILLs — the #636 dead-prose, each dead on the
other runtime), (c) SURFACE-TYPE-divergent (command frontmatter vs SKILL frontmatter), or (d)
FORGE-divergent (script-resolver plugin-tree paths, forge nouns, issue-URL shapes). Deliverable: is
"ONE canonical skeleton per topic + per-surface substitution slots" VIABLE, and what are the EXACT
slot boundaries (runtime-dispatch slot / script-resolver slot / forge-noun slot / frontmatter slot)?
Record current line counts vs the ~150-line skeleton target. Write evidence to
`kaola-workflow/bundle-630-636/.cache/n1-probe-surfaces.md`.

probe_scope[n2-probe-machinery]: READ-ONLY. Study `scripts/edition-sync.js` in depth: the
generate-from-canonical model (`GENERATED_AGGREGATORS`, the DECLARED rename map `renameSet` /
`renderForgePort`, `--check` byte-equality-red-on-drift, `--write` regenerate, `COMMON_SCRIPTS`
canonical→codex byte copy, `BYTE_IDENTICAL_GROUPS`). How is it wired into the npm chains (which chain
runs `--check`, what turns RED)? Determine the FEASIBILITY + SHAPE of extending it to generate the
markdown/SKILL surfaces: confirm a pure rename map is INSUFFICIENT (surfaces diverge by
runtime/frontmatter, not just names) and specify what template/slot engine is needed, WHERE the
canonical skeleton files live, how frontmatter is slot-DRIVEN not post-processed (an explicit AC), how
md↔toml planner parity is preserved, and how `--check` reds a hand-edit to a generated surface. Assess
the #624 "missing-block-impossible-by-construction" property: note `runCheck` ALREADY flags a MISSING
port (`reason: 'missing port'`), so the generate-and-verify model demonstrably closes the drop-a-block
hole ONCE the surfaces are generated — confirm this transfers to markdown surfaces. Also: what stays
hand-authored, and how the contract validators keep pinning the generated files. Write evidence to
`kaola-workflow/bundle-630-636/.cache/n2-probe-machinery.md`.

probe_scope[n3-probe-pins]: READ-ONLY. Map the pin/contract surface exhaustively. In
`scripts/test-route-reachability.js`, enumerate the routing-topic pins (T5, T5b, T6, T14, and the
plan-run/finalize/next surface file lists) — the EXACT tokens pinned on which surfaces. Then map the
MIRRORED assertions across all four contract validators (`scripts/validate-workflow-contracts.js` +
the codex twin `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` + the gitlab port
`plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` + the gitea port
`plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`). Pin down the exact
#636 relocation surface: T5b (Codex effort tokens `fork_turns: "none"`, `reasoning_effort:
dispatch.codex_reasoning_effort`, `fresh child-session effort proof`,
`codex_effort_override_unavailable`, + the neutral/legacy model-tier mapping lines) → SKILL-only; T14
(the NAMED-teammate sentinel + one-nudge sentence) → command-only; and the exact mirror edits the four
validators need. Deliverable: for BOTH the #630 generation approach AND the #636 pin-relocation
approach, the FULL cross-edition write-set (every file each touches) so the re-plan can size nodes
accurately and honor the #307 four-chain obligation. Write evidence to
`kaola-workflow/bundle-630-636/.cache/n3-probe-pins.md`.

assume_scope[n4-assume-design]: READ-ONLY. Synthesize n1-n3 into 2-3 CANDIDATE designs for the #630
generation seam, EACH with an explicit falsification test:
- Candidate A — full skeleton+slots generation in `edition-sync.js` (one canonical skeleton per topic;
  all 18 surfaces generated). Falsify: a planted missing block in one generated surface is restored by
  `--write` AND reds `--check`; frontmatter is slot-driven, not post-processed.
- Candidate B — single-source ONLY the cross-runtime blocks (the #636 dead-prose) via a
  generation/include step, surfaces otherwise hand-authored (the "deeper single-sourcing" #627/#636
  named). Falsify: does this close the #624 WHOLE-block-drop hole, or only the two dead-prose blocks?
- Candidate C — no #630 generation now; #636 solved by standalone pin-relocation (T5b→SKILL,
  T14→command + the four validators) + dead-prose fencing, #630 deferred. Falsify: does pin-relocation
  leave the propagation-by-copy drift class (the #630 root cause) unaddressed?
Recommend the leading design. Form the #636-vs-#630 COUPLING recommendation: does #636's dead-prose
fencing FALL OUT of #630's runtime-dispatch slot (the slot fills only the native block per surface, so
T5b→SKILL / T14→command relocation is implied), or does it need a separate pin-relocation run/node?
Recommend the SHAPE of the follow-up build run(s) — roles, node decomposition, the cross-edition
write-set union, the #307 four-chain obligation, whether #636 folds into the #630 build. State the
premise(s) that would FLIP the recommendation. Write evidence to
`kaola-workflow/bundle-630-636/.cache/n4-assume-design.md`.

critique_scope[n5-critique-design]: READ-ONLY (has Bash; writes nothing; dispatched at model=fable
per the standing reviewer directive). Adversarially REFUTE — not rubber-stamp — the leading design
from n4 against the probe evidence. Core attack: does the recommended seam ACTUALLY make "silently
dropping a routing block impossible by construction" (the EXACT #624 mode — a whole block lost while
all four chains stay green)? Concretely: (a) RUN `node scripts/edition-sync.js --check`,
`node scripts/test-route-reachability.js`, and the four `validate-*-contracts.js` to confirm the
CURRENT tree is green (the design must start from a green base) and to empirically probe whether a
generated-file drop reds a chain. (b) Try to construct a scenario where a block goes missing yet the
chains stay green under the proposed design (e.g. `--check` only compares files that EXIST → a deleted
generated surface; or an empty slot; or a hand-edit the token pins do not cover). (c) Challenge the
frontmatter-is-slot-driven + md↔toml planner-parity claims. (d) Challenge the #636-falls-out-of-#630
coupling: does relocating T5b/T14 + fencing work under the slot model without reding another pin?
(e) Challenge whether the recommended build-shape write-set is COMPLETE (all four editions, all four
contract validators, the full six-surface propagation per topic). Emit `verdict: pass|fail` +
`findings_blocking: N`. Write findings to `kaola-workflow/bundle-630-636/.cache/n5-critique-design.md`.

converge_scope[n6-converge-shape]: READ-ONLY. Synthesize n1-n5 into the SETTLED design recommendation
+ the recommended BUILD-run shape, incorporating the adversary's critique. Produce: (1) the chosen
generation-seam design (or the honest fallback if the adversary refuted skeleton+slots); (2) the
#636-vs-#630 coupling DECISION (fold #636 into the #630 build, or a separate pin-relocation
run/node); (3) the FULL cross-edition write-set union the re-plan must declare (`edition-sync.js` +
any new canonical skeleton files + the 18 generated surfaces + `test-route-reachability.js` + the four
`validate-*-contracts.js` + npm-chain wiring + `docs/conventions.md` describing the generation model);
(4) the recommended node decomposition + roles + gates (a reasoning-tier `code-reviewer` for G1 since
it is cross-edition code, the #307 four-chain, whether a `main-session-gate` is needed — likely NOT,
acceptance is machine-checkable via a planted-missing-block regression); (5) the REGRESSION that
PROVES "block-drop impossible by construction" (a test that plants a missing block / deletes a
generated surface and asserts `--check` or a chain reds); and (6) the flip-premises. Mark this as
design INPUTS for a FRESH build re-plan (PENDING), NOT a settled/shipped decision. Write to
`kaola-workflow/bundle-630-636/.cache/n6-converge-shape.md`.

finalize_scope[n7-finalize]: docs/state ONLY. Write the investigation findings doc
(`docs/investigations/2026-07-08-630-636-routing-generation-seam.md`) capturing the full n1-n6
findings + the settled design recommendation + the #636-coupling decision + the recommended build
shape + the cross-edition write-set union + the block-drop-impossible regression design + the
flip-premises. Write a `CHANGELOG.md` `[Unreleased]` entry noting the routing-surface
generation-seam design investigation was recorded (#630/#636 shaping). CHECKPOINT: this is the SHAPING
half of the bundle — KEEP #630 AND #636 OPEN; do NOT close either. The build re-plan (a FRESH frozen
run authored FROM this doc) implements the seam + #636 fencing, closes the issues, and owns the
settled decision record `D-630-01` (next-free). This run's goal_check is the SHAPING goal
(kaola-workflow skills used, subagents delegated, reviewer-at-fable, design inputs produced +
surfaced), NOT the end-state "issues finished" — do not let the sink assert the end-state.

## Node Ledger

| id | status |
| --- | --- |
| n1-probe-surfaces | complete |
| n2-probe-machinery | complete |
| n3-probe-pins | complete |
| n4-assume-design | complete |
| n5-critique-design | complete |
| n6-converge-shape | complete |
| n7-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (n2-probe-machinery) | subagent-invoked | evidence-binding: n2-probe-machinery 2f0e30aef5ba | |
| code-explorer (n3-probe-pins) | subagent-invoked | evidence-binding: n3-probe-pins 144510ab68d9 | |
| code-explorer (n1-probe-surfaces) | subagent-invoked | evidence-binding: n1-probe-surfaces 55923f3c8a13 | |
| planner (n4-assume-design) | subagent-invoked | evidence-binding: n4-assume-design c979646a2c74 | |
| adversarial-verifier (n5-critique-design) | subagent-invoked | evidence-binding: n5-critique-design 261d852605be | |
| planner (n6-converge-shape) | subagent-invoked | evidence-binding: n6-converge-shape 7118859cae1a | |
| finalize (n7-finalize) | main-session-direct | evidence-binding: n7-finalize 60630fde1ffb | |

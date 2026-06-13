# Workflow Plan — issue-444

<!-- plan_hash: fa8d36f9a11dc8c8d5d543c685d622e558857054859953d3ef72a3fb7867b34b -->

Implement #421 Parts 1+2: every adaptive opener emits a complete script-built
`dispatch` descriptor (one shared builder so the #411 fused-advance split-assembly
bug class cannot recur), and `record-evidence` gains `--verify` (shape + binding +
nonce checked against the file on disk, no stdin transit). Cross-edition change: the
adaptive-node aggregator is a generated forge port (×4), so the canonical + codex +
gitlab + gitea copies move atomically; the ×6 plan-run prose surfaces render the
descriptor verbatim; four chains must be green.

## Meta

labels: enhancement, area:scripts, workflow:in-progress
sensitivity: false
blast_radius: false
issue: 444

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-design-descriptor-contract | code-architect | — | — | 1 | sequence | opus |
| n2-impl-descriptor-and-verify | tdd-guide | n1-design-descriptor-contract | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js, docs/decisions/D-444-01.md | 1 | sequence | sonnet |
| n3-code-review | code-reviewer | n2-impl-descriptor-and-verify | — | 1 | sequence | opus |
| n4-prose-pass | doc-updater | n3-code-review | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md | 1 | sequence | sonnet |
| finalize | finalize | n3-code-review, n4-prose-pass | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

### Shape & dependency rationale

A strictly-sequenced chain, not a fan-out: this is ONE semantically-coupled change
(a descriptor seam + its verbatim prose render) whose stages are true dependencies.
n1 (`code-architect`, opus) settles the descriptor field set and the single-builder
invariant **before** any code is written — the decision constrains every downstream
node, which is exactly what earns opus. It is read-only (architect designs and emits
the contract into its evidence; the durable decision record is WRITTEN by the
implementer node n2, the first write-capable node, so the record and the code land
together). n2 (`tdd-guide`, sonnet) implements the seam test-first and authors
`docs/decisions/D-444-01.md`. n3 (`code-reviewer`, opus) post-dominates the only
code-producing node (G1 — n2 writes `.js`; every other node writes only `.md`, which
`isDocsPath` treats as docs, so n2 is the sole G1 target). n4 (`doc-updater`, sonnet)
renders the SHIPPED descriptor into the ×6 plan-run surfaces and therefore depends on
n3 (review may adjust the descriptor shape; rendering before review risks re-doing the
prose). `finalize` depends on BOTH n3 and n4 so the sink cannot run until code is
reviewed and prose is landed.

Why no fan-out: the adaptive-node ×4 ports are a single generated-aggregator group
(#431 — the validator refuses `generated_port_split` if the canonical names a sibling
its node omits), so they MUST share one node; and the ×6 prose surfaces are a single
coherent render of one descriptor (#309 — semantically-coupled cross-edition prose
stays in one node with a shared canonical spec). n2 sits exactly at `FILE_CEILING`
(4 ports + 1 test + 1 decision record = 6) and n4 at 6 prose files, so no split is
needed.

Why no `knowledge-lookup`: the entire change is local — adaptive-node openers, the
on-disk token registry (#433, already landed), and local prose. No external
library/API/framework behavior is in question.

Why no `main-session-gate`: acceptance is fully machine-verifiable (descriptor parity
across the three openers, `--verify` accept/refuse, four chains green). No GPU/visual/
device/human-signoff hinge exists.

### n1 — descriptor contract + verify shape (code-architect, opus, read-only)

Settle the contract (the implementer turns it into the durable `docs/decisions/
D-444-01.md` — next free record id, the repo records no `D-444*` today). Pin:

1. **The `dispatch` descriptor field set** returned in the `opened` payload of EVERY
   opener — `runOpenNext`, `runOpenReady`, and the fused advance inside
   `runCloseAndOpenNext`: `{ node_id, role, model, working_dir, declared_write_set[],
   evidence_file, nonce, required_tokens[], forge_rider, guards[], goal_line? }`.
   `evidence_file`, `nonce`, `required_tokens`, `model`, `declared_write_set` already
   exist in the `opened` payloads (#433/#392/#411) — fold them under one `dispatch`
   object rather than scattering them.
2. **The single shared builder invariant** — ONE function assembles `dispatch` for all
   three openers so the #411 class (descriptor fields present in serial open but absent
   in the fused advance) cannot recur by construction. The parity test is the proof.
3. **`guards[]` derivation** (role-conditional, script-owned, not prose-owned):
   read-only line for gate roles (`GATE_ROLES` already defined at ~L1834); no
   `sync:editions` guard unless the node's declared write set contains a generated-port
   sibling (#431); RED-fixture-in-`$TMPDIR` line for `tdd-guide` (#424 — never write a
   RED fixture into the worktree). `working_dir` is the active worktree the openers
   already operate in; `forge_rider` is the forge-neutral rider already in scope.
4. **`record-evidence --verify` shape**: verify the on-disk `.cache/<node>.md`
   (shape + `evidence-binding:` line + nonce match) WITHOUT stdin transit, sourcing
   `required_tokens` from the SAME `ROLE_TOKEN_REGISTRY` (exported from the plan-
   validator, imported by adaptive-node) that the #433 seed + evidence-shape checker
   use — one single-source registry, never a second copy. `--stdin` stays for one
   release (compat), then is removed.
5. **The boundary decision** the implementer must honor: the descriptor is assembled
   in the OPENER from data `next-action`/`commit-node` already return — those two
   generated aggregators are NOT edited by this issue. State this explicitly so the
   implementer does not widen scope into a second ×4 generated-port group. (If the
   architect finds a touchpoint genuinely required there, surface it for a plan-repair
   rather than silently editing — it would be a separate generated-port node.)

### n2 — descriptor builder + record-evidence --verify + decision record (tdd-guide, sonnet)

Test-first; the failing assertions this node turns green live in
`scripts/test-adaptive-node.js` (a PRODUCTION test, not `isTestPath`-exempt). Also
author the durable `docs/decisions/D-444-01.md` capturing n1's settled contract.

- **Descriptor parity**: the `dispatch` object emitted by `runOpenNext`,
  `runOpenReady`, and the fused advance in `runCloseAndOpenNext` is field-complete and
  identical in shape for the same node (the #411 regression class — fused == serial ==
  batch).
- **`--verify` accept**: a well-formed on-disk evidence file (correct binding line +
  nonce + all `required_tokens` for the role) passes.
- **`--verify` refuse-per-missing-token**: each missing required token (per the role's
  `ROLE_TOKEN_REGISTRY` entry) is refused with the #421-P3 `operator_hint`.
- **Receipt-only return passes close**: a role agent returning a ≤10-line receipt (not
  the full evidence body) still closes, because evidence is read from disk.

Implement against the n1 contract. Canonical edit is
`scripts/kaola-workflow-adaptive-node.js`; run `npm run sync:editions` to regenerate
the codex + gitlab + gitea ports (all four are in the write set because the node writes
all four — #431). The forge ports are `@generated` byte-/rename-mirrors; the canonical
spec for them is "the full accumulated canonical diff, mirrored modulo forge nouns" —
never a per-concern re-port. Update the inline `--self-test` (T1–T5 at ~L2745) if it
asserts the `opened` shape. Do NOT touch `next-action.js`/`commit-node.js` (n1's
boundary decision). `non_tdd_reason` is N/A — this is genuinely test-first (the parity
+ `--verify` assertions are written failing first). `required_tokens` MUST come from
the single `ROLE_TOKEN_REGISTRY` import — do not inline a second token list (the #433
single-source seam). The decision-record write is in the docs band (barrier-invisible)
but declared so the node has a concrete artifact.

### n3 — code review (code-reviewer, opus)

G1 over the sole code-producing node (n2). Opus because the review must reason about:
(a) the single-builder invariant actually holding — that no opener hand-assembles a
divergent descriptor (the #411 defect the issue is built to kill); (b) the four
adaptive-node copies being true post-`sync:editions` mirrors with zero hand-edit drift
(the #347 class); (c) `--verify` reading from disk with no stdin transit and binding the
nonce correctly (a weak check would re-admit the evidence-hand-edit loop the issue
removes); (d) the `--stdin` compat path surviving one release. Verify with the four
chains where reachable.

### n4 — plan-run prose pass: render the descriptor verbatim (doc-updater, sonnet)

The ×6 plan-run surfaces (the route-reachability contract's six, #400): the 3 commands
(`commands/kaola-workflow-plan-run.md` + the gitlab/gitea command ports) and the 3
Codex SKILL packs (`plugins/kaola-workflow/skills/.../SKILL.md` + the two forge SKILLs).
Exactly `FILE_CEILING` (6). They are semantic mirrors, not byte-identical (forge nouns
differ); shared canonical spec: "replace the per-node hand-written ~150-line dispatch-
assembly block with a single 'render the script-emitted `dispatch` descriptor verbatim'
instruction, mirroring the claude edition modulo forge nouns; preserve the route-
reachability pinned literals." Keep the prose forge-neutral (#341 — name 'the forge CLI'
/ 'the forge', never a forge-specific binary or brand) since the gitlab/gitea SKILL/
command surfaces sit in the edition plugin trees and the contract validators forbid
those tokens. Depends on n3 so the rendered descriptor matches what actually ships.

All six paths end in `.md`, so this node is NOT code-producing (`isDocsPath`), and the
single code-reviewer (n3) post-dominance over n2 satisfies every gate.

### finalize — docs-only sink

Writes `CHANGELOG.md` only — an `[Unreleased]` entry: script-emitted dispatch
descriptor in every adaptive opener + `record-evidence --verify` evidence direct-write
(#444, composing #433; #421 P1+P2). Docs-only write set keeps the sink off the G1 gate.
Depends on both n3 (code reviewed) and n4 (prose landed).

### Cross-edition gate (CLAUDE.md / #307)

This diff touches `plugins/kaola-workflow*/` (the ×4 adaptive-node ports + the gitlab/
gitea command + SKILL prose), so all four chains must be green before Finalization, run
SEQUENTIALLY (a green claude chain alone is insufficient — `npm test` short-circuits on
the first failure):
`npm run test:kaola-workflow:claude && :codex && :gitlab && :gitea`. The adaptive-node
byte/rename group is additionally guarded by `edition-sync.js --check` (gitlab/gitea
chains) and the route-reachability prose contract (`test-route-reachability.js` + the
four `validate-*-contracts.js`).

## Node Ledger

| id | status |
| --- | --- |
| n1-design-descriptor-contract | complete |
| n2-impl-descriptor-and-verify | complete |
| n3-code-review | complete |
| n4-prose-pass | complete |
| finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1-design-descriptor-contract) | subagent-invoked | evidence-binding: n1-design-descriptor-contract b714018d2074 | |
| tdd-guide (n2-impl-descriptor-and-verify) | subagent-invoked | evidence-binding: n2-impl-descriptor-and-verify 0292d41b834c | |
| code-reviewer | subagent-invoked | evidence-binding: n3-code-review c20c3197073e | |
| doc-updater (n4-prose-pass) | subagent-invoked | evidence-binding: n4-prose-pass 68f4e1f5947e | |
| finalize (finalize) | main-session-direct | evidence-binding: finalize 1a783a9ca6b1 | |

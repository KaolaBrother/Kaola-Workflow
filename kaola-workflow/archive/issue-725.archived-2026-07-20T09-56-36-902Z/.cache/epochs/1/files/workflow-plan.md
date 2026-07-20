# Workflow Plan — issue #725 (epic Phase D: prompt diet + validator narrowing)

<!-- plan_hash: 4fd7e95ef6792bd9c1ee0af846b49c51c1f358332974e1d349e87b9553ec6f4c -->

## Meta

project: issue-725
labels: area:scripts, area:workflow-phases, area:workflow-router, enhancement, workflow:in-progress
speculative_open_policy: auto
plan_schema_version: 2
validation_command: npm test && node scripts/test-opencode-edition.js && node scripts/test-kimi-edition.js
validation_cwd: .
validation_repetitions: 1
validation_pass_rule: all
validation_timeout_minutes: 120
validation_env_allowlist:
code_certifier: n12-code-certify
security_certifier: none
inherited_frontier_digest: none
inherited_frontier_classes: none

## Plan Notes

Phase D ("prompt diet + validator narrowing", absorbing #718 and rider #736) of epic #725 — a FRESH
epoch-1 adaptive run claiming issue #725. Phases A (f92ec240), B (d4bf9e65), C (2a48342c) already
shipped on main; run base is `1491c7e5`. This run lands Phase D ONLY and finalizes as a PARTIAL close:
#725 stays OPEN with the `workflow:in-progress` label (Phase E remains); #718 and #736 CLOSE with this
phase. The issue's three-band rule governs every prose cut: Band 1 (cycle-critical AND not
machine-enforced) stays as terse bullets; Band 2 (restates a JS gate's typed refusal) cuts to a
one-line pointer; Band 3 (advisory narration) cuts.

Targets (record before/after counts in evidence; AC-D allows a recorded one-line reason per miss):
`commands/kaola-workflow-finalize.md` 1065→≤300 (its 2 forge command mirrors and 3 SKILL packs mirror
the banded content), `templates/routing/next.skeleton.md` 1138→≤450, `templates/routing/
plan-run.skeleton.md` 785→≤400, `agents/workflow-planner.md` 600→≤250, `agents/contractor.md` 353→≤150,
`commands/kaola-workflow-adapt.md` 304→≤150 (+ mirrors/skills), role agents trim narration only.

SAME-DIFF OBLIGATION: the token pins that fossilize the trimmed prose live in FIVE contract validators
(`scripts/validate-workflow-contracts.js` + its codex BYTE-TWIN `plugins/kaola-workflow/scripts/
validate-workflow-contracts.js`, `scripts/validate-kaola-workflow-contracts.js`,
`plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`,
`plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`), in the
route-reachability block manifest (`templates/routing/required-blocks.js` +
`scripts/test-route-reachability.js`), and in `scripts/test-opencode-edition.js` /
`scripts/test-kimi-edition.js` (A19/A20-style mirror pins on plan-run/finalize prose; both suites
SELF-RENDER their gitignored trees via `sync --write` at test start, so canonical-vs-generated parity
is automatic — only their verbatim needle asserts can fossilize prose). Each prose-trim node narrows
its own pins in the SAME node; these shared files are why n1→n3→n5 is a serial lane (overlapping write
sets), each writer immediately post-dominated by its own interior code-reviewer gate. n7 (role-agent
narration, `agents/` only, pin-preserving) and n9 (#736, scripts only) are independent antichain legs
with their own gates. `generate-routing-surfaces --check` (full-byte, regenerated) stays the
authoritative byte guard for the 12 generated surfaces. The tail common CODE certifier wall
(`n12-code-certify`, the Meta `code_certifier`) post-dominates every writer through the single unique
graph-maximal producer `n11-docs` — interior gates catch defects while each writer is still
graph-maximal/reopenable; the wall certifies the accumulated candidate. No security label and no
inherited frontier → `security_certifier: none`.

Scope decisions (recorded per AC-D):
- The three reviewer profiles (`agents/{code-reviewer,adversarial-verifier,security-reviewer}.md`,
  `agents/profiles/higher/{code-reviewer,security-reviewer}.md`, and the 9 plugin
  `agents/<role>.toml` mirrors) are GENERATOR-OWNED behavior contracts rendered by
  `scripts/generate-reviewer-profiles.js` from `templates/reviewers/*.json` with stamped
  `behavior_contract_hash`/`resolved_profile_hash` — hand-trimming them is generator drift and risks
  the schema-2 review engine's section contracts. EXCLUDED from the trim; one-line miss reason.
- `agents/profiles/higher/{code-architect,issue-scout}.md` (hand-maintained higher-tier variants) and
  the `workflow-init`/`next-topic` init surfaces are out of Phase D scope.
- Plugin role `.toml` profiles stay untouched EXCEPT `workflow-planner.toml`/`contractor.toml`
  (declared in n5 as pin companions: edit only if a kept/narrowed validator needle forces it; the
  three copies of each must stay byte-identical).
- CLAUDE.md is not touched by this plan (stays under 200 lines by construction).

Traps carried from prior phases (bind every writer):
- NO grep-and-delete of the substring "full" (`escalated_to_full`, "full envelope", "full accumulated
  root diff" are live adaptive vocabulary).
- `scripts/classifier.js` and `scripts/validation-runner.js` are UNTOUCHABLE.
- `templates/routing/slots.js` REPAIR_JS wiring stays.
- The 12 routing surfaces are GENERATED: edit skeleton + slots, regenerate via
  `node scripts/generate-routing-surfaces.js --write`; never hand-edit a generated copy.
- The walkthrough simulations (`scripts/simulate-workflow-walkthrough.js` and
  `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`) are OUTSIDE every write
  set: any token they assert on a trimmed surface is Band-1 KEEP by definition (e.g. the D3/G3
  governance asserts read `commands/kaola-workflow-plan-run.md` for `ACTIVE_WORKTREE_PATH` and
  `Working directory`). Grep both walkthroughs for every marker/token before cutting it.
- `scripts/test-kimi-edition.js` extracts `Agent(\n subagent_type=...` dispatch cards from
  `commands/*.md` — the dispatch-card syntax in command surfaces is load-bearing; trim around it.
- No provenance (issue refs, ADR/decision IDs) in any agent-facing prompt surface
  (docs/conventions.md); the memory-noted `#NNN` prompt needles inside the contract validators are
  among the pins being narrowed.
- Keep every `validate-vendored-agents.js` role-kind needle (SELF-WRITE + evidence-binding /
  RETURN + record-evidence) and all agent frontmatter fields verbatim.

Validation: this is a cross-edition diff → all four `npm test` chains green (run serially on this
host: `KAOLA_RUN_CHAINS_CONCURRENCY=serial`) plus the opencode/kimi suites, per the recorded
`validation_command`. Record once, cite per node: writers run their surface-targeted checks; the full
command runs at n12/finalization. CHANGELOG and all chain-asserted docs land in `n11-docs` BEFORE the
finalize receipt run (a later write would make the receipt `chains_stale`).

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | selector_source | model | wait_budget_minutes | observes | gate_claim | gate_surface | gate_aggregation | certifies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| n1-routing-diet | implementer | — | templates/routing/next.skeleton.md, templates/routing/plan-run.skeleton.md, templates/routing/slots.js, templates/routing/required-blocks.js, scripts/test-route-reachability.js, commands/workflow-next.md, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/workflow-next.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/workflow-next.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/test-opencode-edition.js, scripts/test-kimi-edition.js | 24 | sequence | — | reasoning | — | — | — | — | — | — |
| n2-routing-certify | code-reviewer | n1-routing-diet | — | 1 | sequence | — | reasoning | — | — | the trimmed next/plan-run skeletons and their 12 regenerated surfaces preserve every Band-1 routing/mechanics contract (dispatch cards, worktree and evidence paths, the new mirror-before-dispatch line on all six plan-run surfaces) while the narrowed validator/route-reachability/opencode-kimi pins still machine-enforce exactly the load-bearing tokens, generate-routing-surfaces --check is byte-green, the two validate-workflow-contracts copies are byte-identical, and no provenance token entered any prompt surface | the n1-routing-diet diff vs run base 1491c7e5 — templates/routing skeletons+slots+required-blocks, the 12 generated next/plan-run surfaces, the five contract validators, test-route-reachability.js, test-opencode-edition.js, test-kimi-edition.js | sequence | — |
| n3-finalize-adapt-diet | implementer | n2-routing-certify | commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md, commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md, templates/routing/required-blocks.js, scripts/test-route-reachability.js, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/test-opencode-edition.js, scripts/test-kimi-edition.js | 21 | sequence | — | reasoning | — | — | — | — | — | — |
| n4-finalize-adapt-certify | code-reviewer | n3-finalize-adapt-diet | — | 1 | sequence | — | reasoning | — | — | the trimmed finalize and adapt surfaces (3 commands + 3 SKILL packs each) preserve every Band-1 finalize/sink/adapt mechanic as terse bullets, the six mirrors of each topic stay convergent modulo forge nouns and surface-type framing, the dormant fast-compliance-backstop pin chain is removed coherently across surface+manifest+tests, the narrowed pins in the five validators and route-reachability still enforce exactly the load-bearing tokens, and no provenance token entered any prompt surface | the n3-finalize-adapt-diet diff vs its base — the 12 finalize/adapt command+skill surfaces, required-blocks.js, test-route-reachability.js, the five contract validators, test-opencode-edition.js, test-kimi-edition.js | sequence | — |
| n5-front-agents-diet | implementer | n4-finalize-adapt-certify | agents/workflow-planner.md, agents/contractor.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, plugins/kaola-workflow/agents/contractor.toml, plugins/kaola-workflow-gitlab/agents/contractor.toml, plugins/kaola-workflow-gitea/agents/contractor.toml, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/test-opencode-edition.js, scripts/test-kimi-edition.js | 15 | sequence | — | reasoning | — | — | — | — | — | — |
| n6-front-agents-certify | code-reviewer | n5-front-agents-diet | — | 1 | sequence | — | reasoning | — | — | the trimmed workflow-planner and contractor profiles keep every Band-1 invariant (claim/authoring boundary, refusal and output contracts, re-plan mode, evidence discipline) as terse bullets while cutting only validator-enforced restatements and narration, the narrowed pins across the five validators match the surviving prose including the dual md/toml needle loops, any toml edit keeps the three edition copies byte-identical, and no provenance token entered any prompt surface | the n5-front-agents-diet diff vs its base — agents/workflow-planner.md, agents/contractor.md, the six workflow-planner/contractor toml mirrors, the five contract validators, test-opencode-edition.js, test-kimi-edition.js | sequence | — |
| n7-role-agents-trim | implementer | — | agents/build-error-resolver.md, agents/code-architect.md, agents/code-explorer.md, agents/doc-updater.md, agents/implementer.md, agents/issue-scout.md, agents/knowledge-lookup.md, agents/metric-optimizer.md, agents/planner.md, agents/synthesizer.md, agents/tdd-guide.md | 11 | sequence | — | standard | — | — | — | — | — | — |
| n8-role-agents-certify | code-reviewer | n7-role-agents-trim | — | 1 | sequence | — | reasoning | — | — | the eleven hand-maintained role-agent profiles lose only Band-3 narration: every machine-pinned token (contract-validator needles such as verification_tier and smoke-integration, vendored-agents role-kind needles, walkthrough-asserted tokens) and every frontmatter field survives verbatim, role semantics and evidence contracts are unchanged, and no pin file outside the write set needed narrowing | the n7-role-agents-trim diff vs run base 1491c7e5 — the eleven agents/*.md role profiles only | sequence | — |
| n9-selfdev-guard | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js | 5 | sequence | — | standard | — | — | — | — | — | — |
| n10-selfdev-certify | code-reviewer | n9-selfdev-guard | — | 1 | sequence | — | reasoning | — | — | the detectReviewRuntime self-dev guard runs before the opencode tail-pattern, returns claude exactly when a sibling package.json names kaola-workflow, cannot swallow a genuine opencode install layout, is mirrored identically across all four adaptive-node editions, and the new companion test seeds a fixture checkout literally named kaola-workflow and proves the guard red-to-green while all existing runtime-detection tests stay green | the n9-selfdev-guard diff vs run base 1491c7e5 — the four adaptive-node editions and test-adaptive-node.js | sequence | — |
| n11-docs | doc-updater | n6-front-agents-certify, n8-role-agents-certify, n10-selfdev-certify | CHANGELOG.md | 1 | sequence | — | standard | — | — | — | — | — | — |
| n12-code-certify | code-reviewer | n11-docs | — | 1 | sequence | — | reasoning | — | — | the accumulated Phase D candidate meets AC-D: every trim target is met or carries a recorded one-line miss reason, the six-surface contracts and route-reachability are green, the mirror-before-dispatch line is present on all six plan-run surfaces, no provenance token entered any prompt surface, the validate-workflow-contracts byte-twin pair is byte-identical, the self-dev guard closes the #736 misclassification, and the recorded validation command is green over the final tree including all four edition chains run serially | the full accumulated Phase D candidate vs run base 1491c7e5 across all four editions plus the opencode/kimi suites, reviewed against issue #725 Phase D and AC-D | sequence | — |
| n13-finalize | finalize | n12-code-certify | — | 1 | sequence | — | — | — | — | — | — | — | — |

## Node Briefs

### n1-routing-diet

Apply the three-band rule to the two routing skeletons and regenerate the 12 surfaces. Edit surface is
`templates/routing/{next,plan-run}.skeleton.md` + `templates/routing/slots.js` (much of the prose
lives in slot/splice data — diet both; keep the REPAIR_JS wiring in slots.js untouched); then
`node scripts/generate-routing-surfaces.js --write` renders the 12 generated copies (never hand-edit
them) and `--check` must return byte-green. Targets: next.skeleton ≤450 (from 1138), plan-run.skeleton
≤400 (from 785).

Absorb #718: add the Band-1 Mirror-before-dispatch line at the plan-run skeleton's step-3 dispatch
seam (next to the never-dispatch-without-the-card discipline): apply the returned `taskTransitions` to
the visible task list BEFORE spawning the role agent; the ledger stays authoritative; the mirror is
the operator's only live view. Pin it durably: add a required-blocks manifest entry for the plan-run
topic (runtime_tag `both`, surface_type_tag `both`, distinctive verbatim content tokens, following the
existing record conventions incl. the marker-first-token pattern) so all six plan-run surfaces are
obligated by `checkManifest`.

Same-diff pin narrowing: in `templates/routing/required-blocks.js` + `scripts/
test-route-reachability.js` (block pins/T-pins) and the five contract validators (canonical
`scripts/validate-workflow-contracts.js` — keep its codex byte-twin `plugins/kaola-workflow/scripts/
validate-workflow-contracts.js` byte-identical, copy after editing — plus
`scripts/validate-kaola-workflow-contracts.js` and the gitlab/gitea contract validators), narrow every
pin that targets a next/plan-run surface to load-bearing routing/mechanics tokens only; delete pins
that exist only to fossilize Band-2/3 prose (including `#NNN` prompt needles). Update
`scripts/test-opencode-edition.js` / `scripts/test-kimi-edition.js` mirror pins (e.g. A19) to match —
both suites self-render their trees, so only verbatim needles need care. KEEP rules: any token the
out-of-scope walkthrough simulations assert is Band-1 by definition (the canonical walkthrough's
governance asserts read `commands/kaola-workflow-plan-run.md` for `ACTIVE_WORKTREE_PATH` and
`Working directory` — grep both walkthroughs for every token before cutting); the
`Agent(` dispatch-card syntax in command surfaces is load-bearing (kimi card extraction parses it);
keep the speculative-open card + `--speculative-consent` literal or narrow their pins coherently. No
provenance tokens in any surface.

non_tdd_reason: prose diet + pin narrowing over generated surfaces; the failing oracle is the existing
contract/reachability/edition suites, no natural new failing unit test. Verify (targeted, cite the
recorded command instead of re-running the full suite): `node scripts/generate-routing-surfaces.js
--check`, `node scripts/validate-workflow-contracts.js`, `node scripts/
validate-kaola-workflow-contracts.js`, both forge contract validators, `node scripts/
test-route-reachability.js`, `node scripts/test-opencode-edition.js`, `node scripts/
test-kimi-edition.js` — all green. Record before/after line counts in evidence. If a needed pin file
is outside this write set, surface a write-set gap rather than widening silently.

### n2-routing-certify

Interior certifier gate for `n1-routing-diet` (reopens n1 while it is graph-maximal). Read n1's
evidence and the issue #725 Phase D band rule first. Verify by re-execution: run n1's targeted checks
(generate-routing-surfaces --check; the five validators; test-route-reachability; opencode/kimi
suites) and `cmp` the validate-workflow-contracts byte-twin pair. Judgment focus: band
misclassification — a cycle-critical un-machine-enforced behavior cut as narration (walk the plan-run
and next execution flows end-to-end in the trimmed surfaces: could an orchestrator still run a full
node lifecycle, speculation, halt/repair routing from what remains?); the mirror-before-dispatch line
present and pinned on all six plan-run surfaces; pins narrowed to genuinely load-bearing tokens (not
deleted wholesale); no provenance tokens. Record a gate verdict with `verdict: pass` or concrete
findings with exact triggers; zero findings is valid.

### n3-finalize-adapt-diet

Apply the band rule to the finalize topic (`commands/kaola-workflow-finalize.md` 1065→≤300; mirror the
banded result into the gitlab/gitea command mirrors modulo forge nouns and into the three SKILL packs
modulo surface-type framing — the canonical trimmed github command is the single spec, six surfaces
per topic move together in this one node) and the adapt topic (`commands/kaola-workflow-adapt.md`
304→≤150, same six-surface discipline). These surfaces are HAND-MAINTAINED (not generated) — edit all
12 directly and keep them convergent. Keep Band-1 finalize mechanics as terse bullets: sink-from-main-
root, worktree finalize choreography (feature commit → serial run-chains receipt → cmdFinalize
--keep-worktree → push → sink-merge --sink), keep-open/partial-close handling, receipt freshness
(CHANGELOG before chains), evidence locations, diff-scoped chain selection pointer. Cut Band-2
restatements of what run-chains/claim.js/adaptive-node refuse with typed errors, and Band-3 narration.
Remove the dormant fast-compliance-backstop pin chain coherently: the `<!-- PIN:
fast-compliance-backstop -->` block on finalize surfaces, the `fn-fast-compliance-backstop`
required-blocks manifest entry, the test-opencode-edition A20 assert, and any matching
route-reachability pin — same diff. Narrow the finalize/adapt pins in the five contract validators
(byte-twin discipline as in n1) and required-blocks/test-route-reachability/test-kimi-edition to
load-bearing tokens only. No provenance tokens. Forge-noun discipline for gitlab/gitea mirrors ("the
forge CLI" neutrality applies to plugin agent prose, forge nouns to forge command mirrors — follow
each file's existing convention). non_tdd_reason: prose diet with existing suites as oracle. Verify
targeted: five validators + test-route-reachability + opencode/kimi suites green; spot-check with
`node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
--forbidden-only <changed-file>...` and the gitea twin for forbidden forge tokens. Record before/after
counts. Surface write-set gaps instead of widening.

### n4-finalize-adapt-certify

Interior certifier gate for `n3-finalize-adapt-diet` (reopens n3 while graph-maximal). Read n3's
evidence + n2's verdict. Re-execute n3's targeted checks. Judgment focus: finalize is the workflow's
highest-consequence surface — walk a full finalize (worktree sink, partial close, receipt freshness)
and an adapt session from the trimmed prose alone; confirm every Band-1 mechanic survives as an
actionable bullet; confirm the six mirrors of each topic did not diverge semantically; confirm the
fast-compliance-backstop removal left no dangling pin/manifest/test reference; confirm pins narrowed
not obliterated. Gate verdict; zero findings valid.

### n5-front-agents-diet

Apply the band rule to the two orchestration-agent profiles: `agents/workflow-planner.md` 600→≤250 and
`agents/contractor.md` 353→≤150. Keep as terse Band-1 bullets: the hard boundary (never dispatch,
never judge risk, mechanical freeze), the planner-first control boundary + typed refusals, the claim
startup command + refusal handling, the authoring method order, the write-set completeness disciplines,
the durable return/output contracts, re-plan dispatch mode's binding facts, and evidence-path
discipline. Cut Band-2 grammar/freeze-wall restatements (the plan-validator's typed refusals teach at
runtime) and Band-3 narration/worked examples. Narrow the matching pins in the five contract
validators (byte-twin discipline; includes the codex validator's dual loop asserting needles in BOTH
`agents/workflow-planner.md` and the plugin `workflow-planner.toml`, and the gitlab/gitea
`assertConcept('agents/workflow-planner.md', 'adaptive authoring', ...)` needles). The six
workflow-planner/contractor toml mirrors are declared as pin companions: edit them ONLY if a
kept/narrowed needle or stale-prose parity forces it, and keep each role's three edition copies
byte-identical. Keep vendored-agents role-kind needles and frontmatter verbatim. No provenance tokens.
non_tdd_reason: prose diet with contract validators as oracle. Verify targeted: five validators +
opencode/kimi suites green (`test-opencode-edition` injects mapTier itself — transform-owned, not
prose). Record before/after counts; surface write-set gaps.

### n6-front-agents-certify

Interior certifier gate for `n5-front-agents-diet` (reopens n5 while graph-maximal). Read n5's
evidence. Re-execute the five validators + opencode/kimi suites; `cmp` the byte-twin pair and the
three copies of any edited toml. Judgment focus: the workflow-planner profile steers every future
adaptive run — confirm a planner briefed only by the trimmed profile would still claim correctly,
refuse correctly (control-boundary, frozen-plan overwrite guard), author complete write sets, and
return the typed packets; confirm contractor's seam contract survives; confirm cut material is
genuinely enforced elsewhere or advisory. Gate verdict; zero findings valid.

### n7-role-agents-trim

Narration-only trim of the eleven HAND-MAINTAINED role-agent profiles (build-error-resolver,
code-architect, code-explorer, doc-updater, implementer, issue-scout, knowledge-lookup,
metric-optimizer, planner, synthesizer, tdd-guide). Band 3 cuts only: motivational/explanatory
narration, duplicated harness boilerplate. HARD constraints: this node's write set is ONLY these 11
files — every token pinned by ANY file outside it stays verbatim (grep
`scripts/validate-workflow-contracts.js` for each profile's needles first — e.g. implementer's
`verification_tier` + `smoke-integration`, tdd-guide's `evidence block contains BOTH literal tokens`;
keep every `validate-vendored-agents.js` role-kind needle: SELF-WRITE + evidence-binding for
write-kind, RETURN + record-evidence for read-kind); keep ALL frontmatter fields (name, description,
nickname_candidates, tools, model, any hash) byte-identical; keep role semantics, evidence contracts,
and tool discipline intact. The three reviewer profiles and everything under `agents/profiles/` are
OUT of scope (generator-owned / excluded). If any cut would require narrowing a pin file, do NOT make
that cut — record it and move on (or surface a write-set gap if it blocks the node's purpose).
non_tdd_reason: narration-only prose trim, existing suites are the oracle. Verify targeted:
`node scripts/validate-workflow-contracts.js`, `node scripts/validate-vendored-agents.js`,
`node scripts/test-opencode-edition.js`, `node scripts/test-kimi-edition.js` green. Record
before/after counts per file.

### n8-role-agents-certify

Interior certifier gate for `n7-role-agents-trim` (reopens n7 while graph-maximal). Diff-read all 11
profiles; re-run n7's targeted checks. Judgment focus: narration-only means narration-only — flag any
cut that removed role semantics, an evidence/verdict contract line, a pinned needle, or frontmatter;
flag any edit outside the 11 files. Gate verdict; zero findings valid.

### n9-selfdev-guard

Rider #736 (closes with this phase). TDD, red-first, in `scripts/test-adaptive-node.js`: add the #712
companion test seeding a fixture checkout whose directory is literally named `kaola-workflow` with a
sibling `package.json` whose `name` is `kaola-workflow`, asserting runtime detection returns `claude`
(not `opencode`) for a probe rooted at that fixture's `scripts/` dir — RED against current code. Then
GREEN: in `scripts/kaola-workflow-adaptive-node.js` `detectReviewRuntime()` (~L784-825), add the
self-dev guard BEFORE the opencode tail-pattern: if `path.join(__dirname, '..', 'package.json')`
exists and its `name` is `kaola-workflow`, return `'claude'` (the same self-dev predicate the
kaola_script resolvers use). A genuine opencode install (`<config>/kaola-workflow/scripts/`) has no
sibling repo package.json, so the guard cannot swallow it — keep the existing kimi/claude-install/
opencode branches and all current #712/#717 tests green. Mirror the guard to the three edition ports
(adaptive-node is a generated-aggregator family: the full accumulated canonical diff is the spec,
modulo forge naming) — all four editions move in this one node per script-sync. Verify:
`node scripts/test-adaptive-node.js` fully green, and `node scripts/validate-script-sync.js` green.
This deterministically un-reds the main-root sink FF-race gate on this host.

### n10-selfdev-certify

Interior certifier gate for `n9-selfdev-guard` (reopens n9 while graph-maximal). Re-execute
`node scripts/test-adaptive-node.js` and `node scripts/validate-script-sync.js`. Judgment focus:
guard placement (BEFORE the opencode tail-pattern, AFTER kimi/claude-install branches is acceptable
ordering only if the earlier branches cannot shadow a self-dev checkout — verify against the issue
repro), false-positive risk on genuine opencode/kimi installs, four-edition mirror fidelity, and that
the companion test would genuinely re-red if the guard regressed. Gate verdict; zero findings valid.

### n11-docs

Docs + evidence consolidation BEFORE the finalize receipt (a CHANGELOG write after the chains would
make the receipt chains_stale). Write the `CHANGELOG.md` `[Unreleased]` entries: Phase D prompt diet +
validator narrowing (surfaces + targets), #718 mirror-before-dispatch propagated to all six plan-run
surfaces, #736 detectReviewRuntime self-dev guard. Provenance BELONGS here (issue refs in CHANGELOG
are correct; only prompt surfaces are provenance-free). In the node evidence file, record the AC-D
before/after line-count table for every target surface with a one-line reason for any miss (including
the recorded reviewer-profiles exclusion). Refresh the additive runtime editions:
`node scripts/sync-opencode-edition.js --write` and `node scripts/sync-kimi-edition.js --write`
(gitignored trees — no tracked write), then run `node scripts/test-opencode-edition.js` and
`node scripts/test-kimi-edition.js` green. No other docs file changes: README/docs/ have no Phase-D
coupling; CLAUDE.md untouched.

### n12-code-certify

The named schema-2 common CODE certifier wall (`code_certifier`) — post-dominates all five writers
through the single graph-maximal producer `n11-docs`. Read all writer evidence, all interior gate
verdicts, and issue #725 Phase D. Verify by RE-EXECUTION over the final tree, not prose: run the
recorded Meta `validation_command` (`npm test` — all four edition chains, serially on this host —
plus the opencode and kimi suites) and confirm green. Then certify AC-D directly: every target met or
a one-line miss reason recorded in n11's evidence; six-surface contracts + route-reachability green;
`grep` all six plan-run surfaces for the mirror-before-dispatch tokens; `cmp` the
validate-workflow-contracts byte-twin; sweep the trimmed prompt surfaces for provenance tokens
(`#[0-9]+`, decision/ADR ids); confirm the accumulated diff contains no write outside the union of
declared write sets. Admit only concrete candidate-caused defects with exact triggers; a finding
reopens the owning writer (via reopen-node with a fresh baseline). Emit the certifier receipt with
`certifier_kind: code`. Zero findings is valid.

### n13-finalize

Unique sink, run main-session-direct; writes no tracked file beyond the sink transaction's own
bookkeeping. PARTIAL close of epic #725 (Phase D of A–E): keep #725 OPEN with its
`workflow:in-progress` label (`cmdFinalize --keep-open --keep-worktree`); #718 and #736 CLOSE with
this phase — put `Closes #718` and `Closes #736` in the feature commit body and NEVER a
close/fix/resolve keyword adjacent to `#725` (a closing keyword auto-closes the epic on push).
Confirm the named code certifier `n12-code-certify` is complete and fresh. Cross-edition diff → the
diff-scoped run-chains self-selects all four chains; generate the sink chain receipt with
`KAOLA_RUN_CHAINS_CONCURRENCY=serial` (this host SIGKILLs concurrent run-chains). Choreography:
accumulated feature commit on `workflow/issue-725` → serial run-chains receipt (`--project`) →
`cmdFinalize --keep-worktree --keep-open` → push branch → `sink-merge --sink` from the MAIN root
(diagnose local/origin divergence before any FF retry — every failed fast-forward re-triggers the
full four-chain retest). After push: verify #725 is still OPEN and #718/#736 are CLOSED.

## Node Ledger

| id | status |
| --- | --- |
| n1-routing-diet | complete |
| n2-routing-certify | complete |
| n3-finalize-adapt-diet | complete |
| n4-finalize-adapt-certify | complete |
| n5-front-agents-diet | complete |
| n6-front-agents-certify | complete |
| n7-role-agents-trim | complete |
| n8-role-agents-certify | complete |
| n9-selfdev-guard | complete |
| n10-selfdev-certify | complete |
| n11-docs | complete |
| n12-code-certify | pending |
| n13-finalize | pending |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (n1-routing-diet) | subagent-invoked | evidence-binding: n1-routing-diet fc2d5a8c0215; barrier: group_passed | |
| code-reviewer (n2-routing-certify) | subagent-invoked | evidence-binding: n2-routing-certify 789906e2d675 | |
| implementer (n3-finalize-adapt-diet) | subagent-invoked | evidence-binding: n3-finalize-adapt-diet 6b82c068ed13 | |
| code-reviewer (n4-finalize-adapt-certify) | subagent-invoked | evidence-binding: n4-finalize-adapt-certify 02c3f39b8ef6 | |
| implementer (n5-front-agents-diet) | subagent-invoked | evidence-binding: n5-front-agents-diet 2dc6c8beb4a1 | |
| code-reviewer (n6-front-agents-certify) | subagent-invoked | evidence-binding: n6-front-agents-certify d2cc7441ad15 | |
| implementer (n7-role-agents-trim) | subagent-invoked | evidence-binding: n7-role-agents-trim cb98061ee5a1; barrier: deferred_to_group | |
| code-reviewer (n8-role-agents-certify) | subagent-invoked | evidence-binding: n8-role-agents-certify f029a49dd7d3 | |
| tdd-guide (n9-selfdev-guard) | subagent-invoked | evidence-binding: n9-selfdev-guard c2c63a3d893e; barrier: deferred_to_group | |
| code-reviewer (n10-selfdev-certify) | subagent-invoked | evidence-binding: n10-selfdev-certify 5027b7a848d8 | |
| doc-updater (n11-docs) | subagent-invoked | evidence-binding: n11-docs c7dd31ebebb1 | |
| code-reviewer (n12-code-certify) | pending | | |
| finalize (n13-finalize) | pending | | |

# Workflow Plan — issue-653

<!-- plan_hash: 5b7e82ae94453b7c48eab4061722ae402dc155869af41fe60c1b8300b5ac360b -->

## Meta
speculative_open_policy: auto
labels: bug, area:scripts, area:workflow-phases, area:workflow-router
validation_command: npm test

Make the adaptive-cycle evidence self-contained (P1 umbrella, four findings): (A) the Codex planner
startup surfaces (all 3 planner TOMLs + the 3 adapt SKILLs) dropped `--attest-planner-spawn`, and a
non-empty closure-attestation warning is silently dropped from the durable finalization summary;
(B) a terminally-successful direct sink leaves the transient `sink-receipt.json`/`sink-fallback.json`
journals on disk with no disposal instruction, steering a "clean and synced" agent into committing
them (contradicting #520); (C) the consumer `final-validation.md` receipt is not content-bound to the
landable candidate — `--finalize-check` verifies only presence + a column-0 `verdict: pass`, so
`tested candidate == committed candidate` is not mechanically provable (add a deterministic
`validated_candidate_hash` binding, NO test rerun — #475 preserved); (D) issue-scout selection
evidence and manually-observed run gaps are not durable in the archive (dock selection evidence into
`.cache/selection-evidence.*`; seed observed gaps through `run-gaps-manual.md` so the gap-sweep
mapping is machine-checked, not vacuous).

One design node constrains four serial cross-edition implement nodes plus one mechanical forge-port
mirror node. The implement nodes are SERIAL, not parallel: all four write the claim script (root +
codex byte pair) and/or the shared walkthrough test surfaces, and three of them touch the
finalize/plan-run prose surfaces — genuinely overlapping write sets, so serial is the correct
fallback (parallelism is a means, not a goal). Each concern keeps its FULL semantically-coupled
cross-edition file set in ONE node (no file-count ceiling); the ONE exception is forced by the #340
forge-port ordering rule: `scripts/kaola-workflow-claim.js` is edited by all four implement nodes, so
its gitlab/gitea forge-renamed ports are mirrored in a single dedicated downstream node
(`n6-claim-ports`) whose canonical spec is the FULL accumulated root diff. The four-chain suite is
partly circular around finalize-check/claim behavior, hence a read-only adversarial-verifier gate
that constructs the failure shapes end-to-end after code review.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-design | code-architect | — | — | 1 | sequence | reasoning | — |
| n2-attestation | tdd-guide | n1-design | plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md, scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, scripts/validate-kaola-workflow-contracts.js, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js, commands/kaola-workflow-finalize.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md, agents/contractor.md, plugins/kaola-workflow/agents/contractor.toml, plugins/kaola-workflow-gitlab/agents/contractor.toml, plugins/kaola-workflow-gitea/agents/contractor.toml, scripts/test-route-reachability.js | 28 | sequence | standard | — |
| n3-sink-journal | tdd-guide | n2-attestation | scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js, scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js, plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js, scripts/test-claim-hardening.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, commands/kaola-workflow-finalize.md, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, scripts/test-route-reachability.js, templates/routing/plan-run.skeleton.md, templates/routing/slots.js, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md | 26 | sequence | standard | — |
| n4-candidate-binding | tdd-guide | n3-sink-journal | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, commands/kaola-workflow-plan-run.md, commands/kaola-workflow-finalize.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md, agents/contractor.md, plugins/kaola-workflow/agents/contractor.toml, plugins/kaola-workflow-gitlab/agents/contractor.toml, plugins/kaola-workflow-gitea/agents/contractor.toml, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, scripts/validate-kaola-workflow-contracts.js, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/test-route-reachability.js, templates/routing/plan-run.skeleton.md, templates/routing/slots.js, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md | 36 | sequence | reasoning | — |
| n5-selection-rungaps | tdd-guide | n4-candidate-binding | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, scripts/kaola-workflow-gap-sweep.js, plugins/kaola-workflow/scripts/kaola-workflow-gap-sweep.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-gap-sweep.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-gap-sweep.js, scripts/test-gap-sweep.js, scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js, commands/workflow-next.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md, commands/kaola-workflow-finalize.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, agents/issue-scout.md, plugins/kaola-workflow/agents/issue-scout.toml, plugins/kaola-workflow-gitlab/agents/issue-scout.toml, plugins/kaola-workflow-gitea/agents/issue-scout.toml, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, scripts/test-route-reachability.js, scripts/validate-kaola-workflow-contracts.js, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, templates/routing/plan-run.skeleton.md, templates/routing/next.skeleton.md, templates/routing/slots.js, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/workflow-next.md, plugins/kaola-workflow-gitea/commands/workflow-next.md | 44 | sequence | standard | — |
| n6-claim-ports | implementer | n5-selection-rungaps | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js | 6 | sequence | standard | mechanical forge-port mirror of the accumulated root claim.js diff — behavior-preserving hand-port, no natural failing unit test; covered by the forge walkthrough asserts authored here |
| n7-review | code-reviewer | n6-claim-ports | — | 1 | sequence | reasoning | — |
| n8-adversary | adversarial-verifier | n7-review | — | 1 | sequence | reasoning | — |
| n9-docs | doc-updater | n7-review | README.md, docs/api.md, docs/architecture.md, docs/workflow-state-contract.md, docs/conventions.md, docs/decisions/D-653-01.md | 6 | sequence | standard | — |
| n10-finalize | finalize | n8-adversary, n9-docs | CHANGELOG.md | 1 | sequence | — | — |

## Plan Notes

- **Session directive (/goal), recorded for dispatch:** reasoning-tier role nodes (`n1-design`,
  `n4-candidate-binding`, `n7-review`, `n8-adversary`) carry **model fable at dispatch time**; the
  `model` column above stays in-grammar (`reasoning`/`standard`). Standard/mechanical nodes keep
  their default tiers.
- **Serial implement chain is deliberate.** All four implement nodes write the root+codex claim.js
  pair and/or the shared walkthrough test surfaces, and three touch the finalize/plan-run prose
  surfaces — overlapping write sets, so no antichain is possible without splitting semantically
  coupled cross-edition sets. NEVER hand-add `parallel_safe` (validator-derived).
- **#340 forge-port ordering honored via `n6-claim-ports`.** `scripts/kaola-workflow-claim.js` is
  edited by n2, n3, n4 and n5, so its gitlab/gitea forge-renamed ports are mirrored ONCE in
  `n6-claim-ports`, downstream (transitively) of every root edit. Its canonical spec is the **full
  accumulated root diff vs the run base** (`git diff <base>..HEAD -- scripts/kaola-workflow-claim.js`):
  mirror EVERY hunk modulo forge nouns — never a per-concern enumeration of what each upstream node
  did. Forge-walkthrough asserts that exercise forge claim-port BEHAVIOR are authored in
  n6-claim-ports (they can only go green there); n2–n5 touch the forge walkthroughs only for asserts
  that do not depend on the un-mirrored claim ports.
- **`n8-adversary` (read-only) and `n9-docs` (disjoint docs writer) are deliberate siblings** off
  `n7-review` — the scheduler may co-open them (leg-contained writer behind a live read, default-on);
  the sink joins both.
- **`generated_port_split` honored:** `n4-candidate-binding` declares the plan-validator root + codex
  twin + both forge ports in ONE node, plus the byte-identical adaptive-schema ×4 (the natural shared
  home for the deterministic candidate-hash helper — final placement is n1-design's call; both
  candidate homes are declared).
- **Byte-identity groups that must move atomically:** workflow-planner.toml ×3, contractor.toml ×3,
  issue-scout.toml ×3, closure-contract ×4, adaptive-schema ×4, claim.js root+codex pair,
  sink-merge.js root+codex pair, validate-workflow-contracts.js root+codex pair, gap-sweep root+codex
  pair. After editing a canonical GENERATED aggregator, run `npm run sync:editions` rather than
  hand-editing forge ports.
- **Forge-neutral prose rule:** plugin agent TOMLs / SKILL edits must not introduce forge-specific
  CLI binaries or brand nouns; `--attest-planner-spawn` is a script flag and is allowed. Verify
  changed plugin files immediately with the standalone `--forbidden-only` contract check.
- **Decision record:** `D-653-01` is the next free number (verified against `docs/decisions/`,
  latest is D-651-01 (existing)).
- **Evidence discipline:** every node's evidence lands at `kaola-workflow/issue-653/.cache/<node-id>.md`
  (absolute path at dispatch; never a bare `.cache/<id>.md` at the worktree root).
- **#475 / #648 invariants preserved (per AC):** no consumer test re-execution is added anywhere;
  self-host receipt behavior and #648 citation de-duplication stay byte-unchanged in decision terms.
- **Cross-edition validation:** this is a cross-edition diff — all four chains
  (`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`, i.e. the recorded
  `validation_command: npm test`) must be green (run serially) before finalization; cite, don't
  re-derive, per node. The gitlab/gitea chains are expected fully green only from `n6-claim-ports`
  onward (the forge claim ports lag the root by design until then).

- **Generated-surface coupling (in-run write-set widening).** `commands/kaola-workflow-plan-run.md`
  and `commands/workflow-next.md` are byte-generated from `templates/routing/{plan-run,next}.skeleton.md`
  + `slots.js`, and regeneration also rewrites the two forge command mirrors of each topic — so any
  node editing that prose necessarily also writes the skeleton/slots and the two forge command
  surfaces (hand-editing only the command file reds the byte-guard in every chain). n3/n4 carry the
  plan-run generation set; n5 carries both topics' sets.

## Node Briefs

### n1-design

Read issue #653 in full (four findings A–D + proposed contract + AC), then the surfaces: claim.js
(`claim_planner_attested` computation ~lines 90–120, cmdFinalize summary/receipt writing, #324
sanitizer ~line 1882), sink-merge.js journal exclusion (#520), plan-validator `--finalize-check`
consumer branch (~3290–3370, `final-validation.md` presence + verdict gate; #547 `codeTreeHash` /
`isValidationInvisible` band; #648 citation fields), gap-sweep.js (`run-gaps.json`, `sweptClasses`,
`run-gaps-manual.md` seeding), the 3 planner TOMLs (byte-identical trio) + 3 adapt SKILLs, and
workflow-next.md issue-scout dispatch. Deliverable (evidence file, read by every downstream node): a
per-concern implementation spec — (A) exact TOML/SKILL startup-call text carrying
`--attest-planner-spawn` per edition + the warning-persistence mechanism (a non-empty
`ATTESTATION WARNING` must land verbatim in finalization-summary.md/receipt and can never be
summarized as clean) + the exact contract-validator needle strings per edition; (B) the terminal
journal lifecycle — prefer delete-on-terminal-success inside sink-merge (cheapest sufficient
mechanism; crash-resume before terminal success keeps the journal), plus the finalize/plan-run prose
fix so a "clean and synced" pass disposes rather than commits; (C) the `validated_candidate_hash`
design — deterministic hash over the landable worktree snapshot reusing the #547 relevance band
(`isValidationInvisible`-invisible bookkeeping excluded), shared helper placement (adaptive-schema ×4
byte-identical is the default home), receipt field names, the typed stale refusal name, and where
cmdFinalize verifies BEFORE any archive/commit side effect — NO test rerun (#475); (D) the
selection-evidence docking point (`.cache/selection-evidence.*` written once the claim creates the
project folder; archives with the cycle) + the run-gap seeding rule (an orchestrator-observed gap is
seeded via `run-gaps-manual.md` BEFORE the sweep; closure/gap-sweep refuses an observed-but-unmapped
gap — must map to `noise:` or `filed:`). Spec each concern's RED test first (which test file, which
assert). State assumptions explicitly; flag anything that would widen a declared write set so the
plan can be repaired BEFORE an implement node overflows. Note: the gitlab/gitea claim-script ports
are OFF-LIMITS to n2–n5 (#340); the spec must keep each concern's claim.js changes cleanly
identifiable in the root diff so `n6-claim-ports` can mirror the accumulated diff faithfully.

### n2-attestation

Finding A, test-first. Read `kaola-workflow/issue-653/.cache/n1-design.md` first. RED: contract
needles in the codex/gitlab/gitea contract validators (and the root claude validator pinning
`agents/workflow-planner.md`) asserting every planner startup surface carries
`--attest-planner-spawn` — they must FAIL against the current trees; plus root/codex walkthrough
asserts that a non-empty attestation warning is persisted into the durable finalization
summary/receipt (a clean summary must not silently drop it). GREEN: add the flag to the 3 planner
TOMLs (KEEP the trio byte-identical) and the 3 adapt SKILLs (respect each edition's forge nouns
elsewhere; add no forge-CLI tokens to TOMLs); implement warning persistence in claim.js (root+codex
byte pair ONLY — the gitlab/gitea claim ports are mirrored later in n6-claim-ports); update finalize
command + 3 finalize SKILLs + contractor.md + contractor TOMLs ×3 only as far as the persistence
contract requires. Forge walkthroughs: static/needle asserts only — nothing that depends on the
un-mirrored forge claim ports. Verify changed plugin files with `--forbidden-only`; keep
test-route-reachability green.

### n3-sink-journal

Finding B, test-first. Read n1-design's evidence first. RED: sink tests (test-claim-hardening.js,
test-gitlab-sinks.js, test-gitea-sinks.js, root/codex walkthroughs) asserting that after a terminally
successful direct sink no `sink-receipt.json`/`sink-fallback.json` remains trackable (`git ls-files`
empty for them, `git status --porcelain` clean, no journal commit needed) AND that crash-resume
before terminal success still finds its journal. GREEN: implement the lifecycle in sink-merge.js
(root+codex pair + both forge hand-ports, full-diff mirror — sink-merge is edited ONLY here, so its
ports move in this node); hook finalize-side disposal into claim.js (root+codex pair only) if
n1-design's spec requires it; fix the finalize/plan-run prose (command + 3 SKILLs each) so the
completion contract explicitly disposes of terminal journals instead of steering an agent to commit
them. The #520 staging exclusion stays intact.

### n4-candidate-binding

Finding C, test-first — the subtlest node; read n1-design's evidence first and follow its band
semantics exactly. RED: walkthrough cases — (a) consumer receipt without `validated_candidate_hash`
(legacy) degrades per spec, (b) receipt with matching hash passes, (c) mutating a RELEVANT
source/test/test-consumed file after validation yields the typed stale refusal BEFORE any
archive/commit side effect, (d) validation-invisible bookkeeping mutations do NOT stale it, (e) no
test re-execution happens anywhere on the path (#475). GREEN: shared deterministic snapshot-hash
helper (adaptive-schema ×4 byte-identical, or n1-design's chosen home), consumer `final-validation.md`
gains `validated_candidate_hash` (alongside the #648 citation fields, unchanged), plan-validator
`--finalize-check` consumer branch verifies the binding (plan-validator is a GENERATED aggregator:
edit canonical, `npm run sync:editions` for the codex twin + forge ports — all four declared here),
cmdFinalize (claim.js root+codex pair only; forge ports lag until n6-claim-ports) verifies the
current relevant snapshot matches before side effects. Update plan-run/finalize command + SKILL prose
×6 and contractor.md/TOMLs ×3 to spell the new receipt field. Self-host chain-receipt behavior stays
byte-unchanged in decision terms.

### n5-selection-rungaps

Finding D, test-first. Read n1-design's evidence first. RED: test-gap-sweep.js case — an observed
manual gap that was never seeded through `run-gaps-manual.md` must be refusable (mapping to `noise:`
or `filed:` machine-checked, sweep no longer vacuously green); root/codex walkthrough assert that
selection evidence (`.cache/selection-evidence.*`) is present in the completed archive for an
auto-bundle/sole-issue selection. GREEN: dock the issue-scout recommendation into
`kaola-workflow/{project}/.cache/selection-evidence.*` once the claim creates the project folder
(claim.js root+codex pair and/or router prose per n1-design's spec — workflow-next.md + 3 next
SKILLs; issue-scout profile ×4 only if its return contract needs a dockable shape); seed-before-sweep
rule in the finalize/plan-run prose; closure-contract ×4 (byte-identical) checks archive completeness
if the spec says so. Keep route-reachability + contract validators green.

### n6-claim-ports

Mechanical #340 mirror node. Canonical spec: the FULL accumulated root diff
`git diff <run-base>..HEAD -- scripts/kaola-workflow-claim.js` — mirror EVERY hunk into
`kaola-gitlab-workflow-claim.js` and `kaola-gitea-workflow-claim.js` modulo forge nouns/script
renames, matching each port's existing conventions; never re-derive per-concern from what n2–n5
individually did. Then author the forge walkthrough asserts that exercise the ported claim behavior
(attestation-warning persistence, finalize-side journal/binding/selection behavior as applicable) —
the gitlab/gitea chains must be FULLY green at this node's close; run all four chains and cite the
result.

### n7-review

Full-diff code review of n2..n6 (G1 gate). Focus: byte-identity groups actually identical
(planner/contractor/issue-scout TOMLs ×3, closure-contract ×4, adaptive-schema ×4, root+codex pairs);
forge claim ports carry the FULL accumulated root diff (diff-vs-run-base comparison, not spot
checks); generated ports regenerated not hand-edited; forge-neutral prose in plugin surfaces; warning
persistence cannot be bypassed by a "clean" summary; stale-refusal ordering (refuse BEFORE
archive/commit side effects); no consumer test re-execution introduced (#475); #648 citation fields
untouched; contract-validator needles pin the right strings; four-chain implications of every prose
edit (six-surface propagation rule).

### n8-adversary

Adversarial verification (read-only, Bash allowed): try to REFUTE "the archive is now
self-contained." Construct the failure shapes end-to-end: (1) a planner startup WITHOUT the flag —
does a contract chain actually go red on every Codex surface? (2) a run with a missing/failed
attestation — can any path still produce an unqualified clean finalization summary? (3) a successful
direct sink — is the journal really untracked/absent afterward, and does crash-resume before terminal
success still work? (4) mutate a relevant file after consumer validation — does the typed stale
refusal fire BEFORE archive/commit side effects, and does a validation-invisible mutation correctly
NOT fire it? (5) is the gap-sweep mapping check real or still vacuously green? Ask "invariant proven,
or symptom-masked green?" — the four chains are partly circular here. Verdict findings: fix-in-run →
`status=resolved`; defer → `status=deferred filed=#N`.

### n9-docs

Documentation for the strengthened evidence contract: README (if user-visible behavior changed),
docs/api.md (new receipt field `validated_candidate_hash`, claim/finalize/gap-sweep flag or output
changes — diff against real `--json` output, never fabricate), docs/architecture.md (evidence
lifecycle), docs/workflow-state-contract.md (selection-evidence + journal lifecycle + receipt
binding), docs/conventions.md (only if a convention changed), docs/decisions/D-653-01.md (the
umbrella decision: attestation propagation, journal lifecycle, candidate binding, selection/gap
durability — provenance lives HERE, not in agent-facing prose). CHANGELOG is the sink's, not yours.

### n10-finalize

Terminal sink (not a subagent; the main session runs Phase-6 as this node's evidence). CHANGELOG.md
entry under [Unreleased] describing the strengthened Codex evidence contract. Cross-edition diff:
record the four-chain receipt (`npm test`, serial mode) before finalize; then feature commit →
receipt → cmdFinalize --keep-worktree → push branch → sink-merge --sink from MAIN root. Verify the
remote issue actually closed (a zero exit can still leave it open).

## Node Ledger

| id | status |
| --- | --- |
| n1-design | complete |
| n2-attestation | complete |
| n3-sink-journal | complete |
| n4-candidate-binding | complete |
| n5-selection-rungaps | complete |
| n6-claim-ports | complete |
| n7-review | complete |
| n8-adversary | complete |
| n9-docs | complete |
| n10-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1-design) | subagent-invoked | evidence-binding: n1-design 3dee366bd213 | |
| tdd-guide (n2-attestation) | subagent-invoked | evidence-binding: n2-attestation 7ec679259eca | |
| tdd-guide (n3-sink-journal) | subagent-invoked | evidence-binding: n3-sink-journal b039e808d87b | |
| tdd-guide (n4-candidate-binding) | subagent-invoked | evidence-binding: n4-candidate-binding 9c525d832610 | |
| tdd-guide (n5-selection-rungaps) | subagent-invoked | evidence-binding: n5-selection-rungaps f05d57b01682 | |
| implementer (n6-claim-ports) | subagent-invoked | evidence-binding: n6-claim-ports 7677bf6348b9 | |
| code-reviewer | subagent-invoked | evidence-binding: n7-review 5457dbfeedcc | |
| adversarial-verifier (n8-adversary) | subagent-invoked | evidence-binding: n8-adversary 4f8238411572 | |
| doc-updater (n9-docs) | subagent-invoked | evidence-binding: n9-docs 47d7e98fe9eb | |

# Workflow Plan — issue-579

<!-- plan_hash: bdd9a11e15f8900921e3350ca893f112d80266e80f4c51c8c906ccd5bb008f43 -->

## Meta
labels: enhancement, area:scripts
validation_command: KAOLA_RUN_CHAINS_CONCURRENCY=serial npm test
validation_test_consumes: docs/workflow-state-contract.md

## Plan Notes

**Goal (579).** Harden two Kaola-Workflow sessions sharing one repo checkout. The collision is NOT at
the git merge (`ffMergeLoop` already works) — it is earlier, in the **shared SUPPORT_SCRIPTS** that
every edition byte-mirrors. Three moves + a lane classifier:
- **Move 1 — co-tenant clean-check.** The "is the worktree clean?" gate (claim-time, and
  `assertCleanWorktree`/`assertWorktreeClean` in sink-merge) must DISREGARD `kaola-workflow/*` and
  `.kw/*` paths this run does NOT own (another lane's scratch space), while still failing on real
  uncommitted CODE. Composes with the classifier — only NON-OWNED/parked lanes are ignored; my own
  in-progress state is still respected.
- **Move 2 — single main-root authority.** Collapse the duplicated resolver (`getCoordRoot` /
  `mainRootFromCoord` / `getRoot`, re-implemented once in `claim.js` and again in `adaptive-node.js`)
  into ONE shared helper both call; the claim RECORDS the resolved root in project state so the
  executor reads it back instead of re-deriving (and possibly diverging from a linked/detached root).
- **Move 3 — merge protocol UNCHANGED.** `ffMergeLoop` stays exactly as-is: first finisher merges,
  later finisher rebases-and-retries, a TRUE content conflict halts-and-asks a human (NEVER
  auto-resolve — correctness over speed). Make explicit that a lane cleans up its own
  branch + worktree + `kaola-workflow/<project>/` folder ONLY AFTER its own merge lands.

**Lane classifier (user-resolved scope — implementer carries it out; do NOT re-decide).** Four
buckets — **mine** (created this run → operate normally), **another live session** (leave untouched,
exclude from resume, issue-scout picks a DISJOINT non-conflicting issue, clean-check ignores it),
**stale leftover** (resumable unfinished task — today's default), **ambiguous** (ask or stop — never
silently choose). Mechanisms, exactly as resolved this session:
- **Liveness marker = MINIMAL seatbelt.** Stamp session-id + timestamp into the claim record at
  claim-time ONLY — NO periodic refresh, NO tuning machinery, a SINGLE conservative staleness
  constant.
- **Non-owned lane with NO explicit per-issue resume instruction AND NO co-tenant prompt signal:** a
  FRESH marker → **ask** (do not stomp a likely-live lane); an OLD/untouched marker → treat as a
  resumable stale leftover.
- **Precedence ladder (PER-LANE, not global):** explicit per-issue instruction ("resume 790") >
  blanket co-tenant prompt signal ("another session is working") > liveness heuristic > ask. So "pick
  a non-conflict one" and "resume my crashed 790" can both hold at once.

**Where the shared resolver lives (planner scoping decision; n1 architect refines the API within it).**
`scripts/kaola-workflow-adaptive-schema.js` — the forge-neutral, byte-identical 4-tree drift anchor
ALREADY required by both `claim.js` (`require('./kaola-workflow-adaptive-schema')`) and
`adaptive-node.js`, and by the forge ports (the forge schema copy keeps the SAME filename — NO
`kaola-{forge}-` rename — so the require resolves in every tree). Hosting `getCoordRoot` /
`mainRootFromCoord` there (a) needs only `fs`/`path` built-ins — no new require cycle, (b) adds NO new
module → NO 20-path agent/script registration surface (the cheapest sufficient home), (c) keeps the
two resolvers provably one source. `claim.js`, `adaptive-node.js`, and `sink-merge.js` import the
helper and drop their local re-impls; the claim writes the resolved root into `workflow-state.md`
(new field) and the executor reads it back. n1 records the exact state-field name + helper signature.

**Why the engine + classifier + tests are ONE node (n2).** All three moves CONVERGE on `claim.js`
(clean-check + resolver + liveness-marker stamp + classifier integration), so they cannot be split
into disjoint write-role siblings — splitting would force multiple nodes onto the same `claim.js`
file and trip the forge-port-mirror-ordering rule (each port must mirror the FULL accumulated root
diff). The six shared scripts (`claim`, `sink-merge`, `adaptive-node`, `classifier`, `active-folders`,
`adaptive-schema`) are EDITION-MIRRORED and MUST move atomically: each is byte-copied to the codex
twin (`plugins/kaola-workflow/scripts/`) + hand-ported (rename-normalized) to both forge ports — a
split ships forge-port drift (`edition-sync --check` / `validate-script-sync` red). `adaptive-node`
is a GENERATED_AGGREGATOR, so the freeze-wall already FORCES its 4 edition files into one node;
declaring the other five families' ports in the same node keeps the whole engine atomic and satisfies
the same-node root+port carve-out of the ordering rule. TDD: the lane-classifier four-bucket +
precedence-ladder unit coverage, the clean-check selectivity test, and the authority-split regression
go into the ALREADY-WIRED `test-claim-hardening.js` / `test-adaptive-node.js`; the
two-lanes-in-one-checkout simulation goes into `simulate-workflow-walkthrough.js`. NO new test file
(a new file would need a `package.json` chain-wiring edit not in the write set → barrier stall — the
#576 lesson). The forge walkthroughs + `test-{gitlab,gitea}-workflow-scripts.js` are in the write set
because the claim-record structure change (liveness marker + recorded-root field) MOVES fixtures they
assert on.

**Prose (n3) — forge-neutral co-tenant guidance.** issue-scout agent (md + 3 byte-identical tomls —
keep md↔toml parity, `test-agent-profile-parity.js`) gets co-tenant mode + disjoint-issue selection;
the adapt + finalize command/skill surfaces (mirrored across all editions for cross-forge content
parity) get the co-tenant clean-check note (adapt) and the cleanup-only-after-own-merge note
(finalize). Plugin prose stays forge-neutral — NO `gh`/`glab`/`tea` CLI, no brand noun, no
forge-specific request nouns; write "the forge CLI" / "the forge". Keep provenance OUT of every
agent-facing surface (no `#NNN`, `D-NNN-NN`, `INV-NN`, `ADR …`) — `PROVENANCE_BAN` (a chain guard)
would red otherwise.

**Docs (n4).** `docs/workflow-state-contract.md` documents the new recorded-main-root field + the
liveness marker (it is contract-validator-parsed → it must land BEFORE the chain-running gate, which
n4→n5→n6 ordering guarantees; listed in `validation_test_consumes`). `docs/conventions.md` gets the
co-tenant lane convention + clean-check selectivity rule. `docs/architecture.md` notes the single
main-root authority + the lane-classification model. `docs/decisions/D-579-01.md` is the NEXT FREE
record number (no `D-579-*` exists). `CHANGELOG.md` is written by the finalize sink only (disjoint).

**Accuracy gates (precedence #1 — this is the claim/sink ENGINE every future run depends on; a
regression here breaks all workflows, so the gates are non-negotiable).**
- **n5 adversarial-verifier (opus, read-only) — change-gate skeptic.** Independently tries to REFUTE
  correctness against the test evidence: (1) does the clean-check stay STRICT on real uncommitted code
  while ignoring non-owned `kaola-workflow/*`/`.kw/*` (not over-permissive)? (2) does the four-bucket
  precedence ladder resolve correctly — fresh-marker→ask, old→stale, explicit-issue beats co-tenant
  beats liveness beats ask, PER-LANE? (3) does the recorded-root readback actually eliminate the
  authority-split when launched from a linked/detached root (not just hide it)? (4) is `ffMergeLoop`
  byte-unchanged and does a true conflict still halt-and-ask?
- **n6 code-reviewer (opus, read-only) — G1 + mechanical acceptance.** Post-dominates both
  code-producing nodes (n2 scripts, n3 prose) and runs the recorded `validation_command` — all four
  `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green, run SEQUENTIALLY (#307
  cross-edition obligation: the diff touches the shared scripts + all forge ports + the forge
  walkthroughs). `KAOLA_RUN_CHAINS_CONCURRENCY=serial` is REQUIRED on this host (default `auto`
  SIGKILLs the octopus-merge test inside `test-adaptive-node.js`, which this change touches).

**Model tiers.** opus at the reasoning floors — n1 design (its decisions constrain the 34-file
implementation across four editions) and BOTH gates (subtle concurrency refutation + final
high-blast-radius review). sonnet for the carry-out nodes (n2 implements n1's detailed blueprint; n3
mirrors prose; n4 writes docs). Strong opus gates over a sonnet implementer is the cost-appropriate
shape for novel-but-spec'd concurrency logic.

**No G2 security-reviewer.** No write-set path matches a Phase-5 sensitive pattern and the labels are
non-sensitive — "session" here is a workflow LANE, not an auth session. The validator derives no
sensitivity; honoring that (no clamp).

**Acceptance mapping.** AC two-lanes-in-one-checkout simulation → n2 (`simulate-workflow-walkthrough.js`).
AC lane-classifier unit coverage (four buckets + precedence ladder) → n2 (`test-claim-hardening.js` /
`test-adaptive-node.js`). AC clean-check selectivity (ignores non-owned `kaola-workflow/*`+`.kw/*`,
still fails on real code) → n2 + n5. AC authority-split regression (executor+claim agree on main-root
from a linked/detached root) → n2 + n5. AC merge protocol unchanged / conflict halts-and-asks → n2
(Move 3 preserved) + n5. AC all four chains green sequentially → n6. Docs + `D-579-01` → n4.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-design | code-architect | — | — | 1 | sequence | opus | — |
| n2-engine | tdd-guide | n1-design | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js, scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/kaola-workflow-classifier.js, plugins/kaola-workflow/scripts/kaola-workflow-classifier.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js, scripts/kaola-workflow-active-folders.js, plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js, scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/test-claim-hardening.js, scripts/test-adaptive-node.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 34 | sequence | sonnet | — |
| n3-prose | implementer | n2-engine | agents/issue-scout.md, plugins/kaola-workflow/agents/issue-scout.toml, plugins/kaola-workflow-gitlab/agents/issue-scout.toml, plugins/kaola-workflow-gitea/agents/issue-scout.toml, commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md, commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md | 16 | sequence | sonnet | agent/command/skill prompt-prose (co-tenant guidance + cleanup note); behavior is prompt-guidance with no natural failing unit test — cross-edition parity is enforced by the four-chain contract validators |
| n4-docs | doc-updater | n3-prose | docs/workflow-state-contract.md, docs/conventions.md, docs/architecture.md, docs/decisions/D-579-01.md | 4 | sequence | sonnet | — |
| n5-refute | adversarial-verifier | n4-docs | — | 1 | sequence | opus | — |
| n6-review | code-reviewer | n5-refute | — | 1 | sequence | opus | — |
| n7-finalize | finalize | n6-review | CHANGELOG.md | 1 | sequence | — | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-design | complete |
| n2-engine | complete |
| n3-prose | complete |
| n4-docs | complete |
| n5-refute | complete |
| n6-review | complete |
| n7-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1-design) | subagent-invoked | evidence-binding: n1-design 8df0c6f285eb | |
| tdd-guide (n2-engine) | subagent-invoked | evidence-binding: n2-engine 1a07e3d884f1 | |
| implementer (n3-prose) | subagent-invoked | evidence-binding: n3-prose 99ed72fd0c13 | |
| doc-updater (n4-docs) | subagent-invoked | evidence-binding: n4-docs e362acaf29b4 | |
| adversarial-verifier (n5-refute) | subagent-invoked | evidence-binding: n5-refute 8a8041ae29ca | |
| code-reviewer | subagent-invoked | evidence-binding: n6-review aa47879c8ac8 | |

# Workflow Plan — issue #283

<!-- plan_hash: ca51d615924cdc47afc93c0a46303b541efcdf46dd68853f6adda28f810db9c9 -->

## Meta
labels: documentation, enhancement, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| runtime | tdd-guide | — | scripts/kaola-workflow-repair-state.js, plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js, scripts/kaola-workflow-sink-pr.js, plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js, scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| compact | implementer | runtime | scripts/kaola-workflow-compact-context.js, plugins/kaola-workflow/scripts/kaola-workflow-compact-context.js | 1 | sequence |
| gh-cmd | implementer | — | commands/kaola-workflow-finalize.md, commands/kaola-workflow-phase6.md, commands/kaola-workflow-fast.md, commands/kaola-workflow-phase5.md, commands/kaola-workflow-plan-run.md, commands/workflow-next.md | 1 | sequence |
| gh-cmd2 | implementer | gh-cmd | commands/kaola-workflow-phase1.md, commands/kaola-workflow-phase4.md, commands/workflow-init.md, commands/kaola-workflow-adapt.md | 1 | sequence |
| gh-skill | implementer | — | plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-review/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, agents/contractor.md | 1 | sequence |
| forge-gl-cmd | implementer | — | plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-fast.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase5.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/workflow-next.md | 1 | sequence |
| forge-gl-cmd2 | implementer | forge-gl-cmd | plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase1.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase4.md, plugins/kaola-workflow-gitlab/commands/workflow-init.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md | 1 | sequence |
| forge-gl-js | implementer | forge-gl-cmd2 | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-compact-context.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js | 1 | sequence |
| forge-gl-rest | implementer | forge-gl-js | plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-fast/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-review/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md | 1 | sequence |
| forge-gt-cmd | implementer | forge-gl-rest | plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-fast.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase5.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/workflow-next.md | 1 | sequence |
| forge-gt-cmd2 | implementer | forge-gt-cmd | plugins/kaola-workflow-gitea/commands/kaola-workflow-phase1.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase4.md, plugins/kaola-workflow-gitea/commands/workflow-init.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md | 1 | sequence |
| forge-gt-js | implementer | forge-gt-cmd2 | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-repair-state.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-compact-context.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js | 1 | sequence |
| forge-gt-rest | implementer | forge-gt-js | plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-fast/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-review/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md | 1 | sequence |
| base-contract | tdd-guide | runtime, compact, gh-cmd2, gh-skill, forge-gt-rest | scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, scripts/test-install-model-rendering.js, package.json | 1 | sequence |
| code-review | code-reviewer | base-contract | — | 1 | sequence |
| docs | doc-updater | code-review | README.md, docs/README.md, docs/api.md, docs/architecture.md, docs/workflow-state-contract.md, docs/conventions.md | 1 | sequence |
| finalize | finalize | docs | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
|----|--------|
| runtime | complete |
| compact | complete |
| gh-cmd | complete |
| gh-cmd2 | complete |
| gh-skill | complete |
| forge-gl-cmd | complete |
| forge-gl-cmd2 | complete |
| forge-gl-js | complete |
| forge-gl-rest | complete |
| forge-gt-cmd | complete |
| forge-gt-cmd2 | complete |
| forge-gt-js | complete |
| forge-gt-rest | complete |
| base-contract | complete |
| code-review | complete |
| docs | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (runtime) | subagent-invoked | # runtime (tdd-guide) — issue-283 | |

| implementer (gh-cmd) | subagent-invoked | # gh-cmd (implementer) — issue-283 | |
| implementer (gh-skill) | subagent-invoked | # gh-skill (implementer) — issue-283 | |
| implementer (forge-gl-cmd) | subagent-invoked | # forge-gl-cmd (implementer) — issue-283 | |
| implementer (compact) | subagent-invoked | # compact (implementer) — issue-283 | |
| implementer (gh-cmd2) | subagent-invoked | # gh-cmd2 (implementer) — issue-283 | |
| implementer (forge-gl-cmd2) | subagent-invoked | # forge-gl-cmd2 (implementer) — issue-283 | |
| implementer (forge-gl-js) | subagent-invoked | # forge-gl-js (implementer) — issue-283 | |
| implementer (forge-gl-rest) | subagent-invoked | # forge-gl-rest (implementer) — issue-283 | |
| implementer (forge-gt-cmd) | subagent-invoked | # forge-gt-cmd (implementer) — issue-283 | |
| implementer (forge-gt-cmd2) | subagent-invoked | # forge-gt-cmd2 (implementer) — issue-283 | |
| implementer (forge-gt-js) | subagent-invoked | # forge-gt-js (implementer) — issue-283 | |
| implementer (forge-gt-rest) | subagent-invoked | # forge-gt-rest (implementer) — issue-283 | |
| tdd-guide (base-contract) | subagent-invoked | # base-contract (tdd-guide) — issue-283 | |
| code-reviewer | subagent-invoked | # code-review (code-reviewer, G1) — issue-283 | |
| doc-updater (docs) | subagent-invoked | # docs (doc-updater) — issue-283 | |
| finalize (finalize) | subagent-invoked | # finalize (sink) — issue-283 | |
## Plan Notes

Non-author free-text (outside the `plan_hash`, which covers only `## Meta` + `## Nodes`).
Resume-safe specification of the #283 refactor: make `Finalization` the canonical route-neutral
name for the shared terminal routine across full/fast/adaptive, and HARD-REMOVE the legacy `Phase 6`
runtime surface (no compatibility shim, no dual-artifact reader, one-way in-flight migration
completed inside this issue). This is the RE-AUTHORED plan (orchestrator-directed, ledger un-started)
that closes an ISSUE-COVERAGE gap the grammar validator cannot see: the first freeze missed the
forge `fast/review/finalize` SKILLs and several full-path command docs that still present `Phase 6`
as the official routine name. The write sets below ARE the coverage map.

### The authoritative coverage sweep (the gap the validator cannot certify)

The plan-validator certifies grammar / disjointness / ceilings / post-dominance — NOT issue
coverage. A missed `Phase 6` file passes the validator and SHIPS as an AC violation (which is what
the first freeze did). Per-area greps under-counted (they missed the forge skills). The write sets
were rebuilt from ONE authoritative sweep:
`grep -rniE 'phase[ -]?6|phase6-summary|kaola-workflow-phase6'` across all four trees + root,
excluding only `kaola-workflow/archive/`, `docs/investigations/`, `docs/decisions/`,
`.kw/worktrees/`, `node_modules/`, `.git/`. EVERY live hit from that sweep is either (a) in a node's
write set below, (b) a documented comment-only / foreign-artifact exclusion, or (c) AC-permitted
historical. The sweep was sanity-checked to surface the previously-missed forge skill files.

### Coverage ledger — every live hit accounted for

COVERED (in a node write set):
- Base/canonical runtime `.js` (behavior + migration): repair-state ×2, sink-pr ×2 → `runtime`;
  compact-context ×2 (the runtime-emitted `"If Phase 4 or Finalization validation failed…"` guidance
  string) → `compact`. Base test/route fixtures (`simulate-workflow-walkthrough.js`) → `runtime`.
- Base/canonical contracts + the model-rendering test that READS the renamed command + the
  `package.json` description → `base-contract`.
- github command docs: terminal-routine renames + route text in finalize(new)/phase6(remove)/
  fast/phase5/plan-run/workflow-next → `gh-cmd`; the SHARED-TERMINAL references in
  phase1/phase4/workflow-init/adapt → `gh-cmd2`.
- github skills (next/fast/plan-run/review/finalize, incl. the `# Phase 6 - Summary` template
  heading + `phase6-summary.md` reference) + `agents/contractor.md` → `gh-skill`.
- gitlab edition (all under area `plugins`, serial chain): commands → `forge-gl-cmd` +
  `forge-gl-cmd2`; scripts (repair-state, sink-mr, sink-merge — incl. its `phase6-summary.md`
  read —, compact-context port, walkthrough, test-sinks) → `forge-gl-js`; test-workflow-scripts +
  the gitlab contract validator (which asserts `phase6.md` existence) + the four forge skills
  (next/fast/review/finalize) → `forge-gl-rest`.
- gitea edition (symmetric): `forge-gt-cmd`, `forge-gt-cmd2`, `forge-gt-js`, `forge-gt-rest`.
- Live docs (README.md, docs/README.md, docs/{api,architecture,workflow-state-contract,conventions}.md)
  → `docs`; CHANGELOG.md → `finalize`.

EXCLUDED — comment-only (not user-facing, not a runtime input; editing forces byte-sync-peer churn
across the `COMMON_SCRIPTS` group for ZERO AC value; the issue explicitly permits non-runtime
references):
- `scripts/kaola-workflow-claim.js` (+ canonical + forge ports) — a `next_command` doc COMMENT.
- `scripts/kaola-workflow-plan-validator.js` (+ canonical + forge ports) — COMMENTS explaining the
  "phase6 merge gate" semantics.
- `scripts/kaola-workflow-next-action.js` (+ canonical + forge ports) — a code COMMENT
  ("the Phase-6 handoff signal").
- base `scripts/kaola-workflow-sink-merge.js` — ZERO phase6 hits (its FORGE ports DO carry the
  `phase6-summary.md` read and ARE covered in `forge-gl-js`/`forge-gt-js`).

EXCLUDED — foreign / historical (not this issue's surface):
- `kaola-workflow/issue-297/workflow-plan.md` — ANOTHER active project's frozen plan (a workflow
  artifact, barrier-exempt; not ours to edit).
- `docs/investigations/*`, `docs/decisions/*`, `kaola-workflow/archive/*` — AC-permitted historical
  artifacts that are not runtime inputs.

NOTE on `adapt.md` (base + 2 forge): the hit is a parenthetical lifecycle-frame phrase
("→ Phase-6 sink") in a LIVE user-facing command doc, so it IS incorporated (→ `gh-cmd2` /
`forge-*-cmd2`) and rewritten to "Finalization sink" — distinct from the genuine code COMMENT in
`next-action.js`, which is excluded.

### Tier-2 scope decision (incorporated, not excluded)

The full-path command docs + the compact-context runtime guidance string that name `Phase 6` are
the SHARED TERMINAL ROUTINE in live runtime/route text, so the AC ("Full, fast, and adaptive path
docs describe the shared terminal routine as Finalization"; "remaining Phase 6 references restricted
to archived/historical") REQUIRES their rename — incorporating is AC-compliance, not scope creep.
PRECISION: `Phase 4` STAYS `Phase 4` (a non-terminal positional phase of the full path, not
renamed); only the terminal-routine `Phase 6` becomes `Finalization`. So
`compact-context.js:100` becomes `"If Phase 4 or Finalization validation failed…"` (Phase 4
preserved), and `phase4.md`'s "Reserve full-suite validation for Phase 6" → "for Finalization",
`phase1.md`'s "Phase 6 Step 7 deletes it" → "Finalization Step 7", `workflow-init.md`'s "the final
Phase 6 step" → "the final Finalization step".

### DAG shape — area model, serial spine, cross-edition contract join

Disjointness is checked at AREA granularity (`classifier.areaForPath`): `scripts` and
`plugins/kaola-workflow/scripts` are distinct; the github canonical edition `plugins/kaola-workflow/…`
gets 3-segment areas (`plugins/kaola-workflow/skills`); BOTH `plugins/kaola-workflow-gitlab/…` AND
`plugins/kaola-workflow-gitea/…` collapse to the SINGLE area `plugins`; `commands`, `agents`, `docs`
are their own areas.

START FRONTIER (depends_on `—`, mutually area-disjoint → opened as one batch): `runtime`
(`scripts`+`plugins/kaola-workflow/scripts`), `gh-cmd` (`commands`), `gh-skill`
(`plugins/kaola-workflow/skills`+`agents`), `forge-gl-cmd` (`plugins`).

SERIAL CONSTRAINTS (same-area successors, NOT siblings):
- `compact` depends on `runtime` — it shares `runtime`'s exact areas (`scripts` +
  `plugins/kaola-workflow/scripts`); placing it in the ready frontier with `runtime` would trip the
  inferred-concurrent-sibling disjointness check (#232). It cannot fold INTO `runtime` (5+2 = 7 >
  FILE_CEILING 6), so it is a serial successor.
- `gh-cmd2` depends on `gh-cmd` (both area `commands`; `gh-cmd` is full at 6).
- The ENTIRE forge surface is area `plugins` (gitlab AND gitea collapse together), so it is ONE long
  serial chain: `forge-gl-cmd → forge-gl-cmd2 → forge-gl-js → forge-gl-rest → forge-gt-cmd →
  forge-gt-cmd2 → forge-gt-js → forge-gt-rest`. It launches at the start frontier and is the
  critical path by length; the three non-forge start lanes finish well inside it.

`base-contract` JOINS all lanes (`depends_on runtime, compact, gh-cmd2, gh-skill, forge-gt-rest`)
and is the node that flips the CROSS-EDITION contract assertions in `validate-workflow-contracts.js`
(+ its byte-identical canonical peer): `validate-workflow-contracts.js` asserts the EXISTENCE of
`commands/kaola-workflow-phase6.md` AND the gitlab AND gitea `phase6.md` (it keys all three
editions), so the moment ANY edition renames, the base contract validator goes red until this join
flips the assertions to `kaola-workflow-finalize.md`. It also repoints `test-install-model-rendering.js`
(which READS the installed `kaola-workflow-phase6.md`) and updates the Codex `validate-kaola-workflow-
contracts.js` (single-source). This is where the NEW contract assertions the issue requires live —
assert the canonical finalization route PRESENT and the legacy command/artifact route ABSENT from
live runtime surfaces. `tdd-guide`: those assertions are observable red→green.

### Role-choice rationale (tdd-guide vs implementer)

`runtime` (tdd-guide): genuine behavioral red→green in the hand-rolled `assert` harness —
`repair-state.js` STOPS generating `phase: 6` / `phase_name: Finalize` /
`next_command: /kaola-workflow-phase6` and STOPS reading `phase6-summary.md` as a completion signal
(the legacy reader is DELETED, not aliased — the issue forbids a one-release shim); `sink-pr.js`
reads/writes `finalization-summary.md` instead of `phase6-summary.md`; the ONE-WAY in-flight
migration (rewrite active non-archived `kaola-workflow/{project}/` folders old→new, then delete the
legacy path in the SAME issue) rides here with fixture coverage. The walkthrough fixtures
(`simulate-workflow-walkthrough.js` route string + `phase6-summary.md` plants) are the
failing-then-passing tests. Fully specified → no separate `code-architect`/`planner` design node
(cf. #293).

`base-contract` (tdd-guide): the legacy-absent / canonical-present contract assertions ARE the
observable red→green.

`compact` (implementer): the change is a single runtime guidance STRING swap (route text), no
behavioral branch and no natural failing UNIT test of its own — it is exercised indirectly by the
compact-context tests inside `npm test`. `non_tdd_reason`: route-text/string edit, no behavioral
logic.

All rename/mirror nodes (`gh-cmd`, `gh-cmd2`, `gh-skill`, every `forge-*`) are `implementer`: `.md`
renames + route-text edits and MECHANICAL cross-edition `.js` PORT mirrors of the base behavior.
`non_tdd_reason`: docs/markup + edition-port mirror with NO natural failing UNIT test distinct from
the base edition (covered by base unit tests/walkthrough + the forge walkthroughs/contracts in
`npm test`, asserted at `base-contract`/`code-review`). "Hard to test" is NOT the reason — there is
no behavioral logic distinct from the base edition to RED-test.

### Gate rationale (G1 / G2 / doc-updater / finalize)

G1 — `code-review` (code-reviewer) POST-DOMINATES every code-producing node. The CODE-PRODUCING
nodes (a write-set path that is NOT `.md` ⇒ `nodeProducesCode` true) are `runtime`, `compact`,
`forge-gl-js`, `forge-gl-rest`, `forge-gt-js`, `forge-gt-rest`, and `base-contract` (which also
carries the one-line `package.json` description rename — a non-`.md` production file, so it MUST sit
ABOVE `code-review`; a doc-updater node carrying `package.json` would itself be code-producing yet
sit BELOW `code-review`, the exact validator refusal this placement resolves). The markdown-only
nodes (`gh-cmd`, `gh-cmd2`, `gh-skill`, `forge-gl-cmd`, `forge-gl-cmd2`, `forge-gt-cmd`,
`forge-gt-cmd2`) are docs-only (every declared path ends in `.md` ⇒ `isDocsPath` true) so they do
NOT themselves require G1, but they all FEED `base-contract → code-review`. Every node's write set
uses real `.md`/file tokens (NEVER a bare directory token) so the docs exemption holds and the
markdown nodes stay G1-light while still being declared for barrier authorization. Both forge chain
tails (`forge-gt-rest`) and the github tails (`gh-cmd2`, `gh-skill`) and `compact` reach the sink
ONLY through `base-contract → code-review`, so code-review post-dominates the whole code-producing
set.

G2 — NO `security-reviewer`. Verified against the sweep: none of the declared production paths match
a `SENSITIVE_PATTERN`. The touched scripts (`repair-state`, `sink-pr`, `sink-merge`, `compact-context`,
the forge sink ports, the contract validators, the model-rendering test) are
git/PR/roadmap/route/context bookkeeping — names carry no auth/token/secret/credential/`fs/`/oauth/
session marker. A route-name refactor, not a sensitive-surface change.

`docs` (doc-updater) BEFORE `finalize`: MANDATORY — public, user-facing surfaces change (README
"6-phase development workflow", the ASCII route diagram "──► Phase 6", the "Phase 6 Finalize …
phase6-summary.md" row, "ends at Phase 6 closure", the adapt route prose; docs/README.md index;
docs/{api,architecture,workflow-state-contract,conventions}.md). Its write set is PURE `.md` so it is
G1-light; the non-`.md` `package.json` rename is hoisted UP into `base-contract` (above G1).
doc-updater depends on `code-review` so the code/route shape is settled before the prose is
reconciled.

`finalize` (finalize) sink writes ONLY `CHANGELOG.md` (docs/state — a non-docs write there trips
code-reviewer). The [Unreleased] CHANGELOG entry records the route-neutral rename + legacy removal.

### Byte-sync group obligation (#274) + compact-context drift

`repair-state.js`, `sink-pr.js`, `validate-workflow-contracts.js` are in `COMMON_SCRIPTS`
(byte-identical `scripts/` ↔ `plugins/kaola-workflow/scripts/`). The validator's freeze-time
sync-group check (#274) requires each member's byte-identical peer in the PLAN UNION; both peers are
placed in the SAME node (`runtime` for repair-state+sink-pr, `base-contract` for the contract
validator) so `validate-script-sync.js` (first lane of every `npm test` edition) never sees an
intermediate-drift HEAD. `compact-context.js` is NOT in `COMMON_SCRIPTS` (it is "Claude-only" with a
separate Codex variant and is not byte-sync-enforced), but `scripts/` and `plugins/kaola-workflow/
scripts/` copies are byte-identical TODAY; to avoid introducing drift, BOTH are edited identically in
the SAME node (`compact`), and the two forge compact-context ports ride their edition nodes
(`forge-gl-js` / `forge-gt-js`). The forge ports are not in any byte-sync group — forge parity is a
correctness obligation enforced by the forge nodes + forge contract validators, not a script-forced
one.

### Verification reality (the AC gates)

"Verified" at `runtime`/intermediate nodes = `node scripts/simulate-workflow-walkthrough.js` exits 0
("Workflow walkthrough simulation passed") (the barrier runs NEITHER `npm test` NOR the walkthrough —
verification is ROLE-AUTHORED evidence; the scoped walkthrough does NOT read the phase6 command file,
so intermediate renames stay self-consistent). At the LAST code node + `code-review`, ALSO `npm test`
green (real exit code captured directly, never gated on a piped `| tail`) — the first point the
cross-edition coupling requires global green. The issue's explicit ACs —
`simulate-workflow-walkthrough.js` passes, `npm test` passes, installed surfaces no longer include
`kaola-workflow-phase6.md`, runtime no longer reads `phase6-summary.md` / generates `phase: 6` /
routes to `/kaola-workflow-phase6`, contracts assert canonical-present + legacy-absent, NO live
command/skill description uses "Phase 6" as the official name in ANY edition — map exactly onto
`runtime`/`compact` (behavior + removal + migration + guidance string), the rename nodes
(every-edition command/skill cover), and `base-contract` (cross-edition contract present/absent),
under G1 `code-review`, with user-facing prose finished at `docs` before the `finalize` sink.

### Concurrency note

Run inside the provisioned worktree `.kw/worktrees/issue-283/`; the orchestrator owns
git-freshness/rebase at sink time. The write set is the phase6→finalization surface only; if a
concurrent session advances origin/main the orchestrator rebases (keep-both CHANGELOG) per the
standard worktree-sink recovery. `kaola-workflow/issue-297/` is a SEPARATE concurrent project and is
explicitly NOT in any write set.

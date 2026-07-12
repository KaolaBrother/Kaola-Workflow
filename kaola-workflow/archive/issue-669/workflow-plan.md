# Workflow Plan — issue-669

<!-- plan_hash: 5a0555e4179ed49b47a6fa3cd8c62d2b06f70928dd4005c7c79c6fc8ba28c38e -->

## Meta

labels: workflow:in-progress
validation_command: node scripts/simulate-workflow-walkthrough.js
speculative_open_policy: auto

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-porcelain-cap | tdd-guide | — | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js, scripts/test-adaptive-node.js | 17 | sequence | standard |
| n2-review | code-reviewer | n1-porcelain-cap | — | 1 | sequence | reasoning |
| n3-adversarial | adversarial-verifier | n2-review | — | 1 | sequence | reasoning |
| n4-finalize | finalize | n3-adversarial | CHANGELOG.md | 1 | sequence | — |

## Node Briefs

### n1-porcelain-cap

Intent: close the post-#666 sibling ENOBUFS tier — apply the existing `GIT_MAX_BUFFER` cap to every
`git status --porcelain` CONTENT call site, and (the crux) flip the plan-validator dirty-fence probe
from fail-OPEN to fail-CLOSED on overflow. #666 already introduced the per-script
`const GIT_MAX_BUFFER = 64 * 1024 * 1024;` in all four of these canonical scripts AND in the divergent
forge ports, so the constant already exists everywhere — this node only adds `maxBuffer: GIT_MAX_BUFFER`
to the porcelain call options and changes the dirty-fence catch semantics.

Approach (test-first):
1. RED: add a focused regression to `scripts/test-adaptive-node.js` (it already carries the
   `makeLaneRepo` / `snapshotWorktree` git-tree harness AND the `--parent-clean-check` dirty-fence
   tests — grep `parent-clean-check` / `parent_dirty` near line ~7029). Build a synthetic worktree
   whose `git status --porcelain --untracked-files=all` output exceeds Node's 1 MB default `maxBuffer`
   (many small untracked/dirty paths — path COUNT, not repo size), then drive the plan-validator
   dirty-fence (`--parent-clean-check`, plan-validator.js `status --porcelain -uall` probe). Assert the
   DESIRED post-fix behavior: the fence FAILS CLOSED (a typed refuse — `parent_dirty` or an explicit
   cannot-prove-clean reason — NOT a `pass`/clean verdict). Against the unpatched code the empty-catch
   sets `porcelain = ''`, the fence sees zero dirty paths and returns `pass` — so this assertion is RED
   before the fix. Keep the fixture bounded/fast (just past 1 MB, well under a second to build).
2. GREEN, part A — cap every `status --porcelain` CONTENT site (re-locate before editing; line numbers
   drift):
   - `scripts/kaola-workflow-plan-validator.js` — the `-uall` dirty-fence probe (~:3253).
   - `scripts/kaola-workflow-sink-merge.js` — the three content probes (~:147, :223 `-uno`; :984 `-uall`).
   - `scripts/kaola-workflow-adaptive-node.js` — the leg-dirty probe (~:4522, unbounded) plus the two
     path-scoped probes (~:5484, :5499, `status --porcelain -- <paths>`).
   - `scripts/kaola-workflow-claim.js` — the three probes (~:483, :532, :1634).
   Add `maxBuffer: GIT_MAX_BUFFER` to each call's options object.
3. GREEN, part B — the dirty-fence FAIL-CLOSED flip (the safety-critical crux). In
   plan-validator.js `--parent-clean-check`, the `catch (_) { porcelain = ''; }` MUST NOT collapse an
   overflow/exec error to "zero dirty paths". On ENOBUFS/any exec failure the fence must treat the tree
   as "cannot prove clean" and REFUSE (emit a typed refuse — reuse `parent_dirty` or add an explicit
   cannot-prove-clean reason — with `process.exitCode = 1`), NEVER fall through to the `pass` branch.
   This is the one site that MUST flip.
4. Per-site fail-safety justification (record in evidence): for EACH other porcelain catch you touch,
   state whether its empty-catch is already fail-SAFE (an empty result there means "no change to
   report", the conservative outcome) or whether it, too, must flip. The adaptive-node path-scoped
   probes (`-- <paths>`) return `{ changed: false }` on catch — decide and justify whether that is
   fail-safe for the leg-barrier consumer or must also treat overflow as "changed/unknown". The
   dirty-fence at :3253 is the one that categorically MUST fail closed.

Cross-edition (all four chains must stay green — this diff touches the edition trees):
- `kaola-workflow-plan-validator.js` and `kaola-workflow-adaptive-node.js` are GENERATED_AGGREGATORS:
  edit the canonical `scripts/` copy ONLY, then run `npm run sync:editions` so the codex twin + both
  `@generated` forge ports regenerate. All four edition files per base are in this node's write set and
  MUST land together (atomic move). Do NOT hand-edit the `@generated` forge ports.
- `kaola-workflow-claim.js` and `kaola-workflow-sink-merge.js` are COMMON canonical↔codex (byte,
  regenerated by `sync:editions`) but their forge ports are DIVERGENT HAND-PORTS. `sync:editions` will
  NOT touch the forge ports — you MUST hand-apply the identical `maxBuffer: GIT_MAX_BUFFER` cap at the
  corresponding porcelain sites in
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-{claim,sink-merge}.js` and the gitea
  twins. Grep each forge port for `status', '--porcelain` and cap EVERY content site (the forge ports
  diverge line-for-line and carry an extra porcelain probe or two — cap by grep, not by line number).
  The forge ports already carry `GIT_MAX_BUFFER` from #666, so no new constant is needed there.
Then run `node scripts/edition-sync.js --check` to prove the mirror/port families are in sync.
Local check: `node scripts/test-adaptive-node.js` (prove RED before GREEN, then green) + the shared
`validation_command`.
`non_tdd_reason`: N/A — this node IS test-first (tdd-guide); the >1 MB porcelain overflow of the
fail-open dirty-fence is a genuine failing-test-first opportunity.

### n2-review

Intent: G1 gate — post-dominates the sole code-producing node (n1). Reasoning-tier review of a
cross-edition change. Read n1's evidence file first.
Verify: (a) EVERY `git status --porcelain` content site listed above now carries
`maxBuffer: GIT_MAX_BUFFER` and no fixed-size / worktree-count-bounded probe was needlessly capped;
(b) the plan-validator dirty-fence at :3253 genuinely FAILS CLOSED on overflow (refuse, not
pass-to-empty) and n1's per-site justification for the other catches is sound; (c) all four editions
of the two GENERATED aggregators regenerated cleanly (`edition-sync --check` clean) and the DIVERGENT
claim/sink-merge forge ports were hand-edited to match; (d) n1's regression truly overflows (>1 MB
porcelain) and would return `pass` (fail-open) against the unpatched fence — i.e. it is a real RED,
not a vacuous assertion. This is a cross-edition diff — confirm the four-chain obligation is discharged
(see Plan Notes / Finalization). Record a verdict.

### n3-adversarial

Intent: adversarial CHANGE-GATE — post-dominates n1 (fail-OPEN→fail-CLOSED safety-fence flips are
exactly the class where an independent skeptic earns its keep). Read n1 + n2 evidence first, then try
to REFUTE the claim that the dirty-fence is now truly fail-closed.
Attack surface: (1) Is the fence fail-closed on EVERY error path, or only the ENOBUFS one? Construct a
non-ENOBUFS exec failure (e.g. git returns non-zero, a partial read) and check it still refuses rather
than falling through to `pass`. (2) Can a "fixed" fence still fail open via a sentinel — e.g. a catch
that sets `porcelain` to a value that parses to zero production paths? (3) Does the regression actually
build a >1 MB porcelain and would a MASKED fix (cap added but catch still empties) pass it? Confirm the
test would catch that. (4) Re-examine the OTHER porcelain catches n1 justified as "already fail-safe" —
is any of them actually a residual fail-open in its own consumer (leg-barrier, claim archive probe,
sink dirty-check)? (5) Run the existing `node scripts/test-adaptive-node.js` to confirm the fence
tests + regression pass. Record a verdict (pass/fail with concrete evidence).

### n4-finalize

Intent: unique docs/state sink. Add a `CHANGELOG.md` entry under `[Unreleased]` for #669: the
`git status --porcelain` family ENOBUFS hardening (explicit 64 MB `maxBuffer` on every porcelain
content site across plan-validator, adaptive-node, claim, sink-merge and their editions/forge ports),
the plan-validator dirty-fence flipped from fail-OPEN to fail-CLOSED on overflow, and the >1 MB
porcelain-output regression. Docs/state only — no code writes on the sink.
No public interface / env var / API changed, so no `docs/` or ADR update is required. Note in the sink
evidence that the four-chain green receipt (below) is a Finalization precondition, and that a post-ship
reinstall of the three runtimes to refresh the installed copies is a manual post-merge step, not a plan
node.

## Plan Notes

- Cross-edition diff (touches the edition plugin trees + two GENERATED aggregators): Finalization
  REQUIRES all four chains green, run sequentially and recorded via a run-chains receipt before the
  sink — `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea`.
  A green claude chain alone is insufficient (`npm test` short-circuits on first failure, so a red
  codex/gitlab/gitea chain behind a green claude one is never reached).
- Single coherent node: this is one edit family (`maxBuffer` on the porcelain sites) across a handful
  of scripts, several sites share the same files, and the dirty-fence fail-closed flip is tightly
  coupled to its regression test — NOT decomposable into disjoint parallel write-legs. There is no
  file-count ceiling, so the cohesive cross-edition write set stays in ONE node.
- Serial gate spine: n2 (code-reviewer) and n3 (adversarial-verifier) are chained, not fanned, so each
  independently post-dominates n1 (parallel gates both feeding finalize would each lose post-dominance
  and break G1 / the change-gate). Both gates are read-only (`declared_write_set: —`).
- No CI/CD gate; no security surface (labels carry no sensitivity) → no `security-reviewer` and no G2;
  no non-delegable acceptance check → no `main-session-gate`.
- No decision record: the fail-OPEN→fail-CLOSED direction is a determinate correctness fix mandated by
  the issue, not a value/standing call — CHANGELOG entry only, no ADR and no consent valve.
- Reviewer-class nodes (n2-review, n3-adversarial) are authored at the `reasoning` tier (the fail-open
  safety-fence flip is at the reasoning floor); per operator directive the executor DISPATCHES the
  reviewer subagents on the fable model, mapping reasoning-tier → fable at dispatch time. The implement
  node (n1) is `standard` (sonnet): it carries out a fully-specified change against this brief.

## Node Ledger

| id | status |
| --- | --- |
| n1-porcelain-cap | complete |
| n2-review | complete |
| n3-adversarial | complete |
| n4-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-porcelain-cap) | subagent-invoked | evidence-binding: n1-porcelain-cap 6e4a61ab3860 | |
| code-reviewer | subagent-invoked | evidence-binding: n2-review 4e26c7832b79 | |
| adversarial-verifier (n3-adversarial) | subagent-invoked | evidence-binding: n3-adversarial 5df54e41a01e | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize b1b8bcf42060 | |

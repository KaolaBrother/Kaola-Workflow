# Workflow Plan — issue #292

<!-- plan_hash: d8c26e91e4d163fd744a4d5bd6466072fd48c9502d01c7170e0eaa3a98b997c2 -->

## Meta
labels: enhancement, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| design | code-architect | — | — | 1 | sequence |
| build | tdd-guide | design | scripts/test-parallel-batch.js, scripts/kaola-workflow-parallel-batch.js, plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js | 1 | sequence |
| build-forge | implementer | build | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js | 1 | sequence |
| docs | implementer | build-forge | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md | 1 | sequence |
| code-review | code-reviewer | docs | — | 1 | sequence |
| adversarial-verify | adversarial-verifier | code-review | — | 1 | sequence |
| finalize | finalize | adversarial-verify | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
|----|--------|
| design | complete |
| build | complete |
| build-forge | complete |
| docs | complete |
| code-review | complete |
| adversarial-verify | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (design) | subagent-invoked | # Design Recipe — Issue #292: Complete write-role fanout batch joins (R3 gitChec | |

| tdd-guide (build) | subagent-invoked | # build node evidence — issue #292 (tdd-guide, RED→GREEN) | |
| implementer (build-forge) | subagent-invoked | # build-forge node evidence — issue #292 | |
| implementer (docs) | subagent-invoked | # docs node evidence — issue #292 | |
| code-reviewer | subagent-invoked | # code-review gate — issue #292 (code-reviewer) | |
| adversarial-verifier (adversarial-verify) | subagent-invoked | # adversarial-verify gate — issue #292 | |
| finalize (finalize) | subagent-invoked | # finalize node — issue #292 | |
## Plan Notes

Non-author free-text (outside the `plan_hash`, which covers only `## Meta` + `## Nodes`).
Resume-safe specification of issue #292 — completing the write-role `fanout(...)` batch joins in
`kaola-workflow-parallel-batch.js` (the #281 "honest partial", AC#3) and the R3 `gitCheckout`
ref-vs-path fix that #291 explicitly deferred. Two intertwined deliverables: (1) R3 — fix the io
shim `gitCheckout` so the join shells `git -C <parent> checkout <member-ref> -- <paths>` (a
tree/commit SHA in the ref slot, declared paths as pathspec, run from the PARENT worktree root);
(2) AC#3 in full — `open-batch` provisions one isolated node worktree per write-role member
(keyed projTag+node-id), each sealed against its existing per-node baseline, then an idempotent
path-scoped parent join that merges the disjoint paths with no attribution ambiguity, with host
isolated-worktree capability detection and a logged serialized fallback when worktrees are
unavailable. Four-edition parity.

### DAG shape rationale — LINEAR (the BUILD must NOT use fanout itself)

Per design note §10.2, the build that ACTIVATES write-role fanout joins must NOT itself run as a
`fanout(...)` batch — that would add blast radius and dogfood a half-built feature against itself.
The chain is strictly linear: `design → build → build-forge → docs → code-review →
adversarial-verify → finalize`.

The three WRITE nodes (`build`, `build-forge`, `docs`) cannot be made concurrent siblings even if
desired: disjointness is checked at top-level-directory granularity, and all three touch the
`plugins/` top-level (`build` → `scripts/` + `plugins/kaola-workflow/scripts/`; `build-forge` →
`plugins/kaola-workflow-{gitlab,gitea}/scripts/`; `docs` → `commands/` + `plugins/.../...`). Any
two of them would trip `not_disjoint`, so they serialize regardless. Verified at authoring: the
shared top-level is `plugins/` across all three. There is also a true dependency: `build-forge`
mechanically MIRRORS the fixed base into the forge ports, so the base edit must land first; `docs`
documents the activated behavior, so it follows the implementation.

The two read-only gates are SEQUENTIAL, not fanned out: `code-review` (code-reviewer)
post-dominates every code-producing node (`build`, `build-forge` — and `docs`, which lies on the
chain above it), satisfying G1; `adversarial-verify` (adversarial-verifier) post-dominates
`code-review`. A parallel gate path would let the claim reach the sink WITHOUT crossing
`code-review` and break post-dominance — the read-only-sibling efficiency heuristic does NOT apply
to gates that must post-dominate a code node. Mirrors the #281/#291 gate chain for this reason.

### Why a `code-architect` head (read-only, empty write set, model opus)

Unlike #291 (three already-specified surgical fixes, no architect needed), #292 has a GENUINE
design decision the build node should not improvise mid-implementation: how to capture a member
worktree's writes as a tree/commit SHA reachable from the parent checkout, where to provision the
per-member worktrees, how to detect host isolated-worktree capability, and how to keep the join
idempotent + crash-safe across the `joining` manifest state. The `design` node (read-only, empty
write set, model opus) writes the precise recipe to `kaola-workflow/issue-292/.cache/design.md`
for the downstream nodes to consume. It is read-only, so it produces no code and needs no gate
above it.

### Anchors handed to the `design` node (verbatim)

- Bug site: `scripts/kaola-workflow-parallel-batch.js` — `runJoin` (lines ~524-569) and the io
  shim `gitCheckout` in `main()` (lines ~667-674). The R3 bug is in the IO SHIM, not `runJoin`.
  Today `gitCheckout(m.worktreePath, paths)` shells
  `git -C <projectDir> checkout <worktreePath> -- <paths>` — three real bugs: (a) a filesystem
  PATH sits in the git-checkout TREE-ISH/REF positional; (b) `-C <projectDir>` (=
  `kaola-workflow/{project}`) is the wrong cwd — the checkout must land in the PARENT worktree root
  and the declared paths are repo-root-relative; (c) `worktreePath` is always `null` today
  (open-batch never provisions worktrees), so the whole path is dormant/inert.
- FALSE-GREEN trap: `runJoin` marks a write-role member `joined:true` even when `m.worktreePath`
  is falsy (the checkout is guarded by `if (m.worktreePath && ...)`). Asserting `state:'joined'`
  proves NOTHING. The test must drive REAL git and assert the parent worktree actually contains
  both members' files with correct content.
- Documented correct contract: `docs/investigations/2026-06-07-parallel-ready-set-execution-design.md`
  §2.4 / §6.2 / §10.3 and `commands/kaola-workflow-plan-run.md:220` —
  `git -C <parent> checkout <member-ref> -- <each declared path>`. The AC phrase "uses paths (not
  refs) correctly" DESCRIBES the bug (a path in the ref slot); it does NOT prescribe a filesystem
  copy.
- Ref source: `snapshotWorktree(root,tag)` (validator ~913: temp `GIT_INDEX_FILE` → `read-tree
  HEAD` → `add -A` → `write-tree`, captures untracked+tracked) and `anchorBase(root,ref,tree)`
  (~937: `commit-tree` + `update-ref`, gc-safe) are the natural primitives — BUT they are NOT in
  the validator's `module.exports`, so parallel-batch.js cannot `require()` them. The architect
  chooses: re-implement the small recipe locally in parallel-batch.js (~10 lines, body-identical
  across editions; keeps the write-set tight) — LEAN TOWARD THIS — or export them (touches the
  byte-synced validator across all editions = larger blast radius). Worktrees share `.git/objects`,
  so a tree/commit SHA produced via `git -C <member-wt> write-tree` is reachable from
  `git -C <parent> checkout`.
- Worktree provisioning: `open-batch` (a SCRIPT) MAY run `git worktree add` — that is NOT agent
  dispatch (only `Agent()` dispatch is forbidden to scripts). Today open-batch sets
  `worktreePath:null`. Activation = create one worktree per write-role member keyed
  (projTag,node-id), record the real `worktreePath`.

### `build` node (tdd-guide) — THE TEST IS THE HIGHEST-VALUE DELIVERABLE

Write-the-failing-test-FIRST, then implement R3 + worktree activation + ref-based idempotent join
in the byte-identical base PAIR. The test (`scripts/test-parallel-batch.js`) MUST: drive REAL git
through the CLI / `main()` or the real io `gitCheckout` (NOT a mock); have `open-batch` populate
real `worktreePath`s on TWO real member worktrees with DISJOINT writes; run
open-batch → seal → join; and ASSERT the PARENT worktree actually contains BOTH members' files
with correct content. Asserting `state:'joined'` or using a mock `gitCheckout` is a FALSE-GREEN and
fails the acceptance bar. Also cover the serialized fallback (capability absent → open members one
at a time, `log()` the degradation, join still correct). RED→GREEN per behavior is the tdd-guide
fit, NOT implementer.

Write set = EXACTLY 3 paths (≤ FILE_CEILING 6):
1. `scripts/test-parallel-batch.js` (TEST, single-source `scripts/` only — no plugins copy)
2. `scripts/kaola-workflow-parallel-batch.js` (PROD)
3. `plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js` (PROD, byte-identical pair)

The two PROD copies are registered in COMMON_SCRIPTS; `validate-script-sync.js` (run by `npm test`)
FAILS CLOSED if they drift, so every prod edit MUST be applied identically to BOTH copies in the
SAME node. This is the #1 constraint that prevents a mid-run Phase-6 barrier refusal / npm-test
failure.

### `build-forge` node (implementer) — MECHANICAL four-edition mirror

The forge ports are NOT in any byte-identical sync group (`validate-script-sync.js` covers only the
Claude↔Codex pair), so the cross-edition parity is a CORRECTNESS obligation, not a script-forced
one — but #291's lesson is that skipping the renamed forge ports (`kaola-{gitlab,gitea}-workflow-
parallel-batch.js`) is exactly what forces a mid-run plan repair. Mirror the EXACT surgical base
edits into both forge ports; function bodies are byte-identical to the fixed base except the renamed
`require()`/const block + the `// header` line. The forge test files do NOT test parallel-batch
(they matched only on unrelated `worktreePathFor`), so there is no forge unit harness — behavior
stays covered by the base-edition unit tests + edition walkthroughs/contracts in `npm test`.

non_tdd_reason: the forge ports have no unit-test harness for these functions; this is a mechanical
cross-edition mirror of edits already RED→GREEN-verified in the base edition. No natural failing
unit test exists for the port copies — they are verified by base unit tests + edition walkthroughs +
byte-identity of the logic lines. Write set = 2 paths:
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js`,
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js`.

### `docs` node (implementer) — serialized-fallback + log-degradation instruction

Add the serialized-fallback + `log()`-degradation instruction (and the activated isolated-worktree
join behavior) to the plan-run docs across all four editions. These are pure documentation/markdown
edits — no behavioral logic, no natural failing unit test — so implementer with a `non_tdd_reason`,
not tdd-guide. Docs-only writes do not trip G1 (a non-docs write on a WRITE role would). Over-
declaring is safe; the barrier only checks writes ⊆ declared set. Write set = 4 paths:
`commands/kaola-workflow-plan-run.md`,
`plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md`,
`plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md`,
`plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md`.

non_tdd_reason: documentation/markdown edits to plan-run command + skill files; no behavioral logic
and no natural failing unit test — verified by the edition contract/walkthrough checks in `npm test`
and by review.

### Contract count-bump check (no new files → likely no bump)

No new files are added, so `validate-*-contracts.js` / `test-*-workflow-scripts.js` should gain no
new script-count assertion. The architect / build nodes should VERIFY this (run `npm test` after the
edits); if a contract count assertion does fire, the offending contract file must be added to a
node's write set or the Phase-6 barrier refuses (the #250 lesson). Currently NOT in any write set
because no count change is expected.

### Verification reality (G1 gate, strong test node)

"Verified" = `node scripts/simulate-workflow-walkthrough.js` exits 0 ("Workflow walkthrough
simulation passed") AND `npm test` green. Load-bearing gates inside `npm test`:
`validate-script-sync.js` (byte-identity of the PROD pair), and `test-parallel-batch.js` (the REAL
git write-role-join + serialized-fallback behaviors). `code-review` (code-reviewer) post-dominates
the code-producing nodes (`build`, `build-forge`) — G1. `adversarial-verify` (adversarial-verifier,
read-only, empty write set) re-tests the finished claim (especially the false-green trap: confirm
the test asserts real parent-worktree file content, not `state:'joined'`) and feeds the sink.
`finalize` writes ONLY `CHANGELOG.md` (docs/state only — a non-docs write there trips
code-reviewer).

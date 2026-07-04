# Workflow Plan — issue-615

<!-- plan_hash: 1eea29a514acc1563469f95568d5e0dbcf7dded4b062493b2513ad980b9bd825 -->

## Meta
labels: bug, area:scripts
validation_command: npm test
speculative_open_policy: auto

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-architect | code-architect | — | — | 1 | sequence | reasoning |
| n2-fix | tdd-guide | n1-architect | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/test-adaptive-node.js, scripts/test-commit-node.js | 1 | sequence | reasoning |
| n3-review | code-reviewer | n2-fix | — | 1 | sequence | reasoning |
| n4-verify | adversarial-verifier | n3-review | — | 1 | sequence | reasoning |
| n5-docs | doc-updater | n4-verify | CHANGELOG.md, docs/decisions/D-615-01.md, docs/architecture.md | 1 | sequence | standard |
| n6-finalize | finalize | n5-docs | — | 1 | sequence | |

## Node Ledger

| id | status |
| --- | --- |
| n1-architect | complete |
| n2-fix | complete |
| n3-review | complete |
| n4-verify | complete |
| n5-docs | complete |
| n6-finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1-architect) | subagent-invoked | evidence-binding: n1-architect 41ee316ae6b6 | |

| tdd-guide (n2-fix) | subagent-invoked | evidence-binding: n2-fix b8038c9bcfab | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review eb8902b68c5f | |
| adversarial-verifier (n4-verify) | subagent-invoked | evidence-binding: n4-verify 184af5202cd6 | |
| doc-updater (n5-docs) | subagent-invoked | evidence-binding: n5-docs 3b4b9b138f79 | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize 8f823a6e7ab3 | |
## Plan Notes

### The bug (well-diagnosed; phenomenon reproduced, cause localized)
A plan-run that mixes **serial write nodes** (uncommitted accumulation in the shared
worktree — the canonical serial contract; commits are finalize-owned) with a
**lane-group co-open** in the same run reaches a state where the last-member group
close is structurally unsatisfiable. Two fences impose contradictory requirements on
the prior serial nodes' uncommitted work:
- **Parent-clean fence** (`kaola-workflow-plan-validator.js` `--parent-clean-check`,
  ~line 2576): `git status --porcelain -uall` on the parent flags any dirty path not in
  `barrierExemptPath` as production dirt — including the closed serial siblings'
  uncommitted files → `parent_dirty`. It does NOT treat an already-`complete` node's
  declared write set as attributed (unlike the `--barrier-check` branch-level
  `unattributed_change` arm at ~line 2846, which already knows "attributed iff in the
  narrow allowband OR covered by a `complete` node's declared write set").
- **Commit-based group barrier** (`--group-barrier --merge-commit M`, ~line 2464):
  measures `diff(base -> M)` where `base` is the legs' shared branch-point ref (parent
  HEAD at group open, which EXCLUDES uncommitted serial work). Committing the serial
  work to satisfy the parent-clean fence makes M carry it, so those paths land
  `outOfAllow` → `write_set_overflow`.

The asymmetry: the serial per-node barrier anchors at a **tree snapshot** of the dirty
worktree at open (accumulated dirt is invisible), while the commit-based group barrier
anchors at a **commit** (parent HEAD) that excludes the uncommitted serial work.

Structural manufacturer of the mixture: `runOpenReady` in
`kaola-workflow-adaptive-node.js` (~line 4266) forms a lane group whenever
`liveNodes.length === 0`, without checking whether the parent working tree carries
out-of-allowband production dirt from already-closed serial siblings. Recovery in the
incident required out-of-band `git reset --hard` + re-close + `git apply`.

### n1-architect (reasoning, read-only) — SELECT the fix direction
Confirm the root cause against the two fences + the `runOpenReady` group-formation gate,
then choose ONE fix among the issue's three directions and record it in evidence for
D-615-01. Weigh against the design theory (accuracy non-negotiable; then cheapest
sufficient, contract-preserving mechanism) and the escalation rule (do not unilaterally
alter the user-owned "commits are finalize-owned" serial contract):
1. **Prevent the mixture at scheduling** — before forming a lane group in `runOpenReady`,
   check whether the parent carries out-of-allowband production dirt (reuse the
   parent-clean classification / shell `--parent-clean-check`); if so, DEGRADE to a serial
   write open. Localized to `adaptive-node.js`; preserves the serial-commit contract;
   simplest sufficient mechanism; costs only parallelism in the specific mixed scenario.
2. **Teach both fences about closed siblings** — parent-clean fence + group barrier treat
   already-`complete` nodes' declared write sets as attributed allowband
   (`plan-validator.js`). Note the synthesizer octopus merge still needs a clean parent
   tree, so verify this path is actually mergeable.
3. **Re-anchor the group barrier baseline** at parent HEAD at group open
   (`plan-validator.js`) — verify it excludes prior serial work only when that work was
   committed before group open.
The declared write set on n2 spans BOTH candidate aggregators + both claude-chain test
files so the selected direction has room; it is intentionally bounded, not a directory
grant. Preferred direction (subsidiary finding: "refuse group formation while prior serial
writers' uncommitted work sits in the parent") is direction 1, but n1 makes the call.

### n2-fix (reasoning, tdd-guide) — RED reproduction first, then GREEN
- **RED**: a failing reproduction in `scripts/test-adaptive-node.js` encoding the mixed
  serial+lane-group deadlock — parent carries closed-serial uncommitted production dirt,
  a would-be lane group, and the last-member close currently reaching the jointly-
  unsatisfiable state. The falsification criterion IS the reproduction: do not converge on
  GREEN until the reproduction predicts + confirms the deadlock, then the fix dissolves it
  WITHOUT masking (do not merely suppress a fence). Add `scripts/test-commit-node.js`
  assertions only if the chosen direction changes a fence/barrier path.
- **GREEN**: implement the selected direction. Edit the CANONICAL script(s) only, then run
  `node scripts/edition-sync.js` (or `npm run sync:editions`) to regenerate the forge
  ports — the `plugins/*` port files are `@generated`; the write set declares all four
  editions of each touched aggregator so the regenerated bytes are attributed.
- **Cross-edition (#307)**: any touch of `adaptive-node.js` / `plan-validator.js` reaches
  the edition trees, so all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`
  chains must be green (run sequentially) — a green claude chain alone is insufficient
  evidence. `validation_command: npm test` runs the four with `&&`.

### n3-review (reasoning) + n4-verify (reasoning) — chained gates (G1 needs post-dominance)
`code-reviewer` (n3) must post-dominate the code-producing n2, so the two gates chain
(sibling gates would let n4's path bypass n3). n4 `adversarial-verifier` is the final
refutation gate before docs: RUN the reproduction and ask "root cause or symptom mask?",
and probe that the fix does not regress serial accumulation, the synthesizer clean-merge
path, or other mixed scenarios. If the reproduction cannot be made to fail-then-fix
cleanly, escalate via the consent-halt valve rather than shipping a masking patch.

### n5-docs (standard) — cite the decided fix, do not invent
CHANGELOG.md under [Unreleased]; write `docs/decisions/D-615-01.md` recording the selected
direction + rationale (D-615-01 is the next free number — no existing D-615 record). Update
`docs/architecture.md` ONLY if its running-set-scheduler section describes group-formation
preconditions and needs the new precondition; otherwise skip-with-reason. Cite the decision
from n1's evidence; do not fabricate schema/interface text.

### n6-finalize — the sink
Docs/state bookkeeping only (issue close + workflow state); no code writes.

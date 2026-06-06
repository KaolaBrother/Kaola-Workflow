# Workflow Plan — issue-264

<!-- plan_hash: b9b09c07648bc5c43c1dea26b8c373756107773f7fea821a323d68781667540e -->

Wire the **adaptive path into worktrees** and move newly-created workflow worktrees from the visible
sibling container (`<repo-parent>/<repo-name>.kw/<project>/`) into a repo-local hidden container
(`<repo-root>/.kw/worktrees/<project>/`), add cutover cleanup for the deprecated sibling container, a
`sink-merge.js` safety guard (refuse a merge with no non-workflow file changes beyond `origin/main`),
and an adaptive end-to-end test — applied across the GitHub + Codex-mirror (`plugins/kaola-workflow`)
+ GitLab + Gitea editions.

**Decomposition is a SERIALIZED `tdd-guide` chain, NOT an edition-fanout.** All four forge editions
live under the single top-level `plugins/` directory, so fanout siblings touching plugin copies would
share the `plugins/` lane and trip the validator's top-level-dir disjointness check (and the
concurrent-non-fanout antichain check). A linear chain has no antichain pair, so neither the
disjointness nor the concurrent-sibling overlap check ever fires. Each node edits ONE script family
(4 copies) or one cohesive doc/test cluster, each ≤ FILE_CEILING (6) declared paths, with each node
reaching the next so there is no concurrent write pair. One trailing `code-reviewer` (G1)
post-dominates the whole implement chain.

**Engine-script edit ordering (load-bearing — this run executes via the engine #264 modifies).** Each
executor per-node bracket shells `kaola-workflow-claim.js`, `kaola-workflow-next-action.js`, and
`kaola-workflow-commit-node.js` fresh, so an edit to those lands live for the editing node's own
commit bracket and every later bracket. Therefore the three per-bracket-shelled engine families are
ordered as the LAST implement nodes (`impl-commit-node` → `impl-next-action` → `impl-claim`,
immediately upstream of `code-reviewer`), minimizing the number of exposed brackets. Their edits MUST
be ADDITIVE and PRESERVE the repo-root / no-worktree fallback: the new `ACTIVE_WORKTREE_PATH`
resolution must resolve an empty/absent `worktree_path` (this very run has `worktree_path: ''`) to the
repo-root cwd — resolution must NOT be made mandatory — so later nodes' advance/commit brackets keep
working exactly as today. `sink-merge.js` is timing-safe at any chain position (only shelled at the
sink/Phase 6, after every node), and the orchestrator `.md` docs (`plan-run` command/skill, `adapt`,
`contractor`) are read once at session start and editing them mid-run does not reload the running
orchestrator — so those are ordered earlier and do not consume the "late" budget.

**Gates.** `plan` (code-architect) dominates the implement chain. `code-reviewer` (G1)
post-dominates every `tdd-guide` node (all are IMPLEMENT_ROLE → code-producing). A `security-reviewer`
node sits ON THE TRUNK between the implement chain and `finalize` (empty write set, so it
post-dominates every implement node): the issue changes security-relevant claim/branch/worktree
filesystem logic with `git worktree remove`/`prune` and `--archive`/`--export`/`--force` dirty-removal
semantics, so a security gate over that cleanup surface is warranted. Note: labels
(`enhancement, area:scripts, area:workflow-phases`) are NOT in SENSITIVE_LABELS and no declared
write-set path matches a Phase-5 SENSITIVE_PATTERN, so G2 is not validator-forced and the
security-reviewer is included by design, not by requirement; it changes neither the gate verdict nor
the auto-run/ask risk decision. A `doc-updater` runs before the unique `finalize` sink (README.md,
docs/api.md, and the init docs all change); the sink writes docs/state only (`CHANGELOG.md`). G1
post-dominance holds through `review → security → docs → finalize`: nothing downstream of `review`
produces code (security has no write set, docs writes `.md`/`docs/`, finalize writes `CHANGELOG.md` —
all docs-exempt).

## Meta

labels: enhancement, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
| --- | --- | --- | --- | --- | --- |
| explore | code-explorer | — | — | 1 | sequence |
| plan | code-architect | explore | — | 1 | sequence |
| impl-gitignore-sim | tdd-guide | plan | .gitignore, scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| impl-sink-guard | tdd-guide | impl-gitignore-sim | scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js | 1 | sequence |
| impl-plan-run | tdd-guide | impl-sink-guard | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md | 1 | sequence |
| impl-adapt-contractor | tdd-guide | impl-plan-run | commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md, agents/contractor.md | 1 | sequence |
| impl-edition-tests | tdd-guide | impl-adapt-contractor | plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 1 | sequence |
| impl-commit-node | tdd-guide | impl-edition-tests | scripts/kaola-workflow-commit-node.js, plugins/kaola-workflow/scripts/kaola-workflow-commit-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-commit-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-commit-node.js | 1 | sequence |
| impl-next-action | tdd-guide | impl-commit-node | scripts/kaola-workflow-next-action.js, plugins/kaola-workflow/scripts/kaola-workflow-next-action.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-next-action.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-next-action.js | 1 | sequence |
| impl-claim | tdd-guide | impl-next-action | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js | 1 | sequence |
| review | code-reviewer | impl-claim | — | 1 | sequence |
| security | security-reviewer | review | — | 1 | sequence |
| docs | doc-updater | security | README.md, docs/api.md, commands/workflow-init.md, plugins/kaola-workflow-gitlab/commands/workflow-init.md, plugins/kaola-workflow-gitea/commands/workflow-init.md | 1 | sequence |
| finalize | finalize | docs | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status | notes |
| --- | --- | --- |
| explore | complete | |
| plan | complete | |
| impl-gitignore-sim | complete | |
| impl-sink-guard | complete | |
| impl-plan-run | complete | |
| impl-adapt-contractor | complete | barrierCheck pass (exit 0); RED→GREEN confirmed (stale disclaimers grep 7→0 hits across 4 adapt copies, suite exit 0); contractor.md Method 5 added additively |
| impl-edition-tests | complete | barrierCheck pass (exit 0); RED→GREEN by design (D1): forge walkthroughs green, new tests take old-behavior/SKIP branch until impl-claim lands |
| impl-commit-node | n/a | path-agnostic; AC6 delivered by impl-plan-run (markdown); no safe/needed source change — see .cache/impl-commit-node.md |
| impl-next-action | n/a | path-agnostic plan-path reader (zero git/cwd); AC6 delivered by impl-plan-run (markdown); no safe/needed source change — see .cache/impl-next-action.md |
| impl-claim | complete | barrierCheck pass (exit 0); RED→GREEN: legacySiblingWorktreePathFor undefined→function exported; 4 claim.js copies byte-clean; 3 out-of-lane fixture fixes reverted for lane-clean barrier, orchestrator restoring + advancing next |
| review | complete | barrierCheck exit 0 (outOfAllow empty); gateVerify informational:true (pre-close expected); verdictCheck ok=true; verdict pass, findings_blocking 0 |
| security | complete | barrierCheck exit 0 (outOfAllow empty); gateVerify informational:true; verdictCheck ok=true; verdict pass, findings_blocking 0; post-dominated implement chain; reviewed worktree-cleanup/filesystem surface (destructive-op safety, path traversal, command-exec, suppression drop, AC7 guard); two non-blocking LOW/info findings recorded |
| docs | complete | barrierCheck exit 0 (outOfAllow empty); gateVerify ok:true; verdictCheck ok=true verdict null (doc-updater, no compliance row); 5 declared write-set files updated (README.md, docs/api.md, commands/workflow-init.md, gitlab+gitea workflow-init.md); source verified against claim.js+sink-merge.js+.gitignore; walkthrough exit 0 |
| finalize | complete | barrierCheck exit 0 outOfAllow empty; gateVerify ok:true; CHANGELOG.md [Unreleased] entry for issue #264 (worktrees/adaptive) confirmed |

## Required Agent Compliance

| node | status | evidence | notes |
| --- | --- | --- | --- |
| code-reviewer | complete | `.cache/review.md` — verdict:pass findings_blocking:0; G1 gate post-dominating full implement chain (explore→impl-claim); found + cleared one BLOCKING AC6 issue (Working-directory directive moved into prompts, all 6 sites ×3 forge files); fix re-verified against primary source + all 3 walkthroughs exit 0; barrierCheck exit:0 outOfAllow empty; gateVerify ok:false informational:true; verdictCheck ok:true | |
| security-reviewer | complete | `.cache/security.md` — verdict:pass findings_blocking:0; post-dominated the implement chain; reviewed worktree-cleanup/filesystem surface (destructive-op safety, path traversal, command-exec, suppression drop, AC7 guard); two non-blocking LOW/info notes recorded; barrierCheck exit:0 outOfAllow empty; verdictCheck ok=true | |

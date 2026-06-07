# Workflow Plan — issue-273

<!-- plan_hash: b7c3b432b22d1e7d7139b881808a94c6e8f3e8a0f8879a6ef4f9b0a0ad1ee7cb -->

Follow-up(#264) — two **independent** fixes: (1) `workflow-init` CLAUDE.md-template worktree-note
parity (the stale `<repo>.kw/<project>` sibling-path note must become the repo-local
`.kw/worktrees/<project>` path that #264 shipped), updated byte-identically across the 6-file
command↔SKILL forge group so `extractClaudeTemplate` stays green; and (2) the
`legacy-worktree-cleanup` dry-run/execute branch mismatch in `kaola-workflow-claim.js` (dry-run
advertises a `would_delete_branch` bucket the execute path never honors). The fix is applied across
all four editions (GitHub root + Codex mirror under `plugins/kaola-workflow`, plus the GitLab and
Gitea ports), with `docs/api.md` reconciled and tests adjusted.

**Decomposition is a SERIALIZED chain, NOT an edition-fanout.** All four forge editions live under
the single top-level `plugins/` directory, and item 1's worktree-note files (`commands/`, `plugins/`)
overlap item 2's claim/test surface on the same `plugins/` lane. So any concurrent fanout sibling
would share the `plugins/` top-level-dir lane and trip the validator's pairwise top-level-dir
disjointness check (and the inferred concurrent-sibling antichain overlap check). A linear chain has
no antichain pair, so neither check fires. Each implement node edits one cohesive cluster, each
≤ FILE_CEILING (6) declared paths, each reaching the next so there is no concurrent write pair.

**Write-set sizing (verified against the tree, not the issue prose).** Item 2's
`legacy-worktree-cleanup`/`would_delete_branch` logic is present in ALL FOUR claim copies and ALL
THREE test files (grep-confirmed), so item 2 cannot fit one node: root+Codex `kaola-workflow-claim.js`
are byte-identical (must ride together) + the walkthrough test = 3 files (`impl-legacy-root`); the
GitLab + Gitea claim ports + their two edition test files = 4 files (`impl-legacy-editions`). Item 1
is exactly the indivisible 6-file command↔SKILL group (`impl-init-parity`); it cannot be split
because the `<!-- KW-CLAUDE-TEMPLATE-START/END -->` byte-identity contract fails on a half-edit (this
is precisely why #264 deferred it — its `docs` node had no room for the 3 paired SKILL.md files).
`docs/api.md` is routed to the `doc-updater` node (folding it into any implement node would bust the
ceiling).

**Impl ordering is timing-safe (NOT load-bearing, unlike #264).** `legacy-worktree-cleanup` is not
shelled in any per-node executor bracket (`claim startup`/`next-action`/`commit-node` are the hot
paths, not `legacy-worktree-cleanup`), so editing it lands inertly and the order of the three
implement nodes is free. The two item-2 nodes use `tdd-guide` (item 2 is a *bug*; CLAUDE.md mandates
write-the-failing-test-first for bugs, and the parent #264 used `tdd-guide` over this same claim.js
surface). Item 1 is a pure byte-identical docs/template edit with no behavioral test, so it uses
`implementer`.

**Gates.** `plan` (code-architect) dominates the implement chain. `code-reviewer` (G1)
post-dominates every implement node (all three are IMPLEMENT_ROLE → code-producing); the linear
chain makes post-dominance trivial. No `security-reviewer` (G2): the labels
(`enhancement, area:scripts, area:workflow-phases`) are NOT in SENSITIVE_LABELS and no declared
write-set path matches a Phase-5 SENSITIVE_PATTERN, so G2 is not forced. Unlike #264 — which
*introduced* the destructive worktree-cleanup machinery and included a security node by design — #273
only touches that surface's periphery (drop a vestigial output bucket, or add a `--keep-branch`-gated
deletion); branch-ref deletion is a runtime git op (not a sensitive write path, so it cannot trip the
H1 sensitivity teeth) and its correctness is a `code-reviewer` concern. If the code-architect chooses
the heavier option (b) and genuinely expands the surface, a security node is reversibly addable to the
frozen plan via the `--freeze` repair recipe. A `doc-updater` runs before the unique `finalize` sink
(`docs/api.md` advisory note changes); the sink writes docs/state only (`CHANGELOG.md`). G1
post-dominance holds through `review → docs → finalize`: nothing downstream of `review` produces code
(docs writes `docs/api.md`, finalize writes `CHANGELOG.md` — both docs-exempt).

## Meta

labels: enhancement, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
| --- | --- | --- | --- | --- | --- |
| explore | code-explorer | — | — | 1 | sequence |
| plan | code-architect | explore | — | 1 | sequence |
| impl-legacy-root | tdd-guide | plan | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| impl-legacy-editions | tdd-guide | impl-legacy-root | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 1 | sequence |
| impl-init-parity | implementer | impl-legacy-editions | commands/workflow-init.md, plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitlab/commands/workflow-init.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitea/commands/workflow-init.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md | 1 | sequence |
| review | code-reviewer | impl-init-parity | — | 1 | sequence |
| docs | doc-updater | review | docs/api.md | 1 | sequence |
| finalize | finalize | docs | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status | notes |
| --- | --- | --- |
| explore | complete | |
| plan | complete | |
| impl-legacy-root | complete | |
| impl-legacy-editions | complete | |
| impl-init-parity | complete | |
| review | complete | |
| docs | complete | |
| finalize | complete | |

## Required Agent Compliance

| node | role | barrier_exit | overall_ok | recorded_at |
| --- | --- | --- | --- | --- |
| explore | code-explorer | 0 | true | 2026-06-07 |
| plan | code-architect | 0 | true | 2026-06-07 |
| impl-legacy-root | tdd-guide | 0 | true | 2026-06-07 |
| impl-legacy-editions | tdd-guide | 0 | true | 2026-06-07 |
| impl-init-parity | implementer | 0 | true | 2026-06-07 |
| review | code-reviewer | 0 | true | 2026-06-07 |
| docs | doc-updater | 0 | true | 2026-06-07 |
| finalize | finalize | 0 | true | 2026-06-07 |

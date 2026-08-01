# #899 — say plainly that `--sink` does not check for an implementation-free branch, so the orchestrator must

Branch `workflow/issue-899`, worktree `.kw/worktrees/issue-899`. The premise was SETTLED BY
CONSTRUCTION before this run was claimed; the measurement is posted as a comment on #899. Owner ruled
**no guard** — the orchestrator already owns whether the branch ends up right, and it knows whether its
own run produced implementation. The remedy is wording only.

What was measured, so nobody re-derives it: legacy path + implementation-free branch + online →
exit 1, `result: report`, `reason: no_implementation_changes`, nothing merged or pushed, issue left
open. Same fixture through `--sink` → exit 0, `status: sinked`, local AND remote main advanced, issue
CLOSED (`gh` calls `close:` and `label-removed:`). Reproduced on two shapes (archive-only diff and a
live `kaola-workflow/<project>/**` folder). `assertBranchHasNonWorkflowChanges` called in-process
against the very tree `--sink` published DID return `no_implementation_changes` — the guard is never
consulted on that path, rather than being satisfied by it. Specificity control: the same fixture plus
one real file makes the guard correctly return no finding. Second finding: on the legacy path the
guard is skipped outright under `KAOLA_WORKFLOW_OFFLINE=1`.

---

item: add the wording to the finalize routing SKELETON — `templates/routing/finalize.skeleton.md`, in
the existing `<!-- PIN: sink-reports-orchestrator-owns -->` block at `:405`, which is exactly the
promise this gap breaks ("it tells you what it found … then you are accountable"). The rule to state,
in that section's own voice and carrying NO provenance (no issue number, no history — CLAUDE.md
forbids provenance in agent-facing prompts): the sink does not check that the branch carries
implementation; on `--sink` nothing reports an implementation-free branch and it will merge, push and
close; you know whether your run produced work, so confirm it before you sink. NEVER hand-edit a
rendered surface — edit the skeleton and regenerate, then `generate-routing-surfaces.js --check` must
report all 18 byte-matching. This reaches all four runtimes, so say so.
status: done
dispatched: self, in the worktree `.kw/worktrees/issue-899` — the wording IS the decision here, so
keeping it inline rather than dispatching four lines of prose. Skeleton edit then regenerate.
result: Added to the `sink-reports-orchestrator-owns` PIN in
`templates/routing/finalize.skeleton.md`, immediately after "Reporting is not merging anyway" — the
paragraph whose promise this gap breaks. The wording states that the sink does NOT check the branch
carries implementation, that on `--sink` nothing reports a bookkeeping-only branch and it will merge,
push and close, that **silence there is not a clearance**, and that the confirmation belongs BEFORE the
sink because afterwards the mainline is published and the issue closed. Carries no provenance —
verified by grep that no issue number appears in the skeleton.
Regenerated: `--write` rendered 18 surfaces, `--check` reports all 18 byte-matching, EXIT 0 both.
7 files changed — the skeleton plus its 6 rendered finalize surfaces (root `commands/`, and
command+skill under each of the gitea/gitlab plugins, plus the github plugin SKILL). The opencode and
kimi editions render from the same registry at install time, so the wording reaches all four runtimes
without a separate edit.

item: dock and finish — CHANGELOG `[Unreleased]`, and consider whether `docs/api.md`'s pre-merge guard
section should also record that no `--sink` equivalent exists (that file is in `SELF_HOST_TEST_CONSUMED`
alongside `README.md` and `CHANGELOG.md`, so editing it stales the receipt — write ALL prose BEFORE the
chain run, not after). Then `run-chains.js --project issue-899`, finalize, sink. A routing-surface diff
touches the generated command/skill trees, so expect the full four-chain demand; on this box export
`KAOLA_RUN_CHAINS_CONCURRENCY=serial`.
status: todo
dispatched:
result:

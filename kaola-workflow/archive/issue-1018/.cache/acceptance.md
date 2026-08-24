# Acceptance — Issue #1018 / PR #1019

verdict: PASS

## Issue obligations

1. **Canonical heavy tier:** `agents/planner.md` and `agents/code-architect.md` carry `model: fable`; resolver/frontmatter and standard/reasoning/heavy roster parity are covered by `test-agent-model-resolver.js`, the installer rendering suite, the Codex walkthrough, and all three contract validators.
2. **Codex contract and bounded escalation:** canonical next/finalize skeletons render Luna/max, Sol/medium, and Sol/high with exactly one reviewer heavy carve-out. Claude command runtime makes its bounded escalation executable with the sole explicit `model="fable"` installed-profile exception. `test-route-reachability.js` passed 557 assertions after first producing the intended RED.
3. **Grok live proof:** the isolated Grok CLI 1.0.5 probe dispatched a generated planner with `effort: xhigh`; child session `01a033ca-9559-73a1-88dc-06ee8726019c` recorded `reasoning_effort: xhigh` and returned `HEAVY_CHILD_OK`. Evidence: `.cache/live-grok.md`.
4. **Cursor binding:** generated planner/code-architect frontmatter uses raw `grok-4.6[effort=xhigh]`; Cursor suite passed 856 assertions across GitHub/GitLab/Gitea generated trees.
5. **OpenCode and Kimi divergence:** OpenCode keeps `fable` in its reasoning override class and passed 684 assertions; Kimi remains session-inherited and passed 647 assertions.
6. **Escalation boundary:** Claude/Codex carry the bounded reviewer heavy rule. Generated Grok, Cursor, OpenCode, and Kimi command surfaces omit dynamic escalation and keep their runtime-native static/inherited behavior; no heavy-variant agents were added.
7. **Reviewer scope clamp:** all reviewer dispatch guidance requires the dispatched surface and acceptance; generated reviewer bodies anchor findings to that surface and demote out-of-scope material to observations. Generated profile hashes were re-stamped by the existing path.
8. **Test custody and full walkthrough:** test changes were authored by `tdd-guide`; production changes by `implementer`. The unsharded walkthrough passed 186/186 scenarios with spawn census 2173. The plugin walkthrough and three contract validators passed.
9. **Final gates:** all four additive edition suites passed. The final candidate-bound self-host receipt is `all-four` / `edition_coupling`; Claude, Codex, GitLab, and Gitea each have `exitCode: 0`, one attempt, no accepted red or waiver.
10. **Documentation:** README, docs index, API, architecture, conventions, all four runtime guides, ADR 0019, and `[Unreleased]` changelog are docked. `.cache/doc-docking.md` verdict is `DOCKED`.
11. **workflow-init example:** the generated consumer guidance names `planner (heavy-reasoning tier)` while preserving the runtime-neutral rule; routing-surface generation reports all 18 surfaces byte-matching their skeletons.

## Final checks

- Validation receipt: green and complete for all four self-host chains.
- Additive runtime suites: all green on the final candidate.
- Type/lint/build: this repository declares no separate formal typecheck/lint/build pipeline; its required Node validators, shell syntax checks, walkthrough, and edition chains are included in the green receipt.
- Review findings: the blocking walkthrough roster defect, missing cross-copy heavy parity, Claude command-runtime escalation gap, stale upgrade fixture, and documentation drift were fixed. No unresolved critical or high finding remains.
- Debug residue: added-line scan found no `debugger`, `console.log`, `TODO`, `FIXME`, or `print(` statement.
- Diff hygiene: `git diff --check` passed.

Acceptance is satisfied with no deferred implementation, unresolved decision, or follow-up issue.

## 2026-07-15 implementation evidence: review gate found a real re-plan boundary

The #693/#696/#697/#698 bundle reached code review and was correctly rejected with six concrete schema-2 findings. The failed transaction is durable as `n8-code-review:1`; direct repair of the semantic engine owner returned `repair_requires_replan` with producer slice n2–n7 and zero mutation.

This run produced two separate mechanism findings:

- #439 reopened: a gate opened through `open-next` prevents later `open-ready` from admitting an otherwise eligible speculative read under `speculative_open_policy:auto`; attainable DAG shape depends on lifecycle entrypoint.
- #701 filed: semantic finding ownership is disconnected from graph-maximal repair admissibility; a documentation tail can be structurally maximal while the real code owner is unrecoverable in-plan.

Neither finding justifies bypassing the safety barriers. #699 is now claimed in an isolated adaptive worktree to implement the explicit v1-parent→v2-child compatibility transaction. Its planner-authored frozen DAG will build the recovery machinery without mutating the preserved bundle. Once #699 is finalized, its source implementation will resume the original claim through a planner-authored replacement epoch; the global Codex plugin refresh remains after the recovered bundle is finalized.

Current work-package checklist remains open until the recovered bundle passes code/security/adversarial gates and the final installed-runtime qualification:

- [ ] #693
- [ ] #696
- [ ] #697
- [ ] #698
- [ ] #699

Evidence links: #699 live fixture comment, #439 regression comment, and #701 acceptance contract.

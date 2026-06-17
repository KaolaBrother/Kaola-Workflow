evidence-binding: n5-docs c4eac7f645b8

Documented three fixes in the declared write set:

- CHANGELOG.md: added three `### Fixed` entries under `## [Unreleased]`, one per issue (#508, #517, #518), each citing the script files changed and the decision record.
- docs/decisions/D-508-01.md: new record — bundle finalize `close_pending` vs `partial` design choice; why pre-push all-open state maps to `close_pending` (mirrors single-issue semantics) rather than `partial`; close-before-push invariant preserved; D-508-01 number was free.
- docs/decisions/D-517-01.md: new record — post-push keep-open probe+reopen as the deterministic auto-close guarantee; why a post-`push_main` probe is the correct fix (server-side trigger, outside workflow control); `reopened_after_autoclose` receipt value; D-517-01 number was free.
- docs/decisions/D-518-01.md: new record — cycle-identity binding via `branch_head`; how the new guard composes with the preserved #484 ancestry backstop; ancestor-or-equal semantics for legitimate mid-cycle resume; D-518-01 number was free.
- docs/workflow-state-contract.md: extended the closure receipt paragraph with a "Sink-receipt schema extensions (#517, #518)" sub-section documenting `branch_head` (cycle-identity binding) and `remote_issue_closed: "reopened_after_autoclose"` (post-push keep-open verification), matching the existing style.

## doc-updater summary — issue #269

**Date:** 2026-06-06

### Task
Add CHANGELOG.md entry under `[Unreleased]` for issue #269 (selector routing orchestrator wiring).

### Changes made

**`/Users/ylpromax5/Workspace/Kaola-Workflow/CHANGELOG.md`**
- Added `### Fixed` subsection at the top of the `[Unreleased]` block with the following entry:
  - adaptive: wire contractor to consume `selectorCheck.armsToNa` and write `n/a` ledger rows for unselected arms after a `selector_source` node completes; add halt protocol when `selectorCheck.ok === false`; add "Selector routing — orchestrator contract" section to `docs/api.md`; update all four edition mirrors (GitHub/Codex/Gitea/GitLab) (#269)

### Checklist status (from task)
- [x] README.md — no change needed (internal contractor prompt wiring, no user-facing feature)
- [x] API docs (`docs/api.md`) — already updated (new "Selector routing — orchestrator contract" section added)
- [x] CHANGELOG.md — entry added under `[Unreleased]` (this task)
- [x] Architecture docs — no change needed (no structural change)
- [x] .env.example — no new env vars
- [x] Inline comments — no public interface changes

### Verification
Entry read back from file at lines 5-6 of CHANGELOG.md — matches the specified text exactly.

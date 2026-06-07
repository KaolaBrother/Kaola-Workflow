# Node finalize (sink) — evidence

Orchestrator-owned finalize (no finalize agent).

## CHANGELOG
- `CHANGELOG.md` [Unreleased] → Fixed: #260 in-place (no-worktree) startup now creates the recorded feature branch (Option A), `base_branch` in ## Sink, discard restores base + deletes feature branch, dirty-tree typed refusal, detached/no-history record-only; ×4 editions; docs + regression tests; known-limitation note (worktree-provision-failure no-branch gap + watch-pr symmetric cleanup deferred).

## Whole-plan gates (worktree, frozen plan)
- `--barrier-check` → `{"result":"pass","errors":[],"sensitiveHits":[],"outOfAllow":[]}` exit 0
- `--gate-verify` → `{"ok":true,"unsatisfied":[]}` exit 0
- `--verdict-check` → `{"ok":true,"failures":[],"checked":["review"]}` exit 0

## Full npm test (×4 editions) — exit 0
- claude: validate-script-sync `OK: 15 common scripts and 5 byte-identical file group in sync`; walkthrough passed
- codex: contract validation passed; #238/#239 coverage PASSED; walkthrough passed
- gitlab: contract passed; testGitlabAdaptive + suite PASSED; both walkthroughs passed
- gitea: contract passed; testGiteaAdaptive + suite PASSED; both walkthroughs passed

## Remaining (pending user confirmation — outward-facing)
- sink-merge workflow/issue-260 → main + close #260: PAUSED for explicit user approval (hard-to-reverse).

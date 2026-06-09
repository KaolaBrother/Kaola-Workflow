# installer node (tdd-guide) — AC1 managed .codex/hooks.json

ROLE: tdd-guide. RED→GREEN via ephemeral harness (/tmp/installer-hooks-test.sh); durable write-set has no test file (persistent tests land in the `tests` node).

## RED (before updateHooks existed)
```
=== Edition: github ===
  FAIL: github: hooks.json created (file missing: /tmp/.../.codex/hooks.json)
EXIT: 1
```
The installer produced no .codex/hooks.json — assertion failed on first check.

## GREEN (after implementing updateHooks() + 3 config/hooks.json templates)
```
=== Results: 12 passed, 0 failed ===  EXIT 0
```
12 assertions across all 3 editions: hooks.json created; parses valid (4 events SessionStart/PreToolUse/PostToolUse/SubagentStart, each with a `kaola-workflow:` id entry); SessionStart/compact command references the edition compact-resume script; `/hooks` trust line in stdout; idempotency (exactly one managed entry per event on re-run, user entries + unrelated events preserved, no literal `__KW_PLUGIN_ROOT__` token left).

## Write-set (6 files, all in declared lane)
- plugins/kaola-workflow/scripts/install-codex-agent-profiles.js (M, +updateHooks())
- plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js (M, byte-identical)
- plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js (M, byte-identical)
- plugins/kaola-workflow/config/hooks.json (NEW, compact→kaola-workflow-codex-compact-resume.js)
- plugins/kaola-workflow-gitlab/config/hooks.json (NEW, compact→kaola-gitlab-workflow-codex-compact-resume.js)
- plugins/kaola-workflow-gitea/config/hooks.json (NEW, compact→kaola-gitea-workflow-codex-compact-resume.js)

## Verified post-hoc (orchestrator)
- All 3 install-codex-agent-profiles.js byte-identical (diff clean).
- All 3 compact commands reference the correct edition script (confirmed by reading the JSON).
- updateHooks(): split/join replaces ALL 4 __KW_PLUGIN_ROOT__ occurrences; user entries without an id preserved (filter guards undefined id); malformed pre-existing hooks.json treated as empty WARN-first (never throws); phantom-advisor description reworded so writing the template does not trip the phantom-advisor hook.

## Batch-recovery note (orchestrator)
This node ran inside a parallel batch (installer ∥ hookports). The dispatched subagents wrote to the issue-284 parent worktree (ACTIVE_WORKTREE_PATH) instead of their isolated batch worktrees — nested-worktree isolation is non-functional in this harness (subagents ignore the prompt Working-directory line). Both members' changes are co-located in the parent worktree, verified correct and DISJOINT; `node scripts/validate-script-sync.js` → exit 0 in the combined state. The changed-file set partitions exactly into the two declared lanes with nothing extra. Per-node barrier validation is backstopped by the finalize whole-plan --barrier-check (union of all write-sets) + validate-script-sync + the tests node.

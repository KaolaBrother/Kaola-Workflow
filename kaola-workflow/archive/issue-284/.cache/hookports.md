# hookports node (implementer) — port 2 missing github-codex hooks + sync-register + uninstall

ROLE: implementer (non-test-first).

non_tdd_reason: Scaffolding/boilerplate + glue/wiring. The two .sh files are byte-identical copies with no behavioral logic; bash hook scripts are invisible to npm test (it never invokes them). The byte-identical constraint is verified by validate-script-sync.js (a cross-edition byte-identity gate run under npm test), not by a behavioral unit test. The symmetric uninstall.sh cleanup is config-glue.

## Verification — build-green / regression-green on the sync gate
RED (phantom-advisor registered in the group but the github-codex copy absent):
```
node scripts/validate-script-sync.js
→ Missing files: plugins/kaola-workflow/hooks/kaola-workflow-phantom-advisor.sh
EXIT: 1
```
GREEN (byte-identical copies present + both groups registered):
```
node scripts/validate-script-sync.js
→ OK: 18 common scripts and 7 byte-identical file group in sync.
EXIT: 0
```

## Write-set (4 files, all in declared lane)
- plugins/kaola-workflow/hooks/kaola-workflow-phantom-advisor.sh (NEW, byte-identical copy of hooks/..., 0755)
- plugins/kaola-workflow/hooks/kaola-workflow-subagent-dispatch-log.sh (NEW, byte-identical copy, 0755)
- scripts/validate-script-sync.js (M, phantom-advisor + subagent-dispatch-log groups extended 3→4 trees, matching the pre-commit group shape)
- uninstall.sh (M, project-local $PWD/.codex/hooks.json managed-entry cleanup added)

## Verified post-hoc (orchestrator)
- cmp plugins/kaola-workflow/hooks/kaola-workflow-phantom-advisor.sh hooks/... → identical (exit 0).
- cmp plugins/kaola-workflow/hooks/kaola-workflow-subagent-dispatch-log.sh hooks/... → identical (exit 0).
- exec bit 0755 on both new .sh.
- bash -n on both .sh + uninstall.sh → syntax OK.
- uninstall cleanup uses dict-keyed-by-event iteration + the existing is_managed predicate (id startswith kaola-workflow: OR command contains kaola-workflow), mirroring the ~/.claude/settings.json block (not a flat-list no-op).

## Batch-recovery note (orchestrator)
Ran inside a parallel batch (installer ∥ hookports); subagent writes leaked to the parent worktree (harness nested-worktree limitation). Changes verified correct + disjoint from installer's lane; validate-script-sync exit 0 in combined state. Backstopped by finalize whole-plan --barrier-check (union).

# Node finalize (sink) — issue #289

Phase-6 finalize evidence (the finalize node IS the Phase-6 sink).

## Barrier gates (all pass)
--resume-check=0, --gate-verify=0 (review post-dominates implement), --barrier-check=0 (no sensitive
hits, no out-of-allow), --verdict-check=0 (review verdict: pass, findings_blocking: 0).

## Final validation
npm test (full, all 4 editions) exit 0 — green across github/codex/gitlab/gitea incl.
validate-vendored-agents, validate-script-sync 4-edition byte-identity, gitlab/gitea contract validators.
node scripts/simulate-workflow-walkthrough.js => "Workflow walkthrough simulation passed".

## Acceptance (issue #289 AC)
- A mis-cased scope/action/status finding (In_Scope/Fix/Open) is now treated identically to lowercase
  and BLOCKS the gate: unresolvedInScopeFixes(...).length === 1. PASS.
- 4 schema copies byte-identical (md5 6206e9bb89cb9bb2c268c8fbc8d49503); npm test green ×4 editions. PASS.

## Write (declared write-set: CHANGELOG.md)
CHANGELOG.md [Unreleased] Fixed entry for #289 added.

## Documentation docking
DOCKED (.cache/doc-docking.md). doc-updater skipped (no public-interface impact beyond CHANGELOG).

## Closure scan
No deferred items / conflicts / partial work / user-decision items. Review: 0 findings. Closes the
#279 out-of-scope follow-up. No advisor/user gate required.

verdict: pass
findings_blocking: 0

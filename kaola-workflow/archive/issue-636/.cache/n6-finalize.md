evidence-binding: n6-finalize f1743e979744
node: n6-finalize
role: finalize (main-session-direct sink)
compliance: main-session-direct

## Finalize — issue-636 (cross-runtime dispatch-pin single-sourcing; completes #627 fix#2)

First build off the 2026-07-08 routing-generation-seam shaping design.

### Script-enforced barrier (4 gates, headSha 4319be3d)
- --resume-check: pass
- --gate-verify: pass (n3-review + n4-adversary post-dominate the code node n2-fence, both complete)
- --barrier-check: pass (0 errors, 0 unattributed; the 12 impl files attributed to n2-fence, D-636-01 to n5-docs, CHANGELOG to n6)
- --verdict-check: pass (n3-review verdict:pass + n4-adversary verdict:pass — n4 is a CHANGE-gate, fully covered)

### Chain-receipt gate (self-host, UNWAIVED)
- kaola-workflow-run-chains.js --project issue-636: claude/codex/gitlab/gitea ALL exit 0, accepted_red=false.
- NO waiver (#635 fixed). headSha 4319be3d == HEAD. --finalize-check: pass.

### Run-gap sweep
- gap-sweep run-gaps.json sweptClasses: [] (empty); --check clean (exit 0).
- No in_run_repair (both gates passed first-try, no reopen), no deferred_red_chain (unwaived), no manual class.

### Two real defects caught before shipping (design de-risking)
1. #611-fork four-chain-red hole — the shaping adversary proved the first-draft map omitted the #611-fork
   SKILL-only shrink → all four chains red. n1-plan's verified map + n2-fence applied it in all four validators;
   n3-review + n4-adversary independently confirmed no command-surface #611-fork assertion survives.
2. Forge two-splice drift — n1-plan caught that the always-live base-dispatch sentence is fused into the
   Codex-dispatch block start on the two forge commands (design doc glossed it); n2-fence handled per-file;
   n4-adversary confirmed the fused sentence survived on gitlab AND gitea.

### Deliverables
- 12 impl files fenced + relocated; docs/decisions/D-636-01.md; CHANGELOG [Unreleased] ### Fixed #636 entry.
- doc-docking.md: clean. finalization-summary.md: written.

### Implementation commit
- 4319be3d fix(routing): #636 single-source cross-runtime dispatch pins (completes #627 fix#2) — 14 files.

goal_check: satisfied (KAOLA_GOAL set)
verdict: pass
findings_blocking: 0

evidence-binding: n4-verify 184af5202cd6
verdict: pass
findings_blocking: 0

## Claim Under Test
"The fix for issue #615 (plan-run: mixed serial + lane-group run makes the last-member
group close unsatisfiable — parent_dirty vs write_set_overflow) is correct, complete, and
regression-free." Scoped surface: runOpenReady's two lane-group formation sites in
scripts/kaola-workflow-adaptive-node.js (+3 forge ports), gated by parentCarriesProductionDirt.

## Disproof Attempt (could not break it)
1. Reproduction is genuine, not a strawman. Copied scripts/ to scratchpad, reverted BOTH #615
   guards, ran open-ready on the #615 fixture: pre-fix opens BOTH pA,pB forming lane_group
   lg-pA-pB; with the fix it degrades to single pA (no lane_group). --parent-clean-check refuses
   parent_dirty on the exact serial file (src/serial_a.js); the last-member close runs that
   identical fence at :5047 (Horn A). Fix acts at FORMATION time, not by masking a later failure.
2. Degrade completes (not masking). Drove a REAL close over the dirty parent:
   close-and-open-next --node-id pA => result:ok, pA=complete, opened pB, NO parent_dirty/overflow.
   Per-node baseline (--record-base, validator :1957-1983) is read-tree HEAD + add -A + write-tree,
   so pre-existing dirt is on both sides of the barrier diff -> invisible. Deadlock -> correct
   serial completion.
3. No third formation site. tryFormLaneGroup (sole call :4336, guarded) and
   selectSpeculativeWriteGroup (sole call :4286, guarded by :4271 else-if). groupForm set only
   inside runOpenReady. reconcile-running-set only rolls an EXISTING opening txn / reads
   running.lane_group from disk — never forms a group. No open-batch subcommand exists.
4. No TOCTOU / fence gap. Fence = live git status --porcelain --untracked-files=all (:2604), not
   cached. open-ready is in SPLIT_GUARDED_SUBCOMMANDS -> acquireProjectLock O_EXCL (:5924); fence +
   formation run in one synchronous locked call. Legs live under gitignored .kw/ -> never dirty the
   fence. Race structurally impossible.
5. No regression. D437-OPEN-READY-DEFAULT-COOPEN (clean pure-parallel co-opens [A,B]) and T597-3b
   (clean-parent speculative opens) pass in the 1413-assertion suite. Allowband dirt correctly does
   NOT degrade: --parent-clean-check exempts docs/note.md -> group STILL forms [pA,pB]; synthesizeLevel
   octopus-merges leg branches only (no add -A at root) so parent dirt never enters M -> group barrier
   cannot overflow. No over-block, no under-block. reconcile untouched by the fix.
6. Cross-edition. canonical == plugins/kaola-workflow byte-identical; gitlab + gitea ports carry both
   guards at the same lines. Full four-chain npm test exit 0 (claude/codex/gitlab/gitea walkthroughs +
   contract validations incl. testGitlabSinkRefusesLingeringLaneGroup). The api.github.com TLS-timeout
   lines are deliberate fail-closed negative-path tests that PASSED.
7. New scenarios attempted, none broke: 3+-way group over dirty parent (parent-level fence -> same
   degrade), repair-reopened serial dirt (fence is git-status-based, source-agnostic), nested
   speculative bets (all excluded on dirt), allowband serial dirt (completes fine, correct non-degrade).

Non-blocking nit (not a refutation): comments at :3705/:4324 point the close fence at "(:4994)" and
":4286 branch"; the actual --parent-clean-check in the last-member close is at :5047. Stale
line-number pointers in comments (navigational drift only); zero functional impact.

## Verdict
NOT-REFUTED (confidence: high) — the fix is correct (root cause dissolved at formation time),
complete (degrade path drive-tested to completion; both formation sites + all 4 editions covered),
and regression-free (clean-parent + allowband paths preserved; four chains green). I could not
construct any input/state/path that re-reaches the parent_dirty vs write_set_overflow deadlock.

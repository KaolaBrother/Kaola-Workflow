evidence-binding: n3-adversary 81dab05a1c8d
verdict: pass
findings_blocking: 0
upstream_read: n1-reap-sweep e725d95472fb

finding: id=R8 scope=in_scope action=fix status=resolved severity=medium fix_role=none rationale=unreadable-state-file keep gap closed by keep-pass (c); re-attacked across the full lifecycle with real CLI flows, no reachable over-reap
finding: id=R10 scope=pre_existing action=follow_up status=deferred filed=#691 severity=low fix_role=none rationale=chmod-000 project DIRECTORY variant — self-inflicted, out-of-band, filed with the exact statSync-ENOENT fix
finding: id=R11 scope=out_of_scope action=document status=open severity=low fix_role=none rationale=archive-reap sanitize-collision over-reap requires two hand-crafted aliasing --project names (issue.500 vs issue_500) that no shipped generator produces; the pre-existing ref keying already cross-breaks such runs before the reap; sweep side is collision-safe (keep-only). Document the limitation in D-686-01; candidate follow-up: refuse claim --project names that sanitize-collide with a live folder.

# Adversarial gate — #686 reap/sweep FINAL pass (real-flow reachability)

## Surface 1 — lifecycle states with no keep signal: CLOSED (real CLI drives)
Real startup/claim/--record-base drives: P0 post-claim pre-plan (folder+state, no refs) — nothing to reap. P1
post-record-base SEQUENCE run (NO running-set.json), swept from main AND worktree root → refs KEPT (signal (a)
alone). Status matrix stamped in BOTH copies (active/in_progress/planning/paused/halted/escalated/consent_halt/
unknown/Active/custom/empty) → ALL kept; readActiveFolders excludes only released/closed/abandoned and the only
status writers are writeState ('active') + stampTerminalState (closed/abandoned, INSIDE archiveProjectDir) —
no live-reachable status is excluded. 'released' has NO writer (cmdRelease archives in the same call). Empty
state file → unknown → KEPT. Crash-window (closed in main copy, active in worktree) → KEPT. Real bundle
(startup --target-issues 201,202): folder==bundle_id==tag==bundle-201-202, kept. Real keep-open finalize:
only barrier/issue-102/* reaped, sibling byte-identical. Real repair cycle (--drop-base→sweep→--record-base→sweep):
kept at every interleave. record-base cannot precede state (guard prologue refuses without workflow-state.md).

## Surface 2 — concurrency without sabotage: CLOSED
Worktree-cwd claim (R4 class) kept from main + foreign worktree; leg-root claim kept. Hammer: 212 sweeps from
2 roots racing 6 real claims + record-bases + 1 concurrent discard → zero live-ref losses, FAIL=0. TOCTOU: whole
sweep = 0.08s wall (interior gap smaller) vs 0.218s state-write→ref-create floor (real runs: minutes) → a ref
old enough to enumerate has a state file ≥218ms old, visible to the scan that precedes the enum by <80ms.
Ordering-closed. Worktree ADDED mid-sweep carries only a ref ≥218ms out (unseen); leg REMOVED takes its folder.

## Surface 3 — archive-time reap boundary: CLOSED (+ R11)
Real discard (release --project issue-1) with live issue-10/issue-101 → only barrier/issue-1/* reaped,
component-boundary confirmed. Real keep-open finalize → exact-tag reap only. NEW edge (R11, out-of-scope):
claim --project "issue.500" + "issue_500" both anchor barrier/issue_500/n1 (second record-base clobbers the first
— pre-existing ref-keying alias yielding barrier_base_mismatch upstream); release --project issue.500 then deleted
the live sibling anchor. Requires hand-crafted aliasing names through bare cmdClaim; every shipped surface emits
issue-N/bundle-N-M (sanitize fixed-points, cannot alias); upstream-broken. Sweep side collision-safe (dangling
barrier/issue_500/n9 KEPT while folder issue_500 lives).

## Surface 4 — stale/missing keep signals: CLOSED
Archived project's running-set.json travels into kaola-workflow/archive/ (whole-folder move) and the sweep skips
`archive` → no stale keep for dead tags. Live sequence run without running-set.json protected by (a) alone
(Surface 1 P1). Fail-closed: FORCE_BARRIER_WT_LIST_FAIL=1 with a dead dangling tag → aborted:true, zero deletions;
next normal sweep reaped exactly the dead issue-999, kept all live, left leg-base/* untouched.

## What I could NOT find
No reachable lifecycle point where a live barrier ref exists while (a),(b),(c) all fail on every root: every
shipped flow writes status:active before any ref can exist, never rewrites to terminal outside archiveProjectDir,
never deletes workflow-state.md, truncate-writes parse to a kept status. No timing window fits the ordering
(0.08s vs 0.218s; 212-sweep hammer clean). No archive-reap cross-tag bleed with shipped names. Remaining
over-reaps are exactly the accepted boundary (R8 fixed, R10 #691) plus R11 (hand-crafted names, upstream-broken).
Suite: 245 assertions pass.

## Verdict
NOT-REFUTED (high). Surfaces 1-4 driven with real CLI flows in real git scratch repos; every reachable live state
keeps its refs; only accepted out-of-band-FS-damage edges (R8 fixed, R10 #691) + the out-of-scope hand-crafted-name
aliasing edge (R11, documented) remain. No repo file modified.

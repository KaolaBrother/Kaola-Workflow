evidence-binding: n1-porcelain-cap 6e4a61ab3860

RED: node scripts/test-adaptive-node.js (pre-fix, on the unpatched --parent-clean-check handler at
scripts/kaola-workflow-plan-validator.js:3253) — added PARENT-CLEAN-CHECK-ENOBUFS: a synthetic
worktree with 6000 untracked production files under a long shared prefix (src/generated/a{60}/b{60}/c{60}/fNNNNN.js,
~1.26 MB of `git status --porcelain --untracked-files=all` output, comfortably past Node's
1,048,576-byte execFileSync default maxBuffer) drove the unpatched `catch (_) { porcelain = ''; }`
to collapse a real ENOBUFS into "zero dirty paths", and the fence FALSELY REPORTED THE TREE CLEAN:
  FAIL: PARENT-CLEAN-ENOBUFS: a buffer-overflowed (unreadable) porcelain probe must NEVER fall
  through to a "pass" verdict on a demonstrably non-clean tree (fail-OPEN), got
  {"exitCode":0,"result":"pass","reason":null}
  FAIL: PARENT-CLEAN-ENOBUFS: fails CLOSED with a typed refuse (exitCode!=0) when the dirty-check
  itself cannot be trusted, got {"exitCode":0,"result":"pass","reason":null}
Result: 2 failures, 1767 passed (both failures are the new assertions; the fence's fail-open bug on
a >1MB dirty tree is confirmed live in the shipped code before this node's edits).

GREEN: node scripts/test-adaptive-node.js (post-fix) — adaptive-node tests passed (1770 assertions).
node scripts/simulate-workflow-walkthrough.js — ends "Workflow walkthrough simulation passed", exit 0.
node scripts/edition-sync.js --check — "edition-sync: 10 forge aggregator ports, 24 COMMON_SCRIPTS
mirrors, and 27 byte-identical groups in parity with canonical." (clean, no drift).
1770 = 1767 (pre-existing) + 3 new assertions: the 2 original PARENT-CLEAN-CHECK-ENOBUFS assertions
now pass (the probe succeeds under the raised 64 MB cap and correctly reports `parent_dirty` with
the real dirty paths enumerated — the strictly better outcome vs the new generic `cannot_prove_clean`
catch, and still "never a bare pass" on a demonstrably dirty tree), plus 1 new assertion added post-RED
(PARENT-CLEAN-CHECK-CANNOT-PROVE-CLEAN: a corrupted `.git/index` — a non-buffer git fault — trips the
SAME fail-closed catch and returns the typed `cannot_prove_clean` refuse, proving the flip is
unconditional on the general error path, not just a matched ENOBUFS code, per the brief's own
adversarial pre-emption request).

Note: an unrelated, pre-existing subprocess crash trace (EISDIR on workflow-tasks.json, a known
task-mirror issue already tracked — see MEMORY.md "#671 task-mirror refreshTaskMirror EISDIR
fail-open raw stack trace") appears identically in BOTH the RED and GREEN full-suite runs' stderr; it
is emitted by a spawned subprocess in an unrelated fixture and does not affect the pass/fail counts
in either run — confirmed pre-existing and untouched by this node.

== THE FAIL-CLOSED FLIP (safety-critical crux, MANDATORY per brief) ==
scripts/kaola-workflow-plan-validator.js `--parent-clean-check` handler (~line 3253, the dirty-fence
probe `git status --porcelain --untracked-files=all`): the `catch (_) { porcelain = ''; }` collapse is
REMOVED. On ANY exec failure (ENOBUFS past the new 64 MB cap, or any other git fault — corrupt index,
held lock, EAGAIN/EMFILE) the handler now emits a typed refuse:
  { result: 'refuse', reason: 'cannot_prove_clean', operator_hint: <new registry entry>, errors: [...] }
and sets process.exitCode = 1, unconditionally — the catch never falls through to the pass branch.
`cannot_prove_clean` is a NEW, DISTINCT reason from `parent_dirty` (deliberate: `parent_dirty` carries
an ENUMERATED `dirty: [...]` array of real out-of-allowband paths; a probe-failure has no such list —
reusing `parent_dirty` with an empty/absent dirty array would be misleading to an operator reading the
refuse). Both `parentCarriesProductionDirt` and the last-member-close consumer in
scripts/kaola-workflow-adaptive-node.js already treat ANY `fence.exitCode !== 0 || fence.result !==
'pass'` as fail-closed dirt regardless of the specific reason string (see the pre-existing #615
doc-comment at adaptive-node.js:4260-4262: "any non-`pass` result ... is treated as dirt"), so this
new reason integrates with zero consumer changes and cannot regress the existing
SYNTH-PARENT-DIRTY-FENCE / PARENT-CLEAN-CHECK-DIRECT / PARENT-CLEAN-CHECK-UALL tests (all confirmed
still green at 1770/1770).

== EVERY SITE CAPPED (maxBuffer: GIT_MAX_BUFFER added; content probes only, `git worktree list
--porcelain` sites explicitly left uncapped as directed) ==
Canonical (scripts/):
  - kaola-workflow-plan-validator.js:3253 (the dirty-fence probe; folded into the fail-closed flip above)
  - kaola-workflow-sink-merge.js:147 (assertCleanWorktree, -uno), :223 (assertWorktreeClean's bounded-retry
    worktree-remove precondition, -uno), :984 (sinkPreflight's foreign-dirt scan, -uall)
  - kaola-workflow-adaptive-node.js:4522 (synthesizeLevel leg-dirty-commit probe), :5484
    (memberInLaneChanges leg-scoped uncommitted probe), :5499 (memberInLaneChanges parent-rooted probe)
  - kaola-workflow-claim.js:483 (worktreeDirtyState), :532 (treeDirty), :1634 (archiveDirDirty)
Forge hand-ports (grep-verified, identical maxBuffer: GIT_MAX_BUFFER cap at every content site; each
file already carried the GIT_MAX_BUFFER constant from #666):
  - plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js: 3 sites (293, 494, 1402)
  - plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js: 4 sites (160 assertCleanWorktree
    via injected gitExec, 228 assertWorktreeClean, 822 an inline duplicate of the -uno clean check on the
    legacy --sink path not refactored into assertCleanWorktree in this fork, 1041 -uall foreign-dirt scan)
  - plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js: 3 sites (294, 494, 1403)
  - plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js: 4 sites (159, 227, 816, 1035)
GENERATED_AGGREGATORS (kaola-workflow-plan-validator.js, kaola-workflow-adaptive-node.js): edited ONLY
the canonical scripts/ copy, then `npm run sync:editions` regenerated the codex twin (plugins/kaola-workflow/)
and both gitlab/gitea forge ports byte-for-byte — never hand-edited.
COMMON_SCRIPTS (kaola-workflow-claim.js, kaola-workflow-sink-merge.js): canonical<->codex regenerated by
the same sync:editions run (codex-sync log line); the gitlab/gitea DIVERGENT hand-ports were hand-edited
above since sync does not touch them.
Test harness (scripts/test-adaptive-node.js): runVal's own execFileSync (the harness's subprocess
capture of the validator CLI's stdout) also raised to a 64 MB maxBuffer — needed because a POST-fix
successful parent_dirty detection over a large fixture echoes every offending path into the JSON
response, which is itself large enough to overflow the test harness's OWN prior 1 MB default capture
buffer (a distinct boundary from the production probe under test, discovered while proving GREEN).

== PER-SITE FAIL-SAFETY JUSTIFICATION (step 4) ==
Already fail-SAFE as shipped (catch's empty/false-default IS the conservative outcome for that
specific consumer) — maxBuffer added, no semantic change:
  - adaptive-node.js:5484/5486/5499 memberInLaneChanges (`{changed:false}` on any probe failure): the
    function's own doc-comment (line 5467-5468, 5491) already states this is a DELIBERATE fail-open-to-
    changed:false, because the caller (runCloseNode's per-member in-lane vacuity guard, ~line 5769)
    treats `!inLane.changed && !evidenceDeclaresNoOp(...)` as `member_vacuity` — a REFUSE. So a probe
    failure here forces either an explicit `no_op:<reason>` admission in the node's own evidence or a
    typed refusal; it can never silently let an unverified close proceed. Verified by reading the sole
    caller at adaptive-node.js:5768-5777. No flip needed.
  - sink-merge.js:147 assertCleanWorktree (no catch — an exec failure propagates as an uncaught
    exception): the ONLY caller (line ~1708, the legacy pre-`--sink` main-advance path) is documented
    "Any failure throws -> exit 1, ZERO mutation, worktree intact." Fail-closed-by-crash, not a swallow.
    No flip needed (ungraceful but safe).
  - sink-merge.js:223 assertWorktreeClean (the pre-`worktree remove --force` gate): ALREADY explicitly
    fail-closed per its own #496 doc-comment — a probe failure (`probeErr` set) throws a typed Error
    that sinkPreflight/legacy callers convert to a `worktree_dirty` refuse, treating an unverifiable
    worktree as DIRTY, never swallowed as clean. No flip needed (already the mandated pattern).
  - sink-merge.js:984 sinkPreflight's foreign-dirt scan (no catch): same fail-closed-by-crash shape as
    :147 — an uncaught exception aborts runSinkTransaction's preflight step (no try/catch wraps the
    call at line ~1152) before any mutation. No flip needed.
  - claim.js:532 treeDirty (`catch (_) { return true; }`): explicitly documented (#557) as the fixed
    fail-closed direction — an unprobeable tree is treated as dirty, refusing the in-place/discard
    consumers rather than proceeding on a false "clean". No flip needed.
  - claim.js:1634 archiveDirDirty (`catch (_) { return true; }`): explicitly documented (#563) as the
    fixed fail-closed direction — an unprobeable archive dir is treated as dirty (`incomplete: true`),
    resuming finalize rather than falsely declaring the work safely committed. No flip needed.

Identified but NOT flipped in this node (flagged as residual findings for a follow-up issue, per
"make surgical changes: touch only what the task requires" + this node's explicit mandate that ONLY
the :3253 dirty-fence categorically MUST fail closed — the brief's "decide + justify" for the rest,
not "silently expand the flip"):
  - adaptive-node.js:4522 synthesizeLevel's leg-dirty-commit probe (`catch (_) { dirty = ''; }` ->
    skips the add+commit capture step for that leg): genuinely analogous in SHAPE to the :3253 crux —
    a probe failure here could silently omit real uncommitted leg content from the branch the
    octopus-merge later folds into M, and the existing `leg_omitted_from_merge` group-barrier check
    (plan-validator.js ~3183-3189) only verifies each leg BRANCH is an ancestor of M, not that the
    branch's content is COMPLETE, so it would NOT catch this specific failure mode. Narrower/lower-
    probability than :3253 (now capped at 64 MB; and legs currently stay EMPTY in production per the
    existing "#463 Slice 2... S2 dormant-but-tested" comment at adaptive-node.js ~6256, so live exposure
    today is effectively nil). A minimal symmetric fix exists (treat a probe failure as "must attempt
    capture" so a genuinely-empty leg still safely no-ops via git's own "nothing to commit" refusal) but
    changing this handler's refusal surface is a value-laden call outside this node's explicit mandate;
    flagging for a follow-up rather than unilaterally expanding scope.
  - claim.js:483 worktreeDirtyState (`catch (_) { return 'missing'; }`): the ONLY way to reach the exec
    call is when `fs.existsSync(wtPath)` already returned true (checked one line above), so a catch here
    means "the path exists but git status failed" — conflating that with the true "missing" case is
    wrong. Its destructive consumer (cmdSweepLegacyWorktrees-style cleanup at claim.js ~3455) treats
    non-'dirty' states (missing OR clean) identically as safe-to-remove/`would_remove`, so a probe
    failure on a REAL, possibly-dirty existing worktree could incorrectly proceed toward
    `git worktree remove --force` without the dirty-state protection. Flagging as a residual fail-open
    risk for a follow-up rather than fixing here, for the same reason as above (a new refusal mode on an
    already-shipped destructive path is a value-laden scope decision, not a mechanical buffer cap).

== DO-NOT-CAP SCOPE HELD ==
No `git worktree list --porcelain` site was touched in any of the 17 write-set files (grep-verified
before and after edits) — those are bounded by worktree count, explicitly out of scope per the brief.

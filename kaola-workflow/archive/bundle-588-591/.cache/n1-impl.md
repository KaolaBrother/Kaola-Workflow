evidence-binding: n1-impl 8f1ffe45f655

RED: #591 LEG-PROVISION-ON (extended) — AssertionError: "#591: A dispatch.leg_path == provisioned legPath, got undefined vs .../.kw/legs/test-project/A" (+ B, + leg_branch, + canonical-form = 6 failures pre-impl; dispatch built only with the shared working_dir so leg_path/leg_branch absent). #588-WIDE-CAP — AssertionError: "running-set max_concurrent == write cap (4), got 8" and "max_concurrent==4 survives reconcile at width 4, got 8" (2 failures; a WRITE lane group recorded the READ cap 8, not the write cap 4).
GREEN: #591 leg_path/leg_branch now threaded into each co-open member's dispatch (serial/read byte-identical, #591-SERIAL-READ-NO-LEG-FIELDS passes); #588 write-group max_concurrent pinned to the write-cap ceiling. node scripts/test-adaptive-node.js → 1219 assertions (was 1127; +13 #591, +79 #588), exit 0.

===================== #591 (thread leg_path/leg_branch into per-member dispatch) =====================
RED (pre-impl, observed):
  scripts/test-adaptive-node.js LEG-PROVISION-ON extended + width-3 cross-check asserted
  each opened member's dispatch.leg_path == running-set legs[id].legPath and dispatch.leg_branch ==
  'kw/legs/test-project/<id>'. Pre-impl these were `undefined` (buildDispatch was called with only the
  shared working_dir; the leg descriptor lived solely in the top-level laneGroup). 6 failing assertions.

GREEN (impl — PINNED new correct behavior):
  - scripts/kaola-workflow-adaptive-node.js buildDispatch(): conditionally attaches d.leg_path / d.leg_branch
    ONLY when ctx.leg_path / ctx.leg_branch are non-null (mirrors the existing goal_line conditional-attach),
    so the serial/read path (which passes neither) is byte-identical to pre-#591.
  - runOpenReady() opened[] map: reads legInfo = legs[n.id] (the Phase-1 provisioned leg) and passes
    leg_path/leg_branch into buildDispatch; null on the serial/read path (no legs) → keys omitted.
  - New byte-identity guard #591-SERIAL-READ-NO-LEG-FIELDS: serial open-ready dispatch has NO leg_path/
    leg_branch key anywhere (raw-string probe) — proves flag-OFF byte-identity.

===================== #588 (write co-open width/mix coverage) =====================
Case (a) #588-3LEG-OCTOPUS-END-TO-END — PINNED CORRECT: 3-leg disjoint co-open (A/B/C) → 3 legs
  provisioned (worktree+branch+manifest) → per-leg barriers (A,B deferred; C last) → octopus merge with
  EXACTLY 4 parents (feature+3 legs) → commit-union barrier (diff base→M == {ax.js,by.js,cz.js}) → all 3
  complete + legs torn down. Width-3 extension of SYNTH-DISJOINT; no defect.

Case (b) #588-WIDE-CAP + #588-WIDE-DRAIN — DEFECT FOUND & FIXED (max_concurrent) + rest PINNED:
  - DEFECT: a 5-wide disjoint write antichain co-opens EXACTLY 4 (write FANOUT_CAP=4) and queues the 5th
    (correct), BUT the running-set recorded max_concurrent = the READ cap (8) instead of the WRITE cap (4).
    reconcile uses max_concurrent as its roll-forward ceiling, so a write group would be allowed to roll
    forward more members than co-open ever opens. RED = the two #588-WIDE-CAP assertions above (got 8).
  - FIX (smallest correct change, all 4 editions): hoisted the write-group ceiling into `laneGroupCeiling`
    (= resolveFanoutCap folded with --max, already >=2 when a group forms) and set
    `const maxConcurrent = groupForm ? laneGroupCeiling : (read-cap logic)`. Serial/read paths unchanged.
  - PINNED CORRECT (post-fix): open 4 / queue 5th (pending, no leg); running-set max_concurrent==4; legs
    manifest covers exactly the 4 opened; reconcile of a crashed-open (state:opening, all 4 opening:true)
    rolls all 4 forward (ceiling==width==4) and preserves max_concurrent==4 with all 4 legs retained;
    top-up DRAIN — after the width-4 group closes (octopus, EXACTLY 5 parents = feature+4 legs), the queued
    5th opens serially (single write ⇒ no group, no leg).

Case (c) #588-MIXED-FRONTIER — PINNED CORRECT (deliberate, not a defect): a frontier with 2 read members
  (v1 code-explorer, v2 knowledge-lookup) + a disjoint write pair (A,B). open-ready opens ONLY the reads;
  A,B stay pending; running-set reflects EXACTLY {v1,v2}; no lane_group, no legs. A second open-ready while
  the reads are live returns reason:'write_awaits_drain' (opened:[]). This is the "a write node runs
  strictly alone" invariant (co-open-by-default is write||write; a legged write is synthesized into feature
  HEAD at close, so it is not co-scheduled with reads). Read||write co-scheduling would be a NEW capability
  (out of scope, accuracy>efficiency) — not "genuinely wrong" per the stated write-co-open design intent, so
  pinned as-is rather than changed.

Case (d) #588-TASKMIRROR-FAILOPEN — PINNED CORRECT: forced the durable task-mirror write to fail
  (workflow-tasks.json made a DIRECTORY ⇒ EISDIR ⇒ non-zero task-mirror exit) on BOTH scheduler subcommands.
  open-ready still result:'ok' with taskMirror.status=='failed' and the ledger co-open advanced (A,B
  in_progress, running-set+legs written); close-node still result:'ok' with taskMirror.status=='failed' and
  the ledger advanced to complete. Fail-open contract holds on the running-set scheduler path (was only
  tested for the batch path).

===================== FILES CHANGED =====================
  scripts/kaola-workflow-adaptive-node.js                                (canonical: #591 buildDispatch +
      runOpenReady opened map; #588 laneGroupCeiling + max_concurrent)
  plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js          (codex twin, byte-identical via sync:editions)
  plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js  (regenerated port)
  plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js    (regenerated port)
  scripts/test-adaptive-node.js                                          (#591 asserts + #588 cases a-d;
      makeLaneRepo gained backward-compatible extraMembers — byte-identical when absent)
  next-action.js (4 files) + scripts/test-next-action.js: UNCHANGED (no #588-discovered fix needed there).

===================== VERIFICATION (real exit codes) =====================
  node scripts/test-adaptive-node.js            → adaptive-node tests passed (1219 assertions), exit 0
  node scripts/test-next-action.js              → next-action tests passed (97 assertions), exit 0
  node scripts/simulate-workflow-walkthrough.js → Workflow walkthrough simulation passed, exit 0
  node scripts/validate-script-sync.js          → OK (24 common scripts ... in sync), exit 0
  node scripts/edition-sync.js --check          → 10 forge aggregator ports in parity, exit 0
  npm run test:kaola-workflow:codex             → CODEX_REAL_EXIT=0 (codex walkthrough + parity green)

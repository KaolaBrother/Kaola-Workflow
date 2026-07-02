evidence-binding: n2-impl bd6e30b90195

RED: (failing signatures captured BEFORE the implementation, per issue)

## #590 — serial open-next flips ledger before recording baseline
Direct-call tests over runOpenNext's injected seams (test-adaptive-node.js), run against the
pre-change write-first code — FAILED as expected:
  FAIL: T-590-order-fail: baseline recorded BEFORE any ledger flip write (baseline-first ordering)
  FAIL: T-590-order-fail: NO ledger flip write on baseline failure — row never stranded in_progress-without-baseline
  FAIL: T-590-order-fail: ledger row still pending after the refuse
  FAIL: T-590-order-ok: baseline recorded BEFORE the ledger flip write (baseline-first)
Root observation: pre-change runOpenNext writes the plan (ledger → in_progress) and only THEN
shells commit-node --start, so on a baseline failure the row is left in_progress with no baseline
on disk (the exact avoidable asymmetric hazard #590 describes).

## #585 — scheduler mutual exclusion is advisory-only (lockless RMW loses updates)
Genuine two-process interleave (raceTwo: node -e orchestrator Promise.all-spawns two real
adaptive-node CLIs on ONE project), run against the pre-change advisory-only code — RED observed
5/5 trials each (deterministic — the race window is wide):
  OPEN-READY×2 RED: trials=5, double-open trials=5  <-- both processes read running-set=null → both
    opened the frontier (double-dispatch); the test's "no trial double-opened" assertion FAILS pre-fix.
  CLOSE-NODE×2 RED: races=5, lost-update trials=5   <-- two concurrent close-node whole-plan rewrites
    clobbered each other → completeMembers(1) < result:ok(2) (a lost complete flip); the test's
    "completeMembers >= #result:ok" assertion FAILS pre-fix.
The #585 unit tests (isStaleLock / acquireProjectLock / release, and the CLI live-refuse /
stale-refuse / release tests) are GREEN-ONLY-AFTER — they exercise machinery absent pre-change,
so pre-change the require yields undefined and the suite throws `TypeError: isStaleLock is not a
function` rather than an assertion failure. Stated explicitly per the blueprint.

## REPAIR RED (adversarial R1: concurrent stale-takeover double-acquire — first impl REFUTED)
The first implementation's stale-takeover tail [re-read confirm → unlink → 'wx' retry ONCE] was
refuted: the unlink executes a stale decision made BEFORE the unlink, so a second concurrent taker
holding the same stale decision unlinks the first taker's FRESH lock and claims → both ok:true
(adversarial empirical: 2 takers → 6/500; 6 takers → 111/500 double-acquire). Repair-proof tests
written per the architect's decision (remove auto-takeover; typed stale refusal) and run against
the TAKEOVER-BEARING code — RED, 17 failures, exit 1 (1110 of 1127 passed — everything else green):
  FAIL: T-585-stale-race: ZERO acquisitions across 6 concurrent callers vs a stale lock in every trial (no code path succeeds against an existing lockfile)
    <-- the deterministic repair proof: with takeover present the FIRST taker ALWAYS succeeds, so
        any single result:ok fails the zero-acquisition assertion; wrong-shape / lock-mutated /
        ledger-mutated / running-set-written also fail (all 5 stale-race assertions RED; TRIALS=3, N=6)
  FAIL: T-585-stale-refuse(unit): dead-pid holder → ok:false + stale:true (no auto-takeover)
    <-- takeover code returned ok:true + tookOver:true and REPLACED the payload (3 unit asserts RED)
  FAIL: T-585-acquire: second acquire refused stale:false by the live holder (no stale field pre-repair)
  FAIL: T-585-stale-refuse (CLI): dead-holder lock → typed scheduler_lock_stale refusal, got {"result":"ok"}
    <-- CLI proceeded via takeover: no refusal, no hint, lock consumed, ledger mutated, RS written
        (7 CLI asserts RED, incl. the recovery narrative)
  FAIL: T-585-stale-refuse(age): old cross-host holder → scheduler_lock_stale refusal, got {"result":"ok"}

GREEN: (same tests passing AFTER the minimal implementation)

## #590 — reorder runOpenNext to baseline-first (canonical scripts/kaola-workflow-adaptive-node.js)
Moved the `commit-node --start` baseline shell (+ baselineOk check → refuse baseline_failed) ABOVE
the spliceLedgerNode in_progress flip + plan write, mirroring runOpenReady Phase 2 → Phase 3. Now a
baseline failure returns baseline_failed with the ledger still PENDING (clean idempotent re-open);
an orphaned baseline on a later flip failure is harmless (recordBase is idempotent/overwriting).
Also added a `no_barrier_base` OPERATOR_HINT_REGISTRY entry naming the idempotent open-next
re-invoke as the repair for a baseline_missing close dead-end.
  T-590-order-fail passes; T-590-order-ok passes (baseline-before-flip on both the failure and the
  happy path; row stays pending on failure, flips in_progress only after the baseline on success).
  Both still green after the repair (the repair touched no #590 surface).

## #585 — project-scoped O_EXCL scheduler lock (AS REPAIRED — no auto-takeover)
schema (byte-identical ×4 drift anchor, canonical scripts/kaola-workflow-adaptive-schema.js):
  - SCHEDULER_LOCK_NAME = 'scheduler.lock' (next to RUNNING_SET_NAME).
  - acquireProjectLock(lockPath,{subcommand}): openSync('wx') → payload {pid,host,ts,subcommand} +
    fsync → { ok:true, release }. On EEXIST: parse holder and CLASSIFY ONLY — return
    { ok:false, stale:<boolean>, holder } (holder null for corrupt payloads; the mtime branch now
    only SETS stale — fresh-empty mid-write → stale:false, old-corrupt → stale:true). It NEVER
    unlinks another process's lock (the refuted takeover tail is DELETED); recovery is one explicit
    operator removal of the lockfile. Contract comments rewritten accordingly.
  - isStaleLock demoted to a PURE refusal classifier (dead same-host PID via process.kill(pid,0)
    ESRCH; cross-host/pidless/corrupt via age>LANE_STALENESS_MS) — its verdict only selects the
    typed refusal reason and can no longer affect any acquire outcome.
  - releaseProjectLock unlinks OUR OWN lock (swallows ENOENT) + clears the held marker; module-level
    heldLock + one-time process.on('exit') cleanup; all four exported.
adaptive-node main() (canonical): for SPLIT_GUARDED_SUBCOMMANDS acquire the lock at
kaola-workflow/{project}/.cache/scheduler.lock after the worktree-split guard, before dispatch; on
!ok emit refuse(schedulerLock.stale ? 'scheduler_lock_stale' : 'scheduler_locked', {holder,lockPath})
exit 1; dispatch+decorate+emit wrapped in try/finally release. `scheduler_locked` hint EDITED (the
false auto-reclaim sentence dropped; notes the dead-holder case refuses separately as
scheduler_lock_stale). NEW `scheduler_lock_stale` hint: names the dead holder (subcommand/pid/host/
since), tells the operator to verify no other orchestrator session is recovering this project, then
remove the lock by hand from ONE session only — literal `rm "<lockPath>"` — and re-run.
  T-585 unit: isStaleLock block (unchanged: dead/live/cross-host old+fresh/corrupt); acquire →
    live-holder refuse now stale:false; dead-pid holder → ok:false + stale:true + lockfile
    byte-untouched; idempotent release — all pass.
  T-585 CLI: live-refuse (scheduler_locked, exit 1, zero mutation) unchanged-pass; T-585-stale-refuse
    (replaces stale-takeover): dead-holder → refuse scheduler_lock_stale, exit 1, hint carries the
    literal lockPath in rm "<lockPath>" form, lock byte-intact, ledger pending, no RS; then the
    recovery narrative — operator unlinks by hand → re-run → ok with the 2-node frontier opened and
    the lock released after (pins "never wedges" via the hint path). Age-based cross-host twin
    FLIPPED to refuse scheduler_lock_stale — passes.
  T-585-open-ready×2 / T-585-close-node×2 (both start lock-absent): UNCHANGED and still green — no
    double-open; no lost complete flip; serial retry completes both members every race.
  T-585-stale-race (the repair proof, TRIALS=3, N=6 concurrent open-ready via raceN): ZERO
    acquisitions in every trial; ALL 6 refuse scheduler_lock_stale (exit 1); the planted stale
    lockfile survives byte-identical (no non-holder unlink EVER); ledger all-pending; no
    running-set.json. Plus a 10-trial standalone determinism probe: acquired-trials=0,
    wrong-shape=0, lock-mutated=0 (10/10 clean — no flakes).

Race-test determinism: original raceTwo races 5 trials each (unchanged, green); stale-race 3 suite
trials + 10 probe trials, N=6, fresh $TMPDIR git repo per trial — zero flakes anywhere. Pre-repair
RED was deterministic (the first taker always wins ⇒ the zero-acquisition assertion always fails).

Verification AFTER the repair (real exit codes, no pipe-through-tail):
  node scripts/test-adaptive-node.js            → exit 0, "adaptive-node tests passed (1127 assertions)" (1078 pre-node + 37 first impl + 12 repair delta)
  node scripts/test-commit-node.js              → exit 0, "commit-node tests passed (119 assertions)"
  node scripts/simulate-workflow-walkthrough.js → exit 0, "Workflow walkthrough simulation passed"
  node scripts/validate-script-sync.js          → exit 0, OK (24 common, 25 byte-identical groups, 8 rename families)
  node scripts/edition-sync.js --check          → exit 0, "10 forge aggregator ports in rename-normalized parity"
  npm run test:kaola-workflow:codex             → exit 0

Files changed (all within the declared 14-file write set; same 9-file footprint as the first impl):
  scripts/kaola-workflow-adaptive-schema.js (canonical: lock helpers — REPAIRED: takeover tail deleted,
    classified {ok:false,stale,holder} refusal, contract comments rewritten; SCHEDULER_LOCK_NAME + exports)
  scripts/kaola-workflow-adaptive-node.js (canonical: require extend; scheduler_locked hint edited +
    scheduler_lock_stale hint added + no_barrier_base hint; #590 reorder; main() lock acquire with
    stale-classified refusal reason + finally-release)
  plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js  (byte-copy via sync:editions)
  plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js    (codex byte-twin via sync:editions)
  plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js       (byte-copy)
  plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js  (regenerated forge port)
  plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js        (byte-copy)
  plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js    (regenerated forge port)
  scripts/test-adaptive-node.js (raceTwo generalized to raceN + wrapper; takeover unit/CLI tests
    REPLACED by the stale-refusal contract; age twin flipped; NEW T-585-stale-race; walkthrough untouched)

Blueprint/architect deviations:
  - commit-node.js (+ its 3 ports and test-commit-node.js) NOT touched — hedge confirmed unneeded
    both in the original impl and the repair.
  - T-585-stale-refuse hint assertion pins /rm "[^"]*scheduler\.lock"/ rather than a full-path string
    equality: the subprocess's getRoot() (git rev-parse --show-toplevel) realpaths macOS $TMPDIR
    (/var → /private/var), so the hint's absolute lockPath differs by prefix from the test's
    mkdtemp path; the regex still proves the literal lockPath appears in an rm "<lockPath>" form.
  - T-585 close-node×2 uses a read fan-out (code-explorer/knowledge-lookup) rather than a write
    lane-group: it drives exactly the serial close whole-plan rewrite clobber path (isMember=false),
    a cleaner reproduction than a lane-group close.

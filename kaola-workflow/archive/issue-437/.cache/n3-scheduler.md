evidence-binding: n3-scheduler a771e4917b39

# n3-scheduler — D-437-01 Part 2 (adaptive-node lane-group open-ready + group-scoped close)

Implemented the open-ready co-open + close-node group barrier from `n1-design.md` §1/§2,
plus the `#437-LANE-GROUP` real-subprocess test section in test-adaptive-node.js, the codex
byte-pair, and the two regenerated forge ports. ALL new code is dead when
`KAOLA_LANE_CONTAINMENT` is OFF (INV-6) — the containment guard is false, so the existing
single-serial-write open and per-node serial close run byte-identically.

RED: D437-OPEN-READY-GROUP — `laneGroup descriptor returned, got undefined` + D437-CLOSE-NODE-DEFERRED `barrier deferred_to_group, got undefined` (pre-impl: HEAD open-ready opens ONE write serially, no lane_group; close-node has no member path)
GREEN: adaptive-node tests passed (623 assertions); all 8 D437-* cases + the D437-MUTATION-GUARD-NOT-VACUOUS check green; exit 0

## What changed (write set)

- `scripts/kaola-workflow-adaptive-node.js`
  - import `resolveLaneContainment` from adaptive-schema.
  - NEW `tryFormLaneGroup(writeNodes, planPath, shell)` + pure `laneGroupId` / `laneWriteUnion`
    helpers — shell the validator's `--parallel-safe` to authoritatively re-check disjointness;
    overlap ⇒ `{ok:false}` ⇒ caller degrades to a single serial write.
  - `runOpenReady` — NEW containment-gated co-open arm in the write branch: ≥2 disjoint writes form
    a lane group (records the SHARED group baseline ONCE via `commit-node --start --node-id <group_id>`
    BEFORE per-member baselines, stamps each member node with `group_id`, writes a `lane_group` key into
    running-set.json in the two-phase crash-safe order, returns a `laneGroup` descriptor). Flag OFF /
    overlap ⇒ the EXISTING single-write line runs verbatim (no `lane_group`, no `laneGroup`).
  - NEW `closeGroupMember(ctx)` + `memberInLaneChanges` / `evidenceDeclaresNoOp` helpers — the
    member-close path: evidence-shape (already passed in runCloseNode step a) + per-member in-lane
    vacuity (`git status --porcelain -- <declared set>`; empty AND no `no_op:` ⇒ refuse `member_vacuity`),
    then NON-LAST ⇒ DEFER (`barrier: deferred_to_group`, compliance row carries the literal, record in
    `lane_group.closed_members`, keep `lane_group`), or LAST ⇒ run the GROUP barrier ONCE
    (`plan-validator --group-barrier --group-id <id>` over the full union; pass ⇒ close, compliance
    `group_passed`, CLEAR `lane_group`, `--drop-base` the group baseline; refuse ⇒ typed refusal, no
    advance, group untouched).
  - `runCloseNode` — NEW `(a.5)` branch detects a live lane_group member (gated on
    `resolveLaneContainment` AND membership) and routes to `closeGroupMember`; else the serial path is
    byte-identical. members kept as a bare-id `string[]` (the validator's `--group-barrier` reads it for
    the union allowlist); per-member close state lives in a parallel `closed_members` id[].
  - `runReconcileRunningSet` — additive lane_group crash handling: a group survives iff ≥1 member node
    survives; no survivor ⇒ delete `lane_group` + `--drop-base` the group baseline. Flag-OFF sets have
    no `lane_group` key ⇒ no-op.
- `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js` — byte-identical codex copy (`diff` empty;
  validate-script-sync "30 byte-identical groups ... in sync").
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js` and
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js` — regenerated via
  `node scripts/edition-sync.js --write` (never hand-edited).
- `scripts/test-adaptive-node.js` — added the `#437-LANE-GROUP` real-subprocess section (8 D437-* cases
  + the mutation-guard check), each driving the REAL `adaptive-node` + `plan-validator` CLIs in a real
  git repo under $TMPDIR (#292 io-shim trap: no shims, real `KAOLA_LANE_CONTAINMENT` env, real git
  status / group-barrier subprocess, asserted against real outputs).

## RED — failing tests BEFORE implementation

Reverted `scripts/kaola-workflow-adaptive-node.js` to HEAD (n2's validator changes + the new tests
kept), ran `node scripts/test-adaptive-node.js`:

```
FAIL: D437-OPEN-READY-GROUP: laneGroup descriptor returned, got undefined
FAIL: D437-OPEN-READY-GROUP: running-set lane_group has members [A,B]
FAIL: D437-OPEN-READY-GROUP: A ledger in_progress / B ledger in_progress  (HEAD opens ONE write serially)
FAIL: D437-CLOSE-NODE-DEFERRED: barrier deferred_to_group, got undefined
FAIL: D437-CLOSE-NODE-DEFERRED: A recorded in closed_members, got null
FAIL: D437-CLOSE-NODE-DEFERRED: compliance row carries deferred_to_group literal
(harness threw on .opened[0] of an undefined serial co-open — the feature is wholly absent)
```

The co-open + member-close paths do not exist at HEAD; open-ready returns the single-serial-write shape
and close-node has no deferred/group barrier, so every D437 co-open/group assertion fails.

## GREEN — passing tests AFTER implementation

Ran `node scripts/test-adaptive-node.js`:

```
adaptive-node tests passed (623 assertions)   exit 0
```

44 new #437 assertions (579 → 623). All 8 named cases green via REAL subprocesses:
- D437-OPEN-READY-GROUP — co-opens A+B, `laneGroup` + running-set `lane_group` {members:[A,B], baseline
  sha, write_union:[ax.js,by.js]}, both ledger in_progress.
- D437-OPEN-READY-SERIAL-DEGRADE-OVERLAP — overlapping sets ⇒ NO lane_group (serial degrade).
- D437-OPEN-READY-FLAG-OFF — flag OFF ⇒ exactly ONE write opened, no lane_group (byte-identical).
- D437-CLOSE-NODE-DEFERRED — non-last close ⇒ `barrier: deferred_to_group`, A complete, compliance row
  carries the literal, A in closed_members, B still in_progress (no group barrier ran).
- D437-CLOSE-NODE-GROUP-PASS — last close ⇒ REAL group barrier over union(A,B), both complete,
  lane_group cleared, group baseline dropped, `barrier: group_passed`.
- D437-CLOSE-NODE-VACUITY-REFUSE — no writes + no no_op ⇒ refuse `member_vacuity`; adding a `no_op:` line
  flips it to ok deferred.
- D437-CLOSE-NODE-CROSS-LANE-STRAY — z.js (undeclared) ⇒ A deferred ok (no diff barrier, stray invisible
  at A), last close refuses via the EXISTING `write_set_overflow` rank-4 arm (no new reason code), B NOT
  closed, lane_group retained.
- D437-CLOSE-NODE-FLAG-OFF-SERIAL — flag OFF close runs the per-node serial barrier (no deferred/group).
- D437-MUTATION-GUARD-NOT-VACUOUS — the same scenario WITHOUT the env does NOT co-open ⇒ proves the
  containment guard bites (not vacuous).

## edition-sync --check — byte-parity confirmed

```
$ node scripts/edition-sync.js --check
edition-sync: 12 forge aggregator ports in rename-normalized parity with canonical.   (exit 0)
```

`diff scripts/...adaptive-node.js plugins/kaola-workflow/scripts/...adaptive-node.js` → empty (byte pair).

## npm run test:kaola-workflow:claude — pass confirmed

Captured the REAL chain exit code (controlled log file, not a piped tail) — confirmed 3x (exit 0 each):

```
$ npm run test:kaola-workflow:claude > /tmp/n3-claude-final.log 2>&1; echo "CHAIN-EXIT: $?"
CHAIN-EXIT: 0
commit-node tests passed (85 assertions)
adaptive-node tests passed (623 assertions)
Workflow walkthrough simulation passed
```

The `&&`-chained claude suite runs validate-script-sync (byte-pair gate: "30 byte-identical groups ... in
sync"), test-commit-node, test-adaptive-node, test-edition-sync, and the walkthrough — exit 0 proves all
green.

## forbidden-only contract checks — pass confirmed

```
$ node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only scripts/kaola-workflow-adaptive-node.js
Kaola-Workflow GitLab forbidden-only check passed (1 file(s))   (exit 0)

$ node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only scripts/kaola-workflow-adaptive-node.js
Kaola-Workflow Gitea forbidden-only check passed (1 file(s))    (exit 0)
```

## Notes for downstream nodes

- lane_group.members stays a bare-id `string[]` (the validator's `--group-barrier` reads it for the
  union allowlist via `nodes.find(x=>x.id===id)`); per-member close state is a PARALLEL
  `closed_members` id[] so members is never reduced and the last-member group barrier reads the full
  set intact (the n1-design "run the barrier while members STILL holds the full set" ordering).
- The group baseline is recorded via `commit-node --start --node-id <group_id>` (nested
  `recordBase.base` SHA) and dropped via `plan-validator --drop-base --node-id <group_id>` (the group_id
  has no ledger row, so the #424 drop-base window-lock permits it).
- `memberInLaneChanges` reads `parseNodes`' `writeSetRaw` field (NOT `declared_write_set`, which is the
  running-set shape) — both accepted.

barrier: green
no_op: not applicable — production code + tests written

# Workflow Plan — issue-674

<!-- plan_hash: 26510383bb247e29d31f174408726395ec4be028ae082ee4776d13c0b2a50ef7 -->

## Meta
speculative_open_policy: auto
labels: bug, area:scripts
validation_command: npm test

Fix TWO coupled correctness defects in `open-ready`'s lane-group provisioning transaction (#674),
both live-observed in a consumer repo (vrpai-cli#948, the first plan there to author a genuine
parallel-write antichain), still present at v6.22.1. The affected code is `runOpenReady`'s
`if (groupForm && legCoupled)` block in `scripts/kaola-workflow-adaptive-node.js` (re-locate by
content — line numbers drift; the current site is ~5177–5250):

**(a) portability — the stub commit lacks `git add -f`.** The tracked-evidence-seeding step stages
the enumerated member evidence stubs with `git add -- <seededRelPaths>`. A consumer repo that
gitignores `.cache/` refuses the add, so the co-open aborts with `stub_commit_failed` and the
authored parallel-write antichain serial-degrades. The stub paths are explicitly enumerated by the
script itself and stubs MUST be tracked so each leg inherits them, so `git add -f -- <paths>` is
safe and honors design intent. Fix: add `-f`.

**(b) correctness — a group-form abort leaves stale member baselines that later serial opens
reuse.** The member loop above the stub commit has ALREADY recorded per-member barrier baselines
(tree snapshot + gc-anchor ref + nonce) via `commit-node --start` BEFORE the stub commit is
attempted. Every abort return in this transaction (`stub_commit_failed`, the two `leg_provision_
failed` variants, the mid-loop `baseline_failed`) leaves those baselines behind. When a member
later opens SERIALLY (after a sibling's uncommitted diff has landed in the shared worktree),
`--record-base`'s crash-resume idempotency REUSES the stale baseline instead of re-snapshotting, and
the member's close barrier then misattributes the sibling's files as `write_set_overflow`. Fix: on
ANY group-form abort AFTER member baselines were recorded, transactionally DROP the recorded
members' baselines (file + gc-anchor ref) so a later serial open re-records fresh. This eliminates
(b) regardless of (a).

A real correctness bug in the parallel-write engine (a `write_set_overflow` misattribution from
stale-baseline reuse) plus a portability fix — NOT decomposable into parallel legs (both defects
live in the SAME open-ready group-provisioning transaction). Serial spine: fix (tdd-guide,
genuine RED) → adversarial-verifier (falsify the (b) fix's COMPLETENESS across every abort path) →
code-review (G1) → terminal finalize sink. `kaola-workflow-adaptive-node.js` is a GENERATED_
AGGREGATOR, so this is a cross-edition diff: all four `npm run test:kaola-workflow:{claude,codex,
gitlab,gitea}` chains (the recorded `validation_command: npm test`) must be green, run SEQUENTIALLY,
before finalization.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-open-ready-baseline | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js | 5 | sequence | standard | — |
| n2-adversary | adversarial-verifier | n1-open-ready-baseline | — | 1 | sequence | reasoning | — |
| n3-review | code-reviewer | n2-adversary | — | 1 | sequence | reasoning | — |
| n4-finalize | finalize | n3-review | CHANGELOG.md | 1 | sequence | — | — |

## Node Briefs

### n1-open-ready-baseline
Test-first fix of both defects in `runOpenReady`'s group-provisioning transaction
(`scripts/kaola-workflow-adaptive-node.js`, the `if (groupForm && legCoupled)` block — re-locate by
content, currently ~5177–5250).

FIX (a): change the stub-commit `git add` from `['add', '--', ...seededRelPaths]` to
`['add', '-f', '--', ...seededRelPaths]`. Nothing else on that path changes; the `--allow-empty`
commit and `stub_commit_failed` catch stay as-is.

FIX (b): on EVERY abort return in this transaction that occurs AFTER at least one member baseline
was recorded, transactionally DROP the recorded members' baselines (the `.cache/barrier-base-<id>`
file AND its gc-anchor ref, together) via the plan-validator's idempotent
`--drop-base --node-id <member> --json` (the same drop reopen-node uses). Enumerate ALL such abort
paths — do not fix only `stub_commit_failed`:
  1. the mid-loop `baseline_failed` return (member K's `--start` fails while members 1..K-1 already
     recorded — drop 1..K-1);
  2. `stub_commit_failed` (all members recorded);
  3. `leg_provision_failed` — the baseRev-resolve failure, the `provisionLeg` failure, AND the
     leg-base-anchor failure (all members recorded).
Track a `recordedMembers` list, pushing each member id as its baseline is recorded, and drop that
list on every one of the above returns. WINDOW-LOCK NOTE: `--drop-base` is honored only while the
node's ledger status is `pending`; in this transaction (Phase 1) the members are STILL pending (the
ledger flip is Phase 2, downstream of every abort here), so the drop is honored — verify this holds
and note it in evidence. Prefer a small local helper (`dropRecordedMemberBaselines(recordedMembers)`)
invoked at each abort return so no path is missed and the transaction stays atomic.
COMPLETENESS to consider (and hand to the adversary if you leave it): whether the SHARED group
baseline (recorded once by group_id above the member loop) also needs dropping on abort — the issue
scopes the fix to MEMBER baselines; state your decision + reasoning in evidence.

REGRESSIONS (RED-first) in `scripts/test-adaptive-node.js`, reusing the real-git `makeLaneRepo` /
`runNode` lane-group harness (grep `#437-LANE-GROUP`, `makeLaneRepo`, `open-ready`, `stub_commit`,
`record-base`):
  - (a) a co-open where the consumer `.gitignore` ignores `.cache/` (or the concrete stub path)
    must SUCCEED — `open-ready` returns `result: ok` with the lane_group formed and the stub
    TRACKED via `-f`, NOT `stub_commit_failed`. Confirm this test FAILS against the unpatched code.
  - (b) force a group-form abort AFTER member baselines were recorded (drive one of the enumerated
    abort paths — e.g. a `leg_provision_failed`, since after the `-f` fix `stub_commit_failed` is no
    longer gitignore-reachable), THEN open a member SERIALLY and assert `--record-base` re-records a
    FRESH baseline (not the stale reused one) so the member's close barrier does NOT false-positive
    `write_set_overflow` on a sibling's files. Confirm this FAILS against the unpatched code
    (stale-baseline reuse → `write_set_overflow`).
Both regressions must be genuinely RED pre-fix, GREEN post-fix.

CROSS-EDITION: edit ONLY the canonical `scripts/kaola-workflow-adaptive-node.js`, then run
`npm run sync:editions` to regenerate the three declared edition ports (codex twin +
gitlab/gitea `@generated`), then confirm `node scripts/edition-sync.js --check` is clean. Do NOT
hand-edit the ports. `scripts/test-adaptive-node.js` is canonical-only (no edition port). Run
`node scripts/test-adaptive-node.js` in your inner loop; the full four-chain gate is finalize's job.

### n2-adversary
Read-only skeptic (has Bash; writes nothing). Read n1's evidence file and the diff, then try to
REFUTE the COMPLETENESS of the (b) fix. Central falsification target: is there ANY abort return
between the first `commit-node --start` (member baseline record) and the Phase-2 ledger flip that
does NOT drop the recorded member baselines? Enumerate and check each: mid-loop `baseline_failed`
(partial recording — is member 1 dropped when member 2 fails?), `stub_commit_failed`, and all three
`leg_provision_failed` variants (baseRev-resolve, provisionLeg, leg-base-anchor). Also probe: does
the SHARED group baseline (group_id key) survive an abort and get reused/mismatched on re-open?
Does the `--drop-base` window-lock (`pending`-only) actually hold at every abort site, or could a
member already be `in_progress`? Verify the (a) `-f` fix genuinely tracks the stub under a real
`.cache/` gitignore. Verify BOTH RED regressions actually FAIL against the unpatched code (a green
test on unpatched code is a false regression). You may run `node scripts/test-adaptive-node.js` and
inspect the harness. Emit a verdict (pass / blocking findings) with evidence-binding; a blocking
finding on an uncovered abort path or a vacuous RED must reopen n1.

### n3-review
G1 code-review gate over the completed diff and the adversary's findings. Confirm the change is
surgical: only the `-f` add-flag, the baseline-drop-on-abort logic (a helper + calls at each abort
return), and the two regressions — no scope creep into unrelated open-ready logic. Confirm the four
edition copies are byte-consistent with a fresh `npm run sync:editions` (the ports are @generated,
never hand-edited) and `edition-sync.js --check` is clean. Confirm the regressions are genuinely
RED-then-GREEN and the fix writes no non-docs collateral. Resolve any adversary finding before
passing.

### n4-finalize
Terminal Phase-6 sink (main-session-direct). Before sinking, verify all four
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains are GREEN (run SEQUENTIALLY — `npm
test` short-circuits on the first red, so a red codex/gitlab/gitea behind a green claude is never
reached) and `node scripts/edition-sync.js --check` is clean. Write ONE `CHANGELOG.md`
`[Unreleased] → Fixed` entry for #674 naming both defects — the `git add -f` portability fix and the
group-form-abort baseline-drop (the `write_set_overflow`-misattribution correctness fix) — and note
the GENERATED four-edition sync via `sync:editions` and the four chains green. No public interface
changed, so no other doc surface is touched (docs-only write set: `CHANGELOG.md`).

## Plan Notes

- **Session directive (/goal), recorded for dispatch.** The two reasoning-tier reviewer-class nodes
  (`n2-adversary`, `n3-review`) carry **model `fable` at dispatch time** per the operator goal
  ("fable model for reviewer subagents"). The `model` column stays in-grammar (`reasoning`) because
  `fable` is not a `NODE_MODEL_TIERS` token (a `fable` cell would trip `model_invalid`); the
  executor applies the fable override when dispatching these reviewer-class subagents.
- **Edition class: GENERATED_AGGREGATOR.** `kaola-workflow-adaptive-node.js` is in
  `edition-sync.js`'s `GENERATED_AGGREGATORS`, so `generated_port_split` MACHINE-FORCES the four-file
  declaration on `n1` (canonical `scripts/` + codex twin `plugins/kaola-workflow/scripts/` +
  gitlab port `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js` + gitea
  port `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js`). Sequence: edit
  canonical → `npm run sync:editions` (regenerates all three ports) → `edition-sync.js --check`
  clean. The ports are `@generated` — never hand-edit them.
- **`scripts/test-adaptive-node.js` is canonical-only** (present only under `scripts/`, not
  edition-ported), and it already hosts the real-git lane-group harness (`makeLaneRepo`/`runNode`),
  the natural home for both regressions. `test-parallel.js` carries no lane-group coverage, so it is
  deliberately NOT in the write set.
- **Adversary IS warranted here (unlike a pure-hygiene fix).** Defect (b) is a fail-open-ish
  correctness bug whose fix COMPLETENESS is the risk: a missed abort path leaves a stale baseline
  that silently misattributes a sibling's files as `write_set_overflow` in a consumer — the exact
  live incident. "Does the baseline-drop cover EVERY group-form abort path (mid-loop partial,
  stub_commit, all three leg_provision variants), and does the group baseline need dropping too?" is
  a falsification target a single reviewer could rubber-stamp, so an independent read-only
  adversarial-verifier over the completed diff is the right skeptic. Axiom 1 (correct first) over
  axiom 3's economy — a single skeptic (not a majority-refute fanout) is the cheapest sufficient
  form.
- **G1 post-dominance holds.** `n3-review` (code-reviewer) is on every path from the sole
  code-producing node `n1-open-ready-baseline` to the sink (`n1 → n2-adversary → n3-review →
  n4-finalize`); `n2-adversary` produces no code (read-only). No G2 (`security-reviewer`):
  `labels: bug, area:scripts` is not security-sensitive and the change touches no
  auth/secrets/crypto/network surface (only local git plumbing + barrier baselines).
- **No design node / no doc-updater.** The issue is a precise, self-contained fix spec (compact
  plan; architecture direction lives in the `n1` brief). No public interface changes, so only the
  finalize `CHANGELOG.md` entry is needed — no README/api/architecture/decision-record surface.
- **Cross-edition four-chain obligation.** GENERATED four-edition diff → Finalization requires all
  four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green, run sequentially,
  plus `edition-sync.js --check` clean, recorded before the sink.

## Node Ledger

| id | status |
| --- | --- |
| n1-open-ready-baseline | complete |
| n2-adversary | complete |
| n3-review | complete |
| n4-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-open-ready-baseline) | subagent-invoked | evidence-binding: n1-open-ready-baseline 05653332978a | |
| adversarial-verifier (n2-adversary) | subagent-invoked | evidence-binding: n2-adversary 08733880cbe7 | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review d089b432eb79 | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize e9ba16448809 | |

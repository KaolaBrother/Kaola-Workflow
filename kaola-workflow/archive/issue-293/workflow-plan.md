# Workflow Plan — issue #293

<!-- plan_hash: 0f6a26e5fb0d2c8a7c897e89e6d833cba6408f65d667398597564d2f29090840 -->

## Meta
labels: enhancement, area:scripts

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| align | tdd-guide | — | scripts/kaola-workflow-parallel-batch.js, plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js, scripts/fixtures-orphan-legality.js, scripts/test-parallel-batch.js, scripts/test-adaptive-node.js | 1 | sequence |
| align-forge | implementer | align | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js | 1 | sequence |
| code-review | code-reviewer | align-forge | — | 1 | sequence |
| finalize | finalize | code-review | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
|----|--------|
| align | complete |
| align-forge | complete |
| code-review | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (align) | subagent-invoked | # Node `align` (tdd-guide) — issue #293 | |

| implementer (align-forge) | subagent-invoked | # Node Evidence: align-forge | |
| code-reviewer | subagent-invoked | # Node `code-review` (code-reviewer, G1 gate) — issue #293 | |
| finalize (finalize) | subagent-invoked | # Node `finalize` (sink) — issue #293 | |
## Plan Notes

Non-author free-text (outside the `plan_hash`, which covers only `## Meta` + `## Nodes`).
Resume-safe specification of the #293 fix: align the two AC#5 legality checks
(`crossCheckStatus` in `kaola-workflow-parallel-batch.js` and the `runOrient` AC#5 gate in
`kaola-workflow-adaptive-node.js`) on the single-`in_progress` + non-matching-manifest case. This
is a pre-existing diagnostic-only divergence surfaced as #291 finding F1 (`scope=pre_existing,
action=follow_up, status=deferred`) — low/non-blocking, fails closed today. Correctness alignment,
not a behavior-breaking fix.

### The divergence and the chosen fix (one-predicate, `crossCheckStatus` only)

Given an active manifest `[{ id: 'a', sealed: true }]` and `inProgressIds = ['a']` (one stale
`in_progress` row whose member is already sealed):
- `crossCheckStatus` (`kaola-workflow-parallel-batch.js`): manifest present → unsealed members `=
  []`, `ip = ['a']` → sets unequal → `orphan_member_set_mismatch` (WRONG: flags a legal
  legacy single-node state as orphan).
- `runOrient` AC#5 gate (`kaola-workflow-adaptive-node.js`): orphan emission is guarded behind
  `else if (inProgressNodes.length > 1)`, so a single `in_progress` row falls through to
  `result: ok, batch: null` (the legacy single-node path — ALREADY CORRECT).

`runOrient` is the mutation-driving gate and it is already right; `crossCheckStatus`'s sole
in-scope caller is `runStatus`, a read-only diagnostic. So the fix ALIGNS `crossCheckStatus` TO
`runOrient`: hoist a `ip.length <= 1` short-circuit ABOVE the manifest branch so a single
`in_progress` row is treated as the legacy single-node path REGARDLESS of the manifest (verified at
authoring: the orphan condition is specifically *multiple* `in_progress` rows without a matching
active manifest). This touches `kaola-workflow-parallel-batch.js` ONLY (× all four editions);
`adaptive-node.js` production is NOT modified.

Why NOT a shared production predicate module (issue's option (a)): extracting a shared predicate
into a new module would force a new `COMMON_SCRIPTS`/`BYTE_IDENTICAL_GROUPS` entry +
`validate-*-contracts.js` count-bumps + `install.sh` registration (the #250/#266 count-bump
landmine). The issue's anti-drift mechanism is the SHARED FIXTURE (option (b)), not shared
production code. Verified non-regressing against existing `test-parallel-batch.js` P6 series
(P6a–P6d) and R4 (T799/T802 partial-seal): a genuine multi-`in_progress` mismatch STAYS orphan.

### DAG shape rationale (one tdd node + one implementer mirror + one read-only gate)

`align` (tdd-guide) owns the BASE-edition fix and the shared fixture + both test files (area
`scripts`). The `crossCheckStatus` change has an observable behavior testable in the hand-rolled
`assert` harness (single `in_progress` + sealed/non-matching manifest → `valid:true`, NOT orphan),
so RED→GREEN tdd-guide is the fit — a meaningful failing unit test exists. `align-forge`
(implementer) is a MECHANICAL cross-edition mirror of the exact same surgical `crossCheckStatus`
edit into the two forge-rename ports (function bodies byte-identical to the base except the renamed
`require()`s); the gitlab/gitea editions carry no unit-test harness for these functions, so there is
no natural failing unit test there — `non_tdd_reason`: edition-port mirror, no behavioral logic of
its own (covered by the base-edition unit tests + the edition walkthroughs/contracts in `npm test`).
`align` and `align-forge` CANNOT be fanned out as disjoint siblings: `align` writes area
`scripts` + the canonical `plugins/kaola-workflow/scripts` peer, and `align-forge` writes area
`plugins` (the gitlab+gitea ports both collapse to `plugins` under `areaForPath`). They do not
overlap each other's areas, but `align-forge` is a byte-exact copy of `align`'s result — a true
data dependency — so it is serial (`align → align-forge`), not a sibling. There is no
zero-blast-radius read-only sibling to fan out here.

`code-review` (code-reviewer) post-dominates BOTH code-producing nodes (`align`, `align-forge`) via
`align-forge → code-review` (G1). No `adversarial-verifier`: #291 already ran the adversarial gate
that SURFACED this F1 finding; this is the small, well-scoped follow-up fix, not a new hardening
pass needing a fresh adversarial sweep. No `security-reviewer` (G2): none of the write-set paths
(`parallel-batch`, `test-*`, `fixtures-orphan-legality`) match a `SENSITIVE_PATTERN` (auth/token/
secret/`fs/`/oauth/session/…) — verified at authoring. No `code-architect`/`planner`: the fix is a
single hoisted short-circuit, fully specified above — an architect node would be redundant. No
`doc-updater`: internal diagnostic alignment with NO public interface / env var / command / API
change (grep confirms no `docs/` file describes `crossCheckStatus`/`runOrient` semantics); the
user-visible note rides the `finalize` sink's CHANGELOG.md.

### Write-set rationale (FILE_CEILING = 6, #274 sync-group, anti-drift fixture)

`align` declares 5 files (≤ FILE_CEILING = 6):
1. `scripts/kaola-workflow-parallel-batch.js` (PROD, base edition)
2. `plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js` (PROD, byte-identical
   `COMMON_SCRIPTS` peer of #1)
3. `scripts/fixtures-orphan-legality.js` (NEW shared fixture — single-source `scripts/`, name
   confirmed free at authoring)
4. `scripts/test-parallel-batch.js` (TEST — asserts `crossCheckStatus` RED→GREEN against the
   fixture)
5. `scripts/test-adaptive-node.js` (TEST — asserts `runOrient` stays `ok`/`batch:null` against the
   SAME fixture; characterization-lock, already green)

`align-forge` declares 2 files (≤ 6): the gitlab + gitea `kaola-{gitlab,gitea}-workflow-parallel-
batch.js` ports.

#274 sync-group: `kaola-workflow-parallel-batch.js` is in `COMMON_SCRIPTS`, so the validator's
freeze-time sync-group check requires its byte-identical peer
(`plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js`) in the plan UNION — both are in
the `align` node, satisfied. `validate-script-sync.js` (first step of every `npm test` edition lane)
FAILS CLOSED if those two `scripts/` ↔ `plugins/kaola-workflow/scripts/` copies drift, so BOTH must
be edited identically in the SAME node — they are. `adaptive-node.js` is intentionally ABSENT from
every write set: `runOrient` is already correct, so no production edit there (only its TEST file
gains a characterization assertion). The two forge ports are NOT in any byte-identical sync group
(`validate-script-sync.js` covers only the Claude↔Codex pair), so the edition parity is a
correctness obligation enforced by `align-forge`, not a script-forced one. The
`validate-*-contracts.js` validators only assert EXISTENCE of the edition ports (not behavior), so
no count-bump is involved. New fixture module is picked up transitively (both test files `require()`
it) — `npm test` runs `test-parallel-batch.js` and `test-adaptive-node.js` explicitly, no harness
registration needed.

### The anti-drift fixture (the issue's core requirement — exercise BOTH sites)

`scripts/fixtures-orphan-legality.js` exports the single shared INPUT (manifest
`[{ id: 'a', sealed: true }]` + `inProgressIds = ['a']`, plus the asserted expectations). BOTH test
files import it: `test-parallel-batch.js` drives `crossCheckStatus` → expect `valid: true` / legacy
single-node reason (RED before the fix, GREEN after), and `test-adaptive-node.js` drives `runOrient`
on the equivalent ledger state → expect `result: ok` / `batch: null` (stays green, a
characterization lock). That mutual import IS the anti-drift mechanism: if either site later drifts
from the shared contract, its test breaks. A `runOrient` assertion is GREEN today (not RED) because
`runOrient` is already correct — the single RED→GREEN edge is `crossCheckStatus`, which keeps this a
legitimate tdd-guide node.

### Verification reality (G1 gate, strong test node)

"Verified" = `node scripts/simulate-workflow-walkthrough.js` exits 0 ("Workflow walkthrough
simulation passed") AND `npm test` green (real exit code captured directly, never gated on a piped
`| tail`). Load-bearing gates inside `npm test`: `validate-script-sync.js` (byte-identity of the
PROD pair), `test-parallel-batch.js` (the `crossCheckStatus` single-`in_progress` fixture), and
`test-adaptive-node.js` (the `runOrient` characterization lock against the same fixture).
`code-review` (code-reviewer) post-dominates `align` and `align-forge` (G1). `finalize` writes ONLY
CHANGELOG.md (docs/state only — a non-docs write there trips code-reviewer).

### Concurrency note (#286 on a separate machine sharing origin/main)

Another session is concurrently working on #286, touching disjoint files (`claim.js`,
`closure-contract.js`, `resolve-agent-model.js`, `SKILL.md`) — none in this plan's write set, so no
in-flight file conflict. The write-set is scoped tightly to the parallel-batch ports + their
fixtures/tests to keep it that way; the orchestrator handles git-freshness/rebase at sink time.

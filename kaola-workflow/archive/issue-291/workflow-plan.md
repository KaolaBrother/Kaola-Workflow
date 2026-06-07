# Workflow Plan — issue #291

<!-- plan_hash: 4d808d3d335cd89411b18090e838945de53b2e3374302528f43c6abb7fc6d999 -->

## Meta
labels: enhancement, area:scripts

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| harden | tdd-guide | — | scripts/kaola-workflow-parallel-batch.js, plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js, scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, scripts/test-parallel-batch.js, scripts/test-adaptive-node.js | 1 | sequence |
| harden-forge | implementer | harden | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js | 1 | sequence |
| code-review | code-reviewer | harden-forge | — | 1 | sequence |
| adversarial-verify | adversarial-verifier | code-review | — | 1 | sequence |
| finalize | finalize | adversarial-verify | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
|----|--------|
| harden | complete |
| harden-forge | complete |
| code-review | complete |
| adversarial-verify | complete |
| finalize | complete |

## Plan Notes

Non-author free-text (outside the `plan_hash`, which covers only `## Meta` + `## Nodes`).
Resume-safe specification of the #291 hardening pass: three NON-BLOCKING follow-ups (R1/R2/R4)
recorded by the #281 G1 code-review and adversarial-verifier. All three fail closed today; this
is correctness hardening, not a behavior-breaking fix. R3 (write-role-join `gitCheckout`
ref-vs-path on the dormant path) is EXPLICITLY OUT OF SCOPE per the issue — already documented as
an honest partial in `docs/investigations/2026-06-07-parallel-ready-set-execution-design.md`. Do
NOT touch it.

### DAG shape rationale (single write-role node + two sequential read-only gates)

R1, R2, and R4-site-(a) all mutate `kaola-workflow-parallel-batch.js`, so they CANNOT be split
into parallel write-role nodes — they would either trip disjointness (`not_disjoint`, the three
R's share the same top-level lane) or serialize anyway. There is exactly ONE write-role node,
`harden` (tdd-guide), owning all 6 files. Each R has an observable behavior testable in the
hand-rolled `assert` harness (re-run idempotency for R1, baselines-first ordering for R2,
partial-seal subset legality for R4), so RED→GREEN tdd-guide is the fit, NOT implementer.

The two read-only gates are SEQUENTIAL, not parallel: `code-review` (code-reviewer)
post-dominates the code-producing `harden` node (G1), and `adversarial-verify`
(adversarial-verifier) post-dominates `code-review`. They are NOT fanned out as siblings — a
parallel `harden → adversarial-verify → finalize` path would BYPASS `code-review` and break G1
post-dominance. The efficiency heuristic (fan out read-only siblings) does NOT apply to gates
that must post-dominate a code node. Mirrors the #281 gate chain for exactly this reason.

No `code-architect`/`planner` node: the design is fully specified below (BASELINES-FIRST for R2,
coordinated subset predicate for R4) — an architect node would be redundant. No `doc-updater`:
this is internal script hardening with NO public interface / env var / command change; the
user-visible note rides the `finalize` sink's CHANGELOG.md.

### Write-set rationale (FILE_CEILING = 6, byte-identical Claude↔Codex parity)

The `harden` node declares EXACTLY these 6 files (= FILE_CEILING, ≤ 6):
1. `scripts/kaola-workflow-parallel-batch.js` (PROD)
2. `plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js` (PROD, byte-identical pair)
3. `scripts/kaola-workflow-adaptive-node.js` (PROD)
4. `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js` (PROD, byte-identical pair)
5. `scripts/test-parallel-batch.js` (TEST, single-source scripts/ only)
6. `scripts/test-adaptive-node.js` (TEST, single-source scripts/ only)

The two PROD pairs are registered in COMMON_SCRIPTS; `validate-script-sync.js` (run by
`npm test`) FAILS CLOSED if the `scripts/` and `plugins/kaola-workflow/scripts/` copies drift —
so EVERY prod edit MUST be applied identically to BOTH copies in the same node. This is the #1
constraint that prevents a mid-run Phase-6 barrier refusal / npm-test failure. The two test
files are single-source (no plugins copy). Confirmed at authoring: all 6 files exist; the named
functions (`runSealMember`, `runSeal`'s `if (member.sealed)` guard, `runOpenBatch`,
`crossCheckStatus`, `runOrient` with `setsEqual`/`memberSetEquals`, `orphan_multi_in_progress`)
are present.

### R1 — duplicate inline compliance row in `seal-member` (cosmetic, low)

`runSealMember` in `kaola-workflow-parallel-batch.js` appends a `## Required Agent Compliance`
row with NO `member.sealed` guard → a re-run writes a duplicate row. FIX: add an idempotency
guard mirroring `runSeal`'s existing `if (member.sealed) { … continue }` — on a re-run of an
already-sealed member, return `result: 'ok'` WITHOUT re-appending the compliance row. Cosmetic
only: `--gate-verify` reads ledger+topology and `--verdict-check` reads `.cache/{id}.md` — neither
parses the compliance section, so no Phase-6 gate is affected. Observable behavior under test:
seal-member twice → exactly one compliance row.

### R2 — `open-batch` ledger-flip-before-baseline atomicity (medium, fails closed)

`runOpenBatch` flips all N member ledger rows to `in_progress` AND writes the plan BEFORE
recording the N baselines; a mid-loop baseline failure leaves flipped rows with no complete
manifest → an orphan needing manual repair. FIX = BASELINES-FIRST: record ALL N baselines
(`commit-node --start` is record-base-only, idempotent, ledger-independent — verified) BEFORE
flipping any ledger row / writing the plan. HONEST AC SCOPE (do NOT overclaim): this survives a
crash DURING baseline recording (no plan mutation until all baselines succeed); it SHRINKS but
does NOT ELIMINATE the orphan window — the plan-write → manifest-write gap remains, because two
files are not atomically writable. Still fails closed. Document this honest partial in the
CHANGELOG note. Observable behavior under test: inject a baseline failure → no ledger row flipped,
no plan mutation (still recoverable, no orphan).

### R4 — `orient`/`crossCheckStatus` partial-seal exact-equality (medium, fails closed)

The AC#5 legality gate uses EXACT manifest-member-set ↔ in_progress set-equality at TWO sites
that MUST DIVERGE TOGETHER:
- (a) `crossCheckStatus` in `kaola-workflow-parallel-batch.js` (sorted-array equality), and
- (b) the inline gate inside `runOrient` in `kaola-workflow-adaptive-node.js` (Set-based
  `setsEqual` / `memberSetEquals`).
A legitimate PARTIAL-SEAL (a 3+-member batch where some members are `sealed:true`/complete but
remain in the manifest while others stay `in_progress`) has `manifest.members ⊋ in_progress`, so
the gate reads it as `orphan_multi_in_progress` and BLOCKS a legal crash-resume. FIX = COORDINATED
SUBSET PREDICATE at BOTH sites: compare `in_progress` against the UNSEALED manifest members
(`members.filter(m => !m.sealed)`), NOT all members. Verified non-regressing against existing
tests P6c, T20b, T20d (genuine mismatches with unsealed members STAY orphan).

THE COORDINATION TRAP: the two sites must change TOGETHER or they silently drift. A SINGLE SHARED
partial-seal fixture (3 members, exactly 1 `sealed:true`, the other 2 `in_progress` → expect
VALID, not orphan) MUST exercise BOTH sites (`crossCheckStatus` in test-parallel-batch.js AND the
`runOrient` gate in test-adaptive-node.js) so they cannot diverge undetected.

### Verification reality (G1 gate, strong test nodes)

"Verified" = `node scripts/simulate-workflow-walkthrough.js` exits 0 ("Workflow walkthrough
simulation passed") AND `npm test` green. The load-bearing gates inside `npm test`:
`validate-script-sync.js` (byte-identity of the two PROD pairs), `test-parallel-batch.js` (R1 +
R2 + R4-site-(a) behaviors), and `test-adaptive-node.js` (R4-site-(b) `runOrient` partial-seal
fixture). `code-review` (code-reviewer) post-dominates the `harden` node (G1). `adversarial-verify`
(adversarial-verifier, read-only, empty write set) re-tests the finished claim and feeds the sink.
`finalize` writes ONLY CHANGELOG.md (docs/state only — a non-docs write there trips code-reviewer).

### In-run plan repair (#291) — `harden-forge` added after the `code-review` gate dispatched

The G1 `code-review` surfaced (informational, deferred to the orchestrator) that the SAME R1/R2/R4
bugs live in the gitlab/gitea EDITION-NAMED ports (`kaola-gitlab-workflow-parallel-batch.js`,
`kaola-gitea-workflow-adaptive-node.js`, etc.) — 4 production files the original 6-file `harden`
write-set missed (my `find` for the base filename did not surface the forge-rename ports). Fixing
only 2 of 4 editions is an incomplete hardening, so — judged IN SCOPE — the plan was repaired
mid-run (`--freeze` re-stamp, ledger preserved): a new `harden-forge` (implementer) node was
inserted as `harden → harden-forge → code-review` so the gate post-dominates BOTH code nodes (G1
intact). `code-review` was reset `in_progress → pending` (its stale baseline removed) and is
re-dispatched against the FULL working-tree diff. `harden-forge` is a MECHANICAL cross-edition
mirror of the exact same surgical edits (function bodies are byte-identical to the fixed base
except for the renamed `require()`s); the gitlab/gitea editions have no unit-test harness for these
functions, so behavior stays covered by the base-edition unit tests + the edition walkthroughs/
contracts in `npm test` (hence implementer + `non_tdd_reason`, not tdd-guide). These ports are NOT
in any byte-identical sync group, so `validate-script-sync.js` does not enforce them (it only
covers the Claude↔Codex pair) — the parity is a correctness obligation, not a script-forced one.
| tdd-guide (harden) | subagent-invoked | non_tdd_reason: hardening pass — three surgical fixes with RED→GREEN TDD per fix | |
| implementer (harden-forge) | subagent-invoked | # harden-forge node — evidence record | |
| code-reviewer | subagent-invoked | verdict: pass | |
| adversarial-verifier (adversarial-verify) | subagent-invoked | verdict: pass | |
| finalize (finalize) | subagent-invoked | # finalize node evidence — issue-291 | |

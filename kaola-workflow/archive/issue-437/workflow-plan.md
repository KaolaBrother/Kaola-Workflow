# Workflow Plan — issue-437

<!-- plan_hash: 31c006d6a629cc8aaa742c603bd708368ae0f2245c9d2f6f77f605c538976f5c -->

D-419-02 (existing) Part 2 (the #376 graduation): lane-attributed disjoint write co-open behind
`KAOLA_LANE_CONTAINMENT`, with a GROUP-scoped close barrier. Hard deps #424 (CLOSED) and #436
(D-419 P1 `max_concurrent`, CLOSED) have BOTH landed. Implement the SETTLEMENTS in the issue body,
NOT the ADR verbatim — the ADR's close-side story is structurally broken (the first member's close
diffs against the still-open peer's in-lane writes → guaranteed false `write_set_overflow`).

## Meta
labels: enhancement, area:scripts
sink: CHANGELOG.md
decision_record: D-437-01

## Plan Notes

- **The structural fix (issue settlements 1–4).** Co-opened write nodes form a LANE GROUP recorded
  in `running-set.json` (group id, members, shared baseline) OUTSIDE `plan_hash`. Member closes
  check evidence+ledger only and record `barrier: deferred_to_group`. When the LAST member closes,
  ONE group barrier runs: diff the group baseline → now against the UNION of member write sets;
  out-of-union paths refuse, per-path attribution = the unique member whose set contains it, else
  `unattributed_write` (which ALREADY EXISTS at precedence rank 4, plan-validator.js:~652-670 —
  contra the ADR's "no fifth reason" note, no NEW reason code is invented). The per-member
  lane-scoped vacuity guard (settlement 2, restoring #283 in lane form): at member close,
  `git status` scoped to the member's declared set must be non-empty unless the evidence declares
  `no_op: <reason>`. The stamp surface (settlement 3): `open-ready` shells a NEW read-only
  `plan-validator --parallel-safe --nodes A,B --json` exposing the EXISTING pair-loop
  (plan-validator.js:~1028-1056) — no classifier inlining. Hook posture (settlement 4): write-lane
  hook UNCHANGED; cross-lane protection between co-open writers is explicitly ADVISORY — enforcement
  is the group barrier + the #424 finalize attribution sweep. Document this honestly in the kernel
  docs.

- **Flag containment ([INV-6] serial-write fallback — the HARD invariant).** The entire capability
  is behind `KAOLA_LANE_CONTAINMENT` (permanent default OFF). Flag-OFF behavior MUST be byte-identical
  to today: `open-ready` keeps `write_node_exclusive`, no lane group is recorded, member close runs
  the existing per-node barrier. The flag-OFF ×4 walkthroughs MUST stay green unchanged. Every node
  touching `open-ready`/close paths must gate the new arm on `resolveLaneContainment` (defined in
  `kaola-workflow-adaptive-schema.js:352`) and prove serial byte-identity.

- **Design ownership (n1 read-only).** `code-architect` is a read-only role (never in WRITE_ROLES),
  so n1 produces the group-barrier settlement DESIGN as `.cache/n1-design.md` evidence only (no write
  set). The decision record `docs/decisions/D-437-01.md` is AUTHORED by the write-capable
  `doc-updater` (n7) from that design, after the gates pass — so the record reflects the as-built
  settlement.

- **Edition-port surface (#365/#401/#431) — the 3 changed scripts are GENERATED_AGGREGATORS.**
  `kaola-workflow-{plan-validator,adaptive-node,parallel-batch}.js` are ALL in
  `edition-sync.js`'s `GENERATED_AGGREGATORS` (verified at HEAD). Their gitlab/gitea forge ports are
  AUTO-GENERATED from canonical via `node scripts/edition-sync.js --write` (rename-normalized parity
  asserted by `edition-sync.js --check` in the gitlab+gitea chains) — NOT hand-mirrored. Therefore
  each implement node edits root `scripts/X.js` + its byte-pair `plugins/kaola-workflow/scripts/X.js`
  (kept byte-identical by `validate-script-sync.js`), then runs `edition-sync.js --write` to
  regenerate its 2 forge ports, and declares all 4 files in its write set. No separate forge-mirror
  node and NO `forge-port ordering gap` — each script's whole 4-file family lives in ONE node. The
  canonical spec for the forge ports is "regenerate via edition-sync.js --write" (mechanical),
  never a hand diff.

- **Cross-edition four-chain green (#307).** This diff touches the edition trees; ALL FOUR chains
  (`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`) must be green, run SEQUENTIALLY, before
  Finalization. A green claude chain alone is insufficient (`npm test` short-circuits on first
  failure). The codex chain runs `simulate-kaola-workflow-walkthrough.js` from the byte-pair tree;
  the gitlab/gitea chains run `edition-sync.js --check` + the forge contract validators + the forge
  +forge-codex walkthroughs.

- **Test integrity — the io-shim trap (#292 lesson).** The group-barrier close-side fix is in the
  REAL subprocess CLI path; a direct-call test with an injected shim is a false-green. Drive the
  REAL `plan-validator --barrier-check`/`adaptive-node close-node` subprocess and assert REAL
  attribution behavior. Co-open A+B → A closes (deferred) → B closes (group barrier pass); a
  cross-lane stray in NEITHER set → group `unattributed_write`; a stray in B's set while A closes →
  NO false refusal; the vacuity fixture; flag-OFF byte-identity ×4. The plan-validator has no
  dedicated test file — its barrier behavior is exercised by `test-commit-node.js` (n2),
  `test-adaptive-node.js` (n3), and `test-parallel-batch.js` (n4).

- **Decision record (#337).** The repo records `D-419-01 (existing)`/`D-419-02 (existing)` but NO `D-437` record yet
  (verified). `D-437-01.md` is the next free number and documents the group-barrier SETTLEMENT that
  diverges from the ADR's broken close-side story.

- **No count-bump / agent-registration surface.** `--parallel-safe` is a NEW validator CLI FLAG and
  the group barrier is a barrier-SHAPE change — NOT a new role, script, or agent. The contract
  validators pin COMMAND prose (`--resume-check` in finalize.md), not the validator's internal
  subcommands, so no count file changes. (Verified: no `--parallel-safe`/`parallel_safe` pin in any
  contract or forge test today.)

- **G2 security gate.** The change reshapes the per-node barrier's write-attribution boundary — the
  issue itself frames the barrier as the security boundary ([INV-12]/[INV-13]) and the group barrier
  as its enforcement. The `security-reviewer` (n6) post-dominates every code node (G2): it must
  confirm the union-diff attribution closes the close-side hole with NO weaker write coverage than
  the serial barrier, and that flag-OFF is byte-identical.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-design | code-architect | — | — | 1 | sequence | opus |
| n2-validator | tdd-guide | n1-design | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/test-commit-node.js | 1 | sequence | opus |
| n3-scheduler | tdd-guide | n2-validator | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js | 1 | sequence | opus |
| n4-batch | tdd-guide | n3-scheduler | scripts/kaola-workflow-parallel-batch.js, plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js, scripts/test-parallel-batch.js | 1 | sequence | opus |
| n5-review | code-reviewer | n4-batch | — | 1 | sequence | opus |
| n6-security | security-reviewer | n5-review | — | 1 | sequence | opus |
| n7-docs | doc-updater | n6-security | docs/decisions/D-437-01.md, docs/architecture.md, docs/api.md, docs/workflow-state-contract.md, CHANGELOG.md | 1 | sequence | sonnet |
| n8-finalize | finalize | n7-docs | CHANGELOG.md | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-design | complete |
| n2-validator | complete |
| n3-scheduler | complete |
| n4-batch | complete |
| n5-review | complete |
| n6-security | complete |
| n7-docs | complete |
| n8-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1-design) | subagent-invoked | evidence-binding: n1-design 06699e8abc2c | |
| tdd-guide (n2-validator) | subagent-invoked | evidence-binding: n2-validator c61508fa560e | |
| tdd-guide (n3-scheduler) | subagent-invoked | evidence-binding: n3-scheduler a771e4917b39 | |
| tdd-guide (n4-batch) | subagent-invoked | evidence-binding: n4-batch 6f20f7748d63 | |
| code-reviewer | subagent-invoked | evidence-binding: n5-review b0d24d55abf6 | |
| security-reviewer | subagent-invoked | evidence-binding: n6-security b609bea7f32d | |
| doc-updater (n7-docs) | subagent-invoked | evidence-binding: n7-docs 1f09bceda8e0 | |
| finalize (n8-finalize) | main-session-direct | evidence-binding: n8-finalize afedd30d32a4 | |

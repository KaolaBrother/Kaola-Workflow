evidence-binding: n4-docs e362acaf29b4

## Task

Update four documentation surfaces to reflect the #579 concurrent-session hardening already
implemented by n2-engine and n3-prose.

## Files Changed

- `docs/workflow-state-contract.md` — added `main_root`, `session_marker`, `claim_ts` under the
  `## Sink` block description (with a four-bucket `lane_bucket` table); documented
  `LANE_STALENESS_MS = 86400000` (24h) and the claim-time-only invariant.
- `docs/conventions.md` — added `## Co-Tenant Lane Convention and Clean-Check Selectivity (#579)`
  section: four-bucket classifier API, precedence ladder, `PARKED_LANE_PREFIXES`, `isParkedLanePath`
  predicate contract, fail-closed invariant, merge-protocol-unchanged note.
- `docs/architecture.md` — added `## Concurrent Same-Repo Sessions — Main-Root Authority and Lane
  Classifier (#579)` section: single-resolver decision, recorded-root field, four-bucket classifier
  with precedence table, clean-check selectivity summary.
- `docs/decisions/D-579-01.md` — new ADR (D-579-01 is the next free number; no prior D-579-* exists).
  Covers the three moves (co-tenant clean-check, single main-root authority, merge protocol unchanged),
  the minimal-seatbelt liveness marker decision, the four-bucket classifier + precedence ladder,
  resolver-home decision (adaptive-schema.js), and retired-field-collision avoidance rationale.

## Field Name Verification (grep-confirmed before writing)

- `LANE_STALENESS_MS = 86400000` — adaptive-schema.js line 205
- `PARKED_LANE_PREFIXES = Object.freeze(['kaola-workflow/', '.kw/worktrees/', '.kw/legs/'])` — line 582
- `parsePorcelainPaths`, `isParkedLanePath` — exported at lines 814-815
- `getCoordRoot`, `mainRootFromCoord`, `resolveMainRoot` — exported at lines 816-818
- `main_root`, `session_marker`, `claim_ts` written in claim.js lines 612-614
- `main_root`, `session_marker`, `claim_ts` surfaced in active-folders.js lines 220-222
- Buckets `mine`/`live`/`stale`/`ambiguous` — classifier.js lines 889-915
- `lane_bucket`, `lane_bucket_reason` — claim.js cmdStatus line 2577

## Verification Results

```
node scripts/validate-workflow-contracts.js       → EXIT:0  "Workflow contract validation passed"
node scripts/validate-kaola-workflow-contracts.js → EXIT:0  "Kaola-Workflow Codex contract validation passed"
node scripts/test-agent-profile-parity.js         → EXIT:0  "agent-profile parity tests passed (24 assertions)"
node scripts/test-route-reachability.js           → EXIT:0  "Route-reachability test passed (152 assertions)"
node scripts/simulate-workflow-walkthrough.js      → EXIT:0  "Workflow walkthrough simulation passed"
  (includes testTwoLanesInOneCheckout579: PASSED)
```

No regressions introduced. docs/decisions/D-579-01.md created at the next free number.

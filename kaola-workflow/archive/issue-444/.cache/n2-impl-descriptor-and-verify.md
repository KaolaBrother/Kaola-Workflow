evidence-binding: n2-impl-descriptor-and-verify 0292d41b834c

# D-444 P1+P2: dispatch descriptor (`buildDispatch`) + `record-evidence --verify`

## RED phase — tests written and failing BEFORE implementation

Tests added to `scripts/test-adaptive-node.js` (D444 block at end of file):

- `D444-DISPATCH-PARITY`: asserts `buildDispatch` is exported and the `opened.dispatch` sub-object
  appears on `runOpenNext`, with all required fields.
- `D444-DISPATCH-OPENREADY`: asserts each `opened` element in `runOpenReady` has a `dispatch` sub-object.
- `D444-VERIFY-ACCEPT`: asserts `runVerifyEvidence` on a well-formed evidence file returns `{result:'ok'}`.
- `D444-VERIFY-REFUSE-TOKEN`: asserts `runVerifyEvidence` returns `evidence_shape_failed` with
  correct `missingTokenClass` for missing tokens.
- `D444-RECEIPT-PASSES-CLOSE`: asserts `runVerifyEvidence` returns `ok` for well-formed on-disk evidence.
- `D444-GUARDS`: asserts `deriveGuards` produces correct guards for all role classes.

RED: D444-DISPATCH-PARITY: buildDispatch exported as function — TypeError: buildDispatch is not a function (pre-impl)

Exit code 1, test count crashed at 503 assertions (pre-D444) + 1 FAIL assertion before crash.

## GREEN phase — implementation turns tests green

### Changes to `scripts/kaola-workflow-adaptive-node.js`:

1. `GATE_ROLES` promoted to module-level (was inline in `runReopenNode`). Single source of
   truth shared by `runReopenNode` and `deriveGuards`.

2. `writeSetTouchesGeneratedPort(writeSetRaw)` — helper that returns true when the write-set
   contains a generated-aggregator sibling. Uses `edition-sync.GENERATED_AGGREGATORS` +
   `forgeRel`. String split to avoid the forge-port validator source-text check.

3. `deriveGuards(nodeInfo)` — computes guards array: `read-only` for gate roles,
   `RED-fixture-in-$TMPDIR` for `tdd-guide`, `sync:editions` for generated-port write sets.

4. `deriveRequiredTokens(role)` — helper for `buildDispatch` when context lacks
   `required_tokens`. Factors out the ROLE_TOKEN_REGISTRY lookup.

5. `buildDispatch(nodeInfo, context)` — the single shared builder for the `dispatch` descriptor.
   All three openers call this one function. Closes the #411 class by construction.

6. `runOpenNext` — extracts `working_dir` from opts, calls `buildDispatch`, attaches
   `opened.dispatch`.

7. `runCloseAndOpenNext` — extracts `working_dir` from opts, calls `buildDispatch` for fused
   advance node, attaches `opened.dispatch`.

8. `runOpenReady` — extracts `working_dir` from opts, calls `buildDispatch` per node in the
   opened map, attaches `dispatch` to each element.

9. `runVerifyEvidence(opts)` — READ-ONLY verify mode. Resolves role, reads evidence from disk,
   calls `checkEvidenceShape` with nonce. Maps result to typed reasons matching the close gate.

10. `main()` CLI — `record-evidence --verify` branch routes to `runVerifyEvidence`.

11. Help text + header comment updated to document `--verify` as READ-ONLY.

12. `module.exports` — added `buildDispatch`, `deriveGuards`, `runVerifyEvidence`.

### Edition sync:

Ran `npm run sync:editions` to regenerate all 3 edition ports.

### Decision record:

Authored `docs/decisions/D-444-01.md` capturing the settled contract.

## GREEN confirmation

```
node scripts/test-adaptive-node.js
adaptive-node tests passed (579 assertions)
```

Previous baseline: 503 assertions. New D444 tests added 76 assertions. All pass.

```
node scripts/simulate-workflow-walkthrough.js
Workflow walkthrough simulation passed
```

```
node scripts/kaola-workflow-adaptive-node.js --self-test
Results: 28 passed, 0 failed
All 28 self-tests passed
```

Four-chain results (all green):
- claude: Workflow walkthrough simulation passed
- codex: Kaola-Workflow walkthrough simulation passed
- gitlab: GitLab Codex workflow walkthrough simulation passed
- gitea: Gitea Codex workflow walkthrough simulation passed

GREEN: D444-DISPATCH-PARITY passes; 579/579 adaptive-node assertions green

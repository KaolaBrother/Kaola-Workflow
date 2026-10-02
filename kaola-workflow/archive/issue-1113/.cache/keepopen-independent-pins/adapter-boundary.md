# Test adapter boundary

`scripts/test-issue-1113-keepopen-pr.js` is a proposed test-only suite. Its `routeMode` values,
normalized result fields, and `adapter.run(fixture)` method belong to the test harness. They do not
name or prescribe a production CLI flag, command spelling, function, or receipt schema.

After the producer hands off an actual supported invocation, the provider-side test adapter should
translate these fixtures into calls to the shipped parser and lifecycle code. It should build a
temporary main repository plus a linked worktree, seed the durable claimed state and immutable
ledger/evidence fixture, and put a logging `gh` stub first on `PATH`. It should return normalized
fields only when they are derived from actual process arguments, Git state, recorded files, stub
calls, and emitted receipts. It must not synthesize a successful result from the scenario name.

The current `fixture-adapter.js` is only a semantic positive control. It is deliberately separate
from the proposed patch. The final patch suite was run against that model to exercise every
assertion and against 19 mutated model results to show that unsafe traces are rejected. An earlier
18-mutant run exposed a missing watcher assertion for automatic issue reopening; the preserved
development run and final repaired 19-mutant run are both recorded in the execution log. These runs
validate the test contract and controls; they do not validate producer code or installed consumer
compatibility.

The actual frozen baseline is classified separately by `run-baseline.js`. It loads the frozen
`sink-pr` parser using only currently accepted arguments, verifies the live keep-open refusal in an
isolated fixture, records the default `Closes #143` behavior, and captures a no-`gh`/no-index-change
refusal receipt. This proves the baseline gap without probing an invented option.

The adapter must eventually report all of the following from real fixture effects:

- caller cwd is the linked worktree while every state/archive/receipt operation resolves against
  canonical MAIN;
- pre/post claim identity, exact member set, ledger hash, complete evidence inventory, MAIN HEAD,
  and MAIN index;
- actual request URL/number, PR state, base/head, body and every head commit message, plus the
  forge's actual issue-closing association query;
- every `gh` argv operation, including auto-merge and queue attempts;
- actual live and archived watcher receipts, issue probe results, and changed project folders;
- injected crash location and the durable request identity used by retry.

`proposed-test-integration.patch` adds the standalone suite and one opt-in npm command,
`test:issue-1113:keepopen-pr`. The command is not added to the default or full producer chains.
Registering it in a required chain and adding the production-bound adapter remain Host integration
decisions after the actual API handoff. No command spelling or API was guessed here.

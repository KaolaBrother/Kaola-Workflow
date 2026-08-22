# Issue #1012 — Grok tier effort pins (TDD RED)

Baseline SHA: `d681fd703bca25872b0a670730110eb0613e2488`

The pre-edit suite passed on that baseline (`node scripts/test-grok-edition.js`, exit `0`, 442
assertions). After adding the acceptance pins in `scripts/test-grok-edition.js`, the same command
was run against the unchanged production tree:

```text
node scripts/test-grok-edition.js
```

Exit code: `1`

Failure signature:

```text
FAIL: G1[adversarial-verifier]: effort is "high" for canonical reasoning tier — got undefined
```

The suite finished with `grok-edition test FAILED: 70 failure(s), 473 passed.` The failure is the
intended RED: current generated agents retain `model: inherit` but have no tier-derived `effort:`
field. The only code artifact authored for this RED is `scripts/test-grok-edition.js`; no
production, generated, documentation, or mission-list file was changed.

Final declaration name: `GROK_RUNTIME_NATIVE.tiered_effort_pin`. The original RED command, exit
code, baseline SHA, and failure signature above are preserved unchanged.

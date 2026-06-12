evidence-binding: n4-adaptive-node fb54f3fa55a6
RED: testLedgerBadHeaderDiagnostic — AssertionError: #425: bad-header spliceLedgerNode must emit a diagnostic field, got: {"content":"# Plan\n\n## Node Ledger\n\n| node | status |\n|------|--------|\n| n1   | pending |\n\n## Sink","changed":false,"found":false,"alreadyAtTarget":false} (pre-impl: spliceLedgerNode returned no diagnostic when id column was absent)
GREEN: testLedgerBadHeaderDiagnostic passes; 8/8 assertions green (good-header no-diagnostic, bad-header found:false+diagnostic.ledger_present+detected_columns+required_columns+hint, absent-ledger no-diagnostic)

## Implementation summary

Modified `spliceLedgerNode()` in all 4 edition files to emit a structured `diagnostic` field when the `## Node Ledger` section is present but the header row lacks the `id` column:

```json
{
  "ledger_present": true,
  "detected_columns": ["node", "status"],
  "required_columns": ["id", "status"],
  "hint": "Run --repair to normalize the ledger header, or author with '| id | status |'"
}
```

Also updated `runOpenNext()` caller in all 4 files to propagate `spliceResult.diagnostic` into the `node_not_in_ledger` refusal payload so orchestrators receive actionable context.

## Files modified

- scripts/kaola-workflow-adaptive-node.js (canonical)
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js (codex twin, byte-identical)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js (gitlab rename-port)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js (gitea rename-port)
- scripts/simulate-workflow-walkthrough.js (test added: testLedgerBadHeaderDiagnostic)

## Verification

- `node scripts/edition-sync.js --check` — 12 forge aggregator ports in rename-normalized parity
- Forbidden-token guard — gitlab: passed, gitea: passed
- `node scripts/simulate-workflow-walkthrough.js` — Workflow walkthrough simulation passed

# Node `docs` evidence — issue #250 (`implementer` role) documentation

## Change type

Documentation update — no behavioral logic changed; this node adds the `implementer` role to the user-facing docs to match the already-updated validator and agent profile.

## Files changed

1. `README.md`
2. `docs/api.md`

## What was added

### README.md

**Agent table (after tdd-guide row, L111):** new row inserted:
```
| `implementer` | 4 — Execute (implementation without test-first ceremony; refactors, scaffolding, config, UI, migrations) | Sonnet | |
```

**Badge visibility list (L163-164):** added `implementer` next to `tdd-guide`:
Before: `agents (`code-explorer`, `tdd-guide`, `build-error-resolver`, `docs-lookup`,`
After:  `agents (`code-explorer`, `tdd-guide`, `implementer`, `build-error-resolver`, `docs-lookup`,`

### docs/api.md

**Count phrase at L252 (Grammar paragraph):**
Before: `(the ten canonical roles unioned with any maintainer-added \`agents/*.md\`)`
After:  `(the eleven canonical roles — including \`implementer\`, which is an IMPLEMENT_ROLES member requiring \`code-reviewer\` post-dominance (G1) like \`tdd-guide\`, but for changes with no natural failing-unit-test — unioned with any maintainer-added \`agents/*.md\`)`

The CANONICAL_ROLES array in `scripts/kaola-workflow-plan-validator.js` already contains `implementer` (11 roles) as landed by prior nodes; this change brings the prose count into sync and notes the implementer boundary vs tdd-guide.

## Gate results

- `node scripts/validate-vendored-agents.js` → exit 0 (13 agents validated)
- `node scripts/validate-workflow-contracts.js` → exit 0 (Workflow contract validation passed)
- `node scripts/simulate-workflow-walkthrough.js` → exit 0 (Workflow walkthrough simulation passed)

## non_tdd_reason

Documentation update (docs category): the write set contains only `README.md` and `docs/api.md`; no production logic was added or changed. Verified by all three gates green.

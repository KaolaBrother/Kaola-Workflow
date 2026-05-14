# Review Fix 2: Step 0 bash block guards (HIGH-2)

## File
`commands/workflow-next.md`

## Fix Applied
Wrapped entire bash block content with outer guard:
```bash
if [ -f "$CLAIM_JS" ] && [ -n "$KAOLA_SESSION_ID" ]; then
  node "$CLAIM_JS" sweep
  ...inner classify block (nested)...
fi
```

Result: 232 → 234 lines. Inner classifier block remains nested.

## Validation
- Line count: 234
- KAOLA_SESSION_ID occurrences: 4
- `node scripts/validate-workflow-contracts.js`: PASS (cap 235 ≥ 234)

evidence-binding: n2-autopilot ad7d76c02caf

REPAIR (reopened): fix the readPlanAllDone `\Z` bug — JS regex has no `\Z` anchor (matches literal "Z"), so a ledger-LAST plan returned null → allDone false → run-stage infinite loop.

RED: readPlanAllDone(ledger-last, all rows done, no trailing `## `, no stray "Z") => false (expected true). Broken regex `(?=^## |\Z)` lookahead never fired. (ledger-mid worked only because `(?=^## )` matched the next heading.)

GREEN (after fix):
- case 1 ledger-last, all done → true PASS
- case 2 ledger-mid (followed by ## Sink) → true PASS
- case 3 ledger-last, NOT all done → false PASS
3/3 assertions green.

regex diff (canonical + byte-identical codex twin):
- before: `content.match(/^## Node Ledger\s*\n([\s\S]*?)(?=^## |\Z)/m)`
- after:  `content.match(/^## Node Ledger\s*\n([\s\S]*?)(?=\n## |$(?![\s\S]))/m)`
  (`\n## ` = next heading; `$(?![\s\S])` = true end-of-string under /m. No `\Z`.)

regression: `node scripts/test-autopilot.js` → "test-autopilot: all 76 assertions passed" (fix strictly more permissive; both ledger-last and ledger-mid work).

forge-neutrality: `grep -nE '\b(gh|glab|tea)\b' scripts/kaola-workflow-autopilot.js` → zero hits.
byte-identity: `cmp scripts/kaola-workflow-autopilot.js plugins/kaola-workflow/scripts/kaola-workflow-autopilot.js` → byte-identical (twin via cp, no hand-edit).

write_set (exactly the two declared): scripts/kaola-workflow-autopilot.js + plugins/kaola-workflow/scripts/kaola-workflow-autopilot.js.

NOTE: canonical changed → n7 gitlab/gitea ports now stale → re-mirror via n7 reopen next (validate-script-sync will be red until then).

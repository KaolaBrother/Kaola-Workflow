evidence-binding: n9-tests 86ce1aa06991

REPAIR (reopened): add a durable regression test protecting the n2 `\Z` fix — the original 76-assertion suite did NOT cover ledger-last (its fixture appended a trailing `## Sink`), which is why the bug was invisible.

GREEN: `node scripts/test-autopilot.js` against the fixed code → "test-autopilot: all 81 assertions passed" (76 original + 5 new T8: fixture-layout guard + exit 0 + JSON-parseable + stage=finalize + action=sink). T8 exercises a workflow-plan.md whose `## Node Ledger` is the FINAL section (no trailing `## ` heading, no stray "Z"), all rows done → fixed regex `$(?![\s\S])` detects allDone → autopilot advances run→finalize.

RED (revert-proof, bites): a temp copy /tmp/broken-autopilot-443.js with the regex reverted to `(?=\n## |\Z)` was driven by the ledger-last fixture → stayed `{"stage":"run","action":"run_plan",...}` instead of advancing to finalize → T8's `stage === 'finalize'` assertion FAILS. "test bites (broken regex returns run instead of finalize): true". Temp copy deleted after the proof; real scripts/kaola-workflow-autopilot.js untouched.

write_set (exactly one declared file): scripts/test-autopilot.js (package.json already wired in the prior n9 pass; not re-touched).

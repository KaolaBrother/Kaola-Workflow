# #1059 follow-up conclusions (items 6–8)

Not landed in this issue. No telemetry script change, no `kaola-workflow-global-contract.js` edit, no ADR 0017 four-field change.

## B. Telemetry — retire/redirect; separate issue

Keep: `outcome-log.jsonl` chain-timing writes from `scripts/kaola-workflow-run-chains.js` (validation-chain duration). That is the only live writer of a useful quantity.

Retire or redirect, together:

- `node-timings.jsonl` — constants in `scripts/kaola-workflow-adaptive-schema.js`; `scripts/kaola-workflow-telemetry-report.js` reads; no writer in this tree.
- `family` / `locus` / `route` columns — `adaptive-schema.js` ~1031–1039: “nothing in this tree does today”; leftover scheduler vocab (refusal / redispatch / triage).
- `scripts/kaola-workflow-telemetry-report.js` — ranks that old vocab; no command/template calls it.

Citation sites that must move with any retire/redirect (broader than `docs/api.md`):

1. `scripts/kaola-workflow-install-manifest.js:75`
2. `scripts/validate-script-sync.js:79,200` (four-tree byte-sync group)
3. `scripts/test-outcome-recorder.js:43,224–226` (ranking contract)
4. `docs/api.md` (and any remaining prose that names the report)

Do not land here. File a follow-up if/when retiring the hollow paths.

## C. Grok / Cursor / Devin dual-load — measure first; Devin is not the same case

`RECOVERY_FULL_DISPATCH_RUNTIMES = ['grok','cursor','devin']` (`generate-routing-surfaces.js:323`). Global-contract alwaysApply rules for those hosts include the full dispatch+adapter block; next/finalize also inject the same bytes.

Do not delete the command-side copy: Cursor App/Cloud do not inherit CLI rules (`docs/cursor-edition.md`).

Devin: measured CLI `/compact` drops AGENTS and always-on rules; `PostCompaction` does not inject `additionalContext`; `UserPromptSubmit` injects a short pointer (`docs/devin-edition.md`). Rule-side full dispatch is therefore not compact insurance for Devin. Its dual-load stay/go must be judged separately from Grok/Cursor.

Before any `kaola-workflow-global-contract.js` change: one compact-after-carrier measurement each for grok, cursor, and Devin, with the Devin hook path recorded. No measurement in this issue.

## D. Optional `elapsed` / `tokens` on `result` — not adopted

Allowed later as optional notes on the existing `result` line when the host exposes them. Must not add a fifth Mission List field or a new script. Leave for a later run after more archives exist.

## E. Cost language — already present; leave narrow

`templates/routing/dispatch-contract.md` already has “keep one owner … when handoff and integration cost exceed the benefit.” Yanlei: present, narrow, not missing. No extra sentence, threshold, or counter in this issue.

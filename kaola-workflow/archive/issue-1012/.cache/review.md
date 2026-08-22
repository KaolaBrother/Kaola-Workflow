# Independent code review: issue #1012

behavior_contract_version: 3
behavior_contract_hash: 308d49af0d19404ba0d50e28cee64b570df0a647c93f6b6f3636c3853835dfc7
resolved_profile_hash: 562154a00287ceaea5d950076aceca878134b4b32ebf5765d01da2f5c76701f4
candidate: issue-1012 finished tracked diff
surface: Grok effort generation, edition tests, documentation, and live close evidence
evidence_file_state: The requested path did not exist at review start, so there was no prior header to preserve.

verdict: pass
findings_blocking: 0

No candidate-caused correctness, regression, scope, maintainability, or test-coverage defect met the admission threshold. No actionable finding is open.

## Reviewed behavior

- Strict class mapping is role-table-free. `scripts/sync-grok-edition.js:103-118` maps the canonical class token to effort and fails closed for an absent or unsupported token with the role and token in the error. `scripts/sync-grok-edition.js:130-142` reads each canonical agent frontmatter, retains `model: inherit`, and emits exactly one derived `effort` field.
- Command-card model inheritance remains intact. `scripts/sync-grok-edition.js:166-180` states the Grok-specific model/effort contract, while the existing command transform still removes model placeholders and rejects surviving `model=` instructions. The generated command trees contained no line-start model argument, and no tracked canonical agent, command, installer, edition-sync, package, or CLAUDE surface changed.
- The test oracle derives its roster from canonical `agents/*.md` rather than a second role list. `scripts/test-grok-edition.js:120-151` independently maps the canonical `sonnet` and `opus` classes; `scripts/test-grok-edition.js:318-353` checks every GitHub agent; `scripts/test-grok-edition.js:448-475` keeps model inheritance independent from the declared effort pin; and `scripts/test-grok-edition.js:649-687` repeats model and effort assertions for GitLab and Gitea.
- Documentation is consistent with the shipped behavior. `docs/grok-edition.md:46-81` records inherited model, tier-derived effort, omitted command-card model override, untouched user config, and the measured Grok CLI 1.0.5 `implementer` limitation. `docs/architecture.md:338` uses the requested tier label and pointer without duplicating the mechanism. README, docs index, and CHANGELOG summaries agree with the detailed guide.
- Live close evidence is adequate and truthfully bounded. `.cache/live-grok.md:5-48` records an xhigh Grok 4.6 parent dispatching actual `tdd-guide` and `code-reviewer` profiles without per-call model overrides, with Grok 4.6 children at medium and high. `.cache/live-grok.md:50-72` separates the repeated literal-name `implementer` high-effort result as a Grok CLI 1.0.5 runtime inference, and the owner correction on issue #1012 carries the same limitation without adding a workaround.

## Validation receipts

- `git diff --check`: passed.
- `node --check scripts/sync-grok-edition.js`: passed.
- `node --check scripts/test-grok-edition.js`: passed.
- `node scripts/test-grok-edition.js`: passed, 543 assertions; `.grok`, `.grok-gitlab`, and `.grok-gitea` all reported parity.
- Direct render probe: `sonnet` and `standard` produced medium; `opus` and `reasoning` produced high; absent, `haiku`, and `grok-4.6` tokens failed closed. Every accepted render retained `model: inherit` and one effort field.
- Generated-tree count probe: each of the three forge trees contained seven medium and seven high agent profiles; no generated command had a line-start model argument.
- Declaration mutation proof: compiling an in-memory copy of `scripts/test-grok-edition.js` with `GROK_RUNTIME_NATIVE.tiered_effort_pin` deleted exited 1 with the two expected declaration failures and 541 other assertions passing. The tracked test file was not edited.
- The recorded TDD RED at `.cache/tdd-red.md:3-27` binds the pre-production failure to baseline SHA `d681fd703bca25872b0a670730110eb0613e2488`: missing generated effort produced 70 failures while model inheritance remained present.

review_conclusion: The finished issue 1012 diff satisfies the canonical tier binding, inheritance, parity, documentation, and live evidence requirements with no admitted defect.

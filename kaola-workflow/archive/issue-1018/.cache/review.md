# PR #1019 review

candidate: f36fab89aefbcbbeb6aed3c7b14f6be7b8fbc438
base: ed7e35c90c867cbc37e17b09c21bb3c55c40e0d5
issue: #1018

## Confirmed findings

1. `node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` exits 1 at `#332 AC3: code-architect must belong to exactly one profile class`. The assertion still computes membership from only `CODEX_PINNED_STANDARD_ROLES` and `CODEX_PINNED_REASONING_ROLES`, so every new heavy-tier role appears to belong to zero classes.
2. `docs/grok-edition.md` and `docs/cursor-edition.md` still describe the former two-tier pin tables. `docs/kimi-edition.md` still names only the `opus` / `sonnet` canonical markers. The architecture matrix still points to Grok's `Two effort tiers` heading.
3. `scripts/validate-kaola-workflow-contracts.js` and the GitLab/Gitea validator copies cross-bind installer/preflight rosters to the adaptive schema for standard and reasoning only. None asserts `CODEX_PINNED_HEAVY_ROLES` parity, so heavy membership can drift in an installer or preflight copy without these declared AC-8 guards failing.
4. The sanctioned heavy reviewer re-dispatch and the requirement to state each review scope exist only in the Codex-only `REGION:skill`. Claude's generated next/finalize commands still require the installed reviewer profile model exactly and carry no carve-out, so Claude cannot inherit the ADR's recorded `opus` resting / `fable` escalation rule; command runtimes also receive no dispatch-side scope requirement. This preserves the original out-of-repo-habit failure on Claude.

## Review observations

- The source frontmatter, resolver defaults, three Codex tier rosters, routing skeletons, generated Codex skill surfaces, reviewer scope clamp, Grok/Cursor/OpenCode transforms, and changed test subjects are internally consistent.
- `git diff --check origin/main...HEAD` passes.
- PR #1019 is non-draft, mergeable, and based directly on current `origin/main` at review start.
- No security-sensitive input, authentication, network boundary, or secret-handling behavior is added by the candidate.

verdict: changes-required until all confirmed findings are repaired and validation is rerun

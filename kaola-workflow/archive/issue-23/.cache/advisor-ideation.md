# Advisor Ideation Gate - issue-23

Advisor mode: local critical review of the selected strategy.

## Recommendation

Choose Option A: targeted in-place exact-path extraction before area fallback.

## Findings

1. The exact-path check must run before shared-infra area classification, otherwise identical `scripts/kaola-workflow-claim.js` mentions will remain `yellow`.
2. Path normalization should strip common Markdown punctuation and backticks, but should not attempt full natural-language parsing or filesystem existence checks. Issue metadata may mention planned files that do not exist yet.
3. `plugins/kaola-workflow/...` paths must be first-class; the current regex cannot see them.
4. Offline `.roadmap/issue-N.md` support should treat `body:` content, `touches:` metadata, and ordinary file paths as the same extraction source.
5. Preserve `area:*` labels as yellow-only fallback unless exact paths overlap.
6. Avoid changing claim bootstrap selection semantics. A red verdict already prevents claim by omission from the green/yellow set.
7. Regression tests must distinguish exact shared-infra overlap from directory-only shared-infra overlap.

## Hidden Risks

- A broad regex can accidentally capture URLs or Markdown anchors. Restrict extraction to repository-looking relative paths and known Kaola top-level roots.
- Updating only root scripts would leave the packaged Codex plugin stale. Mirror classifier changes into `plugins/kaola-workflow/scripts/`.
- Existing simulation has a manual yellow-cache write; do not confuse classifier responsibility with claim bootstrap responsibility.

## Decision

Proceed with a small deterministic classifier patch plus focused simulation coverage.

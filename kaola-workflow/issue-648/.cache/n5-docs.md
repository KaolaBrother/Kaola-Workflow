evidence-binding: n5-docs 0ed5bca52ad1
upstream_read: n4-review 65617ab0f8a2
docs_updated: docs/api.md; docs/decisions/D-648-01.md

## Documentation Updates

- `docs/api.md`: documented additive self-host `chains_stale` finalize-check JSON diagnostics:
  `stale_paths`, `stale_paths_truncated`, and `stale_kind`. The text states these fields are
  best-effort diagnostics only and do not alter `reason: "chains_stale"`, refusal precedence,
  `operator_hint`, chain decision semantics, remedy, or the attribution sweep.
- `docs/api.md`: documented the consumer final-validation citation lines
  `source: cited:<node-id>`, `validated_command`, `validated_at_head`, and `reuse_boundary` as an
  agent-facing reuse-boundary contract while explicitly preserving the current consumer machine gate:
  column-0 `verdict: pass` remains the parsed requirement.
- `docs/decisions/D-648-01.md`: added the decision record for stamp-last self-host receipt
  sequencing, stale culprit diagnostics, and the consumer citation contract.

## Validation

- `git diff --check` -> exit 0.
- `node scripts/validate-workflow-contracts.js` -> exit 0; Workflow contract validation passed.
- `node scripts/validate-kaola-workflow-contracts.js` -> exit 0; Kaola-Workflow Codex contract
  validation passed.
- `node scripts/test-route-reachability.js` -> exit 0; Route-reachability test passed
  (333 assertions).
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` -> exit 0;
  Kaola-Workflow GitLab contract validation passed.
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` -> exit 0;
  Kaola-Workflow Gitea contract validation passed.

## Documentation Risks

- No CHANGELOG update was made; the finalization node owns it.
- No consumer finalize-check parser change was made or documented as required; the docs intentionally
  describe the current gate semantics.

## Documentation Docking — bundle-445-446

### Changed files reviewed

- `scripts/kaola-workflow-adaptive-node.js` — `OPERATOR_HINT_REGISTRY`, `operator_hint` on typed envelopes, `route-findings` subcommand, `--summary` flag, `VERDICT_ROLES` set (line 870)
- `scripts/kaola-workflow-commit-node.js` — `OPERATOR_HINT_REGISTRY`, `operator_hint` on typed envelopes
- `scripts/kaola-workflow-plan-validator.js` — `OPERATOR_HINT_REGISTRY`, `operator_hint` on typed envelopes
- `scripts/kaola-workflow-parallel-batch.js` — `OPERATOR_HINT_REGISTRY`, `operator_hint` on typed envelopes
- Plus ×3 edition ports for each of the four aggregators (gitlab, gitea, codex)
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` — `nonCommentText` filter
- `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — `nonCommentText` filter
- 6 plan-run prose surfaces reduced to ~150-line skeleton
- `docs/plan-run-cards/` — 5 cards created (resume.md, governance.md, repair-routing.md, reopen-complete-node.md, frontier-batch.md) plus README

### Documents checked

- `docs/api.md` — operator_hint field shape, --summary mode, route-findings subcommand, findings-route.json schema, VERDICT_ROLES membership
- `docs/README.md` — docs/plan-run-cards/ index entry
- `docs/conventions.md` — operator hints section (#445), plan-run skeleton and reference cards section (#445)
- `README.md` — feature descriptions for #445 and #446
- `docs/decisions/D-445-01.md` — authoritative contract for operator_hint and skeleton/card split
- `docs/decisions/D-446-01.md` — authoritative contract for route-findings and --summary
- `CHANGELOG.md` — checked for absence of #445/#446 entries

### Gaps found and fixed

**One discrepancy identified — assessment: docs correct, decision record underdocumented; no doc fix required.**

The `docs/api.md` `route-findings` section (line 387) states `VERDICT_ROLES` is `(code-reviewer, security-reviewer, adversarial-verifier, main-session-gate)` — 4 members. D-446-01 §3 only lists 3 in the code snippet: `["code-reviewer", "security-reviewer", "adversarial-verifier"]`. The actual script at line 870 confirms:

```js
const VERDICT_ROLES = new Set(['code-reviewer', 'security-reviewer', 'adversarial-verifier', 'main-session-gate']);
```

`docs/api.md` accurately reflects the actual code. The D-446-01 §3 code snippet was written without `main-session-gate` (an oversight in the decision record, not a fabrication in the docs). No anti-fabrication flag; `docs/api.md` matches reality.

All other docking points verified clean:

- `operator_hint` field shape in `docs/api.md`: top-level, sibling of `result`/`reason`, present on refuse/halt/warn, absent on success — matches D-445-01 §2 exactly.
- Example JSON in `docs/api.md` has `operator_hint` at the correct level, references `revert-overflow` (not `drop-base`), is forge-neutral — matches D-445-01 §3 vocabulary contract.
- Four aggregators named as `OPERATOR_HINT_REGISTRY` hosts in `docs/api.md`: `adaptive-node.js`, `commit-node.js`, `plan-validator.js`, `parallel-batch.js` — matches D-445-01 §1.
- `--summary` mode documented as `adaptive-node.js`-only, one-line format `summary: <result> [| reason: <reason>] [| hint: <operator_hint>]`, full envelope cached to `.cache/<op>-envelope.json` — matches D-446-01 §4 exactly.
- `docs/api.md` states default full-JSON output unchanged — matches D-446-01 §5 compat contract.
- `route-findings` documented as subcommand (not a new script), CLI, behavior, and schema — matches D-446-01 §1–2 exactly.
- `findings-route.json` schema 5 fields (`finding_id`, `file`, `owning_node`, `fix_role`, `status`) and `owning_node: null` plan-repair signal — matches D-446-01 §2 exactly.
- `fix_role` precedence (security in text → security-reviewer; known producer → implementer; orphan → code-reviewer) — matches D-446-01 §2 exactly.
- Auto-invoke on `VERDICT_ROLES` close, silent and non-blocking — matches D-446-01 §3.
- `docs/README.md` lists `docs/plan-run-cards/` with all 5 cards (resume.md, governance.md, repair-routing.md, reopen-complete-node.md, frontier-batch.md) — correct.
- `docs/conventions.md` has `## Operator hints on typed refusals (#445 / D-445-01)` section with vocabulary rules — correct.
- `docs/conventions.md` has `## Plan-run skeleton and reference cards (#445 / D-445-01 §4–5)` section with the 5-card table and propagation rule — correct.
- `README.md` adaptive workflow section has accurate descriptions for #445 (`operator_hint`, `OPERATOR_HINT_REGISTRY`, plan-run cards) and #446 (`route-findings`, `findings-route.json` schema, `--summary` flag).
- `CHANGELOG.md` has NO `#445` or `#446` entries — correct (finalize commit step adds these).

### No-impact reasons

- Architecture docs (`docs/architecture.md`) — no structural changes (subcommand additions and field additions are additive to existing aggregators; architecture is unchanged).
- `docs/workflow-state-contract.md` — no new `workflow-state.md` fields introduced by #445 or #446.
- `.env.example` — no new environment variables.
- `docs/decisions/` entries other than D-445-01 and D-446-01 — not affected.
- Validator fix (n11e `nonCommentText` filter) — a bug fix in forbidden-token filtering; no public API or schema change; docs do not need updating for internal validator logic fixes.

### Verdict

DOCKED

evidence-binding: n12-doc-updater db67c7b11021

## Changes made

### `docs/api.md`

- Added `operator_hint` field documentation to the `Adaptive Refusal / Emit Protocol` section (§ "Refusal envelope" bullet). Includes the field shape (JSON example), vocabulary contract (revert-overflow / repair-node / no forge tokens), and the `--summary` mode format (`summary: <result> [| reason: <reason>] [| hint: <operator_hint>]`) with the `.cache/<op>-envelope.json` caching behavior. All field names and example values verified from `scripts/kaola-workflow-adaptive-node.js` (lines 69, 216, 248, 4436) and `D-445-01.md` / `D-446-01.md`.
- Added `route-findings` subcommand section (new `### route-findings subcommand (issue #446 / D-446-01)` block) after the existing `opened payload` section and before `record-evidence --verify`. Documents: CLI, `.cache/findings-route.json` schema (all five fields: `finding_id`, `file`, `owning_node`, `fix_role`, `status`), auto-invoke on VERDICT_ROLES close, silent-non-blocking behavior, and install-surface stability. Field values verified against `scripts/kaola-workflow-adaptive-node.js` (lines 868-870, 4108-4164, 4210, 4416-4419) and `D-446-01.md` §2-3.

### `docs/README.md`

- Added `docs/plan-run-cards/` entry to the documentation index with five sub-entries (resume.md, governance.md, repair-routing.md, reopen-complete-node.md, frontier-batch.md). Verified the directory and all five card files exist on disk.

### `docs/conventions.md`

- Added `## Operator hints on typed refusals (#445 / D-445-01)` section documenting the `OPERATOR_HINT_REGISTRY` pattern, vocabulary rules (revert-overflow / repair-node / forge-neutral), and the dual-channel contract (operator_hint + proposed_repair). Placed before the existing `## .md files as production surfaces (#424)` section.
- Added `## Plan-run skeleton and reference cards (#445 / D-445-01 §4-5)` section documenting what the skeleton retains resident (common path, frontier unit + PIN marker, --summary consumption, CARD markers), the five cards under `docs/plan-run-cards/`, and the propagation rule (skeleton is six-surface; cards are not).

### `README.md`

- Added two paragraphs after the existing `Evidence seeding (#433)` paragraph in the adaptive workflow section: one for operator hints (#445) and one for gate findings routing / --summary (#446). Both paragraphs summarize user-visible features and point to the decision records.

### Files NOT changed (reasons)

- `docs/architecture.md` — no structural changes; operator_hint and route-findings are additive fields/subcommands, not architectural shifts.
- `docs/workflow-state-contract.md` — `.cache/findings-route.json` is an ephemeral cache artifact, not a durable workflow-state field; no contract update needed.
- `CHANGELOG.md` — out of declared write set; doc-updater node writes only the 4 declared files.

# doc-updater output — issue-197

Invoked (model=haiku) with the changed files + the project Documentation Update Checklist.

## Edits made by doc-updater
- `CHANGELOG.md` — added `### Added` under `[Unreleased]` (fast-path audit script + test). ACCURATE — kept.
- `README.md` — Operational scripts table: `kaola-workflow-fast-audit.js` row. ACCURATE — kept.
- `README.md` — Validation and test scripts table: `test-fast-audit.js` row. ACCURATE — kept.
- `docs/api.md` — added a `## Fast-Path Calibration Audit` section. **REJECTED/REVERTED by orchestrator**: the section fabricated the contract (binned `fileCountDistribution` keys `1-2/3-5/6+`; invented YAML fields `status:`/`escalation_reason:`/`file_count:`/`review_mode:`; wrong review-mode status gating; fabricated example numbers/table format). It contradicted the real implementation, which parses Markdown headings and emits raw integer file-count keys. Removed via Edit; recorded as a no-impact skip in `.cache/doc-docking.md` (README already documents the tool; api.md documents stable contracts, not throwaway diagnostics).

## Checklist disposition
- README.md — updated (2 rows).
- CHANGELOG.md — updated (Added entry).
- docs/api.md — skipped (no-impact; see docking record).
- Architecture docs — skipped (no structural change).
- .env.example — skipped (no new env vars).
- Inline comments — skipped (script self-documented; no other public interface changed).

## Net documentation diff after orchestrator review
CHANGELOG.md (+Added entry), README.md (+2 rows). docs/api.md net unchanged.

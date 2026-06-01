# doc-updater raw output — Phase 6 (issue-211)

## Edits made
- **CHANGELOG.md**: inserted the verified #211 bullet under `## [Unreleased]`, after the #210 bullet, before `## [3.17.2]` (heading untouched on line 8). Verbatim from dictated ground-truth text. Validator re-run after edit → "Workflow contract validation passed" (exit 0).

## Checklist assessment
- **CHANGELOG.md** — UPDATED (new #211 bullet).
- **README.md** — SKIPPED. Script-inventory table (~L535) already has a `validate-workflow-contracts.js` row describing it as asserting "command files, agent installs, and documented invariants"; the parity check is an additional invariant within that script, not a new script. Row description is non-exhaustive by design; no existing statement is now false. A new callout would be speculative.
- **API docs (docs/api.md)** — SKIPPED. No existing entry for the validator; no API/endpoint/CLI-output/schema changed.
- **Architecture docs (docs/architecture.md)** — SKIPPED. 75-line file covers Phase 6 sink flows / Gitea sink layer; no contract-validator mention; no structural change; nothing made inaccurate.
- **.env.example** — SKIPPED. No new env var.
- **Inline comments** — SKIPPED. No public interface changed; new internal helpers (`sectionBody`, `resumeClausePair`) + assertion loop only.
- **docs/conventions.md** — checked via grep: no existing validator/guard list that should include this one.

No fabrication. No BLOCK lines.

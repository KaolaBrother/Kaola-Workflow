evidence-binding: n3-review 60196a87b4df
verdict: pass
findings_blocking: 0

## n3-review — code-reviewer (opus) accuracy gate

Adversarial falsification of the SHARED_STATE_FIELDS parity change (n1) + docs (n2). Post-dominates n1 (code) + n2 (docs). Tried to break each item; could break none.

(a) Non-vacuity — PASS. Gate green: `node scripts/test-active-folders-field-parity.js` -> 61 assertions, exit 0. Regression toggle (scratch copy in $TMPDIR, repo unedited): deleting `session_marker` surfacing -> gate RED (expected "s-sentinel-580", got undefined) -> exit 1. Per-field sentinel-vs-absent-default separation checked for all 13 fields: 0 collisions (issue_number null vs 42; phase null vs 3; issue_numbers [] vs [10,20]; status "unknown" vs "active"; sink "merge" vs "squash"; string fields "" vs non-empty). No vacuous assertion.

(b) Byte-identity x4 — PASS. All four kaola-workflow-adaptive-schema.js copies SHA256-identical; SHARED_STATE_FIELDS present (decl+export) in each. validate-script-sync.js green (25 byte-identical groups).

(c) Gate in all four chains — PASS. package.json appends `&& node scripts/test-active-folders-field-parity.js` to test:kaola-workflow:{claude,codex,gitlab,gitea}. Contract validators (claude/codex/gitlab/gitea) exit 0.

Ports untouched + correct intersection — PASS. No active-folders port edits; gate iterates only SHARED_STATE_FIELDS (strict shared intersection), excludes gitlab mr_*/project_id, gitea full_name/pr_*.

Entry point — PASS. readActiveFolders(root, {excludeClosedIssues:false}), hermetic (KAOLA_WORKFLOW_OFFLINE=1), not parseStateFile.

ADR accuracy (D-580-01) — PASS. Accurately describes presence-not-absence gate semantics (no idealization); D-580-01 next-free id; D-579-01 parent referenced.

Findings: R1 (LOW, resolved on inspection) — ADR semantics accurate, no idealization. Zero CRITICAL/HIGH/BLOCKING.

Full four-chain suite intentionally deferred to the finalize seam (run-chains.js --project, HEAD-matched receipt).

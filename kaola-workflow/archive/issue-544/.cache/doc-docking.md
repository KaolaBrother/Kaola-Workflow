# Doc Docking — issue-544

## Changed files reviewed (git diff vs base)
- scripts/kaola-workflow-adaptive-schema.js (+ ×3 byte-identical plugin copies) — PROVIDER_EFFORT_TABLE → CONTRACT_EFFORT_TABLE; +contractForProvider; effortForProvider rewrite; exports.
- scripts/sync-opencode-edition.js — renderAdaptiveConfig comment (contract + re-sync).
- scripts/test-opencode-edition.js — S1/S1-contract/A12-unknown flips.
- docs/opencode-edition.md — contract-keyed table, GLM thinking example, Switching-models subsection, ref updates.
- docs/decisions/D-544-01.md — NEW decision record.
- install-opencode.sh — seed_config echo + comment.
- CHANGELOG.md — #544 entry.
- README.md — line 361 pointer fix (PROVIDER_EFFORT_TABLE → CONTRACT_EFFORT_TABLE + contractForProvider).
- opencode.json — UNTOUCHED (neutral template, byte-identical; verified `git diff` empty).

## Documents checked
- README.md — pointer fixed; no other stale refs (only D-544-01 narrative "before/replace" mentions of PROVIDER_EFFORT_TABLE remain, which is legitimate).
- docs/opencode-edition.md — table/example/refs consistent with shipped CONTRACT_EFFORT_TABLE; GLM example matches generator output.
- docs/decisions/D-544-01.md — accurately records the 3 defects + decision + alternatives.
- CHANGELOG.md — entry reflects the shipped behavior.
- install-opencode.sh — echo/comment reflect contract-keying + re-sync.
- No API/.env.example/architecture-doc impact (internal schema + generator comments).

## Gaps found and fixed
- README.md:361 dangling pointer (the rename broke it) — FIXED via Trivial Inline Edit.

## Verdict
DOCKED — every public-behavior/setup/docs-impacting change is reflected; the one docking gap (README pointer) is fixed.

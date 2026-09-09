# #1054 — source classification of the rewritten role contracts (orchestrator, 2026-09-09)

Owner direction: issue #1054 comments 5600504152, 5600519220 (borrowing ideas is not reusing text/code; classify by what the current content actually retains), 5600539042 (README states Kaola-Workflow's own verified capabilities).

## Measurement
Upstream material fetched read-only at the pinned commit 922d2d8f (`gh api … contents/agents/<role>.md?ref=…`); SHA-256 of each fetched file equals the `source_sha256` previously recorded in `templates/agents/provenance.json` (all six). Compared against the pre-#1054 bodies (`behavior-contracts.json` at 6ae5374b) and the rewritten bodies (current worktree), body + description, normalized (lower-case, punctuation stripped).

| role | body | words | 8-word shingles shared with upstream | share | exact lines ≥25 chars shared | longest shared run (words) |
|---|---|---|---|---|---|---|
| build-error-resolver | old | 776 | 562 | 73.1% | 47/58 | 400 |
| build-error-resolver | new | 169 | 0 | 0.0% | 0/4 | 4 |
| code-architect | old | 641 | 255 | 40.2% | 15/36 | 139 |
| code-architect | new | 177 | 0 | 0.0% | 0/4 | 0 |
| code-explorer | old | 443 | 294 | 67.4% | 26/32 | 157 |
| code-explorer | new | 165 | 0 | 0.0% | 0/4 | 0 |
| doc-updater | old | 743 | 450 | 61.1% | 45/62 | 250 |
| doc-updater | new | 153 | 0 | 0.0% | 0/4 | 0 |
| planner | old | 935 | 558 | 60.1% | 57/78 | 283 |
| planner | new | 181 | 0 | 0.0% | 0/4 | 0 |
| tdd-guide | old | 893 | 129 | 14.6% | 6/56 | 136 |
| tdd-guide | new | 189 | 0 | 0.0% | 0/4 | 0 |

Reading: the pre-#1054 contracts for these six roles carried upstream text verbatim in long runs (136–400 consecutive words); the rewritten contracts share no eight-word sequence with the upstream files and at most a four-word run. No ECC text remains in any current role contract. The eight roles previously recorded as `kaola_local` were never derived.

## Change (source + consumers, landed in the candidate)
- `templates/agents/provenance.json` → schema_version 2: every role `source_kind: kaola_authored`; the six former derivations keep a `history` record (origin, upstream path/url, pinned commit, blob sha, sha256, `derived_through: v10.5.0`, `retired_by: #1054`, the measurement above). `origins.everything_claude_code` keeps repository, pinned commit, license, copyright, and now states `relationship: historical (retired by #1054)` and `retained_material: none in the current role contracts; earlier derived contracts remain in git history and kaola-workflow/archive/ under this license`. `local_overrides` (the re-vendor checklist) is gone with the re-vendor relationship.
- `scripts/generate-agent-profiles.js` `validateProvenance`: schema 2, `kaola_authored` only, a `history` record must be complete and name a known origin.
- `scripts/validate-vendored-agents.js`: asserts every role is `kaola_authored`; a historical ECC origin stays pinned to 922d2d8f so the history remains locatable; summary line no longer reads as if the roles are "at" the ECC commit.
- Prompt bytes: unchanged by this step (provenance never enters generated prompts; test-runtime-agent-architecture A8 keeps banning it). `generate-agent-profiles --check` exit 0, `validate-vendored-agents` exit 0.

## Handed to the documentation mission (row 11)
README License section (no "six shared role contracts retain Everything Claude Code"), README opening (Kaola-Workflow's own verified capabilities; no ECC identity, no prompt-pack framing, no competitor scoring), docs/README.md index line 24 ("ECC attribution" → source classification and history), docs/agents-source.md (replace "six derived / eight local" and the re-vendor refresh procedure with: all fourteen Kaola-authored; the historical origin record and its license; how the classification was measured; how to add a role). Historical archives untouched.

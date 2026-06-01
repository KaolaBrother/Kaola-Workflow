# Phase 2 - Ideation: issue-211

## Approaches Evaluated

### Option A: Extend `scripts/validate-workflow-contracts.js` (SELECTED)
- Summary: Add two baseline-compares (Delegation Contract section + resume clause) after the existing Codex-manifest parity block (~L361); inline a ~12-line markdown section slicer; mirror the file byte-for-byte to `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`.
- Pros: This file is already THE cross-forge parity validator (plugin.json baseline-compare L343-361, release-surface drift across all 3 forge trees L385-396) — the new check is the same shape in the same place. Reuses `read`/`assert`. Runs first in `npm test` via the `:claude` chain. No new wiring.
- Cons: Touches a byte-synced file (COMMON_SCRIPTS L50) → the plugin mirror must update in the same change.
- Risk: Low
- Complexity: Small (~25 lines + mirror)

### Option B: New standalone `scripts/validate-next-skill-parity.js`
- Summary: New script wired into the `:claude` chain.
- Pros: No byte-sync coupling; isolated concern.
- Cons: New file + new package.json wiring + likely a new COMMON_SCRIPTS decision anyway; duplicates the existing baseline-compare idiom; spreads cross-forge parity logic across two files (more drift surface, not less).
- Risk: Low-Medium
- Complexity: Medium

### Option C: Extend the Codex validator `scripts/validate-kaola-workflow-contracts.js` (REJECTED)
- Summary: It already references the resume clause + Delegation Contract literals (L89/95/100).
- Why rejected: Structurally single-forge — everything hangs off `pluginRoot='plugins/kaola-workflow'`; it never reads gitlab/gitea. Adding cross-forge reads breaks its scoping convention. Thematic adjacency loses to structural mismatch.
- Risk: Medium (convention violation)

## Advisor Findings
Advisor (Phase 2 gate, `.cache/advisor-ideation.md`) recommends Option A — "not the close call Phase 1 framed it as": the issue author named it the natural home and pre-accepted the byte-sync cost; direct precedent (plugin.json baseline-compare) lives in that exact file. Real risk is execution, not A-vs-B. Five guardrails: byte-sync the mirror; baseline-compare (no 4th canonical copy); inline the slicer (don't require the classifier); compare the resume clause in isolation (not the `## Routing` section); prove the failing direction.

Planner (`.cache/planner.md`) concurs with A and adds the decisive topology fact: `npm test` runs TWO validators — the Codex `validate-kaola-workflow-contracts.js` already pins github's text single-forge (L89/95/100), so Option A's cross-forge baseline-compare composes cleanly with **github as baseline** and needs no embedded canonical copy. Refinements adopted: strict byte-equality (no whitespace normalization — it would create a blind spot); resume clause = anchor line + exactly one following line; per-assertion labeled failure messages naming file/section/baseline; the slicer's heading-naïveté can only cause a false negative across-the-board, so no fence guard needed.

## Selected Approach
**Option A — extend `scripts/validate-workflow-contracts.js`, github as baseline edition.** Both the advisor and planner concur; per the active `/goal`, the advisor's recommendation is followed. github (`plugins/kaola-workflow`) is `baseline[0]`; assert `gitlab === baseline` and `gitea === baseline` for both the sliced `## Delegation Contract` section body and the isolated resume clause (anchor line + next line). Strict byte-equality. Mirror the edited file byte-for-byte to the plugin copy.

## Out of Scope (explicit)
- Not Option C (do not touch/duplicate the Codex validator pins L89/95/100 — they remain the github-presence anchor).
- Not Option B (no new standalone script).
- No `require()` of the classifier's `sectionBody` — inline ~12 lines.
- No 4th canonical copy of either text block — baseline-compare against github.
- No whitespace normalization, no substring/`includes` matching.
- No comparison of the whole `## Routing` section (would false-flag the forge-specific `repair_script=` line).
- No fenced-code-block guard for the slicer.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |

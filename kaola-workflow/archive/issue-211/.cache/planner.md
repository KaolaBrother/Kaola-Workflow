# planner raw output — Phase 2 Ideation (issue-211)

## Verdict
Concur with Option A: add the assertion to `scripts/validate-workflow-contracts.js`, byte-synced to its plugin copy.

## Decisive finding (refines Phase 1 + advisor)
`npm test` runs TWO distinct contract validators:
- `:claude` (package.json:36) → `scripts/validate-workflow-contracts.js` (byte-synced, COMMON_SCRIPTS L50).
- `:codex` (package.json:37) → `scripts/validate-kaola-workflow-contracts.js` — DIFFERENT file, single-forge (`pluginRoot='plugins/kaola-workflow'`, L8). Already pins github edition's text: resume-clause literal at L89; Delegation Contract literals at L95/L100. But only against plugins/kaola-workflow; never reads gitlab/gitea. So current coverage = single-edition presence, never cross-forge parity. Issue requirement is genuinely unmet.

## Options
### A — extend scripts/validate-workflow-contracts.js (RECOMMENDED)
Add two baseline-compares after existing Codex-manifest parity block (L361); inline ~12-line slicer; mirror byte-for-byte to plugin copy.
- Pros: this file IS already the cross-forge parity validator (plugin.json baseline-compare L343-361; release-surface drift across all 3 forge trees L385-396). Same shape. Reuses read/assert. Runs first in npm test via :claude.
- Cons: byte-synced file → plugin copy must update in same change (validate-script-sync.js runs first, enforces).
- Risk Low. Complexity Low (~25 lines + mirror).

### B — new standalone scripts/validate-next-skill-parity.js
- Pros: no byte-sync coupling; isolated.
- Cons: new file + new wiring + likely new sync decision anyway; duplicates baseline-compare idiom; spreads cross-forge logic across two files. More drift surface.
- Risk Low-Med. Complexity Med.

### C — extend Codex validator validate-kaola-workflow-contracts.js (REJECT)
- Thematically adjacent (already references resume clause + DC literals L89/95/100) but STRUCTURALLY single-forge (everything hangs off pluginRoot=plugins/kaola-workflow; never reads gitlab/gitea). Adding cross-forge reads breaks scoping convention. Reject.

## Recommendation: Option A, github as baseline edition
Make plugins/kaola-workflow (github) baseline[0]. Composes with existing coverage: Codex validator already pins github's text to intended literal; A adds "gitlab/gitea must byte-match github." Full coverage, no embedded 4th canonical copy. Do NOT touch/duplicate L89/95/100 — they are the anchor.

## Equality mode: strict byte-equality, NO normalization
DC section byte-identical by design, no forge-specific content inside (heading L27, body ends at `## Agent Issue Selection` L53). Strict equality cannot false-flag; whitespace normalization would CREATE a blind spot. "Don't false-flag forge prose" satisfied STRUCTURALLY:
- DC: slice between `## Delegation Contract` and next h1/h2 — excludes forge-specific Routing/bash.
- Resume clause: anchor line + exactly ONE following line (github L220-221; gitlab/gitea L232-233 — verified byte-identical). Forge-specific repair_script= fence sits 2 lines below, excluded.

## Execution gotchas
1. Anchor uniqueness CONFIRMED: `On resume, extract and reassign`, `## Delegation Contract`, `## Routing` each occur exactly once per file. indexOf/first-match unambiguous.
2. Byte-sync root resolution: plugin copy resolves root to plugins/kaola-workflow; a cross-forge read would resolve incorrectly THERE — but safe because existing L343-361 reads do identical thing, and npm test only ever runs the ROOT copy (no chain runs the plugin copy — verified package.json:36-39).
3. Slicer heading-naive (no fence tracking, per classifier L127-139). A future `#`-line inside a bash fence truncates the slice — but identically across all 3 editions → can only cause false NEGATIVE, never false positive. Note as known limitation; don't guard.
4. Failure message: name diverging file + section + baseline, mirror L354-360 style; separate labeled message per assertion. e.g. `<gitlab path> "## Delegation Contract" section diverges from the plugins/kaola-workflow baseline; the three forge editions must stay byte-identical — diff the section bodies and reconcile.`

## Items NOT to build
- NOT Option C (Codex validator). NOT Option B (standalone). NOT require() classifier sectionBody (inline ~12 lines). NOT a 4th canonical copy (baseline-compare github). NOT whitespace normalization / substring matching. NOT touch L89/95/100 pins. NOT compare whole `## Routing` section. NOT a fenced-code-block guard.

## Refined build order
1. Inline ~12-line slicer into validate-workflow-contracts.js.
2. Add two baseline-compares after L361: (a) DC sliced body across all 3 vs github; (b) resume clause = anchor + next line across all 3 vs github.
3. Mirror byte-for-byte to plugins/kaola-workflow/scripts/validate-workflow-contracts.js.
4. Prove BOTH failing directions: trailing space in gitlab DC → throw+exit1 with section message → revert; flip one char in gitea resume 2nd line → clause message → revert.
5. Run validate-script-sync.js, then full npm test (+ simulate-workflow-walkthrough.js).

## Missing facts (none blocking)
- sectionBody export status unconfirmed — moot under inline decision.
- Plugin copy independently executed by any chain — verified NO (only root copy runs).

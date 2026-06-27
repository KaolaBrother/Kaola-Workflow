evidence-binding: n2-review 4501a5398c8b
# n2-review — G1 change-gate review for issue #572

verdict: pass
findings_blocking: 0

## Validator / walkthrough exit codes (run from worktree)

| Check | Exit | Result |
|---|---|---|
| codex contracts (validate-kaola-workflow-contracts.js) | 0 | passed |
| claude contracts (validate-workflow-contracts.js) | 0 | passed |
| opencode edition (test-opencode-edition.js) | 0 | 477 assertions incl. A24 |
| #274 byte-mirror diff | 0 | byte-identical |
| walkthrough (simulate-workflow-walkthrough.js) | 0 | passed |

## AC verification
- AC1/AC2/AC3 — PASS. Injected `## Kaola-Workflow` block phase-free on all 6 surfaces; roles named by function; `implementer` named alongside `tdd-guide`; fast/full demoted to install-time opt-in; `fast-summary.md` dropped from active artifacts. Content identical across 6 surfaces modulo forge-noun line.
- AC4 — PASS. `PHASE_NUMBER_BAN` + `PHASE_FILE_BAN` looped over all 6 `initFiles` in validate-kaola-workflow-contracts.js; opencode mirror A24 in test-opencode-edition.js.
- AC5 — PASS. Cross-forge parity (normalizeForgeNoun, github≡gitlab≡gitea) + within-pair byte checks; opencode runtime-noun parity in A24.
- AC6 — PASS. KW-CLAUDE-TEMPLATE-START/END markers present on all 6; AGENTS.md redirect block + MANDATORY sentinel byte-checked and intact.

## Needle moves
- All five init durable-state assertConcept blocks (claude scripts/, #274 plugin mirror, codex, gitlab, gitea) drop `fast-summary.md` + bare `.cache/`, add `workflow-plan.md` + `## Node Ledger` + `.cache/{node-id}.md`.
- Unrelated fast-path `fast-summary.md` needles (classifier / workflow-next) untouched.
- scripts/sync-opencode-edition.js declared but untouched (12 of 13 tracked) — barrier-safe over-declaration.
- #341 forge-neutral prose preserved; no forge-specific CLI binary/brand in new prose.

## Findings
Blocking: none.
Non-blocking follow-ups (out of scope for #572 ACs; outside the injected template region, not reached by the ban):
- NB1 — commands/workflow-init.md:356 (+ gitlab/gitea peers): "proceed with local phase artifacts" in Active-Folder-Init fallback narration. Stale terminology only.
- NB2 — redirect-block line "workflow phases, scripts, conventions, gotchas" (byte-parity-checked, preserved per AC6). Stale category label.
- NB3 (informational, not a defect) — SKILL prose "fast and full six-phase paths" is accurate (opt-in fast/full genuinely are six-phase) and explicitly permitted by the validator comment.

## Verdict
APPROVE — all six ACs met, four validators + #274 byte-mirror + walkthrough green, no parity violations, no broken needles, no edits outside the frozen write-set. Zero blocking findings; n3-finalize may proceed.

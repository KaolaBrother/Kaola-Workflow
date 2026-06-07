# Node `ground` (code-explorer, read-only) — grounding evidence for issue #270

Target file: docs/investigations/2026-06-06-six-workflow-patterns.md
Scope: prose/tense framing only. Grammar examples (shape column, `select(fix)` syntax) already match shipped code — DO NOT change them. Rest of document unchanged.

## Ship facts — VERIFIED via git (orchestrator)
- Commit 84d6e23 = "feat(adaptive): add select(<group>) Classify-And-Act grammar shape (#263)". Confirmed exists; touched scripts/kaola-workflow-plan-validator.js, kaola-workflow-commit-node.js, kaola-workflow-adaptive-schema.js, simulate-workflow-walkthrough.js across ALL 4 editions (claude/gitlab/gitea/codex). 41 files, +3036.
- Shipped surface tokens CONFIRMED present in live scripts: select(<group>) shape (plan-validator.js:564), selector_source column (plan-validator.js:145), parseNodeSelector (adaptive-schema.js:120, exported :243), --selector-check (plan-validator.js:923/936/1052), selectorCheck step in commit-node.js, fail-closed --selector-check (plan-validator.js:1091), selectorCheck.armsToNa consumed in adaptive-node.js:579-582. The select() tripwire in simulate-walkthrough flipped refuse->in-grammar.

## Follow-up issue states — VERIFIED via gh issue view (orchestrator)
- #267 OPEN  — test(adaptive): select() composition and runtime coverage (multi-group, resume, n/a propagation, fanout/loop/adversarial-verify composition). THE remaining open follow-up.
- #268 CLOSED — bug(adaptive): G-SEL-1b blank selector_source phantom arm (shipped [5.5.0]).
- #269 CLOSED — enhancement(adaptive): wire orchestrator to consume selectorCheck.armsToNa + write n/a ledger rows (shipped [5.4.0]).
NOTE: issue #270 body said "open follow-ups #267-#269", but as of 2026-06-07 only #267 is open. Faithful framing: reference all three with ACCURATE status (#267 open; #268/#269 shipped). Do not relabel shipped issues as "open" — that re-introduces the stale framing #270 exists to fix.

## Target region map (line numbers + verbatim before-text to reframe)
- L1 title: "# Six workflow patterns, mapped to the adaptive grammar — and the one gap worth filling" — "the one gap worth filling" is now filled.
- L4 status: "**Status:** Design — filed as issue #263" -> should become "Shipped (#263, commit 84d6e23)".
- L120 heading: "## The one gap: Classify-And-Act" — "the one gap" framing; reflect shipped.
- L126-139: "Verified out-of-grammar today..." block showing select(...) refused + both-arms fanout workaround — now historically false; reframe as "before #263" history. Tripwire now asserts in-grammar.
- L151+ "### Why it's a real gap": "the planner today must either (a)...(b)..." and "Classify-and-act is exactly the missing tool" — present-tense gap framing -> past tense / shipped.
- L189: "If selection cannot be made script-decidable for real use cases, the honest verdict is **Reject as redundant with `staged-escalation`**..." — conditional now resolved; shipped form proved script-decidability.
- L193 "## The design" prose: design as described is what shipped; only tense framing needs adjusting (examples/G-SEL rules stay).
- L259 "### 6. Verdict: **Adapt**" — verdict realized as shipped.
- L293-308 "## Acceptance criteria (for the issue)": future-tense items now satisfied by #263; reframe to shipped/met.
- L310-319 "## Companion deliverables": 'Classify-and-act is listed as "planned"' — README row already shipped ([5.4.0] CHANGELOG: "was Planned; now documented"); reframe past tense.

## Required edit per issue #270 ACs
1. Status updated to "Shipped (#263, commit 84d6e23)".
2. No conditional future-tense language remains in the Classify-And-Act section.
3. Follow-ups #267 (open), #268 (shipped), #269 (shipped) referenced with accurate status.
4. Rest of document unchanged (grammar examples, five-pattern table, design rules).

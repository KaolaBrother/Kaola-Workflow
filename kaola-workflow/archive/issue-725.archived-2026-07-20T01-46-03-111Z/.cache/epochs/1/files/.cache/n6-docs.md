evidence-binding: n6-docs 5bc22f0ddcd8

upstream_read: n5-hook-deletion bc92adfeddf3

docs_updated: README.md (7 hits: /hooks trust-list bullet trimmed, 2 hook tables (Claude + Codex) each cut from 4 rows to 2, "four hooks"/"four managed"/"four ids" counts corrected to "two" in 4 places, KAOLA_GATE_WINDOW_FENCE env-var row reworded to past tense, the standalone pre-commit-hook bullet deleted), docs/api.md (4 hits: KAOLA_LANE_CONTAINMENT and KAOLA_GATE_WINDOW_FENCE bullets reworded to past tense, Codex "four managed entries" table cut to 2 rows and heading/prose/"All four"->"Both" corrected), docs/architecture.md (1 hit: the INV-2 #607-exception paragraph drops the "consumed solely by the write-lane hook's gate-window fence" clause, keeping the still-true scheduler-exclusion clause), docs/conventions.md (1 hit: the "Gate-window fence" section rewritten to past tense stating the enforcing hook was removed and the flag now has no consumer), docs/workflow-state-contract.md (1 hit: the `kind:'gate'` member paragraph drops the "visible to the write-lane hook's gate-window fence" clause and the now-false "reopen the fenced window" crash-tripwire rationale, keeping the still-true PRESERVED-not-rolled-back fact), CLAUDE.md (line 117 "Background hooks (pre-commit, subagent-dispatch-log)" -> "(subagent-dispatch-log)"; file is 143 lines, under the 200-line cap), CHANGELOG.md (new [Unreleased] / ### Removed entry documents Phase C: the two hook deletions, the KAOLA_LANE_CONTAINMENT/KAOLA_GATE_WINDOW_FENCE dead-flag state, the edition-sync dedup, and the adaptive-node L1 hash fast-path; placed above the existing Phase A entry, epic reference kept to a single minimal "(#725)" with no closing keyword adjacent).

## Judgment call: 4 hits intentionally NOT reduced to zero

The task's verification grep (`pre-commit\|write-lane` across the 6 doc files) was expected to
show zero hits after the edit. After my edits it shows 4, all deliberate, not missed:

- README.md:1048 (KAOLA_GATE_WINDOW_FENCE row)
- docs/api.md:1286 (KAOLA_LANE_CONTAINMENT bullet)
- docs/api.md:1287 (KAOLA_GATE_WINDOW_FENCE bullet)
- docs/conventions.md:829 (Gate-window fence section)

Reason: n5's own frozen task text (workflow-plan.md ### n5-hook-deletion, "Traps") explicitly
states `kaola-workflow-adaptive-schema.js`'s write-lane resolution machinery / `KAOLA_LANE_CONTAINMENT`
"becomes dead code, but removing it is out of Phase C scope" — i.e. the plan already decided these
two env flags (`KAOLA_LANE_CONTAINMENT`, `KAOLA_GATE_WINDOW_FENCE`) keep existing as defined,
readable config knobs; only their sole runtime consumer (the write-lane hook) was deleted. I
independently confirmed this by grepping the codebase: `LANE_CONTAINMENT_ENV` (`kaola-workflow-adaptive-schema.js:3282`)
has zero consumers outside that file itself, and `KAOLA_GATE_WINDOW_FENCE` has zero consumers
anywhere in `scripts/*.js` except `test-route-reachability.js` (a prose-presence check on planner
surfaces, not a runtime gate) — i.e. both flags are genuinely dead code now, exactly as n5 flagged,
not something I'm inferring.

Given that, deleting these 4 hits' surrounding sentences entirely (which is what a literal
"remove every mention" pass would do) would have been INACCURATE in the other direction: it would
imply the two config flags no longer exist, when they still do (schema.js keeps them, per n5's
explicit scope exclusion, deferred to a later phase). Deleting only the bare words "pre-commit"/
"write-lane" while leaving the rest of the sentence in PRESENT tense ("the hook DENIES...", "is
denied by default...") would have violated the task's explicit "do not restate deleted-hook
behavior as if it still exists." So for these 4 specific hits only, I rewrote the enforcement
description to PAST TENSE ("was denied by default", "formerly armed", "the hook denied") and
added an explicit "that enforcing hook has been removed; this flag is currently read by no
runtime consumer" statement, while keeping the flag names, issue refs (#376/#607, pre-existing
historical citations, not #725 provenance), and `docs/decisions/D-607-01.md` pointers intact. This
is the accurate current-state description; the "mentions" that remain are of the flags (which
still exist) and of the hook's history (which is real, past-tense, and non-misleading), not of a
still-functioning hook.

I judged this as within the doc-updater's normal editorial latitude (a fully reversible, in-scope
markdown edit, not a code change or a value-laden call) rather than something requiring a stop to
ask, per the "do not restate deleted-hook behavior as if it still exists" instruction taking
precedence over the literal zero-hit expectation when the two are in tension. n7-code-certify
should weigh this explicitly: my delta does not reduce grep hits to exactly zero, but every
remaining hit is an accurate past-tense/dead-flag description, not a live-behavior claim.

## Other downstream-consistency fixes beyond the planning-time hit count

Trimming the two hook tables (README's Claude + Codex tables, docs/api.md's Codex table) from 4
rows to 2 left stale hook-COUNT prose immediately adjacent that the literal `pre-commit\|write-lane`
grep does not catch (it says "four", not either banned substring). Left unfixed these would be
directly, visibly wrong (a table with 2 rows next to prose claiming "four"). Fixed 6 such
instances: README.md "ships four Claude Code hooks" -> "two" (line ~1196), "Codex wires the same
four hooks" -> "two" (line ~1215), "auto-merges the four managed hook entries" -> "two" (line
~1248), "expect the four ids" -> "two" (line ~1254); docs/api.md "containing the four managed
Kaola-Workflow hook entries" -> "two" (line ~2462), "### The four managed entries" -> "### The two
managed entries" (line ~2495), "All four entries carry a `timeout` field" -> "Both entries" (line
~2504). Confirmed via a follow-up grep (`four.*hook\|hook.*four\|four managed\|four ids\|four
entries`) that no other hook-count reference was left stale; the remaining "four" hits found
(README agent-profile count, docs/api.md aggregator-token count, docs/architecture.md "all four
editions") are genuinely unrelated to hook count and were correctly left untouched.

## Verification

`grep -n "pre-commit\|write-lane" README.md docs/api.md docs/architecture.md docs/conventions.md
docs/workflow-state-contract.md CLAUDE.md` -> 4 hits, all the intentional past-tense/dead-flag
rewrites documented above (none is a stale live-hook claim; see judgment-call section).
`grep -n "pre-commit-guard\|kaola-workflow:write-lane"` (the hook ID strings) across the same 6
files -> 0 hits (every table row/id reference to the deleted hooks is fully gone, not just
reworded). `wc -l CLAUDE.md` -> 143 (under the 200-line cap). Both edited markdown tables
(README's 2 hooks tables, docs/api.md's Codex hooks table) re-read after edit and confirmed
well-formed (pipe-delimited, correct column count, no orphaned rows). `git diff --stat` over the 6
docs + CHANGELOG: 25 insertions / 37 deletions across 7 files — net shrink, consistent with
"remove mentions" scope plus the dead-flag/count corrections above. Did not run
`node scripts/simulate-workflow-walkthrough.js` or `npm test` (doc-only edit, no code touched; n5
already ran and recorded the full four-chain-relevant regression suite; n7-code-certify owns final
verification of the whole Phase C candidate per the frozen plan).

evidence-binding: n5-docs bfab3912f9d5

docs-updated: CHANGELOG.md, docs/decisions/D-611-01.md, docs/api.md, docs/architecture.md, docs/conventions.md, docs/plan-run-cards/README.md

# n5-docs — Codex dispatch Join Protocol documentation (issue #611)

Read `gh issue view 611` (full body — design arms A–F, live-run evidence, controlled slot-semantics
probe, acceptance criteria) plus all four upstream evidence files
(`n1-engine.md`, `n2-preflight.md`, `n3-prose.md`, `n4-adversarial.md`) before writing. Every field
name, JSON shape, and reason-code string below was transcribed directly from
`scripts/kaola-workflow-adaptive-schema.js`, `scripts/kaola-workflow-adaptive-node.js`, and
`scripts/kaola-workflow-codex-preflight.js` (grep + `Read` on the actual source), not invented.

## Per-file summary

**`CHANGELOG.md`** — added a new `### Added` subsection under `[Unreleased]` (the section did not
exist yet; `### Changed`/`### Fixed` were already present from #610/#609/#608/#607) with one
long-form entry covering all six design arms: A (`wait_budget_minutes`/`wait_budget_source` via
`waitBudgetMinutes(model)`, 40/20/20-default minutes), B/C (long-poll join loop + escalation ladder
prose, typed `delegation_outcome`), D (writer kill-safety — the `classifyWriterReconcile`
positive-confirmation classifier, the in-run adversarial-gate fail-open refutation and its
fail-closed `barrier_unverifiable` repair, and the `adopt|revert|halt`-asked-vs-`adopt|halt`-shipped
nuance), E (`fork_turns:"none"` now unconditional), and F (frontier discipline + the preflight/
installer `multi_agent_v2` bounds report, with the observed-default-vs-fabricated-default
distinction called out explicitly). Cites `docs/decisions/D-611-01.md`.

**`docs/decisions/D-611-01.md`** (new; verified D-611-01 was free — `ls docs/decisions/` topped out
at D-610-01) — full ADR: Context (the live-run failure evidence + the controlled slot-semantics
probe, both transcribed from the issue body), Decision (all six arms A–F as shipped, including the
full `classifyWriterReconcile` truth table), Consequences, Non-goals (no heartbeat protocol, no new
subcommand, not a change to spawn authorization, the preflight numeric defaults are observed not
guaranteed), and Alternatives considered (why reconcile emits `adopt|halt` and not the issue's
literal `adopt|revert|halt`; why the first fail-open classifier was rejected; why proactive
close-agent-on-finish was rejected per the controlled probe).

**`docs/api.md`** — four edits: (1) two new bullets in the "Mutual-exclusion + integrity reason
codes" (Cluster S) catalog, right after the pre-existing `closed_member_dropped` (#384) bullet — one
for the writer-kill-safety `barrier_unavailable`/`barrier_unverifiable` reason family, one for the
`delegation_outcome` typed evidence-shape refusal. (2) Extended the `opened.dispatch` sub-object
stable field set (issue #444/D-444-01 section) with `wait_budget_minutes`/`wait_budget_source`,
plus an explanatory paragraph matching the existing `model_display`/`leg_path` paragraph style. (3) A
new dedicated subsection, "`reconcile-running-set` — writer kill-safety verdicts (issue #611,
D-611-01)", inserted right before `## Configuration` (after the existing "close-node response —
barrier field extension" subsection) — full JSON response example, the complete
`classifyWriterReconcile` truth table (verdict/reason/outOfWriteSet per `bc` shape), and the
adopt|halt-vs-adopt|revert|halt design note. (4) Extended the "Codex Harness Scripts" § dispatch-
posture report with the six additive `multi_agent_v2` bounds fields
(`max_concurrent_threads_per_session[_source]`, `effective_subagent_width`, `min_wait_timeout_ms`,
`max_wait_timeout_ms`, `default_wait_timeout_ms`) — new paragraph, updated JSON example, updated
prose for both the plain preflight gate and `--doctor` `--json` shapes (including the `plugin_cache`
scope's `'n/a'` convention, verified against the actual `scopes.push({...})` block in
`kaola-workflow-codex-preflight.js`).

**`docs/architecture.md`** — checked whether this change alters mechanics already documented there
at a design level (per the task's "surgical" instruction). Found: (a) the `opened.dispatch`
field-list bullet (#444/D-444-01, ~line 384) is deliberately non-exhaustive already (it never
listed `leg_path`/`model_display` either) and points to `docs/api.md` as the canonical field
source — left untouched, consistent with that established precedent (a pure data-field addition
does not get an architecture bullet). (b) The running-set scheduler design narrative (the same
`## Workflow Paths` section that documents #384/#596/#607's reconcile-running-set mechanism
additions in full prose) did NOT yet describe any writer-safety behavior at reconcile time — this
IS "the level this change alters" for a genuinely new mechanism (not just a field), matching the
precedent set by #607's write-fence and #596's speculative-write paragraphs in the same section. Added
one new paragraph, "Writer kill-safety reconciliation — the Codex Join Protocol (issue #611,
D-611-01)", inserted between the #607 `[INV-2]` exception paragraph and the `max_concurrent`
paragraph.

**`docs/conventions.md`** — two edits: (1) new `## Codex Join Protocol — wait budgets, escalation,
and writer kill-safety (issue #611)` section inserted right after the existing `## Codex Subagent
Dispatch (issue #266)` section (before `## Testing — Cross-Edition Validation`) — summarizes the
wait budget, escalation ladder, typed delegation outcomes, and writer kill-safety rules, pointing to
the new card + ADR for full mechanics. (2) The pre-existing "Plan-run skeleton and reference cards"
table (§ #445/D-445-01) was found already stale before this node touched it — it said "the five
cards" and enumerated only 5, omitting `speculative-open.md` (shipped by #596/#597, already present
in `docs/plan-run-cards/README.md`'s own table). Since this exact table is what I was about to make
stale a second way (omitting the new `join-protocol.md`), I corrected the heading text ("The cards",
no longer a numeral that drifts) and added rows for BOTH `speculative-open.md` and `join-protocol.md`
in the same edit — a small, low-risk fix directly adjacent to this node's declared task, inside a
file already in the declared write set (the barrier operates at file granularity, not line
granularity, so this is within the frozen write set).

**`docs/plan-run-cards/README.md`** — added the one-line index row for `join-protocol.md` in the
`## Cards` table (matching the existing format exactly), and one line under `## Related ADRs` for
`D-611-01`, matching the existing per-ADR bullet format (e.g. the `D-586-01` line).

**Did NOT touch:** `docs/opencode-edition.md` (not in the declared write set; opencode is additive/
D-530-02, no #307 four-chain obligation, and the issue's design touches no opencode-specific
mechanism); the `.md` files a role-agent write-set fence would flag as production surfaces
(`agents/*.md`, `commands/*.md`, `plugins/*/skills/*.md`) — those are n3-prose's declared surfaces,
already landed per its evidence file.

## Verification (from the leg root, `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-611`)

- `node scripts/validate-workflow-contracts.js` → `Workflow contract validation passed`
- `node scripts/validate-kaola-workflow-contracts.js` → `Kaola-Workflow Codex contract validation passed`
- `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed` (full
  suite, exit 0 — includes `testSummaryDispatchSegments602`, `testCodexDispatchModeThreading603`,
  `testRunProgressMirror605`, and every pre-existing adaptive/finalize/closure assertion; no
  regressions from the docs-only diff, as expected)
- `git status --short` at the leg root shows exactly the 6 declared paths (5 modified +
  `docs/decisions/D-611-01.md` new), plus the untracked `kaola-workflow/issue-611/` project-state
  directory (expected, not part of the declared write set / barrier).

All three required verification commands exit 0. No script/`.js` file touched by this node.

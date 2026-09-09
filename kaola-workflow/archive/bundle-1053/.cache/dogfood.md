# #1053 dogfood record — this run executed with the design it ships

Run: `bundle-1053`, branch `workflow/bundle-1053`, worktree `.kw/worktrees/bundle-1053`, baseline `d02f82b7`
(main = v10.5.0). Orchestrator: Claude Code (Fable 5.1) via the installed native `/workflow-next`, which at claim
time still carried the PRE-change Next surface; the candidate prose reached this run only through subagents and
headless hosts (see behavior-probes.md). Delegation used installed Kaola roles: tdd-guide, doc-updater,
code-reviewer, plus general-purpose subagents for probes.

## Actual goal
Add exactly two guidance passages to the shared Next authoring source and one short guide, generated to every
supported forge × runtime target, with no new mechanism — then finalize, sink, close, archive, and refresh the local
installs (no release/tag).

## Clarification: was any question asked, and why not
- **None asked.** The only candidate for a question was the missing local design draft
  `docs/investigations/2026-09-09-aidlc-minimal-adoption-design.md`. Investigation first: absent from the working
  tree, from `git log --all`, from the stash, and from all 1,313 dangling blobs (`git fsck --lost-found` + content
  grep). The issue body states it is self-sufficient and the draft is not required; the supervisor later confirmed the
  draft lives on another machine. Per the shipped guidance (missing fact → investigate; ask only for an unresolved
  scope/authorization/acceptance choice) this was a settled fact, not a decision. Recorded here; no
  HUMAN_DECISION_REQUIRED raised.
- The user's mid-run supervision messages were treated as corrections with explicit authority (comments win), not as
  questions to re-ask.

## Evidence map — issue acceptance items
| AC | evidence |
|---|---|
| 1 all Forge/Agent targets generated from the shared source, both semantics, no missed edition/hand patch | `.cache/generation.md` (21/21 Next renders carry both passages; `generate-routing-surfaces.js --check` 24 surfaces byte-match; recovery prompts confirmed not to embed Next); acceptance suite renders 15 edition×forge combos in-memory; review confirmed Cursor CLI/App/Cloud = one surface per forge with in-prompt host distinction |
| 2 clear+authorized → continue; fact gap → investigate; only real user choices asked; no duplicate requirement records/approvals | this run (no question asked, see above); probes 1/2/3/4 + act-B/C/D + 5 host fact-gap probes (`.cache/behavior-probes.md`) |
| 3 small permission fix keeps refused/allowed/regression evidence; short docs don't waive verification | act-C (git-verified RED→GREEN with refused/allowed/regression assertions under "just do it"); probe 4 |
| 4 corrections reuse existing records/authorization; no learning phase, owner-rule rewrite, or personal-memory write | probe 5; `docs/task-quality.md` §Where corrections go; suite pins no memory/learning step in init/finalize (narrowed to structural forms after review); this run wrote no personal memory and did not touch owner instructions |
| 5 Mission List four fields / three writes; no new command/role/config/state/scorer/phase/gate | `kaola-workflow/bundle-1053/mission-list.md` (7 rows, each written at creation, dispatch, close); suite non-goal pins; review point 2 |
| 6 routing generation check, affected runtime/forge tests, producer-selected chains, full walkthrough pass on the candidate | `.cache/verification.md` (filled after the chain on the re-frozen candidate) |
| 7 fresh-session behavior checks for the seven situations; unexecuted environments listed | `.cache/behavior-probes.md`: 7 decision probes + 4 act probes (Claude Code) + 5 headless real hosts; NOT RUN: ZCode, Cursor App/Cloud, interactive sessions, live forge |
| 8 run this issue with the design; record results, evidence, actual questions; no speed/rework claim | this file; no baseline exists, no improvement claimed |
| 9 refresh supported local Workflow carriers after verification/integration; check install state; list remote/cloud and unavailable hosts | post-sink section of the finalization summary (install bytes checked per home) |

## Problems found and corrected during the run
1. **Fixture leak in behavior probes (my defect).** The scenario-6 stale mission list was present in the shared fixture,
   so decision probes 1/2/4 also reacted to a fabricated `done` row. Fixed by re-running those scenarios as act probes
   on a clean fixture. Recorded, not hidden; the original answers are kept.
2. **Read-only probes over-claimed (supervisor correction).** Decision probes bound by read-only limits cannot prove
   that an unbounded agent refrains from writes or actually implements. Re-labelled as decision/understanding probes
   and added write-enabled act probes verified by git state.
3. **Acceptance suite defects (supervisor + reviewer R1).** (a) hardcoded `BASELINE_SHA` with runtime `git show`
   made a permanent chain depend on an old git object and froze the role roster (fails in a `git archive` export —
   reproduced by the reviewer); (b) phrase regexes labelled semantic had measured false-RED on legitimate synonyms and
   false-GREEN on unattached negation; (c) bare-word ban on remember/memoriz*/lessons in init/finalize was broader
   than the non-goal. The test author judged and applied minimal corrections (247 → 264 assertions, adversarial
   synonym/inversion probes now permanent), test file only; production unchanged. Candidate re-frozen and re-verified.
4. **Truncated subagent brief (my defect).** act-D's first brief was cut off; it answered as a read-only probe from the
   wrong prompt file. Re-briefed; the act result was then git-verified. Both answers agree.
5. **Host CLI invocation errors, not prose errors.** cursor (`--trust`), grok (`--output-format plain`), kimi (`-p` vs
   `-y`), and cursor text-mode empty output; corrected and re-run, attempt logs kept.
6. **Cross-checkout side effect, noted.** `generate-routing-surfaces.js --write` from a linked worktree refreshes the
   gitignored edition trees under the MAIN checkout (by design of `TREE_ROOT`); the main root's trees therefore
   reflected the candidate before the sink. After the sink they are regenerated from main.

## What this run did not do
No release/tag. No edit to owner instructions (AGENTS.md/CLAUDE.md) or personal memory. No new mechanism.
No interactive host UAT beyond this Claude Code session; no ZCode execution; no live-forge probe.

## Accepted residuals (re-review of 1b779b38, non-blocking O1/O2)
A mechanical suite cannot fully judge meaning: a double negation or a comparative inside the bound-negation window
("do not proceed without a fixed requirement format") and inflected forms of "remember" escape the detectors. The
suite's header declares this. Not chased with larger regexes — the issue forbids substituting fixed wording for
semantic correctness, and an inverted sentence is review-visible. Semantic correctness stays with independent review
and the guide, which is the intended division.

# doc-updater — issue #614

**Change under review:** finalize command/SKILL "final-validation" instruction made
dual-mode (self-host npm four-chain receipt unchanged; consumer repos run the plan's
`validation_command` once or cite fresh evidence) across 6 finalize surfaces
(3 Claude commands + 3 Codex SKILL packs) + CHANGELOG. Prose-only, zero
script/gate/behavior change.

## Checklist assessment

### CHANGELOG.md — verified, no edit
Read the `[Unreleased] > Fixed` entry at the top of `CHANGELOG.md` (added by a prior
node, n2-docs). Verified against the actual diff (`git diff origin/main -- CHANGELOG.md`
and the 6 command/SKILL files):
- Entry accurately names all 4 contradiction sites fixed in the Claude command
  (Step 1 instruction block / "Run or delegate the final validation appropriate to
  repo kind" in Operational Guardrails, the Validation Delegation Policy paragraph,
  and the Step 2 "Run or delegate the full relevant project commands" block +
  acceptance-criteria bullet) plus the condensed SKILL.md Required Steps line — matches
  the real diff hunks in `commands/kaola-workflow-finalize.md` and the two forge
  command ports, and the SKILL.md diffs (all three editions).
- Correctly states "zero script/gate/behavior change" — confirmed no files under
  `scripts/` are touched in this diff (only `CHANGELOG.md` + the 6 command/SKILL
  markdown files are changed vs origin/main).
- Cross-edition line (#307, four-chain, six-surface #400) is consistent with the
  files actually touched (3 commands + 3 SKILLs = the six finalize surfaces).
- Well-formed: single bullet under `### Fixed`, matches the file's existing
  Keep-a-Changelog-style format (bold lead sentence + issue ref + narrative
  paragraph), no duplicate entry found elsewhere in the file.
- **No edit made** — entry is accurate and not duplicated.

### README.md — assessed, no edit (no impact)
Grepped README.md for `full test suite`, `coverage >=`, `validation_command`,
`four-chain`, `finalize` — found only structural/reference mentions (finalize
subcommand help table, worktree/roadmap mechanics, `KAOLA_FINALIZE_BASE` doc,
keep-open flow, `finalize`/`release`/`watch-pr` command list). None describe an
unconditional "full suite + coverage >= 80%" mandate as user-facing behavior —
README.md never asserted that policy in the first place (it lives only in the
command/SKILL agent-prose files this issue touches). No coverage mentions anywhere
in README.md.
- **Skip reason:** no public feature, usage example, or env var is described
  differently before/after this change — no public behavior, API, setup,
  architecture, roadmap, or docs impact.

### docs/api.md — assessed, no edit (already consistent)
Grepped for `full test suite`, `coverage >=`, `validation_command`, `four-chain`,
`Validation Gate`, `finalize`. Found the existing "Dual-mode finalize gate (#475) —
self-host vs consumer" section (`docs/api.md:385-388`) already correctly documents:
1. Self-host (npm): `run-chains.js` → chain-receipt gate (`chains_unverified` /
   `chains_stale` / `chains_red`).
2. Consumer (non-npm): agent owns verification, records `.cache/final-validation.md`
   with a column-0 `verdict: pass`; `chains.json` opt-in retired.

Also found `## Meta` `validation_command` / `validation_test_consumes` documented
at `docs/api.md:342-344` ("record once, cite don't re-run" discipline). This
confirms the task's framing: the SCRIPT-level gate behavior (`--finalize-check`)
was never contradictory — only the command/SKILL PROSE instructing the agent
(which this fix corrects) was out of step with the already-correct api.md
documentation and already-correct script behavior.
- **Skip reason:** docs/api.md already accurately describes the dual-mode gate;
  this fix aligns agent-facing prose with docs that were already correct — no
  doc drift to fix here.

### docs/architecture.md — assessed, no edit (no impact)
Grepped for the same terms. No hits describing the finalize validation-gate
behavior in a way that would contradict or need updating (only unrelated hits:
"crash coverage" in a different section, and a Gitea sink test-coverage bullet).
No structural/component change in this diff (no new script, no new node type, no
DAG shape change) — this is a prose correction inside existing command/SKILL
files, not an architectural change.
- **Skip reason:** no structural relevance — no new component, no architecture
  change.

### .env.example — assessed, no edit (no new env vars)
`git diff origin/main` over all 7 changed files, grepped for `KAOLA_[A-Z_]*` —
zero matches. The diff is pure prose (markdown instruction text), no new env var
introduced, no existing env var's documented behavior changed.
- **Skip reason:** no new environment variables added by this fix — confirmed by
  grep, no `KAOLA_` (or any other) env var token appears in the diff.

### Inline comments — not applicable
All 7 changed files are Markdown (CHANGELOG.md, 3 `commands/*.md`, 3
`skills/*/SKILL.md`) — prose instructions for agents, not source code with
inline comments.
- **Skip reason:** not applicable — no code file in this diff's scope.

## Summary

No documentation files required edits beyond the CHANGELOG entry already
authored by a prior node, which was verified accurate and not duplicated.
README.md, docs/api.md, docs/architecture.md, and .env.example were all
assessed and found to have no impact from this prose-only agent-instruction
fix; docs/api.md in particular already documents the dual-mode finalize gate
correctly, confirming the fix targets agent-facing prose contradiction only,
not a documentation gap.

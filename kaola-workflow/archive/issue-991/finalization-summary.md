# Finalization — Summary: issue-991

Issue **#991** — "finalize stages all of kaola-workflow/.roadmap, not just _rules.md".
Branch `workflow/issue-991`, implementation commit `11d9d64d`.

## Delivered

#991 was filed by this project's previous run **from reading one call site**, and said so: it
carried an explicit reachability caveat and named "decide the prose is sufficient and say so here"
as a legitimate close. It closes with code because the rigorous route it also offered was taken —
reachability was established by **running**, and the run found the issue had understated itself.

- **Reachability, measured.** New `test-finalize-door.js :: T13` plants a tracked retired
  `.roadmap/issue-4242.md`, deletes it from **disk only**, runs finalize, and asserts the deletion
  reaches neither the index nor a commit. It went **red on the pre-fix build in all four editions**,
  with the file gone from HEAD after finalize. That red is the evidence the filing lacked.
- **The issue named one site; there were two, and the second was larger.** Narrowing the archive
  `candidatePaths` left T13 still red. Rather than guess, the run measured which commit removed the
  file: `chore: finalize`, not `chore: archive`. The residue enumerator (`claim.js:4981`) had its own
  arm admitting *everything* under `kaola-workflow/.roadmap/` **plus `ROADMAP.md`** into the finalize
  commit.
- **Both sites narrowed, in all four editions**, to `kaola-workflow/.roadmap/_rules.md` — the one
  file the Durable State Contract keeps. `roadmap_staged` moved in the same edit at each site, since
  it is derived by matching that literal (canonical and codex compare the path string; gitlab and
  gitea `fs.existsSync` it). The field's meaning is unchanged, so its existing assertions stand as
  authored.
- **The `ROADMAP.md` arm is dropped, not narrowed.** #988 already removed the retired mirror from the
  archive candidate list; admitting it in the residue arm merely moved the sweep one commit over.
  Dropping it **restores the designed loud failure** — an untracked mirror now stays untracked and
  `sink_blocked`s the sink instead of being quietly committed.
- **Not touched:** the staging guard at `claim.js:3535` shares the literal but not the polarity — it
  excludes `.roadmap` from being read as a *project name*.
- **Nothing is lost by the narrowing.** The mission list carried an assumption that a deleted
  `_rules.md` would stop being carried; measuring it showed the residue arm still admits it
  (` D kaola-workflow/.roadmap/_rules.md` splits to length 3 with `seg[2] === '_rules.md'`). Only the
  commit it lands in can change.

## Files Changed

16 files in `11d9d64d` (+243 / −35).

- Production, all four editions: `scripts/kaola-workflow-claim.js`,
  `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`,
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`,
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Tests: `scripts/test-finalize-door.js` (new T13), `scripts/test-forge-finalize-findings.js`,
  `scripts/test-forge-archive-scoping.js` (fixture seeds only)
- Prose: `templates/routing/init.skeleton.md` + 5 regenerated surfaces, `CHANGELOG.md`,
  `docs/decisions/0018-the-forge-is-the-backlog.md`

## Test Coverage

- **T13 red → green, in that order**, across all four editions. A test written after a fix proves
  nothing; this one was run against the unfixed build first.
- **Both sites independently mutation-proven, one at a time**, canonical edition only so each mutant
  is single-site: reverting the archive narrowing reds `T13(root)` alone; reverting the residue arm
  reds `T13(root)` alone; restoring either returns 515 green. Neither change is redundant.
- Full-scope walkthrough **184/184, exit 0**, shard header `{"index":1,"total":1}`.
- `test-finalize-door.js` 515 assertions · `test-route-reachability.js` 331 ·
  `generate-routing-surfaces --check` 18/18 byte-match.
- **Two suites went red on the first full pass and were not regressions.**
  `test-forge-finalize-findings` and `test-forge-archive-scoping` each seeded a retired
  `.roadmap/issue-1.md` as the archive candidate; once that stopped being a candidate their
  `archive_stage` read `"skipped"` and their scoping assertions went vacuous — which their own
  premise assertions caught and said. Their assertions are untouched; only the seeded filename moved
  to `_rules.md`. That is a fixture premise following its mechanism — the same edit #989 made in the
  opposite direction — not a pin rewritten to keep passing against machinery that is gone.
- T13 also caught two defects in **itself** before it could measure anything: a seed written to
  `mainRoot` left the linked worktree's index without the entry (the premise assertion fired and
  named exactly that), and the first append landed after this file's "AUTHORITATIVE" final-result
  footer, where a failure cannot set the exit code.

**Test custody deviation, stated rather than buried** — same as the preceding run. Subagents are
declined in this session, so the actor that changed the behaviour also authored T13. The substituted
evidence is stronger than custody would have been: the test was proven to fail on the unfixed build,
and each production site was mutation-proven separately.

## Validation

Four-chain receipt at `kaola-workflow/issue-991/.cache/chain-receipt.json`, bound to
`headSha 11d9d64d639c4d38784a97b4162dd0f5ca30fb00` = HEAD exactly.

| chain | exit | signal | timed out | waived | duration |
|---|---|---|---|---|---|
| claude | 0 | null | false | false | 461s |
| codex | 0 | null | false | false | 11s |
| gitlab | 0 | null | false | false | 91s |
| gitea | 0 | null | false | false | 88s |

Green, **no chain waived**; each chain's own exit code read from the receipt, not inferred from the
wrapper. All four ran, as an edition-touching diff requires.

## Changed Paths

Per the finalize transaction's own report. The 16 authored paths are listed under Files Changed;
nothing outside them was staged.

## Mission List

Five items, all `done`, at `kaola-workflow/issue-991/mission-list.md`. Every item `dispatched: self`.
Two items recorded corrections to their own premise — the second site the issue never named, and the
"loss" that turned out not to be one.

## Documentation Docking

`DOCKED`. This run made three earlier statements false and corrected all three rather than leaving
them standing:

1. **#986's shipped migration prose** (`init.skeleton.md`) said a disk-only deletion "is staged by
   the next finalize and lands, unreviewed, inside an unrelated run's archive commit". Rewritten: the
   advice not to delete from disk alone **stands**, but its reason is now that index and worktree
   disagree with the deletion uncommitted — not that this tool will commit it for you. The revised
   sentence is not one of the `in-backlog-migration` content_tokens; surfaces regenerated and
   route-reachability green.
2. **ADR 0018's status line** carried the same claim. It now records that the second direction was
   real and that #991 removed it from the tool.
3. **The #986 CHANGELOG entry**, in the same `[Unreleased]` block, asserted it in the present tense.
   Past-tensed and pointed at the new `### Fixed` entry.

No-impact, checked not assumed: `README.md` (no mention of archive staging), `docs/api.md`,
`docs/architecture.md` (the init contract line is unchanged by this fix),
`docs/workflow-state-contract.md` (`_rules.md`'s status is unchanged — this run makes the code match
what that document already said), `.env.example`, project `CLAUDE.md`.

## Run gaps

- none — scanner swept zero classes, and this run discovered no defect outside the one it fixed.

## Follow-Up Items

- None. The backlog is empty after this closes.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-991/.cache/chain-receipt.json
- kaola-workflow/archive/issue-991/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-991/.cache/run-gaps.json
- kaola-workflow/archive/issue-991/finalization-summary.md
- kaola-workflow/archive/issue-991/mission-list.md
- kaola-workflow/archive/issue-991/workflow-state.md

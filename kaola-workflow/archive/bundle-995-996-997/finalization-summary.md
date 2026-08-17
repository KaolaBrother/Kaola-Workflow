# Finalization — Summary: bundle-995-996-997

Three issues, closed on one commit: `d63fe703`. All three were filed by reading, and **two of the
three were wrong about their own mechanism** — not carelessly; both bodies were unusually
well-evidenced. What reading could not establish was *why* the behaviour existed, or whether the
detector each proposed would ever fire. Both premise corrections are posted on their issues.

## Delivered

**#995 — Step 7 now tells a run to tier what it files.** ADR 0018 recorded the duty; the shipped
prose never carried it. An issue filed with no `P` label takes tier 99 (`claim.js:272-279`) and
`listOpenIssues` (`:281-291`) sorts on that tier while neither filtering nor truncating, so an
untiered follow-up sorts **last** — a P0-urgent defect ranks below a P3. The filing paragraph now
names the tier alongside `filed: #N`, inside the existing `forge-is-the-backlog` pin. The manifest
pins the duty and its measured consequence as **two** tokens: a block holding only the duty stays
green while the reason decays back to the wrong wording. ADR 0018's own sentence is corrected in
place — "invisible to the sorter" is not what the code does; an untiered issue is demoted, never
hidden.

**#996 — closed by announcement, not relocation.** Writing the MAIN checkout's edition trees from a
linked worktree is #969's deliberate design (`9b6fac01`, four days before this was filed), pinned by
`A31`, and depended on by both edition installers via `--print-tree-root`. Both remedies the issue
proposed were refuted: relocating the tree fails `test-opencode-edition.js:3499` by construction,
and skipping the refresh re-opens the staleness #969 closed. The defect was narrower — nothing said
it had happened. `runRefreshPresent` now prints a stderr note when it changes a checkout that is not
the invoking one, gated on a change having occurred, counting prunes because a delete-only refresh
is the destructive half of the same reach.

**#997 — an unreadable gap section no longer stamps a confident zero.** The test the issue named
measures **zero**: the parser's loose advisory has never fired across 154 archived summaries, so a
fix keyed to it would have changed nothing. The real harm is 6 sections losing 18 `filed: #N` refs
in three shapes — rows with no parenthesised sample, a row wrapped across physical lines, and a
section written as a markdown table. `parseGapSection` now carries out a non-enumerable
`unaccountedFiled`; the stamp degrades to `unknown` when any is present, including the partial case.

## Files Changed

25 files, +913/−61, all in `d63fe703`.

- **Routing prose (7):** `templates/routing/finalize.skeleton.md` and its 6 rendered finalize
  surfaces (`commands/`, three `plugins/*/skills/`, two `plugins/*/commands/`).
- **Pin manifest (1):** `templates/routing/required-blocks.js` — two tokens folded into
  `fn-forge-is-the-backlog` (13 → 15).
- **Scripts, 4 editions (8):** `kaola-workflow-gap-sweep.js` and `kaola-workflow-claim.js` in
  `scripts/` and all three `plugins/*/scripts/`.
- **Edition sync (2):** `scripts/sync-opencode-edition.js`, `scripts/sync-kimi-edition.js`.
- **Tests (3):** `test-finalize-door.js` (T14's fourth/fifth/sixth legs),
  `test-opencode-edition.js` (`A34`), `test-kimi-edition.js` (`K16`).
- **Docs (4):** `CHANGELOG.md`, `docs/api.md`, `docs/workflow-state-contract.md`,
  `docs/decisions/0018-the-forge-is-the-backlog.md`.

## Test Coverage

Test custody held throughout: no agent pinned what it built.

- **#995's guard** — `fn-forge-is-the-backlog` gained two tokens, authored by a role that did not
  write the prose. **12/12 obligated surfaces red individually**; each token additionally mutated
  alone to prove it fires on its own, since gutting the clause would only have shown ≥1 armed.
- **#996's note** — new `A34`/`K16` bands, six legs each: fires on a real cross-checkout change;
  silent from main *even though files were written*; silent when nothing changed; stderr-only with
  zero `NOTE` on stdout; names the other root; fires on a deletion-only refresh. **6/6 mutations red
  exactly their aimed leg**, one at a time, `otherFails=0` throughout. Reached-not-skipped proven by
  count: 663→678 and 627→642, both exactly +15.
- **#997's stamp** — T14 gained legs driven by fixtures **extracted from the archive by script and
  emitted as escaped literals, not retyped**. The `wrapped` leg witnesses reachability by asserting
  a value that can only come from row 2 of the real fixture. Two mutants, one at a time: the narrow
  rule reds only `wrapped`; the over-broad rule reds the prose and free-text controls. The guard is
  armed against under-fixing *and* over-fixing.

## Validation

Chain receipt `.cache/chain-receipt.json`, bound to `headSha d63fe703`, `codeTreeHash 395f03f4…`.
Diff-scoped `all-four` for `edition_coupling` over 25 changed files, 17 of them edition-touching.

| chain | exit | accepted_red | timed_out | signal | duration |
|---|---|---|---|---|---|
| claude | 0 | false | false | null | 473s |
| codex | 0 | false | false | null | 10s |
| gitlab | 0 | false | false | null | 90s |
| gitea | 0 | false | false | null | 88s |

No red chains, no accepted reds, no waivers. Low step counts on codex/gitlab/gitea are the one-time
preamble hoist, not skipped work.

Ahead of the chains, the **walkthrough at full scope**: exit 0, and the scope is proven by the
suite's own census rather than asserted — `{"index":1,"total":1,"scenarios":184,"ran":184,"passed":184,"failed":0}`.
`total:1` is what distinguishes this from the fast gate's rotating 1/12 shard; `ran == scenarios`
rules out a silent skip.

**One honest limit.** The two edition suites cannot run in place on this worktree: `D0` reads red
because main's edition trees are deliberately at main's canonical while this branch is ahead. That
is the designed drift signal, and it is the same seam #996 is about, seen from the other side.
`A34`/`K16` were therefore proven in a hermetic copy and have **not** executed against the real
checkout. They will once main's trees regenerate after this merges — which is the immediate
post-sink action.

## Changed Paths

Filled by the finalize transaction.

## Mission List

Filled by the finalize transaction. The run's own record is `mission-list.md`: 16 items, all closed,
including one marked **obsolete on measurement** — the original #996 test mission specified proving
that a worktree `--write` leaves main's trees untouched, which the trace then showed is the opposite
of the design. It was withdrawn rather than deleted, so a successor can see the inversion happened.

## Documentation Docking

`DOCKED` — `.cache/doc-docking.md`. Four documents updated, three verified no-impact by search
rather than by assumption. The find worth naming: `docs/workflow-state-contract.md:296` still
described the pre-#997 two-state semantics. No field was added, so a changed-symbol sweep would not
have surfaced it; what changed was the *meaning* of a value the contract documents.

## Run gaps

- manual:route-reachability-count-stale (test-route-reachability.js:1008 claims 9 of 30 content-led blocks; measured 10 of 19): filed: #999
- manual:run-gaps-table-unreadable (a markdown-table Run gaps section is invisible to parseGapSection): filed: #1000
- manual:run-gaps-heading-must-stand-alone (a Run gaps heading with a parenthetical classifies as section-absent): filed: #998
- manual:edition-drift-detector-unscheduled (nothing schedules D0 after a worktree --write on a non-edition diff): noise: the announcement shipped in this bundle covers the observed half — a human is now told the cross-checkout write happened and given the command to verify it. What remains only bites a reader who ignores the note, which is a hypothesis rather than an observation, and this project records those rather than building against them.

## Follow-Up Items

Three filed, each carrying a `P` tier — this bundle's own new rule, applied to its own filings.

- **#999** (P3, bug) — `test-route-reachability.js:1008` states a content-led block count wrong in
  both figures: 10 of 19 measured, comment says 9 of 30, denominator off by 11. Hedged "today" and
  read by nothing, so descriptive drift rather than a disarmed guard.
- **#1000** (P2, enhancement) — whether a `## Run gaps` section may legally be a markdown table.
  A values call before it is a code change: either the parser learns to read one, or `issue-725`'s
  record is simply wrong. Filed with the archive evidence so the choice is made on measurement.
- **#998** (P3, bug) — a `## Run gaps` heading carrying a parenthetical classifies as section-absent.
  Measured at finalize rather than filed as a hypothesis: exactly 1 of 127 archived summaries, and
  it loses no filing — the mis-stamp is in the *conservative* direction, the opposite of #997's.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-995-996-997/.cache/996-resolution-trace.md
- kaola-workflow/archive/bundle-995-996-997/.cache/997-archive-scan.md
- kaola-workflow/archive/bundle-995-996-997/.cache/997-design-brief.md
- kaola-workflow/archive/bundle-995-996-997/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-995-996-997/.cache/dispatch-log.jsonl
- kaola-workflow/archive/bundle-995-996-997/.cache/doc-docking.md
- kaola-workflow/archive/bundle-995-996-997/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-995-996-997/.cache/run-gaps-manual.md
- kaola-workflow/archive/bundle-995-996-997/.cache/run-gaps.json
- kaola-workflow/archive/bundle-995-996-997/finalization-summary.md
- kaola-workflow/archive/bundle-995-996-997/mission-list.md
- kaola-workflow/archive/bundle-995-996-997/workflow-state.md

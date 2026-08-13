# doc-updater — bundle-969-970-971-972 (second sweep)

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-969-970-971-972`,
branch `workflow/bundle-969-970-971-972`. This is a follow-up sweep after `impl-docs` (see
`kaola-workflow/bundle-969-970-971-972/impl-docs.md`), which docked `docs/api.md`,
`docs/architecture.md`, `docs/workflow-state-contract.md`, `docs/conventions.md`,
`docs/opencode-edition.md`, `docs/kimi-edition.md`, `templates/routing/finalize.skeleton.md`,
`templates/routing/required-blocks.js` and the 6 regenerated surfaces. That agent's own record
confirms it never touched `README.md`. My task was to find what was missed.

## Files changed

| file | change |
|---|---|
| `README.md` | two edits, both closing real gaps left after #970 landed a third finalize report |

## Line by line

### `README.md`

1. **New bullet after "Changed paths"** (was `:960-962`, now `:960-966`, in the `### 5. Finish`
   section's list of finalize-transaction reports). The list documented `Validation` and
   `Changed paths` but not the third report #970 shipped. Added a `Mission list` bullet in the
   same style (lead phrase, envelope key, durable heading, one line on when it's present/absent),
   sourced from `docs/architecture.md`'s already-docked wording (`## Mission List` → items count +
   `outcome_while_not_done` line numbers, present only when the run wrote a record, zero-count
   still reports, read-never-repaired) and cross-checked against the actual code in
   `scripts/kaola-workflow-claim.js` (`probeMissionListCoherence`, `persistMissionListToSummary`,
   the `finalizeEmit.mission_list` assignment).
2. **`finalize` subcommand table row** (`:1070`, in "Active-folder subcommands"). Was: *"It also
   reports `validation` and `changed_paths` on its envelope and durably in the summary."* Now
   includes `mission_list`. This is the same fact as #1, restated in the CLI reference table, and
   was equally stale.

Both are one-clause insertions into existing sentences — no new paragraphs, no new section.

## Verification

- `node scripts/generate-routing-surfaces.js --check` → exit 0, **"all 18 surfaces byte-match the
  skeleton."** (unaffected — I touched no skeleton, no `templates/routing/*`.)
- `node scripts/validate-script-sync.js` → exit 0, **"OK: 15 common scripts, 27 byte-identical
  groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 6 forge
  export-superset families in sync. committed kernel parity: 4 Oracle Kernel copies identical at
  HEAD."** (unaffected — README.md is not a generated or synced surface.)
- I did not edit any routing skeleton, so `test-generate-routing-surfaces.js` /
  `test-route-reachability.js` were not required and were not run for this change.
- `git status --short` after my edit shows exactly one line touched by me: `README.md` (`git diff
  --stat` → `README.md | 7 ++++++- , 1 file changed, 6 insertions(+), 1 deletion(-)`). Every other
  modified/untracked path in this shared worktree belongs to other agents' work and I left it
  alone.

## Checked, deliberately NOT changed (with reason)

Per the dispatch brief's four suspected-gap locations:

1. **README.md:959 (now `:960`+) — the finalize-report bullet list.** STALE, now fixed (see above).
2. **README.md:225 — `./install-all.sh` paragraph and its PASS/FAIL summary table.** No change.
   This paragraph names no internal mechanism (no "version", no "content", no "PARTIAL", no Codex
   convergence detail at all) either before or after #972 — it treats the wrapper as a black box
   ("ends with a per-runtime PASS/FAIL summary table"). `PARTIAL` does not appear anywhere in
   README.md, in this section or any other — confirmed by `grep -n "PARTIAL" README.md` (no
   matches) — so there is nothing in README that currently claims only two statuses exist, and
   nothing that needs correcting for the new *conditions* that produce PARTIAL for Codex. This
   matches the instruction not to claim PARTIAL is new; I'm reporting there was no README sentence
   describing the PARTIAL trigger to begin with, at any level of detail — the whole
   version-vs-content mechanism lives only in `install-all.sh`'s own comments/`--help` text, which
   is consistent with how README already treats every other install-all.sh internal (thin
   black-box description, not a mechanism walkthrough).
3. **README.md:1014 — the `kaola-workflow-gap-sweep.js` table row.** No change. The row describes
   *what* the script does ("sweeps... reconciles them... in both directions"), not *how* it
   resolves its root directory. That is true before and after #971's root-resolution fix. For
   comparison, I checked whether root-resolution/worktree mechanics are described anywhere for
   *any* script at this abstraction level (README's `Automation scripts` / subcommand tables) —
   they are not, not even for `kaola-workflow-claim.js`'s worktree provisioning row, which is the
   one row in the table that does name worktree behavior explicitly because worktree
   *provisioning* is itself the row's subject. Root-resolution for gap-sweep is documented at the
   mechanism level in `docs/api.md` (already docked, unchanged by #971 — verified `grep -n
   "KAOLA_GAP_ROOT\|resolveRunRoot" docs/api.md docs/architecture.md docs/workflow-state-contract.md`
   returns nothing in any of them, before or after — none of the docked docs describe the
   resolution mechanism either, so README not describing it is consistent, not an omission this
   bundle created).
4. **Any README section enumerating sync-script CLI modes.** No such section exists. Confirmed by
   `grep -n "sync-opencode-edition\|sync-kimi-edition\|--refresh-present\|--print-tree-root"
   README.md` — the only match is a passing mention of `edition-sync.js` (a different script) at
   `:237`, in the sentence establishing the additive-runtime boundary; it says nothing about CLI
   flags. The sync scripts' CLI surface is enumerated in `docs/api.md` (already docked with
   `--refresh-present` and `--print-tree-root`, verified: `docs/api.md:1498`) and in
   `docs/opencode-edition.md` / `docs/kimi-edition.md`'s "Develop / regenerate" blocks (already
   docked by impl-docs's second, appendix task — verified `--refresh-present` present in both
   files at `docs/kimi-edition.md:309` and `docs/opencode-edition.md:337`). Nothing to add in
   README.

Also checked, no change (found while sweeping, not in the brief's four items):

5. **README.md `:352-367` (`### opencode` / `### kimi` install command blocks)** — `--regenerate`
   (opencode) is still accurate from an ordinary checkout, which is the posture these commands
   document; the worktree-source-resolution fix (#969's installer half, shipped alongside #971)
   changes nothing observable from that posture. No worktree caveat existed here before, and none
   is warranted now — the fix makes worktree installs work rather than introducing new
   user-visible behavior to document.
6. **README.md `:233`, `:235` (opencode/kimi "additive runtime" paragraphs)** — describe *runtime*
   script resolution (`${OPENCODE_CONFIG_DIR}/kaola-workflow/scripts`,
   `${KIMI_CODE_HOME}/kaola-workflow/scripts`), which is a different resolution question from the
   *generation source tree* #969 fixed. Not stale.
7. **No README mention of `generate-routing-surfaces.js` at all** (`grep -n
   "generate-routing-surfaces" README.md` → no matches) — the mandated-regenerate-also-refreshes
   rule lives in `docs/conventions.md` (already docked) and `CLAUDE.md`, not README, consistent
   with README's existing abstraction level for this script.
8. **No verbatim `install-all.sh --help` quote in README** to go stale against the `--help` text
   `impl-installers`/`impl-972` rewrote.
9. **`docs/README.md`** (the docs index) — no relevant mentions (`Validation`, `Mission List`,
   `gap-sweep`, `sync-opencode`, `sync-kimi`, `install-all` all absent), and it is not part of the
   diff. No change.

## Anomaly observed, not mine to report on further

A self-referential symlink `plugins/plugins -> .../plugins` was present as an untracked path when
I started (`git status --short` showed `?? plugins/plugins`). It was gone by the time I finished
this pass (confirmed absent in a later `git status --short`) — some other agent in this shared
worktree evidently created and then cleaned it up as part of its own work. It never touched any
file I was scoped to and is not present in the final `git status --short`, so I'm noting it only
for the record, not as an open gap.

## Gaps I could not close

None. Both README gaps found in the brief's suspected locations were real and are now fixed; the
other three suspected locations and the additional sweep items above were checked and are
correctly not-stale, each with a verified reason above (not a guess).

# Documentation docking — bundle-973-974-975

## Verdict: DOCKED

## Changed files reviewed

36 tracked files modified (+2820/−133) plus 4 untracked additions. Grouped by what a reader would
need documented:

- **Installers** — `install.sh`, `install-kimi.sh`, `install-opencode.sh`, `install-all.sh`.
- **Resolvers** — `scripts/kaola-workflow-gap-sweep.js`, `scripts/kaola-workflow-validation-runner.js`
  and their six regenerated forge ports.
- **Finalize + sink** — the four hand-ported `kaola-workflow-claim.js` copies and the four
  `kaola-workflow-sink-merge.js` copies.
- **Tests** — nine suites plus the new `scripts/test-fixture-sandbox.js`, and `package.json` for its
  chain registration.
- **Roadmap** — `kaola-workflow/ROADMAP.md` and three new `.roadmap/issue-97{3,4,5}.md` sources.

## Documents checked

`README.md` · `CHANGELOG.md` · `docs/api.md` · `docs/architecture.md` · `docs/conventions.md` ·
`docs/workflow-state-contract.md` · `docs/kimi-edition.md` · `docs/opencode-edition.md` ·
`docs/decisions/0017-the-mission-list.md` · `docs/README.md` · `templates/routing/` ·
`commands/` · `agents/` · the issue statements for #973, #974, #975.

## Gaps found and fixed

1. **`docs/kimi-edition.md:150-151` and `docs/opencode-edition.md:147-148` asserted behaviour the
   #973 fix removed** — both said `copy_skills` / `copy_tree` "is self-healing: before re-copying it
   prunes every kaola-owned skill dir not in that set, so a reinstall converges to exactly the
   workflow skill set on disk". Every clause false after the change. Both rewritten to state what
   each installer actually removes, and that retiring a surface now means adding its name to the
   relevant list. Fixed by the orchestrator; routed up by `impl-973`.
2. **`install-opencode.sh:48-63` carried the same falsified claim in a code comment.** Its kimi twin
   had been updated and opencode was missed. Fixed by `impl-973b`, found by reading rather than by
   any suite.
3. **`scripts/kaola-workflow-sink-merge.js:517-518` claimed the probe passes `--untracked-files=no`
   and that `ownedProjects` is "passed through to the inner status check"** — both false after the
   sink guard landed, and the second exactly inverts the fix's whole subtlety, which is that this
   call must use `[]`. Fixed by the orchestrator; found by `review-sink` (RS1).
4. **The tie-break comment in both #974 resolvers asserted `workflow-state.md` is "written by the
   claim transaction and nothing else"** — false: the finalize mirror (`claim.js:3466`, `:3479`) and
   `sink-pr.js:160` also write it. The tie-break premise survives every producer found, so this was
   a wrong absolute rather than a wrong rule. Fixed by `impl-repairs`; found by `review-974`.
5. **The `[]` owned-project boundary was undocumented.** `docs/conventions.md` now records that
   `worktreeDirtRecords` calls `isParkedLanePath` with an empty owned set deliberately, because in a
   linked worktree the lane folder is that run's throwaway copy rather than the live record the
   main-root check protects. Added by `doc-updater`.
6. **`docs/api.md`'s findings row and count sentence** did not carry `residue_unattributed`. Updated
   by `impl-975`; the count was verified correct against a constructor census by `review-975`
   (9 canonical/codex, 8 forge, delta exactly `archive_unstage_failed`) rather than merely
   incremented.
7. **`docs/api.md`'s `worktree_dirty` bullet asserted a FIFTH false absolute** — "uncommitted work
   is never silently destroyed". That was already false before this bundle, since the old
   `--untracked-files=no` probe could not see untracked work at all, and it is still not absolute
   after the sink guard: three residual shapes remain. Found by `doc-updater`, which appended the
   qualification. The orchestrator then repaired the opening sentence itself, because the
   qualification landed eight lines below the absolute and left the paragraph contradicting itself —
   a reader stopping at the first sentence would still have taken away the false claim.
8. **The ADR 0017 watch-list row's line anchors were shifted stale by this same diff.** Re-measured
   rather than offset-guessed: the walk is `install-all.sh:400-407` inside `codex_cache_content_state`
   at `:395`, and the second copy is `dirsEqual` at `scripts/test-install-all.js:496-502`.

## Checked and found already correct — no action

- **No fourth falsified prune sentence exists.** A sweep of `README.md`, `docs/`, `templates/`,
  `commands/` and `agents/` for `self-healing|converges to exactly|namespace-complete|blanket-then-recopy|blind-prune`
  returns one hit, `docs/decisions/D-629-01.md:57`, which is about `COMMON_SCRIPTS` in a chain — a
  different mechanism, untouched by this bundle, and an ADR is a historical record in any case. The
  hypothesis that a fourth existed was measured and refuted rather than assumed.
- **Both surviving `--untracked-files=no` mentions in prose are correctly framed as PAST behaviour**
  (`docs/api.md:851` "before that widening…", `docs/conventions.md:818` "widened from…").
- `docs/workflow-state-contract.md` — `run-gaps.json`'s registered schema is `{project, sweptClasses}`
  and is unchanged by this bundle, so its contract entry still holds.
- `README.md` — describes the three-command surface and install flow; neither changed.
- `templates/routing/`, `commands/`, `agents/` — no routing skeleton names a finding type or the
  installers' prune behaviour, so nothing needed regenerating.
  `generate-routing-surfaces.js --check` exit 0 at 18 surfaces confirms it.

## No-impact reasons

- **The `--check` envelope's `checks.dirty_paths`** is unchanged: the #975 classification was scoped
  to the finalize transaction by the user's ruling, and extending it to the `--check` surface would
  widen past that ruling.
- **The in-place (non-worktree) finalize lane** is untouched — an in-place run's dirt belongs to the
  orchestrator by existing design (`claim.js:4237-4239`), so there is no foreign/own question there.
- **The two known limits of directory attribution** (own work in a brand-new directory; the
  repository root being attributed by any root-level commit) are documented in `CHANGELOG.md` as
  deliberate, with the measurement showing why the obvious alternatives reintroduce the defect they
  would replace.

## CHANGELOG

Five entries under the existing `[Unreleased]` → `### Fixed`, covering #973 across three installers,
#974 across both resolvers, #975's two halves, and the sink guard with its three stated residuals.

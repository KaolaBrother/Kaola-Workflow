# Finalization — Summary: bundle-973-974-975

Closes #973, #974, #975 — the whole open backlog. Reviewers ran on the Fable model this run, at the
user's direction, and that step earned its place: it found a regression the bundle's own fix had
introduced, and a data-loss path the bundle itself had made live.

## Delivered

**#973 — an install no longer removes a deployed skill or command it is not going to replace.**
The issue as filed covered only a total wipe; measurement showed the reachable and more damaging
cases are silent partials at exit 0 (kimi 17 skills → 3 under an empty canonical `agents/`, → 14
under a renamed command; opencode 3 commands → 0 with no zero-guard at all; `install.sh --forge=gitlab`
emptying `~/.claude/commands` under "skeleton installed"). The user ruled the fix cover all three
installers against the truer result. Each now removes exactly two things: names it retired on
purpose, and each name it is about to write, immediately before writing it. The distinction is by
**declaration only**, because "retired" is not a property an installer can infer — both look
identical on disk.

**#974 — a leftover run folder no longer silently satisfies either record resolver.**
`workflow-state.md` is now a **tie-break between two candidate trees, never a requirement on one**:
the invoking tree wins when it carries the signature and when neither tree does; main is preferred
in exactly one case. `KAOLA_GAP_ROOT` keeps outright precedence. The user ruled both co-derived
resolvers in scope, so the chain receipt can no longer be filed into a leftover — #971 had fixed one
of the two.

**#975 — finalize reports what it cannot attribute, and fixtures stay out of the checkout.**
A path whose own directory the branch never committed to is reported as a typed
`residue_unattributed` finding instead of being committed; the run's own work still stages; the exit
code is unchanged either way. Fixture roots no longer resolve against the current directory, in both
the Node and shell halves. The cycle-guard half was **refuted by measurement and recorded on the
watch list rather than built**.

**The sink guard (in scope by consequence).** #975 made finalize deliberately leave unattributable
paths untracked — and Step 0's clean-worktree guard probed with `--untracked-files=no`, so it could
not see them and `git worktree remove --force` destroyed them. A dormant blindness made live by this
bundle's own change. The user ruled the fix ships here.

## Files Changed

36 tracked files, +2820/−133, plus 4 additions. Installers (`install.sh`, `install-kimi.sh`,
`install-opencode.sh`, `install-all.sh`); both resolvers and their six regenerated forge ports; the
four hand-ported `claim.js` and four `sink-merge.js` copies; nine test suites plus the new
`scripts/test-fixture-sandbox.js` and its chain registration; `CHANGELOG.md`, `docs/api.md`,
`docs/conventions.md`, `docs/kimi-edition.md`, `docs/opencode-edition.md`,
`docs/decisions/0017-the-mission-list.md`; the roadmap mirror and three new sources.

## Test Coverage

Authored by test custody, never by the implementing role. Every pin mutation-proven against at least
two structurally different repairs, so a result is pinned rather than a mechanism.

- **#973** — P5a/P5b (kimi legs B and E), P7a (opencode leg E), and one `install.sh` probe covering
  **all three forges**; leg D deliberately not separate, since it is B and E simultaneously and a
  D-only repair reds both. Retired-sweep and no-nesting pinned with anti-vacuity in both directions.
  The retired pin was later widened from a 4-name sample to the **full censused 11**, derived from
  history and deliberately not read back from the installer's own array.
- **#974** — T26a/b/c across three variants including a bare empty directory, T26d pinning the
  legitimate post-mirror window, T26e for `KAOLA_GAP_ROOT`; plus the second resolver in
  `test-validation-runner.js`. Detect-and-report and retarget both close the suite; a constant-report
  control stays red.
- **#975** — part D across all four editions with three foreign shapes including a **foreign
  modification to a tracked file**; the new `test-fixture-sandbox.js` observing the escape *live*,
  since `cleanup()` erases it before any before/after check.
- **Sink guard** — five arms × four editions: untracked file, **untracked symlink** (its own `lstat`
  oracle, because the observed #975 artifact was a self-referential link and `existsSync` answers
  false on one), the legacy entry point, plus must-not-break controls for ordinary lane content and
  ignored files. 24 reds at baseline, non-vacuous per edition.
- **`test-finalize-door.js` T9b** — its *observation* was repaired (it compared a raw needle against
  `JSON.stringify`, so a name carrying a newline, quote or backslash could never be seen on the
  "named" branch). The assertion's declared acceptance is unchanged.

## Validation

*(the finalize transaction's finding lands here)*

## Changed Paths

*(the finalize transaction's report lands here)*

## Mission List

*(the finalize transaction's report lands here)*

## Documentation Docking

**DOCKED** — `.cache/doc-docking.md`. Eight gaps found and fixed, of which **five were prose or
comments asserting something untrue**: two edition docs and an installer header comment describing a
prune the fix had just removed; a sink comment naming the wrong probe flag and inverting the fix's
own subtlety; a tie-break comment claiming sole authorship of `workflow-state.md` that three other
writers falsify; and `docs/api.md`'s `worktree_dirty` bullet asserting "uncommitted work is never
silently destroyed", which was already false *before* this bundle and is still not absolute after
it. **Not one of the five was caught by a suite — every one was found by reading.**

Two were repaired past their finder's fix: the `api.md` qualification originally landed eight lines
below the absolute it corrected, leaving the paragraph to contradict itself, so the opening sentence
was rewritten too. A hypothesised further falsified *prune* sentence was searched for across
`README.md`, `docs/`, `templates/`, `commands/` and `agents/` and **refuted** rather than assumed —
the single hit is an ADR about a different mechanism.

## Run gaps

- manual:installer-tmpdir-escape (the relative-TMPDIR escape survives at seven more installer sites outside #975's enumerated set): filed: #976
- manual:retired-name-incomplete (install.sh strands seven claude-workflow* names, opencode's uninstall ignores its retired list, and probe U1 structurally cannot observe a retired residue): filed: #977
- manual:sink-lane-exemption-residual (three measured shapes the lane exemption still destroys silently — backslash filenames, an embedded git repo collapsing to one record, the legacy route's own .cache journal): filed: #978
- manual:sink-staging-dir-leak (the sink's kw-wtsync-* staging directory is never removed): noise: real but measurably harmless — pre-existing, outside both trees, living in /private/tmp, and destroying nothing. Recorded rather than filed, per the user's ruling.

## Follow-Up Items

- **#976** — the relative-TMPDIR escape at seven further sites. Carries the two idioms measured *not*
  to reach the result, so they are not rediscovered.
- **#977** — retired-name handling incomplete on two axes and untested on a third.
- **#978** — the sink's three lane-exemption residuals, with the two arms any fix must not break.

Recorded, not built, with the observation that would arm each:

- **The refuted cycle guard** — on the ADR 0017 watch list. `Dirent` has lstat semantics, so a
  symlink answers `false` to both `isDirectory()` and `isFile()` and the walk skips it by
  construction; three loop shapes including `loop -> .` returned `same` immediately. What would arm
  it is a walk here that follows links at all.
- **Two known limits of directory attribution** — own work in a brand-new directory is reported
  rather than staged, and the repository root is attributed by any root-level commit. Documented in
  `CHANGELOG.md` with the measurement showing that top-segment *and* nearest-ancestor attribution
  would each have called the original `plugins/plugins` artifact the run's own work.
- **A forgotten retirement is undetected.** Retiring a surface now requires a list entry and nothing
  checks for a missing one. The failure mode is benign — a dead directory lingers, nothing is
  destroyed.
- **`finalValidationPassed` had never been exercised** anywhere in this repo before this run, because
  the legacy tests drove the root script only.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-973-974-975/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-973-974-975/.cache/dispatch-log.jsonl
- kaola-workflow/archive/bundle-973-974-975/.cache/doc-docking.md
- kaola-workflow/archive/bundle-973-974-975/.cache/doc-updater.md
- kaola-workflow/archive/bundle-973-974-975/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-973-974-975/.cache/run-gaps-manual.md
- kaola-workflow/archive/bundle-973-974-975/.cache/run-gaps.json
- kaola-workflow/archive/bundle-973-974-975/finalization-summary.md
- kaola-workflow/archive/bundle-973-974-975/impl-973.md
- kaola-workflow/archive/bundle-973-974-975/impl-974.md
- kaola-workflow/archive/bundle-973-974-975/impl-975.md
- kaola-workflow/archive/bundle-973-974-975/impl-repairs.md
- kaola-workflow/archive/bundle-973-974-975/impl-sink.md
- kaola-workflow/archive/bundle-973-974-975/measure-sink-shapes.md
- kaola-workflow/archive/bundle-973-974-975/mission-list.md
- kaola-workflow/archive/bundle-973-974-975/premise-973.md
- kaola-workflow/archive/bundle-973-974-975/premise-974.md
- kaola-workflow/archive/bundle-973-974-975/premise-975.md
- kaola-workflow/archive/bundle-973-974-975/review-973.md
- kaola-workflow/archive/bundle-973-974-975/review-974.md
- kaola-workflow/archive/bundle-973-974-975/review-975.md
- kaola-workflow/archive/bundle-973-974-975/review-sink.md
- kaola-workflow/archive/bundle-973-974-975/tests-973.md
- kaola-workflow/archive/bundle-973-974-975/tests-973b.md
- kaola-workflow/archive/bundle-973-974-975/tests-974.md
- kaola-workflow/archive/bundle-973-974-975/tests-975.md
- kaola-workflow/archive/bundle-973-974-975/tests-sink.md
- kaola-workflow/archive/bundle-973-974-975/tests-t9b.md
- kaola-workflow/archive/bundle-973-974-975/workflow-state.md

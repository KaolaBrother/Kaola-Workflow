# doc-updater — bundle-973-974-975

Working tree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975`,
branch `workflow/bundle-973-974-975`, confirmed via `git status --short --branch` before starting.

## Checklist worked from

CLAUDE.md has no section literally titled "Documentation Update Checklist"; the operative rule is
its closing line of the Commands section: **"On any user-visible change, update: `README.md` ·
API docs · `CHANGELOG.md` under `[Unreleased]` · architecture docs if structure changed · inline
comments where public interfaces changed."** I read the full diff against `main` (36 files,
+2820/−133) to establish ground truth for #973 (installer prune), #974 (gap-sweep/validation-runner
tie-break), and #975 (finalize residue attribution, sink Step 0 untracked-work guard, test-fixture
sandbox root) before touching prose, then walked README.md, docs/architecture.md, docs/conventions.md,
docs/workflow-state-contract.md, docs/README.md and `.env.example` against it. Also read the full
`mission-list.md` (123 lines) for this run, which is dense with facts the implementers and reviewers
already measured — several of the doc claims below are corroborated there rather than re-derived.

## Files changed by me, and why

### `docs/api.md`

`worktree_dirty` bullet (the `sinkPreflight`/`assertWorktreeClean` entry, unchanged by this bundle's
own diff — verified against `main`'s copy, byte-identical). It asserted, as an unqualified absolute,
that "uncommitted work is never silently destroyed." That claim was demonstrably **false before
this bundle**: the probe read `git status --porcelain --untracked-files=no`, which structurally
cannot report an untracked path, so a worktree whose only uncommitted content was untracked probed
clean and was destroyed by `git worktree remove --force` (this is exactly what review-sink's F1
finding forced the sink-guard fix for, per `mission-list.md` item at line 79/94). Post-fix the claim
is much closer to true but still not absolute — `CHANGELOG.md`'s `[Unreleased]` #975 entry and
`review-sink.md` (via the mission list) record three residual shapes still silently lost: a
backslash-named file normalising onto a lane prefix, an embedded git repo collapsing to one
porcelain record under `-uall`, and the legacy route's `.cache/` journal removal with no rescue.
I qualified the bullet with what changed (the `-uall` widening, the lane-content exemption) and a
pointer to the three residuals rather than restating them in full (they are already correctly
recorded in CHANGELOG). Source verified: `scripts/kaola-workflow-sink-merge.js:476-587`
(`worktreeDirtRecords`, `assertWorktreeClean`) read directly, plus `git diff main --
scripts/kaola-workflow-sink-merge.js`.

### `docs/conventions.md`

"### Clean-check selectivity" section. It describes `isParkedLanePath(relPath, ownedProjects)`'s
rule 3 — "not in `ownedProjects`... own `<project>/` folders... still fail the dirty check" — as
applying uniformly to all three call sites (`assertCleanWorktree`, `assertWorktreeClean`,
`treeDirty`). That is no longer true for `assertWorktreeClean`'s new untracked-record half: I read
the source and confirmed `worktreeDirtRecords` calls `isParkedLanePath(rel, [])` — an **empty**
array, never the caller's `ownedProjects` — and the code comment states this is deliberate (the
lane folder inside a *linked worktree* is the run's own throwaway copy, not the live record the
main-root check protects). I added a paragraph naming this call-site-specific exception, quoting
the mechanism accurately, and pointing at CHANGELOG for the residual list rather than duplicating
it. Verified: `scripts/kaola-workflow-sink-merge.js:493-521` and
`scripts/kaola-workflow-adaptive-schema.js:410-433` (`isParkedLanePath` body) read directly.

## What I checked and found already correct — no action needed

- **`docs/kimi-edition.md`, `docs/opencode-edition.md`** — the "self-healing prune" paragraphs
  (installer command-set sections) were already corrected by this run (per `mission-list.md` item
  #973-repair). I re-read both against the current `install-kimi.sh`/`install-opencode.sh` source
  and they match: `copy_skills`/`copy_tree` remove exactly the retired-on-purpose list plus the name
  about to be written, nothing else. Correct, untouched.
- Same two files, a **different** paragraph ("The install **converges** the scripts directory on
  the manifest…", kimi-edition.md:237, opencode-edition.md:221) — this is a *different* mechanism
  (the install-manifest-driven support-script sync), not the skills/commands namespace-glob prune
  #973 fixed. Confirmed by diffing `install.sh`/`install-kimi.sh`/`install-opencode.sh` against
  `main`: no hunk touches the support-script sync function. Not stale.
- **`docs/api.md`** `residue_stage` / `residue_unattributed` / `residue_attribution` / `findings`
  table rows and the "seven→eight, eight→nine" finding-count sentence — already correctly updated
  by this run for #975. Verified against `scripts/kaola-workflow-claim.js`'s
  `unattributableResidue()` and the `cmdFinalize` residue block (read directly, lines
  ~3700-3766 and ~5308-5350).
- **`docs/decisions/0017-the-mission-list.md`** watch-list row for the refuted symlink-cycle guard
  — already added, with line anchors `install-all.sh:400-407` and
  `scripts/test-install-all.js:496-502`. I checked both files at HEAD: the `isDirectory`/`isFile`
  lstat-semantics lines sit at `install-all.sh:403-404` (inside the walk starting at `:395`) and
  `test-install-all.js:499` (inside `dirsEqual` starting at `:495`) — both within the cited ranges.
  Accurate, no drift.
- **`CHANGELOG.md`** — read the full `[Unreleased]` → `### Fixed` block for all four entries
  (#973 installers, #974 resolvers, #975 finalize residue, #975 sink guard, #975 fixture roots).
  Cross-checked every factual claim against source and against `mission-list.md`'s F2 correction
  (the "beside a committed sibling" qualifier is present, matching `docs/api.md`'s wording) and R3/R4/R6
  fixes. No inaccuracy found; not touched, per instruction.
- **`README.md`** — grepped for `self-heal|prune|converge|namespace-(complete|wide)|blanket` and for
  any description of installer command/skill removal, the sink's Step 0 guard, `resolveRunRoot`/
  `resolveRecordFolder`, or finalize residue staging. README's install/automation sections describe
  usage, not installer internals, at a level that does not restate any of the three mechanisms this
  bundle changed — nothing found to be stale. The one hit for `install.sh`/`uninstall.sh` "remove
  the legacy managed Kaola `subagentStatusLine`" (line ~1270) is an unrelated, untouched mechanism
  from issue #141.
- **`docs/architecture.md`** — checked the "Runtime capability divergence" table's **install path**
  row (points at `install.sh`/`install-kimi.sh`/`install-opencode.sh` and the edition docs, never
  restates the mechanism — consistent with the doc's own stated design of "a tier label plus a
  pointer, never a restated mechanism"), the finalize-transaction section (`### The finalize
  transaction`, which never mentioned `residue` even on `main` — confirmed via
  `git show main:docs/architecture.md | grep residue` returning nothing, so this is a pre-existing
  scope boundary, not new drift), and the clean-worktree-gate line (`:119-123`, generic, still
  accurate). Nothing stale.
- **`docs/workflow-state-contract.md`** — grepped for `residue`, `finalization-summary`, `finding`;
  the file treats `finalization-summary.md` and `.cache/run-gaps.json` at a structural level (who
  writes it, is it durable) and does not enumerate specific finding types or resolver internals, so
  none of #973/#974/#975's changes touch a claim it makes. Also checked no new env var or durable
  state field was introduced by this bundle (`KAOLA_GAP_ROOT` is pre-existing, unchanged) — nothing
  to add.
- **`docs/README.md`** — the documentation index. No docs files were added or removed by this
  bundle (only edits to already-indexed files), so no index change is owed.
- **`.env.example`** — checked for any new environment variable. None: `KAOLA_GAP_ROOT` already
  existed and is unchanged; the `#975` `TMPDIR`/fixture-root fix touches only test infrastructure
  (`scripts/test-fixture-sandbox.js`, `install-all.sh`'s own internal `mktemp` calls) and introduces
  no user-facing configuration knob. Not touched.
- Searched all of `docs/*.md` and `README.md` for every other live reference to
  `--untracked-files` (the flag #975 changed) — the only two hits outside my own edits are
  `docs/decisions/D-802-01.md:52`, which documents an unrelated mechanism
  (`barrierExemptPath`/leg-worktree fence), confirmed not part of this diff.
- **`docs/decisions/D-579-01.md`** (the original clean-worktree-gate ADR, linked from the
  conventions.md section I edited) — left untouched deliberately. Per this repo's own convention
  (`docs/README.md`: "Everything numbered 0001–0015 and every `D-NNN-NN` record predates 0017...
  remain accurate as history"), decision records are point-in-time and are not amended for later
  mechanism changes; the living reference for current behaviour is `docs/conventions.md`, which I
  updated instead. Consistent with how this run itself handled #973 (fixed the living
  kimi/opencode-edition.md docs, did not amend the original installer ADRs).
- Prompt/command surfaces (`commands/*.md`, `templates/routing/*.skeleton.md`) — out of scope by
  the assignment ("Documentation and prose only") and, on inspection, not actually affected: the
  gap-sweep tie-break changes *when a resolver picks the right tree*, not *when finalize calls
  `--check` vs. a full scan*, so no command prose describes behaviour that changed.

## Gaps / BLOCKs

None. Every claim I touched or verified was checked directly against source in this worktree
(`scripts/kaola-workflow-sink-merge.js`, `scripts/kaola-workflow-adaptive-schema.js`,
`scripts/kaola-workflow-claim.js`, `install.sh`, `install-kimi.sh`, `install-opencode.sh`,
`scripts/kaola-workflow-gap-sweep.js`, `scripts/kaola-workflow-validation-runner.js`,
`install-all.sh`, `scripts/test-install-all.js`) or against this run's own already-measured
`mission-list.md` / `CHANGELOG.md` / `review-*.md` records. Nothing was left unverified-and-flagged.

## Commands run

- `git status --short --branch` (worktree/branch confirmation, before and after)
- `git log --oneline -15`, `git diff main --stat` (bundle scope)
- `git diff main -- <file>` for every changed production file (install.sh, install-kimi.sh,
  install-opencode.sh, install-all.sh, kaola-workflow-gap-sweep.js, kaola-workflow-validation-runner.js,
  kaola-workflow-sink-merge.js, kaola-workflow-claim.js, docs/api.md, docs/kimi-edition.md,
  docs/opencode-edition.md, docs/decisions/0017-the-mission-list.md, CHANGELOG.md)
- `git grep -niP` (ugrep-aware, per this repo's own gotcha) across README.md and `docs/*.md` for:
  `self-heal|prune|converge|namespace.?(complete|wide)|blanket`; `step 0|assertWorktreeClean|
  assertNoLiveWorkflowFolder|worktree.*(uncommitted|clean)`; `resolveRunRoot|resolveRecordFolder|
  gap.?sweep|residue`; `silently destr|never silently|destroyed silently`; `--untracked-files`;
  `residue|git add -A|chore: finalize` (README/architecture); `command files|RETIRED_COMMANDS|...`
- `git show main:docs/api.md`, `git show main:docs/architecture.md` (baseline comparison to
  distinguish pre-existing scope boundaries from new drift)
- `grep -n`/`sed -n` reads of the specific line ranges cited above in `install-all.sh`,
  `scripts/test-install-all.js`, `scripts/kaola-workflow-sink-merge.js`,
  `scripts/kaola-workflow-adaptive-schema.js`
- `git diff -- docs/api.md docs/conventions.md` (final review of my own edits)
- `git status --short` (confirmed only `docs/api.md` and `docs/conventions.md` touched by me)

## Files I changed

- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975/docs/api.md` —
  qualified the `worktree_dirty` bullet's absolute claim with the `-uall` widening and the three
  known residual shapes.
- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975/docs/conventions.md` —
  added a paragraph to "Clean-check selectivity" documenting `assertWorktreeClean`'s
  call-site-specific empty-`ownedProjects` exception.

This report:
`/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/bundle-973-974-975/.cache/doc-updater.md`

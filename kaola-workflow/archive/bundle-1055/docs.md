# #1055 documentation update

Candidate verified: `8791ab55` (`refactor(scripts): converge ownership boundaries and remove
proven-dead residue`), worktree `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1055`,
branch `workflow/bundle-1055`. Every fact below was re-verified directly against this commit with
`grep -n` before writing (not taken on the run docs' word alone); the run docs
(`kaola-workflow/bundle-1055/{audit,impl-section1,impl-section2,impl-section3,acceptance}.md`) were
read for wording and cross-checked, not transcribed blind.

## Files edited

### `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1055/CHANGELOG.md`

Added a new `## [Unreleased]` section above `## [11.0.0]` (there was no prior Unreleased section —
11.0.0 had already been cut). Three subsections, house style (bold lead phrase, `(#1055)`, prose
paragraph):

- `### Changed` — two bullets: the `defaultBranch`/`getCoordRoot`/`readActiveFolders` ownership
  relocation (claim → adaptive-schema / active-folders, sink-pr no longer requires claim, what
  stayed in claim and why), and the seven shared generator helpers moving into
  `runtime-edition-forge.js`.
- `### Removed` — one bullet listing every proven-dead symbol: the `transformCommandBody` copy loop
  (×5, replaced by the equivalent `.split(/\r?\n/).join('\n')`), `ZERO_HASH` (×5), `lowerSet`
  (grok/cursor/opencode), `CURSOR_MODEL_CLASS_PINS`/`cursorModelPin` (cursor only),
  sink-merge's `getRoot`/`requiredArchiveFiles`, validation-runner's `computeLandableBlobEntries`,
  codex-preflight's `scopeIsFresh`.
- `### Added` — the new 300-comparison render-subtraction oracle
  (`scripts/test-issue-1055-render-subtraction-oracle.js` +
  `scripts/fixtures/issue-1055-render-baseline.json`), its registration point, the `--write-baseline`
  regeneration rule, and the five edition suites' new CRLF/LF acceptance plus the cursor fable-pin
  migration.

Deliberately omitted a net line-count number. I did compute one from `git diff --numstat 5cb85515
8791ab55 -- scripts` (production files only, excluding test files and the fixture): 164 insertions /
376 deletions, net −212; the full `--stat` including the new test files and oracle (excluding only
`scripts/fixtures/`) is 290 insertions(+) / 394 deletions(-), 18 files. Both are verified, but a
single blended number would conflate three different kinds of change (dead-code subtraction,
pure relocation, and new test additions) in a way no single figure represents honestly, so I named
each item instead of leading with a count. No token/speed claims were made.

### `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1055/docs/api.md`

Two edits:

1. **`sync-{opencode,kimi,grok,cursor,zcode}-edition.js` CLI table row** (was line 1678). Appended a
   sentence noting the seven shared generator helpers now live in `runtime-edition-forge.js`
   (verified via `module.exports` in that file: `parseFrontmatter`, `parseTools`, `yamlScalar`,
   `listCanonAgents`, `listCanonCommands`, `canonCommandPath`, `commandRel` are all present), and
   that `treeLabel`/`runCheck`/`runWrite` stay per-script.
2. **`scripts/kaola-workflow-claim.js` module-exports paragraph** (was line 1810-1817). Appended a
   sentence for `defaultBranch(root)`, noting it is now defined in
   `kaola-workflow-adaptive-schema.js` and claim re-exports the same function object (verified:
   `claim.js` line 22 destructures `defaultBranch` from `adaptiveSchema`, and line 6803 forwards it
   in `module.exports`, unchanged).

**Stale mentions checked and found clean (no edit needed):** grepped `computeLandableBlobEntries`,
`scopeIsFresh`, `requiredArchiveFiles`, and `getRoot\b` across `docs/api.md`, `docs/architecture.md`,
`README.md`, `docs/README.md`. The only `getRoot()` hits (`docs/api.md:210`,
`docs/architecture.md:475`) refer to `kaola-workflow-claim.js`'s own **different**, still-live
`getRoot` (imported from adaptive-schema at `claim.js:9`, called at ~18 sites) — not the sink-merge
local wrapper #1055 deleted. Verified these are genuinely two different functions before leaving
those lines untouched. `computeLandableBlobEntries`, `scopeIsFresh`, and `requiredArchiveFiles` had
zero prior doc mentions anywhere, so nothing was stale there either.

Not added: a note on the oracle's `--write-baseline` flag in a "testing/validation" section of
`docs/api.md`. Checked — `docs/api.md` has no existing convention of documenting individual test
suites or their fixture-regeneration flags (the pre-existing `scripts/prose-census-baseline.json` is
not documented there either), and `docs/conventions.md` (which does carry that kind of
per-suite/per-fixture detail, e.g. the Hermetic unit-chain fixtures section) is outside the file set
I was told to edit. The CHANGELOG `### Added` bullet documents the oracle, its baseline file, and the
`--write-baseline` regeneration rule instead.

### `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1055/docs/architecture.md`

Two edits, both in the "Editions and runtimes" and "Concurrent same-repo sessions" sections
(the closest existing home for "module ownership / dependency direction" prose in this file):

1. **"Concurrent same-repo sessions"** — extended the paragraph that already documented
   `getCoordRoot`/`mainRootFromCoord`/`resolveMainRoot` as adaptive-schema-owned/claim-re-exported to
   add `defaultBranch` to that set, then added sentences on: sink-merge and sink-pr now importing all
   four directly from adaptive-schema instead of via claim's forwarders; sink-pr no longer requiring
   claim.js at all; `readActiveFolders` following the same pattern via
   `kaola-workflow-active-folders.js`; and which claim-native closure/archive helpers stayed in claim
   and why (the "one external consumer, avoid an extra installed file across 7 runtimes + 2 hand-ported
   forges" reasoning from the audit).
2. **"Editions and runtimes"** — one paragraph after the existing `runtime-edition-forge.js` mention,
   naming the seven now-shared generator helpers and the per-script-wrapper carve-out for
   `DEFAULT_FORGE`/`treeLabel`.

Verified every claim in both paragraphs against the actual `require`/destructure lines in
`kaola-workflow-sink-merge.js` (`getCoordRoot`, `mainRootFromCoord`, `resolveMainRoot`,
`defaultBranch` all destructured from the single `adaptiveSchema` require at line 15;
`readActiveFolders` from `kaola-workflow-active-folders` at line 18; `removeWorktree`,
`buildClosureReceipt`, `checkClosureInvariants`, `appendClosureBlock`, `clearAdvisoryClaim`,
`resolveProjectSlug` still from `kaola-workflow-claim.js` at line 20) and `kaola-workflow-sink-pr.js`
(no `require('./kaola-workflow-claim.js')` present; `defaultBranch` destructured from
`adaptiveSchema` at line 13).

### `README.md`, `docs/README.md` — not touched

Grepped both for every removed/relocated symbol name
(`getRoot|requiredArchiveFiles|computeLandableBlobEntries|scopeIsFresh|ZERO_HASH|lowerSet|
cursorModelPin|CURSOR_MODEL_CLASS_PINS|defaultBranch|runtime-edition-forge`) and for the new test
file/suite names — zero hits in either file. Neither file enumerates module exports or individual
test suites by name, so nothing in #1055's scope required an edit or a new link.

## One pre-existing stale comment noticed, not fixed (out of scope: docs-only task)

`scripts/kaola-workflow-sink-merge.js:395` carries a comment reading `// mainRootFromCoord is now
imported from kaola-workflow-claim.js (#579 shared resolver).` — this contradicts the actual live
import at line 15 (`mainRootFromCoord` now comes from the `adaptiveSchema` destructure, not from
claim). This is a code comment inside a production file, not a documentation file I was scoped to
touch; flagging it here for the implementer/review track rather than editing code.

## Not done / blocked

Nothing was blocked. All facts in the brief were independently verified against the candidate tree
(`git diff --numstat`, direct `grep -n` on every touched production file, `module.exports` reads)
before being written into any doc.

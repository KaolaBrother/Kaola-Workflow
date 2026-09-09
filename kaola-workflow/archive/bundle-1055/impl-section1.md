# #1055 §1 — proven-dead subtraction, implementer report

Worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1055`
(branch `workflow/bundle-1055`), starting at `5cb85515`. Nothing committed (per instructions).

All items below follow `kaola-workflow/bundle-1055/audit-generators.md` (§1–§4) exactly as
dispositioned. Every deletion was grep-proven at zero remaining references (excluding
`kaola-workflow/archive/` and CHANGELOG history) before and after, and the whole tree was
re-verified against the 300-comparison render-subtraction oracle after each file.

## a. `transformCommandBody` copy loop → the equivalent CRLF/LF normalisation, ×5

Replaced the 8–9 line no-op loop with `let text = body.split(/\r?\n/).join('\n');` in all five
sync scripts. This is the exact normalisation the loop performed (a straight per-line copy with no
condition or branch), confirmed by the audit and re-confirmed here by the unchanged 300/300 render
hashes.

| file | lines removed | notes |
|---|---|---|
| `scripts/sync-grok-edition.js` | loop: 9 → 1 | |
| `scripts/sync-kimi-edition.js` | loop: 19 → 1 | also removed the unused `strippedModelDispatch` local declared immediately before the loop (`grep -c "strippedModelDispatch"` was 1 — its own declaration only; the loop body never set or read it, and no code after the loop referenced it — same "declared, zero references" basis as the audit's `block` finding in zcode, extended to this analogous local since it existed only to serve the dead loop's unimplemented stripping behavior) |
| `scripts/sync-cursor-edition.js` | loop: 9 → 1 | |
| `scripts/sync-opencode-edition.js` | loop: 13 → 1 | |
| `scripts/sync-zcode-edition.js` | loop: 10 → 1 | also removed the unused `const block = ZCODE_MODEL_DISPATCH_BLOCK.replace(/\s+$/, '');` local named explicitly in the brief (`grep -c "\bblock\b"` now 0, was 1) |

Grep proof (post-edit, all five): `grep -n "strippedModelDispatch" scripts/sync-kimi-edition.js` and
`grep -n "\bblock\b" scripts/sync-zcode-edition.js` both return no matches.

## b. `ZERO_HASH`

Deleted `const ZERO_HASH = '0'.repeat(64);` from all five sync scripts (grok, kimi, cursor,
opencode, zcode). Confirmed no destructured `agentGen.ZERO_HASH` binding existed in any of the five
before this change (each requires `generate-agent-profiles` as the whole-module `agentGen`, never
destructured) — `generate-agent-profiles.js`'s own `ZERO_HASH` (line 28) is untouched, still
exported, still used internally at its 6 original call sites.

Grep proof: `grep -n "ZERO_HASH" scripts/sync-{grok,kimi,cursor,opencode,zcode}-edition.js` returns
no matches.

## c. `lowerSet` in grok / cursor / opencode

Deleted the identical 3-line function from all three files. kimi and zcode never defined it (no
change needed there, matching the audit).

Grep proof: `grep -n "lowerSet" scripts/sync-{grok,cursor,opencode}-edition.js` returns no matches.

## d. Cursor: `CURSOR_MODEL_CLASS_PINS` / `cursorModelPin`

Deleted both from `scripts/sync-cursor-edition.js` (the 6-entry frozen table plus the 9-line
resolver function that was its only consumer). Confirmed `scripts/test-cursor-edition.js` had
already been migrated off the dead table before this run started — its own comment at line 674 now
reads `// #1018/#1055: CURSOR_MODEL_CLASS_PINS was a retired production map in` (no source-regex
read of `sync-cursor-edition.js` remains), so this deletion could not turn any assertion red. Cursor
suite: 840 assertions, exit 0, unchanged from before this deletion.

Grep proof: `grep -n "CURSOR_MODEL_CLASS_PINS\|cursorModelPin" scripts/sync-cursor-edition.js`
returns no matches.

## e. `scripts/kaola-workflow-sink-merge.js`: `getRoot`, `requiredArchiveFiles`

Deleted `getRoot` (the unused `git rev-parse --show-toplevel` wrapper, 11 lines including its
trailing blank line) and `requiredArchiveFiles` (the 3-line `scanArchiveTree(...).required` wrapper
plus its trailing blank line, 4 lines). The `#901 ignoredUntrackedUnder` comment block that
immediately follows `requiredArchiveFiles` — including its one prose mention of the deleted
function's name at "matched nothing `requiredArchiveFiles` produced" — was left byte-identical, as
instructed; it documents `ignoredUntrackedUnder`, not the deleted function. Net from these two
deletions alone: **-15 lines**.

Note: this file also carries an unrelated, pre-existing §2 relocation (another agent's work,
already in the worktree before I started — importing `getCoordRoot`/`mainRootFromCoord`/
`resolveMainRoot`/`defaultBranch`/`readActiveFolders` from their true owners). I did not touch that
code; `git diff --numstat` on this file (21 insertions / 24 deletions) reflects both changes
together — my contribution is exactly the 15 deleted lines above (0 insertions).

Grep proof: `grep -n "getRoot\b\|requiredArchiveFiles\b" scripts/kaola-workflow-sink-merge.js`
returns only the one prose mention inside the `ignoredUntrackedUnder` comment (line ~1642), no
function declaration, no call site, not present in `module.exports` (verified unchanged:
`module.exports = { classifyMergeError, assertBranchHasNonWorkflowChanges };`).

## f. `scripts/kaola-workflow-validation-runner.js`: `computeLandableBlobEntries`

Deleted the full function (66 lines, `#601`–`#666` pre-edit) and its `module.exports` entry.
Checked whether `computeLandableTreeDigest` (the sibling function whose comment cross-references it)
shares any helper that becomes unreferenced now that `computeLandableBlobEntries` is gone: it does
not — both functions called the shared `runGit` helper directly, and `runGit` remains live (still
called from `computeLandableTreeDigest` at 4 sites plus 2 more call sites elsewhere in the file at
lines ~1267/~1344, confirmed by grep before deleting). No other helper in this file existed solely
to serve `computeLandableBlobEntries`. Net: **-68 lines**.

Grep proof: `grep -n "computeLandableBlobEntries" scripts/kaola-workflow-validation-runner.js`
returns no matches (was: 1 declaration + 1 export line, both gone).

## g. `scripts/kaola-workflow-codex-preflight.js`: `scopeIsFresh`

Deleted the 7-line function (including its `#571` load-bearing-guard comment). Confirmed it was
never exported (absent from `module.exports` before and after) and that the live gate logic at
lines ~3535/~3540 calls `scopeIsStale` directly with the same `.exists`-adjacent guard inlined,
bypassing `scopeIsFresh` entirely — unchanged by this deletion. Net: **-8 lines**.

Grep proof: `grep -n "scopeIsFresh" scripts/kaola-workflow-codex-preflight.js` returns no matches.

## Net line count summary

The five `sync-*-edition.js` files were edited in two passes in the same session — §1's pure
deletions (this document) and §3's "inline the body → delegate to `forgeLayout`" edits
(`impl-section3.md`) — and both passes touch the same functions' surrounding lines, so their diff
hunks are not separable after the fact. The table below is each file's final, verified
`git diff --numstat` against the `5cb85515` baseline (ground truth); `impl-section3.md` carries the
matching `+74` addition in `scripts/runtime-edition-forge.js` that the sync scripts' bodies moved
into.

| file | insertions | deletions | net | §1 items present | §3 items present |
|---|---|---|---|---|---|
| `scripts/sync-grok-edition.js` | 5 | 52 | **−47** | loop, `ZERO_HASH`, `lowerSet` | parseFrontmatter/parseTools/yamlScalar/listCanonAgents, listCanonCommands, canonCommandPath, commandRel |
| `scripts/sync-kimi-edition.js` | 4 | 41 | **−37** | loop + unused `strippedModelDispatch` | parseFrontmatter/listCanonAgents, listCanonCommands, canonCommandPath |
| `scripts/sync-cursor-edition.js` | 5 | 70 | **−65** | loop, `ZERO_HASH`, `lowerSet`, `CURSOR_MODEL_CLASS_PINS`/`cursorModelPin` | parseFrontmatter/parseTools/yamlScalar/listCanonAgents, listCanonCommands, canonCommandPath, commandRel |
| `scripts/sync-opencode-edition.js` | 5 | 43 | **−38** | loop, `ZERO_HASH`, `lowerSet` | parseFrontmatter/parseTools, listCanonAgents, listCanonCommands, canonCommandPath |
| `scripts/sync-zcode-edition.js` | 5 | 41 | **−36** | loop + unused `block`, `ZERO_HASH` | parseFrontmatter/yamlScalar/listCanonAgents, listCanonCommands, canonCommandPath, commandRel |
| `scripts/kaola-workflow-codex-preflight.js` | 0 | 8 | **−8** | `scopeIsFresh` | — |
| `scripts/kaola-workflow-sink-merge.js` (my share only, out of the file's 21/24 combined with the pre-existing §2 relocation) | 0 | 15 | **−15** | `getRoot`, `requiredArchiveFiles` | — |
| `scripts/kaola-workflow-validation-runner.js` | 0 | 68 | **−68** | `computeLandableBlobEntries` | — |

Sum across the eight files: **314 lines deleted, 24 lines inserted, net −290** in these files. Of
that, `runtime-edition-forge.js` gained **+74** lines (see `impl-section3.md`) to hold what §3
relocated — so §1's items account for genuine subtraction (no equivalent code now exists anywhere:
loops, unused vars, `ZERO_HASH`, `lowerSet`, `CURSOR_MODEL_CLASS_PINS`/`cursorModelPin`, `getRoot`,
`requiredArchiveFiles`, `computeLandableBlobEntries`, `scopeIsFresh`), while §3's contribution to the
same diffs is a relocation (body moved to `runtime-edition-forge.js`, not deleted) — the two are
combined in the numstat above because both passes edited the same files in the same session.

## Verification run at the end of §1 + §3 combined (see impl-section3.md for the full battery)

- `node scripts/test-issue-1055-render-subtraction-oracle.js` → **passed, 300/300, exit 0** (run
  after every individual file edit, not just at the end).
- All five `node scripts/test-{grok,kimi,cursor,opencode,zcode}-edition.js` → exit 0, assertion
  counts unchanged from the acceptance author's recorded baseline (grok 707, kimi 826, cursor 840,
  opencode 877, zcode 856).
- `node scripts/test-sink-merge.js` → 1063 assertions, exit 0.
- `node scripts/test-validation-runner.js` → PASSED, exit 0.
- `node -c` syntax check on all eight touched production files → all OK.

## What I did not do

- Did not touch `scripts/test-*.js`, `scripts/fixtures/*`, `templates/`, or any generated runtime
  tree by hand (the 15 `--write` runs in the verification matrix are the sync scripts' own
  documented CLI, not a hand-edit).
- Did not act on either `HUMAN_DECISION_REQUIRED` item in `audit.md` (the legacy non-`--sink`
  pipeline support policy; the 260 stale barrier refs) — both are explicitly out of this run's
  authority.
- Did not touch the claim/sink-merge/sink-pr/adaptive-schema §2 relocation already present in the
  worktree when I started, beyond the two named deletions inside sink-merge.js.
- Did not commit anything.

# #1055 §2 — dependency-direction relocation, implementer report

Worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1055`
(branch `workflow/bundle-1055`), starting at `5cb85515`. Nothing committed (per instructions).

## A. sink-merge.js import consolidation

`scripts/kaola-workflow-sink-merge.js`:
- Removed `getCoordRoot`, `mainRootFromCoord`, `resolveMainRoot`, `readActiveFolders` from the
  top-of-file `require('./kaola-workflow-claim.js')` destructure (was 11 symbols; now 6:
  `removeWorktree`, `buildClosureReceipt`, `checkClosureInvariants`, `appendClosureBlock`,
  `clearAdvisoryClaim`, `resolveProjectSlug` — all claim-native, unchanged consumers).
- `getCoordRoot`, `mainRootFromCoord`, `resolveMainRoot` now come from the single `adaptiveSchema`
  require already present (line 15 pre-edit), consolidated with the pre-existing
  `parsePorcelainPaths`/`isParkedLanePath` destructure that used to be a **second**,
  redundant `require('./kaola-workflow-adaptive-schema.js')` — deleted that second require line
  (Node caches by resolved path, so this was already returning the identical cached module; the
  consolidation removes a needless duplicate require call, not a behaviour change).
- Added `const { readActiveFolders } = require('./kaola-workflow-active-folders');` — its true
  definer (matches claim.js's own import style, no `.js` extension).
- Two lazy in-function requires redirected: line ~2185 (`wtStageSrc` staging block) and line ~3087
  (post-`--sink` worktree teardown) now `require('./kaola-workflow-active-folders')` for
  `readActiveFolders: readAF`, keeping `removeWorktree: removeWt` / `worktreePathFor: wtPathFor` on
  the claim.js lazy require next to them. The other two lazy claim requires (`archiveProjectDir` at
  ~2335, `worktreePathFor` at ~3290) were left untouched — claim-native, no `readActiveFolders` in
  their destructure.
- Net: pure re-source of 4 identifiers + de-duplication of one require call. No renamed local
  bindings, no call-site changes, no logic changes. `git diff --stat` for this file: +30/-... (see
  below), all within the import block plus the two lazy-require split sites.

`scripts/kaola-workflow-claim.js`'s own `module.exports` block (line ~6817) is untouched — still
forwards `getCoordRoot`, `mainRootFromCoord`, `resolveMainRoot`, `readActiveFolders`, and
`defaultBranch` for any other consumer that still imports them from claim.

## B. defaultBranch relocation

**One correction to the brief's premise, verified before editing:** the brief states adaptive-schema
already defines `OFFLINE` (claimed line 30) and `REMOTE_TIMEOUT_MS` (claimed line 33). Measured
(`grep -n "OFFLINE\b" scripts/kaola-workflow-adaptive-schema.js` / same for `REMOTE_TIMEOUT_MS`):
**zero hits in adaptive-schema.js** — those two constants live only in `claim.js` (lines 30/33,
which is almost certainly what the brief actually read), `sink-merge.js`, and `sink-pr.js`, each
with its own independent copy. `defaultBranch` genuinely has no claim-internal dependency beyond
these two toggles + `execFileSync`, so to keep this a **behaviour-identical pure move** I added
local copies of `OFFLINE`/`REMOTE_TIMEOUT_MS` to adaptive-schema.js (same expression, same env
vars, same defaults) rather than inventing a new import edge back into claim.js or centralizing the
toggle (out of scope). This matches the repo's existing convention — sink-merge.js and sink-pr.js
already carry independent copies of the same two constants rather than importing them from one
place.

`scripts/kaola-workflow-adaptive-schema.js`:
- Inserted directly after `resolveMainRoot` (before `refuse`): the two toggle consts (commented
  `#1055`, explaining the duplication) + the `defaultBranch` function, comment block copied
  verbatim from claim.js (`#397.3` probe-chain comment, the 3-stage git probe, all catch/fallback
  logic unchanged). Followed the module's existing convention of a lazy
  `const { execFileSync } = require('child_process');` inside the function body (adaptive-schema
  never top-level-requires `child_process`; `getCoordRoot` two functions above does the same lazy
  require).
- Added `defaultBranch` to `module.exports`, next to `getCoordRoot`/`mainRootFromCoord`/
  `resolveMainRoot`.

`scripts/kaola-workflow-claim.js`:
- Deleted the local `function defaultBranch(root) { ... }` (27 lines), replaced with a one-line
  comment pointing at adaptive-schema.
- Added `defaultBranch` to the existing destructure `const { getCoordRoot, mainRootFromCoord,
  resolveMainRoot, parsePorcelainPaths, isParkedLanePath, splitNulPaths, defaultBranch } =
  adaptiveSchema;` (line ~21) — no new require, reuses the `adaptiveSchema` binding already at
  line 19.
- `module.exports` block (line ~6817) untouched — `defaultBranch` there now resolves to the
  imported binding, so `require('./kaola-workflow-claim.js').defaultBranch` is the exact same
  function object as before the move, just re-sourced.
- claim.js's own top-level `OFFLINE`/`REMOTE_TIMEOUT_MS` (line 30/33) are untouched — both are used
  by ~35 and ~4 other sites respectively in claim.js unrelated to `defaultBranch`, confirmed by grep
  before and after the edit.

`scripts/kaola-workflow-sink-pr.js`:
- Dropped `const { defaultBranch } = require('./kaola-workflow-claim.js');` entirely, replaced with
  `const { defaultBranch } = adaptiveSchema;` (reusing the `adaptiveSchema` require already at line
  8). sink-pr.js no longer requires `kaola-workflow-claim.js` at all — confirmed by grep (zero hits)
  and by requiring the module and inspecting `require.cache` (see Identity proofs).

`scripts/kaola-workflow-sink-merge.js`'s `defaultBranch` import switched from the old claim.js
destructure to the consolidated `adaptiveSchema` destructure described in §A (same edit, one line).

## Identity proofs

```
$ node -e "
const claim = require('./scripts/kaola-workflow-claim.js');
const schema = require('./scripts/kaola-workflow-adaptive-schema.js');
console.log('defaultBranch ===', claim.defaultBranch === schema.defaultBranch);
console.log('typeof claim.defaultBranch', typeof claim.defaultBranch);
"
defaultBranch === true
typeof claim.defaultBranch function

$ node -e "
require('./scripts/kaola-workflow-sink-pr.js');
const hasClaim = Object.keys(require.cache).some(k => k.endsWith('kaola-workflow-claim.js'));
console.log('sink-pr loaded claim.js:', hasClaim);
"
sink-pr loaded claim.js: false
```
(The sink-pr.js require also ran its CLI body and printed a `--branch is invalid or TBD` usage
error to stderr with exit 1 — expected, since requiring it directly with no CLI args drives its own
`main()`; the load-cache assertion is what matters and it printed `false`.)

Functional identity also spot-checked (offline mode, both bindings, same repo root):
```
$ KAOLA_WORKFLOW_OFFLINE=1 node -e "... claim.defaultBranch(cwd) ..."   -> main
$ KAOLA_WORKFLOW_OFFLINE=1 node -e "... schema.defaultBranch(cwd) ..."  -> main
```

grep for `getCoordRoot`, `mainRootFromCoord`, `resolveMainRoot` re-export identity was not
re-measured here (already proven `===` in `audit-lifecycle.md` §1 before this run touched anything,
and this run did not change those three functions' definitions — only their import path into
sink-merge.js).

## C. Regeneration + validation

```
$ npm run sync:editions
codex-sync plugins/kaola-workflow/scripts/kaola-workflow-claim.js
codex-sync plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js
codex-sync plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js
byte-sync  plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
byte-sync  plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
byte-sync  plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
edition-sync: write complete (6 file(s) updated).

$ node scripts/validate-script-sync.js; echo EXIT=$?
OK: 14 common scripts, 25 byte-identical groups, 0 rename-normalized families, 2 hooks.json
families (config + hooks dir), and 5 forge export-superset families in sync.
    committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
EXIT=0
```

`git status --short` after regeneration:

```
 M plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
 M plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
 M plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
 M plugins/kaola-workflow/scripts/kaola-workflow-claim.js
 M plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js
 M plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js
 M scripts/kaola-workflow-adaptive-schema.js
 M scripts/kaola-workflow-claim.js
 M scripts/kaola-workflow-sink-merge.js
 M scripts/kaola-workflow-sink-pr.js
 M scripts/test-cursor-edition.js       <- NOT mine, see below
 M scripts/test-grok-edition.js         <- NOT mine, see below
 M scripts/test-kimi-edition.js         <- NOT mine, see below
 M scripts/test-opencode-edition.js     <- NOT mine, see below
 M scripts/test-zcode-edition.js        <- NOT mine, see below
?? kaola-workflow/bundle-1055/          <- audit docs + this report + mission-list (not mine)
```

Every `plugins/` change is fully explained by regeneration: the four canonical files I edited
(`kaola-workflow-adaptive-schema.js`, `kaola-workflow-claim.js`, `kaola-workflow-sink-merge.js`,
`kaola-workflow-sink-pr.js`) now match their `plugins/kaola-workflow/scripts/` mirrors exactly
(`git diff --stat` shows identical hunk sizes for each canonical/mirror pair), and only
`adaptive-schema.js` changed in the gitlab/gitea trees (it is the byte-identical group member; their
`claim.js`/`sink-merge.js`/`sink-pr.js` hand-ports are untouched, as instructed — confirmed absent
from `git status --short plugins/kaola-workflow-gitlab plugins/kaola-workflow-gitea`). No file under
`plugins/` changed that regeneration doesn't explain.

The five `scripts/test-*-edition.js` files were already modified when I started (by the concurrent
test-author subagent per the dispatch brief); I did not touch, read for editing, or revert them —
left exactly as I found them, per "preserve unrelated work in a dirty tree."

## D. Focused suites

| Command | Exit code (echoed directly, not through a pipe) |
|---|---|
| `node scripts/test-sink-merge.js` | 0 — "Sink-merge ... test suite passed: 1063 assertions." |
| `node scripts/test-claim-hardening.js` | 0 — "claim-hardening tests passed (838 assertions)" |
| `node scripts/test-active-folders-field-parity.js` | 0 — "active-folders-field-parity tests passed (163 assertions)" |
| `node scripts/test-validate-script-sync.js` | 0 — "validate-script-sync guard tests passed (56 assertions; 1 canonicalOnly exclusions machine-guarded)" |
| `ls scripts/test-sink-pr*` | no match — file does not exist, skipped per the brief's "if it exists" |
| `node scripts/validate-workflow-contracts.js` | 0 — "Workflow contract validation passed" |

`test-claim-hardening.js` printed several `error connecting to api.github.com` / `API rate limit
exceeded` / `Could not resolve to an Issue` lines to stdout before its pass line — these are the
suite's own mocked/expected-failure fixtures for `gh` error handling (the same lines print on an
unmodified baseline; not read as failures, and the suite's own final assertion count / exit code is
the authority here).

All six commands are green. I did not run `npm test` or any multi-minute chain, per instructions.

## What I did not do

- Did not touch `scripts/test-cursor-edition.js`, other `scripts/test-*-edition.js`,
  `scripts/test-issue-1055-*`, `scripts/fixtures/`, or any `scripts/sync-*-edition.js` (all reserved
  for other subagents/missions).
- Did not port the relocation into the gitlab/gitea `sink-merge.js`/`claim.js` hand-ports (divergent
  by design per the audit).
- Did not run `npm test` / `npm run test:kaola-workflow:claude:full` (multi-minute, out of scope per
  instructions) — the six focused commands above are the verification evidence for this change.
- Did not commit anything.

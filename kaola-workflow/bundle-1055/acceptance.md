# Test Author acceptance — Issue #1055 (dead-code subtraction)

Baseline commit: `5cb855153338f7116d691200ad79fb06e553e7f0` (`5cb85515`, main HEAD at task start).
Worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1055` (branch `workflow/bundle-1055`).

## Files touched (mine only)

- `scripts/test-cursor-edition.js` — migrated the G0-fable dead-table-regex acceptance.
- `scripts/test-grok-edition.js` — added CRLF/LF `transformCommandBody` acceptance.
- `scripts/test-kimi-edition.js` — added CRLF/LF `transformCommandBody` acceptance.
- `scripts/test-opencode-edition.js` — added CRLF/LF `transformCommandBody` acceptance.
- `scripts/test-zcode-edition.js` — added CRLF/LF `transformCommandBody` acceptance.
- `scripts/test-issue-1055-render-subtraction-oracle.js` — new: the 300-comparison render
  subtraction oracle.
- `scripts/fixtures/issue-1055-render-baseline.json` — new: the baseline manifest captured on
  `5cb85515`. SHA-256 of the file itself:
  `bced34ce7a549e87062ae6679d209c94a88bf2389b93d7bbe6097d44d23a57ad`. Its own `captured_at_commit`
  field records `5cb855153338f7116d691200ad79fb06e553e7f0`; `total_comparisons: 300`.
- `package.json` — registered `node scripts/test-issue-1055-render-subtraction-oracle.js` in both
  `scripts.test:kaola-workflow:claude` and `scripts.test:kaola-workflow:claude:full`, immediately
  after `test-issue-1054-role-redesign.js` (the position the `test-issue-1054-*` suites used),
  before `test-zcode-install-trust.js`.

`git status --short` in this worktree also shows changes to
`scripts/kaola-workflow-adaptive-schema.js`, `scripts/kaola-workflow-claim.js`,
`scripts/kaola-workflow-sink-merge.js`, `scripts/kaola-workflow-sink-pr.js`, and their three
`plugins/*/scripts/` mirrors, plus files under `kaola-workflow/bundle-1055/` other than this one
(`audit-generators.md`, `audit-lifecycle.md`, `audit.md`, `impl-section2.md`, `mission-list.md`).
**None of those are mine** — other agents (`audit-generators`, `audit-lifecycle`, an implementer)
are working the same worktree concurrently, exactly as the task's `others are writing to`
carve-out anticipated. I did not read, edit, or rely on their diffs.

## 1. Cursor fable-pin migration (real responsibility, not source regex)

`scripts/test-cursor-edition.js` previously derived `CURSOR_MODEL_CLASS_PINS_PIN` by regex-matching
`sync-cursor-edition.js`'s own source text for the (dead) `CURSOR_MODEL_CLASS_PINS` table, then
asserted two G0-fable facts against that regex capture. `renderAgent` never reads that table — it
delegates entirely to `generate-agent-profiles.renderRuntimeRole('cursor', name)`, whose model line
is `capabilities.model + '[effort=' + capabilities.intent_mapping[tier] + ']'` from
`templates/agents/runtime-capabilities.json`.

Replaced with:
- `CURSOR_ADAPTER_CAPS` read directly from `templates/agents/runtime-capabilities.json`'s
  `runtimes.cursor.capabilities` (the real adapter data path named in the brief).
- `CURSOR_REAL_TIER_PINS_PIN`, a literal hardcoded in the test (`standard`/`reasoning`/`heavy` →
  `grok-4.6[effort=medium/high/xhigh]`) — independent of the adapter file, so a same-source
  differ-check cannot go green-on-both-sides (per `feedback_differ_check_on_interpolated_message`
  in memory).
- The G0-fable assertions now check: (a) `CURSOR_ADAPTER_CAPS.model === 'grok-4.6'`; (b) for each
  tier, `adapter.model + '[effort=' + adapter.intent_mapping[tier] + ']'` equals the hardcoded
  literal; (c) for `planner` and `code-architect` (the two real fable-tier roles), the ACTUAL
  `generate-agent-profiles.renderRuntimeRole('cursor', role).content` carries the literal
  `model: grok-4.6[effort=xhigh]` line.

Baseline (unmodified production): `node scripts/test-cursor-edition.js` → **838 assertions, exit 0**.
After the migration: **840 assertions, exit 0** (net +2, both green).

Mutant (armed): in `templates/agents/runtime-capabilities.json`, set
`runtimes.cursor.capabilities.intent_mapping.heavy` from `"xhigh"` to `"ultra"`, then re-materialize
all three cursor forge trees (`node scripts/sync-cursor-edition.js --forge={github,gitlab,gitea}
--write`) and run the suite:

```
FAIL: G0-fable: cursor adapter tier heavy must resolve to grok-4.6[effort=xhigh] — got "grok-4.6[effort=ultra]"
FAIL: G0-fable: renderRuntimeRole(cursor, planner) must render the real heavy/fable pin "model: grok-4.6[effort=xhigh]" — got ---
FAIL: G0-fable: renderRuntimeRole(cursor, code-architect) must render the real heavy/fable pin "model: grok-4.6[effort=xhigh]" — got ---
FAIL: G0-fable: renderAgent pins fable as grok-4.6[effort=xhigh] — got ---
FAIL: G1[code-architect]: model line is exactly the unquoted canonical tier pin "grok-4.6[effort=xhigh]" — got ["model: grok-4.6[effort=ultra]"]
FAIL: G1[planner]: model line is exactly the unquoted canonical tier pin "grok-4.6[effort=xhigh]" — got ["model: grok-4.6[effort=ultra]"]
FAIL: G2-declaration: .cursor/agents/code-architect.md carries the canonical unquoted frontmatter pin "grok-4.6[effort=xhigh]"
FAIL: G2-declaration: .cursor/agents/planner.md carries the canonical unquoted frontmatter pin "grok-4.6[effort=xhigh]"
cursor-edition test FAILED: 8 failure(s), 830 passed.
```

Both new assertions are in that list (the first two). Restored `templates/agents/runtime-capabilities.json`
byte-identically from a pre-mutation copy, re-ran `--write` for all three forges, and re-ran the
suite: **840 assertions, exit 0** again. `git diff --stat templates/agents/runtime-capabilities.json`
is empty after restore.

## 2. CRLF/LF acceptance for the five `transformCommandBody` functions

None of the five edition suites had any existing CRLF-related assertion (`grep -n "CRLF\|\\r\\n"`
on all five test files returned nothing before this change). All five needed extension. Each added
block reads the real canonical `workflow-next.md` command source via
`runtime-edition-forge.js`'s `commandSources()`, normalizes it to LF, derives a CRLF twin, and
asserts `transformCommandBody(LF) === transformCommandBody(CRLF)` byte-for-byte, placed immediately
before each suite's final summary block.

Per-suite baseline → after (all still green, unmodified production):

| suite | baseline assertions | after assertions |
|---|---|---|
| grok | 706 | 707 |
| kimi | 825 | 826 |
| cursor | (already 840 after item 1) | 840 → covered inside the +2 above; CRLF block itself contributes 1 |
| opencode | 876 | 877 |
| zcode | 855 | 856 |

Mutant per suite (armed): changed line `const lines = body.split(/\r?\n/);` to
`body.split('\n')` in exactly one `sync-*-edition.js` at a time (one runtime per run), ran that
runtime's suite, captured RED, restored the file byte-for-byte from a snapshot, re-ran to confirm
GREEN, and verified `git diff --stat` was empty before moving to the next runtime.

```
grok:     FAIL: CRLF: transformCommandBody(CRLF body) must equal transformCommandBody(LF body) byte-for-byte
          grok-edition test FAILED: 1 failure(s), 706 passed.
kimi:     FAIL: CRLF: transformCommandBody(CRLF body) must equal transformCommandBody(LF body) byte-for-byte
          kimi-edition test FAILED: 1 failure(s), 825 passed.
cursor:   FAIL: CRLF: transformCommandBody(CRLF body) must equal transformCommandBody(LF body) byte-for-byte
          cursor-edition test FAILED: 1 failure(s), 839 passed.
opencode: FAIL: CRLF: transformCommandBody(CRLF body) must equal transformCommandBody(LF body) byte-for-byte
          opencode-edition test FAILED: 1 failure(s), 876 passed.
zcode:    FAIL: CRLF: transformCommandBody(CRLF body) must equal transformCommandBody(LF body) byte-for-byte
          zcode-edition test FAILED: 1 failure(s), 855 passed.
```

All five restored; `git status --short` on all five `scripts/sync-*-edition.js` is empty. Final
green re-run (after both item 1 and item 2 edits) recorded above: grok 707, kimi 826, cursor 840,
opencode 877, zcode 856 — all exit 0.

## 3. `scripts/test-issue-1055-render-subtraction-oracle.js` — 300-comparison subtraction oracle

New standalone suite. Depends only on the five `sync-*-edition.js` modules,
`generate-agent-profiles.js`, `runtime-edition-forge.js`, and the tracked `commands/*.md` sources —
never on a generated `.grok*`/`.kimi*`/`.cursor*`/`.opencode*`/`.zcode*` tree existing on disk, so it
is not vacuous in a fresh worktree (per `reference_edition_suites_vacuous_in_fresh_worktree` in
memory) and is safe on the focused chain.

It renders:
- **210 agent comparisons**: 5 runtimes × 3 forges (`github`, `gitlab`, `gitea`, from
  `runtime-edition-forge.js`'s `FORGES`) × 14 roles (`generate-agent-profiles.js`'s `ROLES`), via
  each module's `renderAgent`.
- **90 command comparisons**: 5 runtimes × 3 forges × 3 commands (`workflow-next`, `workflow-init`,
  `kaola-workflow-finalize`, from `commandSources(forge)`) × 2 line-ending variants (LF, CRLF), via
  each module's `renderCommand` (which internally calls `transformCommandBody`). Handled the one
  non-uniform signature: `opencode`'s `renderCommand(canonContent, forge, label)` vs. the other
  four's `renderCommand(canonContent, commandName, forge)`.
- **Total: 300**, asserted directly (`EXPECTED_TOTAL === 300` and `current.length === 300`) so a
  silently skipped runtime/forge/role/command changes the assertion count rather than passing quietly.

Each render is SHA-256 hashed and compared against `scripts/fixtures/issue-1055-render-baseline.json`,
captured now on `5cb85515` via `node scripts/test-issue-1055-render-subtraction-oracle.js
--write-baseline`. On mismatch the oracle reports the exact count of drifted records and the first
differing `runtime/forge/kind/name (lineEnding)` with both hashes.

GREEN against baseline:
```
$ node scripts/test-issue-1055-render-subtraction-oracle.js
issue-1055-render-subtraction-oracle passed (5 assertions, 300 render comparisons hashed against baseline commit 5cb855153338f7116d691200ad79fb06e553e7f0).
```

Mutant (armed): in `scripts/sync-grok-edition.js`'s `renderCommand`, changed
`return lines.join('\n') + '\n';` to `return lines.join('\n') + '\n' + 'X';`, ran the oracle:
```
FAIL: ORACLE: 18 render(s) drifted from the 5cb855153338f7116d691200ad79fb06e553e7f0 baseline. First differing artifact: grok/gitea/command/kaola-workflow-finalize (CRLF) — baseline hash ca8795d14dd884a562f78b62b9a9ec961c6138931ef46d26db5569412db48e48 != current hash 4c3afe487d766c838b778235a63ae9842a7b4f6de7c884380db26d2e8e6e5e16
issue-1055-render-subtraction-oracle FAILED: 1 failure(s), 4 passed.
```
18 = 3 forges × 3 commands × 2 line-ending variants — every grok command render, exactly the set the
mutation touches. Restored `scripts/sync-grok-edition.js` byte-for-byte (`git diff --stat` empty
after restore) and re-ran: back to 300/300 GREEN.

I also independently verified the spawn-classification guard: the oracle's one `execSync` call
(`git rev-parse HEAD` inside `currentCommit()`, used only for the `--write-baseline` manifest
header) carries a `// spawn-class: environment` comment on the line directly above it, per ADR 0013.
`node scripts/test-spawn-classification.js` passes (724 spawn sites, 320 classified, 0 bad tokens).

## Registration

Added `node scripts/test-issue-1055-render-subtraction-oracle.js` to `package.json`'s
`scripts["test:kaola-workflow:claude"]` and `scripts["test:kaola-workflow:claude:full"]`, in the same
position the `test-issue-1054-*` suites occupy (immediately after
`test-issue-1054-role-redesign.js`, before `test-zcode-install-trust.js`). Did not add it to
`test:kaola-workflow:editions` (that chain runs the five edition suites' own self-provisioning
`--write`/`--check`/hermetic-installer runs against real gitignored trees; the oracle intentionally
never touches those trees and is a `#1055`-scoped regression pin, not an edition-parity check) and
did not touch `npm test` directly (it composes the four forge chains; `test:kaola-workflow:claude`
is one of them, so the oracle is reached transitively).

## Exact commands to run each suite

```sh
# Item 1 + 2 combined (all five edition suites, includes the migrated cursor pin + new CRLF checks)
node scripts/test-grok-edition.js
node scripts/test-kimi-edition.js
node scripts/test-cursor-edition.js
node scripts/test-opencode-edition.js
node scripts/test-zcode-edition.js

# Item 3 (subtraction oracle)
node scripts/test-issue-1055-render-subtraction-oracle.js              # compare vs baseline
node scripts/test-issue-1055-render-subtraction-oracle.js --write-baseline  # (re)capture — only
                                                                              # after a DELIBERATE
                                                                              # render change, never
                                                                              # to make a red pass

# Focused chain (now includes the oracle)
npm run test:kaola-workflow:claude
```

## What I did not do

- Did not touch any `sync-{grok,kimi,cursor,opencode,zcode}-edition.js` production file — the actual
  #1055 subtraction (removing `ZERO_HASH`, `lowerSet`, the inert `transformCommandBody` loop, and
  cursor's `CURSOR_MODEL_CLASS_PINS`/`cursorModelPin`) is the implementer's job, not mine. All
  mutations to those files in this session were temporary, run-verified, and reverted byte-for-byte.
- Did not run `npm test` (per the brief) — verified each suite individually plus `node -e
  "JSON.parse(...)"` on `package.json` for syntax validity, and ran
  `node scripts/test-spawn-classification.js` directly (not via `npm test`) to check the new
  `execSync` site.
- Did not commit anything.
- Did not touch `templates/`, `plugins/`, or any generated tree by hand — the only writes to
  `templates/agents/runtime-capabilities.json` were the item-1 mutant and its byte-identical revert.
- Did not add a fixtures-convention doc; `scripts/fixtures/` already existed (holding
  `scripts/fixtures/issue-1054/bundle-1053-mission-list.md`), so `issue-1055-render-baseline.json`
  follows that existing directory, named to match the sibling repo convention seen in
  `scripts/prose-census-baseline.json` (`tool`/`schema`/`captured_at_commit` fields).
- Did not investigate or rely on the other agents' concurrent edits to `kaola-workflow-claim.js`,
  `kaola-workflow-sink-merge.js`, `kaola-workflow-sink-pr.js`, `kaola-workflow-adaptive-schema.js`,
  or their `plugins/*` mirrors — out of my custody boundary for this task.

## Final verification

```
$ git status --short   # (my files only, filtered)
 M package.json
 M scripts/test-cursor-edition.js
 M scripts/test-grok-edition.js
 M scripts/test-kimi-edition.js
 M scripts/test-opencode-edition.js
 M scripts/test-zcode-edition.js
?? scripts/fixtures/issue-1055-render-baseline.json
?? scripts/test-issue-1055-render-subtraction-oracle.js
```
Plus the shared `kaola-workflow/bundle-1055/` folder (this file) and the other-agent files listed
above (not mine). Every production `sync-*-edition.js` and `templates/agents/runtime-capabilities.json`
mutant used for arming evidence was reverted; `git diff --stat` on each is empty. All six of my test
files pass at HEAD: grok 707, kimi 826, cursor 840, opencode 877, zcode 856, oracle 5 assertions /
300 render comparisons — all exit 0.

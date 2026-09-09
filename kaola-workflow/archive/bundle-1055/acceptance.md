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

## Review follow-up (F1, F2, F3)

By the time these findings arrived, `git log` showed everything from the section above had already
landed in commit `8791ab55` ("refactor(scripts): converge ownership boundaries and remove proven-dead
residue", `Refs #1055`) — the implementer's subtraction plus my acceptance work were committed
together. This section is additive on top of that commit; nothing above was re-verified from scratch,
only the three findings' targets.

**Constraint honored throughout:** did not touch any `sync-*-edition.js` (team lead editing them
concurrently in this same worktree — confirmed live: `git status` showed `sync-opencode-edition.js`
and `sync-zcode-edition.js` modified mid-session by that concurrent work, not by me) or any file
outside `scripts/test-*.js` and `scripts/fixtures/`.

### F1 (must fix) — `recordKey` joined on a raw NUL byte

Root cause: in the original `Write` tool call, the JS source text `'\u0000'` I intended as a
6-character escape sequence was interpreted as a JSON escape and materialized as a literal NUL byte
(`0x00`) in the file. Confirmed with a byte-exact check:

```
$ python3 -c "
data = open('scripts/test-issue-1055-render-subtraction-oracle.js','rb').read()
print('NUL count:', data.count(b'\x00'))
idx = data.find(b'\x00')
print('context:', data[idx-40:idx+10])
"
NUL count: 1
context: b"c.kind, rec.name, rec.lineEnding].join('\x00');\n}\n\n//"
```

Fix: replaced the single NUL byte with a plain space character (`perl -i -pe 's/\x00/ /g'`, byte-safe,
touched exactly the one occurrence). `recordKey` is a pure function of the five record fields and is
never persisted into the JSON manifest (only `hash` + the five fields are written), so any consistent
delimiter produces identical map-lookup behavior — the manifest fixture did not need regeneration.

Verification:
```
$ file scripts/test-issue-1055-render-subtraction-oracle.js
scripts/test-issue-1055-render-subtraction-oracle.js: a /usr/bin/env node script text executable, Unicode text, UTF-8 text

$ git diff --stat 5cb85515 -- scripts/test-issue-1055-render-subtraction-oracle.js
 .../test-issue-1055-render-subtraction-oracle.js   | 223 +++++++++++++++++++++
 1 file changed, 223 insertions(+)
# (no longer "Bin 0 -> 9705 bytes")

$ python3 -c "print(open('scripts/test-issue-1055-render-subtraction-oracle.js','rb').read().count(b'\x00'))"
0

$ node scripts/test-issue-1055-render-subtraction-oracle.js
issue-1055-render-subtraction-oracle passed (5 assertions, 300 render comparisons hashed against baseline commit 5cb855153338f7116d691200ad79fb06e553e7f0).
```
(oracle passed against the EXISTING fixture — did not regenerate `issue-1055-render-baseline.json`.)

Note on the suggested `LC_ALL=C grep -c $'\x00' file` check: bash cannot hold a NUL byte inside an
argument (`$'\x00'` silently becomes an empty string), so that idiom actually runs `grep -c ''`
(matches every line — it printed `223`, the file's line count) rather than testing for NUL. The
Python byte-count above is the reliable proof and is what I used to confirm 0 NUL bytes.

### F2 — baseline policy stated in the oracle's own header

Added a `BASELINE POLICY` paragraph to the file header (after the "Depends ONLY on..." paragraph,
before `Usage:`), stating: the fixture is bound to the render output at commit `5cb85515`; a
deliberate render change regenerates it with `--write-baseline` in the same commit as that change;
it is never regenerated to make a red assertion pass — a red run means either unintended drift (fix
the generator) or an unpaired intentional change (pair it with a recapture, don't launder the red
away). Verified the oracle still runs green after the header-only edit:
```
$ node scripts/test-issue-1055-render-subtraction-oracle.js
issue-1055-render-subtraction-oracle passed (5 assertions, 300 render comparisons hashed against baseline commit 5cb855153338f7116d691200ad79fb06e553e7f0).
```

### F3 — CRLF blocks strengthened: normalization pin, not only equality

Confirmed the finding's premise first: a mutant that changes the single-line
`body.split(/\r?\n/).join('\n')` to `body.split(/\r?\n/).join('\r\n')` makes BOTH the LF and CRLF
paths render with `\r\n` line endings — `crlfOut === lfOut` still holds (both consistently wrong),
so the pre-existing equality-only assertion cannot catch it.

Added, to each of the five `scripts/test-{grok,kimi,cursor,opencode,zcode}-edition.js` CRLF blocks,
immediately after the existing equality assertion:
```js
assert(!crlfOut.includes('\r'),
  'CRLF: transformCommandBody(CRLF body) output must contain no \\r (normalized to LF)');
assert(!lfOut.includes('\r'),
  'CRLF: transformCommandBody(LF body) output must contain no \\r (normalized to LF)');
```
(`assertReal` in zcode's file, matching its existing helper name.) Assertion counts rose by 2 per
suite: grok 707→709, kimi 826→828, cursor 840→842, opencode 877→879, zcode 856→858. All five still
pass:
```
grok-edition test passed (709 assertions). ...
kimi-edition test passed (828 assertions). ...
cursor-edition test passed (842 assertions). ...
opencode-edition test passed (879 assertions). ...
zcode-edition test passed (858 assertions). ...
```

**Arming proof without touching `sync-*-edition.js`.** Because the team lead is editing those files
concurrently, I did not mutate them on disk (not even temporarily) — instead I wrote a standalone
harness at `/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/8ce29837-48f3-4418-9032-320f4db44623/scratchpad/f3-mutant-harness.js`
(outside the repo, in the session scratchpad) that:
1. Reads each real `scripts/sync-<runtime>-edition.js` with `fs.readFileSync` (read-only — never
   written).
2. Builds a mutated copy of that source STRING in memory, replacing exactly one occurrence of
   `body.split(/\r?\n/).join('\n')` with `body.split(/\r?\n/).join('\r\n')` (asserts the occurrence
   count is exactly 1 first, so the target can't be ambiguous or silently miss).
3. Loads the mutated string as a real Node module via `new Module(...)` + `Module._compile`, under a
   synthetic filename (`<real path>.f3-mutant-inmemory.js`) so its relative `require('./...')` calls
   still resolve against the real `scripts/` directory and it never collides with the real module in
   `require`'s cache — no file is ever written to disk for this.
4. Runs both the real module and the in-memory mutant through the same LF/CRLF
   `transformCommandBody` calls and reports equality + no-`\r` results for each.

Output (all five runtimes):
```
=== grok ===
  [REAL (control, must be all true)] equality=true noCrInCrlfOut=true noCrInLfOut=true
  [MUTANT split/join(\r\n) (equality must stay true; no-CR must go false = RED)] equality=true noCrInCrlfOut=false noCrInLfOut=false
  CONFIRMED: mutant equality=true (loophole reproduced) AND no-CR assertion=false (RED) — F3 fix is armed for grok
=== kimi ===
  [REAL (control, must be all true)] equality=true noCrInCrlfOut=true noCrInLfOut=true
  [MUTANT split/join(\r\n) (equality must stay true; no-CR must go false = RED)] equality=true noCrInCrlfOut=false noCrInLfOut=false
  CONFIRMED: mutant equality=true (loophole reproduced) AND no-CR assertion=false (RED) — F3 fix is armed for kimi
=== cursor ===
  [REAL (control, must be all true)] equality=true noCrInCrlfOut=true noCrInLfOut=true
  [MUTANT split/join(\r\n) (equality must stay true; no-CR must go false = RED)] equality=true noCrInCrlfOut=false noCrInLfOut=false
  CONFIRMED: mutant equality=true (loophole reproduced) AND no-CR assertion=false (RED) — F3 fix is armed for cursor
=== opencode ===
  [REAL (control, must be all true)] equality=true noCrInCrlfOut=true noCrInLfOut=true
  [MUTANT split/join(\r\n) (equality must stay true; no-CR must go false = RED)] equality=true noCrInCrlfOut=false noCrInLfOut=false
  CONFIRMED: mutant equality=true (loophole reproduced) AND no-CR assertion=false (RED) — F3 fix is armed for opencode
=== zcode ===
  [REAL (control, must be all true)] equality=true noCrInCrlfOut=true noCrInLfOut=true
  [MUTANT split/join(\r\n) (equality must stay true; no-CR must go false = RED)] equality=true noCrInCrlfOut=false noCrInLfOut=false
  CONFIRMED: mutant equality=true (loophole reproduced) AND no-CR assertion=false (RED) — F3 fix is armed for zcode

HARNESS OK — F3 fix proven armed for all five runtimes
```
This is direct evidence: for every runtime the equality check reads `true` under the join-mutant
(the exact loophole F3 named) while the new no-`\r` assertions read `false` (RED), i.e. exactly the
assertions I added would fail if this mutation ever landed in the real file. Nothing under
`scripts/` other than my own `test-*.js` edits was written at any point in this cycle — "revert"
does not apply because nothing on disk was ever mutated.

### Final verification

```
$ git status --short -- scripts/test-cursor-edition.js scripts/test-grok-edition.js scripts/test-kimi-edition.js scripts/test-opencode-edition.js scripts/test-zcode-edition.js scripts/test-issue-1055-render-subtraction-oracle.js scripts/fixtures/
 M scripts/test-cursor-edition.js
 M scripts/test-grok-edition.js
 M scripts/test-issue-1055-render-subtraction-oracle.js
 M scripts/test-kimi-edition.js
 M scripts/test-opencode-edition.js
 M scripts/test-zcode-edition.js
```
(`scripts/fixtures/issue-1055-render-baseline.json` is unchanged — not listed — per F1's "manifest
unchanged" instruction.) Full-repo `git status --short` additionally shows `sync-opencode-edition.js`
and `sync-zcode-edition.js` modified — confirmed these are the team lead's own concurrent edits, not
mine (verified via `git diff` content: further #1055-class dead-code removal, e.g. the
`OPENCODE_MODEL_DISPATCH_BLOCK` region), plus the other agents' files under `kaola-workflow/bundle-1055/`
noted in the section above. Did not commit. Final suite run, all green: grok 709, kimi 828, cursor
842, opencode 879, zcode 858, oracle 5/300.

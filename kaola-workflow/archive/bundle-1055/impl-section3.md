# #1055 §3 — generator helper sharing, implementer report

Worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1055`
(branch `workflow/bundle-1055`), starting at `5cb85515`. Nothing committed (per instructions).

Scope: the seven helpers `audit-generators.md` §5/§1e found byte-identical across the sync scripts
that defined them — `parseFrontmatter`, `parseTools`, `yamlScalar`, `listCanonAgents`,
`listCanonCommands`, `canonCommandPath`, `commandRel` — moved into `scripts/runtime-edition-forge.js`
(the module all five sync scripts already `require` as `forgeLayout`), with each sync script now
consuming the shared implementation instead of restating its own copy.

## Circularity check

`scripts/runtime-edition-forge.js` requires `path`, `./generate-routing-surfaces.js`, and
`./kaola-workflow-install-manifest.js` before this change. I added
`const agentGen = require('./generate-agent-profiles');` (needed for `listCanonAgents`'s
`agentGen.ROLES`). Confirmed `scripts/generate-agent-profiles.js` requires only `crypto`, `fs`, and
`path` — it does **not** require `runtime-edition-forge.js` or any module that transitively does —
so there is no circular require. Verified by loading the module directly:

```
$ node -e "const rf = require('./scripts/runtime-edition-forge.js'); console.log(Object.keys(rf).sort()); console.log('listCanonAgents count', rf.listCanonAgents().length);"
[ 'FORGES', 'REPO', 'UNKNOWN_FORGE', 'assertForge', 'canonCommandPath', 'commandRel',
  'commandSources', 'forgeScriptsDir', 'listCanonAgents', 'listCanonCommands', 'outSuffix',
  'parseFrontmatter', 'parseTools', 'pluginDirName', 'scriptName', 'selfDevScriptsDir', 'yamlScalar' ]
listCanonAgents count 14
```
No load error, no re-entrant require warning; module resolves cleanly.

## Per-helper disposition

| helper | shared or kept | why |
|---|---|---|
| `parseFrontmatter` | **shared** | pure function of its one argument only; identical in all five originals; moved verbatim |
| `parseTools` | **shared** | pure function of its one argument only; identical in grok/cursor/opencode (kimi, zcode never defined it — unaffected) |
| `yamlScalar` | **shared** | pure function of its one argument only; identical in grok/cursor/zcode (kimi, opencode never defined it — unaffected) |
| `listCanonAgents` | **shared** | closes only over `agentGen.ROLES`, and `runtime-edition-forge.js` already had a clean, non-circular path to `agentGen` (see above) |
| `listCanonCommands` | **shared, with a per-script wrapper** | closes over `DEFAULT_FORGE`, a per-script constant (each edition's own `const DEFAULT_FORGE = 'github';`) — moved the shared body to `forgeLayout.listCanonCommands(forge)` (no internal default; `forge` is a required, already-resolved argument), and left a 3-line wrapper in each sync script — `function listCanonCommands(forge) { return forgeLayout.listCanonCommands(forge \|\| DEFAULT_FORGE); }` — that supplies its own `DEFAULT_FORGE`. This is the brief's own carve-out ("a DEFAULT_FORGE … local … may be shared only if the shared form takes that value as an explicit argument"), applied literally: the shared function takes the resolved forge, the per-script wrapper resolves it. Every call site keeps its exact original signature and behavior (including `sync.listCanonCommands()` called with no argument at all, which `test-opencode-edition.js:423` and `test-kimi-edition.js:216` do directly — the wrapper's own default still fires for those). |
| `canonCommandPath` | **shared, with a per-script wrapper** | identical reasoning and identical wrapper shape as `listCanonCommands` |
| `commandRel` | **shared, with a per-script wrapper** (grok, cursor, zcode only — kimi and opencode never defined it) | closes over `treeLabel`, a per-script function (each edition's own `.grok`/`.cursor`/`.zcode` + forge-suffix namer) — exactly the "runtime-specific tree label" case the brief names explicitly. Moved the shared body to `forgeLayout.commandRel(treeLabelFn, name, forge)`, taking the tree-namer as an explicit first argument; each of the three scripts kept a 3-line wrapper — `function commandRel(name, forge) { return forgeLayout.commandRel(treeLabel, name, forge); }` — passing its own local `treeLabel`. All 9 in-script call sites (3 per file across grok/cursor/zcode) are unchanged; `treeLabel` itself stays fully per-script, untouched, as instructed. |

`treeLabel`, `runCheck`, `runWrite`, and all hook/permission/prune logic were left untouched, as
instructed — none of them were in the audit's byte-identical-across-scripts set (`treeLabel` and
`agentRel` are explicitly the audit's "all diverge" / "near-identical but not moved" cases; `runCheck`
and `runWrite` are "all diverge, substantially" per the audit's own function-body diff).

## `module.exports` key-set identity

Verified by loading each script's `HEAD` copy (via `git archive HEAD`, so relative requires still
resolve) against the worktree copy and diffing the sorted key lists:

```
$ git archive HEAD | tar -x -C /tmp/orig1055-full
$ for r in grok kimi cursor opencode zcode; do
    node -e "console.log(JSON.stringify(Object.keys(require('/tmp/orig1055-full/scripts/sync-$r-edition.js')).sort()))" > before.json
    node -e "console.log(JSON.stringify(Object.keys(require('<worktree>/scripts/sync-$r-edition.js')).sort()))" > after.json
    diff before.json after.json && echo IDENTICAL
  done
=== grok ===   IDENTICAL KEY SET
=== kimi ===   IDENTICAL KEY SET
=== cursor === IDENTICAL KEY SET
=== opencode === IDENTICAL KEY SET
=== zcode ===  IDENTICAL KEY SET
```

All five export the exact same set of names as before (34 for grok, 24 for kimi, 39 for cursor, 34
for opencode, 39 for zcode) — the local identifiers `parseFrontmatter`/`parseTools`/`yamlScalar`/
`listCanonAgents` now resolve via destructuring from `forgeLayout` rather than a local function
declaration, and `listCanonCommands`/`canonCommandPath`/`commandRel` now resolve via 2–3-line
wrappers, but every exported name is still a function with identical output.

## Behavioral proof: the 300-comparison render-subtraction oracle

Ran `node scripts/test-issue-1055-render-subtraction-oracle.js` after every single file edit in this
section (7 runs total, one per touched sync script plus the final combined run) — every run reported
**5 assertions, 300/300 comparisons hashed identically against the `5cb85515` baseline, exit 0**. No
render (agent or command, any forge, either line-ending variant) changed by even one byte as a result
of this relocation.

## Full edition-suite proof (after §1 + §3 combined, trees already materialized on this machine)

| suite | assertions | exit |
|---|---|---|
| grok | 707 | 0 |
| kimi | 826 | 0 |
| cursor | 840 | 0 |
| opencode | 877 | 0 |
| zcode | 856 | 0 |

Each suite's own `D0` drift-check line reported all 3 forge trees (`github`/`gitlab`/`gitea`) "in
parity with canonical" both before and after this section's edits — confirming the shared helpers
produce byte-identical output to the pre-existing on-machine trees, not just to the baseline JSON
fixture.

Also armed all 15 runtime × forge combinations explicitly, per the brief:
```
$ for r in grok kimi cursor opencode zcode; do for f in github gitlab gitea; do
    node scripts/sync-$r-edition.js --forge=$f --write; done; done
```
All 15 exited 0. `git status --short` confirms none of `.grok*`/`.kimi*`/`.cursor*`/`.opencode*`/
`.zcode*` appear (gitignored, and `TREE_ROOT` for a worktree resolves to the main checkout root per
each script's own documented TREE_ROOT contract — not this worktree — so they were never candidates
to appear here regardless).

## Regeneration

```
$ npm run sync:editions
codex-sync plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js
codex-sync plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js
byte-sync  plugins/kaola-workflow/scripts/kaola-workflow-validation-runner.js
byte-sync  plugins/kaola-workflow-gitlab/scripts/kaola-workflow-validation-runner.js
byte-sync  plugins/kaola-workflow-gitea/scripts/kaola-workflow-validation-runner.js
byte-sync  plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js
byte-sync  plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js
edition-sync: write complete (7 file(s) updated).

$ node scripts/validate-script-sync.js
OK: 14 common scripts, 25 byte-identical groups, 0 rename-normalized families, 2 hooks.json
families (config + hooks dir), and 5 forge export-superset families in sync.
    committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
EXIT=0
```

(The five `sync-*-edition.js` scripts themselves and `runtime-edition-forge.js` are not part of
`sync:editions`'s COMMON_SCRIPTS/BYTE_IDENTICAL_GROUPS surface — they are canonical-only, consumed
directly by their matching `install-<runtime>.sh`, so `sync:editions` correctly did not touch them.
The 7 files it regenerated are the plugin mirrors of `sink-merge.js`/`codex-preflight.js` and the
byte-identical-group copies of `validation-runner.js` and `codex-preflight.js`, all downstream of
§1's deletions in those three files.)

## Net line delta (relocated, not deleted)

| file | delta |
|---|---|
| `scripts/runtime-edition-forge.js` | **+74** (7 shared functions + their doc comments + 7 new `module.exports` entries) |

This is the counterpart to the reductions §1 reported inside the five sync scripts' combined diffs
(`impl-section1.md`'s table) — those files lost the restated bodies; this file gained the one shared
copy. No line was both deleted and not replaced by this section (§3 relocates; only §1 subtracts).

## Full verification battery (final state, both §1 and §3 applied)

| command | exit |
|---|---|
| `node scripts/test-issue-1055-render-subtraction-oracle.js` | 0 (5 assertions, 300/300) |
| `node scripts/test-grok-edition.js` | 0 (707 assertions) |
| `node scripts/test-kimi-edition.js` | 0 (826 assertions) |
| `node scripts/test-cursor-edition.js` | 0 (840 assertions) |
| `node scripts/test-opencode-edition.js` | 0 (877 assertions) |
| `node scripts/test-zcode-edition.js` | 0 (856 assertions) |
| `node scripts/test-sink-merge.js` | 0 (1063 assertions) |
| `node scripts/test-validation-runner.js` | 0 (PASSED) |
| `node scripts/test-edition-sync.js` | 0 (28 assertions) |
| `node scripts/test-spawn-classification.js` | 0 (10 mutation assertions; 724 sites, 320 classified) |
| `node scripts/test-validate-script-sync.js` | 0 (56 assertions) |
| `node scripts/validate-script-sync.js` | 0 |
| `node scripts/generate-agent-profiles.js --check` | 0 (14 roles, seven runtimes, 126 native renders) |

Every exit code was echoed directly after its own command (never through a pipe).

## What I did not do

- Did not run `npm test` or `npm run test:kaola-workflow:claude(:full)` (multi-minute chains, out of
  scope per instructions) — the battery above is the verification evidence for this section.
- Did not touch `treeLabel`, `runCheck`, `runWrite`, `agentRel`, or any hook/permission/prune logic
  in any of the five sync scripts — all stayed exactly as `audit-generators.md` found them ("all
  diverge" / "near-identical" per the audit's own function-body table).
- Did not move `agentRel` (near-identical, not byte-identical — kimi's parameter name differs — and
  not in the brief's named list) or `treeLabel` (all five diverge by design).
- Did not commit anything.

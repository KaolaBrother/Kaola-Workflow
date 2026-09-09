# Generator-candidate consumer inventory — Issue #1055 (baseline `5cb85515`)

Scope: worktree `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1055`,
branch `workflow/bundle-1055`, no tracked files edited. All line numbers are baseline `5cb85515`.
Consumers searched: `scripts/`, `plugins/*/scripts/`, `templates/`, `hooks/`, `install*.sh`,
`uninstall*.sh`, `package.json` scripts, dynamic require/spawn/shell invocations, and
`scripts/test-*.js` / `plugins/*/scripts/test-*.js` / `scripts/simulate-*.js` /
`scripts/validate-*.js`. `kaola-workflow/archive/**` and `node_modules` excluded. Runtime edition
trees (`.grok*`, `.cursor*`, `.kimi*`, `.opencode*`, `.zcode*`) are gitignored and **absent from
this worktree entirely** (verified: none of the 15 expected directory names exist), so no evidence
below comes from inspecting a materialized tree — only from the generator/test source.

---

## 1. `scripts/sync-{grok,kimi,cursor,opencode,zcode}-edition.js`

### 1a. `transformCommandBody` no-op loop + CRLF/LF normalisation

All five scripts contain the identical shape at the top of `transformCommandBody`:

```js
const lines = body.split(/\r?\n/);
const out = [];
let i = 0;
while (i < lines.length) {
  const line = lines[i];
  out.push(line);
  i++;
}
let text = out.join('\n');
```

Confirmed by direct read, one file at a time:

| file | loop location | body |
|---|---|---|
| `scripts/sync-grok-edition.js:141-161` | lines 143-150 | `out.push(line); i++;` only — no condition, no branch |
| `scripts/sync-kimi-edition.js:186-209`+ | lines 190-206 | `out.push(line); i++;` only. Surrounded by a comment (188-189, 196-203) describing model-dispatch-section stripping that the loop **does not perform** |
| `scripts/sync-cursor-edition.js:260-270` | lines 262-269 | `out.push(line); i++;` only |
| `scripts/sync-opencode-edition.js:285-297` | lines 290-297 | `out.push(line); i++;` only. Same pattern: comment above (287-289) describes an anchored rewrite the loop does not do |
| `scripts/sync-zcode-edition.js:173-193` | lines 175-183 | `out.push(line); i++;` only. Additionally declares `const block = ZCODE_MODEL_DISPATCH_BLOCK.replace(/\s+$/, '');` (line 178) that is **never referenced again anywhere in the file** (`grep -c "\bblock\b"` = 1) |

Disposition: **dead: safe to delete** (the loop itself — every iteration is a straight copy;
removing it and replacing with `lines.join('\n')` — or equivalently just `body` after the
`\r?\n`→`\n` normalisation — changes no observable output). The `body.split(/\r?\n/)` +
`.join('\n')` pairing is exactly the CRLF/LF normalisation described, confirmed in all five files
verbatim. In zcode, the additional unused `block` local is also dead in the same sense.
Downstream, all five functions do real work AFTER this loop (delegation-guidance rewrite,
dispatch-card rewrites, script-path rewrites), so `transformCommandBody` as a whole is live; only
the loop body is inert.

### 1b. `ZERO_HASH`

Declared as `const ZERO_HASH = '0'.repeat(64);` in all five sync scripts:

- `scripts/sync-grok-edition.js:52`
- `scripts/sync-kimi-edition.js:97`
- `scripts/sync-cursor-edition.js:57`
- `scripts/sync-opencode-edition.js:50`
- `scripts/sync-zcode-edition.js:59`

In every one of the five, `grep -c "ZERO_HASH"` returns **1** — the declaration is the only
occurrence in the file. Not referenced again, not in any of the five `module.exports` blocks
(verbatim lists below).

`scripts/generate-agent-profiles.js:28` has its **own, separate** `const ZERO_HASH = '0'.repeat(64);`,
used internally at lines 320, 349, 400, 422, 461, and exported at line 676
(`module.exports = { …, ZERO_HASH, … }`). All five sync scripts already do
`const agentGen = require('./generate-agent-profiles');` (grok:32, kimi:44, cursor:36,
opencode:47, zcode:39), so `agentGen.ZERO_HASH` is reachable — but `grep -n "agentGen\.ZERO_HASH"`
returns **no matches** in any of the five sync scripts. Neither the local copy nor the imported one
is ever consumed.

Disposition: **dead: safe to delete** (each sync script's local `ZERO_HASH`). Confirmed by
occurrence count (=1, self-declaration only) and absence from every `module.exports` list.

### 1c. `lowerSet` in grok / cursor / opencode

```js
function lowerSet(arr) {
  return new Set(arr.map(x => String(x).toLowerCase()));
}
```
byte-identical in all three (`scripts/sync-grok-edition.js:76`, `scripts/sync-cursor-edition.js:86`,
`scripts/sync-opencode-edition.js:141`). `grep -c "lowerSet"` = 1 in each file (declaration only).
Not present in any of the three `module.exports` blocks (verified by grepping the exports block for
`lowerSet` — no match in any of the three).

Disposition: **dead: safe to delete** in all three files. kimi and zcode do not define it at all.

### 1d. Cursor: `CURSOR_MODEL_CLASS_PINS` / `cursorModelPin`

```js
const CURSOR_MODEL_CLASS_PINS = Object.freeze({
  sonnet: 'grok-4.6[effort=medium]',
  standard: 'grok-4.6[effort=medium]',
  opus: 'grok-4.6[effort=high]',
  reasoning: 'grok-4.6[effort=high]',
  fable: 'grok-4.6[effort=xhigh]',
  heavy: 'grok-4.6[effort=xhigh]',
});

function cursorModelPin(canonicalModel, agentName) {
  const token = String(canonicalModel == null ? '' : canonicalModel).trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(CURSOR_MODEL_CLASS_PINS, token)) {
    throw new Error(/* … */);
  }
  return CURSOR_MODEL_CLASS_PINS[token];
}
```
`scripts/sync-cursor-edition.js:129-146`. `grep -c "CURSOR_MODEL_CLASS_PINS"` = 3 (its own
declaration line 129, plus the two internal reads inside `cursorModelPin` at lines 140/145 — all
three occurrences are inside `cursorModelPin` itself). `grep -c "cursorModelPin"` = **1** — the
function's own declaration line is the only occurrence in the file; it is never called.

`renderAgent` (line 148) is confirmed to delegate entirely to the shared generator, not to this
table:
```js
function renderAgent(canonContent, agentName, forge) {
  if (!MANAGED_ROLES.has(agentName)) throw new Error('sync-cursor-edition: unknown role ' + agentName);
  return agentGen.renderRuntimeRole('cursor', agentName).content;
}
```
(`scripts/sync-cursor-edition.js:148-151`)

**Where the real pin values live today:** `templates/agents/runtime-capabilities.json:448` sets
`"model": "grok-4.6"` for the cursor adapter and lines 466-468 declare the three effort mappings
(`standard → grok-4.6[effort=medium]`, `reasoning → grok-4.6[effort=high]`,
`heavy → grok-4.6[effort=xhigh]`) as descriptive `evidence` strings. The renderer that actually
produces the frontmatter is `scripts/generate-agent-profiles.js:368-369`:
```js
} else if (runtime === 'cursor') {
  lines.push('model: ' + capabilities.model + '[effort=' + intent + ']');
```
This is the code path `agentGen.renderRuntimeRole('cursor', ...)` runs through, i.e. the path
`renderAgent` actually calls. `CURSOR_MODEL_CLASS_PINS` in `sync-cursor-edition.js` is a
hand-maintained duplicate of the same three effort strings that the live renderer never reads.

**`scripts/test-cursor-edition.js`'s coupling to the dead table** — confirmed a source-regex pin,
not a behavioural test. Lines 674-686:
```js
// #1018: CURSOR_MODEL_CLASS_PINS is the production map (not exported). The
// allowlist/pin must gain fable -> grok-4.6[effort=xhigh].
const CURSOR_SYNC_SRC = fs.readFileSync(path.join(REPO, 'scripts', 'sync-cursor-edition.js'), 'utf8');
const CURSOR_MODEL_CLASS_PINS_PIN = (() => {
  const m = CURSOR_SYNC_SRC.match(/const CURSOR_MODEL_CLASS_PINS = Object\.freeze\(\{([\s\S]*?)\}\)/);
  const out = {};
  if (!m) return out;
  for (const row of m[1].split('\n')) {
    const mm = row.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*'([^']+)'/);
    if (mm) out[mm[1]] = mm[2];
  }
  return out;
})();
```
It reads `sync-cursor-edition.js`'s raw source text with a regex and extracts the table's key/value
pairs into `CURSOR_MODEL_CLASS_PINS_PIN`. That variable is then asserted against at lines 839-842:
```js
assert(Object.prototype.hasOwnProperty.call(CURSOR_MODEL_CLASS_PINS_PIN, 'fable'),
  'G0-fable: CURSOR_MODEL_CLASS_PINS must include a fable entry');
assert(CURSOR_MODEL_CLASS_PINS_PIN.fable === 'grok-4.6[effort=xhigh]',
  'G0-fable: CURSOR_MODEL_CLASS_PINS.fable must be grok-4.6[effort=xhigh] — got '
  + JSON.stringify(CURSOR_MODEL_CLASS_PINS_PIN.fable));
```
This test never calls `cursorModelPin` and never exercises rendered cursor agent output for this
assertion — it is entirely a regex read of `sync-cursor-edition.js`'s literal source text. Deleting
`CURSOR_MODEL_CLASS_PINS` from `sync-cursor-edition.js` (with no other change) would make `m` `null`,
`CURSOR_MODEL_CLASS_PINS_PIN` `{}`, and the two asserts above red — the test is coupled to the dead
table's *text*, not to any behaviour it drives.

Disposition: `cursorModelPin` — **dead: safe to delete** from a production standpoint (0 production
callers; `renderAgent` never touches it). `CURSOR_MODEL_CLASS_PINS` — **dead in production, but
test-coupled**: `scripts/test-cursor-edition.js:674-686,839-842` reads and asserts on its literal
source text via regex, so removing the table (without touching the test) would turn that test red
even though the table has zero effect on any generated cursor tree. This is a case of a test pinning
dead source text rather than behaviour — reported as fact, no fix recommended per scope.

### 1e. `module.exports`, verbatim, all five scripts

`scripts/sync-grok-edition.js:479-493`:
```
module.exports = {
  renderAgent, renderCommand, transformCommandBody,
  rewriteClaudeScriptPaths, GROK_KAOLA_SCRIPT, grokKaolaScript,
  GROK_MODEL_DISPATCH_GUIDANCE, GROK_MODEL_DISPATCH_BLOCK,
  treeLabel, agentRel, commandRel, canonCommandPath, runCheck, runWrite,
  FORGES: forgeLayout.FORGES, DEFAULT_FORGE,
  adaptHookForGrok, HOOK_ADAPTATIONS,
  expectedHookFiles, expectedRuleFiles, retiredHookFiles, retiredRuleFiles,
  retiredAgentFiles, retiredCommandFiles,
  parseFrontmatter, parseTools, yamlScalar,
  listCanonAgents, listCanonCommands,
  CANON_AGENTS_DIR, CANON_HOOKS_DIR,
  REPO,
  HOOK_SCRIPTS,
};
```

`scripts/sync-kimi-edition.js:620-633`:
```
module.exports = {
  renderAgent, renderCommand, transformCommandBody,
  rewriteClaudeScriptPaths, KIMI_KAOLA_SCRIPT, kimiKaolaScript,
  KIMI_MODEL_DISPATCH_GUIDANCE,
  renderKimiHooksToml, treeLabel, skillRel, agentRel, canonCommandPath, runCheck, runWrite,
  FORGES: forgeLayout.FORGES, DEFAULT_FORGE,
  adaptHookForKimi, HOOK_ADAPTATIONS,
  expectedHookFiles, retiredHookFiles,
  parseFrontmatter,
  listCanonAgents, listCanonCommands,
  CANON_AGENTS_DIR, CANON_HOOKS_DIR,
  REPO,
  HOOK_SCRIPTS,
};
```

`scripts/sync-cursor-edition.js:734-751`:
```
module.exports = {
  renderAgent, renderCommand, transformCommandBody,
  rewriteClaudeScriptPaths, CURSOR_KAOLA_SCRIPT, cursorKaolaScript,
  CURSOR_MODEL_DISPATCH_GUIDANCE,
  cursorCliMaterializationProse,
  cursorCliStartupResumePrepProse,
  renderCursorHooksJson, rewriteHooksJsonForGlobal, mergeDestHooks, stripDestHooks, mappingRel,
  RECOVERY_RULE, RECOVERY_START, RECOVERY_END, DISPATCH_START, DISPATCH_END,
  treeLabel, agentRel, commandRel, canonCommandPath, runCheck, runWrite,
  FORGES: forgeLayout.FORGES, DEFAULT_FORGE,
  adaptHookForCursor, HOOK_ADAPTATIONS,
  expectedHookFiles, retiredHookFiles, retiredRuleFiles, retiredAgentFiles, retiredCommandFiles,
  parseFrontmatter, parseTools, isReadOnlyRole, yamlScalar,
  listCanonAgents, copyListCanonAgents, listCanonCommands,
  CANON_AGENTS_DIR, CANON_HOOKS_DIR,
  REPO,
  HOOK_SCRIPTS,
};
```
(note: neither `CURSOR_MODEL_CLASS_PINS` nor `cursorModelPin` nor `lowerSet` nor `ZERO_HASH` appear
in this list.)

`scripts/sync-opencode-edition.js:887-901`:
```
module.exports = {
  renderAgent, renderCommand, renderOpencodeJson, renderNeutralConfig,
  transformCommandBody, opencodeAgentSuffix, rewriteClaudeScriptPaths, OPENCODE_KAOLA_SCRIPT,
  OPENCODE_MODEL_DISPATCH_GUIDANCE, OPENCODE_MODEL_DISPATCH_BLOCK,
  opencodeKaolaScript, outDirs, treeLabel, canonCommandPath, runCheck, runWrite,
  FORGES: forgeLayout.FORGES, DEFAULT_FORGE,
  parseFrontmatter, parseTools, roleTier, reasoningRoles,
  PERMISSION_AXES, deniedPermissionAxes,
  listCanonAgents, listCanonCommands,
  ENV_STANDARD_MODEL, ENV_REASONING_MODEL,
  CANON_AGENTS_DIR, CANON_HOOKS_DIR, CANON_PLUGINS_DIR,
  OUT_AGENT_DIR, OUT_COMMAND_DIR, OPENCODE_JSON, REPO,
  HOOK_SCRIPTS, PLUGIN_SCRIPTS,
  writePlugin, retiredMdFiles, retiredCopiedFiles, pruneRetired,
};
```

`scripts/sync-zcode-edition.js:898-917`:
```
module.exports = {
  renderAgent, renderCommand, transformCommandBody,
  rewriteClaudeScriptPaths, ZCODE_KAOLA_SCRIPT, zcodeKaolaScript,
  ZCODE_MODEL_DISPATCH_GUIDANCE, ZCODE_MODEL_DISPATCH_BLOCK,
  renderZcodeConfigJson, rewriteConfigJsonForGlobal, mergeDestHooks, stripDestHooks,
  renderRuntimeHookWrapper, RUNTIME_WRAPPER,
  expectedPromptFiles,
  adaptHookForZcode, HOOK_ADAPTATIONS,
  renderSupportLauncher, manifestSupportScripts,
  treeLabel, agentRel, commandRel, configRel, canonCommandPath, runCheck, runWrite,
  FORGES: forgeLayout.FORGES, DEFAULT_FORGE,
  ZCODE_HOOK_EVENTS,
  HOOK_RECEIPT_SCHEMA, defaultReceiptPath, atomicWriteFile,
  expectedHookFiles, retiredHookFiles: retiredEditionFiles, retiredAgentFiles, retiredCommandFiles,
  parseFrontmatter, yamlScalar,
  listCanonAgents, listCanonCommands,
  CANON_AGENTS_DIR, CANON_HOOKS_DIR,
  REPO,
  HOOK_SHELLS,
};
```

---

## 2. `getRoot` and `requiredArchiveFiles` in `scripts/kaola-workflow-sink-merge.js`

`getRoot` — `scripts/kaola-workflow-sink-merge.js:387-395`:
```js
function getRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_) {
    return process.cwd();
  }
}
```
`grep -n "getRoot\b" scripts/kaola-workflow-sink-merge.js` returns **only line 387** — the
declaration. No call site anywhere in the file, and it is not in the file's `module.exports`
(verbatim below).

`requiredArchiveFiles` — **exactly 3 lines**, `scripts/kaola-workflow-sink-merge.js:1636-1638`:
```js
function requiredArchiveFiles(mainRoot, archiveRel) {
  return scanArchiveTree(mainRoot, archiveRel).required;
}
```
Confirmed: the comment block that immediately follows (lines ~1640-1656, the "#901 …
`ignoredUntrackedUnder`" discussion of NUL-terminated `git ls-files -o -i --exclude-standard -z`
output) belongs to the **next** function, `ignoredUntrackedUnder` (declared at line 1657), not to
`requiredArchiveFiles`. If `requiredArchiveFiles` is ever removed, that comment block must stay —
it documents `ignoredUntrackedUnder`, not the deleted function.

`grep -n "requiredArchiveFiles\b" scripts/kaola-workflow-sink-merge.js` returns only the
declaration (1636) and one self-referential comment inside its own trailing block (1649, which is
part of the `ignoredUntrackedUnder` comment quoting the sibling function by name — "matched nothing
`requiredArchiveFiles` produced"). No call site. The live path that actually walks the archive tree
is `scanArchiveTree` itself, called directly at line 2586
(`? scanArchiveTree(mainRoot, archiveRel) : …`) — `requiredArchiveFiles` is a thin, unused wrapper
around it.

`module.exports` of `scripts/kaola-workflow-sink-merge.js:3419` (the entire, complete export list):
```js
module.exports = { classifyMergeError, assertBranchHasNonWorkflowChanges };
```
Neither `getRoot` nor `requiredArchiveFiles` is exported.

**`scripts/test-sink-merge.js`'s mentions of `requiredArchiveFiles`** — confirmed prose-only, not a
call. `grep -n "requiredArchiveFiles(" scripts/test-sink-merge.js` (with the open-paren, i.e. an
actual invocation) returns **no matches**. `grep -n "getRoot" scripts/test-sink-merge.js` also
returns **no matches** at all. The two hits that do exist are pure prose inside a large comment
block at lines 3399 and 3405 (an `(z1) #907` note explaining the `.git`-file vs `.git`-directory
distinction):
```
// A CORRECTION TO #907 FIRST, so nobody re-derives the wrong mechanism: a `.git`-named FILE is NOT a
// defect. `requiredArchiveFiles` skips an entry named `.git`, it has done so since the function was
// written, and the file is simply never committed. The real block is next door.
...
//   * `requiredArchiveFiles` walks the DISK and still demands the siblings under that directory;
```
`scripts/test-sink-merge.js` loads the sink-merge module only once, at line 2379:
`const { assertBranchHasNonWorkflowChanges } = require(sinkMergeScript);` — it never destructures
`requiredArchiveFiles` or `getRoot`. The behaviour the comment describes (the `.git`-skip in the
archive walk) is exercised, if at all, through `scanArchiveTree` — either via the actual sink-merge
CLI subprocess or indirectly — never through the `requiredArchiveFiles` wrapper by name.

Disposition: both **dead: safe to delete** within `scripts/kaola-workflow-sink-merge.js` — neither
is called in-file, neither is exported, and no other production or test file requires this module
and calls either by name. `requiredArchiveFiles` specifically is a redundant one-line wrapper around
`scanArchiveTree(...).required`, and the live archive-scan call site (line 2586) bypasses the
wrapper and calls `scanArchiveTree` directly.

Note: `getRoot` as an *identifier* is not dead across the codebase — `kaola-workflow-claim.js`,
`kaola-workflow-classifier.js`, `kaola-workflow-active-folders.js`, `kaola-workflow-sink-pr.js`,
`kaola-workflow-telemetry-report.js`, and `kaola-workflow-closure-audit.js` (plus their plugin
mirrors) each define and heavily use their **own** separate `getRoot()` copy. Only the copy inside
`kaola-workflow-sink-merge.js` is unused; this is scoped per-file, not a statement about the
function name generally.

---

## 3. `computeLandableBlobEntries` in `scripts/kaola-workflow-validation-runner.js`

Defined `scripts/kaola-workflow-validation-runner.js:613-662` (git-index-based blob-mode/sha lookup
for a requested path set, using a scratch `GIT_INDEX_FILE`), exported at line 1726
(`computeLandableBlobEntries,` inside `module.exports`).

Byte-identical copies exist at the same line numbers in all three plugin mirrors (confirmed present
at 613/1726 in each):
- `plugins/kaola-workflow/scripts/kaola-workflow-validation-runner.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-workflow-validation-runner.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-validation-runner.js`

Consumer search: `grep -rn "computeLandableBlobEntries" scripts/ plugins/` excluding the four
`kaola-workflow-validation-runner.js` files themselves returns **zero matches**. The three files
that `require('./kaola-workflow-validation-runner.js')` or `require('./kaola-workflow-validation-runner')`
— `scripts/test-validation-runner.js:10`, `scripts/validate-workflow-contracts.js:968`, and
`scripts/kaola-workflow-run-chains.js:154` (plus their plugin-mirror equivalents) — none of them
reference `computeLandableBlobEntries` anywhere in their own source.

`scripts/kaola-workflow-validation-runner.js` is also one of the 4-tree `BYTE_IDENTICAL_GROUPS`
members in `scripts/validate-script-sync.js:133-136`, so its byte-identity across the four copies is
enforced by that guard — but that guard only checks the four copies agree with each other, not that
any exported symbol is consumed.

Disposition: **exported-but-unconsumed: needs decision**. It is a real, exported function with zero
callers found anywhere in production code or in any test file, in both the canonical copy and all
three plugin mirrors.

---

## 4. `scopeIsFresh` in `scripts/kaola-workflow-codex-preflight.js`

Defined `scripts/kaola-workflow-codex-preflight.js:2872-2874`:
```js
// #571: a scope is "fresh" iff it exists AND inspectScope finds nothing stale.
// The `s.exists` guard is LOAD-BEARING: an absent scope reads "not stale" inside
// scopeIsStale (the `s.exists &&` short-circuits), so without this guard an absent
// ~/.codex would wrongly count as "fresh" and PASS the gate.
function scopeIsFresh(s) {
  return s.exists && !scopeIsStale(s);
}
```
`grep -c "scopeIsFresh" scripts/kaola-workflow-codex-preflight.js` = **1** — only the declaration.
Not exported (absent from `module.exports`, checked directly). The sibling function it wraps,
`scopeIsStale` (declared 2833), **is** called elsewhere in the same file — directly, bypassing
`scopeIsFresh` — at lines 3535 (`item.trust === 'trusted' && item.footprint && scopeIsStale(item.scope)`)
and 3540 (`|| (userReport.kaola_footprint && scopeIsStale(userScope))`), each combined inline with
its own `.exists`-adjacent footprint condition rather than going through `scopeIsFresh`. So the
actual codex-preflight gating logic never invokes `scopeIsFresh` at all; it reimplements the
same `exists && !stale` shape ad hoc at each of its two call sites.

Byte-identical declaration present (same 2872 line number) in all three plugin mirrors:
`plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js`,
`plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js`,
`plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js`.

**`plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`** — confirmed this is a
genuinely **separate, hand-written file**, not a generated mirror of
`scripts/simulate-workflow-walkthrough.js`. Sizes differ enormously (12,880 lines canonical vs 1,805
lines plugin), and there is no file named `scripts/simulate-kaola-workflow-walkthrough.js` in
canonical `scripts/` at all (only `scripts/simulate-workflow-walkthrough.js` exists there — a
different basename). `scripts/validate-script-sync.js:14-22` documents this split explicitly: the
Claude variant is described as a "4700-line" (now 12,880-line) end-to-end walkthrough exercising
Claude-only hooks, and the Codex variant as a "focused 1100-line" (now 1,805-line) test of
Codex-specific claim semantics — and states they "must NEVER be synced."

The two `scopeIsFresh` mentions in the plugin walkthrough, lines 1133 and 1142, are **comments**,
not calls:
```
// --- Test (c): stale global does NOT short-circuit (locks scopeIsFresh && s.exists) ---
...
// Delete one role toml → stale global; scopeIsFresh must return false.
```
Reading the surrounding test body (lines ~1132-1155): it deletes one role `.toml` from an installed
global scope, then invokes `preflightScript` (`kaola-workflow-codex-preflight.js`) as a **child
process** via `runScript(...)` and asserts on the subprocess's exit code and JSON output
(`assert(r.status !== 0, '#571 test(c): stale global must not short-circuit, got exit ' + r.status);`).
It never calls `scopeIsFresh` directly and never requires the preflight module for in-process
access to that symbol. This is a black-box behavioural test of the CLI's observable output, not a
white-box test of the `scopeIsFresh` function. Given that the live gate logic (lines 3535/3540)
already bypasses `scopeIsFresh` and calls `scopeIsStale` directly with the same guard inlined, this
test's pass/fail depends on that inlined behaviour, not on `scopeIsFresh`'s existence — the comment
names `scopeIsFresh` to explain the *mechanism the author believed was responsible*, but the
assertion would not go red if `scopeIsFresh` were deleted or renamed while the inlined
`scopeIsStale`-based gating at 3535/3540 stayed intact.

Disposition: **dead: safe to delete** in `scripts/kaola-workflow-codex-preflight.js` and its three
plugin mirrors — zero callers, not exported, and the one test that discusses it in prose exercises
the CLI's behavior through a different, already-inlined code path rather than this function.

---

## 5. Cross-script duplication among the five `sync-*-edition.js` generators

Function-body diffs, extracted per-file and compared line-for-line (script bodies captured from the
`function NAME(` line through the matching top-level closing `}`).

| function | carried by | byte-identical? | notes |
|---|---|---|---|
| `parseFrontmatter` | grok:58, kimi:105, cursor:68, opencode:123, zcode:75 | **yes, all 5 identical** | |
| `parseTools` | grok:69, cursor:79, opencode:134 (kimi, zcode do not define it) | **yes, all 3 identical** | |
| `yamlScalar` | grok:84, cursor:93, zcode:89 (kimi, opencode do not define it) | **yes, all 3 identical** | conditional-quoting implementation (regex-driven — quotes only when needed) |
| `listCanonAgents` | grok:92, kimi:116, cursor:101, opencode:175, zcode:97 | **yes, all 5 identical** | |
| `listCanonCommands` | grok:96, kimi:125, cursor:115, opencode:185, zcode:101 | **yes, all 5 identical** | |
| `canonCommandPath` | grok:100, kimi:129, cursor:119, opencode:189, zcode:105 | **yes, all 5 identical** | |
| `commandRel` | grok:215, cursor:408, zcode:562 (kimi, opencode do not define it) | **yes, all 3 identical** | |
| `agentRel` | grok:212, kimi:299, cursor:405, zcode:559 (opencode does not define it) | **near-identical, 3-of-4 byte-identical; kimi differs only by parameter name** | grok/cursor/zcode: `function agentRel(name, forge)`; kimi: `function agentRel(role, forge)` — bodies otherwise character-for-character the same (`treeLabel(forge) + '/agents/' + <param> + '.md'`) |
| `treeLabel` | grok:47, kimi:86, cursor:52, opencode:447, zcode:54 | **all 5 diverge** | each hardcodes its own directory prefix (`.grok`/`.kimi`/`.cursor`/`.opencode`/`.zcode`) — this divergence is the point of the function (per-edition output-tree naming), not accidental duplication |
| `runCheck` | grok:386, kimi:526, cursor:589, opencode:730, zcode:768 | **all 5 diverge, substantially** | share a common skeleton (walk agents → walk commands → walk hooks → check a config/mapping file → prune retired surfaces → print PARITY FAILED/OK), but each edition's body differs by ~26-30 diff lines out of ~55-108 total: kimi has skills instead of commands and no rule/hook-json section shaped like cursor's, opencode additionally covers `PLUGIN_SCRIPTS`, `opencode.json`, and a `remedy:` field per mismatch not present elsewhere, zcode covers `HOOK_SHELLS`/support-script launchers/`config.json` instead of cursor's `hooks.json`. Not verbatim duplication. |
| `runWrite` | grok:350, kimi:457, cursor:547, opencode:606, zcode:729 | **all 5 diverge** | small functions (10-16 lines each); diff size (26-28 lines) is large relative to function size — genuinely edition-specific, not copy-paste drift |

Equivalent-function check against other generators:

- `scripts/generate-agent-profiles.js` has its **own** `yamlScalar` (line 290:
  `function yamlScalar(value) { return JSON.stringify(String(value)); }`) — a simpler,
  always-quote implementation, **not** the same behaviour as the sync scripts' conditional-quoting
  `yamlScalar`, and not exported (absent from its `module.exports` list at lines 671-702... this
  file's exports run to line ~702+, `yamlScalar` is not among the enumerated names). It is used only
  internally at its own line 339.
- `scripts/generate-agent-profiles.js` has **no** `parseFrontmatter`, `parseTools`,
  `listCanonAgents`, `listCanonCommands`, `commandRel`, `agentRel`, `canonCommandPath`, `runCheck`,
  or `runWrite` of its own (confirmed via `grep -n "function <name>"` returning no hits for any of
  these against that file).
- `scripts/runtime-edition-forge.js` exports `{ REPO, FORGES, UNKNOWN_FORGE, assertForge,
  pluginDirName, outSuffix, forgeScriptsDir, selfDevScriptsDir, scriptName, commandSources }`
  (lines 140-151) — none of these names overlap the duplicated-function set above; this is the
  shared forge-layout module the five sync scripts already `require` (as `forgeLayout`), it does not
  duplicate any of the parse/list/render helpers.
- `scripts/edition-sync.js` defines its **own** `runCheck` (line 159) and `runWrite` (line 234), but
  these operate on the forge-port generation domain (renamed GENERATED_AGGREGATORS ports for
  gitlab/gitea), a different problem from the five sync-*-edition scripts' runtime-edition parity
  check/write. Neither is exported from `edition-sync.js` (its export list at line 303 is
  `{ renderForgePort, renameSet, GENERATED_AGGREGATORS, forgeRel, genHeader, syncIfDrift,
  MATERIALIZED_SHARED, materializedForgeRel, runMaterializeKernel }` — no `runCheck`/`runWrite`).

No verdict is offered on whether/how to consolidate; the above states only what is identical, what
is near-identical, and what is genuinely divergent, plus what (if anything) an existing shared
module already covers.

---

## 6. Mirror propagation

**`plugins/kaola-workflow*/scripts/*` from `scripts/`:**
`scripts/validate-script-sync.js` (560 lines) is the drift guard, not the generator. It declares
`COMMON_SCRIPTS` (claude ↔ codex byte-identical list, includes `kaola-workflow-sink-merge.js` at
line 36 and `kaola-workflow-codex-preflight.js` at line 44) and `BYTE_IDENTICAL_GROUPS` (4-tree
groups, includes `kaola-workflow-validation-runner.js` at lines 133-136), and asserts committed-blob
parity (`checkCommittedKernelParity`, line ~343+). Its own module comment (lines 382, 384) points at
the regeneration command directly: `run \`npm run sync:editions\` and commit the copy` /
`…and commit the regenerated copies`.

`package.json:52`: `"sync:editions": "node scripts/edition-sync.js --write"`. This is the command
that regenerates `plugins/kaola-workflow*/scripts/*` (the codex tree + the gitlab/gitea
GENERATED_AGGREGATORS ports) from canonical `scripts/`. `scripts/edition-sync.js`'s own header
(lines 1-40) states `--write` "regenerate[s] the forge aggregator ports from canonical via the
declared rename map, cp the COMMON_SCRIPTS set canonical → codex, and cp the byte-identical groups
across editions," and `--check` (wired into the gitlab/gitea test chains) recomputes and asserts
byte-equality against the committed files, exiting 1 on drift.

**Runtime edition trees (`.grok*`, `.kimi*`, `.cursor*`, `.opencode*`, `.zcode*`) — a different
mechanism, not covered by `sync:editions`:**
`grep -n '"sync' package.json` shows only the one `sync:editions` script — there is no
`npm run sync:runtimes` or similar aggregate. The five `scripts/sync-{grok,kimi,cursor,opencode,zcode}-edition.js`
generators are instead invoked directly by their matching per-runtime installers
(`install-grok.sh`, `install-kimi.sh`, `install-cursor.sh`, `install-opencode.sh`,
`install-zcode.sh`), e.g. `install-grok.sh:108,116-117`:
```sh
if ! TREE_ROOT="$(node "$SCRIPT_DIR/scripts/sync-grok-edition.js" --print-tree-root)"; then
...
  node "$SCRIPT_DIR/scripts/sync-grok-edition.js" --forge="$FORGE" --check >/dev/null 2>&1 \
    || node "$SCRIPT_DIR/scripts/sync-grok-edition.js" --forge="$FORGE" --write >/dev/null
```
Each of the other four installers has the equivalent `--check`-then-`--write` pattern for its own
sync script (confirmed via `grep -l` — all five installer scripts reference their matching
sync-*-edition.js). So the runtime-edition trees regenerate on `./install-all.sh --yes` (or a direct
`install-<runtime>.sh` run), not via `npm run sync:editions`.

**Does regeneration cover gitlab/gitea trees on this machine?** No — because **none of the runtime
edition trees exist in this worktree at all**. Checked directly: `.grok`, `.grok-gitlab`,
`.grok-gitea`, `.cursor`, `.cursor-gitlab`, `.cursor-gitea`, `.kimi`, `.kimi-gitlab`,
`.kimi-gitea`, `.opencode`, `.opencode-gitlab`, `.opencode-gitea`, `.zcode`, `.zcode-gitlab`,
`.zcode-gitea` — all 15 absent. `.gitignore:5-16` confirms these are intentionally gitignored,
generated, per-machine artifacts (`.opencode/`, `.kimi/`, `.grok/`, `.cursor/`, `.zcode/`, and the
`.opencode-*/`, `.kimi-*/`, `.grok-*/`, `.cursor-*/`, `.zcode-*/` per-forge variants). This matches
the previously recorded finding that edition suites are vacuous in a fresh worktree: absent trees
mean their per-forge parity checks have nothing to compare against and exit 0 without checking
anything, until an installer (or the sync script directly, with `--forge=<f> --write`) materializes
them on this machine.

The `plugins/kaola-workflow*/scripts/*` mirrors, by contrast, ARE tracked in git (confirmed via
`git ls-files plugins/kaola-workflow-gitlab/scripts/` returning real committed file paths), so their
regeneration state is checkable in this worktree right now via `validate-script-sync.js`, while the
runtime-edition-tree regeneration state is not checkable here at all — there is nothing on disk to
check.

---

## Unknowns / not measured

- Whether `computeLandableBlobEntries` (§3) was ever called from a caller that has since been
  deleted (git-blame archaeology) was not investigated — this report covers only the current
  baseline tree, per the assigned scope.
- Whether the plugin walkthrough's test (c) (§4) would still pass if `scopeIsFresh` were deleted was
  reasoned from static reading of the call graph (scopeIsStale is called directly at 3535/3540,
  bypassing scopeIsFresh) rather than by actually deleting the function and re-running the test —
  running `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` was out of scope
  for this investigation (no chain runs were performed, per instruction).
- No mutation testing was performed for any candidate (no code was edited, per the write
  restriction to this report file only) — all "would go red / would not go red" statements above are
  static-reachability inferences from the call graph and `require`/`module.exports` graph, not
  measured by actually removing code and re-running a suite.

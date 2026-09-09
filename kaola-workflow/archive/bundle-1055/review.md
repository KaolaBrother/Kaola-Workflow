# #1055 — independent code review of the frozen candidate

Candidate: `8791ab55` (`refactor(scripts): converge ownership boundaries and remove proven-dead residue`)
Baseline: `5cb85515` (= `main`)
Worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1055`, branch `workflow/bundle-1055`
Reviewed scope: `git diff 5cb85515 8791ab55 -- scripts plugins package.json`, excluding
`scripts/fixtures/issue-1055-render-baseline.json` and `kaola-workflow/bundle-1055/`.
No tracked file was modified by this review; the only write is this file.

**Verdict: ready with notes.** No behaviour defect and no regression was found. Every deletion is
consumer-free, every relocation is behaviour-identical under direct measurement, and the migrated
acceptance pin is strictly stronger than the one it replaced. Six notes follow, one of which
(F1) I recommend fixing before the sink because it degrades reviewability of the file that carries
this issue's acceptance meaning.

---

## F1 — the new oracle carries a literal NUL byte, so git and grep treat it as binary

**Where:** `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1055/scripts/test-issue-1055-render-subtraction-oracle.js`,
line 86 (byte offset 4378), inside `recordKey`:

```js
function recordKey(rec) {
  return [rec.runtime, rec.forge, rec.kind, rec.name, rec.lineEnding].join('<U+0000>');
}
```

The separator renders as a space in most viewers but is a raw `0x00`, not `0x20`.

**Failing scenario.** Two concrete consequences, both already live in the candidate:

1. Git classifies the file as binary. The candidate's own diffstat reports
   `scripts/test-issue-1055-render-subtraction-oracle.js | Bin 0 -> 9705 bytes` with
   `1 file changed, 0 insertions(+), 0 deletions(-)`. Neither this addition nor any future edit to
   this suite is reviewable through `git diff`, `git show`, `git log -p`, `git blame`, or a forge
   pull-request view.
2. `grep -r` skips it. The audit and both implementer reports establish their zero-reference proofs
   with `grep -rn "<symbol>" scripts plugins ...`. That sweep silently does not scan this file. If
   the oracle had referenced one of the deleted symbols, every grep proof in this run would still
   have reported zero hits.

**How I verified it.**

```
$ node -e "const b=require('fs').readFileSync('scripts/test-issue-1055-render-subtraction-oracle.js');
  const bad=[];for(let i=0;i<b.length;i++){const c=b[i];if(c<0x09||(c>0x0d&&c<0x20)||c===0x7f)bad.push([i,c]);}
  console.log(bad,'roundtrip',Buffer.from(b.toString('utf8'),'utf8').equals(b));"
[ [ 4378, 0 ] ] roundtrip true

$ od -c scripts/test-issue-1055-render-subtraction-oracle.js | grep '\\0'
0010420    n   g   ]   .   j   o   i   n   (   '  \0   '   )   ;  \n   }

$ grep -l "transformCommandBody" scripts/test-issue-1055-render-subtraction-oracle.js; echo "exit=$?"
exit=1
$ node -e "console.log(require('fs').readFileSync('scripts/test-issue-1055-render-subtraction-oracle.js','utf8').includes('transformCommandBody'))"
true

$ git diff --numstat 5cb85515 8791ab55 -- scripts/test-issue-1055-render-subtraction-oracle.js
-	-	scripts/test-issue-1055-render-subtraction-oracle.js
```

**Severity.** Not a behaviour defect: a NUL is a legal JS string literal and a perfectly good key
separator, and the oracle passes (300/300, exit 0). It is a review-and-tooling defect the candidate
introduces, in the one file that owns this issue's acceptance. `node scripts/test-spawn-classification.js`
still sees the file (it reads with `fs.readFileSync`, not grep) and passes.

**Minimal fix.** Write the separator as a six-character backslash-u escape instead of a raw
control byte — `.join('\\u0000')` — which keeps runtime behaviour bit-for-bit identical and
makes the file text again. Any printable separator works equally well.

---

## F2 — the oracle's golden baseline pins the entire render surface, so ordinary content edits will red the focused chain

**Where:** `scripts/test-issue-1055-render-subtraction-oracle.js` (registered in `package.json`
on `test:kaola-workflow:claude` and `:claude:full`) against
`scripts/fixtures/issue-1055-render-baseline.json`.

**Failing scenario.** The 300 baselined hashes are hashes of rendered output, and the renderers'
inputs are tracked content: the canonical `commands/*.md` bodies feed 90 of the 300 records, and
`templates/agents/*.json` feeds the other 210. A one-character prose edit to a command surface reds
the focused chain with a hash mismatch. The only remedy the failure message points at is
`--write-baseline`, which is also the action that would silently launder a genuine regression.

**How I verified it.**

```
$ node -e "... const rec = baseline record for grok/github/command/workflow-next (LF);
  const cur  = sha256(grok.renderCommand(raw, 'workflow-next','github'));
  const cur2 = sha256(grok.renderCommand(raw.replace('the','the '),'workflow-next','github'));
  console.log(rec.hash===cur, rec.hash!==cur2);"
baseline hash matches current: true
after a 1-char edit to commands/workflow-next.md the record hash changes: true
command records: 90 agent records: 210
```

The suite header documents `--write-baseline` as "(re)capture it" but states no policy for when
recapture is legitimate. That policy exists only in `kaola-workflow/bundle-1055/acceptance.md`
("only after a DELIBERATE render change, never to make a red pass"), which does not ship with the
suite and which a future maintainer hitting the red will not be reading.

**Recommendation.** Put that one sentence in the file header, together with the requirement that a
recaptured fixture lands in the same commit as the deliberate render change it follows. This is a
durability note, not a defect in the current tree.

---

## F3 — the per-suite CRLF pin is an equality pin, not a normalisation pin

**Where:** the five added blocks in `scripts/test-{grok,kimi,cursor,opencode,zcode}-edition.js`,
each asserting `transformCommandBody(CRLF) === transformCommandBody(LF)`.

**Failing scenario.** The assertion says the two inputs agree; it does not say what they agree on.
An implementation that normalised the other way — `split(/\r?\n/).join('\r\n')` — satisfies it while
changing every emitted byte.

**How I verified it.** Coverage matrix over the real `workflow-next.md` body, comparing the shipped
implementation against two mutants:

| variant | CRLF pin | oracle |
|---|---|---|
| shipped `split(/\r?\n/).join('\n')` | GREEN | GREEN |
| mutant A `split('\n').join('\n')` | RED | RED |
| mutant B `split(/\r?\n/).join('\r\n')` | **GREEN** | RED |

```
$ node -e "<shipped/mutantA/mutantB applied to the LF and CRLF twins of commands/workflow-next.md>"
shipped                  CRLF pin: GREEN | oracle: GREEN
mutantA split('\n')      CRLF pin: RED  | oracle: RED
mutantB join('\r\n')     CRLF pin: GREEN | oracle: RED
```

Combined coverage is complete, because the oracle catches mutant B. But the CRLF blocks were
authored as the *behavioural* acceptance for the loop that §1 removed, and on their own they do not
pin LF output. This compounds F2: if the golden fixture is ever recaptured to clear a red, mutant-B
class regressions become invisible.

---

## F4 — two constants became zero-reference exports and were not retired

**Where:**
- `scripts/sync-zcode-edition.js:94` (`ZCODE_MODEL_DISPATCH_BLOCK`), exported at line 865.
- `scripts/sync-opencode-edition.js:205` (`OPENCODE_MODEL_DISPATCH_BLOCK`), exported at line 852.

**Failing scenario.** None — this is an incompleteness, not a fault. At baseline,
`ZCODE_MODEL_DISPATCH_BLOCK` had exactly one in-file reference, the dead
`const block = ZCODE_MODEL_DISPATCH_BLOCK.replace(/\s+$/, '')` that §1 correctly deleted;
`OPENCODE_MODEL_DISPATCH_BLOCK` had only a comment mention, also correctly deleted. Both are now
exported with no consumer anywhere. That is precisely the basis the run used to delete
`computeLandableBlobEntries` ("exported, 0 callers in production or tests").

**How I verified it.**

```
$ grep -n "ZCODE_MODEL_DISPATCH_BLOCK" scripts/sync-zcode-edition.js
94:const ZCODE_MODEL_DISPATCH_BLOCK = [
865:  ZCODE_MODEL_DISPATCH_GUIDANCE, ZCODE_MODEL_DISPATCH_BLOCK,
$ grep -n "OPENCODE_MODEL_DISPATCH_BLOCK" scripts/sync-opencode-edition.js
205:const OPENCODE_MODEL_DISPATCH_BLOCK = [
852:  OPENCODE_MODEL_DISPATCH_GUIDANCE, OPENCODE_MODEL_DISPATCH_BLOCK,
$ grep -rn "MODEL_DISPATCH_BLOCK" scripts plugins templates hooks install*.sh uninstall*.sh | grep -v "^scripts/sync-"
scripts/test-cursor-edition.js:1183:// CURSOR_MODEL_DISPATCH_BLOCK residue would not observe this path.   (a comment)
```

The companion `*_MODEL_DISPATCH_GUIDANCE` constants were already export-only at baseline and are
untouched. Retiring these is a judgement call for the orchestrator, not a blocker.

---

## F5 — two stale prose references to `scopeIsFresh`, and one documented hazard lost with it

**Where:** `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js:1133` and `:1142`
still read `locks scopeIsFresh && s.exists` and `scopeIsFresh must return false`. The symbol was
deleted from `scripts/kaola-workflow-codex-preflight.js`.

**Failing scenario.** None at runtime. Test (c) drives the preflight CLI as a subprocess and asserts
`r.status !== 0`; it never references the symbol. The comments are now rot.

Separately, the deletion removed the `#571` comment that documented a real subtlety of the surviving
`scopeIsStale`: an absent scope reads "not stale" because of the `s.exists &&` short-circuit. The
live gate at `scripts/kaola-workflow-codex-preflight.js:3527` and `:3532` guards with
`item.footprint` / `userReport.kaola_footprint` rather than `s.exists`, so behaviour is unchanged —
but that hazard is now undocumented in the file that contains it.

**How I verified it.** Baseline `scopeIsFresh` at `:2873` with its comment at `:2870`; the surviving
`scopeIsStale` definition and both call sites are byte-unchanged, shifted by exactly the eight
deleted lines (baseline `:3535`/`:3540` → candidate `:3527`/`:3532`). The `#901 ignoredUntrackedUnder`
comment block in all four sink-merge copies is byte-identical (it appears as diff context, and its
one prose mention of `requiredArchiveFiles` survives verbatim as instructed).

---

## F6 — two numbers in the run reports are wrong; the code they describe is right

- `impl-section3.md` states the sync scripts export "34 for grok, 24 for kimi, 39 for cursor, 34 for
  opencode, 39 for zcode". Measured against the baseline modules: **33 / 27 / 45 / 41 / 44**. The
  claim that matters — the key set is identical before and after — is correct for all five.
- `mission-list.md` row 3 records "validation-runner `computeLandableBlobEntries` (+ its
  now-orphaned helper, −68)". No helper was deleted; the −68 is the 66-line function plus its
  `module.exports` entry and a blank line. `impl-section1.md` states this correctly and explicitly
  records that `runGit` stayed live. `os` and `path` remain used elsewhere in the file (6 `os.` sites
  survive), so the deletion left no unused require.

```
$ node <compare base vs candidate module export key sets>
keyset OK grok 33 / kimi 27 / cursor 45 / opencode 41 / zcode 44   (0 keyset diffs)
$ git diff 5cb85515 8791ab55 -- scripts/kaola-workflow-validation-runner.js | grep -c '^-'
(function body + module.exports line only; no helper removed)
```

---

## What I verified as correct

**Relocation is behaviour-identical (§2).** The moved `defaultBranch` and both toggle constants in
`scripts/kaola-workflow-adaptive-schema.js:834-838` are byte-identical in expression to claim's
originals (same env names `KAOLA_WORKFLOW_OFFLINE` / `KAOLA_GH_REMOTE_TIMEOUT_MS`, same
`parseInt(... || '30000', 10)`, same `Number.isInteger(n) && n > 0 ? Math.min(n, 600000) : 30000`,
same 'main' default). `execFileSync` is the raw `child_process` binding in both files — claim's
`GIT_MAX_BUFFER` wrapper was never applied to this function. Snapshot timing is unchanged in
practice: adaptive-schema is required at claim.js:19 and sink-pr.js:8, with no env mutation before
either module's own toggle line.

Functional parity, measured across all three probe stages and both offline modes, comparing the
baseline claim export, the candidate claim export, and the adaptive-schema definition:

```
OFFLINE=1 repo=no-origin      base=[main]   claim=[main]   schema=[main]   MATCH
OFFLINE=1 repo=master-default base=[master] claim=[master] schema=[master] MATCH
OFFLINE=1 repo=origin-no-HEAD base=[main]   claim=[main]   schema=[main]   MATCH
OFFLINE=0 repo=no-origin      base=[main]   claim=[main]   schema=[main]   MATCH
OFFLINE=0 repo=master-default base=[master] claim=[master] schema=[master] MATCH
OFFLINE=0 repo=origin-no-HEAD base=[master] claim=[master] schema=[master] MATCH
OFFLINE=1/0 repo=missing-path base=[main]   cand=[main]                    MATCH
```

The `origin-no-HEAD` / `OFFLINE=0` row is the one that matters: it exercises the stage-2
`git remote show origin` network fallback the `#397.3` comment describes, and it still resolves
`master`.

**Identity and module resolution.** All four re-exports are the same function object, and the
extension-less `require('./kaola-workflow-active-folders')` resolves to the same module as claim's:

```
defaultBranch === true | getCoordRoot === true | mainRootFromCoord === true
resolveMainRoot === true | readActiveFolders claim===af true | af===af2 (ext resolution) true
```

`const adaptiveSchema = require(...)` precedes the new destructure in `scripts/kaola-workflow-sink-merge.js`
(the require is the diff context line, the destructure the added line). The two lazy sites at
`:2167` and `:3071` now take `readActiveFolders` from active-folders and keep `removeWorktree` /
`worktreePathFor` on claim; the two untouched lazy claim requires carry no `readActiveFolders`.
sink-merge's `module.exports` is unchanged: `{ classifyMergeError, assertBranchHasNonWorkflowChanges }`.
`sink-pr.js` no longer loads claim — 6 repo modules in the require cache at baseline, 2 now — and
its CLI output and exit code are byte-identical to baseline for `--help`, no args, and `--branch foo`.

**The gitlab/gitea hand-ports still resolve `defaultBranch`.** They destructure it from their own
`kaola-{gitlab,gitea}-workflow-claim`, which still defines it at `:349` / `:350` and exports it at
`:6549` / `:6542`. Their `getRoot` is live (defined at `:307`, called at three sites) and intact —
only the dead `requiredArchiveFiles` wrapper was removed, which is the whole of their 4-line diff.
Their `mainRootFromCoord` is locally defined, not imported.

**Generator sharing (§3) is a faithful move.** The seven bodies in
`scripts/runtime-edition-forge.js:114-176` are byte-identical to the originals I extracted from
`5cb85515`. No circular require: `generate-agent-profiles.js` has zero relative dependencies, so it
cannot reach back; loading in either order works. Every wrapper preserves the exact original
fallback — `forgeLayout.listCanonCommands(forge || DEFAULT_FORGE)`,
`forgeLayout.canonCommandPath(basename, forge || DEFAULT_FORGE)`,
`forgeLayout.commandRel(treeLabel, name, forge)` — and the shared `canonCommandPath` takes an
already-resolved forge, so its thrown message is unchanged. I ran 18 edge cases per runtime (90
total: no-argument, `undefined`, empty-string, and explicit-forge calls; the missing-command throw;
CRLF frontmatter; `parseTools(null)` and quoted lists; `yamlScalar` on a colon value, `null`, and
`"TRUE"`) against baseline and candidate: **0 mismatches**, including error text.

**Subtraction and render parity, measured against the baseline modules rather than the fixture.**
I loaded the `5cb85515` tree side by side with the candidate and hashed every render:
5 runtimes × 3 forges × 14 roles, plus 5 × 3 × 3 commands × LF/CRLF.

```
TOTAL 300  DRIFTS 0  KEYSET DIFFS 0
```

No remaining consumer for any deleted symbol across `scripts plugins templates hooks install*.sh
uninstall*.sh docs commands agents` (excluding `kaola-workflow/archive` and tests):
`computeLandableBlobEntries`, `cursorModelPin`, `CURSOR_MODEL_CLASS_PINS`, `lowerSet`, and
`getRoot` return nothing; `requiredArchiveFiles` and `scopeIsFresh` return comments only (F5);
`ZERO_HASH` survives only in `scripts/generate-agent-profiles.js`, where it is live at six sites.

**Mirrors are exactly regeneration output.** `node scripts/validate-script-sync.js` exits 0
("14 common scripts, 25 byte-identical groups, ... 5 forge export-superset families in sync;
committed kernel parity: 4 Oracle Kernel copies identical at HEAD"), `node scripts/edition-sync.js --check`
exits 0, and the five canonical/mirror pairs I byte-compared are identical. `git status --short`
shows no untracked or modified plugin file.

**The migrated G0-fable pin is at least as strong as the source regex it replaced.** I armed it in a
sandbox copy of the baseline tree overlaid with the candidate's cursor files, so the repository was
never mutated:

```
mutant A (runtime-capabilities.json cursor intent_mapping.heavy: xhigh -> ultra) -> RED, 3 failures
   G0-fable: adapter tier heavy -> grok-4.6[effort=ultra]
   renderRuntimeRole(cursor,planner) missing "model: grok-4.6[effort=xhigh]" (has: ...[effort=ultra])
   renderRuntimeRole(cursor,code-architect) missing "model: grok-4.6[effort=xhigh]"
control (restored) -> GREEN
mutant B (behavior-contracts.json planner + code-architect intent_class: heavy -> standard) -> RED, 2 failures
   renderRuntimeRole(cursor,planner) -> model: grok-4.6[effort=medium]
   renderRuntimeRole(cursor,code-architect) -> model: grok-4.6[effort=medium]
```

Both of the reviewer's questions are answered yes: the pin fires if the cursor fable pin changes,
and it fires if `planner`/`code-architect` lose the heavy tier. The old assertion read a table that
`renderAgent` never consulted, so the migration is a strict strengthening. The only literal lost is
the key name `fable`, which no longer exists in production — cursor's `intent_mapping` carries
`standard`/`reasoning`/`heavy`, and the roster's `canonicalAgentClass(name).model !== 'fable'` loop
in the same suite still pins the canonical class name.

**The oracle does not silently skip a runtime.** `buildManifest()` calls each module's renderer with
no try/catch, and the five modules are required at load, so a throwing runtime aborts the process
loudly rather than shrinking the diff set. `EXPECTED_TOTAL === 300` and `current.length === 300` are
both asserted, and `EXPECTED_TOTAL` derives `FORGES.length` and `ROLES.length` from the live
registries, so a dropped forge or role reds the count. `captured_at_commit` is informational only;
the hashes are the binding, and `5cb85515` stays a resolvable ancestor after the merge.

**Scope.** Nothing in the diff exceeds the issue's authorisation. No external state is touched, no
generated mirror is deleted, there is no adapter rewrite, stop-on-red is intact (I saw the cursor
suite's D0 gate abort a mutated sandbox tree rather than self-repair it), TMPDIR initialisation is
untouched, and neither adaptive-schema nor codex-preflight was split. The 42-file candidate is
exactly the reviewed scripts and plugin mirrors, `package.json` (two registrations only, in the
position `test-issue-1054-*` occupies), and the `kaola-workflow/bundle-1055/` run documents.

**Suites I ran on the frozen candidate, exit codes echoed directly:**

| command | exit | note |
|---|---|---|
| `node scripts/test-issue-1055-render-subtraction-oracle.js` | 0 | 5 assertions, 300 comparisons |
| `node scripts/test-sink-merge.js` | 0 | 1063 assertions |
| `node scripts/test-claim-hardening.js` | 0 | 838 assertions |
| `node scripts/test-active-folders-field-parity.js` | 0 | 163 assertions |
| `node scripts/test-validation-runner.js` | 0 | |
| `node scripts/test-validate-script-sync.js` | 0 | 56 assertions |
| `node scripts/validate-script-sync.js` | 0 | |
| `node scripts/edition-sync.js --check` | 0 | 6 forge aggregator ports in parity |
| `node scripts/test-edition-sync.js` | 0 | 28 assertions |
| `node scripts/validate-workflow-contracts.js` | 0 | |
| `node scripts/test-suite-registration.js` | 0 | 64 files, 61 registered, 3 exempt, 732 assertions |
| `node scripts/test-spawn-classification.js` | 0 | 724 sites / 84 files, 320 classified |
| `node scripts/generate-agent-profiles.js --check` | 0 | |
| `node scripts/generate-routing-surfaces.js --check` | 0 | |
| `node scripts/test-generate-routing-surfaces.js` | 0 | |
| `node scripts/test-route-reachability.js` | 0 | |
| `node scripts/test-grok-edition.js` | 0 | 707 assertions, 3 trees in parity |
| `node scripts/test-kimi-edition.js` | 0 | 826 assertions, 3 trees in parity |
| `node scripts/test-cursor-edition.js` | 0 | 840 assertions, 3 trees in parity |
| `node scripts/test-opencode-edition.js` | 0 | 877 assertions, 3 trees in parity |
| `node scripts/test-zcode-edition.js` | 0 | 3 trees in parity |
| `node -c` on all 12 changed production files | 0 | |

Each edition suite's drift check reported `tree root: /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow,
not this checkout` — the trees are the main checkout's gitignored per-machine state, so those rows
are machine evidence, not candidate evidence.

---

## What I did not check

- `npm test`, `npm run test:kaola-workflow:claude(:full)`, the codex/gitlab/gitea forge chains, and
  any candidate-bound `run-chains` receipt. Forbidden by the review brief; the validation mission
  owns them.
- `node scripts/simulate-workflow-walkthrough.js` in either full or sharded form, and the three
  plugin walkthroughs — including
  `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` test (c), which is the
  only remaining exercise of the `scopeIsFresh` deletion site. I read its code and confirmed it
  drives the CLI as a subprocess, but I did not execute it.
- `./install-all.sh --check` and every installed home under `~/.claude`, `~/.codex`, `~/.opencode`,
  `~/.kimi`, `~/.grok`, `~/.cursor`, `~/.zcode`. No install boundary appears to move
  (`runtime-edition-forge.js` is referenced only by the five `install-<runtime>.sh` scripts running
  it from the repo checkout, and is absent from the install manifest), but that is inference from
  the manifest, not a measured install.
- `scripts/fixtures/issue-1055-render-baseline.json` record-by-record. Excluded from my scope; I
  checked its header (`schema 1`, `captured_at_commit 5cb8551533…`, `total_comparisons 300`,
  5 runtimes / 3 forges / 14 roles / 3 commands), confirmed its sha256 matches the value
  `acceptance.md` reports (`bced34ce7a549e87062ae6679d209c94a88bf2389b93d7bbe6097d44d23a57ad`), and
  independently reproduced all 300 renders from the baseline modules, which is a stronger check than
  reading the fixture.
- `kaola-workflow/bundle-1055/*` as deliverables. Read as intent, not reviewed as output.
- Documentation. The frozen candidate carries no `README.md`, `docs/api.md`, `docs/architecture.md`,
  or `CHANGELOG.md` change. Uncommitted work on all four exists in the worktree from the in-flight
  doc mission; I read it for context but did not review it, and it is not part of `8791ab55`.
- A real network remote. My `defaultBranch` parity matrix used a local bare remote for the stage-2
  and stage-3 probes; no `git ls-remote` against a hosted forge was executed.
- Concurrency, permissions, and failure-injection paths in sink-merge beyond what
  `test-sink-merge.js` covers.

# #952 subtraction audit — the `scripts/` half

**Status: COMPLETE.** Findings are appended as they are measured, not composed at the end.

- Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-952-953-954-955`
- Commit: `483a5e5e0071207bf93fae5f1f22f39c2a4e7e9c` (branch `workflow/bundle-952-953-954-955`)
- Node: v24.14.0 · Date: 2026-08-11
- Scope: the 81 canonical `.js` files in `scripts/` (87,492 lines total). Ported copies under
  `plugins/*/scripts/` are not separately audited; each finding states its multiplier.
- Ranking: **canonical lines**, multiplier stated separately.
- **Line numbers.** Every `scripts/*.js` line number below is at commit `483a5e5e`; each of
  those files was confirmed clean in the worktree at measurement time. `CHANGELOG.md` line
  numbers are also given **at `483a5e5e`** — the working tree carries an unrelated concurrent
  edit that shifts them by +49, so a reader on a dirty tree should search the quoted text
  rather than the number.

---

## Method — and one trap that invalidated my first sweep

**Trap 1: the extension.** My first reference sweep searched each file's full basename
(`run-chain-pool.js`) and reported `0 referencing files`. That was wrong — the real consumer is
`require('./run-chain-pool')`, with no extension. Every sweep below searches the **stem**.
A basename-anchored search is not a zero-consumer search.

**Trap 2: the untracked edition trees.** Six rendered edition trees exist in the working tree and
are **gitignored**, so `git grep` cannot see them, and the local `grep` is ugrep which skips
dot-directories:

```
$ git ls-files | grep -o '^\.[^/]*' | sort -u
.agents
.env.example
.gitignore
$ for d in .opencode .opencode-gitea .opencode-gitlab .kimi .kimi-gitea .kimi-gitlab; do
    printf "%s: %s files\n" "$d" "$(find $d -type f | wc -l)"; done
.opencode: 19 files
.opencode-gitea: 19 files
.opencode-gitlab: 19 files
.kimi: 19 files
.kimi-gitea: 19 files
.kimi-gitlab: 19 files
```

Every `delete:` finding below therefore runs a two-part search — `git grep -n -P` over the tracked
tree (excluding `kaola-workflow/archive`) **plus** an explicit `find | xargs grep` over all six
untracked dot-edition trees. The helper is reproduced here so any figure below can be re-derived:

```bash
# zc.sh <pattern> [exclude-path]
git grep -n -P "$PAT" -- . ':!kaola-workflow/archive' ":!$EXCL"
for d in .opencode .opencode-gitea .opencode-gitlab .kimi .kimi-gitea .kimi-gitlab; do
  find "$d" -type f -print0 | xargs -0 grep -n -P "$PAT" /dev/null
done
```

**Ported set (for multipliers).** `plugins/kaola-workflow/scripts/` (26), `-gitlab/scripts/` (30),
`-gitea/scripts/` (30). A canonical file is ×1 unless its basename (or its forge-renamed form)
appears there.

---

## Findings

### F1 — `yagni:` the within-chain step pool has no chain, no CLI and no installer caller; its only consumer is the test that exists to test it

**Claim.** `scripts/run-chain-pool.js` (428 lines) is test infrastructure that nothing schedules. No
npm script runs it, no chain step invokes it, no installer ships it. Its sole consumer in the entire
tree is `scripts/test-parallel.js:349`, whose `(f)` block exists to assert the pool's properties.
Additionally its shard-expansion half is **provably inert**: the registry it dispatches on is empty.

**Measurement — zero-consumer search (both halves):**

```
$ zc.sh 'run-chain-pool' 'scripts/run-chain-pool.js'
### TRACKED (git grep -P, excl kaola-workflow/archive and scripts/run-chain-pool.js)
scripts/test-parallel.js:349:  const pool = require('./run-chain-pool');
TRACKED_EXIT=0
### UNTRACKED DOT-EDITIONS (.opencode* .kimi*)
### done
OVERALL=0
```

One hit, and it is the test. (`kaola-workflow/archive/**` holds two further mentions — a coverage
note and a finalization summary — both excluded by scope.)

**Measurement — not in any chain.** `package.json` joins chain steps with `&&`; the string
`run-chain-pool` does not appear in it. The search above is over the whole tracked tree, so
`package.json`, `install*.sh`, `hooks/`, `commands/`, `agents/`, `templates/` and `docs/` are all
covered by the single `TRACKED` leg and all return nothing.

**Measurement — the shard registry is empty:**

```
$ grep -n 'const SHARDED_SUITES' scripts/run-chain-pool.js
68:const SHARDED_SUITES = {};
```

`planUnits` (line 175) reads `SHARDED_SUITES[command]`; with `{}` every command resolves `width = 1`
and takes the `else` branch. The expansion path cannot execute against production data. The file's
own test acknowledges this — `test-parallel.js` line ~406:

> `// The registry is EMPTY in the shipped tree — the two suites that were once registered are`
> `// deleted, and the walkthrough is deliberately excluded. So register a synthetic suite here`

so `(f6)`/`(f7)` mutate `pool.SHARDED_SUITES` themselves to have anything to assert against.

**Lines.** 428 canonical. **Multiplier ×1** — `run-chain-pool.js` appears in no `plugins/*/scripts/`
directory. Ranked at 428.

**What breaks if cut.** The `(f6)`–`(f9)` assertions of `scripts/test-parallel.js` — lines 415–465,
every `pool.*` reference (`planUnits`, `resolveConcurrency`, `parseArgs`, `SHARDED_SUITES`) sits in
that span. Per test custody this test dies **with** its mechanism and is not repaired ahead of it.
`test-parallel.js` itself survives: its `(a)`–`(e)` chain-runner assertions and its `(f1)`–`(f5)`
`test-shard-lib` assertions do not touch the pool.

**What does NOT break.** `scripts/test-shard-lib.js` (217 lines) must stay — it has an independent
production consumer at `scripts/simulate-workflow-walkthrough.js:12712`, which is what implements
the fast gate's `--shard auto/12`:

```
$ git grep -n -F "test-shard-lib" -- . ':!kaola-workflow/archive' ':!scripts/test-shard-lib.js'
scripts/run-chain-pool.js:31:      (comment)
scripts/run-chain-pool.js:58:const shardLib = require('./test-shard-lib');
scripts/simulate-workflow-walkthrough.js:12712:  const shardLib = require('./test-shard-lib');
scripts/test-parallel.js:348:  const shardLib = require('./test-shard-lib');
scripts/test-spawn-classification.js:95:  'scripts/test-shard-lib.js': 1,
scripts/test-suite-registration.js:38:  'test-shard-lib.js':
```

**Inference (labelled).** The pool was built to make the chains faster by scheduling `&&`-joined
steps in a bounded pool; the chains were never switched over to it, and the sharding registry was
emptied when its two registered suites went. Confidence: high for "not wired in" (that is the
measurement); moderate for the history. Refuted by: any caller outside the tracked tree and the six
dot-edition trees — e.g. a developer's shell alias — which this search cannot see.

---

### F2 — `yagni:` three generation-time strip transforms in the two edition sync scripts match nothing; removing all three renders byte-identical output

**Claim.** `transformCommandBody` in `scripts/sync-opencode-edition.js` and
`scripts/sync-kimi-edition.js` each carries **three** transforms whose predicates match zero lines of
their actual input corpus. They are residue of the retired `Path Intent` / `KAOLA_ENABLE_ADAPTIVE`
path-selection era (#538/#539/#540) and of a Codex install note that no longer exists in canonical.
This finding **subsumes and independently confirms** the pre-seeded Codex-note finding, and adds two
more transforms alongside it that the pre-seeded finding did not name.

The three, per file:

| # | transform | opencode | kimi |
|---|---|---|---|
| 1 | Path Intent section strip — `/^##\s.*\bPath Intent\b/` | L458–482 (25 ln) | L452–465 (14 ln) |
| 2 | Codex-note strip — `/^>\s*\*\*Codex hooks note:/` | L484–501 (18 ln) | L466–478 (13 ln) |
| 3 | inline residue strip — `text.replace(/ \(Step 0a-1\)\| or Step 0a-1/g, '')` | L525–535 (11 ln) | L517–522 (6 ln) |
| | **total** | **54 ln** | **33 ln** |

#### Measurement A — the predicates never fire, with live predicates as the positive control

`transformCommandBody` is called only from `renderCommand` (opencode `:561`, kimi `:549`), whose
input is exactly `forgeLayout.commandSources(forge)` for each of the three forges. Running every
predicate over that exact corpus:

```
$ node -e '<load sync-opencode-edition.js, sweep each predicate over commandSources()>'
OPENCODE corpus: files=9 lines=3271
DEAD     0  LINE  Path Intent section strip   /^##\s.*\bPath Intent\b/
DEAD     0  LINE  Codex hooks note strip      /^>\s*\*\*Codex hooks note:/
live     3  LINE  Model Dispatch heading      MODEL_DISPATCH_HEADING
live     9  TEXT  Agent( -> task(             /^Agent\(\n(\s+subagent_type=)/gm
DEAD     0  TEXT  inline Step 0a-1 residue    / \(Step 0a-1\)| or Step 0a-1/g
live     3  TEXT  --runtime claude            /--runtime claude\b/g

KIMI corpus: files=9 lines=3271
DEAD     0  LINE  Path Intent section strip   /^##\s.*\bPath Intent\b/
DEAD     0  LINE  Codex hooks note strip      /^>\s*\*\*Codex hooks note:/
live     3  LINE  MODEL_DISPATCH_HEADING
DEAD     0  TEXT  inline Step 0a-1 residue    / \(Step 0a-1\)| or Step 0a-1/g
live     3  TEXT  --runtime claude            /--runtime claude\b/g
```

The three `live` rows are the positive control: the same harness, over the same corpus, reports
non-zero for every transform that does fire. A separate literal control confirms the dead predicate
is well-formed rather than broken — `/^>\s*\*\*Codex hooks note:/.test("> **Codex hooks note:** run
install-codex-agent-profiles.js")` → `true`.

#### Measurement B — zero-consumer search for the marker strings

```
$ zc.sh 'Codex hooks note'
### TRACKED (git grep -n -P, excl kaola-workflow/archive)
scripts/sync-kimi-edition.js:467:    // "> **Codex hooks note:** …" blockquote is Codex-specific …
scripts/sync-kimi-edition.js:470:    if (/^>\s*\*\*Codex hooks note:/.test(line)) {
scripts/sync-opencode-edition.js:485:    // "> **Codex hooks note:** …" blockquote is Codex-specific …
scripts/sync-opencode-edition.js:489:    // Detect the blockquote opener by its stable "**Codex hooks note:**" marker …
scripts/sync-opencode-edition.js:494:    if (/^>\s*\*\*Codex hooks note:/.test(line)) {
TRACKED_EXIT=0  (0=hits 1=no-hits >1=ERROR)
### UNTRACKED DOT-EDITIONS
### done
```

Every surviving occurrence is inside the two strips themselves. Nothing in `commands/`,
`templates/routing/`, `plugins/`, `agents/`, `hooks/`, `docs/` or any of the six rendered
dot-edition trees carries the marker. `Path Intent` / `Step 0a-1` survive only in the two sync
scripts, in `docs/` prose describing the strips, and in `CHANGELOG.md`/`docs/decisions/` history —
never in a command source.

#### Measurement C — the shorter form actually running, byte-identical output

The three blocks were removed **in memory** (`Module.prototype._compile` under the file's real path,
so relative `require`s resolve; no file on disk was touched) and every command re-rendered:

```
opencode: removed 876 bytes of CODE (comments left in place)
OPENCODE renderCommand: identical=9  different=0

kimi: removed 626 bytes of CODE (comments left in place)
KIMI 3 dead transforms removed: identical=9 different=0
```

**Negative control — the comparison is not vacuous.** Removing a *live* transform from the same
harness does change the output:

```
--- NEGATIVE CONTROL: cut a LIVE transform (--runtime claude -> opencode) ---
live-transform removed: identical=6 different=3
--- NEGATIVE CONTROL 2: cut the LIVE Agent( -> task( rewrite ---
Agent(->task( removed: identical=6 different=3
--- kimi NEGATIVE CONTROL: remove the LIVE --runtime claude rewrite ---
kimi live-transform removed: identical=6 different=3
```

#### Baseline

Both suites are green at this commit before any of the above, so "no change" is measured against a
known-good state:

```
$ node scripts/test-opencode-edition.js ; echo $?
opencode-edition test passed (563 assertions). [drift-check: 3 tree(s) in parity]
0
$ node scripts/test-kimi-edition.js ; echo $?
kimi-edition test passed (521 assertions). [drift-check: 3 tree(s) in parity]
0
```

**Lines.** 54 (opencode) + 33 (kimi) = **87 canonical lines**. **Multiplier ×1** — neither sync
script appears in any `plugins/*/scripts/` directory (they are additive runtime editions, not
forges). Ranked at 87.

**What breaks if cut.** Nothing that is measured. No test feeds synthetic input through these
predicates, so no test dies with the mechanism. `test-opencode-edition.js` A22 asserts the *absence*
of `## Startup Step 0a-1 — Path Intent`, `KAOLA_ENABLE_ADAPTIVE`, `### Branch A/B` and `Step 0a-1`
in the generated `workflow-next.md`; since canonical no longer contains any of them, those
assertions stay green with the strips gone (measurement C confirms the generated bytes do not
change). **A22 is therefore not a test of the strip** — it is a test of the invariant, and it keeps
working as the fail-loud net if canonical ever reintroduces the section. That is the argument for
cutting the strip and *keeping* A22, not for cutting both.

**Adjunct (not a separate finding).** `sync-opencode-edition.js:516–524` is a 9-line comment
recording that a *fourth* transform of this same class (`/downgrade to full path /`) was found dead
and removed — the precedent is in `CHANGELOG.md:2646`, "**F6 (low): a dead `transformCommandBody`
strip** … matched nothing after #538 rewrote canonical … removed." So this exact finding class has
already been accepted and acted on once in this repo; three more instances of it survived that pass.

**Inference (labelled).** #538 removed the Path Intent switch from canonical, and #539/#540 built
generator-side strips to keep the opencode surface clean *while #538 was in flight*. The strips
outlived their input: once canonical itself went adaptive-only there was nothing left to strip. The
kimi copies were mirrored from opencode after the input had already gone, so they were **born
dead**. Confidence: high for the deadness (measured three independent ways); moderate for the
history. Refuted by: any future canonical change that reintroduces a `## … Path Intent` heading —
at which point the strip would matter again, and A22 would go red without it.

---

### F3 — `delete:` a shared anti-drift fixture whose two importers were both deleted

**Claim.** `scripts/fixtures-orphan-legality.js` (102 lines) exists solely to be imported by two test
files, so that the two could not diverge on a shared input. Both importers are gone. The fixture has
zero consumers.

**Measurement — the named importers do not exist.** The file's own header states its purpose:

```
// fixtures-orphan-legality.js — shared fixture for the #293 "align" node.
// ...
// Importing this fixture in BOTH test files is the anti-drift mechanism
// required by #293: a single definition prevents the two assertions from
// diverging on what the "same input" actually is.
```

`CHANGELOG.md:3203` names them: *"it is imported by **both** `test-parallel-batch.js` … and
`test-adaptive-node.js`"*.

```
$ for f in test-parallel-batch.js test-adaptive-node.js plan-validator.js measure-site-execution.js; do
    printf "scripts/%s: " "$f"; [ -f "scripts/$f" ] && echo PRESENT || echo ABSENT; done
scripts/test-parallel-batch.js: ABSENT
scripts/test-adaptive-node.js: ABSENT
scripts/plan-validator.js: ABSENT
scripts/measure-site-execution.js: ABSENT
```

**Measurement — per-symbol zero-consumer search.** Every exported symbol, over the tracked tree
(excluding archive and the file itself) and all six untracked dot-edition trees:

```
ORPHAN_LEGALITY_MANIFEST                 tracked-hits=0
ORPHAN_LEGALITY_IN_PROGRESS_IDS          tracked-hits=1
CROSS_CHECK_EXPECTED                     tracked-hits=0
RUN_ORIENT_EXPECTED                      tracked-hits=0
TOPUP_INCOMPLETE_MANIFEST                tracked-hits=0
TOPUP_INCOMPLETE_REASON                  tracked-hits=0
untracked dot-editions, 'ORPHAN_LEGALITY': (none)
```

The single hit is not a consumer:

```
$ git grep -n -F "ORPHAN_LEGALITY_IN_PROGRESS_IDS" -- . ':!kaola-workflow/archive' ':!scripts/fixtures-orphan-legality.js'
CHANGELOG.md:3143:- **test: bind the orphan-legality `in_progress` axis on the orient site (#302 …
```

**Measurement — the mechanisms it was a fixture *for* are also gone.** `crossCheckStatus` and
`runOrient` survive only in `docs/decisions/`, `docs/investigations/` and one comment at
`scripts/simulate-workflow-walkthrough.js:13481`; no implementation remains.

**Lines.** 102 canonical. **Multiplier ×1** — not present in any `plugins/*/scripts/`. Ranked at 102.

**What breaks if cut.** Nothing. It is not a chain step, not required by any of the other 80
scripts, not in `SUPPORT_SCRIPTS`, and not installed — `kaola-workflow-install-manifest.js:55` lists
it under intentional exclusions. **Test custody note:** this is *not* a finding proposing to delete a
test on its own merits — it is a fixture module with no test importing it, and the mechanism it
served (`crossCheckStatus`/`runOrient` orphan legality) was itself removed. The test died first; the
fixture is what was left behind.

**Adjunct.** The exclusion comment that names it is stale in two byte-paired files —
`scripts/kaola-workflow-install-manifest.js:55` and
`plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js:55` both read
`kaola-workflow-fixtures-orphan-legality.js — CI-only fixture validator`, describing it as a
*validator* when it is a data module. 1 line, ×2.

---

### N1 — NEGATIVE RESULT: `measure-validator-duplication.js` is healthy; my hypothesis was wrong

I expected this 236-line diagnostic to have lost its subject, the way its retired sibling
`measure-site-execution.js` did (`CHANGELOG.md:1787` — *"the instrument had not run since the
demolition, and nothing reported that"*), because `scripts/plan-validator.js` is ABSENT. **That
inference was wrong**: the "validator" in its name is the **contract** validator, not the retired
plan-validator. It runs:

```
$ node scripts/measure-validator-duplication.js ; echo $?
--- scripts/validate-kaola-workflow-contracts.js
    distinct assertions : 254
    DUP                 : 2
    KEEP                : 252
    sums                : OK
        2  nx-claim-is-bookkeeping
--- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
    distinct assertions : 93 · DUP: 0 · KEEP: 93 · sums: OK
--- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
    distinct assertions : 91 · DUP: 0 · KEEP: 91 · sums: OK
0
```

Exit 0, completeness gate satisfied on every file. **Not a finding.** Being wired into no chain is
deliberate and documented in its own header ("DIAGNOSTIC ONLY … Run it by hand before deleting
validator assertions as duplicated") — a hand-run instrument is not dead code.

**One lead it produced, which I did not pursue to a verdict** (recorded so it is not lost, and
explicitly *not* filed as a finding, because it lacks its measurement): the tool reports **2
duplicated assertions** on the token `nx-claim-is-bookkeeping` in
`scripts/validate-kaola-workflow-contracts.js`. The tool's own closing instruction is that a DUP is
a candidate only, and must be proven in the subtraction direction — remove the assertion, remove the
token from the surface it names, and confirm `test-route-reachability.js` goes **RED**; green there
means coverage was lost, not duplicated. That proof was not run, so no finding is filed.

---

### F4 — `yagni:` two of `runtime-edition-forge.js`'s four CLI modes have no caller anywhere

**Claim.** `scripts/runtime-edition-forge.js` exposes a four-mode CLI
(`main(process.argv.slice(2))`, `:154`) that exists to serve the two shell installers. Two of the
four modes — `--commands-dir` and `--forges` — are called by nothing.

**Measurement — all four modes work, so this is disuse and not breakage:**

```
$ for m in --commands-dir --forges --scripts-dir --out-suffix; do
    node scripts/runtime-edition-forge.js --forge=github $m; echo "exit=$?"; done
--commands-dir   -> exit=0  out=<repo>/commands
--forges         -> exit=0  out=github gitlab gitea
--scripts-dir    -> exit=0  out=<repo>/scripts
--out-suffix     -> exit=0  out=(empty for github)
```

**Measurement — consumer search, all four, with the two live modes as the positive control:**

```
### --commands-dir consumers (excl self, archive, CHANGELOG)
   (none)
### --scripts-dir consumers
install-kimi.sh:117:if ! FORGE_SCRIPTS_DIR="$(node "$FORGE_HELPER" --forge="$FORGE" --scripts-dir)"; then
install-opencode.sh:147:if ! FORGE_SCRIPTS_DIR="$(node "$FORGE_HELPER" --forge="$FORGE" --scripts-dir)"; then
### --out-suffix consumers
install-kimi.sh:113:if ! FORGE_SUFFIX="$(node "$FORGE_HELPER" --forge="$FORGE" --out-suffix)"; then
install-opencode.sh:143:if ! FORGE_SUFFIX="$(node "$FORGE_HELPER" --forge="$FORGE" --out-suffix)"; then
### --forges consumers
   (none)
### untracked dot-editions, '--commands-dir': (none)
```

The two live modes are found by the identical search, in both installers — so a zero for the other
two is disuse, not a search that cannot see shell callers.

**Lines.** `--commands-dir`: dispatch `:117` + body `:141–151` = 12. `--forges`: dispatch `:120` +
emit `:138` = 2. Total **14 canonical lines**, plus a two-line usage string at `:128–129` that
shrinks rather than disappears. **Multiplier ×1** — `runtime-edition-forge.js` is in no
`plugins/*/scripts/` directory. Ranked at 14.

**What breaks if cut.** Nothing measured. No test invokes either mode (they appear in no
`scripts/test-*.js`), and neither installer references them. `commandSources()` and `FORGES` — the
library exports behind the two modes — stay, because the sync scripts import them directly.

**Counter-consideration, stated rather than buried.** The `--commands-dir` body is not just a getter:
`:144–150` asserts that a forge's command surfaces all live in one directory and exits 2 with a named
message if a future split layout ever breaks that. Cutting the mode cuts that assertion. It is
nonetheless a guard on a path nobody invokes — an unreachable guard guards nothing — and the same
invariant is exercised, indirectly, every time the sync scripts iterate `commandSources()`.

---

### F5 — rot, not subtraction: 8 comment lines describe a receipt consumer that no longer exists

Filed for completeness and **ranked last deliberately**: its net deletable line count is ~0, because
the stale reference is a clause inside a line, not a line. Its value is the rot, not the bytes.

**Claim.** `scripts/plan-validator.js` does not exist anywhere in the repository, yet eight comment
lines in two live production scripts describe it as the reader of the chain receipt.

**Measurement — the file is gone:**

```
$ find . -name 'plan-validator*' -not -path '*/.git/*'
(empty)
```

**Measurement — the eight stale lines:**

```
run-chains:42|   // RECEIPT PATH (#546): plan-validator --finalize-check reads the chain receipt from
run-chains:125|  // by `plan-validator --finalize-check` (consumer mode). The v6.2.0 `kaola-workflow/chains.json`
run-chains:867|  // #44), enforced by `plan-validator --finalize-check` in consumer mode. resolveChains therefore
run-chains:1091| // plan-validator --finalize-check in consumer mode. So the only refusal is chains_config_missing
run-chains:1231| // reader (the plan-validator finalize gate, an operator) can distinguish a timeout kill from a
run-chains:1233| // decomposition. Readers index by name/exitCode/accepted_red (plan-validator --finalize-check,
claim:2587|      // plan-validator.js use to anchor `refs/kaola-workflow/barrier/<tag>/<node>`
claim:5786|      // dirent (projTag is recorded EXACTLY as given, plan-validator.js — never case-normalized), so an
```

**Lines.** 8 canonical lines touched, **0 net deleted**. **Multiplier ×4** — both files are ported,
and every port carries the identical count:

```
scripts/kaola-workflow-run-chains.js:6                                    scripts/kaola-workflow-claim.js:2
plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js:6             plugins/kaola-workflow/scripts/kaola-workflow-claim.js:2
plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js:6   …-gitlab-workflow-claim.js:2
plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js:6     …-gitea-workflow-claim.js:2
```

**What must NOT be cut with it.** Three *other* `plan-validator` references are live tombstone
guards and must stay:

- `scripts/validate-workflow-contracts.js:561` — `plan-validator` sits in a forbidden-token list.
- `scripts/test-finalize-door.js` T1 (`:446–460`) — actively asserts that neither `claim.js` nor
  `run-chains.js` requires `kaola-workflow-plan-validator.js`.
- `scripts/test-run-chains.js:727` — a comment inside a live assertion.

A sweep that deleted every `plan-validator` mention would remove the guards that keep it retired.

---

### F6 — `yagni:` two self-declared "legacy alias" exports and one dead constant, all with zero consumers

**Claim.** A dead-export sweep over all 81 canonical scripts found most "unused" exports are in fact
used internally (exported for testability). Exactly three symbols survive as genuinely dead: two
legacy aliases that the source itself labels as such, and one constant that is defined, exported,
and never read.

**Measurement — the sweep.** For every `module.exports = { … }` block in `scripts/*.js`, each
exported name was searched across the tracked tree (excluding `kaola-workflow/archive` and
`CHANGELOG.md`) and all six untracked dot-edition trees, then cross-checked against its own file's
internal reference count:

| file | export | external refs | internal refs |
|---|---|---|---|
| `sync-opencode-edition.js` | `DEFAULT_STANDARD_MODEL` | 0 | **1** (the export line itself) |
| `sync-opencode-edition.js` | `DEFAULT_REASONING_MODEL` | 0 | **1** (the export line itself) |
| `sync-kimi-edition.js` | `OUT_SKILLS_DIR` | 0 | **2** (definition + export line) |
| `sync-opencode-edition.js` | `OPENCODE_MODEL_DISPATCH_GUIDANCE` | 0 | 4 — **live internally, not filed** |
| `sync-opencode-edition.js` | `PERMISSION_AXES`, `ENV_STANDARD_MODEL`, `opencodeKaolaScript` | 0 | 3–4 — **live internally, not filed** |
| `sync-kimi-edition.js` | `expectedHookFiles`, `CANONICAL_RESTRICTIONS` | 0 | 3 — **live internally, not filed** |
| `generate-reviewer-profiles.js` | `OUTPUT_SPECS`, `behaviorContractHash`, `renderBehaviorCore`, `writeProfiles` | 0 | 3–4 — **live internally, not filed** |
| `runtime-edition-forge.js` | `UNKNOWN_FORGE`, `pluginDirName` | 0 | 4 — **live internally, not filed** |
| `kaola-workflow-prose-census.js` | 13 exports | 0 | 3–5 each — **live internally, not filed** |

The three filed rows, in context:

```
$ awk 'NR>=1006 && NR<=1012' scripts/sync-opencode-edition.js
1006|   PERMISSION_AXES, deniedPermissionAxes,
1007|   listCanonAgents, listCanonCommands,
1008|   ENV_STANDARD_MODEL, ENV_REASONING_MODEL,
1009|   // Legacy aliases (env-derived; empty by default now that pins are opt-in).
1010|   DEFAULT_STANDARD_MODEL: ENV_STANDARD_MODEL,
1011|   DEFAULT_REASONING_MODEL: ENV_REASONING_MODEL,
1012|   CANON_AGENTS_DIR, CANON_HOOKS_DIR, CANON_PLUGINS_DIR,

$ grep -n -F "OUT_SKILLS_DIR" scripts/sync-kimi-edition.js
61:const OUT_SKILLS_DIR = path.join(REPO, treeLabel(DEFAULT_FORGE), 'skills');
868:  OUT_SKILLS_DIR, OUT_HOOKS_DIR, REPO,
```

`ENV_STANDARD_MODEL` / `ENV_REASONING_MODEL` (line 1008) are the live originals — they are read at
`:589–590`. The aliases on 1010–1011 add nothing but a second name for them, and nothing uses either
name.

**Lines.** `sync-opencode-edition.js:1009–1011` = 3 whole lines. `sync-kimi-edition.js:61` = 1 whole
line, plus one token removed from the shared export line `:868`. Total **4 canonical lines**.
**Multiplier ×1** (neither sync script is ported). Ranked at 4.

**What breaks if cut.** Nothing measured — no test, no script, no installer, no rendered edition tree
mentions any of the three names. The 25 other zero-external-reference exports in the table are
**deliberately not filed**: an export used internally and kept for testability is not dead, and
removing it from the export list would be a rewrite of the module's surface, which this audit does
not do.

---

## Classes that came up EMPTY — stated plainly, not padded

### `native:` / `stdlib:` — EMPTY, and the measurement says why

**No Node floor is declared anywhere**, which alone blocks the class:

```
$ git grep -n -P '"engines"|node_version|NODE_VERSION|Node (>=|\d+\.)' -- package.json README.md install.sh docs/
(no output)
```

`package.json` has no `engines` field. A `native:` finding that depends on an API's availability
cannot be shown safe against an undeclared floor — and the repo has demonstrably supported older
runtimes (`test-opencode-edition.js` carries a Node <22.12 ESM workaround).

The one substantial candidate was measured anyway and **fails the identical-output bar**:

`scripts/kaola-workflow-claim.js:5940–5948` hand-rolls a 9-line recursive `copyDir` that
`fs.cpSync(src, dest, { recursive: true })` appears to replace. A/B on a fixture with nested
directories, an executable-mode file, an empty directory and a symlink:

```
=== fixture no symlink ===
IDENTICAL  (9 entries)
=== fixture WITH symlink ===
DIFFERENT
  copyDir: FILE a/link.md mode=644 sha=2c8b08da5ce6
  cpSync : LINK a/link.md -> /private/var/.../src/a/one.md
```

`copyDir` **dereferences** a symlink into a regular file; `cpSync` preserves it as a symlink and
rewrites it to an absolute path. Nor does any option close the gap — on Node v24.14.0:

```
default   link.md isSymlink=true  -> /private/var/.../s/real.md
deref     link.md isSymlink=true  -> /private/var/.../s/real.md      # {dereference:true}
verbatim  link.md isSymlink=true  -> ./real.md                       # {verbatimSymlinks:true}
```

`{dereference: true}` does **not** produce a regular file. So the replacement is not equivalent, the
brief's "show it produces identical output" cannot be satisfied, and **no finding is filed**. This
would have been an attractive, plausible, wrong finding — 9 lines ×4 ported = 36 shipped — had it
been asserted instead of run.

The only other candidate, `ensureDir(d) { fs.mkdirSync(d, {recursive:true}); }` (3 lines, in both
sync scripts, 5 and 4 call sites), is a naming wrapper, not machinery; removing it edits every call
site, which is a rewrite, not a subtraction. Not filed.

### Retired-era vocabulary residue — EMPTY apart from F5

The brief names five retired eras. Swept over `scripts/*.js`:

| era | hits | verdict |
|---|---|---|
| `issue-scout` | `test-install-upgrade-rewrite.js` 14, `test-opencode-edition.js` 17, `test-kimi-edition.js` 5, `validate-kaola-workflow-contracts.js` 2 | **live** — synthetic retired-agent fixtures proving the installer *removes* retired agents (`:157–208`), plus negative assertions. Not residue. |
| `contractor` | `validate-workflow-contracts.js` 6, `test-claim-hardening.js` 16, others | **live tombstone guards** — `:736` asserts `agents/contractor.md` must not exist; `:738` the same per forge. |
| `--profile` | 2 test files, 2 hits each | **live** — assertions that the retired flag is not honoured. |
| consent valve | 4 files | **live** — outcome-recorder vocabulary, not the retired valve. |
| model badge (#949) | `validate-workflow-contracts.js` 1 | **live tombstone**. |
| DAG / `node-id` | 7 files | **live** — comments in assertions plus `generate-reviewer-profiles.js` usage. |

Neither `agents/contractor.md` nor `agents/issue-scout.md` exists (`ls agents/` = 14 roles, neither
present) — the guards are doing their job. The class yields nothing *except* the deleted
`plan-validator.js` (F5), which has no tombstone in the two files that still describe it.

### Duplication — struck by the brief, and not re-litigated

Per `audit-952-brief.md`, duplication is not a finding class. No finding above is a duplication
finding.

### Diagnostic scripts wired into no chain — EMPTY

Nine of the 81 are neither a chain step nor `require`d by another canonical script. All nine resolve:

| script | lines | reached by |
|---|---|---|
| `kaola-workflow-sink-merge.js` | 3,278 | commands + orchestrator prose (43 refs) |
| `kaola-workflow-prose-census.js` | 773 | hand-run; baseline recaptured at v9.6.0 |
| `kaola-workflow-gap-sweep.js` | 551 | commands (21 refs) |
| `kaola-workflow-release.js` | 341 | release tooling (16 refs) |
| `kaola-workflow-telemetry-report.js` | 314 | `docs/api.md:1448`, `SUPPORT_SCRIPTS`, ported ×3 |
| `kaola-workflow-sink-pr.js` | 285 | commands (18 refs) |
| `measure-validator-duplication.js` | 236 | hand-run diagnostic — **verified running, exit 0** (N1) |
| `kaola-workflow-compact-context.js` | 112 | `hooks/hooks.json:10` SessionStart hook |
| `fixtures-orphan-legality.js` | 102 | **nothing — this is F3** |

"Wired into no chain" is not evidence of death in this repo: two of these are deliberately hand-run
instruments that say so in their own headers.

### Dead flags — one finding (F4), the rest live

227 parsed `--flags` across 29 production scripts were enumerated and searched. Five had zero
external consumers; three of those (`--compare`, `--fail-on-regression`, `--write-baseline` on
`kaola-workflow-prose-census.js`) are the hand-run interface of a hand-run tool and are excluded
on the same grounds as N1. The remaining two are F4.

---

## Findings in rank order (canonical lines)

| rank | id | class | finding | canonical lines | multiplier | shipped |
|---:|---|---|---|---:|---|---:|
| 1 | F1 | `yagni:` | `run-chain-pool.js` — within-chain step pool with no chain, CLI or installer caller; empty shard registry | **428** | ×1 | 428 |
| 2 | F3 | `delete:` | `fixtures-orphan-legality.js` — shared fixture, both importers deleted, 8/8 exports unreferenced | **102** | ×1 | 102 |
| 3 | F2 | `yagni:` | three dead `transformCommandBody` strips × two sync scripts (Path Intent, Codex-note, `Step 0a-1`) | **87** | ×1 | 87 |
| 4 | F4 | `yagni:` | `runtime-edition-forge.js` `--commands-dir` and `--forges` CLI modes, no caller | **14** | ×1 | 14 |
| 5 | F5 | rot | 8 comment lines naming the deleted `plan-validator.js` (0 net deletable) | **8** | ×4 | 32 |
| 6 | F6 | `yagni:` | 2 self-declared legacy alias exports + 1 dead constant | **4** | ×1 | 4 |
| | | | **total** | **643** | | **667** |

Ranked by canonical lines per the brief's rule; F5 is ×4 ported and would sort 4th by shipped lines,
which is exactly the distortion that rule exists to prevent — and F5 deletes nothing anyway.

**Negative results, recorded so they are not re-derived:** N1 (`measure-validator-duplication.js`
healthy, runs, exit 0), the `native:` class (blocked by an undeclared Node floor; the one real
candidate fails the identical-output test on symlinks), and retired-era vocabulary (tombstone
guards, not residue).

**Not pursued to a verdict, and therefore not filed:** the 2 duplicated `nx-claim-is-bookkeeping`
assertions that `measure-validator-duplication.js` reports in
`scripts/validate-kaola-workflow-contracts.js`. The subtraction-direction proof the tool itself
demands (remove assertion → remove token → `test-route-reachability.js` must go RED) was not run.

## Traps that would have produced wrong findings

1. **Basename vs stem.** Searching `run-chain-pool.js` returns 0 consumers; searching
   `run-chain-pool` returns the real one (`require('./run-chain-pool')`). My first full sweep was
   invalid for this reason.
2. **The untracked edition trees.** `.opencode*` and `.kimi*` (6 trees, 19 files each) are
   gitignored — invisible to `git grep` — and the local `grep` is ugrep, which skips dot-directories.
   Every `delete:` above searched them explicitly.
3. **A pathspec error read as "no hits".** `git grep … ':!__none__'` exits **128** with no output,
   which looks exactly like a clean zero. Caught by printing `TRACKED_EXIT` on every leg and by
   running a positive control ("Path Intent") before trusting the harness.
4. **Vacuous equivalence.** "Removing this changes nothing" is worthless without a control that the
   comparison can detect change at all. F2 removes a live transform and shows 3 files differ.
5. **A plausible `native:` swap that is wrong.** `fs.cpSync` looks like a drop-in for `copyDir` and
   is not, on symlinks — and `{dereference:true}` does not fix it on Node 24.

## Open / unmeasured

- **The 86 ported copies were not separately audited** (per scope). Multipliers above are derived
  from basename presence in `plugins/*/scripts/`, not from re-reading each port.
- **No cut was applied and no suite was re-run after a cut.** F1 in particular removes assertions
  from a chain step (`test-parallel.js`), and the claim that the rest of that file survives is a
  reading of which assertions touch `pool.*`, not a measured post-cut run.
- **Consumers outside the repository** (a shell alias, a personal script) are invisible to every
  search here.
- **Callers reached only through dynamic construction** (a require path built at runtime) would not
  be found by literal search. I saw no such construction in the files I read, but I did not prove
  its absence across all 81.

# impl-sink-rc — #910 receipt placement + #907 (chain scope, `.git` gitlink, two parsers)

Author: `impl-sink-rc`. Work tree: `.kw/worktrees/bundle-904-905-906-907-908-909-910`. Nothing committed.

**Verification tier: `tests-green`** — the authored suites pass, and every changed behaviour was
additionally driven directly and mutation-proven. Two suites went red mid-run; both are diagnosed
below and **neither is mine**.

---

## 1. Where the brief is wrong (read this first)

Three load-bearing corrections. Each is measured, not argued.

### 1a. The gitlab/gitea `run-chains` ports are GENERATED, not hand-ported

The brief says all four of my files are hand-ported and "policed by **NOTHING**". That is true for
`sink-merge`, and **false for `run-chains`**:

- `scripts/validate-script-sync.js:67-69` enrols `kaola-workflow-run-chains.js` in `COMMON_SCRIPTS`
  (canonical↔Codex byte-identity) and its own note says the forge ports are generated.
- `scripts/edition-sync.js:52-65` lists it in `GENERATED_AGGREGATORS` (promoted in #868).

So a missed `run-chains` forge port is **not** silent — `edition-sync --check` reds. I still verified
behaviourally on every edition, but the risk framing in the brief does not apply to that file.
`sink-merge`'s forge ports are hand-ported exactly as the brief states, and I treated them that way.

### 1b. #907's `.git` fix, as the brief words it, would have WEAKENED the gate

The brief says: *"skip the whole SUBTREE under any directory containing a `.git`"*. Measured, that
over-skips. Three `.git` shapes behave differently, and only two of them collapse:

| fixture | `.git` shape | `rev-parse --show-toplevel` **inside** the dir | do siblings become blobs? | `git add -f` on a sibling |
|---|---|---|---|---|
| p1 | junk regular FILE | **ERROR** `invalid gitfile format` | **YES, both** | exit 0 |
| p2 | DIRECTORY (nested repo) | the dir ITSELF | NO — one `160000` gitlink | **exit 128** `is in submodule` |
| p3 | VALID gitfile (planted worktree) | the dir ITSELF | NO — gitlink | **exit 128** |
| p4 | none (control) | an ANCESTOR | YES | exit 0 |

A blunt "any `.git` entry" rule drops p1's two siblings from the required set even though git commits
them normally — i.e. it silently removes them from the blob gate that exists to catch exactly that
loss. I implemented the **measured discriminator** instead (`isArchiveRepoBoundary`), so p1 is
byte-for-byte unchanged and only p2/p3 skip. The premise report was right that the old entry-skip is
correct for the `.git` FILE; the brief's proposed rule would have undone that.

### 1c. `resolveRecordFolder` had already landed when I got there

`impl-runner`'s export was live in all four trees. I coded against it and re-verified at the end:
`typeof …resolveRecordFolder === 'function'` in `scripts/`, `plugins/kaola-workflow/scripts/`,
`plugins/kaola-workflow-gitlab/scripts/`, `plugins/kaola-workflow-gitea/scripts/`. I edited
`validation-runner` in **no** tree.

Everything else in `premise-907.md` and `premise-910.md` that I depended on reproduced exactly.

---

## 2. Changes, per edition

### GOAL 1 — #910: a receipt written from a linked worktree lands where the gate cannot read it

| what | canonical | codex | gitlab | gitea |
|---|---|---|---|---|
| `require('./kaola-workflow-validation-runner')` (new edge) | `:152` | `:152` | `:153` | `:153` |
| `resolveProjectRecordDir` (new) | `:801` | `:801` | `:802` | `:802` |
| `resolveOutputPath` `--project` arm | `:816` | `:816` | `:817` | `:817` |
| outcome recorder `--project` arm | `:1043` | `:1043` | `:1044` | `:1044` |

Files: `scripts/kaola-workflow-run-chains.js` · `plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js`
· `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js`
· `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js`
(codex = `cp`; the two forge ports = `edition-sync`'s own `renderForgePort`, for that one base only —
I deliberately did **not** run repo-wide `--write`, which would have propagated other agents'
in-flight canonical edits to their mirrors.)

**The rule implemented: the hash follows the invoking tree; the record follows the run folder.**
`getGitTopLevel(cwd)` still feeds `computeCodeTreeHash` (`:1155`) untouched; only the record path
splits. Fallback to the pre-#910 `<invoking tree>/kaola-workflow/<P>` when the resolver returns
`dir: null` — that is the ordinary first run in a plain repo, and it is what keeps T23g/T23j alive.

**Decision I made and am flagging:** the outcome recorder now resolves through the same helper. The
premise report left it open. Reasons: (a) the sidecar is the same run's record in the same `.cache/`,
and deriving one folder by two rules is how a receipt and its own telemetry end up in different
checkouts; (b) the old derivation **created** `<worktree>/kaola-workflow/<P>/` as a side effect, and
`mirrorFinalizationArtifacts`/`probeFinalizeMirror` branch on that directory's existence. With both
arms on one resolver a worktree run now writes **nothing** into the worktree — measured below.

**Left alone deliberately:** `--plan` with a relative path has the identical defect (premise §
"`--plan` … resolves against cwd"). It is an **explicit path the caller supplied**, the brief pins
precedence as unchanged, and widening to it is a scope decision, not a measurement. Flagging, not
deciding. Also untouched: `runReleaseCheck`'s `getGitTopLevel` (`:882`) — the release gate reads a
root-level receipt, not a run folder.

### GOAL 2 — #907: `isEditionCouplingPath` fails OPEN

| what | canonical | codex | gitlab | gitea |
|---|---|---|---|---|
| `computeChangedFiles` → `-z` + `splitNulPaths`, no `.trim()` | `:647` | `:647` | `:648` | `:648` |
| the comment that claimed "fail-closed by construction" | `:708` | `:708` | `:709` | `:709` |

The comment is no longer a flat claim. It now says the property is **conditional**, that it was
measurably false, and that its condition lives in the caller — so re-introducing a newline split
re-opens it visibly.

### GOAL 3 — #907: a `.git` DIRECTORY is a permanent unclearable block

| what | canonical | codex | gitlab | gitea |
|---|---|---|---|---|
| `isArchiveRepoBoundary` (new) | `:1366` | `:1366` | `:1395` | `:1388` |
| `scanArchiveTree` (new; one walk, two answers) | `:1385` | `:1385` | `:1410` | `:1403` |
| `requiredArchiveFiles` → thin wrapper | `:1409` | `:1409` | `:1434` | `:1427` |
| archive_commit reads the scan + reports | `:2309` | `:2309` | `:2059` | `:2052` |
| `receipt.archive_embedded_repos` + stderr remedy | `:2326` | `:2326` | `:2073` | `:2066` |

**Corrected rationale, since the issue's is false.** There is no "first instance" the bundle failed
to fix: `git log -L` shows `requiredArchiveFiles` is new in `7350ba9c` with the `.git` skip present
from birth, and a `.git`-named FILE is benign (p1 above). The real block is the **gitlink**: git
collapses a repository boundary into one `160000` entry, `ls-tree -r` returns no blobs beneath it,
`ls-files -o -i` reports nothing there so `forcePaths` is empty and no force-add is even attempted,
and the operator's own `git add -f` exits 128. `requiredArchiveFiles` still demanded those files, so
`missingBlobs` was non-empty on every run and the refusal at `sink-merge.js:2379` was
**non-convergent with no remedy in the envelope**. The skip covered the `.git` entry; the gitlink
makes the *siblings* unreachable.

The refusal is replaced by an **inventory**, which is the same answer #832/#901 already reached for
the gitignored archive: the sink proceeds, the loss is itemized on the receipt
(`archive_embedded_repos`) and on stderr, and the remedy named is the one that actually works
(remove the boundary — delete the nested `.git`, or `git worktree remove` — then re-run), because
that remedy lives **outside git's index**, which is precisely why the old refusal could not be
cleared from inside the sink.

### GOAL 4 — #907: the second parser, and the durable-evidence reader

| what | canonical | codex | gitlab | gitea |
|---|---|---|---|---|
| preflight bucket classifier → shared decoder | `:1551` | `:1551` | `:1536` | `:1529` |
| `assertBranchHasNonWorkflowChanges` → `-z` + `splitNulPaths` | `:461` | `:461` | `:416` | `:415` |

The preflight loop is fed **one porcelain record at a time** so the `XY` status column stays readable
while the path comes from the kernel; the decoder also owns the rename-arrow split, so the inline
copy of that is gone. Canonical uses the destructured `parsePorcelainPaths` already imported at `:9`;
the forge ports have no such destructure and use `adaptiveSchema.parsePorcelainPaths`.

The brief is right that the issue's "none feeds durable evidence" is wrong for `:461` (was `:451`,
and the issue's `458` is stale twice over) — `files` is written verbatim into `workflow_only_files`
on a **recorded** finding, so a mangled name reaches the receipt.

---

## 3. Verification

### Baseline (before any edit)

```
node scripts/simulate-workflow-walkthrough.js   EXIT=0   198/198 scenarios, full scope
node scripts/test-run-chains.js                 EXIT=1   9 failures, 249 passed  <- T-907a, the pin
node scripts/test-finalize-door.js              EXIT=0
node scripts/validate-script-sync.js            EXIT=0
node scripts/edition-sync.js --check            EXIT=0
```

### After (serial — see §4 on why that matters)

```
node scripts/simulate-workflow-walkthrough.js                          EXIT=0  198/198, full scope
node scripts/test-run-chains.js                                        EXIT=0  258 assertions
node scripts/test-finalize-door.js                                     EXIT=0  301 assertions
node scripts/test-sink-merge.js                                        EXIT=0  423 assertions
node scripts/test-release.js                                           EXIT=0  247 assertions
node scripts/test-claim-hardening.js                                   EXIT=0  557 assertions
node scripts/generate-routing-surfaces.js --check                      EXIT=0  18 surfaces byte-match
node scripts/edition-sync.js --check                                   EXIT=0  8 ports in parity
plugins/…-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js       EXIT=0
plugins/…-gitea/scripts/simulate-gitea-workflow-walkthrough.js         EXIT=0
plugins/…-gitlab/scripts/test-gitlab-run-chains.js                     EXIT=0
plugins/…-gitea/scripts/test-gitea-run-chains.js                       EXIT=0
node scripts/validate-script-sync.js                                   EXIT=1  <- NOT MINE, see §4
plugins/…-{gitlab,gitea}/scripts/simulate-*-codex-workflow-walkthrough EXIT=1  <- NOT MINE, see §4
```

### #910 acceptance fixture — main and worktree hashes provably DIFFER

`<scratch>/fx910/main` + nested linked worktree `.kw/worktrees/issue-1` carrying a commit main lacks;
run folder **main-resident only** (the live topology).

```
main     codeTreeHash = a9a0e0de03205693fc72e4329dd92ac28685cd58bdc1cdcca9e4fd0c4bb4fe9b
worktree codeTreeHash = 4b6df757ee8e6124d6f8f6f36d5e9d6e4afa2a440f6f2063a386da59d6c410db
DIFFER = true
```

Two scratch mirrors differing **only** in `run-chains.js` (`diff -rq` confirmed one file):

| leg | receipt landed | worktree run folder created | receipt `codeTreeHash` | `finalize --check` from the worktree |
|---|---|---|---|---|
| BEFORE | `<worktree>/kaola-workflow/issue-1/.cache/` | YES | = worktree's | **`chains_unverified`** |
| AFTER | `<main>/kaola-workflow/issue-1/.cache/` | **NO** | = worktree's, ≠ main's | **`chains_green`** |

Both acceptance criteria hold together: the record moved, the hash did not.

Repeated on **codex, gitlab and gitea** — all three: receipt in main's run folder, no worktree folder
created, `codeTreeHash === worktree hash && !== main hash`.

### #910 non-regression — plain repo and all four precedence arms, byte-identical before/after

```
[D-1] plain repo, --project, run folder ABSENT   <repo>/kaola-workflow/issue-1/.cache/chain-receipt.json
[D-2] plain repo, --project, run folder PRESENT  <repo>/kaola-workflow/issue-2/.cache/chain-receipt.json
[D-3] plain repo, --project from a SUBDIR        <repo>/kaola-workflow/issue-1/.cache/chain-receipt.json
[D-1] plain repo finalize --check validation: chains_green | linked_root: null
[P-1] --output <abs> (+ --project)               <abs>
[P-2] --plan <relative>                          <worktree>/kaola-workflow/issue-1/.cache/…
[P-3] --output beats --plan AND --project        <abs>
[P-4] bare (no path flag)                        <worktree>/.cache/chain-receipt.json
```

All eight identical on BEFORE and AFTER.

### #907 chain scope — four editions × four filenames

Real chain-scope decision (no `--mock-chain`, which disables narrowing), one edition-coupling path:

| filename | BEFORE (canonical) | AFTER — canonical / codex / gitlab / gitea |
|---|---|---|
| `nöte.js` | **`claude-only`**, 1 chain, `touched=[]` | `all-four`, `touched=["plugins/…/nöte.js"]` |
| `qu"ote.js` | **`claude-only`**, 1 chain, `touched=[]` | `all-four`, `touched=["plugins/…/qu\"ote.js"]` |
| `trail.js ` | `all-four`, `touched=["…/trail.js"]` ← **name mangled** | `all-four`, `touched=["…/trail.js "]` |
| `plain.js` (control) | `all-four` | `all-four`, identical |

### #907 `.git` gitlink — shipping functions extracted verbatim and run

|  | BEFORE `missingBlobs` | AFTER `required` / `embeddedRepos` / `missingBlobs` |
|---|---|---|
| p1 junk `.git` FILE | `[]` no refusal | 2 files / `[]` / `[]` — **unchanged**, gate intact |
| p2 nested repo | **2 paths → `sink_incomplete`** | `[]` / `["…/p2"]` / `[]` — no refusal + remedy |
| p3 planted worktree | **1 path → `sink_incomplete`** | sibling outside the boundary still required / `["…/p3/wt"]` / `[]` |
| p4 control | `[]` | identical |

Identical results from the **gitlab and gitea** ports.

**Mutation proof, two independent mutations, scratch copies only:**
- MUTANT A — `isArchiveRepoBoundary` forced to `return false`: p2 and p3 **refuse again**. The probe
  is armed.
- MUTANT B — boundary recorded but the `return` removed so the subtree is still walked: p2 and p3
  **refuse again** with `embeddedRepos` populated. It is the **subtree skip**, not the reporting,
  that clears the block.

### #907 preflight parser — the permanent `sink_blocked` over the run's own archive

Shipping `sinkPreflight` extracted verbatim; hazard file inside `kaola-workflow/archive/issue-1/.cache/`:

| file | BEFORE (all editions) | AFTER (canonical / gitlab / gitea) |
|---|---|---|
| `nöte.md` | `sink_blocked`, `foreign_dirt=["\"…n\\303\\266te.md\""]` | `ok=true` |
| `qu"ote.md` | `sink_blocked` | `ok=true` |
| `notes.md ` | `sink_blocked` | `ok=true` |
| `plain.md` (control) | `ok=true` | `ok=true` |

**Over-exemption control** (a genuinely foreign hazard path + a SIBLING project's archive): still
`sink_blocked` on every edition, and now itemized with **literal** names (`src/nöte.js`) instead of
`"src/n\303\266te.js"` — the operator can act on what the refusal prints.

### #907 `workflow_only_files` — the durable-evidence half

Workflow-only branch carrying `nöte.md`, `trail.md ` (trailing space) and `plain.md`:

- BEFORE, all editions: **finding NULL** — `no_implementation_changes` under-fired; a branch with no
  deliverable would have been published.
- AFTER, canonical / gitlab / gitea:
  `["kaola-workflow/issue-1/nöte.md","kaola-workflow/issue-1/plain.md","kaola-workflow/issue-1/trail.md "]`
  — literal, trailing space preserved.

---

## 4. The two reds, and why neither is mine

### 4a. `validate-script-sync` EXIT=1 — `impl-runner`'s unmaterialized file

```
- validation-runner module copies: plugins/kaola-workflow/scripts/…-validation-runner.js differs from scripts/…
- validation-runner module copies: plugins/kaola-workflow-gitlab/scripts/… differs
- validation-runner module copies: plugins/kaola-workflow-gitea/scripts/… differs
```

Canonical `md5 296ebf1a…`; all three mirrors `664368…` (one blob). Canonical has moved ahead and has
not been materialized. **This is also what fails both codex forge walkthroughs** —
`validate-kaola-workflow-{gitlab,gitea}-contracts.js:585` asserts that exact byte-identity.

Proven, not assumed: I built a scratch mirror = HEAD + **every** working-tree-modified file + the one
pending `cp` of `validation-runner` canonical→three mirrors. In it:

```
validate-script-sync                                  EXIT=0
edition-sync --check                                  EXIT=0
validate-kaola-workflow-gitlab-contracts.js           EXIT=0
validate-kaola-workflow-gitea-contracts.js            EXIT=0
simulate-gitlab-codex-workflow-walkthrough.js         EXIT=0
simulate-gitea-codex-workflow-walkthrough.js          EXIT=0
```

**ACTION FOR THE ORCHESTRATOR: `impl-runner` still owes the canonical→3-mirror materialization of
`kaola-workflow-validation-runner.js`.** I did not do it — not my file. My own files are in parity:
`run-chains` and `sink-merge` are byte-identical canonical↔codex, and `edition-sync --check` passes.

### 4b. `test-sink-merge` EXIT=1, two forge legs — a false red from concurrency

`#907 z1 (gitlab)` and `(gitea)` failed once, while the full walkthrough was running in the
background. Re-run **serially, nothing else running**: `EXIT=0, 423 assertions`. Independently
confirmed in isolated mirrors: at HEAD the new pin fails on **all four** editions (`4 failed, 419
passed`); with my sink fix it passes on **all four** (`423 assertions`), with and without the other
agents' working-tree `claim.js`. This is the known spawn-bound parallelization failure — the suites
cannot be run concurrently.

---

## 5. Things I could not do, or chose not to

- **No four-chain run.** `npm test` was not run: `test:kaola-workflow:{gitlab,gitea}` both invoke
  `edition-sync --check` **and** the forge contract validators, which red on 4a until `impl-runner`
  materializes. Every suite those chains contain was run individually and is green (see §3), and all
  four pass in the mirror where 4a is repaired.
- **`--plan`'s identical relative-path defect is untouched** (§ GOAL 1). Scope decision, flagged.
- **A divergence I did not create and did not fix:** the forge `sinkPreflight` ports call
  `assertWorktreeClean(mainRoot, branch)` **unconditionally** — they carry no `#711` branchless
  clause and pass no `[project]` argument, unlike canonical (`sink-merge.js:1440-1446`). Pre-existing,
  outside my brief. It only surfaced as a harness detail for me; it is a real canonical/forge
  divergence someone should look at.
- **No test authored, edited, weakened or skipped.** `tdd-guide` holds custody; T-907a and #907 z1
  are theirs and I made them pass.

## 6. Files changed

```
scripts/kaola-workflow-run-chains.js
scripts/kaola-workflow-sink-merge.js
plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js          (cp from canonical)
plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js          (cp from canonical)
plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js   (edition-sync render)
plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js     (edition-sync render)
plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js   (HAND-PORTED)
plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js     (HAND-PORTED)
```

Nothing else was touched. No commit. All fixtures, mirrors and mutants live under the scratchpad.

---

# ROUND 2 — adversarial-review findings C1 and C3

Both CONFIRMED findings on my surface, both reproduced failing before and passing after, on all four
editions. **Verification tier: `tests-green`.** Nothing committed. `sync:editions` NOT run.

## C3 — the boundary discriminator asked the wrong repository

**The review is right, and the root cause is deeper than "two missing cases".** My round-1 probe ran
`rev-parse --show-toplevel` *inside* the candidate directory — which asks the **INNER** repository
where its work tree is. The inner repository's own config can answer anything, and two shapes do:

| inner config | inner `--show-toplevel` answers | outer git actually |
|---|---|---|
| `core.bare=true` | `fatal: must be run in a work tree` | stages a `160000` gitlink |
| `core.worktree` elsewhere | that other path | stages a `160000` gitlink |

The question was never about the inner repo. It is **"does the OUTER git collapse this?"** — so the
fix asks git's own resolver, from the outer repo, about the `.git` entry itself:

```js
git -C <mainRoot> rev-parse --resolve-git-dir <absDir>/.git
```

That is the same predicate `git add` uses to decide whether to collapse a directory, and it cannot be
misdirected because it never enters the inner work tree.

**Measured against ground truth on TWELVE `.git` shapes.** Ground truth = what the outer repo stages
into a HEAD-seeded **scratch** index (`GIT_INDEX_FILE`), never the real one:

| shape | outer collapses? | `--show-toplevel` (round 1) | `--resolve-git-dir` (round 2) |
|---|---|---|---|
| c1 nested repo | yes | true ✓ | true ✓ |
| **c2 `core.bare=true`** | **yes** | **false ✗** | **true ✓** |
| **c3 `core.worktree` elsewhere** | **yes** | **false ✗** | **true ✓** |
| c4 junk `.git` FILE | no | false ✓ | false ✓ |
| c5 broken gitfile | no | false ✓ | false ✓ |
| c6 `.git` symlink → real gitdir | yes | true ✓ | true ✓ |
| c7 no `.git` at all | no | false ✓ | false ✓ |
| d1 gitfile w/ RELATIVE gitdir | yes | — | true ✓ |
| d2 empty `.git` directory | no | — | false ✓ |
| d3 `.git` dir missing HEAD | no | — | false ✓ |
| d4 `core.bare` **and** `core.worktree` | yes | — | true ✓ |
| d5 dangling `.git` symlink | no | — | false ✓ |

`--resolve-git-dir` agrees with the outer repository on **all twelve, in both directions**.

**End-to-end, through the shipping `scanArchiveTree`/`requiredArchiveFiles` extracted verbatim:**

```
PRE-#907 (HEAD)          c1,c2,c3,c6 -> sink_incomplete REFUSAL (4 permanent blocks)
ROUND-1 (show-toplevel)  c2,c3       -> sink_incomplete REFUSAL (2 permanent blocks)  <- the finding
ROUND-2 (resolve-git-dir) none       -> 0 permanent blocks
```

All four editions, all seven c-shapes, after:
```
canonical  c1:boundary c2:boundary c3:boundary c4:plain c5:plain c6:boundary c7:plain || refusals: 0
codex      (identical)      gitlab (identical)      gitea (identical)
```

**The false-positive direction stays closed, and is proven load-bearing.** Mutation A
(`isArchiveRepoBoundary` → always `false`): c1, c2, c3 and c6 all re-brick. Mutation B (→ always
`true`): c4 and c5 lose their siblings from `required[]`, i.e. the benign shapes would be silently
dropped from the blob gate — so the probe answering `false` there is doing real work. c7 is unmoved
by mutation B, which also shows the `entries.some(e => e.name === '.git')` pre-gate still fires.

## C1 — the #906 orphan carried sink journals into git history

Reproduced with the sink's **own** exclude pathspec set on the review's fixture shape, and the leak
is one file wider than the review reported: a journal sitting at **depth 0** of the archive leaks too.

The four excludes were EXACT paths at exactly one directory of depth. `claim.js`'s `SINK_JOURNAL_RE`
has always stated the rule **by basename at any depth** — these four pathspecs were the only place it
was written as a fixed depth. So this converges them on the existing rule rather than inventing one:

```js
const excludeJournalsUnder = prefix => [
  ':(exclude,glob)' + prefix + '**/sink-receipt.json',
  ':(exclude,glob)' + prefix + '**/sink-fallback.json',
];
```

**Three pathspec forms measured, same fixture, same scratch-index method:**

| form | journals staged | real evidence staged |
|---|---|---|
| SHIPPING (exact `.cache/…`) | **3** — 2 orphan + 1 at archive root | 6 |
| non-glob `*/…` | **1** — misses depth 0 | 6 |
| **`:(exclude,glob)…/**/…`** | **NONE** | **6 — identical** |

`**/` spans zero or more directories, so the pre-#906 depth-1 paths stay covered and depths 0 and 2+
join them. The identical 6-file evidence set on every form is the no-over-exclusion control.

**Before/after, all four editions**, each using its OWN exclude construction extracted from its own
source (canonical/codex `excludeReceipt…`, forge `exRcpt…`):

```
BEFORE  canonical / codex / gitlab / gitea : JOURNALS COMMITTED: 3   evidence staged: 6
AFTER   canonical / codex / gitlab / gitea : JOURNALS COMMITTED: NONE evidence staged: 6
```

Mutation C (`**/` reverted to `.cache/`, everything else unchanged): the same 3 journals leak again.

**I did not touch `claim.js`.** The fix is entirely on my side, as instructed; the orphan path is
unchanged and the measured reason for its nesting stands.

## Round-2 file:line

| change | canonical | codex | gitlab | gitea |
|---|---|---|---|---|
| `isArchiveRepoBoundary(mainRoot, absDir)` | `:1380` | `:1380` | `:1402` | `:1395` |
| journal excludes → basename/any-depth | `:2270` | `:2270` | `:2016` | `:2009` |

Files: `scripts/kaola-workflow-sink-merge.js` · `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` (cp)
· `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` (hand-ported)
· `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` (hand-ported).
`run-chains` is unchanged in round 2. Canonical↔codex byte-identical for both my files.

## Round-2 suites — run SERIALLY, one at a time

```
node scripts/test-sink-merge.js                                   EXIT=0  423 assertions
node scripts/simulate-workflow-walkthrough.js                     EXIT=0  198/198, full scope
node scripts/test-run-chains.js                                   EXIT=0  258 assertions
node scripts/test-finalize-door.js                                EXIT=0  310 assertions
plugins/…-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js  EXIT=0
plugins/…-gitea/scripts/simulate-gitea-workflow-walkthrough.js    EXIT=0
plugins/…-gitlab/scripts/test-gitlab-run-chains.js                EXIT=0
plugins/…-gitea/scripts/test-gitea-run-chains.js                  EXIT=0
node scripts/test-claim-hardening.js                              EXIT=0  766 assertions
node scripts/test-release.js                                      EXIT=0  247 assertions
node scripts/edition-sync.js --check                              EXIT=0  8 ports in parity
node scripts/generate-routing-surfaces.js --check                 EXIT=0  18 surfaces byte-match
node scripts/validate-script-sync.js                              EXIT=1  <- NOT MINE
```

`validate-script-sync`'s drift list names `kaola-workflow-claim.js` (canonical ahead of its codex
mirror — `impl-claim`) and the three `validation-runner` mirrors (`impl-runner`). **Neither of my two
files appears in it**; both are byte-identical canonical↔codex. The orchestrator's single
`sync:editions` at the end resolves both.

## Round-2 caveat worth recording

The `.git` shapes the fixtures cover are the twelve above. `--resolve-git-dir` is git's own
`resolve_gitdir()`, so a shape I did not enumerate should follow `git add` by construction rather than
by coincidence — but that last sentence is an **inference from which function git uses**, not a
measurement. What is measured is the twelve.

---

# ROUND 3 — review findings R3 and S1

Both REPRODUCED failing before and passing after, on all four editions. **Tier: `tests-green`.**
Nothing committed. `sync:editions` NOT run.

## R3 — a rename OUT of `plugins/` skipped three chains

**Reproduced on the reviewer's own fixtures, on my post-#907 code** — so this is genuinely a second
mechanism, not a residue of the C-quoting hole:

```
r1  git mv plugins/kaola-workflow/scripts/moved.js src/moved.js
    changedFiles        ["src/moved.js"]                <- the plugins path is absent entirely
    decision            claude-only (non_edition_diff)
    chains              claude                          <- three chains skipped
    touchedEditionPaths []
r2  pure delete of the same file      -> all-four   (already correct)
r6  rename INTO plugins               -> all-four   (already correct)
r7  non-ASCII plugins path            -> all-four   (the #907 fix, still holding)
```

**Cause.** `--name-only` emits ONE field per record, and when rename detection fires that field is the
DESTINATION only — the pre-image is never named. The classifier can only answer about paths it is
handed, so its own note ("the condition lives in the caller") was true and incomplete: the caller's
stream had a second condition nobody had stated.

**Fix: `--no-renames` on the diff.** It decomposes every rename back into a delete of the source plus
an add of the destination — both ordinary one-field records — and a pure delete was always classified
correctly. Measured:

```
r1  --name-only -z              : src/moved.js
    --name-only -z --no-renames : plugins/kaola-workflow/scripts/moved.js | src/moved.js
r2/r7 (no rename in the diff)   : byte-IDENTICAL with and without the flag
```

Chosen over `--name-status -z`, which carries both halves but needs a second decoder for its status
column — the parse contract is explicit that a third decoder is the thing to avoid. `--no-renames`
keeps the reader on `splitNulPaths` and can only ever WIDEN the changed set, so it cannot introduce a
fail-open.

**After, all four editions on r1:** `decision: all-four`, `touchedEditionPaths:
["plugins/kaola-workflow/scripts/moved.js"]`. r2 and r7 byte-identical to before; r6 unchanged in
decision and now additionally names the source, which is correct.

## S1 — a committed symlink read as complete content

**Reproduced on the reviewer's fixture (`kwS1c-cDyFhT`) against my current code**, through the
shipping gate functions extracted verbatim:

```
BEFORE  required[]             6 file(s)
        missingBlobs           []                      -> archive_commit reads DONE
        committed 120000 links ["…/.orphan-main-live-…/evidence-link.md"]
        gate REPORTS unbacked  (no such function — the gate says nothing)
```

The link's target is `…/kwS1c-cDyFhT/outside-the-run-folder/big-evidence.md`, outside the archive.

**Why neither half was wrong on its own, which is why this was invisible.** `scanArchiveTree` admits
symlinks into `required[]` deliberately (#901 — a link IS staged, as a blob whose content is the
target string, and excluding it once let a gitignored link read `archive_commit:"done"`), and
`blobPathsUnder` asks `--name-only`, which lists a `120000` entry exactly like a `100644` one.
Together they answer "carried" for a pointer to content the archive cannot reach.

**Fix: `symlinkTargetsOutsideArchive` — REPORT, never refuse**, per the owner's ruling and because the
only path that puts a link in the band is the crash-resume rescue; refusing over rescued evidence
would destroy more than it protects. `missingBlobs` is untouched, `archive_commit` still reads done,
and the sink still exits 0 — what changes is that `receipt.archive_unbacked_symlinks` (which rides the
`status: sinked` envelope) and a stderr warning now name the links and give the remedy.

**AFTER, all four editions, reviewer's fixture:** reports `evidence-link.md -> <absolute target>`,
with `missingBlobs` still `[]`.

**Discrimination control — over-reporting would be as wrong as under-reporting.** Five committed
`120000` entries in one archive; three must be named and two must not:

| entry | target | reported? |
|---|---|---|
| `L1-absolute-outside.md` | absolute, outside the archive | **YES** |
| `L3-dangling.md` | `/nonexistent/gone.md` | **YES** |
| `L4-relative-escape.md` | `../../../outside/big.md` | **YES** |
| `L2-relative-inside.md` (in a subdir) | `../.cache/inside-target.md` | no — travels with the archive |
| `L5-relative-inside-shallow.md` | `.cache/inside-target.md` | no — same |

Identical on canonical, codex, gitlab and gitea.

Resolution is LEXICAL (`readlink` + `path.resolve`) with a realpath comparison as a second chance,
because realpath alone cannot answer for a link that ALREADY dangles — and that is one of the cases
that must be named (L3).

**Mutation proof, each with the shape that distinguishes it:**
- **Mutant D** — containment test disabled: L2 and L5 are over-reported. The inside/outside test is
  load-bearing.
- **Mutant E** — the `120000` mode filter disabled: silent on the fixture above (a regular file makes
  `readlinkSync` throw, so it is excluded anyway), so I built the shape that separates them — a path
  git committed as `100644` that is a SYMLINK on disk NOW. Shipping code correctly stays silent (git
  committed the CONTENT); Mutant E reports it, a false alarm. The filter's real job is that case, not
  ordinary files.

## Round-3 file:line

| change | canonical | codex | gitlab | gitea |
|---|---|---|---|---|
| R3 `--no-renames` in `computeChangedFiles` | `:663` | `:663` | `:664` | `:664` |
| S1 `symlinkTargetsOutsideArchive` | `:1486` | `:1486` | `:1491` | `:1484` |
| S1 report wired into archive_commit | `:2524` | `:2524` | `:2220` | `:2213` |

`run-chains` forge ports regenerated via `edition-sync`'s own `renderForgePort` (that base only);
`sink-merge` forge ports hand-edited and verified by RUNNING. Both files byte-identical canonical↔codex.

## Round-3 suites — SERIAL

```
test-sink-merge                        EXIT=0  423 assertions
test-run-chains                        EXIT=0  258 assertions
simulate-workflow-walkthrough          EXIT=0  198/198, full scope
test-finalize-door                     EXIT=0  310 assertions
simulate-gitlab-workflow-walkthrough   EXIT=0
simulate-gitea-workflow-walkthrough    EXIT=0
test-gitlab-run-chains                 EXIT=0
test-gitea-run-chains                  EXIT=0
test-claim-hardening                   EXIT=0  766 assertions
test-release                           EXIT=0  247 assertions
edition-sync --check                   EXIT=0  8 ports in parity
generate-routing-surfaces --check      EXIT=0  18 surfaces
validate-script-sync                   EXIT=1  <- validation-runner mirrors ONLY (impl-runner)
```

`claim.js` has cleared the drift list since round 2; `validation-runner`'s three mirrors have not.
Neither of my files appears. One `sync:editions` at the end resolves it.

## What needs pinning (I do not author tests — routing note)

Four behaviours are now load-bearing and have NO suite coverage. Each is cheap and each has a fixture
already built under the scratchpad that a test author can lift:

1. **R3** — a rename out of `plugins/` selects all four chains (`adv/r1`); with `adv/r2`/`r6`/`r7` as
   the discriminating controls. Nothing in any run-chains suite exercises a rename.
2. **S1 report** — a committed symlink whose target is outside the archive is NAMED on the receipt and
   the sink still exits 0 (`kwS1c-cDyFhT`). The paired negative is the one that matters: a link
   INSIDE the archive is NOT named (`s1ctl`, L2/L5).
3. **C3** — `core.bare=true` and `core.worktree`-elsewhere `.git` directories classify as boundaries
   (`c3/outer` cases c2/c3). The z1 pin plants only a plain nested repo, so it passes on the broken
   discriminator.
4. **C1** — a journal nested two levels under the archive is not committed (`c1/outer`). `SINK_STAGE_SKIP`
   keeps it out of `required[]`, so no existing gate notices when this regresses.

---

# ROUND 4 — review finding R1 (blocking): my own comment red the forge contract validators

**Reproduced, fixed, regenerated, verified.** Tier: `tests-green`. Nothing committed.

## What happened, and it is mine

The `--no-renames` comment I added in round 3 contained the literal
`git mv plugins/kaola-workflow/scripts/x.js`. `run-chains`' forge ports are GENERATED and the rename
map does not rewrite a path inside a comment, so it landed byte-identical in both forge trees at
`:651`. The forge rule (`validate-kaola-workflow-gitlab-contracts.js:363`) tests the **full** text —
unlike the sibling `gh` rule one line above, which filters comment lines first — so my prose read as a
cross-tree fallback.

Reproduced before the fix:

```
$ node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
Error: plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js
       must not fall back to root or GitHub plugin scripts
```

**A gap in MY verification, named plainly.** In rounds 2 and 3 I ran the plain forge walkthroughs and
took them as forge coverage. They do not invoke the contract validators — the CODEX forge walkthroughs
do, and I last ran those in round 1, before this comment existed. The forge walkthrough passing is not
evidence the forge contract validator passes, and I treated it as if it were.

## The fix

The path literal is gone; the reasoning the lead asked to keep is intact. The example is now stated as
"a `git mv` that carries a file OUT of an edition tree and into `src/`", and a short parenthetical
records WHY there is no example path — so the next person does not helpfully add one back:

> *(Stated without an example path on purpose: this file is generated into the forge trees verbatim,
> and each forge's contract validator forbids a literal reference to another edition's script
> directory ANYWHERE in the text, comments included. A path here is indistinguishable to that rule
> from a real cross-tree fallback, and the rule is right to read what ships rather than what was
> meant.)*

No validator was restructured and no exemption was added. Regenerated through the generated-aggregator
path (`edition-sync`'s own `renderForgePort`, that one base), not by hand.

Swept all four of my forge-tree files for the pattern, not just the one that fired:

```
plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js  hits=0
plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js  hits=0
plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js    hits=0
plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js    hits=0
```

## WHICH assertion each validator now stops at

```
validate-kaola-workflow-gitlab-contracts  EXIT=1
  Error: plugins/kaola-workflow-gitlab/scripts/kaola-workflow-validation-runner.js
         must be byte-identical to the canonical validation runner
validate-kaola-workflow-gitea-contracts   EXIT=1
  Error: plugins/kaola-workflow-gitea/scripts/kaola-workflow-validation-runner.js
         must be byte-identical to the canonical validation runner
```

My cause is gone; both now stop at the deferred `sync:editions`. Proven rather than asserted — a
scratch mirror of HEAD + every working-tree-modified file + ONLY the `validation-runner`
canonical→3-mirror copy:

```
gitlab-contracts EXIT=0  Kaola-Workflow GitLab contract validation passed
gitea-contracts  EXIT=0  Kaola-Workflow Gitea contract validation passed
validate-script-sync EXIT=0
```

## Verification

```
node scripts/test-run-chains.js       EXIT=0  258 assertions
node scripts/edition-sync.js --check  EXIT=0  8 forge aggregator ports in parity
node scripts/validate-script-sync.js  EXIT=1  validation-runner mirrors ONLY (not mine)
```

R3's behaviour re-confirmed after the rewrite — the comment change must not have moved the code:
`adv/r1` still selects `all-four` on canonical, codex, gitlab and gitea.

## Round-4 file:line

| change | canonical | codex | gitlab | gitea |
|---|---|---|---|---|
| `--no-renames` rationale, no edition path literal | `:648-660` | `:648-660` | `:649-661` | `:649-661` |

Files: `scripts/kaola-workflow-run-chains.js` + the three ports (cp to codex, `renderForgePort` to the
two forges). `sink-merge` untouched in round 4.

# Investigation: premise check for issue #907 (non-`-z` readers + `.git` block)

## Setup

- Commit: `2018521fd9e96c7f84ace0d099d3881706414bac` (branch `main`, clean except the untracked bundle folder)
- Environment: node v24.14.0, git 2.50.1 (Apple Git-155), darwin 25.6.0
- Fixture repos (throwaway, scratchpad only):
  `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/8070a702-f33f-4c74-8c66-4434a7ea9c6d/scratchpad/fx1..fx9`
- Harness that runs the shipping `requiredArchiveFiles` verbatim (extracted from source, not retyped):
  `…/scratchpad/req.js`
- No tracked file was modified. This report is the only write.

---

## VERDICT TABLE

| # | Claim in #907 | Verdict | One-line basis |
|---|---|---|---|
| 1 | Six readers still `split('\n')` with a trim, at claim.js `2577,3349,3361,3392,5195` and sink-merge.js `458` | **holds-with-correction** | All six exist **by shape**; three line numbers are wrong at HEAD: `3392`→**3377**, `5195`→**5133**, sink `458`→**451** |
| 2 | "None is currently a defect" | **holds for the six** | All six fail **OPEN** (a guard under-fires); none bricks. Measured per site below |
| 3 | "none reads a `-z` stream, and none feeds durable evidence" | **holds-with-correction** | No `-z` stream is mis-split. But sink-merge:451 **does** feed durable evidence (`workflow_only_files` on a recorded sink finding) |
| 4 | "they are ref names and `startsWith('kaola-workflow/')` prefix classifications" | **holds** | 3 of 6 are ref names (measurably immune); 3 of 6 are real path streams |
| 5 | A C-quoted path breaks a `startsWith('kaola-workflow/')` test | **holds** | Measured: 3 of 4 hazard paths come back `"…"`-wrapped, prefix test → `false` |
| 6 | The count is six | **FALSE — undercount** | 14 readers of git output split on `'\n'` in the five swept files; **5 are path-bearing**, and **3 of those are LIVE defects the issue does not name** |
| 7 | **`git add -f -- <archive>/.git` exits 0 and indexes nothing** | **holds** | Measured, exit 0, `ls-files` unchanged, `status -uall` shows nothing |
| 8 | **A `.git`-named FILE in an archive is a permanent unclearable `sink_incomplete`** | **FALSE** | The skip at sink-merge.js:1346 removes it from the required set (measured); and the gate that could refuse (`requiredArchiveFiles`/`missingBlobs`) **did not exist before 7350ba9c**, so it was never true either |
| 9 | "The bundle made the skip type-agnostic only to avoid adding a second instance; it did not fix the first" | **FALSE** | There is no "first". `git log -L` shows the whole function is new in `7350ba9c` with the skip present from birth |
| 10 | *(adjacent)* A permanent unclearable archive block of this shape exists | **HOLDS — different mechanism** | A `.git` **directory** (or a **valid** `.git` gitfile) creates a **gitlink**; its SIBLINGS become permanently un-addable (`fatal: … is in submodule`, exit 128) while `requiredArchiveFiles` still demands them |
| 11 | `/(^\|\/)sink-(receipt\|fallback)\.json$/` has exactly three copies in `claim.js` | **holds** | claim.js **2533, 2715, 4490**. No fourth copy in any script; a looser unanchored variant exists in the walkthrough (test assertion) |
| 12 | Coverage must span canonical/Codex, GitLab, Gitea | **holds** | Every site present in all four copies; mapped below. GitLab/Gitea claim+sink are **hand-ported with NO parity enforcement** |

### Headline corrections, loudly

- **#907 understates severity.** Its own six are harmless, but the same class is **already breaking
  finalize today**, at a site the issue never mentions: `parsePorcelainPaths`
  (`kaola-workflow-adaptive-schema.js:438`) — the byte-identical ×4 drift anchor. Reproduced with the
  **exact `notes.md ` filename from the #900 incident**: the finalize transaction stages **nothing at
  all** (not even the good files beside it) and reports `finalize_commit: 'nothing_to_commit'`. That is
  a **false green**, which is worse than the brick #900 produced.
- **#907's `.git` claim is wrong in mechanism and in history.** The `.git`-named *file* is benign. The
  real permanent block is the **gitlink** case, and the current type-agnostic skip does **not** cover
  it — it skips the `.git` entry, not the subtree that entry makes unreachable.

---

## Part 1 — the six named readers, per site

Every site read in full. Verified command, stream, and consequence direction.

| # | Site (HEAD) | Feeding git command | Can it contain a path? | Fails |
|---|---|---|---|---|
| A | `claim.js:2577` | `for-each-ref --format=%(refname) refs/kaola-workflow/barrier/<tag>/` | **NO** — ref names | safe |
| B | `claim.js:3349` | `diff --name-only <base>...HEAD` | **YES** | open |
| C | `claim.js:3361` | `log --name-only --pretty=format: <base>..HEAD` | **YES** | open |
| D | `claim.js:3377` *(issue said 3392)* | `diff --cached --name-only` | **YES** | open |
| E | `claim.js:5133` *(issue said 5195)* | `for-each-ref --format=%(refname) refs/kaola-workflow/barrier/` | **NO** — ref names | safe |
| F | `sink-merge.js:451` *(issue said 458)* | `diff --name-only <base>...<branch>` | **YES** | open |

### A / E — ref-name readers: MEASURABLY immune (not merely asserted)

The issue asserts these are safe. Measured rather than assumed (fixture `fx6`):

```
$ git for-each-ref --format='%(refname)' refs/kaola-workflow/barrier/ | od -c
0000000    r e f s / k a o l a - w o r k f
...             / i s   " s u e / q u o t e  \n
...   / i s s u e - ö ** / n o n a s c i i  \n
```

- `for-each-ref --format=%(refname)` emits ref names **verbatim** — no C-quoting, even for `ö` and `"`.
  Same for `%(refname:short)` (site `claim.js:4788`).
- git **rejects** ref names containing LF, TAB, DEL, space or `\`:
  `fatal: … refusing to update ref with bad name`. `git check-ref-format 'refs/heads/a b'` → REJECTED;
  `refs/heads/aöb` → OK.
- Therefore `split('\n')` cannot mis-record, and `.map(s => s.trim())` is a provable no-op.

**These two sites are correctly documented as unable to carry a path. They need no conversion — only
the documented-exception half of acceptance criterion 1.** Same applies to `claim.js:4788`.

### B / C / D / F — path readers: the prefix test does break

Fixture `fx1` carries four hazard paths under `kaola-workflow/issue-1/`: `new<LF>line.md`, `nöte.md`,
`qu"ote.md`, `trailing.md ` (one trailing space).

```
$ git diff --name-only main...feat | od -c
0000000  "  k a o l a - w o r k f l o w / i s s u e - 1 / n e w \ n l i n e . m d  " \n
         "  k a o l a - w o r k f l o w / i s s u e - 1 / n \ 3 0 3 \ 2 6 6 t e . m d " \n
         "  k a o l a - w o r k f l o w / i s s u e - 1 / q u \ " o t e . m d " \n
            k a o l a - w o r k f l o w / i s s u e - 1 / t r a i l i n g . m d     \n
$ git diff -z --name-only main...feat | od -c
0000000     k a o l a - … / n e w \n l i n e . m d \0
            k a o l a - … / n ö ** t e . m d \0
            k a o l a - … / q u " o t e . m d \0
            k a o l a - … / t r a i l i n g . m d   \0
```

Running the **exact** reader line (`out.split('\n').map(s => s.trim()).filter(Boolean)`):

```
non-z record count: 4
  "\"kaola-workflow/issue-1/new\\nline.md\""      startsWith(kaola-workflow/)= false
  "\"kaola-workflow/issue-1/n\\303\\266te.md\""   startsWith(kaola-workflow/)= false
  "\"kaola-workflow/issue-1/qu\\\"ote.md\""       startsWith(kaola-workflow/)= false
  "kaola-workflow/issue-1/trailing.md"            startsWith(kaola-workflow/)= true   <- trailing space LOST
allWorkflow = false        <-- WRONG

-z record count: 4   (all four verbatim, all startsWith = true)
allWorkflow = true         <-- correct
```

Note the two distinct failure modes, which need different fixes to be described honestly:
- **Quoting** (`"`, `\`, control chars always; non-ASCII unless `core.quotePath=false`) → prefix test false.
- **Trailing space is NOT quoted by `diff --name-only`** → `.trim()` silently mutates the path. This is
  the #900 shape exactly. (`git status --porcelain` *does* quote it — see Part 3; the two commands
  differ, so a single mental model of "git quotes weird names" is wrong.)

**Consequence direction, per site — all four fail OPEN:**

- **B/C `probeImplementationCommit`** (`claim.js:3339-3365`): `committed.some(p => !p.startsWith('kaola-workflow/'))`.
  A quoted workflow path reads as non-workflow → `implCommitted = true` → `state:'committed'`. The
  `implementation_commit_missing` finding under-fires. No refusal.
- **D `checkFinalizeStagingGuard`** (`claim.js:3371-3400`): `if (!rel.startsWith('kaola-workflow/')) continue;`
  A quoted path is skipped entirely → `staging_guard_foreign_archive` / `staging_guard_multi_project`
  cannot see it. Under-fires. A quoted path can never *add* a bogus project, so it cannot false-refuse.
- **F `assertBranchHasNonWorkflowChanges`** (`sink-merge.js:441-467`): `allWorkflow=false` → returns
  `null` → the `no_implementation_changes` finding is never recorded. Under-fires.
  **Correction to the issue:** this site **does** feed durable evidence — on the recording branch it
  writes `workflow_only_files: files` into a `recordSinkFinding(...)`, i.e. the mangled path list lands
  on the sink receipt. The issue's "none feeds durable evidence" is wrong for this one site.

**So the issue is right that its six do not brick.** The class matters anyway — but the argument has to
be the sites below, not these.

---

## Part 2 — WIDER SWEEP: what the issue missed

Full inventory of readers that split git output on `'\n'` across the five requested files plus
`adaptive-schema.js` (which the brief did not name but which both `claim.js` and `sink-merge.js`
`require`, and which is the ×4 byte-identical anchor).

| Site | Command | Path-bearing? | Status |
|---|---|---|---|
| `claim.js:2577` | `for-each-ref` | no | safe (named by issue) |
| `claim.js:3349` | `diff --name-only` | **yes** | latent, fails open (named) |
| `claim.js:3361` | `log --name-only` | **yes** | latent, fails open (named) |
| `claim.js:3377` | `diff --cached --name-only` | **yes** | latent, fails open (named) |
| `claim.js:4733-4734` | `worktree list --porcelain` | yes (worktree abs paths) | **MISSED** — see (iii) |
| `claim.js:4788` | `for-each-ref --format=%(refname:short)` | no | **MISSED but safe** |
| `claim.js:5133` | `for-each-ref` | no | safe (named) |
| `claim.js:5739-5740` | `worktree list --porcelain` | yes | **MISSED** — see (iii) |
| `sink-merge.js:419` | `status --porcelain -uall` | display only | benign (message text) |
| `sink-merge.js:451` | `diff --name-only` | **yes** | latent, fails open (named) |
| `sink-merge.js:503` | `log` (commit subjects) | no | benign |
| `sink-merge.js:1449` | `status --porcelain -uall` | **yes** | **MISSED — LIVE, fails CLOSED**, see (ii) |
| `sink-merge.js:1623 / 2146` | `stash list` | no (substring match) | benign |
| `run-chains.js:628 / 630` | `diff --name-only` + `ls-files --others` | **yes** | **MISSED — LIVE fail-open in the chain-scope gate**, see (iv) |
| `adaptive-schema.js:438-440` | `status --porcelain` (`parsePorcelainPaths`) | **yes** | **MISSED — LIVE, causes a FALSE GREEN**, see (i) |
| `adaptive-schema.js:1040` | `worktree list --porcelain` | yes (abs paths) | benign — compares via `realpathSync`, a mangled path throws and yields `false` |
| `adaptive-schema.js:1100` | `ls-tree -r <tree>` | **yes** | latent — see (v) |
| `adaptive-schema.js:1138 / 1167` | `diff --name-only` + `ls-files --others` | **yes** | latent — see (v) |

### (i) `parsePorcelainPaths` — adaptive-schema.js:438 — **LIVE DEFECT, false green**

```js
function parsePorcelainPaths(statusText) {
  const result = [];
  const lines = String(statusText || '').split('\n');
  for (const line of lines) {
    if (line.length < 3) continue;
    let p = line.slice(3);
    const arrowIdx = p.indexOf(' -> ');
    if (arrowIdx >= 0) p = p.slice(arrowIdx + 4);
    if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);   // strips quotes, does NOT unescape
    p = p.trim();                                                    // kills a trailing space
    if (p) result.push(p);
  }
  return result;
}
```

Eight call sites: `claim.js:626, 3185, 3339, 3793, 4487` and `sink-merge.js:311`.

Measured against `fx1` (`git status --porcelain -uall`):

```
parsePorcelainPaths => (4 records)
  "kaola-workflow/issue-1/new\\nline.md"     startsWith=true   parked=true
  "kaola-workflow/issue-1/n\\303\\266te.md"  startsWith=true   parked=true
  "kaola-workflow/issue-1/qu\\\"ote.md"      startsWith=true   parked=true
  "kaola-workflow/issue-1/trailing.md"       startsWith=true   parked=true   <- space LOST
-z GROUND TRUTH:
  "kaola-workflow/issue-1/new\nline.md" / "…/nöte.md" / "…/qu\"ote.md" / "…/trailing.md "
```

The quote-strip means the **classification** survives (`startsWith`, `isParkedLanePath` are correct).
The **values** are all wrong: escapes are never decoded, and the trailing space is trimmed away. Two
call sites **act on the value**, not just classify it:

**`claim.js:3185` `listResidueOutsideProject`** — `fs.lstatSync(path.join(mainRoot, rel))` on a mangled
path throws → `continue` → the file is silently dropped from the residue mirror **and** from the
`machineryAuthoredPaths` subtraction that `probeImplementationCommit` depends on.

**`claim.js:4487-4506` `cmdFinalize`** — the mangled path goes straight into a pathspec:

```js
execFileSync('git', ['-C', root, 'add', '-A', '--', ...residue], { encoding: 'utf8', stdio: 'inherit' });
} catch (_) { /* staging failure — do NOT cascade into a commit */ }
```

Reproduced in `fx8` with **the #900 incident's own filename**:

```
$ git status --porcelain | od -c
   ? ?   i m p l . j s \n ? ?   " n o t e s . m d   " \n
$ parsePorcelainPaths => ["impl.js","notes.md"]
$ git add -A -- impl.js 'notes.md'
fatal: pathspec 'notes.md' did not match any files
EXIT=128
$ git diff --cached --name-only        # (empty)
$ git diff --cached --quiet ; echo $?
0      <- NOTHING staged, not even impl.js
```

Chain of consequence: one bad pathspec aborts the **entire** `git add` → `catch (_) {}` swallows it →
`hasFinalStaged = false` → `finalize_transaction.finalize_commit = 'nothing_to_commit'` → finalize
**reports success** having staged and committed nothing. Same result with `nöte.md` (`fx7`,
`fatal: pathspec 'n\303\266te.md' did not match any files`, exit 128, nothing staged).

This is a live false green in the finalize transaction, reachable by the exact filename shape that
caused #900. **It is not in #907.**

### (ii) `sink-merge.js:1449` — sink preflight bucket classifier — **LIVE, fails CLOSED**

A **second, divergent** porcelain parser sits inline here and — unlike `parsePorcelainPaths` — does
**not** strip quotes:

```js
const lines = porcelain.split('\n').filter(Boolean);
...
let filePath = line.slice(3).trim();
```

So `filePath` retains the surrounding `"`. Every classification below is a prefix/exact/regex test on
it, and all of them then fail:

- bucket 1 `/^kaola-workflow\/\.roadmap\/issue-(\d+)\.md$/` → no match
- bucket 2 `projStateFiles.includes(filePath)` → no match
- `SINK_RECEIPT_EXEMPT` `/^kaola-workflow\/(?:archive\/)?[^/]+\/\.cache\/sink-receipt\.json$/` → no match
- **#893 own-archive-mirror exemption** `filePath.startsWith('kaola-workflow/archive/' + project + '/')` → **no match**
- `worktreePaths` membership → no match

→ falls through to `foreignDirt.push(filePath)` → `{ ok:false, reason:'sink_blocked' }` with zero mutation.

**This is the permanent-block shape #907 was looking for, at a site it does not name.** When the
mis-classified path is the run's **own archive mirror** (a `.cache/notes.md ` inside
`kaola-workflow/archive/<project>/`), the operator cannot resolve it the way the refusal instructs —
"commit/stash/restore" — because the file is the run record the pending `archive_commit` step is about
to land, and every re-run reproduces the identical refusal. One mitigation vs. #900: the quotes are
**retained** in `foreign_dirt`, so the operator at least sees `"…/notes.md "` rather than a silently
stripped name. Renaming the file is a remedy, but nothing in the refusal points at it.

### (iii) `worktree list --porcelain` readers — claim.js:4733, 5739

`git worktree list --porcelain` C-quotes a worktree path containing non-ASCII or specials, and the
parser is `line.slice(0, idx)` / `line.slice(idx + 1)` with `split('\n\n')` block separation. A
`worktree` value that is quoted is then handed to `fs.realpathSync` (5757) — which throws and is
caught, so a legacy worktree at such a path is silently skipped from cleanup. **Fail-open, latent.**
`git worktree list --porcelain -z` exists (records NUL-separated, blocks NUL-NUL) and is the conversion.
`adaptive-schema.js:1040` has the same shape but is benign: the value is only ever compared through
`realpathSync` inside a `try` returning `false`.

### (iv) `run-chains.js:628/630 computeChangedFiles` — **LIVE fail-open in the chain-scope decision**

This feeds `isEditionCouplingPath`, whose own comment claims the decision is "**fail-closed by
construction**". Measured (`fx9`) — it is not:

```
$ git ls-files --others --exclude-standard | od -c
   " p l u g i n s / k a o l a - w o r k f l o w / s c r i p t s / n \ 3 0 3 \ 2 6 6 t e . j s " \n
     p l u g i n s / … / t r a i l . j s   \n

computeChangedFiles => [
  "\"plugins/kaola-workflow/scripts/n\\303\\266te.js\"",
  "plugins/kaola-workflow/scripts/trail.js"
]
isEditionCouplingPath prefix test  p.indexOf("plugins/")===0 :
  "\"plugins/…/n\\303\\266te.js\"" => false     <-- edition-coupling path reads as claude-only
  "plugins/…/trail.js"             => true
```

An edition-touching diff whose only edition-touching path is C-quoted is classified **claude-only**, so
`run-chains` runs one chain where the design demands four. This is precisely the "B1 fail-open hole"
the comment at `run-chains.js:651-659` says it closes. `#907` does not mention `run-chains.js` at all.

### (v) `adaptive-schema.js:1100, 1138, 1167` — `computeCodeTreeHash` / `filterVisiblePaths`

`ls-tree -r <tree>` and `diff --name-only` both quote. `computeCodeTreeHash:1100` splits on tab and
hashes the surviving lines — a quoted path still hashes deterministically, so the **hash** is stable;
what breaks is `isValidationInvisible(rel, …)`, which is a prefix/suffix classifier: a quoted path is
never classified invisible, so it is always counted visible. Direction is **fail-closed but consistent**
(both producer and gate reach the same one function), so it produces a spurious `chains_stale` rather
than a false pass. Latent, lowest priority; convert for uniformity, not urgency.

Files with **zero** newline-splitting readers of git output: `kaola-workflow-closure-audit.js`,
`kaola-workflow-sink-pr.js`. (Both swept; the issue's silence about them is correct.)

---

## Part 3 — the `.git` claim: FALSE as written, real block found next door

### 3a. The measured no-op (issue's claim 7) — **HOLDS**

Fixture `fx2`, a regular FILE named `.git` inside the archive:

```
$ git add -f -- kaola-workflow/archive/issue-1/.git ; echo $?
0
$ git status --porcelain            # (empty)
$ git ls-files
kaola-workflow/archive/issue-1/workflow-state.md
$ git status --porcelain -uall      # (empty)   <-- git is completely blind to it
$ git add -f -- kaola-workflow/archive/issue-1 ; echo $?
0
$ git ls-files                      # unchanged
```

Exit 0, nothing indexed, and `status -uall` does not even report it. Confirmed.

### 3b. "…therefore a permanent `sink_incomplete`" — **FALSE**

The `.git` entry is removed from the required set before the blob gate ever sees it. Running the
shipping `requiredArchiveFiles` **verbatim** (extracted from `scripts/kaola-workflow-sink-merge.js`,
not retyped) against `fx2`:

```
requiredArchiveFiles => [ "kaola-workflow/archive/issue-1/workflow-state.md" ]
```

`.git` is absent → not in `requiredPaths` → not in `missingBlobs` → the arm at `sink-merge.js:2379`
(`if (!archiveIgnored && missingBlobs.length > 0)`) never fires. **No refusal exists to be permanent.**

Confirmed by `fx3`: with the `.git` FILE present, `git add -- <archive dir>` exits 0 and stages **both**
sibling files; `git add -f` on each also exits 0. The `.git` file is simply never committed — a silent,
unreported evidence loss of one pathological file, not a block.

### 3c. "The bundle … did not fix the first [instance]" — **FALSE, there was no first**

```
$ git log -L 1340,1352:scripts/kaola-workflow-sink-merge.js --oneline
7350ba9c fix(finalize,sink,closure): …
+function requiredArchiveFiles(mainRoot, archiveRel) {
+      if (entry.name === '.git') continue;          <-- present in the ADDING commit
```

The whole function is **new** in `7350ba9c`, skip included. And at the pre-bundle commit `9b68b096`,
`grep` for `missingBlobs|archive_missing_paths|requiredArchiveFiles|blobPathsUnder` returns **nothing** —
the per-file blob gate did not exist. So a `.git`-named file could not have produced a
`sink_incomplete` before the bundle either. The issue's history is wrong in both directions.

### 3d. The REAL permanent block — the **gitlink**, which the skip does NOT cover

Two ways an archive acquires one: a nested repository (`.git` **directory**), or a **valid** `.git`
gitfile (a linked worktree whose gitdir resolves). Both make git collapse the whole directory into a
single `160000 commit` index entry.

`fx4` (nested repo at `kaola-workflow/archive/issue-1/`):

```
$ git status --porcelain -uall
?? kaola-workflow/archive/issue-1/
$ git add -- kaola-workflow/archive/issue-1 ; echo $?
warning: adding embedded git repository: kaola-workflow/archive/issue-1
0
$ git ls-tree -r HEAD
100644 blob 4286f42…  README.md
160000 commit 988d40a…  kaola-workflow/archive/issue-1        <-- ONE gitlink, no blobs beneath
$ git ls-tree -r -z --name-only HEAD -- kaola-workflow/archive/issue-1 | od -c
  k a o l a - w o r k f l o w / a r c h i v e / i s s u e - 1 \0      <-- blobPathsUnder sees ONLY this

$ requiredArchiveFiles (verbatim) =>
 [ "kaola-workflow/archive/issue-1/.cache/evidence.md",
   "kaola-workflow/archive/issue-1/workflow-state.md" ]              <-- BOTH still demanded

$ git ls-files -o -i --exclude-standard -z -- kaola-workflow/archive/issue-1    # empty
                                                     => forcePaths is EMPTY, no force-add attempted

$ git add -f -- kaola-workflow/archive/issue-1/workflow-state.md
fatal: Pathspec 'kaola-workflow/archive/issue-1/workflow-state.md' is in submodule 'kaola-workflow/archive/issue-1'
EXIT=128                       <-- the operator's ONLY lever also fails, permanently
```

`fx5` (a **valid** `.git` gitfile — a real `git worktree add` planted in the archive) reproduces the
same collapse: `ls-files` shows `kaola-workflow/archive/issue-1/wt` as a gitlink while
`requiredArchiveFiles` demands `kaola-workflow/archive/issue-1/wt/a`.

**Non-convergence is proven, not inferred:** `missingBlobs` is non-empty on every run; `forcePaths` is
empty so the force-add never runs; and even a hand `git add -f` exits 128. The refusal at
`sink-merge.js:2379-2397` says *"The archive_commit step is left NOT done so a re-run retries it"* —
and the retry is byte-identical. Nothing in the envelope, the receipt, or `archiveIncompleteRemedy`
names an embedded repository. The **only** hint is git's own
`warning: adding embedded git repository` on inherited stderr (execFileSync inherits stderr by default),
which is absent from the typed envelope and from `addErrors` (the add exits 0, so nothing is thrown).

**Why the current skip misses it:** `if (entry.name === '.git') continue;` skips the `.git` **entry**
and keeps walking that directory's siblings. The gitlink boundary makes those *siblings* unreachable.
A fix must skip the **entire subtree rooted at any directory that contains a `.git` entry**, not the
entry alone — and should say so in the refusal when it declines.

**This raises #907's severity while invalidating its stated mechanism.** Acceptance criterion 3 is
still the right criterion; its rationale needs replacing.

---

## Part 4 — the journal regexp (acceptance criterion 4)

Exactly three copies of `/(^|\/)sink-(receipt|fallback)\.json$/`, all in `claim.js`:

| file:line | context |
|---|---|
| `scripts/kaola-workflow-claim.js:2533` | `.filter(rel => !/…/.test(rel));` — `missingFromMain` in `archiveProjectDir` |
| `scripts/kaola-workflow-claim.js:2715` | `.filter(p => !/…/.test(p));` — `ignoredArchiveEvidence` |
| `scripts/kaola-workflow-claim.js:4490` | `if (/…/.test(rel)) continue;` — `cmdFinalize` residue staging |

No fourth copy in any script (searched `scripts/`, `plugins/`, `.claude`, `.codex`, `.opencode`,
`.kimi`, `templates/`, `docs/` — dot-dirs named explicitly, since `grep` here is ugrep and skips them).

Two things worth naming that the issue does not:

1. **A looser fourth variant exists in the suite**: `scripts/simulate-workflow-walkthrough.js:10415`
   uses `/sink-(receipt|fallback)\.json/` — **unanchored**. If the three are hoisted to one exported
   constant, this assertion is a *different* predicate and must not be silently pointed at it.
2. **The same two names are encoded a second way**: `sink-merge.js:1314`
   `const SINK_STAGE_SKIP = new Set(['sink-receipt.json', 'sink-fallback.json'])`, plus four pathspec
   literals at `sink-merge.js:2173-2176` (`excludeReceipt`/`excludeFallback`/`excludeLive*`). "The
   journal regexp has one definition" is satisfiable by hoisting three regexps; "the journal name set
   has one definition" is the larger, and probably intended, target. Flagging the scope choice rather
   than deciding it.

---

## Part 5 — PORT SURFACE (acceptance criterion 5)

Every site located in all four copies by exact source-line match. **Every site is present in every
edition** — the defect is uniform, only the line numbers move.

### claim.js family

| Site | canonical | Codex plugin | GitLab port | Gitea port |
|---|---|---|---|---|
| for-each-ref reap ×2 (safe) | 2577, 5133 | 2577, 5133 | 2356, 5417 | 2355, 5408 |
| `probeImplementationCommit` diff | 3349 | 3349 | 3158 | 3155 |
| `probeImplementationCommit` log | 3361 | 3361 | 3170 | 3167 |
| `checkFinalizeStagingGuard` | 3377 | 3377 | 3186 | 3183 |
| `for-each-ref refname:short` (safe) | 4788 | 4788 | 4556 | 4551 |
| journal regexp #1 | 2533 | 2533 | 2312 | 2311 |
| journal regexp #2 | 2715 | 2715 | 2493 | 2492 |
| journal regexp #3 | 4490 | 4490 | 4253 | 4248 |

Paths: `scripts/kaola-workflow-claim.js` · `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` ·
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` ·
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`

### sink-merge.js family

| Site | canonical | Codex plugin | GitLab port | Gitea port |
|---|---|---|---|---|
| `assertBranchHasNonWorkflowChanges` | 451 | 451 | 411 | 410 |
| `.git` skip in `requiredArchiveFiles` | 1346 | 1346 | 1388 | 1381 |
| preflight bucket classifier | 1449 | 1449 | 1474 | 1467 |

Paths: `scripts/kaola-workflow-sink-merge.js` · `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` ·
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` ·
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`

### adaptive-schema.js family — identical line numbers in all four (byte-identical anchor)

`parsePorcelainPaths` **440** · worktree-list reader **1040** · `computeCodeTreeHash` **1100** ·
`visibleChangedPathsSince` **1138** · `headAdvanceIsValidationInvisible` **1167**

Paths: `scripts/kaola-workflow-adaptive-schema.js` ·
`plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js` ·
`plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js` ·
`plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js`
(all four MD5 `57e83365115aa84fc3bf82ffad2cff8a` — verified identical at HEAD)

### run-chains.js — canonical only

`scripts/kaola-workflow-run-chains.js:628, 630`. No plugin copy exists (`find` returns one file).

### What enforces byte-identity, and what it exempts

`node scripts/validate-script-sync.js` → exit 0:
`OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families
(config + hooks dir), and 6 forge export-superset families in sync. / committed kernel parity: 4 Oracle
Kernel copies identical at HEAD.`

- **`COMMON_SCRIPTS` enforces canonical ↔ Codex plugin BYTE-identity** for `kaola-workflow-claim.js`,
  `kaola-workflow-sink-merge.js`, `kaola-workflow-sink-pr.js`. Verified independently: MD5 of canonical
  and Codex claim both `328edf1e9e8921c7d2cc53bf3a036d2b`; sink both `d52faf11ca7ac13ad8d37d7a23320d0d`.
  → the Codex copy is a `cp`, never a hand edit.
- **`KERNEL_COPIES` / `checkCommittedKernelParity` enforces all four `adaptive-schema.js` copies identical
  at HEAD.** → any `parsePorcelainPaths` fix must be applied once and materialized to four.
- **EXEMPT: the GitLab and Gitea ports of `claim` and `sink-merge` are policed by NOTHING.** They are
  absent from `COMMON_SCRIPTS`, absent from `RENAME_NORMALIZED_FAMILIES` (which holds exactly one
  family, `codex-compact-resume`), and `scripts/edition-sync.js:30-34` states outright: *"The data-layer
  forge ports (claim / sink-merge / sink-pr / active-folders / classifier / roadmap) stay HAND-PORTED …
  and are NOT touched here"* (measured 2026-07-29: forge vocabulary is 2.5% of claim's divergence).
  `node scripts/edition-sync.js --check` → exit 0, and covers 8 *aggregator* ports only.

**Practical consequence for the fix:** three hand edits (canonical, GitLab, Gitea) plus one `cp` to the
Codex plugin for each of `claim.js` and `sink-merge.js`; one edit plus a four-way materialize for
`adaptive-schema.js`; one edit for `run-chains.js`. **No automated check will catch a forge port that is
missed** — coverage for GitLab/Gitea is behavioral (per #342) and must be asserted by tests, not parity.

---

## Inferences (labelled — these are mine, not measurements)

- **The class is live, not latent** — confidence: high. Refuted by: showing that neither
  `cmdFinalize`'s `git add -A -- ...residue` nor `sinkPreflight`'s bucket classifier can be reached with
  a quoted/whitespace path in a real run. I did not run a full end-to-end finalize; I measured the exact
  parse, the exact pathspec, and git's exact response to it.
- **The `.git` gitlink block is the issue's real content** — confidence: high for the mechanism
  (three fixtures), medium for how often an archive acquires a nested repo or planted worktree. Refuted
  by: a rule elsewhere that removes nested `.git` trees before archiving. I found none.
- **The right fix shape is `-z` at each path reader plus ONE shared NUL-splitting helper**, mirroring
  the four converted readers' existing wording — confidence: medium-high. `parsePorcelainPaths` needs
  `status --porcelain -z` at all eight call sites (the `-z` porcelain format has **no rename arrow** —
  rename records are two NUL-separated fields — so the parser body changes, not just the split). That is
  a real behavioural edit to the ×4 anchor and is the highest-risk part of this issue.
- **Acceptance criterion 3's rationale should be rewritten before implementation**, since the stated
  cause is false and the true cause needs a different fix (subtree skip, not entry skip) — confidence: high.

## Open (unmeasured, and why)

- **No end-to-end `--sink` / `finalize` run** against a hazard-named fixture. Every link in the chain is
  measured in isolation (parse → pathspec → git exit → staged set → probe exit), but the composed run is
  not. Cheap to add and worth it before the fix lands, as the positive control.
- **`core.quotePath=false`** was not tested. A consumer setting it changes which paths quote (non-ASCII
  stops quoting; `"`/`\`/control chars still quote) and therefore which sites misfire. Worth one fixture.
- **Windows / `core.autocrlf`** paths untested (darwin only). `adaptive-schema.js:1100` already strips
  `\r`; the other readers do not.
- **How a run archive realistically acquires a nested `.git`** — not enumerated. It determines whether
  the gitlink fix is urgent or merely correct.

---

# Appendix — 2026-08-02: the false green, settled END-TO-END

**Answer to the clarification: my first report was (b) — INFERRED-FROM-LINKS.** I had measured
`parsePorcelainPaths` mangling the name (real module), a hand-typed `git add -A -- impl.js 'notes.md'`
exiting 128 with nothing staged, and read the `catch (_) {}` at `claim.js:4506`. I had **not** invoked
`cmdFinalize`. The "REPRODUCED" wording in Part 2 (i) overstated that; the Open section was the
accurate one. Corrected here.

**I have now run it. Verdict: MEASURED-END-TO-END.** The false green reproduces through the real CLI.

## Reachability correction (found by the first attempt failing)

The staging block at `claim.js:4487-4506` is **not** reached by an in-place finalize. It is nested
inside two gates:

- `claim.js:4402` — `if (args.keepWorktree) {`
- `claim.js:4407` — `if (mainRoot2 && mainRoot2 !== linkedRoot2) {`  ← **linked worktree only**

My first fixture pair (`e2e-hazard` / `e2e-control`, in-place, no `--keep-worktree`) returned
`finalize_commit: "skipped"` for **both** legs. That is itself worth recording: **an in-place finalize
never executes this staging path at all**, so the defect's blast radius is *linked-worktree runs with
`--keep-worktree`* — which is the documented finishing sequence for this project's own runs.

## Setup (one axis)

Two fixtures, identical in every respect except the presence of one file:

```
<name>-main/    git init -b main, seed commit
<name>-wt/      git worktree add -b workflow/issue-1     <-- LINKED worktree
  kaola-workflow/issue-1/workflow-state.md         (committed)
  kaola-workflow/issue-1/.cache/evidence.md        (committed)
  src/app.js                                       (committed: "feat: implementation")
  src/pending-good.js                              UNTRACKED  <- the residue finalize must carry
  'notes.md '                                      UNTRACKED  <- HAZARD LEG ONLY (one trailing space)
```

Pre-run status, verbatim:

```
=== HAZARD worktree status:        === CONTROL worktree status:
?? "notes.md "                     ?? src/pending-good.js
?? src/pending-good.js
```

Command, identical for both legs:

```
cd <name>-wt && KAOLA_WORKFLOW_OFFLINE=1 \
  node /Users/ylpromax5/Workspace/Kaola-Workflow/scripts/kaola-workflow-claim.js \
       finalize --project issue-1 --keep-worktree --json
```

## Read-only precursor: `finalize --check` already shows the mangling

Both legs `ok:true`, exit 0. The hazard leg's own envelope carries the mangled name:

```json
"dirty_paths":["notes.md","src/pending-good.js"]      <-- HAZARD: trailing space already gone
"dirty_paths":["src/pending-good.js"]                 <-- CONTROL
```

The file on disk is `notes.md ` (with a space). `finalize --check` reports a path that does not exist.

## The runs

### CONTROL leg (`e3ctl`) — exit 0

stderr: *(empty)*

stdout (git `stdio:'inherit'` noise, then the envelope):

```
rm 'kaola-workflow/issue-1/.cache/evidence.md'
rm 'kaola-workflow/issue-1/workflow-state.md'
[workflow/issue-1 7d37ee5] chore: archive issue-1
 3 files changed, 18 insertions(+), 24 deletions(-)
[workflow/issue-1 4840842] chore: finalize issue-1
 1 file changed, 1 insertion(+)
 create mode 100644 src/pending-good.js
```

```json
"finalize_transaction":{"mirror":"source_absent","ledger_compare":"not_needed",
 "residue_mirrored":0,"impl_commit":"committed","roadmap_staged":true,
 "archive_commit":"deferred_to_sink","finalize_commit":"committed"}
```

```
$ git log --oneline
4840842 chore: finalize issue-1
7d37ee5 chore: archive issue-1
e888e7e feat: implementation
8224f5b seed
$ git status --porcelain -uall      # (clean)
$ git ls-tree -r HEAD --name-only | grep -c pending-good
1
```

### HAZARD leg (`e3haz`) — exit 0

stderr:

```
fatal: pathspec 'notes.md' did not match any files
```

stdout:

```
rm 'kaola-workflow/issue-1/.cache/evidence.md'
rm 'kaola-workflow/issue-1/workflow-state.md'
[workflow/issue-1 7d37ee5] chore: archive issue-1
 3 files changed, 18 insertions(+), 24 deletions(-)
                                          <-- NO `chore: finalize issue-1` commit
```

```json
"status":"closed", ... "closure_invariants":{"ok":true,"violations":[]},
"finalize_transaction":{"mirror":"source_absent","ledger_compare":"not_needed",
 "residue_mirrored":0,"impl_commit":"committed","roadmap_staged":true,
 "archive_commit":"deferred_to_sink","finalize_commit":"nothing_to_commit"}
```

```
$ git log --oneline
7d37ee5 chore: archive issue-1              <-- the finalize commit is MISSING
e888e7e feat: implementation
8224f5b seed
$ git status --porcelain -uall
?? "notes.md "
?? src/pending-good.js                      <-- the GOOD file survived uncommitted too
$ git ls-tree -r HEAD --name-only | grep -c pending-good
0
```

**The whole predicted chain is observed:** one hazard-named sibling → `git add` exits 128 → the
`catch (_) {}` swallows it → nothing staged, including `src/pending-good.js` → `git diff --cached
--quiet` returns 0 → `finalize_commit: "nothing_to_commit"` → **exit 0, `status: "closed"`,
`closure_invariants.ok: true`**.

## Positive control — the guard under test is demonstrably armed

`KAOLA_WORKFLOW_OFFLINE=1` was set on **both** legs, so it cannot be what suppressed the commit:
the control leg under the identical environment **did** author `chore: finalize issue-1` and **did**
commit `src/pending-good.js` (`1 file changed, 1 insertion(+)`). The staging path is live under this
env; the only variable that changed the outcome is the presence of `notes.md `.

## Convergence — it does NOT converge

Second `finalize` on the hazard fixture, same command:

```
fatal: pathspec 'notes.md' did not match any files
"finalize_transaction":{...,"archive_commit":"deferred_to_sink","finalize_commit":"nothing_to_commit"}
$ git log --oneline | head -3
7d37ee5 chore: archive issue-1        <-- still no finalize commit
$ git status --porcelain -uall
?? "notes.md "
?? src/pending-good.js
```

Byte-identical outcome, exit 0. Unlike #900 this does **not** brick — it is worse in the direction
that matters: the run **completes and reports closed** while the deliverable stays uncommitted, and a
re-run neither repairs it nor reports differently.

## Durability of the wrong name

`grep -rn "notes.md" <main>/kaola-workflow/archive/issue-1/` → **nothing**. The mangled path is not
written into the archived run record. It appears only in the live `finalize --check` envelope
(`dirty_paths`) and in git's own stderr line. So a reader of the archived run has **no trace at all**
that a file was dropped — the archived record is clean and the loss is invisible.

## What this changes for the fix

- Severity of the `parsePorcelainPaths` defect is confirmed at the highest level in this issue:
  a silent, non-convergent, exit-0 loss of the finalize commit on the project's own documented
  linked-worktree finishing sequence.
- Two independent faults compound and both want fixing: (1) the parse (`-z` + no trim), and (2) the
  `catch (_) {}` at `claim.js:4506` that turns a staging failure into `nothing_to_commit`. Fixing only
  (1) leaves any *other* cause of a failed `git add` equally silent. That second half is a judgement
  about refusal posture and belongs to whoever owns the fix, not to this report.
- The blast radius is `--keep-worktree` linked runs only; an in-place finalize returns
  `finalize_commit: "skipped"` and never reaches the block.

**Everything in this appendix is an observation reproducible by the commands above. The only
inference is the last bullet's "fixing only (1) leaves other causes silent", which follows from
reading `catch (_) {}` and is not separately measured.**

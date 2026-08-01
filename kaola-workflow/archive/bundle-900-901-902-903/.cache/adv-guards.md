# Adversarial falsification of the five guard claims (C1–C5)

Baseline `9b68b096`; uncommitted worktree `.kw/worktrees/bundle-900-901-902-903` on branch
`workflow/bundle-900-901-902-903`. Read-only on all tracked files — nothing in the worktree or the
main checkout was edited or reverted.

**Result: 4 of 5 refuted.** C1, C2, C3, C5 REFUTED. C4's central claim SURVIVED my attack (two
neighbouring defects found).

Method: real scripts driven over scratch fixtures under
`/private/tmp/claude-501/.../scratchpad/advguards/` (`c1.js`, `c23.js`, `c4.sh`, `gate.js`).
Every leg carries a single-axis control; `id -u` = **501** (chmod axes are live); exit codes read
with a bare `echo $?` / `spawnSync().status`, never through a pipe. `KAOLA_WORKFLOW_OFFLINE` set
explicitly on every invocation.

---

## Ranked refutations

### R1 — C2 REFUTED. Three evidence files DESTROYED at exit 0, one of them an exempt sidecar. (severe)

`archiveProjectDir` deletes **two** live copies but verifies only **one**.
`scripts/kaola-workflow-claim.js:2515-2523`:

```js
fs.rmSync(src, { recursive: true, force: true });          // worktree live folder — VERIFIED above
const mainLive = path.join(mainRoot, 'kaola-workflow', project);
if (fs.existsSync(mainLive)) {
  try {
    if (fs.realpathSync(mainLive) !== dest)
      fs.rmSync(mainLive, { recursive: true, force: true }); // main live folder — NEVER COMPARED
  } catch (_) {}
}
```

`verifyArchiveComplete(src, dest)` and the new `missingSidecars` re-check both read `src` — the
**worktree** live folder. `mainLive` is disposed of without any comparison against `dest` at all.

Reproducing case (`c23.js C2A`): linked run, worktree live folder holds 2 files, main's live folder
holds 5 — three of them main-only. `release --project issue-91001` invoked from the linked worktree:

```
exit=0
{"released":true,"project":"issue-91001","archived":true,
 "dest":".../kaola-workflow/archive/issue-91001.discarded-2026-08-01T15-04-43-713Z",
 "discard_archive_committed":true,"discard_archive_branch":"main"}

BEFORE main live folder:            AFTER archive/issue-91001.discarded-…:
  .cache/final-validation.md         .cache/shared.md
  .cache/MAIN-ONLY-evidence.md       workflow-state.md
  .cache/shared.md                  AFTER main live folder: <absent>
  finalization-summary.md
  workflow-state.md

>>> LOST FROM EVERYWHERE: [".cache/MAIN-ONLY-evidence.md",
                           ".cache/final-validation.md",
                           "finalization-summary.md"]
```

No `missing[]`, no warning, exit 0, and the thin archive was then committed to `main`.
`final-validation.md` is one of the five `ARCHIVE_CACHE_SIDECAR_MD` names the #901 change was
written to protect; the new re-check never looked at the tree that held it.

**Control (`c23.js C2B`)** — the guard IS armed on the `src` side, so this is a scope hole and not a
dead guard: with the worktree's `src/.cache` at mode 000 (arming axis printed: `readable? false`,
`uid=501`) the same command returns
`{"released":false,"result":"refuse","reason":"archive_exception","detail":"EACCES … scandir …"}`,
exit 1, and deletes nothing.

Three routes reach this delete with **no Step-8a mirror at all**, so the presence gap is not closed
by anything upstream:

| call site | command |
|---|---|
| `claim.js:4433` | `release` / `discard` |
| `claim.js:5350` | `watch-pr` (PR reported MERGED) |
| `claim.js:5442` | active-folders backstop, abandon |

On `cmdFinalize` (`claim.js:3875`) Step 8a's `mergeCopyDir(srcDir, destDir, …)` normally makes
worktree ⊇ main, so the gap is closed there **by name** — except for entries `mergeCopyDir` skips:
`if (entry.isSymbolicLink()) continue;` (`claim.js:3081`).

Severity: this is the one thing the design says must refuse ("an archive that would lose a file"),
and it loses files silently.

---

### R2 — C3 REFUTED. `--check` reports `ok:true / pending_mirror`, then the transaction crashes untyped. (severe)

This is exactly the dangerous direction named in the dispatch. `probeFinalizeMirror` probes
writability **only in the `sync_required` arm**, and it probes the *source*
(`claim.js:3396-3399`, `fs.accessSync(srcDir, W_OK)`). The `'ready'` arm — the one
`predictFinalizeAuthority` reads to promise that Step 8a will *construct* the authority — probes
nothing about the destination it is promising to create.

Reproducing case (`c23.js C3-readonly-kaola-workflow`): linked run; main holds the live folder, the
worktree holds none (`destAbsent`); the worktree's `kaola-workflow/` is `chmod 555`.
Arming axis printed: `worktree kaola-workflow/ writable? false (must be false); uid=501`.

```
--check exit=0
  ok=true  reasons=[]
  checks.workflow_state="pending_mirror"  checks.mirror="ready"
  authority={"source":"pending_mirror","source_dir":"<main>/kaola-workflow/issue-92002",
             "dest_dir":"<wt>/kaola-workflow/issue-92002", …}

EXECUTION exit=1
  envelope=null
  stderr: EACCES: permission denied, mkdir '<wt>/kaola-workflow/issue-92002'
```

All five predicate conjuncts hold, `--check` says proceed with an empty `reasons`, and the
transaction then dies. Two distinct defects in one shot:

1. the prediction is unfalsified — `mirror.state === 'ready' && destAbsent` promises a `mkdirSync`
   nothing tested;
2. the failure emits **no typed envelope at all**. `mergeCopyDir(srcDir, destDir,
   FINALIZE_MIRROR_DEST_OWNED)` at `claim.js:3221` is unguarded, so the operator gets a bare node
   error line instead of the `mirror_sync_failed` refusal that exists a few lines above it for the
   other direction.

**Positive control (`c23.js C3-none`)** — identical topology, `kaola-workflow/` writable:
`--check` exit 0 / `ok=true` / `pending_mirror`, and execution **exit 0**. The single axis between
the passing and failing legs is the destination mode, nothing else.

A second variant (`C3-file-at-kaola-workflow`, a regular file where the directory belongs) is caught
by `--check` (`reasons:["archive_authority_invalid_type"]`, exit 1) — but incidentally, by
`resolveFinalizeAuthority` choking on the file, not by the predicate; its execution also dies
untyped (`ENOTDIR … mkdir`).

---

### R3 — C1 REFUTED (a). Permanent, non-convergent `sink_incomplete` on a whitespace-bearing archive filename. (moderate; too aggressive AND self-defeating)

`-z` output is split on NUL and then **trimmed**:

- `kaola-workflow-sink-merge.js:1357` — `ignoredUntrackedUnder`: `out.split('\0').map(s => s.trim())`
- `kaola-workflow-sink-merge.js:1368` — `blobPathsUnder`: same
- `kaola-workflow-claim.js` `ignoredArchiveEvidence`: same

`requiredArchiveFiles` builds its names from `fs.readdirSync` and does **not** trim them, so a name
with leading or trailing whitespace can never match either set. Measured git fact (`od -c` of
`git ls-files -o -i --exclude-standard -z`): the byte stream is
`d/notes.md \0` — the trailing space is really there, and `.trim()` is what removes it. The `-z`
flag was chosen precisely so a pathname is never mangled; `.trim()` undoes it.

Reproducing case (`c1.js A3`): consumer `.gitignore` body `.cache/` (the exact #901 shape), archive
`.cache` holding `plain.md` and `notes.md ` (one trailing space):

```
exit=1
{"result":"refuse","reason":"sink_incomplete","step":"archive_commit",
 "archive_missing_paths":["kaola-workflow/archive/issue-99003/.cache/notes.md "],
 "archive_add_errors":["git add: … The following paths are ignored …"]}
BLOBS at HEAD: .cache/plain.md, finalization-summary.md, workflow-state.md
```

`plain.md` was force-added and became a blob; `notes.md ` was **excluded from `forcePaths`** by the
trim mismatch, so the repair the guard exists to perform never ran on it — and then the guard
refused over its own omission. `archive_forced_paths` never named it.

**Non-convergent** (`c1.js A7`, three consecutive sink runs on one fixture):

```
A7 attempt 1: exit=1 reason=sink_incomplete missing=[".../.cache/notes.md "]
A7 attempt 2: exit=1 reason=sink_incomplete missing=[".../.cache/notes.md "]
A7 attempt 3: exit=1 reason=sink_incomplete missing=[".../.cache/notes.md "]
```

The refusal advertises "a re-run retries it", but the computation is deterministic: the run can
never be sinked. That is a bricked repo, from a filename.

Surviving axes on the same helper (all measured green, `c1.js A5`/`A6`): non-ASCII
(`ünïcödé-日本.md`), an **embedded newline** (`a\nb.md`), nested directories, and 0-byte files all
force-add and verify correctly. `-z` handles interior bytes fine; only leading/trailing whitespace
is destroyed. (`receipt.archived_paths` shows C-quoted names for those two — `stagedPathsUnder` is
not `-z` — cosmetic only, the blob verdict is right.)

---

### R4 — C1 REFUTED (b). `steps.archive_commit:"done"` over an archive path absent from the commit and from a fresh clone. (moderate)

`requiredArchiveFiles` (`sink-merge.js:1335`) skips every symlink, justified in-comment by:

> "Symlinks and any nested `.git/` are skipped — neither becomes a blob under the archive path, so
> requiring them could only manufacture a false incompleteness."

That premise is false. Measured:

```
$ git add -f -- 'd/link.md'     # exit 0
$ git ls-files -s -- d/
120000 b19e3def79a8600d33b3b98445f4eb55de074a48 0	d/link.md
```

A symlink is a mode-120000 **blob**. Excluding it from the required set is what makes the following
possible (`c1.js A8`, `.gitignore` body `.cache/`, archive `.cache` holding `plain.md` plus a
symlink `link.md -> plain.md`; precondition printed: `check-ignore` on the symlink exits **0**):

```
exit=0 status=sinked
receipt.steps = {"preflight":"done","push_upstream":"done","merge":"done","finalize":"done",
                 "stash_restore":"done","archive_commit":"done","push_main":"done","closure":"done"}
receipt.archive_missing_paths = undefined
symlink on disk = true
blobs = [".cache/plain.md","finalization-summary.md","workflow-state.md"]
fresh clone holds the symlink? false
```

`archive_commit: "done"`, exit 0, and an archive entry that does not survive a fresh clone — the
precise property C1 asserts is impossible. Low real-world frequency (a symlink in a run archive is
unusual), but the claim is stated as an absolute and the exclusion rests on a measurably wrong fact.

---

### R5 — C1, adjacent: a space-named archive file blocks the sink at PREFLIGHT. (moderate; false refusal, outside C1's own surface)

Same whitespace root class, a different consumer. With no relevant ignore rule at all (`.gitignore`
body `node_modules/`) and one archive `.cache` file named `notes.md ` or ` lead.md`, the sink never
reaches `archive_commit`:

```
c1.js A1  exit=1  {"result":"refuse","reason":"sink_blocked"}
c1.js A2  exit=1  {"result":"refuse","reason":"sink_blocked"}
```

**Control (`c1.js A0`)** — byte-identical fixture, plain filenames: `exit=0`, `status:"sinked"`, all
four archive paths blobs at HEAD. So the space is the axis, not the fixture.

Mechanism, measured: `git status --porcelain -uall` **C-quotes** whitespace-bearing paths
(`?? "d/notes.md "`, `?? "d/ lead.md"`), so the #429/#715 preflight classifier's prefix match against
the archive path fails and the file reads as foreign dirt. This is pre-existing (#429/#715 territory,
not #901), reported here because it is the same defect class and shows the whitespace hole is not
confined to the new helpers.

---

### R6 — C5 REFUTED. `record` writes inside `kaola-workflow/archive/**` by two independent routes. (moderate)

The cwd-binding half of C5 survived (below). The "must never write inside
`kaola-workflow/archive/**`" half is refuted twice.

**Route 1 — `--project archive`.** `isSafeProjectSegment` (`validation-runner.js:1093`) accepts any
single non-dot segment, and `archive` is one:

```
$ cd <repo> && node …/kaola-workflow-validation-runner.js record --project archive \
      --verdict pass --command "npm test"
{"outcome":"recorded",
 "record_path":"<repo>/kaola-workflow/archive/.cache/final-validation.md",
 "validated_candidate_hash":"a2514a4c…","verdict":"pass",…}
exit: 0
```

It compounds: `closure-audit` walks every directory under `archive/`, so the stray `.cache` becomes
a phantom project with permanent, by-design-unrepairable drift:

```
"archive_content_incomplete": [ { "project": ".cache", "missing": ["workflow-state.md"] } ]
"counts": { …, "archive_content_incomplete": 1 }
```

**Route 2 — `--output`.** `writeCliResult` (`validation-runner.js:1249`) does
`writeFileAtomicReplace(path.resolve(outputPath), …)` with no band check, so a path inside a real
closed archive is accepted:

```
$ node …record --project issue-5 --verdict pass --command "npm test" \
       --output kaola-workflow/archive/issue-9/.cache/injected.json
exit: 0
$ ls kaola-workflow/archive/issue-9/.cache/ → injected.json
```

---

## C4 — SURVIVED my attack

`current_project_clean` never read `true` on any run I could make non-evaluating.

**The offline leg is genuinely armed, with a positive control** (`c4.sh B1` / `B1b`, same repo, only
`KAOLA_WORKFLOW_OFFLINE` differing):

```
B1  offline=true   current_project_clean=false
      stale_in_progress_labels="skipped_offline"  unarchived_pr_folders="skipped_offline"
B1b offline=false  current_project_clean=true      stale_in_progress_labels=[]
```

Two non-array `skipped_offline` classes make `driftIsClean` return false. Note the mechanism is
*indirect*: `probeIssueState` returns `{state:'open', reason:'offline-or-null'}` offline
(`active-folders.js:167`), so `collectClosedSet` puts nothing in `closed` **or** `unresolved` and the
three remote-dependent classes silently read empty-for-the-wrong-reason. Clean is held false only by
the two classes that happen to token their skip. That is a single point of failure, not defence in
depth — if either class ever becomes an array offline, an offline run reads clean.

Scope-resolution attacks, all measured, all correct:

| case | result |
|---|---|
| `B2` prefix collision `--project issue-77` vs archive `issue-777` | `issue-777` lands in `repository_drift_outside_scope`; `clean=true` correctly |
| `B3` `--project <P>.archived-<ts>` passed directly | resolves; scopes to exactly that folder; bare `P`'s drift goes outside scope |
| `B5` `kaola-workflow/archive` at mode 000 (arming axis: readable? 0) | **exit 1**, uncaught `EACCES … scandir` — no clean verdict is reachable |
| `B7` one archive subdir at mode 000 | `assert` fires, exit 1 |
| `B8` `.discarded-*` sibling incomplete | attributed, `clean=false` |

Two neighbouring defects found (neither refutes the claim as stated):

- **C4-a: a mistyped `--project` still answers `clean:true` when any `--issue` is also passed.**
  `resolveScope`'s own comment says "An unresolvable --project must not answer 'clean'. Reporting a
  clean verdict for a mistyped project name is exactly the silent-scoping failure this flag exists
  to remove" — and `assert(found.resolved || args.issues.length > 0, …)` disarms it. Measured
  (`c4.sh B6`):
  `scope={"project":"totally-made-up","issue_numbers":[4242],"state_file":null}`,
  `current_project_clean=true`, exit 0. `state_file:null` is the only tell.
- **C4-b: `archive_name_ambiguous` misses two timestamped siblings.**
  `archiveNameIsAmbiguous` requires a bare `P` **plus** a suffixed sibling. With
  `issue-99.archived-A` and `issue-99.archived-B` and no bare `P` (`c4.sh B4`), the scope resolved
  its issues from `-A` while `-B`'s finding was attributed to the same project as plain
  `"attribution":"name_match"`, no ambiguity flag. Fail-closed direction (`clean=false`), so this is
  a reporting gap, not a false pass. `annotateAttribution` also stamps only the bare-`P` half of a
  genuinely ambiguous pair.

**Gaps in my C4 attack** (so the holes are visible): I did not attack the online path with a gh mock
that *lies* about state, `--execute` under a scope for a wrong-project repair, `stateIssueNumbers`
against a malformed `issue_numbers` line, or a `closure_policy` other than `all_or_nothing`.

---

## C5 — the cwd-binding half SURVIVED my attack

Every topology I built produced producer/gate agreement or an honest refusal. `record`'s
`resolveCandidateRoot` and the gate's root both come from `git rev-parse --show-toplevel` of the
invoking cwd (`getRoot`, `active-folders.js:26`), so there is no divergence route through
`resolveFinalizeCheckRoot` — with `planRoot` already the cwd's top level, `cwdTop === planTop` always
and the redirect is a no-op in both.

| axis | result |
|---|---|
| invoked from a **subdirectory** (`deep/nest`) | same `candidate_root`, same hash `922fa3b1…`, gate `chains_green` from both cwds |
| invoked from repo root | `chains_green`, "agent validation recorded and bound to this tree" |
| **linked worktree**, folder in both trees | binds the linked tree, and `other_candidate_roots` + `operator_hint` name main explicitly |
| **detached HEAD** | recorded, warns |
| **zero-commit repo** | recorded (`read-tree HEAD` skipped as designed) |
| **bare repo** | `inconclusive` / `candidate_root_unresolved`, **exit 1** (bare `echo $?`) |
| missing project folder | `project_folder_missing`, **exit 1** |
| **merge rewrite** | idempotent — two consecutive records produce byte-identical files (`shasum dbddb1c2…` twice); a pre-existing `verdict: fail` + hash inside a **code fence** is correctly stripped (fence-blind, as documented) |

Two non-refuting observations: a **symlinked run folder** is followed by `fs.statSync`, so the record
lands outside the repo (`outcome:"recorded"`, exit 0) — the gate follows the same symlink so they
still agree, but the binding is not in the tree it claims; and stripping fenced owned lines leaves an
empty ``` fence behind (cosmetic).

**Gaps in my C5 attack**: I did not attack `GIT_DIR`/`GIT_WORK_TREE` overrides, a worktree nested
*inside* another worktree's checkout, a `--project` segment that is a `.archived-*` name, or
concurrent records racing the atomic replace.

---

## Summary table

| claim | verdict | most severe finding |
|---|---|---|
| C2 destruction gate | **REFUTED** | 3 files destroyed at exit 0; `mainLive` deleted uncompared |
| C3 `pending_mirror` prediction | **REFUTED** | `--check ok:true` then untyped `EACCES` crash |
| C1 sink blob gate | **REFUTED** ×2 | permanent `sink_incomplete` on a space-named file; `done` over a non-durable symlink |
| C5 recorder cwd binding | **REFUTED** (archive-write half) | `--project archive` / `--output` write into `kaola-workflow/archive/**` |
| C4 scoped verdict | **SURVIVED** | (adjacent) mistyped `--project` + `--issue` answers `clean:true` |

## Too-aggressive / false-refusal findings, called out separately

- **R3** — `sink_incomplete`, exit 1, permanently non-convergent, caused only by a trailing space in
  an archive filename. The refusal's own remedy ("a re-run retries it") is unreachable.
- **R5** — `sink_blocked` at preflight for the same filename class (pre-existing, #429/#715).
- **C3's untyped crash** — the transaction dies on a raw node error with no envelope, where
  `mirror_sync_failed` already exists as the typed answer for the sibling direction.
- **C4/B5** — `kaola-workflow/archive` unreadable produces an uncaught `EACCES … scandir` at exit 1
  rather than a typed report. Fail-closed, but the operator gets a stack-adjacent message.

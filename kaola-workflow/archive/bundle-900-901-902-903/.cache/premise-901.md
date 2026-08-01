# Premise investigation — issue #901

## VERDICT: PREMISE HELD

A successful direct sink silently omits the run's `.cache/` evidence from the archive commit when the
consumer's root `.gitignore` carries the basename rule `.cache/`: the sink's ignore probe
(`sink-merge.js:2111`) asks only whether the **archive directory** is ignored, `git add` then exits 1
with the ignore warning while still staging the non-ignored siblings, and both `git add` calls are
inside `try {} catch (_) {}` — so `steps.archive_commit` reads `"done"`, `archived_paths` names only
the three run-record files, and the sink exits 0.

Reproduced end-to-end against the shipped `scripts/kaola-workflow-sink-merge.js` on **both** archiver
postures, with a clean single-axis negative control that lands all five `.cache` files as blobs.

One reported sub-claim is narrower than stated: the `.cache` files are **not gone from disk** — they
survive in the untracked archive folder in the operator's checkout. What is lost is the *durable*
archive: they are absent from every commit, from the pushed remote, and from any fresh clone.

---

## Setup

- Repo / commit: `/Users/ylpromax5/Workspace/Kaola-Workflow` at `9b68b096` (clean; only the untracked
  `kaola-workflow/bundle-900-901-902-903/` present).
- `git version 2.50.1 (Apple Git-155)`; Darwin 25.6.0.
- Driver scripts (scratch, not tracked):
  - `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/p901/drive-901.js` — keep-worktree posture, 2 legs
  - `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/p901/drive-901-sole.js` — sole-archiver posture, 2 legs
  - `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/p901/fixture-lib.js` — shared fixture helpers
- Raw transcripts:
  - `…/scratchpad/p901/run-both.log` (keep-worktree, both legs)
  - `…/scratchpad/p901/run-sole.log` (sole-archiver, both legs)
- Fixture shape is scenario **(q)**'s from `scripts/test-sink-merge.js:1759` (keep-worktree) and
  `buildSoleArchiverFixture`'s from `scripts/test-sink-merge.js:211`, with **one axis changed**: the
  consumer's root `.gitignore` body.
- The sink is driven exactly as the suite drives it (`test-sink-merge.js:251`), i.e. with
  `KAOLA_WORKFLOW_OFFLINE: '0'` set **explicitly** rather than inherited — the offline flag is not
  silently disabling anything here, and a real bare remote + `gh` mock are used.
- Archive contents planted per leg: the run-record trio (`workflow-state.md`, `mission-list.md`,
  `finalization-summary.md`) plus the exact five files #901 names as lost
  (`.cache/final-validation.md`, `.cache/doc-updater.md`, `.cache/doc-docking.md`,
  `.cache/run-gaps-manual.md`, `.cache/run-gaps.json`).

### Commands run (verbatim)

```
# raw git-level probe
git init -q -b main .              # scratchpad/p901/gitprobe
printf '.cache/\n' > .gitignore
git check-ignore -v -- kaola-workflow/archive/issue-330
git check-ignore -v -- kaola-workflow/archive/issue-330/.cache/final-validation.md
git add -- 'kaola-workflow/archive/issue-330/' \
  ':(exclude)kaola-workflow/archive/issue-330/.cache/sink-receipt.json' \
  ':(exclude)kaola-workflow/archive/issue-330/.cache/sink-fallback.json'
git diff --cached --name-only -- 'kaola-workflow/archive/issue-330/' ':(exclude)…'

# end-to-end sink (per leg), from the fixture root
node scripts/kaola-workflow-sink-merge.js --branch workflow/issue-330 --project issue-330 \
     --sink --json --issue 330
#   env: KAOLA_WORKFLOW_OFFLINE=0 KAOLA_WORKFLOW_SKIP_TESTGATE=1 KAOLA_GH_MOCK_SCRIPT=<mock>

# post-sink inspection
git ls-tree -r --name-only HEAD
git show --stat --oneline HEAD
git status --porcelain --ignored
git clone <bare remote> freshclone

# closure audit against the reproduced fixture
KAOLA_WORKFLOW_OFFLINE=1 node scripts/kaola-workflow-closure-audit.js
```

Exit codes were read with `echo $?` **directly on the command** (never through a pipe, never via
`${PIPESTATUS[0]}`); the Node drivers read `spawnSync().status` directly.

---

## Observations

| # | Measurement | Command | Result | Exit |
|---|---|---|---|---|
| 1 | Is the archive **dir** ignored under `.cache/`? | `git check-ignore -v -- kaola-workflow/archive/issue-330` | no output — **not ignored** | **1** |
| 2 | Is a `.cache` **file** ignored? | `git check-ignore -v -- …/issue-330/.cache/final-validation.md` | `.gitignore:1:.cache/	kaola-workflow/archive/issue-330/.cache/final-validation.md` | **0** |
| 3 | The sink's own `git add` argv | `git add -- 'kaola-workflow/archive/issue-330/' ':(exclude)…sink-receipt.json' ':(exclude)…sink-fallback.json'` | `The following paths are ignored by one of your .gitignore files:` / `kaola-workflow/archive/issue-330/.cache` + `hint: Use -f …` | **1** |
| 4 | …yet the index after that failed add | `git diff --cached --name-only -- <same pathspecs>` | `finalization-summary.md`, `mission-list.md`, `workflow-state.md` — the three non-ignored files **are staged** | 0 |
| 5 | Sink, keep-worktree posture, `.gitignore=".cache/"` | full `--sink` invocation | `{"result":"ok","status":"sinked",…,"steps":{…,"archive_commit":"done","push_main":"done","closure":"done"},…}` | **0** |
| 6 | …`receipt.archived_paths` from that run | envelope | `["…/finalization-summary.md","…/mission-list.md","…/workflow-state.md"]` — **no `.cache`** | — |
| 7 | …blobs at HEAD | `git ls-tree -r --name-only HEAD` | 8 paths, **zero** matching `/.cache/` | 0 |
| 8 | …the archive commit itself | `git show --stat --oneline HEAD` | `7c0c144 chore: archive issue-330 [sink]` / **3 files changed, 40 insertions(+)** | 0 |
| 9 | …ignore warning count on stderr | sink stderr | printed **TWICE** (once per `git add`, `sink-merge.js:2121` and `:2135`) | — |
| 10 | …on-disk archive after the sink | `readdirSync` walk | all 5 `.cache` files still on disk, untracked | — |
| 11 | …ignored-status of that dir | `git status --porcelain --ignored` | `!! kaola-workflow/archive/issue-330/.cache/` (and `--porcelain` alone: **empty**, tree looks clean) | 0 |
| 12 | **CONTROL** — same fixture, `.gitignore="node_modules/"` | full `--sink` invocation | `archived_paths` names **all 8** paths; `git show --stat` = **8 files changed**; `ls-tree` carries all 5 `.cache` blobs | **0** |
| 13 | Sink, **sole-archiver** posture, `.gitignore=".cache/"` (`receipt.archive_dest` **set**, so the #700 guard is live) | full `--sink` invocation | `status:"sinked"`, `steps.archive_commit:"done"`, `archive_dest:"kaola-workflow/archive/issue-330"`, `archived_paths` = the same 3 files; `ls-tree` `.cache` blobs = **[]** | **0** |
| 14 | Durable loss | `git clone <bare remote> freshclone` then `find` | fresh clone holds **only** `workflow-state.md`, `finalization-summary.md`, `mission-list.md` under the archive; **no `.cache/` at all** | 0 |
| 15 | Post-sink closure audit on the reproduced fixture | `KAOLA_WORKFLOW_OFFLINE=1 node scripts/kaola-workflow-closure-audit.js` | `"archive_content_incomplete": []`, `counts.archive_content_incomplete: 0` — **does not detect it** | **0** |

### The reproducing envelope, verbatim (leg 5)

```json
{"result":"ok","status":"sinked","journal_disposed":true,"receipt":{"project":"issue-330",
"branch":"workflow/issue-330","issue_number":330,"issue_numbers":[330],
"resolved_default_branch":"main","branch_head":"79b240048d0f…","keep_open_requested":false,
"stash_ref":null,"removed_duplicates":[],
"archived_paths":["kaola-workflow/archive/issue-330/finalization-summary.md",
"kaola-workflow/archive/issue-330/mission-list.md",
"kaola-workflow/archive/issue-330/workflow-state.md"],
"steps":{"preflight":"done","push_upstream":"done","merge":"done","finalize":"done",
"stash_restore":"done","archive_commit":"done","push_main":"done","closure":"done"},
"post_rebase_tests":"skipped","remote_closed_after_publish":"verified",
"published_head":"79b240048d0f…","closed_issues":[330]}}
```

Sink stderr from the same run (the warning, twice):

```
The following paths are ignored by one of your .gitignore files:
kaola-workflow/archive/issue-330/.cache
hint: Use -f if you really want to add them.
hint: Disable this message with "git config set advice.addIgnoredFile false"
The following paths are ignored by one of your .gitignore files:
kaola-workflow/archive/issue-330/.cache
hint: Use -f if you really want to add them.
hint: Disable this message with "git config set advice.addIgnoredFile false"
```

And the durable record the sink wrote into the archive — a complete-looking list of an incomplete
archive (`finalization-summary.md`, IGNORED leg):

```
## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-330/finalization-summary.md
- kaola-workflow/archive/issue-330/mission-list.md
- kaola-workflow/archive/issue-330/workflow-state.md
```

---

## Reproduction

**Reproduces**, on both archiver postures, deterministically (4/4 legs behaved as predicted; the two
IGNORED legs both lost the `.cache` files, the keep-worktree CONTROL committed all of them).

The negative control isolates the axis: the *only* difference between observation 5 (loses 5 files)
and observation 12 (loses none) is the body of the consumer's root `.gitignore`.

---

## Per sub-claim table

| Reported specific | Verdict | Proof |
|---|---|---|
| Ignore warning printed **TWICE**: `…: kaola-workflow/archive/issue-330/.cache` | **HELD** | obs. 9 — one per `git add`, `sink-merge.js:2121` and `sink-merge.js:2135` (the re-stage after `persistArchivedPathsToSummary`) |
| Exited 0 with `{"result":"ok","status":"sinked","steps":{"archive_commit":"done","push_main":"done","closure":"done"}}` | **HELD** | obs. 5, 13 — exit `0`, all three step tokens `"done"`. Note the token lives on `steps.archive_commit`; `receipt.archive_commit` is `undefined` in both postures (it is only ever assigned `'skipped_gitignored'` at `sink-merge.js:2171` or `'failed'` at `:2178`) |
| `archived_paths` listed only the run-record trio, no `.cache` | **HELD** | obs. 6, 13 |
| `.cache/final-validation.md`, `doc-updater.md`, `doc-docking.md`, `run-gaps-manual.md`, `run-gaps.json` never committed | **HELD** | obs. 7, 8, 13, 14 — zero `/.cache/` blobs at HEAD; the archive commit is `3 files changed`; a fresh clone of the pushed remote holds none of the five |
| Cause: `git check-ignore -v <archive>/.cache/final-validation.md` → `.gitignore:90:.cache/` | **HELD** (line number is consumer-specific; rule form confirmed) | obs. 2 — `.gitignore:1:.cache/` in the fixture, i.e. the **basename** rule matches at any depth while the archive dir itself does not match (obs. 1) |
| The live source copy was **DISPOSED** after | **HELD** | `kaola-workflow-claim.js:2498` `fs.rmSync(src, …)` and `:2503` `fs.rmSync(mainLive, …)` on the linked-run path; `:2515` `fs.renameSync(src, dest)` on the in-place path. Confirmed empirically: `live folder … exists after sink: false` in both IGNORED legs |
| …so the loss is **unrecoverable** | **PARTIALLY HELD** | The five files **survive on disk** in the untracked archive dir (obs. 10) — recoverable from the operator's checkout. They are unrecoverable from git: absent from every commit, from the pushed remote, and from a fresh clone (obs. 14), and `git status --porcelain` reports the tree **clean** so nothing signals their untracked state (obs. 11) |
| The post-sink closure audit did NOT catch it | **HELD** | obs. 15 — `archive_content_incomplete: []`. `archiveRequiredContent` (`closure-audit.js:131-136`) requires **only** `workflow-state.md`, read from **disk** via `fs.readFileSync`; it never consults git and never reads a citation |
| #520's narrow *transient sink journal* exclusion must not become loss of the whole evidence dir | **HELD as stated** — the #520 exclusion is genuinely narrow and is **not** the cause | `sink-merge.js:2072-2075` names exactly four paths: `<archive>/.cache/sink-receipt.json`, `<archive>/.cache/sink-fallback.json`, `kaola-workflow/<project>/.cache/sink-receipt.json`, `kaola-workflow/<project>/.cache/sink-fallback.json`. The whole-dir loss comes from the consumer's `.gitignore` + the swallowed `git add`, not from these excludes |

### Deliberately not tested

- The reporter's actual consumer repo (`.gitignore:90`) — I only had the reported line; the fixture
  reproduces the *rule form*, at line 1.
- Whether the reporter's on-disk archive still exists. On the evidence here it should, unless the
  checkout was re-cloned or the untracked dir was swept; I could not observe their machine.

---

## Mechanism

Four seams compose, in `scripts/kaola-workflow-sink-merge.js`, all inside `step === 'archive_commit'`
(`:2057`):

1. **The ignore probe asks the wrong question.** `sink-merge.js:2108-2115`:

   ```js
   if (fs.existsSync(archiveDir)) {
     try {
       // exit 0 = ignored; exit 1 = not ignored; anything else = probe fault (not a refusal).
       execFileSync('git', ['-C', mainRoot, 'check-ignore', '-q', '--', archiveRel],
         { stdio: ['ignore', 'ignore', 'ignore'] });
       archiveIgnored = true;
     } catch (_) { archiveIgnored = false; }
   }
   ```

   `archiveRel` is the archive **directory** (`:2063`). A basename rule `.cache/` does not match it
   (obs. 1), so `archiveIgnored = false` and the whole `#832` honest-skip arm at `:2170-2176` never
   fires. The probe is written for a rule that covers the band, not one that covers a *subtree*.

2. **The refusal is swallowed while the partial success is kept.** `sink-merge.js:2119-2122`:

   ```js
   if (fs.existsSync(archiveDir) && commitPaths.length > 0) {
     try {
       execFileSync('git', ['-C', mainRoot, 'add', '--', ...commitPaths, ...excludes], { encoding: 'utf8' });
     } catch (_) {}
   ```

   `git add` with a directory pathspec whose subtree contains ignored paths prints the ignore report
   and **exits 1, but still writes the non-ignored entries to the index** (obs. 3 + 4 are the same
   invocation: exit 1, three files staged). `execFileSync` therefore throws, `catch (_) {}` discards
   the only signal that anything was refused, and the staged remainder is carried forward as if the
   add had succeeded. Same shape again at `:2135`.

3. **`archived_paths` is index-derived, so it reports the survivors as the whole.**
   `sink-merge.js:2128` → `stagedPathsUnder` (`:155-161`, `git diff --cached --name-only`). The list
   is a faithful report of *what was staged*, which is exactly why it cannot disclose what was
   dropped. It then becomes the durable record via `persistArchivedPathsToSummary` (`:178`, called at
   `:2133`) — the archived `## Sink Findings` block quoted above.

4. **The completeness check is tree-existence, not per-path.** `sink-merge.js:2162-2166`:

   ```js
   const t = execFileSync('git', ['-C', mainRoot, 'cat-file', '-t', 'HEAD:' + archiveRel], …).trim();
   archiveAtHead = (t === 'tree');
   ```

   A partially-committed archive still yields `tree`, so the `#700` refusal at `:2177-2191` is
   satisfied and `stepDone('archive_commit')` runs at `:2197`. **Nothing anywhere verifies that the
   paths on disk became blobs in the resulting commit** — this is the direct answer to the question
   "can `archive_commit: done` be emitted when a required archive path was ignored and never
   committed?": **yes**, and there is no code path that could notice.

### The same blind spot, one layer up

`kaola-workflow-claim.js:2592-2606`, `classifyArchiveDisposition`, probes identically:

```js
execFileSync('git', ['-C', mainRoot, 'check-ignore', '-q', '--', relPosix], …);
return 'skipped_gitignored';
```

`relPosix` is again the archive **dir**, so finalize's own disposition returns `deferred_to_sink`
under a `.cache/` rule — it hands a subtree it cannot commit to a sink that will not notice.

### Why the disposal is not gated on a durable archive

`archiveProjectDir` (`kaola-workflow-claim.js:2399`) deletes the live copy after
`verifyArchiveComplete(src, dest)` (`:2492`, defined `:4965`). That gate is a **disk-to-disk**
byte/size/mode comparison, source-relative — it proves the *copy* is complete and knows nothing about
git. On the in-place path (`:2515`) it is a bare `renameSync` with no gate at all. So the deletion is
conditional on a verified-complete **filesystem** archive, never on a verified-complete **committed**
one. Worth noting for any remedy: four of the five files #901 names are in
`ARCHIVE_CACHE_SIDECAR_MD` (`claim.js:4920-4926` — `final-validation.md`, `run-gaps-manual.md`,
`doc-docking.md`, `doc-updater.md`) and are skipped by that verifier at `:4988`; `run-gaps.json` is
byte-checked only because the recursive walk sweeps it, and `listSourceEvidenceFiles` (`:4936`) only
ever lists `.md`.

---

## Narrowing

| Leg | Axis | What it eliminated |
|---|---|---|
| keep-worktree, `.gitignore=".cache/"` | ignore rule = basename | Reproduces (obs. 5-11). |
| keep-worktree, `.gitignore="node_modules/"` | ignore rule = irrelevant | Eliminated "the fixture never had the `.cache` files", "the sink cannot commit `.cache` at all", and "the excludes at `:2072-2075` are the cause": all 8 paths land as blobs (obs. 12). The `.gitignore` body is the sole cause. |
| sole-archiver, `.gitignore=".cache/"` | posture, `archive_dest` **set** | Eliminated "the `#700` `archiveAtHead` guard catches it when the dest is recorded" — it does not; `tree` exists, so `done` (obs. 13). |
| raw `git add` probe | git itself | Eliminated "git aborts the add entirely" — the exit is 1 *and* the index is written (obs. 3+4). This is what makes the swallow at `:2122` a silent partial success rather than a no-op. |
| fresh clone of the pushed remote | durability | Eliminated "the files are somewhere in history" (obs. 14). |
| closure audit on the reproduced fixture | detection | Eliminated "a later audit would surface it" (obs. 15). |

**Fixture artifacts, not findings** (naming them so they are not mistaken for defects):
- The sole-archiver CONTROL leg refused `sink_blocked` / `foreign_dirt` on the live `.cache` files:
  with no `.cache/` rule those untracked files are visible to preflight and classified bucket-3.
  That is a property of my hand-built fixture (a real run's live folder is branch-tracked or
  preflight-exempt), so leg 3 has **no** clean control of its own — the keep-worktree control (obs.
  12) is the one that isolates the axis, and it does so cleanly.
- The keep-worktree legs left `kaola-workflow/.roadmap/issue-330.md` at HEAD (hence the audit's
  `stale_roadmap_sources: 1` alongside its `archive_content_incomplete: []`). My fixture models a
  post-finalize state without the roadmap reconciliation; the sole-archiver leg performed the
  removal correctly (`git show --stat`: `kaola-workflow/.roadmap/issue-330.md | 5 -----`).

---

## Existing coverage

**No test covers this shape.** Every `.gitignore` fixture in the suite writes one of three bodies,
and none of them matches an archive `.cache` subtree:

| Fixture | Body | Why it misses #901 |
|---|---|---|
| `scripts/test-sink-merge.js:1767` (scenario **(q)**, #832) | `kaola-workflow/archive/\n` | Covers the **whole band**, so `check-ignore` on the archive dir returns 0 and the honest-skip arm *does* fire. This is the case the code was built for — and it is why the narrower rule was never seen. |
| `scripts/simulate-workflow-walkthrough.js:2457` (#832 finalize side) | `kaola-workflow/archive/\n` | Same. |
| `scripts/simulate-workflow-walkthrough.js:1070`, `:1237`; `scripts/test-finalize-door.js:91`, `:706` | `/.cache/\n` | **Anchored** — mirrors this repo's own `.gitignore:20`, which is anchored precisely so archive evidence is unaffected. An anchored rule matches only the repo-root `.cache/`, never `kaola-workflow/archive/*/.cache/`. |
| `scripts/simulate-workflow-walkthrough.js:1809`, `:1841`, `:1971`, `:2004`, `:2037` | `bin/\nkaola-workflow/\n.kw/\n` | Ignores the whole `kaola-workflow/` tree — no archive is expected at HEAD at all. |

Second, independent reason the suite could not have caught it: **no test asserts that archived
`.cache` files became git blobs.** Every archived-evidence assertion is on-disk
(`fs.existsSync` / `readFileSync`) — e.g. `simulate-workflow-walkthrough.js:255`,
`:10342-10344`, `:10725`, `:7738`. The one `git ls-files` assertion touching an archive `.cache`
(`:9470`) checks the **inverse** — that `sink-receipt.json`/`sink-fallback.json` are *not* tracked
(#520). So even a fixture that had the rule would have passed unless it checked `ls-tree`.

`grep -rn "ls-tree" scripts/test-*.js scripts/simulate-workflow-walkthrough.js | grep -i cache`
returns nothing.

---

## Inferences

- **The seam is the mismatch between the probe's granularity and the pathspec's granularity** —
  confidence **high**. The probe asks about one path (`archiveRel`); the add operates over its whole
  subtree. Refuted by: any evidence that `git add <dir>` aborts without writing the index (obs. 3+4
  rule this out on git 2.50.1), or by finding a per-path verification I missed between `:2119` and
  `:2197`.
- **The swallowed exit code at `:2122`/`:2136` is what makes it silent rather than merely partial** —
  confidence **high**. Git *did* report the problem, on stderr, twice; the report reached the
  operator's scrollback and nothing else. Refuted by: showing some other consumer of that signal.
- **Any consumer using the common `.cache/` idiom is affected on every run**, not just this one —
  confidence **high** (the rule is static; nothing about issue-330 is special). Refuted by: a
  consumer-side `!` negation re-including the archive band.
- **No existing mechanism could have detected it after the fact** — confidence **high** for the
  closure audit (measured, obs. 15) and `verifyArchiveComplete` (read: disk-only, and 4 of the 5
  files are exempt anyway); **medium** for the repo as a whole, since I only audited those two plus
  the test corpus.

## Open

- I did not audit `kaola-workflow-gap-sweep.js`, `kaola-workflow-active-folders.js`, or
  `kaola-workflow-closure-contract.js` for a detector — the brief scoped detection to the closure
  audit. If "does *anything* catch this" matters for the remedy, those three are unmeasured.
- I did not test a consumer `.gitignore` with a `!` negation re-including the archive band, nor the
  `--keep-worktree` + ADR 0013 R3 rescue path (the rescue is a filesystem copy, so I expect it
  gitignore-blind and unaffected, but I did not run it).
- I did not test the GitLab/Gitea/opencode/kimi ports of `sink-merge.js`. `check-ignore` is
  forge-neutral, so I expect identical behaviour, but that is an inference, not a measurement.
- Per instruction, no fix is proposed and no tracked file was modified. The four fixture roots are
  retained under `/var/folders/…/T/kw901-*` and `/var/folders/…/T/kw901s-*` (paths printed in the two
  logs) if anyone wants to re-inspect the resulting commits.

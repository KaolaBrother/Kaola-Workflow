# Investigation: #906 — two archive routes that delete a live copy uncompared

## VERDICT

| route | premise | status |
|---|---|---|
| **ROUTE 1** — the #395.4 crash-resume backstop deletes main's live folder uncompared | **HOLDS — LIVE, reproduced end-to-end** | exit **0**, `main_live_cleaned_on_resume: true`, a main-only file **destroyed** and never in the archive |
| **ROUTE 2** — a main-only symlink escapes the #901 comparison | **HOLDS — the issue's three-row table reproduces EXACTLY, row for row** | plus **two more destructive rows** the issue did not report |

Two corrections to the issue text, neither of which weakens it:

1. **The cited line numbers are wrong.** `scripts/kaola-workflow-claim.js:4090-4092` is the atomic
   `writeFile(destState, …)` terminal-state repair, not the delete. The `fs.rmSync` is at
   **`scripts/kaola-workflow-claim.js:4107`** (block `4101-4111`). Everything else in the description
   of that site is accurate.
2. **"terminal-closed" is enforced upstream, not by the backstop's own condition.** The backstop's
   enclosing `if` only requires the archive to hold a `workflow-state.md`
   (`kaola-workflow-claim.js:4084`); the delete at 4107 sits *outside* the `st !== 'closed' &&
   st !== 'abandoned'` branch that closes at 4094. The `status: closed` requirement comes from
   `resolveFinalizeAuthority` (`kaola-workflow-claim.js:3583`), which refuses
   `archive_state_not_closed` before `cmdFinalize` ever reaches the backstop — measured, leg L5 below.
   Consequence worth noting for whoever fixes this: `archiveStateStamped = 'repaired'` (line 4093) is
   **unreachable from `cmdFinalize`**, because the authority gate has already demanded `closed`.
   Every leg below reports `archive_state_stamped: "not_needed"`.

---

## Setup

- Commit: `2018521fd9e96c7f84ace0d099d3881706414bac` (branch `main`, tree clean apart from the
  untracked bundle folder)
- Node `v24.14.0`, darwin 25.6.0
- **No tracked file in this repository was modified, and the archive path was never run against this
  repository's own `kaola-workflow/`.** Every fixture is a throwaway git repo + linked worktree under
  `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/8070a702-f33f-4c74-8c66-4434a7ea9c6d/scratchpad`.
- Harnesses (scratchpad, disposable):
  - `route2.js` — Route 2, seven legs incl. two controls
  - `route2b.js` — Route 2 severity: does an outside-target symlink lose the bytes?
  - `route1.js` — Route 1, five legs incl. three controls
  - `route1-refusal-cost.js` — what a refusal would leave behind, measured
  - `route1-options.js` + a suffix probe — whether a lossless disposition can achieve the same thing
  - `lsef-probe.js` — `listSourceEvidenceFiles`, run through its only consumer
- `KAOLA_WORKFLOW_OFFLINE=1` is set on every spawn (the fixtures have no forge remote). **Positive
  control for that env:** leg `C1` below refuses under the identical env, so the comparison under
  test is demonstrably armed and not silenced by the offline flag.

---

## The code, quoted at HEAD

### ROUTE 1 — `scripts/kaola-workflow-claim.js:4097-4111` (delete at **4107**)

```js
        // #395.4: worktree variant — a crash between archiveProjectDir's renameSync (in the linked
        // worktree) and its MAIN-root live-folder cleanup leaves a surviving MAIN copy that keeps
        // readActiveFolders claiming the project (user_target_blocked on re-claim). On finalize
        // re-run, archiveProjectDir source-missing never reaches that cleanup — re-run it here.
        try {
          const mainRoot4 = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
          const linkedRoot4 = fs.realpathSync(root);
          if (mainRoot4 && mainRoot4 !== linkedRoot4) {
            const mainLive = path.join(mainRoot4, 'kaola-workflow', args.project);
            if (fs.existsSync(mainLive)) {
              fs.rmSync(mainLive, { recursive: true, force: true });
              result.main_live_cleaned_on_resume = true;
            }
          }
        } catch (_) {}
```

No `verifyArchiveComplete`, no `missingArchiveSidecars`, and — as the issue says — not even the
`realpathSync(mainLive) !== dest` disposability check its sibling carries. The sibling, for contrast:

### The sibling site — `scripts/kaola-workflow-claim.js:2521-2549`

```js
    const mainLive = path.join(mainRoot, 'kaola-workflow', project);
    let mainLiveDisposable = false;
    if (fs.existsSync(mainLive)) {
      try { mainLiveDisposable = fs.realpathSync(mainLive) !== dest; } catch (_) { mainLiveDisposable = false; }
    }
    let missingFromMain = [];
    if (mainLiveDisposable) {
      missingFromMain = (verifyArchiveComplete(mainLive, dest).missing || [])   // <- ROUTE 2: .missing ONLY
        .concat(missingArchiveSidecars(mainLive, dest))
        .filter(rel => !/(^|\/)sink-(receipt|fallback)\.json$/.test(rel));
      const ignoredByName = repoWideIgnoredNames(mainRoot, missingFromMain);
      missingFromMain = missingFromMain.filter(rel => !ignoredByName.has(rel.split('/').pop()));
    }
    ...
    fs.rmSync(src, { recursive: true, force: true });          // worktree live folder
    if (mainLiveDisposable) fs.rmSync(mainLive, { recursive: true, force: true }); // main live folder
```

### ROUTE 2 — the three statements that make a symlink invisible to the main leg

```js
// kaola-workflow-claim.js:5295   (verifyArchiveComplete's source walk)
      if (stat.isSymbolicLink()) { invalid.push(rel); continue; }
// kaola-workflow-claim.js:5312   invalid[] becomes the mismatched[] half
  const mismatched = invalid.slice();
// kaola-workflow-claim.js:2531   the main leg reads .missing and discards .mismatched
      missingFromMain = (verifyArchiveComplete(mainLive, dest).missing || [])
```

A symlink never enters `sourceFiles`, so it can only reach `missing[]` via
`listSourceEvidenceFiles`'s name set — exactly as the issue states.

`missingArchiveSidecars` (`kaola-workflow-claim.js:5220-5229`) does not close the hole either: its
filter is `if (!entry.isFile() || !ARCHIVE_CACHE_SIDECAR_MD.has(entry.name)) continue;` — a symlink
is not `isFile()` under `withFileTypes`, so a symlink named as an exempt sidecar escapes **both**
readers. Measured as leg R4.

---

## Observations — ROUTE 2

`node scripts/kaola-workflow-claim.js release --project <p> --json`, cwd = the **linked worktree**,
env `KAOLA_WORKFLOW_OFFLINE=1 KAOLA_GH_REMOTE_TIMEOUT_MS=500`.

**One axis:** the single main-only entry, and whether it is a symlink. The symlink's target is a file
**both** copies hold (`.cache/shared.md`), so the link itself is the only main-only entry. The
worktree's live folder is byte-identical in every leg (`workflow-state.md` + `.cache/shared.md`).

| leg | main-only entry | kind | exit | envelope | main's copy after | entry after |
|---|---|---|---|---|---|---|
| C0 (neg. control) | *(none)* | — | **0** | `released:true archived:true` | GONE | n/a |
| C1 (pos. control) | `.cache/EXTRA.md` | regular file | **1** | `refuse archive_incomplete missing:[".cache/EXTRA.md"]` | present | **SURVIVED** |
| **R1** | `.cache/link-evidence.md` | symlink → `shared.md` | **1** | `refuse archive_incomplete missing:[".cache/link-evidence.md"]` | present | **SURVIVED** |
| **R2** | `extra-link.txt` | symlink → `.cache/shared.md` | **0** | `released:true archived:true` | GONE | **DESTROYED** |
| **R3** | `notes-link.md` | symlink → `.cache/shared.md` | **0** | `released:true archived:true` | GONE | **DESTROYED** |
| **R5** *(new)* | `mission-list.md` | **dangling** symlink | **0** | `released:true archived:true` | GONE | **DESTROYED** |
| **R4** *(new)* | `.cache/final-validation.md` | symlink → `shared.md` | **0** | `released:true archived:true` | GONE | **DESTROYED** |

`stderr` was **empty on every leg.** The archive dest holds `[.cache/shared.md, workflow-state.md]`
in every leg — the main-only entry is in no copy anywhere afterwards.

**The issue's three-row table reproduces exactly.** Rows R1/R2/R3 match its `exit 1, named, retained`
/ `exit 0, archived, DESTROYED` / `exit 0, archived, DESTROYED` character for character.

**Two rows the issue did not report:**

- **R4** — a main-only symlink whose name is one of the five *exempt sidecars*. It escapes
  `listSourceEvidenceFiles` (which subtracts the sidecar names) **and** `missingArchiveSidecars`
  (which requires `isFile()`), so the #901 presence re-check — the repair that exists precisely for
  these five names — does not cover their symlink form.
- **R5** — a main-only **dangling** symlink named `mission-list.md`, one of the four fixed top-level
  names. `listSourceEvidenceFiles` gates each fixed name on `fs.existsSync`, which *follows* links, so
  a broken link drops out of the required set. The run record's own filename does not save it.

### Verbatim `ls` transcript, leg R2 (the load-bearing one)

```
--- BEFORE (main's live folder) ---
drwxr-xr-x  5 …/main/kaola-workflow/issue-906d
drwxr-xr-x  3 …/main/kaola-workflow/issue-906d/.cache
-rw-r--r--  1 …/main/kaola-workflow/issue-906d/.cache/shared.md
lrwxr-xr-x  1 …/main/kaola-workflow/issue-906d/extra-link.txt -> .cache/shared.md
-rw-r--r--  1 …/main/kaola-workflow/issue-906d/workflow-state.md

$ node scripts/kaola-workflow-claim.js release --project issue-906d --json     # cwd = the worktree
{"released":true,"project":"issue-906d","claim_label_removed":"skipped_offline","archived":true,
 "dest":"…/main/kaola-workflow/archive/issue-906d.discarded-2026-08-01T…Z", …}
exit 0            stderr: (empty)

--- AFTER (main's live folder) ---
(nothing — the folder is gone)

archive contents: [.cache/shared.md, workflow-state.md]
```

### Severity probe (`route2b.js`) — the issue's scope note is correct

A main-only symlink pointing **outside** the run folder:

```
exit 0, released:true, archived:true
main live folder: GONE
symlink:          DESTROYED
outside target:   SURVIVED  ("# outside the run folder; the link is the only pointer to it")
```

`fs.rmSync` does not follow the link out of the tree, so **the link is lost, never the bytes** — for
in-folder and out-of-folder targets alike. The issue's scoping is accurate.

---

## Observations — ROUTE 1

State constructed (the #395.4 crash shape): linked-worktree run; the **worktree's** live folder
absent; an archive under **main** stamped `status: closed`; **main's** live folder surviving.
`mirrorFinalizationArtifacts` returns `skipped_post_archive` (`kaola-workflow-claim.js:3241`) in that
shape, so main's copy is *not* mirrored back down and the source-missing path is reached.

`node scripts/kaola-workflow-claim.js finalize --project <p> --json [--keep-worktree]`, cwd = the
linked worktree, same env.

| leg | main's live folder before | archive before | exit | key envelope fields | main after | `.cache/ONLY-IN-MAIN.md` |
|---|---|---|---|---|---|---|
| **L1** | `.cache/ONLY-IN-MAIN.md`, `.cache/shared.md`, `workflow-state.md` | `.cache/shared.md`, `workflow-state.md` | **0** | `skipped:"source-missing"`, `main_live_cleaned_on_resume:true`, `archive_state_stamped:"not_needed"` | **FOLDER GONE** | **DESTROYED** |
| L2 (control) | `.cache/shared.md`, `workflow-state.md` | same | 0 | `main_live_cleaned_on_resume:true` | FOLDER GONE | n/a — nothing to lose |
| L3 (control) | *absent* | same | 0 | *no* `main_live_cleaned_on_resume` field | — | n/a |
| **L4** `--keep-worktree` | `.cache/ONLY-IN-MAIN.md`, … | same | **0** | `main_live_cleaned_on_resume:true`, `archive_commit:"deferred_to_sink"` | **FOLDER GONE** | **DESTROYED** |
| L5 (precondition) | `.cache/ONLY-IN-MAIN.md`, … | archive `status: active` | **1** | `refuse` / `finalize_gate_unverified` / `archive_state_not_closed` | intact | **SURVIVED** |

`stderr` empty on every leg. Archive after L1/L4: `[.cache/shared.md, finalization-summary.md,
workflow-state.md]` — `finalization-summary.md` is written by the finalize reports; **`ONLY-IN-MAIN.md`
is in no copy anywhere.**

`closure_invariants` reported `{"ok":true,"violations":[]}` on L1 and L4. The run declares itself
clean while a file the operator put there is gone.

**L4 matters for scope:** the merge lane (`--keep-worktree`, `archive_commit: deferred_to_sink`) takes
the same delete. This is not confined to the terminal `finalize` invocation.

---

## Narrowing

| leg | what it eliminated |
|---|---|
| C0 | "the gate blanket-refuses" — a clean linked-run `release` still archives at exit 0 |
| C1 | "the #901 comparison is inert in this fixture / silenced by `KAOLA_WORKFLOW_OFFLINE`" — an ordinary main-only file refuses and names itself |
| R1 vs R2/R3 | the discriminator is **name-set membership**, not symlink-ness: the identical link kind refuses in `.cache/*.md` and passes at top level |
| R4 | "`missingArchiveSidecars` covers the five exempt names" — it covers their *file* form only |
| R5 | "the four fixed top-level names are safe" — `existsSync` follows links, so a dangling one is not in the set |
| L2/L3 | "the backstop is the thing that destroys" — with nothing main-only, the same delete is harmless; with no folder, it does not fire |
| L5 | "the backstop's own `if` gates on terminal state" — the gate is `resolveFinalizeAuthority`, 500 lines upstream |
| route2b | "an outside-target symlink loses bytes" — it does not; `rmSync` does not traverse the link |

---

## `verifyArchiveComplete` — exact return shape

`scripts/kaola-workflow-claim.js:5268-5327`. Four return statements, **three keys, always the same
three**:

```js
  if (!fs.existsSync(destDir))       return { ok: false, missing: ['<dest>'], mismatched: [] };      // :5269
  … non-directory / symlinked root:  return { ok: false, missing: [],         mismatched: ['<root>'] }; // :5275
  … lstat threw on a root:           return { ok: false, missing: ['<root>'], mismatched: [] };      // :5277
  return { ok: missing.length === 0 && mismatched.length === 0, missing, mismatched };               // :5326
```

- `ok: boolean` · `missing: string[]` (POSIX-joined relative paths, sorted) · `mismatched: string[]`
- Sentinels `'<dest>'`, `'<root>'`, `'<source>'` can appear as pseudo-paths.
- The signature is `(srcDir, destDir)`. A **third argument is accepted and ignored** —
  `scripts/test-finalize-door.js:863` still passes `{ requireLedgerEvidence: true }` deliberately, to
  catch a resurrected derivation.

### Cross-edition byte state (measured with `shasum`, not asserted)

| function | canonical | Codex plugin | GitLab | Gitea |
|---|---|---|---|---|
| `verifyArchiveComplete` (60 lines) | `4ca160a29cb9236c` | `4ca160a29cb9236c` | `4ca160a29cb9236c` | `4ca160a29cb9236c` |
| `missingArchiveSidecars` (body) | identical | identical | identical (diff exit 0) | identical (diff exit 0) |
| `ARCHIVE_CACHE_SIDECAR_MD` | `99df9aa87b5b7b25` | `99df9aa87b5b7b25` | `99df9aa87b5b7b25` | `99df9aa87b5b7b25` |
| **`listSourceEvidenceFiles`** | `b09e8a72d77aca0e` | `b09e8a72d77aca0e` | **`a6eb047d494855c6`** | **`a6eb047d494855c6`** |

Whole-file: canonical and the Codex plugin copy of `kaola-workflow-claim.js` are **byte-identical**
(`f4b135f1…`). GitLab (`35c56eee…`) and Gitea (`bdc1ebe4…`) are forge ports and differ throughout.

### ⚠ A REAL cross-edition divergence in the very set #906 turns on

```js
// canonical + Codex, kaola-workflow-claim.js:5232-5233
  for (const f of [adaptiveSchema.MISSION_LIST_FILE, adaptiveSchema.PLAN_FILE,
                   'workflow-state.md', 'finalization-summary.md']) {
// GitLab :4964 / Gitea :4958
  for (const f of ['workflow-plan.md', 'workflow-state.md', 'finalization-summary.md']) {
```

**GitLab and Gitea list THREE fixed names, not four — `mission-list.md` is absent.** Verified by
*running* all four editions' exported `verifyArchiveComplete` against an identical symlink fixture:

```
canonical  {"mission-list.md":"REQUIRED (missing[])", "workflow-plan.md":"REQUIRED", "finalization-summary.md":"REQUIRED", ".cache/evidence.md":"REQUIRED"}
codex      {"mission-list.md":"REQUIRED (missing[])", …identical…}
gitlab     {"mission-list.md":"not required -> mismatched only", "workflow-plan.md":"REQUIRED", …}
gitea      {"mission-list.md":"not required -> mismatched only", "workflow-plan.md":"REQUIRED", …}
```

So on GitLab and Gitea a main-only symlink named `mission-list.md` — the ADR 0017 run record itself —
is destroyed at exit 0 in its **ordinary** (non-dangling) form, where canonical and Codex catch it.
The issue's phrase *"shared across four editions and pinned"* is true of `verifyArchiveComplete`'s
**shape and body**, and false of the **name set** feeding it. Acceptance criterion 4 must be read with
that in mind: the three editions do not currently agree on what is required.

---

## Reader inventory — every caller, every edition

### Production callers (exactly two per edition; both inside `archiveProjectDir`)

| edition | `v = verifyArchiveComplete(src, dest)` — reads `.ok`, `.missing`, `.mismatched` | `verifyArchiveComplete(mainLive, dest).missing` — reads `.missing` ONLY |
|---|---|---|
| `scripts/kaola-workflow-claim.js` | `:2492` | `:2531` |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | `:2492` | `:2531` |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | `:2271` | `:2310` |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | `:2270` | `:2309` |

**There is no third production caller in any edition.** Two indirect consumers read the *result
object* `archiveProjectDir` builds from it (`{archive_incomplete, missing, mismatched, dest}`), never
the function:

- `scripts/kaola-workflow-claim.js:4043-4067` — `cmdFinalize`'s `archive_incomplete` refusal, reports
  both halves.
- `scripts/kaola-workflow-sink-merge.js:2032-2055` — the sink's `sink_incomplete` refusal; gates on
  `archive_incomplete === true` and reports `missing` **and** `mismatched` on the envelope.

Exported at `kaola-workflow-claim.js:5952` (GitLab `:5696`, Gitea `:5688`).
`listSourceEvidenceFiles` and `missingArchiveSidecars` are **not exported** in any edition.

### The Route-1 backstop, per edition (all four carry it)

| edition | `#395.4` comment | the `rmSync` |
|---|---|---|
| canonical | `:4097` | **`:4107`** |
| Codex plugin | `:4097` | **`:4107`** |
| GitLab | `:3904` | **`:3910`** (single line) |
| Gitea | `:3901` | **`:3907`** (single line) |

### Tests that assert on the shape

| file | lines | what it pins |
|---|---|---|
| `scripts/test-finalize-door.js` | 784-943 (T6a–T6i) | export-is-a-function; `ok===true/false`; `Array.isArray(v.missing)`; `v.missing.includes(...)`; **T6g** drives each of the five exempt sidecars separately and asserts `ok===true` **and** `!missing.includes(...)`; **T6g also source-text-pins `ARCHIVE_CACHE_SIDECAR_MD` to exactly those five names** (regex over `claim.js`, `:890-901`); **T6h** is the discriminating control; **T6i** pins that `missing[]` stays silent about an exempt sidecar even while already `ok:false` |
| `scripts/simulate-workflow-walkthrough.js` | 12325-12423 (`testArchiveCompleteSourceRelative676`, Part A cases 1-10) | `v.ok`, `v.missing.length === 0`, `v.missing.includes(...)` across ten fixtures |
| `scripts/test-bundle-finalize.js` | 1477-1503 (`#699`) | recursion into `.cache/epochs/…`; **the only test that asserts on `mismatched[]` directly** (`checked.mismatched.some(p => p.endsWith('receipt.bin'))`) |
| `scripts/test-claim-hardening.js` | 3914-4145 (`#941`) | the **envelope's** `mismatched[]`: a symlink planted in the **invoked tree's** `.cache` must refuse and NAME the entry. Its header states, measured, that `{missing:[], mismatched:['<root>']}` is unreachable via `cmdFinalize` (the authority gate catches it first). |
| `scripts/test-claim-hardening.js` | 4647-4796 (`#901 D1`, five legs) | the **`mainLive` ↔ `dest`** comparison end-to-end via `release`; L4 = ordinary main-only file, L5 = main-only exempt sidecar |

**No test in the GitLab, Gitea or Codex plugin suites calls `verifyArchiveComplete` directly.** Those
editions cover it only end-to-end through `archiveProjectDir` (e.g.
`plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js:1741-1753`,
`plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js:761`,
`plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js:848`).

### Non-test prose surface

`docs/api.md:629` describes the two halves to operators:

> `missing` names files the source held that the destination lacks, `mismatched` names files that
> arrived with different bytes.

Note that today's `mismatched[]` is **not** only "different bytes" — it also carries entry-kind
faults (`invalid[]`, `:5312`). Any shape change touches this sentence. `docs/api.md:1309` lists
`verifyArchiveComplete` among the exported API. `docs/api.md` is test-consumed by
`scripts/validate-workflow-contracts.js`.

### What holds the shape (relevant to acceptance criterion 3)

Nothing byte-pins `verifyArchiveComplete` across the four editions — `scripts/edition-sync.js` does
**not** sync `claim.js` to the forge ports (its own comment calls the data-layer forge ports
divergent by design). The shape is held by: one exported symbol, two production call sites per
edition, and the behavioural pins above. Since **only `:2531` needs the new distinction** and the
other reader (`:2492`) already consumes both halves, a third key on the same object (e.g.
`uncomparable: string[]`, or splitting `invalid[]` out of `mismatched[]`) is **additive** and would
not force a third comparison *reader* — the risk the issue names. The pins that would move: `#699`
(`test-bundle-finalize.js:1494`) and `#941` (`test-claim-hardening.js:4056-4062`) both currently
expect entry-kind faults in `mismatched[]`, so splitting them out re-points those two assertions.

---

## `listSourceEvidenceFiles` — what it actually returns, RUN not read

It is not exported, so it was **run through its only consumer**. Oracle: `verifyArchiveComplete`'s
required set is `listSourceEvidenceFiles(src) ∪ {'workflow-state.md'} ∪ (walk's plain files)`. A
symlink or directory never enters the walk's file map, so it can reach `missing[]` **only** via
`listSourceEvidenceFiles`. Probe entry present in src, absent from dest:

```
probe                                     kind      in missing[]  in mismatched[]  ok
mission-list.md                           symlink   true          true             false
workflow-plan.md                          symlink   true          true             false
finalization-summary.md                   symlink   true          true             false
notes.md                                  symlink   false         true             false
extra.txt                                 symlink   false         true             false
README.md                                 symlink   false         true             false
mission-list.md          [DANGLING]       symlink   false         true             false
.cache/evidence.md                        symlink   true          true             false
.cache/final-validation.md                symlink   false         true             false
.cache/run-gaps-manual.md                 symlink   false         true             false
.cache/selection-evidence.md              symlink   false         true             false
.cache/doc-docking.md                     symlink   false         true             false
.cache/doc-updater.md                     symlink   false         true             false
.cache/evidence.txt                       symlink   false         true             false
.cache/chain-receipt.json                 symlink   false         true             false
.cache/dirnamed.md       [a DIRECTORY]    dir       true          false            false
.cache/sub/nested.md     [nested 1 level] symlink   false         true             false
notes.md                 [CONTRAST file]  file      true          false            false
extra.txt                [CONTRAST file]  file      true          false            false
.cache/final-validation.md [CONTRAST file]file      false         false            TRUE
```

**Measured rule (canonical / Codex):**

1. **Four fixed top-level names**, each included **iff `fs.existsSync`** — which *follows symlinks*,
   so a **dangling** link named `mission-list.md` is excluded:
   `mission-list.md` (`adaptiveSchema.MISSION_LIST_FILE`), `workflow-plan.md`
   (`adaptiveSchema.PLAN_FILE`), `workflow-state.md`, `finalization-summary.md`.
   *(`workflow-state.md` cannot be discriminated by this probe — it is added unconditionally at
   `:5309` regardless.)*
2. **Direct children of `.cache/` only** (`readdirSync`, **non-recursive** — `.cache/sub/nested.md`
   is not in the set) whose **name** ends `.md` and is not one of the five exempt sidecars:
   `final-validation.md`, `run-gaps-manual.md`, `selection-evidence.md`, `doc-docking.md`,
   `doc-updater.md`.
3. The `.md` rule is **name-based, never type-based**: a **directory** named `.cache/dirnamed.md` is
   included (last row but one shows it landing in `missing[]` alongside its own child).
4. Nothing else. Not `.cache/*.txt`, not `.cache/*.json`, not top-level `README.md` / `notes.md`.

**GitLab and Gitea:** identical except rule 1 lists **three** names — `mission-list.md` is absent.

Last row is the exemption stated as a measurement: an exempt sidecar dropped as a *regular file*
returns `ok: true`, `missing: []`, `mismatched: []` — nothing in the return value discloses it. That
is why `missingArchiveSidecars` exists, and why its `isFile()` filter (leg R4) is a hole.

---

## ROUTE 1 — the trade-off, stated so it can be decided

**The decision is the user's.** Both sides are measured below; neither is asserted.

### What is lost today if the delete proceeds (measured, leg L1/L4)

Every file main's surviving live folder holds that the archive does not — the whole folder,
recursively — at **exit 0**, with `closure_invariants.ok: true`, empty stderr, and an envelope whose
only trace is `main_live_cleaned_on_resume: true`. That field says *a folder was removed*; it never
says *what was in it*. The three routes that reach the linked-run archive without a Step-8a mirror
(release/discard, watch-pr on a merged PR, the abandon backstop) are precisely the ones where
"worktree ⊇ main" is never established upstream — the same reasoning the #901 fix rests on.

### What breaks if the delete simply refuses (measured, `route1-refusal-cost.js`)

Same state, backstop not run:

```
status --json  from MAIN :  {"count":1,"active":[{"project":"issue-906","status":"active", …}]}
status --json  from the worktree : {"count":0,"active":[]}
claim --project issue-906 --target-issue 906 --json  from MAIN : {"status":"owned", folder → main's stale live folder}
finalize --project issue-906 --check --json : ok:true, mirror "skipped_post_archive", authority "archive"
```

So the cost is a **permanent phantom active claim** on main for a run that is already closed and
archived: `readActiveFolders` keeps listing it, and a re-claim of the same issue answers `owned` and
routes the operator into the dead folder. (One correction to #395's wording: the observed re-claim
verdict today is `owned`, not `user_target_blocked` — arguably worse, since it silently resumes a
finished run rather than refusing.) `finalize --check` still reports `ok: true`, so nothing routes
the operator to a repair; #395's non-convergence argument stands.

### A third option the issue did not consider — measured, and it works

`readActiveFolders` skips `kaola-workflow/archive/` outright
(`scripts/kaola-workflow-active-folders.js:240`) and skips any folder whose state is
`released|closed|abandoned` (`:226-228`, `:247`). So the phantom claim can be cleared **without
destroying anything**. Four dispositions of the identical state, `status --json` run from main:

| disposition | `active` count | main-only evidence file |
|---|---|---|
| refuse, leave as is | **1** (phantom claim survives) | SURVIVED |
| **delete — what ships today** | 0 | **DESTROYED** |
| **move aside → `kaola-workflow/archive/<project>.orphan-<ts>`** | **0** | **SURVIVED** |
| **stamp main's `workflow-state.md` terminal in place** | **0** | **SURVIVED** |

Both lossless dispositions achieve exactly what #395.4 was built to achieve.

**Constraint a fixer must respect, measured:** the move-aside suffix matters.
`findArchiveAuthorities` (`kaola-workflow-claim.js:3132`) matches `name === project ||
name.startsWith(project + '.archived-')`, and `resolveFinalizeAuthority` refuses when more than one
matches. Driven:

```
suffix ".orphan-2026-08-02T00-00-00Z"   -> finalize --check  exit 0, ok:true
suffix ".archived-2026-08-02T00-00-00Z" -> finalize --check  exit 1, reasons:["archive_authority_ambiguous"]
```

A `.archived-` suffix would break the next resume; a non-matching suffix does not.

Trade-offs of each lossless option, for the decider:

- **move-aside** — clears the claim, keeps everything, does not disturb authority resolution *if* the
  suffix does not match the `.archived-` prefix. Leaves an untracked folder under `archive/` that the
  sink's preflight may see as foreign dirt (the same class `#715`'s `commitDiscardArchive` handles for
  release archives) — worth checking before adopting.
- **stamp-terminal-in-place** — smallest change, clears the claim, keeps everything; but leaves a
  folder at `kaola-workflow/<project>/` that a later claim of the same project name would collide
  with, and that `archiveProjectDir` would find as a live `src` on a later run.
- **compare-then-delete** — reuse the `:2531` shape (compare `mainLive` against the archive; delete
  only what is subsumed). Preserves today's behaviour on the common case (L2/L3 delete exactly as
  now) and refuses only on the genuine L1 case. But it *reintroduces* the refusal #395 was avoiding
  for that narrow case, so it needs one of the two above as the non-refusing fallback to converge.

### Open, for the user

Whether the backstop's obligation is "**remove** main's live folder" or "**stop `readActiveFolders`
from claiming it**". #395 and #395.4's own comment state the latter as the goal
(`kaola-workflow-claim.js:4098-4099`: *"keeps `readActiveFolders` claiming the project"*), and the
measurement above shows the latter is achievable without the former. That is a value call about the
archive contract, not a fact — recorded here, not decided.

---

## Inferences (labelled; each refutable)

- **The two routes are one defect class with two instances** — a live copy disposed of on the strength
  of a comparison that never covered it. Confidence: high. *Refuted by:* showing either route's delete
  is preceded by a comparison against that copy.
- **Route 2's fix does not require a third comparison reader.** Only `:2531` needs the new
  distinction; `:2492` already reads both halves. An additional key on the existing return object
  reaches it. Confidence: high (both call sites enumerated in all four editions; no third exists).
  *Refuted by:* a caller of `verifyArchiveComplete` outside those eight sites, or a consumer of the
  raw return object I did not find.
- **Route 2's fix must also close `missingArchiveSidecars`' `isFile()` filter**, or leg R4 stays
  destructive after a symlink-aware `verifyArchiveComplete` lands. Confidence: high (measured).
  *Refuted by:* a symlink-aware required-set change that happens to cover the sidecar names too.
- **Acceptance criterion 4 currently cannot be met by one shared rule**, because GitLab and Gitea omit
  `mission-list.md` from the fixed-name set. Whether to converge them is a separate call.
  Confidence: high (measured by running all four editions). *Refuted by:* nothing I can see; the
  divergence is in the shipped source.
- **`archiveStateStamped = 'repaired'` (`:4093`) is unreachable from `cmdFinalize`.** Confidence:
  medium-high — L1–L4 all report `not_needed` and L5 shows a non-closed archive refuses upstream.
  *Refuted by:* another caller reaching that block with a non-terminal archive state, or a route where
  `result.dest` differs from `finalizeAuthorityDir`.
- **A fix at the `archiveProjectDir` layer would not cover Route 1.** The backstop is in
  `cmdFinalize`, on a path where `archiveProjectDir` already early-returned `source-missing` and never
  ran its comparison. Confidence: high (measured — L1's envelope carries `skipped: "source-missing"`).

## Open / unmeasured

- Whether the `.orphan-` folder would trip the sink's preflight foreign-dirt check. Not measured — it
  needs a full sink run, outside this brief.
- The GitLab/Gitea editions were exercised by **calling their exported `verifyArchiveComplete`
  directly**, not by driving their CLIs end-to-end (those need forge mocks). The end-to-end
  reproductions above are canonical-edition only; the shared backstop and comparison lines are cited
  per edition instead.
- Whether any *real* run has ever placed a symlink in a run folder. `copyDir` follows symlinks, so
  archives do not normally contain them; the exposure is main-only entries an operator or a tool
  created. Not measured — it is a question about history, not about the code.

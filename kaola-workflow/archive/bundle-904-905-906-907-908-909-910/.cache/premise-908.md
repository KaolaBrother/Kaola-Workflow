# Investigation: issue #908 — do the five recorded coverage gaps and five notes still describe what shipped?

## Setup

- **Commit measured**: `2018521f` (`chore: archive bundle-900-901-902-903 [sink]`), branch `main`,
  working tree clean apart from the untracked `kaola-workflow/bundle-904-905-906-907-908-909-910/`.
- **Node**: v24.14.0. Platform darwin. Non-root (`chmod`-based axes are live, not inert).
- **Issue text read in full** via `gh api repos/:owner/:repo/issues/908` (`gh issue view` fails on this
  box: token lacks `read:project`).
- **Fixtures**: everything under
  `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/8070a702-.../scratchpad`.
  No tracked file was edited. Two scratch mirrors were used for mutation work:
  `mirror1/` (a copy of `scripts/`) and a transient `mirror2/` (whole tree minus `.git`), both deleted
  or restored after use.

### The dating fact that governs three verdicts

| event | timestamp |
|---|---|
| issue #908 created | `2026-08-01T16:32:29Z` = `2026-08-02T00:32:29+08:00` |
| commit `7350ba9c` (the bundle's repair commit) | `2026-08-02T00:43:33+08:00` |
| commit `2018521f` (HEAD, the archive/sink commit) | `2026-08-02T00:45:18+08:00` |

**#908 was filed 11 minutes before the repair commit landed.** `git log -S` puts both
`missingArchiveSidecars` (the production function the issue proposes extracting) *and* the D1 leg suite
(the pin the issue says does not exist) inside `7350ba9c`. Gaps 1 and 3 are therefore describing a
mid-run snapshot, not what shipped.

### Commands run (verbatim, all from the repo root unless stated)

```
gh api repos/:owner/:repo/issues/908 --jq '.title, .body'
git log --oneline -S 'missingArchiveSidecars' -- scripts/kaola-workflow-claim.js
git log --oneline -S 'issue-94103' -- scripts/test-claim-hardening.js
node scripts/test-claim-hardening.js                                   # baseline
node <scratch>/mirror1/scripts/test-claim-hardening.js                 # mirror control
node <scratch>/mirror1/scripts/test-claim-hardening.js                 # MUT-1 mutant
KAOLA_WORKFLOW_OFFLINE=1 node scripts/simulate-workflow-walkthrough.js --only testClosureAuditScopedArchive
node <scratch>/probe-gap5.js <closure-audit path>                      # shipped vs mutant
node <scratch>/probe-notes.js                                          # notes b, c + gap-2 adjacent
node <scratch>/probe-e2.js                                             # note e (unit + route)
node <scratch>/probe-d2.js                                             # note d (control + axis)
node <scratch>/probe-gap2.js                                           # gap 2 second-worktree route
cd <scratch>/mirror2 && node scripts/validate-script-sync.js           # export-cost measurement
cd <scratch>/mirror2 && node scripts/edition-sync.js --check
cd <scratch>/mirror2 && node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
```

---

## VERDICT TABLE

| # | item | verdict | one-line basis |
|---|---|---|---|
| **G1** | `archive_incomplete` + `missing[]` emit unpinned end-to-end | **ALREADY CLOSED** | `test-claim-hardening.js:4745-4795` (D1 L4/L5) drives `claim.js release` end-to-end and asserts `refuse`/`archive_incomplete`/`missing[]` naming the file; mutation-proven armed. The proposed extraction is *already in the tree* (`claim.js:5220`), and no export was needed. |
| **G2** | two linked worktrees; `resolveRecordFolder` reads invoking tree + main only | **STILL OPEN** (reasoning holds) | Measured: a folder resident only in a *second* linked worktree yields `project_folder_missing`. But an **adjacent, ordinary-topology branch is unpinned** — see G2-b below. |
| **G3** | full `cmdFinalize` (archive + closure) in the worktree lane | **STILL OPEN, narrowed** | The *self-host* worktree-lane full finalize **is** pinned (`test-claim-hardening.js:4383-4407`, archive dest asserted on disk). The un-driven case is the **consumer-repo** worktree lane: `T8m` (`test-finalize-door.js:1435`) stops at `--check`. |
| **G4** | codex `closure-audit` copy has no suite of its own | **STILL OPEN** (confirmed) | Codex walkthrough + codex contracts validator contain **0** references to closure-audit; mutating the codex copy passes the whole codex chain's own suite and is caught **only** by `validate-script-sync.js` byte-identity (which *is* armed — mutation-proven). |
| **G5** | `archiveNameIsAmbiguous` unexported; four CLI legs cover it | **STILL OPEN, cheaply closable with NO export** | Mutation-proven: deleting `.filter(e => e.isDirectory())` (`closure-audit.js:220`) leaves both scoping scenarios **green**. A fifth CLI leg (a regular *file* in the band matching the name shape) discriminates it — built and run, shipped vs mutant differ. |
| **Na** | recorder command name twice at `adaptive-schema.js:1206`/`:1207`, nothing keeping them in step | **CONFIRMED, and worse than stated** | Both spellings currently identical; the four file copies are byte-identical (so cross-copy drift is impossible) but **no test asserts either hint's text**, and the string appears on **no other surface in the repo**. A third, unbound spelling sits in the runner's own `usage()` (`validation-runner.js:1411`). |
| **Nb** | `record` in a self-host repo writes a file the gate never reads | **CONFIRMED (measured)** | `record` exits 0 / `outcome: recorded` / `verdict: pass` written; the gate returns `mode: "chain-receipt"`, `classification: "chains_unverified"` and never opens the file. No repo-kind warning is emitted. |
| **Nc** | a band-shaped directory in *no* repository still receives the `--output` JSON | **CONFIRMED (measured, with control)** | Non-repo band path: exit 0, file written. Same shape inside a repo: exit 2, nothing written. |
| **Nd** | the `sync_required` arm does not probe its destination | **CONFIRMED (measured, one-bit control)** | Writable dest → `sync_required`, `ok:true`, real finalize exit 0. Unwritable dest → **still** `sync_required`, **still** `ok:true`, `reasons: []` — and the real transaction exits 1 with a typed `archive_exception`, destroying nothing. |
| **Ne** | the exemption is silent about byte differences; the stated rationale could not be confirmed | **SETTLED — the rationale is wrong, the exemption is not too wide** | The exemption is silent about bytes *and* absence (with non-exempt controls proving it is the exemption doing it). A legitimate byte difference **does** exist — but on the `mainLive ↔ dest` pair, not `src ↔ dest`, and byte tolerance there is a **caller** property (`claim.js:2531` reads `.missing` only) that already covers every file, exempt or not. |

---

## G1 — the `archive_incomplete` emit

### What the code actually is

The inline loop the issue points at (`claim.js:2500-2510`) is no longer a loop; those lines are the
comment block explaining the change. The function the issue proposes creating **already exists**, in
all four copies:

| copy | function | call site |
|---|---|---|
| `scripts/kaola-workflow-claim.js` | `:5220` | `:2532` |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | `:5220` | `:2532` |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | `:4936` | `:2310` |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | `:4942` | `:2311` |

```js
// scripts/kaola-workflow-claim.js:5220
function missingArchiveSidecars(liveDir, destDir) {
```

It is **not** in `module.exports` (`claim.js:5952` exports `verifyArchiveComplete`; the neighbouring
name is absent). The emit itself is `claim.js:2540-2546`:

```js
    if (!v.ok || missingFromMain.length > 0) {
      const missing = Array.from(new Set((v.missing || []).concat(missingFromMain)));
      return { skipped: undefined, archived: false, archive_incomplete: true,
        missing, mismatched: v.mismatched || [], dest };
    }
```

### Is it pinned end-to-end? Yes — twice, with no seam

- `scripts/test-claim-hardening.js:4745-4795` — the **D1 five-leg suite**. Legs L4 (`.cache/EXTRA.md`,
  ordinary main-only file) and L5 (`.cache/final-validation.md`, the *exempt* sidecar — i.e. the
  `missingArchiveSidecars` half specifically) each spawn `claim.js release --project <p> --json` from a
  real linked worktree and assert `status === 1 && j.result === 'refuse' && j.reason ===
  'archive_incomplete'` plus `j.missing.includes(leg.lost)`. L1-L3 are the must-not-refuse controls.
- `scripts/test-claim-hardening.js:4034-4079` — the `#941` arm drives `claim.js finalize --keep-worktree`
  and asserts the same typed reason with the `mismatched[]` half.

### Mutation proof that the D1 pin is armed

One axis: the presence re-check. Mirror-of-`scripts/` methodology (never `git checkout --`).

| leg | tree | failures | delta vs control |
|---|---|---|---|
| shipped baseline | repo | `claim-hardening tests passed (557 assertions)`, exit 0 | — |
| mirror control (claim.js byte-identical to shipped) | mirror1 | 22 failures / 535 passed | all 22 are `#837(P7/P8/P9)` — assertions that read `plugins/**` and `templates/routing/**`, which the `scripts/`-only mirror does not carry. Mirror artefact. |
| **MUT-1** — `.concat(missingArchiveSidecars(mainLive, dest))` deleted from `:2532` | mirror1 | 27 failures / 530 passed | **exactly +5, all `#901(D1 L5_sidecar)`** |

`comm -13 control mutant` returns precisely the five L5 assertions. The pin is armed and specific.

### The sharper question: can a CLI fixture reach the emit without extracting anything?

**Yes — and one already does.** The D1 legs use no export, no test hook and no production seam; they
build a `git worktree add` topology on disk and drive the shipped CLI. So the mechanism the issue
declined (extract + export ×4) was the wrong mechanism for this gap.

### The cost of the declined mechanism, measured anyway

`validate-script-sync.js:485` is exactly where the issue says it is:

```js
  { label: 'forge claim module.exports superset', canonical: 'scripts/kaola-workflow-claim.js',
    ports: forgeBothPorts('claim'), canonicalOnly: ['ghExec'] },
```

Measured in `mirror2` (whole tree minus `.git`) by actually adding the export:

- **Step 1 — canonical only** → `validate-script-sync.js` exit **1**, three findings:
  `Out of sync (scripts/ vs plugins/kaola-workflow/scripts/): kaola-workflow-claim.js`, plus
  `forge claim module.exports superset: …gitlab… omits canonical export(s) [missingArchiveSidecars]`
  and the same for gitea.
- **Step 2 — all four sites** (`scripts/`, byte-copy to `plugins/kaola-workflow/scripts/`, and the
  `module.exports` block of each of `kaola-gitlab-workflow-claim.js` / `kaola-gitea-workflow-claim.js`)
  → `validate-script-sync.js` exit **0**, and `edition-sync.js --check` exit **0**.

So: **four export sites, both ports need the same symbol, no `canonicalOnly` entry required.** The
issue's cost statement is accurate. It is simply no longer necessary.

---

## G2 — two linked worktrees

`resolveRecordFolder` (`scripts/kaola-workflow-validation-runner.js:1105-1123`) reads the invoking root,
then main via `schema.resolveMainRoot`, and returns `{ dir: null }` otherwise.

**Measured** (`probe-gap2.js`): three trees — `main`, `wtA`, `wtB` — run folder resident **only** in
`wtB`, `record` invoked from `wtA`:

```json
{"exit":1,"outcome":"inconclusive","reasons":["project_folder_missing"],
 "searched_paths_named_in_hint":false}
```

The hint names `wtA/kaola-workflow/<p>` and `main/kaola-workflow/<p>` and does not name the folder that
exists — which is the documented behaviour (`validation-runner.js:1321-1324` tells the operator to
record from the worktree that holds the claim). **The gap is real and the recorded reasoning holds: a
pin here asserts the absence of a route nobody asked for.**

### G2-b — the adjacent branch that *is* reachable, and *is* unpinned

`otherProjectRoots` (`:1130-1149`) and the hint it feeds (`:1369-1370`) do **not** need two linked
worktrees. **Measured**: main + **one** linked worktree, both carrying the folder, `record` run from
main:

```json
{"exit":0,"outcome":"recorded",
 "other_candidate_roots":["/private/var/folders/.../g2-Ux98O7-wt"],
 "operator_hint_fired":true,
 "operator_hint":"This project also has a run folder in /private/var/.../g2-Ux98O7-wt. The finalize gate hashes the working tree its own s…"}
```

The only pin on this field is the **empty-array negative** at `test-finalize-door.js:1130-1133`
(`T8c(plain repo)`). The non-empty branch and its hint are unpinned, in an ordinary topology — this is a
*different* gap from the one #908 records, and it is not covered by G2's reasoning.

---

## G3 — full `cmdFinalize` in the worktree lane

Two lanes must be kept apart:

- **Self-host worktree lane — PINNED.** `test-claim-hardening.js:4383-4407` (`#902(A)`) runs
  `runFinalize902(fx, fx.wtRoot, [])` — the real transaction, no `--check` — and asserts `status === 0`,
  `finalize_transaction.mirror === 'mirrored'`, that the envelope **reports** an archive dest under
  main's band, and that `workflow-state.md` is on disk **at the dest the envelope names**. Arms B/C/D/E
  and G1-G3 drive the real transaction too. `mk902` writes a `package.json` declaring all four
  `test:kaola-workflow:*` scripts (`:4230-4235`), so this is a **self-host** fixture.
- **Consumer-repo worktree lane — NOT DRIVEN.** `T8m` (`test-finalize-door.js:1350-1466`) builds
  `initConsumerRepo` + `git worktree add`, records, and then drives
  `runClaim(['finalize', …, '--check', '--json'], wt, ghMock)` at `:1435`. Every other `finalize`
  invocation in that file (`:430` via `buildFinalizeFixture`, `:607`) uses `initSelfHostRepo` (`:422`)
  and the in-place lane.

So the issue's description is accurate, with one clarification it does not make: the *delta* is
specifically **consumer-repo × worktree lane × full transaction**, where the validation classification
comes from the recorder's `final-validation.md` rather than a chain receipt. `T8m` already has the
`gh` mock (`writeGhMock(path.join(base, 'bin'), [9010])`, `:1434`) that a closure half would need.

---

## G4 — the codex `closure-audit` copy

Confirmed exactly as recorded, and mutation-proven in both directions.

- `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` is in `COMMON_SCRIPTS`
  (`validate-script-sync.js:49`), so byte-identity with canonical is enforced.
- **Zero** references to closure-audit in `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
  or in `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`.
- The **gitlab and gitea ports do have their own suites** (`test-gitlab-workflow-scripts.js:2878+`,
  `test-gitea-workflow-scripts.js:2629+`, `:3215`, `:3284-3379` — including `archive_name_ambiguous`
  assertions). Codex is the only copy without one.
- **Mutation** (codex copy only, `archiveNameIsAmbiguous` → `return false`):
  `validate-script-sync.js` exits **1** naming `kaola-workflow-closure-audit.js`;
  `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` exits **0**
  (`Kaola-Workflow walkthrough simulation passed`, 184 spawns).

So the byte-identity guard **is** armed, and it is the *only* thing standing there — "its parity is a
guard away, not a fixture away" is correct.

**One correction to the issue's arithmetic**: the canonical registry carries **37** closure-audit
scenarios (`simulate-workflow-walkthrough.js:11058-11097`), of which 14 carry the `903` suffix. The
issue says 13.

---

## G5 — `archiveNameIsAmbiguous`

`scripts/kaola-workflow-closure-audit.js:216-223`:

```js
function archiveNameIsAmbiguous(root, project) {
  const archiveBase = path.join(root, 'kaola-workflow', 'archive');
  let names;
  try {
    names = fs.readdirSync(archiveBase, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
  } catch (_) { return false; }
  return names.filter(n => archiveNameMatchesProject(n, project)).length > 1;
}
```

Not in `module.exports` (`:736-756` exports `archiveNameMatchesProject`, `resolveProjectIssues`,
`partitionDriftByScope`, … — not this one). Confirmed unexported, as recorded.

### The existing legs, and what they arm

Driven through `runClosureAuditOffline` (the real CLI) in
`simulate-workflow-walkthrough.js:9019-9157` — five legs, not four:
bare `P` + `.archived-<ts>`; two `.archived-` siblings; `.archived-` + `.discarded-`; the solo negative
control; and the `proj-a` / `proj-a-extra` / `proj-a.something` name-shape control.

**Mutation results** (mirror of `scripts/`, `--only testClosureAuditScopedArchive`, baseline green in
both repo and mirror):

| mutation | suite | verdict |
|---|---|---|
| `.length > 1` → `> 0` | exit **1** | caught |
| `.length > 1` → `> 2` | exit **1** | caught |
| drop `.filter(e => e.isDirectory())` | exit **0** | **NOT caught** |

### The sharper question: an uncovered case reachable by a CLI leg

**Yes.** A regular **file** in the archive band whose name matches the project's archive-name shape.
Built as a real CLI fixture (`probe-gap5.js`: a temp git repo, `archive/proj-b/` with a record, plus a
regular file `archive/proj-b.archived-2026-01-01T00-00-00-000Z`) and run against both binaries:

```
SHIPPED : {"exit":0,"scope":{"project":"proj-b","issue_numbers":[931],"state_file":"…/proj-b/workflow-state.md"}}
MUTANT  : {"exit":0,"scope":{…,"archive_name_ambiguous":true}}
```

The shipped code is right; the mutant is wrong; **no existing leg tells them apart.** Closing this needs
one more CLI leg and **no export** — so the recorded reasoning ("a module surface should not widen for a
test's convenience") is not the thing standing in the way.

Two further branches remain uncovered and are *not* CLI-reachable without an unreadable-directory axis:
the `catch (_) { return false; }` arm (unreadable `kaola-workflow/archive/`).

---

## Na — the recorder command name, twice

Both sites carry the **identical** string today, and all four kernel copies are byte-identical:

```
scripts/kaola-workflow-adaptive-schema.js
  :1206  "kaola-workflow-validation-runner.js record --project <project> --verdict pass --command \"<the validation command you ran>\""
  :1207  "kaola-workflow-validation-runner.js record --project <project> --verdict pass --command \"<the validation command you ran>\""
  identical spellings: true
… same for the codex, gitlab and gitea copies
four adaptive-schema copies byte-identical: true
```

`:1206` is `final_validation_unbound`'s hint; `:1207` is `final_validation_stale`'s.

**Is this a live defect?** The cross-copy axis is closed (byte-identity + `edition-sync`), so a drift
introduced in canonical propagates identically to all four — it cannot make the four copies disagree.
The **within-file** axis is open and, measured, wider than the note says:

- **No test asserts either hint's text.** Every assertion touching these two classifications
  (`test-finalize-door.js:1079, 1140, 1156, 1166, 1173, 1188, 1297, 1425`) reads
  `g.classification`, never `operator_hint`.
- **The string appears on no other surface**: grepping `validation-runner.js record` across
  `scripts/`, `plugins/`, `templates/`, `commands/`, `agents/`, `docs/` returns hits **only** in
  `kaola-workflow-adaptive-schema.js` (the two hints) and `kaola-workflow-validation-runner.js`.
- A **third** spelling of the same invocation lives in the runner's own `usage()`
  (`validation-runner.js:1411`), bound to neither hint.

So a renamed flag would leave three independent spellings free to disagree, with nothing reading any of
them. It is a drift *surface*, not an observed drift.

---

## Nb — `record` in a self-host repo

**Measured.** Temp git repo whose `package.json` declares `test:kaola-workflow:claude`:

```json
{"probe":"note-b","record_exit":0,"record_outcome":"recorded","file_written":true,
 "recorded_verdict_line":"verdict: pass","gate_mode":"chain-receipt",
 "gate_classification":"chains_unverified","gate_green":false,
 "record_warned_about_repo_kind":false}
```

Confirmed by reading: `evaluateChainReceipt`'s self-host branch (`adaptive-schema.js:1312-1371`) returns
from every arm; `const fvPath = path.join(cacheDir, 'final-validation.md')` is `:1373`, downstream of
those returns. `recordFinalValidation` (`validation-runner.js:1271-1373`) never classifies repo kind, so
nothing at the write side says so either. The note's mitigation ("the gate tells the truth at the door")
holds — `chains_unverified` is emitted, not a false green.

---

## Nc — a band-shaped directory in no repository

`validation-runner.js:1458-1459`:

```js
    const outputRoot = values.output ? owningWorkingTree(values.output) : '';
    if (outputRoot && isArchiveBandPath(outputRoot, values.output)) {
```

`owningWorkingTree` (`:1214-1224`) returns `''` when the path belongs to no repository, and the guard is
short-circuited by the `outputRoot &&`.

**Measured, with the positive control the claim needs:**

```json
{"probe":"note-c","outside_is_a_git_repo":false,
 "nonrepo_band_exit":0,"nonrepo_band_file_written":true,
 "control_in_repo_band_exit":2,"control_in_repo_band_file_written":false,
 "control_stderr":"validation-runner: --output must not resolve inside the durable archive band …"}
```

Confirmed exactly as recorded, including the note's own mitigation: with no repository there is no
durable archive to corrupt.

---

## Nd — the `sync_required` arm

`probeFinalizeMirror` (`claim.js:3485-3526`) computes `ready` once at `:3504`
(`mirrorDestWritable(destDir) ? 'ready' : 'sync_failed'`) but the `sync_required` return at `:3521`
never consults it — it probes `srcDir` / `srcRecord` (`:3518-3519`), which is main.

**Measured, one axis, one bit (the mode of the worktree's run folder), with a writable twin:**

| leg | axis probe | `checks.mirror` | `checks.workflow_state` | `ok` | `reasons` | real finalize | envelope | live copies |
|---|---|---|---|---|---|---|---|---|
| CONTROL writable | n/a | `sync_required` | `ok` | `true` | `[]` | **exit 0**, `archived: true` | parsed | both deleted |
| AXIS unwritable | `EACCES` | `sync_required` | `ok` | `true` | `[]` | **exit 1** | parsed, `reason: "archive_exception"` (no `inner_reason` key) | **both survived** |

So all three halves of the note check out, and one is sharper than recorded:

- "does not probe its destination" — **confirmed**: the two legs are indistinguishable at `--check`.
- "cannot yield `pending_mirror`" — **confirmed twice**: by reading
  (`predictFinalizeAuthority` at `:3635-3636` requires `mirror.state === 'ready'`) and by measurement
  (`workflow_state: 'ok'`, not `pending_mirror`).
- "now typed rather than a stack trace" — **confirmed**: a parseable envelope, `archive_exception`
  (a *different* door from `mirror_sync_failed`), and nothing destroyed.
- **Not in the note**: `--check` reports `ok: true` with `reasons: []` on a topology the transaction
  cannot complete. That is the check/execute disagreement class `#902` exists for, reached through the
  `sync_required` arm instead of the `pending_mirror` one.

---

## Ne — is the exemption too wide? (settled)

### What the exemption actually hides — unit measurements against exported `verifyArchiveComplete`

`claim.js:5291` skips `ARCHIVE_CACHE_SIDECAR_MD` names during the source walk; `listSourceEvidenceFiles`
(`:5230-5242`) excludes them from `required` too.

| leg | `ok` | `missing` | `mismatched` |
|---|---|---|---|
| E1 exempt sidecar, **different bytes** | `true` | `[]` | `[]` |
| E2 **control** non-exempt file, different bytes | `false` | `[]` | `[".cache/n1-evidence.md"]` |
| E3 exempt sidecar **absent** from dest | `true` | `[]` | `[]` |
| E4 **control** non-exempt file absent | `false` | `[".cache/n1-evidence.md"]` | `[]` |

The exemption is silent about **both** bytes and absence; the controls prove the exemption is what does
it, not some other property of the fixture.

### Can archive and live sidecar legitimately differ in bytes? YES — but not on the pair the issue names

- **`src ↔ dest` (the readable path the issue reasons about): they cannot differ.** `copyDir`
  (`claim.js:5181-5189`) has **no skip list** — it recurses and `fs.copyFileSync`s every entry or
  throws. The `final-validation.md` normalization (`:2455-2463`) and the terminal stamp both run
  **before** `copyDir(src, dest)` at `:2487`. So the issue is right that the stated rationale does not
  hold here.
- **`mainLive ↔ dest`: they differ routinely.** Measured on the `release` route — one of the three
  routes that run no Step-8a mirror — from a linked worktree, with main and the worktree carrying
  *different bytes* for both an exempt sidecar and a non-exempt file:

```json
{"probe":"note-e-route","route":"release from the worktree (no Step-8a mirror)",
 "exit":0,"archived":true,
 "archived_fv":"verdict: pass\nWORKTREE\n",      "main_fv_before":"verdict: pass\nMAIN\n",
 "archived_shared":"WORKTREE non-exempt bytes\n","main_shared_before":"MAIN non-exempt bytes\n",
 "exempt_bytes_differ_main_vs_archive":true,
 "nonexempt_bytes_differ_main_vs_archive":true,
 "main_live_deleted":true}
```

Main's live copy was deleted at exit 0 while its bytes differed from the archive's — for the **exempt**
sidecar *and* for the **non-exempt** file alike.

### Therefore

Byte tolerance on that pair is a **caller-level** property, not the exemption's: `claim.js:2529-2536`
reads only `verifyArchiveComplete(mainLive, dest).missing`, discarding `mismatched` entirely, exactly as
`:2510-2513` documents ("PRESENCE only, deliberately"). Removing the exemption would change nothing for
the main pair, and nothing for the src pair either (copyDir has just made them equal).

**The exemption is not too wide for the loss class it sits in**, because presence for exactly those five
names is re-added by `missingArchiveSidecars` (`:2532`) — the D1 L5 leg is the pin for that, and it is
mutation-proven above. What is wrong is the **recorded rationale**: the comment at `claim.js:5214-5216`
("a normalized sidecar may legitimately differ from its source") points at the pair where the difference
cannot occur. One residual blind spot, measured as harmless: an exempt-named symlink or mode-differing
exempt sidecar in the source is invisible to the walk, but `copyDir` follows it and writes the same
bytes to dest, so no evidence is lost — this is the same shape the `#941` arm pins for a *non*-exempt
name (`test-claim-hardening.js:4034-4079`).

---

## Cheaply closable, and what each would cost

| item | cost | needs a production seam? |
|---|---|---|
| **G1** | **zero — already closed.** If the record is to be updated, the only work is amending #908 to point at `test-claim-hardening.js:4745-4795`. | no |
| **G5** | **one CLI leg**, ~15 lines beside `testClosureAuditScopedArchiveAmbiguousMatch903`: plant a regular file named `<project>.archived-<ts>` in the band beside one real archive dir; assert `archive_name_ambiguous` stays omitted. Working fixture already built at `<scratch>/probe-gap5.js`. | **no** — this is the point; the declined export is not needed |
| **G3** | **drop `--check` and add assertions** in `T8m`, or add a sibling arm: the fixture, the `gh` mock (`:1434`) and the recorded validation are all already there. | no |
| **G2-b** (not in #908) | **one leg**: main + one linked worktree both carrying the folder, `record` from main, assert `other_candidate_roots` names the sibling and the hint fires. Measured reachable. | no |
| **Nd** | **one leg** on the existing `#902` fixture family: a `sync_required` topology with an unwritable destination; assert `--check` and the transaction agree (today they do not). Working fixture at `<scratch>/probe-d2.js`. Note this pins a *disagreement*, so it is a design question, not just a coverage one. | no |
| **Nc** | one leg (fixture at `<scratch>/probe-notes.js`) — but pinning it freezes the current answer, which the note argues is the right one. | no |
| **Nb** | one leg — same caveat: it would pin "the write succeeds and the gate ignores it". | no |
| **Na** | a guard would have to assert two string literals are equal, or that the hint's command parses against the runner's own CLI. | no, but it is the only item where the cheap fix is a *guard* rather than a leg |
| **G2** (as written) | asserts an absence. | no |
| **G4** | a codex-side fixture, or leave byte-identity as the mechanism (mutation-proven armed). | no |

**No item on this list requires a production seam.** The acceptance criterion "no production seam is
added purely to make a test possible" is satisfiable for every one of the ten.

---

## Open / not measured

- **G4's "13 pins"**: I measured 37 closure-audit scenarios in the canonical registry (14 with a `903`
  suffix). I did not reconstruct which 13 the issue author was counting.
- **`archiveNameIsAmbiguous`'s `catch` arm** (unreadable `kaola-workflow/archive/`) — reachable only via
  a `chmod`-based axis; not built.
- **Suite hermeticity**: the baseline `test-claim-hardening.js` run emitted
  `API rate limit exceeded for user` and `Could not resolve to an Issue with the number of 702` on
  stderr — i.e. at least one scenario reached the real GitHub API. It did not affect any verdict here
  (both the control and the mutant emitted them identically, and the D1/#941 legs set
  `KAOLA_WORKFLOW_OFFLINE=1` in their own spawn env), but it means that suite's result is not
  environment-independent. Not chased; outside this brief.
- **`missingArchiveSidecars` in the two forge ports** was confirmed present by grep + line read, but the
  ports' own suites were not run.

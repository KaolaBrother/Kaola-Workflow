# Repair — D1–D4 plus V2/V3/V4 in `claim.js` / `sink-merge.js`

**All seven findings were real. All seven are reproduced, fixed, controlled, and mutation-proven, in
all four editions.** Nothing was declined. V4 was **dissolved rather than fixed**, which changed D1's
shape: the mechanism V4 named is gone rather than kept.

**Verification tier: `tests-green`.** Fifteen suites exit 0 (walkthrough at FULL scope, 198/198,
2079 spawns), and every fix carries a defect reproduction, a discriminating positive control, and a
single-term mutant proving that fix — and not something else — supplies the behaviour. **No test file
was written or edited** (custody is `tdd-guide`'s). No test pin conflicts with any change; details
below.

Work is UNCOMMITTED in `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903`
on `workflow/bundle-900-901-902-903`. Nothing reverted, reformatted or tidied; no sibling's work
touched; the main checkout not edited.

Evidence, drivers, logs: `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/fixclaimsink/`

## WHERE TO VERIFY — the main root is at `9b68b096` and carries none of this

Every change is in the **worktree** and nowhere else. The same two files exist in the main checkout at
the pre-bundle baseline, so a `grep` that lands there reads the defect and looks like unfinished work.
Verify with the root named explicitly, never on an inherited cwd:

```
cd /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903 && pwd \
  && git rev-parse --abbrev-ref HEAD \
  && grep -n -A5 '^function stagedPathsUnder' scripts/kaola-workflow-sink-merge.js \
  && grep -n 'archiveIncompleteRemedy' scripts/kaola-workflow-claim.js
```

Current state of the two the rulings named:

| what | main root (`9b68b096`) | worktree (`workflow/bundle-900-901-902-903`) |
|---|---|---|
| `stagedPathsUnder` | `sink-merge.js:155`, `--name-only` + `.map(s => s.trim())` | `sink-merge.js:162`, `--name-only -z` + `split('\0')` |
| the D1 refusal prose | `claim.js:3788`, "dropped evidence **the live project** still held" | `claim.js:4059`, "dropped evidence **a live project folder** still held", + `archiveIncompleteRemedy` at `:4064` |

Both are present in **all four copies** of each file, with the old forms at zero (`-z`=1 / NUL-split=1 /
old-trim=**0** in all four sink copies; helper=1 / 2 render sites / old-singular-wording=**0** in all
four claim copies).

### CORRECTION — an earlier version of this section drew the wrong conclusion from that table

It said an unchanged pre-bundle line number is "the signature of the wrong root", and inferred from
`sink-merge.js:155` that a verification had landed in the main checkout. **That inference was unsound
and the claim was wrong.** The orchestrator's check printed `pwd` in the same shell invocation and read
the worktree; the worktree genuinely held the old form at that moment, because I had not yet made the
change.

The real sequence: D3's first pass fixed **three** `-z` sites (`ignoredUntrackedUnder`, `blobPathsUnder`,
`ignoredArchiveEvidence`) and this report listed `stagedPathsUnder` as the **fourth, still open** — my
own words, in the "Reported, not fixed" list, twice. The ruling then overrode that scope, and I fixed the
fourth. Seeing four `-z` sites afterwards, I read the whole set as "landed in the previous pass": true of
three, false of the one that had just been asked for.

The methodological lesson, which is why this stays in the record: **`:155` plus the old form was
consistent with two different explanations** — wrong root, or right root before the edit — so it was
never a signature of either. I picked one without ruling out the other, when the artifact that settles it
was my own prior report saying the site was open. A tell that matches two hypotheses is not a tell, and
the cheapest check on a claim about my own work is usually what I already wrote down.

### CORRECTION — I reported a network/rate-limit defect in `test-claim-hardening.js` that does not exist

I read `error connecting to api.github.com` and `API rate limit exceeded for user` in that suite's log
beside its exit 0, and reported that the suite reaches a real remote and passes while rate-limited. Asked
to sharpen it, I escalated instead of checking: I claimed every `gh`-dependent arm was unfalsifiable and
that the 557 assertions were worth less than the number suggests.

**All of it was false, and the conclusion inverts.** The suite authors those strings itself — `:692`
writes a mock that emits the rate-limit line and exits 1, and `:576`/`:636`/`:653` do the same for the TLS
failure — because it is testing those handling paths. So the string beside a green is evidence the arm
**ran**. Nothing is devalued; that green is more meaningful than a silent one. Independently confirmed by
a poisoned `gh` on `PATH` that was never invoked while the suite exited 0, and by the absence of any
absolute-path or non-`PATH` `gh` invocation in the suite or in `claim.js`.

Two things I take from it. First: I cited the rule against diagnosing network access from log text, and
then diagnosed network access from log text — invoking a rule is not the same as applying it. Second, and
worse: when asked to sharpen an observation I built a larger claim on an unmeasured premise, and the check
that would have refuted it was a `grep` of the suite for those strings — no spawn, no cost. **A sharper
conclusion drawn from an unchecked premise is not sharper, it is further from the ground.** The claim then
travelled: it was forwarded onward as established before anyone measured it, which is the damage an
unverified line in a report can do once it leaves the report.

## ATTRIBUTION — read before writing the CHANGELOG

**The `mainLive` delete and the src-only comparison are PRE-EXISTING. Neither is a regression from
this bundle.** Measured, not taken on faith — `git show 9b68b096:scripts/kaola-workflow-claim.js`
carries, at `:2497-2505`:

```js
if (!v.ok) return { …archive_incomplete: true… };   // the ONLY comparison, and it reads `src`
fs.rmSync(src, { recursive: true, force: true });          // worktree live folder
const mainLive = path.join(mainRoot, 'kaola-workflow', project);
if (fs.existsSync(mainLive)) {
  try { if (fs.realpathSync(mainLive) !== dest) fs.rmSync(mainLive, …); } catch (_) {}
}
```

So the accurate statements are:

- **#901 did not cause the data loss.** It added a sidecar presence re-check *beside* an already
  unguarded delete, and scoped that re-check to `src`.
- **#901 did make it worse in one specific way**: the new re-check reads as assurance about a delete it
  says nothing about. That is what V4 identified.
- **The three routes have been deleting main's copy uncompared for a long time** — `release`/`discard`
  (`:4451`), `watch-pr` on MERGED (`:5418`), the abandon backstop (`:5510`).
- **A FOURTH route exists that the finding list does not name** — see "Reported, not fixed" below.

## Method notes (so a negative can be trusted)

- **`id -u` = 501** on every run; the `chmod 555` / `000` axes are live, not inert.
- `KAOLA_WORKFLOW_OFFLINE` set **explicitly** per driver (`1` claim-side, `0` sink-side). Never inherited.
- Exit codes from bare `echo $?`, or `spawnSync().status`. Never through a pipe.
- **"Before" is a frozen scratch mirror** of `scripts/` **and** `plugins/`, captured before any edit
  (`fixclaimsink/before/`, md5-verified). Eight agents are writing this tree; reverting was never an
  option. Every before/after pair differs only in which mirror the driver's `WT` pointed at.
- Reproduction harnesses are the adversary's own (`advguards/c1.js`, `advguards/c23.js`), reused
  unmodified; my drivers extend them with legs, not rewrites.
- **Every control was re-run under every mutant**, to prove the controls are not coupled to the
  positive legs.
- **Hermeticity is proven with a PATH shim and an invocation probe, never read out of output.** A suite
  that deliberately mocks an error string will emit that string, and log text cannot distinguish a
  mocked failure from a real one. `test-claim-hardening.js` writes its own mock at `:692` —
  `fs.writeFileSync(mock, 'process.stderr.write("API rate limit exceeded for user\n"); process.exit(1);')`
  — precisely to exercise the rate-limit handling path, and `:576`/`:636`/`:653` do the same for a TLS
  failure. So that string beside a green means **the rate-limit arm ran**, not that an assertion was
  skipped: it makes that green more informative than a silent one, not less. Proven three ways — a
  poisoned `gh` on `PATH` was never invoked while the suite exited 0; there are no absolute-path or
  non-`PATH` `gh` invocations in the suite or in `claim.js`; and the strings are visible as fixtures in
  the source without running anything. I got this backwards once (see Corrections).

## Files changed (8 — four editions × two scripts)

| file | `+` / `−` |
|---|---|
| `scripts/kaola-workflow-claim.js` | +217 / −52 |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (byte-lockstep, `cmp` 0) | +217 / −52 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | +217 / −52 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | +217 / −52 |
| `scripts/kaola-workflow-sink-merge.js` | +73 / −11 |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` (byte-lockstep, `cmp` 0) | +73 / −11 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | +73 / −11 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | +73 / −11 |

No other tracked file. No test file, no `docs/`, no `templates/`, no `closure-audit.js`, no
`validation-runner.js`. No new export (`repoWideIgnoredNames`, `mirrorDestWritable`,
`missingArchiveSidecars` all unexported) → `FORGE_EXPORT_SUPERSET_FAMILY` untouched,
`validate-script-sync.js` exit **0**.

### The ports carry the canonical text, not a paraphrase

Added/removed line sets, compared byte-for-byte across the three editions:

| | added | removed | canonical vs gitlab | gitlab vs gitea |
|---|---|---|---|---|
| `claim.js` | 217 / 217 / 217 | 52 / 52 / 52 | `diff` exit **0** both sides | `diff` exit **0** both sides |
| `sink-merge.js` | 73 / 73 / 73 | 11 / 11 / 11 | one line, pre-existing wrapping (see D3) | `diff` exit **0** both sides |

Ported by applying the canonical `diff -u` with `patch --fuzz=3` to the **frozen baseline** port file,
so each port is the canonical delta and nothing else. Before each rebuild I proved no sibling had touched
those four files since the freeze: baseline + my previous diff `cmp`s byte-identical to the then-current
port, all four, both times.

**One hunk of thirteen could not be applied that way** — `stagedPathsUnder`, where the ports keep the
`execFileSync` call on one line and carry an abridged `#893` comment. `patch` rejected it loudly rather
than fuzzing it in; I hand-applied it against each port's own anchors, **preserving both pre-existing
shapes** rather than converging them, and asserted each anchor occurred exactly once. No `.rej` or
`.orig` remains anywhere in the tree. That divergence is the single line in the parity table above.

---

# D1 (+ V4) — the destruction gate guarded the wrong pair

V4 and D1 are one defect from two sides, and resolving them together makes the fix **narrower** than my
first pass: a mechanism removed, then the existing comparison re-aimed.

### V4 first: the added `src ↔ dest` sidecar check had no reachable condition

`copyDir` (`claim.js:5171`) recursively `copyFileSync`s every non-directory entry with no skip list; it
copies everything or throws, and a throw is caught by `archiveProjectDirSafely` before the check is
reached. Measured directly (`v4-unreachable.js`, lifting `copyDir` and `missingArchiveSidecars` out of
the **shipped bytes**, all five sidecars present):

```
missingArchiveSidecars(src,      dest) = []                                         <== the REMOVED check
missingArchiveSidecars(mainLive, dest) = [".cache/doc-updater.md",".cache/final-validation.md"]
                                                                                    <== the KEPT check
```

Same function. Empty on the pair `copyDir` has just made identical; non-empty on the pair nothing
guarantees. **So it was not merely dead — it was watching the wrong pair.** The `src`-side call is
**removed**; the function survives with one caller, on `mainLive`, where it is reachable and armed
(leg L5).

### Reproduction (`c23.js C2A`, frozen mirror, `BEFORE-claim.log`)

`release --project issue-91001` from the linked worktree; worktree holds 2 files, main holds 5:

```
exit=0  {"released":true,"archived":true,"discard_archive_committed":true}
>>> LOST FROM EVERYWHERE: [".cache/MAIN-ONLY-evidence.md",".cache/final-validation.md",
                           "finalization-summary.md"]
```

### Fix — `claim.js:2502-2551`

One rule, aimed at the pair that can break it: **no live copy is deleted while the destination is
missing a file THAT copy holds.** It reuses `verifyArchiveComplete`'s own `missing[]` half plus the
sidecar presence that comparison exempts by design (four of the five lost files are exempt names).
`mainLive`'s disposability is resolved once (`:2534-2537`) and the same variable decides both the
comparison and the delete (`:2551`), so they cannot disagree; a realpath that resolves to `dest`, or
throws, is neither compared nor deleted, exactly as before.

**Presence only, and only for main** — byte-identity is the wrong question there: the terminal stamp,
the #324 sentinel rewrite and the `final-validation.md` normalization all rewrite the *invoking* root's
copy, never main's. `mismatched[]` stays src-only.

**Two subtractions**, because a refusal on release/discard that is not data loss would be worse than
the bug: the #520 journals (the same two names `ignoredArchiveEvidence` and `SINK_STAGE_SKIP` already
subtract), and files this repository ignores **by name** (V3's helper — one mechanism, three callers). A
probe fault subtracts nothing, so an unprobeable repo **refuses rather than destroys**.

### Blast radius, answered by measurement (`d1control.js`, 8 legs; axis = what main's live folder holds)

| leg | main holds, beyond the worktree's | before | after | mutant |
|---|---|---|---|---|
| **L1_equal** | nothing (identical content) | archive, exit 0 | **archive, exit 0**, both deleted | — |
| **L2_subset** | nothing (a strict subset) | archive, exit 0 | **archive, exit 0** | — |
| **L3_absent** | no main live folder at all | archive, exit 0 | **archive, exit 0** | — |
| **L4_extra** | one ordinary evidence file | exit 0 — **destroyed** | **exit 1** `archive_incomplete` `missing:[".cache/EXTRA.md"]`, both copies retained | `mut-D1` → destroys again |
| **L5_sidecar** | one **exempt sidecar** | exit 0 — **destroyed** | **exit 1** `missing:[".cache/final-validation.md"]` | `mut-D1` → destroys again |
| **L6_journal** | `sink-receipt.json` + `sink-fallback.json` | exit 0 | **archive, exit 0** — no false refusal | — |
| **L7_junk** | `.DS_Store` and `.cache/.DS_Store` | exit 0 | **archive, exit 0** — no false refusal | `mut-D1junk` → **exit 1**, `missing:[".DS_Store",".cache/.DS_Store"]` |
| **L8_mixed** | junk **and** a journal **and** one real evidence file | exit 0 — destroyed | **exit 1**, `missing:[".cache/REAL-evidence.md"]` **only** | `mut-D1junk` → also names the junk |

**L8 is the discriminating control**: the subtractions are precise, not blanket — they drop the junk and
the journal and still catch the evidence in the same folder. All eight legs identical on gitlab and gitea.

**Answer to the blast-radius question: no route now refuses on a case that is not data loss, as far as I
could construct one.** The two classes I could name (journals, name-ignored junk) are subtracted and
proved so by L6/L7, with `mut-D1junk` proving the subtraction is what does it. What *does* now refuse is
a main-only **evidence** file, which is the bug. The refusal is non-destructive (both live copies **and**
the partial `dest` are retained).

### The remedy, as wording (no schema change)

`missing[]`'s shape is untouched. What was underspecified — *which* tree to put the files in — is now
stated in prose, from **one** helper so the sentence exists once: `archiveIncompleteRemedy(root, project)`
at `claim.js:2728`, rendered by the two surfaces that carry prose (`cmdFinalize`'s `reasoning` at
`:4064` and `release`/`discard`'s at `:4586`). Measured output:

> Every live copy is compared against the archive — the run folder in the tree this command was invoked
> from (`<wt>/kaola-workflow/issue-91301`) and, on a linked run, the one in the main checkout — so a
> named file may be held by either. Put each named file in `<wt>/kaola-workflow/issue-91301`, then
> re-run: the archive is built by copying THAT folder, so a file left only in the main checkout is not
> carried in.

`watch-pr` and the abandon backstop push structured entries into arrays with no prose slot; adding one
would be schema, so they still carry `reason` + `missing` only, as they always did. Both are sweep
surfaces where the operator's next move on that project reaches one of the two prose routes.

On ordinary `finalize` this cannot fire: Step 8a makes the worktree a presence-superset of main first.

### CORRECTION to my previous report — a main-only SYMLINK is not fully covered

I wrote last round that a main-only symlink "would now refuse rather than destroy". **That is wrong for
most symlink names, and I have measured it** (`d1-symlink.js`, `d1-symlink2.log`; the symlink's target
is present in *both* copies so the symlink is the only main-only entry):

| main-only symlink | result | main's copy |
|---|---|---|
| `.cache/link-evidence.md` | exit 1, `missing:[".cache/link-evidence.md"]` | **retained** |
| `extra-link.txt` | **exit 0, archived** | **destroyed** |
| `notes-link.md` (top level) | **exit 0, archived** | **destroyed** |

Mechanism: `verifyArchiveComplete` routes every symlink into `mismatched[]`, and the main leg ignores
that half on purpose (main's bytes legitimately differ). A symlink is only caught when its *name* also
lands in `listSourceEvidenceFiles`' set — i.e. a `.cache/*.md` name, or one of the four fixed top-level
names. Anything else is still deleted uncompared.

I did not fix it, deliberately: separating "cannot be compared" from "bytes differ" requires changing
`verifyArchiveComplete`'s return shape — a shared, pinned function — and a symlink-specific probe would
be the third reader the ruling steered me away from. Scope is narrow: `copyDir` *follows* symlinks
(`copyFileSync`), so archives do not normally contain them at all, and a main-only symlink whose target
is inside the run folder loses only the link, not the bytes. **Still strictly better than baseline**,
which destroyed every main-only entry silently. Recorded for its own issue.

### Mutation proofs

`mut-D1` (`missingFromMain = []`) → L4/L5 destroy again, L1–L3 and L6–L7 unchanged.
`mut-D1junk` (the by-name subtraction removed) → L7 false-refuses, **L6 stays green** (so the journal
regexp is a separate term), L1–L5 unchanged.

---

# D2 — `pending_mirror` promised what it never probed

Unchanged from the first pass and re-verified after the reshape. Reproduction: `--check` exit 0 /
`ok:true` / `pending_mirror` with the worktree's `kaola-workflow/` at `chmod 555`, then
`EXECUTION exit=1, envelope=null, EACCES … mkdir`.

**(a)** `claim.js:3489` + `mirrorDestWritable` at `:3518` — one `const ready` carried by all three
`'ready'` returns, walking to the nearest existing ancestor (on `pending_mirror` nothing at `destDir`
exists to probe). Answers the **existing** `sync_failed` → `mirror_sync_failed`; no new vocabulary.
**(b)** `claim.js:3285-3301` — `mergeCopyDir` wrapped, returning the **existing** `mirror_sync_failed`
already used for the sibling direction, with the same `TypeError`/`ReferenceError` re-throw as the
neighbouring catch. `cmdFinalize:3872` hint widened to cover both directions (the pinned literal
`reason: 'finalize_mirror_refused',` untouched).

After: `--check` exit 1 (`mirror: sync_failed`), execution exit 1 with a parseable
`finalize_mirror_refused` / `mirror_sync_failed` envelope naming the tree and the error. Identical on
gitlab and gitea. `archive_authority_missing` reappears beside `mirror_sync_failed` on that leg, because
the prediction correctly declines to promise a construction that cannot happen.

**Control** (`c23.js C3-none`, writable dest, the only axis): exit 0 / `pending_mirror` / empty
`reasons`, `archive_authority_missing` absent — the #902 conversion intact, before, after, and under
every mutant. **Mutants**: `mut-D2a` (`ready` forced) → `--check` `ok:true` again while execution stays
typed; `mut-D2b` (wrapper removed) → `envelope=null` again while `--check` stays refused. Separately
load-bearing.

Also typed the adversary's second variant (a file where `kaola-workflow/` belongs, previously `ENOTDIR`
untyped) — `tdd-guide` has since pinned exactly that as `#902(G3)`.

---

# V2 — `destAbsent` answered the wrong question

### Reproduction (`v2control.js`, frozen mirror, `BEFORE-v2.log`)

Worktree carries a **partial** run folder (`.cache/chain-receipt.json`, no `workflow-state.md`) — the
shape produced as soon as anything writes evidence into the worktree:

```
V2a  --check exit=1  ok=false  workflow_state="state_missing"  mirror="ready"  reasons=["state_missing"]
     EXECUTE exit=0  archived=true
```

`--check` reports an operator obligation; the transaction repairs it and succeeds. #902's defect class,
live one branch over.

### Fix

- `probeFinalizeMirror` (`claim.js:3495-3500`) — the emitted bit is now `destAuthorityAbsent` =
  `!existsSync(join(destDir,'workflow-state.md'))`, on all six returns. `destAbsent` stays a **local**,
  because the `skipped_post_archive` branch must keep mirroring `mirrorFinalizationArtifacts`' own
  `!existsSync(destDir)` test.
- `predictFinalizeAuthority` (`claim.js:3616-3625`) — converts `state_missing` as well as
  `archive_authority_missing`, and reads `destAuthorityAbsent`.

The predicate is now **literally the copy decision `mergeCopyDir` will make**:
`FINALIZE_MIRROR_DEST_OWNED` skips `workflow-state.md` only when the destination already has one, so
"dest has no `workflow-state.md`" is exactly "the mirror will write the authority".

### After, with three fail-closed controls

| leg | worktree folder | `--check` | execute | agree? |
|---|---|---|---|---|
| **V2a** | partial (no state file) | **exit 0**, `pending_mirror`, `reasons: []` | exit 0, archived | **yes — fixed** |
| **V2b** | `workflow-state.md` is a **directory** | exit 1, `state_invalid_type` | exit 1, same | yes — unchanged |
| **V2c** | none, and no live folder in main | exit 1, `archive_authority_missing` | exit 1, same | yes — unchanged |
| **V2d** | fully seeded (the shape every existing fixture builds) | exit 0, `ok` | exit 0, archived | yes — unchanged |
| **V2e** | partial, and **main's source has no state file** | exit 1, `state_missing` | exit 1, `state_missing` | **yes — still closed** |

**V2e is the discriminating control**: `state_missing` is converted only where the mirror can actually
repair it. V2b proves the conversion did not widen to tokens the mirror will not overwrite. Identical on
gitlab and gitea.

**Mutants**: `mut-V2bit` (the bit back to the directory question) and `mut-V2tok` (`state_missing` no
longer converted) each reproduce V2a's exact disagreement, and each leaves V2b/V2c/V2d untouched. Both
terms load-bearing.

---

# V3 — the force-add set was "every file on disk", not run evidence

### Reproduction (`v3control.js`, frozen mirror, `BEFORE-v3.log`)

Consumer's `.gitignore` = `.DS_Store` + `.cache/`; the archive holds `.cache/plain.md` and
`.cache/.DS_Store`:

```
V3a before: archive_forced_paths = [".cache/.DS_Store", ".cache/plain.md"]
            blobs at HEAD        = [".cache/.DS_Store", ".cache/plain.md", …]
```

The junk was force-added into main's `chore: archive … [sink]` commit, overriding a rule the consumer
wrote, and announced on stderr as a "run-evidence file".

### Fix

`repoWideIgnoredNames(root, rels)` — `sink-merge.js:1402`, `claim.js:2683` (**the two copies are
byte-identical, verified programmatically**). It asks whether a file with the same **basename at the
repository root** would be ignored, which separates a rule about *where* a file lives (`/.cache/`,
`kaola-workflow/issue-55/` — the archive's own location, the case #901 was authorized to override) from
a rule about *what it is called* (`.DS_Store`, `*.log` — junk and secrets the consumer wants tracked
nowhere). One batched `check-ignore --stdin -z --no-index`; exit 1 means "none ignored" and is not a
fault; a probe fault yields the empty set.

Three call sites:
- `sink-merge.js:2221-2225` — subtracted from **`requiredPaths`**, not only from `forcePaths`. A path
  that stayed required and un-forced becomes a missing blob and refuses, which would brick the sink over
  a `.DS_Store`.
- `claim.js:2712-2714` (`ignoredArchiveEvidence`) — that list *promises* the sink force-adds every
  entry, so it must name the same set or the NOTE describes an override that will not happen.
- `claim.js:2543-2544` — D1's blast-radius subtraction.

### After, with the essential control

| leg | `.gitignore` | before | after |
|---|---|---|---|
| **V3a** | `.DS_Store` + `.cache/` | junk force-added, junk is a blob | **not forced, not a blob**, sink still exit 0 `sinked`, `archive_missing_paths: []`, junk still on disk |
| **V3b** | `.DS_Store` + `.cache/`, **no junk file** | forced = `[.cache/plain.md]` | **identical** — evidence unaffected |
| **V3c** | `.cache/` only — **same filename, no name rule** | forced, blob | **still forced, still a blob** |

**V3c is the control that matters**: the subtraction is driven by the consumer's own rules, not by a
hardcoded basename. **Mutant** `mut-V3` (the narrowing removed) → V3a force-adds the junk again while
V3b/V3c are unchanged.

Per-edition, from the shipped bytes (`probe2-sink-helpers.log`), all four AFTER editions agree: the
required set carries the whitespace name, the symlink, the nested file and the evidence, and excludes
`.DS_Store`, `.cache/.git` and `sink-receipt.json` — `>> MISSING: []`.

---

# D3 — `.trim()` on `-z` output (permanent, non-convergent refusal)

Measured first, with `od -c`: `git ls-files -z` and `git ls-tree -r -z` are purely NUL-terminated with
**no** trailing newline, and the trailing space in `d/notes.md ` is present raw. So
`split('\0').filter(Boolean)` is complete, and `.trim()` was destroying what `-z` was chosen for.

Reproduction (`c1.js A3`/`A7`): `exit=1 sink_incomplete archive_missing_paths:[".../.cache/notes.md "]`,
**three identical refusals in a row**. Fix at `sink-merge.js:1377` + `:1390` and `claim.js:2714` — same
expression, same reasoning comment, all sites. After: A3 exit 0, `notes.md ` force-added and a blob at
HEAD, converging on the **first** run.

### The FOURTH reader — `archived_paths` no longer records a path that does not exist

Fixed on the ruling, and it is the one that mattered most: `persistArchivedPathsToSummary` writes this
list **durably into the archive**, so a mangled name is a false statement in the run's permanent record
— the same class as the evidence break #901 was filed for. `stagedPathsUnder` (`sink-merge.js:162`) is
now a `-z` reader with the identical expression, making the normalization consistent across **all four**
sites in the sink. Measured (`git diff --cached --name-only` under `od -c`): the plain stream C-quotes an
embedded newline and emits a trailing space **raw**, so `.trim()` ate the space and left the quoting.

| leg | before | after |
|---|---|---|
| A3 `notes.md ` | `".cache/notes.md"` — **a path that exists nowhere** | `".cache/notes.md "` |
| A5 `a\nb.md` | `"\"…/.cache/a\\nb.md\""` — C-quoted verbatim | `".cache/a\nb.md"` |
| A5 `ünïcödé-日本.md` | `"\"…/\\303\\274n\\303\\257c…\""` — octal-escaped | `".cache/ünïcödé-日本.md"` |

**Mutant** `mut-Z4` (this reader alone un-fixed) → `archived_paths` records `.cache/notes.md` again while
the blob verdict stays correct, so the fix is load-bearing and independent of the other three readers.

**Port note:** this is the one hunk `patch` could not apply to the forge editions — their
`stagedPathsUnder` keeps the `execFileSync` call on **one line** where canonical wraps it, and their
`#893` comment is abridged. Applied by hand against each port's own anchors, **preserving both
pre-existing shapes** rather than converging them. Consequence for the parity table: the added/removed
sets are byte-identical **port-to-port** (exit 0), and differ from canonical by exactly that one wrapped
line — shown verbatim in the evidence, and the line counts match across all six files.

### The remaining non-`-z` path readers, named for accuracy

`claim.js:2577`/`:3349`/`:3361`/`:3392`/`:5195` and `sink-merge.js:458` still split on `\n` with a trim.
None is a `-z` stream and none feeds durable evidence: they are ref names (no whitespace possible) or
prefix classifications (`startsWith('kaola-workflow/')`, project-name set membership). A C-quoted path
*would* break such a prefix test, so this is a latent instance of the same class — pre-existing, outside
the ruling, and recorded rather than changed.

**Controls** A0 (plain names), A5 (non-ASCII + embedded newline), A6 (nested + 0-byte): unchanged.
**Mutant** `mut-D3` (the trim restored in `ignoredUntrackedUnder` only) → A3 refuses again while the
symlink leg still survives a fresh clone, so D4's fix is not what fixed A3.

A7 attempts 2–3 still exit 1 at `step: push_upstream`. **Pre-existing re-sink-after-success behaviour**:
the identical fixture with plain filenames gives 0 / 1 / 1 on the pre-change mirror too (`rerun.js`).

---

# D4 — the symlink exclusion rested on a measurably wrong claim

The comment said neither a symlink nor a nested `.git` "becomes a blob". Measured:
`git add -f -- d/link.md` exits 0 and stages `120000 6c69a0e5…`. Reproduction (`c1.js A8`):
`steps.archive_commit:"done"`, exit 0, `fresh clone holds the symlink? false`.

Fix at `sink-merge.js:1325-1349` — behaviour **and** comment. After: the symlink is force-added, is a
blob, and **`fresh clone holds the symlink? true`**.

One condition changed beyond the symlink, flagged rather than buried: the `.git` skip is now
**type-agnostic**. Measured that `git add -f -- e/.git` **exits 0 and indexes nothing**, so a regular
*file* named `.git` in an archive was already required, already unstageable, and already a permanent
`sink_incomplete` — the D3 non-convergence shape, latent. Including symlinks would have added a second
instance. Removing an unsatisfiable refusal is the safe direction; visible in the probe table as
`.cache/.git` moving from `MISSING` to excluded.

**Control**: A0/A5/A6 unchanged. **Mutant** `mut-D4` (the symlink skip restored) → A8 back to `false`
while A3 still sinks. The two fixes are independently attributed in both directions.

---

# Decisions I was asked to make

## `FINALIZE_MIRROR_DEST_OWNED` and `.cache/final-validation.md` — **do not change it**

The hazard is real and I measured it (`mergecopy-hazard.log`; `mergeCopyDir` lifted from the shipped
bytes, `keepExisting` passed exactly as `claim.js` passes it):

| leg | worktree `workflow-state.md` after | worktree `.cache/final-validation.md` after |
|---|---|---|
| main HAS a copy | `"WORKTREE state"` (dest-owned, survives) | **`"verdict: fail"` — main overwrote the worktree's `pass`** |
| main has NO copy | `"WORKTREE state"` | `"verdict: pass"` — survives |

I am not changing it, for four reasons:

1. **The direction is the design, and inverting it is the same hazard mirrored.** main→worktree is
   authoritative for finalization artifacts — "the main copy is the one carrying the Finalization
   artifacts the orchestrator just authored". `final-validation.md` *is* one. Making the worktree's copy
   win would let a **stale** worktree receipt shadow a fresh main one, and `--check`'s validation rung
   reads exactly that file, so the failure would become a false green instead of a lost record.
2. **It cannot be expressed in the existing set.** `keepExisting` is documented as *top-level* entries
   and is dropped on the recursive call (`:3131`), so covering a `.cache/` member requires making
   `mergeCopyDir` path-aware — a shared helper with #837 pins in four editions.
3. **The trigger is moving.** The premise is that the recorder is unusable from the worktree, which
   another agent is fixing. Fixing the mirror now fixes a symptom whose cause is being removed.
4. **It is a value-laden call** about which tree owns the validation record. Mine to measure and
   surface, not to decide.

## Which fix shape for D1 — the existing comparison, re-aimed

Chosen: re-aim the **existing** comparison and delete the unreachable one, rather than add a third
reader. Two comparisons that can drift apart is how the original hole formed, and V4 proved the third
was inert. Net mechanism count for the sidecar question: **one removed, none added**; one shared helper
added for the by-name subtraction, with three callers.

---

# Reported, not fixed

Each of these carries **why** it was not fixed, not just that it wasn't: a watch item without its
reason rots into a TODO that a later reader deletes or re-litigates blind.

1. **A FOURTH uncompared `mainLive` delete, pre-existing, not in the finding list — ruled: do NOT gate.**
   `claim.js:4090-4092`, the #395.4 crash-resume backstop inside `cmdFinalize`, does
   `fs.rmSync(mainLive, …)` with **no comparison and not even the realpath check** the archive path has.
   Same destruction class as D1, and it is a fourth route on top of the three the finding named.
   **Why it stays**: it fires only on the source-missing path, i.e. only once the archive already exists
   and is terminal-closed, and its whole purpose is to stop `readActiveFolders` claiming a project
   forever after a crash. A refusal there would restore the **permanent orphan #395 exists to prevent** —
   trading a rare loss for a guaranteed non-convergence, which is the wrong direction. It is also
   pre-existing and outside all four issues. **Wants its own issue**, with this trade-off stated, so
   whoever picks it up starts from the reason rather than rediscovering it.
2. **A main-only SYMLINK is still deleted uncompared** unless its name is evidence-shaped. Measured, and
   it corrects a claim in my previous report. **Why it stays**: separating "cannot be compared" from
   "bytes differ" requires changing `verifyArchiveComplete`'s return shape — a shared, pinned function —
   and a symlink-specific probe would be a third reader of the same question, which is how the original
   hole formed. Scope is narrow: `copyDir` *follows* symlinks, so archives do not normally contain them.
   Full detail under D1 above.
3. **A *file* named `.git` inside an archive** was already a permanent unclearable `sink_incomplete`
   before this bundle (`git add -f -- e/.git` exits 0 and indexes **nothing**). **Why it stays**: making
   the `.git` skip type-agnostic avoided adding a *second* instance rather than creating the first, so
   the pre-existing one is untouched and unmasked. Wants its own issue.
4. **The `sync_required` arm still does not probe its destination.** **Why it stays**: never observed; it
   cannot yield `pending_mirror` (`predictFinalizeAuthority` requires `state === 'ready'`); and with
   D2(b) in place its failure is now a typed envelope rather than a stack trace, so the severe half is
   already gone. Additive derivation — recorded, not built.
5. **The journal regexp `/(^|\/)sink-(receipt|fallback)\.json$/` now has three copies in `claim.js`**
   (`:2543`, `:2711`, `:4475`). **Why it stays**: hoisting a `SINK_JOURNAL_RE` const means editing a
   pre-existing call site, and the brief said not to tidy. It is the "one rule, one wording" move for
   whoever is allowed to make it.
6. **R5, confirmed non-interacting.** `c1.js A1`/`A2` still refuse `sink_blocked` at preflight
   (`git status --porcelain` C-quotes those paths; #429/#715 family). D3's fix does not reach it —
   measured, not assumed.
7. **`docs/api.md:211` — CLOSED by the prose agent, not by me.** It now reads that the transaction owns
   the sync "in **both** directions", which is what D2(b) made true. Recorded here only so the trail
   from the code change to the doc change is legible.
There is **no eighth item.** An earlier revision of this list carried one about
`test-claim-hardening.js` reaching a real remote and passing while rate-limited. It was false in its
premise, so it is removed rather than narrowed — there is no residual finding, not "narrower than
stated" and not "worth someone's attention". The method note it produced is in **Method notes** above,
where it belongs; the rest of the episode is in **Corrections** at the top of this report.

# Test pins — no conflict, and `tdd-guide` converged independently

**No existing test pins the `mainLive` delete**, and none pins the removed `src`-side sidecar check. I
searched for both explicitly. `test-finalize-door.js` T6g/T6h pin `verifyArchiveComplete`'s *exemption*
(and say in prose that a separate presence re-check must exist before the delete) — satisfied: the
re-check exists, aimed at the pair that can differ. `test-sink-merge.js:1296/1375` are #893 sink
assertions about leaving main's copy byte-untouched, unrelated.

While I worked, `tdd-guide` authored D1 and D2 pins in `test-claim-hardening.js` and **reached the same
conclusion about the pair**: their comment at `:4657` says "the pair `mainLive ↔ dest` is the one that
can differ, and … the pair that must be [guarded]", with legs for an ordinary main-only file and a
main-only exempt sidecar — my L4/L5. `#902(G3)` pins the ENOTDIR envelope. All green against the
reshaped code (557 assertions).

**Still uncovered** (for `tdd-guide`): V2's partial-dest arm plus its V2b/V2e controls — every existing
`--check` fixture seeds the worktree folder fully or not at all, so `state_missing` is unreachable from
them; V3 entirely (no test anywhere mentions `.DS_Store` or the by-name subtraction, and it needs the
V3c no-rule control or it passes against a hardcoded name); D1's L6/L7/L8 subtraction legs; D3's
whitespace arm asserting on `git ls-tree -r -z`; D4's fresh-clone assertion; and a source-level pin that
no `.trim()` returns to the three `-z` readers in any of the four editions.

---

# Suites — real exit codes, **serial**, from the worktree

| suite | exit |
|---|---|
| `validate-script-sync.js` | **0** |
| `test-sink-merge.js` | **0** |
| `test-claim-hardening.js` | **0** (557 assertions) — see note |
| `test-finalize-door.js` | **0** |
| `test-bundle-finalize.js` | **0** |
| `test-spawn-classification.js` | **0** |
| `test-gitlab-sinks.js` / `test-gitea-sinks.js` | **0** / **0** |
| gitlab / gitea walkthroughs | **0** / **0** |
| `simulate-workflow-walkthrough.js` — **FULL scope** | **0** — `{"scenarios":198,"ran":198,"passed":198,"failed":0}`, 2079 spawns |
| `validate-workflow-contracts.js` | **0** |
| `generate-routing-surfaces.js --check` | **0** — 18 surfaces byte-match |
| gitlab / gitea contract validators | **0** / **0** |

`node --check` + `require()` on all eight changed files: **0**.

This is the **fourth** full pass of this table; all four ended green. Ten mutants were run between
passes and every one regressed only its own leg.

**The fourth pass is instrumented against the cwd trap.** Every suite re-`cd`s and records `pwd`, the
branch, and a probe of the file under test, on the same line as the exit code
(`fixclaimsink/suites4/SUMMARY.txt`). All fifteen lines read:

```
<suite> exit=0 | pwd=…/.kw/worktrees/bundle-900-901-902-903 | branch=workflow/bundle-900-901-902-903
        | stagedPathsUnder -z present=1
```

That last field is the anti-confound tell: `present=1` means the suite ran against a tree that actually
carries the fix. It is deliberately a **content** probe rather than a path check, because `present=0`
then flags **both** confounds at once — the wrong root, and the right root before the edit landed. The
correction at the top of this report is exactly the case where I treated a symptom as diagnostic of only
the first. Pairing the exit code with a probe of the thing under test is the cheap general fix.

**One red across the three passes, attributed:** in pass 2, `test-claim-hardening.js` exited 1 with
`SyntaxError: Unexpected token 'finally'` at its own line 4644 — a **test file I must not touch**,
caught mid-write by `tdd-guide` (mtime inside my run window; the region is their new `#902(G3)`
fixture). The frozen baseline copy parses, the file parses now, and both the re-run and the pass-3 run
are exit 0. Not mine, and not edited.

**Before**: taken as the brief stated it. A baseline run on this tree would have been racing eight
agents and would not have isolated anything — the frozen-mirror pairs are the isolation, where the
script path is the only axis, and they reproduce all seven defects.

`git status` shows exactly my eight files plus siblings' pre-existing modifications; no untracked
residue; no `.rej`/`.orig`; scratch is entirely outside the repo; nothing committed.

# Anything I could not verify

- **The real forge round-trip.** Claim-side port measurements ran with `KAOLA_WORKFLOW_OFFLINE=1`;
  sink-side port verification is a helper-level probe of the shipped bytes (the forge harnesses need
  `glab`/`tea` mocks the adversary's driver does not carry). The forge suites, which do exercise that
  lane, are green.
- **`opencode` / `kimi`** — not examined; additive runtime editions, outside my write set.
- **`npm test` (the four chains) and the fast gate** — not run; chain selection belongs to the producer
  at finalize, and a run now would be stale the instant a sibling lands.
- **`repoWideIgnoredNames` and sub-directory `.gitignore` files.** The basename-at-root probe cannot see
  a rule living in `kaola-workflow/.gitignore`: a file ignored only by such a rule reads as "not junk"
  and stays required. Conservative in the direction of keeping evidence; not fixtured.
- **A symlink in main's live folder** on the D1 path — `mergeCopyDir` skips symlinks, so Step 8a would
  not establish presence and D1 would refuse. Fail-closed, non-destructive, not fixtured.
- **`checks.dirty_paths`** was empty in every D2/V2 fixture, so the new `sync_failed` arm and the
  `pending_mirror` conversion were never measured beside a dirty run root.

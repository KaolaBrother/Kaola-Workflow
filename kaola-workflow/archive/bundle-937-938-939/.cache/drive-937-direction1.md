# Investigation: issue #937 Direction 1 — case-mismatched `--project` under-deletes the claim marker

## Verdict

**CONFIRMED as a symptom. PARTIAL on the stated mechanism.**

The reported behaviour reproduces exactly at HEAD `42559b1c`: `finalize --project <case-variant>
--keep-issue-open` exits 0, reports `status: closed` / `claim_label_removed: "removed"`, issues a
comment LIST on every bundle member, and deletes **nothing**. Both markers survive.

The issue's *account of why* is only half right. `activeByProject` does return null for the
case-variant, and the path-based operations do proceed — both measured below. But **the null folder
is not on the causal path for the delete miss.** `cmdFinalize` builds the marker from `args.project`
directly, never from the resolved folder, so the miss would happen even if the folder resolved. Leg C
proves this: a fixture where the folder is *still* unresolvable but the stored marker matches the
operator's spelling **deletes both markers**.

The correct one-line mechanism is: *`cmdFinalize` is the only `clearAdvisoryClaim` caller that passes
the operator-supplied `args.project` rather than the resolved `folder.project`, and the marker is
matched by exact substring.*

---

## Setup

- Commit: `42559b1c` (`chore: archive issue-936 [sink]`), working tree clean apart from the
  pre-existing untracked live claim `kaola-workflow/bundle-937-938-939/`.
- Node: system `node` via `process.execPath`; `gh` 2.87.2 installed but **mocked** (see disclosure).
- Fixtures: throwaway git repos under
  `/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/b8b16016-81ca-44ee-b4fd-49b69d849cd2/scratchpad/drive937/`.
  Every drive ran with cwd inside its own fixture, invoking `kaola-workflow-claim.js` by absolute
  path from the real repo. No tracked file in the real repo was modified.
- Fixture shape (built fresh per leg by `build-fixture.js`, modelled on
  `scripts/test-bundle-finalize.js` `writeBundleStateFile` + `seedAdaptiveFinalizeFixture`):
  - on-disk project folder `kaola-workflow/bundle-936-940/` — **lowercase**
  - bundle state: `issue_number: 936`, `issue_numbers: 936,940`, `closure_policy: all_or_nothing`
  - `.roadmap/issue-936.md`, `.roadmap/issue-940.md`, a `ROADMAP.md` mirror
  - `.cache/final-validation.md` with `verdict: pass`
- Forge mock: `gh-mock.js`, extended beyond the `test-bundle-finalize.js` pattern in two ways that
  the measurement requires —
  1. it logs **every** invocation's argv as a JSON line to `$KW_MOCK_LOG`;
  2. it serves a **real, mutable comment store** from `$KW_MOCK_STORE`, so
     `api repos/{owner}/{repo}/issues/<n>/comments` returns actual marker comments and
     `api --method DELETE .../issues/comments/<id>` actually removes one. The stock mock returns
     `[]` for comments and no-ops on DELETE, under which a delete could never be observed at all.
- Store seeded per member with two comments: one carrying
  `<!-- kw:claim project=bundle-936-940 -->` and one carrying no marker (a negative control against
  an over-broad delete).

### Commands

```
# leg A (positive control) and leg B (case variant)
node <scratch>/run-leg.js  control bundle-936-940
node <scratch>/run-leg.js  variant Bundle-936-940
# each builds a fresh fixture and runs, with cwd = fixture:
#   node /Volumes/.../scripts/kaola-workflow-claim.js finalize --project <slug> --keep-issue-open
#   env: KAOLA_WORKFLOW_OFFLINE=0 KAOLA_WORKTREE_NATIVE=0 KAOLA_GH_MOCK_SCRIPT=<mock>

# legs C-F
node <scratch>/run-leg2.js invert    Bundle-936-940 finalize Bundle-936-940 --keep-issue-open
node <scratch>/run-leg2.js closemode bundle-936-940 finalize Bundle-936-940
node <scratch>/run-leg2.js release   bundle-936-940 release  Bundle-936-940
node <scratch>/run-leg2.js release-ok bundle-936-940 release bundle-936-940

# case-sensitive volume
hdiutil create -size 200m -fs "Case-sensitive APFS" -volname KW937CS -type SPARSE <scratch>/cs937
hdiutil attach <scratch>/cs937.sparseimage -mountpoint <scratch>/csmnt -nobrowse
KW_FIXTURE_BASE=<scratch>/csmnt node <scratch>/run-leg2.js cs-control bundle-936-940 finalize bundle-936-940 --keep-issue-open
KW_FIXTURE_BASE=<scratch>/csmnt node <scratch>/run-leg2.js cs-variant bundle-936-940 finalize Bundle-936-940 --keep-issue-open
hdiutil detach <scratch>/csmnt
```

---

## Observations

### The two-leg forge-call ledger (the headline)

Same fixture construction, same flags, **one axis: the case of the `--project` argument.**

| | **Leg A — control** `--project bundle-936-940` | **Leg B — variant** `--project Bundle-936-940` |
|---|---|---|
| exit | **0** | **0** |
| `status` | `closed` | `closed` |
| `result` | *(field absent)* | *(field absent)* |
| `claim_label_removed` | `"removed"` | **`"removed"`** |
| `archived` | `true` | `true` |
| `issue_disposition` | `kept-open` | `kept-open` |
| `closure_receipt.project` | `bundle-936-940` | **`Bundle-936-940`** (operator's spelling) |
| `closure_invariants.ok` | `true` | **`true`** |
| archive dir created | `archive/bundle-936-940` | **`archive/Bundle-936-940`** |
| **forge calls by kind** | | |
| `issue list` (prefetch) | 1 | 1 |
| `issue view` | 2 | 2 |
| `issue edit --remove-label` | 2 (#936, #940) | 2 (#936, #940) |
| `issue comment` | 2 (#936, #940) | 2 (#936, #940) |
| **comment LIST** | **2** (#936→2 rows, #940→2 rows) | **2** (#936→2 rows, #940→2 rows) |
| **comment DELETE** | **2** (ids 1001, 1003 — both `removed: true`) | **0** |
| `issue close` | 0 | 0 |
| **markers surviving in store** | **0** | **2** (`#936` id 1001, `#940` id 1003) |
| non-marker comments surviving | 2 | 2 |

The control establishes the mock is wired: the same code path against the same store deletes both
markers and leaves the two non-marker comments alone. Zero deletes in leg B is therefore a real miss,
not an unwired harness.

The miss is **per member** — both bundle members were listed and neither was deleted.

Raw envelopes are in `result-control.json` / `result-variant.json` in the scratch dir. Field-for-field
the two envelopes are identical except `dest` and `closure_receipt.project`; every other key, including
`claim_label_removed`, `closure_invariants`, and `closure_receipt.closure.kept_open: [936, 940]`, is
byte-identical. **Nothing in the emitted envelope distinguishes the broken run from the good one.**

### Mechanism probes

Run in a child process with `KAOLA_WORKFLOW_OFFLINE=1` from process start and cwd = fixture.
`OFFLINE` is read at module load, which matters — see the disclosure below.
No production file was edited; `activeByProject` is not exported, so its body
(`readActiveFolders(root).find(f => f.project === project) || null`, `kaola-workflow-claim.js:1128`)
was run verbatim over the module's own exported `readActiveFolders`.

| Probe | Result |
|---|---|
| `readActiveFolders(root).map(f => f.project)` | `["bundle-936-940"]` |
| `activeByProject(root, "bundle-936-940")` | **FOUND** (`issue_numbers: [936, 940]`) |
| `activeByProject(root, "Bundle-936-940")` | **null** |
| `lstat("kaola-workflow/Bundle-936-940").isDirectory()` | **true** |
| `lstat("kaola-workflow/Bundle-936-940/workflow-state.md").isFile()` | **true** |
| `name:` field inside that state file | `bundle-936-940` |
| `readdir("kaola-workflow")` true entry name | `bundle-936-940` |
| forge calls made during the probe | 0 |

So: the folder lookup fails on strict `===` while every path-based read succeeds through APFS
case-folding — exactly as the issue describes.

### `clearAdvisoryClaim` spelling A/B (isolating the sufficient cause)

Direct calls to the **exported** `clearAdvisoryClaim(936, 'finalized', <spelling>)`, each in its own
child process against an identically re-seeded store. Only the third argument differs.

| spelling | returned | LIST calls | DELETE calls | markers left |
|---|---|---|---|---|
| `bundle-936-940` (matches store) | `"removed"` | 1 | **1** | 0 |
| `Bundle-936-940` (case variant) | **`"removed"`** | 1 | **0** | **1** |

Both return `"removed"`. That token reports only the `--remove-label` call
(`kaola-workflow-claim.js:966-967`); the marker delete is in a separate, fully swallowed try block
(`:974-984`) whose outcome never reaches the return value. This is why the envelope cannot tell the
two legs apart.

### Leg C — the counterfactual that refutes the issue's causal story

Fixture identical, except the **stored marker** is spelled `Bundle-936-940` while the **on-disk folder
stays lowercase**. `activeByProject` therefore still returns null. Run with `--project Bundle-936-940`:

| | leg C |
|---|---|
| exit | 0 |
| `activeByProject` | still **null** (folder on disk is `bundle-936-940`) |
| comment LIST | 2 |
| **comment DELETE** | **2** — both markers removed |
| markers surviving | **0** |

A null folder plus a *successful* delete. The folder resolution is not what supplies the project
string, and repairing `activeByProject` alone would not fix this.

### Leg D — the miss is not keep-open-specific

`finalize --project Bundle-936-940` with **no** `--keep-issue-open`:
exit 0, `issue_disposition: "close-pending"`, 2 LIST calls, **0 DELETE**, 2 markers survive, archive
created as `Bundle-936-940`. Same miss.

### Legs E/F — the folder-based sibling refuses instead

| leg | command | exit | outcome |
|---|---|---|---|
| E | `release --project Bundle-936-940` | **1** | `{"released":false,"reason":"--project or --issue must name an active folder"}` — no archive, no LIST, no DELETE, markers intact |
| F | `release --project bundle-936-940` | 0 | `released: true`, 2 LIST, **2 DELETE**, 0 markers left |

`cmdRelease` needs the folder object (`:5183-5184`) and fails closed on the case-variant.
`cmdFinalize` needs only paths, so it proceeds. That asymmetry is the real reason finalize is the
exposed door.

### Case-sensitivity dependence — MEASURED, not assumed

A case-sensitive APFS sparse image was created, attached at `<scratch>/csmnt`, verified case-sensitive
(`mkdir probe/lower; ls probe/LOWER` → ENOENT), and both legs re-run with the fixture on that volume.
The image was detached and the mountpoint is gone.

| leg on case-sensitive volume | exit | outcome |
|---|---|---|
| `--project bundle-936-940` (control) | 0 | 2 LIST, **2 DELETE**, 0 markers left, `archive/bundle-936-940` |
| `--project Bundle-936-940` (variant) | **1** | **refuses** — no archive, no LIST, no DELETE, markers intact |

Raw refuse envelope:

```json
{"result":"refuse","reason":"finalize_gate_unverified","gate":"workflow_state",
 "inner_reason":"archive_authority_missing",
 "operator_hint":"Restore a valid archived workflow-state.md authority before resuming Finalization. No closure side effect was made.",
 "errors":["archive_authority_missing"]}
```

The issue's claim that a case-sensitive volume refuses instead is **CONFIRMED**, and the refusal token
is now known: `finalize_gate_unverified` / `archive_authority_missing`, raised by
`resolveFinalizeAuthority` (`:3845`) when neither the live dir nor an archive resolves under the
given spelling. On darwin/APFS case-insensitive, that same gate opens the lowercase folder through
the uppercase path and waves the run through.

### Static: which callers pass an operator string

All eleven `clearAdvisoryClaim` call sites, by the source of their third (`project`) argument:

| source | sites |
|---|---|
| **`args.project`** (operator-supplied) | `kaola-workflow-claim.js:4610`, `:4616` (cmdFinalize, bundle + scalar); `kaola-workflow-sink-merge.js:971`, `:985`, `:2892` |
| `folder.project` (resolved from disk) | `kaola-workflow-claim.js:5266`, `:5271` (release); `:6175`, `:6180`, `:6275`, `:6280` (watch-pr) |

The three sink-merge sites are the ones added by #936. They are **statically the same shape** as the
finalize sites but were **not driven** here.

---

## Reproduction

**Reproduces at HEAD `42559b1c`.** #936's fix does not cover this: #936 made the keep-open terminal
*call* `clearAdvisoryClaim` at all; #937 is about the *argument* those calls are given. Leg D shows
the miss also predates keep-open, in close mode.

---

## Narrowing

- **Leg A vs B** (only axis: argument case) — eliminates "the mock is unwired" and "keep-open skips
  the delete entirely". The delete path *runs* in both legs; only the substring test fails.
- **Leg C** (only axis: which spelling the stored marker carries) — eliminates
  "`activeByProject` returning null causes the miss". Folder null, deletes succeed.
- **Leg D** (only axis: `--keep-issue-open` present/absent) — eliminates "keep-open-specific".
- **Legs E/F** (only axis: subcommand) — eliminates "any case-variant `--project` is uniformly
  tolerated"; the folder-based route refuses.
- **Case-sensitive volume, control vs variant** (only axis: volume case-sensitivity) — eliminates
  "the variant is refused everywhere"; the refusal is a property of the filesystem, not the code.

---

## Inferences

Labelled as inferences; each is refutable by the named check.

1. **The operative defect is that `cmdFinalize` passes `args.project` (`:4610`, `:4616`) into a marker
   built by exact substring match (`:977`), instead of the on-disk project name.** Confidence: high.
   Refuted by: any drive where the stored marker matches `args.project` and the delete still misses
   (leg C shows the opposite).
2. **`activeByProject`'s strict `===` is a real, separate case-fragility** — it makes the folder null,
   which pushes finalize onto the null-folder archived-state fallback for the member list. Confidence:
   high (probe measured it directly). It is **not** what causes the under-delete. Refuted by: showing
   the member list comes from the folder in the variant leg — it cannot, the folder is null, yet
   `issue_numbers: [936, 940]` still appears in the receipt.
3. **The envelope carries no signal an operator or a downstream check could act on.** `claim_label_removed`
   reports only the label call; `closure_invariants.ok` is `true` in the broken leg; and
   `closure_receipt.project` records the operator's spelling, so even the receipt cannot be
   cross-checked against the archive. Confidence: high — measured on both envelopes.
   Refuted by: any field that differs between the leg A and leg B envelopes other than `dest` and
   `closure_receipt.project`.
4. **The three sink-merge sites are exposed the same way.** Confidence: medium — static shape only,
   `args.project` into the same helper. Refuted by: a sink-merge drive with a case-variant `--project`
   that deletes the marker anyway (e.g. if sink-merge normalises the slug upstream). **Not measured.**
5. **A secondary, separate defect: the archive directory is named from `args.project`**, so the
   variant leg produced `kaola-workflow/archive/Bundle-936-940` whose inner `workflow-state.md` still
   says `name: bundle-936-940`. Confidence: high — observed in legs B, C, D. Consequence for the
   marker miss: none. Consequence for anything that later matches archive names against project
   names: unmeasured.

---

## Open / unmeasured

- **sink-merge** (`:971`, `:985`, `:2892`) — same shape, not driven. This is the highest-value gap,
  since sink-merge is the path the workflow actually takes.
- Whether any consumer downstream of finalize matches on the archive directory name, i.e. whether the
  `archive/Bundle-936-940` naming (inference 5) has a victim.
- Non-ASCII / Unicode-normalisation variants (NFC vs NFD) of a project slug, which APFS also folds.
  Same class, untested.
- The other three runtime editions' ports of `cmdFinalize`. Untested.
- Fixture caveat, common-mode across every leg and therefore not a confounder for the A/B: all
  finalize legs reported `validation.classification: "final_validation_stale"` (the recorded
  `validated_candidate_hash` did not match the hash recomputed at run time). It did not block
  finalize in any leg and was identical between control and variant.

---

## Disclosure — one unintended live forge call

My **first** mechanism probe (`mechanism.js`) set `process.env.KAOLA_WORKFLOW_OFFLINE = '1'` *after*
`require`-ing `kaola-workflow-claim.js`. `OFFLINE` is read at module load, so the assignment had no
effect, `KAOLA_GH_MOCK_SCRIPT` was likewise not yet set, and cwd was the real repo root. That probe's
`readActiveFolders` therefore issued one real, **read-only** call:

```
gh issue list --state all --limit 200 --json number,state
```

against the real repository. No mutation, no write. It is also what produced that probe's bogus
`readActiveFolders_projects: []` — the live snapshot reports #936 as closed, so the folder was
filtered out. The probe was re-run correctly (`mechanism2.js`: `OFFLINE=1` in the child's env from
process start, mock set, cwd = fixture, **0 forge calls**), and only the corrected numbers appear
above. Every other drive in this report used the mock exclusively.

## Artifacts

Scratch dir:
`/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/b8b16016-81ca-44ee-b4fd-49b69d849cd2/scratchpad/drive937/`

- `build-fixture.js`, `gh-mock.js`, `run-leg.js`, `run-leg2.js`, `mechanism2.js` — the drivers
- `result-control.json`, `result-variant.json`, `result-invert.json`, `result-closemode.json`,
  `result-release.json`, `result-release-ok.json`, `result-mechanism2.json` — raw envelopes + ledgers
- `fx-*/gh-calls.jsonl` — the verbatim argv log for each leg

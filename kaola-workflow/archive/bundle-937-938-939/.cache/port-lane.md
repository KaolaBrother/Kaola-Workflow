# Port lane — #937 / #938 carried to the gitlab and gitea editions

worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-937-938-939`
(branch `workflow/bundle-937-938-939`)

Four files touched, all under `plugins/`. No canonical `scripts/` file, no classifier of any
edition, no test file, no `docs/`, no `CHANGELOG.md`, and `edition-sync.js --write` was NOT run.

## Per-edition diff

Both forge claim ports are shared with IMPL-PROSE, who is concurrently amending the refusal
messages in the same files. The split below is by hunk, so their work is not counted as mine:

| file | my hunks | their hunks |
|---|---|---|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | 15 · +126/-7 | 12 · +36/-12 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | 15 · +126/-7 | 12 · +36/-12 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | 6 · +41/-2 | none |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | 6 · +41/-2 | none |

Their hunks are `finalizeAuthorityHint` plus five refusal `operator_hint`/`reasoning` strings; mine
touch none of them, and every edit was made with an exact-string anchor so a collision would have
failed rather than clobbered.

## What was carried, per edition

Seven pieces in each `…-workflow-claim.js`:

1. `resolveProjectSlug(requested, names)` — placed after `unreservedProjectName` (gitlab `:210`,
   gitea `:210`), identical logic to canonical.
2. `appendSummarySection(projectDir, heading, lines, replace)` — the optional 4th argument that
   RESTATES an existing section. Every three-argument caller is byte-identical to before.
3. `cmdFinalize`: the early resolution from directory entries of `kaola-workflow/` and
   `kaola-workflow/archive/`, rewriting `args.project` before the `--check` pre-flight.
4. `resolved_project_note` on the `--check` envelope.
5. The repeatable flush (`finalizeFindingsWritten` count instead of the once-only boolean;
   `finalizeTx.findings` recomputed every call; `appendSummarySection(..., true)`).
6. `claimReleaseSkipped` collection + the `claim_release_skipped_offline` finding, and the
   `flushFinalizeFindings()` before the residue probe that keeps the keep-worktree tree clean.
7. `resolved_project_note` on the finalize envelope, and `resolveProjectSlug` in `module.exports`.

Two pieces in each `…-workflow-sink-merge.js`: `resolveProjectSlug` added to the claim `require`,
`resolvedProjectNote` + the `sinkEmit` attachment, and a local `resolveSinkProjectSlug(args, mainRoot)`
reading the branch's git tree.

### Where the ports genuinely differ from canonical, and why

**One structural divergence, in the sink.** Canonical's `main()` holds the argument asserts for both
entry points, so one resolution line covers everything. Both forge sinks put the `--sink` asserts in
`main()` and the direct-merge asserts inside `runDirectMerge` (gitlab `:1027-1040`, gitea
`:1038-1051`), and `runDirectMerge` is additionally exported and callable on its own. There is no
single line every path crosses before a path is composed from the name, so the resolution is a small
named local called at both — gitlab sink `:2662` and `:1052`, gitea sink `:2673` and `:1052`. Same
wording, same source: `resolveProjectSlug` is still the only place the sentence exists.

**One vocabulary divergence, following each port's own idiom** (gitlab says "note" where gitea and
canonical say "comment"), in the last clause of the note and in the finding body. Measured, from the
real runs below:

- gitlab: `… still matches nothing in a marker note or in git's case-sensitive index.`
- gitea: `… still matches nothing in a marker comment or in git's case-sensitive index.`

The forge `clearAdvisoryClaim` signature difference (slug is the FOURTH argument) needed no special
handling: the resolution rewrites `args.project` upstream of every call site, so all five per-edition
call sites get the resolved slug without being touched. Gitea's `releaseClaimArtifacts` wrapper
(sink `:374`) likewise needed no edit — it forwards `project` straight through.

## Verification

### The suites the brief named

| command | before | after |
|---|---|---|
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | exit 0 | **exit 0** — `GitLab workflow script tests passed` |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | exit 0 | **exit 0** — `Gitea workflow script tests passed` |
| `node scripts/test-forge-finalize-findings.js` | exit 1, 128 passed / 5 failed | exit 1, **130 passed / 3 failed** |
| `node scripts/validate-script-sync.js` | exit 1 (2 files out of sync + 2 export omissions) | **exit 0** |

`validate-script-sync.js`, verbatim:

```
OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 6 forge export-superset families in sync.
    committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
```

Both forge claim ports now export `resolveProjectSlug`, and the codex mirror was synced by
IMPL-PROSE's `edition-sync.js --write` (I did not run it; `plugins/kaola-workflow/scripts/` carries
the canonical change and I confirmed that by reading it, not by writing it).

**`test-forge-finalize-findings.js` part B — all three edition-delta legs went GREEN.** What remains
red is three `docs/api.md` statements and nothing else:

```
FAIL: static: the docs `findings` row must enumerate exactly the canonical registry.
FAIL: static: docs/api.md says the forge ports raise six finding types; measured 7 (["archive_commit_probe_failed","archive_stage_failed","claim_release_skipped_offline","finalize_commit_probe_failed","main_roadmap_mirror_not_regenerated","residue_probe_failed","residue_stage_failed"])
FAIL: static: docs/api.md says canonical and Codex raise seven finding types; measured 8 (["archive_commit_probe_failed","archive_stage_failed","archive_unstage_failed","claim_release_skipped_offline","finalize_commit_probe_failed","main_roadmap_mirror_not_regenerated","residue_probe_failed","residue_stage_failed"])
```

Note the forge count moved 6 → 7 because the port landed on both, which is what makes the deltas
exactly `["archive_unstage_failed"]` again. Every behavioural leg (part A on all four editions, part
C on canonical + codex) passes.

### The green suites prove nothing on their own — so both changes were driven per edition

Both forge suites were ALREADY green at baseline, so their green is not evidence the port fires.
Two scratch drives supply that (fixtures under `os.tmpdir()`, `KAOLA_WORKFLOW_OFFLINE=1`, no repo
mutation; drivers at `<scratch>/drive-port.js` and `<scratch>/drive-port-sink.js`, fixture shape
copied from `test-forge-finalize-findings.js` `buildFixture`).

**Drive 1 — `finalize --keep-worktree`, each edition, exact slug and mis-cased.** Bundle state
`issue_numbers: 1,2`:

```
canonical  issue-914  exit=0 status=closed clr=skipped_offline inv=true findings=["claim_release_skipped_offline"] sec=true members=true dest=issue-914 note=null dirty=""
canonical  Issue-914  exit=0 status=closed clr=skipped_offline inv=true findings=["claim_release_skipped_offline"] sec=true members=true dest=issue-914 note=YES  dirty=""
codex      issue-914  exit=0 status=closed clr=skipped_offline inv=true findings=["claim_release_skipped_offline"] sec=true members=true dest=issue-914 note=null dirty=""
codex      Issue-914  exit=0 status=closed clr=skipped_offline inv=true findings=["claim_release_skipped_offline"] sec=true members=true dest=issue-914 note=YES  dirty=""
gitlab     issue-914  exit=0 status=closed clr=skipped_offline inv=true findings=["claim_release_skipped_offline"] sec=true members=true dest=issue-914 note=null dirty=""
gitlab     Issue-914  exit=0 status=closed clr=skipped_offline inv=true findings=["claim_release_skipped_offline"] sec=true members=true dest=issue-914 note=YES  dirty=""
gitea      issue-914  exit=0 status=closed clr=skipped_offline inv=true findings=["claim_release_skipped_offline"] sec=true members=true dest=issue-914 note=null dirty=""
gitea      Issue-914  exit=0 status=closed clr=skipped_offline inv=true findings=["claim_release_skipped_offline"] sec=true members=true dest=issue-914 note=YES  dirty=""
```

Reading, per edition: the finding fires on the envelope; the durable `### claim_release_skipped_offline`
section is present and names BOTH bundle members; `claim_label_removed` stays `skipped_offline` and
`closure_invariants.ok` stays `true`; the mis-cased run archives under the RESOLVED name
(`dest=issue-914`, not `Issue-914`) and carries the note; the exact-slug run carries **no** note, so
the correction is not unconditional; and the worktree is CLEAN after every run — the #296 B1
property the flush-ordering fix exists for, now confirmed on all four editions.

**Drive 2 — `--sink` with a mis-cased `--project`, three sink editions:**

```
canonical  issue-914  exit=0 sinked  receipt.project=issue-914  note=null
canonical  Issue-914  exit=0 sinked  receipt.project=issue-914  note=YES
gitlab     issue-914  exit=0 sinked  receipt.project=issue-914  note=null
gitlab     Issue-914  exit=0 sinked  receipt.project=issue-914  note=YES
gitea      issue-914  exit=0 sinked  receipt.project=issue-914  note=null
gitea      Issue-914  exit=0 sinked  receipt.project=issue-914  note=YES
```

`receipt.project` echoes `args.project`, so `issue-914` under a `--project Issue-914` run is the
resolution, measured — and the note rides the envelope only when a correction happened.

**Drive 3 — the forge DIRECT-MERGE entry point** (`runDirectMerge`, the second call site the ports
need and canonical does not). Fixture with the run pre-archived, so it takes the archived early exit
at exit 3, which reports on stderr rather than through `sinkEmit`:

```
gitlab  --project issue-914  →  sink-merge: project archived (issue-914) …
gitlab  --project Issue-914  →  sink-merge: project archived (issue-914) …
gitea   --project issue-914  →  sink-merge: project archived (issue-914) …
gitea   --project Issue-914  →  sink-merge: project archived (issue-914) …
```

That message is composed from `args.project` (gitlab sink `:838`/`:1104`, gitea the same shape), so
printing `issue-914` on a run driven with `Issue-914` is only possible if `resolveSinkProjectSlug`
rewrote it first. The direct-merge resolution is reached on both ports. No envelope is emitted on
this particular terminal, so the note is not observable there — that is the early exit's existing
shape, not something the port changed.

## What is still red, and whose it is

1. **`scripts/test-forge-finalize-findings.js` — 3 failures, all `docs/api.md`.** The `findings`
   table row must list `claim_release_skipped_offline`, the forge count sentence must say seven
   rather than six, and the canonical/Codex count sentence must say eight rather than seven. Docs
   are explicitly not mine.
2. **`scripts/test-finalize-door.js` — T12/T12b.** IMPL-PROSE's in-flight refusal-message pins,
   against production text they are amending in the same files. Not mine, before or after.
3. **Nothing else.** `validate-script-sync.js` is green, both forge edition suites are green, and
   every behavioural leg of the findings registry suite is green on all four editions.

## Not re-run, and why

The canonical `npm test` chains and the full walkthrough were green on my lane earlier this session,
but canonical `scripts/kaola-workflow-claim.js` has since been edited by IMPL-PROSE. Re-running them
now would be verifying their in-flight work, not mine, and would report their state as though it
were the port's. The port's own reach is measured above, per edition. The four-chain run belongs
after both lanes land.

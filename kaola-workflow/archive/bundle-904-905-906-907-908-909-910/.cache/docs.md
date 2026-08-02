# docs — prose pass for bundle #904–#910

Author: `doc-updater`. Work tree:
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-904-905-906-907-908-909-910/`.
Nothing committed. **No `scripts/**` file was touched** — verified below.

Everything was reconciled against the mission list's `result:` fields, the four implementer reports,
`parse-contract.md`, and the seven premise reports; where a report and the shipped code could
disagree I read the code. Five field-name/shape claims were verified directly in the tree rather
than inherited from a report (listed under "What I verified in code").

---

## Files touched

| file | what changed, and what it was reconciled against |
|---|---|
| `CHANGELOG.md` | Seven new `[Unreleased]` entries — #905 under `### Added`; #904, #907, #906, #910, #909 under `### Fixed`; #908 and the decision-record pointers under `### Documentation`. Reconciled against the four implementer reports and the mission list. #904 leads its second paragraph with the migration consequence (`command_id`/`vector_id`/`receipt_sha256` move for every policy; an inherited `{command_id, required_pass_vector_id}` obligation from before the change is unsatisfiable). #907 leads with the user-facing consequence (finalize reporting success while committing nothing, including healthy files, on `--keep-worktree` linked runs). |
| `docs/api.md` | Six edits — see the table below. |
| `docs/workflow-state-contract.md` | § *Archive completeness*: the three-key return (`missing` / `mismatched` / `uncomparable`, the third a strict subset of the second), the `'<root>'` / `'<dest>'` sentinels, and the evidence-floor filename set now read from kernel constants (with the GitLab/Gitea three-vs-four divergence named). New subsection § *The crash-resume backstop moves, it does not delete* covering #906 route 1 and why the destination is nested rather than sibling. |
| `docs/decisions/D-697-01.md` | Amended, not rewritten. Status line records the amendment; the original `:57` sentence is kept verbatim with a dated inline note; new § *Amendment (2026-08-02): the `--keep-output` carve-out* with the four conditions, what is deliberately unchanged and why (no secret redaction, `kaola-workflow/**/.cache/` is tracked), and the two rejected alternatives with their measured reasons. |
| `docs/decisions/D-579-01.md` | The `parsePorcelainPaths` sentence at `:99` is kept and followed by a dated correction block: what the function actually did as shipped for that decision, the shipped contract now, the two new sibling exports, and an explicit statement that D-579-01's own mechanism (`isParkedLanePath`, the parked-lane filter) is unchanged. |
| `docs/decisions/D-909-01.md` | **NEW.** The four `archive_summary_citation_missing` findings as decisions on record, three real losses and one false positive, with the #910-fossil note. |
| `docs/decisions/D-908-01.md` | **NEW.** Dispositions for all ten of #908's items. |

### `docs/api.md`, edit by edit

1. **`--project` flag row** (Validation § flag table) — was *"resolved against the git top-level so it lands identically from the worktree root or the repo root"*, which is now false. Rewritten: the receipt goes to the working tree that **holds the run folder**, with the plain-repo fallback stated.
2. **New paragraph after the receipt-path precedence line** — *the record follows the run folder; the hash follows the invoking tree*, plus the explicit statement that `--plan` and `--output` are unchanged and a relative `--plan` from a worktree still lands under the invoking tree.
3. **`run` usage block** — `[--keep-output <dir>]` added, matching the shipped `usage()` byte for byte in flag spelling.
4. **New `#### --keep-output <dir>` subsection** — directory shape, `run-<index>` ↔ `runs[].index` keying, receipt byte-identity, after-the-loop placement, the three up-front refusals (existing file, non-directory, archive band), raw-bytes/no-secret-redaction warning, no truncation cap and why, and the pointer to D-697-01.
5. **New `### Kernel path-stream decoders` section** — `parsePorcelainPaths` (new contract), `splitNulPaths`, `unquoteCStyle`, the `-z` recommendation, and the four readers deliberately **not** converted with the reason (`codeTreeHash` inputs would move and could stale live receipts).
6. **`archive_incomplete` refusal row + a new paragraph after that table** — the `mismatched` wording at the old `:629` was already inaccurate before this bundle (it carried entry-kind faults); corrected, and `uncomparable[]` documented as a strict subset with the sentinels. Also records that `release` / `watch-pr` / the abandon sweep previously reported `missing` alone.
7. **New paragraph in the sink archive section** — `receipt.archive_embedded_repos`, the measured `rev-parse --show-toplevel` boundary, and why a junk `.git`-named **file** is deliberately left inside the blob gate.
8. **Finalize envelope section** — two new field tables: `main_live_orphan` / `main_live_orphaned_to` / `main_live_orphan_error` (with `main_live_cleaned_on_resume` now conditional on a successful move), and `finalize_transaction.residue_stage` / `residue_stage_detail` / `residue_unstaged`, with the durable `## Finalize Findings` heading and the exit-stays-0 posture.

`:1309` (the `claim.js` export list naming `verifyArchiveComplete`) was **checked and needed no
change**: `git diff` shows no `module.exports` line moved in `claim.js`, `sink-merge.js` or
`run-chains.js`. Only `adaptive-schema.js` (+`splitNulPaths`, +`unquoteCStyle`) and
`validation-runner.js` (+`resolveRecordFolder`) gained exports; the first two are documented in the
new decoders section, and `resolveRecordFolder` is named where the `--project` behaviour depends on
it.

---

## Doc surfaces deliberately NOT changed, with the reason

- **`README.md`** — nothing in it describes structure this bundle changed. Its `run-chains` row names
  `.cache/chain-receipt.json` and never mentions `--project` placement; its `validation-runner` row
  is a one-line description with no flag list; its archive sentence ("still fails loudly if it would
  lose a file") is still exactly true. Adding `--project` semantics there would be new README scope,
  on a test-consumed file, for a fact `docs/api.md` now carries.
- **`docs/architecture.md`** — read the validation section (`:126-174`) and the sink/finalize sections.
  Nothing is now wrong: it describes the receipt's *contents* and the classification families, not the
  receipt's path, and `grep` for `backstop` / `live folder` / `main_live` returns nothing.
- **`docs/agents-source.md`** — test-consumed, but it is the vendored-agent delta record. `grep` for
  `chain` / `validation` / `finalize` / `archive` returns two hits, both about an upstream agent's
  `validation_command` body. Nothing this bundle changed reaches it.
- **`commands/**`, `skills/**`, `templates/routing/**`** — no skeleton needed changing, so nothing was
  regenerated. `generate-routing-surfaces.js --check` is green at **18 surfaces**.
- **`docs/README.md`** — it points at `decisions/` as a catalog and names only the two ADRs that
  describe what ships today; it does not enumerate `D-*` records, so the two new ones need no index
  line.
- **CI/CD** — not mentioned anywhere. `grep -iE "CI/CD|pipeline|github actions|gitlab ci"` over every
  added line returns nothing.

---

## What I verified in code rather than inheriting from a report

A report is a hypothesis about the tree; these five are the load-bearing names, read at their sites:

- `main_live_orphan` / `main_live_orphaned_to` / `main_live_orphan_error` and the retained
  `main_live_cleaned_on_resume` — `scripts/kaola-workflow-claim.js:4208-4219`.
- `uncomparable` on the return and the `'<root>'` / `'<dest>'` sentinels —
  `scripts/kaola-workflow-claim.js:5447-5510`.
- `residue_stage` default `'skipped'` (`:3928`), `'staged'` / `'failed'` and
  `residue_unstaged = residue.slice(0, 50)` (`:4635-4640`), and the durable heading
  `'## Finalize Findings'` (`:4653`).
- `--keep-output` naming, the three refusals and the after-the-loop write —
  `scripts/kaola-workflow-validation-runner.js:764-820, 898, 940`; flag spelling checked against
  `usage()` at `:1523-1533`; `SANDBOX_DIR_NAME = 'kwv'` / `SANDBOX_SEED_HEX = 16` at `:27-28`.
- `receipt.archive_embedded_repos` and `isArchiveRepoBoundary` —
  `scripts/kaola-workflow-sink-merge.js:1366, 1392, 2326`.

**One correction I made to my own draft as a result.** I first wrote that the four fixed archive
filenames are "required unconditionally". They are not: `listSourceEvidenceFiles`
(`claim.js:5398-5410`) includes each only when the source holds it, and only `workflow-state.md` is
added unconditionally at `:5486`. Corrected in both `CHANGELOG.md` and
`docs/workflow-state-contract.md` to "required in the destination whenever the source holds them".

---

## Verification (run serially, nothing else running)

```
$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
EXIT_SURFACES=0

$ node scripts/validate-workflow-contracts.js
Workflow contract validation passed
EXIT_A=0

$ node scripts/validate-kaola-workflow-contracts.js
Kaola-Workflow Codex contract validation passed
EXIT_B=0
```

All three re-run **after** the final edit, serially, in that order.

**Surface count: 18.**

Write-set proof — `git status --short`, nothing under `scripts/`:

```
 M CHANGELOG.md
 M docs/api.md
 M docs/decisions/D-579-01.md
 M docs/decisions/D-697-01.md
 M docs/workflow-state-contract.md
?? docs/decisions/D-908-01.md
?? docs/decisions/D-909-01.md
```

(That listing is scoped to `CHANGELOG.md` and `docs/`; the bundle's `scripts/**` changes from the
implementers are untouched by me and remain as they were handed over.)

Diff size: `CHANGELOG.md` +220, `docs/api.md` +136/−1, `docs/decisions/D-697-01.md` +62/−3,
`docs/workflow-state-contract.md` +37, `docs/decisions/D-579-01.md` +13, plus the two new records.

---

## Nothing was blocked

There is no prose I could not make true without a code change. Every claim written above is either
read out of the shipped tree or attributed in the text as an inference (the two places that do so
explicitly: #904's non-darwin behaviour, and #906's GitLab/Gitea name-set convergence being a parity
fix rather than a second destruction fix once `uncomparable[]` landed — both stated as the
measurement supports and no stronger).

**One ordering reminder for whoever runs the receipt.** `CHANGELOG.md`, `docs/api.md` and
`docs/workflow-state-contract.md` are all in `SELF_HOST_TEST_CONSUMED` / `TEST_CONSUMED_PATHS`, so
the repo's candidate hash has moved with this pass. Any chain receipt taken before now is stale. The
prose is complete; the receipt run goes after it.

---

# ADDENDUM — retention timing (adversarial finding S2)

**One prose addition, no code.** `docs/api.md`, the `--keep-output` subsection, the bullet that
already explained the after-the-loop placement. It now also states the operator-visible consequence:

> **The consequence is that an interrupted run retains nothing** — not even a prefix, and not the
> repetitions that had already completed: the bytes are buffered until the last repetition finishes,
> so a run killed part-way leaves the directory empty (measured, under both SIGTERM and SIGKILL).
> That is deliberate and is not going to change. Writing inside the loop would move the candidate
> digest between the pre- and post-repetition measurements on any destination inside the candidate
> band, which the flag permits, and the runner would report `candidate_mutation` against its own log
> — a false red on the verdict itself, which is strictly worse than losing a diagnostic aid. An empty
> directory after a kill is the flag working as designed, not a fault.

The last sentence is the one the finding actually calls for: an operator who kills a hung suite finds
an empty directory, and without it would reasonably conclude the flag is broken.

`usage()` in `scripts/kaola-workflow-validation-runner.js` was **not** touched — another agent owns
that correction, and it is outside this write set regardless.

## Verification, addendum (serial, one at a time)

```
$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
EXIT_SURFACES=0

$ node scripts/validate-workflow-contracts.js
Workflow contract validation passed
EXIT_A=0

$ node scripts/validate-kaola-workflow-contracts.js
Error: plugins/kaola-workflow/scripts/kaola-workflow-claim.js must match scripts/kaola-workflow-claim.js
    at assert (scripts/validate-kaola-workflow-contracts.js:19:25)
    at Object.<anonymous> (scripts/validate-kaola-workflow-contracts.js:147:3)
EXIT_B=1
```

**Surface count: 18.**

### The `validate-kaola-workflow-contracts.js` red is NOT mine — diagnosed, not assumed

It was **exit 0 on this same worktree earlier in this pass**, and it names one file: canonical
`claim.js` versus its Codex copy. Measured:

```
32d78524…  scripts/kaola-workflow-claim.js                        mtime 07:09:46
3b55dd1a…  plugins/kaola-workflow/scripts/kaola-workflow-claim.js mtime 06:32:50
```

Canonical moved at **07:09:46**, after my earlier green run of this validator; the Codex mirror is
still at 06:32:50. That is an un-propagated canonical edit by another agent, and it is exactly the
condition the end-of-run `npm run sync:editions` item exists to clear.

My write set is docs-only and unchanged — `git status --short -- CHANGELOG.md docs/` lists five
modified prose files and the two new decision records, and nothing under `scripts/**`. The validator
does not read any file I touched on the failing assertion. `validate-workflow-contracts.js`, which
does read `docs/`, is green.

**Action for the orchestrator, unchanged from `impl-runner`'s and `impl-sink-rc`'s hand-offs:** run
`npm run sync:editions` after the last edit lands, then re-run this validator. I did not run it — it
is not group-scoped, and running it would publish another agent's in-flight canonical work to three
edition trees without their knowledge.

**The prose is final.** No further doc edit is pending from me.

---

# ADDENDUM 2 — R1/R2 envelope fields

Round-2 `claim.js` work added user-visible fields after my pass. Reconciled against the tail of
`.cache/impl-claim.md` (§ "ROUND 2"), with **every field name read out of
`scripts/kaola-workflow-claim.js` rather than taken from the report** — see the verification list
below.

## 1. `CHANGELOG.md` — the #907 entry extended

The `[Unreleased]` #907 entry now covers, in one added block:

- `finalize_transaction.archive_stage` (`skipped` | `staged` | `failed`) with `archive_stage_detail`
  and `archive_unstaged`, and what a failure there actually means to a reader — the branch may still
  carry the live run folder that `chore: archive` exists to remove.
- `archive_commit_probe` and `finalize_commit_probe`, each `failed` when
  `git diff --cached --quiet` exited neither 0 nor 1, with the reason spelled out (0 and 1 are
  answers; anything else is git failing, and reading it as "nothing staged" is how a fault became a
  success).
- `residue_stage`'s **fourth** value `unprobeable` with `residue_probe_detail`, stated as distinct
  from `skipped`.
- `findings` — the de-duplicated typed fault list.
- `roadmap_staged` now derived from the **outcome** of the archive `git add` rather than from the
  paths existing on disk (a statement about the filesystem where one about the index was owed).
- **`finalize_commit: 'unknown'`**, framed exactly as asked: it means *we could not tell*, not
  *nothing happened*, with the explicit operator instruction to re-read the worktree by hand before
  trusting the closure. The lead-off framing for the whole block is the rule being separated —
  *"nothing was staged" is a claim about the working tree, and a failed probe does not support it.*
- The once-only durable flush under `## Finalize Findings` and why per-fault writes would have
  dropped all but the first (`appendSummarySection` is idempotent by heading).
- The honest limit the implementer volunteered: when it is the *enumerating* probe that failed, the
  record cannot name the uncommitted paths and says so.
- The GitLab/Gitea archive-staging divergence (four finding types, not five), stated as
  **pre-existing and not closed by this change**.

Also stated: none of it fires on a healthy run (`staged` / `staged` / `committed`, no findings), and
the exit stays 0 throughout.

## 2. `docs/api.md` — the finalize ledger table, rewritten

The three-row residue table from my first pass is replaced by a thirteen-row
`finalize_transaction` table covering every field above, plus the `finalize_commit: 'unknown'`
paragraph, the once-only durable-flush paragraph, and a short edition-difference note. Same section
(§ Finalize envelope), same place a reader already looks.

## 3. `docs/api.md:629` / `:1309` — CHECKED, already covered in round 1, skipped

- The old `:629` sentence (*"`mismatched` names files that arrived with different bytes"*) was
  rewritten in my first pass, and a dedicated paragraph after that table documents `uncomparable[]`
  as a strict subset of `mismatched[]`, the `'<root>'` / `'<dest>'` sentinels, and the fact that
  `release` / `watch-pr` / the abandon sweep previously reported `missing` alone.
- `:1309` is the bare `claim.js` export-name list. `verifyArchiveComplete` is still exported and no
  `module.exports` line moved in `claim.js` (`git diff` confirms), so the list is accurate as it
  stands. **No edit owed.**

## 4. R1 — deliberately absent from the CHANGELOG, and no other doc owes it either

Per the lead's framing, R1 never shipped, so it is not a fixed bug and is not mentioned. I also
checked whether it invalidates any *existing* prose and it does not: `grep` for `Step 8a` /
`Step-8a` / `mergeCopyDir` / mirror-overwrite semantics across `docs/api.md`,
`docs/workflow-state-contract.md` and `docs/architecture.md` finds nothing that states which side of
the mirror wins. Nothing to correct.

I re-read the **#910** entry against the lead's caution and it does not overclaim: it asserts
placement (`--project` lands in the tree holding the run folder) and hash provenance (the invoking
tree), and makes no claim about the receipt surviving the finalize mirror. Left as written.

## What I verified in code this round (report → tree, not inherited)

`scripts/kaola-workflow-claim.js`: `archive_stage` default `'skipped'` `:3962`, `'staged'` `:4633`,
`'failed'` `:4603`/`:4638`; `archive_stage_detail` `:4604`/`:4639`; `archive_unstaged` `:4640`
(`.slice(0, 50)`); `roadmap_staged` default `false` `:3953`, derived `archiveAddOk && …` `:4657`;
`archive_commit_probe` / `_detail` `:4694-4695`; `residue_stage: 'unprobeable'` `:4752` and
`residue_probe_detail` `:4753`; `finalize_commit_probe` / `_detail` `:4833-4834`;
`finalize_commit = 'unknown'` `:4859` (guarded on `residueProbe === 'failed' ||
finalize_commit_probe === 'failed'` at `:4855`); `findings` as a de-duplicated type list `:3982`.
The six finding type names were read at their `recordFinalizeFinding(` call sites (`:4609`, `:4645`,
`:4699`, `:4758`, `:4800`, `:4839`) rather than copied from the report.

## Verification, addendum 2 (serial, one at a time)

```
$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
EXIT_SURFACES=0

$ node scripts/validate-workflow-contracts.js
Workflow contract validation passed
EXIT_A=0

$ node scripts/validate-kaola-workflow-contracts.js
Error: canonical validation runner and all three installed copies must remain byte-identical
    at Object.<anonymous> (scripts/validate-kaola-workflow-contracts.js:658:3)
EXIT_B=1
```

**Surface count: 18.**

### The red MOVED, and it is still not mine — measured

Last pass it named `claim.js` mirror parity; that assertion (`:147`) now **passes**. It has moved on
to the runner mirrors at `:658`:

```
37b7dcb4252bd01c  scripts/kaola-workflow-validation-runner.js                          <- canonical
5938e4ee0285af4e  plugins/kaola-workflow/scripts/kaola-workflow-validation-runner.js
5938e4ee0285af4e  plugins/kaola-workflow-gitlab/scripts/…
5938e4ee0285af4e  plugins/kaola-workflow-gitea/scripts/…

b23d7266c3c5644f  scripts/kaola-workflow-claim.js                                      <- claim parity
b23d7266c3c5644f  plugins/kaola-workflow/scripts/kaola-workflow-claim.js                  now RESTORED
```

Canonical runner has advanced past the three mirrors, which still hold `5938e4ee…` — the exact hash
`impl-runner` handed over as deliberately-stale pending the end-of-run propagation. This is the
condition the lead named in advance as not mine, and it clears with `npm run sync:editions`.

My write set is unchanged and docs-only: five modified prose files plus the two new decision records,
nothing under `scripts/**`. The failing assertion reads no file I touched, and
`validate-workflow-contracts.js` — which *does* read `docs/` — is green.

**The prose is final.** Nothing further is pending from me, and nothing was blocked: no sentence
above needed a code change to be true.

---

# ADDENDUM 3 — finding-type count corrected: five vs six

**The correction is right and I confirmed it independently before editing**, by counting distinct
`recordFinalizeFinding('<type>'` arguments in each edition's `claim.js` rather than taking the
number:

```
canonical  6  archive_commit_probe_failed archive_stage_failed archive_unstage_failed
              finalize_commit_probe_failed residue_probe_failed residue_stage_failed
codex      6  (identical set)
gitlab     5  ... same set MINUS archive_unstage_failed
gitea      5  ... same set MINUS archive_unstage_failed
```

The delta is exactly one type, `archive_unstage_failed`, and the shape that explains it is measured
too: canonical stages the archive with **two** calls — `git rm -r --cached … --
kaola-workflow/<project>` (`:4598`) and a scoped `git add -A -- …existingPaths` (`:4631`) — where
GitLab stages with **one** unscoped `git add -A 'kaola-workflow/'` (`:4367`, Gitea the same shape).
No `git rm -r --cached` means no `archive_unstage_failed` to raise.

**Where my number came from, for the record.** `impl-claim.md`'s round-2 table reports 5 vs 4, and
that is a correct statement about a *different* thing: the types observed on its `statusfail` leg,
where `residue_stage_failed` does not fire (it fires on the `unreadable` leg). My prose was making a
claim about the **type inventory**, which is 6 vs 5. Both numbers are true of their own subject; I
attached the leg number to the inventory sentence.

## Corrected in two places

- `docs/api.md`, the edition note under the `finalize_transaction` table — now "**five** … where
  canonical and Codex raise **six**", naming `archive_unstage_failed` as the exact delta.
- `CHANGELOG.md`, the same sentence in the #907 entry — same correction, and it now also records
  that both shapes are present at `main`.

Everything else in both paragraphs is unchanged, as instructed.

**On the `archive_stage` emission-site counts:** I did not cite site counts anywhere, so there was
nothing to adjust there. But the api.md table row does describe `archive_stage` in canonical's terms
(it names the `git rm -r --cached` half), so the edition note now says explicitly that on those two
editions the field covers **one** staging call rather than the two the row describes. That closes the
implication rather than leaving a reader to infer it.

## Verification, addendum 3 (serial, one at a time)

```
$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
EXIT_SURFACES=0

$ node scripts/validate-workflow-contracts.js
Workflow contract validation passed
EXIT_A=0

$ node scripts/validate-kaola-workflow-contracts.js
Error: canonical validation runner and all three installed copies must remain byte-identical
    at Object.<anonymous> (scripts/validate-kaola-workflow-contracts.js:658:3)
EXIT_B=1     (real exit code, taken from a separate un-piped run — `${PIPESTATUS[0]}` is unreliable
              in this shell, so the piped run's status was NOT used)
```

**Surface count: 18.**

### Which assertion fired — checked, not inferred from the exit code

`:658`, the **validation-runner mirror parity** — the first of the two reds named in advance, and it
short-circuits before anything could reach a `run-chains.js` comment assertion. Measured:

```
37b7dcb4252bd01c  scripts/kaola-workflow-validation-runner.js        <- canonical, ahead
5938e4ee0285af4e  plugins/kaola-workflow/scripts/…                   <- all three mirrors, stale
5938e4ee0285af4e  plugins/kaola-workflow-gitlab/scripts/…
5938e4ee0285af4e  plugins/kaola-workflow-gitea/scripts/…
```

Still the exact hash `impl-runner` handed over as deliberately stale pending the end-of-run
propagation. Not mine, and it clears with `sync:editions`. Because this validator throws on the first
failed assertion, it cannot confirm or deny the second red the lead named; that one is only
observable once this one clears.

My write set is unchanged and docs-only — five modified prose files plus the two new decision
records, nothing under `scripts/**` — and `validate-workflow-contracts.js`, the validator that does
read `docs/`, is green.

**Prose final.**

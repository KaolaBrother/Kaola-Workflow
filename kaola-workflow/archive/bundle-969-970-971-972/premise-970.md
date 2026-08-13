# Premise check — #970 "a mission-list item can carry a result while still reading in-flight"

Read-only investigation. No tracked file edited.

## Setup

- Commit: `7e962bdc86d188e1da99af3309a13ae0dd3d9e97` (main, clean apart from this untracked run folder)
- Archived run under test: `kaola-workflow/archive/issue-968/mission-list.md`
- Archive commit: `56e5a0b2` (`chore: archive issue-968 [sink]`)
- Repair commit: `bb2d721a` (`fix: correct the archived #968 mission list, which contradicted itself`), 3 commits later, +9/−13 on that one file

---

## Claim 1 — 7 of 17 items carried a `result` while reading `status: in-flight` — **SURVIVES, exactly**

Measured at the archive commit (`git show 56e5a0b2:kaola-workflow/archive/issue-968/mission-list.md`)
and at `bb2d721a^` — identical:

```
item lines (`^- item:`)     17
status: done                10
status: in-flight            7
```

Per-item parse of the pre-repair file: **all 7 in-flight items carry a result-like field**, so
`outcome-present-and-status-not-done` selects exactly those 7 and no others. Item start lines:
33, 53, 58, 63, 68, 74, 85.

"Run otherwise complete" is corroborated by the item bodies themselves — the L85 item's `result`
reads "FOUR CHAINS GREEN — claude, codex, gitlab and gitea all exit 0", and three of the seven carry
`status_note: done`.

**Current archived state (post-repair): 17 items, 17 `status: done`, 17 `dispatched`, 17 `result`,
zero non-spec keys.** The defect is no longer visible in the tree; it is visible only in history.

## Claim 2 — non-spec field names `status_note`, `result so far`, `earlier result` — **SURVIVES, exactly**

Pre-repair key census at 2-space indent:

```
17   dispatched:
17   status:
16   result:
 3   status_note:
 1   result so far:
 1   earlier result:
```

Exactly the three names the issue lists, no others. Distribution: `status_note: done` on the items at
L68, L74, L85; `result so far` replacing `result` on L63; `earlier result` as a fifth field on L85.

Post-repair, `git grep -nE '^\s*(status_note|result so far|earlier result):' -- kaola-workflow/`
returns nothing — the three names are gone from every live and archived record.

## Claim 3 — finalize has NO report for this condition — **SURVIVES**

No code anywhere parses a mission-list item's `status`/`result` pair.

- `scripts/kaola-workflow-claim.js` touches `mission-list.md` only as a **path**: existence
  (`:2210`), copy source/dest (`:3395`, `:3578`, `:3843`), archive-parity list (`:5995`). It never
  reads the content into a structure.
- The **only** content parse in the repo is `countComplete` at
  `scripts/kaola-workflow-ledger-compare.js:32-39` — a **line counter**, not an item parser:
  `/^[ \t]*(?:-[ \t]+)?status:[ \t]*done[ \t]*$/i`. Its own comment (`:29-31`) states it
  "deliberately does NOT try to identify WHICH items are done". Its single consumer is the Step-8a
  mirror-direction guard (`compareLedgers`, `:48-59`) — would this copy regress finished work.
- `scripts/kaola-workflow-gap-sweep.js` scans **only** `.cache/`: `scanChainReceipt` (`:69`) and
  `scanManual` (`:86`). Closed reason enum: `deferred_red_chain`, `manual:<slug>` (`:33-37`). It is
  also not a report — `runCheck` returns 1 and refuses. It is not invoked by finalize at all
  (no `gap-sweep` reference in `claim.js` or `sink-merge.js`).

**Cost consequence:** a parser has to be written, but not from nothing — `ledger-compare.js` is the
precedent for "own its own tiny parse so a finalize-time guard never couples to another reader"
(`:18-20`), and it is forge-neutral/byte-copied to every edition.

**Format variance the parser must survive (measured over 36 archived mission lists):**

- 3 of 36 use column-0 `item:` with no `- ` bullet (`issue-878`, `issue-899`,
  `bundle-896-897-898`).
- **11 items across the archive carry two `status:` lines inside one item** — e.g.
  `bundle-940-941-942-943-944/mission-list.md:48-50`: `status: in-flight` immediately followed by
  `status: done`. First-match vs last-match is not cosmetic: over the whole archive it moves the
  count from **37 flagged items in 10 runs** (first wins) to **27 in 9 runs** (last wins), same
  parser otherwise.
- Multi-line free-text `result` bodies contain prose that looks like a field (`Note for whoever
  implements:`, `MY DECISION:`). A permissive key regex produces dozens of phantom fields; keying on
  a lowercase name at the documented 2-space indent removes all of them.

## Claim 4 — finalize already has a measure-and-report shape — **QUALIFIED**

The shape exists, but **there are two of them**, and the chain receipt and changed paths use the one
the issue does *not* describe. Getting this wrong is the difference between touching one file and
touching six.

### Shape A — `## Validation` / `## Changed Paths` (what the chain receipt and changed paths actually use)

| step | site |
|---|---|
| measure | `probeFinalizeValidationGate(root, authorityDir, authorityState, base)` — `scripts/kaola-workflow-claim.js:4035-4050` |
| call, pre-archive | `scripts/kaola-workflow-claim.js:4463-4471` (deliberately before `archiveProjectDirSafely` at `:4472`, "so both land in the copy that is kept") |
| durable | `persistValidationToSummary(projectDir, validation)` `:4082-4090`; `persistChangedPathsToSummary(projectDir, changed, probe)` `:4091-4102` — both call `appendSummarySection(projectDir, heading, lines)` `:4063-4081`, idempotent **by heading**, swallow-on-error, `replace` defaulting false |
| envelope | `finalizeEmit.validation` / `.changed_paths` / `.changed_paths_probe` — `:5299-5313` |
| `--check` lane | `evaluateFinalizePreconditions` sets `checks.validation` (the classification string) and `checks.changed_paths` — `:4190-4197`; the comment at `:4122-4125` states the validation rung is reported and never a `reason` |
| finding shape | `evaluateChainReceipt` (`scripts/kaola-workflow-adaptive-schema.js:1235`, `finding()` helper `:1242-1245`) returns `{ classification, green, mode, chains, detail, operator_hint }` — the typed key is **`classification`**, not `type` and not `code` |

### Shape B — `finalize_transaction.findings` / `## Finalize Findings` (the typed-finding accumulator)

| step | site |
|---|---|
| record | `recordFinalizeFinding(type, summary, lines)` — `scripts/kaola-workflow-claim.js:4276-4278`, pushing `{ type, summary, lines }`. The typed key is **`type`** |
| flush | `flushFinalizeFindings()` `:4280-4295` — sets `finalizeTx.findings = Array.from(new Set(finalizeFindings.map(f => f.type)))` (de-duplicated on the envelope), then `appendSummarySection(result.dest, '## Finalize Findings', lines, true)` with `replace=true`, emitting `### <type>` per finding. Returns early when empty, so a healthy run carries no `findings` key at all |
| flush sites | inside the `--keep-worktree` commit block, plus the universal one at `:5293` (must run before the emit) |
| envelope | `finalizeTx` → `finalizeEmit.finalize_transaction` `:5307` |
| existing 8 types | `claim_release_skipped_offline` `:4740`, `main_roadmap_mirror_not_regenerated` `:4891`, `archive_unstage_failed` `:5002`, `archive_stage_failed` `:5043`, `archive_commit_probe_failed` `:5101`, `residue_probe_failed` `:5167`, `residue_stage_failed` `:5215`, `finalize_commit_probe_failed` `:5258` |

**Shape B carries a hard, measured propagation cost.** `scripts/test-forge-finalize-findings.js`
part B extracts the registry from each edition's own source by regex
(`registryOf`, `:485-494`: `/recordFinalizeFinding\(\s*'([A-Za-z][A-Za-z0-9_]*)'/g`) over four
hand-ported copies:

```
scripts/kaola-workflow-claim.js                                  (canonical)
plugins/kaola-workflow/scripts/kaola-workflow-claim.js           (codex)
plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
```

and then asserts, at `:512-537`: canonical ≡ codex exactly; gitlab ≡ gitea exactly; canonical minus
each forge **exactly `["archive_unstage_failed"]`**. It further asserts `docs/api.md`'s `findings`
table row (`docs/api.md:383`) enumerates **exactly** the canonical registry (`:545-561`), and that
`docs/api.md:415`'s spelled-out counts sentence ("raise **seven** … where canonical and Codex raise
**eight**") matches the measured set sizes (`:563-578`).

So a new type under Shape B = 4 source copies + 2 `docs/api.md` sites (row + counts word), or the
suite reds. Shape A costs the same 4 copies for the code but has no registry/docs pin.

**Recommendation:** Shape A. The condition is a per-run measurement with a complete value written
once — exactly what `appendSummarySection`'s idempotent-by-heading default was designed for, and the
same reason `## Validation` is not a finding. It also reads the record where the record still is:
the mission list lives in `finalizeAuthorityDir` and is moved by `archiveProjectDirSafely` at
`:4472`, so the probe belongs in the `:4463-4471` block beside the other two.

## Claim 5 — the condition is outcome-present-and-status-not-done, not status-is-in-flight — **SURVIVES on measurement, with one correction**

On the #968 record the two conditions are **indistinguishable**: all 7 flagged items read
`in-flight`, and the record contains zero `todo` items. So #968 alone does not justify the wider
condition.

The archive does. Sweep over all 36 archived `mission-list.md` files (445 items), same parser,
last-status-wins:

| condition | items | runs affected |
|---|---|---|
| outcome present **and** status ≠ done | **27** | **9 of 36** |
| `in-flight` with **no** result (the "louder problem") | **21** | **9 of 36** |

The two sets are near-orthogonal in practice (only `bundle-881-882-883-884-885`, `bundle-940-…-944`
and `issue-967` carry both), which supports the issue's framing that they are different conditions
deserving different treatment. Worst single run: `bundle-940-941-942-943-944` — 21 items, of which
11 read `in-flight` while carrying a `result` (first-status-wins), 3 read `in-flight` with no
result, 2 remain `todo`.

**The correction:** this is not a #968 one-off. **A quarter of every archived run in this repo
carries at least one item in this state.** That strengthens the case for the report and simultaneously
means the report will fire often — so it must be a report and nothing else, and its wording should
state the count and the item line numbers rather than imply a fault.

**Not measurable here:** whether "outcome-present" should mean literally the `result` key or any
result-like key. `result so far` / `earlier result` exist in history and are now gone; `note` and
`attribution` are the only non-spec keys left in the archive (4 runs). A `result`-only predicate
would have missed 1 of #968's 7. That is a design call, not a measurement.

## Contract confirmation — the fix must be a report, never a refusal — **CONFIRMED**

- `CLAUDE.md:47-48`: "`mission-list.md` is the **run** record. It is not attested, not frozen, and
  not machine-verified — that absence is deliberate, not an oversight."
- `CLAUDE.md` § *Nothing refuses*: "The refusal count in the run design is **zero** … the finalize
  chain-receipt check reports a typed finding on its envelope and durably in
  `finalization-summary.md` for the orchestrator to act on." The exceptions named are the pre-tag
  release gate and operations that would **destroy** something. A mission-list report is neither.
- `docs/decisions/0017-the-mission-list.md:50-53`: "Note what the successor axiom does *not*
  derive: any check that the records are *sufficient*. It derives that whatever was collected is
  readable and honest. Judging sufficiency would be the system deciding what the agent needs, which
  is the move ADR 0016 deleted." **A contradiction report is squarely on the "honest" side of that
  line; anything that judges completeness is on the wrong side.**
- ADR 0017 `:71`: "**No script is required.** A file convention suffices."
- The ADR watch-list row nearest this class is *"stale / replayed / cross-copied evidence — a result
  that does not correspond to the work claimed"*; it is a different condition and is **not** armed by
  this finding.

## Test pattern for the test author

`scripts/simulate-workflow-walkthrough.js:7108` — `testFinalizeOfflineReportsSkippedClaimRelease`
(registered at `:12578` via `add('testFinalizeOfflineReportsSkippedClaimRelease', …)`). It is the
model to copy, and it has all four parts a finding test needs:

1. A local `findingSection(summaryPath, type)` helper (`:7110-7118`) that slices `\n### <type>\n` out
   of the archived `finalization-summary.md`.
2. **Premise assertions** before the real one, so a green result cannot come from the wrong lane
   (`:7151-7155`).
3. The positive leg: `finalize_transaction.findings` includes the type (`:7157-7160`) **and** the
   durable `### <type>` section exists (`:7162-7167`) **and** names the specific subjects
   (`:7168-7172`).
4. A **negative control** in a second fixture (`:7180-7210`) — "without this the finding could be
   unconditional, which says nothing about any particular run."

For a Shape-A report the same structure applies with `## Validation` in place of `### <type>` — assert
the section exists, assert the envelope key, and control with a record whose statuses are consistent.
Fixture seeding uses `plantActiveFolder` + `seedAdaptiveFinalizeFixture`; the finalize is driven with
`spawnSync(process.execPath, [claimScript, 'finalize', '--project', project])`.

## What the implementer needs to know

1. **Reuse Shape A.** Add the measurement to the `:4463-4471` block in
   `scripts/kaola-workflow-claim.js` — beside `persistValidationToSummary` /
   `persistChangedPathsToSummary`, **before** `archiveProjectDirSafely` at `:4472`, reading
   `path.join(finalizeAuthorityDir, adaptiveSchema.MISSION_LIST_FILE)`. Write via
   `appendSummarySection(finalizeAuthorityDir, '## <heading>', lines)` (default `replace=false`,
   idempotent by heading, swallow-on-error). Put the same value on the envelope at `:5299-5308` and,
   if the `--check` lane should see it, in `checks` at `:4190-4197`.
2. **Do not use `recordFinalizeFinding` unless a grep-able typed name is genuinely wanted** — it
   costs the four hand-ported `claim.js` copies plus two `docs/api.md` sites, all pinned by
   `scripts/test-forge-finalize-findings.js` part B.
3. **Write the parser locally, `ledger-compare.js` style.** No item-level parser exists to extend.
   Handle: `- item:` and column-0 `item:`; duplicate `status:` inside one item (11 in the archive —
   decide and document first-vs-last, it moves the count by 27%); lowercase-key-at-2-space-indent
   only, or free-text `result` prose produces phantom fields.
4. **Report, never refuse, and never judge sufficiency.** Exit code unchanged, no `reasons` entry.
   State the count and the item line numbers.
5. **Expect it to fire.** 9 of 36 archived runs (27%) would have carried this report.

# docs/api.md dock — ADR 0018 §5 roadmap retirement (m984-apidocs)

Scope: `docs/api.md` only, in worktree `bundle-984-985`. Verified every remaining hit against the
current code (`kaola-workflow-claim.js`, `-classifier.js`, `-closure-audit.js`, `-sink-merge.js`,
`-closure-contract.js`), not against the brief's line numbers alone (those had already shifted).
Did not touch tests or any other file. Did not commit.

## Ground truth confirmed by reading the code (not assumed from the brief)

- `projectNameForIssue` (`claim.js:305`) is now `return 'issue-' + issueNumber;` — the
  `workflow_project:` door is gone; `--project` is the only door.
- `reconcileRoadmapForClosure` is fully deleted from `claim.js` (confirmed via `git diff`): every
  field it produced — `roadmap_source_removed`, `roadmap_regenerated`, `roadmap_sources_removed`,
  `roadmap_removed_by_root`, `roadmap_residue`, `roadmap_regenerated_by_root`,
  `roadmap_regenerated_main_error` — is gone from both the finalize envelope and the closure receipt.
- `CLOSURE_INVARIANTS` in `closure-contract.js` now lists exactly **5** items (was 7): the two
  roadmap invariants and the keep-open inversion that preserved them are gone from the array itself,
  not just undocumented.
- `closure-audit.js`'s `buildAuditReport` no longer detects `stale_roadmap_sources` or
  `mirror_lists_closed_issues` (both detector functions are deleted); `executeRepairs` now performs
  **only** stale-label removal — the stale-`.roadmap`-source delete and `ROADMAP.md` regenerate steps
  are gone from `--execute` entirely, scoped or unscoped.
- `sink-merge.js`'s bucket-1 auto-stash of the claim-time roadmap source is retired (`stash_ref` no
  longer seeded on a fresh receipt); `stash_restore` stays as a no-op tolerant of an old on-disk
  receipt only.
- `sink-merge.js`'s `buildClosureReceipt()` call no longer computes `archive` + roadmap fields — only
  `archive`.
- `kaola-workflow-roadmap.js` itself, the mirror, and `.roadmap/` as a reserved directory name are
  **untouched** — this bundle is ADR 0018 §8 build-step 4 ("stop reading the sources"), not step 5
  (delete the file) or step 6/7 (migration/init changes). `templates/routing/init.skeleton.md` still
  carries the full roadmap bootstrap, confirming init is out of this bundle's scope.

## Edits made (in order down the file)

1. **:84-88 (reserved-project prose)** — "two doors" → "one door, `--project`". Removed the
   `workflow_project:` roadmap-source door from the sentence entirely (matches the code: the fallback
   is unconditional now). Kept the `.roadmap`/`archive` reserved-name behaviour, which is unchanged.
2. **:322-324 (resolved-project-note downstream-read list)** — dropped "roadmap paths" from "archive
   path, roadmap paths, the removal pathspec, the marker, the receipt" — the per-issue roadmap-path
   computation that phrase referred to was `reconcileRoadmapForClosure`'s, now gone.
3. **:761-763 (sink `--sink` mode one-liner)** — removed "auto-stashes the claim-time
   `.roadmap/issue-N.md`" from the preflight description (bucket-1 auto-stash retired). Reflowed the
   surrounding line wrap while I was in it.
4. **:1035-1038 (Fail-closed archive result boundary)** — removed "roadmap regeneration or removal,"
   from the list of things gated behind `archiveSucceeded(result)`. That downstream action no longer
   exists anywhere the predicate gates (confirmed: no call site does roadmap regen/removal any more).
   *Not in the brief's list — found by re-reading the paragraph after confirming the retirement.*
5. **:1040-1068 (Closure invariants)** — the big one:
   - Renumbered the 5 surviving invariants 1–5 (was 7, with 1/2 being the roadmap pair).
   - Updated the named-violation bullets' invariant-number citations (`in-progress-label-removed` →
     4, `active-folder-absent` → 1, `archive-state-closed` → 2) to match.
   - Removed the `roadmap-source-absent`, `roadmap-mirror-clean`, `roadmap-residue-clean` bullets —
     already gone by the time I read the file (part of the "already done" set).
   - Replaced the "Keep-open inversion" paragraph (which described inverting the two roadmap
     invariants under `keep-open-roadmap-preserved`) with a short "Retired: the roadmap-source
     invariants" note, in the same style the file already uses two paragraphs later for the retired
     attestation invariant — states what's gone and why (ADR 0018 §5 /
     `reconcileRoadmapForClosure`), so nothing is left implying the mechanism still exists.
6. **:1122-1128 (keep-open partial-close lane)** — deleted the `roadmap_source_removed records
   'kept'` bullet outright; there's no replacement fact to state since `archiveProjectDir` no longer
   touches `.roadmap/` at all under keep-open or otherwise.
7. **:1142-1146 (bundle closure-receipt JSON example)** — dropped the `"roadmap_sources_removed": [...]`
   line; the field has no schema entry any more.
8. **:1170-1177 (`sink-merge` closure receipt prose)** — kept only "`sink-merge` derives `archive` by
   probing post-conditions"; dropped the `roadmap_source_removed`/`roadmap_regenerated` clauses.
9. **:1197-1203 (Closure history)** — the `#162` sentence now explicitly says "that reconciliation
   was retired under ADR 0018 §5, so this is history, not current behaviour" rather than silently
   citing invariant numbers that no longer exist. Dropped the stale `(invariants 1, 2)` /
   `(invariant 6)` / `(invariants 1–4, 6, 7)` parentheticals for #163/#164 (renamed #163's to the
   stable id `in-progress-label-removed` instead of a number that has since moved).
10. **:1210-1213 (closure-audit intro sentence)** — "across local roadmap sources, the generated
    `ROADMAP.md`, active folders, ..." → "across active folders, ...". Roadmap classes dropped.
11. **:1238 (scoped `--execute` fact row)** — was "still rebuilds `ROADMAP.md` whole ...". Rewrote to
    the current fact: scoped `--execute` only repairs `stale_in_progress_labels`, already
    issue-filtered before the repair runs. *Not in the brief's list — caught by my own full-file
    grep; the ROADMAP.md-rebuild justification no longer applies to anything `--execute` does.*
12. **:1242-1243 (Key table)** — deleted the `stale_roadmap_sources` and `mirror_lists_closed_issues`
    rows outright (both detectors are gone from the script).
13. **:1251-1254 (Safe-repair boundary)** — was "(1) deletes stale sources, (2) regenerates
    `ROADMAP.md`, and (3) removes the label". Now only the label-removal half survives, matching
    `executeRepairs`.
14. **:1303-1305 (closure-audit vs. worktree-tooling surface table)** — dropped "roadmap sources,
    `ROADMAP.md`," from the Surface and Never-touches cells; renumbered the invariant citations to
    match the new 5-item list (`invariants 1, 2, 3, 4` for closure-audit's surface, `invariant 5` for
    the worktree side, replacing the stale `1, 2, 3, 5, 6` / `7`); dropped "stale `.roadmap` sources,
    mirror regeneration," from the `--execute` repairs cell.
15. **:1408-1414 ("Closure cleanup is automatic")** — the whole paragraph described exactly what
    `reconcileRoadmapForClosure` used to do (remove `.roadmap/issue-{N}.md`, regenerate
    `ROADMAP.md`, scoped to closed-status archives). Rewrote to "Closure no longer reconciles the
    roadmap mirror," stating the retirement plainly and naming `reconcileRoadmapForClosure` and ADR
    0018 §5. Kept the still-true half: the archive commit still stages `kaola-workflow/.roadmap/`
    and `kaola-workflow/ROADMAP.md` **when present on disk** as part of its scoped-paths `git add`
    (verified live in `claim.js` — `candidatePaths`/`existingPaths` unchanged) — so I didn't delete a
    true fact along with a false one. *Not in the brief's list — found by grep, and it was the
    single biggest remaining defect: a whole paragraph asserting automatic behaviour that no longer
    happens.*
16. **Whitespace**: removed a stray double-blank-line left by an earlier (already-done) deletion
    right after the Finalize-envelope JSON block (line ~314). One-line formatting fix, same file,
    directly adjacent to roadmap-retirement edits.

## Verified as still accurate — no change

- **:16** — `/workflow-init` "bootstrap ... roadmap tracking ..." — still true; init's roadmap
  bootstrap (`templates/routing/init.skeleton.md`) is untouched by this bundle.
- **:223-224** — "roadmap staging" as a named finalize-transaction step — still true;
  `finalizeTx.roadmap_staged` is still computed from whether `.roadmap`/`ROADMAP.md` existed **and**
  were actually staged by the archive `git add` (code at `claim.js:4825-4877`, unchanged by this
  bundle).
- **:371 `roadmap_staged` field row** — the brief flagged this one, but the code backs it exactly as
  written: `finalizeTx.roadmap_staged = archiveAddOk && existingPaths.some(p => p ===
  'kaola-workflow/.roadmap' || p === 'kaola-workflow/ROADMAP.md')` — derived from the `git add`
  outcome, not filesystem presence, which is precisely what the row says. Left unchanged; noting this
  explicitly since the brief listed it as a "known" survivor to work.

## Final grep — every hit categorised

```
grep -n -i roadmap docs/api.md
```
30 hits, all accounted for:

**(a) Legitimately about `kaola-workflow-roadmap.js`, the mirror, or `.roadmap/` as a reserved
directory — all of which still exist, untouched by this bundle:**
- :16 (`/workflow-init` owns roadmap tracking)
- :84, :92 (reserved-name set includes `.roadmap`)
- :223 (roadmap staging step, unchanged)
- :371 (`roadmap_staged` field, unchanged, verified above)
- :1394-1421 (the whole "Roadmap Operations — `kaola-workflow-roadmap.js`" section: `generate`,
  `validate`, `validate-remote`, `migrate`, `init-issue`, `project-name` subcommand rows, and the
  `Exports:` line) — none of this is retired by this bundle; step 5 of the ADR 0018 build sequence
  (deleting `roadmap.js` and this whole doc section) is future work.
- :1612, :1631, :1651 (script-inventory entries for the three forges' `*-roadmap.js`)

**(b) Clearly-marked history:**
- :1065-1068 — my new "Retired: the roadmap-source invariants" note (states what's gone and why,
  same idiom the file already uses for the retired attestation invariant two paragraphs down).
- :1199 — the `#162` sentence in Closure history, now explicit that it's "history, not current
  behaviour."
- :1408-1414 — "Closure no longer reconciles the roadmap mirror," naming what used to happen and
  that it's retired.

**(c) Judged out of scope, with reason:** none. Every hit that named or implied still-live
roadmap-closure machinery was rewritten or deleted; the survivors are either the still-real mirror
system (a) or explicitly-marked retirement notes (b).

## Where this landed

- Edited: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-984-985/docs/api.md`
- Not touched: any test file, any script, any other doc.
- Not committed (per instructions).

## What in the brief turned out to be wrong or incomplete

- The brief's line numbers had already drifted by the time I started (e.g. its ":1037" landed on a
  different sentence than intended after the "already done" edits shifted things) — expected per the
  brief's own warning; I re-grepped after every edit rather than trusting the original numbers.
- The brief's known-hits list was **not exhaustive**. Three defects it didn't name, all found by
  reading the surrounding prose rather than by string-matching "roadmap":
  1. The "Fail-closed archive result boundary" paragraph's "before roadmap regeneration or removal, ..."
     clause (a downstream action that no longer exists).
  2. The "scoped `--execute`" fact row justified by a `ROADMAP.md` whole-rebuild that no longer
     happens.
  3. The "Closure cleanup is automatic" paragraph under Roadmap Operations — the single largest
     remaining defect, a full paragraph asserting `reconcileRoadmapForClosure`'s exact behaviour as
     current fact.
  All three are handled above.
- Nothing in the brief was factually wrong about the retirement itself — everything it said was gone
  (`reconcileRoadmapForClosure`, the roadmap closure-receipt fields, the roadmap closure invariants,
  the classifier's offline arm, the sink's auto-stash/keep-open retention, closure-audit's
  `stale_roadmap_sources`/`mirror_lists_closed_issues`/`main_roadmap_mirror_not_regenerated`) was
  confirmed gone by reading the current scripts.

# ADR 0018 documentation dock — README.md, docs/README.md, docs/architecture.md

Task: finish the documentation dock for ADR 0018 (the forge-is-the-backlog retirement) across the
three assigned files, so no surviving prose promises retired local-roadmap machinery.

Worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-984-985`
(branch `workflow/bundle-984-985`). No commit made — edits are in the working tree only, as
instructed.

## What I verified before editing

Read `docs/decisions/0018-the-forge-is-the-backlog.md` in full, `CHANGELOG.md`'s `[Unreleased]`
section (Added/Removed/Fixed), and cross-checked every claim against the actual shipped tree rather
than the ADR's prose alone:

- `scripts/kaola-workflow-claim.js`: `projectNameForIssue` always returns `issue-<N>` now (the
  roadmap-source `workflow_project:` door is dead code kept only for signature stability);
  `.roadmap/` and `ROADMAP.md` remain **reserved** directory names (still refused at claim time),
  but only via the `--project` flag now — the second door is gone. `list-open` / `cmdListOpen` /
  `listOpenIssues` / `priorityTier` / `readPriorityConfig` exist and are wired to the `list-open`
  subcommand only (not to `startup`).
- `scripts/kaola-workflow-closure-audit.js`: the roadmap drift classes
  (`stale_roadmap_sources`, `mirror_lists_closed_issues`) are gone; surviving classes are
  `stale_in_progress_labels`, `active_folder_for_closed_issue`, `unarchived_pr_folders` /
  `unarchived_mr_folders`, `archive_content_incomplete`, `archive_summary_citation_missing`.
  `--execute` repairs only the stale in-progress label.
- `scripts/kaola-workflow-classifier.js`: OFFLINE with no active-folder evidence now answers
  `target_unverified` (comment cites this explicitly as the ADR §5 named accepted loss); the
  `blocked by #N` → `depends-on:#N` roadmap-prose inference is gone. The **label**-based
  `depends-on:#N` check is untouched (different mechanism, not roadmap-derived).
- `scripts/kaola-workflow-sink-merge.js`: preflight's bucket-1 auto-stash of a claim-time
  `.roadmap` source is retired (comments at ~1754, ~1796 confirm "no production code writes into
  kaola-workflow/.roadmap/ any more"); only two buckets remain (project-state duplicates, foreign
  dirt). `stash_restore` stays in `SINK_STEPS` only for backward-compat with an older receipt that
  still carries a `stash_ref`.
- `templates/routing/init.skeleton.md`: the "Required structure" scaffold created by
  `/workflow-init` no longer includes `.roadmap/` at all, and the file confirms `/workflow-init`
  creates `CLAUDE.md`, `AGENTS.md`, and the docs scaffold — never `ROADMAP.md`.
- `templates/routing/next.skeleton.md`: confirmed the exact current wording of Step 1 (pick),
  Step 2 (list-open + shortlist body/comment reads, comments-override-body), which I mirrored into
  README's prose walkthrough rather than inventing new phrasing.
- Confirmed **migration (ADR §8 step 6, "workflow-init owns migration … diagnose → report → ask →
  act") is NOT built in this run** — no such flow exists in `init.skeleton.md`, and CHANGELOG's
  `Added` section lists only four items (shortlist read, list-open ordering, marked region,
  finalize-comment duty), none of them migration. I stated this explicitly in the docs/README.md
  entry rather than implying migration ships.

## Edits — README.md

1. Overview diagram: `/workflow-init` box said it generates `ROADMAP.md`; changed to `AGENTS.md`
   (matches what init actually creates).
2. `/goal` example: "until ROADMAP.md has no active entries" → "until the open issue list is empty".
3. Consent/autonomy paragraph: "issue/roadmap reorganization" → "issue reorganization" — matches
   `next.skeleton.md`'s already-updated `consent-in-conversation` PIN text verbatim ("reorganizing
   someone's issues", no roadmap qualifier). One rule, one wording.
4. Codex packs paragraph: dropped "roadmap refresh" from the capability list (that subcommand, and
   the script that carried it, are gone in all four editions).
5. `/workflow-init` usage paragraph: dropped `kaola-workflow/ROADMAP.md` from the list of what init
   creates/updates.
6. "### 1. Pick the work": rewrote the backlog-read list to match `next.skeleton.md` exactly — the
   open issue list ordered by `P0`–`P3` tier via `list-open`, `.roadmap/_rules.md`, active folders,
   archived summaries — and **added the new shortlist body/comment-read duty** (ADR §5 item 5,
   #985), since this section is the README's canonical walkthrough of that exact step and silently
   omitting a now-mandatory duty would itself be a doc gap. Comments-override-body stated explicitly.
7. Reserved-directory paragraph: removed the claim that `workflow_project:` in a roadmap source is a
   second door into the reserved-name substitution (verified dead in `claim.js`); kept `.roadmap/`
   and `.archive/` as reserved (verified still enforced), reworded to note `.roadmap/` is now just
   "home to the optional `_rules.md`".
8. "Active-work tracking": "unfinished work is tracked in `.../ROADMAP.md`" → "unfinished work is
   the forge's own open issue list — there is no local mirror of it".
9. Operational scripts table, `kaola-workflow-closure-audit.js` row: removed the roadmap drift
   classes, replaced with the classes verified still emitted; "`--execute` repairs only safe local
   roadmap/label drift" → "repairs only the stale in-progress label" (verified — that's the only
   repair path left).
   (Note: the `kaola-workflow-roadmap.js` table row itself was already removed before I started —
   that's the "script-table row already fixed" the brief referenced.)
10. Validation scripts table: `simulate-workflow-walkthrough.js` row said it tests "the claim,
    finalize, roadmap, sink, and hook surfaces" — dropped "roadmap" (there is no roadmap surface
    left to test).
11. "Active folder coordination" paragraph: replaced the old `ROADMAP.md`-generation invariant with
    the new durable-state contract (forge-is-the-backlog, comments-override-body,
    `.roadmap/_rules.md` survives) — this is the same rewording the run's own `CLAUDE.md` Durable
    State Contract section already carries, reused here rather than re-derived.
12. Classifier section: "Offline classification reads `.../.roadmap/issue-{N}.md` for the
    `depends-on` prerequisite" → describes the actual current behavior (`target_unverified`, no
    local source left), matching `classifier.js`'s own comment.
13. "### Agent-directed issue selection" numbered list, item 1: "Inspect the local roadmap
    (`kaola-workflow/ROADMAP.md`)" → "Read the open issue list, ordered by `P0`–`P3` priority tier
    (`kaola-workflow-claim.js list-open`)". **Left the rest of this section's other pre-existing
    staleness alone** (see Findings below) — it wasn't a roadmap mention and isn't something ADR
    0018 touched.
14. "## Roadmap cycle" → renamed "## Backlog cycle" (no inbound anchor links found anywhere in the
    live tree — only stale references inside `kaola-workflow/archive/issue-151/*`, which is archived
    history, not live). Rewrote the body: dropped "mirrors active unfinished work into
    `ROADMAP.md`", added the shortlist body/comment read, replaced "the local roadmap is a working
    mirror, not the source of truth" with "the forge is the backlog; there is no local mirror to
    keep current" plus the `_rules.md` survival note, and dropped "the local roadmap should not
    become history storage" (nothing left to become one).
15. "Finalization still owns…" paragraph: "issue/roadmap state" → "issue state" (same One-rule
    reasoning as #3 above).
16. "## Keep-open partial-close sinks": removed the claim that `finalize --keep-open` "preserves
    every member's `.roadmap/issue-N.md` source … and regenerates `ROADMAP.md` still listing them"
    — verified `keepRoadmapSource` is passed to `archiveProjectDirSafely` but is dead (grep found no
    consumer of that option anywhere in the function body); replaced with what the archive actually
    does (`closed_keep_open` status) and an explicit "no local roadmap source left to preserve".
17. "### All-or-nothing finalization": removed "`removes every `.roadmap/issue-N.md` source file,
    regenerates `ROADMAP.md` once`" — verified `reconcileRoadmapForClosure` (the mechanism that did
    this) is fully retired per three separate comments in `claim.js`.

## Edits — docs/README.md

1. Workflow State Contract index line: "durable state and the generated roadmap mirror" → "durable
   state, and why the forge, not a local file, is the backlog".
2. Decisions section: "Two records describe what ships today, one is accepted but not yet built" →
   "Three records describe what ships today" (0016 + 0017 + 0018 — verified against `ls
   docs/decisions/`, only these three carry `NNNN-title.md` numbering outside the `D-NNN-NN` series;
   nothing else is "accepted but not yet built" now that 0018 shipped).
3. Rewrote the 0018 bullet from "accepted, not yet built" to describe what actually ships: the
   retirement, `list-open` ordering (ordering not selecting), the marked-region/PIN mechanism, the
   shortlist body/comment read with comments-override-body, and finalize's new
   comment-what-you-corrected duty. **Explicitly noted migration (§8 step 6) is not yet built** —
   this is a fact a reader needs and the brief's "tell the truth" instruction covers it.
4. "machinery that still ships around the run (claim, roadmap, sink, release, …)" — dropped
   "roadmap" from that list (it's the one item in that list that no longer ships).

## Edits — docs/architecture.md

Read the whole file first; it does describe the roadmap layer in three places, so this file was in
scope (not a no-op).

1. `/workflow-init` bullet: dropped "roadmap tracking" from what init bootstraps (verified against
   `init.skeleton.md`'s scaffold, which no longer includes `.roadmap/`).
2. Sink-steps diagram: `preflight` line dropped "auto-stashes the claim-time .roadmap source"
   (verified retired in `sink-merge.js`); `stash_restore` line rewritten from "restore the
   auto-stashed .roadmap source" to "no-op today — kept for receipts an older sink left mid-run with
   a stash to pop" (verified: the step function still runs, but there is nothing new for it to
   restore; it stays only for an in-flight older receipt).
3. "## Roadmap" section (a full paragraph describing `ROADMAP.md` as a live generated mirror with
   `generate`/`validate-remote` subcommands) → renamed "## Backlog" and rewritten to describe the
   actual current mechanism: forge-is-the-backlog, `list-open` ordering by bare `P0`–`P3` label
   (never selecting), the shortlisted body/comment read, and the surviving `.roadmap/_rules.md`.
   Confirmed no other doc links to the old `#roadmap` anchor before renaming.

## Acceptance check — every surviving hit categorized

```
$ grep -rn -i roadmap README.md docs/README.md docs/architecture.md
```

- `docs/README.md:35,40,41` — **(b) clearly-marked history**: the 0018 decisions-index entry
  describing what was retired, plus the explicit "migration is not yet built" note and the
  surviving `_rules.md` mention.
- `docs/architecture.md:182` — **(a) genuinely about surviving machinery**: `roadmap_staged` is a
  real, still-computed finalize-envelope field (`claim.js:4876-4877`) that stages whatever
  `.roadmap`/`ROADMAP.md` residue exists on disk (now typically nothing, or an unmigrated consumer's
  leftovers) into the archive commit. Not a promise of generation/regeneration.
- `docs/architecture.md:290` — **(a)** the surviving `.roadmap/_rules.md`, in the new "## Backlog"
  section I wrote.
- `README.md:860, 883, 1191` — **(a)** the surviving `.roadmap/_rules.md` / reserved `.roadmap/`
  directory.
- `README.md:974, 1074` — **(a)** the same `roadmap_staged` field as above (finalize-transaction
  bullet and the `finalize` CLI table row).
- `README.md:1046` — **(a)** the rewritten durable-state paragraph, explicitly stating "there is no
  local mirror to keep current" and naming the surviving `_rules.md`.
- `README.md:1100` — **(a)** explicit statement that there is no local roadmap source left
  (classifier offline behavior).
- `README.md:1307` — **(a)** explicit "there is no local roadmap source left to preserve"
  (keep-open sink paragraph).

No fourth category. Second check:

```
$ grep -rn "kaola-workflow-roadmap\|ROADMAP.md" README.md docs/README.md docs/architecture.md
docs/README.md:35: ...the ROADMAP.md mirror are gone...
```

Only one hit, and it is the same clearly-historical 0018 entry — no doc names the deleted
`kaola-workflow-roadmap.js` script or promises `ROADMAP.md` as a live artifact anywhere in the three
files.

Also ran a markdown sanity check (code-fence count parity) on all three files post-edit: all even/OK.

## Findings — things in the brief that turned out to be wrong, or that I found but left alone

1. **"`docs/api.md` (already docked)" is not accurate.** I read it (not mine to edit, so I did not
   touch it) and it still carries a full `## Roadmap Operations — kaola-workflow-roadmap.js` section
   (`docs/api.md:1393-1422`) describing `generate`, `validate`, `validate-remote`, `migrate`,
   `init-issue`, `project-name` as live subcommands of a script that `git status` shows as **deleted**
   — with no historical marker, presented as current API reference. It also still lists exports
   (`regenerateRoadmap`, `validateRemote`, `readRoadmapIssues`, `roadmapDir`, `buildRoadmapContent`)
   and per-edition script index entries (`kaola-gitlab-workflow-roadmap.js`,
   `kaola-gitea-workflow-roadmap.js`) for scripts that are gone. This directly contradicts the ADR's
   own rule ("Prose ships with its mechanism — a rule describing a deleted mechanism is the same
   defect as a test repaired ahead of one"). I left it untouched per the explicit scope boundary, but
   it needs the same treatment I gave `docs/architecture.md`'s `## Roadmap` section.
2. **`docs/workflow-state-contract.md`** (not one of my three files, not explicitly excluded either)
   is also fully stale on this topic: `.roadmap/issue-*.md` as "the durable local source for active
   roadmap rows", a full "### Roadmap issue-source fields" section, and a block describing
   `ROADMAP.md` generation/regeneration semantics (`workflow-state-contract.md:103,121-123,151,273,
   420-434`). I linked to it from `docs/README.md` with corrected summary text, but the target file
   itself still promises retired machinery.
3. **Pre-existing, unrelated to ADR 0018 — left alone, flagging for visibility:** README.md's
   "### Agent-directed issue selection" section and two other spots (`README.md:1017`, `1350`) still
   use a `green/yellow/red/blocked` verdict vocabulary; the live classifier verdict table earlier in
   the same file (`README.md:1083-1090`, unedited by this run) is
   `green/blocked/owned/red/target_unavailable/target_unverified/indeterminate` — `yellow` has not
   existed for some time. This predates ADR 0018 (nothing in the ADR or CHANGELOG touches verdict
   naming) and isn't a roadmap mention, so I did not fix it — flagging it since it sits one line
   away from an edit I did make (item 13 above) and would be cheap to fix in the same pass if wanted.
   Similarly, "### Priority label configuration" (`README.md:1097-1122`) says the sort order applies
   "in `/workflow-next` startup", but `listOpenIssues`/`priorityTier` are only ever called from the
   `list-open` subcommand (verified: `grep` shows zero other call sites) — pre-existing imprecision,
   not something this run introduced or asked me to fix, left alone.

## Files changed

- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-984-985/README.md`
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-984-985/docs/README.md`
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-984-985/docs/architecture.md`

No commit made (per instructions). Nothing else in the worktree was touched.

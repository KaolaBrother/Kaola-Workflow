evidence-binding: n2-documentation 83219ce14dda
<!-- docs_updated: paste docs_updated here -->
docs_updated: CHANGELOG.md (one [Unreleased] Fixed entry covering both halves of #715), docs/api.md (§ Sink journal disposal at terminal success — in-progress-receipt vs terminal-stray distinction; NATIVE=0 discard/release note — release now commits the discard archive; Closure Contract — new "Discard-archive commit (issue #715)" paragraph documenting `discard_archive_committed` / `discard_archive_commit_detail`), docs/workflow-state-contract.md (§ Terminal journal disposal — same distinction in two sentences)

upstream_read: n1-residue-fixes 9e9683c09f7c

## What changed (docs only, write set exactly as declared)

- `CHANGELOG.md` — appended one bullet to `[Unreleased]` → `### Fixed` (after the #713/#714
  bundle, before `## [6.23.1]`): bold lead naming both halves of #715 — (a) `release` and the
  `watch-pr`/`watch-mr` CLOSED sweep now commit the `.discarded-` archive via the shared
  `commitDiscardArchive` helper (actual `dest` staging, diff-quiet skip, `chore: discard archive
  <project>` scoped commit, tree-at-HEAD verify, OFFLINE does not skip, placed after the in-place
  branch restore), with `discard_archive_committed: true|false` + `discard_archive_commit_detail`
  on the emitted JSON; (b) `sinkPreflight`'s #518 receipt exemption re-keyed from this-project to
  the EXACT path (any project, live or archived, one segment), classification-only, look-alikes
  and `sink-fallback.json` still foreign dirt.
- `docs/api.md` § Sink journal disposal at terminal success (~line 3494) — replaced the blanket
  "a stray journal must be deleted, never committed" paragraph with an "In-progress receipt vs.
  terminal stray (issue #715)" block: an IN-PROGRESS receipt (exact path, ANY project, live or
  archive) is sink-owned, exempt from foreign-dirt classification, and must NOT be manually
  deleted or committed mid-cycle — it IS the resume ledger; re-running the owning sink resumes,
  completes, and disposes/commits it. A TERMINAL stray (post-`status: sinked`, or pre-#653
  residue) stays delete-never-commit. Records that the exemption is exact — `sink-fallback.json`,
  `.tmp`, nested, and trailing-slash forms stay bucket-3.
- `docs/api.md` NATIVE=0 in-place branch paragraph (line 186) — appended: the release action now
  commits the discard archive locally (after the branch restore) and the emitted JSON carries
  `discard_archive_committed: true|false`.
- `docs/api.md` Closure Contract (~line 2946) — new "Discard-archive commit (issue #715)"
  paragraph: `cmdRelease` + watch-pr/mr CLOSED sweep commit the `.discarded-` archive after the
  #699 archiveSucceeded predicate passes; emitted-JSON contract (`discard_archive_committed`,
  `discard_archive_commit_detail` on failure, loud `warnings[]` entry on release, same two fields
  on watch `cleanups[]` entries); a failed commit never throws past the emit and never strands the
  release/sweep.
- `docs/workflow-state-contract.md` § Terminal journal disposal (line 433) — the stray-journal
  sentence now carries the same in-progress-vs-stray distinction in two sentences, pointing at the
  api.md section.
- No decision record written (none allocated for this issue).

## Key wording decisions

- Field name `discard_archive_committed` (plus `discard_archive_commit_detail` on failure) taken
  from the shipped code, not invented: verified at `scripts/kaola-workflow-claim.js:3360-3361`
  (cmdRelease emit) and `:4338-4339` (watch-pr CLOSED `cleanups[]` entry); helper
  `commitDiscardArchive(result, project)` read at `:2321-2351` (diff-quiet guard, HEAD tree
  verify, never throws, OFFLINE does not skip — matches the doc claims).
- The #715 exemption covers ONLY `sink-receipt.json`; `sink-fallback.json` is deliberately NOT
  exempted — docs say so explicitly rather than implying both journals are exempt (verified at
  `scripts/kaola-workflow-sink-merge.js:1194` SINK_RECEIPT_EXEMPT + the #518/#715 comment block).
- The old "stray ⇒ delete, never commit" guidance was preserved verbatim for the TERMINAL case so
  pre-#653 operator runbooks still land on the same action.
- `docs/decisions/D-653-01.md` still carries the pre-#715 blanket sentence; it is a frozen
  decision record outside my write set (and no decision record is allocated for this issue), so
  it was intentionally left unchanged.

## Anti-fabrication checks run

1. `git status --porcelain` after edits — modified set is exactly CHANGELOG.md, docs/api.md,
   docs/workflow-state-contract.md (plus n1's pre-existing script/plugin/test modifications and
   the untracked `kaola-workflow/issue-715/` run tree, both untouched by me).
2. `git diff --stat` on the three doc files: 40 insertions / 7 deletions; diffs of
   workflow-state-contract.md and CHANGELOG.md eyeballed in full.
3. Grep across `docs/` for the stale blanket phrase ("must be deleted, never committed" /
   "delete, never commit") — only remaining hit is `docs/decisions/D-653-01.md` (frozen record,
   out of scope by design).
4. Read-back of both new api.md regions (lines 3494-3513 and 2946-2956) and the grep confirming
   `discard_archive_committed` / `discard_archive_commit_detail` spellings match the code exactly.
5. Every behavioral claim in the new docs traced to either the n1 evidence or a direct code read
   (claim.js helper + both emit sites, sink-merge.js exemption regex); no claim rests on the
   prompt alone.

# docs (doc-updater) — document the shipped #261 contract behavior

4 verbatim edits applied (dictated before→after; no fabrication):
- docs/api.md :227 — --barrier-check flag desc gains refusal case (c): a foreign-project archive write under kaola-workflow/archive/<X>/ whose <X> is neither the finalized project nor its <project>.archived-<ts> rename is refused (#261); finalized project = opts.project threaded from projTag (basename of dir holding workflow-plan.md); fail-closed (absent ⇒ foreign).
- docs/api.md :260 — --barrier-check JSON shape note: a foreign-archive refusal surfaces in `errors`; object shape unchanged.
- docs/api.md :206 — Roadmap Closure Cleanup paragraph gains the narrowed cmdFinalize staging note (stages only finalized project's archive band + rename via git rm -r --cached + git add of dest + .roadmap + ROADMAP.md, not broad git add -A).
- docs/architecture.md :155 — #231 enforcement-boundary barrier-check sentence extended with the (c) foreign-project archive clause + companion defense-in-depth (cmdFinalize narrowing + Phase-6 Staging Guard foreign-archive block).

Verification: grep -F confirmed 'foreign-project' present at api.md:227,260 + architecture.md:155; '#261' / 'never swept into the finalize commit (issue #261)' present. node scripts/simulate-workflow-walkthrough.js → "Workflow walkthrough simulation passed" (docs-only, no regression). git status --porcelain docs/ → only docs/api.md + docs/architecture.md modified (scope clean).

Files (declared write set): docs/api.md, docs/architecture.md.

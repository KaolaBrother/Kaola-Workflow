evidence-binding: docs c128249680e5

doc-updater node: rescoped the stale FILE_CEILING references in the public docs and added the #453 CHANGELOG entry. Precise prose edits applied inline by the orchestrator against verbatim source (no fabrication).

Changes:
- docs/api.md (4 FILE_CEILING refs → 0):
  * #381 write-set shape-refusal prose: "Both are checked **before** the FILE_CEILING count" → "checked at freeze as write-set **shape** refusals, independent of write-set size (there is no per-node file-count ceiling — #453)".
  * #431 generated_port_split fix-prose: "a single node may declare all four without violating FILE_CEILING when counting file entries" → "a single node may — and must — declare all four edition files together; there is no per-node file-count ceiling, #453".
  * Grammar list: removed the "≤ FILE_CEILING (6) files per node;" clause.
  * Agent-registration-gap note: "the 22-path surface cannot fit FILE_CEILING=6 in one node" → "normally spread across several nodes — the check is count-independent".
- CHANGELOG.md: added an [Unreleased] "### Removed" entry for #453 (the wall removal + the preserved write-safety walls + the planner/skill rubric change + the walkthrough fixture flip). Historical FILE_CEILING entries (the #431 [Unreleased] entry and the released-version entries) left untouched — changelog history is append-only.
- docs/architecture.md: scanned, NO FILE_CEILING / six-file references — no change required (declared in the write set as an upper bound; writing a subset is barrier-legal).
- README.md: scanned, the only six-file statement (line 704 "past the absolute backstop of 6 files") is already inside the Fast-path paragraph and explicitly fast-path-only — no change required; no adaptive six-file inference exists.

Verification (exit 0):
- node -e FILE_CEILING count in docs/api.md → 0.
- CHANGELOG #453 Removed entry present; historical #431 "(after FILE_CEILING)" entry preserved.
- git diff --stat: only docs/api.md + CHANGELOG.md changed (architecture.md/README.md correctly unchanged).
- main-root working tree clean (edits landed in the worktree via absolute paths).

write_set (subset of declared, all within {docs/api.md, docs/architecture.md, README.md, CHANGELOG.md}): docs/api.md, CHANGELOG.md

# Documentation docking — issue #1107

Candidate: `b6eef546a270aff015fa0e1836dbac81f25bf8ca` (branch `workflow/issue-1107`)

## Changed behavior

None. This is a documentation-only correction: `docs/api.md` described `--tag` as creating an
**annotated** tag, while `scripts/kaola-workflow-release.js:307` creates a **lightweight** tag ref
via an atomic zero-old `git update-ref refs/tags/<tag> <candidate> 0000…` (no tag object, no
tagger, no tag message). No script, test, or tag was modified.

## AGENTS.md documentation checklist

| Surface | Checked | Action |
|---|---|---|
| `README.md` | yes — `grep -n "annotated" README.md` | No release-tag claim. No impact. |
| `docs/api.md` | yes — line 2017 | FIXED: sentence now states the lightweight zero-old `update-ref` behavior, consistent with `docs/conventions.md` ("Release cutting"). |
| `CHANGELOG.md` | yes — top-of-file | FIXED: new `## [Unreleased]` / `### Fixed` entry added. No duplicate heading (`grep -c "^## \[Unreleased\]"` = 1). Past released sections untouched. |
| `docs/conventions.md` | yes — line 616 | Already correct ("atomic zero-old ref update at candidate HEAD"). No change needed; `docs/api.md` now links to it. |
| Architecture / ADR docs | yes — no design change | No impact: behavior unchanged, so no ADR is warranted. |
| Public-interface comments | yes — no code change | No impact. |
| `docs/README.md` index | yes | No index change: `docs/api.md` already indexed; no new page. |

## Other "annotated" hits swept (README.md, docs/, CHANGELOG.md)

`grep -rn "annotated" README.md docs/ CHANGELOG.md` — remaining hits are all unrelated to the
release tag and were left alone:

- `docs/decisions/D-641-01.md:111,163` — "annotated node" in the adaptive graph.
- `CHANGELOG.md:622,1411,4541` — past released sections (out of bounds per scope).
- `scripts/generate-routing-surfaces.js` / `scripts/test-generate-routing-surfaces.js` — surface
  annotations, not tags.

## Verdict

DOCKED

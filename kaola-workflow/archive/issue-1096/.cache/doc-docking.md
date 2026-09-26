# Documentation docking — issue-1096

Candidate: workflow/issue-1096 @ 94785512 (base 1cbd7e2a, v12.2.6).

## Checked files
- `CHANGELOG.md` — FIXED: `[Unreleased]` entry for #1096 (unified untracked preflight rule, the ancestor-file collision leg, and the publication/cleanup envelope fields). No version section added (no release).
- `docs/api.md` — FIXED: the sink-preflight rule now states the two-tip-tree claim (an untracked path conflicts only when it sits at the path in the `branch` tree or the `origin/<defBranch>` tree, or an ancestor of it exists as a FILE in either tree), and documents the `publication` / `cleanup` envelope fields.
- `docs/workflow-state-contract.md` — FIXED: the orphan paragraph now describes #1096 behavior (a sibling `archive/<project>.orphan-<ts>` is untracked and carried by no candidate tree, so the sink passes it through; nesting is what lands the orphan in git history through the run's own archive_commit pathspec).
- `README.md` — FIXED: delivery/sink prose names the unified rule.
- `docs/README.md` — no impact: documentation index only; no doc file added, renamed, or removed.
- `docs/decisions/*` — no impact: no ADR-level design change; the rule's contract lives in `docs/api.md`, and the D1=b decision is the issue's own record.
- `docs/conventions.md` — no impact: does not enumerate the preflight exemption set or the envelope field list.
- `docs/architecture.md` — no impact: describes module ownership, not the preflight rule or envelope shape.
- Public-interface comments — FIXED: the `sinkPreflight` block comment in `scripts/kaola-workflow-sink-merge.js` (plus the byte-identical Codex plugin copy and the GitLab/Gitea hand-ports) and the new `untrackedPathConflictsWithCandidateFolder()` helper.
- Rendered surfaces — FIXED: `templates/routing/finalize.skeleton.md` edited, the 6 rendered finalize surfaces regenerated (`npm run sync:editions`), never hand-edited; `scripts/fixtures/issue-1055-render-baseline.json` recaptured.

No CLI flag, JSON field, or state-file key was added or renamed: `publication` / `cleanup` are fields on the existing `--sink --json` envelope, and `--sink` semantics are unchanged.

DOCKED

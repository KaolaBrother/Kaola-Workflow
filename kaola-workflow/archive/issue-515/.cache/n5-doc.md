evidence-binding: n5-doc e26008a5ae83

## Files written

- `docs/decisions/D-515-01.md` (NEW) — Architecture decision record documenting the gap (asymmetric enforcement: `authoring-allowed` had no reciprocal), the two-lever fix (script guard + T11 prose floor), the defaulted-vs-explicit predicate refinement, the three preserved boundaries (B1/B2/B3), and the principle constraints (#1/#3/#44/#287).
- `docs/conventions.md` (EDIT) — Added § "Switch-ON path guard — reciprocal `authoring-allowed` (issue #515)" immediately before the existing § Bundle Lane section; documents the `path_requires_explicit_opt_in` refusal, the `pathWasDefaulted` predicate, explicit-escape pass-through, the T11 prose-floor pin, forge neutrality, and cross-references D-515-01.

## Sanity check

Both files are well-formed markdown: balanced fences, no unclosed headings, consistent heading hierarchy. D-515-01.md uses the established `# D-N-NN. <title>` / Date / Status / Issue / Related / `## Context` / `## Decision` / `## Boundaries` / `## Why this shape` / `## Consequences` structure matching D-512-01 and D-513-01. The conventions.md addition is a standalone `## ` section with no nested code fences requiring closure beyond the single inline pair.

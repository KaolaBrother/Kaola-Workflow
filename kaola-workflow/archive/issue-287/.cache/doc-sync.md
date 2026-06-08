# doc-sync node evidence

## ADR written

`docs/decisions/0006-planner-first-entry.md`

## Format match

Matches sibling ADR format exactly: title line `# N. <title>`, then `Date`, `Status`,
`Issue`, `Related` frontmatter block; sections `## Context`, `## Decision`,
`## Non-goals`, `## Consequences` (Positive / Negative subsections), `## Lock`;
no fabricated sections.

## No 0006 collision

`ls docs/decisions/` before write showed:

```
0001-legacy-session-lock-cleanup.md
0002-lean-orchestrator-intent-realignment.md
0003-adaptive-front-end-planner.md
0004-script-owned-mechanical-transitions.md
0005-plan-run-owns-node-lifecycle.md
```

0006 was not present. No numbering collision.

## Write-set confirmation

`git status --porcelain --untracked-files=all docs/decisions/` after write:

```
?? docs/decisions/0006-planner-first-entry.md
```

ONLY `docs/decisions/0006-planner-first-entry.md` is new or changed. No other file
outside the declared single-file write set was touched.

# Documentation docking — issue #933

**Verdict: DOCKED.**

## Changed files reviewed

| file | user-visible? | docked where |
|---|---|---|
| `scripts/kaola-workflow-claim.js` | yes — new envelope fields, changed folder selection | `docs/api.md`, `README.md`, `CHANGELOG.md` |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | same behaviour, codex edition | same (byte-identical copy) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | same behaviour, gitlab edition | same — the docs are forge-neutral and the field names carry no forge vocabulary |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | same behaviour, gitea edition | same |
| `scripts/simulate-workflow-walkthrough.js` | no — test artifact | no-impact |
| `scripts/test-forge-claim-reserved-project.js` | no — test artifact | no-impact |
| `package.json` | no — chain wiring only, no new user-facing script name | no-impact |
| `CHANGELOG.md`, `README.md`, `docs/api.md` | these ARE the doc surfaces | — |

## Documents checked

- **`README.md`** — updated. The claim section already said *"The claim answers; it does not refuse"*;
  a reserved name resolving rather than refusing is a direct instance of that sentence, so it was
  docked immediately below it rather than in a new section.
- **`docs/api.md`** — updated. The claim-envelope verdict table is the canonical surface for what a
  claim emits; the two new fields are documented in a table beneath it, with the reserved set, both
  doors, and the fact that both are absent when no substitution happened.
- **`CHANGELOG.md`** — updated under `[Unreleased] / Fixed`, placed above the #932 entry it is
  adjacent to and explicitly distinguished from it.
- **`docs/architecture.md`** — no impact. No structural change: one resolver added inside an existing
  function, no new module, no new script, no changed call graph between components.
- **`docs/workflow-state-contract.md`** — no impact. The durable state contract is unchanged; the
  substitute is written to the existing `name:` field exactly as any project name always was.
- **`docs/conventions.md`** — no impact. No new convention introduced; the change reuses the existing
  `isReservedWorkflowDirName` predicate and the existing `<thing>_note` + discrete-field envelope
  pairing (#403.8's `worktree_error` / `worktree_error_class`).
- **`.env.example`** — no impact. No environment variable added or read.
- **`kaola-workflow/ROADMAP.md`** — not hand-edited; it is a generated mirror and closure owns it.
- **Issue comments** — nothing needed; the issue statement is fully answered by the change.

## Gaps found and fixed

1. **The `docs/api.md` claim table documented only statuses, not envelope fields.** A reader could
   not have learned the two new fields exist. Fixed by adding a field table bound to the table that
   already documents that surface.
2. **The `README.md` claim section asserted a universal — "answers, does not refuse" — that a
   reserved-name refusal would have contradicted.** Since the owner ruled resolve-and-report, the
   sentence stays true and the new behaviour was docked as an instance of it rather than an
   exception to it.

## The one thing NOT documented, deliberately

The `issue-<N>`-is-the-only-possible-substitute-shape finding (`writeState` infers the number from
the project name via `/^issue-([1-9][0-9]*)$/`, so no other substitute shape can complete a claim)
is recorded in the code comment, the commit message and the run record — **not** in user-facing docs.
It is an internal constraint on the implementation, not a behaviour a consumer can observe or rely
on, and documenting it would publish a mechanism rather than a result.

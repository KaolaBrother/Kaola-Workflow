# Documentation docking — issue-929

Verdict: **DOCKED**

This run's deliverable IS documentation, so docking is not a downstream chore here — the three
authored surfaces are the fix itself. Docking therefore checks the inverse of the usual question:
not "is the code reflected in the docs" but "is the prose true of the code, in every edition".

## Changed files reviewed

10 files, +64 / −1, **zero `.js`**:

| file | change |
|---|---|
| `docs/workflow-state-contract.md` | new `### Roadmap issue-source fields` (+25) |
| `docs/api.md` | `project-name` row now specifies the field, not only the subcommand (±1) |
| `templates/routing/init.skeleton.md` | one bullet inside the CLAUDE.md compact template (+1) |
| `commands/workflow-init.md` ×3 (github/gitlab/gitea) | rendered, +1 each |
| `skills/kaola-workflow-init/SKILL.md` ×3 | rendered, +1 each |
| `CHANGELOG.md` | new `[Unreleased] / ### Documentation` (+31) |

The six rendered surfaces were regenerated, never hand-edited.

## Documents checked

- **`README.md`** — no impact. It never documented the field's semantics; it lists `project-name`
  among the roadmap subcommands at `:1016` and nothing else touches `workflow_project`. Verified by
  grep: zero occurrences of `workflow_project` in README.
- **`docs/api.md`** — updated. Note this file is test-consumed, so it was edited before the chain run.
- **`docs/workflow-state-contract.md`** — updated; also test-consumed
  (`validate-workflow-contracts.js:337/360/367/399/441`), re-run green after the final rewording.
- **`docs/architecture.md`**, **`docs/conventions.md`**, **`docs/README.md`**, **`docs/decisions/`** —
  no impact; all silent on `workflow_project`, confirmed by the verifier's cross-check.
- **`CHANGELOG.md`** — updated under a new `[Unreleased]`, written BEFORE the chain run so the
  receipt is not staled by a later doc edit.
- **`kaola-workflow/ROADMAP.md`** — not hand-edited; closure owns it.

## Gaps found and fixed

Four, all found by adversarial verification of the prose rather than by any suite, and all fixed:

1. **A fabricated mechanism** — the claim that a shared `workflow_project` value directs several
   issues into one folder. False: `claimExplicitBundle` derives the name at `claim.js:1801` and never
   reads the field; a second claim on a shared value is refused `target_occupied`. Deleted, and
   replaced with the measured fact plus a cross-reference to the pre-existing
   `### Bundle project and branch naming`.
2. **A branch absolute wrong on half the editions** — "always `workflow/issue-{N}`" is false on
   GitLab (`workflow/gitlab-issue-N`) and Gitea (`workflow/gitea-issue-N`); the same file said so at
   `:387-388` and `docs/api.md:166-167` already carried the correct wording, so this had introduced a
   second wording of one rule. Reworded to name all three forms.
3. **An incomplete field list** — root/codex sources carry five fields, but gitea/gitlab
   `issueRecordContent:217-228` also writes `labels` and `url`. Clause added.
4. **An unqualified absolute** — "any other value is adopted as written" is false for `.`, `..`,
   `../evil`, `a\b`, which silently become `issue-N`. Qualified in-sentence in both docs, and the
   silent substitution is now stated outright.

All three of 1–3 are one failure class: a prose absolute true of root/Codex and false or incomplete
for the forge ports. A final per-edition sweep — normalized-hashing each shared predicate across its
copies rather than reading root and assuming — found no fourth instance.

## No-impact reasons

- No `.env.example`, no schema, no config, no CLI surface changed — nothing to dock there.
- No public API changed: zero `.js` files touched in any edition, deliberately, by owner ruling.

## Anti-fabrication

Every structured claim in the new prose is transcribed from driven output or a read line, not
inferred: `isSafeName`'s four clauses from `active-folders.js:14-18`, the four destinations driven
end-to-end, the `archive`/dot skip from the line ordering at `:240`/`:241`, the branch prefixes read
per edition. The one claim that was *not* measured before being written — the bundle mechanism — is
exactly the one that turned out to be fabricated, and it was removed rather than repaired.

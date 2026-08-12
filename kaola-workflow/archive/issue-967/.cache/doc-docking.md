# Documentation docking — issue-967

Verdict: **DOCKED**

Docked inline by the orchestrator. The facts to transcribe were all measured in this run, and the
surface is small enough that a handoff would add a fabrication surface for no gain.

## Changed files reviewed

| file | change | user-visible? |
|---|---|---|
| `scripts/validate-workflow-contracts.js` | hard assert → non-fatal `notice:` on physical lines | YES — stderr text and, more importantly, a check that no longer fails |
| `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` | byte-identical copy | YES |
| `scripts/validate-kaola-workflow-contracts.js` | same, codex chain | YES |
| `templates/routing/init.skeleton.md` | 3 sites reworded; the 240-line "hard limit … stop" removed | YES — reaches consumers' repos |
| `commands/workflow-init.md` + 5 plugin renders | regenerated from the skeleton | YES |
| `CLAUDE.md` | Maintenance line states recommended-never-enforced | YES |
| `README.md` | "enforces" → "encourages" context discipline | YES |
| `scripts/test-run-chains.js` | stale `rootReadSurfaces` comment retitled | no — comment text |

## Documents checked

- **`CHANGELOG.md`** — UPDATED, under a new `### Changed` heading in `[Unreleased]`. `### Changed`
  rather than `### Fixed` deliberately: this removes an enforcement behavior, it does not repair one.
- **`CLAUDE.md`** — UPDATED. Its Maintenance line was itself one of the two places stating the rule,
  so leaving it would have left the repo asserting a limit its own validators no longer apply.
- **`README.md:1180`** — UPDATED. It claimed the workflow "**enforces** context discipline" with
  `CLAUDE.md` targeting under 200 lines. After this change that verb is simply false, and it is the
  sentence a reader most likely meets first.
- **`templates/routing/init.skeleton.md`** — UPDATED at the authoring surface, then regenerated.
  Never edited a rendered surface. `--check` was confirmed **RED first** (`6 surface(s) drifted`) and
  green after, so propagation is demonstrated rather than assumed.
- **`docs/`** — reviewed, **no impact**, checked rather than assumed. No document describes the
  CLAUDE.md length rule or enumerates this validator's individual checks; the `git grep` hits are
  unrelated ADRs (D-420-01 on `plan_invalid`, D-445-01 on plan-run **card** sizes of 100–200 lines,
  investigations proposing template lines). Nothing there became false.
- **`docs/api.md`** — **no impact**. It documents script contracts and envelopes; the contracts
  validator's internal assertion list is not among them, so no signature or field changed.
- **`.env.example`** — **no impact**. No environment variable added or removed.

## Anti-fabrication

Every claim quoted into the docs and CHANGELOG was measured in this run: the three sizes of the
mutation proof (200/201/260) come from actual invocations, the `6 surface(s) drifted` string is the
real `--check` output before regeneration, and the plugin copy's unrelated failure was verified
against **HEAD** before being described as pre-existing. The "199 lines" claim about this repo's own
`CLAUDE.md` is `wc -l` after the edit.

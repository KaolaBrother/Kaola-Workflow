# Documentation docking — bundle-987-988-989

**Verdict: DOCKED.**

`doc-updater` was NOT dispatched. Subagents were declined for this whole run (session instruction:
no agent dispatch unless the user asks), which the design permits — the tool is offered and
declinable, and the run still finishes. The documentation work below was done inline instead, and
this file plus `.cache/doc-updater.md` record it in the place a dispatch's output would have landed.

## Changed files reviewed

| file | user-visible? | docked where |
|---|---|---|
| `scripts/kaola-workflow-claim.js` | yes — `roadmap_staged` no longer stages the mirror | `docs/api.md` finalize-transaction section; `CHANGELOG.md` Removed |
| `scripts/kaola-workflow-sink-merge.js` | yes — archive-commit pathspec + a refusal `detail` string an operator reads | `CHANGELOG.md` Removed |
| gitea + gitlab `claim.js` / `sink-merge.js` | same, per edition | same rows, which name "all four editions" |
| `plugins/kaola-workflow/scripts/*` (4 files) | no — byte-identical codex mirrors carried by `edition-sync --write` | no row owed; parity is the contract, not a behaviour |
| `scripts/kaola-workflow-active-folders.js` | no — comment only (#987 marker at the clamp) | `CHANGELOG.md` Removed, in the #987 row |
| `scripts/kaola-workflow-closure-audit.js` | no — comment only (#987 marker) | same row |
| `scripts/simulate-workflow-walkthrough.js` | no — test deleted + tombstone | `CHANGELOG.md` Removed (#987) |
| `scripts/test-finalize-door.js` | no — fixture + assertions | `CHANGELOG.md` Fixed (#989) |
| `scripts/test-forge-finalize-findings.js` | no — assertions deleted, leg renamed | `CHANGELOG.md` Removed (#988), witness paragraph |

## Documents checked

- **`docs/api.md`** — GAP FOUND AND FIXED. The post-retirement paragraph stated finalize "still
  stages `kaola-workflow/.roadmap/` and `kaola-workflow/ROADMAP.md` into the archive commit when
  either is found on disk". False as of this run. Corrected to `.roadmap/` alone, with a new
  paragraph naming #988 and stating that a consumer's own `ROADMAP.md` is untouched because
  migrating it is ADR 0018 §8 step 6's separate deliberate act. The `roadmap_staged` field row in the
  transaction table needed no change — it describes outcome-vs-presence, which is unaffected.
- **`CHANGELOG.md`** — three rows added under `[Unreleased]`: #988 and #987 under `### Removed`,
  #989 under `### Fixed`.
- **`README.md`** — no impact. It carries no `ROADMAP.md` citation and no statement about archive
  staging or the timeout clamp.
- **`docs/conventions.md:805,809`** — CHECKED AND DELIBERATELY UNCHANGED. These describe the
  reserved-name / parked-lane classification, which is STILL LIVE: `claim.js:3535` and the residue
  walker must keep classifying an unmigrated consumer's `ROADMAP.md` correctly. Editing them would
  have been the opposite error to #988's.
- **`docs/investigations/*`, `docs/decisions/*`** — CHECKED AND DELIBERATELY UNCHANGED. Records of
  what was true when written; ADR 0018 already carries the retirement.
- **`docs/architecture.md`** — no impact; no structural change (no file added or removed from the
  script set, no new module, no changed boundary).
- **`.env.example`** — no impact. `KAOLA_GH_REMOTE_TIMEOUT_MS` behaviour is unchanged; only its
  untested arm gained a code comment.
- **Issue comments** — the three issues carry their outcomes at closure, including the two places
  where the filed premise turned out to be wrong.

## Anti-fabrication

No structured section was invented. The `docs/api.md` edit changes prose about a pathspec list whose
new contents were read out of `claim.js` in this run, and the `CHANGELOG` figures (184/184, 233/0,
491 assertions, 12m06s, Node v24.18.0, the mutation verdicts) are all transcribed from command output
recorded in this folder's `.cache/`, not recalled.

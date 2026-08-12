# Documentation docking — bundle-963-964-966

Verdict: **DOCKED**

Docking was done inline by the orchestrator rather than dispatched. The design offers subagents as a
declinable tool; the doc surface here is three files and the facts to transcribe were all measured in
this run, so a handoff would have cost a round trip and added a fabrication surface for no gain.

## Changed files reviewed

| file | change | user-visible? |
|---|---|---|
| `scripts/kaola-workflow-roadmap.js` | `validateRemote` gains optional `stats` out-param; `cmdValidateRemote` success line names its domain | YES — stdout text |
| `plugins/kaola-workflow/scripts/kaola-workflow-roadmap.js` | byte-identical copy of the above | YES |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js` | same, `issueIid` spelling | YES |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js` | same, `issueNumber` spelling | YES |
| `scripts/test-opencode-edition.js` | three S2 comment sites restated | no — comment text only |
| `scripts/test-shard-lib.js` | `runScenario` + `TIMING_ON` + `KAOLA_TEST_SCENARIO_TIMING` removed | no — dead test helper, no doc surface named it |
| `scripts/test-parallel.js` | `makeShimSpawnFn` removed | no — dead test helper |

## Documents checked

- **`CHANGELOG.md`** — UPDATED. Three `### Fixed` entries under `[Unreleased]`, one per issue.
- **`CLAUDE.md`** — UPDATED. The Durable State Contract bullet stops presenting `validate-remote` as
  the general roadmap drift check and states the one direction it covers, naming the forge's open
  list as the backlog truth. This was the exact sentence #966 identified as the misleading promise.
- **`docs/api.md`** — UPDATED in three places: the `validate-remote` subcommand row (direction,
  what it cannot see, and both new success strings), the canonical export list
  (`validateRemote(root[, stats])` with the `checked` semantics), and the two forge export lines.
- **`README.md:1010`** — reviewed, **no impact**. It lists the roadmap script's subcommand *names*
  (`generate`, `validate`, `validate-remote`, `init-issue`, `project-name`) and makes no claim about
  what `validate-remote` covers or what it prints. Nothing there became false.
- **`docs/architecture.md`** — reviewed, **no impact**. No structural change: no file added or
  removed, no new module, no changed call graph beyond one optional parameter.
- **`.env.example`** — **no impact**, and checked deliberately because #964 removed an environment
  variable. `KAOLA_TEST_SCENARIO_TIMING` appeared in no doc surface at all: a repo-wide search for it
  found only its own definition and use in `scripts/test-shard-lib.js`, and `docs/api.md`'s env-var
  section never listed it. So its removal orphans no documentation.
- **`kaola-workflow/ROADMAP.md`** — not hand-edited; closure regenerates it.
- **Issue comments** — the three issues carry the acceptance text this run answered; the closing
  commit and this run's summary carry the answers.

## Gaps found and fixed

1. First `CLAUDE.md` edit exceeded the line guard (see `## Run gaps`) — fixed by condensing to 198
   physical lines before any commit.
2. `docs/api.md` mentioned `validateRemote(root)` in **three** places, not one; the two forge
   sections at the bottom of the file would have been left stale by a fix that only touched the
   canonical section. Caught by grepping the signature rather than editing the section I arrived at.

## Anti-fabrication

Every string quoted into the docs was transcribed from a real run, not composed: both success lines
and the drift line come from the live reproduction executed in the worktree against the real forge
(zero-source, one-open-source, and one-closed-source cases). No field name, enum value or example
number in this docking was invented.

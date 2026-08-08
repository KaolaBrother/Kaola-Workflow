# Documentation docking — issue-936

Verdict: **DOCKED**

## Why this was not dispatched to doc-updater

Done inline, deliberately. The doc surface here is three prose sentences about claim release, and
every structured fact in them (function names, line anchors, the two-artifact rule, the receipt
field) was already established by measurement earlier in this run — the producer/consumer census in
`.cache/asymmetry.md`, the write set in `.cache/edition-census.md`. Handing that to a doc agent to
re-derive is the fabrication risk with none of the benefit: the standing caution on this repo is
that a doc agent invents schema unless it is dictated exact text or diffs against real `--json`
output. There was no `--json` surface to diff here, so the safe form was to write it from the
measurements and record which documents were checked and rejected.

## Changed files reviewed

Production: `scripts/kaola-workflow-{claim,sink-merge}.js`, their byte-identical
`plugins/kaola-workflow/scripts/` twins, and the gitlab/gitea `…-claim.js` / `…-sink-merge.js`
hand-ports. Tests: `scripts/test-sink-merge.js`, `scripts/simulate-workflow-walkthrough.js`,
`plugins/kaola-workflow-{gitlab,gitea}/scripts/test-{gitlab,gitea}-sinks.js`.

## Documents checked

| document | outcome |
|---|---|
| `CHANGELOG.md` | **UPDATED** — new `## [Unreleased]` → `### Fixed`. There was no `[Unreleased]` section; `9.5.4` was the head. |
| `docs/workflow-state-contract.md` | **UPDATED** (`:271-277`) — the `issue_action: comment_keep_open` bullet listed what the keep-open terminal does (preserve the roadmap source, comment instead of closing, refuse a PR/MR sink) and said nothing about the claim. Added that it releases the claim on every issue left open, and that release means BOTH artifacts. |
| `docs/api.md:1280` | **NO CHANGE, checked.** "Receipt wiring — `clearAdvisoryClaim` returning the status enum and finalize/watch emitting `claim_label_removed` — is shared across all three forges." Still true: the return enum is unchanged, the receipt shape is untouched, and the change added only an optional trailing parameter. |
| `docs/architecture.md:265` | **NO IMPACT.** Mentions keep-open only for the PR-body `Closes #N` hazard, which this does not touch. |
| `README.md` | **NO IMPACT.** Overview and install only; no claim-release prose. |
| `docs/conventions.md` | **NO IMPACT.** No rule changed; this run applied the existing ones. |
| `.env.example` | **NO IMPACT.** No new environment variable. `KAOLA_WORKFLOW_OFFLINE` and `KAOLA_GH_MOCK_SCRIPT` are pre-existing and unchanged. |
| `templates/routing/` | **NO IMPACT, verified by running the guard.** `generate-routing-surfaces.js --check` reports all 18 surfaces byte-match. The finalize skeleton's sink invocation (`slots.js:124`) is evidence *for* this fix, not something it changes. |
| roadmap sources | **NO CHANGE.** #936 was filed on the forge with no `.roadmap/issue-936.md` source, so closure has none to remove; `roadmap validate-remote` was ok before the run. |
| issue comments | The sink posts closure prose; no hand comment needed. |

## Gaps found and fixed

One: the keep-open terminal's documented behaviour list omitted claim release entirely — the exact
sentence a reader would consult to learn whether a kept-open issue stays claimable. Fixed in
`f1d13b50`.

## Not documented, deliberately

The `clearAdvisoryClaim` export and its new `opts` parameter are a script-to-script internal, not a
documented public API. `docs/api.md` documents the CLI subcommand surface, which is unchanged. Adding
an internal-function signature there would document something no consumer calls.

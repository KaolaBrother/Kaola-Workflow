# Kaola-Workflow — Claude Code Instructions

## Project Overview
Kaola-Workflow is a 6-phase workflow system built on top of GitHub issues and Claude Code. The core scripts live in `scripts/`. Workflow state is tracked per-project under `kaola-workflow/{project}/`.

## Durable State Contract

- `kaola-workflow/ROADMAP.md` is generated from `kaola-workflow/.roadmap/issue-*.md` (plus an optional project-local `.roadmap/_rules.md` appended under `### Project rules`); do not hand-edit the mirror.
- Do not purge `kaola-workflow/.roadmap/`; closure removes only the closed issue source file.
- Active work lives in `kaola-workflow/{project}/` until archived or safely discarded.
- Active artifacts include `workflow-state.md`, phase files, optional `fast-summary.md`, and `.cache/` evidence.

## Workflow Design Principles

### Agent Owns Reasoning; Scripts Own Atomicity (issue #44)

Issue selection is an agent decision, not a hidden script decision.

- **When user names an issue**: use that exact issue. Scripts validate and claim but must not fall back to another.
- **When user asks for "next issue"**: agent inspects local roadmap, GitHub issues, recent completed work, active folders, and user goal, then states the selected issue before claiming via `KAOLA_TARGET_ISSUE=N`.
- **Startup scripts validate, not select**: `cmdStartup`, `cmdPickNext`, and `cmdBootstrap` now require explicit `--target-issue N` flag. They validate the target is unclaimed and green/yellow, then claim. They refuse auto-pick with typed refusals.
- **Ambiguity handling**: When next issue is ambiguous or conflicts with active state, ask or stop. Do not let a script silently choose.

## Key Scripts
- `scripts/kaola-workflow-claim.js` — claim, release/discard, status, patch-branch, watch-pr, bootstrap/startup, pick-next, resume, finalize, worktree-status, worktree-finalize subcommands; explicit-target validation via `claimExplicitTarget()` helper
- `scripts/simulate-workflow-walkthrough.js` — integration test suite (hand-rolled assert, no framework)
- `scripts/kaola-workflow-roadmap.js` — roadmap generation from GitHub issues
- `scripts/kaola-workflow-plan-validator.js` — adaptive-path (#227) plan validator: closed-library + three-shape grammar + unique sink + post-dominance gates + caps + disjointness + risk-assessment governance (`--json`/`--freeze`/`--resume-check`); `plan_hash` lives inside `workflow-plan.md`. Toggle-agnostic.
- `scripts/kaola-workflow-adaptive-schema.js` — adaptive-path forge-neutral constants + toggle resolution; byte-identical across all four editions (cross-edition drift anchor).

## Running Tests
```bash
node scripts/simulate-workflow-walkthrough.js
```
Must exit 0 with "Workflow walkthrough simulation passed".

## Documentation Update Checklist

- [ ] README.md - update feature list, usage examples, env vars
- [ ] API docs - add/update endpoint descriptions and examples
- [ ] CHANGELOG.md - add entry under [Unreleased]
- [ ] Architecture docs - update if structure changed
- [ ] .env.example - add any new environment variables
- [ ] Inline comments - update where public interfaces changed

## Commands

- Install: `./install.sh --forge=github` (Claude Code), `--forge=gitlab` (GitLab edition), or `--forge=gitea` (Gitea edition).
- Test: `node scripts/simulate-workflow-walkthrough.js` and `npm test`.
- Lint/typecheck/build: unknown (Node scripts only, no formal pipeline).
- Dev server: not applicable.

## Non-Negotiable Rules

- Think before coding: state assumptions, surface ambiguity, and ask when unclear.
- Read before writing: inspect the target file and relevant surrounding conventions immediately before editing or creating files.
- Keep it simple: solve the requested problem without speculative abstractions.
- Make surgical changes: touch only what the task requires.
- Goal-driven execution: Define verifiable success criteria before starting. Prefer write-the-failing-test-first for bugs and features. Loop until criteria pass; don't declare done on weak signals.

## Validation Policy

- Background hooks (advisor, pre-commit, phantom-advisor) are advisory; do not re-run their checks redundantly.
- Verify with `node scripts/simulate-workflow-walkthrough.js` before claiming workflow-related changes complete.

## Documentation Map

- `README.md` — project overview and install.
- `CHANGELOG.md` — user-visible changes.
- `docs/README.md` — documentation index.
- `docs/architecture.md` — system structure and data flow.
- `docs/api.md` — APIs, schemas, events, external contracts.
- `docs/conventions.md` — coding, testing, Git, review rules.
- `docs/workflow-state-contract.md` — durable state and generated mirror contract.
- `docs/decisions/` — architecture decision records.
- `kaola-workflow/ROADMAP.md` — active implementation roadmap mirror.

## Maintenance

- Keep this file under 200 lines; move detail to `docs/` or skills.
- Add rules only after repeated mistakes, review feedback, or stable project conventions.
- Do not use `@path` imports for optional reference material.

# ADR 0026 — AGENTS.md is the only repository-level instruction surface

Status: Accepted · Date: 2026-09-20 · Issue: #1080

## Context

ADR 0023 decision 5 kept Claude Code's root `CLAUDE.md` as the smallest discovery bridge: one
`@AGENTS.md` import plus genuine Claude-only project facts. ADR 0020's project-instructions clause
described that bridge as the native project entrypoint. Both predated measured direct `AGENTS.md`
support in Claude Code.

Claude Code v2.1.277 (documented 2026-09-19, measured on this machine the same day) reads
`AGENTS.md` directly as a project instruction file. The shadowing rule is exact: any `CLAUDE.md`,
`.claude/CLAUDE.md`, or `CLAUDE.local.md` in the working directory or above it counts, so it makes
`AGENTS.md` invisible unless the file imports it. The two-token probe recorded in
`templates/agents/runtime-capabilities.json` demonstrates both directions. Sessions that cannot read
`AGENTS.md` remain possible: versions below 2.1.277; sessions under Amazon Bedrock / Vertex /
third-party providers or with telemetry disabled that never fetch the feature flag; the first
session after an install or upgrade; and the `claude-md` / `managed-only` project-instructions
setting.

A bridge that is also a shadow is not a neutral compatibility shim. While it exists, the repository
has two project instruction surfaces that can disagree, and the advertised one is not the one Claude
reads.

## Decision

1. `AGENTS.md` is the only repository-level instruction surface for every supported runtime,
   including Claude Code. This repository ships no root `CLAUDE.md`, `.claude/CLAUDE.md`, or
   `CLAUDE.local.md`; a fast-chain validator fails if any appears. A consumer that must support
   sessions that cannot read `AGENTS.md` may keep an owner-chosen `CLAUDE.md` containing
   `@AGENTS.md` as a stated exception. The workflow states that environment requirement and never
   provisions or maintains the file.
2. `workflow-init` reads `AGENTS.md` and reports any `CLAUDE.md`, `.claude/CLAUDE.md`, or
   `CLAUDE.local.md` on the project path as a shadowing file. It proposes deleting a file that holds
   only an `@AGENTS.md` import, or moving owner content into `AGENTS.md` and deleting it, and never
   creates one. Both outcomes require owner authorization.
3. The measured capability record states the version floor as an explicit field and records the
   probe. The `claude-local` adapter's compatibility reads name `project AGENTS.md` only.
4. The machine-global Claude carrier (`~/.claude/rules/kaola-workflow-global.md`) is unchanged: a
   `.claude/rules/` file loads alongside `AGENTS.md` rather than counting against it.

## Supersession

This decision supersedes ADR 0020's clause making a thin root `CLAUDE.md` the Claude project entry
and ADR 0023 decision 5. ADR 0020's direct-discovery, role-behavior, adapter, and provenance
decisions remain active; ADR 0023's decisions 1–4 and 6–7 remain active. It does not rewrite the
historical records.

## Consequences

- The repository has one project instruction authority; a Claude reader and every other runtime read
  the same bytes.
- Claude Code ≥ 2.1.277 is the normal path. Older or restricted sessions are a consumer environment
  requirement the workflow states, not a second surface the producer maintains.
- The validator pin is a negative one (no such file), backed by a planted-file mutation proof in the
  run receipt.

## Rejected alternatives

- Keep the `@AGENTS.md` bridge: it is still a shadow, so the file it points at is not read directly
  and the two surfaces can drift.
- Fold the Claude-only overlay lines into `AGENTS.md`: they named a `.claude/agents/` directory this
  repository does not have and npm chains `AGENTS.md` already carries; no fact needed carrying.
- Require every supported Claude Code version: the version floor is a measured environment fact, so
  the workflow documents it instead of pretending the older behavior does not exist.

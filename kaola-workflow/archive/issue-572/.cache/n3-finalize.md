evidence-binding: n3-finalize 78e4fe73631b

# n3-finalize — finalization evidence (issue #572)

Main-session-direct finalize node (non-delegable). Declared write set: CHANGELOG.md, docs/decisions/D-572-01.md.

## Writes (in declared allowlist)
- docs/decisions/D-572-01.md — new ADR: re-ground the workflow-init-injected `## Kaola-Workflow` block on the adaptive DAG-of-roles model + phase-ban/parity enforcement.
- CHANGELOG.md — [Unreleased] ### Fixed entry for #572.

## Adaptive barrier gates (run from worktree, pre-finalize)
resume=0 gate=0 barrier=0 verdict=0 — all four script-enforced gates pass; n1 post-dominated by completed n2 reviewer (verdict: pass, findings_blocking: 0).

## Documentation
- Doc impact is exactly CHANGELOG.md + the new ADR (both in the n3 declared write set, authored main-session-direct). No README/api/architecture/env/setup/CLI impact: the change is to the workflow-init INJECTED consumer template + contract validators + opencode test, not to any public behavior, schema, or external contract. Live system docs (architecture.md, opencode-edition.md) describe the full path as 6-phase, which remains accurate; they do not describe the injected template.
- doc-updater: skipped — scope is within the finalize node's own declared write set; broader doc sweep not warranted.

## Run gaps
- Reviewer (n2) deferred two out-of-template stale "phase" mentions as out-of-scope follow-ups (NB1: command-only "phase artifacts" narration in Active-Folder-Init; NB2: redirect-block "workflow phases" category label). Both are outside the injected `## Kaola-Workflow` consumer block and not reached by the ban. Captured as a follow-up per the goal contract (see finalization-summary.md ## Run gaps).

## Validation
- Self-host npm repo → four-chain receipt via run-chains.js (kaola-workflow/issue-572/.cache/chain-receipt.json), plus the --sink pre-merge npm test gate.

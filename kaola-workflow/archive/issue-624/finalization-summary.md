# Finalization - Summary: issue-624

## Delivered

Fixed #624 — the adaptive finalize four-gate merge barrier prose was broken on 5 of its 6 routing
surfaces (the historic forge-codex dead zone was live again, uncaught by all four green chains):

- Ported the canonical adaptive prerequisite block (the `workflow_path: adaptive` branch,
  `validator_script` resolver, and the four-gate `--resume-check`/`--gate-verify`/`--barrier-check`/
  `--verdict-check` bash choreography) verbatim from the github-codex finalize SKILL into both the
  GitLab and Gitea forge finalize SKILLs, modulo forge-specific validator script paths — closing a
  dangling `validator_script` reference that left an adaptive run on those runtimes with no
  instruction to run the script-enforced pre-merge barrier.
- Fixed all three Claude finalize commands, which said "three gates" in prose above an
  already-four-gate code block (an agent trusting the prose count when reconstructing from
  summarized context could drop `--verdict-check`, reopening the silently-passing-gate leak the
  fourth gate exists to close).
- Added a machine pin to both forge contract validators asserting the SKILL carries the adaptive
  branch marker plus all four gate flags — this exact class of drift (routing prose hollowing out
  while chains stay green) is now caught automatically, closing the gap that let #624 happen
  silently in the first place.

## Files Changed

7 files: 2 forge SKILLs, 3 Claude finalize commands, 2 forge contract validators (new pins). Plus
`CHANGELOG.md` (this finalize node).

## Test Coverage

Test-first (RED→GREEN): the new contract-validator pins fail on pre-fix forge SKILL content
(0 occurrences of `workflow_path: adaptive` + the four gate flags) and pass post-port.

## Final Validation Evidence

Self-host (npm) chain-receipt gate. `node scripts/kaola-workflow-run-chains.js --project
issue-624` run by the orchestrator after the CHANGELOG entry landed (avoiding the test-consumed-
prose staleness hit in the prior bundle run): all four chains green (`claude:0, codex:0,
gitlab:0, gitea:0`), `--finalize-check` confirms `checkedChanges:0` (no further changes since),
fresh over HEAD. Evidence: `.cache/chain-receipt.json`. Independently, n2-review (code-reviewer)
mechanically diffed the ported block against the canonical source and confirmed byte-identical
(modulo the two allowed forge-noun substitutions) — a true verbatim port, not a paraphrase.

## Documentation Docking

DOCKED. Evidence: `.cache/doc-docking.md`. `CHANGELOG.md [Unreleased]` entry present and grounded
in the actual landed diff. README/API/architecture/.env.example confirmed no-impact (the four-gate
barrier was already correctly documented in docs/api.md — this fix restores existing documented
behavior on two runtimes that weren't instructing it, not new API surface).

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none — no final validation failures this run) | | | | |

## Follow-Up Items

None. n2-review found 0 blocking findings (APPROVE).

## Run gaps

(sweep empty — no swept reason classes this run)

## Closure Decision

None needed. No unresolved conflicts, partial implementation, or user-decision items remain.

## Commit And Push

[pending final Git gate; final hash reported after push]

## GitHub Issue

#624 to be closed by the merge-sink closure (single-issue run, `sink: merge`).

## Roadmap

To be updated: `.roadmap/issue-624.md` removed (closed), `ROADMAP.md` regenerated.

## Archive

Pending (Step 8b, contractor).

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-finalize-barrier) | subagent-invoked | .cache/n1-finalize-barrier.md | |
| code-reviewer (n2-review) | subagent-invoked | .cache/n2-review.md | |
| doc-updater (finalize checklist) | subagent-invoked | .cache/n3-finalize.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | no final validation failures this run |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | | final gate runs after this file is committed |

## Status

ARCHIVED AFTER FINAL GIT GATE

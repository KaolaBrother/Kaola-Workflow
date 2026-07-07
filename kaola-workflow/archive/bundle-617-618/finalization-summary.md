# Finalization - Summary: bundle-617-618

## Delivered

Fixed two P1 finalize/sink fail-open correctness bugs from the 2026-07-07 audit:

- **#617** — a GitHub issue could close while its merge sink never actually ran (implementation
  never merged to main). Fixed via: `cmdFinalize`'s merge-lane close-deferral now derives from
  durable `sink:` state instead of resting solely on a caller-supplied flag; the previously
  declared-but-unused `remote-closed-after-publish` invariant is now wired into
  `checkClosureInvariants` via `git merge-base --is-ancestor`; a new `verify-sink` audit
  subcommand; `SINK_STEPS` reordered so `closure` runs LAST, after `push_main`, with a hard
  fail-loud ancestor gate immediately before any close.
- **#618** — chain-receipt greenness failed open on a signal-killed chain (exitCode 0 false
  green) and an empty `chains[]` receipt (vacuous pass). Fixed via fail-closed exitCode mapping
  (sync + async) in `kaola-workflow-run-chains.js`, a typed `chains_empty` refusal in
  `kaola-workflow-plan-validator.js --finalize-check`, and wiring the orphaned
  `scripts/test-run-chains.js` into the claude npm chain.

Both fixes span all four editions (root/claude-plugin/gitlab/gitea) per the #307 cross-edition
convention.

## Files Changed

22 files, +1608/-301 (see `git diff 866421aa HEAD -- scripts/ plugins/ package.json` for the full
accumulated diff). Key files: `kaola-workflow-sink-merge.js`, `kaola-workflow-claim.js`,
`kaola-workflow-closure-contract.js`, `kaola-workflow-run-chains.js`,
`kaola-workflow-plan-validator.js` (×4 editions each where applicable), `package.json`,
`scripts/test-bundle-finalize.js`, `scripts/test-run-chains.js`, plus a mechanical stale-assertion
flip in `simulate-workflow-walkthrough.js` and the two forge `test-*-sinks.js` files (consequence
of the `SINK_STEPS` reorder). Docs: `docs/decisions/D-617-01.md` (new), `docs/workflow-state-contract.md`,
`CHANGELOG.md`.

## Test Coverage

Test-first (RED→GREEN) for both fixes: #617 via `scripts/test-bundle-finalize.js` +
`scripts/test-claim-hardening.js`; #618 via extended `scripts/test-run-chains.js` (now 143
assertions, up from ~125). No project-wide coverage percentage is tracked by this self-host repo's
chain gate.

## Final Validation Evidence

Self-host (npm) chain-receipt gate. `node scripts/kaola-workflow-run-chains.js --project
bundle-617-618` run by the orchestrator after the group merge landed (commit `3660ef11`):
`headSha` matches HEAD, all four chains green (`claude:0, codex:0, gitlab:0, gitea:0`). Evidence:
`.cache/chain-receipt.json`. Independently, n3-review (code-reviewer) and n4-adversary
(adversarial-verifier) each separately re-ran/re-derived reproductions (not merely re-reading the
diff) and confirmed fail-closed behavior in fresh scratch repros, discharging the #618
chain-suite circularity concern.

## Documentation Docking

DOCKED. Evidence: `.cache/doc-docking.md`. New ADR (`docs/decisions/D-617-01.md`),
`docs/workflow-state-contract.md` update, and `CHANGELOG.md [Unreleased]` entry all present and
grounded in the actual landed diff. README/API/architecture/.env.example confirmed no-impact.

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none — no final validation failures this run) | | | | |

## Follow-Up Items

- n3-review found one MEDIUM non-blocking issue: `verify-sink` false-alarms on a clean sink whose
  branch was rebased mid-flight (rebase-stale `receipt.branch_head`). Filed as #631.
- n4-adversary independently confirmed both fixes are root-cause fail-closed (not symptom-masked)
  via fresh scratch-repo reproductions, and found two further non-blocking residuals: (a) a second
  chain-receipt-greenness consumer (`release.js:chainReceiptGreenness`) still fails open on
  `chains:[]`/missing `chains` — filed as #632; (b) a pre-existing, choreographically-unreachable
  manual-misuse corner in `cmdFinalize` for `sink:pr` (documented, no action needed) and a
  legacy-pipeline invariant-wiring note (documented, no action needed — control-flow already
  safe there).
- A genuine scheduler bug was hit and manually worked around during this run: the lane-group
  synthesizer's octopus merge refused with "untracked working tree file would be overwritten" —
  a structural collision between the parent worktree's seeded (untracked) evidence-stub file and
  each leg's own self-written-then-committed real evidence file at the identical path. Root-caused,
  worked around (pre-seeded byte-identical tracked content on the parent before the merge), and
  filed as #633 for a proper fix in the scheduler itself.

## Run gaps

- reviewer_finding (verify-sink rebase-stale false-alarm): filed: #631
- reviewer_finding (release.js chainReceiptGreenness fail-open residual): filed: #632
- in_run_repair (lane-group synthesizer merge collision, manually root-caused and worked around): filed: #633

## Closure Decision

None needed. All three run-discovered defects (above) were non-blocking to this bundle's own
acceptance criteria and have been filed as follow-up issues with roadmap sources added
(`kaola-workflow/.roadmap/issue-{631,632,633}.md`). No unresolved conflicts, partial
implementation, or user-decision items remain for #617/#618 themselves.

## Commit And Push

[pending final Git gate; final hash reported after push]

## GitHub Issue

Both #617 and #618 to be closed by the bundle's all-or-nothing sink-merge closure (this is a
bundle run: `issue_numbers: 617,618`, `closure_policy: all_or_nothing`).

## Roadmap

Updated: `.roadmap/issue-617.md` and `.roadmap/issue-618.md` removed (closed), `.roadmap/issue-631.md`,
`.roadmap/issue-632.md`, `.roadmap/issue-633.md` added (new follow-ups), `ROADMAP.md` regenerated.

## Archive

Pending (Step 8b, contractor).

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-fix-617) | subagent-invoked | .cache/n1-fix-617.md | |
| tdd-guide (n2-fix-618) | subagent-invoked | .cache/n2-fix-618.md | |
| code-reviewer (n3-review) | subagent-invoked | .cache/n3-review.md | |
| adversarial-verifier (n4-adversary) | subagent-invoked | .cache/n4-adversary.md | |
| doc-updater (n5-docs) | subagent-invoked | .cache/n5-docs.md | |
| doc-updater (finalize checklist) | subagent-invoked | .cache/n6-finalize.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | no final validation failures this run |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | | final gate runs after this file is committed |

## Status

ARCHIVED AFTER FINAL GIT GATE

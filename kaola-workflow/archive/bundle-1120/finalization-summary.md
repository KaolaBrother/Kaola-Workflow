# Finalization — Summary: bundle-1120

## Delivered

Issue #1120: the owner-approved 2026-10-14 blocked-line hand-over amendment is now in the
canonical global contract and every generated runtime carrier, with ledger enforcement and
regression coverage.

- `templates/global/kaola-workflow-global.md` carries the approved sentence verbatim in the
  Mission Ledger three-write rule; `templates/routing/required-blocks.js` pins it as a required
  global-contract token.
- All runtime carriers were regenerated from source — claude, codex, cursor, grok, opencode,
  kimi, zcode, devin, droid and dsh — with no hand-edited installed carrier.
- The shared kernel now permits exactly one `handed-over: #M` write on a blocked line, keeps
  done/failed/already-handed-over lines terminal, warns and proceeds on recoverable conditions
  per the owner rule, and distinguishes positionally evident blocked removals from recoverable
  renumbers. Duplicate-content lines no longer cause false refusals: same-position byte-identical
  lines are pinned first, the remaining map is an order-preserving earliest-match LCS, and an
  unmatched line gets one unclaimed content match for a genuine swap.
- The reference writer in all four claim editions enforces the transition rule; finalization
  reports the ledger state as an advisory field and the two typed finalize findings, with the
  unreachable fallback removed.
- `CHANGELOG.md` `[Unreleased]`, `docs/api.md`, `docs/decisions/0027-the-mission-ledger.md` and the
  affected fixtures/tests document the behaviour.

**Candidate:** `1580308ac0674403c1db8bdfc1857a4af18ca190` on `workflow/bundle-1120`, based on
`4751b5d58556babaaca668111d3e21afbb3cc8a9` (`main`, v12.5.3). The branch diff is exactly the 26
#1120 files, +2,516 / −55.

## Acceptance Evidence

- Independent final review round 5: **PASS — merge-ready** at `1580308a`, recorded in
  `.kaola/review-1120-round5.md`. It re-ran every rounds 1–4 probe, about 30 new combinations,
  and 6,052,420 small ledger transitions: 0 crashes, 0 terminal-line corruptions, 0 false
  refusals where the ledger did not shrink, and 60 documented ambiguous shrink cases that the
  reviewer explicitly marked as not needing a pre-merge fix.
- Review repair history: rounds 1–4 each FAILed on concrete findings and were repaired in
  follow-up commits `f3e4520a`, `372ad049`, `66fd0059`, `1580308a`; round 5 confirms all earlier
  probes hold.
- Producer chain receipt: `kaola-workflow/bundle-1120/.cache/chain-receipt.json`, headSha
  `1580308a`, `workTreeHash: clean`, all four chains exit 0 — claude 777,448 ms, codex 33,882 ms,
  gitlab 197,507 ms, gitea 195,943 ms.
- Focused final-tree evidence: `test-issue-1120-ledger-handover.js` 347 passed; 
  `test-issue-1089-mission-ledger.js` 494 checks, 0 failures across all four editions;
  `test-forge-finalize-findings.js` 233 passed; `edition-sync --check` 6 forge ports in parity and
  four committed kernels identical; `validate-script-sync.js` 14 common scripts / 10 byte-identical
  groups in sync; `generate-routing-surfaces.js --check` 24/24 surfaces; `test-issue-1046` 171
  passed; `test-issue-1051` 53 passed; four edition walkthroughs all passed; kernel conformance
  239, finalize-door 871 and claim-hardening 953 assertions.
- Mission ledger `kaola-workflow/.ledger/issue-1120.jsonl`: all four missions `done`.

## Known Failures / Unverified Scope

- Reviewer minor 1: 60 ambiguous shrink transitions of the form `[X, D, Y] -> [D, D]` can be
  refused although a second reading of the same bytes is a real terminal renumber. The write is
  ambiguous and the reviewer explicitly did not require a pre-merge fix.
- Reviewer minor 2: when an insertion lands in front of duplicate lines, a renumber message can
  name the wrong position; refusals are correct and only the message is affected.
- No release preparation, tag, or installer step was performed; the Host owns that sequence.
- The accepted minor cases above are documented in the final review, not hidden as passing
  coverage.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- CHANGELOG.md
- README.md
- docs/api.md
- docs/decisions/0027-the-mission-ledger.md
- hooks/kaola-workflow-compact-recovery.md
- package.json
- plugins/kaola-workflow-gitea/hooks/kaola-workflow-codex-compact-recovery.md
- plugins/kaola-workflow-gitea/hooks/kaola-workflow-compact-recovery.md
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/hooks/kaola-workflow-codex-compact-recovery.md
- plugins/kaola-workflow-gitlab/hooks/kaola-workflow-compact-recovery.md
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/hooks/kaola-workflow-codex-compact-recovery.md
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js
- scripts/kaola-workflow-adaptive-schema.js
- scripts/kaola-workflow-claim.js
- scripts/test-install-model-rendering.js
- scripts/test-issue-1087-lane-a.js
- scripts/test-issue-1101-claude-agent-migration.js
- scripts/test-issue-1101-codex-agent-migration.js
- scripts/test-issue-1120-ledger-handover.js
- templates/global/kaola-workflow-global.md
- templates/routing/required-blocks.js

## Follow-Up Items

- No follow-up issue was filed for the two reviewer minors: both are documented in
  `.kaola/review-1120-round5.md`, the reviewer marked them as not blocking merge, and no code
  change is required for the accepted behaviour. The Host owns the post-merge release sequence.
- No unresolved implementation work remains for #1120.

## Closure Decision

Merge sink closes `KaolaBrother/Kaola-Workflow#1120` with a completion-evidence comment; no
keep-open decision. The run folder is archived to `kaola-workflow/archive/bundle-1120/` and the
child worktree/branch are cleaned up by the sink/finalize contract.

## Status

ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-1120/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-1120/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-1120/finalization-summary.md
- kaola-workflow/archive/bundle-1120/mission-ledger.jsonl
- kaola-workflow/archive/bundle-1120/workflow-state.md

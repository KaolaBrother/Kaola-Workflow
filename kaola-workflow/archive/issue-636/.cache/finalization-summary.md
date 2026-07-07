# Finalization Summary — issue-636 (cross-runtime dispatch-pin single-sourcing)

Closes: #636 (completes #627's descoped fix#2). Single-issue adaptive BUILD run — the first build off the
2026-07-08 routing-generation-seam shaping design.

## Path

`workflow_path: adaptive`. 6-node DAG: n1-plan (planner opus — verified edit map) → n2-fence (implementer,
one builder, 12 files, one serialized cross-edition write frontier) → n3-review (code-reviewer, fable) →
{n4-adversary (adversarial-verifier, fable, change-gate) ∥ n5-docs (doc-updater)} → n6-finalize.
(n4∥n5 serialized at runtime by the running-set `write_awaits_drain` fence — read drains before the docs write opens.)

## What shipped

Fence the Codex-dispatch block out of the 3 Claude plan-run commands + the Teammate-Mode block out of the 3
Codex plan-run SKILLs, relocating every contract assertion to the surface each token still lives on:
T5b→SKILL-only, T14→command-only (test-route-reachability.js); delete command-side T5b, #606→command-only,
**#611-fork→SKILL-only** across the four validate-*-contracts.js + the byte mirror (gitlab/gitea shared loops
split three ways). Two PIN markers (teammate-mode / codex-dispatch) added. gitea/gitlab mr|pr) pins untouched.
D-636-01 ADR. CHANGELOG entry.

## Two real defects caught before shipping (design de-risking paid off)

1. **The #611-fork four-chain-red hole** — the shaping run's adversary proved n3's first-draft relocation map
   omitted the #611-fork SKILL-only shrink → would red all four chains. n1-plan's verified map + n2-fence
   applied it in all four validators; n3-review + n4-adversary both independently confirmed no command-surface
   assertion of the #611-fork tokens survives.
2. **The forge two-splice drift** — n1-plan caught that the always-live base-dispatch sentence is *fused into
   the Codex-dispatch block start* on the two forge commands (a splice the design doc glossed), so the github
   command and forge commands need DIFFERENT fence boundaries. n2-fence handled per-file; n4-adversary confirmed
   the fused sentence survived on gitlab AND gitea.

## Gates

- n3-review (code-reviewer, fable): verdict pass, 0 findings (all severities). Orphaned-assertion sweep clean;
  #611-fork shrink in all 4 validators; byte mirror intact; mr|pr pins untouched; ran the full four-chain suite green.
- n4-adversary (adversarial-verifier, fable, CHANGE-GATE): verdict pass, 0 blocking. Executed the shaping
  adversary's specific four-chain-red scenario + 4 more attacks; NOT-REFUTED; repo tree hash identical (wrote nothing).
- Script-enforced gates (final committed tree): --resume-check pass, --gate-verify pass, --barrier-check pass
  (0 errors/unattributed), --verdict-check pass (n3 + n4 both verdict:pass; n4 change-gate covered).
- --finalize-check (chain-receipt, UNWAIVED): pass — all four chains genuinely green, no waiver (#635 fixed).

## Run gaps

None. gap-sweep empty (0 swept classes) — no in_run_repair (both gates passed first-try, no reopen), no
deferred_red_chain (unwaived receipt). The design's three shaping-run findings (R1/R2/R3) were folded into the
design doc during the shaping run, not deferred; #636 shipped complete against §Build Run 1.

## Implementation commits

- `fix(routing): #636 single-source cross-runtime dispatch pins (completes #627 fix#2)` — the 12 impl files +
  D-636-01 + CHANGELOG (main-session-authored; no lane-group legs in a single-builder plan).

## Goal attestation

`KAOLA_GOAL` set. `goal_check: satisfied`.

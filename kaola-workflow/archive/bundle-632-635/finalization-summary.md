# Finalization Summary — bundle-632-635

Closes: #632, #635 (all-or-nothing bundle closure)

## Path

`workflow_path: adaptive`. 6-node DAG with a parallel_safe write LANE GROUP: n1-release-greenness
(tdd-guide — #632, release.js family) ∥ n2-runchains-flake (implementer — #635, test-run-chains.js) as
isolated legs → n3-review (code-reviewer, reasoning) → {n4-adversary (adversarial-verifier, reasoning)
‖ n5-docs (doc-updater)} → n6-finalize. First lane-group run since the #633 tracked-evidence-seeding fix.

## What shipped

- **#632** — `chainReceiptGreenness` fail-open on empty/missing `chains[]` closed with a `chains_empty`
  guard (precedence `chains_unverified > chains_stale > chains_empty > chains_red`, mirroring #618),
  across all four release.js editions; stale `--cut` comment corrected (value-call: `--cut` stays
  informational-only). ADR: `docs/decisions/D-632-01.md`.
- **#635** — the load-sensitive signal-death test flake (T26/T27/T28 raced a real SIGKILL vs the runner's
  timer) made DETERMINISTIC via an in-process seam (monkey-patched spawn returns a canned signal-death
  for a sentinel command; no racing subprocess), one real-subprocess case kept with a class-only
  exitCode===1 assertion. run-chains.js signal→exitCode mapping (the #618 fix) untouched.

## Two production validations landed in this bundle

1. **#633 lane-group fix VALIDATED in production.** The n1∥n2 legs merged via the synthesizer to
   `barrier: group_passed, synthesized: true` with NO merge conflict and NO manual pre-seed — the
   untracked-vs-tracked evidence-file collision I manually worked around in bundles 617-618/625-626 is
   structurally gone. The `kw-stub:` commit (4614fbf2, tracked evidence stubs seeded before the legs
   branch) is the #633 mechanism working as designed.
2. **#635 flake FIXED — first UNWAIVED four-chain receipt of the session.** All four chains
   (claude/codex/gitlab/gitea) exit 0, accepted_red=false — NO `--accept-known-red …:635` waiver. The
   claude chain's `test-run-chains.js` (146 assertions) now passes deterministically. Every prior bundle
   this session required a `:635` waiver; from now on, runs should get clean unwaived receipts.

## Gates

- n3-review (code-reviewer, model=fable): verdict pass, 0 blocking. Confirmed #632 fail-closed +
  precedence + edition parity, #635 scope guard (run-chains.js untouched), and got the unwaived four-chain
  green. 1 LOW non-blocking finding (R1, latent silent-pass IIFE, no trigger).
- n4-adversary (adversarial-verifier, model=fable): verdict pass, 0 blocking. Calibrated the load rig
  (pre-fix harness flakes 4/6 under 80 stress workers), then 22 post-fix runs (19 under heavy load) all
  identical-green (146 assertions) — the flake is structurally gone (~6e-10 chance if still flaky).
  #632 fail-closed on all 19 adversarial receipt shapes with precedence preserved. 1 LOW pre-existing
  finding (A1, `chains:[null]` TypeError — a crash not a false-green, action=none).
- Script-enforced gates (final committed tree, headSha 755f5757): --resume-check pass, --gate-verify pass,
  --barrier-check pass (0 errors/unattributed), --verdict-check pass (n3+n4 both verdict:pass).
- --finalize-check (chain-receipt, UNWAIVED): pass — all four chains genuinely green.

## Run gaps

None. gap-sweep is empty (0 swept classes) — no deferred_red_chain (unwaived receipt), no in_run_repair.
R1/A1 are LOW non-blocking cosmetic/pre-existing findings recorded above as noise; no follow-up filed.

## Implementation commits

- `e6b2cebd` / `9c434361` (lane-group legs) + `cfd7b0de` (kw-synth octopus merge) — the #632/#635 code +
  tests, committed by the lane-group synthesizer.
- `755f5757` — `docs: D-632-01 ADR + CHANGELOG` (main-session authored — the only serial docs commit
  needed, since the lane-group legs already committed the code).

## Goal attestation

`KAOLA_GOAL` reflects the standing session goal — `goal_check: satisfied` expected.

# Finalization Summary — bundle-629-637 (#629 edition-guard net + #637 fn-closure-audit hardening)

Closes: #629, #637 (all-or-nothing bundle closure). Two small cross-edition hardening audit follow-ups,
run as a parallel-safe lane group.

## Path

`workflow_path: adaptive`. 6-node DAG with a 2-write-leg LANE GROUP: n1-guards (tdd-guide, #629,
validate-script-sync.js + edition-sync.js + their 2 tests) ∥ n2-manifest (tdd-guide, #637,
required-blocks.js + test-route-reachability.js) — exact-file-disjoint legs → n3-review (code-reviewer
fable) → {n4-adversary (adversarial-verifier fable, change-gate) ∥ n5-docs (doc-updater)} → n6-finalize.

## What shipped

**#629 — three edition-guard blind spots** (RED-first per bullet): (1) `HOOKS_JSON_FAMILY` (root+gitlab+gitea,
normalized by `normalizeHooksJson`) so `hooks/hooks.json` parity is checked (was excluded); (2) the
`config/agents.toml` triple added to `BYTE_IDENTICAL_GROUPS`; (3) `edition-sync.js` `runWrite()` steps (b)/(c)
create-on-missing via `syncIfDrift` (dropped the `existsSync` skip). Shared `checkNormalizedFamily`/
`checkByteIdenticalGroup` primitives = behavior-preserving refactors. No data-file writes.

**#637 — fn-closure-audit vacuous-guard fix:** added `sink_incomplete` as a distinctive interior content_token
(present on all 6 finalize surfaces, not a marker substring) + a red-proof that a marker-preserving interior
gut reds the manifest checker. A closed loop — surfaced by #630's own change-gate adversary.

## Production validation

**#633 lane-group fix re-validated (4th clean group this session).** n1∥n2 legs octopus-merged (kw-synth
`f5c502a6`) to `group_passed, synthesized:true` with NO manual pre-seed (exact-file-disjoint, clean merge).

## Gates

- n3-review (code-reviewer, fable): verdict pass, 0 findings. Ran the FULL four npm chains green; verified the
  new guards non-vacuous, the shared-primitive refactor behavior-preserving line-by-line, sink_incomplete on all 6.
- n4-adversary (adversarial-verifier, fable, CHANGE-gate): verdict pass, 0 blocking. 7 live plants ALL correct
  (repo byte-clean, 12 hashes match baseline): every guard bites on real drift (incl. the over-normalization
  probe + create-on-missing on both steps); #637 token reds the exact historic vacuous-gut. 2 pre-existing
  non-blocking findings (R1 edition-sync --check asymmetry → filed #638; R2 checkManifest whole-file scoping → noise).
- Script-enforced gates (final tree): --resume-check pass, --gate-verify pass, --barrier-check pass
  (0 errors/unattributed), --verdict-check pass (n3 + n4 both verdict:pass).
- --finalize-check (chain-receipt, UNWAIVED): pass — all four chains genuinely green, no waiver (#635 fixed).

## Run gaps

- **R1 (n4-adversary, pre-existing) → `filed: #638`.** `edition-sync --check` (runCheck) covers only
  GENERATED_AGGREGATORS, staying green on a missing COMMON/byte-group mirror; validate-script-sync covers those
  in-chain so the enrollment loop is fail-closed end-to-end — a pre-existing --check/--write asymmetry, filed as
  a low follow-up.
- **R2 (checkManifest whole-file token scoping) → `noise`.** Pre-existing checker design; equivalence to
  block-interior holds for fn-closure-audit today (all sink_incomplete occurrences sit inside the closure-audit
  region). Not a #637 defect.
- **n3 R0 → `noise`** (clean-review-no-defects). No in_run_repair, no deferred_red_chain.

## Implementation commit

- `fix: #629 edition-guard net + #637 fn-closure-audit manifest hardening` — the 6 impl/test files + 2 ADRs +
  CHANGELOG. Lane-group legs committed via the synthesizer; the ADRs+CHANGELOG main-session-authored at finalize.

## Goal attestation

`KAOLA_GOAL` set. `goal_check: satisfied`.

evidence-binding: n5-code-review 5b2d537a2a9b
verdict: pass
findings_blocking: 0
delegation_outcome: interrupted_obsolete
local_execution: local-fallback-explicit
consent_gate: operator-authorized inline review; consent halt written and cleared
upstream_read: n4-inherit-runtime-and-profiles 6e72dfeafd7e

# Code Review — issue #687 accumulated n4 diff

## Summary

APPROVE. The complete 91-path candidate implements Codex parent-session model/effort inheritance while retaining declarative tier metadata, safe legacy-profile migration, bounded fail-closed session proof, and unchanged Claude/opencode mappings. The R13 repair closes the sole remaining review finding without regressing R1-R12.

## Findings

- No CRITICAL, HIGH, MEDIUM, or LOW issue remains open.
- R1 resolved: fresh proof reaches immediate `open-ready` cards and is not persisted in running-set state.
- R2 resolved: discovery is bounded by file, depth, directory, entry, prefix, and candidate-size ceilings.
- R3 resolved: fully read unrelated malformed/unclassified rollouts remain ignorable; a bound malformed candidate fails closed.
- R4 resolved: serialized proof descriptors expose only the minimum status/model/effort payload.
- R5/R9 resolved: retired static-pin comments and labels are absent from executable and test-facing surfaces.
- R6 resolved: one `O_NOFOLLOW|O_NONBLOCK` descriptor is retained through classification and full read; pathname replacement cannot redirect the proof.
- R7 resolved: every explicit traversal/prefix exhaustion path makes discovery incomplete.
- R8 resolved: exact historical pairs migrate only when no other schema error exists; mixed invalid profiles remain malformed.
- R10 resolved: BigInt device/inode/type/size/ctime/mtime lifecycle snapshots reject equal-size in-place mutation.
- R11 resolved: candidate open, fstat, and prefix-read failures invalidate discovery.
- R12 resolved: only a non-empty string session ID classifies a bounded prefix; truncated unclassified metadata fails closed.
- R13 resolved: when a Dirent-classified regular JSONL opens and fstats as non-regular, `scanComplete=false` and the scan exits. The descriptor still closes in `finally`; a deterministic regular-to-directory fixture proves the transition returns `status:"absent"` rather than hiding a duplicate binding.

## Scope and Contract Checks

- All 48 role profiles omit executable `model` and `model_reasoning_effort` keys; each of the three trees contains 16 roles and same-role triples remain byte-identical.
- Exact legacy pins are stale/migratable; partial, repeated, empty, wrong-role, or illegal pins remain malformed. Root-level user-owned dispatch posture is not rewritten.
- Tier and legacy-alias parsing remains declarative and wait-budget-derived. Codex cards source runtime values from the parent session; Claude and opencode mappings remain unchanged.
- The reasoning floor requires a fresh current-session `gpt-5.6-sol/xhigh`-or-higher proof and refuses missing, stale, sub-floor, or unclassified posture.
- All four resolver copies are byte-identical at SHA-256 `d6f00f059bc160a93659cd3386605293d3b73d08c1b12ebb6152ace9246e4cd7`.
- The adaptive writer barrier accepted the accumulated diff against the original reused baseline; no product path is outside n4's frozen write set.

## Inline Validation

- PASS `node scripts/test-agent-model-resolver.js`.
- PASS `node scripts/test-agent-profile-parity.js` (215 assertions).
- PASS `node scripts/test-install-model-rendering.js`.
- PASS `node scripts/test-next-action.js` (122 assertions).
- PASS `node scripts/test-adaptive-node.js` (2,169 assertions).
- PASS `node scripts/test-adaptive-handoff.js` (153 assertions).
- PASS `node scripts/test-route-reachability.js` (575 assertions).
- PASS root, GitLab, and Gitea contract validators.
- PASS `node scripts/edition-sync.js --check` (10 forge ports, 24 common mirrors, 27 byte-identical groups).
- PASS `node scripts/generate-routing-surfaces.js --check` (12 surfaces).
- PASS `git diff --check`.
- The refreshed n4 receipt records fresh sequential PASS results for the Claude, Codex, GitLab, and Gitea npm chains after R13.

## Verdict

PASS — no blocking finding remains. The next gate is the scratch-only live parent/child inheritance proof.

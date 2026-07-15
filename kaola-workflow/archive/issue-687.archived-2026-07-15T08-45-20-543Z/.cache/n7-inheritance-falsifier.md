evidence-binding: n7-inheritance-falsifier bc14f1f75cd9
verdict: pass
local_execution: local-fallback-explicit
consent_gate: operator-authorized inline falsification; consent halt written and cleared
upstream_read: n6-live-child-inheritance-proof 12c1b2a20bad

# Inheritance falsification report

## Claim tested

Every shipped Codex role profile inherits the current parent session model and reasoning effort; `reasoning` and `standard` remain declarative tier/wait-budget metadata; legacy or malformed installed pins cannot silently restore tier-selected runtime strength; the reasoning floor remains fail-closed.

## Counterexample search

- Remaining source pin: none. Mechanical search found zero top-level `model` or `model_reasoning_effort` keys across all 48 profiles.
- Edition drift: none. Same-role profile triples and the four resolver copies are byte-identical; edition sync passed all registered groups.
- Role-class runtime branch: none. Both tier classes produce null Codex pair values sourced from `parent_session`; only wait budgets differ (`reasoning=40`, `standard=20`).
- Transient override: none. The live n6 spawn input omitted both fields; routing reachability also pins omission for v1/v2 role dispatch.
- Candidate-profile substitution: none. n6 bound the child to the candidate `code-explorer` profile by exact symlink target/hash, role/nickname, and embedded unique developer instructions.
- Stale installed-profile acceptance: none. The negative matrix below refused every perturbation before repair.
- Card/prose restoration of static strength: none. Routing generation, required-token checks, negative phrase audits, and contract validators passed.
- Claude/opencode regression: none found. Their tier mappings remain independent of the Codex inheritance fields and the refreshed cross-edition receipt is green.

## Out-of-repository legacy/malformed profile matrix

Each case began from a freshly installed candidate profile, altered only the installed `implementer.toml`, ran read-only preflight, default autofix, and a second read-only preflight, then counted remaining pins.

| Perturbation | Initial refusal | Autofix | Second preflight | Remaining pins |
|--------------|-----------------|---------|------------------|----------------|
| model only | `profiles_malformed`, exit 1 | `status:ok`, `autofixed:true` | `status:ok`, `autofixed:false` | 0 |
| effort only | `profiles_malformed`, exit 1 | `status:ok`, `autofixed:true` | `status:ok`, `autofixed:false` | 0 |
| Sol/medium pair | `profiles_stale`, exit 1 | `status:ok`, `autofixed:true` | `status:ok`, `autofixed:false` | 0 |
| Sol/xhigh pair | `profiles_stale`, exit 1 | `status:ok`, `autofixed:true` | `status:ok`, `autofixed:false` | 0 |

The partial cases are deliberately classified more strictly as malformed while still reporting stale posture and offering the safe reinstall. Exact historical pairs take the migratable stale branch. All four converge idempotently on inherited omission without changing root-level user posture.

## Reasoning-floor falsification

| Proof posture | Result |
|---------------|--------|
| fresh current `gpt-5.6-sol/xhigh` | pass, floor `gpt-5.6-sol/xhigh` |
| fresh current `gpt-5.6-sol/high` | `reasoning_floor_violation` |
| absent proof | `reasoning_floor_proof_missing` |
| stale/wrong-thread proof | `reasoning_floor_proof_stale` |
| unknown model with `ultra` effort | `reasoning_floor_violation` |

Tier metadata alone therefore cannot satisfy the Codex reasoning floor, and a stronger-looking effort on an unclassified model is not guessed safe.

## Focused validation

- PASS `node scripts/test-agent-model-resolver.js`.
- PASS `node scripts/test-next-action.js` (122 assertions).
- PASS `node scripts/test-adaptive-node.js` (2,169 assertions).
- PASS `node scripts/test-agent-profile-parity.js` (215 assertions).
- PASS `node scripts/test-install-model-rendering.js`.
- PASS `node scripts/test-route-reachability.js` (575 assertions).
- PASS root, GitLab, and Gitea contract validators.
- PASS `node scripts/edition-sync.js --check` (10 forge ports, 24 common mirrors, 27 byte-identical groups).
- PASS `node scripts/generate-routing-surfaces.js --check` (12 surfaces).
- PASS `git diff --check`.
- PASS refreshed n4 sequential Claude, Codex, GitLab, and Gitea npm chains after R13.

## Cleanup

The out-of-repository negative-profile matrix and all scratch homes/projects were deleted after retaining the bounded status table above.

## Verdict

PASS — no counterexample survived. The inherited runtime pair, safe migration, declarative tier behavior, and fresh reasoning-floor proof invariant are ready for documentation.

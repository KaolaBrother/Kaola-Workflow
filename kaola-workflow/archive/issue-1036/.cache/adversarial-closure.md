# Adversarial closure receipt — PR #1038 R1

behavior: adversarial-verifier closure
profile: supplied adversarial verifier behavior contract v3
context: PR #1038 / Issue #1036 / prior finding R1
candidate: 0501f2527e04c1ecd896df418e50c97b279aa568
repair_base: febc1411772d08132316a969d2d0d3bda625cce2
prior_evidence: kaola-workflow/issue-1036/.cache/adversarial-verification.md

## Exact prior claim

At candidate febc1411772d08132316a969d2d0d3bda625cce2, PR #1038 faithfully implements the latest Issue #1036 correction: supported Cursor CLI named profiles remain valid; live Task enum authority makes named omit-model Path A conditional; Cloud/built-in-only Path B uses native types only as themselves with specific capability_gap for custody misses; already-present catalog is not misreported as install miss; Cloud boot-load remains unclaimed; and tests/docs cannot pass while contradicting those statements.

## Exact closure surface

Prior R1 only, repair delta `febc1411772d08132316a969d2d0d3bda625cce2..0501f2527e04c1ecd896df418e50c97b279aa568`, and `kaola-workflow/issue-1036/.cache/adversarial-verification.md`. No unrestricted whole-surface discovery was performed.

## Analytical result

**not_refuted** — the repair closes prior R1. The repaired oracle reads both generated Cursor command consumers, requires the built-in-only relation `omit-model → parent` and `not → profile pin`, and its mutation fixture reverses the actual adapter authority before running the real generator. Independent replay reproduced contradictory `workflow-next` and `kaola-workflow-finalize` bytes and the oracle rejected both for the intended semantic reason.

Execution succeeded. No repair-delta regression was demonstrated.

## Prior finding closure

finding: id=R1 scope=in_scope action=fix status=resolved severity=medium fix_role=tdd-guide rationale=repair now mutates the actual adapter, regenerates both shipped consumers, and rejects the reversed Path-B semantic relation

### R1 — resolved

- prior failure_class: test-to-claim gap / vacuous semantic assertion
- repair anchors: `scripts/test-cursor-edition.js:118`, `scripts/test-cursor-edition.js:142`, `scripts/test-cursor-edition.js:608`, `scripts/test-cursor-edition.js:623`
- repair proof:
  1. `pathBRelations()` parses the semantic relation from lines containing both `built-in-only` and `omit-model`; it records the positive and negative objects rather than merely looking for nearby words.
  2. `inspectPathBConsumers()` reads `.cursor/commands/workflow-next.md` and `.cursor/commands/kaola-workflow-finalize.md`, requires exactly one relation in each, and accepts only `positive === "parent"` plus `negative === "profile pin"`.
  3. The normal G2 path invokes that oracle against the actual generated tree.
  4. The mutation fixture copies the real `scripts`, `agents`, `commands`, `hooks`, and `templates` source trees into a scratch root; parses `templates/agents/runtime-capabilities.json`; selects `runtimes.cursor.capabilities.delegation_guidance.dispatch_carrier`; reverses only the actual parent/not-profile predicate; invokes scratch `sync-cursor-edition.js --write`; checks the reversal reached both generated consumers; then invokes the same test file with `--path-b-oracle` and requires a nonzero result naming both consumers.
  5. The prior dead-residue assertions against exported `CURSOR_MODEL_DISPATCH_BLOCK` were removed. The only remaining test reference is an explanatory comment that the residue would not observe the repaired path.
- independent counterexample replay:
  - Created an isolated archive of repair commit `0501f2527e04c1ecd896df418e50c97b279aa568`.
  - Replaced the adapter relation `omit-model is the parent, not a profile pin` with `omit-model is the profile pin, not the parent`, preserving the nearby host-split, install-miss, and model-lever phrases.
  - Ran the real Cursor generator. Both generated consumers contained the reversed relation at line 20.
  - Ran `node scripts/test-cursor-edition.js --path-b-oracle`; it exited 1 with:
    - `PATH-B-ORACLE RED: workflow-next:20: expected omit-model → parent and not → profile pin; got omit-model → "profile pin" and not → "parent"`
    - `PATH-B-ORACLE RED: kaola-workflow-finalize:20: expected omit-model → parent and not → profile pin; got omit-model → "profile pin" and not → "parent"`
- status: resolved

## Repair-delta regression sweep

The repair delta changes only:

- `scripts/test-cursor-edition.js`
- `scripts/test-install-model-rendering.js`

Inspected the complete delta. The Cursor repair is bounded to a generated-byte Path B oracle and its scratch mutation fixture. The install-model-rendering changes remove a suite-global Codex version default, apply explicit attestation only where intended, and add a hermetic no-override probe. Both modified focused suites passed. `git diff --check` passed. No repair-delta regression was demonstrated.

## Commands and observed results

- `git status --short && git rev-parse HEAD && git diff --stat febc1411..0501f252 && git diff --name-status febc1411..0501f252`
  - clean repair worktree; HEAD `0501f2527e04c1ecd896df418e50c97b279aa568`; exactly two modified test files in the repair delta.
- complete focused `git diff` plus `rg`/`nl` inspection of the repair anchors
  - confirmed actual adapter selection, generator execution, both consumer checks, and removal of dead-residue assertions.
- `node scripts/test-cursor-edition.js`
  - exit 0; `cursor-edition test passed (854 assertions)` with all three generated forge trees in parity.
- isolated replay: `git archive 0501f252...`, actual adapter predicate reversal, `node scripts/sync-cursor-edition.js --write`
  - generator exited 0; both generated consumers contained the opposite profile-pin/not-parent relation.
- `node scripts/test-cursor-edition.js --path-b-oracle` in the isolated replay
  - exit 1; named both contradictory consumers and the exact reversed positive/negative relation.
- `node scripts/test-install-model-rendering.js`
  - exit 0; `Install model rendering tests passed`.
- `git diff --check febc1411..0501f252`
  - exit 0; no whitespace errors.
- final `git status --short`
  - no tracked worktree edits.

## Confidence

High. The prior counterexample was replayed independently against the repair commit, reached both generated shipping surfaces through the real production generator, and was rejected with relation-specific diagnostics. The entire repair delta and both modified focused suites were inspected.

verdict: pass
findings_blocking: 0

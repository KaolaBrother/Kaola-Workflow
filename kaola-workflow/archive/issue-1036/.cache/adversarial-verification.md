# Adversarial verification receipt — PR #1038

behavior: adversarial-verifier
profile: supplied adversarial verifier behavior contract v3
context: PR #1038 / Issue #1036
candidate: febc1411772d08132316a969d2d0d3bda625cce2
base: a6d49c112581b49a151700c49c60971df411ec3e

## Exact claim

At candidate febc1411772d08132316a969d2d0d3bda625cce2, PR #1038 faithfully implements the latest Issue #1036 correction: supported Cursor CLI named profiles remain valid; live Task enum authority makes named omit-model Path A conditional; Cloud/built-in-only Path B uses native types only as themselves with specific capability_gap for custody misses; already-present catalog is not misreported as install miss; Cloud boot-load remains unclaimed; and tests/docs cannot pass while contradicting those statements.

## Exact surface

The full PR diff from base a6d49c112581b49a151700c49c60971df411ec3e in /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1036, including templates/agents/runtime-capabilities.json, scripts/sync-cursor-edition.js, generated consumers, related tests, and user-facing docs.

## Analytical result

**refuted** — the candidate prose and generated production consumers currently express the requested host split, but the claim also says the tests cannot pass while contradicting it. A concrete semantic-reversal mutation generated contradictory `workflow-next` and `kaola-workflow-finalize` consumers and still passed the focused Cursor suite with 847 assertions.

Execution succeeded for the falsification. One additional architecture-suite execution in a history-free archive reported two baseline-fixture loading failures; that execution problem is recorded separately and was not used as analytical indeterminate evidence.

## Canonical findings

finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=phrase-presence assertions accept a generated Path-B semantic reversal, disproving the claimed contradiction resistance

### R1 — Cursor acceptance assertions permit the opposite Path B omit-model behavior

- failure_class: test-to-claim gap / vacuous semantic assertion
- trigger components: `templates/agents/runtime-capabilities.json` Cursor `dispatch_carrier`; `scripts/test-cursor-edition.js` G2 assertions; `scripts/test-runtime-agent-architecture.js` Cursor need classifier and catalog-miss mutation
- primary anchor: `scripts/test-cursor-edition.js:532`
- secondary anchors: `scripts/test-runtime-agent-architecture.js:474`, `scripts/test-runtime-agent-architecture.js:1653`, `templates/agents/runtime-capabilities.json:316`
- proof:
  1. In an isolated archive of candidate `febc1411772d08132316a969d2d0d3bda625cce2`, changed only the Cursor `dispatch_carrier` sentence from “When the live enum is built-in-only, omit-model is the parent, not a profile pin” to the semantic opposite: “omit-model is the profile pin, not the parent.”
  2. Regenerated the Cursor edition. Both generated consumers contained the contradiction at line 20:
     - `.cursor/commands/workflow-next.md`: `When the live enum is built-in-only, omit-model is the profile pin, not the parent`
     - `.cursor/commands/kaola-workflow-finalize.md`: same contradiction
  3. `node scripts/test-cursor-edition.js` nevertheless exited 0: `cursor-edition test passed (847 assertions)`.
  4. The gap is structural. G2 checks only independent phrases such as `omit a requested per-call model only when`, `capability_gap, not an install miss`, and `resolver-listed model slug`; it has no assertion rejecting the opposite built-in-only omit-model meaning. The architecture classifier has the same phrase-presence shape. Its catalog-miss mutation removes only the install-miss phrase and does not mutate the omit-model parent/profile predicate.
  5. `CURSOR_MODEL_DISPATCH_BLOCK` assertions at `scripts/test-cursor-edition.js:545` inspect an exported residue that `transformCommandBody()` does not consume; they cannot close the generated-consumer gap.
- severity: medium — current shipped prose is correct, but the claimed regression oracle is false and can allow a future generator/authority regression to ship.
- scope: in_scope; candidate-added acceptance assertions and the generated consumers named by the dispatched surface.
- action: add a behavioral/mutation assertion that reverses the built-in-only parent/profile predicate in the actual adapter authority, regenerates both consumers, and requires failure; assert absence of contradictory Path B statements, not only presence of nearby keywords. Remove or reconnect dead-residue assertions so acceptance follows the bytes that ship.
- status: open
- fix_role: tdd-guide

## Material counterexample frontier attempted

1. **Candidate and scope identity**
   - Confirmed worktree HEAD equals the supplied candidate.
   - Confirmed PR #1038 base/head from the forge are exactly the supplied base and candidate.
   - Enumerated all 13 changed files and read the full code/test/documentation diff relevant to the claim.

2. **Latest Issue correction vs candidate**
   - Read Issue #1036 and all later comments. The latest correction keeps family-level `named_roles: true` for supported CLI profiles, makes the live enum authoritative, uses built-ins only as themselves on Cloud catalog miss, requires item-specific `capability_gap` for custody misses, distinguishes already-present from install miss, and explicitly leaves Cloud boot-load unclaimed.
   - Compared those points to the Cursor adapter authority and current rendered next/finalize consumers. No shipped-text counterexample was demonstrated: named CLI profiles remain represented; named omit-model is conditional; built-ins retain their identities; custody misses inline with a specific gap; already-present plus built-in-only is a gap rather than an install request; Cloud boot-load is explicitly disclaimed.

3. **Generated-consumer read path**
   - Rendered `workflow-next` and `kaola-workflow-finalize` directly through `sync-cursor-edition.js` without modifying the candidate worktree.
   - Confirmed both consume the adapter guidance through `replaceRuntimeDelegationGuidance()` and that finalize's named-role cards are rewritten conditionally.
   - Found that `CURSOR_MODEL_DISPATCH_BLOCK` is exported/tested but not consumed by `transformCommandBody()`; this became supporting proof for R1 rather than a second root cause.

4. **Concrete contradiction mutation**
   - Mutated only an isolated `/tmp` archive, never the candidate worktree.
   - Reversed the catalog-miss omit-model semantic predicate while preserving surrounding keywords.
   - Regenerated Cursor consumers and observed the contradictory bytes.
   - Ran the focused Cursor suite; it passed all 847 assertions. This concretely refutes the final conjunct of the claim.

5. **Boundary, invalid-state, error-path, persistence, concurrency, callers/consumers**
   - Boundary: Path A with a live Kaola name vs Path B with a built-in-only enum is expressly split in adapter, generated consumers, and docs.
   - Invalid state: already-present files plus missing live names routes to `capability_gap`, not named dispatch or reinstall.
   - Error path: `Invalid enum value` guidance uses reported built-ins as themselves or inlines with a gap; it does not costume `generalPurpose`.
   - Persistence/load: same-process Cloud refresh failure is stated; consumer boot-load remains explicitly unknown/unclaimed.
   - Concurrency/nesting: no change in this PR claims additional Cloud boot-load, nesting, or catalog behavior; CLI parallel/direct-child facts remain host-scoped.
   - Callers/consumers: both generated next and finalize surfaces were inspected; the mutation reached both and escaped the focused test oracle.
   - Documentation contradictions: searched all changed user-facing documentation for the claim predicates. No concrete contradiction was found in candidate prose; all pages preserve the host split and boot-load disclaimer. The refutation is the demonstrated ability of tests to pass a contradictory generated consumer.

## Commands and observed results

- `git status --short && git rev-parse HEAD && git diff --stat ... && git diff --name-status ...`
  - clean candidate worktree; HEAD `febc1411772d08132316a969d2d0d3bda625cce2`; 13 changed files.
- `gh issue view 1036 --repo KaolaBrother/Kaola-Workflow --comments --json ...`
  - obtained filing plus latest measured-correction comment.
- `gh pr view 1038 --repo KaolaBrother/Kaola-Workflow --json ...`
  - base/head matched supplied identities; PR remained open.
- focused `git diff`, `sed`, `rg`, and direct `renderCommand(...)` reads
  - current candidate render matched the intended host-split statements.
- isolated mutation setup: `git archive febc141... | tar -x -C /tmp/kw-pr1038-mut.vU6EKW`
  - created a history-free candidate copy outside the worktree.
- isolated mutation: reversed built-in-only omit-model from parent to profile pin in `templates/agents/runtime-capabilities.json`
  - mutation reached both generated command consumers.
- `node scripts/sync-cursor-edition.js --write && node scripts/test-cursor-edition.js` in the isolated mutation copy
  - exit 0; `cursor-edition test passed (847 assertions)` despite contradictory generated consumers.
- `node scripts/test-runtime-agent-architecture.js` in the history-free mutation copy
  - execution problem: 700 assertions passed, but suite exited nonzero on two unrelated released-template fixture loads because `git archive` contains no historical commit objects (`A3[released-template]`, `A3[v9-exact]`). This is not an analytical indeterminate and is not counted as a finding.

## Confidence

High. The refutation is a reproduced, exact-candidate, generated-consumer mutation with a zero-exit focused suite. Uncertainty about the history-dependent architecture fixture does not affect the counterexample.

verdict: fail
findings_blocking: 1

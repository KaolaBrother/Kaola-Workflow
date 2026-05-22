# advisor — issue-153 plan gate (2026-05-22)

## Verdict: APPROVE. Implementable; build sequence dependency-safe, write sets disjoint,
## parallelization correct. T1 vars + Agent(/) regex + managed-marker literal all verified.

## One plan-altering fix (T1 awk error propagation)
`awk '...' "$dest" > "$tmp"; mv "$tmp" "$dest"` — if awk fails, $tmp may be empty/partial and mv
clobbers $dest with it → installed agent becomes empty/invalid → silent badge regression that could
survive the test. Change to fail-fast:
```bash
awk '...' "$dest" > "$tmp" && mv "$tmp" "$dest" || { rm -f "$tmp"; echo "Failed to rewrite frontmatter: $dest" >&2; exit 1; }
```
Preserves the "install.sh aborts loudly" invariant.

## TDD procedural items (record in phase3-plan.md; Phase 4 must follow)
1. T2 BEFORE T1 in execution order: write F2 assertions first, run test, observe RED (installed agents
   still carry concrete model: sonnet|opus|haiku → /\bmodel:\s*inherit\b/ fails). Then implement T1.
   Re-run, observe GREEN. Proves the assertion discriminates, not passes by coincidence.
2. T3/T4/T5 negative-test the F3 guard: temporarily delete one model="{..._MODEL}" line from a command
   source (e.g. commands/kaola-workflow-phase2.md:90), run validator, confirm it FAILS with the expected
   "Agent( dispatch block at line N missing a model=" message, then restore. Proves the block-walk regex
   matches real dispatch syntax (guards against a silently-dead check).

## Non-blocking properties (record, no architect revision)
- Source agent with no model: line → awk no-op, resolver falls to default_agent_model (correct legacy);
  T2 correctly fails (malformed source flagged loudly). Desired property.
- Intentional re-install flow shift (cmp@281 never matches post-fix → always manifest path) → PR description.
- CHANGELOG [Unreleased] + README reinstall+restart note = Phase 6 doc-updater scope, NOT Phase 3 write set.

Proceed: write phase3-plan.md with the awk && fix + the two TDD items, then Phase 4.

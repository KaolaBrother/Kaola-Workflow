# Issue #1029 TDD RED record

## Assignment

Author the minimum test oracle for the settled `main-authored-handoff` contract. The oracle is
test-only; no routing skeleton, slot, renderer, or shipped surface was changed.

## Baseline

- Candidate worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1029`
- Baseline SHA: `89d171ef71c65b5d8841e98c9b48f7e52b10a41a`
- Baseline branch/status: `## workflow/issue-1029` (clean before the test edit)
- Settled wording read from:
  `/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/issue-1029/.cache/handoff-wording.md`

The clean baseline controls were re-run before editing the test artifact:

```text
$ node scripts/test-route-reachability.js
Route-reachability test passed (557 assertions).
exit code: 0

$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
exit code: 0
```

## Test artifact

Changed only:

- `templates/routing/required-blocks.js`

Added two required blocks:

- `nx-main-authored-handoff` on `next`;
- `fn-main-authored-handoff` on `finalize`.

Both entries use `runtime_tag: 'both'` and `surface_type_tag: 'both'`, and pin the settled marker
`<!-- PIN: main-authored-handoff -->` plus the distinctive interior wording
`Before each named-role spawn, main writes a compact task-specific brief`.

The existing `checkManifest` oracle in `scripts/test-route-reachability.js` derives the obligated
surface set from the routing registry and the five additive sync modules: three forges across the
Claude command lane, Codex skill lane, and opencode/Kimi/Grok/Cursor/ZCode command-lane renders.
That is 21 runtime/forge surfaces per topic and 42 surfaces for `next` plus `finalize`; additive
surfaces are read from the existing in-memory renderer map. No hand-typed surface list was added.

## RED run

Command, run against the unchanged production baseline after the manifest edit:

```text
$ node scripts/test-route-reachability.js
exit code: 1
```

Failure signature (the first failure names the new contract and the real shipped subject):

```text
FAIL: MANIFEST missing-token: block nx-main-authored-handoff token "<!-- PIN: main-authored-handoff -->" absent from commands/workflow-next.md
FAIL: MANIFEST missing-token: block nx-main-authored-handoff token "Before each named-role spawn, main writes a compact task-specific brief" absent from commands/workflow-next.md
...
FAIL: MANIFEST missing-token: block fn-main-authored-handoff token "<!-- PIN: main-authored-handoff -->" absent from commands/kaola-workflow-finalize.md
FAIL: MANIFEST missing-token: block fn-main-authored-handoff token "Before each named-role spawn, main writes a compact task-specific brief" absent from commands/kaola-workflow-finalize.md
...
Route-reachability test FAILED: 85 failure(s), 556 passed.
```

The 84 contract misses are the two pinned tokens across all 42 obligated surfaces. The additional
manifest summary assertion is the existing checker’s nonzero-failure report. This is a contract
assertion on absent shipped wording, not a syntax error, missing module, empty universe, or broken
pre-existing fixture.

Per the narrowed TDD mission, the later per-surface missing/hollow/reordered/drift mutation closure
was not added in this RED turn; it remains for the full oracle pass after the canonical slot and
rendered block exist.

## GREEN oracle migration (Phase A)

Phase A migrated the oracle against the current production candidate. Test-owned changes now land
only in:

- `scripts/test-route-reachability.js`
- `templates/routing/required-blocks.js`

The production slot remains the canonical expected byte source. The oracle extracts the unique
`main-authored-handoff` opening marker through its first matching close marker, then compares the
complete delimited block bytes on every derived consumer surface. The independent semantic pins
check the seven labels exactly once and in order; inherited-history independence; main's final-verdict
authority; profile authority; planner/code-architect, investigation, tdd-guide/implementer,
repair/docs/optimization, and reviewer/security/adversarial specializations; the sparse-packet rule;
and the non-machine-graded prompt plus four-field mission-list boundary.

The duplicate marker is now resolved by all manifest blocks whose derived file set contains the
observed surface. The legitimate `next`/`finalize` overlap is therefore accepted, while ambiguous
overlap and unowned markers still fail as orphan findings. T20 retains both heavy-reviewer routing
assertions, requires the shared reviewer specialization, and requires the obsolete reviewer-only
scope sentence to be absent.

Derived universe proved by the run:

- 7 runtimes: Claude, Codex, opencode, Kimi, Grok, Cursor, and ZCode;
- 3 forges: GitHub, GitLab, and Gitea;
- 2 topics: `next` and `finalize` only;
- 21 unique surfaces per topic: 3 tracked Claude commands + 3 tracked Codex skills + 15 additive
  command-lane renders;
- 42 unique surfaces total, all non-empty and independently read by the parity check.

Validation against the current production candidate (baseline SHA remains
`89d171ef71c65b5d8841e98c9b48f7e52b10a41a`):

```text
$ node scripts/test-route-reachability.js
Route-reachability test passed (567 assertions).
exit code: 0

$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
exit code: 0
```

Prior to Phase A, the route test had 24 failures / 554 passed: two obsolete T20 reviewer-sentence
assertions, 21 cross-topic `fn-main-authored-handoff` orphan findings caused by last-write-wins
marker resolution, and the existing manifest summary assertion. Phase A removes that seam without
weakening unrelated orphan detection.

Mutation closure status for this phase: 0 mutation legs executed, 0 non-noop controls, and 0 caught
mutants. The missing-complete-block, reordered-label, and one-byte-drift families are
intentionally deferred to the separate Phase-B mutation turn; this record makes no mutation-proof
claim for them yet.

## GREEN + mutation closure (Phase B)

Phase B adds only the deferred per-surface mutation closure inside the existing T21 real-run block
of `scripts/test-route-reachability.js`. The clean parity result is an explicit control before any
in-memory mutation is planted. No production, generated, routing, or manifest source was changed
in this phase; `templates/routing/required-blocks.js` remains unchanged.

The universe is still derived from the two existing required-block registry entries and the existing
`deriveObligated`/additive-renderer path:

- 2 topics: `next` and `finalize` only;
- 21 unique surfaces per topic: 3 tracked Claude commands + 3 tracked Codex skills + 15 additive
  command-lane renders;
- 42 unique obligated surfaces total, each independently targetable in the already-built surface
  map.

For each of those 42 targets, the oracle plants exactly three in-memory defects and runs the same
complete-block extraction, byte comparison, and semantic detector used by the real parity check:

| Mutation family | Plant | Legs | Non-noop controls | Caught target-only |
| --- | --- | ---: | ---: | ---: |
| Missing complete block | Remove the target's complete delimited block | 42 | 42 | 42 |
| Reordered labels | Swap the `Authority` and `Scope and custody` sections | 42 | 42 | 42 |
| One-byte wording drift | Change one ASCII byte (`brief` -> `brieF`) | 42 | 42 | 42 |
| **Total** | **42 targets x 3 families** | **126** | **126** | **126** |

Each leg asserts that the mutation changes bytes, then asserts that a failure names the mutated
target and that no unrelated surface fails. The exact counters are asserted by the test, so a
reduced or vacuous mutation universe cannot pass.

Validation from the candidate worktree:

```text
$ node scripts/test-route-reachability.js
Route-reachability test passed (823 assertions).
exit code: 0

$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
exit code: 0
```

The 823 assertions include the clean 42-surface parity control, 126 non-noop mutation controls,
126 target-only caught-mutant assertions, and the exact 126-leg/126-control/126-caught counter
assertions. No real spawn prompt is inspected or graded.

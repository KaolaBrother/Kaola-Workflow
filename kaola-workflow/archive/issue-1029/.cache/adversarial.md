evidence-binding: issue1029-adversarial 1029c0de0003

# Issue #1029 adversarial falsification record

behavior_contract_version: 3
behavior_contract_hash: 8db400bc449cc30799ac2ef89e9f1778aebd965ec524745c5c6c65019dd27db6
resolved_profile_hash: 9ff7f5d3f0598d7b0ca616e2322c3e5694ac5181d3bf02a975d49d552d1fac44
evidence_identity: issue1029-adversarial
candidate: /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1029
baseline: 89d171ef71c65b5d8841e98c9b48f7e52b10a41a

## Claim

The final #1029 candidate makes every supported `next`/`finalize` runtime/forge surface execute the same complete `main-authored-handoff` contract.

## Surface

Read-only verification surface: templates/routing/slots.js; next/finalize skeletons; scripts/generate-routing-surfaces.js and five additive renderers; the 12 changed tracked next/finalize surfaces; templates/routing/required-blocks.js; the T21 portion of scripts/test-route-reachability.js.

Excluded: init, profiles, state, docs/changelog, unrelated tests, installed trees, commits/pushes, issue/PR state, and releases.

## Execution status

Execution succeeded. The candidate remained at the dispatched baseline SHA. The worktree was dirty with the expected candidate files, so the SHA plus dirty delta—not the SHA alone—was treated as the candidate identity. No tracked file was mutated. The only write was this seeded evidence file.

## Independent derivation

1. `scripts/generate-routing-surfaces.js` owns three forges (`github`, `gitlab`, `gitea`), two tracked lanes (`command`, `skill`), and the topic basenames. Filtering its registry to `next` and `finalize` yielded 12 tracked rows: 3 forges x 2 lanes x 2 topics.
2. The supported additive runtime roster was derived from the five shipped renderer owners: `sync-opencode-edition.js`, `sync-kimi-edition.js`, `sync-grok-edition.js`, `sync-cursor-edition.js`, and `sync-zcode-edition.js`. Each exports the same forge axis through `runtime-edition-forge.js`, and each consumes the generator-owned command rows. This yielded 30 additive rows: 5 runtimes x 3 forges x 2 topics.
3. The combined universe was therefore 42 unique `(runtime, forge, topic)` triples and 42 unique consumer paths: 7 runtimes x 3 forges x 2 topics. The runtimes were Claude, Codex, opencode, Kimi, Grok, Cursor, and ZCode.
4. Both `next.skeleton.md` and `finalize.skeleton.md` contained exactly one `<!-- SLOT:main-authored-handoff -->` reference. A directive-stack scan placed both references at REGION depth zero, so neither can be filtered by runtime/forge rendering.
5. The canonical slot was one 3,043-byte delimited block with SHA-256 `c9b7a552b236db0badd35fa79eb134f2eaad46a2d43ec98adca08fc25b4813fc`. It was byte-identical to the independently frozen `handoff-wording.md` after excluding that file's terminal newline (frozen 3,044 bytes; contract block 3,043 bytes).
6. For every tracked final file and every additive final in-memory render, an independent extractor required exactly one opening marker, found the first matching closing marker, extracted the complete delimiters and interior, and compared the entire result byte-for-byte with the canonical slot. All 42 passed; no opening marker was missing or duplicated, no block was malformed/truncated, and no byte diverged.

## Commands and observed results

```text
$ git rev-parse HEAD
89d171ef71c65b5d8841e98c9b48f7e52b10a41a

$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
exit 0

$ node scripts/test-route-reachability.js
Route-reachability test passed (823 assertions).
exit 0

$ node scripts/test-generate-routing-surfaces.js
test-generate-routing-surfaces: all 434 assertions passed.
exit 0

$ git diff --check
exit 0
```

Independent read-only Node derivation and extraction result:

```text
forges=github,gitlab,gitea
runtimes=claude,codex,opencode,kimi,grok,cursor,zcode
tracked=12
additive=30
records=42
unique_runtime_forge_topic_triples=42
unique_paths=42
skeleton_refs=next:1@region-depth-0,finalize:1@region-depth-0
block_bytes=3043
block_sha256=c9b7a552b236db0badd35fa79eb134f2eaad46a2d43ec98adca08fc25b4813fc
missing_duplicate_malformed_truncated_or_divergent=0
mutation_legs=126
mutation_non_noop=126
mutation_target_only_caught=126
exit 0
```

Frozen-wording comparison:

```text
frozen_bytes=3044
frozen_terminal_newline=true
slot_bytes=3043
slot_equal_frozen_without_terminal_newline=true
```

## Attempted falsifiers

### Missing or stale tracked consumer

Read every generator-owned tracked `next`/`finalize` path from disk and ran the generator's byte-parity check over all 18 registered topic surfaces. No path was absent and no tracked render was stale. The independent extraction then checked the 12 in-claim tracked consumers, not merely the skeleton.

Result: no counterexample.

### Additive renderer drops, truncates, filters, or rewrites the block

Rendered all 30 additive consumers through each runtime owner's exported renderer and path builder. Because the skeleton references sit outside REGION directives, the block entered every renderer. Final consumer-byte extraction, after each renderer's transformations, matched the full canonical block on all 30.

Result: no counterexample.

### Duplicate or mismatched marker pair

Required exactly one `<!-- PIN: main-authored-handoff -->` on each final consumer, a reachable `<!-- /PIN -->`, and exact complete extracted bytes including both delimiters. This rejects missing openings, duplicate openings, missing closes, early closes, hollow blocks, and truncation. All 42 consumers passed.

Result: no counterexample.

### Hand-typed or self-shrinking universe

The T21 paths are derived from renderer-owned path builders, but that alone could shrink in lockstep. I therefore checked the independent anchors: the five additive runtime declarations must equal the shipped `sync-*-edition.js` module roster; all renderer owners export the generator-owned forge axis; T21 requires exactly 21 unique surfaces per topic and 42 total; the broader route suite contains a literal 21-per-topic floor; and `test-generate-routing-surfaces.js` independently requires 18 generator rows (3 topics x 2 lanes x 3 forges). Removing a runtime declaration while its generator remains, narrowing a topic/tag, removing a forge, duplicating a path, or yielding an empty set cannot preserve all these checks.

Result: no supported-surface escape was found.

### Canonical-source self-certification

T21 intentionally takes expected consumer bytes from `SLOTS['main-authored-handoff']`, the same authoring source used by the skeleton renderer. That parity alone would not establish that the source contains the settled complete wording. I challenged it independently in two ways: the slot exactly matched the separately frozen 3,043-byte contract, and the T21 semantic oracle independently requires the seven labels once and in order plus the inherited-history, final-authority, profile-authority, role-specialization, sparse-packet, non-machine-graded, and mission-list boundaries. The present candidate therefore does not rely on source-following parity alone for completeness.

Result: no current-candidate counterexample. A synchronized future edit to the canonical contract is an authoring-contract change, not an escaped or divergent supported consumer under this dispatched claim.

### Mutation closure and vacuity

Ran the real T21 42-target x 3-family closure as part of the 823-assertion route suite. Independently rebuilt the 42 final-consumer map and planted, target by target, (1) complete-block removal, (2) `Authority`/`Scope and custody` reordering, and (3) one-byte `brief` -> `brieF` drift. All 126 mutations changed bytes; the complete-block detector caught exactly the mutated target in all 126 legs and reported no unrelated consumer.

Result: 126 legs, 126 non-noop controls, 126 target-only catches; no vacuous green.

## Analytical result

not_refuted

The bounded falsification sweep established the supported universe from its source owners, read final consumer bytes rather than trusting declarations, independently anchored the complete canonical wording, and exercised every consumer under three targeted defect families. No supported `next`/`finalize` runtime/forge surface was missing, filtered, stale, malformed, truncated, duplicated, or byte-divergent.

Confidence: high.

verdict: pass
findings_blocking: 0

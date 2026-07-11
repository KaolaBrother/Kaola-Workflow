evidence-binding: n4-adversarial-membership-replay a13f9a7652f6
upstream_read: n3-review-bundle-contract aac646f8d545
upstream_read: n1-canonical-fanout-evidence 79e83c23ba85
upstream_read: n2-fence-parser-and-hermetic-fixtures 398b6320c00d
verdict: pass
findings_blocking: 0
candidate_boundary: a290dbce5bbd321c97390039b5a19e0eb579f66cfbc5d1334820b8c845ac1e12

# Adversarial falsification — refreshed membership and Node Briefs replay

## Claim under test

For issue #658 in bundle #658/#659/#660, a new explicit cardinality-1 adversarial-verifier fan-out is tallied from the exact frozen node ids sharing both fan-out label and sorted dependency origin. Runtime seed/dispatch needs only `kaola-workflow/<project>/.cache/<node-id>.md`; unrelated legacy role-prefix receipts and foreign or duplicate-looking files cannot enter a canonical tally. Missing, malformed, foreign-bound, duplicate-bound, or stale-bound member evidence and a one-pass/one-fail tie must fail closed. Reset/reopen must remove only the affected group's stale receipts, preserve independent-group evidence, and reseed fresh bindings without stale verdict bodies. The second-cycle fence-aware Node Briefs parser must not change any of these membership properties or let fenced ghost `###` briefs alter dispatch identity.

Relevant current surfaces:

- `scripts/kaola-workflow-plan-validator.js:644-662` — exact `(fanout label, sorted depends_on)` canonical group resolver.
- `scripts/kaola-workflow-plan-validator.js:1143-1200` — canonical path/binding/nonce checks and tie-to-refute tally.
- `scripts/kaola-workflow-plan-validator.js:1441-1471` — structured Node Briefs identity and fence-aware h3 parsing.
- `scripts/kaola-workflow-adaptive-node.js:3385-3399` — collective exact-group repair reset.
- `scripts/kaola-workflow-adaptive-node.js:3460-3490` — attributable canonical evidence cleanup.
- `scripts/kaola-workflow-adaptive-node.js:5223-5314` — runtime node-id seed and project-qualified dispatch path.

## Executable temporary-project disproof

I created and froze a real temporary git project with the shipped validator, then drove the shipped adaptive-node CLI. It contained two independent two-member groups with deliberately reused-looking ids and the same `fanout(reused-team)` label:

- origin `review-left`: `red-1`, `red-10`
- origin `review-right`: `red-1-copy`, `red-10-copy`

Each origin followed its own completed `tdd-guide -> code-reviewer` branch; all four members joined only at `finalize`.

The genuine `## Node Briefs` section was preceded internally by a five-backtick fenced ghost `### red-1-copy`, a shorter triple-backtick delimiter, a different-family tilde delimiter, and a five-backtick info-suffixed non-closer. A valid five-backtick closer preceded four genuine h3 briefs.

### Node Briefs/membership independence

- `parseNodeBriefs` returned exactly `[red-1, red-10, red-1-copy, red-10-copy]`; the fenced ghost was absent.
- Before freeze, `resolveAdversarialFanoutGroup` returned left members `[red-1, red-10]` and right members `[red-1-copy, red-10-copy]`.
- Real `open-ready` returned exactly those four ids.
- Dispatch goal lines were the four genuine brief bodies, never the fenced ghost.
- Every dispatch path was exactly `kaola-workflow/membership-briefs-replay/.cache/<node-id>.md`.
- Writing only those four runtime-seeded adversarial receipts and closing all four with real `close-node` succeeded. No `adversarial-verifier-*` bridge was seeded or needed.

The Node Briefs changes therefore did not alter group resolution, opened identity, receipt identity, or evidence lifecycle.

### Unrelated legacy, similar-id, and duplicate-file attack

After adding the two required pre-completed reviewer receipts, I injected:

- failing `adversarial-verifier-0.md`
- failing `red-11.md` carrying a duplicate `red-1` binding
- failing `duplicate-red-1.md` carrying a duplicate `red-1` binding

Real results:

- left per-node verdict: PASS, exact members `[red-1, red-10]`
- right per-node verdict: PASS, exact members `[red-1-copy, red-10-copy]`
- whole-plan verdict: PASS

No unrelated file entered either canonical tally.

### Fail-closed evidence matrix

I mutated only the authoritative left member path `.cache/red-10.md` between real validator invocations:

- deleted file -> REFUSED: `fanout member red-10 evidence absent at .cache/red-10.md`
- malformed binding -> REFUSED: `fanout member red-10 has foreign or malformed evidence binding`
- binding changed to right-group `red-1-copy` -> REFUSED as foreign/malformed
- binding duplicated from earlier left member `red-1` -> REFUSED: `fanout member red-10 has duplicate evidence binding`
- correct member id with nonce `000000000000` -> REFUSED: `fanout member red-10 has stale evidence binding`

No incomplete or misbound state was accepted.

### One-pass/one-fail tie and group isolation

With exact current bindings restored, I set left votes to one pass and one fail while leaving both right votes pass.

- left: REFUSED, `fanout majority-refute: 1/2 skeptics refuted`
- right: PASS
- whole plan: REFUSED

The right group's passes did not dilute the left tie, and the left refutation did not contaminate the right per-node verdict.

### Scoped reset and fresh reopen

After restoring all four valid receipts, real `reopen-node --node-id impl-left` returned:

- `gatesReset`: `[review-left, red-1, red-10]`
- `evidenceRemoved`: `[review-left.md, red-1.md, red-10.md]`

Both right receipts and both right barrier bases remained byte-identical. The unrelated legacy-prefix and duplicate-named files remained present. Neither right-group member was reset or removed.

I committed an allowed repair only in the temporary project, closed the reopened left producer with bound RED/GREEN evidence, closed the reopened reviewer with a bound pass verdict, and ran real `open-ready` again. It reopened the exact left skeptic frontier:

- `red-1`: old nonce `2db971e650c9`, fresh nonce `8f088ee2c6ee`
- `red-10`: old nonce `b7f224cf765d`, fresh nonce `f70d7221533c`
- each new seed carried its own fresh binding and no stale `verdict: pass` body
- both right-group receipts remained byte-identical

Cleanup neither preserved a stale affected-group vote nor deleted another group's evidence.

## Repository-write audit

All executable projects, cache mutations, and the repair commit lived under the OS temporary directory; the successful fixture was deleted. This verifier made zero product, test, documentation, plan, state, or workflow-task writes. The only repository write was this exact pre-seeded bound evidence file.

- worktree HEAD: `1917b9f82bc949e9bdad54899d106bcdb2446d99`
- candidate hash independently re-read: `a290dbce5bbd321c97390039b5a19e0eb579f66cfbc5d1334820b8c845ac1e12`
- tracked unstaged diff SHA-256 before/after evidence write: `80580fcef86ad043af896e06af314856d58e5ce4b5dbf40de2d182bc62e610dc`
- staged diff SHA-256 before/after: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- all pre-existing modified/untracked paths were left untouched; this evidence path was already seeded and untracked.

## Verdict

NOT-REFUTED, high confidence. The refreshed current candidate survived the complete requested hostile membership replay, including the newly repaired Node Briefs fence state. No counterexample was found for exact membership, runtime node-id-only receipts, binding freshness, tie semantics, scoped cleanup, or independent-group preservation.

delegation_outcome: completed directly as the dispatched adversarial-verifier; no sub-delegation; temporary project removed; zero repository writes outside this bound evidence file.

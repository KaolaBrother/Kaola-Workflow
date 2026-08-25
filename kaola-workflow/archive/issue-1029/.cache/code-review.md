evidence-binding: issue1029-code-review 1029c0de0001

behavior: code-reviewer
profile: b0b68137e292dce62e1e47992a2c539b0415a791f8ab75a4937cae9dbbc7d5f7
context: issue-1029-complete-candidate
candidate: worktree=/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1029 baseline=89d171ef71c65b5d8841e98c9b48f7e52b10a41a tracked_paths=22
claim: next-finalize-only-main-authored-handoff
surface: baseline-to-uncommitted-candidate-diff
evidence: issue1029-code-review

finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=shared-marker-orphan-rejection-is-not-mutation-proven

R1 - P2 - Shared-marker orphan rejection can be deleted while all 823 assertions remain green

Failure class: materially unexercised candidate-caused guard branch.

Primary anchor: scripts/test-route-reachability.js:1450.
Secondary anchor: scripts/test-route-reachability.js:1858.

Precondition and trigger: the candidate changes the reverse orphan sentinel from one marker-to-block mapping to a marker-to-blocks mapping so the same `main-authored-handoff` marker can legitimately belong to disjoint next and finalize topic sets. A known shared marker appearing on a surface outside every candidate block must take the new `matches.length === 0` rejection, and overlapping manifest blocks must take the new `matches.length > 1` ambiguity rejection.

Expected behavior and proof: because this widened path is part of the shared-marker orphan contract, the route oracle must contain negative controls that plant (1) a known shared marker on a derived but unobligated topic/surface and (2) two same-marker blocks whose derived surface sets overlap, then prove `checkManifest` reports the corresponding orphan or ambiguity. This is also required by the repository rule that a guard is evidence only once mutation-proven and by this review's explicit shared-marker orphan acceptance criterion.

Observed behavior: the only reverse-sentinel RED proof at lines 1858-1870 plants a completely unknown `rogue` marker, which exits through `candidates.length === 0`; it never reaches either newly added `matches` branch. As a direct in-memory guard mutation, I replaced both `if (matches.length === 0)` and `else if (matches.length > 1)` with false conditions and compiled the otherwise unchanged test module. The suite still reported `Route-reachability test passed (823 assertions).` Thus the clean real tree proves legitimate next/finalize sharing, but the candidate's claimed orphan preservation is not objectively covered.

Impact: a later regression that accepts a known shared marker on init or another non-obligated surface, or silently accepts ambiguous block ownership, can pass the route suite. That would weaken the reverse sentinel precisely where this candidate widened it and could let the handoff escape the settled next/finalize-only scope without a red guard.

Action: add focused in-memory `checkManifest` fixtures for both new rejection branches. Keep the existing unknown-marker fixture. Each fixture should assert the specific orphan/ambiguity failure, not merely a nonzero failure count, so unrelated forward failures cannot self-certify the guard.

Review coverage:

- Inspected all 22 changed paths against the stated baseline, including canonical slot, both skeletons, manifest, route oracle, 12 tracked renders, README, conventions, architecture, API, and changelog.
- Read the named implementation, TDD, wording, and documentation evidence plus ADR 0017, ADR 0019, generator/oracle context, and directly relevant routing contracts.
- Confirmed one canonical full block in `templates/routing/slots.js`, one unconditional slot reference in each of next/finalize, no init/profile/model/state/mission-list candidate path, and no extra tracked path.
- Confirmed the wording preserves installed-profile authority, main's product/final authority, result-not-method acceptance, role-family specialization, sparse task facts, and the no-record/no-schema/no-grader/no-score/no-gate boundary.
- Confirmed the changed documentation count of 42 consumers equals 7 runtimes x 3 forges x 2 topics, with 12 tracked and 30 additive-rendered consumers.
- `git diff --check`: pass.
- `node scripts/generate-routing-surfaces.js --check`: pass, 18 of 18.
- `node scripts/test-generate-routing-surfaces.js`: pass, 434 assertions.
- `node scripts/test-route-reachability.js`: pass, 823 assertions.
- Final identity remained HEAD 89d171ef71c65b5d8841e98c9b48f7e52b10a41a with the same 22 modified tracked paths.

Residual validation gap: the complete four-chain suite was not run by this review because the admitted defect short-circuits ahead of expensive validation. No production wording, generated-byte, documentation-count, excluded-path, or current clean-tree parity defect was found.

verdict: fail
findings_blocking: 1
review_conclusion: The candidate behavior is coherent, but the shared-marker orphan guard needs two focused negative controls before its preservation claim is objective.

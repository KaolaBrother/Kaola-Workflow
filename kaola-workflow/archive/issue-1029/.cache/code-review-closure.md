evidence-binding: issue1029-code-review-closure 1029c0de0004

behavior: code-reviewer
profile: b0b68137e292dce62e1e47992a2c539b0415a791f8ab75a4937cae9dbbc7d5f7
context: issue-1029-r1-closure
candidate: worktree=/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1029 baseline=89d171ef71c65b5d8841e98c9b48f7e52b10a41a tracked_paths=22
claim: prior-finding-r1-repaired
surface: scripts/test-route-reachability.js-repair-delta
evidence: issue1029-code-review-closure

finding: id=R1 scope=in_scope action=none status=resolved severity=medium fix_role=tdd-guide rationale=both-shared-marker-rejection-branches-now-have-exact-mutation-proven-negative-controls

R1 closure result: resolved.

Repair anchors: scripts/test-route-reachability.js:1873 and scripts/test-route-reachability.js:1900.

The non-obligated fixture supplies the known `main-authored-handoff` marker to one command-only manifest block, satisfies that block's complete forward obligation on `cmd/foo.md`, and places the same known marker on the in-scope skill surface. Its asserted `obligatedCount === 1` and exact single diagnostic prove the marker has candidates, has zero matching obligations on the observed skill surface, and reaches only the `matches.length === 0` rejection. The unknown-marker path cannot satisfy the expected message.

The ambiguity fixture supplies two same-marker command-only blocks, satisfies both forward obligations on the same command surface, and leaves the skill surface marker-free. Its asserted `obligatedCount === 2` and exact single diagnostic naming `shared-marker-overlap-a` and `shared-marker-overlap-b` prove two candidates match the observed surface and reach only the `matches.length > 1` rejection. An unrelated forward, missing-surface, or unknown-marker failure cannot satisfy the assertion.

Independent branch-disable proof:

- Replacing only `if (matches.length === 0)` with `if (false)` in memory produced exactly `RED-PROOF shared-marker-non-obligated`, with 1 failure and 824 passed assertions.
- Replacing only `else if (matches.length > 1)` with `else if (false)` in memory produced exactly `RED-PROOF shared-marker-ambiguity`, with 1 failure and 824 passed assertions.

Preservation checks:

- The accepted real next/finalize shared-marker case remains exercised by the 42-surface T21 control and passes.
- The existing unknown-marker reverse-sentinel fixture remains at scripts/test-route-reachability.js:1858 and passes.
- `node scripts/test-route-reachability.js`: pass, 825 assertions.
- `node scripts/generate-routing-surfaces.js --check`: pass, 18 of 18 surfaces.
- `git diff --check`: pass.
- Candidate identity remained HEAD 89d171ef71c65b5d8841e98c9b48f7e52b10a41a with the same 22 modified tracked paths.

No new defect is anchored to the R1 repair delta. The closure review did not widen beyond the prior finding frontier.

verdict: pass
findings_blocking: 0
review_conclusion: R1 is resolved because both shared-marker orphan rejection branches now have exact clean-forward fixtures and independent branch-disable proof.

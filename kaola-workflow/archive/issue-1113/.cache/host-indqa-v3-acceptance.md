# Host acceptance — independent QA v3 correction (devin-KW-i1113-indqa)

Event: devin idle, fingerprint sha256:00786938a592d9c1cb8e60d0b5dad0cce0f5c65b2bfa862872867f063e505064 matched dispatch; worktree clean at 1203f765 throughout; v1/v2 immutable evidence untouched (ARTIFACT-HASHES recompute to recorded values). REPORT sha256 3571b98fdc9d861cc47a8a99860a3d05b8b2f2002f6f881862ab7153fc1c3239.

ACCEPTED as the corrected independent acceptance-test suite and the first candidate-bound discrimination of 1203f765 (measured: no v1/v2 process executed the candidate's sink-pr/claim bytes).

All four returned defects verified fixed with real evidence: (a) fail-closed decideExit — real suite exit 1 with 17 RED, controls exit 1 with 3 RED, zero-row probes exit 1, all-PASS subset exit 0, self-test 22/22; (b) shared PUBLICATION_UNSAFE includes git.push (self-test reproduces the v2 miss); WATCH_UNSAFE adds claim.cleanup/worktree.remove; (c) 7-file named bound source from ls-tree/archive of 1203f765, trace audit outOfSet=[] (352/366 records); (d) request/liveWatch/archiveReconcile stages with finalPublication only on origin-verified archive; every row records commit+stagesTested.

Meaning corrections accepted by the Host: MERGED rows now run in the archived lane (fixes defect (d) mixing); issue-observation assertion applies only when a watcher stage ran (fixes vacuous assertion); soft per-row evaluation keeps all failures. These carry the intended independent meaning; no v2 assertion body weakened (stage assertions added, none removed).

Host QA disposition of REDs on 1203f765 — none is a defect of the owner-corrected scope (issue #1113 2026-10-02 correction):
1) 8 suite rows, receipt.identity durable identity object: independent-proposed assertion exceeding the corrected scope; prior Host already ruled it non-required; recorded as honest limitation for outer review.
2) 7 suite rows + 3 control REDs, claim repository/digest/forge input validation: the corrected scope names validation of issue/head/base/action before effects; claim identity is created and validated by the claim machinery, sink-side re-validation is defense-in-depth beyond this issue; recorded as honest limitation.
3) 2 suite rows, v2 fixture-design artifacts (missing issue_numbers = valid optional singleton shape per ADR 0031; '143' string-vs-number comparison): test-meaning artifacts, not candidate behavior.

All risk paths named by the corrected issue PASS candidate-bound: malformed/conflicting intent (ambiguous_identity/malformed_issue refusals, 12 sink + 24 watch), unsupported bundles, wrong head/base, closed-unmerged, OPEN reuse, MERGED no-republish, request-only with pr_auto_merge true (suppressed_request_only), unknown/violating observations, live/archive singleton success, linked-worktree canonical-MAIN resolution, unrelated-run isolation (inventory/MAIN/identity/ledger unchanged on refusals), created/reused distinction (stable PR reuse).

Unasserted observation disposition: archived reconcile performs claim cleanup + worktree removal when the archive is local_only. The explicit-mode gates sit BEFORE those effects (ADR 0031); the effect ordering itself is the pre-existing shared normal-close machinery this issue must leave unchanged; not a proven problem of this scope — disclosed to outer as a known observation.

Not accepted as PASS and not run here: producer chains, walkthrough, npm test (droid seat), authenticated Forge compatibility, any integration of the suite into shared tests (integration remains Host-held). No waiver issued; the above dispositions are scope rulings, not waivers of run checks.

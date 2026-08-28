# Keep finalization outside the Mission List and record recoverable outcomes rather than attempts

- item: Remeasure the current canonical and rendered workflow surfaces against Issue #1042 and identify the exact wording, generation, documentation, and acceptance-test boundary
  status: done
  dispatched: self; inspect the Issue #1042 worktree, canonical routing/finalize skeletons, generators, focused suites, ADR/API/conventions/README/CHANGELOG references, with the measured boundary recorded inline in this item
  result: The ambiguity is authored in templates/routing/next.skeleton.md and finalize.skeleton.md, repeated by scripts/kaola-workflow-compact-context.js, then propagated to six generated next/finalize surfaces and three forge script copies. Existing A3 mission-granularity tests reject selector missions and immediate same-custody BLOCKED but do not reject the absolute append-repair wording or finalization-as-mission. Public contract impact is bounded to ADR 0017, README, architecture/conventions/API as applicable, and CHANGELOG.

- item: Independently author behavioral RED proving finalization is outside the Mission List and same-custody attempts do not create missions while custody-changing outcomes still do
  status: done
  dispatched: tdd-guide via native Codex subagent; owns acceptance-test changes in scripts/test-runtime-agent-architecture.js and any narrowly necessary routing-surface test, must prove the new assertions fail on the untouched Issue #1042 baseline, and lands the test diff in /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1042
  result: scripts/test-runtime-agent-architecture.js adds 28 lines inside the existing A3 block. Baseline 646119bb ran GREEN at 798 assertions; the unchanged production wording then ran 801 passed / 3 failed, covering finalization outside the list, removal of the absolute append rule, and same-outcome versus custody-changing mission boundaries.

- item: Implement the smallest canonical wording correction, regenerate every affected runtime surface, and update only the public documentation required by the changed contract
  status: done
  dispatched: self; edit only canonical next/finalize skeletons, canonical compact-resume/project-instruction sources, ADR 0017 plus the smallest required README/architecture/CHANGELOG public wording, then use existing generators and edition sync to propagate tracked copies in /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1042
  result: Canonical wording changed only in next/finalize skeletons, compact resume, consumer instruction source, producer AGENTS, ADR 0017, README, architecture, and Unreleased changelog; existing generators produced their tracked copies. No schema, parser, gate, phase, counter, cap, or new script was added. Focused checks passed: runtime architecture 804 assertions, 18 routing surfaces byte-matched, and script-sync families were consistent.

- item: Freeze the complete candidate and independently review the exact changed bytes for correctness, additive restraint, cross-runtime consistency, and regression risk
  status: done
  dispatched: code-reviewer via native Codex subagent; review exact unstaged candidate diff SHA-256 630d027e7707be29be541cae83c97ca5af2004ed646099a4bb5a055dd6d001ec in /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1042 and return one complete prioritized finding batch without modifying files
  result: FAIL with one complete in-scope finding R1. templates/opencode/plugins/kaola-workflow-hooks.js still shipped the retired repair/re-review append rule and omitted the finalization boundary; sync-opencode-edition.js copies it to runtime outputs, while the new acceptance inspected only next/finalize skeletons. Candidate hash remained 630d027e7707be29be541cae83c97ca5af2004ed646099a4bb5a055dd6d001ec.

- item: Establish finalization readiness with all required focused suites, npm test, mandatory walkthrough, documentation checks, and honest evidence recorded against the final candidate
  status: done
  dispatched: self; run producer-selected complete validation on exact candidate 620e3385dff690b319d091cb0a7200d2b89079b671053f42d0272d3e3b24bbb0, including npm test, mandatory walkthrough, changed routing/runtime edition suites, generated/script parity, and documentation/diff checks; record evidence in the existing run cache and close only when finalization-ready
  result: FAIL after all preceding producer suites passed through validation-allowband. test-route-reachability reported one coherent stale-contract class across 48 file checks: its manifest still required retired `append a new mission` and `A mission is outcome-level` tokens, and its consumer block expected old word forms. No product/runtime failure was observed.

- item: Independently extend the existing Issue #1042 acceptance to the shipped OpenCode compact-resume authority and prove the review finding RED without broadening the design
  status: done
  dispatched: tdd-guide via native Codex subagent; owns the smallest test-only extension in scripts/test-runtime-agent-architecture.js or the existing OpenCode edition suite, must prove templates/opencode/plugins/kaola-workflow-hooks.js currently violates the same two boundaries, and lands only the RED test diff in /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1042
  result: The existing 28-line A3 block now reads the one canonical OpenCode hook and broadens its retired-rule regex by one alternative. Focused run produced exactly three RED findings for missing finalization boundary, retained old append rule, and missing same-outcome wording; 801 assertions still passed.

- item: Repair the OpenCode compact-resume canonical wording and regenerate only its existing runtime outputs without adding a mechanism
  status: done
  dispatched: self; replace only the retired resume sentence in templates/opencode/plugins/kaola-workflow-hooks.js with the canonical Issue #1042 sentences, then use the existing OpenCode refresh path and focused tests
  result: Updated the one canonical OpenCode hook sentence and regenerated only the three already-present OpenCode forge trees. Runtime architecture passed 804 assertions and OpenCode edition passed 887 assertions with all three trees in parity; no new mechanism or surface was introduced.

- item: Re-freeze the repaired complete candidate and independently verify the exact bytes close R1 with no new finding
  status: done
  dispatched: code-reviewer via native Codex subagent; verify repaired diff SHA-256 abdb1735676a0c00dddcc2cde04d42932d0963afdfc925b115251c52922f8976 in /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1042, re-review R1 and the complete exact candidate, and return one complete finding batch without modifying files
  result: R1 resolved, but FAIL with one new same-surface regression R2: replacing the OpenCode resume sentence also removed the preserved completed-item/result immutability and one-dispatch/one-result clauses. Candidate hash remained abdb1735676a0c00dddcc2cde04d42932d0963afdfc925b115251c52922f8976.

- item: Independently pin the two preserved OpenCode compact-resume invariants and prove their accidental removal RED
  status: done
  dispatched: tdd-guide via native Codex subagent; extend only the existing Issue #1042 A3 block to require completed-item/result immutability and one-dispatch/one-result on the OpenCode hook, prove the current candidate RED, and modify no production files
  result: The same test owner inventoried both canonical compact surfaces before closing: templates/opencode/plugins/kaola-workflow-hooks.js and scripts/kaola-workflow-compact-context.js. One shared assertion REDs because the valid immutability and one-dispatch/one-result invariant set is incomplete; 804 other assertions pass.

- item: Restore only the two valid OpenCode resume clauses, regenerate the existing three forge trees, and keep the retired attempt-level clause absent
  status: done
  dispatched: self; restore the preserved immutability and one-dispatch/one-result wording on both inventoried canonical compact surfaces, sync their existing tracked/generated copies, and rerun the focused runtime/OpenCode suites
  result: Restored the unchanged recovery invariants on both canonical compact surfaces, kept the retired attempt rule absent, and synced only existing copies/trees. Runtime architecture passed 805 assertions, OpenCode edition 887, script-sync parity, 18 routing renders, and diff whitespace checks all passed.

- item: Re-freeze once more and independently close the complete same-surface finding class on exact bytes
  status: done
  dispatched: code-reviewer via native Codex subagent; verify and review exact repaired diff SHA-256 58a038c5cdff181fe581416ea786faaf963fe018537945bdc5be0a1e5a20a466, explicitly inventory all compact/resume authorities for the retired rule and preserved invariants, and return a complete final finding batch without modifying files
  result: R1 and R2 resolved. FAIL with one test-wiring finding R3: compactContextSource is covered for preserved invariants but omitted from the new-boundary predicate array, so mutating that shipped source can escape the Issue #1042 oracle. Candidate hash remained 58a038c5cdff181fe581416ea786faaf963fe018537945bdc5be0a1e5a20a466.

- item: Complete the existing mutation oracle wiring for the already inventoried compact-context source and prove both changed canonical compact authorities are armed
  status: done
  dispatched: tdd-guide via native Codex subagent; make the smallest test-only change to include compactContextSource in the existing Issue #1042 boundary predicates and prove source-local attempt/finalization mutations RED, with no production changes
  result: compactContextSource now joins the existing Issue #1042 predicate array; two source-local mutations prove attempt-level teaching and finalization-inside-list both RED. A one-line source-string apostrophe normalization keeps the oracle about runtime prose. Focused suite passed 807 assertions with no production change.

- item: Freeze and independently verify the final exact candidate has no remaining Issue #1042 finding
  status: done
  dispatched: code-reviewer via native Codex subagent; verify final diff SHA-256 620e3385dff690b319d091cb0a7200d2b89079b671053f42d0272d3e3b24bbb0, review the complete exact bytes after R1-R3, and return PASS or one complete remaining finding batch without modifying files
  result: PASS on exact diff SHA-256 620e3385dff690b319d091cb0a7200d2b89079b671053f42d0272d3e3b24bbb0. R1-R3 resolved; no new finding. Reviewer verified preserved immutability/one-result semantics, both compact authorities, 18 routing renders, script/kernel parity, OpenCode generated-byte parity, documentation scope, and diff checks.

- item: Reconcile the route-reachability acceptance manifest with the new canonical outcome/finalization wording while preserving cross-runtime reachability strength
  status: done
  dispatched: tdd-guide via native Codex subagent; owns the smallest test-only update in scripts/test-route-reachability.js, replaces only retired required tokens with Issue #1042 load-bearing phrases, preserves mutation/derived-universe coverage, and lands a focused GREEN without production changes
  result: Updated only three token lists in the authoritative templates/routing/required-blocks.js; a rejected test-local rewrite layer was removed before closure. Token counts, derived surface universes, and mutation controls remain intact. Route-reachability passed 170 assertions and diff checks passed.

- item: Re-run the complete finalization-readiness validation on the repaired final candidate and record the exact receipts
  status: done
  dispatched: self; rerun npm test from the beginning on exact candidate f07b268a5acdab32b3a75d2d87c16af9c176df17a04efef43a39ce0b25587c0d, then the unsharded mandatory walkthrough and all additive runtime edition suites, preserving exact logs for finalization readiness
  result: PASS on exact work-tree hash f07b268a5acdab32b3a75d2d87c16af9c176df17a04efef43a39ce0b25587c0d. The formal chain receipt completed all four producer chains at exit 0; the independent unsharded walkthrough passed 179/179, runtime edition suites passed OpenCode 887, Kimi 848, Grok 711, Cursor 788, and ZCode 856, and git diff --check passed. Receipt: kaola-workflow/issue-1042/.cache/chain-receipt.json.

- item: Independently re-review the exact final candidate after the acceptance-manifest mutation invalidated the prior PASS for changed bytes
  status: done
  dispatched: code-reviewer via native Codex subagent; verify diff SHA-256 f07b268a5acdab32b3a75d2d87c16af9c176df17a04efef43a39ce0b25587c0d, focus on the authoritative required-block token update plus complete candidate regression, and return PASS or one complete finding batch without modifying files
  result: PASS on exact diff SHA-256 f07b268a5acdab32b3a75d2d87c16af9c176df17a04efef43a39ce0b25587c0d. Required-block manifest remains 23 blocks / 130 tokens with per-token and per-surface mutation coverage; route reachability 170, runtime architecture 807, routing/script/OpenCode parity, and diff checks pass with no remaining finding.

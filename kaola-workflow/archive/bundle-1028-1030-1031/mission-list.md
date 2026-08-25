# Correct and close Issues #1028, #1030, and #1031 together with release-stable ZCode behavior and seven-runtime documentation

- item: Reverify the three corrected live issue premises against current main and freeze the smallest honest change surface.
  status: done
  dispatched: self, read-only live-issue and current-tree verification; result recorded inline in this mission list
  result: Owner corrections now override each body; #1028 has nine current prose sites, #1030 is the global-install launcher overwrite, and #1031 is a released-tree changelog assertion defect at e2a793f8.

- item: Add independent regression custody for the global ZCode consumer path and the release-stable changelog witness, proving both defects on the baseline.
  status: done
  dispatched: tdd-guide owns only `.kw/worktrees/bundle-1028-1030-1031/scripts/test-zcode-edition.js`; RED/GREEN and mutation evidence will land in that diff and the returned test report
  result: The corrected D2 and its in-memory deletion mutation witness pass; the new bounded global consumer invocation leaves the unfixed baseline intentionally RED at 690 passed / 1 failed with launcher=true and ETIMEDOUT. Syntax and diff checks pass.

- item: Repair the ZCode global support-script deployment and changelog assertion without weakening project installs or the documented-entry witness.
  status: done
  dispatched: implementer owns only `.kw/worktrees/bundle-1028-1030-1031/install-zcode.sh`, reads the tdd-guide test artifact without editing it, and lands the production fix plus focused GREEN evidence in that file diff and returned report
  result: Global installs now stage generated launchers before real manifest scripts so the real scripts win; project installs retain their prior distinct-path order. `bash -n`, `git diff --check`, and the full ZCode edition suite pass at 691 assertions.

- item: Reconcile all nine current seven-runtime documentation and package-metadata sites while preserving accurate six-surface counts.
  status: done
  dispatched: doc-updater owns only the corrected #1028 prose surfaces in `.kw/worktrees/bundle-1028-1030-1031/{README.md,package.json,docs/opencode-edition.md,docs/kimi-edition.md,docs/grok-edition.md,docs/cursor-edition.md}`; result will land in those diffs and the returned audit
  result: All nine corrected sites now say seven and include ZCode where enumerated; fourth/fifth/sixth installer ordinals and unrelated six-surface counts remain intact, package JSON parses, focused stale-count search and `git diff --check` pass.

- item: Dock the bundle changelog and complete focused, additive-edition, walkthrough, and independent adversarial review evidence.
  status: done
  dispatched: doc-updater audits the final candidate and owns bundle documentation docking plus `CHANGELOG.md`, landing at `kaola-workflow/bundle-1028-1030-1031/.cache/doc-updater.md` || main runs focused, all-additive, and full walkthrough validation || code-reviewer and two adversarial-verifier passes inspect the full candidate, #1030 install boundary, and #1031 release-stable witness, landing under the same `.cache/` folder || after R1 alias repair, code-reviewer and #1030 adversarial-verifier re-run closure against the exact repair delta while #1031's unchanged-surface not_refuted receipt is reused explicitly
  result: Documentation is DOCKED; focused ZCode is 695/695, all additive-edition suites pass, the final-candidate walkthrough passes 186/186, code-reviewer closure passes, both adversarial claims are not_refuted, and `.cache/chain-receipt.json` records an all-four green candidate-bound receipt with no accepted red.

- item: Close the review-found project-layout/ZCODE_HOME alias of the same #1030 launcher collision and revalidate the repaired candidate.
  status: done
  dispatched: tdd-guide reopens only `scripts/test-zcode-edition.js` to add a hermetic alias-path RED || implementer reopens only `install-zcode.sh` to make real-script-last convergence scope-independent || doc-updater closes the alias wording in the already-owned documentation and refreshes `.cache/doc-updater.md`; owner correction 2 is live at issue comment 5413641032
  result: Alias fixture moved from 694 passed / 1 failed to 695/695 under the universal real-script-last order; code-reviewer R1 is resolved, #1030 adversarial closure is not_refuted across all three forges and both coincident/distinct project layouts, docs remain DOCKED, and no recursive processes remain.

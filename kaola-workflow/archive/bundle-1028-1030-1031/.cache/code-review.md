evidence-binding: review-bundle-1028-1030-1031 4e7c0a3b9d12

candidate: /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-1028-1030-1031
branch: workflow/bundle-1028-1030-1031
baseline: e2a793f83755650d5c69a28fef1c4e317ae7c220
claim: Issues #1028, #1030, and #1031 under their corrected owner comments
surface: closure review of prior R1, its repair delta, and the complete current 11-file candidate diff

Closure summary

Prior finding R1 is resolved. The installer now stages the generated edition directory before
copying real manifest support scripts in every scope, so real scripts win both for global installs
and for project installs whose `<target>/.zcode` aliases `ZCODE_HOME`. The complete candidate
satisfies all corrected acceptance for Issues #1028, #1030, and #1031, and no new candidate-caused
defect was admitted.

finding: id=R1 scope=in_scope action=none status=resolved severity=medium fix_role=tdd-guide rationale=universal-order-and-alias-regression-close-prior-collision

Prior trigger: project mode with `<target>/.zcode === ZCODE_HOME`, for example
`HOME=/tmp/x ZCODE_HOME=/tmp/x/.zcode ./install-zcode.sh --target /tmp/x --yes`, previously copied
real scripts first and generated self-launchers last.

Expected result: the final home support directory contains real manifest scripts and a
non-`kaola-workflow` consumer invocation executes the real forge-specific claim script once.

Current observed result: the repaired candidate exits 0, leaves no generated launcher among any
manifest script, and the real claim script exits 0 on `--help` from a consumer cwd. An independent
hermetic alias matrix produced:

- github: 16 manifest scripts, 0 launchers, `kaola-workflow-claim.js --help` exit 0.
- gitlab: 18 manifest scripts, 0 launchers, `kaola-gitlab-workflow-claim.js --help` exit 0.
- gitea: 18 manifest scripts, 0 launchers, `kaola-gitea-workflow-claim.js --help` exit 0.
- Each alias install merged a parseable config with `hooks.enabled === true`.

Primary repair anchor: `install-zcode.sh:450-454`. Ordering is now scope-independent:
`install_edition_dir` always stages launchers first and `install_support_scripts` always copies
real manifest scripts last.

Regression anchor: `scripts/test-zcode-edition.js:972-1022`. The new
`G8-project-alias-consumer` fixture proves the target and home paths are identical, invokes the
installed claim from a non-Kaola package cwd under a one-second bound, and requires a real
non-launcher script with exit 0. The existing global consumer witness remains at
`scripts/test-zcode-edition.js:1024-1077`.

Why the repair is sufficient: with distinct project and home roots, universal ordering writes
launchers only to the project edition directory and writes real scripts only to the home directory,
so the two copies remain independent. With coincident paths, the last copy is real. Global layout is
the same coincident-path case. Hook shells are generated from the same source and are safe under
either order; config merging still happens afterward. Both copy functions return early under
`--no-scripts`, and uninstall targets the same deployed basenames and paths independent of install
order. Forge selection changes source names and content, not the ordering rule.

Complete candidate review

- Issue #1028: all nine owner-corrected stale-count sites say seven, enumerated rosters include
  ZCode, fourth/fifth/sixth installer ordinals remain accurate, and unrelated six routing-surface
  statements remain unchanged.
- Issue #1030: global, distinct-project, and aliased project layouts converge to the required real
  home scripts. GitHub, GitLab, and Gitea manifest sets were checked independently. The focused
  suite also covers ordinary project/global installs, no-scripts, hook/config merge, and uninstall
  preservation of foreign agents and config entries.
- Issue #1031: the D2 witness scans every bracketed release section instead of pinning
  `[Unreleased]`. Its paired mutation removes all ZCode-bearing release bullets, proves the input
  changed, and proves the release-stable witness then fails.
- Documentation: README, API, ZCode edition notes, and changelog now state the universal ordering
  and distinguish coincident from distinct layouts. The seven-runtime package and edition prose
  remains accurate. Documentation docking is DOCKED.

Validation evidence

- `node scripts/test-zcode-edition.js`: passed, 695 assertions, with all three generated trees in
  parity. The suite reported the established generated-tree root at the main checkout rather than
  this linked worktree.
- Independent three-forge alias matrix: all installs exit 0; launcher counts are 0; all
  forge-specific claim `--help` invocations exit 0; all merged configs retain hooks enabled.
- `bash -n install-zcode.sh`: passed.
- `git diff --check e2a793f83755650d5c69a28fef1c4e317ae7c220`: passed.
- `package.json` parsed successfully.
- Candidate diff SHA-256 was
  `32be7b28f91edc509db4d0153ebaec95d3d7cc86fd8908c11a8d47a357b52bf1` before and after closure
  inspection and validation. The file set and worktree status were unchanged; no concurrent
  candidate mutation was observed.

Residual risks and validation gaps

No blocking residual risk was found. This closure independently reran the focused ZCode suite but
did not rerun the already-reported full additive-editions or walkthrough suites. The generated-tree
root notice remains visible in evidence and did not affect parity or installer execution.

verdict: pass
findings_blocking: 0
review_conclusion: Prior finding R1 is resolved and the complete corrected bundle passes closure review.

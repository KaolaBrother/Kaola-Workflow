# Documentation docking record

- Candidate: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-1028-1030-1031`
- Branch: `workflow/bundle-1028-1030-1031`
- Baseline: `e2a793f83755650d5c69a28fef1c4e317ae7c220`
- Scope: Issues #1028, #1030, and #1031
- Verdict: `DOCKED`

## Changed documentation

- `CHANGELOG.md`: added the top `## [Unreleased]` record for the seven-runtime metadata
  reconciliation (#1028), universal ZCode real-support-script convergence and consumer-cwd alias
  recursion repair (#1030), and the release-stable mutation-checked changelog witness (#1031). The
  record reports the focused test result as 695/695 assertions.
- `README.md`: preserved the nine #1028 corrections and documented the universal ordering rule:
  generated launchers stage first, real manifest scripts win last on coincident paths, and distinct
  project paths retain project launchers with real scripts in the shared home path.
- `docs/api.md`: updated the `install-zcode.sh` contract with project/global layout, universal
  launcher/support-script ordering, alias-path precedence, distinct-path behavior, and consumer-cwd
  resolution.
- `docs/zcode-edition.md`: documented the universal ordering rule and the conditional final layout
  for coincident versus distinct edition/home paths.
- `docs/opencode-edition.md`, `docs/kimi-edition.md`, `docs/grok-edition.md`, and
  `docs/cursor-edition.md`: the existing #1028 seven-runtime sequence corrections were preserved;
  no further changes were required.

## Documents audited and no-impact decisions

- `docs/architecture.md`: no edit. The final source change is installer copy ordering and test
  witness hardening; runtime/forge structure and the architecture's seven-runtime routing model
  are unchanged. Existing architecture pointers to `docs/zcode-edition.md` remain accurate.
- The existing README multi-model capability sentence remains unchanged because ZCode pins
  `GLM-5.3` and omits per-call model overrides; adding it to that capability claim would assert
  unsupported per-dispatch model routing. The exact #1028 count/roster sites remain reconciled.
- During this documentation pass, released changelog sections, source, tests, generated surfaces,
  workflow state, decisions, investigations, and archives were not edited.

## Source and test evidence

- `install-zcode.sh:450-454` shows the universal order: `install_edition_dir` stages generated
  launchers first and `install_support_scripts` copies real manifest scripts last, covering global
  installs and project layouts that alias `ZCODE_HOME` to `<target>/.zcode`.
- `scripts/test-zcode-edition.js:972-1022` contains the bounded project-alias consumer regression:
  when `<target>/.zcode === $ZCODE_HOME`, a non-`kaola-workflow` package cwd must resolve the real
  `kaola-workflow-claim.js`, exit 0 on `--help`, and not select the generated launcher.
- `scripts/test-zcode-edition.js:1042-1094` contains the corresponding global consumer regression.
- `scripts/test-zcode-edition.js:1206-1280` contains the release-section witness and the in-memory
  ZCode-entry deletion mutation that must make the witness fail.
- Command: `node scripts/test-zcode-edition.js`
  - Result: `zcode-edition test passed (695 assertions)`
  - Drift check: `3 tree(s) in parity (.zcode, .zcode-gitlab, .zcode-gitea)`
  - The test reported the generated-tree root as the main checkout, not this linked worktree.
- Command: `node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))"`
  - Result: `package.json:parse-ok`
- Command: `git diff --check`
  - Result: passed with no output.

## Remaining documentation risks

No remaining documentation gap was found for the final source diff. The focused test's generated
tree-root notice is recorded above; it did not fail parity or the 695-assertion suite.

verdict: DOCKED

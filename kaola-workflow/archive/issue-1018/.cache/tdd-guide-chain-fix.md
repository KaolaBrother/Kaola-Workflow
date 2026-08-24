# TDD guide chain fix evidence

Assigned task: repair only the stale pre-#153 seed assertion in
`scripts/test-install-upgrade-rewrite.js` so the canonical Issue #1018 heavy planner model is
recognized as a concrete model. Production files were not changed.

## Baseline failure

- Commit: `f36fab89aefbcbbeb6aed3c7b14f6be7b8fbc438`
- Command: `node scripts/test-install-upgrade-rewrite.js`
- Exit: `1`
- Failure signature: `AssertionError [ERR_ASSERTION]: planner seed frontmatter should be a concrete model (pre-#153 state)`
- Location: `scripts/test-install-upgrade-rewrite.js:78:5`

The canonical `agents/planner.md` carries `model: fable` for Issue #1018, while the seed regex
accepted only `sonnet|opus|haiku`. The assertion now accepts `fable` as another concrete model and
continues to reject `inherit` and unknown model tokens.

## Green evidence

- Command: `node scripts/test-install-upgrade-rewrite.js`
- Exit: `0`
- Exact output: `Install upgrade rewrite tests passed`

Focused negative/mutation check for the same concrete-model policy:

- Command: inline Node check of `model: fable`, legacy concrete models, `model: inherit`, and
  `model: unknown`
- Exit: `0`
- Exact output: `concrete-model regex mutation check passed: fable accepted; inherit/unknown rejected`

`git diff --check` also exited `0`.


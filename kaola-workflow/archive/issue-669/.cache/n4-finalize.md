evidence-binding: n4-finalize b1b8bcf42060

# n4-finalize — issue-669 sink

## docs_updated
CHANGELOG.md — added one `[Unreleased]` `### Fixed` entry for #669: the `git status --porcelain` family
ENOBUFS hardening (explicit 64 MB `maxBuffer` on every porcelain content probe across plan-validator,
adaptive-node, claim, sink-merge and their editions/forge ports) and the plan-validator dirty-fence
flipped from fail-OPEN to fail-CLOSED (`cannot_prove_clean` typed refuse) on any probe fault, with the
two `test-adaptive-node.js` regressions named. Docs/state only — no code writes on the sink.

## no-impact classes
No public interface, env var, CLI flag, API, or architecture changed → no `docs/api.md`, README,
`.env.example`, or ADR update required. The new `cannot_prove_clean` refuse reason is an internal
plan-validator emit consumed only by the two already-fail-closed fence consumers.

## four-chain precondition
Cross-edition diff (touches the gitlab/gitea forge trees + the plan-validator/adaptive-node GENERATED
aggregators) → Finalization requires all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`
chains green, recorded via the run-chains receipt (`.cache/chain-receipt.json`) before the sink. A
post-ship reinstall of the three runtimes to refresh the installed copies is a manual post-merge step,
not a plan node.

## run gaps
Two deferred code-reviewer/adversary residuals (both pre-existing porcelain fail-opens outside #669's
single-crux mandate, verified byte-identical pre-diff) filed as follow-up #672 and mapped in
`finalization-summary.md` `## Run gaps`: `manual:porcelain-leg-dirty-failopen` and
`manual:porcelain-worktree-dirtystate-failopen`, both `filed: #672`.

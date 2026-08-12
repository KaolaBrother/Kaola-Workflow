# Run gaps — manually seeded

The automatic scanner reads `.cache/` only; this run's premise, implementation and review reports
live in the project folder root, so nothing it could observe was written there. These are the real
defects the run discovered, each with where it was found.

gap: stale-comment — scripts/test-opencode-edition.js:761-762, 869-871 and 883-884 credit `rewriteClaudeModelNouns()` in the present tense; the function exists nowhere in any sync script (repo-wide grep finds it only in this test file's own comments), and no sync script emits the `opus-tier`/`sonnet-tier` markers those comments describe. Same defect class this bundle closed for `plan-validator` and for the A22 strips, but belonging to a different, earlier removal, so it was reported rather than folded in. The assertions beneath them remain valid canonical-drift canaries exactly as A22's did — this is comment text only. Found by the tdd-guide during the A22 repair.

gap: dead-code — `runScenario` in scripts/test-shard-lib.js and `makeShimSpawnFn` in scripts/test-parallel.js were already consumer-less at HEAD, before this bundle touched either file. Explicitly measured as pre-existing rather than caused by the #960 excision. Same `yagni:` class as the #952 audit's own findings and would have belonged to it had the audit reached them. Found by review B.

gap: stale-artifact — the MAIN checkout's four non-github rendered edition trees (.opencode-gitlab, .opencode-gitea, .kimi-gitlab, .kimi-gitea) are one canonical edit behind: they still carry "- choose the simplest architecture that meets the requirement" in three agent surfaces each, which canonical agents/code-architect.md no longer has and which main's github .opencode correctly lacks. Gitignored artifacts, so no tracked file is involved and nothing here is committable; the consequence is that an install from the main tree right now would ship a stale line to those forges. Cleared by running --write for the non-github forges. Found by impl-962-sync, which confirmed it does not touch this bundle's byte-identity A/B since both legs re-rendered from the same worktree canonical.

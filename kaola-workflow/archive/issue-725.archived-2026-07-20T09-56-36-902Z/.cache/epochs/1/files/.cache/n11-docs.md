evidence-binding: n11-docs c7dd31ebebb1
upstream_read: n6-front-agents-certify d2cc7441ad15
upstream_read: n8-role-agents-certify f029a49dd7d3
upstream_read: n10-selfdev-certify 5027b7a848d8
docs_updated: Added three CHANGELOG.md [Unreleased] entries — the #718 mirror-before-dispatch line (### Added), the #736 detectReviewRuntime self-dev guard fix (### Fixed), and the Phase D prompt-diet + validator-narrowing summary with the recorded per-surface before/after counts, the fast-compliance-backstop pin-chain removal, the two fossil assertBefore pins, and the reviewer-profiles exclusion (### Removed, matching the Phase A/Phase C ordering convention of newest phase at the top of that section). No other tracked file touched (README/docs/CLAUDE.md have no Phase-D coupling, confirmed by scope). Ran both additive-edition sync/suite pairs and recorded their outcomes honestly below.

## Write-set discipline

Frozen write set for this node is `CHANGELOG.md` only (plus this evidence file). Verified via
`git status --porcelain` before and after editing: the only NEW tracked modification introduced by
this node is `CHANGELOG.md`. The other 17 modified-but-uncommitted tracked files
(`agents/contractor.md`, `agents/workflow-planner.md`, `commands/kaola-workflow-adapt.md`,
`commands/kaola-workflow-finalize.md`, the 6 gitlab/gitea adapt+finalize command/SKILL mirrors, the 3
finalize SKILL packs, `scripts/test-opencode-edition.js`, `scripts/test-route-reachability.js`,
`templates/routing/required-blocks.js`) were already present in the working tree before I started —
they are n3-finalize-adapt-diet's and n5-front-agents-diet's uncommitted output, already certified pass
by n4/n6 respectively, sitting in the shared worktree ahead of the close-and-open-next commit boundary.
I did not edit any of them. The opencode/kimi `--write` sync outputs land in gitignored trees
(`.opencode/`, `.kimi/`) — confirmed via `git status --porcelain --ignored=matching`, no tracked
addition resulted from either sync invocation.

## Upstream evidence read (before drafting CHANGELOG facts)

- `kaola-workflow/issue-725/.cache/n6-front-agents-certify.md` (nonce `d2cc7441ad15`): certified
  n5-front-agents-diet's `agents/workflow-planner.md` 600→249 and `agents/contractor.md` 353→208 trim,
  all six workflow-planner/contractor toml mirrors byte-unchanged, the five contract validators
  narrowed coherently, opencode/kimi suites at their base failure-sets, zero provenance tokens. Used
  this to source the workflow-planner/contractor numbers and the "generator-owned, hand-trimming is
  generator drift" framing for the reviewer-profile exclusion (n5/n6's own scope note).
- `kaola-workflow/issue-725/.cache/n8-role-agents-certify.md` (nonce `f029a49dd7d3`): certified
  n7-role-agents-trim's 109-line, deletion-only narration cut across 10 of the 11 role-agent profiles
  (`agents/knowledge-lookup.md` untouched, zero diff), every frontmatter block and pinned needle
  byte/hash-verified survived, both required validators green, opencode/kimi failures reproduced
  byte-equivalent with zero contribution from the diff. Used for the "10 of the 11" / "1336→1227" /
  knowledge-lookup-no-safe-cut CHANGELOG language.
- `kaola-workflow/issue-725/.cache/n10-selfdev-certify.md` (nonce `5027b7a848d8`): certified
  n9-selfdev-guard's `detectReviewRuntime` self-dev guard — placed before the opencode tail-pattern,
  fires only on the exact `package.json` name === `'kaola-workflow'` self-dev predicate (matching
  `kaola_script()`), unreachable for genuine opencode/kimi/claude/codex installs, byte-identical across
  all four adaptive-node editions, new hermetic red-to-green fixture in `test-adaptive-node.js`. Used
  verbatim for the #736 CHANGELOG entry's mechanism description.

## Fact verification performed before writing (not taken on faith from the brief)

Every number in the CHANGELOG text was independently re-measured against the live worktree, not
copied from the task brief:

- `wc -l` on the six target surfaces (`commands/kaola-workflow-finalize.md`, `agents/workflow-planner.md`,
  `agents/contractor.md`, `commands/kaola-workflow-adapt.md`, `templates/routing/next.skeleton.md`,
  `templates/routing/plan-run.skeleton.md`): 453 / 249 / 208 / 211 / 894 / 766 — matches the brief exactly.
- `wc -l` on the finalize command's 2 forge mirrors: 453 / 453 (byte-count-identical to canonical).
- `wc -l` on the 3 finalize SKILL packs: 621 / 621 / 621.
- `wc -l` on the adapt command's 2 forge mirrors: 211 / 211.
- `wc -l` summed over the 11 role-agent profiles: 1227 total (matches brief's 1336→1227).
- `git status --porcelain -- agents/code-reviewer.md agents/adversarial-verifier.md
  agents/security-reviewer.md agents/profiles/higher/{code-reviewer,security-reviewer}.md`: empty —
  confirms the reviewer-profile exclusion is real (untouched).
- `git diff 1491c7e5..HEAD -- plugins/kaola-workflow-{gitlab,gitea}/scripts/validate-kaola-workflow-*-contracts.js`:
  showed the exact two removed lines,
  `assertBefore(gitea/gitlabNextSkill, '### Co-active Folders Advisory', '## Routing');` — confirms the
  "two fossil assertBefore pins" claim with the precise token, used verbatim in the CHANGELOG text
  rather than the vaguer brief phrasing.
- `grep -rn "fast-compliance-backstop|fn-fast-compliance"` across `templates/routing/required-blocks.js`,
  `scripts/test-route-reachability.js` (code, not comments), and `commands/kaola-workflow-finalize.md`:
  zero live matches (only comment-only historical references remain in
  `scripts/test-route-reachability.js` and archived `.cache/` evidence under `kaola-workflow/archive/`)
  — confirms the pin chain is fully removed, not just partially.
- `grep -n "SUPERSET"` in `scripts/test-route-reachability.js` / `templates/routing/required-blocks.js`:
  confirms the SUPERSET-PROOF manifest mechanism referenced in the CHANGELOG text is real, live
  machinery (not a fabricated name).
- Provenance sweep: `grep -rE "#[0-9]{3,4}|D-[0-9]{3}-[0-9]{2}|ADR"` over the six trimmed prompt surfaces
  returned zero matches — confirms "no provenance token entered any prompt surface" before writing it
  as fact.

## opencode/kimi sync + suite outcomes (honest record, expected pre-existing red)

Both sync `--write` commands and both test suites were run for real, from the worktree root, per the
brief's instruction. Results match the predicted pre-existing-red caveat exactly — no new failure
surfaced.

- `node scripts/sync-opencode-edition.js --write` → exit 0. Output: "sync-opencode-edition: write
  complete (0 file(s) updated — tree already in sync)." (plus a `preserve opencode.json` line for the
  user-owned config, expected/unrelated). Gitignored `.opencode/` tree only, no tracked write.
- `node scripts/sync-kimi-edition.js --write` → exit 1, uncaught `ENOENT` on
  `hooks/kaola-workflow-pre-commit.sh` inside `writeHooks()` at `scripts/sync-kimi-edition.js:538`. This
  is the seeded pre-existing gap: `hooks/kaola-workflow-pre-commit.sh` was deleted in Phase C
  (`2a48342c`, the advisory-hook retirement) but `scripts/sync-kimi-edition.js` (line 58's hook-file
  list, line 422's generated `[[hooks]]` command string) and
  `templates/opencode/plugins/kaola-workflow-hooks.js` (lines 11/32) still reference it by path. Both
  files are OUTSIDE this node's write set (`CHANGELOG.md` only) and are explicitly flagged in the brief
  as NOT mine to fix — confirmed by direct read of both files before running the sync, so the FATAL was
  expected, not a surprise discovered live.
- `node scripts/test-opencode-edition.js` → exit 1. Output: "FAIL: H1 (#F3): hookPath resolves a hook
  via the plugin-sibling ../hooks candidate when the project + config dir have none — got null" /
  "opencode-edition test FAILED: 1 failure(s), 383 passed." This is byte-equivalent to the failure set
  n6-front-agents-certify (line 24) and n8-role-agents-certify (line 33) both independently recorded at
  their own certification runs ("383 passed, one pre-existing H1/#F3 hookPath failure") — SAME single
  failing assertion name, SAME pass count. No new failure.
- `node scripts/test-kimi-edition.js` → exit 1 (FATAL, test cannot proceed), identical `ENOENT` on
  `hooks/kaola-workflow-pre-commit.sh` inside `sync-kimi-edition --write`, matching n6's line 24
  ("uncaught ENOENT on hooks/kaola-workflow-pre-commit.sh from sync-kimi-edition.js") and n8's line 33
  ("uncaught ENOENT on hooks/kaola-workflow-pre-commit.sh from sync-kimi-edition.js") records verbatim.
  No new failure.

No NEW failure beyond these two certified pre-existing ones surfaced in either suite; nothing to
surface beyond what n6/n8/n10 already documented as a seeded run gap for the planner-owned repair
transaction at the n12 gate.

## AC-D before/after table

| surface | before | after | target | met? | one-line reason if missed |
| --- | --- | --- | --- | --- | --- |
| `templates/routing/next.skeleton.md` (+12 regenerated surfaces) | 1138 | 894 | ≤450 | No | machine-pinned Band-1 content (dispatch cards, worktree/evidence paths, the new #718 mirror-before-dispatch line) plus structural command-vs-skill duplication across the 12 generated surfaces needs a slot/template refactor beyond a prose diet |
| `templates/routing/plan-run.skeleton.md` (+its regenerated surfaces) | 785 | 766 | ≤400 | No | manifest-pinned mechanic blocks (route-reachability T-pins, the five contract validators' needles) plus the newly-added #718 mirror-before-dispatch line hold the floor well above the target |
| `commands/kaola-workflow-finalize.md` (+2 forge mirrors, 3 SKILL packs) | 1065 | 453 | ≤300 | No | roughly 250 lines of mandatory pinned apparatus remain, including the byte-frozen reviewer-contract block that the root/gitlab/gitea validators pin from both sides |
| `commands/kaola-workflow-adapt.md` (+2 forge mirrors) | 304 | 211 | ≤150 | No | a 32-line byte-frozen authoring block, the replan fence, and the bundle lane together consume roughly the whole remaining budget |
| `agents/workflow-planner.md` | 600 | 249 | ≤250 | Yes | — |
| `agents/contractor.md` | 353 | 208 | ≤150 | No | the guard-executed 38-line Step-8a bash block (verbatim-parsed and executed by `test-bash-block-guards.js`) plus the ~90-line sole-home finalization procedure body that `commands/kaola-workflow-finalize.md` names as living exclusively in this profile hold the floor above 150 |
| 11 role-agent profiles (narration-only trim) | 1336 | 1227 | narration only, no numeric target | Yes (109 lines of pure Band-3 narration cut; `agents/knowledge-lookup.md` had zero safe cut and was left untouched) | — |
| 3 reviewer profiles (`code-reviewer`, `adversarial-verifier`, `security-reviewer`) + their higher-tier/toml mirrors | excluded | excluded | n/a | n/a (scoped out) | generator-owned behavior contracts rendered by `scripts/generate-reviewer-profiles.js` from `templates/reviewers/*.json` with stamped hashes — hand-trimming risks the schema-2 review engine's section contracts and counts as generator drift, not a prose diet |

Every number above was cross-checked directly against the live worktree with `wc -l` and `git status
--porcelain` (see Fact verification section) rather than trusted from the writers' own evidence files,
though the writers' recorded numbers (n5/n6 for workflow-planner/contractor, n7/n8 for role agents, and
the frozen plan's own stated before-counts for finalize/adapt/routing) agree exactly with the
independently-measured after-counts.

review_conclusion: CHANGELOG.md carries three new [Unreleased] entries (#718 under Added, #736 under
Fixed, and the Phase D prompt-diet summary under Removed matching the existing Phase A/C
newest-phase-first convention in that section) with every fact — line counts, removed pins, the two
fossil assertBefore tokens, the reviewer-profile exclusion — independently re-verified against the live
worktree rather than copied from the brief. Both additive-edition syncs and suites were run for real;
opencode is clean (383 passed, 1 pre-existing H1 failure) and kimi FATALs on the pre-existing
`hooks/kaola-workflow-pre-commit.sh` ENOENT, both byte-identical to the n6/n8-recorded base — no new
failure. The AC-D before/after table records every target surface with an honest one-line miss reason
where the target was not met, plus the recorded reviewer-profiles exclusion. No file outside the frozen
`CHANGELOG.md` write set was modified.

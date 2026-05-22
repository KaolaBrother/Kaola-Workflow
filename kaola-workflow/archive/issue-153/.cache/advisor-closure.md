# advisor — issue-153 closure decision gate (2026-05-22)

## Verdict: CLOSE. Implementation complete; listed follow-ups are non-blocking.

## Follow-ups
1. LOW DRY nit (agent_source_file dedupe): do NOT file a new issue — reviewer marked it optional ("skip if
   preferring loop locality"). Already recorded in phase5-review.md + phase6-summary.md, which archive with
   the workflow. A separate roadmap entry would be noise. Archived folder is the durable record.
2. #152 incidental drift fix: surface in the commit message BODY — "incidentally resolves the latent #152
   script-sync drift in the plugin mirror of validate-workflow-contracts.js" — so a reviewer reading git log
   understands why the plugin-mirror diff is larger than canonical. Without it, the extra 20 lines look like scope creep.
3. Manual badge verification: NOT a merge blocker. Mechanism empirically proven (memory
   cc-subagent-model-badge-mechanics: inherit → badge on every concrete model, no parent-equal edge); F2 test
   proves install produces inherit frontmatter. Chain holds by property. Note in commit body as a post-merge
   local sanity step for the user.

## Pre-flight before Step 7-9
- Capture SINK_BRANCH/SINK_ISSUE/SINK_KIND BEFORE cmdFinalize (workflow-state.md gets renamed into archive/).
- Ordering: Step 7 (roadmap delete+regen+stage) → 8a (mirror, no-op since ACTIVE_WORKTREE_PATH==pwd) →
  8b (cmdFinalize archives folder) → 8 (commit) → 9 (sink-merge). The finalize rename only lands in the
  commit if it precedes git add.
- Stage with explicit named paths — never `git add -A`/`.`. .codex/agents/ + .codex/config.toml are
  pre-existing junk; must not enter this commit.
- Staging Guard: after 8b, only archive/issue-153/* + .roadmap/ + ROADMAP.md remain under kaola-workflow/ in
  the index → NF>=3 non-archive project count = 0. Passes.

## Decision applied (per /goal: follow advisor for human decisions): CLOSE issue #153 via sink-merge;
## no follow-up issue filed; #152 drift + manual-verify noted in commit body.

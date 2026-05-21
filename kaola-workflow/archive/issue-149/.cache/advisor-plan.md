# Advisor: Issue #149 Phase 3 Plan Gate

## Verdict
Approved. Blueprint is dependency-safe, integration points accounted for. Three refinements required.

## Refinement 1 — CHANGELOG moves to Phase 6 (doc-updater)
Task G (CHANGELOG) belongs in Phase 6, not Phase 4. The issue #148 pattern: doc-updater in Phase 6 added the CHANGELOG entry. Drop Task G from Phase 4. Move "Breaking/Upgrade: set `KAOLA_WORKTREE_NATIVE=1` to preserve prior behavior" to a note for Phase 6's doc-updater to pick up via the Documentation Update Checklist. Avoids dual ownership.

## Refinement 2 — Line numbers are stale-able; grep fresh in Phase 4
Architect's line numbers (runClaimOnline at 410-415, runClaimOnlineLastJson at 430-435, GitLab bypass at 919-921, Gitea bypass at 916-921) were captured before Phase 4 edits. Phase 4 task instructions must say "grep for `runClaimOnline =` and `env: process.env` in test files before editing." Don't trust line numbers blind.

## Refinement 3 — Env-key ordering is load-bearing; explicit callout required
The design hinges on `KAOLA_WORKTREE_NATIVE: '1'` going BEFORE `...(extraEnv || {})`. If tdd-guide reorders this, the default-OFF test silently breaks. Each Phase 4 task touching a helper's env block must explicitly say: "Insert `KAOLA_WORKTREE_NATIVE: '1',` as the FIRST key after `...process.env,`, BEFORE any `...(extraEnv || {})` spread."

## What's Solid
- Build sequence A→A2→D, B→E, C→F: correct
- Parallelization: three forge groups have disjoint write sets
- Out-of-scope items correct (codex walkthrough, runNode sites, Phase 4/6 command files, README)
- Test design (default-OFF + OFFLINE-wins-over-NATIVE) is the discriminating pair
- Validation commands per task correct
- Naming `WORKTREE_NATIVE` matches `OFFLINE` const convention

## Edge Cases (not blueprint flaws)
- Existing active issue-149 `worktree_path` Sink entry survives (fix only gates new claims)
- Post-merge: next `/workflow-next` run won't provision a worktree unless `KAOLA_WORKTREE_NATIVE=1` is exported — this is the correct intended behavior
- `KAOLA_WORKTREE_NATIVE === '1'` is strict; `true`/`yes`/`on` don't trigger — matches OFFLINE precedent

evidence-binding: n3-review 6784b83c3bd7
verdict: pass
findings_blocking: 0

# n3-review — G1 acceptance gate for issue #537 (opencode tier-label neutrality + #537 Surface 2)

IN-PLACE run on branch `feature/opencode-support`. Combined diff of n1-prose (Surface 1) +
n2-variant (Surface 2) reviewed against the frozen acceptance checklist. All six items GREEN.

## Checklist evidence

1. ×4 schema byte-identity + canonical tokens untouched — GREEN
   - `node scripts/validate-script-sync.js` → "26 common scripts, 25 byte-identical groups, 9
     rename-normalized families, and 1 config/hooks.json family in sync." EXIT=0.
   - `cmp` of scripts/ vs plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/
     scripts/kaola-workflow-adaptive-schema.js → all three "OK" (byte-identical).
   - `git diff HEAD -- scripts/kaola-workflow-adaptive-schema.js` shows NO change to
     `NODE_MODEL_TIERS = Object.freeze(['opus','sonnet'])` (line 49) or
     `TIER_RANK = Object.freeze({ opus:'top', sonnet:'second' })` (line 86); both confirmed
     verbatim post-diff. Canonical cross-edition tier vocabulary intact.

2. Prose rewrite structurally scoped (#534 discipline) — GREEN
   - `git diff HEAD -- scripts/sync-opencode-edition.js` touches exactly the 5 named generator
     constants: `opencodeAgentSuffix` mapTier prose (3 lines), `OPENCODE_BADGE_BLOCK` mapTier
     line (1), and the 3 `transformCommandBody` rewrite strings. Every `-`/`+` hunk is a
     literal opus/sonnet→reasoning-tier/standard-tier rewrite of those constants; no over-broad
     regex, no collateral. The internal `roleTier === 'opus'` logic and comments are untouched
     (not in the diff).

3. Acceptance grep clean — GREEN
   - `rg -wn "opus|sonnet" .opencode/command/` → ZERO matches (GREP_EXIT=1).
   - Residual `.opencode/agent/` hits are ALL canonical/acceptable: the planner body's
     `{opus,sonnet}` model-column vocabulary (workflow-planner.md:102-168) and the table-cell
     `| opus |` join-tier, plus a pre-existing doc-updater.md:14 `local-override:` note — none
     are tier-label leaks at the opencode DISPLAYED effort surface. The n1
     `workflow-planner.md` diff is suffix-only (the appended "## opencode effort tiers (mapTier)"
     section, lines ~440); canonical body unchanged.

4. claude/codex behavior-inert — GREEN
   - `dispatchEffort` (codex twin, schema.js:61-65) takes ONLY `model`, emits only
     `codex_reasoning_effort*` — no env read, no provider resolution.
   - `dispatchEffortOpencode` is the opencode twin; emits only `opencode_variant*` keys that
     claude/codex never read. Sole buildDispatch call site
     (kaola-workflow-adaptive-node.js:1057) is the 2-arg form; the 3rd `env` arg defaults to
     process.env via `resolveOpencodeProvider(env)` (`env || process.env`).
   - `KAOLA_OPENCODE_INHERIT_MODEL` is the established opencode inherited-model env
     (sync-opencode-edition.js:41/303-304 detectInheritModel), "provider/model" form; reused
     with identical `slice(0, indexOf('/'))` semantics. resolveOpencodeProvider is PURE
     (no fs/forge-CLI/sibling-path). UNSET → null → role_default (backward-compat: case 8).

5. Tests green — GREEN
   - `node scripts/test-opencode-edition.js` → "opencode-edition test passed (278
     assertions)." EXIT=0. New S2 block (neutral tier-label no-leak check, section-scoped to
     the badge block + opus-tier/sonnet-tier markers + the planner suffix) passes.
   - `node scripts/test-adaptive-node.js` → "adaptive-node tests passed (1018 assertions)."
     EXIT=0. New D451 cases 6-9 (env-resolved provider, dispatch-surface buildDispatch with
     process.env) pass; existing null-branch (case 8) + explicit-provider cases preserved.
   - `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed."
     EXIT=0 (claude chain; canonical internal tokens untouched).

6. Write-set containment — GREEN
   - `git status --short`: only the declared write-set files — n1 (.opencode/agent/workflow-
     planner.md + 10 .opencode/command/*.md, scripts/sync-opencode-edition.js,
     scripts/test-opencode-edition.js) and n2 (scripts/kaola-workflow-adaptive-schema.js + 3
     edition twins, scripts/test-adaptive-node.js) — plus the expected workflow-internal
     `kaola-workflow/.roadmap/issue-537.md` (staged) and `kaola-workflow/issue-537/` (untracked).
     No stray files, no cross-contamination between n1 and n2 disjoint write sets.

## Verdict: PASS — APPROVE

No blocking findings. n1 (Surface 1: structurally-scoped neutral tier labels) and n2 (Surface 2:
pure env-resolved provider for dispatchEffortOpencode) both meet acceptance. Byte-identity,
canonical tokens, scope discipline, grep cleanliness, claude/codex inertia, test gates, and
write-set containment all hold.

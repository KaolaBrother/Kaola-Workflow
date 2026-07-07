evidence-binding: n3-review d287751ce0c9
verdict: pass
findings_blocking: 0

## n3-review — code review of #636 cross-runtime dispatch-pin single-sourcing (APPROVE)

Scope: full git diff vs merge-base 08ed5231 — exactly the 12 declared files (write-set clean; only untracked kaola-workflow/issue-636/ state dir besides). Cross-checked vs .cache/n1-plan.md + .cache/n2-fence.md.

### 1. Orphaned-assertion sweep — CLEAN (0 orphans)
Repo-wide grep (all .js under scripts/ + plugins/) for every fenced token, traced each to its current target:
- Codex effort tokens (fork_turns:"none", reasoning_effort: dispatch.codex_reasoning_effort, fresh child-session effort proof, codex_effort_override_unavailable): remaining targets = T5b loop (test-route-reachability.js SKILL-only), codex validator SKILL, gitlab/gitea SKILL. 0 orphans.
- #611-fork tokens (`on EVERY dispatch, tiered or not`, `the unconditional mandate applies identically…`): remaining = root planRunSurfaces611ForkTurns (SKILL-only) + mirror, codex SKILL-only loop, gitlab/gitea direct SKILL paths. 0 orphans.
- `not a valid path for tiered nodes` ban: all 5 sites SKILL-only. 0.
- Teammate tokens (`NAMED teammate`, `send EXACTLY ONE request…`): remaining = T14 (command-only), root/mirror planRunSurfaces606 (command-only), gitlab/gitea command paths; codex github-SKILL #606 block DELETED. 0 orphans.
- Deleted: root #582 command-side block (5 asserts) + codex #606 SKILL-side block (2 asserts) — matching surfaces that lost the tokens. test-opencode-edition.js references only untouched PINs — unaffected.

### 2. #611-fork SKILL-only shrink — LANDED IN ALL FOUR validators
Every assertion of `on EVERY dispatch, tiered or not` resolves to a …/skills/kaola-workflow-plan-run/SKILL.md path: root (SKILL-only planRunSurfaces611ForkTurns), byte mirror, codex validator (command entry dropped from loop), gitlab/gitea relocated post-loop blocks. NO command-surface assertion of the #611-fork tokens anywhere. codexJoinProtocolSurfaces611/claudeJoinProtocolSurfaces611 + #598 AC4 symmetric loop untouched.

### 3. Byte mirror — INTACT
diff scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js → empty; diff-vs-HEAD hunks hunk-for-hunk identical; validate-script-sync.js green (25 byte-identical groups).

### 4. mr|pr) finalize-sink pins — UNTOUCHED (gitlab :296/:335, gitea :303/:342; not in diff).

### 5. Fenced blocks gone / native + always-live tails preserved
- Residual fenced-token count: 0 on all 3 commands (Codex tokens) + all 3 SKILLs (teammate tokens).
- github command: always-live `Dispatch the base role profile…` intact at :170-171; Teammate-Mode + <!-- PIN: teammate-mode --> at 186; END splice clean (`Pass dispatch.nonce… Instruct the role to:` at 222 heads the untouched bullet list).
- forge commands (TWO-splice hazard): correctly handled — :219-220 read `…is only`/`descriptive). Pass dispatch.nonce… Instruct the role to:` — the fused always-live base-dispatch sentence survived. gitlab/gitea prose hunks identical.
- SKILLs (all 3): `## Dispatch` (72) + <!-- PIN: codex-dispatch --> (74) intact; `## Codex Join Protocol` (99) intact w/ dispatch.wait_budget_minutes + A-F; always-live tail at 242 with its "reasoning-effort rule above" referent (retained Codex block) surviving.

### 6. Oracles — ALL GREEN (run by this reviewer)
test-route-reachability.js (239 assertions), all 4 validate-*-contracts.js, validate-script-sync.js exit 0. FULL four-chain run npm run test:kaola-workflow:{claude,codex,gitlab,gitea} sequentially all GREEN incl all 6 walkthroughs + edition-sync.js --check. (mid-chain EISDIR/gh-network/"N chains failed" lines are planted-fault fixtures inside tests that PASSED: adaptive-node 1478 assertions, claim-hardening 169, run-chains 146.)

### Non-blocking observations
- Deleted #582 block's assertNotIncludes('commands/…','`sonnet`/absent') ban now exists only SKILL-side (T5b) — correct by construction (phrase lived inside the removed Codex block, can't recur on commands).
- CHANGELOG/docs intentionally absent from this diff (owned by n5-docs/n6-finalize).

### Summary: CRITICAL 0 / HIGH 0 / MEDIUM 0 / LOW 0 → APPROVE. Faithful to the verified edit map; #611-fork correction in all 4 validators; no orphaned assertion; byte mirror + mr|pr contracts intact; targeted oracles + full four-chain suite green.

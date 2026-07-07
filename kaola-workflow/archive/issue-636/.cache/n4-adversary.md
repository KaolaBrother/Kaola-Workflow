evidence-binding: n4-adversary a79443223a4f
verdict: pass
findings_blocking: 0

## n4-adversary — CHANGE-GATE adversarial verification of #636 (NOT-REFUTED, high confidence)

Repo byte-clean (tree hash identical before/after; wrote nothing). Change-gate (post-dominates code node n2-fence → verdict-check relevant). Claim: the #636 single-sourcing of cross-runtime dispatch pins is correct + complete + regression-free.

### Attack 1 — orphaned assertion / four-chain-red hole (the KNOWN risk): NOT FOUND
Swept scripts/*.js + plugins/*/scripts/*.js for every relocated token, inspected the arrays behind every loop hit:
- #611-fork tokens (`on EVERY dispatch, tiered or not`, `the unconditional mandate applies identically to this dispatch mode`): validate-workflow-contracts.js:1012-1013 (planRunSurfaces611ForkTurns :1005-1010 = 3 SKILL paths only), validate-kaola-workflow-contracts.js:810-811 (loop :807-809 SKILL only, command entry gone), gitlab :818-819 + gitea :823-824 (explicit /skills/). ZERO command-surface assertions.
- Codex effort tokens (fork_turns/reasoning_effort/effort-proof/codex_effort_override_unavailable + `not a valid path for tiered nodes` ban): T5b array (test-route-reachability.js:185-189) = 3 SKILLs; #582 command block DELETED from both root validators; gitlab/gitea explicit SKILL paths. All SKILL-only.
- Teammate tokens (NAMED teammate, send EXACTLY ONE request): T14 (test-route-reachability.js:451-455) = 3 commands; planRunSurfaces606 (root :972-976) = 3 commands; github-codex SKILL-side #606 (:642-644) DELETED; gitlab/gitea explicit commands/ paths. All command-only.
- Extended sweep of EVERY other removed-block phrase (turn_context.effort, codex features list, max-effort profile suffix, variant-missing, compact identity header, Node|Role header, CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS, SendMessage, Idle-race, idle notification, transport-never-the-contract, Teammate-Mode) across all test/validate/simulate scripts: ZERO prose assertions.
- Near-miss cleared: github codex validator #598 loop asserts `an inline gate reviewing its own writer-context is no gate` on the ROOT COMMAND; raw grep = 0 because token line-WRAPS at commands/kaola-workflow-plan-run.md:89-90; NOT an orphan (assertIncludes norm() collapses whitespace; token present wrapped; validator green). #598 never in the fenced region.
- Reverse orphan (new PIN markers tripping a closed-set check): NO validator enumerates/counts/assertNotIncludes PIN markers; the 2 new markers are inert.

### Attack 2 — empirical oracles: ALL GREEN (7/7 exit 0)
test-route-reachability.js (239 assertions), validate-workflow-contracts.js, validate-kaola-workflow-contracts.js, gitlab contracts, gitea contracts, validate-script-sync.js (24 common + 25 byte-identical groups), edition-sync.js --check (10 forge ports parity).

### Attack 3 — fences gone, native preserved: CONFIRMED
- 0 residual Codex tokens on all 3 commands; 0 residual teammate tokens on all 3 SKILLs.
- Commands keep <!-- PIN: teammate-mode --> + #### Teammate-Mode Dispatch (github 186-187; forges 183-184) + always-live tail. FORGE START-SPLICE HAZARD DID NOT FIRE: gitlab + gitea both read `Dispatch the base role profile in dispatch.agent_type (legacy dispatch.role is only`/`descriptive). Pass dispatch.nonce (evidence-binding token). Instruct the role to:` at :219-220 — base-dispatch sentence survived. Github keeps separate sentence :170 + clean tail :222.
- SKILLs keep ## Dispatch (:72) + <!-- PIN: codex-dispatch --> (:74) + ## Codex Join Protocol (:99) + always-live tail :242-243 whose reasoning-effort-rule-above referent still resolves.

### Attack 4 — byte mirror + contracts: CONFIRMED
diff of the two validate-workflow-contracts.js → empty. mr|pr) finalize-sink pins present gitlab :296/:335 + gitea :303/:342, outside every diff hunk (forge diffs touch only :789-830).

### Attack 5 — scope creep / pin-family symmetry: NOT FOUND
git status --porcelain = exactly the 12 declared files + untracked issue-636 state dir; tree hash identical. Forge diffs = the declared three-way split; #602/#604/#605/#607/#611-join remain in shared symmetric loops untouched; #598 untouched. Change-hunks byte-identical across editions.

### Verdict
NOT-REFUTED (high confidence) — every attack vector executed incl the shaping-run adversary's specific four-chain-red scenario, all failed to falsify; the one anomaly (#598 wrapped-token grep miss) proven benign. verdict: pass, findings_blocking: 0.

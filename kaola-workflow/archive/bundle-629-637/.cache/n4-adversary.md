evidence-binding: n4-adversary 334555f61c9d
verdict: pass
findings_blocking: 0
finding: id=R1 scope=pre_existing action=follow_up status=deferred severity=low fix_role=none rationale=edition-sync runCheck (--check) covers only GENERATED_AGGREGATORS, stays green on a missing COMMON/byte-group mirror; validate-script-sync covers them IN-CHAIN so the enrollment loop is fail-closed end-to-end; PRE-EXISTING --check/--write asymmetry (not introduced by this bundle), optional follow-up → will FILE
finding: id=R2 scope=pre_existing action=none status=deferred severity=low fix_role=none rationale=checkManifest token scoping is whole-file not block-interior (pre-existing checker design); equivalence holds for fn-closure-audit today (all sink_incomplete occurrences sit inside the closure-audit region, its PIN is the last marker per surface); not actionable in this bundle → noise

## n4-adversary — CHANGE-GATE adversarial verification of bundle-629-637 (NOT-REFUTED, high confidence)

Repo BYTE-CLEAN (all 12 plant-target hashes match baseline; git status = only pre-existing untracked state). 7 live plants, each fully reverted; fast oracle green twice (clean baseline + post-restore).

### #629 guards bite (all 4 directions)
- hooks.json real-divergence: pushed a synthetic PreToolUse matcher into plugins/kaola-workflow-gitea/hooks/hooks.json → validate-script-sync.js exit 1, drift names exactly that port (compact-context-normalized for gitea). Restored ba509a8e.
- OVER-NORMALIZATION probe: renamed the kaola-workflow-pre-commit token (a .sh hook, NOT compact-context) to its forge name in the gitea copy → STILL RED (normalizeHooksJson rewrites only the compact-context token, cannot green a non-sanctioned divergence). Diffed root↔gitea at HEAD: entire real diff = the single compact-context command line, so normalization masks nothing today.
- agents.toml byte plant: appended a divergent byte to the gitlab copy → RED. All 3 share blob 14338ef7 at HEAD ("green at HEAD" true).
- CREATE-ON-MISSING both steps: deleted plugins/kaola-workflow-gitea/config/agents.toml (step c) AND codex COMMON mirror plugins/kaola-workflow/scripts/kaola-workflow-claim.js (step b) → validate-script-sync exit 1 with both under Missing files (fail-closed); edition-sync --write printed byte-sync + codex-sync and CREATED both byte-identical to baseline (14338ef7, 300dcec1); validator green after; zero residue. Pre-fix skip was structural (removed guard fs.existsSync(...) && ... short-circuits absent mirror to no-write).
- Clean-tree run green with new families counted (26 byte-identical groups, 2 hooks.json families) — non-vacuous both directions. codex tree has no hooks/hooks.json (only .sh hooks; ships config/hooks.json under CONFIG_HOOKS_FAMILY).

### #637 guard bites
Replaced every sink_incomplete in commands/kaola-workflow-finalize.md with a dummy while keeping the <!-- PIN: closure-audit --> marker + 5 remaining closure-audit occurrences (the EXACT pre-#637 vacuous-green state) → test-route-reachability.js exit 1 with `missing-token: block fn-closure-audit token "sink_incomplete" absent from commands/kaola-workflow-finalize.md`. Restored 26b12fe0. sink_incomplete present on all 6 finalize surfaces. checkManifest matches whole-file (:597-601) but all occurrences sit inside the closure-audit region (its PIN is last marker) → whole-file ≡ block-interior today (R2).

### Refactor safety
Planted simultaneous drift into all 3 PRE-EXISTING family kinds — CONFIG_HOOKS_FAMILY (gitea config/hooks.json), a pre-existing byte group (gitlab install-codex-agent-profiles.js), RENAME_NORMALIZED (gitea kaola-gitea-workflow-compact-context.js) → all RED with original message shapes. Line-compared extracted primitives vs old inline loops: identical missing/continue semantics, identical Buffer-vs-utf8 comparison, identical drift strings (only OK summary line cosmetic).

### 0 chains red / no scope creep
Fast oracle all exit 0: validate-script-sync.js, test-validate-script-sync.js (40), test-edition-sync.js (35), edition-sync.js --check, test-route-reachability.js (283), the 4 chain contract validators, generate-routing-surfaces.js --check (12). git diff 9bcfdcc1..HEAD --name-only = exactly the 6 declared code files + 2 .cache; NO hooks.json/agents.toml data file written. (One transient false alarm: plugins/kaola-workflow/scripts/validate-workflow-contracts.js fails invoked from repo ROOT — installed-tree copy no chain invokes from root; out-of-contract invocation, not a bundle defect.)

### Verdict
NOT-REFUTED (high confidence) — every guard bites on real planted drift in both new and pre-existing families, #637 token reds the exact historic vacuous-gut scenario, refactor behavior-preserving, fast oracle fully green, diff scope-exact with no data-file writes, repo byte-clean. verdict: pass, findings_blocking: 0. 2 pre-existing non-blocking findings (R1 filed as follow-up, R2 noise).

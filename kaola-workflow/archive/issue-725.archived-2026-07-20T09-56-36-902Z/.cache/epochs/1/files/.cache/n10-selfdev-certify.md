evidence-binding: n10-selfdev-certify 5027b7a848d8
contract_version: 2
plan_schema_version: 2
behavior_contract_version: 2
review_context_hash: e64c314f15f958e2eb9511a5f0c459a432241e60f419435cf83de25af00ffc7a
review_context_path: kaola-workflow/issue-725/.cache/review-contexts/e64c314f15f958e2eb9511a5f0c459a432241e60f419435cf83de25af00ffc7a.json
behavior_contract_hash: 42b6332c311ce07c511d67d3c7fb02cf874ab94872aaee87fadae2d0577fa789
resolved_profile_hash: 4f9e7c9aad33216895b1e618d06ad1bfb3beeea55af7094643af59ec927c8b6a
candidate_digest: 78fbd779e2a6b2316fe9acabd96b73f7f2671e9501d0c4920d5f71c49e4e9360
gate_mode: change_gate
gate_aggregation: sequence
upstream_read: n9-selfdev-guard c2c63a3d893e
gate_claim: the detectReviewRuntime self-dev guard runs before the opencode tail-pattern, returns claude exactly when a sibling package.json names kaola-workflow, cannot swallow a genuine opencode install layout, is mirrored identically across all four adaptive-node editions, and the new companion test seeds a fixture checkout literally named kaola-workflow and proves the guard red-to-green while all existing runtime-detection tests stay green
gate_surface: the n9-selfdev-guard diff vs run base 1491c7e5 — the four adaptive-node editions and test-adaptive-node.js
domain_outcome: approved
verdict: pass
findings_blocking: 0
review_summary: no_blocking_findings
findings_none: The self-dev guard is correctly ordered before the opencode tail-pattern, unreachable by any genuine opencode/kimi/claude/codex install layout, byte-identical across all four editions, and pinned red-to-green in both regression directions by the new hermetic fixture; both required re-runs are green.

## Review narrative

Candidate inspected: worktree HEAD a94ea0b7, five-file surface vs run base 1491c7e5 — exactly +14 lines in each of the four adaptive-node editions (the guard block) and +23 in scripts/test-adaptive-node.js (the fixture), matching the frozen write set. Review context read first; validation_obligations is empty, review_phase discovery, no prior findings.

### Guard placement vs every earlier branch (root edition, scripts/kaola-workflow-adaptive-node.js:784-838; guard at 815-828)

Traced detectReviewRuntime against the issue #736 repro (a probe rooted at a checkout literally named kaola-workflow/scripts with a sibling package.json named kaola-workflow, e.g. a default-named clone):
1. KAOLA_WORKFLOW_RUNTIME override (L785-786): fires only on an explicit operator setting; an explicit override beating inference is the intended semantics (pinned by #717[override]), so the guard sitting after it is correct, not a shadow.
2. Codex source-tree pattern (L787): requires a literal plugins/ parent segment; the repro path has none. A checkout under plugins/ classifying codex is the established #717[source-tree] behavior, unchanged.
3. Codex installed-cache tuple (L795): requires plugins/cache/<marketplace>/<edition>/<version>/scripts; cannot match the repro.
4. Kimi branch (L803-808): realpath equality with <kimi-home>/kaola-workflow/scripts or a .kimi-code tail; the repro checkout is neither inside a kimi home nor under .kimi-code — no shadow.
5. Claude-install .claude tail (L814): cannot match the repro, and would return claude anyway (the same answer the guard produces), so even the exotic overlap is not a wrong-runtime shadow.
The guard (L822-828) therefore fires strictly before the swallowing opencode tail-pattern (L834) and no earlier branch can capture the repro — the "acceptable ordering only if" condition in the gate direction holds. Predicate parity confirmed: package.json name === 'kaola-workflow' is the same self-dev predicate kaola_script() uses (scripts/sync-opencode-edition.js:238).

### False-positive analysis for genuine installs

- Genuine opencode: install-opencode.sh install_support_scripts() copies only manifest-listed files into <config>/kaola-workflow/scripts/ (install-opencode.sh:269-277); nothing is ever placed at <config>/kaola-workflow/package.json. The guard's readFileSync therefore throws ENOENT and the catch falls through to the opencode branch unchanged. The #712/#717[opencode-unchanged] fixture (scripts/test-adaptive-node.js:18392-18405) seeds exactly that layout (seedScripts copies only three script siblings, no package.json) and now exercises the guard's fall-through path — it stayed green. A package.json at that path with a different name, or unparseable, also falls through. The only layout the guard reclassifies is a literal kaola-workflow repo checkout occupying the support dir — self-dev-in-place, where claude is the defensible answer.
- Genuine kimi: the kimi branch fires before the guard via the realpath compare (custom $KIMI_CODE_HOME included), so the guard is unreachable; kimi-unchanged fixture green.
- Claude installs and both codex layouts are captured by their earlier branches; the guard is unreachable for all of them.

### Four-edition mirror fidelity

The #736 guard block is byte-identical (cmp of the extracted block) across scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, and plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js. validate-script-sync.js green additionally enforces full-file claude-codex byte identity (COMMON_SCRIPTS entry, scripts/validate-script-sync.js:64). A rename-normalized full-file diff of the gitlab/gitea ports against root shows only the expected @generated header plus one artifact of my own normalization inside a pre-existing comment — no real drift.

### Re-red verification (read-only mutation reasoning)

The probe harness (scripts/test-adaptive-node.js:18214-18228) spawns a fresh node process that require()s the FIXTURE's own copy of adaptive-node.js, so __dirname genuinely roots at the fixture scripts dir, with hermetic HOME and KAOLA_WORKFLOW_RUNTIME/KIMI_CODE_HOME/KAOLA_AGENT_DIR scrubbed. With the guard absent, the #736 fixture path <tmp>/kaola-workflow/scripts matches no earlier branch (no plugins/, no cache tuple, no .kimi-code or realpath match, no .claude) and does match the opencode tail-pattern, so detection returns opencode and the assertion p.runtime === 'claude' fails — exactly the pre-fix RED probe n9 recorded (runtime "opencode", profile found via opencode's third self-dev-parity candidate, so the failure lands on the runtime check, not a flaky path check). A subtler regression (guard moved below the opencode branch, or predicate broken) falls to opencode identically; the over-broad direction (guard returning claude without the predicate) is pinned red by the opencode-unchanged fixture. Historical corroboration: #736's original symptom was the pre-existing #712[self-dev] test redding in default-named clones; the new hermetic fixture makes that coverage clone-name-independent.

### Re-run outputs

- node scripts/test-adaptive-node.js: `adaptive-node tests passed (2488 assertions)`, exit 0 (assertion count matches n9's run; the two `fatal: .git/index...` / `fatal: not a git repository...` stderr lines are expected crash-repair fixture output).
- node scripts/validate-script-sync.js: `OK: 22 common scripts, 26 byte-identical groups, 5 rename-normalized families, 2 hooks.json families (config + hooks dir), and 7 forge export-superset families in sync.`, exit 0.

review_attestation: full_review_completed
review_conclusion: The n9 self-dev guard is correctly placed before the opencode tail-pattern, provably unreachable for genuine opencode and kimi installs, mirrored byte-identically across all four editions, and genuinely pinned by the new hermetic fixture; both required re-runs are green, so the gate passes with zero findings.

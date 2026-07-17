evidence-binding: n5-falsify-review-gate-fixes 64eaea6a2837
contract_version: 2
plan_schema_version: 2
behavior_contract_version: 2
review_context_hash: 68e499675ca0f074b42beaa8459c498b41b70c9fecf50f86d932acb86d39364e
behavior_contract_hash: 0ad9331a05da66b2b18f4eb67facd1b686bd9dd3e8b5398399d4738cafed6e9b
resolved_profile_hash: 14c89a924b21c9291cf8a00759202b8846a5dac4e891bb8a3e625e85efc7b2ce
candidate_digest: b8b618a4f2ef7a056e9ef535cd5bd2105a54083b319ecabbb2af9b8d6d342a97
gate_mode: change_gate
upstream_read: n4-code-review 483d04c1c98f

## Falsification record

Review context read first: validation_obligations: [] — zero inherited obligations, no receipt owed; zero repo writes (fixtures under $TMPDIR/kw-n5*). Issue bodies retrieved via GitHub API.

### A. Runtime-layout matrix — candidate (683e4171) vs BASE (a1b3a1ed) on byte-identical fixtures
21 subprocess cells + 19 pure-regex path cells + 1 cwd-decoy cell; BASE scripts via git show a1b3a1ed; hermetic HOME, scrubbed KAOLA_WORKFLOW_RUNTIME/KIMI_CODE_HOME/KAOLA_AGENT_DIR.
- Intended-fix cells: claude-native (base review_profile_unavailable -> candidate ok/claude), claude-native-envdir, codex-cache x3 editions (base refused -> candidate ok/codex bound to exact version-dir TOML), claude-forge-gitlab-dir (ok/claude), override-bogus-ignored (path detection applies).
- Counterexample 1 (candidate reorder binds wrong profile): claude-both stale-legacy + fresh-native -> binds legacy, but BASE bound identical path, same runtime, valid self-hash. Does not survive.
- Counterexample 2 (garbage first candidate masks valid second): refuses review_profile_role_mismatch with no fallback — BASE refuses identically; first-accessible-candidate-wins matches opencode/kimi branches. Does not survive.
- Counterexample 3 (sharpest wrong-runtime binding): claude install + .opencode/agent/code-reviewer.md decoy -> BASE silently binds decoy as opencode; candidate binds native claude profile as claude. Second decoy cell (~/.claude/agent/ only) is the single base-ok->candidate-refuse cell, but the base pass was precisely the #712 misbinding; fail-closed refusal is the fix. Does not survive; confirms the claim.
- Regression cells all identical-or-correct: self-dev+native-decoy, codex source-tree, kimi ($KIMI_CODE_HOME and default), opencode install, opencode nested under .claude dir (carve-out does not swallow it), unknown fail-closed, override=codex on claude layout, =claude beating cache tuple.
- Regex battery (19 strings): Windows/UNC tuples match; trailing slash, empty marketplace/version, two-segment version, wrong/prefixed/suffixed plugin, near-miss gitl/gitlabx, deep marketplace — all fail-closed. Case-drifted .CLAUDE routes as BASE (pre-existing).

### B. Preflight role-classification matrix (#716) — real CLI, fresh --global install into temp HOME
12 cells: (a) issue-body mixed plan -> exit 0 ok, roles_checked = 16 delegated, zero fabricated built-in profiles; (b) unknown delegated -> exit 3 role_not_in_template naming it; (d/d2) case variants Finalize/MAIN-SESSION-GATE -> exit 3 (exact-match only); (e*) near-misses -> exit 3; (f) only-builtins -> exit 0; (g) duplicated -> exit 0; (h) whitespace-padded -> trimmed exit 0; (c) deleted implementer.toml -> exit 1 profiles_missing. gitlab/gitea mirror CLIs byte-identical outcomes; sha256 56455fcd...18c77 x4.

### C. One-byte drift experiments ($TMPDIR clone)
- gitlab preflight mirror byte inside PLAN_BUILTIN_NON_DELEGABLE_ROLES: caught by all three validators.
- gitea adaptive-node port byte inside #717 regex: caught by edition-sync --check (owner of the rename-normalized family); passes validate-script-sync/contracts by design (coverage split pre-existing).
- codex adaptive-node mirror byte: caught by validate-script-sync and edition-sync.

### D. Independent re-runs
test-adaptive-node.js 2425 passed; simulate-workflow-walkthrough.js passed incl. testReviewerContractV2Conformance; test-install-model-rendering.js passed; test-kimi-edition.js 577; test-opencode-edition.js 547; edition-sync --check 12/25/28 parity; validate-script-sync OK; validate-kaola-workflow-contracts passed. Identity-binding call path spot-checked (:1238 from :5476/:9272/:6154/:6757; close :1582). Forge ports carry new regexes byte-intact.

No counterexample survives: every layout cell matches base or differs exactly in the intended fix direction; every refusal fail-closed and base-identical; override precedence intact; preflight matrix classifies correctly across all four copies; no single-byte drift escapes the check surface.

domain_outcome: not_refuted
claim_outcome: not_refuted
gate_claim: schema-2 review gates now open on fresh claude installs and versioned codex plugin caches, mixed-role plans pass exact-plan preflight while truly missing delegated roles still refuse, and no previously-passing runtime layout or refusal path regressed
gate_surface: runtime-layout detection and profile-resolution matrix (claude native install, claude legacy probed dir, claude self-dev, codex source-tree, codex versioned cache across all three codex editions, kimi, opencode, unknown) plus the preflight role-classification matrix (delegated, built-in non-delegable, unknown)
gate_aggregation: sequence
verdict: pass
findings_blocking: 0

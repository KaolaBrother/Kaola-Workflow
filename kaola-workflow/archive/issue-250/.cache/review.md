# Node `review` evidence — issue #250 (`implementer` adaptive role)

Read-only post-dominance gate (code-reviewer). Post-dominates all 8 write nodes.
Reviewed the full working-tree diff (nothing committed on `workflow/issue-250`) and ran all #250 feature gates.

## Review summary

The change adds a new locally-authored adaptive role `implementer` (test-first-exempt implementation:
refactors, scaffolding, config/IaC, UI, migrations, glue) verified by change-type-appropriate checks
instead of RED→GREEN. The diff is surgical and matches the explore edit-point map (T1–T9) exactly.
No security/auth/secret surface touched (enhancement only). Clean review — no blocking findings.

## LOAD-BEARING correctness — implementer ∈ the 3 Sets in ALL 4 validators (CONFIRMED)

Verified by grep + read in all four validator copies:
- scripts/kaola-workflow-plan-validator.js
- plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js              (root↔github BYTE-IDENTICAL)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js (fn-rename edition; Set edits only)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js   (fn-rename edition; Set edits only)

In every copy (lines 46–54):
- CANONICAL_ROLES  ... 'adversarial-verifier', 'implementer'        ✓ (recognition)
- WRITE_ROLES = Set([... 'security-reviewer', 'implementer'])       ✓ (may declare write set)
- IMPLEMENT_ROLES = Set(['tdd-guide','build-error-resolver','implementer'])  ✓ CRITICAL — G1 post-dominance fires for implementer nodes

Reduction satisfied: implementer ∈ CANONICAL_ROLES ∩ WRITE_ROLES ∩ IMPLEMENT_ROLES in all 4. An
implementer node therefore CANNOT ship code without a code-reviewer post-dominator (G1). Behavioral
proof: the two new assertions in simulate-workflow-walkthrough.js (in-grammar+auto-run WITH a
code-reviewer; refuse with a /G1/ error WITHOUT one) PASS in testAdaptiveValidatorGovernance.

## Byte-identity / parity (CONFIRMED)

- Resolver ×4: `'implementer': 'sonnet'` line 14; all 3 plugin copies byte-identical to root (diff -q clean; validate-script-sync OK: 5 byte-identical groups).
- root ↔ github-plugin plan-validator.js: IDENTICAL.
- 4 × implementer.toml (plugins kaola-workflow / -gitlab / -gitea + .codex/agents/kaola-workflow): all md5 6f38076a42fbb5cf4e211eeb401485d5 — byte-identical.
- 3 × config/agents.toml [agents.implementer] blocks: byte-identical.
- Codex toml count bumps 12→13 mirrored in both test scripts AND both contract validators (gitlab + gitea).
- install.sh + uninstall.sh REQUIRED_AGENTS both add "implementer" after "tdd-guide" (CANONICAL order); install.sh wires default_agent_model (sonnet), model_for_placeholder (IMPLEMENTER_MODEL), render_command_file placeholders.

## Agent profile (CONFIRMED valid local managed agent)

agents/implementer.md: `---` front matter at byte 0; name: implementer; description; tools
["Read","Write","Edit","Bash","Grep"]; model: sonnet; managed marker `kaola-workflow-managed-agent: true`
+ `locally-authored: true`; NO upstream/source-commit/sha provenance (correct for a local agent, modeled
on workflow-planner.md). Prompt Defense Baseline present. Charter matches issue #250 (three-way evidence
contract, non_tdd_reason, .cache/{node-id}.md evidence). Added to validate-vendored-agents localAgents[]
in alpha order (after contractor, before workflow-planner).

## Prose (CONFIRMED — substance consistent across editions, no tdd-guide contradiction)

- Contractor commit-bracket evidence rule extended in plan-run editions (root + gitlab + gitea, 4 hits each):
  an implementer node cannot reach `complete` without a recorded non_tdd_reason + a passing
  change-type-appropriate check (regression-green / build-green / executable smoke-integration) IN PLACE OF RED→GREEN.
- Implementer dispatch block with model="{IMPLEMENTER_MODEL}" added in all 3 plan-run editions.
- Shaping guidance (adapt command/SKILL ×3 + plan-run SKILL): default tdd-guide; implementer only for
  enumerated non-test-first category; asymmetric tie-breaker (test can be written / doubt → tdd-guide);
  "hard to test" NOT a reason; bug fixes always tdd-guide; mixed node → split or stricter role.
- workflow-planner.md + 3 workflow-planner.toml editions carry the tdd-guide-vs-implementer choice note.
- No contradiction with existing tdd-guide RED→GREEN rules — implementer is equal-burden, different-shape.

## Gate commands + REAL exit codes (captured directly via $?, not piped tail)

- node scripts/validate-script-sync.js                 EXIT=0  ("OK: 14 common scripts and 5 byte-identical file group in sync.")
- node scripts/validate-vendored-agents.js             EXIT=0  ("Vendored agent validation passed for 13 agents")
- node scripts/simulate-workflow-walkthrough.js        EXIT=0  ("Workflow walkthrough simulation passed"; testAdaptiveValidatorGovernance: PASSED — new implementer G1 assertions executed)
- npm test                                             EXIT=0  (cross-edition: claude + codex + gitlab + gitea all PASSED; install model rendering + agent-model-resolver + 12→13 codex toml-count install tests PASSED)
- install.sh dry-run: install.sh exposes NO --dry-run flag (--help: --yes/--forge/--no-settings-merge/--profile/--enable-adaptive; --profile defaults to 'higher'). The install-rendering tests inside npm test (test-install-model-rendering.js, test-agent-model-resolver.js) cover IMPLEMENTER_MODEL placeholder + profile model rendering (higher default).

## Non-blocking notes

- .codex/agents/kaola-workflow/implementer.toml is present in the working tree but `.codex/` is
  gitignored (.gitignore:4) — a local install artifact, 0 tracked files there. The SHIPPING codex source
  is plugins/kaola-workflow/agents/implementer.toml (byte-identical). Not a concern; noted for honesty.
- The 5 new files (agents/implementer.md + 3 plugin implementer.toml) are untracked (??) — expected,
  nothing is committed yet on this branch; they will land in the sink commit.

verdict: pass
findings_blocking: 0

evidence-binding: n2-review ead8160606e5
<!-- verdict: paste verdict here -->
verdict: pass
<!-- findings_blocking: paste findings_blocking here -->
findings_blocking: 0

Review summary:
- The implementation stays inside the frozen write set and uses existing sync machinery for generated aggregator, byte-identical script, and profile-TOML copies.
- The installer/preflight metadata checks are derived from config/agents.toml rather than a hardcoded role list.
- The plan-run guidance now distinguishes v2 task-name dispatch from v1 thread-id fallback and passes direct per-spawn reasoning_effort when the dispatch descriptor requests it.

Validation:
- node scripts/test-adaptive-node.js -> adaptive-node tests passed (1082 assertions)
- node scripts/test-install-model-rendering.js -> Install model rendering tests passed
- node scripts/validate-script-sync.js -> OK
- node scripts/validate-kaola-workflow-contracts.js -> passed
- node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js -> passed
- node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js -> passed

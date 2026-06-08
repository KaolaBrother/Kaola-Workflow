node: harden-editions (implementer) — plan-repair node for the 4 files #254's scope missed (surfaced by the finalize npm-test gate)
non_tdd_reason: three single-token concept-array swaps in edition contract validators (the validators ARE the harness; no separate failing-unit-test seam) + aligning an existing install test to install.sh's already-shipped #254 default-ON behavior (the validators/test ARE the verification artifacts).
regression-green: all four exit 0 —
  node scripts/validate-kaola-workflow-contracts.js -> "Kaola-Workflow Codex contract validation passed"
  node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js -> "GitLab contract validation passed"
  node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js -> "Gitea contract validation passed"
  node scripts/test-install-adaptive-config.js -> "Install adaptive-config tests passed"
Files (4): scripts/validate-kaola-workflow-contracts.js (codex), plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js (all flag-only->default + model comment, mirroring the claude validator), scripts/test-install-adaptive-config.js (case a -> bare writes enable_adaptive:true+parallel_mode:auto; case d -> =no writes enable_adaptive:false; new stale-config-trap case: stale :true + =no -> false, parallel_mode preserved; header comment updated; cases b/c/e/f/g + contractor assertions kept).
Scope note: these 4 files were intrinsic to #254's router/install changes but omitted from the issue's stated scope (the #291 edition-port lesson). Pre-existing #294 drift in the gitlab/gitea validators was left untouched.

evidence-binding: n7b-walkthroughs 341a216b5ed8
<!-- RED: paste RED here -->
RED: testAdaptiveOffStartupRefusal — AssertionError: adaptive-off startup must refuse (expected status:workflow_path_refused, got status:acquired) (pre-impl — stale assertion vs new world where adaptive is always legal)
RED: testFastStartupState — AssertionError: fast startup must exit 0 (actual exit 1, path_not_installed — fast not in installed_paths:[]) (pre-impl — fastHome with installed_paths:['fast'] not yet seeded)
RED: testGiteaAdaptive M2 finalize — AssertionError: finalize M2 status undefined (pre-impl — sandbox HOME lacked .gitconfig so git init created 'master' branch; git diff main...HEAD failed)
<!-- GREEN: paste GREEN here -->
GREEN: testAdaptiveOffStartupRefusal passes (status:acquired); testFastStartupState passes (fastHome seeded with installed_paths:['fast']); testGiteaAdaptive M2 passes (.gitconfig injected into sandbox HOME); all 6 walkthroughs pass: simulate-workflow-walkthrough.js, simulate-kaola-workflow-walkthrough.js, simulate-gitlab-workflow-walkthrough.js, simulate-gitlab-codex-workflow-walkthrough.js, simulate-gitea-workflow-walkthrough.js, simulate-gitea-codex-workflow-walkthrough.js; npm run test:kaola-workflow:{codex,gitlab,gitea} all exit 0; 30/32 claude-chain steps pass.

BLOCKING PLANNING GAP (escalate to orchestrator):
  scripts/test-install-model-rendering.js is in NO node's write set but breaks after n5-installer (complete) retired per-default installation of phase3/4/5 commands. Claude chain stays red forever without an unplanned fix.

OUT-OF-SET RED (resolves when upstream node runs):
  scripts/test-route-reachability.js T11 — 8 files lack "path_not_installed" literal; all 8 owned by n6b-residual-prose (status: pending, downstream of n7b). Will resolve when n6b runs.

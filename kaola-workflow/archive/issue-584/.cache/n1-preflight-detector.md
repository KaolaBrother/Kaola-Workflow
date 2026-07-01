evidence-binding: n1-preflight-detector 362f93163b4c
<!-- RED: paste RED here -->
RED: git diff --check previously reported trailing whitespace in plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, and plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js.
<!-- GREEN: paste GREEN here -->
GREEN: trimmed trailing whitespace in the three n1-owned test files; git diff --check returned no findings; node scripts/test-install-model-rendering.js -> Install model rendering tests passed. Prior n1 implementation coverage remains: validate-script-sync passed, live doctor reported v2-task-name for object-form config, and the GitHub/GitLab/Gitea Codex script suites passed.

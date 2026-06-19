evidence-binding: n4-classifier 00908e4bee95
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: Config-shape default change in readOrCreateConfig — swaps a retired boolean field for the new array field; no natural failing unit test exists for a default-object field value; behavior is verified by the n7b walkthrough chains and n7 contracts, not by a new unit assertion.
<!-- regression-green|build-green|smoke-integration -->
regression-green: 
  validate-script-sync: OK — 26 common scripts, 25 byte-identical groups, 9 rename-normalized families, and 1 config/hooks.json family in sync. EXIT: 0
  node -c all 4 files: PARSE OK (scripts/kaola-workflow-classifier.js, plugins/kaola-workflow/scripts/kaola-workflow-classifier.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js)
  grep enable_adaptive across all 4 files: zero matches (grep exit code 1)

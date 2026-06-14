evidence-binding: n8-walkthroughs 6792f7a25638

non_tdd_reason: Test/walkthrough harness updates so the codex chains assert the post-#451 install (14 base profiles, zero -max). No new behavior to TDD; these ARE the tests — verified by running the github-codex walkthrough GREEN and flipping the forge count asserts run by the forge chains (proven at the n12 four-chain gate).

verification_tier: regression-green
- github-codex simulate-kaola-workflow-walkthrough.js: deleted the entire `test405MaxVariants` function (committed -max derivation/idempotence/install black-box) + its call site; flipped the three fresh-install count asserts 20 -> 14 (tomls.length, manifest.roles.length, manifest.files entries). Run => exit 0 "walkthrough simulation passed" (the fresh install now places exactly 14 *.toml, confirming n5's deletions).
- gitlab + gitea forge-codex walkthroughs: removed the `if (!planRun.includes('model_variant_missing') || !planRun.includes('<role>-max'))` SKILL-prose check (n9 removes that prose); gitlab descriptive comment de-#405'd.
- gitlab + gitea test-*-workflow-scripts.js: flipped the install-count asserts 20 -> 14 (the readdir `.toml` count + `tomls.length` + `manifest.roles.length`), each run by BOTH the forge and forge-codex walkthroughs in the gitlab/gitea chains.
- All 5 files: node --check OK; 0 residual `model_variant_missing` / count-20 asserts.

write_set: plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js

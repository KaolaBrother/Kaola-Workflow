evidence-binding: n2-engine b72a772f6b88
<!-- RED: paste RED here -->
RED: testCodexPreflight571 test(a) RED-discriminator — AssertionError: "#571 test(a) RED-discriminator: global-only install must pass preflight, got 1\n{\"status\":\"profiles_missing\",...}" (pre-impl; old gate inspects project scope only, project absent → profiles_missing, exit 1)
<!-- GREEN: paste GREEN here -->
GREEN: testCodexPreflight571 test(a) RED-discriminator passes; all four chains green: claude (simulate-workflow-walkthrough + test-install-model-rendering), codex (Kaola-Workflow walkthrough simulation passed), gitlab (testGitlabPreflight571 PASSED), gitea (testGiteaPreflight571 PASSED); validate-script-sync: 25 byte-identical groups in sync

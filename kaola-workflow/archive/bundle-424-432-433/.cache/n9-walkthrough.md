evidence-binding: n9-walkthrough 921070ccf698

RED: testBundle424432433NodeSeeding — TypeError/ReferenceError: testBundle424432433NodeSeeding is not defined (function absent from registry; calling it in the test runner raises an error before any assertion runs)

GREEN: testBundle424432433NodeSeeding passes; 12/12 assertions green across scenario 7 (doc-updater .md targets: allowband pass + mutation guard) and scenario 6 (open-next evidence seeding: file created, binding line format, tdd-guide role stubs, evidence_file/required_tokens in JSON, crash-resume idempotency); all 4 edition walkthroughs pass with mirrored testCodexBundle424432433NodeSeeding / testGitlabBundle424432433NodeSeeding / testGiteaBundle424432433NodeSeeding

regression-green: node scripts/simulate-workflow-walkthrough.js → EXIT 0; all 4 chains green (claude/codex/gitlab/gitea) — plan repair added test-install-manifest-single-source.js to n9 write set; anchor updated to kaola-workflow-run-chains.js (the new last SUPPORT_SCRIPTS entry)

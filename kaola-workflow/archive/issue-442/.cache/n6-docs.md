evidence-binding: n6-docs ea7a1dbe0b4b
doc-updater updated 3 docs surfaces (read D-442-01.md + scripts/kaola-workflow-release.js for accuracy):
A) docs/conventions.md ## Release: new '### Release cutting (kaola-workflow-release.js)' subsection — --verify (offline verification:offline never silent pass; changelog_incomplete missing:[n]; #432 chain-receipt greenness), --cut --version (missing_version/non_monotonic_version/lockstep_violation refusals; 5 atomic bump steps; .cache/release-receipt.jsonl crash-resume; idempotent re-run), --push (forge-neutral, no CLI), registration-surface verdict (COMMON_SCRIPTS + forge family, NOT SUPPORT_SCRIPT_NAMES).
B) README.md ## Release versioning: one paragraph on kaola-workflow-release.js (--verify/--cut/--push) cross-referencing conventions + D-442-01.
C) docs/README.md decision index: D-442-01 entry added.
ORCHESTRATOR CORRECTION: doc-updater's conventions line said non-monotonic is measured vs 'package.json version'; the real guard (line 376 lastTagVersion) compares vs the last kaola-workflow--v* TAG. Main session corrected the clause to 'the last released version — the most recent kaola-workflow--v* tag' to prevent doc drift (file in n6 declared write set).
Scope: git status shows only the 3 declared docs files modified by this node (package.json + validate-script-sync.js + untracked files are prior-node, pre-baseline).

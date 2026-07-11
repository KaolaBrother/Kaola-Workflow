evidence-binding: n2-fence-parser-and-hermetic-fixtures 398b6320c00d
RED: `node scripts/simulate-workflow-walkthrough.js` exited 1 before implementation: `backtick decoy and language tag: fenced decoy must not be selected` at `testClassifierSectionBodyFenceIdentity`.
GREEN: The same walkthrough completed with `Workflow walkthrough simulation passed`; GitLab and Gitea native forge suites both completed with their edition pass sentinels.

Assigned task: n2-fence-parser-and-hermetic-fixtures — repair fence-aware section identity and make the acquired GitLab claim fixtures hermetic.

Write set:
- scripts/kaola-workflow-classifier.js
- plugins/kaola-workflow/scripts/kaola-workflow-classifier.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js
- scripts/simulate-workflow-walkthrough.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js

Tests changed:
- Root walkthrough now directly exercises the root/Codex common `sectionBody` contract with backtick/tilde fenced decoys, language tags, longer opening runs, shorter non-closing delimiters, adjacent boundaries, an in-section fenced h2, duplicate genuine headings, and unclosed-fence ambiguity.
- GitLab and Gitea native drivers exercise their hand ports directly with the same fence families and ambiguity cases.
- The obsolete pre-section-unclosed fixture now expects fail-closed absence instead of treating a heading inside malformed fencing as authoritative.
- GitLab acquired claim classification runs empty/note-present/indeterminate cases with explicit `viewIssue`, `discoverProject`, and `listIssueNotes` stubs under an empty HOME and hostile `glab` shim; the shim sentinel proves no CLI invocation. `withForge` names a missing `listIssueNotes` dependency locally.

Implementation files changed:
- All four classifiers use a single line-by-line scanner. Each line updates a family/run-length fence state before heading recognition; a same-family closer must meet the opening run length and carry no info string. The scanner detects duplicate genuine headings and returns an empty section for unclosed fencing.
- The Codex common copy was regenerated from the canonical root with `npm run sync:editions`; GitLab/Gitea remain deliberate hand ports.

Validation commands:
- `node scripts/simulate-workflow-walkthrough.js` — PASS (`Workflow walkthrough simulation passed`).
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — PASS (`GitLab workflow script tests passed`).
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — PASS (`Gitea workflow script tests passed`).
- `npm run sync:editions` — PASS; updated only the owned Codex classifier copy.
- `node scripts/validate-script-sync.js` — PASS (`24 common scripts ... in sync`).
- `git diff --check` — PASS.

Failure classification: the RED was a behavior/test failure in section identity. No build/type/lint/tooling failure occurred.

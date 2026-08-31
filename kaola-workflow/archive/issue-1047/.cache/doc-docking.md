# Documentation docking — Issue #1047

DOCKED

Public behavior, installation boundaries, architecture, validation, current Runtime capability
evidence, and release notes are covered by the README/documentation set listed in
`.cache/doc-updater.md`. The README delegates detail through working repository-relative links
instead of duplicating the operations manual.

Machine checks on the frozen candidate:

- `node scripts/generate-routing-surfaces.js --check`: 24 registered surfaces byte-match.
- `node scripts/test-runtime-agent-architecture.js`: 799 assertions passed.
- `node scripts/validate-workflow-contracts.js`: passed.
- `git diff --check`: passed.
- `.cache/chain-receipt.json`: Claude, Codex, GitLab, and Gitea exit 0 at exact workTreeHash
  `cda6c7fcae399f594478719dd7575ab2126a0726813da6227e648eb784a57930`.

Cursor Cloud post-release installation/restart is intentionally not claimed here; it remains a
release-convergence leg and is stated as such in Issue #1047.

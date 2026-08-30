#!/usr/bin/env node
'use strict';

// Distribution-owned consumer templates. These are intentionally independent of
// this repository's own AGENTS.md/CLAUDE.md: workflow-init may run from an npm or
// plugin installation where the Kaola-Workflow checkout does not exist, and a
// consumer must never inherit Kaola-Workflow's repository-specific contract.

const AGENTS_TEMPLATE = [
  '# Project Instructions',
  '',
  '<!-- KW-AGENTS-MANAGED-START -->',
  'global_contract_schema: 1',
  '',
  'This managed region contains project facts only. The compatible machine-global workflow contract',
  'owns universal engineering and lifecycle behavior. Owner content outside this region is preserved.',
  '',
  '## Project Snapshot',
  '',
  '- Purpose: see `README.md` or project metadata; record `unknown` until verified.',
  '- Stack: detect from the repository; record `unknown` until verified.',
  '- Architecture: keep two or three verified bullets here, or record `unknown`.',
  '',
  '## Commands',
  '',
  '- Install: `unknown`',
  '- Test: `unknown`',
  '- Lint/typecheck/build: `unknown`',
  '- Dev server: `unknown`',
  '',
  '## Project Constraints',
  '',
  '- Security boundary: `unknown`',
  '- Public contract or compatibility constraints: `unknown`',
  '- Files or generated surfaces requiring special handling: `unknown`',
  '',
  '## Validation Policy',
  '',
  '- Focused validation: `unknown`',
  '- Required integration validation: `unknown`',
  '- Environment or service acceptance: `unknown`',
  '',
  '## Documentation Map',
  '',
  '- `README.md` — project overview and usage.',
  '- `CHANGELOG.md` — user-visible changes when present.',
  '- `docs/` — architecture, APIs, conventions, and decisions when present.',
  '',
  '## Local Overrides',
  '',
  '- Project-only precedence or exception: `none`',
  '- Local development gotcha: `unknown`',
  '<!-- KW-AGENTS-MANAGED-END -->',
  '',
].join('\n');

const CLAUDE_TEMPLATE = [
  '# Claude runtime bridge',
  '',
  '<!-- KW-CLAUDE-OVERLAY-MANAGED-START -->',
  '@AGENTS.md',
  '',
  'Claude must import and follow the repository contract above before any action in this repository.',
  'Keep this file as the smallest native entrypoint bridge plus genuine Claude-only overlay; universal',
  'project and workflow behavior belongs only in `AGENTS.md`.',
  '<!-- KW-CLAUDE-OVERLAY-MANAGED-END -->',
  '',
].join('\n');

module.exports = { AGENTS_TEMPLATE, CLAUDE_TEMPLATE };

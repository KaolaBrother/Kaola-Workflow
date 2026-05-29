# TDD Task F1+F3 — Fix: GitHub active-folders sync pair

## Status: complete (GREEN)

## Changes made
- `scripts/kaola-workflow-active-folders.js:11`: `? n :` → `? Math.min(n, 600000) :`
- `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js:11`: same (byte-identical)

## Validation
`node scripts/validate-script-sync.js`: OK: 10 common scripts and 2 byte-identical file group in sync.
`npm test`: all 4 suites GREEN

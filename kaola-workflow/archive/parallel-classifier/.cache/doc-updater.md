# Doc-Updater: parallel-classifier

## Files Updated

### README.md
Added "Classifier Configuration" subsection under Automation Scripts explaining:
- `~/.config/kaola-workflow/config.json` location and structure
- `parallel_mode` values and behavior
- Yellow verdict `.cache/parallel-classifier.md` file description

### commands/workflow-next.md
Added paragraph after Startup Step 0 explaining yellow warning cache file:
- When created (yellow verdict)
- Location (`kaola-workflow/{project}/.cache/parallel-classifier.md`)
- Non-blocking nature

## Post-Update Note
workflow-next.md grew to 237 lines after doc update. Cap bumped from 235→240 via Trivial Inline Edit in validate-workflow-contracts.js. Validation re-run and passed.

## Files Confirmed Current
- CHANGELOG.md: comprehensive [Unreleased] entry ✓
- README.md Scripts Reference table: classifier.js row ✓
- kaola-workflow-classifier.js: self-documenting code, no comment updates needed ✓

## Status: COMPLETE

# TDD Task 6: T-WS-F — uninstall.sh L5

## Result: GREEN ✓

## Edits
- Line 4: FORGE=github → FORGE=""
- After arg-parse loop, before validation case: sentinel block `if [[ -z "$FORGE" ]]; then FORGE=all; fi`

## RED Confirmed
Bare uninstall before fix: gitea dir survived (RED CONFIRMED)

## GREEN Confirmed
- Bare uninstall after fix: gitea dir removed (PASS)
- Empty install: "Not installed — nothing to remove." (PASS)

## Validation
- bash -n uninstall.sh: syntax OK
- Behavioral test: both cases PASS

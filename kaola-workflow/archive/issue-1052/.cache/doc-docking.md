# Documentation docking for issue #1052

status: DOCKED
candidate: b39af460a0ac1abf094795ef49bf29b9c18badac

README.md, docs/api.md, docs/cursor-edition.md, docs/architecture.md, docs/runtime-capabilities.md,
and CHANGELOG `[Unreleased]` match the frozen claim.js / generated Next signatures: unstamped
`startup --runtime cursor --target-issues "$KAOLA_TARGET_ISSUES"`; in-process
`applyDemonstratedCursorCliHost` on all four claim trees; `--forge` only on the helper spawn;
independently entered Finalize still `--ensure-target "$PWD"` before named dispatch; no
`sessionStart` and no `--global` dual-write. See doc-updater.md for transcribed signatures.
#1051 Unreleased bullets remain. No BLOCKED path.

# Documentation docking for issue #1052 (frozen candidate)

status: transcription
candidate: b39af460a0ac1abf094795ef49bf29b9c18badac
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
date: 2026-09-07

Independently entered Finalize ran
`${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/scripts/kaola-workflow-cursor-surface.js --ensure-target "$PWD" --forge=github --json`
from the CLI workspace `/Users/ylpromax5/Workspace/Kaola-Workflow`. The helper refused
`unmanaged_collision` on `.cursor/commands/kaola-workflow-finalize.md` and
`.cursor/commands/workflow-next.md`. Named `doc-updater` was not dispatched after that refuse.
This file is the orchestrator transcription against the frozen candidate.

Codemaps: neither `scripts/codemaps/` nor `docs/CODEMAPS/` exists. Not invented.

## Signatures transcribed from `scripts/kaola-workflow-claim.js` at HEAD

`KNOWN_VALUE_FLAGS` includes `product`, `host`, `cursorWorkspace`. `--help` USAGE still prints
`--runtime claude|codex|opencode|kimi|grok|zcode` and does not list `--product` / `--host` /
`--cursor-workspace`. Docs record the flags as accepted argv, not as printed USAGE.

`isCursorCliLocalWorkflowPath`: `runtime`/`product`/`host` normalize to `cursor`/`cli`/`local`.

`applyDemonstratedCursorCliHost`: when `--runtime cursor` and both `--product`/`--host` omitted,
`inspectDemonstratedCursorParent` (up to `CURSOR_CLI_DEMONSTRATED_ANCESTOR_HOPS = 8`) stamps
`product=cli`, `host=local`, and `cursorWorkspace` from a CLI-shaped ancestor
(`…/YYYY.MM.DD-<hash>/index.js` or `cursor-agent`) **and** `--workspace` sharing git identity with
cwd. Generic `--workspace` is not CLI. `--worker-dir` present is App-like. Darwin
`collectUnquotedFlagRemainder` reconstitutes spaced `--workspace` values.

`resolveCursorCliEnsureTarget`: `--cursor-workspace` (including the stamp) wins; else resume
`main_root`; else `getRoot()`.

Helper spawn on this GitHub tree is
`installedCursorSurfaceHelperPath()` then
`[helper, '--ensure-target', root, '--forge=github', '--json']`.
`--forge` is not a claim.js operator flag. Fail-closed:
`{ result: 'refuse', reason: 'cursor_prep_failed', claim: 'none' }`, exit 1.
`status` / `list-open` do not call prep.

GitLab/Gitea hand-ports pass `--forge=gitlab` / `--forge=gitea` on their helper spawn.

## Generated Next fence transcribed from isolated `--global` install of this HEAD

```
node "$CLAIM_JS" startup --runtime cursor --target-issues "$KAOLA_TARGET_ISSUES"
```

Resume: `node "$CLAIM_JS" resume --runtime cursor` with `kaola_script` / `CLAIM_JS=` outside any `if`.
No `--product cli --host local` on those fences. No `cursorCliHostGateOpen`.

Finalize generated surface still uses `--ensure-target "$PWD"` immediately before named dispatch.

## Checked public docs (match the signatures above)

- `README.md` Cursor CLI/local paragraph
- `docs/api.md` Cursor CLI/local startup and resume Repo role prep
- `docs/cursor-edition.md` startup/resume prep and Finalize `$PWD`
- `docs/architecture.md` four-tree claim.js prep
- `docs/runtime-capabilities.md` Cursor CLI / local row
- `CHANGELOG.md` `[Unreleased]` #1052 bullet (also keeps #1051). It records producer `npm test` /
  walkthrough on `ca897767`; freeze HEAD is `b39af460` (docs commit after that run). Binding
  producer receipt is `chain-receipt.json` at this HEAD. Docs were not mutated after freeze.

No signature mismatch requiring a docs edit. No rendered Cursor mirror was hand-edited.

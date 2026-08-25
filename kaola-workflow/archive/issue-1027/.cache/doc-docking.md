# Documentation docking — Issue #1027

## Verdict

DOCKED. The release candidate needs no further tracked documentation edit.

## Changed files

- `package.json` registers `scripts/test-zcode-edition.js` in the aggregate additive-editions lane.
- `CHANGELOG.md` records the #1027 fix in the 9.16.0 release section.

The net candidate diff against `origin/main` is exactly those two modified files.

## Documentation surfaces checked

- `README.md`
- `docs/README.md`
- `docs/api.md`
- `docs/architecture.md`
- `docs/zcode-edition.md`
- `.env.example`
- `CHANGELOG.md`
- `CLAUDE.md`

No API, setup, environment, architecture, generated-surface, or public runtime behavior contract changed. The existing ZCode guide already documents the individual suite, and the 9.16.0 changelog accurately records its addition to the aggregate test lane.

## Candidate-bound evidence

- candidate and local tag: `f76046e0bf32b8828f18a42af58bdfbb44ad7b7c`
- suite registration: 582 assertions passed
- additive editions: OpenCode 684, Kimi 647, Grok 564, Cursor 856, ZCode 687 assertions passed
- exact-SHA Claude, Codex, GitLab, and Gitea chains: all green and unwaived
- strict release-check: passed
- post-tag `npm test`: passed

## Follow-up

The pre-existing runtime-count prose drift in `README.md` and `package.json` was measured and filed as #1028. It is deliberately excluded from this already verified release candidate so its bytes and release evidence remain unchanged.

Source evidence: `.kw/worktrees/issue-1027/.cache/doc-updater.md`.

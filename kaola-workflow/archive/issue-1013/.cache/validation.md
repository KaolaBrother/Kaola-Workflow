# Issue #1013 executable validation

## Candidate

- Branch: `workflow/issue-1013`.
- Claimed baseline: `5d12821db236ce0601d6804e9d78df31a9576f65`.
- Tracked diff: 8 paths, 187 insertions, 63 deletions.
- Paths: `scripts/sync-cursor-edition.js`, `scripts/test-cursor-edition.js`, `install-cursor.sh`, `README.md`, `docs/README.md`, `docs/cursor-edition.md`, `docs/architecture.md`, `CHANGELOG.md`.

## Focused validation

- `node --check scripts/sync-cursor-edition.js` — exit 0.
- `bash -n install-cursor.sh` — exit 0.
- `node scripts/test-cursor-edition.js` — exit 0; `550 assertions`; `.cursor`, `.cursor-gitlab`, and `.cursor-gitea` each passed pre-write drift parity at the main tree root.
- `node scripts/generate-routing-surfaces.js --check` — exit 0; all 18 surfaces byte-match their skeletons.
- `git diff --check` — exit 0.
- `git diff --name-only -- CLAUDE.md AGENTS.md agents commands templates` — empty.
- `rg -n "grok-4\\.6|cursor-grok-4\\.6" CLAUDE.md AGENTS.md agents commands templates` — exit 1 with no matches, confirming vendor literals did not enter canonical consumer prompts.

## Required full walkthrough

- Command: `node scripts/simulate-workflow-walkthrough.js`.
- Exit: 0.
- Result: `186/186` scenarios passed; `failed: 0`; spawn census `2,173`.

## Runtime close evidence

- A real installer deployment into an isolated project followed by fresh Cursor CLI chats passed the no-override medium/high resolution check; `kaola-workflow/issue-1013/.cache/live-cursor-stream.ndjson` retains all 25 raw events from the review-driven rerun, and a machine re-read parsed 25/25 lines with xhigh parent plus successful medium/high Task envelope pairs. The human-readable binding is in `live-cursor.md`.

## Verdict

`PASS` — focused additive-edition checks, routing parity, canonical-surface safety, full workflow simulation, and live runtime resolution are green before independent review convergence.

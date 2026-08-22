# Issue #1013 mutation proof

## Scope and baseline

- Custody: `scripts/test-cursor-edition.js`; no production or tracked test file was changed in the shared worktree.
- Shared issue-worktree HEAD used for the copy: `5d12821db236ce0601d6804e9d78df31a9576f65` (`chore: archive issue-1012 [sink]`). The implementation and test edits were uncommitted at that SHA, so the temporary copy included those current bytes.
- The original TDD RED record in `tdd-red.md` is also against SHA `5d12821db236ce0601d6804e9d78df31a9576f65`: `node scripts/test-cursor-edition.js` exited `1` with `29 failure(s), 521 passed`.

## Temporary strategy

- Created exactly `/tmp/kw-1013-mutation.NA11pA` with `mktemp -d`.
- Copied the issue worktree into it with `rsync -a`, excluding `.git`, `.kw`, `.cursor`, `.cursor-gitlab`, and `.cursor-gitea`; therefore the test generated only disposable trees and did not resolve or write the shared tree root.
- The control ran in the root copy. Fresh `m2`, `m3`, and `m4` subcopies were made from the shared worktree for independent mutations. Every mutation was applied with `apply_patch` inside the temporary copy only.

## Control

Command: `node scripts/test-cursor-edition.js` from `/tmp/kw-1013-mutation.NA11pA`.

- Exit `0`.
- Result: `cursor-edition test passed (550 assertions)`; all three trees were initially absent and then self-provisioned in the disposable copy.

## Mutations and falsification results

1. Declaration removal — in the root temporary copy, deleted the `CURSOR_RUNTIME_NATIVE.frontmatter_tier_pin` property from `scripts/test-cursor-edition.js`.

   Command: `node scripts/test-cursor-edition.js`.

   - Exit `1`.
   - Failure signature: `FAIL: G2-declaration: CURSOR_RUNTIME_NATIVE must declare "frontmatter_tier_pin" with a one-line reason`; `FAIL: G2-declaration: the "frontmatter_tier_pin" reason must state unquoted standard/reasoning medium/high frontmatter pins`.
   - Summary: `cursor-edition test FAILED: 2 failure(s), 548 passed.`
   - This proves the declaration existence and semantic-content checks are armed.

2. Quoted bracket model pin — in `m2`, changed `lines.push('model: ' + modelPin);` in `scripts/sync-cursor-edition.js` to `lines.push('model: ' + JSON.stringify(modelPin));`.

   Command: `node scripts/test-cursor-edition.js`.

   - Exit `1`.
   - Failure signature: `FAIL: G1[adversarial-verifier]: model line is exactly the unquoted canonical tier pin "grok-4.6[effort=high]" — got ["model: \"grok-4.6[effort=high]\""]`; paired `G1[...]` failures say `model pin is not YAML-quoted (bracket syntax must remain raw)`. `G2-declaration: .cursor/agents/adversarial-verifier.md carries the canonical unquoted frontmatter pin "grok-4.6[effort=high]"` also reds.
   - Summary: `cursor-edition test FAILED: 42 failure(s), 508 passed.`
   - This proves exact raw-line coverage catches quoting in both the per-agent guard and the declaration parity guard.

3. Unknown-token fallback — in `m3`, replaced `cursorModelPin`'s unsupported-token throw with `return 'inherit';`.

   Command: `node scripts/test-cursor-edition.js`.

   - Exit `1`.
   - Failure signature: `FAIL: G0-roster: renderAgent rejects an unsupported canonical model token (fail closed; no invented roster)`.
   - Summary: `cursor-edition test FAILED: 1 failure(s), 549 passed.`
   - This proves the synthetic unsupported canonical class cannot be silently accepted.

4. Task model override — in `m4`, injected `model="grok-4.6-medium"` into the first rendered `Task(` card after `transformCommandBody` returned, bypassing the generator's own residue assertion so the suite had to judge the emitted subject.

   Command: `node scripts/test-cursor-edition.js`.

   - Exit `1`.
   - Failure signatures include `FAIL: G2[kaola-workflow-finalize]: generated Task cards stay free of per-call model dispatch`, `FAIL: G2[kaola-workflow-finalize]: Task( card count matches canonical Agent( count (3) — got 2`, `FAIL: G2-leak: .cursor/commands/kaola-workflow-finalize.md: no per-call model=" override in generated dispatch surfaces`, and `FAIL: G2-declaration: .cursor/commands/kaola-workflow-finalize.md carries a per-call model=" override; command cards must omit dispatch model`.
   - Summary: `cursor-edition test FAILED: 8 failure(s), 541 passed.`
   - This proves the emitted command-card guard catches a believable post-transform `Task(model=...)` near-miss.

## Cleanup and shared-worktree post-check

- Removed only the exact disposable root with `find /tmp/kw-1013-mutation.NA11pA -depth -delete` (exit `0`); `test ! -e /tmp/kw-1013-mutation.NA11pA` then exited `0`.
- Post-check of `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1013`:
  - HEAD remained `5d12821db236ce0601d6804e9d78df31a9576f65`.
  - `git status --short --branch` remained `## workflow/issue-1013` with only the pre-existing eight issue-1013 paths: `CHANGELOG.md`, `README.md`, `docs/README.md`, `docs/architecture.md`, `docs/cursor-edition.md`, `install-cursor.sh`, `scripts/sync-cursor-edition.js`, and `scripts/test-cursor-edition.js`.
  - `git diff --name-only` listed exactly those same eight paths; no mutation artifact or generated tree was added to the shared worktree.
- The repository root still reported the pre-existing active-folder entry `?? kaola-workflow/issue-1013/`; the evidence file is the requested addition under that folder.

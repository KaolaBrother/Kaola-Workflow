evidence-binding: n4-validator c3ea0575521d

# n4-validator — #440 overflow subtypes + #441 parseGoal reader (plan-validator ×4)

Two disjoint-region features implemented atomically in the canonical
`scripts/kaola-workflow-plan-validator.js`, then propagated to the 3 generated-aggregator ports
via `node scripts/edition-sync.js --write` (canonical diff modulo forge nouns per #328).

- #440: `classifyOverflowSubtype(outOfAllow)` reads `schema.WRITE_SET_OVERFLOW_SUBTYPES` and NARROWS
  `write_set_overflow` into `lockfile_write` / `mirror_write` / `count_bump` when ALL out-of-allow
  paths match a SINGLE subtype; multiple/none stays plain `write_set_overflow`. Wired into the
  `barrierCheck` rank-3 overflow arm AFTER the existing `write_set_granularity` (#404) check —
  precedence family unchanged (D-440-01 decision 6 / D-419-02 [INV-13] do-not-fork).
- #441: `parseGoal(content)` reads `^goal:[ \t]*(.*)$` from `classifier.sectionBody(content, 'Meta')`
  (decoy-immune, `## Meta`-scoped like `parseLabels`); returns `{ goal: <string> }` or `{ goal: null }`.
  Reader-only, no gate, hash-covered for free; exported.

## RED / GREEN

RED: #440 lockfile_write/mirror_write/count_bump(x2) — AssertionError: expected reason lockfile_write, got write_set_overflow (pre-impl); #441 parseGoal — TypeError: v.parseGoal is not a function (pre-impl); 8/12 failing (the 4 "must-stay-unchanged" assertions already green, confirming no regression target)
GREEN: all 12 assertions pass — #440 four subtype narrowings + four unchanged-precedence cases + #441 four parseGoal cases; cross-port check GREEN on all 4 editions (canonical + gitlab/gitea/codex-mirror ports byte-parity-identical behavior)

## Verification (all from worktree root, absolute paths)

- RED→GREEN test ran from `$TMPDIR` (`/var/folders/.../T/n4-validator-red.test.js`), removed after use.
- `node scripts/edition-sync.js --write` → 3 ports regenerated.
- `node scripts/edition-sync.js --check` → "12 forge aggregator ports in rename-normalized parity" (exit 0).
- `node scripts/validate-script-sync.js` → "OK: 22 common scripts, 30 byte-identical groups ... in sync" (exit 0).
- `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed" (exit 0).
- Forge forbidden-only (#341): gitlab + gitea plan-validator ports both "passed" (exit 0).

## Write set (confined to declared)

- scripts/kaola-workflow-plan-validator.js (canonical, hand-edited)
- plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js (codex mirror, edition-sync)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js (edition-sync)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js (edition-sync)

NOTE: the 4 `kaola-workflow-adaptive-schema.js` copies carrying `WRITE_SET_OVERFLOW_SUBTYPES` are
PRE-EXISTING uncommitted working-tree state from a sibling schema node in this bundle — NOT edited by
this node. This node only IMPORTS the constant via the already-required `schema` module.

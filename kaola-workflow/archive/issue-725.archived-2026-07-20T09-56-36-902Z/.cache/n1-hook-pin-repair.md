evidence-binding: n1-hook-pin-repair fb4376cd9880
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: Glue/wiring + config repair — re-pointing a stale test-pin, retiring dangling hook
  references across two additive runtime editions (kimi, opencode), and fixing a regex anchor that
  drifted after a sibling node's prompt trim. No new behavioral logic; every change is either a
  literal-text pin update or a byte-for-byte-consistent retirement mirroring a decision (Phase C's
  advisory hook retirement) already made and merged elsewhere in this same repo.
<!-- regression-green|build-green|smoke-integration -->
regression-green: All three target suites run real (captured, not piped) exit 0 before/after:
  `node scripts/test-install-model-rendering.js` exit 0 (Install model rendering tests passed);
  `node scripts/test-kimi-edition.js` exit 0 (kimi-edition test passed, 412 assertions);
  `node scripts/test-opencode-edition.js` exit 0 (opencode-edition test passed, 384 assertions).
  Before my repair the sync-kimi-edition step hard-crashed (ENOENT on the already-deleted canonical
  hooks/kaola-workflow-pre-commit.sh), so none of these three commands could reach a real pass/fail
  signal at all — verified via `git stash` + rerun (crashed identically) then `git stash pop`.

## Task

Adaptive child-epoch node n1-hook-pin-repair (role implementer), project issue-725, Phase D repair
epoch (plan_epoch 2). Repair the three blocking findings the tail certifier (n12-code-certify)
raised: R1 a stale test-install-model-rendering.js pin on a trimmed markdown heading, R2 kimi
edition still referencing the retired `kaola-workflow-pre-commit.sh` hook, R3 opencode edition
still referencing the same retired hook. Declared write set: scripts/test-install-model-rendering.js,
scripts/sync-kimi-edition.js, scripts/test-kimi-edition.js, docs/kimi-edition.md,
templates/opencode/plugins/kaola-workflow-hooks.js, scripts/test-opencode-edition.js,
docs/opencode-edition.md, CHANGELOG.md (+ this evidence file).

## verification_tier

regression-green

## write_set (files actually changed — exactly the frozen 8)

- scripts/test-install-model-rendering.js
- scripts/sync-kimi-edition.js
- scripts/test-kimi-edition.js
- docs/kimi-edition.md
- templates/opencode/plugins/kaola-workflow-hooks.js
- scripts/test-opencode-edition.js
- docs/opencode-edition.md
- CHANGELOG.md

`git status --short` on exactly these 8 paths shows all 8 modified and nothing else; `.kimi/`
regenerated artifacts are entirely gitignored (`git ls-files .kimi/` returns empty), so they carry
no barrier concern.

## verification_commands (real captured `$?`, not piped)

```
node scripts/test-install-model-rendering.js ; echo EXIT:$?   → EXIT:0 (Install model rendering tests passed)
node scripts/test-kimi-edition.js ; echo EXIT:$?               → EXIT:0 (kimi-edition test passed, 412 assertions)
node scripts/test-opencode-edition.js ; echo EXIT:$?           → EXIT:0 (opencode-edition test passed, 384 assertions)
node scripts/sync-kimi-edition.js --write                      → "sync-kimi-edition: write complete (2 file(s) updated)" then later
                                                                    "sync-kimi-edition: write complete (5 file(s) updated)" after the
                                                                    K2 regex fix regenerated the command/role skills too
```

## before_result

- R1: `finalize.includes('\n\n## Validation Delegation Policy\n\n')` — false. Confirmed via
  `grep -n "Validation Delegation Policy" commands/kaola-workflow-finalize.md` returning nothing;
  the heading was fully removed by the Phase D finalize trim (git log shows the last touch to that
  file was `1146e3ac`, well before the trim; the heading text itself is gone from the tree).
- R2/R3: `node scripts/test-kimi-edition.js` FATAL-crashed before any assertion ran —
  `Error: ENOENT ... hooks/kaola-workflow-pre-commit.sh` inside `sync-kimi-edition.js`'s
  `writeHooks()` — because `hooks/kaola-workflow-pre-commit.sh` was already deleted by Phase C
  (commit `2a48342c`, "advisory hook retirement") but kimi's `HOOK_SCRIPTS` array still listed it.
  `node scripts/test-opencode-edition.js` was NOT crashing (opencode's own `sync-opencode-edition.js`
  HOOK_SCRIPTS was already correctly narrowed by Phase C to just dispatch-log), but its H1(#F3)
  fixture asserted a resolved path for the now-undeployed `kaola-workflow-pre-commit.sh`, and the
  runtime plugin's `HOOK.preCommit` map entry + its `tool.execute.before` `bash` dispatch branch
  still referenced the deleted script.

## after_result

- R1: re-pointed the pin to `finalize.includes('\n\n## Steps\n\n')` — confirmed `## Steps` (line
  202 of `commands/kaola-workflow-finalize.md`) has blank lines on both sides in the raw source and
  survives install rendering (assertion passes against the real installed output, not a guess).
- R2: kimi edition fully retires BOTH `pre-commit` (as briefed) AND `write-lane` (discovered — see
  Surprises below): `HOOK_SCRIPTS` now lists only `kaola-workflow-subagent-dispatch-log.sh`;
  `renderKimiHooksToml()` emits exactly 2 `[[hooks]]` blocks (`SubagentStart`, `PostCompact`),
  matching canonical `hooks/hooks.json`'s 2 surviving entries exactly; `HOOK_ADAPTATIONS` now has
  only the dispatch-log agent_type/agent_name rewrite. `test-kimi-edition.js`'s K7 block, byte-copied
  hook counts, and P4 re-install hook-block count are all updated to match (2, not 3 or 4). The
  LOAD-BEARING write-lane end-to-end gate-fence probe block is removed (script no longer ships to
  kimi). `docs/kimi-edition.md`'s Hooks section, file-layout table, and K7 test-summary bullet are
  rewritten to describe the 2-entry hook set and 1-script byte-copy/adapt set.
- R3: opencode edition's `HOOK` map drops `preCommit`; the `if (tool === "bash") { ... }` dispatch
  branch that referenced it is removed entirely (see Surprises — leaving it in would have crashed);
  the Coverage comment block's bash row is dropped. `test-opencode-edition.js`'s H1(#F3) fixture now
  resolves `kaola-workflow-subagent-dispatch-log.sh` (the sole opencode `HOOK_SCRIPTS` entry) instead
  of the undeployed pre-commit script. `docs/opencode-edition.md`'s hook table drops the bash/pre-commit
  row; the write-lane row and its "stays dormant" prose are left untouched (verified genuinely inert:
  `runHook`/`hookPath` fail-open on a missing script, and the comment explicitly documents write-lane
  as "dormant until enabled" for opencode — unlike kimi, where it was actively wired).
- CHANGELOG.md: new bullet under `### Fixed` documenting the full repair (Phase C's hook retirement
  reaching the two additive editions + the two latent Phase-D-trim regressions), so the note lands
  BEFORE the certifier's chain run and the receipt is not `chains_stale`.

## Surprises (went beyond the literal brief — all within the frozen 8-file write set)

1. **Kimi's `write-lane` hook was NOT actually surviving**, contrary to the brief's assumption
   ("The two surviving kimi hooks (write-lane, dispatch-log) stay"). Phase C (`2a48342c`, "advisory
   hook retirement") had already deleted the canonical `hooks/kaola-workflow-write-lane.sh` file
   entirely and narrowed `scripts/sync-opencode-edition.js`'s `HOOK_SCRIPTS` to just dispatch-log —
   but it missed kimi's OWN local `HOOK_SCRIPTS`/`renderKimiHooksToml()`/`HOOK_ADAPTATIONS`, which
   still actively wired write-lane as a load-bearing `[[hooks]]` rule with an end-to-end #607
   gate-fence probe test. This was masked until now because the kimi suite crashed at the
   pre-commit ENOENT before ever reaching write-lane's byte-copy step. Fixed by extending the same
   already-decided Phase C retirement to kimi (no new architectural call — the canonical file this
   would depend on was deliberately deleted and verified elsewhere, and resurrecting it was outside
   my write set anyway).
2. **Opencode's literal brief (remove only the `HOOK.preCommit` map entry) would have introduced a
   real crash.** `runHook(root, HOOK.preCommit, ...)` → `hookPath(root, undefined)` →
   `path.join(root, ".opencode", "hooks", undefined)` throws `TypeError [ERR_INVALID_ARG_TYPE]`
   inside Node's `path.join` — this would fire on EVERY bash tool call once `preCommit` was deleted
   from the map. Verified by reading `hookPath`/`runHook`'s implementation before editing, not by
   guessing. Fixed by removing the dead `if (tool === "bash")` dispatch branch entirely, matching
   the fact hooks.json no longer has a `PreToolUse`/`Bash` entry anywhere.
3. **A previously-masked kimi K2 test failure** ("carries the inherit-model guidance") surfaced once
   R2's crash was fixed and the suite could run further: the Phase D adapt/finalize prompt-diet
   (a concurrent sibling node's already-certified epoch-1 work, uncommitted in this shared worktree)
   collapsed each command's standalone "MUST pass `model=`...do not omit the `model=` line." dispatch
   note into its `## Agent Model Badge` section. Kimi's badge-strip transform deletes that whole
   section wholesale (by design — kimi has no model badge), so the separate outside-badge regex that
   used to rewrite the standalone note into "Never pass a per-call model override..." never found
   anything to match, and the guidance sentence silently stopped appearing in the generated kimi
   adapt skill. Verified this was NOT introduced by my own diff (`git diff --stat -- scripts/sync-kimi-edition.js`
   at that point showed only the hook-related 10/31 line change) and was reachable purely because my
   R2 fix let the suite progress past its earlier crash. Fixed by having the badge-section strip
   insert the kimi inherit-model sentence in the section's place, rather than leaving nothing —
   confirmed this doesn't collide with or duplicate the (now-dead, still-present, harmless) separate
   regexes for the other two prose patterns, neither of which currently matches anything in the
   canonical tree.

No epoch-1 surface outside the frozen 8 files was touched. `scripts/classifier.js` and
`scripts/validation-runner.js` were not touched. No provenance (issue refs, decision IDs) entered
any of the 7 non-CHANGELOG files; CHANGELOG.md carries provenance as intended.

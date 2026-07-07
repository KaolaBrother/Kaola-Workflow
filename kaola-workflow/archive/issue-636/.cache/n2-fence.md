evidence-binding: n2-fence 62cc1b1e58b1

## n2-fence — #636 cross-runtime dispatch pin single-sourcing (behavior-preserving fence)

non_tdd_reason: Behavior-preserving cross-edition CONTRACT relocation (glue/wiring category) — no
new behavior. Runtime-dead prose (the Codex-dispatch block on Claude commands; the Teammate-Mode
block on Codex SKILLs) is removed from surfaces that never execute it, and the always-live tail
sentences are preserved/re-spliced. Validator/test assertions are moved to track the surface each
token actually lives on now. Verified by the existing validator/test suite passing before and after
(fail-closed assertIncludes/assertNotIncludes contracts), not a new failing unit test — there is no
new behavior to TDD against.

verification_tier: regression-green

### Write set — all 12 files, exactly as declared (git status confirms no other file touched)

1. `commands/kaola-workflow-plan-run.md` — added `<!-- PIN: teammate-mode -->` immediately above
   `#### Teammate-Mode Dispatch`; removed the Codex-dispatch block (ONE splice, per the map's
   github-only boundary): deleted the `For any non-null dispatch.codex_reasoning_effort...` through
   `...never emit a variant-missing note.` span, leaving `the transport, never the contract.` (end
   of Teammate-Mode's always-live tail) directly followed by `Pass dispatch.nonce (evidence-binding
   token). Instruct the role to:` (the always-live bullet-list header). The separate always-live
   sentence `Dispatch the base role profile in dispatch.agent_type...` (which lives BEFORE the
   Teammate-Mode block on this file) was untouched.

2. `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md` — added
   `<!-- PIN: teammate-mode -->` above `#### Teammate-Mode Dispatch`; removed the Codex-dispatch
   block with the TWO-splice forge boundary: spliced the START (fused
   `Dispatch the base role profile...descriptive).` sentence out from the Codex-effort-proof
   sentence that followed it on the SAME line, replacing the tail with `Pass dispatch.nonce
   (evidence-binding token). Instruct the role to:`) and deleted everything Codex-specific between
   that and the bullet list. Net: `Dispatch the base role profile in dispatch.agent_type (legacy
   dispatch.role is only descriptive). Pass dispatch.nonce (evidence-binding token). Instruct the
   role to:` immediately precedes the always-live bullet list.

3. `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md` — identical edits to file 2
   (confirmed byte-for-byte identical source block before editing; same two-splice treatment
   applied).

4. `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md` — added
   `<!-- PIN: codex-dispatch -->` immediately under the `## Dispatch` heading, above `Reasoning
   effort and identity:`. Removed the `#### Teammate-Mode Dispatch` block in full (from the heading
   through `the transport, never the contract.` plus its trailing blank line), leaving
   `child task label on opencode.` directly followed by the always-live tail `Delegate to the base
   role profile matching dispatch.agent_type. Apply the task-name and reasoning-effort rule
   above...`. The `## Dispatch` (Codex-native) and `## Codex Join Protocol` sections were left
   untouched (both stay — Codex-native + #611-join surfaces).

5. `plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md` — identical edits to
   file 4 (confirmed identical source block).

6. `plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md` — identical edits to
   file 4 (confirmed identical source block).

7. `scripts/test-route-reachability.js` — T5b `planRunSurfaces` array narrowed from 6 entries
   (3 commands + 3 SKILLs) to the 3 Codex SKILL entries only (comment updated to describe the
   Codex-SKILL-only scope; the downstream `.filter(f=>f.includes('/skills/'))` sub-filter for the
   #610 neutral-token check is now a no-op over an already-SKILL-only array, left as-is per the
   map). T14 `planRunSurfaces` array narrowed from 6 entries to the 3 Claude command entries only
   (comment updated). Both loop bodies unchanged — two independent array edits, two independent
   scopes.

8. `scripts/validate-workflow-contracts.js` — deleted the #582 command-only T5b-mirror assertion
   block (5 assertIncludes/assertNotIncludes lines + comment) since that Codex-dispatch content no
   longer lives in the command surface. `planRunSurfaces606` (teammate-mode) narrowed from 6 to the
   3 command entries only (comment updated to "Claude-runtime-only"). `planRunSurfaces611ForkTurns`
   (the #611-fork unconditional mandate) narrowed from 6 to the 3 Codex SKILL entries only (comment
   updated to "Codex-runtime-only"). `codexJoinProtocolSurfaces611` (SKILL-only) and
   `claudeJoinProtocolSurfaces611` (command-only) were left untouched, as instructed.

9. `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — byte-identical edits applied
   at the same three sites as file 8. Confirmed byte-identical to file 8 after editing via `diff`
   (see verification below) — the COMMON-byte guard (`validate-script-sync.js`) holds.

10. `scripts/validate-kaola-workflow-contracts.js` (github Codex validator) — deleted the #606
    teammate-on-github-SKILL assertion block (2 assertIncludes lines + comment), since that
    Claude-runtime prose is no longer present on the Codex SKILL. The `[SKILL, root command]`
    #611-fork loop narrowed to SKILL-only (dropped the `commands/kaola-workflow-plan-run.md` array
    entry, comment updated). The #598 AC4 loop, SKILL-side #582 pins, and join-protocol pins were
    left untouched, as instructed.

11. `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` —
    three-way split of the shared `[command, SKILL]` loop: #602/#604/#605/#607/#611-join pins stay
    in the shared loop (symmetric across both surfaces); the #606 (teammate-mode) block and the
    #611-fork block were removed from the shared loop and relocated, verbatim per the map, to two
    standalone command-only / SKILL-only assertion groups placed after the loop. The `mr|pr)`
    finalize-sink contract pins (lines 296 and 335 in the pre-edit file) were NOT touched — verified
    by direct read after editing.

12. `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — identical
    three-way split applied (same shared-loop structure, confirmed identical before editing). The
    `mr|pr)` finalize-sink contract pins (lines 303 and 342 in the pre-edit file) were NOT touched
    — verified by direct read after editing.

### #611-fork SKILL-only shrink — confirmed landed in ALL FOUR validators (the one load-bearing correction)

- File 8 (`scripts/validate-workflow-contracts.js`): `planRunSurfaces611ForkTurns` now lists only
  the 3 `.../skills/kaola-workflow-plan-run/SKILL.md` paths — no command entry.
- File 9 (`plugins/kaola-workflow/scripts/validate-workflow-contracts.js`): identical array,
  byte-identical to file 8.
- File 10 (`scripts/validate-kaola-workflow-contracts.js`): the `[SKILL, root command]` loop now
  iterates only `${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md` — the command entry is
  gone.
- File 11 (gitlab) and File 12 (gitea): the relocated #611-fork assertion block after the shared
  loop asserts `on EVERY dispatch, tiered or not` / `the unconditional mandate applies identically
  to this dispatch mode` / (NOT) `not a valid path for tiered nodes` ONLY against
  `pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md'` — no command-surface assertion for
  these tokens remains anywhere in the four validators. Confirmed via grep across all four files:
  no `commands/kaola-workflow-plan-run.md` (or `pluginRoot + '/commands/...'`) entry is paired with
  the `on EVERY dispatch, tiered or not` token in any of the four validators.

### #8/#9 byte-identical confirmation

`diff scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js`
produced NO output (files identical) after both edits were applied. Also confirmed independently by
`scripts/validate-script-sync.js` passing (byte-identity group check).

### Verification commands (single pass, all green)

```
node scripts/test-route-reachability.js
  -> "Route-reachability test passed (239 assertions)."           EXIT: 0

node scripts/validate-workflow-contracts.js
  -> "Workflow contract validation passed"                        EXIT: 0

node scripts/validate-kaola-workflow-contracts.js
  -> "Kaola-Workflow Codex contract validation passed"             EXIT: 0

node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
  -> "Kaola-Workflow GitLab contract validation passed"            EXIT: 0

node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
  -> "Kaola-Workflow Gitea contract validation passed"             EXIT: 0

node scripts/validate-script-sync.js
  -> "OK: 24 common scripts, 25 byte-identical groups, 8 rename-normalized
      families, 1 config/hooks.json family, and 7 forge export-superset
      families in sync."                                          EXIT: 0
```

### Write-set audit

`git status --porcelain` shows exactly the 12 declared files modified (`M`), plus the untracked
`kaola-workflow/issue-636/` project-state directory (plan + evidence cache, not a codebase file).
No other file in the repo was touched.

delegation_outcome: completed

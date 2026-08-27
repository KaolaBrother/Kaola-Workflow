# Cursor production repair receipt

task: Repair the PR #1041 Cursor install/materialization/doctor production surface for Issues #1039/#1037 without changing acceptance tests. Retire ambient sessionStart catalog materialization; make explicit project materialization global-authority-derived, receipt-owned, collision-safe, and uninstall-safe; preserve non-Kaola hooks; keep CLI, local App, and App Cloud facts distinct.

verification tier: `tests-green`

## Files changed by this repair

- `install-cursor.sh`
- `scripts/kaola-workflow-cursor-surface.js`
- `scripts/sync-cursor-edition.js`
- `scripts/kaola-workflow-ensure-cursor-catalog.js` — deleted with the retired ambient materializer
- Mechanical ignored generated output under the shared main checkout:
  - `.cursor/hooks.json`; retired `.cursor/hooks/kaola-workflow-ensure-cursor-catalog.sh` removed
  - `.cursor/commands/{workflow-next,kaola-workflow-finalize}.md` refreshed with the safe standalone-CLI pre-dispatch check
  - `.cursor-gitlab/hooks.json`; retired `.cursor-gitlab/hooks/kaola-workflow-ensure-cursor-catalog.sh` removed
  - `.cursor-gitlab/commands/{workflow-next,kaola-workflow-finalize}.md` refreshed with the safe standalone-CLI pre-dispatch check
  - `.cursor-gitea/hooks.json`; retired `.cursor-gitea/hooks/kaola-workflow-ensure-cursor-catalog.sh` removed
  - `.cursor-gitea/commands/{workflow-next,kaola-workflow-finalize}.md` refreshed with the safe standalone-CLI pre-dispatch check

Acceptance-test files were read and run but not edited by this production owner.

## Before

Baseline was reproduced from a clean archive of exact PR head `8aebfaa823352320dc3b2e6e32a1a3a7e31ceca8`, with the acceptance-author's current `scripts/test-cursor-edition.js` copied over it:

```text
node <clean-archive>/scripts/test-cursor-edition.js
exit 1
17 failure(s), 849 passed
```

The failures were the recorded G8/G10 ambient sessionStart mutation, unmanaged canonical collision, symlink traversal, target/receipt/freshness diagnostic, modified-byte uninstall, missing global authority, and shipped ensure-helper cases. After the user clarified the surviving standalone-CLI pre-dispatch behavior, the test author extended the same acceptance file and re-proved exact PR baseline `8aebfaa8` RED at `24 failure(s), 849 passed`.

## Production result

- Global install writes `CURSOR_HOME/kaola-workflow/cursor-authority.json`, binding the Kaola-Workflow version, forge, exact managed relative paths, modes, SHA-256 values, and Kaola hook entries.
- Project install requires explicit `--target`. If no authority has ever existed, the same explicit operation first installs a global authority without enabling global live hooks; an existing missing, modified, wrong-version, or wrong-forge authority is refused rather than repaired from repository bytes.
- The project transaction preflights the target carrier, receipt, all canonical managed basenames, hooks carrier, and hooks JSON before any project write. Symlinks, nonregular paths, unmanaged differing bytes, modified recorded bytes, invalid receipts, and copied receipts bound to another target are refused.
- Existing exact desired bytes may be adopted. Receipt-proven unchanged bytes may be upgraded or removed. Writes and receipts use same-directory temp files, fsync, and atomic rename.
- Project receipt `kaola-workflow-materialization.json` binds the exact target, authority receipt SHA-256, forge/version, and every materialized file SHA-256.
- Doctor validates product/host/forge values and reports the exact target, effective scope, authority and materialization receipt hashes, per-file expected/actual hashes, freshness, collisions, restart boundary, and discovery. It does not infer App facts from CLI state.
- Uninstall removes only receipt-recorded files whose current SHA-256 still matches. Modified, unmanaged, symlink, nonregular, invalid-receipt, and no-receipt topology is preserved. Shared hooks JSON loses only exact receipt-recorded Kaola entries; unrelated events and entries remain.
- The automatic ensure JS/helper and its generated sessionStart wrapper were retired. sessionStart now contains only the compact-context hook.
- The safe transaction script itself is installed at `${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/scripts/kaola-workflow-cursor-surface.js`. Its self-contained `--ensure-target DIR` operation is the sole automatic pre-dispatch materializer: it never selects ambient cwd internally, never bootstraps or repairs a missing/stale global authority, and returns `current` without writing or `materialized` after an explicit-target transaction.
- Generated Cursor `workflow-next` and `kaola-workflow-finalize` run that explicit `$PWD` check only for the measured standalone CLI/local host immediately before a named Kaola dispatch. `materialized` stops for the measured new-process/same-chat reload boundary; an authority/collision/ownership failure reports the exact repair and stops without target mutation. The block explicitly excludes local Cursor App and App-started Cloud, which continue to use their own live catalog. `workflow-init` remains installation-free.

## Verification commands

```text
# Clean current candidate: exact HEAD archive plus the complete current working diff
git archive --format=tar HEAD | tar -xf - -C <temp>
git diff --binary | git -C <temp> apply
node <temp>/scripts/test-cursor-edition.js
exit 0
cursor-edition test passed (749 assertions); all three generated trees absent, so D0 skipped honestly

# Direct linked-worktree run after regenerating the shared ignored trees
node scripts/test-cursor-edition.js
exit 0
cursor-edition test passed (749 assertions)
D0: `.cursor`, `.cursor-gitlab`, and `.cursor-gitea` all present and in parity with canonical

node scripts/sync-cursor-edition.js --forge=github --check
exit 0; 14 agents + 3 commands + 1 hook file in parity

node scripts/sync-cursor-edition.js --forge=gitlab --check
exit 0; 14 agents + 3 commands + 1 hook file in parity

node scripts/sync-cursor-edition.js --forge=gitea --check
exit 0; 14 agents + 3 commands + 1 hook file in parity

git diff --check
exit 0

bash -n install-cursor.sh
exit 0

node --check scripts/kaola-workflow-cursor-surface.js
exit 0

node --check scripts/sync-cursor-edition.js
exit 0
```

Additional disposable behavioral hardening drove three cases not needed to make the visible RED green:

```text
global canonical-name unmanaged collision: installer exit 1; owner implementer bytes preserved
explicit target is a symlink: installer exit 1; outside directory receives no `.cursor`
doctor `--product nonsense`: exit 2 with the allowed-value diagnostic
hardening harness exit 0
```

The added standalone-CLI pre-dispatch transaction was also driven through the **installed isolated helper**, not the repository module:

```text
global install: installed `$CURSOR_HOME/kaola-workflow/scripts/kaola-workflow-cursor-surface.js`
first `--ensure-target <explicit-project>`: status `materialized`
second identical call: status `current`; whole `.cursor` file-hash aggregate unchanged
receipt-owned implementer modified: exit 1; whole target file-hash aggregate unchanged
global authority implementer removed: exit 1; a second empty target remained without `.cursor`
installed-helper smoke harness exit 0
```

The acceptance-test author landed the requested follow-up oracle in `scripts/test-cursor-edition.js`: both generated dispatch consumers across all three forges, installed isolated helper, materialized/current byte+mode+mtime idempotence, modified/collision/symlink/no-target/stale/missing fail-closed legs, App-host exclusion, restart boundary, and continued sessionStart mutation rejection. Exact current production passes all 749 assertions. Production custody did not edit that test.

Cross-surface observation, outside this repair's write ownership:

```text
node scripts/test-runtime-agent-architecture.js
exit 1 at the time observed; 3 failures / 789 passed
all three failures: A3[active-state-schema-mixed]
```

That result was reported to the orchestrator and was not repaired in Cursor-owned files.
After the separate active-run production owner and test author landed their repairs, the same command was rerun from the shared candidate and passed: exit 0, 792 assertions. No Cursor-owned file was changed to obtain that result.

## After

The authored Cursor acceptance suite, including the follow-up standalone-CLI auto-materialization oracle, is green at 749 assertions from both a clean current-candidate archive and the linked worktree with all three generated trees verified in parity. This is working evidence for the production repair; independent re-review and the orchestrator's full-chain verdict remain authoritative.

## Remaining measured unknowns

- Authenticated standalone Cursor CLI exact-named child dispatch remains unmeasured on this host because the isolated CLI was not logged in.
- Local Cursor App child model/profile-source observability remains unknown even though the local App catalog/dispatch probe is separate from CLI.
- A fresh App-started Cloud consumer with project assets present before boot was not started by this production repair.

None of those host-evidence unknowns is represented as a successful install/doctor fact, and no sibling surface is substituted for them.

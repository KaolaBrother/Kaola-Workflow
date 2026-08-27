finding: id=R1 scope=in_scope action=none status=resolved severity=medium fix_role=tdd-guide rationale=current_doctor_identity_remains_unknown_and_history_is_typed
finding: id=R3 scope=in_scope action=none status=resolved severity=medium fix_role=tdd-guide rationale=specified_no_scripts_transitions_now_converge
finding: id=R4 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=partial_authority_promotion_deletes_existing_global_live_hook

# PR #1041 final code-review closure

Candidate: `51ebbac2fa024de3bf8f6e4c428a753aaf95a540`

Base: `b78d006c28a3849b3bcbceffdd1ebc07f2ef5115`

Repair delta: seven files changed from `0884a8347828b2c77d969d639196724af26d0905`; the worktree and index were clean at the supplied candidate.

## Prior finding closure

### R1 - resolved

- Anchor: `scripts/kaola-workflow-cursor-surface.js:718-745`; acceptance at `scripts/test-cursor-edition.js:1733-1784`.
- Reproduction: in a fresh empty `HOME`/`CURSOR_HOME`, `./install-cursor.sh --doctor --json --product app --host cloud` returned current `runtime_build: unknown`, `named_catalog: unknown`, `capability_gap: null`, and `freshness: missing`.
- Historical evidence remained separately typed: `evidence_stamp.runtime_build` retained the measured saved Build and `selected_host.named_catalog` retained the historical catalog result.
- The mutation oracle explicitly fails if those historical values are flattened back into current fields. This closes the original trigger and expected result.

### R3 - resolved for both original triggers

- Anchors: `scripts/kaola-workflow-cursor-surface.js:417-425,470-482,552-564`; acceptance at `scripts/test-cursor-edition.js:1910-1965`.
- Full global -> global `--no-scripts` -> global uninstall: the receipt stayed at 38 files, 19 support scripts, two hook files, and one hook entry after the skipped update. Uninstall removed the unchanged support helper, live hook script, and `sessionStart` entry.
- Fresh project `--no-scripts` -> ordinary project install: the partial authority moved from 17 files/zero scripts/zero hooks to 37 authority files/19 scripts/one authority hook/one hook entry; the project live hook and `sessionStart` entry were restored.
- `node scripts/test-cursor-edition.js` passed all 785 assertions. The exact two prior triggers no longer reproduce.

## New repair-delta finding

### R4 - an authority-only promotion deletes a still-active global live hook

- Severity: medium.
- Failure class: receipt-owned active-hook deletion and dangling registration.
- Primary anchor: `scripts/kaola-workflow-cursor-surface.js:552-558` invokes `installGlobal(... authorityOnly: true)` for a partial-authority promotion; that desired set excludes `hooks/<hook>` at lines 304-334.
- Secondary anchor: `scripts/kaola-workflow-cursor-surface.js:397-405,467-468` treats every prior receipt-owned file absent from the authority-only desired set as retired and deletes its unchanged byte. `scripts/test-cursor-edition.js:1945-1965` starts from a fresh partial authority with no prior global live hook, so it cannot detect this downgrade.
- Preconditions and input:
  1. Run a normal global install, producing 38 receipt files, both authority and live global hook files, and a global `sessionStart` entry.
  2. Remove one skipped authority asset, here `kaola-workflow/hooks/kaola-workflow-compact-context.sh`.
  3. Run the global installer with `--no-scripts`; the repaired rule correctly drops only the missing asset while retaining the still-present receipt-owned live global hook.
  4. Run an ordinary project install against a target in the same home; this enters the new partial-authority promotion branch.
- Expected: the ordinary project install restores the missing authority asset and materializes the project hook without removing an independently active, unchanged, receipt-owned global live hook. The global hook registration must remain executable and owned.
- Observed: before promotion, the 37-file receipt still owned `hooks/kaola-workflow-compact-context.sh`, that file existed, and `hooks.json` had `sessionStart`. After the project install exited zero, the authority hook and project hook existed, but the global live hook file was deleted, its receipt record disappeared, and the global `sessionStart` entry remained. The result is a dangling global hook command that later uninstall no longer owns as a file.
- Reproduction result was deterministic in an isolated home/target: `receipt_live_hook true -> false`, `live_hook_exists true -> false`, while `sessionStart` stayed `true` and `project_hook_exists` became `true`.
- Why existing guards do not prevent it: the promotion oracle exercises only a fresh `--no-scripts` authority, which never had a global live hook. The full-to-no-scripts oracle proceeds directly to uninstall and never enters project promotion.
- Required repair/acceptance: add a RED transition covering full global -> one missing skipped authority asset -> global `--no-scripts` -> ordinary project promotion. Promotion must preserve any prior non-missing receipt-owned global live hook and its ownership, or otherwise update/remove the registration coherently without downgrading the independent global install.

## Re-audited unchanged contracts

- `install-all.sh` remains current-machine-only, has no `--cloud` parse branch or forwarded Cloud option, and states that only a confirmed Cursor Cloud environment-setup Agent invokes `install-cursor.sh` directly for the remote machine plus selected repository. `node scripts/test-install-all.js` passed 275 assertions, including exit 2 and zero installer markers for `--cloud`.
- Canonical adapter and docs still require confirmed Cloud setup -> remote authority plus explicit selected-repository materialization -> tested Build -> manual Save -> a new top-level Agent in the same repository. Standalone CLI alone owns the `--ensure-target "$PWD"` point-of-use materializer; App local and Cloud remain excluded.
- The live PR body names exact candidate/base, R1/R3 repair claims, all three surfaces, the local-only install-all boundary, and exact validation counts. PR #1041 is OPEN, non-draft, MERGEABLE/CLEAN at the supplied head. Issues #1037/#1039 remain OPEN and claimed; final correction/evidence comments remain a later docking action.

## Validation evidence

- `node scripts/test-cursor-edition.js`: pass, 785 assertions.
- `node scripts/test-runtime-agent-architecture.js`: pass, 798 assertions.
- `node scripts/test-install-all.js`: pass, 275 assertions.
- `node scripts/test-generate-routing-surfaces.js`: pass, 520 assertions.
- `node scripts/validate-script-sync.js`: pass.
- `git diff --check base..candidate`: pass; candidate worktree stayed clean.
- Exact receipt `.cache/chain-receipt.json`: head `51ebbac2fa024de3bf8f6e4c428a753aaf95a540`, `workTreeHash: clean`, code-tree hash `e15037487d9a5933a50dd9a1a67bc98d000deb50f069eda0a1fa01fd8c941c29`; Claude, Codex, GitLab, and Gitea each exited zero once with no accepted RED, retry, timeout, signal, or waiver.
- Strict `--release-check` against that receipt and candidate returned `result: pass` for all four chains.

No other candidate-caused defect was admitted in the full prior frontier plus repair delta.

verdict: fail
findings_blocking: 1
review_conclusion: Prior R1 and R3 triggers are resolved, but repair-delta R4 must preserve the active global live hook before finalization can pass.

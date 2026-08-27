# PR #1041 final adversarial closure

behavior: adversarial-verifier

candidate: `51ebbac2fa024de3bf8f6e4c428a753aaf95a540`

base: `b78d006c28a3849b3bcbceffdd1ebc07f2ef5115`

## Exact claim

`install-all.sh` must never install Cloud. Cloud installation is allowed only after an Agent establishes it is in Cursor Cloud environment setup, using direct remote global plus explicit selected-repository installation, followed by the user's manual Save and a new same-repository top-level Agent. This path must remain isolated from standalone CLI point-of-use materialization and Cursor App local IDE.

## Exact closure surface

PR #1041 / Issues #1037 and #1039; the repair delta from prior candidate `0884a8347828b2c77d969d639196724af26d0905` to the supplied immutable candidate; prior R1/R3; semantic opposites for historical-versus-current doctor identity, receipt ownership across full -> no-scripts -> uninstall, and partial-authority promotion across no-scripts -> ordinary project; generated Cursor guidance, install-all's argument/behavior boundary, the live PR body, and the exact all-four receipt at `/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/bundle-1037-1039/.cache/chain-receipt.json`.

## Execution and analytical result

Execution completed successfully. The candidate worktree was clean at exact HEAD through the initial validation checkpoint. A concurrent uncommitted R4 repair then appeared in the shared worktree; this verifier did not author, revert, or count those bytes as part of the immutable candidate. The decisive R4 reproduction instead extracted exact commit `51ebbac2fa024de3bf8f6e4c428a753aaf95a540` with `git archive`. Product and tracked files were not edited by this verifier. Real installer and renderer fixtures were isolated below `/tmp` and moved recoverably to Trash after inspection. The only persistent write is this requested report.

Analytical result: **refuted**. Prior R1 and R3 are repaired, and the explicit install-all/Cloud/CLI/App boundary survived attack, but a concrete repair-delta counterexample shows partial-authority promotion deletes an active receipt-owned global live hook while leaving its `sessionStart` registration dangling.

Two initial shell/jq harness attempts were not counted as evidence: one jq expression accidentally returned a truthy object containing `verified: false`; another queried nonexistent `selected_host.build_identity`/`notes` paths and used zsh's read-only `status` name. The corrected command used `set -o pipefail`, the actual `selected_host.stamp.runtime_build` and singular `note` schema, and passed. A first multi-forge render attempt also reused a now-nonempty staging root, and a later scan omitted `--hidden`; both were rerun with one empty staging root per forge and hidden-file scanning. All leftover fixture roots were moved to Trash.

## Prior finding closure

finding: id=R1 scope=in_scope action=fix status=resolved severity=medium fix_role=tdd-guide rationale=current doctor identity stays unknown while historical Cloud evidence remains typed

### R1 — historical evidence is no longer flattened into current doctor identity

- Repair anchors: `scripts/kaola-workflow-cursor-surface.js:718-745` hard-code current `runtime_build` and `named_catalog` to `unknown`, keep `capability_gap` null, and place historical facts under `evidence_stamp`/`selected_host`. `scripts/test-cursor-edition.js:1733-1781` asserts those distinctions and includes an armed semantic-opposite mutation which converts the historical fields into current fields and detects both `current-build-inferred` and `live-catalog-inferred`.
- Direct counterexample command, executed with a fresh empty HOME/CURSOR_HOME:

  ```text
  env HOME=<fresh>/home CURSOR_HOME=<fresh>/cursor \
    bash ./install-cursor.sh --doctor --json --product app --host cloud
  ```

- Observed and machine-asserted result:

  ```json
  {
    "runtime_build": "unknown",
    "named_catalog": "unknown",
    "capability_gap": null,
    "historical_evidence_stamp": "bld-20260827-56284e4a-bc0c-4cb6-b873-a48d180693e2",
    "historical_selected_build": "bld-20260827-56284e4a-bc0c-4cb6-b873-a48d180693e2",
    "historical_catalog": "project_custom_from_saved_environment_build"
  }
  ```

- The original empty-host reproduction no longer produces an impossible current Build/catalog identity. R1 is resolved.

finding: id=R3 scope=in_scope action=fix status=resolved severity=medium fix_role=tdd-guide rationale=no-scripts preserves non-missing prior ownership and ordinary project install promotes partial authority

### R3 — ownership and partial-authority transitions now converge

- Repair anchors: `scripts/kaola-workflow-cursor-surface.js:417-428` carries forward prior receipt records for non-missing skipped script/hook assets; `:445-487` carries forward skipped ownership and exact hook entries; `:430-436` compares receipt coverage; `:537-565` promotes an incomplete authority before ordinary project materialization. Transition oracles are in `scripts/test-cursor-edition.js:1910-1965`.
- Full -> no-scripts -> uninstall direct reproduction used a fresh isolated HOME/CURSOR_HOME and the real `install-cursor.sh`:

  ```text
  install-cursor.sh --global --yes
  install-cursor.sh --global --no-scripts --yes
  install-cursor.sh --global --uninstall --yes
  ```

- Observed result: the initial receipt contained 38 files; the no-scripts receipt still contained 38 files, including `kaola-workflow/scripts/kaola-workflow-cursor-surface.js`, `hooks/kaola-workflow-compact-context.sh`, and the exact `sessionStart` hook entry. Uninstall removed both unchanged assets, the hook entry, and the authority receipt. No ownership residue survived.
- Fresh no-scripts -> ordinary project direct reproduction:

  ```text
  install-cursor.sh --target <fresh-project> --no-scripts --yes
  install-cursor.sh --target <same-project> --yes
  ```

- Observed result: the deliberately partial authority started at 17 files with no support script or project hook. The ordinary install promoted it to 37 authority files and restored the global support script, the project compact hook, and project `sessionStart`. R3 is resolved.
- Source inspection also preserves the safety opposite: a non-missing modified/non-regular skipped carrier retains its prior expected hash, so doctor reports it stale and uninstall removes it only when its bytes still match; missing skipped assets are not falsely retained as active ownership.

finding: id=R4 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=authority-only partial promotion deletes an active receipt-owned global live hook and leaves its sessionStart registration dangling

### R4 — partial-authority promotion downgrades an existing independent global install

- failure_class: receipt-owned active-hook deletion / dangling registration
- primary anchor: `scripts/kaola-workflow-cursor-surface.js:552-558` promotes a partial receipt by invoking `installGlobal(... authorityOnly: true)`; the authority-only desired set excludes the live `hooks/<hook>` carrier.
- secondary anchor: `scripts/kaola-workflow-cursor-surface.js:397-405,467-468` treats prior receipt-owned files absent from the authority-only desired set as retired and deletes unchanged bytes. `scripts/test-cursor-edition.js:1945-1965` begins from a fresh partial authority that has never owned a global live hook, so its passing promotion oracle cannot observe this downgrade.
- Exact immutable-candidate reproduction, executed from a `git archive 51ebbac2...` tree with fresh HOME/CURSOR_HOME/project:

  ```text
  install-cursor.sh --global --yes
  move kaola-workflow/hooks/kaola-workflow-compact-context.sh aside
  install-cursor.sh --global --no-scripts --yes
  install-cursor.sh --target <fresh-project> --yes
  ```

- Pre-promotion observation: the remaining global live hook existed, its receipt record existed, and global `hooks.json` contained `sessionStart`.
- Post-promotion observation, despite installer exit 0:

  ```text
  before_live=yes before_owned=yes before_sessionStart=yes
  after_live=no  after_owned=no  after_sessionStart=yes
  authority_restored=yes project_hook=yes
  ```

- Expected: promotion restores the missing authority asset and creates the project hook without removing a separate still-active, unchanged, receipt-owned global live hook; registration and ownership remain coherent.
- Observed: promotion restores the authority/project hooks but deletes the global live hook, drops its receipt ownership, and leaves the global `sessionStart` command registered to a missing file. A later uninstall no longer owns that live-hook file record.
- This is not the original R3 trigger: the original fresh partial promotion passes. It is a new repair-delta regression combining the two repaired state paths. The focused 785-assertion suite is green because its full-to-no-scripts case proceeds directly to uninstall and its promotion case starts from a fresh partial authority.
- Required acceptance: add a RED transition for full global -> one missing skipped authority asset -> global no-scripts -> ordinary project promotion. Authority-only promotion must preserve non-missing prior live-hook records/bytes, or coherently remove both registration and ownership without silently downgrading an independent global install.

finding: id=R2 scope=in_scope action=fix status=resolved severity=medium fix_role=doc-updater rationale=live PR body now describes the exact final candidate and corrected three-surface evidence

### R2 — prior live PR metadata mismatch is resolved

- `gh pr view 1041 --repo kaolabrother/Kaola-Workflow --json ...` returned OPEN, not draft, MERGEABLE/CLEAN, exact head `51ebbac2fa024de3bf8f6e4c428a753aaf95a540`, and exact base `b78d006c28a3849b3bcbceffdd1ebc07f2ef5115`.
- The live body names the final candidate, says install-all has no Cloud mode, restricts Cloud install to Agent-confirmed environment setup plus remote authority/selected repository/manual Save/new same-repository parent, distinguishes standalone CLI from App local IDE/Cloud, records current-doctor unknowns and the no-scripts repairs, and lists the exact current receipt/hash/counts. It no longer says not to merge.
- Issues #1037/#1039 were still OPEN and labelled `workflow:in-progress` at inspection time. That is expected pre-sink lifecycle state, not a candidate defect.

## User boundary attacks

### install-all cannot implicitly or explicitly deploy Cloud

- `./install-all.sh --cloud` exited 2 at closed argument parsing with `Unknown argument: --cloud`; no installer ran.
- `KAOLA_CODEX_BIN=/definitely/not/a/codex ./install-all.sh --check --global --yes --forge=github` printed only seven current-machine commands. Cursor was exactly `bash .../install-cursor.sh --forge=github --global --yes`; there was no Cloud, remote, dashboard, Build, SSH, curl, or arbitrary pass-through carrier.
- `rg -n '(ssh|curl|scp|rsync|remote|dashboard|build[-_ ]?id|--cloud)' install-all.sh` found only explanatory prose about a remote selected repository and a generic Codex marketplace comment; no executable remote route exists.
- `node scripts/test-install-all.js` passed 275 assertions. Its fixture executes the `--cloud` rejection and proves zero runtime markers, so the guard is not merely a wording test.

### Cloud setup, Save, and same-repository handoff remain distinct from CLI/App local

- Canonical adapter source at `templates/agents/runtime-capabilities.json:399-400,409` requires Agent-established Cursor Cloud environment setup, direct remote-machine authority plus selected-repository install, tested Build, manual Save, and a new top-level Cloud Agent in the same repository before live-catalog trust. It explicitly says local install-all never installs Cloud and App local/Cloud never inherit the standalone CLI materializer.
- Fresh rendering for GitHub, GitLab, and Gitea produced six workflow-next/finalize consumer files containing each of: the Agent-confirmed Cloud setup clause, Save + same-repository new-parent clause, install-all local-only clause, and explicit CLI-local `--ensure-target "$PWD"`. No rendered ambient `--ensure-target "."` or `sessionStart` materializer was found.
- `node scripts/test-runtime-agent-architecture.js` passed 798 assertions. Its semantic mutations remove the environment-setup precondition, Save/same-repository handoff, install-all boundary, or CLI/App split and require rejection.
- `node scripts/test-cursor-edition.js` passed 785 assertions. It exercises the real installer, generated guidance, ambient-repository negative, sessionStart compact-only boundary, exact-target helper, collisions, symlinks, receipt binding, doctor semantic opposite, and both R3 transition sequences.
- The new candidate's real global installs were executed from the candidate Git worktree with isolated HOME/CURSOR_HOME; final `git status --porcelain=v1` stayed empty and `.cursor` was not created in that ambient worktree.
- The durable Cloud evidence remains internally bound to setup source `101250f293a5439ed73e8ee2127c7501fba9e883`, saved Build `bld-20260827-56284e4a-bc0c-4cb6-b873-a48d180693e2`, new same-repository parent `bc-3e6bd3bd-f310-47cd-a9cb-358cf802f16d`, exact implementer child `bc-7d00ddad-23f3-5e69-8f9a-1c326b051a49`, and token `PROBE_OK_CURSOR_CLOUD_FINAL_SAVED_REPO_IMPLEMENTER`; the checked-in-only and saved-user-global-only controls remained built-in-only. This closure did not reopen the private Cursor UI. The 51eb repair delta changes doctor and ownership/promotion logic, not the saved-environment discovery profiles or Cloud lifecycle; the changed real installer paths were exercised directly above.

## Candidate and exact receipt

- At the validation checkpoint, `git rev-parse HEAD` returned exact `51ebbac2fa024de3bf8f6e4c428a753aaf95a540`; `git status --porcelain=v1` and `git diff --check b78d006c...51ebbac2` were clean. Concurrent uncommitted R4 repair bytes appeared later and were excluded by reproducing from an exact commit archive.
- Repair delta `0884a834..51ebbac2`: seven files, 150 insertions and 18 deletions: CHANGELOG/README/API/Cursor docs, installer help, Cursor state machine, and Cursor tests.
- Exact receipt fields: `headSha=51ebbac2fa024de3bf8f6e4c428a753aaf95a540`, `workTreeHash=clean`, `codeTreeHash=e15037487d9a5933a50dd9a1a67bc98d000deb50f069eda0a1fa01fd8c941c29`, and `acceptedRedEvidence=null`.
- Claude, Codex, GitLab, and Gitea each record exit 0, attempts 1, `retried_transient=false`, `timed_out=false`, `signal=null`, and `accepted_red=false`.
- Strict verification command:

  ```text
  node scripts/kaola-workflow-run-chains.js --release-check \
    --candidate 51ebbac2fa024de3bf8f6e4c428a753aaf95a540 \
    --receipt /Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/bundle-1037-1039/.cache/chain-receipt.json \
    --json
  ```

  returned `result: pass` for all four chains.

## Confidence

High confidence in R4: the exact transition was independently reproduced from an archive of the immutable candidate, with before/after file, receipt, and registration state recorded. High confidence that R1/R3's original triggers and the install-all/Cloud/CLI/App isolation subclaims survive. The exact receipt remains structurally valid but its green suite does not exercise R4.

verdict: fail
findings_blocking: 1

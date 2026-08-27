# PR #1041 final adversarial closure after R4

behavior: adversarial-verifier

candidate: `58d26e916dd9313f2aa5e671ea463cca1792895e`

base: `b78d006c28a3849b3bcbceffdd1ebc07f2ef5115`

## Exact claim

`install-all.sh` must never install Cursor Cloud. Cloud installation is allowed only after an Agent establishes it is in Cursor Cloud environment setup, using direct remote global plus explicit selected-repository installation, followed by the user's manual Save and a new same-repository top-level Agent. This path must remain isolated from standalone CLI point-of-use materialization and Cursor App local IDE. Current doctor identity must not flatten historical evidence. Receipt ownership must remain coherent across full -> no-scripts -> uninstall, no-scripts -> ordinary project promotion, and the R4 full -> missing authority hook -> no-scripts -> ordinary project promotion transition.

## Exact surface

Immutable pushed candidate `58d26e916dd9313f2aa5e671ea463cca1792895e`, base `b78d006c28a3849b3bcbceffdd1ebc07f2ef5115`, PR #1041, Issues #1037/#1039, prior R1/R3/R4, the repair delta from `51ebbac2fa024de3bf8f6e4c428a753aaf95a540`, real installer transitions including coherent project/global uninstall, install-all parser and side-effect boundary, canonical and freshly rendered Cursor guidance for all three forges, the live PR body, and the exact clean all-four receipt.

## Result

Execution result: **successful**. The candidate was tested from an independent local clone checked out detached at the exact commit; no shared worktree bytes were edited or used as candidate state. All installer/render fixtures lived under that temporary clone. After inspection the complete temporary root was moved recoverably to Trash. The only persistent write is this requested report.

Analytical result: **not_refuted**. The strongest admitted counterexamples did not break the claim. R1, both original R3 triggers, and R4 are resolved. No concrete new finding was found.

## Prior finding closure

finding: id=R1 scope=in_scope action=none status=resolved severity=medium fix_role=tdd-guide rationale=current doctor identity remains unknown while historical Cloud evidence stays typed

### R1 — historical Cloud evidence is not current identity

- Anchors: `scripts/kaola-workflow-cursor-surface.js:718-744`; armed semantic-opposite acceptance at `scripts/test-cursor-edition.js:1733-1781`.
- Exact reproduction in a fresh empty HOME/CURSOR_HOME:

  ```text
  env HOME=<fresh>/home CURSOR_HOME=<fresh>/cursor \
    bash ./install-cursor.sh --doctor --json --product app --host cloud
  ```

- Machine-asserted observation:

  ```text
  runtime_build=unknown
  named_catalog=unknown
  capability_gap=null
  freshness=missing
  historical_build=bld-20260827-56284e4a-bc0c-4cb6-b873-a48d180693e2
  historical_catalog=project_custom_from_saved_environment_build
  ```

- The exact former empty-host counterexample no longer produces an impossible current Build/catalog. The test mutation still detects both `current-build-inferred` and `live-catalog-inferred` if historical fields are flattened.

finding: id=R3 scope=in_scope action=none status=resolved severity=medium fix_role=tdd-guide rationale=original no-scripts ownership and partial-promotion transitions converge and uninstall coherently

### R3 — both original transition triggers remain repaired

- Anchors: `scripts/kaola-workflow-cursor-surface.js:417-436,445-486,537-563`; acceptance at `scripts/test-cursor-edition.js:1910-1965`.
- Full global -> global no-scripts -> global uninstall, using the real installer in a fresh home:

  ```text
  install-cursor.sh --global --yes
  install-cursor.sh --global --no-scripts --yes
  install-cursor.sh --global --uninstall --yes
  ```

- Observation: receipt count remained `38 -> 38`; the support helper, global live hook, exact hook entry, and ownership survived the skipped update. Uninstall removed the support helper, live hook, `sessionStart`, and authority receipt.
- Fresh project no-scripts -> ordinary project install:

  ```text
  install-cursor.sh --target <project> --no-scripts --yes
  install-cursor.sh --target <same-project> --yes
  ```

- Observation: authority count promoted `17 -> 37`; the global support helper, project hook, and project `sessionStart` were restored. The former partial-authority false-success counterexample did not reproduce.

finding: id=R4 scope=in_scope action=none status=resolved severity=medium fix_role=tdd-guide rationale=authority-only promotion preserves active global live-hook bytes ownership and registration through coherent uninstall

### R4 — active global live hook survives partial-authority promotion

- Repair delta: `scripts/kaola-workflow-cursor-surface.js:467-473` now treats `hooks/` as a preserved prefix during `authorityOnly` promotion. `removeRetiredManaged` therefore does not delete the independently active live hook, and `carryForwardSkippedRecords` retains its prior hash-bound ownership. Acceptance is at `scripts/test-cursor-edition.js:1968-1997`.
- Strongest exact transition:

  ```text
  install-cursor.sh --global --yes
  move kaola-workflow/hooks/kaola-workflow-compact-context.sh aside
  install-cursor.sh --global --no-scripts --yes
  install-cursor.sh --target <fresh-project> --yes
  ```

- Before promotion: the global live hook existed, the authority receipt owned it, and global `hooks.json` registered `sessionStart`.
- After promotion:

  ```text
  full_receipt=38 partial_receipt=37 promoted_receipt=38
  live_hook_bytes_same=yes
  live_hook_receipt_hash_matches=yes
  global_sessionStart=yes
  authority_hook_restored=yes
  project_hook_restored=yes
  project_sessionStart=yes
  ```

- The former R4 semantic opposite did not reproduce: promotion no longer removes the live hook or its receipt record, and registration is not dangling.
- Uninstall coherence was extended beyond the committed test:
  - Project uninstall removed the project hook, project receipt, and project `sessionStart`, while the global live hook bytes, receipt ownership, and global `sessionStart` all remained current.
  - Subsequent global uninstall removed the authority hook, global live hook, authority receipt, and global `sessionStart`.
- A modified/non-regular preserved carrier continues to retain its prior expected hash and makes doctor stale; uninstall removes only unchanged receipt-matching bytes. A missing carrier is not falsely retained as active ownership.

## install-all and Cursor surface boundary

### No Cloud route or side effect in install-all

- Direct isolated command:

  ```text
  env HOME=<empty> CURSOR_HOME=<empty> CODEX_HOME=<empty> \
    XDG_CONFIG_HOME=<empty> CLAUDE_CONFIG_DIR=<empty> \
    ./install-all.sh --cloud
  ```

- Observation: exit `2`, first error `install-all: Unknown argument: --cloud`, and `created_runtime_paths=0`. Only the verifier's captured stdout/stderr files existed; no runtime carrier was created.
- Source parser at `install-all.sh:170-180` has a closed option table and sends every unknown argument to `die_arg` before command construction or `run_one`.
- `KAOLA_CODEX_BIN=/definitely/not/a/codex ./install-all.sh --check --global --yes --forge=github` printed exactly seven current-machine plans. Cursor was `install-cursor.sh --forge=github --global --yes`; no Cloud, remote, dashboard, Build, SSH, curl, or pass-through carrier appeared.
- `node scripts/test-install-all.js` passed 275 assertions, including the executable refusal fixture and zero installer markers. This is not a prose-only guard.

### Cloud install only after confirmed environment setup

- `docs/cursor-edition.md:25-43` gives the direct lifecycle: open the selected repository's Cursor Cloud environment setup; only after the setup Agent establishes that host, run remote `install-cursor.sh --global --yes` plus explicit `install-cursor.sh --target "$PWD" --yes`; test and report the Build; ask the user to click Save; then open a new top-level Cloud Agent in the same repository and verify its visible Build/live catalog.
- Canonical adapter source keeps `install-all.sh` current-machine-only, restricts point-of-use `--ensure-target "$PWD"` to standalone CLI/local, and explicitly excludes App local IDE and App-started Cloud from that rule.
- Fresh GitHub/GitLab/Gitea rendering produced six workflow-next/finalize consumer files containing each required clause: Agent-confirmed Cloud environment setup, remote machine plus selected repository, manual Save plus new same-repository parent, install-all local-only, and explicit CLI-local target. No rendered ambient `--ensure-target "."` or `sessionStart` materializer was found.
- `node scripts/test-runtime-agent-architecture.js` passed 798 assertions; its semantic mutations reject removal of setup confirmation, Save/same-repository handoff, install-all boundary, and CLI/App host separation.
- `node scripts/test-cursor-edition.js` passed 788 assertions against the exact clone. It covers the real installer, doctor mutation, ambient-repository/sessionStart negatives, explicit CLI helper, ownership faults, R3 transitions, and R4.
- Durable live evidence remains typed and internally consistent: checked-in-only and saved-user-global-only Cloud controls stayed built-in-only; the successful setup installed remote authority plus selected repository, the user saved Build `bld-20260827-56284e4a-bc0c-4cb6-b873-a48d180693e2`, new same-repository parent `bc-3e6bd3bd-f310-47cd-a9cb-358cf802f16d` exposed the catalog, and exact implementer child `bc-7d00ddad-23f3-5e69-8f9a-1c326b051a49` returned the recorded success token. This closure did not reopen the private Cursor UI; the 58d repair changes authority receipt retention, not the discovery profiles or saved-environment lifecycle, and its changed installer path was exercised directly above.

## Live PR, Issues, and exact receipt

- Live `gh pr view 1041` returned OPEN, not draft, MERGEABLE/CLEAN, exact head `58d26e916dd9313f2aa5e671ea463cca1792895e`, and exact base `b78d006c28a3849b3bcbceffdd1ebc07f2ef5115`.
- The live body names the exact candidate/base, current 788/798/275 counts, R1/R3/R4 semantics, current-machine-only install-all boundary, confirmed Cloud setup/manual Save/new same-repository parent, and exact receipt hash. No stale do-not-merge or obsolete evidence remains.
- Issues #1037/#1039 remained OPEN with `workflow:in-progress` at inspection time. That is the expected pre-sink state, not a candidate defect.
- Receipt: `/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/bundle-1037-1039/.cache/chain-receipt.json`.
- Exact receipt identity:

  ```text
  headSha=58d26e916dd9313f2aa5e671ea463cca1792895e
  workTreeHash=clean
  codeTreeHash=b737f3efdbc2ad3f9b01737e0b2560b76db0a1445b4e20a1b249bd33b8c1fa54
  scope.base=b78d006c28a3849b3bcbceffdd1ebc07f2ef5115
  scope.decision=all-four
  ```

- Claude, Codex, GitLab, and Gitea each record exit 0, attempts 1, `retried_transient=false`, `timed_out=false`, `signal=null`, and `accepted_red=false`.
- Strict command:

  ```text
  node scripts/kaola-workflow-run-chains.js --release-check \
    --candidate 58d26e916dd9313f2aa5e671ea463cca1792895e \
    --receipt /Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/bundle-1037-1039/.cache/chain-receipt.json \
    --json
  ```

  returned `result: pass` for all four chains.

## Additional exact-candidate validation

- `git status --porcelain=v1`: empty in the detached exact clone.
- `git diff --check base..candidate`: pass.
- `node scripts/test-generate-routing-surfaces.js`: 520 assertions passed.
- `node scripts/simulate-workflow-walkthrough.js`: 179/179 passed.
- `node scripts/validate-script-sync.js`: pass, including 16 common scripts, 28 byte-identical groups, and four committed kernel copies.

## New finding sweep

No new candidate-caused finding was demonstrated. Boundary values and state transitions exercised included missing current doctor identity, full and partial receipts, missing authority hook with surviving live hook, promotion persistence, project/global uninstall ordering, rejected Cloud argument before side effects, exact target versus ambient target, generated consumer parity across three forges, live publication metadata, and exact receipt identity.

## Confidence

High. The exact prior counterexamples were reproduced against an independent immutable checkout; R4 was checked through byte hash, receipt hash, registration, and two-stage uninstall rather than only file existence. Uncertainty was counted against the claim; no unresolved execution failure, stale identity, or untested admitted transition remains in the assigned surface.

verdict: pass
findings_blocking: 0

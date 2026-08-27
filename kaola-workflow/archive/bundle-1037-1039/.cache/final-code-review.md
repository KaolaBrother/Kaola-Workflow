finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=doctor_flattens_historical_cloud_evidence_into_current_identity
finding: id=R3 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=no_scripts_receipt_drops_still_managed_assets

# PR #1041 final immutable candidate code review

Candidate: `0884a8347828b2c77d969d639196724af26d0905`

Base: `b78d006c28a3849b3bcbceffdd1ebc07f2ef5115`

Branch: `cursor/install-surface-1039-9401`

Scope: PR #1041 and Issues #1037/#1039, including all 55 changed files, generated sources and rendered guidance, the three Cursor execution surfaces, live-surface authority evidence, and the exact producer receipt.

## Blocking findings

### R1 - Doctor reports a historical Cloud Build and catalog as current runtime identity

- Severity: medium.
- Failure class: false effective-state identity.
- Primary anchor: `scripts/kaola-workflow-cursor-surface.js:677-703`, especially lines 690 and 696.
- Secondary anchors: `templates/agents/runtime-capabilities.json:455-472`, `docs/api.md:1596-1599`, and `scripts/test-cursor-edition.js:1733-1767`.
- Precondition and input: use a fresh empty `HOME` and `CURSOR_HOME`, provide only `--product app --host cloud`, and provide no authority receipt, project target, materialization receipt, live Task catalog, or current Build identifier.
- Expected: current `runtime_build` and current catalog identity remain `unknown` unless independently observed or supplied. The saved Build remains available only under the explicitly historical `evidence_stamp`/selected capability record. The report may still state the static required materialization and reload contract.
- Observed: the doctor reports `runtime_build: bld-20260827-56284e4a-bc0c-4cb6-b873-a48d180693e2` and `named_catalog: project_custom_from_saved_environment_build` while simultaneously reporting `effective_profile_scope: none`, `freshness: missing`, `project_target: null`, a missing authority receipt, and no materialization receipt.
- Reproduction: `HOME=<empty>/home CURSOR_HOME=<empty>/cursor ./install-cursor.sh --doctor --json --product app --host cloud` on the exact candidate deterministically produced the contradictory output above.
- Proof: `report()` copies `selected.stamp.runtime_build` and `selected.named_catalog` directly into unqualified top-level effective fields. The stamp identifies one historical measured Cloud run, not the caller's current Build. The command has no current-Build or live-catalog input and therefore cannot have observed either value.
- Impact: an unsaved, stale, or different Cursor Cloud environment can appear to be the exact known-good saved Build/catalog. That undermines the required same-Build verification before trusting Cloud custom roles and violates the candidate's own honest-unknown doctor contract.
- Why existing guards do not prevent it: the current doctor test asserts the flattened historical values. It has no empty-home or different-current-Build counterexample, so it entrenches this failure rather than detecting it.
- Required repair/acceptance: keep historical capability evidence typed as historical; leave current Build/catalog unknown without current evidence. Add a RED fixture for an empty/currently unidentified Cloud host and a positive fixture that supplies or observes an exact current Build/catalog through a truthful carrier.

### R3 - `--no-scripts` corrupts the global ownership receipt across install transitions

- Severity: medium.
- Failure class: install-state and ownership-receipt corruption.
- Primary anchor: `scripts/kaola-workflow-cursor-surface.js:446-457`.
- Secondary anchors: `scripts/kaola-workflow-cursor-surface.js:397-406`, `:510-578`, and `:600-627`; `install-cursor.sh:31-37`, `:80-92`, and `:214-216`; `scripts/test-cursor-edition.js:1869-1890`.
- Precondition and input A: perform a normal global install, reinstall the same global authority with `--no-scripts`, then run global uninstall.
- Expected A: `--no-scripts` skips updating support scripts/hooks without silently relinquishing ownership of unchanged assets that remain on disk. A later uninstall removes all still receipt-proven unchanged Kaola assets and removes the receipt-recorded Kaola hook entry.
- Observed A: the normal receipt contained 38 files, including 19 support scripts, two hook files, and one hook entry. The `--no-scripts` reinstall preserved those bytes and the live hook on disk but rewrote the receipt to only 17 files, zero scripts, zero hooks, and zero hook entries. Global uninstall then exited successfully while leaving the support script, hook script, and live `sessionStart` entry behind.
- Precondition and input B: in a clean home, run `install-cursor.sh --target <repo> --no-scripts --yes`, then run the ordinary default `install-cursor.sh --target <repo> --yes` against the same home and target.
- Expected B: removing `--no-scripts` restores the default support scripts and project hook assets promised by the installer.
- Observed B: both commands exited zero, but the authority remained the 17-file/zero-script/zero-hook partial receipt; the global support helper, project compact hook, and project hook entry all remained absent.
- Proof: `removeRetiredManaged()` intentionally preserves the old script/hook paths for a no-scripts global update, but `installGlobal()` immediately serializes only `recordsFor(built.desired)` and `built.hooks`, dropping ownership of the preserved bytes. In contrast, `installProject()` lines 563-577 already preserves prior hook file records and hook entries for its no-scripts transition. A later ordinary project install sees the partial global receipt as valid/current and never promotes it to the default authority inventory.
- Impact: update and uninstall report success while leaving active stale hooks and support bytes, and a later normal install reports success with required default assets still missing. This is deterministic for every forge because the defect is in shared receipt logic.
- Why existing guards do not prevent it: `scripts/test-cursor-edition.js:1869-1890` compares two fresh isolated installs only. It never exercises full-to-no-scripts-to-uninstall or no-scripts-to-default transitions. Receipt schema/freshness validation accepts any internally valid subset and records no installation profile.
- Required repair/acceptance: first add transition oracles for both sequences. Preserve prior receipt records and hook entries for unchanged skipped assets, analogous to the project receipt logic, and distinguish or promote a partial no-scripts authority before a later default project materialization claims success.

## Surface and acceptance review

The three Cursor surfaces are otherwise honestly separated in the candidate:

- Standalone Cursor CLI/local alone receives the safe explicit `--ensure-target "$PWD"` point-of-use materializer. It is authority-receipt bound, target explicit, fail-closed on ownership faults, and requires a fresh process after materialization.
- Cursor App local IDE is independently recorded and does not inherit the standalone CLI materialization rule. Its still-unmeasured global discovery, materialization necessity, reload behavior, and child model/profile source remain explicitly unknown.
- Cursor Cloud is presented as a saved remote-environment lifecycle, not a local install mode: only an Agent-confirmed environment setup installs the remote-machine authority plus selected repository; the setup must pass receipt/current/idempotence checks; the user manually saves; then a new top-level Agent in the same repository verifies the exact Build and live catalog. Checked-in-only and saved-user-global-only states remain negative controls.

`install-all.sh` is correctly current-machine-only. It has no `--cloud` branch, invokes no remote/dashboard mechanism, and rejects `--cloud` during argument parsing before any installer runs. The executable test verifies exit 2 and zero installer markers.

The Cloud positive was exercised at `101250f293a5439ed73e8ee2127c7501fba9e883`. Production installation bytes in `install-cursor.sh`, `scripts/kaola-workflow-cursor-surface.js`, and `scripts/sync-cursor-edition.js` are unchanged from that SHA to the final candidate. The later delta changes guidance, capability data, tests, and the `install-all.sh` boundary, all covered by the final focused/static/all-four evidence.

Issue #1037's active-run adoption remains within ADR 0017: the Mission List is still four fields and outcome-level; compatibility is classified per managed change; execution-default changes require explicit conversation consent; state-incompatible/unknown changes remain preserved and fenced; claim, branch, worktree, completed results, and dispatch locators are not migrated. I found no candidate-caused defect on that surface.

## Documentation, generation, and remote state

`README.md`, `CHANGELOG.md` under Unreleased, `docs/README.md`, API, architecture, conventions, Cursor/runtime capability docs, ADR 0017/0021, public comments, canonical routing skeletons, runtime capability source, and rendered Cursor next/finalize guidance describe one consistent lifecycle. Static checks observed in this review:

- `node scripts/validate-script-sync.js`: pass.
- `node scripts/generate-routing-surfaces.js --check`: all 18 generated surfaces matched.
- `node scripts/generate-agent-profiles.js --check`: all 126 native profiles matched.
- `git diff --check base..candidate`: pass.
- Candidate worktree remained clean at exact HEAD.

The live PR body is now updated to the final candidate and corrected three-surface evidence. This resolves the parallel adversarial review's former publication-metadata finding. PR #1041 remains open and mergeable with exact head/base and no hosted checks or reviews. Issues #1037/#1039 remain open and claimed; their live comments still stop at the post-#1038 premise correction and claim markers, so final evidence/premise-correction docking remains a finalization action after the blocking code findings are repaired and re-reviewed.

## Exact receipt and validation boundary

The authority receipt `.cache/chain-receipt.json` is structurally bound to exact candidate `0884a8347828b2c77d969d639196724af26d0905`, clean worktree hash, code-tree hash `8a16e1b62308224a8a9a6e280f0de2a0a030dfea1f3f7a195acc203b2bfe38a1`, and the supplied base. Claude, Codex, GitLab, and Gitea each exited zero once with no accepted RED, retry, timeout, signal, or waiver. Focused final records report Cursor 774 assertions, runtime architecture 798, install-all 275, routing 520, and generated profiles 126.

The existing green receipt does not exercise either transition defect above. Per the review contract, I did not rerun the expensive all-four chain after admitting deterministic defects; I used the exact immutable receipt and ran only focused static and sandbox reproductions.

## Residual honest unknowns

- Standalone CLI same-process profile hot load remains unknown; only new-process same-chat discovery is claimed.
- Cursor App local IDE global discovery, need for project materialization, reload, and model/profile carrier remain unknown.
- Cursor Cloud child model/profile source and current live Task/build identity are not observable through the present doctor carrier; R1 is specifically the false flattening of historical evidence into those current fields.
- No private Cursor dashboard lifecycle was re-run during this code review; the exact Build/parent/child observations were reviewed from the supplied durable authority evidence.

verdict: fail
findings_blocking: 2
review_conclusion: Candidate surface isolation is coherent, but doctor identity and no-scripts receipt transitions require repair and exact-candidate revalidation before finalization.

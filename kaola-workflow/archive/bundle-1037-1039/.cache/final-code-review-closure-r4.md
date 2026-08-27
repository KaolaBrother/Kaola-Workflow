finding: id=R1 scope=in_scope action=none status=resolved severity=medium fix_role=tdd-guide rationale=current_doctor_identity_is_unknown_and_history_remains_typed
finding: id=R3 scope=in_scope action=none status=resolved severity=medium fix_role=tdd-guide rationale=both_original_no_scripts_transitions_converge
finding: id=R4 scope=in_scope action=none status=resolved severity=medium fix_role=tdd-guide rationale=promotion_preserves_independent_global_live_hook_and_ownership

# PR #1041 final R4 code-review closure

Candidate: `58d26e916dd9313f2aa5e671ea463cca1792895e`

Base: `b78d006c28a3849b3bcbceffdd1ebc07f2ef5115`

Repair delta: six files changed from `51ebbac2fa024de3bf8f6e4c428a753aaf95a540`; candidate worktree and index were clean.

## Complete finding closure

### R1 - resolved

Fresh empty-home command:

`./install-cursor.sh --doctor --json --product app --host cloud`

Observed current identity remained truthful: `runtime_build: unknown`, `named_catalog: unknown`, and `capability_gap: null`. The measured saved Build remained only under `evidence_stamp`; historical catalog state remained under `selected_host`. No historical value was flattened into a current field.

### R3 - resolved for both original transitions

1. Full global -> global `--no-scripts` -> global uninstall:
   - Full and skipped receipts each contained 38 files, 19 scripts, one authority hook, one live hook, and one hook entry.
   - Global uninstall removed the unchanged support helper, live hook, and global `sessionStart` entry.
2. Fresh project `--no-scripts` -> ordinary project install:
   - The initial authority contained 17 files and no scripts/hooks.
   - Promotion produced 37 authority files, including 19 scripts, one authority hook, and one hook entry.
   - The project hook and project `sessionStart` entry were present.

### R4 - resolved, including uninstall ownership

Exact transition independently re-run in one isolated home/target:

1. Full global install.
2. Remove receipt-owned `kaola-workflow/hooks/kaola-workflow-compact-context.sh`.
3. Global `--no-scripts`, leaving a 37-file partial receipt that still owned the existing global live hook and global `sessionStart` registration.
4. Ordinary project install, entering authority-only promotion.

Final promoted state matched the required result:

- authority hook: present and receipt-owned;
- project hook: present and project receipt-owned;
- independently active global live hook: present;
- global live-hook receipt record: present;
- global and project `sessionStart` registrations: present;
- authority receipt: 38 files, 19 scripts, one authority hook, one live hook, one hook entry.

Ownership teardown was coherent. Global uninstall removed the authority hook, global live hook, and global `sessionStart` while leaving the project hook/registration intact. Project uninstall then removed the project hook and project `sessionStart`.

Implementation proof: `scripts/kaola-workflow-cursor-surface.js:467-474` treats `hooks/` as a preserved prefix for an authority-only transaction and carries forward only prior non-missing receipt records. Baseline evidence in `.cache/repair-acceptance-red.md` records candidate `51ebbac2` failing the new oracle with one failure/787 passes before production changed; candidate `58d26e91` passes 788 assertions.

## Re-audited contracts

- `install-all.sh` remains current-machine-only with no Cloud mode. `--cloud` is rejected before any installer marker; the focused suite passed 275 assertions.
- Cursor Cloud installation remains available only after an Agent confirms it is in Cursor Cloud environment setup, then directly installs the remote authority plus explicit selected repository, tests/reports the Build, asks the user to Save, and requires a new top-level Agent in the same repository. Local `install-all.sh` is outside this lifecycle.
- Standalone CLI alone owns `--ensure-target "$PWD"` point-of-use materialization. Cursor App local and Cloud do not inherit it; `sessionStart` remains compact resume only.
- README, API, Cursor docs, architecture/runtime-capability docs, CHANGELOG, adapter source, generated guidance, installer comments, and live PR body state the same contracts. PR #1041 is OPEN, non-draft, MERGEABLE/CLEAN at the exact candidate/base with the current counts and receipt identity.
- Issues #1037/#1039 remain OPEN and claimed. Posting their final correction/evidence comments is the expected later finalization action, not a candidate review finding.

## Commands and exact evidence

- `node scripts/test-cursor-edition.js`: pass, 788 assertions; all three generated Cursor forge trees in parity.
- Independent Node sandbox reproducer: R1, both R3 transitions, R4 five-part final state, global uninstall, and project uninstall all matched expected results.
- `node scripts/test-runtime-agent-architecture.js`: pass, 798 assertions.
- `node scripts/test-install-all.js`: pass, 275 assertions.
- `node scripts/test-generate-routing-surfaces.js`: pass, 520 assertions.
- `node scripts/validate-script-sync.js`: pass.
- `git diff --check base..candidate`: pass; candidate remained clean.
- `.cache/chain-receipt.json`: exact head `58d26e916dd9313f2aa5e671ea463cca1792895e`, `workTreeHash: clean`, code-tree hash `b737f3efdbc2ad3f9b01737e0b2560b76db0a1445b4e20a1b249bd33b8c1fa54`; Claude, Codex, GitLab, and Gitea each exited zero once with no accepted RED, retry, timeout, signal, or waiver.
- Strict `--release-check` against that candidate and receipt returned `result: pass` for all four chains.

No blocking findings remain. No nonblocking findings were admitted. No new candidate-caused defect was found in the full prior frontier plus R4 repair delta.

verdict: pass
findings_blocking: 0
review_conclusion: R1, both original R3 transitions, and R4 are resolved with coherent install, promotion, receipt, hook, uninstall, Cloud-boundary, and exact-receipt evidence.

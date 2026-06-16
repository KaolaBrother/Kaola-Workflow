evidence-binding: n2-impl-514-cosmetic-nits 3a7734100afe
non_tdd_reason: cosmetic comment-only edits (stale temporal fragment reworded + a descriptive comment typo PIN→CARD) — no behavior change, no natural failing unit test; verified by test-route-reachability.js (T9 green) + test-edition-sync.js (4-edition byte parity after regen).
build-green: node scripts/test-route-reachability.js -> PASS ; node scripts/test-edition-sync.js -> PASS

task: node n2-impl-514-cosmetic-nits (issue #514) — reword a stale Slice-3 temporal comment in adaptive-node.js (R1, canonical + 3 regenerated ports) and fix a T9 block-header comment typo PIN→CARD in test-route-reachability.js (R2).

verification_tier: build-green

write_set (5 declared files, all and only these changed beyond n1 baseline):
1. scripts/kaola-workflow-adaptive-node.js (canonical, R1 hand-edit)
2. plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js (codex copy, regenerated via edition-sync --write)
3. plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js (gitlab port, regenerated)
4. plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js (gitea port, regenerated)
5. scripts/test-route-reachability.js (R2 hand-edit)

R1 reworded comment line (identical text in all 4 adaptive-node editions; line ~3374 canonical, +1 in ports due to injected @generated header):
// redirect the dispatched member's working_dir, which stays parent-side (routing into legs landed in Slice 3, #463 AC18)). Legs are
  - before: "...which stays parent-side until Slice 3). Legs are"
  - "until Slice 3" no longer present in any of the 4 editions (grep -l = NO STALE).
  - parity: grep -c of the exact reworded substring = 1 in each of the 4 editions.

R2 PIN→CARD line (test-route-reachability.js line 261, block-header comment only; assert at line 276 unchanged):
// T9: <!-- CARD: speculative-open --> comment + the `--speculative-consent` literal must appear
  - before: "// T9: <!-- PIN: speculative-open --> comment ..."
  - assert (line 276) still checks '<!-- CARD: speculative-open -->' — NOT modified.

verification_commands:
- node scripts/edition-sync.js --write -> exit 0, wrote exactly 3 files (gitlab port + gitea port + codex copy); no .toml/docs/other scripts touched.
- git status --short --untracked-files=no -> delta beyond n1's 6 baseline files = exactly the 5 declared files (no barrier overflow).
- node scripts/test-route-reachability.js -> exit 0, "Route-reachability test passed (146 assertions)."
- node scripts/test-edition-sync.js -> exit 0, "edition-sync tests passed (29 assertions)"

before_result: route-reachability + edition-sync tests presumed green at baseline (n2 baseline recorded at barrier-base-n2-impl-514-cosmetic-nits; worktree carried n1's 6 in-flight files as baseline, left untouched).
after_result: both tests PASS (exit 0); 4 adaptive-node editions in byte-parity (edition-sync 29 assertions); T9 green (route-reachability 146 assertions).

scope_note: worktree pre-contained 6 sibling (n1 #513) modified files (agents/workflow-planner.md, docs/plan-run-cards/speculative-open.md, 3x agents/workflow-planner.toml, scripts/test-agent-profile-parity.js) — these are n2's recorded baseline, NOT overflow, and were not touched. The 3 workflow-planner.toml files were verified byte-identical to the codex source before --write, so edition-sync's byte-identical-group step (c) was a no-op for them; --write only wrote the 3 adaptive-node ports.

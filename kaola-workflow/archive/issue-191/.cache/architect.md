# Architect Output — issue-191

## Verification Results
| # | Verification | Resolution |
|---|---|---|
| 1 | L2 writer-side | Writer escapes \| → \\| ONLY (no \→\\). No unescape at call sites. Scope L2 = pipe-only Option A regex. |
| 2 | L4 reader/template | Zero field('runtime') callers. No exact-full-template assert; partial asserts exist (workflow_path: fast). L4 is write-only. |
| 3 | L4 forge spread | GitLab and Gitea claim writeState have same gap. L4 is 3-forge. |
| 4 | L4 runtime default | Default args.runtime||'claude'. No allowlist (would break --runtime test tests). |
| 5 | L5 presence-conditional | Shared removals already [ -f ]/[ -d ]-guarded. Real fix: FORGE="" default + sentinel block IF FORGE empty THEN FORGE=all. |
| 6 | L1 CLI flags | Both editions use forge abstraction (forge.listIssues, forge.updateIssue/updateIssueLabels). Not raw glab/tea. |

## File Count
- L1: 4 files (2 claim scripts + 2 walkthroughs)
- L2: 4 roadmap copies
- L3: 18 files (4 base + 4 github-plugin + 5 gitlab + 5 gitea)
  - gitlab+gitea each have sink-merge.js with \s* too
- L4: 6 files (3 claim scripts + 1 github-plugin twin + workflow-state-contract.md)
- L5: 1 file (uninstall.sh)
- L6: 4 files (.env.example, docs/README.md, README.md + workflow-state-contract.md already in L4)

## Write Sets (parallel-safe)
- WS-A: base+github-plugin core (claim.js, roadmap.js, active-folders.js, classifier.js, repair-state.js, compact-context.js — 12 files byte-synced)
- WS-B: gitlab roadmap+field (roadmap.js + 5 field files)
- WS-C: gitea roadmap+field (roadmap.js + 5 field files)
- WS-D: gitlab claim+walkthrough+test (L1+L4 in claim, L1 test in walkthrough)
- WS-E: gitea claim+walkthrough+test (L1+L4 in claim, L1 test in walkthrough)
- WS-F: uninstall.sh
- WS-G: docs (.env.example, docs/README.md, README.md)

All WS groups are pairwise-disjoint → full parallelization.

## Key Design Decisions
- D1: validate-script-sync.js byte-compare enforces base↔github-plugin parity → WS-A must write identical content to both halves
- D2: L1+L4 touch same forge claim files → merged into WS-D/WS-E per edition
- D3: L1 uses forge abstraction (forge.listIssues/updateIssue), not raw CLI
- D4: L2 accepts backslash-leak in cmdMigrate round-trip (write-only fix, migrate is one-shot legacy)
- D5: L5 sentinel: FORGE="" default, add `if [[ -z "$FORGE" ]]; then FORGE=all; fi` before validation case

## Validation Commands
```bash
node scripts/simulate-workflow-walkthrough.js
node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js
node scripts/validate-script-sync.js
bash -n uninstall.sh
```
All must exit 0.

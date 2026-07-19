evidence-binding: n2-delete 337a3508b716
non_tdd_reason: pure removal of retired feature artifacts; no unit test; retirement is verified by the four chains at finalize
build-green: 5 kept core scripts require()-load cleanly after the 56 deletions

upstream_read: n1-recon 30aed1d97859

## task

Read n1-recon's Phase-A retirement manifest §1 (deletion inventory) and the frozen `workflow-plan.md`
`n2-delete` row's `declared_write_set` (the two independently cross-checked to the same 56 paths).
`git rm` exactly those 56 declared files: 4 canonical fast/full/phase4-advance scripts, 9 forge-port
scripts (codex/gitlab/gitea), 4 dead tests (test-fast-advance, test-fast-audit, test-full-advance,
test-phase4-advance), 18 phase/fast commands across 3 editions, 18 retired skill-pack SKILL.md files
across 3 editions (fast/research/ideation/plan/execute/review), and 3 historical fast/full-only
investigation docs. Leave the deletions staged/unstaged in the worktree — no commit (sink commit is
finalize's job).

## non_tdd_reason

Category: **pure removal of retired feature artifacts** (no behavioral logic changes, nothing to
characterize) — deleting 56 files that implement/document/test the retired fast/full paths has no
natural failing unit test to write; the retirement's correctness is verified by (a) an exact-set diff
against the declared write set, (b) a require-load smoke check on the kept core scripts this leg can
touch (n1 confirmed zero KEPT non-test script statically `require()`s a deleted script — only the now-
also-deleted tests did), and (c) the four edition chains at finalize once every downstream node's
symbol-removal legs land (this leg's own base validators/package.json still reference the deleted
files by design — that convergence is finalize's integration job, not this leg's).

## verification_tier

build-green

## write_set (56/56, exact match to the n2-delete declared_write_set row)

**4 canonical scripts**
- scripts/kaola-workflow-fast-advance.js
- scripts/kaola-workflow-fast-audit.js
- scripts/kaola-workflow-full-advance.js
- scripts/kaola-workflow-phase4-advance.js

**9 forge-port scripts**
- plugins/kaola-workflow/scripts/kaola-workflow-fast-advance.js
- plugins/kaola-workflow/scripts/kaola-workflow-full-advance.js
- plugins/kaola-workflow/scripts/kaola-workflow-phase4-advance.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-fast-advance.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-full-advance.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-phase4-advance.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-fast-advance.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-full-advance.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-phase4-advance.js

**4 dead tests**
- scripts/test-fast-advance.js
- scripts/test-fast-audit.js
- scripts/test-full-advance.js
- scripts/test-phase4-advance.js

**18 phase/fast commands (×3 editions)**
- commands/kaola-workflow-fast.md
- commands/kaola-workflow-phase1.md
- commands/kaola-workflow-phase2.md
- commands/kaola-workflow-phase3.md
- commands/kaola-workflow-phase4.md
- commands/kaola-workflow-phase5.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-fast.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase1.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase2.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase3.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase4.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase5.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-fast.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-phase1.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-phase2.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-phase3.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-phase4.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-phase5.md

**18 retired skill SKILL.md (×3 editions; deleting SKILL.md removes the now-empty dir from git)**
- plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-research/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-ideation/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-plan/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-execute/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-review/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-fast/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-research/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-ideation/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-execute/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-review/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-fast/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-research/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-ideation/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-plan/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-execute/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-review/SKILL.md

**3 historical investigations**
- docs/investigations/classifier-fast-overlap-2026-05-31.md
- docs/investigations/fast-path-widening-2026-05-30.md
- docs/investigations/fast-path-workflow-2026-05-17.md

## trap 1 compliance

Deleted ONLY the 56 exact declared paths above (list built directly from the frozen `workflow-plan.md`
`n2-delete` row, byte-cross-checked against n1-recon's independently-derived §1 inventory — both agree
on the same 56 paths, same 4+9+4+18+18+3 breakdown). No grep-and-delete of the substring "full" was
performed; `escalated_to_full` / "full envelope" / "full diff" / "full accumulated root diff" /
`--symbolic-full-name` / "Fast-forward only" and all other unrelated "full" vocabulary (n1 §3) were not
touched — this leg never grepped for "full", it only iterated the fixed 56-path list.

## verification_commands + outputs

1. Pre-check — confirmed all 56 targets exist before deletion:
   `for f in <56 paths>; do [ -e "$f" ] || echo MISSING; done` → output: `ALL 56 PRESENT` (0 missing).

2. Deletion:
   `git rm -q -- <56 paths>` → exit 0.

3. `git status --porcelain | grep -c '^D '` → **56**
   `git status --porcelain | grep -v '^D '` → only `?? kaola-workflow/issue-725/` (the pre-existing
   untracked project-state dir; not part of this node's write set, unrelated to the deletion).

4. Exact-set diff (declared 56-path list vs actual `git status` deletions, both sorted, leading porcelain
   whitespace normalized): `diff deleted-expected.txt deleted-actual.txt` → **empty diff** →
   "EXACT MATCH — 56/56, no extras, no omissions".

5. Leftover-empty-dir check on disk for the 6 now-fully-emptied
   `plugins/kaola-workflow/skills/{fast,research,ideation,plan,execute,review}/` dirs → none remain
   (git rm removed the sole file in each, and the now-empty dirs were removed from the working tree too).

6. build-green require-load smoke check — the 5 kept core scripts named in this node's binding
   constraints, run individually via `node -e "require('./<path>')"` from repo root:
   - `scripts/kaola-workflow-claim.js` → OK: loads clean
   - `scripts/kaola-workflow-adaptive-schema.js` → OK: loads clean
   - `scripts/kaola-workflow-adaptive-node.js` → OK: loads clean
   - `scripts/kaola-workflow-plan-validator.js` → OK: loads clean
   - `scripts/kaola-workflow-repair-state.js` → OK: loads clean

   All 5 load with zero errors, confirming n1-recon's finding that no KEPT non-test script has a static
   `require()` dependency on any of the 56 deleted files (the only static requires of the retired
   scripts lived in the now-also-deleted test files: test-fast-advance.js:19, test-full-advance.js:26,
   test-phase4-advance.js:25, test-fast-audit.js:22 — all four deleted in this same leg).

## before_result

Working tree clean at claim root `33a1ca57` (only pre-existing untracked `kaola-workflow/issue-725/`
project-state dir); all 56 declared-deletion targets present on disk and tracked in git.

## after_result

56 files `git rm`'d (staged as `D`, not committed); `git status --porcelain` shows exactly 56 `D` lines
plus the same one pre-existing untracked project-state dir (nothing else changed). The 5 kept core
scripts named in the binding constraints all still `require()`-load with zero errors. This leg
deliberately does NOT run the full suite / edition chains — n1 and this node's brief both note the base
validators/package.json/routing surfaces/walkthroughs still reference the deleted files at this point in
the serial chain; that convergence is downstream nodes' (n3–n9) and finalize's job. No commit was made;
deletions are left staged/unstaged in the worktree per the binding constraint.

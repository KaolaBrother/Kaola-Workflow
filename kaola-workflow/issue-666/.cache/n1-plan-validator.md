evidence-binding: n1-plan-validator d1ca893a604b

## Task
Upstream the live ENOBUFS hot-patch (previously only a hand-patch on the installed Claude
plan-validator at 3 sites: ls-tree -r, diff --name-only, ls-files --others) and harden EVERY other
unbounded-output git call in scripts/kaola-workflow-plan-validator.js, proven by a regression test.

## RED
Added `#666-ENOBUFS-TREE-HASH` to scripts/test-adaptive-node.js (inserted after the
D437-MUTATION-GUARD-NOT-VACUOUS block, ~line 6104, inside the #437-LANE-GROUP harness so it reuses
the same execFileSync/cleanup bindings as makeLaneRepo). Fixture: a bare git-init repo with 4200
empty files under 196-char filenames in one directory — pushes `git ls-tree -r` on the resulting
tree to ~1.05 MB (just past Node's execFileSync default 1 MB maxBuffer, not far past; builds in well
under a second). Drives `computeCodeTreeHash` (the finalize-check freshness key) → `snapshotWorktree`
→ `git ls-tree -r` directly (exported from the plan-validator module) and asserts a stable 64-hex
sha256 comes back.

Captured BEFORE the GREEN edit (plan-validator.js untouched, only the test added):
```
RED: FAIL: #666-ENOBUFS-TREE-HASH: computeCodeTreeHash returns a stable 64-hex sha256 over a >1MB ls-tree listing, got null
```
Root cause confirmed via a standalone repro (git ls-tree -r on the same 4200-file/1.05MB tree,
execFileSync default maxBuffer): `ls-tree FAILED code= ENOBUFS message= spawnSync git ENOBUFS`.
computeCodeTreeHash's own try/catch at the ls-tree call site swallows that ENOBUFS and returns
`null` — NOT a crash, but a silent fail-closed "always stale" degrade (matches the #666 production
finding: real repos past ~1MB of tracked-path listing never get a finalize-check freshness hit).
Full-suite run at this point: exactly 1 FAIL (the line above), 1729 passed (clean baseline; also
independently reproduced building a scratch clone of pristine main at the same HEAD — same single
FAIL, same 1729 baseline — confirming the new test is the only red signal and no environment noise
is miscounted as a pass/fail).

## GREEN
Added ONE per-script local constant near the top of scripts/kaola-workflow-plan-validator.js:
```
const GIT_MAX_BUFFER = 64 * 1024 * 1024;
```
and applied `maxBuffer: GIT_MAX_BUFFER` to every unbounded-output git call site (re-located at HEAD
before editing; all 10 matched the task's confirmed line numbers exactly):
  - ls-tree -r (the crash site, computeCodeTreeHash)
  - diff <stampedHead> --name-only (computeChainsStaleDiagnostics)
  - ls-files --others --exclude-standard (computeChainsStaleDiagnostics)
  - diff-tree -r --name-only <base> <now> — per-node barrier (--barrier-check)
  - diff --name-only <mergeBase> — whole-plan/phase6 merge gate
  - diff-tree -r --name-only <baseRev> <mSha> — group merge-commit union diff
  - diff-tree -r --name-only <base> <now> — group barrier (--group-barrier)
  - diff-tree -r --name-only <baseSha> <now> — leg barrier (leg-scoped worktree)
  - diff <base>...HEAD --name-only — release-surface changed-files probe
  - diff-tree -r --name-only <base> <now> — --finalize-check tree diff
10 call sites capped total. Left untouched (fixed-size probes, confirmed via a full grep of every
`execFileSync('git'` call in the file): every rev-parse, merge-base, --quiet verify, tag/for-each-ref
lookup, add -A / write-tree / commit-tree / update-ref / read-tree HEAD, and `status --porcelain`
(not in the task's confirmed-site list; out of scope for this node).

Verified the exact pre-existing hot-patch (installed at /Users/ylminiserver/.claude/kaola-workflow/
scripts/kaola-workflow-plan-validator.js) covered only 3 of these 10 sites (ls-tree -r, diff
stampedHead --name-only, ls-files --others) using the same `64 * 1024 * 1024` literal — this change
upstreams that literal into a named constant and extends coverage to the remaining 7 sites.

Ran `npm run sync:editions` — regenerated all 3 forge/codex ports:
```
generated  plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js
generated  plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js
codex-sync plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js
edition-sync: write complete (3 file(s) updated).
```
`node scripts/edition-sync.js --check` after sync:
```
edition-sync: 10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity with canonical.
```
All 4 editions carry 11 occurrences of GIT_MAX_BUFFER (1 const decl + 10 call sites) — canonical and
all 3 ports match.

Re-ran the exact RED fixture after the fix (test file unchanged, only plan-validator.js patched):
```
GREEN: adaptive-node tests passed (1730 assertions)
```
1730 == the pristine-main baseline of 1728 (confirmed via a scratch clone of unmodified main at the
same commit) + this node's 2 new assertions (hash1 matches /^[0-9a-f]{64}$/; hash1 === hash2 on a
repeat call over the same tree). Zero `FAIL:` lines in the run.

Also ran `node scripts/simulate-workflow-walkthrough.js` — exit 0, "Workflow walkthrough simulation
passed" (last line before the explicit `EXIT=0` marker), full trace clean through
`testGateEvidenceNonceRotation654: PASSED`.

Note on run-to-run noise: two of the ~10 full-suite runs during this session terminated abruptly
right after the #588-TASKMIRROR-FAILOPEN tests' EXPECTED EISDIR crash-dump text (that test
deliberately makes workflow-tasks.json a directory to prove the task-mirror refresh fails OPEN; the
crash text leaks through execFileSync's default stderr-inherit) — WITHOUT their usual final summary
line. This reproduced identically on a from-scratch clone of unmodified main at the same HEAD (same
truncation pattern, same location), proving it is a pre-existing environment/stdout-flush flake
unrelated to this diff, not a regression it introduced. All runs used for the RED/GREEN comparison
above completed cleanly with a full summary.

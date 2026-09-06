# Code review — Issue #1052 generated consumer call chain

candidate: SHA `2cae8caa13ef00bd5aef6d5b5f534b3a3ab8352b` on `workflow/issue-1052`
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
prior PASS: `kaola-workflow/issue-1052/.cache/code-review-re-review.md` left immutable and treated as stale for these surfaces
surface: generated Next operator path (App/Cloud identity, workspace locator, cold resume CLAIM_JS, README)
reviewed: 2026-09-07
did_not_run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`
did_not_touch: `kaola-workflow/bundle-1051`, `.kw/worktrees/bundle-1051`, tests, candidate production files

## How the chain was generated and executed

1. `node scripts/sync-cursor-edition.js --write --tree-root=/tmp/kw-1052-call-chain/gen-{github,gitlab,gitea} --forge={github,gitlab,gitea}`
2. Read generated `workflow-next.md` (github `.cursor/commands`, gitlab `.cursor-gitlab/commands`, gitea `.cursor-gitea/commands`).
3. `install-cursor.sh --global --yes` then `--target <consumer>` in an isolated `HOME`/`CURSOR_HOME` (no `--product` on deploy). Doctor `--product app` vs `--product cli` compared.
4. Drove the generated argv through real `scripts/kaola-workflow-claim.js` (not `resolveCursorCliEnsureTarget` in isolation, not `--product app`):
   - startup: `startup --runtime cursor --product cli --host local --target-issues 10521 --json` from a nested cwd
   - resume: `resume --runtime cursor --product cli --host local --json` from a real `git worktree` cwd
5. Cold Resume fragment in `bash --noprofile --norc` with `CLAIM_JS` unset and with `CLAIM_JS=""`.
6. Independent README read/grep (not the doc-updater skip).

Forbidden substitutes were not used as proof: no `claim.js startup --product app`; helper unit tests were not treated as the consumer chain.

## Admitted findings

### C1 — HIGH — generated Next always stamps cli/local; App/Cloud load that same command file

- failure_class: generated-operator-path / forged-host-identity
- severity: high
- file: `scripts/sync-cursor-edition.js` `transformCommandBody` lines 267-276 (primary); deployed `.cursor/commands/workflow-next.md`
- trigger: Cursor App local or App-started Cloud follows installed `/workflow-next` and runs the executable claim/resume bash lines
- expected: only standalone CLI/local presents `--product cli --host local`; App/Cloud omit that pair so `isCursorCliLocalWorkflowPath` stays false and extra Repo writes do not run
- observed: the shared generated command unconditionally rewrites startup and resume to `--product cli --host local`. There is no App/Cloud command variant. Executing those generated flags on real claim.js runs `ensureCursorCliLocalPrep` (`cursor_prep.status=materialized`).
- reproducible:
  1. Isolated generate (github/gitlab/gitea): only executable claim lines are
     `node "$CLAIM_JS" startup --runtime cursor --product cli --host local --target-issues "$KAOLA_TARGET_ISSUES"`
     and
     `node "$CLAIM_JS" resume --runtime cursor --product cli --host local`
     No `--product app`. Host-negative appendix prose sits after those fences and is not a gate.
  2. Installer layout: `install-cursor.sh` `--product` is doctor-only. Deploy is `--global` or `--target DIR` into one `{agents,commands}` tree. Isolated `--target` wrote `<consumer>/.cursor/commands/workflow-next.md` with the same cli/local lines. Installer next-step is "open the project in Cursor and run a workflow command". README groups Cursor CLI/App/Cloud on one `commands` carrier. `kaola-workflow-cursor-surface.js` `buildGlobalDesired` copies `commands/` from that one source tree; project materialization maps `commands/` to `.cursor/commands/` with no product split. Cloud setup materializes the selected repository `.cursor`.
  3. Driving the generated startup argv acquired and materialized Repo roles on the git toplevel (`cursor_prep.target` = workspace root).
- why guards do not prevent: `isCursorCliLocalWorkflowPath` is strict, but the operator path forges the matching triple before claim.js runs. Tests that pass `--product app` never emit the generated Next argv. The locked Next oracle requires those cli/local flags on the shared file.

### C2 — HIGH — generated startup/resume never pass `--cursor-workspace`; operator path uses getRoot()/main_root

- failure_class: generated-operator-path / unused-workspace-locator
- severity: high
- file: generated `workflow-next.md` executable fences (from `transformCommandBody`); `scripts/kaola-workflow-claim.js` `resolveCursorCliEnsureTarget`
- trigger: Agent follows generated Next (no `--cursor-workspace`) from nested cwd or from a write-worktree that Cursor opened
- expected: normal entry names the Cursor-opened workspace so prep is not silently getRoot() or recorded main_root
- observed: generated startup/resume lines do not contain `--cursor-workspace` (prose names the flag; exec does not). Driving generated argv:
  - startup from `.../cli-workspace/nested-cwd`: `cursor_prep.target` = git toplevel `.../cli-workspace` (`getRoot()`), not nested cwd, and not an explicit opened-workspace flag
  - resume from real worktree cwd `.../resume-wt` (`git rev-parse --show-toplevel` = that worktree): `cursor_prep.target` = recorded `main_root` `.../resume-ws`; worktree received no `.cursor/agents`
- why guards do not prevent: `--cursor-workspace` is optional and unused on the operator path. An Agent in a write-worktree therefore hits recorded `main_root`, not the worktree git toplevel and not a Cursor-opened workspace locator.

### C3 — HIGH — generated Resume bash is not self-contained; cold `$CLAIM_JS` is empty and node no-ops

- failure_class: generated-operator-path / cold-resume-unbound-CLAIM_JS
- severity: high
- file: `scripts/sync-cursor-edition.js` Resume rewrite (lines 273-276); generated Next `## Resume` fence; `templates/routing/compact-recovery.skeleton.md`
- trigger: compact recovery / new process reloads Workflow Next and jumps to Resume without re-running intake (`without intake or claim`)
- expected: Resume executable path resolves claim.js and runs `resume` with CLI identity / prep
- observed: `CLAIM_JS=` appears only inside earlier intake fences (`nx-scripts-resolver` next to `list-open` and `startup`). Generated Resume fence is solely:
  `node "$CLAIM_JS" resume --runtime cursor --product cli --host local`
  No `kaola_script` / `CLAIM_JS=` in that fence.
  Clean shell (`bash --noprofile --norc`, `CLAIM_JS` unset): `node '' resume --runtime cursor --product cli --host local --json` exits 0, stdout empty, claim.js not executed.
  `CLAIM_JS=""`: `dirname` is `.` (the slots.js empty-CLAIM_JS hazard); same `node ""` exit 0 no-op.
- why guards do not prevent: the new Resume block was added without inlining the resolver. Compact recovery forbids re-running intake. A silent node success hides the miss.

### C4 — MEDIUM — README omits this user-visible Cursor startup/resume prep behavior

- failure_class: docs-gap / user-visible-readme
- severity: medium
- file: `README.md`
- trigger: read README as the user-visible surface AGENTS.md requires for this change
- expected: README records the user-visible Cursor CLI/local startup/resume Repo prep (or a skip is proven because README does not carry workflow-next/Cursor/resume)
- observed: README does carry that surface and still omits the behavior. Independently grepped: no `ensure-target`, `product cli`, `--host local`, `cursor-workspace`, or startup/resume prep. README does name `workflow-next` (quick start), resume of `mission-list.md`, and a single install row `Cursor CLI/App/Cloud | commands, named agents, persistent recovery Rule`. Issue #1052 completion text and AGENTS.md require README.md for user-visible changes. Last two doc-updater receipts skipped README.md; that skip is not valid here.

## What was checked and did not become a separate finding

GitLab/Gitea generation uses the same `transformCommandBody` rewrite (same cli/local exec lines, same Resume fence without resolver, same missing `--cursor-workspace`). Folded into C1-C3, not extra IDs.

`isCursorCliLocalWorkflowPath` remains strict in claim.js. That does not close C1.

Finalize still uses `--ensure-target "$PWD"` without CLI identity flags (out of this Next-operator scope).

did_not_touch: tests (not weakened), Runner, `#1051` / `bundle-1051`.

finding: id=C1 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=generated-next-forges-cli-local-for-app-cloud
finding: id=C2 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=generated-next-omits-cursor-workspace
finding: id=C3 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=cold-resume-claim-js-unbound
finding: id=C4 scope=in_scope action=fix status=open severity=medium fix_role=doc-updater rationale=readme-omits-user-visible-prep
verdict: fail
findings_blocking: 4
review_conclusion: Generated consumer chain on 2cae8caa fails independently of the prior helper-path PASS: shared Next stamps cli/local for App/Cloud, never passes --cursor-workspace so worktree resume hits main_root, cold Resume node empty CLAIM_JS no-ops, and README omits the user-visible prep.

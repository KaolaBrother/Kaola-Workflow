# Adversarial review — #977 half (installers + their four suites)

Reviewer: review-977. Candidate: worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-976-977-978`
at HEAD `51db5d2d` + uncommitted diff. Scope: `install.sh`, `uninstall.sh`, `install-opencode.sh`,
`install-kimi.sh`; `scripts/test-install-upgrade-rewrite.js`, `scripts/test-install-adaptive-config.js`,
`scripts/test-opencode-edition.js`, `scripts/test-kimi-edition.js`. Sink-merge and roadmap files not
reviewed here (other reviewer). Every claim below was verified by running something, never by reading
a list back out of the installer under test. All experiments in
`…/scratchpad/r977-*` (mirror `r977-mirror`, no worktree mutation, no `git checkout`).

## Verdict up front

**No candidate-caused defect admitted.** All four suites green on the candidate (real exit codes:
upgrade 0, adaptive 0, opencode 0 at **655**, kimi 0 at **612** — counts match the claims). Every
#977 pin is mutation-proven armed. Every retired list was re-censused independently and is exactly
complete. The destructive bound was demonstrated on disk, not argued. Three non-blocking items below
(one deliberate coverage gap, one routed docs drift, one pre-existing residue class), plus one
operational incident of mine, disclosed and repaired.

## What I demonstrated (CONFIRMED — transcripts in scratchpad `r977-*.log`)

### 1. Independent censuses — none of the four lists is missing a name

Method: `git log --all --no-renames --diff-filter=D --name-only` over the deploy sources, plus
`git log -L` over the generators' `HOOK_SCRIPTS`, plus birth-commit checks. Never the installer's array.

- **`RETIRED_COMMANDS` (install.sh:186-195, now 19 entries).** Deleted-ever set across root
  `commands/` and both plugin command trees, all refs = exactly 18 basenames; the 19th entry
  (`workflow-goal.md`) verified never-existed (`git log --all -- commands/workflow-goal.md` empty —
  positive control for the census method). The 7 added `claude-workflow*` names are exactly the
  2026-05 pre-rename surface (renamed away at `12f16234` 05-10 and `7e19766d` 05-13). Complete: 19 = 18 + 1.
- **`RETIRED_AGENTS` (uninstall.sh:13, now 4 names).** Top-level `agents/*.md` deletions ever, all
  refs = exactly {workflow-planner 07-31, contractor 07-26, issue-scout 07-25, docs-lookup 06-09}.
  The only other agent-tree deletions ever are `agents/profiles/higher/*` — profile VARIANTS whose
  basenames are all in `REQUIRED_AGENTS`, so they cannot strand. No agent `.md` was ever deleted from
  any other deploy path. Current `agents/` = exactly the 14 `REQUIRED_AGENTS`. Complete: 4.
- **`RETIRED_HOOKS` = {pre-commit, write-lane} on BOTH editions — confirmed.**
  opencode: `.opencode/hooks` born `74da6a5b` 06-19 with exactly {pre-commit, subagent-dispatch-log,
  write-lane}; untracked at `04752560` 06-23; generator `HOOK_SCRIPTS` line-history shows exactly one
  deletion event ever, `2a48342c` 07-20 removing pre-commit + write-lane. kimi: `HOOK_SCRIPTS` born
  `f6dbf40d` 07-17 with the same three, same two removed `26671261` 07-20 ("three days later" — true).
  No other name has ever left either set.
- **`phantom-advisor` exclusion — CONFIRMED correct, decisively.** `install-opencode.sh` itself was
  BORN in `74da6a5b` (06-19), the same commit that created `.opencode/hooks` — the edition did not
  exist in any form while phantom-advisor did (retired from root `hooks/` at `83e91b3e`, 06-11).
  install-kimi.sh born 07-17. Neither edition could ever have deployed it. Including it would cost a
  no-op stat, but excluding it is factually right.
- `RETIRED_WORKFLOW_COMMANDS` (9 names) is UNCHANGED by this diff (comment only); its completeness
  carries the premise's stated untracked-era caveat, not re-litigated here.

### 2. Mutation proofs — every pin is armed, none vacuous

Scratch mirror `r977-mirror` (worktree copy + main checkout's generated trees; installer byte-parity
with the worktree verified before mutating). All eight #977 mechanisms excised (each excision
occurrence-checked to exactly 1; `bash -n` clean on all four mutants):

| mutant | suite | result |
|---|---|---|
| install.sh minus the 7 names | upgrade-rewrite | **exit 1**, exactly the `#977 … STRANDED` assert listing all 7 (`r977-mut-upgrade.log`) |
| uninstall.sh `RETIRED_AGENTS=("contractor")` | adaptive-config | **exit 1**, exactly the `#977 … EVERY retired managed role` assert listing all 3 (`r977-mut-adaptive.log`) |
| opencode minus copy_tree hook sweep + both uninstall retired loops | opencode | **exit 1, exactly 3 FAILs** = P8 hook, U2 cmd, U2 hook; **652 passed** (environment control built in) (`r977-mut-opencode.log`) |
| kimi minus uninstall skill loop + uninstall hook loop + INSTALL-path hook sweep | kimi | **exit 1, exactly 5 FAILs** = U1 #977 skills, U1 #977 hook, + 3 collateral no-residue; **607 passed** (`r977-mut-kimi.log`) |

Each pin reds on exactly its own mechanism's absence, with disk observations of test-planted
fixtures — no pin reads any installer array (verified in the diffs: fixtures hard-code censused
names, with in-probe anti-vacuity asserts that the planted names are outside the deploy sets).

### 3. Axis 3 needed no production change — TRUE

The kimi retired-skill uninstall loop exists at HEAD `51db5d2d` (`install-kimi.sh:421-426`,
"Removed retired role skill" at :425), untouched by this diff. The new U1 plant observes it: my kimi
mutant that excises that pre-existing loop reds `U1 (#977) … kaola-workflow-fast, kaola-role-issue-scout`.
The test closes the blindness; there was no production gap to fill. (The plant deliberately includes
`kaola-role-issue-scout` — the exact name #973's fix stranded.)

### 4. Destruction bound — demonstrated on disk, not asserted

- **uninstall.sh retired-agent removal is marker-gated** (`uninstall.sh:64-71`:
  `grep -Fq "$MANAGED_AGENT_MARKER"` before `rm`). A user-authored `docs-lookup.md` /
  `issue-scout.md` / `workflow-planner.md` without the marker is untouched. The suite additionally
  pins a markerless user agent surviving byte-intact.
- **kimi hooks, live hermetic run** (`r977-kimi-live2`, scratch HOME/KIMI_CODE_HOME, real candidate
  installer): reinstall over a planted `kaola-workflow-pre-commit.sh` removes it and redeploys the
  current hook; `--uninstall` over a planted retired hook + a planted user-authored `my-own-hook.sh`
  removes the retired name and the current hook and **leaves `my-own-hook.sh` in place** (dir kept,
  rmdir silently declines — the never-blind-rm design). Deletion set = exactly the named files.
- **opencode uninstall wiring** deletes exactly the 9 `RETIRED_WORKFLOW_COMMANDS` basenames — the
  owner-approved bound; every one already deleted today by any reinstall (P7b sweep). U2 pins the
  shared-dir scope with a surviving user-owned command, so a namespace-glob "repair" would go red.
- The 7 `claude-workflow*` names join a list that already unconditionally sweeps non-namespaced
  names (`workflow-goal.md`, `workflow-next-pr.md`), and `uninstall.sh:105-106` has always deleted
  `claude-workflow*.md` unconditionally — no new risk class on the install side.

### 5. Comment/prose claims added by this diff — each one verified by running something

- "that era's installer was a bare copy with no stale-removal" — `git show 7e19766d:install.sh`
  contains **zero `rm`** in the deploy path. TRUE.
- "they sit outside every glob the old prune ever had" — prune born `b2c71592` with
  `kaola-workflow-*.md`, `workflow-init.md`, `workflow-next.md`, `workflow-goal.md`,
  `workflow-next-pr.md`; no glob matches `claude-workflow*`, and no install.sh commit ever carried
  such a glob (`git log -S`). TRUE.
- "censused from agents/ history" — reproduced, exactly 4 (above). TRUE.
- "uninstall must name these itself: it removes the agent manifest" — manifest removal branch at
  `uninstall.sh:73-87`; the premise measured the permanent-strand consequence live. TRUE.
- Both `RETIRED_HOOKS` bounding comments ("shipped … from its first release until their retirement",
  "no other name has ever left the set") — reproduced from generator line-history on BOTH editions,
  not one. TRUE on both.
- kimi "read by BOTH paths" / opencode "BOTH paths read it" — true after this diff (install sweep +
  uninstall loop each, verified in the files).

### 6. Blast radius / shell hygiene — nothing found

- `git grep` (tracked files, dot-dirs included): **no script outside the four installers and four
  edited suites reads any `RETIRED_*` array**; remaining hits are docs/CHANGELOG/archive prose.
  Claim confirmed. Other uninstall.sh-spawning suites (test-install-all, test-run-chains,
  test-uninstall-forge-branches, validate-*) never name the three added agents in fixtures
  (checked with positive control), and the added removals are name+marker-gated no-ops on fixtures
  that don't plant those names. `test-uninstall-forge-branches.js:46`'s `claude-workflow` is the
  legacy support DIR, unrelated.
- `bash -n` clean on all four. New loops: kimi reuses function-`local retired`; opencode's `base` is
  declared `local f base sub` at `uninstall_edition` top. Arrays are non-empty literals (no
  `set -u` empty-array hazard); `rm -f`/`rm -rf` targets are `[[ -f/-d ]]`-guarded or constant-named
  under set-scoped roots; no glob widening, no cross-fs `mv`.

## Non-blocking findings

**N1 (deliberate coverage gap, low — user decision).** The kimi INSTALL-path `RETIRED_HOOKS` sweep
(`install-kimi.sh:306-313`) is the one #977 mechanism no suite observes: my combined kimi mutant
excised it and the suite showed **zero additional red** (all 5 fails were uninstall-side). Its twin
on opencode IS pinned (P8). tests-977.md flags this seam explicitly as left to the orchestrator;
impl-977 verified it live before building (plant survives unfixed reinstall — `i977-kimi-installpath/install2.log`,
0 removals), and I re-verified the fixed behavior hermetically on disk (`r977-kimi-live2`). Works
today; a future regression there ships silently. Accepting or asking tests-977 for a kimi P-series
twin of P8 is the orchestrator's call.

**N2 (docs drift caused by the candidate — routed, not lost).** `docs/opencode-edition.md:146-148`
("`copy_tree` removes exactly two things") is now false — it removes three (retired hooks too).
`CHANGELOG.md` `[Unreleased]` untouched. Both deliberately deferred to the doc pass per
impl-977.md; confirm the doc pass covers them. (Outside my assigned file scope; named so it cannot
silently drop.)

**N3 (pre-existing, unchanged by the candidate).** Retired SUPPORT SCRIPTS still survive
opencode/kimi `--uninstall` (removal is by the CURRENT install manifest — premise finding C),
silently blocking the `rmdir` chain; self-heals only on a later reinstall. Outside the five axes;
no worse after this diff.

## Explicit negatives (categories hunted, nothing found)

- No guard that cannot fail among the #977 pins (all mutation-proven above).
- No false or root-edition-only comment claim in the diff (every added claim reproduced, per-edition).
- Nothing retired here strands what it replaces — the retirements ADD removal routes; nothing loses one.
- No incomplete list presented as complete (censuses above).
- No destructive over-reach beyond the approved bound; no user-owned file reachable except by exact
  collision with a censused retired basename in an installer-managed location — the pre-existing model.
- No unapproved user-facing behavior change: axis-2 wiring is the owner-approved 9-name bound;
  the hook machinery is the dispatch's axis B.

## Operational incident (mine, disclosed, repaired)

My first live kimi check omitted the HOME/KIMI_CODE_HOME overrides and the seed install wrote into
the REAL `~/.kimi-code`. Damage audit by per-file hash against the clean main checkout at
`51db5d2d`: exactly one file changed (`kaola-workflow/scripts/kaola-workflow-sink-merge.js`, which
received the worktree's candidate bytes); the deployed hook was byte-identical to main's generated
tree and the `config.toml` re-merge was proven a no-op (fragment byte-identical). Restored the one
file to `HEAD:scripts/kaola-workflow-sink-merge.js` bytes, mode 755 matching neighbors, hash-verified.
The real kimi home is byte-identical to its pre-incident state.

finding: id=R1 scope=user_decision action=acknowledge status=open severity=low fix_role=tdd-guide rationale=kimi install-path RETIRED_HOOKS sweep unpinned; mutant excision passes full kimi suite (607 passed, 0 install-side reds); deliberate per tests-977, live-verified twice
finding: id=R2 scope=out_of_scope action=route status=open severity=low fix_role=doc-updater rationale=docs/opencode-edition.md:146-148 "exactly two things" now false and CHANGELOG [Unreleased] untouched; deferred to doc pass per impl-977, must not drop
finding: id=R3 scope=pre_existing action=acknowledge status=open severity=low fix_role=none rationale=retired support scripts survive opencode/kimi --uninstall via current-manifest removal (premise finding C); outside the five axes, unchanged by candidate

verdict: pass
findings_blocking: 0
review_conclusion: the #977 half survives adversarial review — all four retired lists re-censused complete from independent git history, every pin mutation-proven armed with exactly its own red, the phantom-advisor exclusion decisively correct by edition birth dates, and the destruction bound demonstrated on disk including user-authored survivors; the only residue is one deliberate unpinned kimi install-path seam, routed docs drift, and a pre-existing support-script class, none blocking

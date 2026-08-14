# Adversarial review — #973 implementation (Fable, retry) — COMPLETE

Candidate: worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975`
(branch `workflow/bundle-973-974-975`, uncommitted), diff over `install.sh`,
`install-kimi.sh`, `install-opencode.sh`. Read-only review; no suite was run (two other
reviewers concurrent; the claude chain + full walkthrough were already run serially by the
orchestrator). All installs below were hermetic (throwaway `HOME`/`KIMI_CODE_HOME`/`--target`
under the session scratchpad); real-HOME verified untouched at the end: `~/.kimi-code/skills`
= 17, `~/.claude/commands` = 3, `~/.claude/agents` = 14 `.md`, `~/.config/opencode/command`
= 3; main checkout status shows only the untracked bundle dir.

## Findings

### F1 — DEFECT (medium): `RETIRED_ROLE_SKILLS` is incomplete — `kaola-role-issue-scout`
is missing, so the kimi install stops self-healing a role skill the edition provably shipped

Location: `install-kimi.sh:154-159` (the list); `install-kimi.sh:151-153` (the comment
claiming the bound), in the worktree.

The list carries "the two roles ... retired since" (`kaola-role-contractor`,
`kaola-role-workflow-planner`). The kimi edition shipped a **third** since-retired role:

- `agents/issue-scout.md` existed 2026-06-10 (`f3f76509`) → 2026-07-25 (`d663fd66`, deleted).
- The kimi edition landed at `f6dbf40d` (2026-07-17); `git merge-base --is-ancestor` confirms
  `f6dbf40d` precedes `d663fd66`, so the agent was live in the edition for ~8 days — a window
  containing the v6.24.0 release (2026-07-21).
- The generator of that era rendered one `kaola-role-<agent>` skill per top-level
  `agents/*.md`: `f6dbf40d:scripts/sync-kimi-edition.js:430-437` (`skillRel('kaola-role-' +
  name)` over `listCanonAgents()`), and rewrote workflow-next prose to "First invoke the
  `kaola-role-issue-scout` Skill ..." (`f6dbf40d:scripts/sync-kimi-edition.js:326-327`) —
  issue-scout was a first-class kimi role skill.
- The installer of that era deployed every `kaola-role-*` unconditionally
  (`d663fd66^:install-kimi.sh:140`).

**Reproduced end-to-end at the worktree code** (hermetic; throwaway HOME/KIMI_CODE_HOME/
--target; planted `kaola-role-issue-scout`, `kaola-role-contractor`, `my-own-skill` into a
destination, then ran the worktree `install-kimi.sh --target ... --yes`):

```
EXIT=0
kaola-role-issue-scout: PRESENT (bytes still "planted-stale")   <- the strand
kaola-role-contractor:  absent                                  <- retired sweep works
my-own-skill:           PRESENT                                 <- user content preserved
total skills: 19 (17 deployed + the 2 survivors)
```

Concrete failing scenario: a user who installed the kimi edition between 2026-07-17 and
2026-07-25 (e.g. at v6.24.0) has `kaola-role-issue-scout/` deployed. The OLD namespace prune
(`"$skills_dest/"kaola-role-*`) removed it on the next reinstall — the self-heal this change
promises to preserve ("REINSTALL IS SELF-HEALING, AND NOTHING WIDER"). The NEW code leaves it
on disk on every future install (measured above, exit 0) and on uninstall (uninstall removes
source-tree names + the same incomplete list), so the kimi runtime keeps loading a retired
role skill whose contract references retired dispatch machinery. Permanent, silent, and
exactly the failure class the issue exists to manage — here as a shipped omission rather
than a future maintenance risk.

This refutes two shipped claims:
- code comment `install-kimi.sh:151-153`: "Bounded by what this edition actually shipped ...
  the two roles and two commands retired since";
- impl-973.md §4: "`git log f6dbf40d..HEAD --name-only -- agents/*.md` shows exactly those
  two gone and investigator added. **Complete.**" — the measured deletion set in that exact
  range is `contractor.md`, `workflow-planner.md`, **`issue-scout.md`** (plus
  `profiles/higher/*`, which are excluded from role rendering; issue-scout is not):
  `git log --no-renames --diff-filter=D --name-only f6dbf40d..HEAD -- 'agents/*.md'`.
  The impl's own census (".opencode/command/ history", tree history) was structurally blind
  here: `.kimi/` was never tracked, so kimi shipping history is only visible through
  generator+agents archaeology, and the roles half of it was asserted from a git command
  whose output was misread or under-reported.

Fix: add `"kaola-role-issue-scout"` to `RETIRED_ROLE_SKILLS`. No test pins its absence
(P5c plants only the four old names), so the one-line repair is green-suite-safe; a P5c-shape
assertion planting `kaola-role-issue-scout` would arm it.

## Lower severity

### N1 — nit (comment only, pre-existing behavior): `workflow-goal.md` in `RETIRED_COMMANDS`
violates the list's own stated bound. `install.sh:175-188` claims "Bounded by what commands/
and the plugin command trees actually shipped"; `workflow-goal.md` appears nowhere in that
history (no-renames add census over `commands/` and both plugin trees; repo history starts
2026-05-09 at `6e053a3b` with `claude-workflow.md`). The entry deletes a user-authored
`workflow-goal.md` with no shipped-history justification — but the OLD glob list named it
literally too, the tests pin its removal, and impl-973.md discloses the carry-over. Behavior
unchanged; the bound sentence is false for this one entry.

### N2 — report nit: impl-973.md §4 says the install.sh strand set is "the remaining 6";
it is 7 names (`claude-workflow.md` + `claude-workflow-phase1..6.md`); impl §11 has it right
("Adding the 7 names"). Census: 21 basenames ever (commands/ + 2 plugin trees, no-renames),
3 current, 11 of the 12 listed names actually shipped (workflow-goal.md never did),
7 stranded. Arithmetic in the report only; no code impact.

## Checked and found SOUND (evidence per item)

1. **Retired-list completeness, measured with `--no-renames`** (default rename detection
   hides names retired by rename; the implementer's censuses also had blind windows —
   `.opencode/` untracked since `04752560` 2026-06-23, `.kimi/` never tracked):
   - `install.sh`: 21 command basenames ever; the list covers everything the old glob
     covered. The `claude-workflow*.md` strand framing is honest — the old patterns were
     exactly `kaola-workflow-*.md`, `workflow-init.md`, `workflow-next.md`,
     `workflow-goal.md`, `workflow-next-pr.md` (read from the pre-diff code), and none
     matches `claude-workflow*`. Not a regression.
   - opencode commands: 12 basenames ever in the tracked era = 3 current + exactly the 9
     listed; phase6 never shipped on opencode; `kaola-workflow-replan` was a support
     *script* (`kaola-workflow-replan.js`), never a command (checked the generator blob at
     `1146e3ac^`). Blind-window sweep (2026-06-23→now) found no other name. **Complete.**
   - kimi command skills: complete (`adapt`, `plan-run`, `fast`, `phase1-5` all listed;
     `kaola-workflow-auto` died 2026-06-26 pre-kimi; phase6 died 2026-06-08 pre-kimi and was
     never in kimi's `ADAPTIVE_CORE` + gated fast/phase1..5 set at `f6dbf40d`). Kimi roles:
     **incomplete — F1**.
2. **Retired-vs-deploy seam**: retired ∩ deploy-set = ∅ on all three installers (checked
   name-by-name against `WORKFLOW_COMMANDS` + current 14 roles / current 3 commands). A
   deployed name in neither set is preserved — measured (`my-own-skill` above; suite pins
   P5c/P7b/block-1 cover `workflow-goal`, `kaola-something-else`, `kaola-role-notadir.md`).
3. **Per-name removal placement**: in each installer the removal is the statement
   immediately before that name's own write, inside the same iteration, after the allowlist
   check — `install-kimi.sh:218-219`, `install-opencode.sh:351-352`, `install.sh:630-631`.
   No `continue`, no error path between them. A `cp` failure at name *k* aborts via `set -e`
   with only name *k* lost (vs. everything from *k* onward under the old blanket prune) and a
   loud cp error — improvement, disclosed in impl §11.4.
4. **Kind matching**: kimi sweeps/removes directories only (`[[ -d ]]` + `rm -rf`); opencode
   and install.sh sweep/remove files only (`[[ -f ]]` + `rm -f`). Matches what each deploys.
   The kimi comment "left for `cp` to fail on rather than silently deleted" is **measured
   TRUE**: BSD `cp -R srcdir destfile` → "Not a directory", exit 1, user file intact —
   loud abort, nothing destroyed.
5. **Quoting / `set -u` / globs / bash 3.2**: every removal target is
   `"$fixed_nonempty/$literal_from_nonempty_list"` — no empty-operand `rm` path; all three
   retired arrays are non-empty literals so the bash-3.2 `set -u` empty-`[@]` trap is
   unreachable; every copy-loop glob is guarded (`[[ -d ]]`/`[[ -f ]] || continue`).
   `/bin/bash -n` (3.2.57) and `bash -n` (5.x) both exit 0 on all three files — re-run, not
   taken from the report. (Pre-existing, not this diff: `${FORGE^}` at `install.sh:638` is a
   bash-4 expansion on the gitlab/gitea zero-command branch — runtime "bad substitution"
   under /bin/bash 3.2. Unchanged by the candidate; noting for completeness only.)
6. **The kimi zero-deploy diagnostic** (`install-kimi.sh:225-232`): verified true in both
   branches by exhaustive branch analysis of the loop — every iteration either (a) hits the
   glob-literal `-d` guard (only when the glob matched nothing), (b) increments `skipped`
   with the warning, (c) aborts via `set -e` on `cp` failure (guard unreached), or
   (d) increments `skill_count`. So at the guard, `skill_count==0 && skipped>0` ⇔ sources
   present and every one rejected ("all $skipped ... fall outside" — true), and
   `skipped==0` ⇔ the glob matched no skill-source directory ("no skill sources found" —
   true). No third population exists.
7. **Three installers, one shape**: compared side-by-side; the differences are exactly the
   declared ones (dir vs file primitives; opencode has no command zero-guard — unchanged and
   disclosed; install.sh's sweep sits at the top gated on `[[ -d "$COMMANDS_DIR" ]]`, which
   is safe because it removes only retired names now). The previous stale-header defect class
   (a comment describing removed machinery) was checked for: the rewritten headers in all
   three files describe the code that is actually there — with the single exception recorded
   as F1's bound sentence.
8. **install.sh shadowing duty**: the command loop always writes `$COMMANDS_DIR` (the
   plugin-runtime posture refuses at `install.sh:155-172` before the sweep), so
   remove-before-write covers de-shadowing for every shipped name; retired names are the
   list's job. The gitlab/gitea empty-source branch now leaves deployed commands alone
   (the #973 fix); the github branch still exits 1 after only the retired sweep — nothing
   the install cannot put back is lost on any abort path.
9. **Nesting/update constraint**: `install-kimi.sh:218` removes the dest dir on the line
   before `cp -R` in the same iteration; nothing is deferred. (Mechanism verified by
   reading; the mutation-family evidence for it is the test author's M2/P5d, not re-run
   here per the no-suites ground rule.)

## Not done, and why

- No test suite was run (ground rule: concurrent reviewers; the orchestrator ran the claude
  chain + full walkthrough serially and reports them green). Consequence: I did not
  independently re-observe the P-series pins; mutation claims in tests-973.md/impl-973.md are
  taken as their authors' evidence, and nothing in this review depends on them.
- I did not probe kimi `--global`/`--forge=gitlab|gitea` or opencode forge legs beyond
  reading (impl §7 measured them; the shared-body argument is structural and I found no seam
  it misses).

## Verdict

The mechanism shipped is the right shape and every path I probed behaves as claimed — except
that the kimi retired list, whose completeness is the load-bearing claim of the whole design
("retired on purpose is written down"), is missing one name the edition shipped for 8 days
across a real release. One-line fix, plus the two nits.

finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=RETIRED_ROLE_SKILLS omits kaola-role-issue-scout shipped 2026-07-17..25; strand reproduced hermetically at worktree code, exit 0
finding: id=R2 scope=in_scope action=defer status=open severity=low fix_role=implementer rationale=install.sh retired-list bound comment false for workflow-goal.md (never shipped); behavior unchanged from old glob, comment-only
finding: id=R3 scope=out_of_scope action=report status=open severity=info fix_role=none rationale=impl-973.md section-4 says 6 stranded claude-workflow names, measured 7; report arithmetic only

verdict: fail
findings_blocking: 1
review_conclusion: one real defect admitted — the kimi retired list omits kaola-role-issue-scout, a role skill the edition shipped between 2026-07-17 and 2026-07-25, so the new install strands it forever where the old namespace prune self-healed it; reproduced hermetically against the worktree installer, one-line fix, everything else probed sound.

# Code review — #1053 candidate `51890a2e` (base `d02f82b7`)

Reviewer: independent code-reviewer. Worktree
`/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1053`.
No repository file was created, edited, or reverted by this review; `git status --porcelain` in the
worktree is empty at start and at end. All mutation experiments ran against a throwaway
`git archive` export in the session scratchpad, never against the worktree or the shared main root.

**Verdict: PASS. findings_blocking: 0.** One LOW non-blocking finding and three observations.

---

## Acceptance point 1 — all supported Forge/Agent targets generated from the shared source

PASS.

- The only authoring edit is `templates/routing/next.skeleton.md:48` (Task clarity paragraph) and
  `:134` (verification-scope sentence). Every other prose change in the diff is a render.
- `node scripts/generate-routing-surfaces.js --check` → exit 0, "all 24 surfaces byte-match the
  skeleton". The 6 tracked `next` surfaces in the diff are exactly the registry's `topic === 'next'`
  rows (github/gitlab/gitea x command/skill). No hand patch: I confirmed by mutation (M4 below) that
  a hand edit to `commands/workflow-next.md` is caught by `--check`, which is registered on all four
  chains, so disk drift on a tracked render cannot ship silently.
- Additive editions: the suite renders each edition's own exported `renderCommand` in memory for
  github/gitlab/gitea. I verified the call signatures and arguments are production-faithful, not
  approximations:
  - `sync-opencode-edition.js:335 renderCommand(canonContent, forge, label)` — suite passes
    `(canon, forge, 'workflow-next.md')`; production at `:474` passes the same shape.
  - kimi/grok/cursor/zcode are all `renderCommand(canonContent, commandName, forge)` and the suite
    passes `(canon, 'workflow-next', forge)`. Production derives `name = file.slice(0, -3)`, i.e.
    `'workflow-next'` without the extension — identical.
  - This matters for Cursor specifically. `sync-cursor-edition.js:279` branches on
    `basename === 'workflow-next.md'`, where `basename` comes from
    `commandRel(commandName, forge)`, which re-appends `.md`. Passing `'workflow-next'` therefore
    DOES take the Cursor-CLI branch, so the suite exercises the same render that ships, including
    the CLI resume fence and startup-prep prose.
  - Cursor CLI/App/Cloud: the generator emits one flat `<tree>/commands/workflow-next.md` per forge;
    the CLI/App/Cloud distinctions are in-prompt text injected into that single file
    (`sync-cursor-edition.js:190-193, 208-282`). One surface per forge is therefore genuine coverage,
    not a missed variant.
- Seam judgment: rendering in memory is the right seam. It pins the producer→consumer transform
  without writing to the gitignored `.opencode`/`.kimi`/`.grok`/`.cursor`/`.zcode` trees, which are
  per-machine and which a `--write` from a linked worktree would resolve to the shared main root.
  The residual gap (a hand edit to an on-disk edition tree) is not tracked content and is already
  each edition suite's `--check` job.
- The suite correctly records, rather than pins, that compact-recovery prompts do not embed these
  passages: they render from a separate skeleton that only tells the agent to reload Next.

## Acceptance point 2 — exactly the five §1 meanings and one §2 principle, nothing more

PASS. Clause-by-clause mapping against the issue body:

| issue §1 clause | skeleton text |
|---|---|
| 结果与验收依据已清楚且已授权就继续，不要求固定需求格式 | "already clear and authorized, continue: do not demand a fixed requirement format or rewrite the issue to restate it." |
| 缺失事实先读代码/复现/查资料；已授权实现细节由 Agent 判断 | "read the code, reproduce, or look it up first; implementation detail inside an authorized scope is your own judgment." |
| 仅对未决且改变范围/授权/验收含义的决策提问，继续不依赖答案的调查 | "Ask the user only about an unresolved choice that would change scope, authorization, or the meaning of acceptance, and keep doing the investigation that does not depend on the answer." |
| 获授权维护 issue 时用自然语言表达可观察结果与验证依据，已有充分信息直接引用 | "express the observable outcome and its verification basis in plain language, and cite what is already sufficient instead of restating it." |
| 研究/设计请求不授权实施、forge 写入或认领 | "A research or design request authorizes research or design only; it does not authorize product implementation, forge writes, or a claim." |

§2 maps one-to-one onto the single added sentence at `:134`. No sixth meaning was smuggled in.

Non-goals verified by the diff's own file list (14 files): no new phase, role, config key, state
schema field, scorer, approval gate, template, learning loop, command, or CLI flag. Nothing under
`templates/agents/`, `scripts/kaola-workflow-*.js`, `config.json`, or the role library changed. The
Mission List table and "Three writes only" are untouched, and the suite pins both.

## Acceptance point 3 — wording quality and non-weakening

PASS.

- Direction is right. The Task clarity paragraph is placed immediately after "State the selection
  aloud before you claim it… Everything before the claim is free" and before the
  `<!-- PIN: forge-is-the-backlog -->` block, which is where intake judgment actually happens.
- The research/design sentence sits in the pre-claim region, exactly where an agent would otherwise
  over-read a design request as an implementation mandate. Good placement.
- No weakening found. The §2 sentence is spliced between "An implementer may not delete, weaken, or
  reinterpret that acceptance to pass." and "Finalization, closure, archive, and sink are never
  mission items.", and the same paragraph still opens with "any mutation invalidates prior PASS
  evidence for changed bytes". So "sufficient existing evidence may be cited rather than reproduced"
  is read against an adjacent, unmodified invalidation rule; it licenses citation, not staleness.
- "a short explanation or a small change never lowers acceptance" strengthens, not weakens, the
  mandatory-chain posture.
- "Ask the user only about an unresolved choice…" does not collide with the never-claim-unexecuted-UAT
  rule: that rule governs claiming a result, not asking a question, and a UAT decision is itself an
  acceptance-meaning question, so it remains askable.
- Independent acceptance custody ("The test author owns acceptance meaning") is byte-unchanged.

## Acceptance point 4 — the acceptance suite pins semantics, and is armed

PASS. `node scripts/test-issue-1053-next-task-quality.js` → exit 0, 247 assertions.

Mechanism: five clause detectors plus one addition-2 detector, each a small set of
paraphrase-tolerant regex fragments that must co-occur inside a one- or two-sentence window. Each
detector carries its own boundary/near-miss self-test that runs before any repo file is read, so an
always-true or unsatisfiable fragment set cannot hide. No detector pins the author's literal
sentence. The one exact-string pin in the suite is on PRE-EXISTING text (the PASS-invalidation
clause), which is the correct use of a literal.

Registration: present in both `test:kaola-workflow:claude` and `test:kaola-workflow:claude:full`,
inserted between `test-issue-1052-cursor-cli-startup-prep.js` and `test-zcode-install-trust.js` in
both. `node scripts/test-suite-registration.js` → exit 0, 677 assertions.

Independent mutation testing (throwaway `git archive` export in the scratchpad; the export is not a
git repo, so its floor is 1 failing assertion — see finding R1 — and every count below is measured
against that floor):

| mutation | result |
|---|---|
| M1: delete the research/design sentence from the skeleton only | 24 failures — ARMED |
| M2: delete "…never lowers acceptance, and sufficient existing evidence may be cited…" | 24 failures — ARMED |
| M3b: make ONLY `sync-opencode-edition.js` strip the Task clarity paragraph | 16 failures — ARMED |
| M3c: make ONLY `sync-opencode-edition.js` strip the addition-2 sentence | 4 failures — ARMED |
| M4: hand-delete the passage from `commands/workflow-next.md` only | suite stays at floor (does NOT red) |

M3b/M3c directly answer the brief's question: yes, deletion from a single edition render is caught.
M1/M2 show the pins are per-clause, not merely paragraph-existence.

M4 is a real seam boundary, not a defect: the suite renders from the skeleton in memory and never
reads the tracked render off disk, so it cannot see disk drift. `generate-routing-surfaces.js
--check` covers exactly that case — I confirmed it reports `DRIFT: commands/workflow-next.md` and
exits 1 under M4 — and it is registered on all four chains. Combined coverage is complete. Worth
knowing when reading a future failure: a hand-edited render reds `--check`, not this suite.

Note on the earlier attempt: my first version of M3 assigned to `arguments[0]`, which is a silent
no-op under `'use strict'`. That produced a false "not armed" reading. The corrected strict-safe
mutation (reassigning the named parameter) is what the table reports.

## Acceptance point 5 — documentation

PASS.

- `docs/task-quality.md` is 81 lines, and both blockquotes are VERBATIM. I compared them
  whitespace-normalized against the skeleton: the Task clarity quote is byte-equal to the skeleton
  paragraph, and the Run it quote is byte-equal to the skeleton sentence after stripping the leading
  ellipsis. No invented wording.
- Corrections routing uses only existing mechanisms: correction comment on the original issue,
  fix plus regression test, existing docs / ADR 0023 project instructions, ADR for architecture. It
  states plainly that there is no learning loop, no diary or knowledge base, no automatic owner-rule
  rewrite, no personal-memory write, and no routine "anything to remember?" step in init or finalize.
- Two factual claims in the doc, both verified true: "which is already the Next route's rule" for
  keeping shared dependencies together is backed by `templates/routing/next.skeleton.md:42`
  ("A shared contract/schema runs alone"); and ADR 0023's owner-authorization requirement is at
  `docs/decisions/0023-agent-owned-project-instructions.md:29`.
- No performance, speed, or rework-rate claim appears anywhere in the doc, README, api.md, or
  CHANGELOG. No test result is claimed in any of them.
- `README.md`, `docs/README.md`, `docs/api.md`, and the CHANGELOG `[Unreleased]` entry are accurate
  descriptions of what shipped. `docs/api.md` correctly states no new CLI, flag, envelope, or
  contract.

## Acceptance point 6 — scope

PASS. `git diff --name-only d02f82b7..51890a2e` is exactly 14 files: the skeleton, its 6 tracked
renders, `docs/task-quality.md`, `docs/README.md`, `README.md`, `docs/api.md`, `CHANGELOG.md`, the
new suite, and `package.json`. Every one is inside the issue's declared file boundary. No drift.

## Supporting suites run on this candidate (all exit 0)

`generate-routing-surfaces --check` (24 surfaces) · `test-issue-1053-next-task-quality` (247) ·
`test-generate-routing-surfaces` (480) · `test-route-reachability` (172) ·
`test-suite-registration` (677) · `test-release` (247) · `test-release-surface-drift` (9) ·
`validate-workflow-contracts` · `test-bash-block-guards` (49).

NOT executed by this review, and not claimed: `npm test`, the full walkthrough, the edition suites,
any install-time or live-host check. A background `npm test` was reported running in this worktree by
the dispatcher; its result is not mine to report.

---

## Findings

finding: id=R1 scope=in_scope action=note status=open severity=low fix_role=tdd-guide rationale=new suite hard-fails when the hardcoded baseline commit is unreachable, making npm test non-hermetic

**R1 — LOW, non-blocking. The acceptance suite fails in any checkout where `d02f82b7` is not in the object database.**

- Failure class: non-hermetic test / environment-dependent failure.
- Primary anchor: `scripts/test-issue-1053-next-task-quality.js:31` (`const BASELINE_SHA = 'd02f82b7';`).
- Secondary anchors: `:389` (`execFileSync('git', ['show', BASELINE_SHA + ':templates/agents/behavior-contracts.json'], …)`), `:393` (the `assert(false, …)` in the catch).
- Precondition and input: run `node scripts/test-issue-1053-next-task-quality.js` from a tree whose
  git history does not contain `d02f82b7` — a `git clone --depth 1`, a `git archive` export, or a
  future history rewrite.
- Expected: the suite judges the tree's content and passes when the content is correct.
- Observed (reproduced): in a `git archive 51890a2e` export of this exact candidate, the suite exits
  1 with `FAIL: could not read baseline templates/agents/behavior-contracts.json at d02f82b7:
  Command failed: git show d02f82b7:…` — 1 failure, 246 passed. Because the suite is `&&`-chained
  into `test:kaola-workflow:claude`, that failure fails the whole chain and hides every later step.
- Why existing guards do not prevent it: the catch converts a missing object into a test failure
  rather than a skip, and no other suite in `scripts/` pins a hardcoded historical SHA
  (`grep -rn "= '[0-9a-f]\{7,8\}';" scripts/*.js` matches this file only), so there is no shared
  helper that already handles the shallow-checkout case.
- Why this is LOW and not blocking: the repository has no `.github/workflows`, so the chains run
  locally from full clones and linked worktrees, both of which have the object. `d02f82b7` is the
  candidate's base commit and stays reachable from `main` after the sink. The trigger is real and
  demonstrated but is not on any path this project currently exercises.
- Note, not a demand: the same negative pin could be expressed without git — for example by
  asserting the roster against the current file plus the diff's own file list — but the existing
  form is defensible and the orchestrator may reasonably ship it as is.

## Observations (no action required)

1. **Over-broad word ban in a negative pin.** `scripts/test-issue-1053-next-task-quality.js` bans
   the bare words `remember`, `memoriz*`, `lessons learned`, `personal-memory`, and `learning loop`
   anywhere in `init.skeleton.md` and `finalize.skeleton.md`. The issue's non-goal is a routine
   "what to remember" STEP, which is narrower than the vocabulary. Both files are clean today, so
   the pin is green and correct now; a future innocent use of the word "remember" in either skeleton
   would red this suite for a reason unrelated to #1053. Recording it so a future failure is read
   correctly, not asking for a change.
2. **M4 seam, restated for the record.** This suite cannot detect a hand-edited tracked render;
   `generate-routing-surfaces.js --check` is the guard that does. Anyone debugging a future
   render-drift failure should look at `--check` first.
3. **`--check` counts 24 surfaces, the suite pins 18 rows.** Both are right: `GENERATED_SURFACES` is
   18 rows and the remaining 6 are compact-recovery renders. Not a contradiction.

---

# Re-review 1b779b38 (bounded, test-only delta)

`git diff --name-only 51890a2e..1b779b38` = `scripts/test-issue-1053-next-task-quality.js` only,
+147/-41. `git diff --stat 51890a2e..1b779b38 -- package.json` is empty. No production file, no
render, no skeleton, no doc changed, so the PASS findings recorded above for acceptance points 1, 2,
3, 5, and 6 stand unaltered on the re-frozen candidate. `git status --porcelain` in the worktree is
empty at start and end of this re-review; every experiment ran against `git archive 1b779b38`
exports in the session scratchpad.

**Verdict: PASS. findings_blocking: 0.** R1 is RESOLVED. Two new low observations, neither blocking.

## (1) Hermeticity — R1 RESOLVED

`BASELINE_SHA`, the `require('child_process')`, and the `git show` call are all gone from the file;
`grep` for a hardcoded hex SHA now matches only prose in two comments explaining the removal. In a
`git archive 1b779b38` export with no `.git` directory at all, the suite exits 0 with 264/264. The
same 264/264 holds in the worktree. The replacement reasoning is sound: `generate-agent-profiles.js
--check` already stands on both claude chains and is the history-independent guard for role drift,
and dropping the roster-COUNT pin also removes a second problem I had not raised, namely that a
count pin would have frozen every legitimate future role addition as a false #1053 non-goal.

## (2) Bound-negation and synonym detectors

Arming is preserved, re-measured against the revised detectors on a fresh export where the floor is
now a clean 0 failures: deleting the research/design sentence from the skeleton reds 23; deleting
the never-lowers-acceptance clause reds 23; making only `sync-opencode-edition.js` strip the Task
clarity paragraph reds 15. So the narrowing did not disarm anything.

Spot-check with three legitimate rewrites of my own choosing, none of them the ones the suite now
encodes. All three correctly MATCHED, so meaning is pinned without freezing wording:
"grants research or design only; it never authorizes product implementation"; "you need not rewrite
the issue to restate it" with "already established"; "small changes do not lower the acceptance bar".

Spot-check with three polarity inversions of my own choosing. One was correctly rejected: re-negating
addition-2 into "It is false that a small change never lowers acceptance ... It may lower acceptance."
Two still MATCHED and are recorded as observation O1 below.

## (3) Narrowed init/finalize memory-step pin

The bare-vocabulary ban is gone; the detector is now structural (routine question form, memory or
learning-loop write imperative, or a heading naming the concept). Four ordinary-prose probes of my
own were all correctly ignored: "Remember the claim is bookkeeping."; "A lesson from #700 informs
this order."; "The learning from the prior run is recorded in the issue."; "Memorize nothing; the
forge is the backlog." Under the previous bare-word ban, the first three would have false-RED. The
observation I raised on the first review is therefore addressed.

The guard still catches the real non-goal: four of six step shapes I tried were flagged, including
the routine question form, a `## What to remember` heading, "What should you remember from this
run?", and "Record lessons learned to the personal-memory file." Two escaped; see O2.

## (4) Production files and package.json

Confirmed untouched, per the delta file list above. `node scripts/test-suite-registration.js` exits
0 at 677 assertions, unchanged, and the suite remains registered on both claude chains.

## Observations from this delta (non-blocking, no action required)

**O1 — the attached-negation fragments still admit two constructions that invert meaning.**
Anchors `scripts/test-issue-1053-next-task-quality.js:95` (clause a) and `:154` (clause e). Both
bind a negation to its object within 60 characters, which defeats the unattached-token false green
the supervisor found, but neither models a second negation or a comparative inside that window.
Measured: "continue, but do not proceed without a fixed requirement format" satisfies clause a while
meaning the opposite, and "it never authorizes less than full product implementation, forge writes,
and a claim" satisfies clause e while meaning the opposite. This is a known and honestly declared
limitation: the file header states that a determined adversarial rewrite in an unanticipated
structure can still slip through and that chasing it with an ever-larger regex was deliberately
declined. I agree with that call. The pin's job is to catch accidental deletion or drift, which the
mutation results above show it does, and authoring an inverted sentence into the skeleton is a
review-visible act, not an accidental regression. Recorded so the residual is on the record rather
than assumed closed.

**O2 — the narrowed memory-step pin misses inflected forms of the same step.**
Anchor `scripts/test-issue-1053-next-task-quality.js:483`. `\banything\s+(?:\w+\s+){0,3}
(?:remember|learn)\b` requires the bare stem, so a routine step phrased "Ask whether anything should
be remembered for next time." or "prompt the user for anything worth remembering" is NOT flagged,
though both are exactly the non-goal shape. Explicitly NOT a regression from the delta: the previous
bare-word regex used `\bremember\b`, which also fails on "remembered" and "remembering", so this gap
was carried forward rather than introduced. Low severity, trigger requires a future author to add
the non-goal step in that particular inflection, and #1053's own scope never touches those two
skeletons.

# #932 — a failed claim must not delete anything the claim did not create

- item: Map the claim transaction exactly — what `claimProject` creates versus adopts, every throw site between adoption and `writeState`, and which reserved names are reachable as a project name; issue cites `scripts/kaola-workflow-claim.js:1184-1192` (orphaned-stateless-dir reclaim) and `:1263` (`fs.rmSync(dir, {recursive:true,force:true})` over `projectDir(root, project)`), plus `active-folders.js:240` skipping `archive` and dot-entries before path safety. Line numbers are from the issue, re-locate them.
  status: done
  dispatched: self — reading canonical `scripts/kaola-workflow-claim.js` + `active-folders.js` inline; findings land in this file's result and inform the fix-shape item
  result: |
    Confirmed as filed, and the cited lines are CURRENT (no drift): adoption `claim.js:1183-1191`
    (`fs.mkdirSync(dir)` non-recursive; EEXIST + no `workflow-state.md` falls through to reclaim),
    rollback `claim.js:1263` `fs.rmSync(dir, {recursive:true,force:true})` over the whole adopted tree.
    The transaction body is 1225-1258 and writes exactly two artifacts: `persistSelectionRecord`
    (`.cache/origin/selection-record.json`, path const at 1296) and `writeState`
    (`workflow-state.md`). Both are throw sites; the rollback is armed for both.
    The created-vs-adopted distinction ALREADY EXISTS at the mkdir/EEXIST branch — it is simply
    never carried to the rollback.

    UNCITED SECOND SITE — the bundle path `claimExplicitBundle` has the same defect at 1691-1694,
    and its comment at 1690 reads "Remove project dir if created" while `applied.dir = true` at
    1559 is set UNCONDITIONALLY, including on the adopted-EEXIST fall-through (1548-1557 swallows
    EEXIST when no state file). The comment already claims the scoping the code does not do, so
    the fix must cover both sites or the bundle door stays open behind a comment saying it is shut.

    Reusable idiom already present: `isReservedWorkflowDirName` at 2460 (#930's archive guard, 2487).

- item: Establish the baseline by RUNNING it — force a throw between directory adoption and `writeState` for a project name that is a reserved directory, in a scratch repo, and record whether `kaola-workflow/.roadmap/` and its sources are actually gone. The issue says "not observed in the wild"; the premise gets measured before it gets built on, and a clean non-reproduction is a result, not a setback.
  status: done
  dispatched: investigator subagent (2nd attempt; 1st died on a mid-response API error at 01:29Z having written nothing — locator checked empty, worktree clean) — reproduce in a throwaway scratch repo, never the working tree; writes its measurement to /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/kaola-workflow/issue-932/.cache/repro-932.md
  result: |
    REPRODUCED at both sites and REACHABLE from the shipped CLI — full evidence in
    .cache/repro-932.md. Negative control (leg 4) holds: same fault, same rollback, a CREATED dir —
    nothing uncreated touched. So adoption, not the fault, causes the loss.

    LOAD-BEARING FINDING (leg 5): the defect is WIDER than reserved names. An ordinary project name
    `issue-777` whose stateless folder pre-exists and holds human content is adopted and rm -rf'd
    whole. **A reserved-name refusal would NOT close this** — the fix must be created-vs-adopted.

    Corrections to the issue and to my own mapping:
      * The validator the issue cites at adaptive-schema.js:400-430 DOES NOT EXIST — that is
        `isParkedLanePath`, a clean-check ignore predicate, not a name gate. The only filter on the
        claim path is `isSafeName` (path safety; `isSafeName('.roadmap') === true`).
        `isReservedWorkflowDirName` has exactly ONE call site, `archiveProjectDir:2487`.
      * The second site is `claimBundle`, not `claimExplicitBundle` (the latter is its validating
        wrapper, and its hardcoded `'bundle-' + targets.join('-')` prefix makes the RESERVED-name
        variant unreachable there — the wider adopted-dir case still reaches it).
      * Blast radius includes the `archive/` band (R5b deleted every archived run), uncited.
      * Reachable with no operator typing a reserved name: `workflow_project:` in a roadmap source
        carries it (R2/R3/R4); `roadmap init-issue --workflow-project` sanitizes CR/LF only.

    SECOND, SEPARATE DEFECT (no deletion, so outside this issue's demanded result): adoption
    SUCCEEDS with no fault at all — claim returns verdict green at exit 0 and writes
    workflow-state.md into `.roadmap/` or `archive/`. Fixing the rollback does not address it.
    Escalated to the user as a scope question rather than decided here.

    Note: `claimBundle` destroys at EXIT 0 behind reasoning "bundle provision failed and was rolled
    back" — false in the direction that matters. Scoping the rollback makes that sentence true, so
    it needs no separate repair.

- item: Decide the fix shape from what the reproduction shows — scope the rollback to what the transaction created, refuse the adoption, or otherwise; the issue explicitly leaves the method to the implementer and demands only the result. Record the choice and its derivation.
  status: done
  dispatched: self — decided from .cache/repro-932.md
  result: |
    CHOSEN: scope the rollback to what the transaction created, at BOTH sites. Rejected the
    reserved-name refusal as the fix, because leg 5 measured data loss under an ORDINARY name — a
    name guard leaves the defect standing.

    Derivation is additive, not a new gate: the rollback exists so a failed claim does not orphan a
    folder IT created. That purpose is fully served by deleting only what it created. `claimBundle`'s
    own comment at :1690 ALREADY reads "Remove project dir if created" — the code is being made to
    match a scoping the tree already documents. No new refusal, no name list, no behaviour change on
    any path that was previously correct.

      * `claimProject` — record whether `fs.mkdirSync(dir)` at :1183 actually created the dir (it
        throws EEXIST when it did not). Rollback at :1263: created -> rm -rf as today; adopted ->
        remove ONLY the transaction's own two artifacts.
      * `claimBundle` — `applied.dir = true` at :1559 must become conditional on creation, the
        distinction its rollback at :1691 already claims to make.

    NOT "delete nothing" on the adopted path: a partially written `workflow-state.md` left behind
    makes the NEXT claim read the folder as occupied (:1186 `target_occupied`). The failed claim must
    take its own two artifacts with it — `workflow-state.md` and `.cache/origin/selection-record.json`
    — and prune only directories it created and left empty.

    Negative control is part of the contract: a CREATED folder must STILL be removed on rollback, or
    the fix trades this defect for orphaned folders.

- item: Author the test artifact for the demanded result, held by whoever does not implement it — "force a throw between adoption and `writeState` for a reserved-directory project name, and `.roadmap/` plus its sources survive". Existing homes to extend before adding: `scripts/test-claim-hardening.js`, `scripts/test-bundle-claim.js`. Prove it fails on the pre-fix baseline.
  status: done
  dispatched: tdd-guide subagent (2nd attempt; 1st died on a mid-response API error at 01:29Z having written nothing — worktree clean, no test-file mtime change), working in the worktree /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-932 — extends scripts/test-claim-hardening.js there; red-on-baseline proof written to /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/kaola-workflow/issue-932/.cache/tests-932.md. Covers BOTH sites (claimProject rollback + claimExplicitBundle rollback).
  result: |
    RED on baseline at both sites, full notes in .cache/tests-932.md. Files: +355/-0 across
    scripts/simulate-workflow-walkthrough.js and scripts/test-bundle-claim.js. No production file
    touched, no test deleted or relaxed.

    MY BRIEF WAS WRONG about the home and the agent corrected it: `test-claim-hardening.js` appears
    ONLY in `test:kaola-workflow:claude:full`, never in the mandated fast tier — a red test there is
    invisible to `npm test` and to the four-chain receipt, so the implementer could have shipped past
    it. Site 1 landed in `simulate-workflow-walkthrough.js` instead, next to #930's sibling
    `testArchiveNeverRelocatesReservedDir930`, whose own header says "the claim side is deliberately
    unchanged" — i.e. this issue. Site 2 landed in `test-bundle-claim.js`, which runs in BOTH tiers.

    Scenarios: `testClaimNeverDeletesWhatItDidNotCreate932` (reserved `.roadmap` AND ordinary
    `issue-9322`), `testClaimRollbackRemovesOnlyWhatItCreated932` (created-vs-adopted, one variable),
    and `Test (8d)/#932` on the bundle lane. Two unrelated faults reach the same destruction
    (`.cache`-as-file → ENOTDIR, and a newline `--codex-dispatch-mode` tripping writeState's #398.2
    fence), which is what makes the finding about the rollback rather than either injection.

    Coverage map — what reds under a partial fix:
      reserved-name refusal only  -> RED on ordinary-name, created-vs-adopted, and the bundle lane
      rollback scoped created-vs-adopted -> green everywhere (the post-fix world, proven satisfiable
                                            by the `clean` positive control)
      rollback stops deleting anything   -> RED on the negative control and on existing Test (8)
    Existing bundle Test (8) already serves as the created-side control on that lane; not duplicated.

    Named limitation, not papered over: the scalar lane carries no liveness control, because every
    observable that would prove it reached the adoption is one an allowed fix removes. The falsifiable
    liveness evidence lives on the bundle lane, where the project name is a literal no fix can change.

- item: Implement the fix in the canonical `scripts/kaola-workflow-claim.js`, reading and running the tests but not writing them.
  status: in-flight
  dispatched: implementer subagent in the worktree /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-932 — canonical fix AND the four-copy propagation in one dispatch (same change replicated); notes to .cache/impl-932.md. Explicitly forbidden from touching the two test files (test custody: tdd-guide authored them).
  result: |
    Landed, +82/-3 in each of the four copies, no test file touched (their diffstat unchanged at
    +242/+120, 0 deletions — verified by me against `git diff --stat`). Full record .cache/impl-932.md.
    Suites: walkthrough 1 -> 0 (205/205), bundle 1 -> 0 (196/196), exit codes captured directly.

    Shape: two helpers beside persistSelectionRecord — `probeAdoptedDir` reads what was on disk
    BEFORE the transaction (record, state file, and which ancestor dirs pre-existed) and
    `rollbackAdoptedDir` removes each artifact only if it was absent then, pruning upward only
    through dirs it created and left empty. Both sites capture the non-recursive mkdir's EEXIST as
    `dirCreated`; claimBundle's `applied.dir = dirCreated` now records creation rather than arrival.
    `adopted` deliberately kept OFF `applied`, since that object is serialized to a human as `partial`.

    Left alone, correctly (recorded, not built): a pre-existing selection-record.json in an adopted
    folder SURVIVES but is OVERWRITTEN with the new run's bytes. Measured independent of this fix —
    a SUCCEEDING claim over the same fixture leaves identical bytes, so it is persistSelectionRecord's
    unconditional "the record is the authority" write. #932 demands not-deleted, not not-overwritten,
    and restoring prior bytes needs a snapshot mechanism nothing has asked for.

- item: Propagate across the forge editions — `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`, `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`, `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`. claim.js is a DIVERGENT hand-port, not generated, so each copy is edited by hand and each edition's own suite is the check. Verify the guard is armed in every copy, not merely present.
  status: in-flight
  dispatched: same implementer dispatch as the item above — canonical + plugins/kaola-workflow (byte-identical copy of canonical, verified with diff) + the two hand-ported forge copies; notes to .cache/impl-932.md
  result: |
    All four copies carry it. `diff -q` canonical vs plugins/kaola-workflow exit 0, 386986 bytes each
    (byte-identity preserved). The three divergent copies changed 44 code-only lines each,
    sorted-identical across all three — only line ORDER differs, which is what a faithful hand-port
    of the same change looks like. Both forge contract validators and both forge walkthroughs exit 0.

- item: Mutation-prove the guard in every edition it ships to — a green suite is not proof a guard is armed. Mutate call sites ONE AT A TIME and count; a mutant that reds nothing is more likely broken than redundant, and `$?` after a pipe reports the pipe.
  status: in-flight
  dispatched: PARTLY DONE INLINE — the implementer's per-site revert proof covers CANONICAL: revert site 1 alone and both walkthrough scenarios red while the bundle suite stays green; revert site 2 alone and the bundle suite reds with all five Test (8d) FAILs while the walkthrough stays green. Neither test covers for the other, and the negative controls stayed green, confirming a scoping rather than a stop-deleting. GAP RAISED BY THE IMPLEMENTER: the two forge hand-ports have ZERO coverage — `grep -rln 932` across both forge script dirs matches only the edited files, so what SHIPS to gitlab/gitea users is unpinned. Dispatched to tdd-guide (tests932b, resumed with its context) to author scripts/test-forge-claim-rollback-scoping.js modelled on #930's sibling scripts/test-forge-archive-scoping.js, which is already wired into all four chain scripts in package.json; notes appended to .cache/tests-932.md.
  result: |
    CLOSED, and the forge gap with it. New scripts/test-forge-claim-rollback-scoping.js, modelled on
    #930's sibling: 4 editions x 4 legs, driving each edition's OWN CLI — 120 passed, 0 failed.
    Wired at the sibling's exact position in FIVE package.json entries (claude, codex, gitlab, gitea,
    claude:full); test-suite-registration.js exit 0 (44 files, 41 registered, 516 assertions) and it
    independently enforces that the fast gate carries everything the full tier does, so a
    four-chain-only wiring would have failed there.

    Legs: A `claim --project` (created REMOVED = control + liveness witness; adopted intact),
    B `startup` covering the branch no other test reaches — the record IS written, then taken back
    out with its dirs pruned, C its sharper twin — a selection record PREDATING the claim survives
    and `.cache/` is not pruned (created-vs-adopted at FILE granularity), D the bundle lane.

    MUTATION-PROVEN PER EDITION, one at a time: canonical / codex / gitlab / gitea each 25 failed /
    95 passed, and every mutant reds ONLY its own edition's assertions. Per-SITE on the gitlab port
    too: site-1-only reds A/B/C with D green; site-2-only reds D alone. All four copies restored
    byte-identical; canonical == codex byte-identity preserved.

    THE FINDING, and it is the reason this item existed: the FIRST draft of legs B and C was VACUOUS,
    and only the mutation proof caught it. They were built on `--branch` with a newline, from reading
    `isSafeBranchArg` without the following line — `assertSafeBranchArg` calls `assertNoNewline` at
    the FRONT DOOR, before the mkdir, so the claim refused with zero mutation and those folders
    survived for a reason unrelated to the rollback. The signature was A and D reding under every
    mutant while B and C red under none: a green pair that CANNOT go red is what a vacuous fixture
    looks like from outside. Rebuilt on a fault that fires after the record write and A/B'd against a
    reverted tree before anything was built on it — that A/B is now written into the suite header as
    a standing rule rather than a thing done once.

    Also corrected in this pass: the false reason in
    `testClaimRollbackRemovesOnlyWhatItCreated932`'s header, and #930's
    `testArchiveNeverRelocatesReservedDir930` header, which claimed "the claim side is deliberately
    unchanged" — now half false, and cross-referenced to #932 and #933.

- item: Dock the documentation — `CHANGELOG.md` under `[Unreleased]`, and any doc whose claim about claim-side rollback this changes. Write the heading from what shipped, not from intent.
  status: done
  dispatched: self — CHANGELOG written in the worktree from the shipped diff, not from the plan; docs swept for stale claims
  result: |
    CHANGELOG.md: new `## [Unreleased]` / `### Fixed` section (none existed; 9.5.3 was at the top).
    Heading states the effect — "A failed claim no longer deletes a project directory it adopted
    rather than created (#932)" — and the body names three things it is NOT: not a reserved-name
    guard (an ordinary name loses data too, and the bundle lane can only ever have that shape), not
    a decision to stop deleting (the created folder is still removed; the negative control pins it),
    and not a fix for the adoption door (#933, written with no closing keyword anywhere near it).
    Also records the two measured properties: the bundle lane's silent exit-0 destruction under a
    "rolled back" reasoning string that scoping now makes true, and the selection-record overwrite
    that is independent of this fix.

    Docs swept, NO edit needed and that is a finding not an omission: `docs/api.md:1374` and
    `docs/workflow-state-contract.md:127-135` describe `workflow_project` being adopted verbatim with
    only `isSafeName` filtering it — still exactly true, and the subject of #933 rather than this fix.
    Nothing in docs/ makes a claim about the rollback's scope. `docs/api.md:108` documents `partial`
    carrying `dir`; its meaning tightened from "reached this step" to "created", which makes the
    human-facing cleanup record more accurate, not less, so no correction is owed.

    Deliberately NOT edited: the released `## [9.5.3]` entry's line "The claim side is deliberately
    unchanged". True as history of what #930 did; rewriting a shipped entry would be worse than
    leaving it, and the [Unreleased] entry states the current position. The LIVE test comment
    carrying the same sentence IS being corrected — routed to tdd-guide, whose custody it is.

- item: File the SECOND defect as its own issue — adoption succeeds with no fault at all, exit 0, writing `workflow-state.md` into `kaola-workflow/.roadmap/` or `archive/`; scoping the rollback does not touch it and closing it needs a claim-site refusal, which is a value call the owner has now separated from this run. Owner ruled 2026-08-04: fix the rollback here, file this separately. Attach the measured reachability (R1 `--project .roadmap`; R2/R3/R4 via `workflow_project:` in a roadmap source, no operator typing a reserved name; R5b destroying the whole `archive/` band) and cite `isReservedWorkflowDirName` at claim.js:2460 with its single call site at :2487. Use `gh issue create --body-file` — `--body "$(heredoc)"` command-substitutes backticks. In the commit prose write the number with NO closing keyword near it: "Filed, not fixed: #N" has closed an issue here before.
  status: done
  dispatched: self — body drafted at /private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/6f5cdfb0-fc23-423f-b0fc-38729ff77aeb/scratchpad/issue-adoption.md, filed via `gh issue create --body-file`; the new number lands in this item's result
  result: |
    Filed as #933, VERIFIED OPEN by read-back (`gh issue view 933` → OPEN), and #932 confirmed still
    open alongside it. Body carries the measured reachability table (R1/R2/R4/R5), the single-call-site
    fact for `isReservedWorkflowDirName`, the demanded result with its falsifier, and an explicit note
    that choosing a REFUSAL there is a value call for the owner rather than a checkable fact.
    Scoped OUT in the body: the rollback (#932 closes it), a general name validator (#929), and
    `active-folders.js` enumeration (#930 owner ruling).
    REMINDER FOR THE COMMIT: write "#933" with NO closing keyword anywhere near it.

- item: Verify at full scope — `node scripts/simulate-workflow-walkthrough.js` exit 0, then `npm test` (all four chains) before any sink. Echo each chain's own exit code; 143/137 is a kill and evidence of nothing.
  status: done
  dispatched: self — commit first (the receipt binds to headSha by exact equality), then `run-chains.js` in the worktree; the diff touches plugins/ so chain selection fails closed to all four. Receipt lands in kaola-workflow/issue-932/.cache/. Each chain's OWN exit code echoed, never a compound status.
  result: |
    GREEN at commit 652c2d5be3fdfd066eaec76980d5a3946743c762, receipt at
    .cache/chain-receipt.json, transcript at .cache/chains.log.

    Per chain, read off the receipt rather than the wrapper status — exit 0, signal null (NOT
    killed), timed_out false, accepted_red false (nothing waived), attempts 1:
      claude 365s · codex 9s · gitlab 94s · gitea 91s
    Ran SERIAL (KAOLA_RUN_CHAINS_CONCURRENCY=serial) so no chain's result could be confounded by a
    sibling mutating the same worktree. scope.decision `no_narrowing` — all four actually ran.
    receipt.headSha == HEAD exactly, working tree clean at run time.

    THEN the gap the chains cannot close: the claude chain samples the walkthrough at
    `--shard auto/12`, so a green chain is only the slice that came up. Ran it unsharded on the same
    committed tree — `scenarios:205, ran:205, passed:205, failed:0`, exit 0, log at
    .cache/walkthrough-full.log. Both #932 scenarios named PASSED in it.

    Near-miss worth recording: the test author landed the #930 header correction WHILE this was in
    flight, and I briefly concluded the run was tainted by a dirty tree. It was not — the edit
    preceded `git add -A` and is inside 652c2d5b, confirmed by `git show HEAD:` grep plus a clean
    `git status`. Checking beat assuming; acting on the assumption would have discarded a good run.

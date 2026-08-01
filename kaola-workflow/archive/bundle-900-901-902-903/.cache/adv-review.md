# Adversarial review — bundle #900/#901/#902/#903 production diff

Scope: the six canonical files named in the dispatch, at branch `workflow/bundle-900-901-902-903`
(uncommitted, baseline `9b68b096`). Test files and `docs/` excluded. No tracked file was modified.
No suite was run: the dispatch states test files are being edited concurrently, so a red there
carries no signal.

Method: read the full diff and every function it touches; reproduced the #901 git premise, the #900
producer/gate round trip and the #902 checklist in scratch fixtures under
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/advreview/`;
compared all four editions.

**5 verified findings, 4 plausible-but-unconfirmed.** Most severe: V1 — #900's new `record` verb
cannot produce a binding the finalize gate accepts on the ordinary linked-worktree topology.

---

## VERIFIED

### V1 — HIGH — `record` is unusable in the worktree lane, and writable only where it binds the wrong tree

`scripts/kaola-workflow-validation-runner.js:1077` (`resolveCandidateRoot`), `:1186-1198`
(project-folder gate + hint), `:1088` (`otherProjectRoots`), `:1226` (hint);
`scripts/kaola-workflow-adaptive-schema.js:1206-1207` (the two hints that route the operator here).

The verb resolves the candidate from `process.cwd()`'s git top level and then **requires
`<candidateRoot>/kaola-workflow/<project>/` to exist in that same tree**. On the standard
linked-worktree topology the run folder lives **only in main** — which is precisely the premise #902
is built on (`claim.js:3469-3471`: "run folder resident in the main checkout, worktree not yet
carrying it"). So the two halves the gate needs — the record's *location* (main's `.cache/`, which
Step 8a mirrors into the worktree) and the record's *hash* (the worktree's tree) — can never both be
satisfied by one invocation.

Verified, in order:

1. This very bundle: `.kw/worktrees/bundle-900-901-902-903/kaola-workflow/` contains
   `.roadmap`, `archive`, `ROADMAP.md`, `.origin` — **no `bundle-900-901-902-903/`**.
2. `record` run from the worktree (the tree the recipe says to run it from, and the tree the gate
   hashes) → `outcome: inconclusive`, `reasons: ["project_folder_missing"]`, **exit 1**, and a hint
   that says *"If the run lives in a linked worktree, record from that worktree"* — which is where
   the caller already is. The hint is a loop.
3. Scratch consumer fixture (`consumer/`, no `package.json` → consumer arm; run folder in main only;
   worktree carrying one extra commit to `src/app.js`). `record` from **main** →
   `outcome: recorded`, hash `74f6f3b7…`, and **`operator_hint: null`, `other_candidate_roots: []`** —
   no warning at all.
4. `evaluateChainReceipt` from the worktree over the mirrored record →
   **`final_validation_stale`** (`74f6f3b7… != df5e5390…`).
5. Straight through the real CLI: `claim.js finalize --project issue-777 --check --keep-worktree`
   from the worktree reports `checks.validation: "final_validation_stale"`.
6. On the live repo, `computeCodeTreeHash` over main vs over this worktree differ
   (`f96f0ac4…` vs `7cf33cc4…`), confirming the two trees never agree pre-merge.

Net effect: #900's stated failure — `final_validation_unbound` on a run whose tests all passed — is
replaced by **`final_validation_stale` on a run whose tests all passed**, plus a hard exit-1 dead end
at the documented invocation site (`commands/kaola-workflow-finalize.md:63-71`).

**The mitigation designed for this exact hazard cannot fire in it.** `otherProjectRoots` (`:1088`)
warns by listing *other working trees that also carry this project's run folder*. In the topology
that makes the binding wrong, the worktree **does not** carry the folder, so the list is empty and
`operator_hint` is `null` (step 3 above). This is the dispatch's trap #2 verbatim: the guard exists
and is asking a different question.

`impl-900.md:238` shows the inverted premise the implementer tested: *"D6 — record **from main**
while the folder lives only in the worktree"*. That is the mirror image of the shipped topology, so
D6 exercises the arm that never occurs and leaves the arm that always occurs untested.

Secondary hazard from the same root cause: if an operator works around V1 by hand-creating the folder
in the worktree and recording there (correct hash), `mergeCopyDir(srcDir, destDir,
FINALIZE_MIRROR_DEST_OWNED)` (`claim.js:3221`) recurses into `.cache/` **without** the keep-existing
set (`claim.js:3083`), so any `final-validation.md` in main silently overwrites the correct one at
Step 8a.

### V2 — MEDIUM — #902's fix is gated on `destAbsent`, so the same false obligation survives one branch over

`scripts/kaola-workflow-claim.js:3490` (`&& mirror.mainRoot && mirror.state === 'ready' && mirror.destAbsent`),
with `:3380-3386` (`probeFinalizeMirror`).

`predictFinalizeAuthority` only predicts when the destination is **entirely** absent. When the
worktree carries a *partial* run folder — a `kaola-workflow/<project>/.cache/` with no
`workflow-state.md`, the shape produced whenever anything writes evidence or a chain receipt into the
worktree — `destAbsent` is false, `resolveFinalizeAuthority(root, …)` sees `livePresent: true` with no
state file, and the checklist reports an operator obligation the transaction repairs itself one line
later.

Verified in the fixture, same project, only the worktree folder changed:

- worktree has `kaola-workflow/issue-777/.cache/impl.md`, no state file →
  `ok: false`, `reasons: ["state_missing"]`, `checks.validation: "final_validation_unverified"`,
  **exit 1**, while `checks.mirror` is `"ready"` (the mirror will run).
- then `mirrorFinalizationArtifacts(worktree, 'issue-777')` — the transaction's own Step 8a, via the
  exported function — returns `{"mirror":"mirrored","ledger_compare":"pass"}`.
- re-run `--check`: `ok: true`, `checks.workflow_state: "ok"`, exit 0.

Not a regression (pre-#902 behaved the same), but it is the same defect class #902 was filed to
remove, still live in a reachable sibling shape. The `destAbsent` bit is doing the work of "the mirror
will construct the authority"; what it actually answers is "the mirror will construct the
*directory*".

### V3 — MEDIUM — the force-add set is "every file on disk", not run evidence

`scripts/kaola-workflow-sink-merge.js:1328` (`requiredArchiveFiles`), `:2183-2188` (`forcePaths`),
`:2219-2221` (the stderr wording); mirrored in
`scripts/kaola-workflow-claim.js:2649` (`ignoredArchiveEvidence`), `:4311`.

`requiredArchiveFiles` returns every regular file under the archive minus the two `SINK_STAGE_SKIP`
journals. `forcePaths` is that set intersected with *every* ignored-untracked path under the archive.
So any ignored junk file inside the archive is force-added into main's `chore: archive … [sink]`
commit, overriding a rule the consumer wrote, and announced as a **"run-evidence file"**. On the
`archiveIgnored` arm the same file is itemized in `receipt.archive_missing_paths` and described as run
evidence that "would not survive a fresh clone".

Verified mechanism in fixture `g1` carrying this repo's own `.DS_Store` rule:

```
$ git ls-files -o -i --exclude-standard -z -- 'kaola-workflow/archive/proj/'
kaola-workflow/archive/proj/.DS_Store
kaola-workflow/archive/proj/.cache/.DS_Store
kaola-workflow/archive/proj/.cache/sink-receipt.json
```

`.DS_Store` is a regular file whose basename is not in `SINK_STAGE_SKIP`, so it is in `requiredPaths`
and therefore in `forcePaths`. Realistic trigger: the operator opens `kaola-workflow/<project>/` in
Finder during a multi-hour run; `copyDir` carries the `.DS_Store` into the archive; the sink commits
it. No such file exists in this repo right now (`find kaola-workflow -name .DS_Store` → none;
`git ls-files -o -i --exclude-standard -- kaola-workflow/` → 0), so this is a mechanism verified with
no live trigger. A narrower required set (evidence-shaped, or at least excluding paths whose only
reason for being ignored is a repo-wide junk rule) would keep the fix and drop the override.

### V4 — MEDIUM — the new sidecar-presence re-check cannot fire on any single-threaded path

`scripts/kaola-workflow-claim.js:2501-2513`, against `copyDir` at `:5033-5041`.

The check asks whether a sidecar present in `src/.cache` is absent from `dest/.cache`, immediately
after `copyDir(src, dest)` (`:2487`). `copyDir` iterates `readdirSync(src, {withFileTypes:true})`
recursively and `copyFileSync`s every non-directory entry, with no skip list and no error swallowing —
it either copies everything or throws (and a throw never reaches this line;
`archiveProjectDirSafely` catches it). Same basename in both trees, so no rename can hide a copy.
`missingSidecars` can therefore only be non-empty if something mutated `src/.cache` or `dest/.cache`
between the copy and the check.

The comment's own justification is that `verifyArchiveComplete` "authorized the deletion without any
statement about them", which is true — but the loss the incident actually suffered happened at the
sink's commit (fixed by `forcePaths` + `missingBlobs`), not at this copy. As shipped this is a
statement, not a guard: mutation-proving it proves it is armed, not that its condition is reachable.

### V5 — LOW — `resolveCandidateRoot`'s second resolution step is a no-op by construction

`scripts/kaola-workflow-validation-runner.js:1077-1082`, against
`scripts/kaola-workflow-adaptive-schema.js:1022-1046`.

`resolveCandidateRoot` computes `planRoot = gitTopLevel(process.cwd())` and then calls
`schema.resolveFinalizeCheckRoot(planRoot)`. Inside, `cwdTop = realpath(topLevel(cwd))` and
`planTop = realpath(topLevel(planRoot))`; since `planRoot` was itself derived from `cwd`, these are
always equal and the function returns `planRoot` on the first branch. The verb is therefore exactly
`gitTopLevel(process.cwd())`. Harmless, and the resulting root is the right one — but the comment at
`:1043-1052` claims it "resolves the candidate down the SAME road" as the gate, and the gate's road
(`planRoot` derived from the *run folder*, then possibly redirected to `cwdTop`) is the one that can
diverge. The dead step reads as coverage of a divergence it cannot see.

---

## PLAUSIBLE — unconfirmed

### P1 — an absent `closure_policy` reads as `all_or_nothing`, widening `--execute`'s delete authority

`scripts/kaola-workflow-closure-audit.js:262-268`.

`(!policy || policy === 'all_or_nothing')` treats a **missing** field as the permissive reading, so a
legacy bundle archive with `issue_numbers:` and no `closure_policy:` contributes every member to
`archiveClosed`, and `--execute` deletes those members' roadmap sources. The conservative reading
would require the field explicitly. Measured: **0** closed archives in this repo's 368 carry
`issue_numbers` without `closure_policy`, and the backlog is empty (`.roadmap/` holds only
`.gitkeep` and `_rules.md`), so no trigger exists here. A consumer repo with pre-#328 bundle archives
is the exposure.

### P2 — the archive commit's failure is still swallowed, and the new refusal misattributes it

`scripts/kaola-workflow-sink-merge.js:2246-2249` (`catch (_) {}` on the commit) and `:2330-2334`.

`addErrors` now carries the `git add` statuses, but the `git commit` itself is still discarded. A
hook rejection or a signing failure therefore surfaces as `sink_incomplete` with
`archive_add_errors: []` and a detail asserting "the force-add above either could not run or did not
take" — the one cause it cannot be. Correct refusal, wrong diagnosis; for the keep-worktree posture
(`archive_dest` unset) this is now the *only* report of a rejected commit.

### P3 — `archivedProjectPaths` does not recognise a `.discarded-*` archive

`scripts/kaola-workflow-validation-runner.js:1116-1131` vs
`scripts/kaola-workflow-closure-audit.js:123-127`.

The record verb matches `<project>` and `<project>.archived-*`; closure-audit's
`archiveNameMatchesProject` matches all three shapes including `.discarded-*`. A caller standing in
the right tree for a discarded run gets the generic "this project is not claimed in it" hint instead
of the archived-run message. One rule, two wordings.

### P4 — `ambiguous_name_match` is stamped on only one of the two ambiguous findings

`scripts/kaola-workflow-closure-audit.js` (`annotateAttribution`).

`scope.archive_name_ambiguous && finding.project === scope.project` stamps only the bare-`P` finding;
the `P.archived-<ts>` sibling gets `name_match` although the ambiguity makes both attributions
uncertain. Cosmetic, scoped output only.

---

## Checked and clean

Recorded so the same ground is not re-walked:

- **Unscoped envelope parity.** `driftCounts(drift)` reproduces the deleted fixed `counts` object
  exactly: same six keys, same insertion order, same non-array→0 rule; the new class and
  `unresolved_closed_state` are both omitted when empty. No envelope change on a repo with no
  citation drift.
- **Every `scopePredicate` arm matches its producer's finding shape** — `f.number` for
  `stale_in_progress_labels` (gh `--json number,…`), bare numbers for `mirror_lists_closed_issues`
  and `unresolved_closed_state` (`collectClosedSet` pushes numbers, `:225`), `project`+`issue_number`
  for the folder classes, folder-name match for the two archive classes. No predicate reads a key
  that is `undefined` on the path it matters — the dispatch's trap #1 does not recur here. In
  particular an unprobeable scoped issue does drive `current_project_clean: false`.
- **Producer/gate hash agreement.** The record verb and `evaluateChainReceipt` both call the single
  `computeCodeTreeHash`, both pass `VALIDATION_TEST_CONSUMES` (claim.js passes no
  `testConsumedExtra`, `claim.js:3551`), and both auto-detect `self_host` from the same root. The
  `project` tag cannot affect the result: `isValidationInvisible` returns true for all of
  `^kaola-workflow/` regardless, so the gate's `path.basename(authorityDir)` (which is
  `<project>.archived-<ts>` on a source-missing resume) is harmless.
- **`writeFileAtomicReplace` mkdirs the parent** (`adaptive-schema.js:500`), so recording into a run
  folder with no `.cache/` yet works rather than throwing.
- **#901's git premise reproduced.** With a `.cache/` basename rule: `check-ignore -q -- <archiveDir>`
  exits 1 (directory not ignored) while `ls-files -o -i --exclude-standard` names each file, and
  `git add -- <dir>/` exits 1 while still staging the non-ignored siblings.
- **The force-add actually lands.** `git add -f -- <ignored paths>` followed by the sink's
  pathspec-limited `git commit -m … -- <commitPaths> <excludes>` commits them as blobs;
  `ls-tree -r --name-only HEAD -- <archiveRel>` reports all four expected paths. So `missingBlobs` is
  empty on the repaired path and the new refusal does not fire spuriously. Verified for the
  crash-resume shape too: already-indexed force-adds survive a second `git add`.
- **#902's construction premise holds.** `mergeCopyDir`'s `keepExisting` skip is guarded by
  `fs.existsSync(d)`, so `workflow-state.md` *is* copied when the destination is absent — the
  predicted authority is real. Step 8a runs before `resolveFinalizeAuthority` (`claim.js:3739` vs
  `:3769`). The prediction's gate is tight: `source_absent`, `skipped_post_archive`, a present
  destination and a non-live main source all leave the original refusal standing.
- **`classifyArchiveDisposition`'s refactor to `archiveRelFromRoot` is behaviour-identical** to the
  inlined code it replaces.
- **New contract pins resolve.** All three needles exist in `commands/kaola-workflow-finalize.md`
  (`validated_candidate_hash` at :47, `…validation-runner.js" record` at :63,
  `--project {project} --verdict pass --command` at :64) and
  `node scripts/validate-workflow-contracts.js` exits **0**.
- **Cross-edition parity.** `kaola-workflow-adaptive-schema.js` and
  `kaola-workflow-validation-runner.js` are byte-identical across all four editions
  (`cmp -s`). Every new symbol in claim/closure-audit/sink-merge appears in all four copies with
  matching occurrence counts. The gitlab/gitea ports correctly carry the `issue_iid || issue_number`
  fallback into `stateIssueNumbers`, and their folder items expose `issue_number: issueIid`, so the
  new bundle-member arm is live in the ports rather than dead.
- **The citation detector's measurement reproduces**: 4 flagged archives over 368
  (`bundle-440-441`, `bundle-513-514`, `issue-455`, `issue-891`). It is not a systematic
  false-positive generator: 84 summaries cite `.cache/chain-receipt.json` and only 3 of those are
  missing, and nothing in production deletes that file. Coverage gap worth knowing, not a defect: the
  detector reads `<archive>/finalization-summary.md` only, so archives that keep the summary under
  `.cache/` (e.g. `archive/issue-630/.cache/finalization-summary.md`) are silently unexamined.
- **#903's CLI surface behaves**: `--help` exits 0, `--bogus` exits 1 with the usage,
  `--project no-such-project` refuses rather than answering clean, and a scoped offline dry run emits
  `scope` / `current_project_clean` / `current_project_drift` / `repository_drift_outside_scope` with
  `attribution` stamped on the archive class. Offline can never report clean, which the usage states.

finding: id=R1 scope=in_scope action=fix status=open severity=high fix_role=implementer rationale=record verb refuses in the worktree and binds main's hash from main, and its two-tree warning cannot fire in that topology
finding: id=R2 scope=in_scope action=fix status=open severity=medium fix_role=implementer rationale=destAbsent gate leaves the same false state_missing obligation for a partially present destination
finding: id=R3 scope=in_scope action=fix status=open severity=medium fix_role=implementer rationale=force-add set is every file on disk so ignored junk is committed and reported as run evidence
finding: id=R4 scope=in_scope action=fix status=open severity=medium fix_role=implementer rationale=sidecar presence re-check cannot fire because copyDir is total and throws on failure
finding: id=R5 scope=in_scope action=fix status=open severity=low fix_role=implementer rationale=resolveFinalizeCheckRoot call in resolveCandidateRoot is a no-op and the comment claims coverage it lacks
finding: id=R6 scope=user_decision action=none status=open severity=low fix_role=none rationale=absent closure_policy read as all_or_nothing widens --execute deletion authority with zero instances measured here
finding: id=R7 scope=in_scope action=fix status=open severity=low fix_role=implementer rationale=archive commit failure still swallowed so the new refusal misattributes it to the force-add
finding: id=R8 scope=in_scope action=fix status=open severity=low fix_role=implementer rationale=archivedProjectPaths omits the discarded archive shape closure-audit matches
finding: id=R9 scope=in_scope action=fix status=open severity=low fix_role=implementer rationale=ambiguous_name_match stamped on only one of two equally ambiguous archive findings

verdict: fail
findings_blocking: 5

review_conclusion: The four fixes are individually well constructed and their premises reproduce, but the #900 producer is aimed at the wrong working tree for the linked-worktree lane every run of this workflow uses, so it converts an unbound verdict into a stale one and its own two-tree warning cannot fire there; #902 repairs the absent-destination shape and leaves the partial-destination shape reporting the same false obligation; #901's sink repair works end to end yet demands and force-adds every file on disk rather than run evidence, and its archive-copy sidecar check cannot fail because copyDir is total.

# Adversarial review — #978 half of bundle-976-977-978

Reviewer role. Candidate: the uncommitted diff in
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-976-977-978` over `51db5d2d`,
scoped to the four sink-merge copies plus `scripts/test-sink-merge.js` (415 insertions, 4
deletions; the test file is insertions-only, 249/0 by numstat). Nothing in the worktree or real
checkout was mutated; every experiment ran in
`…/scratchpad/rev978/` (mirror clone at `51db5d2d` + the five candidate files copied in,
byte-faithfulness proven by shasum equality with the worktree before any run).

## Verdict in one paragraph

The fix is real, complete on its filed scope, and independently reproduced: the suite passes at
1014 assertions in my own mirror; all four of my independent mutations (backslash condition alone,
trailing-slash condition alone, legacy stage alone, `--ignored` probe widening) go red on exactly
their own pin sets and nothing else; and — the highest-value check, which no shipped test drives —
the LEGACY entry point refuses over both a backslash-named file and an embedded repo on all four
editions, proving the guard-level repair covers the route the (j)/(k) arms do not exercise. Zero
blocking defects admitted. Four non-blocking findings below, one of them a demonstrated silent
destruction that survives the fix (a symlink in the lane folder defeats the whole l-rescue), which
the orchestrator should see before closing #978.

## CONFIRMED findings (demonstrated, none blocking)

### R1 — one uncopyable entry in the lane folder silently reverts the l-rescue to total destruction (medium)

- Anchor: `scripts/kaola-workflow-sink-merge.js:3242-3245` (the new legacy stage's
  `catch (_) { wtStageDir = null; }`), same block in all four copies; mechanism in `sinkCopyDir`
  (`scripts/kaola-workflow-sink-merge.js:1490-1498`, `fs.copyFileSync` dereferences symlinks).
- Trigger, demonstrated end-to-end on ALL FOUR editions (driver `rev978/mirror/scripts/rev978-driver.js`, E4):
  a legacy sink over a worktree whose `kaola-workflow/<project>/.cache/` holds the journal PLUS one
  dangling symlink → `copyFileSync` throws ENOENT mid-copy → the catch nulls `wtStageDir` → removal
  proceeds → **exit 0, status "merged", worktree gone, journal destroyed, zero survivors, nothing
  said**. Observed identically on root/codex/gitlab/gitea. Standalone repro confirms the mechanism
  (ENOENT; entries staged before the throw are abandoned un-landed in the leaked tmpdir).
- Same class: a self-referential symlink (ELOOP) or an unreadable file (EACCES) in the lane. A
  symlink is not hypothetical here — it is the artifact that motivated #973 (h), whose fixture
  plants it OUTSIDE the lane and so drives the refusal path, never the stage.
- Why not blocking: the destruction outcome is byte-identical to baseline (pre-#978 destroyed this
  fixture with or without the symlink) — the candidate strictly shrinks the destroyed population
  and its "best-effort, a stage failure never stops the sink" comment is accurate. But #978's own
  bar for shape l is "the work survives AND no unqualified success over destroyed work", and this
  trigger violates both, silently, after the fix. The pinned (l) fixture cannot see it (no symlink).
  A repair is available that violates no constraint: refuse (or warn on the envelope) only when the
  stage THROWS — (f)/(i-control)/(l) fixtures all stage cleanly, so none would go red.

### R2 — new loud refusal over an in-lane basename containing a backslash (low, fail-closed over-breadth)

- Anchor: the guard line, `scripts/kaola-workflow-sink-merge.js:514` (`!rel.includes('\\')`).
- Demonstrated against the shipped `worktreeDirtRecords` (extracted verbatim, real schema helpers):
  `?? "kaola-workflow/issue-9/.cache/a\\b.md"` — genuinely under the lane via real `/` separators,
  backslash only in the BASENAME — is now kept as dirt. Before this diff it was exempt and the sink
  completed; now every sink refuses until the file is removed. Arm (f) cannot see this (its fixture
  has no backslash basename).
- Why not blocking: the refusal is loud, names the file, and remediation is trivial; a backslash
  basename in lane content is freakish; and the conservative reading (any backslash record is
  never exemptable) is defensible. Recorded so the over-breadth is a decision, not an accident.

### R3 — merge-failure after the stage strands the only journal copy in an unnamed tmpdir (low, disclosed by the implementer)

- Demonstrated (E5, root): legacy run over a rebase-conflict posture → exit 1 (loud, not silent),
  nothing merged, but the worktree-only journal's only surviving copy sits in a leaked
  `$TMPDIR/kw-wtsync-*` dir that no output names, and a re-run cannot land it (it stages from the
  now-empty worktree). Strictly better than baseline (which destroyed the bytes outright).
  Inherited shape from the --sink route (#619(4)); impl-978.md item 5 discloses it accurately.

### R4 — main-root preflight still exempts a backslash name in the MAIN root (out of filed scope, disclosed)

- Code fact: `assertCleanWorktree` (`scripts/kaola-workflow-sink-merge.js:432`) filters via
  `isParkedLanePath` directly, whose `\`→`/` normalisation is untouched (kernel unchanged,
  `0ac70c1d…` in all four trees). A file named `kaola-workflow\proj\x.md` in the MAIN root remains
  exempt on that seam. Out of #978's filed shapes (worktree guard); impl record names it as a
  follow-up candidate. Recorded so it is not lost.

Also inherited and deliberate (no row): `sinkLandStagedUnion` skips the basenames
`sink-receipt.json`/`sink-fallback.json` at EVERY depth, so the (l) fixture's
`.cache/sink-fallback.json` never lands — #520/#707 define those as cycle-local scratch; the pinned
survival rides the other journal file, as impl-978.md item 4 states.

## What was checked and found CLEAN (each by measurement, not reading alone)

1. **Guard-cannot-fail / vacuous pins — CLEAN.** Independent mutations in fresh mirror trees, all
   four sink copies each, full suite each (my own runs, not the implementer's):
   - mutJ (drop `!rel.includes('\\')` only): exit 1, **8 failed / 1006** — exactly (j) both pins × 4 editions.
   - mutK (drop `!rel.endsWith('/')` only): exit 1, **8 failed / 1006** — exactly (k) × 4.
   - mutL (neutralize the LEGACY stage only, `--sink` stage untouched): exit 1, **4 failed / 1010** — exactly (l) × 4.
   Each mechanism is independently load-bearing; each pin set is exact; no new assertion passes vacuously.
2. **Arm (f) — CLEAN.** Candidate suite green at 1014 in my mirror includes (f) on all four
   editions: ordinary untracked `kaola-workflow/<project>/.cache/…` still sinks at exit 0. The bare
   widening the brief warned about did not happen — the exemption is narrowed only by the two new
   record shapes.
3. **Arm (g) still the armed tripwire — CLEAN.** mutG (add `--ignored` to the worktree probe in the
   CANDIDATE, all four copies): exit 1, **4 failed / 1010** — exactly (g) × 4. The diff did not
   weaken (g): non-`??` records were and are unconditionally kept, so `!!` records still refuse, and
   (g) still catches it.
4. **Legacy route over shapes j/k — CLEAN, the review's key result.** Driving each edition's real
   CLI on the LEGACY entry point (no `--sink`) over suite-built fixtures: backslash file (E1) and
   embedded repo with committed-unpushed history (E2) → **refusal on all four editions** — exit 1,
   worktree intact, bytes survive, offending record named in output. The shared
   `assertWorktreeClean`/`worktreeDirtRecords` claim is verified directly, not on trust.
5. **Over-broadening of the two new dirt rules — CLEAN except R2.** Probed the `-uall` record space
   in a live repo: an empty untracked dir, a dir holding only ignored files, a dir of empty subdirs,
   and an unreadable dir all emit **no record at all** (the last only a stderr warning — that
   population was and stays invisible, a pre-existing blindness). Trailing-slash `??` records were
   producible only at repository boundaries: a real embedded repo and a resolvable `.git` gitfile
   (a planted linked worktree) — both things the refusal SHOULD protect. A dangling gitfile does
   not collapse (reports per-file). No ordinary run shape hits either new rule.
6. **Four-edition parity — CLEAN.** root and codex plugin byte-identical
   (`430650f8e4c3ea1aec57810606fcaaa2f0be35fc8a5327f424b2118d51deea3a`, both, measured). gitlab and
   gitea hunks read line-by-line against root: same three edits in the ports' idiom (top-level
   `worktreePathFor` import vs. root's local require; `adaptiveSchema.` prefix); their
   `sinkCopyDir`/`sinkLandStagedUnion` bodies are semantically identical to root's. Behavioral
   parity confirmed by E1/E2/E4 driving each edition's own script: identical outcomes ×4. Kernel
   untouched (one hash across four trees).
7. **Comment claims — CLEAN.** Every factual claim in the added comments was re-measured: backslash
   is C-quoted and decodes to a literal name char under BOTH `core.quotePath` settings (measured
   both); `-uall` collapse is specifically repo-boundary behavior (probes above); "this route used
   to reach the same `git worktree remove --force` with no stage anywhere on it" matches the
   pre-change code and my mutL tree reproduces exactly that behavior; the land comment matches the
   union code (`existsSync` guard — a checkout-resolved file is never overwritten).
8. **Destruction-safety of the land — CLEAN.** `sinkLandStagedUnion` cannot overwrite an existing
   destination file (existsSync guard, all four copies); landing happens after the FF merge and
   before `postMergeCleanup`, same relative order as the `--sink` route, so landed evidence reaches
   the archive path. Failure paths between stage and land: R3 above, all loud (non-zero).

## Verification runs (all mine, in the mirror)

| run | result |
|---|---|
| candidate suite | exit 0, **test suite passed: 1014 assertions**, zero FAIL lines |
| mutJ / mutK / mutL / mutG | exit 1 with exactly 8 / 8 / 4 / 4 failures, pin sets as itemized above |
| E1 legacy+backslash ×4 editions | refusal, exit 1, worktree intact, file survives |
| E2 legacy+embedded-repo ×4 | refusal, exit 1, repo + unpushed history survive |
| E4 legacy+dangling-symlink ×4 | exit 0 "merged", journal destroyed silently — finding R1 |
| E5 legacy stage-then-conflict | exit 1 loud; only copy stranded in `kw-wtsync-*` — finding R3 |

Artifacts: `…/scratchpad/rev978/{baseline.log,mutJ.log,mutK.log,mutL.log,mutG.log,mirror/,mutJ/,mutK/,mutL/,mutG/,probe/,make-driver.js,mutate.js}`;
drivers at `rev978/mirror/scripts/rev978-{helpers,driver,e5}.js` (helpers extracted verbatim from
the candidate suite so the fixtures driven are the suite's own).

## Canonical findings

finding: id=R1 scope=in_scope action=report status=open severity=medium fix_role=tdd-guide rationale=one uncopyable lane entry (dangling/self-referential symlink, unreadable file) makes the new legacy stage throw, the catch nulls the stage, and the sink destroys the journal at exit 0 "merged" with nothing said — demonstrated on all four editions; outcome equals baseline so not candidate-caused, but it is the exact silent-destruction shape #978 exists to close and the pinned (l) fixture cannot see it
finding: id=R2 scope=in_scope action=report status=open severity=low fix_role=none rationale=an in-lane basename containing a backslash (kaola-workflow/<proj>/.cache/a\b.md) is now unconditionally dirt — a loud refusal where the sink previously completed; fail-closed over-breadth, arm (f) blind to it, recorded as a decision for the orchestrator
finding: id=R3 scope=pre_existing action=report status=open severity=low fix_role=none rationale=merge failure after the stage strands the only journal copy in an unnamed leaked kw-wtsync tmpdir with no landing on re-run — demonstrated; loud exit, strictly better than baseline, inherited #619(4) shape, disclosed in impl-978.md
finding: id=R4 scope=out_of_scope action=report status=open severity=low fix_role=none rationale=the main-root preflight seam (assertCleanWorktree via isParkedLanePath) still exempts a backslash name in the MAIN root — kernel untouched by design; disclosed follow-up candidate, outside the filed worktree-guard shapes

verdict: pass
findings_blocking: 0

review_conclusion: The #978 half holds under independent adversarial measurement: 1014 assertions green in a byte-verified mirror, four independent mutations each red on exactly their own pin set, the legacy entry point verified refusing over both unpinned shapes on all four editions, arms (f) and (g) proven still armed on the candidate, and every added comment claim re-measured true; the four non-blocking findings — chiefly the demonstrated symlink-triggered silent collapse of the l-rescue — are recorded above for the orchestrator to weigh, none of them caused by this candidate.

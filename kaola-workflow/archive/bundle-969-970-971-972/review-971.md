# Adversarial review — issue #971 (run-folder resolution in gap-sweep; Step 9 sink-metadata capture; removed contracts pin)

Candidate: uncommitted tree at `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-969-970-971-972`
(branch `workflow/bundle-969-970-971-972`, baseline `7e962bdc`), scoped to the four gap-sweep copies,
the Step 9 change in `templates/routing/finalize.skeleton.md` plus its six regenerated surfaces, and
the removed `assertIncludes` in `scripts/validate-workflow-contracts.js` (and vendored copy).
Method: every claim below marked "measured" was demonstrated by running the shipped code against
fixtures built for this review (git init + git worktree add, gap seeded in main only, uncommitted),
never by reading alone. Nothing outside the seeded evidence file was written to either checkout;
all fixtures lived in the session scratchpad.

## Verdict up front

The defect the fix was judged against — scan-then-check from a linked worktree exiting 0 with
mapped:0 while a real gap sits unswept in main, plus the stray folder — is dead in all four shipped
copies, measured, not inferred from the suite. The Step 9 capture binds correctly from both trees on
all six shipped surfaces. The removed pin's replacement is strictly stronger and I mutation-proved it
independently. Zero candidate-caused defects admitted. One non-blocking residue observation (R1) the
orchestrator should see.

## R1 (non-blocking, pre-existing scope): the false green survives on a tree already polluted by the old bug

- Anchor: `scripts/kaola-workflow-gap-sweep.js:476-477` (the `holds(cwd)` short-circuit) reaching the
  vacuous-pass arm at `scripts/kaola-workflow-gap-sweep.js:371`.
- Reproduction (measured, shipped code): main + linked worktree; real gap in MAIN's
  `.cache/run-gaps-manual.md`; the worktree carries a same-named `kaola-workflow/<project>/` folder
  (an empty `.cache` is enough — `holds` tests only directory existence). Scanner from the worktree:
  `{"result":"swept","sweptClasses":[]}`, artifact written into the WORKTREE. `--check` from the
  worktree: `{"result":"pass","mapped":0,"filed":0,"noise":0}`, exit 0. Same silent green, same
  unswept gap in main.
- Why it matters: the pre-fix scanner is precisely what manufactures this topology — every operator
  who followed "run scanner first" from a worktree under the released versions left exactly this
  stray folder behind. On such a tree the upgraded code stops at the stray and the kill the CHANGELOG
  claims ("can no longer ... certify nothing") does not hold. The candidate ships no detection and no
  cleanup of that residue.
- Why it is not admitted as a candidate defect: behaviour in this topology is byte-identical before
  and after the fix (measured both ways); the fix prevents new pollution (T25c pins "no stray
  folder") but does not repair old pollution. The test author recorded the both-trees case as
  deliberately unpinned (tests-971.md), and the finalize mirror (mergeCopyDir of the full folder
  including `.cache/`, `scripts/kaola-workflow-claim.js:3631`) makes the sanctioned post-mirror
  topology self-consistent, so only residue or out-of-band folder creation produces divergence.
  This repository's live worktree carries no such residue (verified: the bundle worktree's
  `kaola-workflow/` holds only `.origin`, `.roadmap`, `archive`, `ROADMAP.md`). Whether to add
  residue detection is a value call for the orchestrator; under "derive additively" it stays
  recorded until observed in the wild.

## Attacks run, and what each found

### 1. The resolution rule's ambiguous cases (all measured against the shipped canonical copy)

- Folder in BOTH trees, caches divergent: cwd wins; from the worktree that reads the worktree copy
  and can vacuous-pass (R1 above); from main it reads main and refuses correctly. In the sanctioned
  flow the divergent shape needs residue, because Step 7 precedes the mirror and the mirror copies
  `.cache/` (tree-bound artifacts excepted, supplied-if-absent only).
- Folder in NEITHER, archive TRACKED (this repo's posture — `kaola-workflow/archive` is in
  `git ls-files`, checked out in the worktree): the `project_archived` refusal FIRES from the
  worktree, exit 1. The impl report's "a scan from the worktree still misses the project_archived
  refusal" is wrong for tracked archives — wrong in the benign direction; no code defect.
- Folder in NEITHER, archive untracked in main only: worktree scan returns swept:[] and creates a
  stray folder in cwd — byte-identical to pre-fix behaviour (the "vacuous first-scan case" the #675
  comment already records). Pre-existing, unchanged, flagged by the implementer.
- Subdirectory of main; subdirectory of the worktree: both resolve to MAIN's run folder via
  `resolveMainRoot` (git --git-common-dir, resolved against the passed root). Scanner from a worktree
  subdirectory landed the artifact in MAIN's `.cache`; no stray anywhere. This is strictly better
  than pre-fix (which strayed into the subdirectory).
- Detached worktree: resolves main, sweeps main's gap. Bare repo + worktree: no main checkout
  exists; falls back to the invoking worktree, writes nothing into the bare dir — the only sane
  answer in that topology.
- No git and no override (T25f shape): scans cwd; the git lookup is inside try/catch and
  `resolveMainRoot` is fail-open. Note T25f's cwd holds the folder, so it short-circuits before ever
  asking git — the suite exercises the fallback property, not the throwing path, but the throwing
  path is guarded twice (getCoordRoot's catch, resolveRunRoot's catch).
- KAOLA_GAP_ROOT nonexistent: created via the scanner's mkdirSync, same as old behaviour. Set to a
  non-repo dir: honoured without any git call. Empty string: falls through to the search (old code
  fell to cwd) — semantics shift only in that corner, aligned with intent, no caller passes it.

### 2. Did the false green die? (measured, shipped code, real linked worktree)

Fresh fixture per copy, gap seeded in main only, both commands issued from the worktree:

| copy | scanner | --check | stray in wt |
|---|---|---|---|
| scripts/kaola-workflow-gap-sweep.js | swept manual:flaky-suite, artifact in MAIN | refuse gaps_unswept, exit 1 | none |
| plugins/kaola-workflow/scripts/ (codex twin) | identical | identical | none |
| plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-gap-sweep.js | identical | identical | none |
| plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-gap-sweep.js | identical | identical | none |

Remaining routes to the vacuous-pass arm (`gap-sweep.js:371`), enumerated: (a) genuinely empty run —
legitimate; (b) empty `## Run gaps` section, nothing swept — legitimate; (c) section with entries
while swept is empty always refuses observed_gap_unseeded first — cannot vacuous-pass; (d) stale
artifact scanned before the gap was seeded — pre-existing scan-then-check ordering, unchanged;
(e) both-trees residue — R1; (f) neither-tree first scan — pre-existing, recorded; (g) operator's own
KAOLA_GAP_ROOT at an empty tree — explicit override, pinned by T25d. No candidate-caused route found.

### 3. KAOLA_GAP_ROOT precedence (measured)

Override pointing at an empty third tree while MAIN (the cwd!) held the folder and the gap: scanner
swept the override tree (swept:[], artifact under the override root, main untouched); --check passed
vacuously against the override tree. The override wins over the search in both modes, first line of
`resolveRunRoot`, before any git call. Relative override resolves against cwd as before. The 127
pre-existing assertions plus T25a-f all pass: 151 assertions, exit 0, run by me in the live worktree.

### 4. The four copies (verified)

- canonical vs codex twin: md5 e523c7ec... identical, byte-for-byte.
- gitlab/gitea ports: rename-normalised identical to canonical except the one @generated banner line.
- Both forge ports require the BASE-named kernel (`./kaola-workflow-adaptive-schema`) at both sites
  (:215, :481) and that file exists in each forge scripts dir — the #868 trap is not re-armed, and
  each port ran end-to-end (table above), which is the proof reading cannot give.
- validate-script-sync: exit 0 in the live worktree (the claim.js twin drift the implementer isolated
  has since been repaired by its owner).

### 5. The removed pin (judged: coverage genuinely survived, and widened)

- What replaced it, and where each runs: Test F (`scripts/test-bash-block-guards.js`) EXECUTES the
  Step 9 block from all SIX rendered surfaces from both cwds and asserts the bound values, with
  non-vacuity pinned (`blocks.length === 1` per surface); `generate-routing-surfaces.js --check`
  byte-pins every rendered surface to the skeleton. Both run in the claude fast gate alongside
  `validate-workflow-contracts.js` (package.json:40), so no chain lost the property.
- Surface enumeration: old pin reached exactly ONE surface (GitHub command). Test F reaches all six
  tracked rendered surfaces. A skeleton-level deletion propagates to all six and Test F reds; a
  single-surface hand deletion reds generate --check (drift) AND Test F. The two untracked edition
  surfaces were never covered by the old pin and are render outputs of a covered surface.
- Independent mutation proof (mine, not the author's): scratch mirror of the candidate tree, Step 9
  capture deleted from `commands/kaola-workflow-finalize.md` only. Real exit codes, no pipes:
  test-bash-block-guards exit 1 ("carries exactly one Step 9 capture block ... got 0");
  generate-routing-surfaces --check exit 1 ("1 surface(s) drifted"). Both nets fire.
- Residue the tests-971 author already conceded (a hybrid capture reading the branch from git) was
  never held by the old pin either. Nothing the old pin actually held is lost.
- Vendored copy: byte-identical (diff clean), validate-script-sync green.

### 6. Step 9 on the shipped surfaces (measured, executed under bash against this repository)

All six rendered surfaces' blocks, extracted and run with {project} substituted, from BOTH the
worktree and main: SINK_STATE_FILE resolves to MAIN's `workflow-state.md` from the worktree and
stays relative from main; SINK_BRANCH=workflow/bundle-969-970-971-972, SINK_ISSUE=969,
SINK_ISSUE_NUMBERS=969,970,971,972, SINK_ISSUE_ACTION=close on every one, both cwds, exit 0.
ACTIVE_WORKTREE_PATH resolves to the linked worktree from BOTH trees — the `_WT_PRE` change
(`process.argv[1]`, skeleton :304) works; verified `node -e` places the first extra argument at
argv[1]. Also run from a SUBDIRECTORY of each tree (not covered by Test F): both bind correctly —
`--git-common-dir` output is absolute from a worktree subdir and cwd-relative from a main subdir,
and the `$(pwd)/` prefix guard at skeleton :290 handles both.

Edition surfaces (main checkout only): `.opencode/command/kaola-workflow-finalize.md` already
carries the new block (an installer ran mid-bundle) and binds correctly from both trees, measured.
`.kimi/skills/kaola-workflow-finalize/SKILL.md` still ships the OLD render and binds EMPTY from the
worktree today — it is an untracked install output regenerated from the fixed command surface, so it
heals at the next install/release reinstall; flagging so that reinstall is not skipped after the sink.

### 7. Prose-rot check on the prompt surface

The one comment added to the skeleton block (":288 the record stays where the claim wrote it; you
may not be there") states a fact about the record, not a mechanism, names no vendor, no model, no
command, and carries no issue number. The `[[ ]]` bashism is inside a ```bash fence, matching the
pre-existing Step 11 idiom. The #971 provenance lives only in script comments
(validate-workflow-contracts.js:521 area), test names, and CHANGELOG — all sanctioned locations. The
CHANGELOG `[Unreleased]` entry for #971 exists in the candidate (the obligation the implementer
flagged is closed). The other two skeleton hunks in the same file (## Mission List section,
"variant"->"form") belong to #970/docs and were not judged here.

## Checked and found sound (summary)

- The headline false green: dead in all 4 copies, from a real linked worktree, shipped bytes (sec 2).
- Resolution rule at every enumerated ambiguous topology; only residue (R1) defeats it (sec 1).
- Both modes resolve identically, once, before the mode split (gap-sweep.js:548) — the scanner/gate
  disagreement that produced the false green is structurally gone.
- The #675/#679 refusal paths compute projectDir/archiveDir/ownArtifactPath from the SAME root — no
  new inconsistency introduced by re-rooting.
- KAOLA_GAP_ROOT precedence in every mode, including against a main that holds the folder (sec 3).
- Four-copy identity and per-copy end-to-end behaviour (sec 4).
- Removed pin: replacement mutation-proven by me, both nets, real exit codes (sec 5).
- Step 9 on all six shipped surfaces plus both edition surfaces, both cwds plus subdirs (sec 6).
- Suites in the live candidate tree, run by me: test-gap-sweep 151 assertions exit 0;
  test-bash-block-guards 49 assertions exit 0; generate-routing-surfaces --check 18 surfaces exit 0;
  validate-workflow-contracts exit 0; validate-script-sync exit 0; test-spawn-classification exit 0.
- No residue from this review: git worktree list shows only the two legitimate trees; git status
  carries only the pre-existing " M" modifications; scratch fixtures all lived under the session
  scratchpad.

finding: id=R1 scope=out_of_scope action=none status=open severity=medium fix_role=none rationale=false-green-persists-on-trees-carrying-pre-fix-stray-run-folder-residue-unchanged-behaviour-no-detection-shipped

verdict: pass
findings_blocking: 0

review_conclusion: The number-971 fix kills the measured false green in all four shipped gap-sweep copies and binds the Step 9 sink metadata correctly on all six rendered surfaces from both trees, the removed pin is replaced by strictly wider execution coverage that I independently mutation-proved, and the only surviving route to a vacuous pass requires pre-fix stray-folder residue, which is unchanged pre-existing behaviour recorded here as non-blocking R1.

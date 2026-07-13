evidence-binding: n2-review 04c2b67f6daa
verdict: pass
findings_blocking: 0

# n2-review (G1 gate) — bundle-675-676 re-review after #676 free-form-node-id repair

APPROVE. The adversarial R1 refutation is genuinely fixed; the broadened source-relative
enumeration closes the evidence-loss hole with no false-refuse, no scope creep, and full
cross-edition parity. All six checks pass; zero blocking findings.

## (a) #675 fail-closed + safe — PASS
`runScan` (scripts/kaola-workflow-gap-sweep.js) refuses `project_archived` at the TOP of the
function (guard `!fs.existsSync(projectDir) && fs.existsSync(archiveDir)` returns 1) BEFORE the
`cacheDir` assignment and well before the only side effects — `fs.mkdirSync(path.dirname(outputPath))`
(line ~200) and `fs.writeFileSync(outputPath, ...)` (line ~203). So no stray active dir is recreated
and no archived run-gaps.json is clobbered, incl. the `--output`-at-archive case. Never-claimed
projects (neither active nor archived) skip the guard and still scan vacuously. Confirmed by
test-gap-sweep T12.1/T12.2 (refuse + archived artifact byte-preserved) and T13 (never-claimed →
swept, empty). 68/68 assertions green.

## (b) #676 REPAIR correctness — PASS (the crux)
verifyArchiveComplete(srcDir,destDir) is now SOURCE-RELATIVE via listSourceEvidenceFiles: top-level
{workflow-plan,workflow-state,finalization-summary,fast-summary}.md if present, PLUS every
`.cache/*.md` where `name.endsWith('.md') && !ARCHIVE_CACHE_SIDECAR_MD.has(name)`; workflow-state.md
added unconditionally as the identity anchor.
 (i) Denylist scope — the 5 entries are ALL genuine fixed-name machinery, NOT node ids: grep confirms
     final-validation.md (finalize validation-gate evidence, normalized by name at claim.js:1951,
     contract-asserted), run-gaps-manual.md (fixed path read at gap-sweep.js:113), selection-evidence.md
     (router-written fixed sidecar), doc-docking.md + doc-updater.md (finalize sub-step outputs
     documented in finalize SKILL.md). None is a per-node gate-evidence filename.
 (ii) No real node-evidence name slips: the glob is gone — enumeration is name-shape-agnostic, so
     free-form (design.md/review.md/finalize.md/t414.md/parity-anchor.md), role-named
     (planner.md/code-reviewer.md/security-reviewer.md), and bare (n1.md) are all now REQUIRED. The
     old `/^n\d*-.+\.md$/` even missed bare n1.md (no `-`); all now caught.
 (iii) No false-refuse on a faithful copy: copyDir is fully recursive (recurses every subdir incl.
     `.cache/` via `if (entry.isDirectory()) copyDir(...)`), so a genuine archive carries every
     `.cache/*.md` the source held; over-inclusion is therefore fail-closed-safe and cannot break a
     faithful copy. No legitimately-regenerated `.cache/*.md` is dropped by a real archive.
Ungated renameSync path (atomic whole-dir move) and receipt honesty (cmdFinalize `archive_incomplete`
refuse before any roadmap/issue/label side effect) unchanged and correct.

## (c) Cross-edition parity — PASS
`edition-sync.js --check` clean (10 forge ports, 24 COMMON mirrors, 27 byte-identical groups in
parity). `validate-script-sync.js` OK (7 forge export-superset families in sync). ARCHIVE_CACHE_SIDECAR_MD,
listSourceEvidenceFiles, and the `name.endsWith('.md') && !...has(name)` check are byte-present in all
4 claim editions (canonical + codex twin @3097/3104/3112; gitlab @2994/3001/3009; gitea @2988/2995/3003).

## (d) Real RED->GREEN, discriminating — PASS
Read walkthrough cases 8/9/10 directly. Case 8: source has free-form design/review/finalize/t414.md,
dest drops review.md → asserts ok===false && missing includes `.cache/review.md`. This is genuinely
RED against the old narrow glob (none of design/review/finalize/t414 begin with `n<digit>-`, so the
required set was empty → dropped review.md invisible → {ok:true}, failing the assertion) and GREEN now
(every `.cache/*.md` required). n1 evidence reproduced this exact RED. Case 9 (faithful free-form +
role-named copy → ok:true) proves no false-refuse; case 10 (drop final-validation.md/doc-updater.md
sidecars, keep design.md → ok:true) proves denylist scope. Previously-broken suites GREEN at HEAD with
zero fixture edits: test-bundle-finalize 135/135; test-claim-hardening 173 assertions and
`git diff HEAD -- scripts/test-claim-hardening.js` EMPTY (unchanged).

## (e) Surgical — PASS
`git diff --name-only` = exactly the 10 declared files (gap-sweep x4, claim x4,
test-gap-sweep.js, simulate-workflow-walkthrough.js). No stray untracked repo files (only the
bundle-675-676 .cache/ present). The other 5 walkthroughs are byte-at-HEAD (untouched).

## (f) Suites — PASS (counts)
- simulate-workflow-walkthrough.js → Workflow walkthrough simulation passed (incl.
  testArchiveCompleteSourceRelative676)
- test-gap-sweep.js → 68 assertions
- test-adaptive-node.js → 1797 assertions (the 致命错误 lines are transient locale-git fixture
  teardown noise inside the harness; exit 0)
- test-bundle-finalize.js → 135/135
- test-claim-hardening.js → 173 assertions

## Non-blocking observation
The sidecar denylist is a fixed-name set: were a planner to assign a node id colliding EXACTLY with a
reserved machinery name (e.g. a node literally named `doc-updater`), its gate evidence would be
excluded and a lossy copy dropping it would pass. No shipped role/planner produces these names (role
library: code-reviewer/tdd-guide/implementer/build-error-resolver/security/planner...), so there is no
real trigger; this is strictly better than the pre-repair glob that missed ALL free-form names.
Recorded for the record only — does not block.

finding: id=R1 scope=in_scope action=fix status=resolved severity=high fix_role=implementer rationale=free-form-node-id evidence-loss glob replaced by name-shape-agnostic .cache/*.md enumeration minus fixed-name sidecar denylist; verified RED->GREEN case 8, no false-refuse case 9, denylist scope case 10
finding: id=N1 scope=out_of_scope action=document status=open severity=low fix_role=none rationale=sidecar denylist is a fixed-name set; a planner node id colliding exactly with a reserved machinery name would be excluded, but no shipped role produces these names so no real trigger

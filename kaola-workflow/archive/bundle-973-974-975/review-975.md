# Adversarial review — issue #975 implementation

**Reviewer:** fable adversarial reviewer (read-only on the candidate; every experiment in throwaway
fixtures under `/private/tmp`, none in either live tree).
**Candidate:** worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975`
(branch `workflow/bundle-973-974-975`, uncommitted on `69264936`). Scope: the four `claim.js`
copies, `install-all.sh`, `scripts/test-install-all.js`, `scripts/test-forge-finalize-findings.js`,
`scripts/test-fixture-sandbox.js`, the `test-finalize-door.js` T9b repair, `docs/api.md`,
`CHANGELOG.md`, the 0017 watch-list row, `package.json` registration.

**Method:** no full suite was run (two reviewers concurrent; suites are spawn-bound). All probes
were targeted: the candidate's own `scripts/kaola-workflow-claim.js` driven end-to-end with
`finalize --project issue-914 --keep-worktree` (`KAOLA_WORKFLOW_OFFLINE=1`) against six purpose-built
fixture repos, plus direct git-stream and git-semantics measurements. Harness:
`…/scratchpad/rev975/harness.js`. I did not rely on the implementer's or test author's numbers for
any finding below; each is my own measurement or a direct code read named by file:line.

**Verdict up front:** the load-bearing invention — directory attribution from `git log --name-only
-z <base>..HEAD` — is correctly built, hand-ported byte-identically, catches the observed incident
(measured independently), fails open in both declared reads (measured), and handles hazard-named
paths end to end (measured). Half B closes every site the issue enumerated, with the right property
(non-cwd-resolving, not merely absolute), pinned by a live detector that is baseline-diff, not
prefix-limited. The defect that survived green suites is not inside the attribution rule — it is one
step past it: **the state this change deliberately manufactures (untracked, unattributed paths left
in the worktree) is exactly the state the sink's pre-existing dirty guard cannot see, and sink
Step 0 then destroys those paths — including, in the misattribution shape, the run's own
uncommitted work — silently, at exit 0.**

---

## Findings, most severe first

### F1 — defect (medium): the report's shelf life is one step — sink Step 0 silently destroys every
### untracked path the finding just promised was "still on disk"

- **Locations:** `scripts/kaola-workflow-claim.js:5321-5337` (the new classification, which leaves
  unattributed paths untracked in the worktree); `scripts/kaola-workflow-sink-merge.js:520`
  (`git status --porcelain --untracked-files=no` — the ONLY gate before removal, untracked-blind,
  documented as deliberate for lane dirs at `:481-482` per #579); `sink-merge.js:3182` /
  `:1685` (Step 0 `removeWorktree` → `git worktree remove --force`).
- **Concrete failing scenario.** An ordinary bundle run in the `--keep-worktree` lane: finalize
  classifies a worktree path unattributable (a foreign artifact, or — F3's shape — the run's own new
  file in a directory the branch never committed to). Finalize exits 0 with the typed finding, whose
  text states the paths "are still on disk" and says "Read them before the sink runs". The
  orchestrator proceeds to sink-merge, the settled next step of the determined procedure. Step 0's
  `assertWorktreeClean` probes with `--untracked-files=no`, sees nothing, and `git worktree remove
  --force` deletes the worktree — and every reported untracked path in it — silently. The sink
  proceeds at exit 0.
- **Evidence, both ends measured.**
  - Finalize end: scenarios S1/S2/S4/S5 below — the unattributed paths are left untracked in the
    worktree (`?? src/util/`, `?? plugins/plugins`, …) at exit 0.
  - Sink end (git semantics, micro-fixture): a linked worktree holding one untracked file;
    `git status --porcelain --untracked-files=no` → **0 lines** (the guard's exact form passes);
    `git worktree remove --force` → the file is **gone**. (`…/scratchpad/rev975/wtprobe`.)
  - Middle link read directly: `assertWorktreeClean` (`sink-merge.js:483`) is the only guard
    between the sink entry and the forced removal (`:511` — "this status probe is the ONLY gate
    before a destructive `git worktree remove --force`").
- **Why existing guards do not prevent it.** The guard's untracked-blindness is pre-existing and
  deliberate (#579: `--untracked-files=no` excludes untracked lane dirs). Before #975 it had nothing
  of the deliverable band to destroy — every untracked residue path was adopted into
  `chore: finalize`, so no untracked path survived finalize. The candidate manufactures, as its core
  mechanism, the first ordinary state in which untracked deliverable-band paths persist past
  finalize — and `CLAUDE.md`'s Nothing-refuses carve-out ("a sink over a tree carrying uncommitted
  work still fails loudly") is thereby false for exactly this state. Note the asymmetry proving the
  point: the FOREIGN_TRACKED shape (a tampered tracked file) IS seen by the guard and the sink
  refuses loudly for it; the two untracked shapes — including the observed 2026-08-12 artifact's own
  shape — are destroyed.
- **Consequences by shape.** Foreign artifact: destroyed instead of adopted — the durable finding
  survives (it lives in main's archive copy), the evidence does not, and the archived text "they are
  still on disk" becomes false the moment the sink runs. Misattributed own work (F3): the run's own
  uncommitted file is destroyed where pre-#975 it was committed and preserved — a data-loss
  regression path, gated only by the orchestrator acting on the finding between finalize and sink.
- **What would close it (orchestrator's choice, not mine):** make the sink's status probe see
  untracked non-lane paths (it already excepts lane dirs by ownedProjects); or have the sink consume
  `residue_unattributed` from the archived summary and refuse/carry accordingly; or amend the
  finding text and docs to state plainly that the artifact survives only until the sink. The suite
  cannot see this: part D ends at finalize (its `:691` "not deleted" pin is measured before any sink
  runs), and no test drives finalize-then-sink over an unattributed path.

### F2 — defect (low, user-visible docs): the CHANGELOG's bolded absolute is measurably false

- **Location:** `CHANGELOG.md` `[Unreleased]`, #975 first entry: "**The run's own work still stages
  exactly as before**, including files it created but never committed".
- **Failing scenario, measured (S1 below):** branch committed only `src/impl.js`; at finalize the
  run's own uncommitted `src/util/helper.js` sits in the new subdirectory `src/util/`. Pre-#975 it
  was staged into `chore: finalize`. At HEAD it is reported foreign (`residue_unattributed:
  ["src/util/"]`) and left out of the commit. The sentence is false for every own file in a
  directory the branch never committed to (new subdirectory, or repo root when no root file was
  committed). `docs/api.md:390` words the same claim correctly — "The run's own **untracked work
  beside a committed sibling** is therefore still staged" — the CHANGELOG dropped the qualifier
  that makes it true. One-line fix: add the qualifier. This is the recorded prose-absolutes defect
  class shipping again.

### F3 — risk: own work in a brand-new directory is misattributed foreign, and neither report
### discloses the shape

- **Location:** `scripts/kaola-workflow-claim.js:3703-3706` (`dirOfRepoPath` — immediate parent
  only) with `:3758-3760` (exact-directory membership).
- **Measured (S1):** own dirt `src/util/helper.js` beside committed `src/impl.js` → git collapses
  to `?? src/util/`, its directory `src/util` is not in `ownDirs` (`src` is), and the path is
  reported foreign and left uncommitted; the deliverable merges without it. Same for a new own file
  at the repo root when the branch committed no root file.
- **Why this is a risk, not a defect:** under the ruled evidence source (the branch's git history)
  no rule can attribute a file in a directory with no committed sibling, and the failure is loud
  (stderr WARNING, typed finding, durable section). It is inherent, not wrong. What earns the row:
  `impl-975.md` argues "calling the run's own work foreign leaves an ordinary run unfinished, which
  is worse" and then ships a rule doing exactly that for this shape without naming it — the
  "Not reached / stated plainly" list omits it, and `tests-975.md`'s "left unpinned" list omits it.
  Combined with F1 the consequence escalates from "unfinished, loudly" to "destroyed, silently".
  The orchestrator should know the shape exists before adjudicating F1.

### F4 — risk: in real runs the repository root is almost always an attributed directory, so
### root-level foreign files are adopted, not reported

- **Measured (S2):** branch commits `CHANGELOG.md` at the root (as essentially every real bundle
  does — finalize's own contract updates it) → `'' ∈ ownDirs` → foreign `stray-root.md` at the root
  was **staged and committed** into `chore: finalize`, exactly the pre-#975 adoption, while
  `plugins/plugins` beside it was correctly reported. This is the acknowledged "foreign artifact
  inside a directory the run DID touch" limitation — but its most common real-world instance is the
  repo root, which is also where `impl-975.md`'s rejected-alternative discussion says the Half-B
  escape class lands. A reader of that discussion would conclude root artifacts get reported; on any
  branch carrying a root commit they do not. Disclosure gap only; the rule behaves as designed.

### F5 — risk (out of the issue's enumerated scope): the relative-TMPDIR class survives at the
### production installers' own mktemp sites

- **Locations:** `install.sh:24` (`_TMPDIR="$(mktemp -d)"`), `:399`, `:427`, `:433`;
  `install-opencode.sh:305`, `:309`, `:600`; `install-kimi.sh:322` (`mktemp -t`).
- **Scenario:** a real `TMPDIR=. ./install-all.sh` (or `./install.sh`) run: install-all's own three
  sites now resolve to `/tmp` (`KW_TMPDIR`, `install-all.sh:49-53` — not exported, so children see
  the original TMPDIR), but the child installers' bare `mktemp` calls still resolve against the
  invoker's cwd — the checkout, when run from one. The sandbox suite cannot observe this: it drives
  `test-install-all.js`, whose fixtures use **stub** installers, so the real installers' mktemp
  sites are never exercised. The issue's own hazard table (premise-975 §2) scoped to the fixture
  code plus `install-all.sh`, so this is a residue of the class, not a miss in the fix; it is
  recorded here so nobody reads "the class is closed" off the CHANGELOG headline.

### F6 — nit: the 0017 watch-list row ships with line anchors this same diff already made stale

- **Location:** `docs/decisions/0017-the-mission-list.md:151` cites `install-all.sh:387-406` and
  `scripts/test-install-all.js:479-489`. In the candidate tree the walk sits at `install-all.sh:399`
  (function at `:395` — Half B added 12 lines above it) and `dirsEqual` at
  `test-install-all.js:495-505` (the `tmpBase` block added 20). The table's own neighbouring row
  records this exact hazard and prefers issue-anchored citation. Content of the row is otherwise
  accurate and shape-conformant (observation, measured refutation on two grounds, arming condition,
  honest residual). Trivial fix while uncommitted.

### F7 — nit: the fail-open read is envelope-only

- **Measured (S3):** `base_branch: no-such-branch` → everything staged as before (correct fail-open,
  the symlink adopted), `residue_attribution: "unattributable_unknown"` on the envelope — but no
  stderr line and no typed finding. A misconfigured base silently restores full adoption unless the
  consumer reads that one field. Documented honestly in `docs/api.md:391`, so this is a judgement
  call, not an omission; noted because the sibling states all warn on stderr. Also cosmetic
  asymmetry beside it: the stderr WARNING prints the full unattributed list while the tx field and
  durable section cap at 50 (`claim.js:5326-5336`).

---

## The measurements

All under `/private/tmp/claude-501/...-0ea58e86.../scratchpad/rev975/`; every fixture destroyed
after its run; nothing was written to either live tree except this file.

**Stream shape** (`probe-logz.js`, 5-commit fixture incl. hazard names and a rename):
`git log --name-only --pretty=format: -z <base>..HEAD` emits pathnames verbatim, NUL-terminated,
with an empty record between commits, which `splitNulPaths` drops — the pre-existing comment's claim
is TRUE (verified, not trusted): `"deep/sub/n.js\0\0src/impl.js\0\0CHANGELOG.md\0src/three.js\0"`;
hazard names (`new\nline.md`, `qu"ote.md`, `back\slash.md`, `nöte.md`) all arrive literal; a rename
lists the destination path.

**End-to-end finalize scenarios** (`harness.js`, real candidate `claim.js`, real
`finalize --keep-worktree`, offline):

| # | fixture | result |
|---|---|---|
| S1 | own dirt `src/util/helper.js` in a NEW subdir beside committed `src/impl.js` | exit 0; `residue_unattributed: ["src/util/"]`; `chore: finalize` carries `src/impl.js` only; `?? src/util/` left → F2/F3 |
| S2 | incident shape: branch commits `plugins/kaola-workflow-gitea/scripts/…` + root `CHANGELOG.md`; foreign `plugins/plugins` symlink + foreign `stray-root.md` | exit 0; `plugins/plugins` reported, NOT in index; `stray-root.md` ADOPTED into the commit → shipped rule catches the incident (independently confirmed); root adoption → F4 |
| S3 | `base_branch: no-such-branch` | exit 0; `residue_attribution: unattributable_unknown`; everything staged incl. the symlink; tree clean — fail-OPEN confirmed → F7 |
| S4 | foreign `new\nline.md`, `qu"ote.md` at root | exit 0; both reported verbatim on the envelope, both left on disk, own dirt staged — the `-z` reasoning holds end to end |
| S5 | foreign wholly-untracked `foreigndir/` | exit 0; reported as `foreigndir/`, left on disk |
| S6 | ONLY foreign dirt, no own dirt | exit 0; `residue_stage: "nothing_attributable"`; `chore: archive` still carries the run record; no `chore: finalize` commit; artifact left |

**Sink interaction** (`wtprobe`): worktree with one untracked file; the guard's exact probe form
(`status --porcelain --untracked-files=no`) → 0 lines; `git worktree remove --force` → file
destroyed → F1.

---

## Checked and found sound

- **The attribution mechanism itself.** `unattributableResidue` (`claim.js:3708-3761`): candidates
  correctly restricted to non-`kaola-workflow/` residue (run bookkeeping always stages);
  `isSafeBranchArg` reject → fail-open; git throw → fail-open; empty history → fail-open (near
  unreachable in this lane — the `chore: archive` commit precedes classification, measured S6);
  `maxBuffer` 64MB overflow → catch → fail-open. History (`base..HEAD`) not net diff — reverted work
  still attributed, matching `probeImplementationCommit`'s established two-source reasoning. Merge
  commits list no files under plain `log` (narrowing-only; no shape found where that misattributes).
  Rebase/advanced-main: `base..HEAD` still yields exactly the branch's own commits.
- **The transaction restructure.** `stageable` derivation; `nothing_attributable` only when residue
  existed and nothing was stageable; `residue_stage` stays `skipped` on empty residue and
  `unprobeable` on a failed probe (classification returns early on empty candidates, no override);
  the `git add` catch now reports over `stageable` consistently. No new throw path escapes the
  block. Exit 0 in every scenario including hazard names.
- **Lane confinement.** The classification sits inside `if (args.keepWorktree)` (opened
  `claim.js:5109`); the in-place lane (`:4807`) and `finalize --check` / `checks.dirty_paths`
  (`:4207-4224` band) are untouched, per the diff's three hunks — and leaving them is defensible:
  `--check` still names the paths, and in-place dirt belongs to the orchestrator by existing design.
- **Four copies.** Root and codex plugin copies byte-identical (`cmp` clean). Gitlab/gitea:
  `dirOfRepoPath` + `unattributableResidue` **byte-identical** to root; the call-site block
  code-identical (one comment line condensed, code identical line-for-line); each port diff is
  exactly the three #975 hunks.
- **docs/api.md.** The findings row now lists 9 types matching the canonical constructor census
  exactly (I enumerated `recordFinalizeFinding` types per edition: canonical/codex 9, gitlab/gitea
  8, delta exactly `archive_unstage_failed`); the count sentence seven→eight / eight→nine is
  **correct, not merely incremented**. New `residue_unattributed` / `residue_attribution` rows are
  accurate (the former carries the qualifier the CHANGELOG lost); `residue_stage` row's
  `nothing_attributable` matches measured S6.
- **Half B.** All five enumerated sites moved: Node `tmpBase()` (`test-install-all.js:79-82`, used
  at `:154`, `:192`, `:1115`) rejects any non-absolute `os.tmpdir()` to `/tmp` — the right property
  (not absolutising, which both reports proved insufficient); shell `KW_TMPDIR`
  (`install-all.sh:49-53`) — case-analysis clean over `TMPDIR=.`, `sub/dir`, empty, unset, absolute;
  `:245`, `:315`, `:351` all use it, the latter two now carrying watchable prefixes. No bare
  `mktemp`/`os.tmpdir()`-join remains in either file. Not re-run dynamically by me (spawn-bound;
  both prior agents measured the mutations independently, and the sandbox suite ran green inside the
  lead's serial chain).
- **test-fixture-sandbox.js.** The primary detector is a baseline diff on a COPIED checkout — any
  new name fails, not just known prefixes (the prefix filter applies only to the real-checkout
  breach watcher, correctly, so third-party files cannot red it); planted control entry proves the
  detector reads the right directory; MIN_TICKS guards a vacuous window; hard bound distinguished
  from bail; the suite's own root is created via `realpathSync(mkdtempSync(os.tmpdir()))` and its
  repoBefore snapshot is read BEFORE the sandbox exists, so the suite cannot silently become its own
  instance. Registered in both tiers, appended after the suite it drives.
- **test-forge-finalize-findings.js part D.** Assertions match the tests report; both directions
  pinned (foreign out + named, own in); `lstat` used where `existsSync` lies (ELOOP); anti-vacuity
  reads the fixture out of git pre-run; durable section read from main's archive copy. The suite
  cannot separate the shipped directory rule from top-segment (its branch touches only `src/` and
  `kaola-workflow/`) — disclosed by the implementer, and I closed that gap independently: S2 drives
  the real incident directory shape against the shipped code and it is caught.
- **The T9b repair** (`test-finalize-door.js:1687-1722`, with `tests-t9b.md`): proper custody (test
  author, own report), and the structural walk is equivalent-or-tighter than the stringify form
  (removes the JSON-escaping blindness AND the cross-seam false match; keeps substring and key
  semantics). Not a pin weakened to chase machinery — the assertion text and acceptance are
  unchanged; only the observation was made able to see the outcome it already declared acceptable.
- **CHANGELOG #975 second entry (Half B)** — accurate, including the honest "absolutising after the
  fact does not fix this".
- **Cleanliness, verified at the end of this review:** main checkout `status --short
  --untracked-files=all` shows only `kaola-workflow/bundle-973-974-975/` run records; worktree shows
  the 35 expected bundle paths; `ls -la …/plugins/` → exactly 3 directories, no symlink, in both
  trees; `find -type l` → nothing outside the pre-existing gitignored `.opencode` npm shims; no
  `rev975-*`/`kw914-*`/`kaola-install-all-*` residue in `/private/tmp` or `$TMPDIR`.

---

finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=implementer rationale=untracked paths the residue_unattributed finding reports are destroyed silently by sink step-0 git worktree remove --force because assertWorktreeClean probes with --untracked-files=no; candidate manufactures the first state that reaches this pre-existing blindness, incl. misattributed own work
finding: id=R2 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=CHANGELOG absolute "run's own work still stages exactly as before, including files it created but never committed" refuted by measurement S1; docs/api.md carries the correct qualifier
finding: id=R3 scope=user_decision action=none status=open severity=low fix_role=orchestrator rationale=own work in a brand-new directory reported foreign and left out of the merge — inherent to ruled evidence source but undisclosed by both reports and it feeds R1
finding: id=R4 scope=user_decision action=none status=open severity=low fix_role=orchestrator rationale=root-level foreign files adopted whenever the branch commits any root file which real bundles nearly always do — acknowledged limitation, commonest instance undisclosed
finding: id=R5 scope=out_of_scope action=none status=open severity=low fix_role=orchestrator rationale=relative-TMPDIR class survives at install.sh:24,399,427,433 install-opencode.sh:305,309,600 install-kimi.sh:322 — outside the issue's enumerated sites and invisible to the stub-driven sandbox suite
finding: id=R6 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=0017 watch-list row cites install-all.sh:387-406 and test-install-all.js:479-489 which this same diff shifted to :395+ and :495+
finding: id=R7 scope=in_scope action=none status=open severity=low fix_role=orchestrator rationale=unattributable_unknown fail-open is envelope-field-only with no stderr or typed finding — documented in docs/api.md so a judgement call, recorded for visibility

verdict: fail
findings_blocking: 2
review_conclusion: the attribution mechanism, its four ports, both fail-open reads, hazard-path handling and the whole of Half B measure sound, and the incident shape is independently confirmed caught; the surviving defect is downstream — sink step-0's untracked-blind guard force-removes the very paths the new finding reports as still on disk, including misattributed own work in a new directory, and the CHANGELOG ships a measurably false absolute about own-work staging.

# Adversarial review — issue #974 implementation (retry)

**Candidate**: worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975`,
branch `workflow/bundle-973-974-975`, uncommitted diff over `69264936`.
**Scope**: `resolveRunRoot` (gap-sweep) + `resolveRecordFolder` (validation-runner) claim-signature
tie-break, plus 6 regenerated edition ports.
**Method**: every claim below is a measurement against the real shipped code — fixed arm = the
worktree's own `scripts/`, HEAD arm = a full `git archive 69264936 scripts` mirror in the session
scratchpad. Harnesses kept and re-runnable: `…/scratchpad/{tt974.js, r2-974.js, edges974.js}`.
No repository file was edited; all fixtures under `os.tmpdir()`, removed in-run. No test suite was run.

## Verdict up front

**No blocking defect found.** I went in assuming one was here and drove every cell, every edge the
brief named, and both halves of the acceptance surface against the real binaries; the one behavioural
change is exactly the intended cell, in both resolvers, and Result 2 reproduces independently. Two
non-blocking items below (one nit on a comment absolute, one pre-existing residual the fix does not
claim to close).

## Findings

### NIT (non-blocking, candidate-caused): the comment's "nothing else writes that file" is not literally true

Both new comment blocks — `scripts/kaola-workflow-gap-sweep.js:479-481` and
`scripts/kaola-workflow-validation-runner.js:1298-1300` (and their 6 port copies) — state: *"The claim
transaction writes workflow-state.md into the folder it creates and nothing else writes that file."*
Measured writers of that file besides the claim transaction:

- the **finalize mirror** creates the worktree copy: `scripts/kaola-workflow-claim.js:3466` skips a
  `FINALIZE_MIRROR_DEST_OWNED` entry only when the destination already has it, so when the worktree
  lacks `workflow-state.md` the mirror **writes it** (`:3479`) — this is precisely how the post-mirror
  both-trees topology that the same comment block later describes comes to exist;
- `scripts/kaola-workflow-sink-pr.js:160-170` rewrites the live state file;
- `scripts/kaola-workflow-claim.js:2405` (`appendClosureBlock`) appends to the archived copy.

**Why it stays a nit and not a defect**: every other writer writes into the run's *real* record (or
its mirror/archive copy), never into a stray — so the inference the sentence exists to support
("presence separates the run's own folder from a directory that merely shares its name") survives
every producer I could find, and the same comment block acknowledges the both-trees window two
sentences later. Behavior is unaffected. Fix is a one-clause rewording (e.g. "nothing else *creates*
one outside the run's own record") + regenerate the 6 ports.

### RISK (non-blocking, pre-existing, unchanged by this fix): a leftover that is itself claim-shaped still wins silently

Measured (`r2-974.js` topology 3): a *stale claimed* folder in the invoking tree
(`workflow-state.md` present — e.g. post-finalize mirror residue in a worktree that outlived its run,
same project name re-claimed in main) still captures both resolvers and the chain receipt lands in it,
with no report. This is byte-identical on disk to the legitimate post-mirror window (the fixture
constructs both from the same bytes), so **no disk-level predicate can split them** — any repair needs
evidence the disk does not carry today. HEAD behaves identically (cwd-first), the issue's stated
population (pre-fix scanner strays, hand-made empty dirs — both structurally unable to carry
`workflow-state.md`) excludes it, and reaching it requires a surviving dead worktree plus a same-name
re-claim. Reported so the orchestrator sees the boundary, not as a demand on this change.

## 1. Truth table — MEASURED, real exported code, both arms (`tt974.js`)

Real `git worktree` pair. gap-sweep root observed via the `--check` "artifact not found at <path>"
stderr (a pure read — nothing written); validation-runner via the exported
`resolveRecordFolder(wt, P, schema)`. Cells: invoking tree C × main M; A = absent,
P = present-unclaimed, S = present-claimed (`workflow-state.md`).

| cell (invoked from WT) | gap-sweep HEAD | gap-sweep FIXED | resolveRecordFolder HEAD | FIXED |
|---|---|---|---|---|
| C=A M=A | WT | WT | `dir: null` | `dir: null` |
| C=A M=P | MAIN | MAIN | MAIN mainResident | MAIN mainResident |
| C=A M=S | MAIN | MAIN | MAIN mainResident | MAIN mainResident |
| C=P M=A | WT | WT | WT | WT |
| C=P M=P | WT | WT | WT | WT |
| **C=P M=S** | **WT** | **MAIN** | **WT** | **MAIN mainResident** |
| C=S M=A | WT | WT | WT | WT |
| C=S M=P | WT | WT | WT | WT |
| C=S M=S (post-mirror) | WT | WT | WT | WT |
| C=P M=S + `KAOLA_GAP_ROOT` | GAPROOT | GAPROOT | — | — |
| C=S M=S + `KAOLA_GAP_ROOT` | GAPROOT | GAPROOT | — | — |
| no git repo at all, C=P | cwd | cwd | cwd | cwd |
| no git repo at all, C=S | cwd | cwd | cwd | cwd |
| invoked from MAIN, main=P wt=S | MAIN | MAIN | MAIN | MAIN |
| invoked from MAIN, main=S | MAIN | MAIN | MAIN | MAIN |

**Exactly one cell differs — C=P M=S — and it moves to MAIN in both resolvers: the intended fix.**
The two resolvers agree in every cell. `KAOLA_GAP_ROOT` tier-1 intact facing a leftover and facing a
claimed folder (T26e's 127-assertion dependency). The `resolveMainRoot`-unresolvable arm (no repo →
catch) is unchanged. Neither resolver ever reaches sideways from main into a worktree. The
implementer's own 6-row table in `impl-974.md` is correct and mine subsumes it.

## 2. Result 2 — receipt placement, re-measured independently (`r2-974.js`)

Real `run-chains.js --chains claude --project P` (fixture package.json declares a trivial
`test:kaola-workflow:claude`), cwd = worktree, main holds the claim-created record, worktree holds a
**bare empty leftover directory**:

| arm | exit | receipt in main | receipt in wt leftover |
|---|---|---|---|
| HEAD (full `git archive` mirror) | 0 | **no** | **yes — the leftover** |
| FIXED (worktree scripts) | 0 | **yes — the real record** | no |

The FIXED arm leaves the leftover **empty** afterward (`wtTreeAfter: []`) — the telemetry sidecar
followed the resolver too; run-chains creates nothing in the polluted tree. Edges:

- **BOTH trees claimed** (post-mirror): receipt lands in the worktree — the tree T26d says is the one
  to read. Correct, unchanged from HEAD.
- **Leftover itself claimed**: receipt lands in the worktree copy — the RISK item above; identical to
  HEAD.
- **`resolveMainRoot` unreachable** (no repo): truth-table rows show both arms fall back to cwd
  unchanged; `resolveProjectRecordDir` additionally catches any resolver throw and falls back to the
  invoking tree (`run-chains.js:823-829`), and the new code adds no throwing operation (`existsSync`
  never throws; both `resolveMainRoot` calls were already inside try/catch).

## 3. The signature premise — `workflow-state.md` writers, exhaustively grepped

`git grep -P "workflow-state\.md"` over `scripts/`, `plugins/`, `templates/`, `commands/`: producers
into a **live run folder** are the claim transaction (`claim.js:781,786` — including the `:1496`
EEXIST arm, which *adopts* an unclaimed leftover and then writes the state file into it, converting
it into the real record: premise-reinforcing), the finalize mirror (`:3466/:3479`, copies main→wt),
and `sink-pr.js:160` (rewrites the existing file in place). Archive-band writers
(`appendClosureBlock`, archive copies) sit under `kaola-workflow/archive/<p>/` — a path the resolvers
never consult. Command/SKILL surfaces only read it. **No producer writes `workflow-state.md` into a
folder that is not the run's own record**, so the tie-break's premise holds even though the comment's
absolute does not (NIT above). Degenerate shapes measured in §4.

## 4. Predicate symmetry between the two resolvers (`edges974.js`)

`resolveRunRoot` reads the folder with bare `existsSync`; `resolveRecordFolder` with
`statSync`+`isDirectory()` — the brief flagged this as #971-in-slow-motion. Measured, fixed arm, main
always claimed, invoking-tree shape varied:

| invoking-tree shape | gap-sweep | resolveRecordFolder | agree? |
|---|---|---|---|
| symlink → claimed dir (target outside both trees) | WT | WT | yes |
| symlink → unclaimed dir | MAIN | MAIN | yes |
| dangling symlink | MAIN | MAIN | yes |
| plain FILE named as the folder | MAIN | MAIN | yes |
| dir + EMPTY `workflow-state.md` | WT | WT | yes |
| dir + `workflow-state.md` is a DIRECTORY | WT | WT | yes |
| claimed dir `chmod 000` | MAIN | MAIN | yes |
| unclaimed dir `chmod 000` | MAIN | MAIN | yes |

**The two resolvers agree on every shape** — the `claimed` predicate is `existsSync` in both, so the
tie-break itself cannot drift; the pre-existing `holds`/`liveDir` asymmetry surfaces only in the
plain-FILE row, where the *fix* is what makes them converge (gap-sweep: holds=true but claimed=false →
falls through to claimed main; HEAD returned WT there and the scan then died ENOTDIR). Two shapes
worth knowing, neither admitted as a defect: an **empty** `workflow-state.md` counts as claimed here
while `readActiveFolders` skips a torn state file (two readers, two notions — but no producer of an
empty state file exists, claim writes atomically, and `claim.js:6033`'s own stance for
present-but-unprobeable is KEEP, which this matches); and a **chmod-000 claimed** folder now loses to
claimed main (HEAD kept it) — a permission-broken tree neither arm can actually read, and in the only
real topology with both claimed (post-mirror) main holds the paired record, so the answer is usable.

## 5. The post-mirror window — order of checks

`if (holds(cwd) && claimed(cwd)) return cwd;` is the first tree test in the function
(`gap-sweep.js:493`, mirror logic at `validation-runner.js:1312`), before `resolveMainRoot` is even
called — so the both-trees case returns the invoking tree structurally, not by tie-break luck, and no
git spawn happens on that path (the common-path cost claim in `impl-974.md` is accurate). Cell
C=S M=S measured WT in both resolvers; T26d additionally pins scan-source, artifact placement in the
worktree's own `.cache`, and the `gaps_unswept` refusal (`test-gap-sweep.js:1462-1503`) — the verdict
is right for the right reason, not right-by-coincidence.

## 6. The six regenerated edition ports

- `scripts/kaola-workflow-gap-sweep.js` ≡ `plugins/kaola-workflow/scripts/…` — **byte-identical**
  (sha256 `4f844bcc…` both).
- `kaola-workflow-validation-runner.js` — **all four copies byte-identical** (sha256 `f3b5d030…` ×4).
- gitlab/gitea gap-sweep ports are generated (distinct hashes as designed) and **carry the tie-break**
  (`if (holds(cwd) && claimed(cwd)) return cwd;` at `:494` in both; 4 `claimed` occurrences each).
- `scripts/kaola-workflow-adaptive-schema.js` — **zero diff against `69264936`** and all four edition
  copies byte-identical (sha256 `0ac70c1d…` ×4). The cross-edition drift anchor is untouched.

## 7. What the fix does NOT do — is the restraint honest?

Measured end-to-end in the leftover cell (fixed arm, bare leftover in wt, claimed main with a real
manual gap):

1. `--check` before any scan → `{"result":"refuse","reason":"artifact_missing"}` exit 1 — actionable,
   not a pass.
2. scan from the polluted worktree → sweeps **MAIN's** `.cache`, artifact lands in main, the real
   `manual:flaky-suite` class is in it.
3. `--check` → `{"result":"refuse","reason":"gaps_unswept","unmapped":[…flaky-suite…]}` exit 1 —
   names the class.
4. The leftover directory is untouched and still empty.

So in every reachable **unclaimed**-leftover topology the output stops being a bare vacuous pass — the
first branch of the acceptance surface holds, and the missing report is genuine restraint: there is no
cell where an unclaimed leftover yields a silent wrong-tree answer. The one silent case that remains
is the claim-shaped leftover (RISK above), which is outside the issue's population, unchanged from
HEAD, and indistinguishable on disk. `otherProjectRoots` staying unexported is consistent with that:
no admitted failure demands it. The `record` verb even improves incidentally — in the leftover cell it
now writes to main with the shipped `mainResident` operator hint (`validation-runner.js:1560-1566`)
naming both trees, where HEAD wrote into the leftover silently.

Also verified: relative `--output`/`--summary` resolve against the retargeted root by design
(`gap-sweep.js:569-575` — scanner and gate stay on one tree, which is the invariant the comment above
`main()` demands); an absolute `--output` into the leftover's `.cache` now refuses
`foreign_run_gaps_output` (the scope guard follows the root — protective, correct); `searched` is
consumed only in the `dir: null` hint (`validation-runner.js:1520`), whose contents in null cases are
identical to HEAD's; the `?? scripts/test-fixture-sandbox.js` and the claim.js/finalize hunks in this
worktree belong to #973/#975, and the claim.js hunks (`:3700`, `:5248`, `:5263`) touch no
`workflow-state.md` production semantics; CHANGELOG.md in this worktree now carries a #974 entry
(the implementer's "no CHANGELOG entry" gap has since been closed by the docs lane).

## Checked and found sound

1. Full 9-cell topology truth table × both resolvers × both arms — one changed cell, the intended one.
2. `KAOLA_GAP_ROOT` tier-1 precedence with a leftover and with a claimed folder present.
3. Receipt placement (Result 2) re-measured independently through the real `run-chains` — HEAD lands
   in the leftover, FIXED in the real record; no side-effect writes into the polluted tree.
4. Post-mirror both-claimed window: worktree wins in both resolvers, receipt and artifact land there.
5. `resolveMainRoot` unresolvable (no repo): unchanged fallback to cwd, both arms; no new throw paths.
6. Signature-writer census across scripts/plugins/templates/commands: no producer outside the run's
   own record; the EEXIST claim arm converts adopted leftovers into real records.
7. Predicate symmetry across 8 degenerate shapes (symlinks, dangling, file, empty/dir-shaped
   state file, chmod 000): resolvers agree on all.
8. Edition surface: canonical/codex byte-twins, ×4 validation-runner identity, generated forge ports
   carrying the tie-break, adaptive-schema byte-untouched ×4.
9. Acceptance first branch (no bare vacuous pass over an unclaimed leftover) in every reachable cell,
   including the pre-scan `artifact_missing` recovery loop that re-manufactured the stray at HEAD.
10. Cleanliness after this review: main tree — only this run's own claim-created
    `kaola-workflow/bundle-973-974-975/` (plus this bundle's report files); worktree — only roadmap
    staging (`M kaola-workflow/ROADMAP.md`, `?? .roadmap/issue-97{3,4,5}.md`); no stray
    `kaola-workflow/<project>/` anywhere; all `kw974-*` tmpdir fixtures removed (glob returns
    nothing).

finding: id=R1 scope=in_scope action=fix status=non_blocking severity=nit fix_role=implementer rationale=comment-absolute-nothing-else-writes-workflow-state-is-false-finalize-mirror-and-sink-pr-also-write-it-premise-itself-survives
finding: id=R2 scope=pre_existing action=note status=non_blocking severity=low fix_role=none rationale=claim-shaped-stale-leftover-still-wins-silently-disk-indistinguishable-from-post-mirror-window-unchanged-from-head-outside-issue-population
verdict: pass
findings_blocking: 0
review_conclusion: Measured cell by cell against the real binaries, the #974 tie-break changes exactly the one intended topology in both co-derived resolvers, lands the chain receipt in the real record where HEAD landed it in the leftover, keeps every control cell and KAOLA_GAP_ROOT precedence intact, and ships in parity across all six edition ports; no blocking defect was found, with one comment-wording nit and one pre-existing claim-shaped-leftover residual recorded as non-blocking.

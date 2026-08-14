# review-sink.md — adversarial review of the #973 sink data-loss guard (family A)

STATUS: COMPLETE

Reviewer: review-sink (Fable). Read-only on both trees; this file is my only write.
Candidate: uncommitted diff in `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975`
— `scripts/kaola-workflow-sink-merge.js:499-585` (`worktreeDirtRecords` + the `assertWorktreeClean`
probe) plus the codex/gitlab/gitea ports. All measurements below drove the real exported kernel
functions, the real shipped function text, or the real sink CLI; every fixture lived under
`os.tmpdir()` with the realpath asserted before anything destructive spawned. Probes:
`<scratchpad>/rvsink9731/probe-{a,e2e,broad}.js`.

**Bottom line: the guard is sound.** Both directions reproduced under my own hand end-to-end
against the real CLI (destroys on revert; refuses and preserves as shipped; completes over
lane-only content; refuses over the #975 symlink shape). One low-severity candidate-caused defect
(a comment the diff falsified and left standing), three residual risks that pre-exist the change,
one nit. No high-severity finding.

## Findings (most severe first)

### DEFECT (low) — the #579 comment above `assertWorktreeClean` was falsified by this diff and left standing

- Location: `scripts/kaola-workflow-sink-merge.js:517-518` (same bytes in the codex copy;
  gitlab/gitea dropped the param and don't carry the sentence).
- The comment: "#579: ownedProjects param added — passed through to the inner status check;
  ignored for the list probe since --untracked-files=no excludes all untracked lane dirs."
- At HEAD its flag clause was TRUE (the probe did pass `--untracked-files=no`; verified via
  `git show HEAD`). The candidate changed that probe to `-uall` at `:558` and did not touch the
  sentence, so the code now carries, four lines above the new machinery, a measured claim about the
  exact flag under review that is the opposite of shipped reality — in a repo whose last bundle
  admitted precisely this defect class. Compounding it: callers still pass `[project]`
  (`:1731`, `:3210`) into a parameter the body never reads, while the filter's whole subtlety is
  that the worktree call must use `[]`; a reader trusting the comment ("passed through") would
  conclude the own project is exempt from the untracked filter's refusal — backwards on both
  halves. ("Passed through" was already false at HEAD — that half pre-exists — but the flag clause
  is candidate-caused staleness.)
- Fix shape: one-line comment repair (or delete the sentence; the accurate account already lives in
  `worktreeDirtRecords`' #973 note). No behavior change involved.

### RISK-1 (residual, pre-existing destruction; unproven as ever-occurring) — a plain file whose NAME contains backslashes classifies as lane and is silently destroyed

- Location: `scripts/kaola-workflow-adaptive-schema.js:418` (`isParkedLanePath`'s
  `replace(/\\/g, '/')`) as newly applied by `scripts/kaola-workflow-sink-merge.js:504-506`.
- Measured, real git output: an untracked regular file at the worktree root literally named
  `kaola-workflow\proj\x.md` (backslashes are legal name bytes on macOS/Linux) is reported as
  `?? "kaola-workflow\\proj\\x.md"`, decodes correctly to its literal name, then the predicate's
  Windows-separator normalization rewrites `\`→`/` and classifies it `kaola-workflow/proj/x.md` →
  EXEMPT → destroyed with no refusal. Same for `.kw\worktrees\x`. Git porcelain emits `/` as the
  separator on every platform, so at this call site the normalization only ever converts literal
  name bytes — pure harm here.
- Why not a defect of this candidate: the pre-change code destroyed the same file (the probe saw
  nothing untracked at all), so the change strictly shrinks the destruction set; the trigger name
  is exotic and no occurrence is on record. It bounds the CLAUDE.md sentence (verdict below).

### RISK-2 (residual, pre-existing destruction) — an embedded git repo under a lane prefix is ONE collapsed exempt record; everything inside it is destroyed

- Location: `scripts/kaola-workflow-sink-merge.js:504-506` + `adaptive-schema.js:414-431`.
- Measured: `.kw/worktrees/nested/` that is itself a git repo (the shape a run started FROM the
  worktree would create) holding uncommitted `work.js` is reported by `-uall` as the single record
  `?? .kw/worktrees/nested/` — the "one record per file, classifies unambiguously" rationale in the
  new comment (`:481-483`) has exactly this exception — and classifies exempt by its directory
  segment without seeing inside. Control: the same embedded repo outside a lane prefix
  (`?? embedded-outside/`) is KEPT and refuses.
- A nested run's uncommitted implementation work is the realistic content of that shape. Judged
  within the declared boundary (`.kw/worktrees/` is the project's own `PARKED_LANE_PREFIXES` entry,
  adaptive-schema.js:301) and pre-existing; recorded so the boundary's cost is visible.

### RISK-3 (the unpinned corner, judged defensible) — `kaola-workflow/<other-project>/**` in the worktree: exempt, never staged, destroyed

- The `[]` filter exempts EVERY project segment. The `--sink` merge step's rescue staging
  (sink-merge.js:2138-2168) copies only `<wt>/kaola-workflow/<args.project>/`, wrapped in
  best-effort `try/catch(_){}` (a failed `mkdtempSync` still proceeds to removal); the legacy route
  stages nothing (claim.js `removeWorktree` rescues only `kaola-workflow/archive/<project>/`). So a
  different project's lane content — or on the LEGACY route even the run's own `.cache/` journal
  (measured: leg2 destroyed it while completing) — is exempt and destroyed.
- Judgment the brief asked for: defensible. It is the same boundary the main-root check draws, the
  worktree lane copy is documented as throwaway, and the pre-change code destroyed the identical
  bytes. The change's whole delta is that NON-lane work now survives.

### NIT — bare files directly under `.kw/worktrees/` / `.kw/legs/` are exempt, unlike under `kaola-workflow/`

`isParkedLanePath`'s bare-file strictness (`adaptive-schema.js:426-427`) applies only to the
`kaola-workflow/` prefix, so `.kw/worktrees/notes.txt` → true (exempt/destroyed) while
`kaola-workflow/stray.md` → false (refuses). Pre-existing predicate semantics, now load-bearing at
a destruction gate. No realistic producer of that shape found; recorded for completeness.

## Verdict on the CLAUDE.md sentence

"an operation that would destroy something still fails loudly … a sink over a tree carrying
uncommitted work" — **now TRUE for the population the sentence means**: uncommitted tracked work
(pre-existing #912/#562 behavior, untouched — only `??` records enter the new filter), untracked
files, and untracked symlinks, on both entry points, refusing with the worktree intact and the
paths named (my legs 1 and 4, plus the suite's 24-red→green across all four editions). The
remaining silent-destruction shapes are: declared lane scratch (by design, the boundary the project
itself wrote), ignored content (invisible to every `--untracked-files` setting — measured across
all three ignore mechanisms), and the two exotic residuals above (RISK-1/RISK-2), both of which
the pre-change code destroyed equally. I judge the sentence honest as the repo means it; RISK-1/2
are the price of the lane boundary being a *path* classifier over a *status* stream.

## Evidence

### End-to-end, real sink CLI (legacy entry, archived posture that reaches the destructive step) — probe-e2e.js / probe-broad.js

| leg | sink binary | worktree carries | exit | envelope | worktree after | planted work | operator told |
|---|---|---|---|---|---|---|---|
| 1 | SHIPPED (candidate) | genuine untracked `src/util/helper.js` | 1 | none (legacy throw terminal) | **present** | **SURVIVED** | stderr `Uncommitted:\n  ?? src/util/helper.js` |
| 2 | SHIPPED | lane-only `kaola-workflow/<proj>/.cache/n1-impl.md` | 0 | `merged` | removed | destroyed (lane, expected) | n/a — ordinary run COMPLETES |
| 3 | HEAD mirror (verified: old probe present, no `worktreeDirtRecords`) | genuine untracked file | 0 | `merged` | removed | **DESTROYED, silently** | told nothing |
| 4 | SHIPPED | only an untracked self-referential symlink | 1 | none | **present** | **SURVIVED (lstat)** | stderr names it |
| broad | candidate with lane filter disabled (`if (false && …)`, mutation asserted applied) | lane-only `.cache/` journal | 1 | — | present | — | REFUSED over the shape every run carries |

Leg 3 is the revert direction (destruction reproduces); leg broad is the over-broad direction (an
ordinary run refuses) — both reds reproduced with my own fixtures, not inherited numbers. Legs 1/2/4
are the shipped code doing exactly what the repair claims.

### isParkedLanePath(rel, []) truth table (real exported function; true = EXEMPT = destroyed)

| rel | result | note |
|---|---|---|
| `kaola-workflow/issue-99/.cache/x` | true | intended exemption (crash-resume journal) |
| `kaola-workflow/issue-99/file.md` | true | any file under any project segment |
| `kaola-workflow/bundle-973-974-975/review-sink.md` | true | worktree copies of run records are exempt (RISK-3) |
| `kaola-workflow/` · `kaola-workflow` | false | kept; `-uall` never emits the collapsed form anyway |
| `kaola-workflow/ROADMAP.md` · `kaola-workflow/config.json` | false | durable root files refuse |
| `kaola-workflow/.roadmap/issue-1.md` | false | dot-segment refuses — the worktree's three untracked roadmap sources will refuse this bundle's own sink until committed (correct direction) |
| `kaola-workflow/archive/proj/x.md` | false | archive refuses |
| `kaola-workflow/proj` (bare child, incl. symlink `linkdirect`) | false | refuses |
| `kaola-workflow-notes.md` | false | prefix near-miss refuses |
| `Kaola-Workflow/proj/x` | false | case-sensitive; over-refuses on case-insensitive FS — safe direction |
| `kaola-workflow/../secret.txt` | false | `..` as segment kept |
| `kaola-workflow/proj/../../../etc/x` | true | `..` deeper IS exempt — but git porcelain never emits `..`; unreachable from this probe |
| `/abs/…` | false | git never emits absolute paths |
| `.kw/worktrees/some-branch/src/util/helper.js` | true | nested-worktree content exempt (RISK-2) |
| `.kw/worktrees/notes.txt` | true | bare-file asymmetry (NIT) |
| `.kw/legs/leg1/x` true · `.kw/other/x` false | | prefix list exact |
| `kaola-workflow\proj\file.md` · `.kw\worktrees\x` | true | **RISK-1** |
| `kaola-workflow//x` | false | empty segment kept |
| `kaola-workflow/proj/` · `.kw/worktrees/nested/` | true | embedded-repo collapsed record (RISK-2) |

### Porcelain `??` decoding table (real `git status --porcelain -uall`; shipped `worktreeDirtRecords` text extracted verbatim and bound to the real kernel helpers; every decoded path lstat-verified on disk — 18/18 exact)

| on-disk name | raw record | verdict |
|---|---|---|
| `spa ce.txt` | `?? "spa ce.txt"` | KEPT |
| `qu"ote.txt` | `?? "qu\"ote.txt"` | KEPT |
| `back\slash.txt` | `?? "back\\slash.txt"` | KEPT |
| `new`+LF+`line.txt` | `?? "new\nline.txt"` — ONE record; quoting keeps a newline-bearing name on one line, so the `split('\n')` is safe | KEPT |
| `tail ` (trailing space) | `?? "tail "` — outer `.trim()` cannot reach inside quotes | KEPT |
| `nötes.md` | `?? "n\303\266tes.md"` (octal UTF-8 decoded byte-wise) | KEPT |
| `wei rd"dir\x/inner {one,two}.txt` | TWO records — `-uall` does NOT collapse a quoted-name directory | KEPT ×2 |
| `kaola-workflow/pröj/file one.md` | quoted, decodes exactly | EXEMPT — a unicode lane project cannot cause spurious refusal |
| `kaola-workflow/proj2/sub/deep.md` | plain | EXEMPT |
| `kaola-workflow/proj3/link` (lane symlink) | plain | EXEMPT (inside declared boundary) |
| `kaola-workflow/linkdirect` (symlink directly under lane root) | plain | KEPT |
| `kaola-workflow/stray.md` | plain | KEPT |
| `kaola-workflow\proj\x.md` | `?? "kaola-workflow\\proj\\x.md"` | **EXEMPT — RISK-1** |
| `.kw/worktrees/nested/` (embedded repo) | one collapsed record | **EXEMPT — RISK-2** |
| `embedded-outside/` (embedded repo, non-lane) | one collapsed record | KEPT |
| `loopy -> src` (non-lane symlink) | `?? loopy` | KEPT |
| `src/genuine.js` | plain | KEPT |

Degenerates on the shipped text: `'?? '` (empty path after XY) → KEPT; `'??'` → KEPT; `''`/`null` →
no records; a parse-to-null `??` record falls through to `kept.push(record)` — **fail-closed
confirmed**, and no shape parsed to a *wrong* string (18/18 lstat-exact). Tracked records
(` M`/` D`/rename) never enter the filter: porcelain XY `?` exists only as the `??` pair, so
`record.startsWith('??')` is a precise untracked test and the arrow/rename logic is unreachable.

### Ignored files — three mechanisms, fake-HOME fixture

`.gitignore`d `node_modules/`, `.git/info/exclude`, and a global `core.excludesFile`: NONE appear
under `-uall` (only the untracked control did); positive control `--ignored` listed all three as
`!!`, so the ignores were armed. The guard structurally cannot refuse over `node_modules/`. A repo
whose `.gitignore` covers `kaola-workflow/` entirely: lane content invisible → sink proceeds
(sound — the user's own ignore rule declares it disposable).

### Four copies

- root vs codex: `cmp` byte-identical (also re-hashed before/after my validator runs — stable, no
  torn read; `test-sink-merge.js` still at tests-sink's custody md5 `74110486…`).
- Extracted `worktreeDirtRecords`: root==codex, gitlab==gitea, root==gitlab modulo the ports'
  existing `adaptiveSchema.` namespace idiom.
- All four `kaola-workflow-adaptive-schema.js` copies byte-identical — the ports run the same
  kernel predicate.
- Both call sites per copy (`sinkPreflight` + legacy `main()`) reach the one shared function:
  root/codex `:1731`/`:3210`, gitlab `:1205`/`:1720`, gitea `:1214`/`:1729` (every occurrence
  grepped; no other caller exists).
- `node scripts/edition-sync.js --check` → exit 0 ("8 forge aggregator ports in parity",
  "committed kernel parity verified at HEAD"). `node scripts/validate-script-sync.js` → exit 0
  (27 byte-identical groups, 6 export-superset families in sync). No hand-edit drift.

### Message consumers

The refusal flows as an opaque `detail` (`sinkPreflight` → `{ok:false, reason:'worktree_dirty',
detail: err.message}` `:1733`); production and the walkthrough assert on `reason` and worktree
survival (simulate-workflow-walkthrough.js:5492-5494), never on message content — the changed
`Uncommitted:` body breaks no parser. The main-root probes (`assertCleanWorktree` root:429; gitlab
:412/:1181; gitea :427/:1190) still pass `--untracked-files=no`, untouched by this diff — no other
caller's behavior changed.

## Checked and found sound

- Fail-closed probe machinery unchanged: list-probe and status-probe fault paths, bounded retry,
  FORCE_WT_* test hooks; a probe fault still refuses (right direction). `GIT_MAX_BUFFER` 64MB; an
  overflow throws → refuses, never destroys.
- The tracked half is byte-untouched and structurally unreachable by the filter (#912-b intact).
- The outer `.trim()` cannot corrupt any record: quoting protects edge whitespace in names; a
  first-record leading-space strip touches only tracked records, which are kept regardless.
- `-uall` vs `=normal`: the non-collapse rationale is real and holds even for quoted-name
  directories (measured); a collapsed `?? kaola-workflow/` record would be KEPT (refuse-every-run),
  which is why `=normal` had to be avoided — the shipped flag avoids it.
- Unicode/space/quote/newline/trailing-space names in LANE paths decode exactly, so no
  spurious-refusal path via decode failure; decode failure itself lands on KEPT (fail-closed).
- Both entry points exercised end-to-end against the real CLI (legs above); refusal leaves the
  worktree and work intact with zero mutation.
- Ignored-content population unreachable by construction (three mechanisms measured).
- Ports faithful; kernel byte-identical ×4; validators green; no torn read (hashes stable across
  my runs).
- The 2-arg vs 3-arg `assertWorktreeClean` signature split between root/codex and gitlab/gitea is
  pre-existing (present at HEAD), not candidate drift.
- Safety after review: main tree carries only run records (`kaola-workflow/bundle-973-974-975/…`,
  this file the only one mine); worktree at 40 entries exactly as at start; `git worktree list`
  unchanged (2 entries); no `rvsink9731-*` residue under the temp dir; scratch mirrors deleted.

## Receipt

finding: id=RS1 scope=in_scope action=fix status=open severity=low fix_role=implementer rationale=#579 comment at sink-merge.js:517-518 claims the probe passes --untracked-files=no and that ownedProjects is passed through; the diff changed the probe to -uall and left the sentence false in root+codex
finding: id=RS2 scope=pre_existing action=report status=open severity=low fix_role=none rationale=backslash-named plain file normalizes into the lane namespace and is silently destroyed; pre-existing predicate behavior, destruction set strictly shrunk by the candidate
finding: id=RS3 scope=pre_existing action=report status=open severity=low fix_role=none rationale=embedded git repo under a lane prefix collapses to one exempt record even under -uall; nested-run uncommitted work destroyed silently; pre-existing boundary cost
verdict: fail
findings_blocking: 1
review_conclusion: The #973 guard is sound in both directions — reproduced end-to-end against the real CLI: revert destroys, shipped refuses and preserves files and symlinks naming the paths, lane-only runs complete, and the over-broadened mutant refuses every ordinary run. One low-severity candidate-caused defect remains (the #579 comment the diff falsified and left standing), plus two documented pre-existing residual destruction shapes at the lane boundary.

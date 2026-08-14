# Adversarial review — #976 half (relative-TMPDIR escape: installers + Node choke point)

Reviewer: review976. Tree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-976-977-978`
at base 51db5d2d + the bundle's uncommitted work. All experiments ran in the scratchpad
(`<scratchpad>` = /private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/753f1e81-4413-4c89-9ade-8644be970a42/scratchpad);
the worktree and real checkout were never mutated. Scope: the #976 mktemp/TMPDIR changes in
install.sh / install-opencode.sh / install-kimi.sh, the kernel + validation-runner (4 copies each),
simulate-workflow-walkthrough.js, scripts/test-relative-tmpdir-escape.js, package.json. The
retired-name hunks and sink-merge j/k/l changes were excluded as directed.

## Verdict

**PASS — zero blocking findings.** Every hunted failure class came up clean, most of them
demonstrated rather than reasoned: the mutation matrix re-ran red in the right places (plus a novel
single-site mutant of my own), the shim was audited against real GNU coreutils 9.1 in a container
and matched on every load-bearing row, and the fixed installers were driven through a REAL GNU
mktemp under `TMPDIR=.` with a 0.02 s poller — zero escapes, all four exit codes right, the kimi
merge and byte-identical restore intact. Two instrument-limitation observations and one
record-staleness note below; none is a defect in the candidate.

## What I ran (real exit codes, never through a pipe)

On the candidate, native (macOS):
- `node scripts/test-relative-tmpdir-escape.js` → exit 0, **48/0** (`<scratchpad>/r976-oracle.out`)
- `node scripts/test-run-chains.js` → exit 0, 283 (T30 absolute-inside-repo tripwire green)
- `node scripts/test-install-all.js` → exit 0, 254 (#975 not regressed)
- `node scripts/test-validation-runner.js` → exit 0; `test-validation-allowband.js` → exit 0, 17
- `node scripts/test-kernel-conformance.js` → exit 0, 254 and `test-oracle-kernel.js` → exit 0, 48
  — **neither was in the implementer's verification list**, and the kernel's "side-effect-free"
  header contract just changed; both accept the amended contract
- `node scripts/test-suite-registration.js` → exit 0, 549 (package.json registration in both tiers)
- `node scripts/validate-script-sync.js` → exit 0; `edition-sync.js --check` → exit 0
- `bash -n` all three installers → 0/0/0
- Full walkthrough under a NORMAL TMPDIR: `node scripts/simulate-workflow-walkthrough.js` →
  **exit 0**, spawn census 2432 (`<scratchpad>/r976-walkthrough-full.out`) — my own run, not the
  recorded one

Four-edition drift: kernel sha256 `ac916beb…` identical across all 4 copies; validation-runner
`2f34808c…` identical across all 4. (Note: the dispatch/impl records say the kernel hashes
`3c13cc5f…` — that hash is stale, captured before the final constraint-3 comment reword; the ×4
identity, which is the property that matters, holds, and both sync guards are green.) The
sink-merge surfaces remain modified in the tree (the #978 ports were not clobbered by propagation;
edition-sync's byte-identical groups do not include sink-merge, and both sync checks pass).

## 1. Vacuous-test hunt — mutation matrix re-run MYSELF in a scratch mirror

Mirror: full copy of the worktree at `<scratchpad>/rev976-mirror`; un-mutated control first
(**48/0, exit 0, 7.5 s** — the mirror is valid). Each mutant applied alone, oracle run, pristine
restored (diff-verified) before the next:

| mutant | result | reds |
|---|---|---|
| control (no mutation) | exit 0, 48/0 | — |
| **MutA** kernel guard → empty-only `if (val === '')` (the near-miss) | exit 1, **exactly 2 FAIL** | both run-chains pins only (private root inside runner cwd; kw-chain-*/kw-barrier-idx-* beside fixture) |
| **MutB** shell guard case-statement deleted in all 3 installers (bare `${TMPDIR:-/tmp}`, M2's misunderstanding) | exit 1, **exactly 7 FAIL** | all installer location pins; kimi no longer aborts (template has X's) yet still reds on location |
| **MutC** walkthrough block deleted, :36 wrapped in `realpathSync(mkdtempSync(…))` (the dead idiom) | exit 1, **exactly 1 FAIL** | walkthrough pin only — `kw-sandbox-home-*` landed beside the copy root despite the absolute return string |
| **MutD (novel, mine)** single site reverted: opencode `seed_config` rendered → bare `mktemp`, guard + other sites intact | exit 1, **exactly 2 FAIL** | opencode pins: "1 of 3 mktemp-created paths landed INSIDE" — the shim log gives per-call sensitivity, not aggregate |

Transcripts: `<scratchpad>/r976-mut{A,B,C,D}.out`. The recorded matrix reproduces, the two named
near-misses red only their own pins, and a regression of any single site is caught. The nine
baseline-red pins cannot pass without the fix. The suite's own anti-vacuity nets were read and
verified present: shim-armed live control (bare mktemp must be served, create in cwd, be logged —
suite line ~224), per-scenario planted control entry + tick floor, the per-installer
"shim observed at least one mktemp call" instrument assertion, deploy-evidence pins (manifest,
opencode.json, merged config), the shard non-vacuity trailer (`"ran":1`), and the whole-run watch
on the REAL checkout. Run under a relative TMPDIR the suite fails loudly on itself (repoBefore is
read before its own sandbox is created — checked in source, lines 80–103).

## 2. The require-time kernel side effect — interrogated, clean

Probe (`node -e`, kernel required with cache clearing so the block genuinely re-executes):
- Relative TMPDIR/TMP/TEMP incl `.`, `..`, `rel/x/`, `./` → all `/tmp`.
- **Absolute values byte-untouched**, including a trailing-slash repo-interior path
  (`/private/tmp/some-repo/sub/` survives verbatim — no realpath, no tidying). T30 green at 283.
- Empty stays empty; unset stays unset (Node `os.tmpdir()` and every `:-`/`||` fallback treat
  empty as unset — verified in the container: `TMPDIR=` → `/tmp` for both real GNU and Node).
- Idempotent across double-require and after an absolute hand-down assignment.
- (d) Raw-TMPDIR reliance: swept production scripts — the ONLY production writer/reader of
  `env.TMPDIR` is validation-runner:214, which assigns its own intended-absolute isolatedTmp.
  No production consumer reads the caller's raw TMPDIR. claim.js's two `os.tmpdir` hits are
  comments; no async `fs.mkdtemp(` exists anywhere in production.
- (e) Child leakage: T30/T31 hand-down pins unchanged (run-chains overrides per-chain anyway);
  283 + 254 + 549 + full walkthrough (2432 spawns) all green.
- Choke-point coverage claim verified: run-chains requires the kernel at :145, sink-merge at :15,
  validation-runner now at :13 (hoisted), and none of the three builds any temp path or chdirs
  before that line (awk-checked). claim.js requires it at :20 and creates no temp paths at all.

## 3. Comments — each verified by running something

- Installer guard comment ("on GNU coreutils a relative TMPDIR resolves against the invoking
  directory"; "`${TMPDIR:-/tmp}` guards an EMPTY TMPDIR and NOT a relative one"): container rows —
  real GNU 9.1 bare/`-d` under `TMPDIR=.` → cwd; `TMPDIR=`/unset → /tmp. Scoped to GNU, measured
  on GNU. Clean.
- Kimi `-t` comment ("GNU … too few X's … exit 1"; "macOS mktemp accepts the X-less form"):
  container row t-noX real GNU rc=1 with that exact message; native macOS
  `TMPDIR=. /usr/bin/mktemp -t kaola-kimi-hooks` → exit 0, lands in the confstr dir. Both halves
  measured true.
- Kernel comment ("os.tmpdir() returns a relative TMPDIR verbatim" — `TMPDIR=. node -p` → `.`;
  "realpathSync only absolutises the returned STRING" — MutC demonstrated it; "every production
  script that creates a temp path loads it at module start" — verified above; "'/tmp', the same
  floor the repo's existing absolute-or-'/tmp' guards normalise to" — matches install-all.sh and
  tmpBase(), a repo fact not a platform claim). Clean.
- Walkthrough comment (measured harm citation): the premise leg-1 transcripts exist in the
  scratchpad and show the #333 failure with archive paths resolved inside the copy; the
  tests-976 addendum replicated the fixed-tree leg with byte-identical git status. Not re-run
  destructively here; two independent transcripts anchor it. No comment in this diff asserts an
  unmeasured platform-general claim.

## 4. The shim audit — real GNU coreutils 9.1, in-container (`<scratchpad>/r976-container.out`)

Shim extracted byte-faithfully from the test source (eval of the array literal) and compared
row-by-row against `/usr/bin/mktemp` 9.1, same cwd, same env — exit code, landing-location class,
created mode, stderr shape:

Matched (13 rows): bare, `-d`, `-t` no-X abort (exact message + rc=1), `-t` with X's, absolute
explicit template file+dir (THE fixed idiom), empty TMPDIR, empty + `-t`, unset, relative explicit
template, too-few-X's, `-t` with slash (both rc=1), `-u`, and mode bits 600/700 throughout.

**Two divergences, both making the shim STRICTER than GNU, neither exercised by any site:**
1. Mid-template X's (`fooXXXXXXbar`): GNU 9.1 accepts (rc=0), shim rejects. A hypothetical fix
   using such a template would go falsely RED (installer aborts, exit pin fails) — loud, never
   vacuous-green.
2. `-p DIR` + `-t` precedence with TMPDIR set: GNU lets TMPDIR win; the shim lets `-p` win. This
   is the one shape with a false-GREEN potential: a future fix written as `mktemp -t -p
   "$KW_TMPDIR" tpl.XXXXXX` would pass the shim while escaping on real GNU. No current site uses
   `-p`; recorded as an instrument limit (finding R1 below), not a candidate defect.

## 5. The kimi `-t` repair + all consumers — verified on REAL GNU, not just the shim

Container part 2: the FIXED tree, real GNU mktemp, `export TMPDIR=.`, 0.02 s poller on the repo
root the whole time:
- `bash install.sh --yes --forge=github` → exit 0, agent manifest landed in HOME
- `bash install-opencode.sh --yes --target …` → exit 0, opencode.json seeded
- `bash install-kimi.sh --yes --target …` with an existing config.toml → **exit 0** (previously a
  guaranteed GNU abort), managed hooks block merged, user section preserved
- doctor-reject leg (stub `kimi` exit 1) → install exits **1**, config restored
  **byte-identically** (`cmp` clean) — the C2 restore contract on the real binary
- Poller: **zero** escape-shaped entries across all four runs; zero leftovers.

Consumer regression (category 7): every temp file's consumer traced — `:401` awk→`mv` onto dest,
manifest snapshots compared-then-discarded, opencode `rendered` `mv` with explicit `chmod 644`
(0600-vs-644 already handled at :617 pre-change), kimi backup `cp`-back/`rm`, bootstrap dir with
its own `trap rm -rf`. `mv` degrades to copy+unlink across devices, and the container legs
exercised every consumer live at the new location. The backup variable is initialised to `""` and
every use is `[[ -n "$backup" ]]`-guarded, so `set -u` cannot trip on the no-config path. Clean.

## 6. The walkthrough edit

Block sits at lines 4–17, before the census require; the first temp site is the module-load HOME
sandbox at :36 — nothing runs earlier. Full walkthrough under a NORMAL TMPDIR: exit 0 (my run).
The "exactly two unconditional escapers, of 232 sites" claim spot-checked independently: 232
`mkdtempSync(` call sites (+1 comment mention), exactly one at column 0 (:36); :13206
(`kw-active-folders-`) is the only unconditional runner-level one; MutC demonstrated the pin
catches the module-load site. The file is edition-sync-excluded (root-only by design). The five
EDITION walkthrough entry points remain un-normalised — pre-existing, outside the ruled #976
scope, and already in flight as task #11 (finding R2, non-blocking, so the scope edge is visible).

## Observations (non-blocking)

- The impl/dispatch records carry a stale kernel hash (`3c13cc5f…`); the tree's actual ×4 hash is
  `ac916beb…` (post-reword). Identity ×4 is intact; record-only.
- Post-fix, the walkthrough's `kw-sandbox-home-*` in the real system tmp is still never cleaned —
  pre-existing behaviour, unchanged by this candidate, already noted by the test author.

finding: id=R1 scope=out_of_scope action=acknowledge status=recorded severity=low fix_role=none rationale=shim diverges from GNU 9.1 on mid-template X acceptance and on -p/-t precedence; no current site exercises either; the -p/-t shape is the one latent false-green path if a future fix adopts it
finding: id=R2 scope=out_of_scope action=acknowledge status=recorded severity=low fix_role=none rationale=five edition walkthrough entry points remain un-normalised under a relative TMPDIR; pre-existing, outside the ruled #976 scope, already in flight as task #11

verdict: pass
findings_blocking: 0
review_conclusion: The #976 half holds under adversarial re-measurement: the nine baseline pins are non-vacuous (four mutants red exactly their own pins, including a novel single-site revert), the require-time kernel normalisation rewrites only non-empty relative values and is idempotent with absolute values byte-untouched, every added comment was verified by running the thing it claims, the shim matches real GNU coreutils 9.1 on every load-bearing row with two stricter-only divergences recorded, and the fixed installers under a real GNU mktemp with TMPDIR=. produce zero escapes with the kimi install now succeeding and its doctor-reject restore byte-identical.

# Premise check — issue #976 (relative-TMPDIR escape at installer sites)

Investigator: premise-976. Measurement only; no tracked file was modified. All destructive/inducing
experiments ran in the scratchpad against a **git clone of the repo**, never the real checkout.

## Setup

- Repo read at: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-976-977-978`,
  HEAD = `51db5d2d` (clean but for the three untracked `.roadmap/issue-97[678].md` sources).
- Repro copy: `git clone --no-hardlinks` of the main checkout at `51db5d2d` into
  `<scratchpad>/repro/copy` (scratchpad = `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/753f1e81-4413-4c89-9ade-8644be970a42/scratchpad`).
- Platforms measured: macOS 26.6.1 (`/usr/bin/mktemp`, Apple/BSD; Node v24.14.0) and Debian
  stable-slim / node:22-bookworm-slim containers (GNU coreutils **mktemp 9.7**; Node v22.23.2).
- Raw transcripts: `<scratchpad>/repro/leg1-observed.log`, `leg1-walkthrough.out`,
  `leg2-copyroot.log`, `leg2-tmp.log`, `leg2-suite.out`, and the persisted leg-3 container output.

## Verdict in one paragraph

The filed defect is REAL but the filed claim is wrong in three load-bearing ways. (1) **The
property is platform-conditional and the issue never says so**: on this macOS, `/usr/bin/mktemp`
never consults TMPDIR when `_CS_DARWIN_USER_TEMP_DIR` is available (measured six ways, including an
absolute-TMPDIR control, and stated in the man page), so **none of the eight listed sites escapes
on macOS**; on GNU/Linux seven of the eight escape (measured, including a live reproduction through
the real `install.sh`). (2) **The enumeration is wrong at both ends**: the title says seven, the
body lists eight lines; one of the eight (`install-kimi.sh`) escapes on **no** measured platform —
on GNU it hard-errors instead (`mktemp -t` template without X's), aborting the install under
`set -e`; and the issue misses the **entire Node surface** its own exposure definition ("a bare
`node scripts/...`") reaches: 497 `mkdtempSync(path.join(os.tmpdir(),…))` sites, four of them in
production scripts, one of them the very `run-chains.js:326` the issue cites as the immuniser.
(3) **The harm is understated**: under `TMPDIR=.` the walkthrough does not just litter — it
**modified two tracked files** in the copy's `kaola-workflow/archive/` band and failed spuriously.
What the issue gets exactly right, verified: both "obvious fix" idioms are dead, the sandbox suite
is stub-driven and structurally blind to these sites, nothing in-repo sets a relative TMPDIR, and
the #975 fix itself holds under `TMPDIR=.` (re-verified live, 254 assertions, zero escapes).

## Q1+Q2 — Per-site table (lines verified at 51db5d2d)

Mechanism key: **B** = bare `mktemp` / `mktemp -d` (mktemp's own TMPDIR consultation, *no* variable
interpolation in a template — this is NOT the `"${TMPDIR:-/tmp}/x.XXXXXX"` idiom #975 fixed).

| filed site | current line | exact code | creates | verdict on "resolves against cwd" |
|---|---|---|---|---|
| install.sh:24 | **24** | `_TMPDIR="$(mktemp -d)"` (curl-pipe bootstrap; then clones repo into it) | dir | **REFUTED on macOS** (confstr wins, measured); **CONFIRMED on GNU/Linux** (mechanism measured; site itself only runs via `curl \| bash` + network, not invoked) |
| install.sh:399 | **401** (MOVED +2) | `local tmp; tmp="$(mktemp)"` in `install_managed_agent` | file | REFUTED on macOS; CONFIRMED on GNU (mechanism measured; site ran ~40× in leg 3, lifetime < poll interval — not individually observed) |
| install.sh:427 | **429** (MOVED +2) | `manifest_tmp="$(mktemp)"` | file | REFUTED on macOS; **CONFIRMED on GNU — observed live in leg 3** |
| install.sh:433 | **435** (MOVED +2) | `prev_manifest="$(mktemp)"` | file | REFUTED on macOS; **CONFIRMED on GNU — observed live in leg 3** |
| install-opencode.sh:305 | **305** | `prev_manifest="$(mktemp)"` | file | REFUTED on macOS; CONFIRMED on GNU (mechanism; site not separately invoked — installer needs an opencode layout) |
| install-opencode.sh:309 | **309** | `manifest_tmp="$(mktemp)"` | file | same as :305 |
| install-opencode.sh:600 | **600** | `rendered="$(mktemp)"` | file | same as :305 |
| install-kimi.sh:322 | **323** (MOVED +1) | `backup="$(mktemp -t kaola-kimi-hooks)"` | file | **REFUTED everywhere measured.** macOS: immune (confstr). GNU: `mktemp: too few X's in template 'kaola-kimi-hooks'`, exit 1 → `set -euo pipefail` (install-kimi.sh:46) **aborts the install** whenever a config exists. An unfiled, worse defect at the same line. |

Note the distinction the issue blurs: only install.sh:24 makes a temp **directory** (holding a full
clone); the other seven make single temp **files**. All are covered by the filed result sentence,
but the "81 fixture roots each containing plugins/" imagery belongs to #975's sites, not these.

### The shell mechanism, measured

macOS 26.6.1 `/usr/bin/mktemp` — all under a verified-propagating `TMPDIR` (control:
`TMPDIR=. /usr/bin/env | grep TMPDIR` → `TMPDIR=.`; and `bash -c 'export TMPDIR=.; echo $TMPDIR'` → `.`):

| invocation | TMPDIR | landed in |
|---|---|---|
| `mktemp` | `.` | `/var/folders/…/T/tmp.il1pA1QEaI` |
| `mktemp -d` | `.` | `/var/folders/…/T/tmp.JsJJ4JIsvD` |
| `mktemp -t kaola-kimi-hooks` | `.` | `/var/folders/…/T/kaola-kimi-hooks.bnQzIvSKIt` |
| `mktemp` / `-d` / `-t` | **absolute scratch dir** (positive control) | `/var/folders/…/T/…` — **TMPDIR ignored even when absolute** |
| `mktemp "$T/kaola-demo.XXXXXX"` with `T=.` (the pre-#975 explicit-template idiom) | `.` | `./kaola-demo.gdlXnL` — **cwd. The #975 sites escaped on macOS because they interpolated `$TMPDIR` into the template; the #976 sites never do.** |

The man page states the mechanism: with `-t` (implied when no template is given, `-d` included),
the template is based on `_CS_DARWIN_USER_TEMP_DIR`; TMPDIR is a **fallback** only "if
_CS_DARWIN_USER_TEMP_DIR is not available".

GNU coreutils 9.7 (Debian container, cwd `/w`):

| invocation | TMPDIR | result |
|---|---|---|
| `mktemp` | `.` | `./tmp.lDIAmgOoOK` — **cwd** |
| `mktemp -d` | `.` | `./tmp.RGjuOFZHSq` — **cwd** |
| `mktemp -t kaola-kimi-hooks` | `.` | **error** "too few X's in template", exit 1 |
| `mktemp -t kaola.XXXXXX` | `.` | `./kaola.XEEEbl` — cwd |

## Q4 — Reproductions (all in the scratchpad copy, never the real checkout)

**Leg 1 — Node site, macOS.** From the copy root: `TMPDIR=. node
scripts/simulate-workflow-walkthrough.js`, with a 0.05 s poller on the copy root. Within 3 s the
poller (and a direct `ls`) observed **four fixture roots inside the checkout root**:
`kw-sandbox-home-koE0n4` (walkthrough **:22** — module top, before any test), `kw-keepopen-*`
(**:276**), `kw-backstop-*` (**:348**), `kw-active-folders-*` (**:13192**). The run then FAILED
(`Error: #333 …`) with archive paths resolved inside the copy's own tree, and afterward
`git status` in the copy showed ` M kaola-workflow/archive/issue-210/workflow-state.md` and
`?? kaola-workflow/archive/issue-210/finalization-summary.md` — **a bare walkthrough under a
relative TMPDIR mutates tracked files and fails**. This leg is also the positive control for the
poller used in leg 2 (same mechanism, same directory, it demonstrably sees escapes).

**Leg 2 — the #975 fix holds.** From the copy root: `TMPDIR=. node scripts/test-install-all.js`
ran to completion — **exit 0, "install-all contract test passed (254 assertions)"**. The copy-root
poller log is **empty** (0 lines over ~2 min at 0.05 s); a parallel poller on `/tmp` caught the
fixtures landing there instead: 47 distinct `kaola-install-all-{guard,test}-*` Node fixture roots
plus many `kaola-install-all-bound.*` wrapper flag-dirs. `tmpBase()` (test-install-all.js:79-82)
and `KW_TMPDIR` (install-all.sh:49-52) both verified working as designed.

**Leg 3 — shell site, Linux, the real installer.** The copy was tar-streamed into a
`node:22-bookworm-slim` container (no bind mount — Docker file sharing silently mounts this
scratchpad path empty; two earlier attempts failed that way and were discarded). Inside:
`export TMPDIR=.; export HOME=/sbxhome; bash install.sh --forge=github` from `/repo`, 0.02 s
poller on `/repo`. Result: **installer exit 0**; poller observed **2 distinct `tmp.*` files in the
checkout root during the run** (`tmp.0ab9BIDcCc`, `tmp.ke58x4erz8` — the long-lived
`manifest_tmp` :429 and `prev_manifest` :435); **nothing left afterward** — moved/cleaned, so no
before/after check can see it, exactly as filed. (The :401 per-agent files live only between
`mktemp` and `mv` and were not individually caught at this poll rate; same measured mechanism.)

## Q5 — The two dead idioms: CONFIRMED DEAD (measured, Node v24.14.0, `TMPDIR=.`)

- `os.tmpdir()` returns `.` **verbatim**.
- Idiom A `fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'idiom-a-')))` → returned an
  ABSOLUTE string, `isAbsolute: true`, and the directory sat **in the cwd** (`inside cwd: true`,
  `ls` shows `idiom-a-aiwWcz` beside the script). String absolutised after creation, as filed.
- Idiom B `path.resolve('.') === process.cwd()` → `true`; `mkdtempSync(path.join(path.resolve(os.tmpdir()),'idiom-b-'))`
  → absolute at creation and **in the cwd**. As filed.

## Q6 — Sandbox suite is stub-driven: CONFIRMED

`scripts/test-fixture-sandbox.js:133` spawns exactly one child —
`node <copied-checkout>/scripts/test-install-all.js` — against a COPIED tree. test-install-all.js
in turn builds every scenario through `stubRoot()` (:355-363), which **writes stub
`install.sh` / `install-opencode.sh` / `install-kimi.sh` and a stub codex CLI** into a fixture root
and points install-all.sh at them via the `KAOLA_INSTALL_ALL_ROOT` seam. The real installers never
execute under the sandbox suite, so it structurally cannot observe the eight filed sites. (Its own
header, :24-56, says this in as many words.)

## Q7 — run-chains immunisation: HALF-TRUE AS FILED

`scripts/kaola-workflow-run-chains.js:326-333` (`createIsolatedChainSpec`) is at the filed lines:
it creates `tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'kw-chain-')))` and
hands children `TMPDIR/TMP/TEMP = tempRoot`. Children therefore always receive an **absolute**
TMPDIR — that part of the filed sentence is right, and it is why chain-run suites are not exposed.
But the root itself is built with idiom A, which the same issue proves dead: under a relative
TMPDIR the `kw-chain-` root is created **in the runner's cwd** (the checkout at finalize), and the
children then faithfully fill a directory inside the checkout. Inference from the measured idiom —
the expression is byte-identical to the one measured in Q5 — confidence high; refutable by running
run-chains under `TMPDIR=.` and finding `kw-chain-*` elsewhere.

## Q3 — Enumeration completeness: REFUTED

- **Count defect**: title and body say "seven more sites"; the body enumerates **eight** line
  references (4 + 3 + 1). Verified against the filed source
  (`kaola-workflow/.roadmap/issue-976.md`, untracked in the worktree).
- **The Node surface is missing entirely.** The issue's own exposure definition — "a bare
  `node scripts/...`" — reaches `os.tmpdir()`, which never absolutises. Sweep (with positive
  controls; `git grep -P`, dot-dirs not involved): **497 `mkdtempSync(` sites in `scripts/*.js`**,
  including `simulate-workflow-walkthrough.js` (230 — and `:22` runs at module load, before the
  first test), `test-install-model-rendering.js` (75), `test-claim-hardening.js` (42),
  `test-opencode-edition.js` (26), `test-sink-merge.js` (14), `test-kimi-edition.js` (10), … and
  **four production scripts**:
  - `kaola-workflow-run-chains.js:326` — its own `kw-chain-` root (see Q7);
  - `kaola-workflow-sink-merge.js:2166` — `kw-wtsync-` stage dir; also `:3123`/`:3161`
    `process.chdir(os.tmpdir())` becomes a silent no-op under `TMPDIR=.` (the process stays in the
    checkout while downstream comments assume a neutral cwd — adjacent hazard, consequence not
    measured);
  - `kaola-workflow-validation-runner.js:547`/`:606` (index/blob temps) and `:193-194`/`:761`,
    which build `isolatedHome`/`isolatedTmp` from `os.tmpdir()` and hand a possibly-RELATIVE
    `env.TMPDIR` to sandboxed children (`:209`) — the same hand-down run-chains gets right;
  - `kaola-workflow-adaptive-schema.js:1010` — `GIT_INDEX_FILE` under `os.tmpdir()`, whose comment
    ("the index lives OUTSIDE the repo … its own path can never leak into the snapshot") is false
    under a relative TMPDIR (unmeasured inference, moderate confidence).
- **Sites listed that are already immune**: on macOS, all eight (mechanism above); on every
  measured platform, `install-kimi.sh:323` (immune on macOS, hard-errors on GNU).
- **Installer the issue does not mention, verified immune**: the codex installer
  `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js` contains **no**
  mktemp/mkdtemp/tmpdir idiom at all (grep with positive control on install.sh: 19 hits there,
  1 comment hit in the codex file).
- **Everything else**: no temp idiom exists in any tracked non-`scripts/`, non-`plugins/` file
  other than the four shell installers (sweep hit only those plus two inert archived JSON records).
  `uninstall.sh` is clean. The `plugins/*/scripts/` trees mirror the root scripts and carry the
  same sites (edition-drift anchor applies to any fix).
- **"Nothing in this repository sets a relative TMPDIR": CONFIRMED.** The only `TMPDIR=`
  assignments are install-all.sh's absolutising guard, run-chains' hand-down,
  validation-runner:209 (intended-absolute), and two test-run-chains fixtures using absolute paths
  (`:1048`, `:1185`).

## Q8 — What a fix must not break (dependencies on current temp locations)

- **None found on location.** Every one of the eight files/dirs is consumed inside its own
  function: `:401` tmp → `awk`, then `mv` onto `$dest` (cross-filesystem `mv` is legal);
  `:429`/`:435` and opencode `:305`/`:309` manifests → compared, then discarded; opencode `:600`
  `rendered` → `mv` to the config with an explicit `chmod 644` (the 0600 mktemp mode is already
  acknowledged at `:617`); kimi `:323` backup → `cp` back on `kimi doctor` rejection, `rm` after;
  install.sh `:24` bootstrap dir → self-contained with a `trap rm -rf`.
- Two in-repo precedents already state the accepted shape: `KW_TMPDIR` (install-all.sh:43-52,
  absolute-or-`/tmp`) and `tmpBase()` (test-install-all.js:79-82, `isAbsolute`-or-`/tmp`).
- If the fix exports an absolutised TMPDIR rather than templating: that changes nothing on macOS
  (mktemp ignores TMPDIR here) and matters only on GNU — do not "verify" such a fix on a Mac.
- If the Node surface is brought in scope: test-run-chains.js pins the per-chain TMPDIR/TMP/TEMP
  isolation contract (`:1048`, `:1104`, `:1185`) — keep it; and any change to root `scripts/*.js`
  that are edition-mirrored must propagate through the plugins trees (byte-identity anchors).
- Fixing kimi `:323` will coincidentally repair the GNU "too few X's" abort — worth stating in the
  fix so the Linux behaviour change is deliberate, not accidental.

## What the issue got wrong (summary list)

1. "Seven more sites" — eight are listed.
2. Three of eight line numbers drifted (+1/+2); locations otherwise accurate.
3. The property claim carries no platform qualifier and is **false on macOS for all eight sites** —
   the filed generalisation from #975's sites is unsound because those interpolated `$TMPDIR` into
   an explicit template (escapes everywhere) while these rely on mktemp's own TMPDIR consultation
   (never happens on this macOS).
4. `install-kimi.sh:323` escapes on no measured platform; on GNU it aborts the install instead —
   a different, unfiled defect at the same line.
5. The enumeration omits the Node surface its own exposure definition reaches (497 sites, 4
   production scripts) — including `run-chains.js:326`, which the issue cites as the mitigation.
6. Harm understated: a bare walkthrough under `TMPDIR=.` **mutates tracked files** in
   `kaola-workflow/archive/` and fails (#333), beyond transient self-deleting roots.
7. Confirmed accurate, for fairness: the two dead idioms, the sandbox suite's structural blindness,
   the bounded-honesty sentence about nobody setting a relative TMPDIR, the child-side half of the
   run-chains sentence, and the specified result ("no fixture or installer temporary root is
   created inside the working checkout, whatever TMPDIR holds") — which, note, the walkthrough
   evidence suggests should say *no fixture or installer temporary **write** lands inside the
   working checkout*, since misdirected roots also redirect real writes into the tracked tree.

## Open / not measured

- install.sh:24 and the three install-opencode.sh sites were not individually driven to an escape
  (bootstrap needs `curl | bash` + network; opencode needs an opencode layout); their GNU verdict
  rests on the measured bare-`mktemp` mechanism shared with the observed sites.
- run-chains.js:326 and adaptive-schema.js:1010 site-level behaviour under `TMPDIR=.` is inferred
  from the byte-identical measured idiom, not separately run.
- No BSD-proper (FreeBSD) or musl/busybox measurement; verdicts cover this macOS and GNU 9.7 only.
- Whether the walkthrough's tracked-file mutation (leg 1) flows through one specific fixture site
  or several was not narrowed; the observation is the mutation itself.

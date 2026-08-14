# Tests for #976 — relative-TMPDIR escape (installers + Node choke point)

Author: tests976 (test custody). No production file was touched. Every induced run happened
against a git clone / copies in the scratchpad or against a sandboxed copy the suite makes
itself — never the real checkout or its worktrees.

## Deliverable

- **`scripts/test-relative-tmpdir-escape.js`** — new suite, hand-rolled assert, registered in
  BOTH `test:kaola-workflow:claude` (fast gate) and `test:kaola-workflow:claude:full`
  (`package.json`, the only other file I touched). `test-suite-registration.js` passes
  (549 assertions). Runtime ≈ 7 s macOS / ≈ 10 s Linux; it copies the checkout (minus
  `.git/.kw/kaola-workflow/node_modules/.claude`) into a temp sandbox each run, regenerates
  `.opencode`/`.kimi` in the copy at setup, and drives everything against the copy.

## RED at baseline — the headline signature

**baseline: 51db5d2d** (pristine scratch clone; also identical in the live worktree at the same
HEAD with the concurrent #977/#978 edits present, and identical in a Linux container).

```
RED: 39 passed, 9 failed, exit 1                    (same 9 on macOS and on Linux/GNU)
  install.sh          — "16 of 16 mktemp-created paths landed INSIDE the copied checkout"
  install.sh          — "16 entr(ies) appeared beside the observed root" (tmp.*)
  install-opencode.sh — "3 of 3 mktemp-created paths landed INSIDE the copied checkout"
  install-opencode.sh — "3 entr(ies) appeared beside the observed root"
  install-kimi.sh     — "exits 1 under GNU mktemp semantics with an existing config.toml"
                        (mktemp: too few X's in template 'kaola-kimi-hooks' → set -e abort)
  install-kimi.sh     — managed hooks block never merged (consequence of the abort)
  walkthrough         — "2 entr(ies) …: kw-active-folders-*, kw-sandbox-home-*" (module load)
  run-chains          — private chain root ABSOLUTE but INSIDE the runner's cwd (kw-chain-*)
  run-chains          — "3 entr(ies) …: kw-barrier-idx-*, kw-barrier-idx-*.lock, kw-chain-*"
```

Transcripts (scratchpad `…/scratchpad/t976/`): `baseline-red5.out` (macOS, clone @51db5d2d),
`worktree-red2.out` (live worktree), `container-leg4.out` §4 (Linux). The suite stays red until
the fix lands — the bundle's fast gate is deliberately red on this branch right now.

## Per-scenario: result pinned · platform · proof

All scenarios run under `TMPDIR=.` with a per-scenario baseline `readdir`, a 15 ms poller +
`fs.watch` + planted control entry on the observed root, and a global fixture-shaped watch on
the REAL checkout (hard failure if the suite itself leaks — it never did).

**A. `install.sh --yes --forge=github`** (agent-manifest snapshots + 14 per-agent rewrites)
Result: install exits 0, installs a real agent manifest, and NO temp write lands inside the
checkout. Primary net is deterministic: a GNU-shaped **mktemp PATH shim** logs every path it
creates (absolutised); the suite asserts zero logged paths inside the copy — this also catches
the per-agent temps whose lifetime beat even a 0.02 s poller in the premise's container leg.
Platform: **via the shim, observable on macOS and Linux alike** (see "shim epistemics" below).
Baseline red: 16/16 inside. Mutation M2 (guard degraded to `${TMPDIR:-/tmp}`, the empty-only
misunderstanding): still red, 16/16 inside.

**B. `install-opencode.sh --yes --target <scratch>`** (manifest snapshots + rendered config)
Same nets. Baseline red: 3/3 inside + poller. M2: still red. Also pins: exit 0 and
`opencode.json` seeded at the target (a green exit that deployed nothing is not a pass).

**C. `install-kimi.sh --yes --target <scratch>`, `KIMI_CODE_HOME` sandbox, config.toml PRESENT**
Result: the install **succeeds** under GNU mktemp semantics when a config exists, merges the
managed hooks block while preserving the user's section, and no temp write lands in the
checkout. This pins the *unfiled, worse* defect at the same line: on GNU, `mktemp -t
kaola-kimi-hooks` is "too few X's", exit 1, and `set -euo pipefail` aborts the whole install.
Reproduced ON macOS through the shim. Baseline red: exit 1 + merge never happened.

**C2 (companion pin, GREEN at baseline by construction — declared, not a red).** Same install
with a stub `kimi` whose `doctor` rejects: install must exit non-zero and restore config.toml
**byte-identically**. At baseline the abort fires before the merge, so this passes trivially;
its job is to block the near-miss "reach C's green by deleting the backup". Mutation M3
(backup mechanism removed): C2 goes red — the restore branch `rm -f`s the user's config.
(My first M3 run exposed that my C/C2 config reads crashed on ENOENT instead of asserting;
hardened, re-proven.)

**D. `simulate-workflow-walkthrough.js --shard 1/999999`** (the Node half — no shim needed)
Result: nothing appears beside the copy root during or after the run; exit 0; the shard
trailer proves a scenario actually ran (`"ran":1` — non-vacuity). Platform: **genuinely
observable on macOS** — `os.tmpdir()` returns `.` verbatim everywhere. Baseline red:
`kw-sandbox-home-*` (walkthrough:22, module load, and it is a LEFTOVER — never cleaned) +
`kw-active-folders-*`. Mutation M1 (walkthrough:22 "fixed" with
`realpathSync(mkdtempSync(…))`, the dead idiom): **only** this scenario red — the suite
distinguishes the dead idiom from a real fix.

**E. `kaola-workflow-run-chains.js --chains claude --mock-chain claude:<probe>`** from a
scratch git fixture repo. Result: exit 0; the probe (the chain child) receives an existing,
absolute, private TMPDIR/TMP/TEMP root — restating the T30 hand-down contract — that is **not
inside the runner's cwd**; nothing appears beside the fixture root; no `kw-chain-*` leftover.
Deterministic net: the probe's marker file (no poll race). Platform: macOS-observable.
Baseline red: root is `<fixture>/kw-chain-*` — absolute AND inside the cwd, the exact
half-truth the issue filed as the mitigation; at finalize that cwd is the working checkout.
Bonus catch: `kw-barrier-idx-*` + `.lock` (validation barrier machinery) also landed in the
cwd — the choke point must cover those sites too, not just `createIsolatedChainSpec`.

## Satisfiability + mutation matrix

| tree | outcome |
|---|---|
| baseline 51db5d2d (macOS, Linux, worktree) | RED — the 9 above, exit 1 |
| fixmirror: TMPDIR absolute-or-/tmp guard in 3 installers + GNU-legal kimi template + env normalisation atop walkthrough & run-chains | **48 passed, 0 failed** on macOS AND Linux (6/6 container loop) — the pins are implementable, and this fix shape is a simulation, NOT a prescription |
| M1: Node "fix" = realpath idiom at walkthrough:22 | red ONLY at walkthrough |
| M2: shell guard degraded to empty-only `${TMPDIR:-/tmp}` | red ONLY at the 7 installer location pins |
| M3: kimi backup mechanism deleted | red ONLY at C2 restore |

Transcripts: `fixed-green4.out`, `m1c.out`, `m2c.out`, `m3c.out` in the scratchpad t976 dir.

## Shim epistemics — what is and is not proven (this is the route chosen for the
macOS-invisible shell sites)

macOS `/usr/bin/mktemp` ignores TMPDIR entirely (`_CS_DARWIN_USER_TEMP_DIR`), so the eight
shell sites cannot escape on a Mac and any direct test of them here is vacuous both ways. The
suite therefore runs the REAL installers under a **GNU-coreutils-shaped mktemp shim** first on
PATH, with a live positive control every run (a bare `mktemp` under `TMPDIR=.` must be served
by the shim, create in the cwd, and be logged — a bypassed or broken instrument fails loudly
before any location verdict is read). What this proves: the real installers, under a mktemp
that consults a relative TMPDIR, make no write inside the checkout. What it does NOT prove:
that a real GNU binary behaves as the shim does. That fidelity was **measured, twice**: the
premise's coreutils 9.7 table, and my own container leg against GNU coreutils 9.1
(`container-leg4.out` §§1–2 — six invocation rows, shim and real GNU byte-similar on every
row, including the `too few X's` abort) plus §3: the REAL GNU mktemp through the REAL
`install.sh` under `TMPDIR=.` — exit 0, **2 distinct `tmp.*` files observed live in the
checkout root, zero leftovers** (independent replication of premise leg 3).
One deliberately instrument-shaped assertion exists per installer scenario: "the shim observed
at least one mktemp call". If a legitimate fix stops using mktemp entirely, that assertion
(and the shim) must be re-derived around the replacement — its failure message says exactly
that. It exists because without it a sanitised PATH or absolute `/usr/bin/mktemp` call would
turn every location verdict vacuous-green.

## Boundaries the implementer should know

- Escapes are observed at the TOP LEVEL of the observed root (the class's shape). The leg-1
  deep-tree harm (tracked-file mutation under `kaola-workflow/archive/`) is cited in messages
  but not separately pinned — the module-load roots that cause it are.
- `install.sh:24` (curl|bash bootstrap) is not driven — needs network+pipe; its idiom is
  byte-identical to the driven sites.
- test-run-chains T30/T31 pins are untouched and restated consumer-side in scenario E. NOTE:
  T30 sets an ABSOLUTE parent TMPDIR *inside* its fixture repo and must stay green — the
  pinned property is "never resolve against the cwd / never accept a relative TMPDIR", NOT
  "never inside a repo". An over-eager fix that rejects absolute-inside-repo breaks T30.
- Post-fix, the walkthrough's `kw-sandbox-home-*` lands in the real system tmp and is still
  never cleaned — pre-existing behaviour in every normal run today, unchanged by this suite.
- Suite self-protection: it never runs anything against the real checkout, and it watches the
  real checkout for fixture-shaped entries the whole run (hard failure; never fired).

## Addendum — walkthrough custody fix (follow-up, same session)

The implementer measured that scenario D could not be turned green by production code alone:
`simulate-workflow-walkthrough.js:22` creates its HOME sandbox at MODULE LOAD, before any
production module can run in that process. The walkthrough is a test artifact, so the fix was
mine. **Edit**: one env-normalisation block at the very top of
`scripts/simulate-workflow-walkthrough.js` (before the census require): each of
TMPDIR/TMP/TEMP, if set and not absolute, becomes `/tmp` — the tmpBase()/KW_TMPDIR
absolute-or-/tmp shape at process granularity. Chosen over a tmpBase()-style helper because
the file has 232 mkdtempSync call sites and spawns children that inherit the env; one
statement covers the whole process tree, and neither dead idiom is involved. The file is
explicitly excluded from edition sync (validate-script-sync.js:17 — "must NEVER be synced"),
so the edit is root-only by design.

**Sweep result (constraint 4): exactly two unconditional escapers, empirically and
statically.** Empirical: `--shard 500000/999999` (owns zero scenarios) under `TMPDIR=.` on the
unfixed file → exactly `kw-sandbox-home-*` (:22, module load, leftover) and
`kw-active-folders-*` (:13192, created unconditionally in the runner before scenario
dispatch). Static: of 232 mkdtempSync sites, :22 is the only column-0/module-top statement;
:13192 is the only unconditional runner-level one; the other 230 are scenario-scoped (also
exposed at scenario time under a relative TMPDIR — the normalisation covers them and all
spawned children too, which is part of why the env shape was chosen).

**Verified** (transcripts in scratchpad t976/):
- `node scripts/test-relative-tmpdir-escape.js` in the worktree: **exit 0, 48 passed, 0
  failed** — both halves (implementer's installer/Node fix + this walkthrough fix) converged.
- `node scripts/simulate-workflow-walkthrough.js` FULL scope, normal TMPDIR, worktree:
  **exit 0, 210/210 scenarios** (`full-walkthrough.out`).
- Leg-1 replication (fixed tree overlaid on a clone, FULL walkthrough under `TMPDIR=.`):
  **exit 0, 0 live-polled escapes, `git status` byte-identical before/after** — the filed
  harm (archive-band tracked-file mutation + spurious #333 failure) is gone
  (`leg1-full.out`).
- **No suite assertion was touched** (constraint 3), and scenario D's pin is proven still
  armed post-fix: stripping the normalisation block in a scratch copy of the fixed tree reds
  the suite at exactly the walkthrough scenario (`mut-d.out`).

## Addendum 2 — the edition walkthroughs (same class, measured then closed)

The flagged sibling exposure was measured per file before touching anything, and the set is
**five files, not three**: gitlab and gitea each carry a second, codex-variant walkthrough.
Escaper sets under `TMPDIR=.` (full run, live-polled, overlay copy, pre-fix):
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` — **22 distinct
  roots** in the checkout (module-top :21 `kw-sandbox-home-` + scenario fixtures), exit 1,
  2 left behind.
- `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` — 1
  (`kw-gl-sandbox-home-`, module-top :24), exit 0, leftover.
- `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` — 1
  (`kw-gt-sandbox-home-`, module-top :28), exit 0, leftover.
- Both codex-variant wrappers (150 lines, ZERO own temp sites) — 1 each, **transitive**: the
  `kw-sandbox-home-` root belongs to the `test-{forge}-workflow-scripts.js` child each spawns
  (its own module-top sandbox). The wrapper-top guard covers the whole child tree via env
  inheritance, so the child files needed no edit.

Fix: the SAME normalisation block, **byte-identical across all six entry points** (root
reworded to the shared text; machine-checked identity). Hand-maintained confirmed before
editing: none of the five appears anywhere in `edition-sync.js`, and `validate-script-sync.js:17`
explicitly excludes the walkthrough pair from sync — nothing here is a rendered surface.

Verified: all six entry points re-probed under `TMPDIR=.` — zero escapes, exit 0 (the codex
file flipped from 23 roots + exit 1 to clean); all five edition walkthroughs **exit 0 at full
scope under normal TMPDIR**; `validate-script-sync.js` exit 0; `test-validate-script-sync.js`
exit 0 (59 assertions); `test-relative-tmpdir-escape.js` still 48/0. **Load-bearing sync
proof**: `edition-sync.js --write` on a copy of the current tree reports "0 file(s) updated"
and all six walkthrough SHA-256s are byte-identical before/after — the implementer's sync runs
cannot overwrite these edits.

One probe was invalidated and re-run: macOS openrsync's unanchored `--exclude='kaola-workflow'`
silently skipped the whole `plugins/kaola-workflow` subtree (exact-basename match — narrower
than the bsdtar variant of the same trap, which is why only the codex file was stale), so its
first post-fix probe measured the unfixed copy. Anchored (`--exclude='/kaola-workflow'`),
re-overlaid, re-probed: clean.

## Tooling traps burned during this session (so nobody re-trips them)

- macOS bsdtar `--exclude='./kaola-workflow'` is UNANCHORED — it also dropped
  `plugins/kaola-workflow/**` from the archive, which cost two container legs. Stream an
  explicit name list via `tar -cf - -T -` instead.
- This box's Bash tool is zsh: an unquoted `$VAR` does NOT word-split — a newline-joined file
  list became ONE filename, silenced by `2>/dev/null`.
- `fs.watch` on macOS delivers a PREVIOUS watcher's events to the next one (observed twice);
  the suite absorbs them with a 150 ms settle window per scenario, plus a control-prefix
  filter.
- A `cmd | tail` exit probe lied to me once (tail's exit) — the suite itself never gates on a
  pipeline.

# Impl — the edition installers' source tree (the #969 consequence)

Worked in: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-969-970-971-972`
(branch `workflow/bundle-969-970-971-972`)

**Verification tier: `tests-green`.** The oracle already existed and was already red — the 77
installer-band failures in the two editions suites under a linked worktree. All 77 clear; both suites
now pass from **both** postures at the counts the test author measured (opencode 612, kimi 570).

## Task

Make each edition installer deploy from the tree the sync actually writes, and make it impossible for
an installer to report success having deployed nothing. Preserve all three root cases from impl-969's
stated rule (canonical → invoking checkout; generated tree → main checkout; no git checkout at all →
beside the script, never cwd). No test file touched.

## Files changed

Four, all production. No test file, no `install.sh`, no `install-all.sh`, no `CHANGELOG.md`.

| file | change |
|---|---|
| `scripts/sync-opencode-edition.js` | `+2` — a `--print-tree-root` mode (`:1002`) and its usage line (`:973`) |
| `scripts/sync-kimi-edition.js` | `+2` — the same (`:876`, `:854`) |
| `install-opencode.sh` | `+8/−1` — `SOURCE_TREE` now roots on the printed answer (`:151-158`) |
| `install-kimi.sh` | `+18/−2` — the same (`:121-128`) plus a fail-closed deploy count in `copy_skills` (`:198-206`) |

## What I chose, and why

**A read-only `--print-tree-root` on both sync scripts, plus one resolution block per installer** —
the shape impl-969 sized and declined. Each installer asks the generator where its tree lands and
composes the forge suffix onto it exactly as before.

The alternative was to recompute the main root in bash (`git rev-parse --git-common-dir` + the
fail-open fallback). That is the same rule written a second time in a second language, in the one
place where getting it wrong is silent — and it is `resolveMainRoot`'s semantics, byte-identical
across four editions, that would be duplicated. Asking the owner of the rule costs one `node`
invocation the installer was already making twice (the forge helper) and leaves exactly one wording.

`--print-tree-root` writes nothing, takes no `--forge` (the root is forge-independent), and prints one
absolute directory. `resolveMainRoot` fails open, so the consumer posture — an unpacked tarball that is
no git checkout — still resolves to the directory the script sits in. Measured, not assumed (below).

**The second half is fixed on its own merits, in `copy_skills`.** It counts what it actually deployed
and fails closed at zero, mirroring the guard `install-opencode.sh`'s `copy_tree` already keeps over
its agents. It is armed independently of the root fix — mutation-proven below with the old, defective
root line restored.

## Before / after

Baseline is the worktree at the state I found it; the "after" isolates my four files (the same fixture,
only those four replaced), and was then re-confirmed on a fresh snapshot of the whole worktree.

### The fixture

A full copy of this branch's checkout, `git init`-ed as its own main, plus a real `git worktree add` —
the shape the test author used, so posture is the only variable and this repo's transient cross-branch
tree state is out of the picture.

### The two editions suites

| run | before | after |
|---|---|---|
| opencode, from **main** | EXIT 0 — `opencode-edition test passed (612 assertions).` | EXIT 0 — 612 |
| kimi, from **main** | EXIT 0 — `kimi-edition test passed (570 assertions).` | EXIT 0 — 570 |
| opencode, from a **linked worktree** | EXIT 1 — **56 failures**, then a crash | EXIT 0 — **612, 0 failures** |
| kimi, from a **linked worktree** | EXIT 1 — **21 failures**, then a crash | EXIT 0 — **570, 0 failures** |

Baseline failure bands, exactly as briefed — opencode `P1 20, G1 20, U1 5, S1b 4, S1 3, R1 2, I1 2`;
kimi `P1 21`. Nothing else was hiding among them, and nothing new appeared: the after-state worktree
runs are **zero failures** at the same assertion totals as the main-posture runs, which is stronger
than the band grep. Note both baseline runs *crashed* partway (`ENOENT` on a manifest / `config.toml`
that no install had written), so bands past the crash never ran at all; they run now.

The after-state worktree runs print the tree-root suffix the test author added:
`[tree root: …/fx/main, not this checkout]`.

### The hermetic installer runs — exit code AND count

Hermetic `HOME`, `--target` under `$TMPDIR`, no test code involved.

```
BEFORE
  opencode/MAIN   EXIT:0  agents:14  commands:3
  opencode/WT     EXIT:1  agents:0            Install error: no agent sources found in <wt>/.opencode/agent
  kimi/MAIN       EXIT:0  skills:17
  kimi/WT         EXIT:1  skills:0            crashes at the hooks fragment, AFTER printing "Installed workflow skills →"
  kimi/WT --no-scripts  EXIT:0  skills:0      ← the silent empty install, reproduced verbatim

AFTER
  opencode/MAIN   EXIT:0  agents:14  commands:3
  opencode/WT     EXIT:0  agents:14  commands:3
  kimi/MAIN       EXIT:0  skills:17
  kimi/WT         EXIT:0  skills:17
```

Re-run on a fresh snapshot of the worktree: all four `EXIT:0`, `agents:14 commands:3` / `skills:17`.

### The consumer posture (no git checkout), preserved

An unpacked copy with `.git` and every tree removed, installer invoked with cwd set to an unrelated
directory:

```
is a git checkout?  fatal: not a git repository
NOGIT opencode EXIT:0  agents:14
NOGIT kimi     EXIT:0  skills:17
tree landed beside the script: 2 of 2
tree landed in cwd (must be 0): 0
```

### Mutation proof of the empty-deploy guard

Scratch mirror inside the throwaway fixture, carrying the **new guard** and the **old defective root
line** — the exact command that previously exited 0 having installed nothing:

```
$ install-kimi-MUTANT.sh --target <tmp> --yes --no-scripts
Install error: no skill sources found in <wt>/.kimi/skills
EXIT:1     skills deployed: 0
```

Before: `EXIT:0`, `skills deployed: 0`, and a line saying `Installed workflow skills →`.

### End to end — `./install-all.sh` from a linked worktree

```
BEFORE  EXIT:1   opencode FAIL (exit 1) · kimi FAIL (exit 1) · agents:0 · skills:0
AFTER   EXIT:0   claude PASS · opencode PASS · codex PARTIAL* · kimi PASS · agents:14 · skills:17
```

\* `codex PARTIAL` is a marketplace-plugin convergence note in a scratch fixture, unrelated to this
change and present on both sides.

### The rest of the criteria

```
$ bash -n install.sh uninstall.sh install-all.sh                 before EXIT:0    after EXIT:0
$ bash -n install-opencode.sh install-kimi.sh                    before EXIT:0    after EXIT:0
$ node scripts/validate-script-sync.js                           before EXIT:0    after EXIT:0
    OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json
    families (config + hooks dir), and 6 forge export-superset families in sync.
        committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
$ node scripts/test-install-all.js                               before EXIT:0    after EXIT:0
    install-all contract test passed (196 assertions).
$ node scripts/test-bash-block-guards.js                         after  EXIT:0
    test-bash-block-guards: all 49 assertions passed
$ node scripts/test-install-adaptive-config.js                   after  EXIT:0
    Install adaptive-config tests passed
```

## FINDING — this also repaired a `claude`-chain step, red in every worktree

`scripts/test-install-adaptive-config.js` is a literal step in `test:kaola-workflow:claude` (and
`:claude:full`), and it runs the **real** `install-opencode.sh` out of the repo root
(`scripts/test-install-adaptive-config.js:44-49`). Under the pre-fix installer in a linked worktree it
throws on exit 1 — so the fast gate itself could not pass from a worktree, which is the standard run
posture. Measured in the fixture with the committed pre-change file restored:

```
BEFORE (pre-fix installer, worktree posture)  EXIT:1
  stderr: 'Install error: no agent sources found in <wt>/.opencode/agent'
AFTER  (fixed installer, worktree posture)    EXIT:0
  Install adaptive-config tests passed
```

The real worktree has the same shape (main's `.opencode` present and current, the worktree's absent),
so the same step was red here between impl-969 landing and this change.

## For the CHANGELOG (I did not touch it) — what it means for a user

Installing the opencode or kimi edition from a **linked git worktree** works again. Before, the
opencode install failed with `no agent sources found` and the kimi install could report success having
deployed **zero** skills; both now deploy the full set, because each installer asks the generator where
the generated tree lands instead of assuming it sits beside the installer. Independently, the kimi
install now fails loudly rather than reporting success when it deploys no skills. Nothing changes for
an ordinary install from a normal checkout or from an unpacked release tarball.

## Notes for the lead

- **New CLI surface, undocumented by me:** both sync scripts gained `--print-tree-root` (read-only,
  prints one directory). `docs/api.md:1498` enumerates these scripts' modes and now names only
  `--refresh-present`; whoever owns docs this bundle should add it. I did not edit docs.
- **Residual, pre-existing, unchanged and now loud:** `copy_skills` prunes the previously deployed
  kaola skill dirs *before* copying, so an install that cannot deploy anything still removes what was
  there first — it just no longer does so silently. Reordering that is a larger change to the
  self-healing blanket-then-recopy shape, and it is outside this scope; say the word and I will do it.
- **Not guarded:** kimi's hook-script copy and opencode's hooks copy can still print their success
  line over an empty source. They are unreachable behind the skills/agents guard, which runs first and
  exits — the whole-install property ("never exit 0 having deployed nothing") holds — so I added no
  second and third guard.
- **Live installs untouched, and how I know:** every installer run redirected `HOME` and `--target`
  into `$TMPDIR`. Afterwards, `find ~/.claude/kaola-workflow ~/.config/opencode ~/.kimi-code
  ~/.config/kaola-workflow -mmin -20` returned nothing at all. The only recent writes anywhere near
  them are `~/.codex` sqlite/session state from a live Codex CLI process — no installer writes there.
- **Main's edition trees are not mine.** Their newest files are `01:06:38` (`.opencode`) and `01:08:51`
  (`.kimi`); my first action in this task was `01:13:26`. Another agent's `generate-routing-surfaces
  --write` refreshed them, exactly the live cost impl-969 documented. My runs left them alone and left
  no edition tree inside the worktree.

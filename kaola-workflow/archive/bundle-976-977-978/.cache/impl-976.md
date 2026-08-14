# Implementation — issue #976 (relative-TMPDIR escape: 8 installer sites + Node choke point)

Implementer: impl976. Production only; no test file touched. All mutation induction ran in a
scratch mirror (`<scratchpad>/mirror976`, deleted after), never the checkout or its worktrees.
Tree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-976-977-978`, branch
`workflow/bundle-976-977-978`, base HEAD 51db5d2d.

## Task

Make `node scripts/test-relative-tmpdir-escape.js` green without editing it: no installer or
fixture temporary root created inside the working checkout, whatever TMPDIR holds. Scope ruled by
the owner: the 8 shell installer sites + one shared choke point for the Node surface.

**Verification tier: tests-green** (the authored oracle 48/0 exit 0, plus the adjacent pinned
suites — details below).

## What changed, per site

**Shell — one guard, three installers, eight sites.** Each installer gets the `KW_TMPDIR`
absolute-or-`/tmp` guard verbatim from the install-all.sh:43-52 precedent (same variable name,
same case-statement shape — `${TMPDIR:-/tmp}` guards only an EMPTY value, which is mutation M2's
exact misunderstanding), and every mktemp site becomes an explicit template under it:

- `install.sh` — guard inserted directly after `set -euo pipefail`, deliberately BEFORE the
  curl|bash bootstrap block so the bootstrap site is covered:
  - bootstrap: `mktemp -d` → `mktemp -d "$KW_TMPDIR/kaola-workflow-bootstrap.XXXXXX"`
  - `install_managed_agent`: `mktemp` → `mktemp "$KW_TMPDIR/kaola-workflow-agent.XXXXXX"`
  - `install_agent_files`: `manifest_tmp` → `"$KW_TMPDIR/kaola-workflow-manifest.XXXXXX"`,
    `prev_manifest` → `"$KW_TMPDIR/kaola-workflow-manifest-prev.XXXXXX"`
- `install-opencode.sh` — guard after `set -euo pipefail`; `copy_tree`'s `prev_manifest` →
  `"$KW_TMPDIR/kaola-opencode-manifest-prev.XXXXXX"`, `manifest_tmp` →
  `"$KW_TMPDIR/kaola-opencode-manifest.XXXXXX"`; `seed_config`'s `rendered` →
  `"$KW_TMPDIR/kaola-opencode-config.XXXXXX"`
- `install-kimi.sh` — guard after `set -euo pipefail`; `merge_hooks_config`'s backup →
  `mktemp "$KW_TMPDIR/kaola-kimi-hooks.XXXXXX"`.

**The kimi `-t` repair is deliberate, not a side effect.** `mktemp -t kaola-kimi-hooks` is a
template with no X's: it escapes on no measured platform, but on GNU coreutils it hard-errors
("too few X's in template"), exit 1, and under `set -euo pipefail` (install-kimi.sh) that ABORTED
the entire kimi install whenever a config.toml existed. The explicit `.XXXXXX` template is
GNU-legal, so this change intentionally makes the GNU install with an existing config SUCCEED
where it previously died — the behaviour change scenario C pins, and the in-code comment at the
site states it. The backup/restore mechanism itself is unchanged (scenario C2's doctor-reject
restore path still restores byte-identically — verified by the green C2 pin plus the test
author's M3 matrix).

**Node — the choke point is a require-time TMPDIR/TMP/TEMP normalisation in the kernel**
(`scripts/kaola-workflow-adaptive-schema.js`, directly below the header): any of the three vars
that is non-empty and non-absolute is rewritten to `/tmp`; absolute values pass untouched; empty
stays empty (it already reaches every `:-`/`||` fallback). The kernel header's "side-effect-free"
clause is amended to name this one deliberate exception.

Why there, and not per-site: the kernel is the ONLY module every temp-creating production script
loads at module start — run-chains requires it at :145, sink-merge at :9, and any caller of the
kernel's own `snapshotWorktree` barrier-index site has necessarily required the kernel first. So
one statement covers run-chains.js:326 (`kw-chain-`), sink-merge.js:2175/:3243 (`kw-wtsync-`) AND
its :3132/:3170 `process.chdir(os.tmpdir())` no-op hazard, adaptive-schema's own `kw-barrier-idx-`
site, every future `os.tmpdir()` call in those processes, and — because children inherit env —
every child they spawn. The alternative (per-site `tmpBase()` edits) fixes only the sites it
names and leaves the chdir and child-env hazards standing.

One supporting edit: `scripts/kaola-workflow-validation-runner.js` currently loads the kernel
only lazily (first at :974, inside functions), so as a STANDALONE CLI its sandbox/temp paths
(:193-194, :547, :606, :761) could be built before any kernel load. A top-level
`require('./kaola-workflow-adaptive-schema')` with a comment saying it is load-bearing closes
that; it is what makes "every temp-creating production script loads the kernel at module start"
true rather than aspirational. (Under run-chains it was already covered transitively.)

**Not "absolute", "not cwd-resolved":** the guard rewrites only NON-absolute values. An absolute
TMPDIR inside a repository passes untouched — test-run-chains T30 pins that and stayed green.
Neither dead idiom is used anywhere in the change.

**Edition propagation.** Kernel + validation-runner are 4-copy byte-identical groups. Edited the
root copies, then `node scripts/edition-sync.js --write` (exit 0 — exactly the 6 expected plugin
copies updated, nothing else). Byte-identity re-verified two ways: `shasum -a 256` (kernel
3c13cc5f… ×4; validation-runner 2f34808c… ×4) and `node scripts/validate-script-sync.js` (exit 0,
27 byte-identical groups in sync). The #978 sink-merge ports were NOT disturbed: sha256 of
`scripts/kaola-workflow-sink-merge.js`, its plugins/kaola-workflow copy, and the renamed
gitlab/gitea ports are identical before and after the `--write`
(`<scratchpad>/impl976-sinkmerge-pre-sync.txt`).

## Files changed (all under the worktree root)

- `install.sh` — KW_TMPDIR guard + 4 sites
- `install-opencode.sh` — guard + 3 sites (my hunks only; the RETIRED_HOOKS/uninstall hunks in
  the same file are another agent's #977 work, preserved)
- `install-kimi.sh` — guard + 1 site + the deliberate `-t` repair comment (other agents' hunks
  in this file likewise preserved)
- `scripts/kaola-workflow-adaptive-schema.js` — header amendment + normalisation block
- `scripts/kaola-workflow-validation-runner.js` — hoisted top-level kernel require
- `plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/scripts/` — the same two
  files ×3, via edition-sync (byte-identical)

## Verification (command → real exit code, `$?` checked directly, never through a pipe)

Before (baseline, this worktree at the same HEAD):
- `node scripts/test-relative-tmpdir-escape.js` → **exit 1, 39 passed / 9 failed**
  (`<scratchpad>/impl976-baseline-oracle.out`)
- `node scripts/test-run-chains.js` → exit 0, 283 assertions
- `node scripts/test-install-all.js` → exit 0, 254 assertions

After:
1. `bash -n install.sh` / `install-opencode.sh` / `install-kimi.sh` → exit 0 / 0 / 0
2. `node scripts/test-relative-tmpdir-escape.js` → **exit 0, 48 passed / 0 failed**
   (`<scratchpad>/impl976-postfix-oracle.out`). NOTE: this run includes the test custodian's own
   walkthrough fix (task #10, landed in the worktree in parallel) — scenario D's two module-load
   escapers are simulate-workflow-walkthrough.js:22/:13192, a test file under their custody; I
   measured and reported that no production-only edit can reach them (the walkthrough loads only
   test-spawn-census and test-git-fixture before :22, neither of which touches production code)
   and the split was routed accordingly.
3. `node scripts/test-run-chains.js` → exit 0, 283 assertions — T30 (absolute TMPDIR inside a
   repo) and the :1048/:1104/:1185 hand-down pins intact at the same count as baseline
4. `node scripts/test-install-all.js` → exit 0, 254 assertions — the #975 fix not regressed
5. `node scripts/edition-sync.js --check` → exit 0; `node scripts/validate-script-sync.js` → exit 0
6. Full walkthrough `node scripts/simulate-workflow-walkthrough.js` → **exit 0, 210/210
   scenarios passed** (`<scratchpad>/impl976-walkthrough-full.out`) — run after all edits, so the
   kernel's require-time normalisation is exercised by every production script the walkthrough
   drives (2432 spawns)
7. `node scripts/test-validation-runner.js` → exit 0 (PASSED); `node
   scripts/test-validation-allowband.js` → exit 0 (17 assertions) — required for the
   validation-runner hoist, run from the worktree with cwd verified by `pwd` in the same call
8. Idempotence probe (`<scratchpad>/impl976-idempotence-probe.js`, output
   `impl976-idempotence-probe.out`) → exit 0, 9/9 checks: relative TMPDIR/TMP/TEMP → `/tmp`;
   a second require (cache cleared so the block genuinely re-executes) is a byte no-op; an
   absolute symlinked path is NOT realpathed (`/tmp/x` stays `/tmp/x`); a trailing slash
   survives (`/private/tmp/some-repo/sub/`); empty stays empty; and after a run-chains-style
   hand-down assigns an absolute private root, a later kernel require leaves it byte-identical
9. Final re-run after the constraint-3 comment reword (below): oracle → exit 0, 48/0
   (`<scratchpad>/impl976-final-oracle.out`); probe → exit 0; validate-script-sync → exit 0

## Team-lead constraints on the choke point, and their evidence

1. **Normalise only when relative** — the guard's predicate is `val && !isAbsolutePath(val)`;
   absolute values are never assigned at all, so no canonicalisation and no tidying can occur.
   Proven by probe checks 5–7 and by test-run-chains T30 green at the baseline assertion count.
2. **Once and idempotently** — proven by measurement, not assumed: probe check 4 re-executes
   the block against its own output (byte no-op), and check 9 re-executes it after an absolute
   hand-down root was assigned (byte-identical). Structurally, the block's only output is
   `'/tmp'`, which its own predicate excludes.
3. **The comment must not overclaim** — the kernel comment names only Node-side mechanisms
   measured in this bundle's records on both macOS and Linux (os.tmpdir verbatim;
   realpathSync-after-creation), and says nothing about mktemp, the shell sites, or any
   platform. One clause was reworded under this constraint: "'/tmp' is what os.tmpdir() falls
   back to when nothing is set" (a platform-general claim I had not measured everywhere) became
   the repo-fact "the same floor the repo's existing absolute-or-'/tmp' guards normalise to".
   The shell-side comments state the GNU behaviour as GNU-specific — measured on coreutils 9.7
   (premise) and 9.1 (test author's container leg), never generalised from this Mac.

**Sink-merge non-disturbance, what was actually compared**: sha256 of all four sink-merge
surfaces — `scripts/kaola-workflow-sink-merge.js`,
`plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`,
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`,
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` — captured BEFORE my
first `edition-sync --write` (`<scratchpad>/impl976-sinkmerge-pre-sync.txt`) and again after the
second (`impl976-sinkmerge-post-sync.txt`); `diff` of the two capture files is empty. Both
`--write` runs also printed exactly which files they touched (6 then 3 — kernel and
validation-runner copies only, never a sink-merge surface).

test-sink-merge was NOT run here: I did not edit sink-merge (the brief conditions that suite on
touching :2166; the kernel covers it at require time), and the file is mid-flight #978 work owned
by another agent — its verdict on today's tree is theirs.

## Mutation proof (scratch mirror of the fixed tree; oracle run inside the mirror; mirror deleted)

- **Mutation A — kernel guard degraded to empty-only** (`if (val && !isAbsolutePath(val))` →
  `if (val === '')`): oracle **exit 1, 46/2** — exactly the two run-chains pins red (private
  chain root inside the runner's cwd; `kw-barrier-idx-*`/`kw-chain-*` beside the fixture root).
  The Node guard is load-bearing and the suite sees it. (`<scratchpad>/impl976-mutA-oracle.out`)
- **Mutation B — shell guard degraded to bare `${TMPDIR:-/tmp}`** (case statement removed in all
  three installers): oracle **exit 1, 41/7** — all seven installer location pins red (16/16 and
  3/3 inside; kimi backup `kaola-kimi-hooks.LwRIap` beside the checkout in both C and C2). Note
  the degraded kimi install no longer aborts (the template carries X's) yet still fails on
  location — the suite does not need the abort to catch the escape.
  (`<scratchpad>/impl976-mutB-oracle.out`)

Each mutation was applied alone against the otherwise-fixed mirror and the original restored
(verified by diff) before the next.

## Chosen NOT to do

- **No per-site edits at the four Node production sites** — the require-time choke point reaches
  them all; their code is untouched (and so stays in step with the #978 sink-merge work).
- **No TMPDIR export from the shell installers** — the KW_TMPDIR variable scopes the fix to the
  installer's own mktemp calls; the installers' node children didn't escape at baseline (measured
  by the suite's observers) and any that require the kernel are covered by the choke point.
- **No rejection of absolute-inside-repo TMPDIR** anywhere (T30's pinned legitimacy).
- **No edit to adaptive-schema:1010's "index lives OUTSIDE the repo" comment** — the premise
  flagged it as false under a relative TMPDIR; with normalisation at the top of the same module
  it is true again as written.
- **No walkthrough/test edits** — simulate-workflow-walkthrough.js's own escapers were reported
  as a custody finding and fixed by the test custodian (task #10), not by me.
- **CHANGELOG/README** — left to the bundle's doc pass; not part of the ruled implementation
  scope. Flagged here so it is a visible omission, not a silent one.

`<scratchpad>` = /private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/753f1e81-4413-4c89-9ade-8644be970a42/scratchpad

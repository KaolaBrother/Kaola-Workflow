# Premise check — issue #941 (`sync-opencode-edition.js` remediation footer)

**Verdict in one line:** all three claims **CONFIRMED**, and the issue **understates the defect** —
the footer is wrong for **two** mismatch classes, not one, and one of those two is fixable by
**neither** `--write` nor `--write-config`.

## Setup

- Repo: `/Users/ylpromax5/Workspace/Kaola-Workflow`, branch `main`, HEAD `d2ab06c2800963957d740db1dc9d4f019d0c53b5`
- Working tree at start: clean except the untracked run folder `kaola-workflow/bundle-940-941-942-943-944/`
- `scripts/sync-opencode-edition.js` — 937 lines
- Reproduction host: a `rsync -a --exclude .git` copy of the repo at
  `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/e2e7977c-61d4-41bc-a290-3fc8f13cdf1e/scratchpad/repo941`.
  **No tracked file in the real repo was modified.** `git status --porcelain` after all real-tree
  runs still shows only the untracked run folder.

### Baseline

```
$ node scripts/sync-opencode-edition.js --forge=github --check
sync-opencode-edition[github]: 14 agent(s) + 3 command(s) + 1 plugin(s) in parity with canonical.
$ echo $?
0
```

(Exit code captured by redirecting stdout/stderr to files and echoing `$?` on its own line — not
read off a pipeline tail.)

The scratch copy reproduced the same green baseline before any mutation, so every mismatch below is
one I planted.

---

## Claim 1 — unconditional remediation footer at line ~870

> Line ~870 prints an UNCONDITIONAL remediation footer on any `--check` failure:
> `Fix: node scripts/sync-opencode-edition.js --forge=github --write`.

### Verdict: **CONFIRMED** (line number exact)

```
$ git grep -nP 'Fix: node scripts/sync-opencode-edition' -- scripts/
scripts/sync-opencode-edition.js:870:    console.error('Fix: node scripts/sync-opencode-edition.js --forge=' + forge + ' --write');
```

The emit site is the tail of `runCheck()`, `scripts/sync-opencode-edition.js:867-873`:

```js
  if (mismatches.length) {
    console.error('sync-opencode-edition[' + forge + ']: PARITY FAILED (' + mismatches.length + ' file(s)):');
    for (const m of mismatches) console.error('  - ' + m.rel + ' — ' + m.reason);
    console.error('Fix: node scripts/sync-opencode-edition.js --forge=' + forge + ' --write');
    process.exitCode = 1;
    return;
  }
```

It is inside `if (mismatches.length)` and outside the per-mismatch loop: it is emitted **once, for
any non-empty mismatch set, regardless of which classes are in it**. It is the only emit of that
string in `scripts/` (the other hits in the repo are archived `.cache/` run records, not code).
Observed in **every** one of the 14 planted-failure runs below.

The forge is interpolated, so the advice tracks `--forge=`. Measured on the real tree:

```
$ node scripts/sync-opencode-edition.js --forge=gitlab --check
sync-opencode-edition[gitlab]: PARITY FAILED (3 file(s)):
  - .opencode-gitlab/command/kaola-workflow-finalize.md — stale — regenerate
  - .opencode-gitlab/command/workflow-init.md — stale — regenerate
  - .opencode-gitlab/plugins/kaola-workflow-hooks.js — drifted from canonical templates/opencode/plugins/
Fix: node scripts/sync-opencode-edition.js --forge=gitlab --write
EXIT=1
```

---

## Claim 2 — `--write` cannot fix the stale-`opencode.json` class

> At `:661-666`, with the file already present, `--write` prints `preserve opencode.json
> (user-owned; use --write-config to overwrite)` and does NOT rewrite it. The correct flag is
> `--write-config`.

### Verdict: **CONFIRMED**

Source, `scripts/sync-opencode-edition.js:660-668` (issue cited `:661-666`; the function spans
660-668, the preserve branch is 661-664 with the message on 662):

```js
function writeConfig(force) {
  if (!force && fs.existsSync(OPENCODE_JSON)) {
    console.log('preserve   opencode.json (user-owned; use --write-config to overwrite)');
    return 0;
  }
  fs.writeFileSync(OPENCODE_JSON, renderOpencodeJson());
  console.log((force ? 'rewrote    ' : 'seeded     ') + 'opencode.json');
  return 1;
}
```

`--write` → `runWrite(false, forge)` → `writeConfig(false)`; `--write-config` →
`runWrite(true, forge)` → `writeConfig(true)` (`scripts/sync-opencode-edition.js:906-907`). The
literal string carries three spaces after `preserve`, not one.

### Reproduction — the advised command shown NOT to fix what was reported

Staleness planted in the scratch copy by reverting `opencode.json`'s reasoning-role roster to its
pre-`54cbe8d3` state (dropping `adversarial-verifier` and `build-error-resolver`) — i.e. exactly the
real drift the `#F8` guard at `:864-866` exists to catch.

**Step 1 — `--check`:**
```
$ node .../repo941/scripts/sync-opencode-edition.js --forge=github --check
sync-opencode-edition[github]: PARITY FAILED (1 file(s)):
  - opencode.json — stale — regenerate via --write-config
Fix: node scripts/sync-opencode-edition.js --forge=github --write
EXIT=1
```
The output **contradicts itself in two adjacent lines**, and the wrong one is last.

**Step 2 — run the footer's own advice:**
```
$ node .../repo941/scripts/sync-opencode-edition.js --forge=github --write
preserve   opencode.json (user-owned; use --write-config to overwrite)
sync-opencode-edition[github]: write complete (0 file(s) updated — tree already in sync).
EXIT=0
```
Note the two aggravating factors: exit **0**, and the summary line asserts **"tree already in
sync"** while the reported mismatch is untouched. A caller that gates on the exit code sees success.

**Step 3 — `--check` again:**
```
$ node .../repo941/scripts/sync-opencode-edition.js --forge=github --check
sync-opencode-edition[github]: PARITY FAILED (1 file(s)):
  - opencode.json — stale — regenerate via --write-config
Fix: node scripts/sync-opencode-edition.js --forge=github --write
EXIT=1
```
**The mismatch persists, byte-identically.** Following the advice changed nothing.

**Step 4 — `--write-config`:**
```
$ node .../repo941/scripts/sync-opencode-edition.js --forge=github --write-config
rewrote    opencode.json
sync-opencode-edition[github]: write complete (1 file(s) updated).
EXIT=0

$ node .../repo941/scripts/sync-opencode-edition.js --forge=github --check
sync-opencode-edition[github]: 14 agent(s) + 3 command(s) + 1 plugin(s) in parity with canonical.
EXIT=0
```
`diff` against the pre-mutation snapshot: exit 0 (byte-identical restoration).

### Mixed batch — the footer produces a *partial* fix, which is worse

Planted agent-stale **and** config-stale together:
```
--- check: PARITY FAILED (2 file(s))
  - .opencode/agent/investigator.md — stale — regenerate
  - opencode.json — stale — regenerate via --write-config
Fix: node scripts/sync-opencode-edition.js --forge=github --write        EXIT=1
--- --write:
generated  .opencode/agent/investigator.md
preserve   opencode.json (user-owned; use --write-config to overwrite)
sync-opencode-edition[github]: write complete (1 file(s) updated).       EXIT=0
--- check: PARITY FAILED (1 file(s))
  - opencode.json — stale — regenerate via --write-config
Fix: node scripts/sync-opencode-edition.js --forge=github --write        EXIT=1
```
The advised command reports success (`1 file(s) updated`, exit 0) while silently leaving one of the
two reported mismatches in place.

---

## Claim 3 — the per-mismatch reason at `:865` is correct, and the footer is last

> The per-mismatch reason emitted at `:865` is already correct and names the right remedy; only the
> unconditional footer misleads, and it is the last line printed.

### Verdict: **CONFIRMED**

`scripts/sync-opencode-edition.js:864-866`:

```js
  if (fs.existsSync(OPENCODE_JSON) && read('opencode.json') !== renderOpencodeJson()) {
    mismatches.push({ rel: 'opencode.json', reason: 'stale — regenerate via --write-config' });
  }
```

Line 865 carries the reason string, and it names `--write-config` — measured correct in Step 4
above. The footer at 870 is emitted after the reason loop and is the **last** line of `--check`
output in every failing run captured here (14 planted classes + 4 follow-ups).

---

## Every mismatch class `--check` can report, and the flag that clears it

All 14 classes were planted individually in the scratch copy and driven through
`--check → --write → --check → --write-config → --check`. Full transcript:
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/e2e7977c-61d4-41bc-a290-3fc8f13cdf1e/scratchpad/classes.out`.

| # | src line | reason string | how planted | `--write` clears? | `--write-config` clears? | **footer correct?** |
|---|---|---|---|---|---|---|
| C1 | 796 | `missing generated agent` | rm `.opencode/agent/investigator.md` | **yes** | yes | yes |
| C2 | 800 | `stale — regenerate` (agent) | append to that agent | **yes** | yes | yes |
| C3 | 806 | `missing generated command` | rm `.opencode/command/workflow-next.md` | **yes** | yes | yes |
| C4 | 810 | `stale — regenerate` (command) | append to that command | **yes** | yes | yes |
| C5 | 815 | `missing hook script copy` | rm `.opencode/hooks/…dispatch-log.sh` | **yes** | yes | yes |
| C6 | 818 | `drifted from canonical hooks/` | append to that hook | **yes** | yes | yes |
| C7 | 823 | `missing generated plugin` | rm `.opencode/plugins/kaola-workflow-hooks.js` | **yes** | yes | yes |
| C8 | 827 | `drifted from canonical templates/opencode/plugins/` | append to that plugin | **yes** | yes | yes |
| C9 | 838-841 | `unregistered plugin '<f>' … absent from PLUGIN_SCRIPTS — add it to the allowlist` | add `templates/opencode/plugins/zzz-rogue-plugin.js` | **NO** | **NO** | **NO — neither flag** |
| C10 | 848 | `retired surface not in canonical — prune (--write removes it)` (command) | add `.opencode/command/zzz-retired-command.md` | **yes** | yes | yes |
| C11 | 851 | `retired surface not in canonical — prune (--write removes it)` (agent) | add `.opencode/agent/zzz-retired-agent.md` | **yes** | yes | yes |
| C12 | 856 | `retired artifact no longer emitted — prune (--write removes it)` (hook) | add `.opencode/hooks/zzz-retired-hook.sh` | **yes** | yes | yes |
| C13 | 859 | `retired artifact no longer emitted — prune (--write removes it)` (plugin) | add `.opencode/plugins/zzz-retired-plugin.js` | **yes** | yes | yes |
| C14 | 865 | `stale — regenerate via --write-config` | roster drift in `opencode.json` | **NO** | **yes** | **NO** |

**Answer to the key question:** `--write` is correct for **12 of 14** classes. It is wrong for **two**:

- **C14** (`opencode.json` stale) — the class the issue names. `--write-config` clears it.
- **C9** (unregistered plugin) — a class the issue does **not** name, and for which **no flag of this
  script is a fix at all**. Measured:

```
--- check #1: PARITY FAILED (1 file(s))
  - templates/opencode/plugins/zzz-rogue-plugin.js — unregistered plugin … add it to the allowlist
--- --write:        write complete (0 file(s) updated — tree already in sync).   EXIT=0
--- check #2: PARITY FAILED (1 file(s))   … same mismatch …                       EXIT=1
--- --write-config: write complete (1 file(s) updated).                           EXIT=0
--- check #3: PARITY FAILED (1 file(s))   … same mismatch …                       EXIT=1
```

  The remedy is a **source edit** — adding the basename to `PLUGIN_SCRIPTS`
  (`scripts/sync-opencode-edition.js:88-90`) — which is exactly what its own reason string says. Here
  too the reason is right and only the footer is wrong; `--write` again exits **0** claiming "tree
  already in sync".

### `--write-config` is a strict superset of `--write`

Measured directly (planted two non-config mismatches, then ran **only** `--write-config`):

```
--- check: PARITY FAILED (2 file(s))
  - .opencode/agent/investigator.md — missing generated agent
  - .opencode/command/workflow-next.md — stale — regenerate
--- --write-config ONLY:
generated  .opencode/agent/investigator.md
generated  .opencode/command/workflow-next.md
rewrote    opencode.json
sync-opencode-edition[github]: write complete (3 file(s) updated).   EXIT=0
--- check: … in parity with canonical.                               EXIT=0
```

This follows from `--write-config` being `runWrite(true, …)` (`:907`) — the same body as `--write`
plus the forced config write. So `--write-config` clears 13 of the 14 classes.

**It is not a safe blanket replacement for the footer, though**, because it destroys user state —
see the next section.

---

## Beyond the issue: three further measured facts a fix has to account for

### (a) A legitimate, documented user pin reads as `stale`, and the only clearing command destroys it

`opencode.json` invites the user to hand-edit it (`:578-583`, rendered into the file): *"To pin a
tier, uncomment & set it below … This file is user-owned: re-running `--write` regenerates
agents/commands but preserves your model choices here."*

Clean A/B, one axis (the `KAOLA_OPENCODE_*_MODEL` env pin), using the renderer itself to produce the
pinned bytes so the comparison is not confounded by my hand-formatting:

```
$ KAOLA_OPENCODE_STANDARD_MODEL=anthropic/claude-sonnet-4-5 node … --write-config-to …/opencode.json
seeded     …/opencode.json

LEG A — check WITH the env var set:
  sync-opencode-edition[github]: 14 agent(s) + 3 command(s) + 1 plugin(s) in parity …   EXIT=0

LEG B — check WITHOUT the env var:
  sync-opencode-edition[github]: PARITY FAILED (1 file(s)):
    - opencode.json — stale — regenerate via --write-config                             EXIT=1
```

A hand-pinned `opencode.json` also reads stale (measured separately), `--write` correctly preserves
it (`grep -c` for the pin: 2 before, 2 after), and `--write-config` removes the pin line (2 → 1; the
survivor is the `e.g.` example in the comment block at line 11).

So for C14 the three outcomes are: `--write` = no fix, preserves user state; `--write-config` = fix,
destroys user state; and a user who used the documented pin feature has a **permanently red
`--check`** with no non-destructive remedy.

### (b) `install-opencode.sh` implements the footer's advice and inherits the defect

`install-opencode.sh:156-160`, under `set -euo pipefail` (`:61`):

```bash
  node "$SCRIPT_DIR/scripts/sync-opencode-edition.js" --forge="$FORGE" --check >/dev/null 2>&1 \
    || node "$SCRIPT_DIR/scripts/sync-opencode-edition.js" --forge="$FORGE" --write >/dev/null
```

Composing the two exit codes measured above for a C14 or C9 tree: `--check` exits 1, `--write` exits
0, so the `||` compound exits 0 and the installer proceeds — **silently, with output discarded** —
from a tree it just failed to repair. (The two exit codes are measured; the composition is
`sh` semantics, not a separate measurement. I did **not** run the installer, since it deploys into
`$HOME`.)

### (c) The `gitlab` and `gitea` opencode trees are out of parity **on `main` right now**

Measured read-only on the real repo at `d2ab06c2` (see the Claim 1 transcript): both
`--forge=gitlab` and `--forge=gitea` report the same 3 mismatches —
`command/kaola-workflow-finalize.md` stale, `command/workflow-init.md` stale, and
`plugins/kaola-workflow-hooks.js` drifted. These trees are gitignored, so `git status` is blind to
it. For **these** mismatches the footer's `--write` is the correct advice; this is a separate,
pre-existing defect, not part of #941.

### (d) The kimi twin's identical footer is currently correct — do not "fix" it in sympathy

`scripts/sync-kimi-edition.js:780` emits the same shape. But its `runCheck` has only 10 mismatch
constructors (`:736,740,747,751,756,759,764,766,770,775`), none of which is a user-owned-config or
an unregistered-allowlist class, and it has no `--write-config` flag at all. Every class it can
report is cleared by its `--write`.

### (e) Nothing pins the footer wording

`git grep` finds no test asserting `Fix: node scripts/…` or `PARITY FAILED` for this script;
`scripts/test-opencode-edition.js:635` only mentions `--write-config` inside an assertion *label*
(A7). The live hits elsewhere are archived `.cache/` run records. Changing the footer text breaks no
existing assertion — which also means **no existing test would catch a wrong footer**, then or now.

---

## Observations vs inferences

**Observations** (reproducible by the commands above): claims 1, 2 and 3 as stated; the 14-class
table; the `--write-config` superset result; the pin A/B; the gitlab/gitea red on `main`; the kimi
constructor inventory; the absence of any test pinning the footer.

**Inferences**, labelled as mine:

- *The footer is wrong for two classes, not one, and C9 has no flag-shaped remedy at all* —
  confidence **high**; refuted by finding any invocation of this script that clears C9, or any other
  reachable mismatch constructor I missed. I enumerated constructors by `git grep -nP "reason:"` over
  `runCheck` and planted each one; a class emitted from somewhere other than a `mismatches.push`
  would escape that.
- *Simply swapping the footer to `--write-config` would trade a misleading message for a destructive
  one* (it clears 13/14 but clobbers user pins, per (a)) — confidence **high**; refuted by showing
  `--write-config` preserves a user pin, which measurement (a) contradicts.
- *A per-mismatch-derived footer is the shape the evidence supports* (the reason strings are already
  individually correct in all 14 classes; only the aggregate line is wrong) — confidence **medium**;
  this is a design opinion, not a measurement, and choosing the fix is not mine.

## Open / unmeasured

- I did **not** run `install-opencode.sh`; its behaviour in (b) is composed from measured exit codes
  plus shell semantics, not observed end-to-end. Measuring it would deploy into `$HOME`.
- I did **not** repair the gitlab/gitea parity red in (c) — out of scope, and it mutates gitignored
  trees in the real repo.
- I did not exercise `--write-config-to` beyond using it as a byte-exact renderer for the A/B; it
  has no `--check` class of its own.
- Only the `github` forge was used for the 14-class matrix. The class set is forge-independent by
  construction (`runCheck` builds the same loops for every forge, with `treeLabel(forge)` swapped in),
  but I measured only that `opencode.json` — the un-suffixed, forge-neutral path — is checked
  identically under all three forges.

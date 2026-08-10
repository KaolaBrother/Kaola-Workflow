# Implementation — issue #941 (`sync-opencode-edition.js` remediation footer)

**Baseline:** `d2ab06c2800963957d740db1dc9d4f019d0c53b5`
**Worktree:** `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-940-941-942-943-944`
(branch `workflow/bundle-940-941-942-943-944`). Nothing committed.

**Verification tier:** `tests-green`.

**File changed:** `scripts/sync-opencode-edition.js` only (+58 −14). No test file was written or
modified. `scripts/sync-kimi-edition.js` is untouched.

---

## The design, and why this one

**The remedy is a property of the mismatch class, so it is decided where the mismatch is
constructed.** Each of the 14 `mismatches.push({...})` sites now carries a third field, `remedy`,
alongside `rel` and `reason`. The closing advice is derived from the set of remedies actually
present in the report; nothing re-reads the reason strings, and nothing pattern-matches paths.

```js
const REMEDY = {
  WRITE: 'write',                 // --write regenerates or prunes it
  WRITE_CONFIG: 'write-config',   // only --write-config clears it: --write preserves the user-owned config
  SOURCE_EDIT: 'source-edit',     // no flag of this script clears it; the reason names the edit
};
```

Assignment follows the premise report's measured 14-class table exactly: 12 × `WRITE`, C14
(`opencode.json` stale) → `WRITE_CONFIG`, C9 (unregistered plugin) → `SOURCE_EDIT`.

`remediationLines(mismatches, forge)` turns that set into the closing lines:

| remedies present | lines emitted |
|---|---|
| any `WRITE_CONFIG` | `Fix: node scripts/sync-opencode-edition.js --forge=<f> --write-config` + a one-line caveat |
| else any `WRITE` | `Fix: node scripts/sync-opencode-edition.js --forge=<f> --write` |
| neither | no invocation of this script at all |
| any `SOURCE_EDIT` (independently) | `No flag of this script clears <rels> — apply the source edit …` |

`--write-config` is `runWrite(true)`, a strict superset of `--write`, so when the set contains C14
it is the single command that clears the whole flag-clearable part — a mixture needs one command,
not two. It is named **only** when something in the set requires it, which is what keeps the 12
common classes on the exactly-`--write` line they are right about.

### Why this shape rather than the test author's `FOOTER_FIXED`

The reference in `scratchpad/t941/mutate.js` derives "needs config flag" from `m.rel ===
'opencode.json'` and "no flag helps" from a `templates/opencode/plugins/` prefix. Both are
coincidences of today's class table: a second user-owned config, or a source-edit class that is not
a plugin, would silently get the wrong advice and nothing would say so. Attaching `remedy` at the
push site means a fifteenth class cannot be added without its author answering the question — and
if they answer nothing, the derivation falls through to "no command offered", which is the safe
direction (a missing line, never a wrong one).

### The one judgment call — the caveat line

When `--write-config` is advised, a second line follows it:

```
     (--write preserves the user-owned opencode.json and leaves it stale; --write-config rewrites
      it, discarding any model pins set there.)
```

The test design deliberately leaves this unpinned ("a value call about what the product should
do"). I included it because premise §a measured that a **legitimate, documented** user pin is
exactly what produces C14, and `--write-config` is then the only clearing command — so the footer
would otherwise tell such a user to run the one command that erases their own configuration,
without saying so. It changes no advised command and no exit code; it is a single `console.error`
and trivially removable if the user prefers the terser footer.

The caveat is a **separate line** on purpose: appended to the `Fix:` line it would be swallowed
into the advised argv by any reader (including A30's `ADVICE_RE`, which stops only at `\n` and
shell operators).

### Not pinned, deliberately

- The 12 write-clearable classes still emit the byte-identical old line (`--forge=<f> --write`).
- `SOURCE_EDIT` mismatches never suppress a `Fix:` line that other mismatches in the same set have
  earned — the two lines are independent (verified in reproduction 2c).

---

## Verification

All exit codes captured with `echo $?` on its own line, never off a pipeline tail.

| command | before | after |
|---|---|---|
| `node scripts/test-opencode-edition.js` | **exit 1** — `7 failure(s), 550 passed` | **exit 0** — `555 assertions` |
| `node scripts/test-kimi-edition.js` | **exit 0** — `516 assertions` | **exit 0** — `516 assertions` |

The 7 baseline failures were all A30's, verbatim as the test artifact predicted.

**The assertion count moves 557 → 555, and that is arithmetic, not loss.** In the C9-alone
scenario `advised` is now empty, so two loops that ranged over it (`no no-op advice`, `no blanket
--write-config`) evaluate zero times instead of one each. 41 − 2 = 39, which is exactly the count
the test author measured for their `fixed` mutation.

Transcripts: `scratchpad/{oc-before,oc-final,kimi-before,kimi-final}.txt`.

**Files touched, confirmed:** `git status --porcelain` in the worktree shows
`scripts/sync-opencode-edition.js` as the only production file I modified; the other modified paths
(`kaola-workflow-resolve-agent-model.js`, `test-install-model-rendering.js`, `test-kimi-edition.js`,
`test-opencode-edition.js`) belong to concurrent agents. The main checkout carries only the
untracked run folder. `git ls-files | grep sync-opencode-edition.js` → **1** copy; this script has
no per-edition duplicate to keep in sync.

---

## End-to-end reproductions

Host: `scratchpad/repo941fix` — an `rsync -a --exclude .git --exclude .kw` copy of the worktree,
seeded with `--write` and asserted **green** (`exit 0`) before anything was planted. **Nothing was
planted into the real repo's or the worktree's `.opencode*` trees.**

### 1 — C14: stale user-owned `opencode.json` (planted as the documented model pin)

```
$ node .../repo941fix/scripts/sync-opencode-edition.js --forge=github --check
sync-opencode-edition[github]: PARITY FAILED (1 file(s)):
  - opencode.json — stale — regenerate via --write-config
Fix: node scripts/sync-opencode-edition.js --forge=github --write-config
     (--write preserves the user-owned opencode.json and leaves it stale; --write-config rewrites it, discarding any model pins set there.)
EXIT: 1
```

Following that advice now works — the loop the premise showed never closing:

```
$ … --forge=github --write-config
rewrote    opencode.json
sync-opencode-edition[github]: write complete (1 file(s) updated).      EXIT: 0
$ … --forge=github --check
sync-opencode-edition[github]: 14 agent(s) + 3 command(s) + 1 plugin(s) in parity …   EXIT: 0
```

Mixture (C14 + stale generated agent) — one command clears both:

```
PARITY FAILED (2 file(s)):
  - .opencode/agent/investigator.md — stale — regenerate
  - opencode.json — stale — regenerate via --write-config
Fix: node scripts/sync-opencode-edition.js --forge=github --write-config     EXIT: 1
--- follow it: generated .opencode/agent/investigator.md / rewrote opencode.json (2 updated)  EXIT: 0
--- recheck: in parity                                                        EXIT: 0
```

### 2 — C9: unregistered plugin. No flag is named at all

```
$ … --forge=github --check
sync-opencode-edition[github]: PARITY FAILED (1 file(s)):
  - templates/opencode/plugins/zzz-rogue-plugin.js — unregistered plugin 'zzz-rogue-plugin.js' present in templates/opencode/plugins/ but absent from PLUGIN_SCRIPTS — add it to the allowlist
No flag of this script clears templates/opencode/plugins/zzz-rogue-plugin.js — apply the source edit its reason names above.
EXIT: 1
```

No `node scripts/sync-opencode-edition.js …` appears anywhere in that output.

**2b — C9 + C14:** `--write-config` for the config, *and* the source-edit line for the plugin.
**2c — C9 + stale agent:** `Fix: … --write` (not `--write-config` — never blanket), *and* the
source-edit line. Both transcripts show the two lines coexisting.

### 3 — Anti-regression and coverage of the derivation's other arms

```
write-clearable only:  Fix: node scripts/sync-opencode-edition.js --forge=github --write   EXIT: 1
--forge=gitlab:        Fix: node scripts/sync-opencode-edition.js --forge=gitlab --write   EXIT: 1
two source-edits:      No flag of this script clears …/zzz-a.js, …/zzz-b.js — apply the source edit their reasons name above.
```

The plural/singular arm was found by running it, not by reading: the first wording said "its reason
names" for a two-item list.

---

## Out of my lane — flagged, not done

1. **`install-opencode.sh:156-160` implements the old advice in shell** (`--check … || … --write`,
   output discarded, under `set -euo pipefail`). It does not read the footer, so this change does
   **not** repair premise §b: on a C14 or C9 tree the installer still composes exit 1 `||` exit 0
   and proceeds from a tree it failed to repair. Repairing it means editing
   `install-opencode.sh`, which my brief excludes.
2. **`CHANGELOG.md`** — this is a user-visible message change and the project rule asks for an entry.
   Not written; outside the one file I was scoped to.
3. **The gitlab/gitea parity red on `main`** (premise §c) is untouched, as scoped.

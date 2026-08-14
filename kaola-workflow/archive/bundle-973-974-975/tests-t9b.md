# tests-t9b — repairing T9b's observation in `scripts/test-finalize-door.js`

Scope: one file, `scripts/test-finalize-door.js`, one function, `envelopeNames`. No assertion text
changed, no leg dropped, no hazard name dropped, no production file touched.

Baseline: commit `6926493661e1a69c910e50f5a3d82b09af85e4ee` **plus** the uncommitted #973/#974/#975
implementation present in the worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975`
(the #975 behaviour is what takes the "report instead of commit" branch, so the RED only exists with
it applied). Baseline signature, real exit code captured directly:

```
$ node scripts/test-finalize-door.js   ->  EXIT=1
FAIL: T9b(an embedded newline): the hazard file is either committed with the rest of the residue, or NAMED on the envelope ...
FAIL: T9b(an embedded double-quote, regression pin): ...
FAIL: T9b(a backslash, regression pin): ...
finalize-door tests FAILED (3 failures, 487 passed)
```

## The repair chosen, and why

**Walk the parsed envelope structure**, comparing the needle against each string/scalar value and
each object key — not `JSON.stringify(item).indexOf(needle)`, and not the alternative fix of escaping
the needle with `JSON.stringify(needle).slice(1, -1)`.

Both candidates make the five legs green. I chose the structural walk for three reasons:

1. **It removes the class, not the instance.** The defect is category: the observation measured a
   *rendering* of the data instead of the data. Escaping the needle keeps that category error and
   compensates for one serializer — it stays correct only as long as the haystack is JSON and is
   escaped by that exact call. Comparing values puts no encoding between the needle and the string
   the envelope carries, for any character.
2. **It is strictly tighter, not looser.** `JSON.stringify(item).indexOf(needle)` can match across a
   `","` seam between two neighbouring array entries or across a key/value boundary — a hit that
   names nothing. A structural hit is always inside one scalar or one key.
3. It keeps the two properties the original had and that T9c/T9d depend on: substring semantics
   (naming a path inside a sentence of prose still counts — the wording is the implementer's), and
   keys counting as much as values.

What is deliberately unchanged: the band construction, including the `changed_paths` exclusion, and
the T9b assertion itself (`tree.indexOf(hazard) >= 0 || envelopeNames(...)`) with its stated
acceptance. The mechanism T9b guards — finalize must not be silent about dropping a hazard-named
file — is alive; this repairs how the test *looks*, not what it demands.

## The diff

```diff
--- a/scripts/test-finalize-door.js
+++ b/scripts/test-finalize-door.js
@@ -1684,6 +1684,23 @@ function committedPaths(repo) {
 // implementer's; what is pinned is that something machine-readable names it. `changed_paths` is
 // excluded from the band on purpose: it is derived from what WAS committed, so a hit there would be
 // evidence of success, not of a report.
+//
+// THE BAND IS WALKED AS PARSED STRUCTURE, never as `JSON.stringify(item)`. Serialising the haystack
+// escapes exactly the characters the T9b table is built from — inside JSON text a newline is `\n`, a
+// quote is `\"` and a backslash is `\\` — so a raw needle carrying one of them could not match an
+// envelope that named the path perfectly. MEASURED, on the five T9b names against the envelope the
+// implementation emits: only `notes.md ` and `nöte.md`, whose escaping is the identity, survived the
+// round trip; `new\nline.md`, `qu"ote.md` and `back\slash.md` matched nothing no matter what the
+// report said. That is not a weak observation, it is an unsatisfiable one — for those three the
+// "or NAMED on the envelope" half of T9b's assertion could never be true, leaving it demanding that
+// the hazard be COMMITTED, which is a different assertion from the one written there. It stayed
+// invisible while the implementation committed the hazard and surfaced the moment #975 started
+// reporting it instead.
+//
+// Comparing VALUES rather than a rendering of them removes the whole class: no escaping sits between
+// the needle and the string the envelope carries, whatever the character. It is also strictly
+// tighter than the stringify form, which could match across the `","` seam between two neighbouring
+// entries; a hit here is always inside one scalar or one key.
 function envelopeNames(out, needle) {
   if (!out || typeof out !== 'object') return false;
   const band = [out.finalize_transaction, out.errors, out.warnings, out.findings, out.validation,
@@ -1691,11 +1708,18 @@ function envelopeNames(out, needle) {
   for (const key of Object.keys(out)) {
     if (/stag|error|warn|finding|residue|uncommitted|dropped|skip/i.test(key)) band.push(out[key]);
   }
-  for (const item of band) {
-    if (item === undefined) continue;
-    try { if (JSON.stringify(item).indexOf(needle) >= 0) return true; } catch (_) { /* next */ }
-  }
-  return false;
+  // Substring, not equality: naming the path inside a sentence of prose is still naming it, and the
+  // wording of that sentence is the implementer's to choose. Keys count for the same reason — a
+  // report keyed BY the path names it as machine-readably as one that lists it.
+  const namesIt = (node) => {
+    if (node === null || node === undefined) return false;
+    if (Array.isArray(node)) return node.some(namesIt);
+    if (typeof node === 'object') {
+      return Object.keys(node).some(k => k.indexOf(needle) >= 0 || namesIt(node[k]));
+    }
+    return String(node).indexOf(needle) >= 0;
+  };
+  return band.some(namesIt);
 }
```

29 insertions, 5 deletions, one file.

## Proof 1 — all five legs pass, and for the right reason

Method: two scratch mirrors under the session scratchpad, each a `cp -R` of the worktree's
`scripts/` + `plugins/` + `package.json`. The real tree was never patched and `git checkout --` was
never used. In the mirror copy of the suite every top-level IIFE except `T9` is guarded by an env
flag, which isolates T9 to a ~10 s run and reproduced the baseline signature exactly
(`3 failures, 65 passed`, the same three legs). Instrumentation lives **only** in the mirror: it
prints, per leg, each disjunct separately and locates every place in the band the needle was found.

Measured with the repaired matcher (mirror `m1`, unmutated implementation):

| leg | hazard | disjunct 1 `tree` has hazard | disjunct 2 `envelopeNames` | where the hit was | old raw-stringify matcher |
|---|---|---|---|---|---|
| a trailing space | `notes.md ` | **false** | true | `finalize_transaction.residue_unattributed[0]` = `"notes.md "` | true |
| non-ASCII | `nöte.md` | **false** | true | `finalize_transaction.residue_unattributed[0]` = `"nöte.md"` | true |
| an embedded newline | `new\nline.md` | **false** | true | `finalize_transaction.residue_unattributed[0]` = `"new\nline.md"` | false |
| an embedded double-quote | `qu"ote.md` | **false** | true | `finalize_transaction.residue_unattributed[0]` = `"qu\"ote.md"` | false |
| a backslash | `back\slash.md` | **false** | true | `finalize_transaction.residue_unattributed[0]` = `"back\\slash.md"` | false |

Two things this settles. **Nothing short-circuited**: the first disjunct is false on all five legs
(#975 withholds the unattributable path from the commit), so every pass is carried entirely by the
envelope term. **The hit is a real report**: each match resolves to one located scalar, the path the
implementation put in `residue_unattributed`, not a stray substring elsewhere in the band. The last
column reproduces the brief's measurement independently — the two legs that were green before are
exactly the two whose JSON escaping is the identity.

T9 in the mirror: `EXIT=0`, 68 assertions (65 + the 3 that were failing).

## Proof 2 — a silent-drop implementation still reds it

Mirror `m2` = copy of `m1` with the repaired (non-instrumented) suite and **one mutation** to
`scripts/kaola-workflow-claim.js`: the whole `if (unattributed.size > 0) { … }` reporting block
removed — no `finalizeTx.residue_unattributed`, no `recordFinalizeFinding('residue_unattributed', …)`,
no stderr warning. The path is still withheld from the `chore: finalize` commit; it is simply never
named. That is precisely "finalize is silent about dropping it".

```
$ KW_ONLY_T9=1 node scripts/test-finalize-door.js   (mirror m2)   ->  EXIT=1
FAIL: T9b(a trailing space): the hazard file is either committed with the rest of the residue, or NAMED on the envelope as something the transaction did not carry. What it must not be is absent from both; got HEAD tree=[".gitignore","CHANGELOG.md","README.md","docs/design.md","kaola-workflow/ROADMAP.md","src/app.swift","src/feature.js","src/pending-good.js"] finalize_transaction={"mirror":"source_absent","ledger_compare":"not_needed","residue_mirrored":0,"impl_commit":"committed","roadmap_staged":true,"archive_commit":"deferred_to_sink","residue_stage":"staged","archive_stage":"staged","finalize_commit":"committed"}
FAIL: T9b(non-ASCII): … (identical shape)
FAIL: T9b(an embedded newline): … (identical shape)
FAIL: T9b(an embedded double-quote, regression pin): … (identical shape)
FAIL: T9b(a backslash, regression pin): … (identical shape)
FAIL: T9c: a `git add` that failed must be REPORTED on the envelope, naming what could not be staged. …
FAIL: T9c: and it is recorded DURABLY …
finalize-door tests FAILED (7 failures, 61 passed)
```

**All five legs red**, including the two that were green before the repair — so the matcher is not
vacuous: it distinguishes "named" from "not named" for every name in the table, not just for the
three it previously could not see.

The two extra T9c reds are the same mutation observed from the other side, and they are informative:
T9c's unreadable `locked.md` sits at the worktree root, so under #975 it is *unattributable* and is
withheld before `git add` ever sees it — the report that names it today comes from the
`residue_unattributed` block, not from the staging-failure block. Removing that block therefore makes
T9c silent too, and T9c catches it. (Unmutated, T9c is green; the only difference between the runs is
those 13 lines.)

## Proof 3 — the matcher does not match everything

Run inside the suite process against the real envelope, on every leg, with the repaired
`envelopeNames`:

| control needle | result |
|---|---|
| `zzz-absent-from-this-envelope.md` | `false` on all 5 legs |
| `src/never-existed-<hazard>` | `false` on all 5 legs |
| `<hazard>` + `"X"` (one-character near miss) | `false` on all 5 legs |
| `src/feature.js` — a path that **is** on the envelope, in `out.changed_paths` (`["src/feature.js"]`) | `false` on all 5 legs |

The last row is the band exclusion re-proven under the rewrite: `changed_paths` is evidence of
success, not of a report, and the structural walk still does not read it.

## Verification — real exit codes, run serially

```
node scripts/test-finalize-door.js           EXIT=0   finalize-door tests passed (490 assertions)
node scripts/test-bundle-finalize.js         EXIT=0   test-bundle-finalize: all 179 tests passed
node scripts/test-claim-hardening.js         EXIT=0   claim-hardening tests passed (766 assertions)
node scripts/test-forge-finalize-findings.js EXIT=0   253 passed, 0 failed
```

490 assertions — exactly the HEAD count (487 passed + 3 failed), now all passing. No exit code was
read through a pipe.

## Cleanliness

`git -C /Users/ylpromax5/Workspace/Kaola-Workflow status --short --untracked-files=all` — unchanged
apart from this note; the untracked `kaola-workflow/bundle-973-974-975/*.md` run records are the
bundle's own.

`git -C .kw/worktrees/bundle-973-974-975 status --short --untracked-files=all` — my only entry is
` M scripts/test-finalize-door.js`. Everything else listed there is other agents' in-flight work,
untouched.

No fixture roots left behind: `ls -d $TMPDIR/kw-finalize-door-*` → no matches, after both mirror runs
and the four real suites. (Other `kw-*` roots under `$TMPDIR` — `sandbox-home-*`, `gl-*`, `gt-*` —
are other agents' suites and were left alone.) Both mirrors live under the session scratchpad, not in
either tree.

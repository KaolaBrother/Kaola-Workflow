# RED — #1005: extend `testAxiomBlockByteIdentity` from 12 to 14 surfaces

**Role:** test custody. Guard only. No production file was edited.
**Baseline:** `2d57c6046ca4280900601875844f96cc6443b304` (issue #1004's fix, committed).
**Worktree:** `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-1004`
**Only file written:** `scripts/simulate-workflow-walkthrough.js`
**Not committed.** `git status --short` shows exactly one modified file.

## Failure signature

```
RED: testAxiomBlockByteIdentity — 2 of 14 surfaces do not embed the canonical
     templates/axioms.md First Principles block byte-identically:
       CLAUDE.md — stale: first canonical line absent from it is "These are the workflow's tie-breaking axioms, applied in priority order whenever a situation is not …"
       README.md — stale: first canonical line absent from it is "## First Principles"
baseline: 2d57c6046ca4280900601875844f96cc6443b304
```

## Blindness, measured before the change

The same scenario, on the same commit, before the edit — both new surfaces already drifted:

```
$ node scripts/simulate-workflow-walkthrough.js --only testAxiomBlockByteIdentity
testAxiomBlockByteIdentity: PASSED (12 surfaces)
Walkthrough --only subset passed (1 scenarios)
EXIT=0
```

```
$ node -e "... fs.readFileSync('CLAUDE.md').includes(axioms) ..."
CLAUDE.md includes canonical block: false
README.md includes canonical block: false
```

Green guard, two stale surfaces. That is the defect #1005 names.

## Verbatim RED, after the change (unedited stdout+stderr)

```
Error: 2 of 14 surfaces do not embed the canonical templates/axioms.md First Principles block byte-identically:
    CLAUDE.md — stale: first canonical line absent from it is "These are the workflow's tie-breaking axioms, applied in priority order whenever a situation is not …"
    README.md — stale: first canonical line absent from it is "## First Principles"
    at assert (/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-1004/scripts/simulate-workflow-walkthrough.js:50:25)
    at Object.testAxiomBlockByteIdentity [as fn] (/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-1004/scripts/simulate-workflow-walkthrough.js:11506:3)
    at main (/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-1004/scripts/simulate-workflow-walkthrough.js:12232:21)
    at Object.<anonymous> (/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-1004/scripts/simulate-workflow-walkthrough.js:13655:1)
    at Module._compile (node:internal/modules/cjs/loader:1871:14)
    at Module._extensions..js (node:internal/modules/cjs/loader:2002:10)
    at Module.load (node:internal/modules/cjs/loader:1594:32)
    at Module._load (node:internal/modules/cjs/loader:1396:12)
    at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
spawn-census: {"suite":"simulate-workflow-walkthrough","spawns":7}
```

Run by name, not by shard — the fast chain samples this suite at `--shard auto/12`, so a
green chain is not evidence this scenario executed. `--only testAxiomBlockByteIdentity`
selected 1 scenario and it is the one that reported.

## The diff

```diff
diff --git a/scripts/simulate-workflow-walkthrough.js b/scripts/simulate-workflow-walkthrough.js
index e19dd19c..a43f728a 100755
--- a/scripts/simulate-workflow-walkthrough.js
+++ b/scripts/simulate-workflow-walkthrough.js
@@ -11394,7 +11394,7 @@ function testSinkTransactionCleanEndToEnd() {
 // startsWith guard keeps a blanked/emptied axioms.md from producing a false green (includes('') is
 // always true), so the guard is load-bearing on BOTH the canonical file and every embed.
 //
-// TWELVE SURFACES, DERIVED. The list used to be six hand-typed paths, which covered the tracked
+// TWELVE DERIVED SURFACES. The list used to be six hand-typed paths, which covered the tracked
 // trees and left the six GENERATED ones — .opencode{,-gitlab,-gitea} and .kimi{,-gitlab,-gitea} —
 // free to drift with nothing to catch it. Neither half is typed here now: the tracked six come from
 // the routing registry that renders them, and the generated six are rendered through the sync
@@ -11407,6 +11407,17 @@ function testSinkTransactionCleanEndToEnd() {
 // on-disk tree equals, so the subject is always present and can never be a stale tree. Absence is
 // still loud, one level up: the expected surface COUNT is derived independently, so a renderer that
 // yields nothing reds instead of silently shrinking the sweep.
+//
+// #1005: TWO NAMED SURFACES — the repo's OWN prose. Twelve derived surfaces made this guard total over
+// what the workflow SHIPS and blind to the two files that state the same axioms to a reader of this
+// repository: root CLAUDE.md's `## First Principles` block and README.md's numbered axiom list. Both
+// sat outside the sweep and both had drifted — CLAUDE.md agreed byte-for-byte for 22 days and then
+// diverged in two axioms with all three standing paragraphs dropped, and README.md was never identical
+// and diverges in DIFFERENT places, its intro agreeing with canonical exactly where CLAUDE.md's does
+// not. Three surfaces, pairwise inconsistent, while this guard reported a clean twelve: a guard green
+// on a stale surface is the defect, not the fix. They are NAMED, not derived, because they ARE the
+// subject — no registry emits them — exactly as INIT_TOPIC is named. Owner ruling: both converge on
+// the canonical block, with no declared divergent region on either.
 function testAxiomBlockByteIdentity() {
   const routing = require('./generate-routing-surfaces.js');
   const opencodeSync = require('./sync-opencode-edition.js');
@@ -11439,28 +11450,65 @@ function testAxiomBlockByteIdentity() {
     surfaces.push({ id: kimiSync.skillRel(base, forge), body: kimiSync.renderCommand(canon, base, forge) });
   }
 
-  // ANTI-VACUITY, and its HONEST boundary — the two terms of this width are not equally anchored.
+  // #1005: the repo's own two prose surfaces. Named, not derived — they ARE the subject, exactly as
+  // INIT_TOPIC is — but each is asserted to exist, so a rename or a move reds here instead of quietly
+  // dropping a surface out of the sweep.
+  const NAMED_SURFACES = ['CLAUDE.md', 'README.md'];
+  for (const rel of NAMED_SURFACES) {
+    const abs = path.join(repoRoot, rel);
+    assert(fs.existsSync(abs),
+      'the repo-root ' + rel + ' this guard checks must exist at ' + rel + ' (named surface missing or renamed)');
+    surfaces.push({ id: rel, body: read(abs) });
+  }
+
+  // ANTI-VACUITY, and its HONEST boundary — the three terms of this width are not equally anchored.
   // The RUNTIME term is independent: it is read off the filesystem (one `sync-<runtime>-edition.js`
   // per additive runtime), so deleting a runtime from any table cannot shrink expectation and
   // measurement together. Deriving it from surfaces.length would be a guard that cannot fail.
+  // The NAMED term is independent, and ONLY because it is the literal `2` below and not
+  // NAMED_SURFACES.length: drop either repo-root path from that list and the measurement shrinks while
+  // the expectation does not, so the floor reds naming what survived. Adding a third named surface is
+  // deliberately a two-place edit — that cost IS the floor. Written as NAMED_SURFACES.length it would
+  // shrink in lockstep and enforce nothing, which is the FORGE term's failure mode, below.
   // The FORGE term is NOT independent: it comes from the same registry this measures, so deleting a
   // forge from the edition tables shrinks both sides in lockstep and this floor stays green —
   // mutation-proved. That case is caught one guard over, by test-generate-routing-surfaces.js's
   // "registry derives 18 surfaces" assertion, which is why it is left rather than re-anchored. Do
   // not read this comment as claiming the width is independent of everything; it is independent of
-  // the runtime list only.
+  // the runtime list and of the named-surface list, and not of the forge list.
   const runtimeEditionCount = fs.readdirSync(path.join(repoRoot, 'scripts'))
     .filter(f => /^sync-[a-z0-9-]+-edition\.js$/.test(f)).length;
-  const expected = routing.FORGES.length * (2 + runtimeEditionCount); // claude + codex + each additive runtime
+  // per forge: claude + codex + each additive runtime; plus the two repo-root prose surfaces
+  const expected = routing.FORGES.length * (2 + runtimeEditionCount) + 2;
   assert(surfaces.length === expected,
-    'the axiom block must be checked on every runtime x forge init surface — expected ' + expected
+    'the axiom block must be checked on every runtime x forge init surface AND on both repo-root prose '
+      + 'surfaces — expected ' + expected
       + ', derived ' + surfaces.length + ' (' + surfaces.map(s => s.id).join(', ') + ')');
 
+  // The verdict is unchanged and singular: `s.body.includes(axioms)`, one comparison idiom for all
+  // fourteen surfaces, a whole-block byte match no partial or reworded embed can satisfy. What #1005
+  // changed is only the REPORT. Two of the fourteen are hand-maintained prose that drift independently
+  // of each other and of the twelve, so "one of them did not match" would send the reader diffing a
+  // canonical block against a thousand-line document, and a fail-fast on the first stale surface would
+  // hide the second behind it. The lines below run only after a surface has ALREADY failed the
+  // comparison; they explain a verdict and never decide one.
+  const canonLines = axioms.split('\n').filter(l => l.trim() !== '');
+  const drifted = [];
   for (const s of surfaces) {
-    assert(s.body.includes(axioms),
-      s.id + ' must embed the canonical templates/axioms.md First Principles block byte-identically ' +
-      '(drift from templates/axioms.md detected)');
-  }
+    if (s.body.includes(axioms)) continue;
+    const missing = canonLines.find(l => !s.body.includes(l));
+    drifted.push(s.id + ' — stale: ' + (missing
+      ? 'first canonical line absent from it is ' +
+        JSON.stringify(missing.length > 100 ? missing.slice(0, 100) + '\u2026' : missing)
+      : 'every canonical line appears, but not as one contiguous byte-identical block ' +
+        '(blank-line, ordering or indentation drift)'));
+  }
+  assert(drifted.length === 0,
+    drifted.length + ' of ' + surfaces.length + ' surfaces do not embed the canonical templates/axioms.md '
+      + 'First Principles block byte-identically'
+      + (drifted.length === surfaces.length ? ' (EVERY surface — templates/axioms.md itself is what moved)' : '')
+      + ':\n    ' + drifted.join('\n    '));
+
   console.log('testAxiomBlockByteIdentity: PASSED (' + surfaces.length + ' surfaces)');
 }
 
```

## Mutation matrix — armed, one mutant at a time

Run in a **scratch copy** of the tree (`git archive HEAD | tar -x` into the scratchpad, plus the
modified guard). The worktree's `CLAUDE.md`, `README.md` and `templates/axioms.md` were never
written. `M0` is the green base: both named surfaces spliced to the canonical block *in the scratch
copy only*. Every later row starts from a fresh copy of `M0` and applies exactly one mutation.

| # | one mutation | expected | observed | exit |
|---|---|---|---|---|
| M0 | none — both named surfaces canonical | green at 14 | `testAxiomBlockByteIdentity: PASSED (14 surfaces)` | 0 |
| M1 | `CLAUDE.md` alone re-staled to its HEAD text | red naming **CLAUDE.md only** | `1 of 14 … CLAUDE.md — stale: first canonical line absent from it is "These are the workflow's tie-breaking axioms…"` | 1 |
| M2 | `README.md` alone re-staled to its HEAD text | red naming **README.md only** | `1 of 14 … README.md — stale: first canonical line absent from it is "## First Principles"` | 1 |
| M3 | `templates/axioms.md` itself edited (axiom 1 reworded); both named surfaces canonical | red | `14 of 14 surfaces … (EVERY surface — templates/axioms.md itself is what moved)`, all 14 ids listed | 1 |
| M4 | `CLAUDE.md` canonical **except** the `**Parallel by default:**` paragraph deleted — a *partial* block | red | `1 of 14 … CLAUDE.md — stale: first canonical line absent from it is "**Parallel by default:** …"` | 1 |
| M5 | `README.md` canonical except one word (`verdicts` → `verdict`) — a single-token drift | red | `1 of 14 … README.md — stale: … "5. **Own your own verdicts.** …"` | 1 |
| M6 | `NAMED_SURFACES` loses `'README.md'` | anti-vacuity floor reds | `expected 14, derived 13 (… CLAUDE.md)` | 1 |
| M7 | `NAMED_SURFACES` loses `'CLAUDE.md'` | anti-vacuity floor reds | `expected 14, derived 13 (… README.md)` | 1 |
| M8 | **counter-proof:** floor rewritten as `+ NAMED_SURFACES.length`, `'README.md'` dropped, README re-staled | **green** — the failure mode the comment warns of | `testAxiomBlockByteIdentity: PASSED (13 surfaces)` | 0 |
| M9 | `README.md` renamed on disk to `READ-ME.md` | existence assert reds, no crash | `the repo-root README.md this guard checks must exist at README.md (named surface missing or renamed)` | 1 |

M1/M2 are the load-bearing pair: each named surface reds **alone**, so neither rides on the other's
failure. M4/M5 answer "is this still byte-identity?" — a partial block and a one-word edit both red,
so the check has not been softened toward substring-of-something.

M8 is the reason the floor's new term is the literal `2` and not `NAMED_SURFACES.length`. With the
derived form, deleting a named surface shrinks expectation and measurement together, the floor stays
green at 13, and a fully stale `README.md` ships unwatched. That is exactly the FORGE term's known
failure mode, and it is why the comment claims independence for the named term only on the strength
of the literal.

## Collateral checks (no other scenario disturbed)

| check | exit |
|---|---|
| `node --check scripts/simulate-workflow-walkthrough.js` | 0 |
| `--only testHarnessSelfCheck` (spawns this script with `--list`/`--only`) | 0 |
| `node scripts/validate-workflow-contracts.js` | 0 — `Workflow contract validation passed` |

## What the extended guard still CANNOT witness

Stated in the same spirit as the comment it sits under — a floor quietly widened until it cannot
fail is worse than no floor, and so is a claim of coverage wider than the coverage.

1. **The FORGE term of the width is still not independent.** Unchanged by #1005 and still true:
   `routing.FORGES.length` comes from the same registry the sweep measures, so deleting a forge from
   the edition tables shrinks both sides in lockstep and the floor stays green. Caught one guard
   over, by `test-generate-routing-surfaces.js`'s "registry derives 18 surfaces" assertion.
2. **The named list can still GROW silently.** A third repo-root file that starts stating the axioms
   — `AGENTS.md`, a `docs/` page, an ADR — is invisible here until somebody types its path into
   `NAMED_SURFACES` and bumps the literal. The guard proves the two files it is told about; it cannot
   discover a third. Nothing in this repo enumerates "documents that state the axioms."
3. **It sees the block, not the prose around it.** `includes(axioms)` proves the canonical block is
   present byte-for-byte. It says nothing about a sentence three lines later that contradicts it —
   e.g. README's "embedded byte-identically into every generated project's guidance (all twelve
   `workflow-init` surfaces …)" is prose *about* the axiom layer, outside the block, and would stay
   green at a now-wrong twelve. Convergence prose is the converger's problem, not this guard's.
4. **It reads the worktree, not what installs.** `CLAUDE.md` and `README.md` are read off disk in the
   repo root. `install.sh` ships neither, so this checks the repo's self-description only — it does
   not follow the axioms into anything a consumer receives. The twelve derived surfaces do that.
5. **Order and placement are unconstrained.** The block may appear anywhere in either file, once or
   more than once. A `README.md` that embeds the canonical block in an appendix while leaving a
   drifted copy in the introduction passes. Only *absence* of the exact bytes reds.
6. **`templates/axioms.md` itself is only anchored by `startsWith('## First Principles')`.** If the
   canonical file is rewritten and all fourteen surfaces are regenerated to match, everything is
   green. This guard enforces agreement, never correctness of the wording — that judgement is the
   owner's, and #1005's ruling is the instance of it.

## Handoff

The guard is RED and stays RED until root `CLAUDE.md` and `README.md` each contain
`templates/axioms.md` byte-for-byte — heading, intro sentence, five axioms, and all three standing
paragraphs (`Tie-breaker protocol`, `Dispatch production; keep decisions`, `Parallel by default`).
Note for the converger: the canonical block's lines are **unwrapped**; today's `CLAUDE.md` hard-wraps
its axioms at ~100 columns, so convergence changes the wrapping too. Verify with
`node scripts/simulate-workflow-walkthrough.js --only testAxiomBlockByteIdentity` expecting
`PASSED (14 surfaces)`.

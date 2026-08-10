# impl-945 — derive the sandbox copy list; name the surface in V3

**Baseline commit:** `a339e5dfb816428f3c62e477ee1a8dcba53c409b`
**Branch / worktree:** `workflow/bundle-945-946-947-948` @ `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-945-946-947-948`
**Write set (exactly one file, confirmed by `git -C <worktree> diff --stat`):**
`scripts/test-generate-routing-surfaces.js` — 36 insertions, 11 deletions. No production file touched.

---

## 1. What changed

### (a) The sandbox copy list is now DERIVED from the require graph

`scripts/test-generate-routing-surfaces.js:622-651` (was `:622-631`). The hand-typed enumeration of
four JS paths is replaced by a transitive walk of the loaded generator's `require.cache` children,
mapped to repo-relative paths and filtered to repo-local files:

```js
const jsInputs = (() => {
  const entry = require.resolve('./generate-routing-surfaces.js');
  require(entry);
  const seen = new Set();
  const walk = id => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const child of (require.cache[id] ? require.cache[id].children : [])) walk(child.filename);
  };
  walk(entry);
  return [...seen]
    .map(abs => path.relative(repo, abs))
    .filter(rel => rel && !rel.startsWith('..') && !path.isAbsolute(rel)
      && !rel.split(path.sep).includes('node_modules'))
    .sort();
})();
```

Plus two anchor assertions (`length > 0`, and membership of `scripts/kaola-workflow-adaptive-schema.js`)
and `for (const rel of jsInputs) copy(rel);`.

**The load-order question the walk depends on was measured, not assumed.** Node's `Module._load`
calls `updateChildren(parent, cachedModule, true)` on a cache *hit*, so a module already loaded by
someone else is still recorded as a child of every later requirer. Verified on this box
(node v24.14.0) with a three-module fixture where `first.js` loads `shared.js` and `second.js` then
requires it from cache:

```
second.children = [ 'shared.js' ]
```

So the derived list is independent of the order in which the test file's own top-level requires run.

**The derivation is byte-equivalent to the old list on today's tree** — it is not a behaviour change,
only a staleness fix:

```
=== worktree (real tree) ===          === same tree + one NEW require ===
4 entries:                            5 entries:
  scripts/generate-routing-surfaces.js  scripts/generate-routing-surfaces.js
  scripts/kaola-workflow-adaptive-schema.js
                                        scripts/kaola-workflow-adaptive-schema.js
                                        templates/routing/proof-new-dep.js   <-- picked up, no edit
  templates/routing/rename-table.js     templates/routing/rename-table.js
  templates/routing/slots.js            templates/routing/slots.js
dropped (non-repo-local): []          dropped (non-repo-local): []
```

`dropped: []` also confirms empirically that builtins (`fs`, `path`, `crypto`, `child_process`) never
enter `children`, so no filter special-case for them is needed.

**Why the count is NOT pinned.** `docs/conventions.md:319-326` requires a derived universe to carry an
absolute anchor. Pinning the *count* would reinstate exactly the staleness being removed — growing is
the correct response to a new require — so the anchor is a pinned *member*: the kernel, which is the
require that staled the old list and sits two edges out, so reaching it also proves transitivity.

### (b) V3 names the surface path

`scripts/test-generate-routing-surfaces.js:694`. Semantics unchanged (`eq(red.status, 1, …)`); only
the message gained `(${row.path})`, matching its V4/V5 siblings. B1/B2/V4/V5 untouched; nothing
deleted.

---

## 2. Assertion counts and REAL exit codes

Every run below invoked `node` on an **absolute** path and captured `$?` directly — never a pipe.

| run | tree | result | real exit |
|---|---|---|---|
| BEFORE | current worktree tree, test file restored to `a339e5df` | `all 432 assertions passed` | **0** |
| AFTER | current worktree tree, my change | `all 434 assertions passed` | **0** |
| AFTER (in place) | the worktree itself | `all 434 assertions passed` | **0** |

**432 → 434.** The +2 are the two anti-vacuity anchors the brief asked for. The brief predicted 432;
the delta is entirely those assertions and nothing else changed count.

### A measurement trap worth recording

The Bash cwd in this agent is `/Users/ylpromax5/Workspace/Kaola-Workflow` (**main**), not the
worktree, and it is not stable between calls. A bare `node scripts/test-generate-routing-surfaces.js`
therefore silently ran **main's** pre-bundle copy and reported `432` with an empty `git diff` — which
reads exactly like "another agent reverted my edit". It had not: the worktree file was correct the
whole time (`grep -c jsInputs` → 5). Every number in this report was re-measured with absolute paths
after that was caught.

---

## 3. The load-bearing proof: the derived list survives the failure that staled the hand-typed one

Scratch mirrors only (`rsync -a --exclude .git` from the worktree). No tracked file was mutated in
place; no `git checkout --` was used.

**Injected failure** — a NEW repo-local module plus a new top-level require in `templates/routing/slots.js`,
the same shape as the require that staled the old list:

```js
// templates/routing/proof-new-dep.js  (new file)
module.exports = { PROOF_MARKER: 'kw-945' };

// templates/routing/slots.js:85, right after the kernel require
const { PROOF_MARKER } = require('./proof-new-dep.js');
if (!PROOF_MARKER) throw new Error('proof dep missing');
```

**(3) DERIVED list + the new require — verbatim:**

```
=== (3) DERIVED list + new require ===
REAL_EXIT=0
test-generate-routing-surfaces: all 434 assertions passed.
```

**(4) NEGATIVE CONTROL — the SAME tree with the OLD hand-typed list restored — verbatim:**

```
=== (4) OLD hand-typed list + same new require ===
REAL_EXIT=1
test-generate-routing-surfaces: 16 assertion(s) FAILED (416 passed).
      Error: Cannot find module './proof-new-dep.js'
V3 assertions that FAILED under the old list: 0 (0 = all seven passed VACUOUSLY)
```

That control is what makes (3) mean anything: the injected require is genuinely one the old list
missed, and the resulting failure is #945 itself — the sandbox dies at MODULE LOAD, and **all seven
V3 assertions pass against a process that rendered nothing**, because a module-load death and a
detected drift are the same exit code. The 16 failures are B1, B2, and 7×(V4+V5) minus one; not one
of them is V3.

---

## 4. Mutation proofs of the two NEW anchors (a green suite is not proof a guard is armed)

Both run on mirrors of the current tree, absolute paths, real exit codes.

**MUT-A — the derivation resolves to nothing** (`seen.clear()` after the walk). This is the exact
vacuity the anchors exist to catch:

```
REAL_EXIT=1
  FAIL: mutation proof: the derived sandbox copy list is non-empty (an empty list starves every spawn)
  FAIL: mutation proof: the derived copy list reaches the kernel two requires out — got []
test-generate-routing-surfaces: 18 assertion(s) FAILED (416 passed).
```

**MUT-B — the walk stops at the entry** (non-transitive). The anchors are *discriminating*, not a
blanket: non-empty correctly stays GREEN, only the kernel anchor fires, and its message prints the
truncated list:

```
REAL_EXIT=1
  FAIL: mutation proof: the derived copy list reaches the kernel two requires out — got [scripts/generate-routing-surfaces.js]
test-generate-routing-surfaces: 17 assertion(s) FAILED (417 passed).
```

**MUT-C — the V3 message.** The hand-edit is turned into a no-op so `--check` stays green and all
seven V3 assertions must go RED. BEFORE (`a339e5df`) vs AFTER, same mutation, same tree:

```
BEFORE                                              AFTER
--check exits 1 on a hand-edited init surface       … init surface (plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md)
--check exits 1 on a hand-edited init surface       … init surface (commands/workflow-init.md)
--check exits 1 on a hand-edited next surface       … next surface (commands/workflow-next.md)
--check exits 1 on a hand-edited next surface       … next surface (plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md)
--check exits 1 on a hand-edited finalize surface   … finalize surface (commands/kaola-workflow-finalize.md)
--check exits 1 on a hand-edited finalize surface   … finalize surface (plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md)
--check exits 1 on a hand-edited finalize surface   … finalize surface (plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md)
```

Seven lines collapsing to three distinct strings become seven distinct strings.

---

## 5. What I did NOT prove — stated plainly

- **A LAZY repo-local require is still outside the derivation.** The walk sees edges that actually
  executed in the parent process. Every repo-local require in the graph today is top-level
  (`generate-routing-surfaces.js:53-56`, `slots.js:84`; `rename-table.js` has none; the kernel's
  in-function requires are builtins only), so the graph is fully realized. But a future
  `require('./x.js')` placed inside a function that only runs under `--check` would not be copied.
  That residue is **visible, not silent**: B1 fails and its message carries the child's stderr, so the
  run names `Cannot find module './x.js'` directly — which is how the negative control above was read.
  A static source scan would close it, but it would also have to parse around the `require(...)`
  literals embedded in `slots.js`'s shell snippets, so I did not build it. Recorded, not built.
- **I did not run the four chains or the walkthrough.** Other agents were concurrently editing
  `install.sh`, `templates/routing/next.skeleton.md` (+3 rendered SKILLs), `test-opencode-edition.js`
  and `test-route-reachability.js` in this worktree; a chain run now would grade their in-flight state,
  not mine. My suite is green **in place** on the worktree as it currently stands, which incidentally
  cross-confirms their skeleton/SKILL edits are self-consistent right now.
- **No unexpected failure occurred**, so the "re-run once serially" clause was not triggered. Every
  RED above is a deliberately injected mutation, each with its stated control.

## 6. Custody

Test path only. I did not edit `scripts/generate-routing-surfaces.js`, `templates/routing/*`, or any
rendered surface in the worktree. The only `templates/routing/` writes were inside disposable scratch
mirrors under `/private/tmp/.../scratchpad/`.

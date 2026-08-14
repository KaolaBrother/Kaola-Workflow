# Tests for #973 — an install does not remove a deployed skill it is not going to replace

Baseline: **`6926493661e1a69c910e50f5a3d82b09af85e4ee`** (worktree `bundle-973-974-975`, branch
`workflow/bundle-973-974-975`). No production file was touched — `git diff --stat -- install.sh
install-kimi.sh install-opencode.sh` is empty.

## The red

```
RED: P5a (#973) — a deployed role skill the install is NOT going to replace is still on disk
     afterwards — 14 of 14 destroyed (kaola-role-adversarial-verifier, …), install exited 0
RED: P5b (#973) — a deployed command skill the install is NOT going to replace is still on disk
     afterwards — destroyed: kaola-workflow-finalize, workflow-init, workflow-next,
     install exited 0 (3 warning line(s) on stderr)
     → scripts/test-kimi-edition.js  ·  exit 1, "2 failure(s), 607 passed" (589 → 609 assertions)

RED: P7a (#973) — a deployed command the install is NOT going to replace is still on disk
     afterwards — destroyed: kaola-workflow-finalize, workflow-init, workflow-next,
     install exited 0
     → scripts/test-opencode-edition.js  ·  exit 1, "1 failure(s), 642 passed" (631 → 643)

RED: #973 — a deployed command the install is NOT going to replace is still on disk afterwards.
     Per forge (removed / exit): github → kaola-workflow-finalize.md workflow-init.md
     workflow-next.md / exit 1  |  gitlab → … / exit 0  |  gitea → … / exit 0
     → scripts/test-install-upgrade-rewrite.js:451  ·  exit 1 (AssertionError)

baseline: 6926493661e1a69c910e50f5a3d82b09af85e4ee
```

## What was added, and which leg it covers

| probe | file:line | leg | at HEAD |
|---|---|---|---|
| `P5a` | `scripts/test-kimi-edition.js:1165-1203` | **B** — canonical renders no roles; 17 → 3, exit 0, success message | **RED** |
| `P5b` | `scripts/test-kimi-edition.js:1205-1241` | **E** — rendered commands outside the deploy allowlist; 17 → 14, exit 0 | **RED** |
| `P5c` | `scripts/test-kimi-edition.js:1243-1288` | retired-directory sweep + its scope | green (pin) |
| `P5d` | `scripts/test-kimi-edition.js:1290-1324` | reinstall still UPDATES; no `X/X` nesting | green (pin) |
| `P7a` | `scripts/test-opencode-edition.js:1377-1414` | **E**, opencode; 3 → 0, exit 0 | **RED** |
| `P7b` | `scripts/test-opencode-edition.js:1416-1453` | retired sweep + scope | green (pin) |
| `P7c` | `scripts/test-opencode-edition.js:1455-1476` | reinstall still UPDATES | green (pin) |
| `#973` block 1 | `scripts/test-install-upgrade-rewrite.js:374-409` | retired sweep + scope + reinstall updates | green (pin) |
| `#973` block 2 | `scripts/test-install-upgrade-rewrite.js:411-456` | empty command source, all three forges | **RED** |

**Leg D is not a separate probe.** D is B and E at the same time; both are pinned individually, so a
repair that satisfies P5a and P5b satisfies D, and a repair scoped only to D (the `skill_count -eq 0`
class) reds on both. Pinning D as well would add a case that can only fail when two already-pinned
cases both fail.

Both red probes assert **no exit code and no message**. An install that refuses before pruning removes
nothing either; pinning `status === 1` would pin one repair and reject the others.

## The two preservation constraints

**Retired sweep** (`P5c` / `P7b` / install.sh block 1). Plants the four names the kimi prune is the
only install-path clearer of — `kaola-role-contractor`, `kaola-role-workflow-planner`,
`kaola-workflow-adapt`, `kaola-workflow-plan-run` — into a destination that also holds the full
deploy set, plus `workflow-goal`, `kaola-something-else`, `my-own-skill` and a *file*
`kaola-role-notadir.md`; installs from a healthy tree; asserts the four are gone and the other four
survive byte-intact. Anti-vacuity runs **both** directions: no planted name may be in the deploy set,
because a retired name back in the set would be *replaced* rather than swept, and a kept name that
joined it would survive because it was *deployed*. A fifth assertion requires the same run to have
deployed the whole set — a run that swept everything and deployed nothing would satisfy the other
four. install.sh's list is `workflow-goal.md`, `workflow-next-pr.md`, `kaola-workflow-adapt.md`
(its prune names `workflow-goal.md` / `workflow-next-pr.md` explicitly); opencode's is
`kaola-workflow-adapt.md`, `kaola-workflow-plan-run.md`.

**Reinstall still updates** (`P5d` / `P7c` / install.sh block 1). Plants stale bytes at every deployed
name and asserts, after the install, that each live `SKILL.md` is byte-identical to the source tree's
(`TREE_ROOT/.kimi/skills/<name>/SKILL.md`), that no skill dir holds a directory of its own name, and
that a file left inside a skill dir by an older release is gone. install.sh renders its commands, so
byte-equality there is against **what a first install into an empty HOME writes** rather than against
the source file — same property, no rendering assumption.

### The tension the implementer has to resolve, stated plainly

Read literally, the acceptance surface says `kaola-role-contractor` must **not** be removed either — it
is not going to be replaced. The retired sweep says it must. These probes pin **both**, because both
are measured behaviour the user asked for, and a repair therefore has to *distinguish* "retired" from
"failed to deploy" rather than treat them as one set. Two mechanisms that do (both proven below):
narrow the prune to the deploy set and add the retired names back explicitly, or keep the
namespace-wide prune and refuse before reaching it when the tree cannot render the whole set.
A repair that only narrows the prune reds on P5c — that is not a hypothetical, it is measured.

## Mutation proof

Every proof ran in a full scratch mirror of the worktree at
`…/scratchpad/mirror` (never `git checkout --`, never the worktree's installers). The mirror
reproduces the baseline exactly: `test-kimi-edition.js` → 2 failures / 607 passed, identical text.

**Two structurally different repairs, both GREEN** — so the probes pin a result, not a mechanism:

| variant | what it does | kimi | opencode | install.sh |
|---|---|---|---|---|
| `fix-narrow` | compute the deploy set first; prune exactly it **+ the retired names**; then copy | **609/609, exit 0** | **643/643, exit 0** | — |
| `fix-floor` | keep the namespace-wide prune; refuse *before* it when the tree renders less than the whole set | **609/609, exit 0** | — | — |
| `fix-defer` | nothing pruned until the source is known to hold something to replace it | — | — | **passed, exit 0** |

**Counter-mutations — every green pin is armed:**

| variant | expected victim | observed |
|---|---|---|
| `break-sweep` (narrow prune, retired names dropped) | P5c | `FAIL: P5c: … still on disk: kaola-role-contractor, kaola-role-workflow-planner, kaola-workflow-adapt, kaola-workflow-plan-run` (1 failure, 608 passed) |
| `break-sweep` (opencode) | P7b | `FAIL: P7b: … still on disk: kaola-workflow-adapt.md, kaola-workflow-plan-run.md` |
| `break-sweep` (install.sh) | block 1 | `AssertionError: … still on disk: workflow-goal.md, workflow-next-pr.md, kaola-workflow-adapt.md` |
| `break-update` (prune deferred past the copy) | P5d | `FAIL: P5d: … stale: kaola-workflow-finalize, workflow-init, …` (+ P5c, + P1 collapses) |
| `break-nesting` (prune deleted outright) | P5d, all three arms | `FAIL: P5d … stale`, `FAIL: P5d: no deployed skill dir holds a directory of its own name … kaola-workflow-finalize, workflow-init, workflow-next`, `FAIL: P5d: a file left inside a skill dir by an older release is gone` |
| `break-update2` (install.sh: sweep intact, nothing overwritten) | block 1 | `AssertionError: … after an upgrade every deployed command is byte-identical to what a FIRST install writes … stale: kaola-workflow-finalize.md, workflow-init.md, workflow-next.md` |

One caveat, stated because it matters: the opencode `break-update` variant (`cp -n`) was **noisy** — it
also made the installer exit non-zero, so 12 assertions across the file reded, not only P7c. P7c's own
byte assertion did fire (`FAIL: P7c: after the install every deployed command carries the SOURCE bytes
… stale: kaola-workflow-finalize, workflow-init, …`), so the pin is armed; the mutation just was not
surgical.

## Fixture

Every red case needs a state of the **source** tree, so each builds its own throwaway copy of the
checkout under `os.tmpdir()` (~120 ms, 16 MB; `.git`, `kaola-workflow/`, `node_modules` skipped).

**`.git` being absent is load-bearing, not tidiness.** The installer regenerates the tree it deploys
from, the generator writes that tree at the **main** checkout whenever one resolves, and a copied
gitdir pointer resolves to this repository — so a copy carrying `.git` would rewrite the real `.kimi`
tree from mutated canonical sources. Each copy therefore ends with a probe of
`sync-<edition>-edition.js --print-tree-root`, realpath-compared to the copy root, which **throws**
rather than asserting: a recorded assertion would let the destructive install run anyway.

The mutations: leg B deletes `agents/*.md` in the copy (the dir stays — *empty* and *missing* behave
oppositely, and empty is the reachable one). Leg E rewrites `command_basename` in the copy's routing
registry and renames the nine files it names, together, which is what a rename in the registry does;
the rewrite throws if it matched nothing. The install.sh legs empty every forge's source command dir
in one shared copy.

Destinations are planted directly rather than seeded by a prior install — the property is about the
state on disk, not how it got there, and it is P1b's own fixture shape. Each red case asserts the
destination held the **full** set before the install (a short destination cannot observe a removal)
and that the mutated source still renders the *other* half (this is the PARTIAL case, not a source
that renders nothing).

`KAOLA_WORKFLOW_OFFLINE` is not set in this environment and none of the three installers reads it; no
fixture builder that sets it was reused.

## `install.sh` suite choice

**`scripts/test-install-upgrade-rewrite.js`**, for three reasons. Its stated subject is already
"re-running install.sh over an existing install must not lose things", and its #795 block is the exact
sibling concern — a manifest-driven sweep over a dir *shared* with user-authored files, where "the
destructive half needs hard proof it only ever deletes files this installer wrote". It already spawns
the real `install.sh` against a temp `HOME`. And it is in the **claude chain** (both the fast gate and
`:full`), which the other candidates that merely spawn the installer do not improve on.

Its `assert` throws, so only one failure shows per run. The two #973 blocks are therefore ordered
**preservation first, red second** — the pins that must hold today are worth nothing sitting behind
one that must not.

## Chain wiring — a real coverage asymmetry

- `test-kimi-edition.js` and `test-opencode-edition.js` are in **`npm run test:kaola-workflow:editions`
  only** — absent from `npm test`, from all four chains, and from the fast gate. P5a/P5b/P7a **do not
  gate anything**; they have to be run by name.
- `test-install-upgrade-rewrite.js` **is** in the claude chain. So from this commit the **fast gate is
  RED** until the fix lands — expected, and the only one of the three defects that any chain sees.
- Consequence for the implementer: an edition-only diff owes no four-chain run, but a repair that
  touches `install.sh` does. Run `npm run test:kaola-workflow:editions` explicitly; a green chain says
  nothing about kimi or opencode.

Cost added: kimi 9.9 s → 13.5 s, opencode 16.9 s → 18.1 s, install-upgrade-rewrite 4.8 s → 8.6 s
(the last is the claude chain's, three forge installs plus one repo copy).

## Deliberately not pinned

1. **Exit codes and messages on the failing legs.** Both a refusal and a successful narrowed install
   satisfy the surface. Pinning either would reject the other.
2. **The wrong diagnostic at `install-kimi.sh:204`** — "no skill sources found in `$SOURCE_TREE/skills`"
   printed when the sources exist and were all rejected by the allowlist. It is a message, and this
   repo specifies results rather than wording. Worth fixing; not pinned here.
3. **The `set -e` mid-loop `cp -R` failure route.** Real (it aborts with the prune done and the copy
   partial) and in scope by the surface, but the only reliable fixture is an unreadable source skill
   dir, which is a no-op for a suite run as root — it would go **silently vacuous** rather than fail.
   A weak assertion here is worse than none; flagging it instead.
4. **`--global` scope** (`SKILLS_DEST=$KIMI_CODE_HOME/skills`) and **`--forge=gitlab|gitea` for the two
   edition installers.** Same `copy_skills` / `copy_tree` body, only the argument differs, and the
   premise left both unmeasured too. All edition probes are `--target`, github. install.sh **is**
   covered on all three forges, because there the forge selects a different source dir.
5. **`install-all.sh`** — it has no deploy of its own; it sequences the four installers and inherits
   whatever they do.

## Safety

Every install spawned ran against a throwaway `HOME` / `KIMI_CODE_HOME` / `--target` under
`os.tmpdir()`. Verified after the full run:

- `ls ~/.kimi-code/skills | wc -l` → **17** (14 `kaola-role-*` + `kaola-workflow-finalize` +
  `workflow-init` + `workflow-next`)
- `ls ~/.claude/commands` → **3** (`kaola-workflow-finalize.md`, `workflow-init.md`, `workflow-next.md`)
- `ls ~/.claude/agents | wc -l` → **14**; `ls ~/.config/opencode/command` → **3**
- main checkout `git status --short` → only the untracked `kaola-workflow/bundle-973-974-975/`;
  `.kimi/skills` 17, `.opencode/command` 3
- worktree `git diff --stat` touches only the three test files (plus the #974/#975 agents' own files,
  which were left alone)

`test-spawn-classification.js` (the annotation ratchet) passes — every new spawn site carries its
`// spawn-class: environment` line. `test-suite-registration.js`, `test-validation-allowband.js`,
`test-kernel-conformance.js` and `test-route-reachability.js` all pass.

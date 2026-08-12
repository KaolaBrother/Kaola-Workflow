# #957 — README ↔ Codex tier-constant binding guard

**RED proven, GREEN proven, positive control proven.** Baseline: `8742f5b80bbb912cbbb46e9809b8a9d8bab70de1`.

- Landed in: `scripts/validate-kaola-workflow-contracts.js:504-518` (15 added lines, 0 deleted).
- `README.md` byte-unchanged: `git diff --stat README.md` empty, `git diff --quiet README.md` → `exit=0`.
- `docs/**` untouched by me.

---

## 1. The code added

`scripts/validate-kaola-workflow-contracts.js`, immediately after the existing README role-catalog
block (which ends at the `docs-lookup` guard, :501-502) and before the #340 parity guard:

```js
// #957: README states the per-tier Codex model/effort pair in live normative prose ("`standard`
// dispatches as ... while `reasoning` dispatches as ..."), and until now no check read it — the
// values were free to drift away from the constants pinned above. Each expected fragment is BUILT
// from the preflight constants rather than restated; a hardcoded copy here would be the very defect.
// Normalized, because the reasoning fragment line-wraps in the source markdown.
const normalizedReadme = norm(readmeText);
for (const [tier, model, effort] of [
  ['standard', codexPreflight.CODEX_STANDARD_MODEL, codexPreflight.CODEX_STANDARD_EFFORT],
  ['reasoning', codexPreflight.CODEX_REASONING_MODEL, codexPreflight.CODEX_REASONING_EFFORT],
]) {
  const fragment = '`' + tier + '` dispatches as `' + model + '` / `' + effort + '`';
  assert(normalizedReadme.includes(fragment),
    'README Codex dispatch prose has drifted from the ' + tier + '-tier preflight constants; expected: ' + fragment);
}
```

Zero new `require`s, zero new file reads: `readmeText` is already bound at :475 and `codexPreflight`
at :430. No model/effort literal appears anywhere in the addition — `grep -c 'gpt-5\.6-sol'` over the
added region is 0 (proven by the positive control in §4, which passes with the values moved).

Note on which copy supplies the constants: :430 requires
`plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js`, not the root `scripts/` copy.
That is the right binding and needs no change — the four copies are held byte-identical by
`validate-script-sync.js` (`COMMON_SCRIPTS`, :56) *and* by this same validator's own byte group,
which is what red at :147 during the first run (§5).

## 2. Placement reasoning — `validate-kaola-workflow-contracts.js` (codex chain)

The brief named the fast gate (`validate-workflow-contracts.js`, claude chain) as the alternative
with cheaper, more frequent coverage. I did not take it. Three measured facts decided it:

1. **The fast-gate file is not one file.** `validate-workflow-contracts.js` is in
   `validate-script-sync.js`'s `COMMON_SCRIPTS` (:54) — two byte-identical copies, `scripts/` and
   `plugins/kaola-workflow/scripts/`. `edition-sync.js` does not materialize it (grep: no hits), so
   the addition would have to be hand-copied into both, and any later edit re-incurs that.
2. **Its codex twin would read a README that does not exist.** That file computes
   `root = path.resolve(__dirname, '..')`, so for the plugin copy `read('README.md')` resolves to
   `plugins/kaola-workflow/README.md` — verified absent (`ls` → `exit=1`). The rule would then be
   authored in a location where it is structurally false. `validate-kaola-workflow-contracts.js` is
   Codex-only (`validate-script-sync.js:34-35`) and has exactly one copy in the tree (`find` → 1).
3. **The latency gain is small, because both drift sources already force the codex chain.**
   `README.md` ∈ `ROOT_EDITION_READ_FILES` (`kaola-workflow-run-chains.js:710`, consumed at :760),
   and `kaola-workflow-codex-preflight.js` has a `plugins/kaola-workflow/scripts/` mirror, which
   `isEditionCouplingPath` :756 detects by `existsSync`. So a README edit *or* a constants edit is
   edition-coupling → all four chains at finalize. The codex-chain placement covers the entire drift
   class at the moment that decides the run; the fast-gate placement would only have caught it
   sooner inside the dev loop, bought with a duplicated, half-false copy.

Axiom order applied: both placements are equally *correct* (axiom 1). Axiom 2 (human time) favours
the fast gate by latency only, and the failure message names the file and the drifting tier, so a
codex-chain red is self-explanatory when it lands. Axiom 3 (spend least) and "there is already too
much in this project" then decide it — one copy, no new require, no new read.

## 3. The mirroring question — pin ONCE, do not mirror into gitlab/gitea

**Measured, not assumed:** `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
and its gitea twin contain **zero** occurrences of `README` (grep over `^const root|^const pluginRoot|README`
returned only the two `const` lines in each). They never read README at all.

Why they *do* mirror the `:444-453` constants block, and why that is not a precedent here: each forge
plugin sets its own `pluginRoot` (`plugins/kaola-workflow-gitlab` / `-gitea`, line 8 in each) and
carries its **own** `kaola-workflow-codex-preflight.js` and `install-codex-agent-profiles.js`. That
block binds a *per-tree pair of modules*, so it must exist once per tree — the subject is replicated,
not the rule. `README.md` is a single root file with a single root reader set. Asserting on it from
three validators would be three wordings of one rule over one file, which is exactly the
"one rule, one wording" failure. Pinned once, in the root Codex validator. **No mirroring.**

## 4. Mutation proofs

All mutations in disposable scratch copies under
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/cbc61aa2-7a04-4ceb-9b2b-ff62797e69c7/scratchpad/`.
No `git checkout --`, no edit-and-revert of a real file. The base mirror is `git archive 8742f5b8`
plus the edited validator; its `README.md` md5 `b8151b1b9ce43f8d3124bc108ac49e76` equals the
worktree README's, verified before mutating.

### GREEN, unmutated (clean baseline + guard)

```
$ cd scratchpad/base && node scripts/validate-kaola-workflow-contracts.js
Kaola-Workflow Codex contract validation passed
GREEN-UNMUTATED exit=0
```

### RED (a) — model drift in README

Mutation: `README.md:180`, standard fragment `gpt-5.6-sol` → `gpt-5.6-luna`.

```
Error: README Codex dispatch prose has drifted from the standard-tier preflight constants; expected: `standard` dispatches as `gpt-5.6-sol` / `medium`
    at Object.<anonymous> (.../scratchpad/mut-model/scripts/validate-kaola-workflow-contracts.js:515:3)
MUT-MODEL exit=1
```

### RED (b) — effort drift in README

Mutation: `README.md:181`, reasoning fragment `xhigh` → `high`. This is the wrapped fragment, so it
also proves the whitespace normalization works — the fragment it matched spans lines 180-181.

```
Error: README Codex dispatch prose has drifted from the reasoning-tier preflight constants; expected: `reasoning` dispatches as `gpt-5.6-sol` / `xhigh`
    at Object.<anonymous> (.../scratchpad/mut-effort/scripts/validate-kaola-workflow-contracts.js:515:3)
MUT-EFFORT exit=1
```

### POSITIVE CONTROL — the expectation really is constant-derived

Both reds above are equally consistent with a hardcoded `gpt-5.6-sol` expectation, so they do not on
their own prove the binding. Control: move the **constants and README together** to a value that
appears nowhere in the tree (`gpt-9.9-ctrl`) — all four `kaola-workflow-codex-preflight.js` copies,
all three `install-codex-agent-profiles.js` copies, the `:444-453` literal pins, and README:180-181.
A constant-derived guard must stay green; a hardcoded one must red.

```
$ cd scratchpad/pos-control && node scripts/validate-kaola-workflow-contracts.js
Kaola-Workflow Codex contract validation passed
POS-CONTROL exit=0
```

(An intermediate run of this control red at `:652` — `all three Codex profile installers must remain
byte-identical`, an unrelated check *after* the guard at :515, i.e. the guard had already passed.
Syncing the remaining two installer copies took it to the green above.)

## 5. Green on the real worktree content — and a blocker that is NOT mine

Run in the worktree, the validator reds **before reaching my guard**, on another agent's in-flight
work:

```
$ node scripts/validate-kaola-workflow-contracts.js
Error: plugins/kaola-workflow/scripts/kaola-workflow-claim.js must match scripts/kaola-workflow-claim.js
    at Object.<anonymous> (.../scripts/validate-kaola-workflow-contracts.js:147:3)
exit=1
```

I did not touch those files. Copied the worktree to scratch (`rsync`, `.git` excluded) and synced the
half-done codex mirrors **in the scratch copy only**:

```
=== run 2: with those mirrors synced ===
Kaola-Workflow Codex contract validation passed
WT-CONTENT exit=0
```

So the guard is green against the actual worktree content once that mirror gap closes.

**For the orchestrator — live at the time of writing, `md5 -q` root vs `plugins/kaola-workflow/scripts/`:**

```
OUT-OF-SYNC  kaola-workflow-claim.js
IN-SYNC      kaola-workflow-install-manifest.js
OUT-OF-SYNC  kaola-workflow-run-chains.js
IN-SYNC      kaola-workflow-codex-preflight.js
```

Both out-of-sync files have edits on *both* sides in the diff (root `+14`, mirror `+13` for claim.js;
`+38`/`+36` for run-chains.js), so those agents are mid-flight rather than having forgotten the
mirror. It will red the codex chain until they converge. Flagging, not acting.

## 6. What I did not do

- Did not edit `README.md`, `docs/api.md`, `docs/conventions.md`, or anything under `docs/`.
- Did not run `npm test` or the chains — only `scripts/validate-kaola-workflow-contracts.js`.
- Did not touch any file on the concurrent-edit exclusion list.
- Did not mirror the assert into the gitlab/gitea validators (§3 — deliberate, reasoned).

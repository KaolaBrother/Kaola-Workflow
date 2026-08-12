# Premise check — issue #958 (docs/architecture.md:295-297)

VERDICT: PREMISE HOLDS (not_refuted) — the doc sentence is false as written, exactly as the issue
states. All three "absent from" sub-claims verified true; the derivation coupling proven in code AND
operationally for BOTH editions. One evidence upgrade over the audit: the kimi leg of the A/B, which
docs/audits/2026-08-11-subtraction-audit.md D9 reported as carrying no signal, DOES carry signal
once the untracked `.kimi` tree is copied into the disposable clone — kimi's coupling is now
operationally proven, equal in strength to opencode's, so the replacement sentence needs no kimi
hedge.

verdict: pass
findings_blocking: 0

Analytical result: not_refuted. Execution: all planned measurements completed (baseline checks,
mutation A/B in a disposable clone at main HEAD `8742f5b8`, negative control, bare-clone kimi legs).
Confidence: high — every claim below is backed by a run in this session, none inherited.

Tester note on method: mutation A/B ran ONLY in a disposable clone at
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/cbc61aa2-7a04-4ceb-9b2b-ff62797e69c7/scratchpad/clone958`
(HEAD `8742f5b80bbb912cbbb46e9809b8a9d8bab70de1`, same as main), with the gitignored
`.opencode`/`.kimi` trees copied in from the main tree. The main tree was touched read-only; the
one command executed in it (`generate-routing-surfaces.js --check`) was verified read-only from
source before running (see finding 3).

---

## 1. The sentence under test, verbatim (docs/architecture.md:285-298)

`Read docs/architecture.md` (offset 275, limit 45):

```
285	## Editions and runtimes
286
287	**Four forge editions** ship the same workflow against a different forge CLI: the canonical GitHub
288	tree in `scripts/` plus `plugins/kaola-workflow/` (Codex), `plugins/kaola-workflow-gitlab/`, and
289	`plugins/kaola-workflow-gitea/`. Most scripts are rename-normalized copies —
290	`kaola-workflow-<name>.js` becomes `kaola-{forge}-workflow-<name>.js` — and `scripts/edition-sync.js`
291	plus `scripts/validate-script-sync.js` enforce that. `kaola-workflow-adaptive-schema.js` is the one
292	file held **byte-identical** across all four trees: it is the cross-edition drift anchor, and every
293	constant shared between a producer and a consumer lives there so the two cannot disagree.
294
295	**Two additive runtime editions** — opencode and Kimi — are runtimes, not forges. They are not wired
296	into `npm test`, `edition-sync.js`, `install.sh`, or the routing-surface propagation set, and they
297	carry their own suites (`test-opencode-edition.js`, `test-kimi-edition.js`). See
298	`opencode-edition.md` and `kimi-edition.md`.
```

The disputed clause is line 296: "or the routing-surface propagation set".

## 2. The three sub-claims that HOLD — each verified separately

**2a. Absent from `npm test` — HOLDS.** `package.json` `"test"` is exactly the four forge chains
(`test:kaola-workflow:claude && :codex && :gitlab && :gitea`). Regex sweep over the full closure:

```
$ node -e "const s = require('./package.json').scripts; for (const k of ['test','test:kaola-workflow:claude','test:kaola-workflow:codex','test:kaola-workflow:gitlab','test:kaola-workflow:gitea']) console.log(k + ' mentions opencode/kimi: ' + /opencode|kimi/i.test(s[k]));"
test mentions opencode/kimi: false
test:kaola-workflow:claude mentions opencode/kimi: false
test:kaola-workflow:codex mentions opencode/kimi: false
test:kaola-workflow:gitlab mentions opencode/kimi: false
test:kaola-workflow:gitea mentions opencode/kimi: false
```

The edition suites exist only under `test:kaola-workflow:editions`
(`node scripts/test-opencode-edition.js && node scripts/test-kimi-edition.js`), which is NOT
reachable from `npm test`.

**2b. Absent from `scripts/edition-sync.js` — HOLDS.**
`grep -n -i -e 'opencode' -e 'kimi' scripts/edition-sync.js` → no output, exit 1 (zero matches).

**2c. Absent from `install.sh` — HOLDS.**
`grep -n -i -e 'opencode' -e 'kimi' install.sh` → no output, exit 1 (zero matches).

Neighbour fact, for the record (does not touch the claim): `install-all.sh` DOES invoke the
standalone installers (`install-all.sh:488` → `install-opencode.sh`, `:495` → `install-kimi.sh`,
17 opencode/kimi mentions total). The doc names `install.sh`, which is clean, so this changes
nothing — but a repair must not widen the sentence to "the installers".

So the issue's framing is NOT wrong in the opposite direction: all three sub-claims it concedes are
genuinely true.

## 3. The generator's render targets — 18 = 3 topics x 6 dirs, no `.opencode`/`.kimi`

Read-only verification before running: in `scripts/generate-routing-surfaces.js` the only
`fs.writeFileSync` is at line 349 inside `cmdWrite`, reachable only via `--write`
(`main()` line 358); `cmdCheck` (lines 321-343) does `readFileSync` + byte-compare only, and
`loadSkeleton` only reads. `--check` is therefore safe in the main tree, and it is what every chain
already runs.

```
$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
exit: 0
```

The registry (`GENERATED_SURFACES`, lines 107-130) is built from `TOPICS` (3: next, init, finalize)
x (`COMMAND_EDITIONS` + `SKILL_EDITIONS`) — the six target dirs, verbatim from lines 66-75:

- `commands` (github command)
- `plugins/kaola-workflow-gitlab/commands`
- `plugins/kaola-workflow-gitea/commands`
- `plugins/kaola-workflow/skills` (github/codex skill)
- `plugins/kaola-workflow-gitlab/skills`
- `plugins/kaola-workflow-gitea/skills`

18 = 3 x 6 confirmed (also pinned by `test-generate-routing-surfaces.js:239`,
"registry derives 18 surfaces (3 topics x 6)"). Neither `.opencode` nor `.kimi` appears in any row.
So the doc IS right about render targets — the true half of its sentence.

## 4. The derivation coupling — the heart of the issue, shown in code

The chain, quoted from source (not inferred):

**Leg 1 — both sync scripts call the shared layout module.**
`scripts/sync-opencode-edition.js:48`: `const forgeLayout = require('./runtime-edition-forge');`
`scripts/sync-kimi-edition.js:48`: `const forgeLayout = require('./runtime-edition-forge');`

`scripts/sync-opencode-edition.js:161-163`:
```js
function listCanonCommands(forge) {
  return forgeLayout.commandSources(forge || DEFAULT_FORGE).map(s => s.basename).sort();
}
```
`scripts/sync-kimi-edition.js:116-118` is character-identical for this function. Both scripts also
resolve every command's source path through the same registry
(`canonCommandPath` → `forgeLayout.commandSources(...).find(...)`,
sync-opencode-edition.js:165-169 / sync-kimi-edition.js:120-124), and consume `listCanonCommands`
throughout (opencode: lines 681, 785, 877, 925, 953; kimi: lines 602, 674, 776, 819).

**Leg 2 — the layout module reads the routing registry.**
`scripts/runtime-edition-forge.js:36`: `const routing = require('./generate-routing-surfaces.js');`
`scripts/runtime-edition-forge.js:103-110`:
```js
function commandSources(forge) {
  assertForge(forge);
  return routing.commandSurfacesForForge(forge).map(row => ({
    topic: row.topic,
    basename: path.basename(row.path),
    absPath: path.join(REPO, row.path),
  }));
}
```

**Leg 3 — the registry function returns the generator's own rows.**
`scripts/generate-routing-surfaces.js:150-155`:
```js
function commandSurfacesForForge(forge) {
  ...
  return GENERATED_SURFACES.filter(r => r.surface_type === 'command' && r.forge === forge);
}
```
with the comment at lines 146-149: "Rows are the same objects `--check` byte-compares, so a topic
added here reaches every runtime without a second registration" — the generator's own text states
the coupling the doc denies. `runtime-edition-forge.js:16-19` says it again ("a runtime edition's
forge variants are GENERATED from the same source — there is nothing to hand-port").

And the code says the precise thing where the doc overgeneralizes: all three modules use "the SIX
routing surfaces", never "the propagation set" (`runtime-edition-forge.js:8-9`,
`sync-opencode-edition.js:23`, `sync-kimi-edition.js:36`).

## 5. Operational proof, opencode — disposable clone, reproduced exactly

Clone at `8742f5b8` + `.opencode` copied in.

Baseline:
```
$ node scripts/sync-opencode-edition.js --check
sync-opencode-edition[github]: 14 agent(s) + 3 command(s) + 1 plugin(s) in parity with canonical.
opencode baseline exit: 0
```

Mutation: `printf '%s\n' '<!-- premise-958 A/B probe -->' >> commands/workflow-next.md`
(git diff --stat: `commands/workflow-next.md | 1 +`).

After:
```
$ node scripts/sync-opencode-edition.js --check
sync-opencode-edition[github]: PARITY FAILED (1 file(s)):
  - .opencode/command/workflow-next.md — stale — regenerate
Fix: node scripts/sync-opencode-edition.js --forge=github --write
opencode mutated exit: 1
```

Exit codes, file named, and message text match the audit's D9 record exactly. One comment line on a
committed routing surface flips the opencode edition's own parity check — the propagation coupling
is behavioural, not just structural.

## 6. Negative control — the method distinguishes routing surfaces from ordinary scripts

```
$ node -e "const fl = require('.../scripts/runtime-edition-forge.js');
  for (const forge of fl.FORGES) { const rows = fl.commandSources(forge); ... }"
github: [workflow-next.md, workflow-init.md, kaola-workflow-finalize.md]
github classifier/sink-merge hits: 0
gitlab: [workflow-next.md, workflow-init.md, kaola-workflow-finalize.md]
gitlab classifier/sink-merge hits: 0
gitea: [workflow-next.md, workflow-init.md, kaola-workflow-finalize.md]
gitea classifier/sink-merge hits: 0
```

`commandSources` returns exactly the three routing command basenames per forge and 0 entries
matching classifier/sink-merge — it is a registry read, not a directory sweep that could have
matched any script.

## 7. The kimi leg — audit's honest limit reproduced, THEN surmounted

**7a. The limit as the audit states it is real and reproduces.** `.kimi/` is gitignored
(`.gitignore:6`) with zero tracked files (`git ls-files .kimi | wc -l` → 0), so a bare clone lacks
it. With `.kimi` absent, `sync-kimi-edition.js --check` before the mutation (leg A) and after it
(leg B) both exit 1 with the identical 19-line "PARITY FAILED (19 file(s))" output (14 role skills +
3 command skills + 2 hook files, all "missing"). Byte-diff of the two captured outputs:

```
$ diff kimi-legA.txt kimi-legB.txt
diff exit: 0 (0 = identical = NO SIGNAL)
```

Red in both legs, empty diff — exactly as D9 recorded.

**7b. But the limit is a property of the bare-clone setup, not of kimi.** With the untracked `.kimi`
tree copied into the clone (as `.opencode` was), the A/B carries full signal:

Baseline (tree present, unmutated):
```
sync-kimi-edition[github]: 14 role skill(s) + 3 command skill(s) + 2 hook file(s) in parity with canonical.
kimi baseline exit: 0
```

After the same one-line mutation (tree restored):
```
sync-kimi-edition[github]: PARITY FAILED (1 file(s)):
  - .kimi/skills/workflow-next/SKILL.md — stale — regenerate
Fix: node scripts/sync-kimi-edition.js --forge=github --write
kimi with-tree mutated exit: 1
```

Green baseline → single-file stale on the exact mutated command → kimi's coupling is now
**operationally proven**, not resting on the `listCanonCommands()` static measurement alone. The
replacement sentence may therefore claim the coupling symmetrically for both editions; no kimi
hedge is required. (The audit's record was honest and correct for its setup; this upgrades it.)

## 8. RECOMMENDED REPAIR — docs/architecture.md:295-298

**Before (verbatim):**

```
**Two additive runtime editions** — opencode and Kimi — are runtimes, not forges. They are not wired
into `npm test`, `edition-sync.js`, `install.sh`, or the routing-surface propagation set, and they
carry their own suites (`test-opencode-edition.js`, `test-kimi-edition.js`). See
`opencode-edition.md` and `kimi-edition.md`.
```

**After (recommended):**

```
**Two additive runtime editions** — opencode and Kimi — are runtimes, not forges. They are not wired
into `npm test`, `edition-sync.js`, `install.sh`, or the routing generator's render targets, but
their sync scripts derive their command surfaces from that same routing registry (via
`runtime-edition-forge.js`), so a routing-surface change leaves `.opencode`/`.kimi` stale until
regenerated. They carry their own suites (`test-opencode-edition.js`, `test-kimi-edition.js`). See
`opencode-edition.md` and `kimi-edition.md`.
```

Why this wording:
- Preserves the three true sub-claims verbatim (`npm test`, `edition-sync.js`, `install.sh`).
- Replaces the false generalization ("the propagation set") with the true half ("the routing
  generator's render targets") — chosen over the code's phrase "the six routing surfaces" because
  the generator now writes 18 surfaces into 6 dirs, and a bare "six" in a standalone doc forces the
  reader to know it counts dirs; "render targets" is what the evidence actually shows (finding 3)
  and matches the issue's own framing. If wording-parity with the three code comments is preferred,
  "or the six routing-surface render dirs" is the equally true alternative.
- States the coupling as a result with a pointer (`runtime-edition-forge.js`), not a mechanism
  restatement — per the doc's own convention ("a tier label plus a pointer, never a restatement of
  the mechanism") — and names the operational consequence ("stale until regenerated"), which is the
  exact failure D9 flags: a reader who edits a routing skeleton and never regenerates the
  opencode/kimi trees.
- True of BOTH editions on operational evidence from this session (findings 5 and 7b), so kimi is
  not overclaimed.

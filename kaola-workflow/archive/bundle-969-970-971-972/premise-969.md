# Premise check — #969 "Edition sync --check runs in no chain"

## Setup

- Commit: `7e962bdc86d188e1da99af3309a13ae0dd3d9e97` (main, working tree clean apart from this
  untracked run folder)
- Checkout: `/Users/ylpromax5/Workspace/Kaola-Workflow` (MAIN, not the worktree)
- Read-only. No tracked file edited. The only write is this report. Every command below was run at
  this commit; the six edition trees were SHA-hashed before and after the one command that could
  have mutated them, and were byte-identical (114 files, 0 changed).

## Verdict table

| # | Claim | Verdict |
|---|---|---|
| 1 | Neither sync `--check` runs in any of the four chains | **SURVIVES** (one qualification on the issue TITLE) |
| 2 | Both live only under `test:kaola-workflow:editions`, absent from `npm test` and the full tier | **SURVIVES** for npm scripts; **QUALIFIED** — the installers also invoke them |
| 3 | `generate-routing-surfaces --check` green at 18 surfaces while every edition tree is stale | **SURVIVES** as a mechanism, **REPRODUCED LIVE**; QUALIFIED on "every one of the six" |
| 4 | `install-all.sh --forge=github` regenerates github trees only | **SURVIVES**, reproduced |
| 5 | Edition trees are gitignored, so git status/diff does not surface staleness | **SURVIVES** |
| 6 | ADR 0017 watch list notes opencode misses a remediation guard kimi has | **SURVIVES** verbatim; QUALIFIED — the guard is about *remediation-report wording*, not staleness |

Plus one finding the issue does not state, which changes the fix's shape — see **Finding X**.

**The vacuity question is answered in its own section, `## Vacuity and constructibility`, at the
end.** Three headlines: the four chains execute with cwd = the **worktree**, where the edition trees
do not exist, so a skip-when-absent disk check is **provably vacuous at the receipt moment**; the
render **is** a pure function of tracked sources (105 surfaces byte-identical across roots and under
hostile env, with a positive control); and therefore a non-vacuous in-memory check is constructible
but answers a **different subject** than the one the issue names.

---

## Claim 1 — neither sync `--check` runs in any of the four chains

**SURVIVES.**

The four chains are exactly (`scripts/kaola-workflow-run-chains.js:200-207`):

```js
const KNOWN_CHAINS = ['claude', 'codex', 'gitlab', 'gitea'];
const CHAIN_COMMANDS = {
  claude: 'npm run test:kaola-workflow:claude',
  codex:  'npm run test:kaola-workflow:codex',
  gitlab: 'npm run test:kaola-workflow:gitlab',
  gitea:  'npm run test:kaola-workflow:gitea',
};
```

So a "green four-chain receipt" is exactly those four npm scripts — `package.json:40` (claude),
`:41` (codex), `:42` (gitlab), `:43` (gitea). Neither string contains `sync-opencode-edition` or
`sync-kimi-edition`.

Every tracked invocation site of the two scripts, outside `CHANGELOG.md`/`docs/`:

```
$ git grep -n -P 'sync-(opencode|kimi)-edition' -- package.json scripts/ install*.sh plugins/ templates/ agents/ commands/
```

| Site | Form | In a chain? |
|---|---|---|
| `scripts/test-opencode-edition.js:86` | `spawnSync(... '--forge='+forge, '--check')` | no — `test:kaola-workflow:editions` only |
| `scripts/test-kimi-edition.js:103` | `spawnSync(... '--forge='+forge, '--check')` | no — same |
| `install-opencode.sh:158-159` | `--check \|\| --write` | no — installer |
| `install-kimi.sh:128-129` | `--check \|\| --write` | no — installer |
| `install-opencode.sh:574` | `--write-config-to` | no |
| `scripts/simulate-workflow-walkthrough.js:11982-11983` | `require(...)` — renderer only | **yes**, claude chain |
| `scripts/test-route-reachability.js:694-695` | `require(...)` — renderer only | **yes**, claude chain |

**The qualification that matters.** Two chain-resident suites DO consume the sync modules — but
they call `renderCommand()` / `outDirs()` / `skillRel()` **in memory** and never read the edition
trees from disk. The reason is written into the code:

> `scripts/simulate-workflow-walkthrough.js` (comment above `testAxiomBlockByteIdentity`):
> "WHY THE GENERATED TREES ARE RENDERED, NOT READ. They are gitignored and absent from a fresh
> checkout and from every worktree, so a disk read would face a choice between a permanent false
> red and a skip-when-absent … Rendering is the same bytes `sync --check` asserts the on-disk tree
> equals."

So the chains verify **canonical → render**. Nothing in any chain verifies **render → disk**. That
is precisely the hole #969 names, and the claim is correct.

**The issue TITLE is refuted on a literal reading.** "Edition sync --check runs in no chain" — but
`node scripts/edition-sync.js --check` DOES run, in two chains (`package.json:42` and `:43`).
`edition-sync.js` is a different script: it regenerates the **forge aggregator ports** and asserts
the four committed Oracle-Kernel blobs are one object (`scripts/edition-sync.js:20-27`). It has
nothing to do with `.opencode`/`.kimi`. The issue body is unambiguous; only the title is.

---

## Claim 2 — both live only under `test:kaola-workflow:editions`, which is in neither tier

**SURVIVES for npm scripts. QUALIFIED: the installers also invoke them.**

`package.json:45`:

```json
"test:kaola-workflow:editions": "node scripts/test-opencode-edition.js && node scripts/test-kimi-edition.js",
```

`git grep -n 'test:kaola-workflow:editions'` returns exactly one hit in `package.json` (line 45) and
no hit in `scripts/` — no npm script and no runner references it. `npm test` (`:38`) =
claude+codex+gitlab+gitea. `test:full` (`:47`) = claude:full+codex+gitlab+gitea. Neither reaches it.
`test:kaola-workflow:claude:full` (`:46`) does not contain either sync name.

The qualification: `install-opencode.sh:158-159` and `install-kimi.sh:128-129` run
`--check || --write`, i.e. they **self-heal rather than report**, and only for the forge on the
command line. So the checks are not confined to the editions suite — they just never *fail* anywhere
that produces a verdict.

Worth recording for the fix: the editions suites' `D0` block runs `--check` per forge **before**
their own `--write`, skips a tree that is absent, and `process.exit(1)`s on drift
(`test-opencode-edition.js:74-110`, `test-kimi-edition.js:92-127`). That mechanism already has
exactly the semantics #969 wants. It is a **wiring** gap, not a missing capability — but see
`## Vacuity and constructibility` for why that wiring lands nowhere useful at the receipt moment.

---

## Claim 3 — `--check` green at 18 while edition trees carry old wording

**SURVIVES as a mechanism, and REPRODUCES LIVE AT THIS COMMIT. QUALIFIED on "every one of the six".**

What `--check` compares: `cmdCheck` (`scripts/generate-routing-surfaces.js:321-343`) iterates
`GENERATED_SURFACES` only. That set is derived at `:107-130` as 3 topics × (3 `COMMAND_EDITIONS` +
3 `SKILL_EDITIONS`) = **18**, all tracked paths under `commands/` and `plugins/*/skills/`
(`:66-75`). No `.opencode`/`.kimi` path is in the set. `cmdWrite` (`:345-352`) writes the same 18.

### Live reproduction

```
$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
EXIT:0
```

...at the same commit where four of the six edition trees are stale:

```
$ for f in github gitlab gitea; do node scripts/sync-opencode-edition.js --forge=$f --check >/dev/null 2>&1; echo "opencode $f EXIT:$?"; done
$ for f in github gitlab gitea; do node scripts/sync-kimi-edition.js   --forge=$f --check >/dev/null 2>&1; echo "kimi $f EXIT:$?"; done
opencode github EXIT:0
opencode gitlab EXIT:1
opencode gitea  EXIT:1
kimi     github EXIT:0
kimi     gitlab EXIT:1
kimi     gitea  EXIT:1
```

(Exit codes captured with the pipe removed — `cmd | tail` reports tail's status.)

12 stale files, 3 per stale tree:

```
sync-opencode-edition[gitlab]: PARITY FAILED (3 file(s)):
  - .opencode-gitlab/command/kaola-workflow-finalize.md — stale — regenerate
  - .opencode-gitlab/command/workflow-init.md — stale — regenerate
  - .opencode-gitlab/command/workflow-next.md — stale — regenerate
sync-kimi-edition[gitea]: PARITY FAILED (3 file(s)):
  - .kimi-gitea/skills/kaola-workflow-finalize/SKILL.md — stale — regenerate
  - .kimi-gitea/skills/workflow-init/SKILL.md — stale — regenerate
  - .kimi-gitea/skills/workflow-next/SKILL.md — stale — regenerate
```

### The stale prose is exactly the #968 bundle change

Rendering `.opencode-gitlab/command/workflow-next.md` in memory and diffing against disk (67 diff
lines). The on-disk tree still carries the pre-#968 wording:

```
-A run normally carries one issue. Several issues may share one run when they are all open,
-unclaimed, and share a coherent scope; that is a shape judgement and nothing caps it.
+A run normally carries **three to five issues**. One issue is the exception rather than the norm:
...
-node "$CLAIM_JS" startup --runtime opencode --target-issue "$KAOLA_TARGET_ISSUE"
+node "$CLAIM_JS" startup --runtime opencode --target-issues "$KAOLA_TARGET_ISSUES"
```

Provenance: `fd00ef63` (2026-08-12) "change: the bundle is a run's default shape…" touched
`templates/routing/`. The stale files' mtimes are 2026-08-01 12:31 and 2026-08-10 23:27; the
github trees are 2026-08-12 22:53.

Note the second hunk: this is not only prose. The stale gitlab/gitea opencode + kimi surfaces
instruct the reader to run `--target-issue "$KAOLA_TARGET_ISSUE"` where canonical now says
`--target-issues "$KAOLA_TARGET_ISSUES"`.

### Chain-resident guards, run individually against the stale trees

| Guard | Chain | Result | Exit |
|---|---|---|---|
| `generate-routing-surfaces.js --check` | all four | `all 18 surfaces byte-match the skeleton` | 0 |
| `test-route-reachability.js` | claude | `Route-reachability test passed (331 assertions)` | 0 |
| `test-generate-routing-surfaces.js` | claude | (silent pass) | 0 |
| `simulate-workflow-walkthrough.js --only testAxiomBlockByteIdentity` | claude | `PASSED (12 surfaces)` | 0 |

All four green over 12 stale files. The reproduction is complete.

### The qualification

The issue says "every one of the six edition trees still carried the old wording." At this commit
it is **four of six** — `.opencode` and `.kimi` (github) are in parity, because today's
`install-all.sh --forge=github` reinstall refreshed them at 22:53. The issue's sentence describes
the state observed *during* the #968 run, before that reinstall; it is not the state now. The
mechanism claim (all six *can* be stale with everything green) is unaffected.

---

## Claim 4 — `install-all.sh --forge=github` regenerates the github trees only

**SURVIVES**, by code and by reproduction.

`install-all.sh:488` and `:495` forward the flag verbatim:

```
OPENCODE_CMD=(bash "$ROOT/install-opencode.sh" --forge="$FORGE" "${OC_SCOPE[@]}")
KIMI_CMD=(bash "$ROOT/install-kimi.sh" --forge="$FORGE" "${KIMI_SCOPE[@]}")
```

Each installer then refreshes exactly one tree — `install-opencode.sh:151-160`:

```
# The generated tree this forge deploys FROM: .opencode for github, .opencode-<forge> otherwise.
SOURCE_TREE="$SCRIPT_DIR/.opencode$FORGE_SUFFIX"
...
  node "$SCRIPT_DIR/scripts/sync-opencode-edition.js" --forge="$FORGE" --check >/dev/null 2>&1 \
    || node "$SCRIPT_DIR/scripts/sync-opencode-edition.js" --forge="$FORGE" --write >/dev/null
```

`install-kimi.sh:121-130` is the same shape. Reproduced by mtime: the github trees carry
2026-08-12 22:53 (today's `--forge=github` reinstall), the gitlab/gitea trees carry
2026-08-01 / 2026-08-10.

---

## Claim 5 — the trees are gitignored

**SURVIVES.**

```
$ git check-ignore -v .opencode .opencode-gitlab .opencode-gitea .kimi .kimi-gitlab .kimi-gitea
.gitignore:5:.opencode/	.opencode
.gitignore:9:.opencode-*/	.opencode-gitlab
.gitignore:9:.opencode-*/	.opencode-gitea
.gitignore:6:.kimi/	.kimi
.gitignore:10:.kimi-*/	.kimi-gitlab
.gitignore:10:.kimi-*/	.kimi-gitea
```

All six exist in main. `git status --porcelain` at this commit shows only the untracked run folder —
12 stale files invisible.

---

## Claim 6 — ADR 0017 watch list: opencode misses a guard kimi has

**SURVIVES verbatim. QUALIFIED on what the guard is about.**

`docs/decisions/0017-the-mission-list.md:147` says exactly:

> "So **opencode is the edition missing a guard its sibling already has** — the sharpest fact that
> would arm this row, and still not an observed failure."

The row's subject is *"an opencode `--check` report that advises a command without scoping out what
that command cannot fix"* — the **remediation-report wording**, mutation-measured against #951. The
kimi twin is `K12` (`test-kimi-edition.js:1324-1414`). It is not a staleness-detection guard, and
closing it would not move #969's stated result at all. The issue's phrasing ("Note the neighbouring
asymmetry") already treats it as adjacent rather than causal, which is accurate.

---

## Finding X — not in the issue, and it constrains the fix

**The #968 run's own remediation did not survive, because it was performed in a worktree that was
then deleted.**

`kaola-workflow/archive/issue-968/mission-list.md:31` records:

> "Six sync runs, 19 files each, all exit 0 … npm run test:kaola-workflow:editions green — opencode
> 570 assertions, kimi 528, **all six trees reported in parity**."

`kaola-workflow/archive/issue-968/workflow-state.md:37,41` records `run_posture: worktree`,
`worktree_path: …/.kw/worktrees/issue-968`. That path no longer exists (`git worktree list` shows
only main and the current bundle worktree). The main tree's gitlab/gitea edition trees were never
written — their mtimes predate the run — and are the 12 stale files measured above.

So the class is worse than "someone forgot to sync": **syncing correctly, in the standard worktree
posture, leaves main stale**, and the record honestly reports parity for a tree that has since been
removed. Any fix that relies on "the run regenerates the trees" inherits this. A fix that reds on
*main's* state does not.

---

## Vacuity and constructibility

### V1. Where the four chains actually run — the worktree, measured

`kaola-workflow-run-chains.js` header, `:45`, states the contract outright:

> "Run from the **worktree root** (the #466 contract), the producer's bare cwd default
> (`.cache/chain-receipt.json`) lands at the WORKTREE ROOT, not under `kaola-workflow/<project>/`"

The code path, unbroken:

| Step | file:line |
|---|---|
| `const cwd = process.cwd();` | `kaola-workflow-run-chains.js:1030` |
| `dispatchChains(specs, cwd, timeoutMs, …)` | `:1219` |
| `dispatchChain(spec, cwd, …)` → `runChainSteps` → `runSpecWithRetry` | `:565`, `:428`, `:368` |
| `runChainSync(spec, cwd, timeoutMs)` → `spawnSync(…, { cwd, … })` | `:288-296` |
| (concurrent path, same `cwd`) `runChainAsync` | `:496-509` |

`cwd` is `process.cwd()` **verbatim** — never normalized through `getGitTopLevel`. `getGitTopLevel`
(`:795-799`) is used only for *receipt/record path* resolution (`:844`, `:1068`) and the release
check (`:904`). So the four `npm run test:kaola-workflow:*` children inherit the invoker's cwd,
which at finalize is the provisioned worktree.

**Literal `ls -a` of the current provisioned worktree**, exactly as asked:

```
$ ls -a /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-969-970-971-972/
.
..
.agents
.env.example
.git
.gitignore
agents
AGENTS.md
CHANGELOG.md
CLAUDE.md
commands
docs
hooks
install-all.sh
install-kimi.sh
install-opencode.sh
install.sh
kaola-workflow
LICENSE
opencode.json
package-lock.json
package.json
plugins
README.md
scripts
templates
uninstall.sh
EXIT:0
```

No `.opencode`. No `.kimi`. No `.opencode-gitlab`, `.opencode-gitea`, `.kimi-gitlab`, `.kimi-gitea`.
Confirmed by direct probe as well:

```
$ ls -d …/.kw/worktrees/bundle-969-970-971-972/.opencode …/.kimi
ls: …/.kimi: No such file or directory
ls: …/.opencode: No such file or directory
```

**CONFIRMED, not refuted: a skip-when-absent disk check placed in any of the four chains never fires
at the receipt moment.** Every one of its six per-forge probes takes the ABSENT branch, and the
receipt goes green having compared nothing. That is a guard that cannot fail — the exact class this
repo's own conventions name ("a green suite is not proof a guard is armed"), and the same shape the
edition suites already recorded against themselves once (`CHANGELOG.md:1704-1718`: `--write` before
`--check` healed the drift and then observed it clean).

Two corollaries, both measured:

- The vacuity is **total, not partial**. It is not "weaker in a worktree" — all six trees are absent,
  so nothing is compared at all.
- It is also **silent by construction under the existing banner**. `D0`'s absent-branch text is
  `[drift-check: NO tree verified; 3 ABSENT, not checked]`, which is honest, but honest-and-green.
  In a chain that prints nothing on success, even that distinction disappears.

This supersedes the reading in `## Feasibility` below that presence-gating "fully answers" the
false-red objection. It answers it — by making the check inert exactly where the receipt is produced.

### V2. Is the transform a pure function of tracked sources? — YES, measured

A/B over **105 rendered surfaces** = 3 forges × (14 opencode agents + 14 kimi role skills +
3 opencode commands + 3 kimi command skills + 1 kimi hooks fragment), each SHA-256'd:

| Leg | Root | Env | Result |
|---|---|---|---|
| baseline | MAIN (all six trees present, 4 stale) | clean | 105 surfaces |
| A | **worktree** — no edition tree on disk at all | clean | 105 surfaces, **byte-identical to baseline** |
| B | MAIN | `KAOLA_OPENCODE_STANDARD_MODEL=zzz/hostile-standard`, `KAOLA_OPENCODE_REASONING_MODEL=zzz/hostile-reasoning` | 105 surfaces, **byte-identical to baseline** |

Entry points exercised: `renderAgent`, `renderCommand` (both modules), `renderKimiHooksToml`,
via `routing.commandSurfacesForForge` / `listCanonAgents` / `outDirs` / `skillRel`.

**Positive control on leg B** — otherwise the identity would prove nothing:

```
renderNeutralConfig(), clean env   → e653cba7…  "no hostile pin"
renderNeutralConfig(), hostile env → 84014f48…  "CONTAINS hostile pin"
```

The two `process.env` reads (`sync-opencode-edition.js:93-94`, the only impure inputs in either
module — `git grep -P 'process\.env|Date\.now|new Date|Math\.random|hostname|os\.'` over both sync
scripts plus `runtime-edition-forge.js` returns those two lines and nothing else) reach the
**opencode.json config renderer only**, never the 105 agent/command/hook surfaces. So leg B is a real
discriminator and leg A's identity is a genuine purity result.

**Conclusion: the edition render is a pure function of tracked sources.** A render-and-compare check
needs no materialized tree and is fully constructible in a worktree, in a fresh clone, and in CI.

### V3. What a non-vacuous check could compare — and the subject split that decides it

The purity result makes **two different checks** constructible. They are not interchangeable, and
conflating them is how this fix goes vacuous.

**Subject 1 — canonical → render.** "Does the tracked skeleton render to edition surfaces with the
required properties?" Needs no tree. **Already built and already chain-resident**:
`test-route-reachability.js:800-813` (`GENERATED_SURFACE_CONTENT`, renders all 12 command-lane
edition surfaces in memory) and `simulate-workflow-walkthrough.js:11980-12035`
(`testAxiomBlockByteIdentity`, 12 surfaces). Non-vacuous everywhere. **But it was green over all 12
stale files** — measured above — because a stale *disk* tree is invisible to it. Extending this
subject cannot reach #969's stated result no matter how far it is widened.

**Subject 2 — render → disk.** "Does the tree on disk equal the render?" This is the subject #969
names ("while an edition tree still carries the old prose"). It **structurally requires reading a
disk tree**, and no purity result removes that: purity tells you what the tree *should* contain, not
what it *does*. In the worktree where the chains run, the answer is always "there is no tree", so
the check is inert there — V1.

A **recorded-digest manifest** (tracked file of expected per-surface digests, compared in memory)
does not escape this. It would be non-vacuous in a worktree, but it is Subject 1 wearing Subject 2's
clothes: it pins render determinism against a stored value and still cannot observe main's disk.

The only measured way a worktree-resident check could reach main's trees is to **resolve the main
checkout explicitly**. Both routes exist today:

```
$ git -C …/.kw/worktrees/bundle-969-970-971-972 rev-parse --git-common-dir
/Users/ylpromax5/Workspace/Kaola-Workflow/.git          # dirname → the main checkout
$ grep -n 'main_root' kaola-workflow/bundle-969-970-971-972/workflow-state.md
38:main_root: /Users/ylpromax5/Workspace/Kaola-Workflow
```

I record these as facts about constructibility, not as a proposal: a chain step that reaches outside
its own checkout is a new property for these chains, and whether that is acceptable is not something
a measurement settles.

### V4. What `--check` does today, and its exit behaviour when the tree is missing

`runCheck` in `sync-opencode-edition.js:805-900` compares, per forge:

| Comparison | Source of truth | Missing-file behaviour |
|---|---|---|
| 14 agents | `renderAgent(read('agents/<n>.md'))` | mismatch `missing generated agent` (`:812-814`) |
| 3 commands | `renderCommand(canon, forge, rel)` | mismatch `missing generated command` (`:823-825`) |
| `HOOK_SCRIPTS` | byte-copy of `hooks/<script>` | mismatch `missing hook script copy` (`:832-834`) |
| `PLUGIN_SCRIPTS` | byte-copy of `templates/opencode/plugins/<s>` | mismatch `missing generated plugin` (`:841-843`) |
| plugin allowlist set-equality | tracked dir listing | tracked-only, needs no tree (`:851-865`) |
| retired-surface prune (commands, agents, hooks, plugins) | canonical sets | reads the tree dir (`:868-882`) |
| `opencode.json` | `renderOpencodeJson()` | **gated on `fs.existsSync`** (`:886-888`) — and this file is **tracked**, so it is the one comparison that is live in a worktree too |

`sync-kimi-edition.js` `runCheck` is the same shape (`:755-787`): role/command skills, adapted hook
copies, the generated `kimi-hooks.toml`, and retired-dir pruning.

**So: it compares an existing tree against freshly-rendered content, and a missing tree is a
MISMATCH, never a skip.** Both exit 1 with `process.exitCode = 1` (`:890-894` / `:776-781`).

**Literal output, all six, cwd = MAIN** (trees present; 4 of 6 stale):

```
$ node scripts/sync-opencode-edition.js --forge=github --check
sync-opencode-edition[github]: 14 agent(s) + 3 command(s) + 1 plugin(s) in parity with canonical.
EXIT:0

$ node scripts/sync-opencode-edition.js --forge=gitlab --check
sync-opencode-edition[gitlab]: PARITY FAILED (3 file(s)):
  - .opencode-gitlab/command/kaola-workflow-finalize.md — stale — regenerate
  - .opencode-gitlab/command/workflow-init.md — stale — regenerate
  - .opencode-gitlab/command/workflow-next.md — stale — regenerate
Fix: node scripts/sync-opencode-edition.js --forge=gitlab --write
EXIT:1

$ node scripts/sync-opencode-edition.js --forge=gitea --check
sync-opencode-edition[gitea]: PARITY FAILED (3 file(s)):
  - .opencode-gitea/command/kaola-workflow-finalize.md — stale — regenerate
  - .opencode-gitea/command/workflow-init.md — stale — regenerate
  - .opencode-gitea/command/workflow-next.md — stale — regenerate
Fix: node scripts/sync-opencode-edition.js --forge=gitea --write
EXIT:1

$ node scripts/sync-kimi-edition.js --forge=github --check
sync-kimi-edition[github]: 14 role skill(s) + 3 command skill(s) + 2 hook file(s) in parity with canonical.
EXIT:0

$ node scripts/sync-kimi-edition.js --forge=gitlab --check
sync-kimi-edition[gitlab]: PARITY FAILED (3 file(s)):
  - .kimi-gitlab/skills/kaola-workflow-finalize/SKILL.md — stale — regenerate
  - .kimi-gitlab/skills/workflow-init/SKILL.md — stale — regenerate
  - .kimi-gitlab/skills/workflow-next/SKILL.md — stale — regenerate
Fix: node scripts/sync-kimi-edition.js --forge=gitlab --write
EXIT:1

$ node scripts/sync-kimi-edition.js --forge=gitea --check
sync-kimi-edition[gitea]: PARITY FAILED (3 file(s)):
  - .kimi-gitea/skills/kaola-workflow-finalize/SKILL.md — stale — regenerate
  - .kimi-gitea/skills/workflow-init/SKILL.md — stale — regenerate
  - .kimi-gitea/skills/workflow-next/SKILL.md — stale — regenerate
Fix: node scripts/sync-kimi-edition.js --forge=gitea --write
EXIT:1
```

**The missing-entirely case can only be measured where the trees are missing** — the worktree, since
main has all six. Run there:

```
$ node …/.kw/worktrees/bundle-969-970-971-972/scripts/sync-opencode-edition.js --check
sync-opencode-edition[github]: PARITY FAILED (19 file(s)):
  - .opencode/agent/adversarial-verifier.md — missing generated agent
  - .opencode/agent/build-error-resolver.md — missing generated agent
  - .opencode/agent/code-architect.md — missing generated agent
  … (19 total)
EXIT:1

$ node …/.kw/worktrees/bundle-969-970-971-972/scripts/sync-kimi-edition.js --check
sync-kimi-edition[github]: PARITY FAILED (19 file(s)):
  - .kimi/skills/kaola-role-adversarial-verifier/SKILL.md — missing generated role skill
  … (19 total)
EXIT:1
```

### V5. The dilemma, stated plainly

Both horns are measured, not argued:

- **Bare `--check` in a chain** → exit 1 in every worktree and every fresh clone (V4). Unusable.
- **Presence-gated `--check` in a chain** → all six trees absent where the chains run (V1). Vacuous
  at the receipt moment; a guard that cannot fail.
- **In-memory render check in a chain** → non-vacuous everywhere (V2), already partly built, but
  Subject 1 — it was green over the 12 stale files this run reproduced (V3). Does not reach the
  stated result.

Nothing measured here rules out a mechanism that reaches main's checkout explicitly (V3, last
paragraph) or one that closes the class at the source rather than detecting it (candidate D). Which
of those is acceptable is a design and value call, not a measurement.

---

## Feasibility

### The rule tension

`CLAUDE.md:181-183`: "**opencode and kimi are additive runtime editions**, not forges: absent from
`npm test`, `edition-sync.js` and `install.sh`. An edition-only diff owes no four-chain run; run its
own suite." Restated at `docs/api.md:1489`, `docs/architecture.md:296`,
`docs/audits/opencode-edition-audit.md:428`, `docs/decisions/D-530-02.md`.

**Wiring either `--check` into a chain script violates the rule as literally written.** It also
re-opens a decision made once already, on the record — `CHANGELOG.md:1714-1718`:

> "`package.json` is deliberately untouched — `test:kaola-workflow:editions` already runs both
> suites and is the owner-ruled surface for additive runtime editions, and a bare `--check` step
> would false-red every fresh clone."

That stated reason is **measured true** (V4, worktree leg). A bare `--check` chain step reds every
fresh clone and every worktree. Confirmed, not assumed.

**The two objections are separable, and BOTH turn out to bite.**

- The *false-red* objection is about a **bare** `--check`, and presence-gating disposes of it — the
  `D0` shape already ships in both edition suites. **But V1 shows the cure is vacuity**: presence-
  gating in a chain means the check never fires where the receipt is made. So this objection is not
  "answered"; it is traded for a worse one.
- The *rule* objection is not answered by any mechanism. `CHAIN_COMMANDS` maps each chain to one
  npm script, so anything that can red the four-chain receipt is inside `npm test`. **This is a
  value call for the user, not a fact a measurement settles.**

**Cost is not a factor either way.** `/usr/bin/time -p`, github forge: `sync-opencode-edition
--check` 0.03s real, `sync-kimi-edition --check` 0.02s, `generate-routing-surfaces --check` 0.02s.

### Candidates measured

**A. Add the two `--check`s to the chain scripts.**
Reaches the stated result *only in main*. Requires presence-gating (a bare step false-reds every
clone and worktree — V4), and presence-gating makes it inert in the worktree where finalize runs
(V1). Violates `CLAUDE.md:181` as written and reverses the recorded ruling at
`CHANGELOG.md:1714-1718`; the rule is restated in four docs that would need updating together.
Scoping question the issue raises — every chain or only some: a per-forge natural mapping exists
(gitlab chain checks `.opencode-gitlab`/`.kimi-gitlab`, etc.), but the four chains do not partition
by forge in that way — `test:kaola-workflow:claude` is the github chain by convention only, so a
split would be a new coupling rather than an existing one. Cost ~0.05s per chain.

**B. Fold into `generate-routing-surfaces.js --check`.**
Needs **no new chain wiring** — it already runs in all four chains (`package.json:40-43`) — and
touches no chain script, so `npm test` gains the behaviour without gaining a step naming opencode or
kimi. **Inherits V1 unchanged**: whatever it compares on disk is absent in the worktree, so it is
either false-red or vacuous by the same argument. Structural cost on top: the dependency currently
runs one way — `sync-*-edition.js:48` requires `runtime-edition-forge`, which requires
`generate-routing-surfaces.js` at `runtime-edition-forge.js:34`. Making routing require the sync
modules creates a **circular top-level require**, needing a lazy require inside the check path or a
move of the render entry points. Same rule tension as A, just less visible in the chain string —
arguably worse, not better, for a rule stated in prose.

**C. Diff-scope to `templates/routing/`.**
Measured directly:

```js
rc.isEditionCouplingPath('templates/routing/next.skeleton.md', cwd, new Set())  // false
rc.isEditionCouplingPath('templates/routing/slots.js', …)                        // false
rc.isEditionCouplingPath('commands/workflow-next.md', …)                         // true
rc.isEditionCouplingPath('plugins/kaola-workflow/skills/…/SKILL.md', …)          // true
rc.isEditionCouplingPath('scripts/sync-opencode-edition.js', …)                  // false
```

**This candidate does not reach the stated result.** Chain *selection* only decides which of the
four chains run; since no chain checks an edition tree, forcing all four for a skeleton edit adds
nothing. (In practice a skeleton edit plus its mandated regenerate already touches `commands/` and
`plugins/*/skills/`, so all four already run — `edition_coupling`.) Adding `templates/routing/` to
`ROOT_EDITION_READ_PREFIXES` would be a no-op against this defect.

**D. Close the class at the source instead of detecting it.**
Have the regenerate step the rule already mandates ("edit the skeleton and regenerate") also refresh
any edition tree **that is present**. That leaves `npm test`, `edition-sync.js` and `install.sh`
untouched — no rule tension at all — and it is the only candidate that also addresses **Finding X**,
since it makes the six-invocation follow-up unforgettable rather than merely checked. It is also the
only candidate not defeated by V1, because it acts where the trees are (main) rather than where the
receipt is made (the worktree). It does not literally satisfy "cannot reach a green four-chain
receipt", because there is no red; it makes the red state unreachable in main instead. Whether that
counts as the stated result is a reading the user owns. Note also that `--write` gaining edition
coverage while `--check` does not is itself an asymmetry worth stating explicitly if this route is
taken.

### What I did not measure

- I did not run all four chains end to end. The chain-resident guards that touch the edition
  surfaces were run individually and are listed above; the claim "four green chains certify stale
  trees" rests on that plus the enumeration of the four chain command strings, not on a full run.
- I did not observe a real finalize invocation of `run-chains`. V1 rests on the code path
  (`:1030` → `:1219` → `:288`) plus the header's stated `#466` contract at `:45`, and on the
  measured absence of the trees in the live provisioned worktree — not on watching finalize run.
- I did not run `npm run test:kaola-workflow:editions` to completion. `test-opencode-edition.js`
  was run and exited 1 at `D0[gitlab]` before its own `--write`, which I verified left every one of
  the 114 hashed files byte-identical — so the reproduction was not repaired by measuring it. The
  kimi suite was not run for the same reason (it would have been the second half of a `&&` that
  already failed).
- The V2 purity sweep covers the agent, command and hook lanes (105 surfaces). It does not cover the
  opencode plugin byte-copy (`templates/opencode/plugins/*.js` → tree) or `opencode.json`; both are
  byte-copies/renders of **tracked** sources, so neither can depend on an edition tree, but I did not
  A/B them.
- I did not repair the four stale trees. That is a mutation of state, and the remedy is the run's
  call, not mine.

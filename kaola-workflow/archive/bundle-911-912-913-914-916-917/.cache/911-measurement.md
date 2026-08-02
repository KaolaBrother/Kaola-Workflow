# Investigation: #911 — does a relative `--plan` carry the #910 defect, and does `--plan` still have a producer?

**Q1 — `--plan` has NO live producer.** Zero prompt/command/skill/routing surfaces pass it in any of
the four editions; the sole rendered invocation slot (`fz-runchains-run`) passes `--project` on all
three forge renderings. Nothing in any live code path authors a `workflow-plan.md` either: every
`writeFileSync` of that name in the repository is a test fixture, every production reference is an
`existsSync`/`readFileSync` legacy tolerance, and `docs/workflow-state-contract.md:406-409` already
states the file is "read by nothing, and never newly authored."

**Q2 — the mis-landing REPRODUCES, byte-for-byte the #910 shape.** From a linked worktree,
`--plan kaola-workflow/issue-1/workflow-plan.md` writes the receipt into `<worktree>/…` while the
finalize gate reads `<main>/…`; four green chains classify `chains_unverified`. Copying the identical
receipt bytes into main's folder flips the same gate to `chains_green`, so location alone is the
difference. `--project`, absolute `--plan`, and a plain repository are all unaffected.

---

## Setup

| | |
|---|---|
| Commit | `540f79a21622bbd4635e1e0c290741aea4fae27f` (branch `main`, clean apart from the untracked bundle folder) |
| Node | `v24.18.0` · Darwin 25.6.0 |
| Fixture | `/private/tmp/claude-501/…/scratchpad/fx911/` — `main/` (git root, self-host `package.json` declaring all four `test:kaola-workflow:*`), `wt/` (linked worktree on branch `feat`, one commit ahead so the two trees genuinely differ), `plain/` (standalone repo). `kaola-workflow/` is `.gitignore`d in both roots so the live run folder is **untracked**, matching the real repository. |
| Run folder | `main/kaola-workflow/issue-1/` only. `wt/` carries none — the #910 standard posture, pre-Step-8a. |
| Chain mock | `--chains claude --mock-chain claude:<script exiting 0>` — a real receipt, no real chain run |

Nothing under the user's repository was modified. This file is the only write.

---

## Q1 — Does `--plan` still have a live producer?

### (a) No surface passes `--plan`

Repo-wide `grep -rn -- "--plan"` (excluding `.git`, `node_modules`, `.kw`) — occurrences per file:

```
  17 scripts/kaola-workflow-run-chains.js                                  <- its own usage/comments
  17 plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js           <- ditto
  17 plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js
  17 plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js
   7 docs/api.md                                                           <- documentation
   6 scripts/test-run-chains.js                                            <- T23 only
   3 CHANGELOG.md
   1 docs/architecture.md · 1 docs/decisions/D-586-01.md
   … everything else is under kaola-workflow/archive/ or .origin/ (historical run records)
```

Zero hits in `templates/`, in any `plugins/*/commands/`, `plugins/*/skills/`, `plugins/*/agents/`, or
in the opencode/kimi edition trees.

The one live invocation surface, and its skeleton:

```
templates/routing/slots.js:118
  "fz-runchains-run": {"github":"node \"$KAOLA_SCRIPTS/kaola-workflow-run-chains.js\" --project {project}",
                       "gitlab":"… --project {project}","gitea":"… --project {project}"}

plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md:124        --project {project}
plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md:124 --project {project}
plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md:124  --project {project}
```

### (b) Nothing authors a `workflow-plan.md`

Every reference, classified. **`produces`: none.**

| Site | Class | Evidence |
|---|---|---|
| `scripts/kaola-workflow-adaptive-schema.js:42` `const PLAN_FILE = 'workflow-plan.md'` (×4 editions, byte-anchor) | constant | exported at `:1688`; two consumers only, both reads |
| `scripts/kaola-workflow-claim.js:2045` (`reconcileNextCommand`) | **reads-only** | `fs.existsSync(… PLAN_FILE)` — legacy-folder resume tolerance. Comment `:2036-2038`: "a legacy folder's frozen `workflow-plan.md` still counts as that record" |
| `scripts/kaola-workflow-claim.js:5568` (`listSourceEvidenceFiles`) | **reads-only** | `fs.existsSync` in the archive-completeness set. Comment `:5531-5532`: "`workflow-plan.md` is listed for the LEGACY folder that still carries a frozen plan; **nothing authors one any more**, and its absence is never demanded" |
| `scripts/kaola-workflow-claim.js:3218` | comment | explains `FINALIZE_MIRROR_DEST_OWNED` deliberately omits it |
| `scripts/kaola-workflow-sink-merge.js:1633` | **reads-only** | a filename in `projStateFiles`, matched against `git status --porcelain` output for untracked-duplicate detection; never written |
| `scripts/kaola-workflow-adaptive-schema.js:567` | comment | historical rationale for `writeFileAtomicReplace` |
| `scripts/validate-workflow-contracts.js:173,559` | **guard** | `retiredExecutor` list — asserts the token is **gone** from surfaces |
| `scripts/validate-kaola-workflow-contracts.js:317` | **guard** | same, as a retired-token regex |
| `plugins/kaola-workflow-{gitlab,gitea}/scripts/…claim.js:2012` `persistExpansionRollupToSummary` | **reads-only, and a canonical divergence** | `readFileSync(destDir/'workflow-plan.md')` → early `return false` when absent. Called once (`:4320` / `:4316`) on the archive destination. **Canonical `scripts/kaola-workflow-claim.js` contains neither this function nor `parseExpansionRecords` (grep count 0)** — the ports still carry a reader canonical deleted. Inert either way: no plan is ever authored for it to read |
| `scripts/simulate-workflow-walkthrough.js:7689,7697,12384` · `test-finalize-door.js:806` · `test-claim-hardening.js:2981` · `test-sink-merge.js:758,875,1877` · `test-bash-block-guards.js:67` · both forge sink suites | **test fixtures** | every `writeFileSync` of the name in the repository |
| `simulate-workflow-walkthrough.js:139,357,358,12186,12510` | unrelated | the retired `/kaola-workflow-plan-run` **command** token, not the file |
| `simulate-workflow-walkthrough.js:11300,11369` | unrelated | the `workflow-planner` **role**, not the file |
| `simulate-workflow-walkthrough.js:9563` | comment | records a function that was deleted |

### (c) The design already says so

`docs/workflow-state-contract.md:406-409`:

> A frozen `workflow-plan.md`, a `## Node Ledger`, a `plan_hash`, `.cache/epochs/`,
> `.cache/running-set.json`, `workflow-tasks.json` and per-node `.cache/barrier-*` files belong to
> the retired node/DAG executor. **They survive only in archived runs, are read by nothing, and are
> never newly authored.**

`docs/architecture.md:61-63` lists `workflow-plan.md` and its `## Node Ledger` under "What was
deleted". ADR 0017 contains **zero** occurrences of `workflow-plan` or `--plan` — it retires the
plan *record shape* (`plan_hash`, the freeze chain, epochs: `:107-108`) without naming the flag.

`docs/api.md:417` already describes the flag as legacy:

> `--plan <path>` — write the receipt to `<dir-of-path>/.cache/chain-receipt.json`. **A legacy
> path-derivation alias; `--project` is the flag to use**

and `docs/api.md:430-432` already documents the exact behaviour #911 reports:

> `--plan` and `--output` are explicit caller-supplied paths and resolve against cwd unchanged; a
> **relative** `--plan` from a linked worktree therefore still lands under the invoking tree.

**Inference (high confidence):** `--plan` is a flag with a documented-legacy status, no producer, no
prose surface, and an argument type (`<dir-of-plan>`) whose namesake artifact the design states is
never authored. Refuted by: finding any surface, script or installed runtime that passes `--plan`, or
any code path that writes a `workflow-plan.md` outside a test fixture. I found none.

---

## Q2 — Reproduction

### The resolver, as it stands

`scripts/kaola-workflow-run-chains.js:836-845` (identical in all four editions):

```js
function resolveOutputPath(opts, cwd) {
  if (opts.output != null) return path.resolve(cwd, opts.output);
  if (opts.plan != null) {
    return path.join(path.dirname(path.resolve(cwd, opts.plan)), '.cache', 'chain-receipt.json');
  }
  if (opts.project != null) {
    return path.join(resolveProjectRecordDir(getGitTopLevel(cwd), opts.project), '.cache', 'chain-receipt.json');
  }
  return path.join(cwd, '.cache', 'chain-receipt.json');
}
```

Verified as the lead described: `resolveProjectRecordDir` at `:821` reaches
`validationRunner.resolveRecordFolder` (`scripts/kaola-workflow-validation-runner.js:1261`), which
searches the invoking tree, then MAIN via `schema.resolveMainRoot`, and returns `dir: null` when the
folder is live in neither — the fallback at `:826` that leaves a plain repository unchanged. The rule
is stated at `:809`, and `:834` records the choice not to move `--plan`.

### The gate's read path

`scripts/kaola-workflow-claim.js:3771-3777` → `cacheDir = path.join(authorityDir, '.cache')`, and
`adaptiveSchema.evaluateChainReceipt(gateRoot, { cacheDir, project })` reads
`path.join(cacheDir, 'chain-receipt.json')` (`kaola-workflow-adaptive-schema.js:1391`). `authorityDir`
comes from `predictFinalizeAuthority` (`claim.js:3714`), which on the standard worktree posture
resolves `source: pending_mirror`, `source_dir: <main>/kaola-workflow/<P>` — main's folder.

### The matrix

Every row: the chains are run for real (mocked green), then `finalize --project issue-1 --check --json`
is invoked from the same cwd. "Gate reads" is `authority.source_dir + '/.cache/chain-receipt.json'`
straight out of the gate's own JSON envelope. Paths abbreviated with `$FX` =
`/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/425a0716-b59d-4020-b7c4-2cab21f2af3e/scratchpad/fx911`.

| # | Invocation | cwd | Receipt landed | Gate reads | Same? | Verdict |
|---|---|---|---|---|---|---|
| **L1** | `--plan kaola-workflow/issue-1/workflow-plan.md` | **worktree** | `$FX/wt/kaola-workflow/issue-1/.cache/chain-receipt.json` | `$FX/main/kaola-workflow/issue-1/.cache/chain-receipt.json` | **NO** | **`chains_unverified`** |
| L2 | `--plan $FX/main/kaola-workflow/issue-1/workflow-plan.md` (absolute) | worktree | `$FX/main/…/.cache/chain-receipt.json` | `$FX/main/…/.cache/chain-receipt.json` | yes | `chains_green` |
| L3 | `--project issue-1` (the #910-fixed arm) | worktree | `$FX/main/…/.cache/chain-receipt.json` | `$FX/main/…/.cache/chain-receipt.json` | yes | `chains_green` |
| L4 | `--plan kaola-workflow/issue-1/workflow-plan.md` | **plain repo** | `$FX/plain/…/.cache/chain-receipt.json` | `$FX/plain/…/.cache/chain-receipt.json` | yes | `chains_green` |
| L5 | `--project issue-1` | plain repo | `$FX/plain/…/.cache/chain-receipt.json` | `$FX/plain/…/.cache/chain-receipt.json` | yes | `chains_green` |
| L6 | `--plan kaola-workflow/issue-1/workflow-plan.md` | main root | `$FX/main/…/.cache/chain-receipt.json` | `$FX/main/…/.cache/chain-receipt.json` | yes | `chains_green` |

Exactly one leg diverges: **L1**. Verbatim envelope from L1's runner:

```
{"result":"pass","failed":[],"receipt":"…/fx911/wt/kaola-workflow/issue-1/.cache/chain-receipt.json"}
```

and the gate immediately after, from the same shell:

```
validation      = chains_unverified
authority.source= pending_mirror
source_dir      = …/fx911/main/kaola-workflow/issue-1
dest_dir        = …/fx911/wt/kaola-workflow/issue-1
```

### Control A — location is the entire difference

The L1 receipt copied byte-for-byte into main's run folder, nothing else touched:

```
6251bdac65901f090de963f8f3a2765a76e384a807f230ba9f9ed34fb712876b  …/wt/kaola-workflow/issue-1/.cache/chain-receipt.json
6251bdac65901f090de963f8f3a2765a76e384a807f230ba9f9ed34fb712876b  …/main/kaola-workflow/issue-1/.cache/chain-receipt.json
validation = chains_green
```

Same bytes, same tree, same gate invocation — `chains_unverified` at one path, `chains_green` at the
other. This is #910's `## Workaround used` paragraph reproduced against `--plan`.

### Control B — the `--project` arm still binds the invoking tree

L3's receipt, written into **main's** folder, carries the **worktree's** HEAD:

```
receipt codeTreeHash = 798bb77c565bbedcb3aab13ce707c74808a449f789c51c916f3a30b36e44fa27
receipt headSha      = fc9402d4085de1caf577a05eaf8f3f061e1d1e3a
wt   HEAD            = fc9402d4085de1caf577a05eaf8f3f061e1d1e3a
main HEAD            = 9a050036325d32d87f94c2301f1ef8cd74c0fd57
```

The hash follows the invoking tree; the record follows the run folder. Confirmed live.

### Second-order effect the L1 leg also produces

Before L1, `$FX/wt/kaola-workflow` did not exist. After L1:

```
$FX/wt/kaola-workflow/issue-1/.cache/chain-receipt.json
```

After L3 (`--project`), `$FX/wt/kaola-workflow` still does not exist.

The relative-`--plan` arm therefore **creates `<worktree>/kaola-workflow/<P>/` as a side effect** —
the precise hazard `run-chains.js:1055-1061` says #910 settled for the `--project` arm, because that
directory's existence is what the Step-8a mirror branches on. `run-chains.js:1063-1064` shows why:
the outcome-telemetry directory derivation has the same cwd-relative `--plan` arm as the receipt.
This is the trigger for `test-finalize-door.js` T10's step B→C sequence (stale receipt copied over a
fresh one), reachable through `--plan` even though T10 itself only drives `--project`.

---

## Narrowing

| Leg | What it eliminated |
|---|---|
| L4, L5, L6 green | Not a repo-shape or gate bug — a plain repository and a main-root invocation are correct on every arm. The defect requires a *linked worktree whose run folder is main-resident*. |
| L2 green | Not "`--plan` is broken" — an absolute `--plan` is correct. The axis is **relative vs absolute**, i.e. whether `cwd` participates. |
| L3 green | Not the gate — the same gate, same tree, same posture reads a `--project` receipt correctly. The axis is the **producer's tree choice**, not the reader's. |
| Control A | Not receipt content, freshness, `codeTreeHash` or `headSha` — identical bytes verdict differently by directory alone. The axis is **placement**. |
| Control B | The #910 split is intact and does not need re-deriving; only the `--plan` arm was left out of it. |

---

## Existing coverage

`scripts/test-run-chains.js` — baseline **green: `run-chains tests passed (283 assertions)`, exit 0**.
All `--plan` coverage lives in one block, T23 (`:708-776`), and it is **pure**: `cwd = '/work/repo'`,
a path that does not exist and is not a git repository.

```
:726  // --plan: path.dirname(path.resolve(cwd, plan)) + /.cache/chain-receipt.json — the EXACT plan-dir
:729    assert(resolveOutputPath(Object.assign({}, none, { plan: planRel }), cwd)
:730      === path.join(cwd, 'kaola-workflow', 'issue-546', '.cache', 'chain-receipt.json'),
:731      'T23c: --plan -> dirname(resolve(plan))/.cache/chain-receipt.json (the validator plan-dir)');
:732  // --plan with an ABSOLUTE plan path ignores cwd for the dir.
:733    assert(resolveOutputPath(Object.assign({}, none, { plan: '/elsewhere/plan/workflow-plan.md' }), cwd)
:734      === path.join('/elsewhere', 'plan', '.cache', 'chain-receipt.json'),
:735      'T23d: --plan absolute path uses its own dir, not cwd');
:758    assert(resolveOutputPath({ output: '/abs/out.json', plan: planRel, project: 'issue-546' }, cwd)
:759      === '/abs/out.json', 'T23h: precedence output > plan > project (output wins over both)');
:761    assert(resolveOutputPath({ output: null, plan: planRel, project: 'issue-546' }, cwd)
:762      === path.join(cwd, 'kaola-workflow', 'issue-546', '.cache', 'chain-receipt.json'),
:763      'T23i: precedence plan > project (plan-dir wins, project ignored)');
```

**Measured discriminating power.** Evaluating, on T23's own fixtures, what a run-folder-routed
derivation would yield versus what T23 asserts:

```
T23c cwd=/work/repo plan=kaola-workflow/issue-546/workflow-plan.md
   shipped: /work/repo/kaola-workflow/issue-546/.cache/chain-receipt.json
   routed : /work/repo/kaola-workflow/issue-546/.cache/chain-receipt.json     SAME
T23d cwd=/work/repo plan=/elsewhere/plan/workflow-plan.md
   shipped: /elsewhere/plan/.cache/chain-receipt.json
   routed : /work/repo/kaola-workflow/plan/.cache/chain-receipt.json          DIFFERENT
T23i (plan + project both set)
   shipped: /work/repo/kaola-workflow/issue-546/.cache/chain-receipt.json
   routed : /work/repo/kaola-workflow/issue-546/.cache/chain-receipt.json     SAME
```

Why C and I cannot distinguish, measured directly:

```
getGitTopLevel('/work/repo')                          -> '/work/repo'   (the cwd fallback)
resolveRecordFolder('/work/repo','issue-546',schema)  -> {"dir":null,"root":"","mainResident":false,
                                                          "searched":["/work/repo/kaola-workflow/issue-546"]}
```

`dir: null` means the #910 fallback returns `<invoking tree>/kaola-workflow/<P>` — which is exactly
what T23c/T23i already assert.

**So: T23 pins the plan-dir *derivation*, not the *tree*.** It does **not** pin the relative-from-a-
worktree behaviour #911 is about, and would not go red if that arm moved. What it **does** pin is
T23d — the absolute arm — which is #911's acceptance criterion 2, and T23h/T23i, which are criterion
3. Those three must survive whatever happens.

**No test in any edition exercises `--plan` under a worktree topology.** `test-run-chains.js` builds
no worktree for any `--plan` case (`makeScopeRepo` at `:1241` is diff-scope, single-checkout).
`test-finalize-door.js` owns the only main-resident-worktree fixture (`buildMainResidentRun`, T10 at
`:1939`) and contains zero `--plan` occurrences. Both forge run-chains suites: zero. So the L1 leg
above is currently uncovered everywhere.

---

## Edition topology

Confirmed exactly as stated.

- `scripts/validate-script-sync.js:67-69` lists `kaola-workflow-run-chains.js` in **`COMMON_SCRIPTS`**
  — byte-identical claude↔codex. Verified on disk:
  ```
  cbd06064504f72520b4bd404fa3dc2e426de7eb637f1b5f557582e07b28a8377  scripts/kaola-workflow-run-chains.js
  cbd06064504f72520b4bd404fa3dc2e426de7eb637f1b5f557582e07b28a8377  plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js
  ```
- `scripts/edition-sync.js:52-65` lists it in **`GENERATED_AGGREGATORS`** — the gitlab/gitea ports are
  generated from canonical, not hand-ported. All four trees carry `resolveProjectRecordDir` (4
  occurrences each).
- **Propagation:** edit canonical, copy to the codex path (byte-identical), regenerate the two forge
  ports via `edition-sync.js`, commit the regeneration in the same commit. A missed forge port **reds**
  rather than drifting silently. Any `--plan` change is an edition-touching diff → all four chains.
- The `--plan` **prose** lives in four places that would need to move together: `run-chains.js:31-32`,
  `:46-47`, `:830-835`, `:994-1003` (usage text) — all inside the byte-identical/generated file — plus
  `docs/api.md:408,417,423,430-432` and `docs/architecture.md:353`.
- opencode/kimi ship no run-chains surface mentioning `--plan`; zero hits.

---

## Inferences

- **The defect is real, is the identical shape as #910, and is currently uncovered by every suite** —
  confidence: high. Refuted by: a run of L1 in the fixture that lands the receipt where the gate
  reads, or a test anywhere that drives `--plan` from a linked worktree.
- **The existing coverage does not block moving the relative arm; it does block moving the absolute
  arm** — confidence: high (measured above, not reasoned). Refuted by: a T23 assertion I missed that
  constructs a topology where `resolveRecordFolder` returns non-null.
- **`--plan` is a flag with no producer** — confidence: high. This reframes the issue: #911's
  acceptance criterion 1 offers "fix it, or document it as deliberately caller-relative", and the
  documentation half is **already shipped verbatim** at `docs/api.md:430-432`. The question the
  evidence actually poses is whether a flag with no producer, no surface, and a legacy-alias label in
  its own API doc earns its place at all. That is a values call and it is the owner's.
- **The relative-`--plan` folder-creation side effect is the live T10 trigger** — confidence: medium.
  Measured that the directory is created; not measured end-to-end that it produces T10's stale-receipt
  overwrite, because no producer passes `--plan` to get there.

---

## Open

- Not measured: whether any *installed* runtime outside this repository passes `--plan`. Only the
  repo's own rendering sources and the three in-repo SKILL surfaces were inspected; all pass
  `--project`.
- Not measured: the forge-port `persistExpansionRollupToSummary` divergence (canonical deleted it,
  gitlab/gitea retain it). Noted as a Q1 by-product, out of #911's scope, and inert either way since
  nothing authors the plan it reads.
- Not run: the full four-chain suite. This investigation ran `scripts/test-run-chains.js` only
  (283 assertions, exit 0) to establish the coverage baseline; no repository file was changed, so
  nothing else could have moved.

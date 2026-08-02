# Investigation: GitHub issue #910 — a receipt written from a linked worktree lands where the finalize gate does not read it

## VERDICT

**PREMISE CONFIRMED — reproduced live on this run's own worktree, first try, and again in an
independent scratchpad fixture.** Every factual claim in #910 held under measurement:

| #910 claim | verdict |
|---|---|
| `run-chains --project P` from a linked worktree writes the receipt into the **worktree's** run folder | **TRUE** — measured |
| the finalize gate reads from the **authority** = MAIN's run folder | **TRUE** — measured, `source_dir` |
| four green chains therefore classify `chains_unverified` | **TRUE** — measured |
| Step 8a's mirror copies main → worktree, the wrong direction to rescue it | **TRUE** — read at `kaola-workflow-claim.js:3233-3234` |
| "it cannot simply be run from main instead: `codeTreeHash` would bind the wrong candidate" | **TRUE** — measured, gives `chains_stale` |
| `kaola-workflow/` is validation-invisible so receipt LOCATION cannot alter the hash | **TRUE** — `adaptive-schema.js:1007`, exactly as cited |
| the manual placement workaround is correct | **TRUE** — byte-identical copy flips the gate to `chains_green` |

**ONE CLAIM IN #910 IS WRONG, and it is the one that sizes the fix:**

> "The mechanism already exists in this repository — **reuse `resolveRecordFolder`'s split** rather
> than re-deriving it."

`resolveRecordFolder` **is not exported from anything**. It is a private function in
`scripts/kaola-workflow-validation-runner.js:1105`, absent from that module's 29-name
`module.exports`, and absent from `adaptive-schema.js` too. Measured:

```
exports resolveRecordFolder?                 undefined   (adaptive-schema.js)
validation-runner exports resolveRecordFolder? undefined   (29 exports, not among them)
```

The fix is therefore **bigger than "reuse it"** — see §3. It is not *much* bigger (the primitive
`resolveRecordFolder` is built on, `schema.resolveMainRoot`, IS exported and IS already imported by
run-chains), but the issue's one-line framing is not available and should not be handed to an
implementer as written.

**Second finding, not in the issue: nothing tests this.** No run-chains suite in any of the four
editions ever invokes the producer from a linked worktree — `scripts/test-run-chains.js` contains
zero `git worktree add`, and the gitlab/gitea run-chains suites do not contain the string "worktree"
at all. Every `--project` pin is measured in a plain, single-checkout repo. That is why this shipped.

---

## Setup

- Repo: `/Users/ylpromax5/Workspace/Kaola-Workflow`, commit `2018521f`, branch `main`, clean.
- Linked worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-904-905-906-907-908-909-910`,
  branch `workflow/bundle-904-905-906-907-908-909-910`, also at `2018521f`, clean.
- Topology precondition confirmed **before** running anything: the worktree does **not** carry
  `kaola-workflow/bundle-904-905-906-907-908-909-910/` — that folder is main-resident only.
- Cheapest receipt-producing invocation: there is **no** `--plan`/dry-run mode in run-chains. The
  cheapest real receipt is `--chains claude --mock-chain claude:<script>` (the test hook at
  `kaola-workflow-run-chains.js:898`), which is exactly what `test-finalize-door.js:301` uses.
  Verified faithful: `mocked` appears **nowhere** in `adaptive-schema.js`, so `evaluateChainReceipt`
  cannot distinguish a mocked receipt from a real one; and the finalize arm applies **no chain
  completeness check** (only `--release-check` requires all four), so a single green chain is
  legitimately `chains_green`. Total cost: ~1 s per run instead of ~25 min.

---

## Reproduction transcript (verbatim, live worktree)

### Step 1 — produce the receipt from the worktree

```
$ cd /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-904-905-906-907-908-909-910
$ KAOLA_RUN_CHAINS_CONCURRENCY=serial node .../scripts/kaola-workflow-run-chains.js \
    --project bundle-904-905-906-907-908-909-910 \
    --chains claude --mock-chain claude:<scratchpad>/pass.sh --json
EXIT=0
{"result":"pass","failed":[],"receipt":"/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-904-905-906-907-908-909-910/kaola-workflow/bundle-904-905-906-907-908-909-910/.cache/chain-receipt.json"}
```

Files written by that command — **exactly one file**, plus the two directories it had to create
(the run folder did not exist in the worktree before this):

```
.kw/worktrees/bundle-904-905-906-907-908-909-910/kaola-workflow/bundle-904-905-906-907-908-909-910/          (created)
.kw/worktrees/bundle-904-905-906-907-908-909-910/kaola-workflow/bundle-904-905-906-907-908-909-910/.cache/   (created)
.kw/worktrees/bundle-904-905-906-907-908-909-910/kaola-workflow/bundle-904-905-906-907-908-909-910/.cache/chain-receipt.json
```

No outcome-log sidecar was written (`.cache/` held only `chain-receipt.json`). MAIN's run folder was
byte-for-byte unchanged (verified by `find | diff` against a pre-run snapshot).

Receipt content:

```json
{ "headSha": "2018521fd9e96c7f84ace0d099d3881706414bac",
  "codeTreeHash": "5e4b8f67ae5fa0176f362a5f20a3fe448e3f815cb7b91954c4112cbb20a08c41",
  "workTreeHash": "clean",
  "chains": [{ "name": "claude", "exitCode": 0 }],
  "scope": { "decision": "explicit", "reason": "explicit_chains", "chains": ["claude"] } }
```

### Step 2 — the finalize gate, run from the same worktree

Real flag surface (from `kaola-workflow-claim.js:5858`): `finalize --project P --check [--json]`.

```
$ cd /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-904-905-906-907-908-909-910
$ node .../scripts/kaola-workflow-claim.js finalize --project bundle-904-905-906-907-908-909-910 --check --json
EXIT=0   (stderr empty)
{
  "project": "bundle-904-905-906-907-908-909-910",
  "ok": true,
  "checks": {
    "mirror": "ready",
    "workflow_state": "pending_mirror",
    "implementation_commit": "not_checked",
    "staging_guard": "ok",
    "validation": "chains_unverified",
    "changed_paths": [],
    "dirty_paths": []
  },
  "reasons": [],
  "authority": {
    "main_root":   "/Users/ylpromax5/Workspace/Kaola-Workflow",
    "linked_root": "/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-904-905-906-907-908-909-910",
    "source":      "pending_mirror",
    "source_dir":  "/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/bundle-904-905-906-907-908-909-910",
    "dest_dir":    "/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-904-905-906-907-908-909-910/kaola-workflow/bundle-904-905-906-907-908-909-910"
  }
}
```

Identical envelope shape to the one quoted in #910. The gate's own finding, read straight out of
`evaluateChainReceipt` with the arguments `claim.js` passes it:

```
gateRoot (the HASHED tree) = /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-904-905-906-907-908-909-910
{
  "classification": "chains_unverified",
  "green": false,
  "mode": "chain-receipt",
  "detail": ["no chain receipt at /Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/bundle-904-905-906-907-908-909-910/.cache/chain-receipt.json — run kaola-workflow-run-chains.js after the LAST commit so HEAD is covered; prose \"all four chains green\" is not evidence"]
}
```

**The split, in one frame:** the hash is taken over the **worktree**; the record is looked for in
**main**. The write went to the worktree. Confirmed: the receipt path and the read path differ.

### Step 3 — A/B: change only the LOCATION

Same bytes (`cmp` → identical), same invoking tree, same command; only where the file sits changed:

```
$ cp <worktree>/kaola-workflow/<P>/.cache/chain-receipt.json <main>/kaola-workflow/<P>/.cache/chain-receipt.json
$ node .../kaola-workflow-claim.js finalize --project <P> --check --json     # still run FROM the worktree
"validation": "chains_green"
```

`chains_unverified` → `chains_green` with nothing but the file's location varied. **Location is the
sole cause.** This also independently re-proves the manual workaround #910 used.

---

## Scratchpad fixture — the acceptance-criterion fixture (main and worktree hashes DIFFER)

Built at `<scratchpad>/fix910/main` + nested linked worktree `.kw/worktrees/issue-1` (nesting +
`.kw/` gitignored, matching the live topology). The branch carries a commit main lacks, so the two
trees genuinely differ — the pre-merge window a finalize happens in.

```
main     codeTreeHash = 1e900c83ccb2e865fd9473e497ec07da25a9edc113d6b3486def70a4786c4c71
worktree codeTreeHash = 84cf69ee56aab64ea14b02b8563f2e52b08f7287c4ab38a76f14ffed0b20a270
DIFFER = true
```

| Leg | What varied | Receipt landed | Receipt's `codeTreeHash` | Gate (run from the worktree) |
|---|---|---|---|---|
| A | `run-chains --project issue-1` **from the worktree** | worktree run folder | `84cf69ee…` = **the worktree's** | `chains_unverified` |
| B | `run-chains --project issue-1` **from main** | main's authority (right place) | `1e900c83…` = **main's** | `chains_stale` |
| C | Leg A's bytes copied into main's authority | main's authority | `84cf69ee…` | **`chains_green`** |
| D (control) | plain non-worktree repo, `--project issue-1` | `<repo>/kaola-workflow/issue-1/.cache/` | current tree's | **`chains_green`** |

Leg A settles **acceptance criterion 2**: the receipt already carries the **invoking tree's** hash,
not main's, in a fixture where the two provably differ. Whatever the fix does to the *path*, it must
leave `codeTreeHash` alone — the hash arm is already correct today.

Leg B settles the issue's "it cannot simply be run from main instead" — measured, not argued: right
place, wrong candidate, `chains_stale`.

Leg C is the positive control: the fixture *can* produce a green, so Leg A's red is a real
discrimination and not a broken fixture.

Leg D is **acceptance criterion 3's baseline** (below).

---

## Baseline: a plain (non-worktree) repository today — criterion 3

```
{"result":"pass","failed":[],"receipt":"<repo>/kaola-workflow/issue-1/.cache/chain-receipt.json"}
"validation": "chains_green"
"authority": { "main_root": "<repo>", "linked_root": null,
               "source": "live",
               "source_dir": "<repo>/kaola-workflow/issue-1",
               "dest_dir":   "<repo>/kaola-workflow/issue-1" }
```

`linked_root: null`, `source: "live"`, and `source_dir == dest_dir`. Producer and gate address the
same directory, and it is already green. **Nothing to preserve here beyond "do not move it."**

Design consequence for the implementer: a `resolveRecordFolder`-shaped fix returns
`{ dir: null }` when the run folder exists in *neither* tree. In a plain repo that is common (the
folder may not exist yet — run-chains creates it today). The fix therefore **needs an explicit
fallback to the current `<gitTopLevel>/kaola-workflow/<P>/.cache` behaviour** when the split
resolves nothing, or Leg D regresses and pins T23g/T23j break.

---

## Where run-chains resolves its output today (with file:line)

`scripts/kaola-workflow-run-chains.js:753-762` — **byte-identical in all four ports**
(`plugins/kaola-workflow/scripts/…:753`, `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js:754`,
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js:754`):

```js
function resolveOutputPath(opts, cwd) {
  if (opts.output != null) return path.resolve(cwd, opts.output);
  if (opts.plan != null) {
    return path.join(path.dirname(path.resolve(cwd, opts.plan)), '.cache', 'chain-receipt.json');
  }
  if (opts.project != null) {
    return path.join(getGitTopLevel(cwd), 'kaola-workflow', opts.project, '.cache', 'chain-receipt.json');
  }
  return path.join(cwd, '.cache', 'chain-receipt.json');
}
```

`getGitTopLevel(cwd)` — `run-chains.js:742-746` — is `git -C <cwd> rev-parse --show-toplevel`, which
in a linked worktree returns **the worktree**. That single call is the whole defect: line 759 uses
the *invoking tree* for the RECORD, where the gate uses the *authority folder*.

The hash arm, by contrast, is correct and must not move — `run-chains.js:1084-1086`:

```js
const gitTop = getGitTopLevel(cwd);
const validationTestConsumes = adaptiveSchema.VALIDATION_TEST_CONSUMES.slice();
const codeTreeHash = adaptiveSchema.computeCodeTreeHash(gitTop, pathOpts.project || null, validationTestConsumes);
```

**Same `getGitTopLevel(cwd)` value feeds both arms today.** The fix is to stop sharing it: keep it
for line 1086, split it for line 759.

There is a **third** consumer of the same value, easily missed: the outcome recorder at
`run-chains.js:972-976` derives `outcomeProjectDir` the same way, so run-chains' telemetry sidecar
also lands in the worktree today. Whether it should follow the record or the tree is a decision, not
a fact — flagging it, not deciding it.

### The gate's read path

`kaola-workflow-claim.js:3691-3697`:

```js
function probeFinalizeValidationGate(root, authorityDir, authorityState, base) {
  const cacheDir = path.join(authorityDir, '.cache');
  const gateRoot = adaptiveSchema.resolveFinalizeCheckRoot(root);   // the TREE
  const project  = path.basename(authorityDir);
  const validation = adaptiveSchema.evaluateChainReceipt(gateRoot, { cacheDir, project });
```

Called at `claim.js:3835` and `claim.js:4014` with `authority.authorityDir`, which
`predictFinalizeAuthority` (`claim.js:3631-3661`) sets to main's run folder under `pending_mirror`
(`topology.source_dir`). Step 8a's copy direction is `srcDir = main`, `destDir = worktree`
(`claim.js:3233-3234`) — confirming the mirror runs main → worktree and cannot carry the receipt back.

---

## Is `resolveRecordFolder` genuinely reusable? — NO, not as the issue describes

**It is not exported from anything.** Measured at runtime, not grepped:

```
require('scripts/kaola-workflow-adaptive-schema.js').resolveRecordFolder     -> undefined
require('scripts/kaola-workflow-validation-runner.js').resolveRecordFolder   -> undefined   (29 exports)
```

It is defined at `scripts/kaola-workflow-validation-runner.js:1105-1123` as a module-private
function. `run-chains.js` does **not** require that module today (its only two sibling requires are
`./kaola-workflow-classifier.js` and `./kaola-workflow-adaptive-schema`, at lines 137 and 143).

### What IS reusable

- `schema.resolveMainRoot` **is** exported (`adaptive-schema.js:1601`) and **is already in scope**
  inside run-chains via the existing `adaptiveSchema` import at `run-chains.js:143`. Verified live
  from the worktree: `resolveMainRoot(<worktree>)` → `/Users/ylpromax5/Workspace/Kaola-Workflow`;
  `resolveMainRoot(<main>)` → the same. So **the primitive the split is built on is free.**
- The naming obstacle the comment at `run-chains.js:955-960` warns about does **not** apply.
  Measured: `kaola-workflow-validation-runner.js` and `kaola-workflow-adaptive-schema.js` are both
  **base-named and byte-identical in all four trees** (md5 `9fef4508…` and `57e83365…` respectively),
  and the gitlab/gitea run-chains ports already do `require('./kaola-workflow-adaptive-schema')`
  unrewritten (lines 144). A `require('./kaola-workflow-validation-runner')` would resolve in all
  four trees, and it is safe: validation-runner is `require.main === module`-guarded (line 1479), so
  requiring it has no side effects.
  *(Side note: that comment block also names an `adaptive-node` module that no longer exists. The
  comment is stale relative to the code it sits above. Not this issue's problem — noting it so an
  implementer does not take it as a live constraint.)*

### So the three options, honestly sized

1. **Export `resolveRecordFolder` from validation-runner** and require it from run-chains. Cheapest
   in lines, but it adds a *new* cross-module edge run-chains → validation-runner, and
   validation-runner's own comment at line 1064 says it deliberately "keeps its single sibling
   require" — that is a stated design intent this would be inverting on the *consumer* side, and the
   ×4 byte-identical property means the export has to land in all four copies.
2. **Move `resolveRecordFolder` into `adaptive-schema.js`** and have both callers read it. This is
   the "one rule, one wording" answer — but `adaptive-schema.js` is the **cross-edition drift
   anchor**, byte-identical ×4, so the change must land in all four copies identically.
3. **Re-derive the ~12-line split inside run-chains** from `adaptiveSchema.resolveMainRoot`, which is
   already imported. No new dependency, no anchor edit — but it is a second implementation of the
   same rule, which is exactly what `resolveRecordFolder`'s own comment argues against.

I am not choosing. What I can report as measured: **option 1 is the only one the issue's wording
describes, and the issue's wording is wrong that it exists today.** Whoever picks up #910 should be
told the choice is theirs and that "just reuse it" is not on the table.

---

## `--output` and `--plan` precedence, exactly as it stands (criterion 4)

Precedence is `--output` > `--plan` > `--project` > cwd default (`run-chains.js:748-762`, help text
at line 920). Measured **from the linked worktree** (fixture), all four arms:

| Invocation (cwd = linked worktree) | Receipt landed |
|---|---|
| `--project issue-1 --output <abs>` | `<abs>` — `--output` wins verbatim |
| `--plan kaola-workflow/issue-1/workflow-plan.md` | `<worktree>/kaola-workflow/issue-1/.cache/chain-receipt.json` |
| `--project … --plan … --output <abs>` | `<abs>` — output beats both |
| bare (no path flag) | `<worktree>/.cache/chain-receipt.json` |

**Note for the implementer:** `--plan` with a *relative* path has the **same defect** as `--project`
— it resolves against cwd, so from a worktree it also lands in the worktree. `--output` is explicit
and is genuinely unaffected. Criterion 4 says precedence must be unchanged; it does not say `--plan`
must keep aiming at the wrong tree, and #910's text never considers `--plan`. That ambiguity belongs
to the person who owns the fix.

---

## Pin inventory — every test that pins run-chains' output location, all editions

Searched `scripts/`, `plugins/kaola-workflow/scripts/`, `plugins/kaola-workflow-gitlab/scripts/`,
`plugins/kaola-workflow-gitea/scripts/`, plus `.opencode/` and `.kimi/` named explicitly (ugrep
skips dot-directories). Note: `scripts/test-gitlab-run-chains.js` and `scripts/test-gitea-run-chains.js`
**do not exist** — the forge suites live under the plugin trees.

### Direct pins on the producer's output path — these WILL be touched by a fix

| Pin | Location | What it asserts | Plain repo or worktree? |
|---|---|---|---|
| T23a/T23b | `scripts/test-run-chains.js:720-724` | `--output` abs/relative | pure unit, no repo |
| T23c/T23d | `scripts/test-run-chains.js:729-735` | `--plan` → `dirname(plan)/.cache/` | pure unit, no repo |
| T23e | `scripts/test-run-chains.js:738` | bare → `<cwd>/.cache/` | pure unit |
| T23f/**T23g** | `scripts/test-run-chains.js:745-751` | **`--project` → `<gitTopLevel>/kaola-workflow/<P>/.cache/`** | **plain repo** |
| T23h/T23i | `scripts/test-run-chains.js:758-763` | precedence output>plan>project | pure unit |
| **T23j/T23k** | `scripts/test-run-chains.js:768-772` | **`--project` beats the cwd default** | **plain repo** |
| helper `run()` | `scripts/test-run-chains.js:31-32`, `156-157`, `1279`, `1405`, `1521` | reads the receipt at the expected path — implicit location pins | plain repo |
| G-series | `plugins/kaola-workflow-gitlab/scripts/test-gitlab-run-chains.js:192,200,214,229,255,264,285` | `projReceipt(dir,proj)` = `<repo>/kaola-workflow/<P>/.cache/chain-receipt.json` after a real `--project` run | **plain repo** |
| G-series | `plugins/kaola-workflow-gitea/scripts/test-gitea-run-chains.js:192,200,214,229,255,264,285` | identical, gitea port | **plain repo** |

### Producer runs that deliberately do NOT discriminate location

- `scripts/test-finalize-door.js:273-301` — `produceGreenReceipt` runs the real producer with
  `--project`, then `putReceiptEverywhere` writes the same bytes to **both** the project folder and
  the repo root. The suite explicitly refuses to pin which one the producer chose, and its fixture
  runs in-place (`KAOLA_WORKTREE_NATIVE: '0'`, line 246) — no worktree lane.

### Not producer pins — reader-side fixtures that hand-write a receipt

`scripts/test-claim-hardening.js:1327,1584,1707,3250,3354,3993,4271` ·
`scripts/test-gap-sweep.js:59-68` · `scripts/test-release.js:35,115,131` ·
`scripts/simulate-workflow-walkthrough.js:1026,1054,1080,8886,8909` ·
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js:3362,3378` ·
`plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js:3115,3131`.
These place a receipt by hand and pin what the *gate* does with it. A producer-path fix does not
move them.

*(`scripts/test-claim-hardening.js:4696` defines a fixture helper named `g910` — that is the D1
destruction-gate scenario from the #900–#903 bundle, an unrelated local numbering. It is **not**
coverage of GitHub issue #910.)*

### Prose surfaces that state where the receipt lands

Skeleton: `templates/routing/finalize.skeleton.md:119` (the self-host paragraph — "It writes
`.cache/chain-receipt.json`") and the slot `fz-runchains-run` at `templates/routing/slots.js:118`.
Renders to 6 surfaces carrying the worktree-location sentence
(`commands/kaola-workflow-finalize.md`, the 2 forge `commands/`, the 3 plugin
`skills/kaola-workflow-finalize/SKILL.md`), plus the 2 additive-edition surfaces
`.opencode/command/kaola-workflow-finalize.md:55` and `.kimi/skills/kaola-workflow-finalize/SKILL.md:49`,
which carry the invocation but *not* the location sentence.
`node scripts/generate-routing-surfaces.js --check` currently reports **all 18 surfaces byte-match**.

**Asymmetry worth naming:** the finalize prose already carries #900's worktree guidance — "Run that
from the working tree you validated… The record itself lands in the run folder the gate reads it
from" — but **only on the CONSUMER branch**. The self-host branch (the run-chains one) says nothing
about it. If #910 is fixed, that paragraph is where the matching sentence belongs, and it is
skeleton-authored, so edit `templates/routing/finalize.skeleton.md` and regenerate.

### The coverage hole

```
$ grep -n "worktree" scripts/test-run-chains.js
1240:// can count executions. A base commit lands on `main`; the caller then mutates the worktree
$ grep -n "worktree" plugins/kaola-workflow-{gitlab,gitea}/scripts/test-git{lab,ea}-run-chains.js
(no matches)
```

Zero `git worktree add` in any run-chains suite, any edition. And the suite that holds the T23
precedence pins does not even run in the fast gate:

| suite | `test-run-chains.js` | `test-finalize-door.js` | `test-claim-hardening.js` |
|---|---|---|---|
| `test:kaola-workflow:claude` (fast gate) | **absent** | RUNS | **absent** |
| `test:kaola-workflow:claude:full` (never mandated) | RUNS | RUNS | RUNS |
| codex / gitlab / gitea | absent | absent | absent |

The forge run-chains suites do run, via the forge walkthroughs
(`simulate-gitlab-workflow-walkthrough.js:755`, `simulate-gitea-workflow-walkthrough.js:842`).

---

## Inferences (mine, labelled)

- **The whole defect is `getGitTopLevel(cwd)` serving two masters at `run-chains.js:759` and
  `:1086`.** Confidence: high — Legs A/B/C isolate location and hash independently, and the two lines
  share one value. Refuted by: any leg where the write path is correct and the gate still refuses.
- **A fix confined to `resolveOutputPath`'s `--project` arm is sufficient for criteria 1–3.**
  Confidence: high. Refuted by: a topology where the authority is neither the invoking tree nor
  `resolveMainRoot(root)` — e.g. the source-missing archive resume path, which `resolveRecordFolder`
  itself declines to handle.
- **The plain-repo pins T23g/T23j survive only if the fix falls back to today's behaviour when the
  split resolves nothing.** Confidence: high — Leg D plus reading `resolveRecordFolder`'s
  `{ dir: null }` return. Refuted by: a fix that creates the folder before resolving.
- **run-chains creating a run folder in the worktree is itself a small hazard.** `mirrorFinalizationArtifacts`
  (`claim.js:3241`) and `probeFinalizeMirror` (`claim.js:3496`) both branch on
  `!fs.existsSync(destDir)`. Today's producer creates `destDir` in the worktree as a side effect, so
  it can flip that bit before Step 8a runs. In my live run the topology was unharmed (`pending_mirror`
  still resolved, because the *authority* bit is `destAuthorityAbsent` = no `workflow-state.md`, not
  `destAbsent`), so this is **latent, not active**. Confidence: medium. Refuted by: showing no
  reachable path reads `destAbsent` after a receipt-only folder creation.

## Open / not measured

- No four-chain run was performed — deliberate, ~25 min for a fact a 1 s mock settles identically.
  The mock's fidelity is argued from `mocked` being absent from `adaptive-schema.js` and from the
  finalize arm having no completeness check, both read directly. Not re-verified against a real
  four-chain receipt.
- The consumer (non-npm) arm of `evaluateChainReceipt` was not exercised; #910 is self-host-only.
- Whether `--plan`'s identical relative-path defect is in scope: **unresolved, and it is a scope
  decision, not a measurement.**
- Whether the outcome recorder (`run-chains.js:972-976`) should follow the record folder or the
  invoking tree: **unresolved, same reason.**

---

## Files I created or modified anywhere under the repo

Created during reproduction and **already deleted**, with restoration verified by `find | diff`
against a pre-run snapshot:

1. `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-904-905-906-907-908-909-910/kaola-workflow/bundle-904-905-906-907-908-909-910/` (whole directory, incl. `.cache/chain-receipt.json`) — **removed**
2. `/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/bundle-904-905-906-907-908-909-910/.cache/chain-receipt.json` (the A/B copy) — **removed**

Created and **left in place** — this file only:

3. `/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/bundle-904-905-906-907-908-909-910/.cache/premise-910.md`

Post-run state verified: main's run folder matches its pre-run snapshot exactly (apart from
`premise-904.md` / `premise-905.md`, written by other agents, not me); the worktree's
`kaola-workflow/` is back to its original 9 files; `git status` is unchanged in both trees
(`?? kaola-workflow/bundle-904-905-906-907-908-909-910/` in main, pre-existing; worktree clean).

`/Users/ylpromax5/Workspace/Kaola-Workflow/.cache/chain-receipt.json` exists but is **not mine** —
mtime 2026-08-01 16:22, `headSha 9b68b096`, four real chains: the v9.1.1 release receipt.

Everything else lives under
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/8070a702-f33f-4c74-8c66-4434a7ea9c6d/scratchpad/`
(`pass.sh`, `fix910/main`, `fix910/plain`, captured envelopes). Nothing there touches the repo.

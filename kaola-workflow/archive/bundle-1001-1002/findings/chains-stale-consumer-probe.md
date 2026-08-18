# Investigation: does `chains_stale` reach its consumers as a bare token? (#1002)

Setup — commit `9918a4b6` on `main`, node `v24.18.0`, darwin 25.6.0. No tracked file was
modified; `git status --porcelain` before and after shows only the untracked run folder
`?? kaola-workflow/bundle-1001-1002/`.

Probe scripts (scratchpad, disposable):
`/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/eda803d4-845f-45b3-9fe6-5368b92e74b1/scratchpad/{probe.js,probe-lib.js,probe-red.js,probe-prose.js}`

Every `/var/folders/.../kw-1002-*` fixture created outside the scratchpad has been removed
(`ls -d /var/folders/.../kw-1002-*` → `clean`).

**No real chain ran.** Total wall time for all four legs is under a minute.

---

## How I staled the receipt

I did **not** hand-write a receipt. What I learned about the artifact, and from where:

- `scripts/kaola-workflow-adaptive-schema.js:1296-1318` — the self-host arm of
  `evaluateChainReceipt` prefers `receipt.codeTreeHash` and falls back to `receipt.headSha`.
  A mismatch on either is `chains_stale`.
- `scripts/kaola-workflow-adaptive-schema.js:1058-1077` — `computeCodeTreeHash` snapshots the
  committed **plus working** landable tree, so an untracked or committed code file flips it.
- `scripts/kaola-workflow-adaptive-schema.js:1140-1152` — `computeChainsStaleDiagnostics`
  requires a non-empty `receipt.headSha` **and** `receipt.workTreeHash === 'clean'`, then diffs
  `receipt.headSha` against the tree in front of it.
- `scripts/kaola-workflow-claim.js:3918` — the receipt path is
  `<authorityDir>/.cache/chain-receipt.json`, i.e. `kaola-workflow/<project>/.cache/`.
- `scripts/test-finalize-door.js:81-99, 104-147, 167-191, 228-233, 300-305` — the fixture shape
  (self-host repo, plan-less project folder, gh mock, green mock chain, `produceGreenReceipt`).

So the receipt is produced by the **real producer** over a **mock chain**, then the tree is
staled with a real commit. That is faithful to the seam (`--mock-chain` is the producer's own
test seam) and costs no chain time:

```
node scripts/kaola-workflow-run-chains.js --project issue-1002 --chains claude \
  --mock-chain claude:<binDir>/green-chain.js --json      # exit 0, ~0.4-1.7s
```

Produced receipt (verbatim, `check` leg):

```json
{
  "headSha": "64b24d62d35245752d4242ff5bccf402f2f91206",
  "workTreeHash": "clean",
  "codeTreeHash": "735d26d54d7cd3ab62ea4ef3b9c35be0c8c9fe68ea8f62c949aa979031ff0f6e",
  "validationTestConsumes": [],
  "chains": [ { "name": "claude", "exitCode": 0, "accepted_red": false, ... } ]
}
```

Then, per leg:

| leg | how staled | expected diagnostics |
|---|---|---|
| `code` | `newcode.js` committed after the stamp | `stale_kind: code`, `stale_paths: ["newcode.js"]` |
| `prose` | `CHANGELOG.md` appended + committed (it is in `SELF_HOST_TEST_CONSUMED`) | `stale_kind: prose-only`, `stale_paths: ["CHANGELOG.md"]` |
| `red` (control) | receipt `chains[0].exitCode` set to 1, tree left **fresh** | `chains`/`redChains` payload |

---

## Consumer 1 — `finalize --check --json` envelope

**Reproduces. The culprit detail is truly absent — and so is everything else.**

```
node scripts/kaola-workflow-claim.js finalize --project issue-1002 --check --json
```
exit `0`, stdout verbatim (code leg):

```json
{"project":"issue-1002","ok":true,"checks":{"mirror":"not_needed","workflow_state":"ok","implementation_commit":"not_checked","staging_guard":"ok","validation":"chains_stale","changed_paths":[],"dirty_paths":[]},"reasons":[],"authority":{"main_root":"/private/var/folders/.../repo","linked_root":null,"source":"live","source_dir":"/private/var/folders/.../repo/kaola-workflow/issue-1002","dest_dir":"/private/var/folders/.../repo/kaola-workflow/issue-1002"}}
```

The prose leg is byte-identical in `checks` (`"validation":"chains_stale"`), even though the
staleness is `prose-only` and one file wide.

`checks.validation` carries the classification **and nothing else**: no `stale_paths`, no
`stale_kind`, no stamped hash, no current hash, no `detail`, no `operator_hint`, no `mode`,
no `green`. The issue's description of this envelope is accurate in every particular.

**`--check` has no second rendering.** Running it without `--json` emits the *same JSON* on
stdout (exit 0, stderr empty) — `output()` is JSON-only — so there is no human-readable
surface that separately drops or carries the payload.

## Consumer 2 — the finalize transaction's own envelope

**Carries the culprits in full.** This consumer is *not* blind.

```
node scripts/kaola-workflow-claim.js finalize --project issue-1002 --json
```
exit `0`; the `validation` field verbatim (code leg):

```json
"validation":{"classification":"chains_stale","green":false,"mode":"chain-receipt","operator_hint":"Chain receipt is stale — the tree advanced since the chains ran. Regenerate the receipt over HEAD.","detail":["chain receipt codeTreeHash \"735d26d54d7cd3ab62ea4ef3b9c35be0c8c9fe68ea8f62c949aa979031ff0f6e\" != current code-tree hash \"e9bb2c2170424c04e69b96e1415ca645f28cbdeedf364aff7090f4a7648649a6\" — code (or test-consumed prose) changed since the chains ran; regenerate the receipt"],"stale_paths":["newcode.js"],"stale_kind":"code"}
```

and the prose leg:

```json
{
  "classification": "chains_stale",
  "green": false,
  "mode": "chain-receipt",
  "operator_hint": "Chain receipt is stale — the tree advanced since the chains ran. Regenerate the receipt over HEAD.",
  "detail": [
    "chain receipt codeTreeHash \"735d26d5...\" != current code-tree hash \"0cfcae97...\" — code (or test-consumed prose) changed since the chains ran; regenerate the receipt"
  ],
  "stale_paths": [ "CHANGELOG.md" ],
  "stale_kind": "prose-only"
}
```

Reason it survives: `scripts/kaola-workflow-claim.js:5267` assigns the **whole finding object**
(`validation: finalizeValidation`) onto the emit. Nothing is projected out.

## Consumer 3 — `finalization-summary.md` `## Validation`

**Partially blind: it keeps both hashes, and drops the paths.** The issue's phrase "no stamped
hash and no current hash" is true of `--check` but *false* of this consumer.

Written to `<repo>/kaola-workflow/archive/issue-1002/finalization-summary.md`, verbatim
(prose leg):

```
## Validation

classification: chains_stale
green: false
mode: chain-receipt

chain receipt codeTreeHash "735d26d54d7cd3ab62ea4ef3b9c35be0c8c9fe68ea8f62c949aa979031ff0f6e" != current code-tree hash "0cfcae97cdd889ff93315c8ef2123e8733657a9cd81ca0272a2536417e3c2886" — code (or test-consumed prose) changed since the chains ran; regenerate the receipt

Chain receipt is stale — the tree advanced since the chains ran. Regenerate the receipt over HEAD.

## Changed Paths

none outside the run-state and documentation bands.
```

Both hashes arrive because they are interpolated into `detail[0]`. `stale_paths` /
`stale_kind` do not, because the renderer enumerates a fixed field list.

This is the durable copy — the one a successor reads after the run is archived — so a reader
of the archive can see *that* the tree moved, and cannot see *what* moved.

### Control leg: is the drop specific to `chains_stale`?

**No — it is generic to every finding payload.** Same fixture, receipt mutated red, tree fresh:

- transaction envelope: `"chains":[{"name":"claude","exitCode":1,"accepted_red":false}],"redChains":[{"name":"claude","exitCode":1,"timed_out":false}]`
- `--check`: `"validation":"chains_red"` — bare
- `## Validation`: `classification: chains_red` / `green: false` / `mode: chain-receipt` /
  detail / hint — **no `chains[]`, no `redChains[]`**

`chains_red` happens to name the chain inside its `detail` string, so the summary is not
*blind* there. `chains_stale` does not name its paths in `detail`, which is why the same
renderer loses information only in the stale case. The same projection would also drop
`recorded_candidate_hash` / `current_candidate_hash` on the consumer arm's
`final_validation_stale` (`scripts/kaola-workflow-adaptive-schema.js:1371`) — not measured.

---

## The drop site(s)

**Two, not one** — and they are different kinds of drop.

| # | file:line | code | what is lost |
|---|---|---|---|
| 1 | `scripts/kaola-workflow-claim.js:4141` | `checks.validation = (report.validation && report.validation.classification) \|\| 'not_checked';` | everything but `classification` |
| 2 | `scripts/kaola-workflow-claim.js:3959-3966` (`persistValidationToSummary`) | renders a fixed list: `classification`, `green`, `mode`, `detail[]`, `operator_hint` | every payload key — `stale_paths`, `stale_kind`, `stale_paths_truncated`, `chains`, `redChains`, `recorded_candidate_hash`, `current_candidate_hash` |

Site 1 is the *only* call site of `evaluateFinalizePreconditions`
(`scripts/kaola-workflow-claim.js:4173`, inside `if (args.check)` at 4172-4187), so `--check`
has exactly one drop line.

Site 2 has one caller: `scripts/kaola-workflow-claim.js:4431`.

**Full enumeration of every place a `chains_stale` finding is rendered for a consumer:**

| consumer | producer call | rendered at | culprits? |
|---|---|---|---|
| `finalize --check [--json]` envelope | `claim.js:3918` via `claim.js:4139` | `claim.js:4141` | **no** |
| finalize transaction envelope | `claim.js:3918` via `claim.js:4425` | `claim.js:5267` | **yes** |
| `finalization-summary.md` `## Validation` | same probe | `claim.js:3959-3966`, called at `claim.js:4431` | **no** (hashes yes, paths no) |
| `run-chains.js --release-check` envelope | `evaluateReleaseReceipt`, `adaptive-schema.js:1450/1456/1462` | emitted whole | **yes** (pinned, see below) |

There is exactly **one** production call site of `evaluateChainReceipt`
(`scripts/kaola-workflow-claim.js:3918`); it feeds both finalize consumers through the shared
`probeFinalizeValidationGate`. `kaola-workflow-sink-merge.js` is **not** a consumer — its
`chains_red` is a re-taken post-rebase chain result of its own (`sink-merge.js:754, 857`), and
it never calls `evaluateChainReceipt`. `kaola-workflow-release.js:145-147` has its own
independent `chains_stale` greenness probe, unrelated to this finding object.

No routing skeleton, command or SKILL surface parses `checks.validation` — the only
`--check` reference is `templates/routing/finalize.skeleton.md:356-362`, which *instructs the
orchestrator to use `--check` as the pre-flight*. That is the sharpest consequence: the prose
routes the reader to the one surface that drops the culprits.

---

## What #648 actually shipped

Issue #648 is **CLOSED** (2026-07-09T09:24:09Z), title "finalize-tail chain re-runs: stamp-last
sequencing rule (x6 surfaces) + chains_stale culprit-path emission + consumer final-validation
citation-instead-of-rerun". Its body states the motive exactly:

> Diagnosis is blind: the `chains_stale` refusal prints only two hashes
> (`plan-validator.js:3154`). An operator/agent cannot tell "CHANGELOG line" from "code change"
> without manual archaeology, so agents default to re-running everything without understanding
> why — and without learning the sequencing lesson.

Commits (`git log --all --grep=648 --oneline`): `0f37a4df` (kw-leg: n2-stale-culprits) is the
code; `9f072813` is the run's fix commit; `ce1b2333`/`75e3f96e` are bookkeeping.

`0f37a4df` touched four `*plan-validator.js` copies plus the walkthrough. It added
`computeChainsStaleDiagnostics` / `attachChainsStaleDiagnostics` — the same bodies that live in
`adaptive-schema.js:1140-1156` today — and wrapped **both** staleness refusals in
`plan-validator.js --finalize-check`, whose entire output *was* that refusal envelope:

```js
const out = attachChainsStaleDiagnostics({ result: 'refuse', reason: 'chains_stale', operator_hint: ..., errors: [...] }, hashRoot, projTag, receipt);
process.stdout.write((json ? JSON.stringify(out) : 'typed refusal: chains_stale (...)') + '\n');
```

**On which consumer path was it verified?** Only on `plan-validator --finalize-check --json`.
`0f37a4df` added five walkthrough cases, all driving that one verb:

- `#547 (d)` amended: a `newcode.js` commit → `out.stale_kind === 'code'` and
  `JSON.stringify(out.stale_paths) === JSON.stringify(['newcode.js'])`
- prose case: `docs/custom.md` via `validationTestConsumes` → `stale_kind === 'prose-only'`
- mixed case: both → `stale_kind === 'mixed'`, `stale_paths === ['docs/custom.md','newcode.js']`
- degrade: unresolvable `headSha` → `out.stale_paths === undefined && out.stale_kind === undefined`
- degrade: `workTreeHash: 'dirty'` → same undefined assertions

**Is `--check` an unobserved consumer, or a regression?** Unobserved, and it could not have been
in scope: `--check` did not exist. `evaluateFinalizePreconditions` was introduced by
`8e42a864` ("feat(finalize): subtract the refusal ladder — one precondition report …, issue
837", 2026-07-28 — 19 days after #648 landed), and it was born flattening:
`git show 8e42a864 -- scripts/kaola-workflow-claim.js` adds `checks.validation = gate.inner_reason;`.
Likewise `persistValidationToSummary` is a later artifact (`git log -S` first hit: `ea84673d`,
the #877 extraction), born rendering the same fixed field list it renders now. `#648`'s own
surface — `plan-validator.js --finalize-check` — has since been retired with the plan grammar,
and its five tests went with it.

**Surviving pins.** `grep -rn "stale_paths\|stale_kind" scripts/` outside adaptive-schema returns
exactly two live assertions, both in `scripts/simulate-workflow-walkthrough.js` and both on
`run-chains --release-check`, not on finalize:

- `:819-832` `#651 (4)` — older-sha receipt → `out.stale_kind === 'code'` and
  `JSON.stringify(out.stale_paths) === JSON.stringify(['newcode.js'])`
- `:835-844` `#651 (5)` — `headSha: 'unknown'` → `stale_paths === undefined && stale_kind === undefined`

**Nothing pins `stale_paths` on any finalize consumer today**, including the transaction
envelope that does carry them (`scripts/test-finalize-door.js:329-337`'s `findingCarries`
deliberately checks the token only, and `:343-367`'s `passedWithFinding` asserts only that the
token appears in the `## Validation` body).

**One design item of #648 never shipped at all.** Its item B.3 called for hint enrichment keyed
on `stale_kind` (`chains_stale: (ctx) => ...`, following the `chains_red` ctx precedent).
`git log --oneline -S "chains_stale: (ctx)" --all -- scripts/` returns **zero commits**;
`0f37a4df` touched no `OPERATOR_HINTS`. `VALIDATION_HINTS.chains_stale`
(`adaptive-schema.js:1163`) is a zero-argument template to this day, so even where the payload
survives, the sentence the operator reads never mentions prose vs code.

---

## Edition copies

`scripts/kaola-workflow-adaptive-schema.js` — the byte-identical drift anchor — has **four
tracked copies**, all `md5 5e9727876814e35e55a3c293c426b0bc`:

```
scripts/kaola-workflow-adaptive-schema.js
plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
```

(`find` also reports the four under `.kw/worktrees/bundle-1001-1002/` — that is this bundle's own
checkout of the same files, not a fifth edition. `~/.claude/kaola-workflow/scripts/` and
`~/.codex/plugins/cache/.../7.10.0/scripts/` are install targets, not sources. `~/.opencode`
and `~/.kimi` do not exist on this machine.)

**Both drop sites are in `claim.js`, not in the anchor** — so the propagation set is the four
`*claim.js` copies, which are *not* byte-identical (rename-normalized editions), at these lines:

| copy | site 1 (`--check`) | site 2 (`persistValidationToSummary`) |
|---|---|---|
| `scripts/kaola-workflow-claim.js` | 4141 | 3959-3966 |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | 4141 | 3959-3966 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | 3918 | 3736-3743 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | 3915 | 3733-3740 |

If a change also touches `adaptive-schema.js` (e.g. reviving #648's `stale_kind`-aware hint), it
lands in all four anchor copies and is an edition-touching diff — the four-chain rule applies.

Documentation that would go out of date: `docs/api.md:233-247` (the `--check` envelope) and
`docs/api.md:592` (`evaluateChainReceipt`'s return shape) document neither `stale_paths` nor
`stale_kind`; `docs/conventions.md:583-584` documents them, but only for the **release** gate.

---

## Verdict on the premise

**The premise holds, scoped exactly as the issue scoped it, and the issue undersold one thing
while overstating another.**

Confirmed:
- `finalize --check --json` reports `"validation": "chains_stale"` as a bare token with no
  culprit path, no stamped hash and no current hash. Reproduced on two independent stale
  conditions (code, prose-only). Not a reading — a run.
- `attachChainsStaleDiagnostics` really does compute the list, at the same
  `evaluateChainReceipt` call the `--check` path itself invokes. The information exists in
  memory one function frame away and is thrown out at `claim.js:4141`.
- `#648` shipped the culprit emission for exactly this diagnosis problem, in its own words.

Corrections to the issue's framing:
- **"One call site" is wrong: there are two consumer renderings that lose information**, and
  they lose different things. `--check` loses everything; `finalization-summary.md` keeps both
  hashes and loses the paths. The summary is the *durable* copy, so its loss outlives the run.
- **The finalize transaction envelope is fine** — it carries `stale_paths` and `stale_kind`
  verbatim. Anyone reading the transaction emit already has the culprits.
- **"no stamped hash and no current hash"** is true of `--check` only. Both hashes reach the
  transaction envelope *and* the durable summary, inside `detail[0]`.
- `--check` is an **unobserved consumer, not a regression**: it postdates #648 by 19 days and
  was born flattening. Nothing that #648 verified has broken; its verifying surface was retired
  and its diagnostics survive only on `run-chains --release-check`.
- The drop is **generic, not `chains_stale`-specific**: `chains_red`'s `redChains[]` is dropped
  by the same two sites (measured). `chains_red` merely happens to name its culprit inside
  `detail`, which is why only the stale case reads as blind.

Not measured (and why):
- The `final_validation_stale` consumer arm's `recorded_candidate_hash` /
  `current_candidate_hash` payload — same renderer, so the same drop is expected by inspection,
  but I did not build a consumer-repo fixture to confirm it.
- `--check` behaviour on the `--keep-worktree` linked-worktree lane. The drop line is lane
  independent (`claim.js:4141` runs on every lane that resolves an authority), so I measured the
  in-place lane only.
- Whether any live archived run in this repo shows the loss in practice; I measured the
  mechanism, not its incidence.

# Investigation: item 6 / A7 — does moving `build-error-resolver` and `adversarial-verifier` from `sonnet` to `opus` introduce a new refusal path or change control flow?

**VERDICT: SUPPORTED for the claim as written** — no new refusal path exists, and no executable
control flow changes. **With three measured qualifications** that the claim's wording does not
cover and that the orchestrator must not read as "nothing changes":

1. The reasoning floor is not merely "still only `synthesizer`" — **it has zero production
   consumers at all**, so it cannot refuse any role on any runtime today (Obs 8).
2. **Two guards go RED right now**, measured, not predicted (Obs 12, Obs 13). Neither is a
   runtime refusal; both are test artifacts. One is the `CLASS_DIVERGENCE` guard the issue already
   plans to delete (A8); the other is `test-install-model-rendering.js`, which the issue's work list
   does **not** mention.
3. **One production generator branches on the tier value** (`sync-opencode-edition.js:146`) and its
   output changes 5→7 roles (Obs 14). Not a refusal, but it is genuinely tier-keyed code, so the
   phrase "nothing keys on tier" in the issue's A7 is **false as stated**; "nothing *gates* on
   tier" is what the measurements support.

---

## Setup

| item | value |
|---|---|
| worktree | `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-935` (branch `workflow/issue-935`) |
| commit | `254e667f7cddf62abaf3634c2b388e8fedbdfc24` (main is at the same commit) |
| node | `v24.14.0` |
| grep | ugrep 7.5.0 (`-P:pcre2jit`) |
| measured between | `2026-08-10T08:13:30Z` – `2026-08-10T08:23:22Z` |

**Concurrency note (expected, per the dispatch brief).** Other agents were editing this worktree
throughout. At `08:13:30Z` the working tree already carried the flip. Working-tree state at the
final snapshot (`08:23:22Z`):

```
 M agents/adversarial-verifier.md
 M agents/build-error-resolver.md
 M install.sh
 M plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js
 M plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js
 M plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js
 M scripts/generate-reviewer-profiles.js
 M scripts/kaola-workflow-resolve-agent-model.js
```

One transient artefact of that concurrency is recorded honestly: my **first** `shasum` of the four
resolver copies (`08:13:0xZ`) caught a mid-write moment where `scripts/` was `d5ece634` and the
three plugin copies were still `c22f3c81`. Re-hashed 20 s later, all four were `d5ece634`. The
earlier reading was a race, not a drift.

### The two legs I measured

Because the flip had already landed, the A/B is a real before/after rather than a synthesized one:

| leg | source | sha256 | the two roles |
|---|---|---|---|
| **A** (baseline) | `git show HEAD:scripts/kaola-workflow-resolve-agent-model.js` | `c22f3c8160edbde32dc6a91e7da3e1e55cb9736891ee153456fcfd92aa2feabe` | `sonnet` |
| **B** (flipped) | worktree `scripts/kaola-workflow-resolve-agent-model.js` | `d5ece6342e6fcbdbf1310be90faaa18bd59bb1bb5d48979a840e4650c2cb7adc` | `opus` |

Snapshots live at
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/bbc1c516-ef3d-40fe-8570-56f6c5fb87b0/scratchpad/resolver-{A-head-sonnet,B-worktree-opus}.js`.
Agent-dir snapshots (`agents-head/`, `agents-worktree/`, 14 files each) alongside them.
Harness: `.../scratchpad/harness.js`; captured output `.../scratchpad/harness-output.md`.

`node scripts/validate-script-sync.js` → **EXIT 0** at the final snapshot: the four resolver copies
are byte-identical (`d5ece634`), i.e. leg B is uniform across all four editions.

---

## Q1 — `REASONING_FLOOR_ROLES` and every caller of `isReasoningClass`

### The definition, quoted

`scripts/kaola-workflow-resolve-agent-model.js:46` (byte-identical in all four copies at the same
line number — `plugins/kaola-workflow/…:46`, `plugins/kaola-workflow-gitlab/…:46`,
`plugins/kaola-workflow-gitea/…:46`):

```js
const REASONING_FLOOR_ROLES = new Set(['synthesizer']);
```

`:54-57`:

```js
function isReasoningClass(model) {
  const m = String(model || '').trim().toLowerCase();
  return m === 'reasoning' || m === 'opus';
}
```

**Obs 1 — `synthesizer` is the only member, at both legs, measured not read.** Harness S2/S3
enumerated the Set for all 14 roster roles:

```
A set size=1 members=["synthesizer"]
B set size=1 members=["synthesizer"]
```

and `has(role) === false` for all 13 other roles in both legs. The roster is exactly the 14 files in
`agents/*.md`, which is exactly `Object.keys(DEFAULT_AGENT_MODELS)` (pinned by
`scripts/test-agent-model-resolver.js:27-31`).

### Every caller of `isReasoningClass`, whole repo

Search: `git grep -n "isReasoningClass"` over all tracked files, plus a filesystem-wide
`grep -rn` including untracked content. Complete list, excluding `CHANGELOG.md`,
`kaola-workflow/archive/`, `kaola-workflow/.origin/` and `docs/investigations/` (historical prose
only — enumerated below for completeness):

| # | site | kind | reachable for a non-floor role? |
|---|---|---|---|
| 1 | `scripts/kaola-workflow-resolve-agent-model.js:54` | definition | n/a |
| 2 | `scripts/kaola-workflow-resolve-agent-model.js:242` | comment | n/a |
| 3 | **`scripts/kaola-workflow-resolve-agent-model.js:246`** | **the only executable call site** | **NO — see the short-circuit below** |
| 4 | `scripts/kaola-workflow-resolve-agent-model.js:432` | `module.exports` entry | n/a |
| 5–16 | the same four lines (`:54`, `:242`, `:246`, `:432`) in each of the three plugin copies | identical | identical |

Historical-prose mentions only (no code): `CHANGELOG.md:2570`, `:2584`;
`docs/investigations/2026-06-15-463-completeness-audit.md:46`, `:69`;
`kaola-workflow/archive/bundle-609-610/.cache/n4-tier-schema.md:24`, `n8-final-review.md:40`.

**Obs 2 — there is no external consumer of `isReasoningClass` anywhere.** The export at `:432` is
imported by nothing. The only `require()` of the resolver module in the entire repo is
`scripts/test-agent-model-resolver.js:9` and `:10`.

### The guard that decides reachability, quoted

`scripts/kaola-workflow-resolve-agent-model.js:243-246`:

```js
function enforceReasoningFloor(role, model, options) {
  const name = String(role || '').trim();
  if (!REASONING_FLOOR_ROLES.has(name)) return { ok: true, role: name, model: model || '', floor: null };
  if (!isReasoningClass(model)) {
```

**Obs 3 — line 245 returns `{ok:true}` before line 246 can run, for every role that is not
`synthesizer`.** The tier value is never inspected for a non-floor role; it is only echoed back on
the `model` field. This is the whole of the "no new refusal path" mechanism, and it is one line.

**Obs 4 — the function's source bytes are IDENTICAL between legs.** Harness S1 compared
`Function.prototype.toString()` for all 7 exported functions:

```
- enforceReasoningFloor: IDENTICAL (A 691B / B 691B)
- extractFrontmatterModel: IDENTICAL (A 348B / B 348B)
- formatAgentArgument: IDENTICAL (A 123B / B 123B)
- isCodexPluginScriptDir: IDENTICAL (A 353B / B 353B)
- isReasoningClass: IDENTICAL (A 134B / B 134B)
- loadCodexSessionProof: IDENTICAL (A 5488B / B 5488B)
- resolveAgentModel: IDENTICAL (A 919B / B 919B)
- export key sets equal: true
- function bodies differing: 0
```

and every non-function export:

```
- DEFAULT_AGENT_MODELS (object): keys A=14 B=14; added=[]; removed=[];
  value-changed=["adversarial-verifier: sonnet -> opus","build-error-resolver: sonnet -> opus"]
- REASONING_FLOOR_ROLES (Set): A=["synthesizer"] B=["synthesizer"] -> IDENTICAL
- CODEX_SESSION_* (5 scalars): IDENTICAL
```

The full A↔B diff is a **single hunk**: two string literals plus a four-line comment rewrite. No
statement, no branch, no operator changed. **This is the strongest single piece of evidence for the
claim** — the executable resolver is byte-for-byte the same program under both legs.

---

## Q2 — Ran it: all 14 roles × {sonnet, opus} × {leg A, leg B}

### S4 — `enforceReasoningFloor(role, model)`, 56 calls

| role | A@sonnet | A@opus | B@sonnet | B@opus |
|---|---|---|---|---|
| adversarial-verifier | ok | ok | ok | ok |
| build-error-resolver | ok | ok | ok | ok |
| code-architect | ok | ok | ok | ok |
| code-explorer | ok | ok | ok | ok |
| code-reviewer | ok | ok | ok | ok |
| doc-updater | ok | ok | ok | ok |
| implementer | ok | ok | ok | ok |
| investigator | ok | ok | ok | ok |
| knowledge-lookup | ok | ok | ok | ok |
| metric-optimizer | ok | ok | ok | ok |
| planner | ok | ok | ok | ok |
| security-reviewer | ok | ok | ok | ok |
| **synthesizer** | **REFUSE:reasoning_floor_violation** | ok | **REFUSE:reasoning_floor_violation** | ok |
| tdd-guide | ok | ok | ok | ok |

Total non-ok verdicts across the 56 calls: **2** — both `synthesizer@sonnet`, one per leg.

**Obs 5 — both target roles return `ok` under BOTH tiers in BOTH legs.** The claim's specific
assertion holds.

### S4b — the alias seam, widened for the two target roles

Because a "no refusal" result on two tokens could be luck, I widened the input domain to 11 tokens
each, including the ones that DO red for `synthesizer`:

| role | `'sonnet'` | `'opus'` | `'reasoning'` | `'standard'` | `'inherit'` | `''` | `'OPUS'` | `' opus '` | `'haiku'` | `null` | `undefined` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| build-error-resolver (A & B) | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| adversarial-verifier (A & B) | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| **synthesizer (A & B)** | REFUSE | ok | ok | **REFUSE** | **REFUSE** | **REFUSE** | ok | ok | **REFUSE** | **REFUSE** | **REFUSE** |

**Obs 6 — the two target roles are unrefusable at every input in the tested domain, including the
seven tokens that DO refuse a floor role.** There is no tier value that makes either role red.

### S5 — POSITIVE CONTROL (the harness can go red)

```
- A synthesizer@sonnet -> {"ok":false,"reason":"reasoning_floor_violation","role":"synthesizer",
    "model":"sonnet","floor":"opus",
    "operator_hint":"Role 'synthesizer' must resolve to a reasoning-class tier; resolved 'sonnet'."}
- B synthesizer@sonnet -> (byte-identical to A)
- HARNESS ARMED (A): true
- HARNESS ARMED (B): true
```

### S5b — MUTATION CONTROL (the `ok` column is not vacuous)

I injected the two target roles into leg B's live `REASONING_FLOOR_ROLES` Set and re-ran the same
code path:

```
- (mutated) build-error-resolver@sonnet -> REFUSE:reasoning_floor_violation
- (mutated) build-error-resolver@opus   -> ok
- (mutated) adversarial-verifier@sonnet -> REFUSE:reasoning_floor_violation
- restored B floor set: ["synthesizer"]
```

**Obs 7 — the `ok` results in S4 are caused by non-membership in the floor set, not by a dead
branch.** The identical code refuses these exact roles the moment they become floor members. This
is the control that distinguishes "the guard passes them" from "the guard is unarmed".

### S6 — end-to-end `resolveAgentModel(role, {enforceFloor:true})`

Empty agent dir (so `DEFAULT_AGENT_MODELS` decides):

| role | A | B |
|---|---|---|
| adversarial-verifier | ok:'sonnet' | ok:'opus' |
| build-error-resolver | ok:'sonnet' | ok:'opus' |
| code-architect | ok:'opus' | ok:'opus' |
| code-explorer | ok:'sonnet' | ok:'sonnet' |
| code-reviewer | ok:'opus' | ok:'opus' |
| doc-updater | ok:'sonnet' | ok:'sonnet' |
| implementer | ok:'sonnet' | ok:'sonnet' |
| investigator | ok:'sonnet' | ok:'sonnet' |
| knowledge-lookup | ok:'sonnet' | ok:'sonnet' |
| metric-optimizer | ok:'sonnet' | ok:'sonnet' |
| planner | ok:'opus' | ok:'opus' |
| security-reviewer | ok:'opus' | ok:'opus' |
| synthesizer | ok:'opus' | ok:'opus' |
| tdd-guide | ok:'sonnet' | ok:'sonnet' |

Zero throws in 28 calls. The frontmatter leg (`agentDir` = the `agents/` snapshots) also returned
`ok` for all 14 roles in both legs and both dirs; under `agents-worktree/` the two target roles
resolve `opus` via frontmatter, under `agents-head/` they resolve `sonnet` — no refusal either way.

### CLI leg — real process, real exit codes

`node <resolver> <role> --json --enforce-floor --agent-dir <nonexistent>`, all 14 roles, three
binaries (leg A snapshot, leg B snapshot, and the live worktree script):

**All 42 invocations exited 0.** The two target roles: leg A `{"agent":"build-error-resolver","model":"sonnet"}` /
leg B `{"agent":"build-error-resolver","model":"opus"}`, same shape for `adversarial-verifier`.

CLI positive control — I lowered `synthesizer` via a scratch frontmatter dir:

```
resolver-A-head-sonnet.js:  out={"result":"refuse","reason":"reasoning_floor_violation","agent":"synthesizer",
                                 "model":"sonnet","floor":"opus","operator_hint":"…"}  exit=1
resolver-B-worktree-opus.js: (byte-identical)                                            exit=1
```

CLI negative-direction control — the same lowered frontmatter applied to the target roles:

```
B build-error-resolver (frontmatter sonnet): out={"agent":"build-error-resolver","model":"sonnet"} exit=0
B adversarial-verifier (frontmatter sonnet): out={"agent":"adversarial-verifier","model":"sonnet"} exit=0
```

**Obs 8 — and this matters more than the rest of Q2: the floor has ZERO production consumers.**
`enforceFloor` / `--enforce-floor` appears, outside the four resolver copies themselves, in exactly
one file: `scripts/test-agent-model-resolver.js`. The full requirer/invoker enumeration of the
resolver module (`git grep "resolve-agent-model" -- '*.js' '*.sh' '*.json' '*.toml'`) yields exactly
these production invocations: the four copies of the dispatch-log hook at
`hooks/kaola-workflow-subagent-dispatch-log.sh:34-36`, which call it as
`node "$_KW_RESOLVER" "$AGENT_TYPE" --raw` — **no `--enforce-floor`**. Everything else is a
validator asserting the file exists / contains a token, or a test.

*Inference (high confidence):* the reasoning-floor refusal is currently **unreachable in
production for every role, including `synthesizer`**. It is a library primitive with a test-only
caller. This makes "the flip introduces no new refusal path" true, but true for a stronger and
less flattering reason than the issue's wording implies: there is no live refusal path to add to.
*Refuted by:* finding any production script or prose surface that invokes the resolver with
`--enforce-floor` or `{enforceFloor:true}` — I searched all tracked `.js`/`.sh`/`.json`/`.toml` and
found none.

---

## Q3 — Sweep for any OTHER behavior keyed on tier

### Method note: two of my own greps were FALSE NEGATIVES, and I caught it with a control

My first pass used `git grep -E "\b(opus|sonnet|haiku)\b"` and returned **zero hits**. That is
wrong. Control:

```
git grep -c "sonnet" -- '*.js'      → 17 files
git grep -cE "\bsonnet\b" -- '*.js' → (empty)
git grep -cP "\bsonnet\b" -- '*.js' → 17 files
```

`git grep -E` does not support `\b`/`\s`. **Every negative below was re-run with `-P`.** Reporting
this because the discarded result would have produced exactly the "nothing keys on tier" answer the
issue asserts, for the wrong reason.

### Dot-directory handling (and its control)

`.opencode`, `.kimi`, `.claude`, `.codex` **do not exist in the worktree** (verified by `ls`; all
four are gitignored — `.gitignore:3-6` — and are local install artifacts). They **do** exist in
main's checkout: `.opencode` 3458 files, `.kimi` 19, `.claude` 1 (`scheduled_tasks.lock`), `.codex`
1 (`config.toml`). I searched all four **by name** from main.

ugrep dot-dir control, run in the worktree against `.agents`:

```
scanning '.' recursively, filtered to .agents paths → (empty)  [ugrep SKIPPED it]
grep -rn "kaola" .agents                           → 3 hits    [naming it WORKS]
```

Dot-dir results:

| dir | role-name ∧ tier-token on one line | tier token in a JS/SH comparison | control: files naming `build-error-resolver` | control: files naming a tier token |
|---|---|---|---|---|
| `.opencode` | **0** | **0** | 3 | 4 |
| `.kimi` | **0** | **0** | 3 | 3 |
| `.claude` | **0** | **0** | 0 | 0 |
| `.codex` | **0** | **0** | 0 | 0 |

**Obs 9 — the `.opencode`/`.kimi` zeros are real negatives, backed by a positive control** showing
those trees do contain both the role names and tier tokens, just never on the same line and never in
a comparison. `.claude`/`.codex` hold one file each and contain neither token.

### Scheduling knobs: wait budgets, timeouts, retries, concurrency, caps

Cross-product search — every line in `*.js`/`*.sh`/`*.json` matching
`(wait|budget|timeout|retry|retries|concurren|fanout|fan-out|cap|throttle|backoff)` **and** a tier
token `(opus|sonnet|haiku|reasoning|standard)`:

**18 hits, ZERO of them a mechanism.** Breakdown:
- 6 × `reasoning:` used as a **JSON field name meaning "explanation"** in claim-script refusal
  envelopes — `scripts/kaola-workflow-claim.js:1233`, `:1935` and the gitlab/gitea twins. Nothing to
  do with model tier.
- 4 × `scripts/kaola-workflow-adaptive-schema.js:45` (+3 twins): *"The historical standard/reasoning
  classes remain declarative metadata and wait defaults."* — a **comment**.
- 4 × `…resolve-agent-model.js:18` (+3 twins): *"These defaults preserve each role's declarative
  reasoning/wait-budget class."* — a **comment**.
- 4 × test prose (`test-agent-model-resolver.js:49`, `test-opencode-edition.js:764`, `:874`).

**Obs 10 — the wait-budget mechanism those comments refer to no longer exists in code.**
`git grep "waitBudgetMinutes" -- '*.js' '*.sh'` → **no hits for pattern `waitBudgetMinutes` in any
`.js`/`.sh`**. The only surviving mentions are in `docs/decisions/D-611-01.md:51-54` (a historical
ADR describing `waitBudgetMinutes(model)`, `reasoning`→40, `standard`→20) and `D-627-01.md:41`.
Control: the same pathspec finds `resolveAgentModel` in 5 files, so the search reaches code.

*Inference (high confidence):* **no wait budget, timeout, retry count, concurrency cap or fan-out
bound is keyed on model tier anywhere in the shipped tree.** *Refuted by:* a knob computed from a
tier through an intermediate variable across lines (my search is line-local). I judge this unlikely
given there is no tier-derived variable to carry — the only function that classifies a tier is
`isReasoningClass`, and Obs 2 shows it has no external consumer.

### Tier tokens in a comparison — the complete inventory (`-P` pass)

| file:line | code | verdict |
|---|---|---|
| `scripts/kaola-workflow-resolve-agent-model.js:56` (×4) | `return m === 'reasoning' \|\| m === 'opus';` | `isReasoningClass`; unreachable for non-floor roles (Obs 3) |
| `…:313`, `:318`, `:322` (×4) | `toLowerCase() === 'inherit'` | keyed on `inherit`, not on a tier rank; identical A/B |
| `install.sh:530` | `== "inherit"` | same; drops the `model=` line for `inherit` |
| **`scripts/sync-opencode-edition.js:146`** | `return String(canonModelValue \|\| '').toLowerCase() === 'opus' ? 'reasoning' : 'standard';` | **REAL tier-keyed branch — see Obs 14** |
| **`scripts/sync-opencode-edition.js:537`** | `.filter(r => r.tier === 'reasoning')` | consumes the above |
| `scripts/generate-reviewer-profiles.js:620-621` | `? 'sonnet' : (adapter.model_policy_ref === 'claude-reasoning' ? 'opus' : null)` | keyed on the **adapter policy ref**, not on the resolved tier; this is the A1 generator |
| `scripts/test-agent-model-resolver.js:59` | `model === 'opus' \|\| model === 'sonnet'` | test |
| `scripts/test-install-adaptive-config.js:184` | `resolved === 'sonnet'` | test, `implementer` only — unaffected |

**Obs 11 — the four contract validators match tier tokens only to FORBID capitalized model nouns in
prose** (`validate-kaola-workflow-contracts.js:713` `const B2_MODEL_NOUN = /\b(?:opus|sonnet|haiku)\b/i;`
plus the gitlab/gitea twins and `validate-workflow-contracts.js:961`). They are prose-hygiene rules
about *vendor names in agent-facing text*; they do not read a role's tier. `node
scripts/validate-workflow-contracts.js` → **EXIT 0** at the flipped state.

### Prompt / text selection keyed on tier

`git grep -inP "(if|when|only|unless|requires?|must)\b[^.]{0,80}\b(reasoning[- ]?(tier|class)|standard[- ]?tier)"`
over `commands/`, `templates/`, `agents/`, `plugins/*/commands/`, `plugins/*/skills/`,
`plugins/*/agents/` → **no hits**.

But there is a tier-keyed **dispatch rule in prose**, which that pattern (looking for a conditional)
correctly did not match because it is stated as a table, not a condition —
`templates/routing/next.skeleton.md:6-13` and `finalize.skeleton.md:6-13`:

```
Keep every installed role's existing standard-tier or reasoning-tier classification, and set the
model and reasoning effort explicitly on each spawn. Standard-tier roles dispatch with
`model: "gpt-5.6-sol"` and `reasoning_effort: "medium"`. Reasoning-tier roles dispatch with
`model: "gpt-5.6-sol"` and `reasoning_effort: "xhigh"`.

These mappings are fixed for every spawn. Do not escalate, downgrade, or otherwise override a
standard-tier role's model or reasoning effort based on task breadth, latency, prior results, risk,
or any other condition. The role classification remains unchanged.
```

**Obs 12 — on Codex this is a tier→effort mapping the orchestrator applies at every spawn.** It
names no role, so the flip does not edit it; it changes what it *evaluates to* for these two roles.
This is the `sol/medium → sol/xhigh` movement the issue records as intended. It is **not** a
refusal: the surrounding text forbids per-task exceptions but never refuses a dispatch.

Where a Codex orchestrator reads "the role's existing tier" is worth naming precisely, because the
three carriers currently **disagree**, and only one is machine-checked:

| carrier | says for these two roles | machine-checked? |
|---|---|---|
| `scripts/kaola-workflow-adaptive-schema.js:55-63` `CODEX_PINNED_REASONING_ROLES` | **reasoning** (already, unchanged) | yes — 3-way copy equality, `validate-kaola-workflow-contracts.js:435-445` |
| `README.md:152`, `:156` Agent/Tier table | **standard** | **NO** — `docs/conventions.md:215`: *"the Agent/Tier table, which is **not** machine-checked — keep it in step by hand"* |
| `DEFAULT_AGENT_MODELS` | was `sonnet`, now `opus` | yes — `test-agent-model-resolver.js` |

---

## Q4 — the subagent-dispatch-log hook

**File:** `hooks/kaola-workflow-subagent-dispatch-log.sh` (canonical), copied byte-for-byte to
`plugins/kaola-workflow{,-gitlab,-gitea}/hooks/`. Wired by `hooks/hooks.json:18-31` (Claude,
`SubagentStart`, timeout 5), `scripts/sync-kimi-edition.js:530-535` (Kimi, `SubagentStart`,
timeout 30), and `templates/opencode/plugins/kaola-workflow-hooks.js:161` (opencode,
`tool.execute.before` on `task`).

### How it touches the tier — quoted

`:32-39`:

```sh
MODEL_PLANNED=""
for _KW_SDIR in "$_KW_ROOT/scripts" "$_KW_ROOT/kaola-workflow/scripts" "$_KW_OC_SCRIPTS"; do
  _KW_RESOLVER="$_KW_SDIR/kaola-workflow-resolve-agent-model.js"
  if [ -f "$_KW_RESOLVER" ]; then
    MODEL_PLANNED=$(node "$_KW_RESOLVER" "$AGENT_TYPE" --raw 2>/dev/null || printf '')
    break
  fi
done
```

**Obs 13 — the hook invokes the resolver WITHOUT `--enforce-floor`.** `grep -n "enforce"` over the
hook → **no hits for pattern `enforce`**. The floor is therefore never consulted from the hook, for
any role, on any runtime.

### It is fail-open — proven from the source AND by running it

Every `exit` statement in the 118-line file:

```
3:# SubagentStart delivers a JSON payload on STDIN; exit 0 always (fail-open).
6:[ -z "$HOOK_INPUT" ] && exit 0
11:[ -z "$AGENT_TYPE" ] && exit 0
51:[ -z "$HOOK_ROOT" ] && [ -z "$AGENT_ROOT" ] && exit 0
118:exit 0
```

**There is no `exit 1` and no `exit 2` in the file.** The resolver call at `:36` is additionally
guarded twice — `2>/dev/null` and `|| printf ''` — so a resolver that threw would yield an empty
string, never a non-zero hook exit.

Live run, throwaway git repo at
`.../scratchpad/hookrepo` with an `active` `workflow-state.md`, resolver copy swapped per leg:

| leg | role | hook exit | `model_planned` written to `dispatch-log.jsonl` |
|---|---|---|---|
| B (opus) | build-error-resolver | **0** | `"opus"` |
| B | adversarial-verifier | **0** | `"opus"` |
| B | synthesizer | **0** | `"opus"` |
| B | code-reviewer | **0** | `"opus"` |
| B | `bogus-role` | **0** | `""` |
| A (sonnet) | build-error-resolver | **0** | `"sonnet"` |
| A | adversarial-verifier | **0** | `"sonnet"` |
| A | synthesizer | **0** | `"opus"` |

The `bogus-role` row is the positive control that the resolver actually ran (a role it cannot answer
yields an empty field while the hook still exits 0), and the A/B `model_planned` difference is the
control that the resolver copy under test was the one being exercised.

**Obs 14 — the hook CANNOT refuse, block, or alter a dispatch on any basis, tier included.** Its
only tier-dependent output is the advisory `model_planned` field, whose value changes
`sonnet`→`opus` for the two roles.

Does anything consume `model_planned`? Complete list outside `CHANGELOG.md`/archive:
- the 4 hook copies that emit it (`:24`, `:77`);
- `scripts/simulate-workflow-walkthrough.js:13089-13090` and `:13140-13141` — assert **non-empty**
  only, and for `tdd-guide` (an untouched role);
- `scripts/test-outcome-recorder.js:359` — a literal fixture `model_planned: 'standard'`.

**No consumer branches on its value.**

### opencode adapter: the exit code is discarded outright

`templates/opencode/plugins/kaola-workflow-hooks.js:7-8` claims *"honors their exit codes (2 = deny
→ throw…)"*, but the dispatch-log call site at `:157-164` is:

```js
if (tool === "task") {
  try {
    const st = args.subagent_type || args.agent || "";
    const sid = (input && (input.sessionID || input.callID)) || "";
    runHook(root, HOOK.dispatchLog, { agent_type: st, agent_id: sid, cwd: directory || root });
  } catch {
    // advisory; ignore
  }
}
```

The return value of `runHook` is **not assigned and not tested**, and the whole call is inside
`try/catch`. So even a hypothetical exit 2 would not deny on opencode. `runHook` itself (`:80-91`)
returns `{status: 0}` on a missing script or a spawn throw.

---

## Q5 — anything keyed on these two roles BY NAME

Search: `git grep -inP "(build-error-resolver|adversarial-verifier|BUILD_ERROR_RESOLVER|ADVERSARIAL_VERIFIER)"`
intersected with a tier/model token, across all tracked surfaces including prose, plus the explicit
dot-dir sweep from Q3.

| file:line | content | judgement under the flip |
|---|---|---|
| `scripts/test-agent-model-resolver.js:46` | `'build-error-resolver': Object.freeze({ claude: 'sonnet', codex: 'reasoning' })` | **BREAKS — measured RED**, see below |
| `scripts/test-agent-model-resolver.js:50` | `'adversarial-verifier': Object.freeze({ claude: 'sonnet', codex: 'reasoning' })` | **BREAKS** (same guard; the run aborts on the first) |
| `scripts/test-install-model-rendering.js:2946-2947` | `finalize.includes('subagent_type="build-error-resolver",\n  model="sonnet",')` | **BREAKS — measured RED** |
| `scripts/test-install-model-rendering.js:3029` | `'build-error-resolver': 'sonnet',` (independently-derived pinned tier table) | **BREAKS** (unreached — the run aborts at :2945) |
| `scripts/test-install-model-rendering.js:3033` | `'adversarial-verifier': 'sonnet',` | **BREAKS** (unreached) |
| `README.md:152` | `\| build-error-resolver \| Write — validation repair when needed \| standard \|` | **WRONG after the flip**; not machine-checked (`docs/conventions.md:215`) — this is the issue's A9 |
| `README.md:156` | `\| adversarial-verifier \| Read-only falsifier… \| standard \|` | **WRONG after the flip**; same |
| `opencode.json:8`, `:17-21` | the reasoning-role list, 5 names, `synthesizer` last | **STALE after the flip** (7 names) — the issue's A6 |
| `docs/opencode-edition.md:122` | *"overrides for the **five** reasoning-tier roles (`code-architect`, `code-reviewer`, `planner`, `security-reviewer`, `synthesizer`)"* | **WRONG after the flip** (seven) — the issue's A6 |
| `install.sh:545` | `BUILD_ERROR_RESOLVER_MODEL) resolve_agent_model_for_install build-error-resolver ;;` | **correct by construction** — reads `agents/build-error-resolver.md` frontmatter, so it renders whatever the source says |
| `commands/kaola-workflow-finalize.md:96` (+ 2 forge twins, + `templates/routing/finalize.skeleton.md:108`) | `model="{BUILD_ERROR_RESOLVER_MODEL}",` | **placeholder — no assumption**; renders `model="opus",` post-flip |
| `scripts/validate-workflow-contracts.js:196` (+ plugin twin) | `assertIncludes(file, 'model="{BUILD_ERROR_RESOLVER_MODEL}"')` | **unaffected** — pins the placeholder token, not its value. EXIT 0 measured |
| `scripts/kaola-workflow-adaptive-schema.js:58`, `:61` | `build-error-resolver` and `adversarial-verifier` in `CODEX_PINNED_REASONING_ROLES` | **already `reasoning`; unchanged.** The flip makes the Claude table AGREE with it |
| `install-codex-agent-profiles.js:733`, `codex-preflight.js:1705` (×3 editions each) | `if (!CODEX_PINNED_STANDARD_ROLES.includes(role) && !CODEX_PINNED_REASONING_ROLES.includes(role)) { reasons.push(\`role "${role}" has no Codex profile-tier policy\`); }` | **unaffected** — keyed on list membership, and neither list changes |
| `plugins/*/agents/{build-error-resolver,adversarial-verifier}.toml` (6 files) | `'^model' lines = 0` in all six | **unaffected, and must stay so** — the same two validators push `"top-level 'model' must be omitted to inherit the parent session"`. The tomls are unmodified in the worktree |
| `docs/decisions/D-594-01.md:91` | *"An opus adversarial-verifier gate…"* | historical prose; already says opus |

**Obs 15 — `ADVERSARIAL_VERIFIER_MODEL` does not exist as a placeholder.** `git grep` finds it only
in `kaola-workflow/archive/` (issue-328, bundle-645-646), never in `install.sh`, `commands/` or
`templates/`. Control: the parallel `BUILD_ERROR_RESOLVER_MODEL` returns 8 live hits. So
`adversarial-verifier` has no rendered-command dispatch surface to change.

### The two RED guards, measured not predicted

Both run at `2026-08-10T08:21:22Z`/`08:21:39Z` against the in-flight worktree.

`node scripts/test-agent-model-resolver.js` → **EXIT 1**:

```
AssertionError [ERR_ASSERTION]: build-error-resolver Claude dispatch tier changed;
the declared divergence says sonnet

'opus' !== 'sonnet'

    at .../scripts/test-agent-model-resolver.js:68:12
```

That is the bidirectional `CLASS_DIVERGENCE` assert at `:65-73`:

```js
  if (declared) {
    // Bidirectional: a declared divergence must STILL diverge, and must diverge exactly as declared.
    // A stale entry (the tables re-converged) fails just as loudly as an undeclared one.
    assert.strictEqual(model, declared.claude,
      `${role} Claude dispatch tier changed; the declared divergence says ${declared.claude}`);
```

`node scripts/test-install-model-rendering.js` → **EXIT 1**:

```
AssertionError [ERR_ASSERTION]: finalize routed-fix build-error-resolver block should render as sonnet
    at .../scripts/test-install-model-rendering.js:2945:3
```

**Obs 16 — this second red is a real INSTALL-OUTPUT change, and the issue's work list does not
mention it.** The rendered `commands/kaola-workflow-finalize.md` dispatch block now carries
`model="opus",` where it carried `model="sonnet",`. Mechanism: `install.sh:526-533`
`resolve_agent_model_for_install` reads the **source frontmatter** (`agents/build-error-resolver.md`,
flipped `sonnet`→`opus`), and `install.sh:536-549 model_for_placeholder` maps
`BUILD_ERROR_RESOLVER_MODEL` to it. This is the flip reaching a shipped surface — the intended
effect — but `test-install-model-rendering.js` is a **test artifact under custody**, and the issue's
A-list only routes `test-agent-model-resolver.js` (A8) to the test author.

Note also that `install.sh` is being concurrently edited: `default_agent_model` had **2** hits in
`git show HEAD:install.sh` and **0** in the working tree — the issue's A5 deletion has landed.

### Suites that stayed GREEN at the flipped state

| suite | exit |
|---|---|
| `node scripts/test-agent-profile-parity.js` | **0** |
| `node scripts/validate-workflow-contracts.js` | **0** |
| `node scripts/validate-vendored-agents.js` | **0** |
| `node scripts/validate-script-sync.js` | **0** (four resolver copies byte-identical) |

---

## The one production tier-keyed branch (Obs 14, expanded)

`scripts/kaola-workflow-sync-opencode-edition.js` — actually `scripts/sync-opencode-edition.js`,
**unmodified in the worktree**:

```js
// :144  Canonical model tier: opus → reasoning, everything else (sonnet/inherit) → standard.
// :145
function roleTier(canonModelValue) {
  return String(canonModelValue || '').toLowerCase() === 'opus' ? 'reasoning' : 'standard';
}
```
```js
// :531
function reasoningRoles() {
  return listCanonAgents()
    .map(name => { … return { name, tier: roleTier(parseFrontmatter(c).fm.model) }; })
    .filter(r => r.tier === 'reasoning')
    .map(r => r.name).sort();
}
```

Measured by calling the **real exported functions** (`roleTier`, `parseFrontmatter`) against both
agent-dir snapshots:

```
A HEAD agents/:     reasoning count=5  [code-architect, code-reviewer, planner, security-reviewer, synthesizer]
B worktree agents/: reasoning count=7  [adversarial-verifier, build-error-resolver, code-architect,
                                        code-reviewer, planner, security-reviewer, synthesizer]
live reasoningRoles(): ["adversarial-verifier","build-error-resolver","code-architect","code-reviewer",
                        "planner","security-reviewer","synthesizer"]
```

`node scripts/sync-opencode-edition.js --check` from the worktree → **EXIT 1**, with 20 findings.
**19 of the 20 are a worktree artefact**, not the flip: `.opencode/` does not exist in a linked
worktree, so every generated agent/command/plugin reads as "missing". The 20th is attributable:

```
  - opencode.json — stale — regenerate via --write-config
```

**Control leg:** the same `--check` run from **main** (agents/ unmodified at HEAD, `.opencode/`
present) → **EXIT 0**: `"14 agent(s) + 3 command(s) + 1 plugin(s) in parity with canonical."`
So the `opencode.json` staleness is caused by the tier flip, and the 19 "missing" lines are the
confound.

*Inference (high confidence):* `roleTier` is the **only** place in production code where a tier
value selects a behaviour rather than merely being carried. Its effect is on **generated
configuration content**, not on a gate: nothing refuses, and the remedy is regeneration (A6).
*Refuted by:* any other production call site of a tier comparison — the `-P` inventory above is
complete for `.js`/`.sh` and I list every hit.

---

## Verdict

**SUPPORTED**, with the three qualifications stated at the top.

Against the literal claim "introduces NO new refusal path and changes no control flow beyond the
literal model value":

- **No new refusal path.** Proven three ways: the byte-identical function sources (Obs 4); the
  56-call verdict matrix with an armed positive control and a mutation control (Obs 5–7); and the
  fact that the only refusal primitive has no production caller at all (Obs 8). The hook, the one
  place production does invoke the resolver, is structurally incapable of non-zero exit (Obs 13–14).
- **No executable control flow changes.** The A↔B diff is one hunk: two string literals and a
  comment. `enforceReasoningFloor`, `isReasoningClass`, `resolveAgentModel` and the other four
  exports are byte-identical.

Against the issue's own A7 wording — *"the reasoning floor still gates only synthesizer and nothing
keys on tier"*:

- First half **SUPPORTED** (and stronger: it gates nothing in production).
- Second half **REFUTED as stated**. Three things key on tier and change behaviour:
  `sync-opencode-edition.js:146/537` (5→7 reasoning roles, `--check` now reports `opencode.json`
  stale); `install.sh:526-549` (the rendered `model="…"` on the finalize dispatch block, `sonnet`→
  `opus`); and the Codex per-spawn `reasoning_effort` mapping in the routing skeletons
  (`medium`→`xhigh`). All three are **intended** and all three are already on the issue's work list
  as A6/A9 — none is a refusal, none is a gate. The accurate wording is *"nothing **gates** on
  tier."*

Two guards are RED right now, both measured. `test-agent-model-resolver.js:68` is the planned A8
deletion. **`test-install-model-rendering.js:2945` is not on the work list** and is the finding I
would flag hardest: it is real, it is a test artifact (so it belongs to the test author under
custody), and it is evidence that the flip reaches an install-rendered command surface.

---

## Open / NOT MEASURED

- **Live dispatch effort per runtime.** I did not spawn a real subagent on Claude, Codex, opencode
  or Kimi and read back the effective model/effort. Everything above is the authored/resolved value,
  which is precisely the thing the issue's A10 says not to infer from. **NOT MEASURED.**
- **Reinstalled surfaces.** No `install.sh`/`install-all.sh` run was performed (it mutates
  `$HOME` — shared state, and not mine to decide). The install-render evidence comes from
  `test-install-model-rendering.js`, which installs into a temp `HOME`
  (`scripts/test-install-model-rendering.js:63`). The **actually installed** copies under
  `~/.claude`, `~/.codex`, `~/.config/opencode`, `~/.kimi` still carry the pre-flip tier.
  **NOT MEASURED.**
- **Whether `test-install-model-rendering.js:3029/3033` red independently.** The run aborts at
  `:2945`, so the pinned-table assertions were never reached. Their failure is inferred from reading
  (`'build-error-resolver': 'sonnet'` compared against a `--raw` resolver call at `:3039`), not
  observed. **INFERRED, NOT MEASURED.**
- **The remaining suites.** `test-opencode-edition.js`, `test-kimi-edition.js`,
  `simulate-workflow-walkthrough.js` at full scope, and the four chains were not run — out of scope
  for item 6 and belonging to the run's verification item. **NOT MEASURED.**
- **Line-local search limitation.** All co-occurrence searches (Q3, Q5) are line-local. A tier
  captured into a variable on one line and used as a knob several lines later would not appear. I
  judge this low-risk because `isReasoningClass` — the only tier classifier — has zero external
  consumers (Obs 2), and `roleTier` (the only other one) is fully traced. Stated so a later reader
  can reject it rather than inherit it.
- **Cross-agent concurrency.** Files under measurement were being edited by other agents throughout.
  Every measurement above carries the working-tree state and/or a sha256 at the time it was taken;
  a re-run after the concurrent work settles could differ, particularly the two RED suites.

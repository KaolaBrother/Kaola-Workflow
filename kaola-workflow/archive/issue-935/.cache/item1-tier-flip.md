# Issue #935, item 1 — tier flip: build-error-resolver + adversarial-verifier → reasoning (opus)

**Worktree**: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-935` (branch `workflow/issue-935`)
**Base commit**: `254e667f chore(roadmap): re-scope 935 — drop the Codex Luna change, refute Stage C`
**Verification tier**: `regression-green` — the full existing suite (walkthrough at FULL scope, 209/209)
plus every non-test-custody validator green before AND after. Two test-custody pins now fail BY
DESIGN; both are convergence detectors, and neither is mine to edit (see §6).
**Committed**: no. Left as working-tree edits, as instructed.

---

## 1. Files changed (all four edits landed; nothing else)

| file | change | lines |
|---|---|---|
| `scripts/generate-reviewer-profiles.js` | (a) output-spec adapter `claude-standard` → `claude-reasoning` | 1 |
| `agents/adversarial-verifier.md` | (a) REGENERATED — `model:` + `resolved_profile_hash:` | 2 |
| `agents/build-error-resolver.md` | (b) frontmatter `model: sonnet` → `model: opus` | 1 |
| `scripts/kaola-workflow-resolve-agent-model.js` | (c)+(d) two map values + comment rewrite | 6 |
| `plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js` | (c)+(d) byte-identical copy | 6 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js` | (c)+(d) byte-identical copy | 6 |
| `plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js` | (c)+(d) byte-identical copy | 6 |

Not touched, as instructed: `code-reviewer`, `security-reviewer`, `CODEX_PINNED_STANDARD_ROLES`,
`CODEX_PINNED_REASONING_ROLES`, the `metric-optimizer` comment, `scripts/test-agent-model-resolver.js`,
the 9 Codex `.toml` reviewer outputs, and the `<!-- ... -->` provenance block in
`agents/build-error-resolver.md` (byte-identical).

### (a) generator + regenerated profile

```diff
--- a/scripts/generate-reviewer-profiles.js
+++ b/scripts/generate-reviewer-profiles.js
@@ -182,7 +182,7 @@ const OUTPUT_SPECS = Object.freeze([
     role: 'adversarial-verifier',
     runtime: 'claude',
     variant: 'base',
-    adapter: 'claude-standard',
+    adapter: 'claude-reasoning',
     format: 'markdown',
```

```diff
--- a/agents/adversarial-verifier.md
+++ b/agents/adversarial-verifier.md
@@ -3,10 +3,10 @@ name: adversarial-verifier
-model: sonnet
+model: opus
 behavior_contract_version: 3
 behavior_contract_hash: efb8f28ba39b96d87ad7986705629c1c133e71747fa6c30d9270e57003f3883c
-resolved_profile_hash: e3b5d588692ff70b359236bd6167025db100fbc5d09e637c8dc3935236a79f5e
+resolved_profile_hash: f131a3ecb1abfc6bd9c29899e57ab0c1d214071389bcdbc1c2441134e90ffe3c
```

Prediction held EXACTLY: `Wrote 12 reviewer profiles.`, exactly ONE file changed, exactly TWO lines.
`behavior_contract_hash` UNCHANGED (`efb8f28b…`). The 9 `.toml` outputs and the other two reviewer
profiles were byte-unchanged (absent from `git status`).

**Why it was safe, verified by reading rather than assumed**: `renderAdapter()` (line 547) branches
only on `adapter.tools` and `adapter.evidence_transport`. It never reads `model_policy_ref`. The two
adapters `claude-standard` / `claude-reasoning` differ in `model_policy_ref` ALONE, so the adapter
prose is identical and only the `model:` line (line 619-621) plus the trailing content hash can move.

### (b) build-error-resolver frontmatter

```diff
 tools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob"]
-model: sonnet
+model: opus
 ---
```

Confirmed the brief's claim by reading `scripts/validate-vendored-agents.js` lines 69-87: the vendored
loop asserts only PRESENCE and FORMAT (`/source-sha256: [0-9a-f]{64}/`, `includes('license: MIT License')`,
etc.). No assertion recomputes a digest over this file's content. The edit is outside the provenance
block and the validator stays green.

### (c) + (d) resolver — identical in all four copies

```diff
@@ -20,15 +20,15 @@ const DEFAULT_AGENT_MODELS = {
   'code-architect': 'opus',
   'tdd-guide': 'sonnet',
   'implementer': 'sonnet',
-  'build-error-resolver': 'sonnet',
+  'build-error-resolver': 'opus',
   'code-reviewer': 'opus',
   'security-reviewer': 'opus',
   'doc-updater': 'sonnet',
-  // The adversarial verifier falsifies ONE recorded claim against ONE named surface — a bounded,
-  // well-scoped read task — so its shipped tier is standard. A dispatch may raise it (the
-  // post-G1 intent-verifier on a synthesizer's merge is raised that way); it is NOT a
-  // reasoning-floor role.
-  'adversarial-verifier': 'sonnet',
+  // The adversarial verifier's shipped tier is reasoning: verification here routinely OVERTURNS
+  // conclusions that green suites and the implementer's own mutation proof had already accepted, so
+  // it is reasoning-class judgment, not a bounded read. A dispatch may still raise or lower it; it
+  // is NOT a reasoning-floor role — only `synthesizer` is.
+  'adversarial-verifier': 'opus',
   // #634: metric-optimizer runs a bounded metric-ratchet loop; the per-iteration reasoning is small
   // (the change-gate verifier and reviewer carry the judgment), so its default is the standard tier.
   // A dispatch may raise it; it is NOT a reasoning-floor role.
```

**Exact new comment text (byte-identical in all four copies):**

```
  // The adversarial verifier's shipped tier is reasoning: verification here routinely OVERTURNS
  // conclusions that green suites and the implementer's own mutation proof had already accepted, so
  // it is reasoning-class judgment, not a bounded read. A dispatch may still raise or lower it; it
  // is NOT a reasoning-floor role — only `synthesizer` is.
```

Constraint check: no "wait budget" anywhere in it; states the RESULT (overturns already-accepted
conclusions) not a mechanism; keeps the non-floor note and names `synthesizer` as the only floor role;
says a dispatch may raise **or lower** it. The `metric-optimizer` comment directly beneath is byte-untouched.

---

## 2. The four hashes

Before (all four, per the brief): `c22f3c8160edbde32dc6a91e7da3e1e55cb9736891ee153456fcfd92aa2feabe`

After — **ONE common hash, confirmed**:

```
d5ece6342e6fcbdbf1310be90faaa18bd59bb1bb5d48979a840e4650c2cb7adc  scripts/kaola-workflow-resolve-agent-model.js
d5ece6342e6fcbdbf1310be90faaa18bd59bb1bb5d48979a840e4650c2cb7adc  plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js
d5ece6342e6fcbdbf1310be90faaa18bd59bb1bb5d48979a840e4650c2cb7adc  plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js
d5ece6342e6fcbdbf1310be90faaa18bd59bb1bb5d48979a840e4650c2cb7adc  plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js
```

**NEW HASH: `d5ece6342e6fcbdbf1310be90faaa18bd59bb1bb5d48979a840e4650c2cb7adc`**

Corroborated two further ways: `shasum | awk '{print $1}' | sort -u | wc -l` → `1`; and `cmp -s`
against the root copy → `IDENTICAL` for all three plugin copies. `git diff --summary` was EMPTY,
so `cp` introduced no file-mode change (the file is `100755` and stayed so).

---

## 3. Command outputs with exit codes

### Before the change (baseline)

| command | output | exit |
|---|---|---|
| `node scripts/generate-reviewer-profiles.js --check` | `Reviewer profile generation check passed.` | 0 |
| `node scripts/validate-vendored-agents.js` | `Vendored agent validation passed for 14 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1` | 0 |
| `node scripts/test-agent-model-resolver.js` | `Agent model resolver tests passed` | 0 |

### After the change (required set)

```
$ node scripts/generate-reviewer-profiles.js --write
Wrote 12 reviewer profiles.
exit=0

$ node scripts/generate-reviewer-profiles.js --check
Reviewer profile generation check passed.
exit=0

$ node scripts/validate-vendored-agents.js
Vendored agent validation passed for 14 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1
exit=0
```

`git status --short` — immediately after my seven edits, BEFORE the concurrent edit in §5:

```
 M agents/adversarial-verifier.md
 M agents/build-error-resolver.md
 M plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js
 M plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js
 M plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js
 M scripts/generate-reviewer-profiles.js
 M scripts/kaola-workflow-resolve-agent-model.js
```

`git diff --stat` at that same moment — **exactly the 7 intended files, nothing more**:

```
 agents/adversarial-verifier.md                    |  4 ++--
 agents/build-error-resolver.md                    |  2 +-
 .../kaola-workflow-resolve-agent-model.js         | 12 ++++++------
 .../kaola-workflow-resolve-agent-model.js         | 12 ++++++------
 .../kaola-workflow-resolve-agent-model.js         | 12 ++++++------
 scripts/generate-reviewer-profiles.js             |  2 +-
 scripts/kaola-workflow-resolve-agent-model.js     | 12 ++++++------
 7 files changed, 28 insertions(+), 28 deletions(-)
```

### Additional verification I ran (not required, but it is what earns the tier)

| command | output | exit |
|---|---|---|
| `node scripts/simulate-workflow-walkthrough.js` | `##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":209,"ran":209,"passed":209,"failed":0}` / `Workflow walkthrough simulation passed` | **0** |
| `node scripts/generate-routing-surfaces.js --check` | `generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.` | 0 |
| `node scripts/validate-workflow-contracts.js` | — | 0 |
| `node scripts/validate-kaola-workflow-contracts.js` | — | 0 |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | — | 0 |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | — | 0 |

Walkthrough ran at FULL scope (shard 1/1, 209/209) — not the sampling fast gate.

---

## 4. The expected failure — text differs from the prediction

`node scripts/test-agent-model-resolver.js` → **REAL_EXIT=1** (captured via a redirect, not a pipe).

```
AssertionError [ERR_ASSERTION]: build-error-resolver Claude dispatch tier changed; the declared divergence says sonnet

'opus' !== 'sonnet'

    at Object.<anonymous> (…/scripts/test-agent-model-resolver.js:68:12)
  actual: 'opus',
  expected: 'sonnet',
  operator: 'strictEqual',
```

**SURPRISE — the message is NOT the one the brief predicted.** The brief expected
`"… no longer diverges — delete its CLASS_DIVERGENCE entry instead of leaving it stale"`. That is the
THIRD of three assertions in the divergence branch (line 72-73). The run never reaches it: the FIRST
assertion (line 68) fails, because `CLASS_DIVERGENCE['build-error-resolver'].claude` is the literal
`'sonnet'` and the map now says `'opus'`. Node's `assert` aborts the process on the first failure, so
lines 70 and 72 never execute — and `adversarial-verifier`'s identical trio is never reached either.

The CONCLUSION the brief drew is nonetheless exactly right: the two tables converged, and the fix is
to DELETE both `CLASS_DIVERGENCE` entries (lines 42-51), not to edit a value. I did not touch the file.

**What the test author must remove** (`scripts/test-agent-model-resolver.js`, lines 42-51) — both
entries, and their comments, which also carry the retired "wait budget" justification:

```js
const CLASS_DIVERGENCE = Object.freeze({
  'build-error-resolver': Object.freeze({ claude: 'sonnet', codex: 'reasoning' }),
  'adversarial-verifier': Object.freeze({ claude: 'sonnet', codex: 'reasoning' }),
});
```

Once emptied, each role falls to the `else` branch (line 75) — `model === (pinned ? 'sonnet' : 'opus')`
— which now PASSES, since both roles are in `CODEX_PINNED_REASONING_ROLES` and both resolve to `opus`.
That is the convergence the owner ruling intended. The install-invariant check at lines 87-94
(frontmatter must equal the map) is already satisfied by edits (a) and (b).

---

## 5. UNEXPECTED: a concurrent agent edited `install.sh` in this same worktree

`install.sh` was ABSENT from `git status` at the time of my verification sweep and PRESENT
(`19 ++-----------------`, +2/−17) minutes later. **I never wrote to `install.sh`** — I only read it
(`sed -n`, `grep`). The edit removes `default_agent_model()` and its fallback call, and adds a two-line
comment:

```diff
-default_agent_model() {
-  case "$1" in
-    code-explorer|…|build-error-resolver|code-reviewer|security-reviewer|adversarial-verifier)
-      printf '%s\n' "sonnet"
…
+# The source agent frontmatter is the ONLY model authority for the install. An `inherit`
+# value resolves to empty on purpose: render_command_file drops the whole model= line for it.
 resolve_agent_model_for_install() {
```

A test cannot author that comment; this is another agent's work, almost certainly a sibling mission
item. **I PRESERVED it and did not revert.** I re-verified afterwards that all seven of my files are
untouched by it: the four resolver copies still hash `d5ece634…`, both agent files still read
`model: opus`, and both required checks re-ran green (exit 0).

**Coordination hazard for the orchestrator**: two agents are writing into
`.kw/worktrees/issue-935` concurrently. `git status` there is a shared surface, so any per-agent
"changed-file list is exactly what I intended" check is only valid at the instant it is taken.

Independently, that removal agrees with what I measured before it appeared: `default_agent_model` was
already a near-dead fallback. `resolve_agent_model_for_install` reads the SOURCE FRONTMATTER first and
only falls back when it is empty — and the fallback already CONTRADICTED the resolver for
`code-reviewer` and `security-reviewer` (it said `sonnet`; `DEFAULT_AGENT_MODELS` says `opus`), which
is a divergence that was invisible precisely because the fallback was unreachable for those roles.

---

## 6. Findings for the orchestrator (not fixed — outside the four assigned edits)

**F1 — a SECOND test-custody pin fails, which the brief did not predict.**
`node scripts/test-install-model-rendering.js` → **REAL_EXIT=1**:

```
AssertionError [ERR_ASSERTION]: finalize routed-fix build-error-resolver block should render as sonnet
    at Object.<anonymous> (…/scripts/test-install-model-rendering.js:2945:3)
  actual: false, expected: true
```

Three stale locations in that file (all test-custody, all left untouched by me):
- line 2936-2937 — comment: *"The finalize command carries the sonnet routed-fix (tdd-guide / build-error-resolver)"*
- line 2946 — `finalize.includes('subagent_type="build-error-resolver",\n  model="sonnet",')`
- lines 3029 / 3033 — expectation table entries `'build-error-resolver': 'sonnet'` and `'adversarial-verifier': 'sonnet'` (never reached; the run aborts at 2945)

This failure is GOOD NEWS about the change: it proves the flip reaches the RENDERED command surface
and is not inert. `commands/kaola-workflow-finalize.md:96` carries the placeholder
`model="{BUILD_ERROR_RESOLVER_MODEL}"`, which `install.sh` resolves at install time from the source
frontmatter — so edit (b) propagates to the installed finalize command automatically, with no tracked
surface to regenerate (`generate-routing-surfaces --check`: all 18 surfaces byte-match, exit 0).

**F2 — `README.md` still documents both roles as `standard`.** Lines 152 and 156:

```
| `build-error-resolver` | Write — validation repair when needed | standard |
| `adversarial-verifier` | Read-only falsifier; graph-derived investigation or change gate | standard |
```

Now false. This is a consumer-facing surface and CLAUDE.md requires README updates on user-visible
change, but it is outside the four assigned edits, so I did not touch it. Needs a mission item.

**F3 — a "wait budget" justification survives in live production code, 9 lines above my rewrite.**
`scripts/kaola-workflow-resolve-agent-model.js` lines 18-19 (all four copies):

```
  // These defaults preserve each role's declarative reasoning/wait-budget class. Codex named
  // profiles inherit runtime strength from the parent session; this map never selects a child pair.
```

Edit (d) explicitly forbade re-introducing the wait-budget mechanism claim, and I did not — but this
PRE-EXISTING instance sits in the same map and was not in my scope. If the ruling is that the
mechanism no longer exists anywhere, this line is the same defect the (d) rewrite was ordered to
remove. Flagging, not fixing. (The same phrase also appears at `scripts/test-agent-model-resolver.js`
lines 37 and 45/49 — test custody, and lines 45-49 disappear anyway when F1/§4 deletes the entries.)

---

## 7. Scope statement

I wrote to exactly seven paths, all inside the worktree, plus this report in main's checkout. I did
not commit. I did not edit any test file. I did not revert another agent's `install.sh` edit. I did
not touch `CODEX_PINNED_*_ROLES`, `code-reviewer`, `security-reviewer`, the `metric-optimizer`
comment, or the vendored provenance block.

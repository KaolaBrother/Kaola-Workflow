# Item 5/9 — test custody for the #935 tier flip (A8 + the stale render pins)

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-935` (branch `workflow/issue-935`)
Baseline commit: `254e667f7cddf62abaf3634c2b388e8fedbdfc24` (HEAD), with the #935 production change
present as **uncommitted** working-tree edits (agents frontmatter, 4 resolver copies, `install.sh`,
`generate-reviewer-profiles.js`, `opencode.json`, `docs/opencode-edition.md`, `README.md`).
Nothing was committed. **No production file was touched by me** — test files only.

## Premise check before touching either expectation

Read the production side first, so both expectation changes land on a verified fact, not on whatever
makes the suite green.

| fact | measured |
|---|---|
| `DEFAULT_AGENT_MODELS['build-error-resolver']` | `opus` in all 4 copies (root + 3 plugin editions), line 25 of each |
| `DEFAULT_AGENT_MODELS['adversarial-verifier']` | `opus` in all 4 copies, line 33 of each |
| `agents/build-error-resolver.md:5` | `model: opus` |
| `agents/adversarial-verifier.md:6` | `model: opus` |
| `CODEX_PINNED_REASONING_ROLES` | contains BOTH roles (unchanged); all 4 `kaola-workflow-adaptive-schema.js` copies byte-identical, sha256 `0ac70c1d3fb8ba3e…` |

⇒ The Claude dispatch tier and the Codex declarative class have **converged on reasoning/opus** for
both roles. The declared divergence is genuinely stale; it is not the production change being wrong.

Render path for Task B, read end to end before changing the pin:
`commands/kaola-workflow-finalize.md:96` carries `model="{BUILD_ERROR_RESOLVER_MODEL}"` →
`install.sh:545 model_for_placeholder` → `resolve_agent_model_for_install build-error-resolver` →
`extract_agent_model "$(agent_source_file build-error-resolver)"` →
`agent_source_file` is `"$SOURCE_AGENTS_DIR/$agent.md"` (no profile variant; `agents/profiles/` does
not exist) → reads `agents/build-error-resolver.md` frontmatter = **`opus`**.
The #935 production change also **deleted** `install.sh`'s `default_agent_model()` fallback table
(which hardcoded `sonnet` for both roles); it was only reachable when frontmatter was absent, and
frontmatter is present, so the rendered value comes from the frontmatter either way.

⇒ The rendered finalize block is now `model="opus",`. Verified fact, then the pin was updated.

---

## TASK A — `scripts/test-agent-model-resolver.js`: `CLASS_DIVERGENCE` deleted

### Baseline RED (before my edit)

```
RED: test-agent-model-resolver.js:68 — AssertionError: build-error-resolver Claude dispatch tier
     changed; the declared divergence says sonnet
     'opus' !== 'sonnet'
baseline: 254e667f7cddf62abaf3634c2b388e8fedbdfc24 (+ uncommitted #935 production edits)
```

### What was removed

- the `CLASS_DIVERGENCE` frozen object **and** its explanatory comment block (old `:33-51`);
- the registry-name validation loop over its keys (old `:53-56`);
- the whole `if (declared) { … }` arm including all three of its assertions (old `:65-74`);
- the now-unused `codexClass` local.

The object is **removed, not emptied** — verified: `grep -n "CLASS_DIVERGENCE\|declared\|codexClass"
scripts/test-agent-model-resolver.js` returns **no matches** (exit 1). No dangling reference survives.

The surviving `else` assertion became the single unconditional rule over all 14 roles, and its
message was rewritten: it previously said *"…or declare the divergence in CLASS_DIVERGENCE"*, which
would have named a mechanism that no longer exists.

### Final diff

```diff
-// DECLARED RUNTIME DIVERGENCE (Claude dispatch tier vs Codex declarative class).
+// TOTAL AGREEMENT between the Claude dispatch tier and the Codex declarative class.
 //
-// The two tables answer different questions, and for most roles they answer it identically:
+// The two tables answer different questions:
 //   - DEFAULT_AGENT_MODELS is the Claude DISPATCH TIER — a real `model=` parameter on the spawn.
 //   - CODEX_PINNED_*_ROLES is a Codex DECLARATIVE CLASS — a label and wait-budget default. On Codex
 //     the child inherits the parent session's pair, so the class never selects a model at all.
 //
-// A role appears here ONLY where those two genuinely disagree, with the reason it disagrees. The
-// entry names the class each runtime assigns, so a silent re-tiering on either side fails.
-const CLASS_DIVERGENCE = Object.freeze({
-  // Repair is dispatched hot and often; the Claude tier keeps it standard so a routine build/lint
-  // fix is not billed at the reasoning tier, while Codex labels it reasoning for the longer
-  // non-interrupt wait budget a root-cause hunt may need.
-  'build-error-resolver': Object.freeze({ claude: 'sonnet', codex: 'reasoning' }),
-  // Falsifying ONE recorded claim against ONE named surface is bounded read work, so the Claude
-  // tier is standard; a plan RAISES it per node where the claim warrants it (the post-G1
-  // intent-verifier on a synthesizer merge). Codex labels it reasoning for the wait budget.
-  'adversarial-verifier': Object.freeze({ claude: 'sonnet', codex: 'reasoning' }),
-});
-
-for (const role of Object.keys(CLASS_DIVERGENCE)) {
-  assert.ok(Object.prototype.hasOwnProperty.call(resolver.DEFAULT_AGENT_MODELS, role),
-    `declared class divergence names an unregistered role: ${role}`);
-}
-
+// Every registered role answers them the same way, so this is one unconditional rule over all of
+// them: standard class <-> sonnet, reasoning class <-> opus. A re-tiering on either side alone
+// fails here.
 for (const [role, model] of Object.entries(resolver.DEFAULT_AGENT_MODELS)) {
   assert.ok(model === 'opus' || model === 'sonnet', `${role} must default to reasoning or standard`);
   const pinned = schema.CODEX_PINNED_STANDARD_ROLES.includes(role);
   const reasoning = schema.CODEX_PINNED_REASONING_ROLES.includes(role);
   assert.ok(pinned !== reasoning, `${role} must belong to exactly one Codex profile class`);
-  const codexClass = pinned ? 'standard' : 'reasoning';
-  const declared = CLASS_DIVERGENCE[role];
-  if (declared) {
-    // Bidirectional: a declared divergence must STILL diverge, and must diverge exactly as declared.
-    // A stale entry (the tables re-converged) fails just as loudly as an undeclared one.
-    assert.strictEqual(model, declared.claude,
-      `${role} Claude dispatch tier changed; the declared divergence says ${declared.claude}`);
-    assert.strictEqual(codexClass, declared.codex,
-      `${role} Codex declarative class changed; the declared divergence says ${declared.codex}`);
-    assert.notStrictEqual(model, pinned ? 'sonnet' : 'opus',
-      `${role} no longer diverges — delete its CLASS_DIVERGENCE entry instead of leaving it stale`);
-  } else {
-    assert.strictEqual(model, pinned ? 'sonnet' : 'opus',
-      `${role} declarative tier must match its Codex profile class, or declare the divergence in CLASS_DIVERGENCE`);
-  }
+  assert.strictEqual(model, pinned ? 'sonnet' : 'opus',
+    `${role} declarative tier must match its Codex profile class`);
 }
```

### MUTATION PROOF — the surviving guard is armed

Scratch mirror at
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/bbc1c516-ef3d-40fe-8570-56f6c5fb87b0/scratchpad/mirror`
(`cp -R` of `scripts/ plugins/ agents/`, 11M). **No tracked file was mutated and `git checkout --`
was never used** — each leg was reverted by re-copying the single file from the worktree.

| leg | mutation | exit | assertion |
|---|---|---|---|
| baseline | none | **0** | `Agent model resolver tests passed` |
| mutation 1 | `tdd-guide` moved `CODEX_PINNED_STANDARD_ROLES` → `CODEX_PINNED_REASONING_ROLES` in `scripts/kaola-workflow-adaptive-schema.js`; `DEFAULT_AGENT_MODELS` untouched | **1** | `AssertionError [ERR_ASSERTION]: tdd-guide declarative tier must match its Codex profile class` / `'sonnet' !== 'opus'` at `test-agent-model-resolver.js:48:10` |
| restore | schema re-copied from worktree | **0** | `Agent model resolver tests passed` |
| mutation 2 | `'implementer': 'sonnet'` → `'opus'` in `scripts/kaola-workflow-resolve-agent-model.js`; lists untouched | **1** | `AssertionError [ERR_ASSERTION]: implementer declarative tier must match its Codex profile class` / `'opus' !== 'sonnet'` at `test-agent-model-resolver.js:48:10` |
| restore | resolver re-copied from worktree | **0** | `Agent model resolver tests passed` |

Both one-table-only moves RED and **name the role**. No mutation passed. The bidirectionality the
deleted arm provided is preserved: a move in either table alone breaks the equality.

---

## TASK B — `scripts/test-install-model-rendering.js`: stale `sonnet` pins

### Baseline RED (before my edit)

```
RED: test-install-model-rendering.js:2945 — AssertionError: finalize routed-fix build-error-resolver
     block should render as sonnet   (actual false, expected true)
baseline: 254e667f7cddf62abaf3634c2b388e8fedbdfc24 (+ uncommitted #935 production edits)
```

This red is the wanted signal: the tier flip does reach the **rendered** finalize command rather than
sitting inert in the source frontmatter.

### Complete enumeration of `sonnet` in the file, with a judgement on each

`grep -n "sonnet" scripts/test-install-model-rendering.js` — 14 hits, all judged. This is the whole
file, not just what the aborting run reached.

| line (pre-edit) | site | verdict |
|---|---|---|
| 2936 | comment: *"carries the sonnet routed-fix (tdd-guide / build-error-resolver)"* | **STALE → fixed.** The routed-fix pair is now split. |
| 2938 | `assert(finalize.includes('model="sonnet",'), 'doc-updater should render as sonnet')` | **correct, left alone.** doc-updater is still `sonnet`. (Weak — a bare substring satisfied by tdd-guide too — but not stale; strengthening it is out of scope.) |
| 2946 | `finalize.includes('subagent_type="build-error-resolver",\n  model="sonnet",')` | **STALE → `opus`.** |
| 2947 | message `'…should render as sonnet'` | **STALE → `'…should render as opus'`** (a message contradicting its assertion is its own defect). |
| 2950–2951 | tdd-guide routed-fix block + message | **correct, left alone.** `agents/tdd-guide.md` is still `sonnet`. |
| 2959 | `#610` comment about the `opus/sonnet → reasoning/standard` plan vocabulary | **unrelated, left alone.** |
| 3023 `code-explorer` | EXPECTED_ROLE_MODELS | correct |
| 3024 `knowledge-lookup` | EXPECTED_ROLE_MODELS | correct |
| 3027 `tdd-guide` | EXPECTED_ROLE_MODELS | correct |
| 3028 `implementer` | EXPECTED_ROLE_MODELS | correct |
| 3029 `build-error-resolver: 'sonnet'` | EXPECTED_ROLE_MODELS | **STALE → `opus`.** |
| 3032 `doc-updater` | EXPECTED_ROLE_MODELS | correct |
| 3033 `adversarial-verifier: 'sonnet'` | EXPECTED_ROLE_MODELS | **STALE → `opus`.** |
| 3035 `metric-optimizer` | EXPECTED_ROLE_MODELS | correct |

Nothing else in the file referenced either role (`grep -n "build-error-resolver\|adversarial-verifier"`
returns exactly 2936, 2946, 2947, 2966, 3029, 3033; `:2966` is a role-name list with no tier).

### The judgement call on `EXPECTED_ROLE_MODELS` — flagged deliberately

That table carries an explicit instruction: *"do not 'fix' a failure here by editing this table to
match the resolver"*. I changed two entries anyway, and this is the reasoning, so a reviewer can
overturn it:

- The instruction exists to stop a **silent** re-tier being laundered through the oracle. The
  mechanism it guards (three-step resolution, no install-time model axis, no manifest) is intact.
- This move is not silent: it is an owner ruling recorded in `kaola-workflow/.roadmap/issue-935.md`
  (*"resolves the divergence UPWARD — build-error-resolver and adversarial-verifier become
  reasoning-tier on every runtime … re-affirmed on capability grounds"*).
- Leaving it would have frozen a refuted value into the oracle; a confidently wrong oracle is worse
  than none.
- Its comment claimed the table is *"the exact per-role resolution a default install produced BEFORE
  the axis was removed"* — after the edit that sentence is false for two entries, so I amended the
  comment to name the two moved entries and the ruling behind them. A pin whose prose lies about its
  own provenance is the same defect class as the `should render as sonnet` message.

### Final diff

```diff
-  // The finalize command carries the sonnet routed-fix (tdd-guide / build-error-resolver) and
-  // doc-updater tiers. (Runtime role resolution is proven per role against the resolver below.)
+  // The finalize command carries the routed-fix pair (tdd-guide / build-error-resolver) and the
+  // doc-updater tier. The pair is SPLIT: tdd-guide renders standard, build-error-resolver renders
+  // reasoning. Each placeholder resolves from its own source frontmatter, so the split proves the
+  // render reads the per-role declaration rather than one shared routed-fix tier.
+  // (Runtime role resolution is proven per role against the resolver below.)
   assert(finalize.includes('model="sonnet",'), 'doc-updater should render as sonnet');
@@
-    finalize.includes('subagent_type="build-error-resolver",\n  model="sonnet",'),
-    'finalize routed-fix build-error-resolver block should render as sonnet'
+    finalize.includes('subagent_type="build-error-resolver",\n  model="opus",'),
+    'finalize routed-fix build-error-resolver block should render as opus'
@@
   // THE PINNED TABLE IS THE ACCEPTANCE EVIDENCE, and its required value is FIXED: it is the exact
-  // per-role resolution a default install produced BEFORE the axis was removed. Retiring a selector
-  // must not re-tier a single role, so every entry here is a behavioural pin, not a preference —
-  // the retired default was `--profile=higher`, so the three roles that had a `higher` variant
-  // (code-architect, code-reviewer, security-reviewer) pin to the reasoning tier and every other
-  // role pins to whatever its source frontmatter already declared.
+  // per-role resolution a default install produced BEFORE the axis was removed, carried forward
+  // through every deliberate re-tiering since. Retiring a selector must not re-tier a single role,
+  // so every entry here is a behavioural pin, not a preference — the retired default was
+  // `--profile=higher`, so the three roles that had a `higher` variant (code-architect,
+  // code-reviewer, security-reviewer) pin to the reasoning tier and every other role pins to
+  // whatever its source frontmatter already declared.
+  //
+  // #935 (owner-ruled) moved build-error-resolver and adversarial-verifier from the standard tier
+  // to the reasoning tier, so those two entries carry the ruled value rather than the pre-removal
+  // one. They are the ONLY entries that have moved, and each moved by an explicit ruling — a
+  // decision, never a green-suite convenience.
   //
   // This table is INDEPENDENTLY DERIVED from DEFAULT_AGENT_MODELS — do not "fix" a failure here by
   // editing this table to match the resolver. The two agreeing is the whole assertion; if they
-  // disagree, the resolver moved a role's tier and that is the bug.
+  // disagree with no ruling behind the move, the resolver re-tiered a role and that is the bug.
@@
-    'build-error-resolver': 'sonnet',
+    'build-error-resolver': 'opus',
@@
-    'adversarial-verifier': 'sonnet',
+    'adversarial-verifier': 'opus',
```

Only ONE iteration was needed: after these edits the suite ran to completion. No further stale pin
surfaced downstream of the aborting assertion.

---

## VERIFY — exact output and exit code

```
$ node scripts/test-agent-model-resolver.js
Agent model resolver tests passed
EXIT=0

$ node scripts/test-install-model-rendering.js
Install model rendering tests passed
EXIT=0

$ node scripts/validate-vendored-agents.js
Vendored agent validation passed for 14 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1
EXIT=0

$ node scripts/generate-reviewer-profiles.js --check
Reviewer profile generation check passed.
EXIT=0
```

(The vendored-agent line's SHA is the upstream provenance commit recorded in the vendored agent
files, not this repo's HEAD.)

## SWEEP — other suites made stale by the flip

Method: (1) every file naming `build-error-resolver` or `adversarial-verifier` (127 files,
`.opencode`/`.kimi` named explicitly because this box's `grep` is ugrep and skips dot-dirs), filtered
to those also containing `sonnet` (25); (2) every consumer of `CODEX_PINNED_*`, `DEFAULT_AGENT_MODELS`
or `reasoningRoles`; (3) a regex for any other role→tier literal map (`'<role>': 'opus'|'sonnet'`).

Result of (3): the **only** role→tier table on the test surface anywhere in `scripts/`, `plugins/`,
`.opencode`, `.kimi` is `EXPECTED_ROLE_MODELS`, already fixed. Every other hit is the four production
`DEFAULT_AGENT_MODELS` copies.

Suites run (all read-only against the worktree):

| suite | exit | output |
|---|---|---|
| `scripts/validate-workflow-contracts.js` | 0 | `Workflow contract validation passed` |
| `scripts/validate-kaola-workflow-contracts.js` | 0 | `Kaola-Workflow Codex contract validation passed` |
| `scripts/test-agent-profile-parity.js` | 0 | `agent-profile parity tests passed (792 assertions)` |
| `scripts/test-install-upgrade-rewrite.js` | 0 | `Install upgrade rewrite tests passed` |
| `scripts/test-install-adaptive-config.js` | 0 | `Install adaptive-config tests passed` |
| `scripts/sync-opencode-edition.js --check` | 0 | `14 agent(s) + 3 command(s) + 1 plugin(s) in parity with canonical` |
| `scripts/test-opencode-edition.js` | 0 | `opencode-edition test passed (516 assertions)` [3 trees in parity] |
| `scripts/test-kimi-edition.js` | 0 | `kimi-edition test passed (507 assertions)` [3 trees in parity] |
| `scripts/test-edition-sync.js` | 0 | `edition-sync tests passed (30 assertions)` |

Why each was implicated, and why it stayed green:

- **`test-opencode-edition.js`** — its A8 assertion pins the pinned-override set against
  `sync.reasoningRoles()`, which is **derived at runtime from `agents/*.md` frontmatter**, not
  hardcoded. It moved 5 → 7 automatically. It stayed green only because the concurrent agent's
  `opencode.json` update (A6) had already landed in the worktree — verified in `git diff`
  (`adversarial-verifier` + `build-error-resolver` added to the comment scaffold and the `agent`
  block). Nothing anywhere hardcodes the count "5".
- **`validate-kaola-workflow-contracts.js:435-445`** — compares `CODEX_PINNED_*` across the installer,
  preflight and schema copies. Those lists are unchanged by #935, so it is unaffected by construction.
- **`test-agent-profile-parity.js`** — touches `adversarial-verifier` only for its behavior-contract
  discovery-closure section and its file-set list; it carries no tier literal for either role.
- **`test-install-upgrade-rewrite.js:108`** — its `model: sonnet` pin is on a **`tdd-guide`** fixture
  deliberately hand-modified by the test, not a flipped role.
- **`test-install-adaptive-config.js:184,196`** — pins `implementer` → `sonnet` and a `contractor`
  fixture; neither role moved.
- The three edition contract validators' `sonnet` hits are all **token-leak** rules (`{opus|sonnet}`
  set literals, `model: opus`/`model: sonnet` effort-map tokens, the `` `opus`/`sonnet` `` legacy-alias
  mention) — no per-role tier is encoded in any of them.

## NOT RUN / NOT VERIFIED

- `node scripts/simulate-workflow-walkthrough.js` at FULL scope — **not run** (excluded by the brief;
  a later item).
- The four chains / `npm test` / `run-chains.js` — **not run** (excluded by the brief). Every edition
  is touched by #935, so a claude-only receipt will not qualify at release.
- The rest of the `test:kaola-workflow:claude` roster beyond the nine suites tabled above — not run;
  the sweep found no tier literal in them, but that is a grep-backed hypothesis for the ones I did not
  execute, not a measurement.
- **A10 (live-spawn read-back)** — cannot be done from here: it requires a reinstall and a live spawn
  per runtime to read the EFFECTIVE model/effort back. Everything above proves only *authored and
  rendered* bytes.
- The concurrent agent's `opencode.json` / `docs/opencode-edition.md` edits were **read** (to explain
  why the opencode suite is green) and **not touched**.

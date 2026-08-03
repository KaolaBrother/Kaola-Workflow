# Premise check: issue #927 code anchors (Kaola-Workflow repo, read-only)

Commit measured: `c39381748ad80cc09afbc42ac07ff4f65ff18012` (main, clean tree).
All line numbers below are live `Read`/`grep` results against that commit, not recollection.
`grep` on this box is ugrep and skips dot-directories — `.opencode`/`.kimi` paths were named
explicitly wherever a dot-directory needed searching.

---

## 1. `CONTRACT_EFFORT_TABLE` shape — CONFIRMED

`scripts/kaola-workflow-adaptive-schema.js:144-161`:

```js
const CONTRACT_EFFORT_TABLE = Object.freeze({
  anthropic: Object.freeze({
    top:    { variant: 'max',  options: { thinking: { type: 'enabled', budgetTokens: 32000 } } },
    second: { variant: 'high', options: { thinking: { type: 'enabled', budgetTokens: 16000 } } },
  }),
  openai: Object.freeze({
    top:    { variant: 'xhigh', options: { reasoningEffort: 'xhigh' } },
    second: { variant: 'high',  options: { reasoningEffort: 'high' } },
  }),
  google: Object.freeze({
    top:    { variant: 'high', options: { reasoningEffort: 'high' } },
    second: { variant: 'low',  options: { reasoningEffort: 'low' } },
  }),
  default: Object.freeze({
    top:    { variant: 'high',   options: { reasoningEffort: 'high' } },
    second: { variant: 'medium', options: { reasoningEffort: 'medium' } },
  }),
});
```

- Keyed by **4 contracts**: `anthropic`, `openai`, `google`, `default`.
- Per contract, exactly **2 tier keys**: `top` and `second` — the issue's names are the real
  names, confirmed verbatim (also declared at `:139`: `const TIER_RANK = Object.freeze({
  reasoning: 'top', standard: 'second' })` and documented at `:141-142`: `Each entry: { top:
  {variant, options}, second: {variant, options} }`).
- Each `{top,second}` cell is exactly `{ variant, options }` — the `options` payload the issue
  wants to start emitting into the opencode config **already exists**, has existed since at
  least the `#544` contract-keying migration cited in the comment block at `:119-138`, and is
  already read today by `effortForProvider()`/`mapTier()` (`:179-194`) — just not written to the
  opencode config's `agent.<role>` key.

## 2. `sync-opencode-edition.js` emits `agent.<role>.variant`, no `model` — CONFIRMED (path-qualified)

`scripts/sync-opencode-edition.js:669-674` (inside `renderAdaptiveConfig`, the function the file's
own comment at `:608-610` calls "the locked-in install default"):

```js
669:  lines.push('  "agent": {');
670:  for (let i = 0; i < entries.length; i++) {
671:    const comma = i < entries.length - 1 ? ',' : '';
672:    lines.push('    "' + entries[i][0] + '": { "variant": "' + entries[i][1] + '" }' + comma);
673:  }
674:  lines.push('  }');
```

Line **672** is the exact emit site the issue names, byte-exact. It emits `{ "variant": "<name>"
}` per role and nothing else — no `model` key anywhere in this function.

Qualification the issue's own next_step already implies but is worth stating precisely: this
"no model key" fact holds for `renderAdaptiveConfig` (the default/adaptive path,
`CONTRACT_EFFORT_TABLE`-driven). A **separate** function, `renderNeutralConfig`
(`:679-738`), is a different, opt-in code path (fires only when `KAOLA_OPENCODE_STANDARD_MODEL`
/ `KAOLA_OPENCODE_REASONING_MODEL` env vars are set) that emits `{ "model": "<pin>" }` per
reasoning-tier role at `:724`/`:732`. That path carries no `variant`/`options` at all and is
untouched by this issue's proposal — noted so the fix does not accidentally touch it.

## 3. Prose at ~:641 and ~:651 — CONFIRMED, both quotes verbatim

`scripts/sync-opencode-edition.js:640-643`:
```
640:  lines.push('  // Kaola-Workflow · opencode edition — TWO tiers as reasoning-EFFORT variants of your');
641:  lines.push('  // inherited model ' + parsed.providerId + '/' + parsed.modelId + ' (NO model is pinned — both tiers');
642:  lines.push('  // inherit the model you are already using in opencode). The effort KNOB is set by your');
643:  lines.push('  // provider\'s API CONTRACT (' + contractLabel + '; knob: ' + knobDescription + '), keyed by');
```
Rendered sentence (spans :641-642): *"inherited model \<provider\>/\<model\> (NO model is pinned
— both tiers inherit the model you are already using in opencode)."* — line **641** is the exact
line carrying "NO model is pinned — both tiers", matching the issue's quote.

`scripts/sync-opencode-edition.js:650-651`:
```
650:  lines.push('  // ⚠ SWITCHING YOUR OPENCODE MODEL? Variant definitions are model-scoped');
651:  lines.push('  // (provider.<id>.models.<model>.variants.*) — opencode applies them from this file, with');
```
Line **651** carries "opencode applies them from this file", matching the issue's quote verbatim.
Per the design doc (item 9 below), this line is the mechanism claim asserted **false** —
opencode's `TaskTool`/`SessionPrompt` coupling means variant is only honoured when a `model` is
also pinned, which this generator deliberately never does, so "applies them from this file" does
not hold for the inheriting (no-model) case this generator targets.

## 4. `provider.*.variants` block at ~:657-668 — CONFIRMED to exist at that exact range; "only consumer" claim CONFIRMED within this repo

`scripts/sync-opencode-edition.js:657-668`:
```js
657:  lines.push('  "provider": {');
658:  lines.push('    "' + parsed.providerId + '": {');
659:  lines.push('      "models": {');
660:  lines.push('        "' + parsed.modelId + '": {');
661:  lines.push('          "variants": {');
662:  lines.push('            "' + profile.top.variant + '": ' + JSON.stringify(profile.top.options) + ',');
663:  lines.push('            "' + profile.second.variant + '": ' + JSON.stringify(profile.second.options));
664:  lines.push('          }');
665:  lines.push('        }');
666:  lines.push('      }');
667:  lines.push('    }');
668:  lines.push('  },');
```
Byte-exact match to the claimed `:657-668` range.

Readers of the emitted `provider.*.models.*.variants` block, found via `grep -rn "variants"` /
`grep -rn "\.variant\b"` across `scripts/`, `plugins/`, `.opencode/`, and template sources:
- **Producer**: `sync-opencode-edition.js` itself (writes the block, and separately writes
  `agent.<role>.variant` referencing the variant *names* defined in that block).
- **Consumer #1 (external, not in this repo)**: opencode's own runtime, via
  `agent.<role>.variant` → `provider.<id>.models.<model>.variants.<name>` lookup. This is the
  mechanism the design doc (item 9) says is broken for the no-`model` case.
- **Consumer #2 (test, not production)**: `scripts/test-opencode-edition.js` (`:685-762`)
  asserts the shape of the generator's own output — `glm.provider[...].models[...].variants.max`,
  `.variants.high`, `oai.provider.openai.models['gpt-5'].variants`, etc. This is a test of the
  producer, not an independent production consumer.

No other script in this repo (`kaola-workflow-claim.js`, `kaola-workflow-sink-merge.js`,
`kaola-workflow-run-chains.js`, the plugin hooks file, any `plugins/*/scripts/*`) reads or writes
`provider.*.variants` or `agent.<role>.variant`. **Within this repo's own code**, the claim holds:
if tiers move to `options`, the `provider.*.variants` block and every `agent.<role>.variant`
emission become dead — nothing else here reads them. (Whether opencode's *own* binary has an
independent consumer of `provider.*.variants` outside the `agent.<role>.variant` lookup path is
outside this repo and outside this investigator's premise-check scope — that is exactly what the
sibling investigation `kaola-workflow/issue-927/.cache/premise-opencode-mechanism.md` was
dispatched to check, per the mission list.)

## 5. `reasoningRoles()` / `standardTierRoles()` — CONFIRMED, exact names/locations, exact role sets measured by direct invocation

Locations, `scripts/sync-opencode-edition.js`:
- `reasoningRoles()` — defined `:542-551`.
- `topTierRoles()` — defined `:569-571`, delegates: `return reasoningRoles();`.
- `standardTierRoles()` — defined `:573-576`, is `listCanonAgents()` minus `topTierRoles()`.

`reasoningRoles()` reads each canonical agent's frontmatter `model:` value from `agents/*.md`
(`CANON_AGENTS_DIR = path.join(REPO, 'agents')`, `:76`) via `roleTier()` (`:167-169`: `opus` →
`'reasoning'`, everything else → `'standard'`), filters to `tier === 'reasoning'`, sorts.

Ran directly (`node -e "require('./scripts/sync-opencode-edition.js').reasoningRoles()"` etc.) to
avoid trusting a grep of frontmatter:

```
reasoningRoles():     ["code-architect","code-reviewer","planner","security-reviewer","synthesizer"]
topTierRoles():       ["code-architect","code-reviewer","planner","security-reviewer","synthesizer"]
standardTierRoles():  ["adversarial-verifier","build-error-resolver","code-explorer","doc-updater",
                        "implementer","investigator","knowledge-lookup","metric-optimizer","tdd-guide"]
```

Cross-checked against `agents/*.md` frontmatter `model:` directly — 5 roles are `opus`
(code-architect, code-reviewer, planner, security-reviewer, synthesizer), the other 9 are
`sonnet` — the two measurements agree exactly. This matches the in-code comment at
`sync-opencode-edition.js:561-563` verbatim ("Both spellings yield the same five roles:
code-architect, code-reviewer, planner, security-reviewer, synthesizer").

These two functions are confirmed as the single source: `topTierRoles()` is a pure delegate to
`reasoningRoles()` with no independent logic, and `standardTierRoles()` is defined purely as its
complement over `listCanonAgents()` — there is no other place in this file (or elsewhere in
`scripts/`) that assigns roles to tiers.

## 6. `plugins/kaola-workflow-hooks.js` — PARTIAL (path is not where issue's literal string points; content/shape CONFIRMED)

The literal path `plugins/kaola-workflow-hooks.js` **does not exist** at the repo root.
`/Users/ylpromax5/Workspace/Kaola-Workflow/plugins/` exists but holds unrelated content — Claude
Code plugin-marketplace trees (`plugins/kaola-workflow/`, `plugins/kaola-workflow-gitea/`), not
opencode hooks.

Real locations (all byte-identical, confirmed with `diff`, exit 0):
- **Hand-written canonical source**: `templates/opencode/plugins/kaola-workflow-hooks.js`. Its own
  header comment (`:1`) says `// .opencode/plugins/kaola-workflow-hooks.js`, and
  `sync-opencode-edition.js:107-112` states explicitly: *"Opencode plugin scripts (byte-copied
  from tracked templates/opencode/plugins/ into the opencode edition). The tracked template is the
  canonical source of truth; `.opencode/plugins/` is the gitignored generated artifact. byte-copy
  (no rendering) mirrors writeHooks()."*
- **Generated/deployed copies** (gitignored, byte-copy of the template — NOT templated
  substitution): `.opencode/plugins/kaola-workflow-hooks.js`, `.opencode-gitea/plugins/kaola-workflow-hooks.js`,
  `.opencode-gitlab/plugins/kaola-workflow-hooks.js`.

**This is generated, not hand-written, at every path except `templates/opencode/plugins/
kaola-workflow-hooks.js`.** Any new `chat.params` hook must edit the template source, never a
rendered `.opencode*/plugins/` copy — editing a rendered surface is forbidden by this repo's own
rules (`CLAUDE.md`: "Prose changes propagate to generated surfaces... edit the skeleton and
regenerate, never a rendered surface").

Export shape and `(input, output)` signature, read from `templates/opencode/plugins/
kaola-workflow-hooks.js:120-152`:

```js
export default async function KaolaWorkflowHooks({ directory, worktree }) {
  const root = findRoot(worktree || directory);
  return {
    "tool.execute.before": async (input, output) => {
      const tool = input && input.tool;
      const args = (output && output.args) || {};
      // ... reads input.sessionID / input.callID / input.tool; reads output.args
    },
    "experimental.session.compacting": async (_input, output) => {
      // ... reads/writes output.context (an array)
    },
  };
}
```

Convention: the plugin's default export is an async factory taking `{ directory, worktree }` and
returning an object keyed by opencode hook-point name, each value an `async (input, output) => {}`
function. `input` carries call metadata (`tool`, `sessionID`, `callID`); `output` carries the
mutable per-call payload the hook may read/write (`args` for `tool.execute.before`, `context` for
the compaction hook). A `chat.params` hook would follow the identical `(input, output)` shape —
consistent with the design doc's own sketch (item 9 below), which threads `input.agent` /
`input.provider.id` and writes `output.options`.

## 7. Installer warning "SWITCHED YOUR OPENCODE MODEL" — PARTIAL (right file/function, wrong exact casing)

Found at `install-opencode.sh:433`, inside `seed_config()` (function starts `:413`):

```
433:  echo "  ⚠ Switched your opencode model? Re-run with KAOLA_OPENCODE_INHERIT_MODEL=<provider>/<model>"
```

The warning exists at the right file and inside the right function, but the **literal string is
not all-caps** — it reads `"Switched your opencode model?"` (sentence case with a trailing `?`),
not `"SWITCHED YOUR OPENCODE MODEL"`. `grep -i` (case-insensitive) is required to find it; a
case-sensitive grep for the issue's exact casing returns nothing. Design doc
`docs/investigations/2026-08-03-opencode-inherited-effort-tiers-design.md:144` independently
paraphrases it as **`⚠ SWITCHED YOUR OPENCODE MODEL?`** (also not a verbatim match to the
installer's actual string, though closer — it keeps the `?`). Anyone editing this string should
read the actual line (`:433`), not either paraphrase.

## 8. `install-opencode.sh` `seed_config` — CONFIRMED

`install-opencode.sh:413-419`:
```bash
413:seed_config() {
...
415:  local cfg="$dest_root/opencode.json"
416:  if [[ -f "$cfg" ]]; then
417:    echo "Preserved existing $cfg (your model choices are kept)."
418:    return
419:  fi
```
Exact logic: if `opencode.json` already exists at the destination, `seed_config` echoes a
"preserved" message and returns immediately — it never calls the generator in that branch. Only
when the file is **absent** does it fall through (`:429`) to
`node "$SCRIPT_DIR/scripts/sync-opencode-edition.js" --write-config-to "$cfg" --adapt`. This
confirms the issue's "Settle the secondary defect" item verbatim: an existing config is never
regenerated, so it can silently drift from the current 14-role roster.

## 9. `docs/investigations/2026-08-03-opencode-inherited-effort-tiers-design.md` — EXISTS, CONFIRMED

File exists (`docs/investigations/2026-08-03-opencode-inherited-effort-tiers-design.md`, 193
lines, `Status: design only. Nothing in this document is applied.`).

What it specifies that the roadmap issue body (`kaola-workflow/.roadmap/issue-927.md`) does
**not** — chiefly, code anchors into the **opencode binary itself** (not this repo):

1. Names the exact coupling that makes `variant` inert without a pinned `model`, quoting opencode
   1.18.11 source: `TaskTool.execute`: `variant: b.model ? void 0 : q` — `b.variant` is read only
   when no `model` is pinned is FALSE; it is read only WHEN a model IS pinned (the doc's table
   states the inverse coupling precisely — variant is suppressed unless a model is pinned).
2. `SessionPrompt.prompt`: `Q = U.model && <model matches>` — agent variant is reachable only
   through a lookup gated on `Q`, i.e. also gated on a pinned model.
3. The `chat.params` merge order it asserts opencode uses: `d = merge(merge(merge(providerOptions,
   model.options), agent.options), variantOptions)` → `plugin.trigger("chat.params", …, {
   ..., options: d })` — this is the mechanism the proposed Layer 2 hook would hook into.
4. TaskTool's subagent model-inheritance fallback: `R = b.model ?? {parent modelID, providerID}`.
5. A concrete Layer 1 (`options` instead of `variant`, `provider.*.variants` goes dead) and Layer
   2 (a `chat.params` hook + `effort-tiers.json` sidecar, resolving contract per-call) design,
   with example JSON/JS payloads.
6. An evidence table of 7 live probes against opencode 1.18.11 / `zhipuai-coding-plan/glm-5.2`,
   recorded in `opencode.db`, including the load-bearing subagent pair (rows 6-7: two subagents
   inheriting one parent model, `options` unpinned, running at measurably different
   `tokens_reasoning`).

The roadmap issue body is a compressed directive (the `next_step:` field) that references these
conclusions but carries none of the opencode-binary code anchors itself — those live only in the
design doc. (Verifying anchors 1-4 above against the actual installed opencode binary on this box
is outside this repo and was the explicit scope of the sibling dispatch,
`kaola-workflow/issue-927/.cache/premise-opencode-mechanism.md`, per the mission list.)

## 10. opencode edition's own test suite — CONFIRMED, command and current `variant` assertions identified

Exact command, from `package.json:45`:
```
"test:kaola-workflow:editions": "node scripts/test-opencode-edition.js && node scripts/test-kimi-edition.js"
```
This is **absent** from `npm test` (`package.json:38`, which runs only
`test:kaola-workflow:claude`, `:codex`, `:gitlab`, `:gitea`) — confirms the issue's framing that
opencode is an additive edition with its own suite, not part of the four-chain run.

Test file covering the generated opencode config: `scripts/test-opencode-edition.js` (1843
lines). The relevant block is `A12` (`:659-762`, "adaptive effort tiers (the locked-in install
default)"), plus the contract-resolver block `S1-contract` immediately after it.

What A12 currently asserts about `variant` (all still `variant`-based, none anticipate `options`
at the agent level or a "no model key" invariant):
```
685: assert(glm.provider['zhipuai-coding-plan'].models['glm-5.2'].variants.max
       && glm.provider['zhipuai-coding-plan'].models['glm-5.2'].variants.high, ...)
710: assert(glmProfile.top.variant === 'max' && glmProfile.second.variant === 'high', ...)
740: assert(glm.agent[role].variant === 'max', 'A12[' + role + ']: top-tier role → max variant');
743: assert(glm.agent[role].variant === 'high', 'A12[' + role + ']: standard-tier role → high variant');
748: assert(Object.keys(oai.provider.openai.models['gpt-5'].variants).sort().join('/') === 'high/xhigh', ...)
750: assert(oai.agent.planner.variant === 'xhigh' && oai.agent.implementer.variant === 'high', ...)
758: assert(unk.provider.acme.models['unknown-model'].variants.high
       && unk.provider.acme.models['unknown-model'].variants.medium, ...)
761: assert(unk.agent.planner.variant === 'high' && unk.agent.implementer.variant === 'medium', ...)
```
Every current agent-level assertion in A12 reads `agent[role].variant`. None currently read
`agent[role].options`, and none currently assert the absence of `agent[role].model` in this path.
Under this repo's test-custody rule ("whoever implements a behaviour does not author its tests"),
these are exactly the assertions a `tdd-guide` pass would need to flip/replace to `options`-based
assertions (plus add a new "no `model` key on any role" assertion and a "`variant` key gone"
assertion) before an implementer could turn them red-then-green, per the mission list's row 3
acceptance criteria (options payload emitted per tier, no `model` key on any role, `variant` gone
rather than left beside `options`, sidecar tier map single-sourced from the role helpers).

Note: a **different**, non-adaptive test at `:654` (`assert(pinned.agent[role].model === 'test/reas', ...)`)
covers the opt-in model-pin path (`renderNeutralConfig`), not the adaptive/effort-variant path —
do not confuse the two when scoping the new/changed assertions.

---

## Summary table

| # | Claim | Verdict |
|---|---|---|
| 1 | `CONTRACT_EFFORT_TABLE` shape `{variant,options}`, tier keys `top`/`second` | CONFIRMED |
| 2 | `:672` emits `agent.<role>.variant`, no `model` | CONFIRMED (scoped to `renderAdaptiveConfig`; a separate opt-in path, `renderNeutralConfig`, does emit `model`) |
| 3 | Prose at `:641` and `:651` | CONFIRMED, both verbatim |
| 4 | `provider.*.variants` block at `:657-668`, only consumer is variant tiering | CONFIRMED (byte-exact range; sole consumers found in-repo are the emitter itself, opencode's runtime lookup, and the test that asserts the emitter's own shape) |
| 5 | `reasoningRoles()`/`standardTierRoles()` single source, exact role sets | CONFIRMED (verified by direct invocation, not just reading) |
| 6 | `plugins/kaola-workflow-hooks.js` exists, `tool.execute.before`, `(input,output)` shape | PARTIAL — that literal path does not exist; real hand-written source is `templates/opencode/plugins/kaola-workflow-hooks.js`, deployed (byte-copied, not templated) to `.opencode*/plugins/kaola-workflow-hooks.js`. Content/shape claims CONFIRMED. |
| 7 | Installer warning "SWITCHED YOUR OPENCODE MODEL" | PARTIAL — right file (`install-opencode.sh:433`) and function (`seed_config`), but actual string is `"Switched your opencode model?"` (not all-caps) |
| 8 | `seed_config` preserves existing `opencode.json`, never regenerates | CONFIRMED |
| 9 | Design doc exists; specifies opencode-binary anchors the issue body lacks | CONFIRMED |
| 10 | opencode edition's own suite, command, current `variant` assertions | CONFIRMED |

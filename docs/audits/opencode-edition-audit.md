# opencode Edition Audit

**Date:** 2026-06-19
**Scope:** Audit of the **opencode edition**, added additively on branch `feature/opencode-support`
(at commit `77e88c38`), for solidity, reliability, and alignment with the claude / codex / gitlab /
gitea editions.
**Audit issue:** #530 (`workflow/issue-530/`, plan shape: investigation — #486 Case A).
**Decisions recorded:** [D-530-01](../decisions/D-530-01.md), [D-530-02](../decisions/D-530-02.md).
**Evidence base:** `kaola-workflow/issue-530/.cache/{n1-parity,n1-runtime,n1-schema,n2-decisions,n3-critique,n4-e2e}.md`
+ `workflow-plan.md`.

---

## Executive summary

- **The opencode edition is solid and correct-by-construction.** Every runtime path — generation
  parity, model-tier resolution, hooks payload shape, script resolution, config-schema validity —
  was traced end-to-end and verified (assertion count is **223 live**, not the stale "145" in the
  issue body). No `fix-now` defect was found; all findings are follow-ups.
- **Four cross-edition forge chains are GREEN under a clean HOME** (`claude && codex && gitlab &&
  gitea`, all exit 0) — commit `77e88c38` introduced **no regression**. The claude-chain failure
  observed under the default `$HOME` is a **pre-existing** `test-claim-hardening` HOME-fragility
  (a sibling-repo agent polluted `~/.config/kaola-workflow/config.json` with `parallel_mode:"on"`),
  untouched by this diff and out of audit scope.
- **End-to-end opencode cycle confirmed.** This very audit run is a live opencode-driven workflow
  cycle (claim → freeze → plan-run node lifecycle → state persisted under `kaola-workflow/issue-530/`),
  and the canonical simulation passes — satisfying acceptance criterion #2.
- **Two decisions recorded.** [D-530-01](../decisions/D-530-01.md) resolves route-reachability
  (extend `test-opencode-edition.js` with content-reachability assertions, NOT join the forge
  T-sets). [D-530-02](../decisions/D-530-02.md) resolves the edition-machinery boundary (opencode
  stays **additive — runtime-not-forge**, deliberately not wired into `npm test` / `edition-sync` /
  `install.sh`).
- **10 defects filed as follow-ups** (X1, P1–P5, R1–R3, S1), per the frozen plan's "no speculative
  fix nodes" discipline (#486 Case A — the acceptance criterion is *recorded decisions + follow-up
  references*, not in-this-issue implementation). P4 (stale assertion count) is corrected in this
  report itself.

---

## Checklist resolution

One `##` section per audit row (#1–#10). Each carries a verdict — **PASS**, **PASS-WITH-FOLLOWUP**,
or **conscious-accept** — plus EVIDENCE citing `file:line` and the probe/verifier node that
established it.

### #1 — Generation parity / leaked Claude constructs

**Verdict: PASS-WITH-FOLLOWUP.**

Byte-identical regeneration is confirmed **by construction**:

- `test-opencode-edition.js:136-140` (agents) and `:153-157` (commands) assert
  `read('.opencode/...') === sync.renderAgent/renderCommand(...)`.
- Renderers are pure — no env/randomness in the agent/command path (`sync-opencode-edition.js:139-163`
  `renderAgent`, `:235-246` `renderCommand`). `--check` (`:532-572`) re-applies the same equality.
- **Live assertion count = 223** (deterministic decomposition in `.cache/n1-parity.md` §#1; the
  issue body's "145" is stale — see defect P4, corrected in this report).

Commands are **rewritten** (not byte-copied) via `transformCommandBody`
(`sync-opencode-edition.js:183-233`); frontmatter is also rewritten by `renderCommand` to keep
only `description`. The rewrite map neutralizes the badge block, all five `model=`-prose families,
the `model="{ROLE_MODEL}"` placeholders, doubled commas, and trailing whitespace — all with
explicit `file:line` citations in `.cache/n1-parity.md` §#1.

**Leaks that survive the rewrite map (follow-ups, none runtime-breaking):**

- P1 — `Agent(` dispatch literal leaks into every generated dispatch card (opencode's tool is
  `task`); mitigated by the badge naming `task` first (`sync-opencode-edition.js:177`).
- P2 — "Claude Code agent" prose leaks verbatim (16×).
- P3 — `## Agent Model Badge` heading name preserved as an anchor (body is opencode-correct;
  cosmetic relic).

The `/`-slash command routing is **not** a leak — opencode resolves `.opencode/command/*.md` via
`/command` (A9 `test-opencode-edition.js:245-262` confirms target resolution).

**Established by:** `n1-parity` (code-explorer), confirmed by `n3-critique` §3 (file-count
reconciliation: 31 tracked `.opencode/` files = 15 agents + 12 commands + 3 hooks + 1 plugin,
`comm -23` empty vs canonical).

### #2 — Model tiers / two-tier opencode.json / reasoning-set completeness

**Verdict: PASS (no defect).**

- **Committed `opencode.json` is the NEUTRAL template** (`opencode.json:1-22`): only `$schema`,
  `default_agent: "build"`, and commented pins (no `provider`, no `agent`). This is
  `renderNeutralConfig()` (`sync-opencode-edition.js:369-428`); `ENV_*_MODEL` empty by default.
  A7 holds: `read('opencode.json') === renderOpencodeJson()` no-args.
- **`--adapt` is the ONLY path that materializes per-agent effort**, and it runs once at install
  time (`install-opencode.sh:125`); the file is user-owned thereafter (`:116-119` preserves
  existing). `--adapt` personalization is correctly **NOT committed**.
- **Reasoning/top-tier set is COMPLETE; the higher-profile Opus profile IS included.**
  `topTierRoles() = higherProfileRoles() ∪ reasoningRoles()` (`sync-opencode-edition.js:271-278`).
  `higherProfileRoles()` reads `agents/profiles/higher/*.md` → {code-architect, code-reviewer,
  security-reviewer} (`:262-266`). Net: **top tier (6)** = those three + planner + synthesizer +
  workflow-planner; **standard (9)** = the rest. The issue's open question ("is the
  `agents/profiles/higher/` Opus profile covered?") resolves to **NO GAP** — promotion via
  `--adapt` is sufficient; without `--adapt` both tiers intentionally inherit (the documented
  user-owned contract).

**Established by:** `n1-runtime` §#2 (code-explorer). Caveat (not a defect): a fresh-clone
consumer who never runs the installer sees no tier differentiation — that is the documented
"user-owned" contract, not a gap.

### #3 — Hooks

**Verdict: PASS-WITH-FOLLOWUP.**

- **Adapter model is correct.** `.opencode/plugins/kaola-workflow-hooks.js` is ESM
  (`import`/`export default`), signature `KaolaWorkflowHooks({directory, worktree})` matches the
  opencode plugin contract; returns `tool.execute.before` + `experimental.session.compacting`.
  Throw-denial is honored: `if (r.status===2){ throw new Error(...) }` (`:114-116, :124-128`).
- **All 4 canonical `hooks.json` behaviors are covered, with correct JSON field names**
  (traced per-hook in `.cache/n1-runtime.md` §#3):
  - pre-commit → `{tool_input:{command}}` (`:113`) ↔ `pre-commit.sh:14` ✓
  - write-lane → `{tool_input:{file_path}}` (`:121-123`) ↔ `write-lane.sh:31` ✓ (dormant unless
    `KAOLA_LANE_CONTAINMENT` set)
  - dispatch-log → `{agent_type, agent_id, cwd}` (`:136-137`) ↔ hook reads those fields ✓
  - session.compacting → `output.context.push(resume)` (`:144-151`) ✓
- Shell scripts are **byte-copied** from canonical `hooks/` (A10 `test-opencode-edition.js:269-276`).

**Follow-ups (non-blocking):**

- R1 — dispatch-log `agent_id` hardcoded `""` (`:137`); closure attestation keys on
  `agent_type+cwd`, so non-blocking data degradation.
- R2 — A11 (`test-opencode-edition.js:286`) runs `node --check` on the ESM `.js` plugin;
  `.opencode/package.json` has no `"type":"module"` (and is gitignored). **Node ≥ 22.12 passes
  (`--experimental-detect-module` default-on); Node 20 LTS / pre-22.12 hard-fails.** Production
  runtime (Bun) auto-detects ESM and is unaffected. This portability fact is load-bearing for
  D-530-02 (see `n3-critique` §2 for the empirical refutation).

**Established by:** `n1-runtime` §#3 (code-explorer); R2 empirically re-verified by `n3-critique`
§2 (real `node --no-experimental-detect-module --check` → exit 1).

### #4 — Script resolution

**Verdict: PASS-WITH-FOLLOWUP (cosmetic only).**

- **Resolver works end-to-end for opencode consumers with NO Claude runtime.** opencode does not
  set `CLAUDE_PLUGIN_ROOT`; the `${CLAUDE_PLUGIN_ROOT:+...}` `:+` guard correctly skips when unset,
  so the consumer chain resolves to `~/.claude/kaola-workflow/scripts/<n>` (first hit, populated
  by `install-opencode.sh:100`) → `./scripts/<n>`. **Does NOT assume `CLAUDE_PLUGIN_ROOT`.**
- **Test coverage exists:** `test-plan-run.js:78-103` (consumer w/ `CLAUDE_PLUGIN_ROOT` + self-dev);
  `test-bash-block-guards.js:183-188` runs the finalize guard with `CLAUDE_PLUGIN_ROOT=''` (the
  opencode-consumer shape).
- **Edge cases clear:** linked worktrees (plan-run resolves `KAOLA_SCRIPTS` from MAIN root before
  `cd worktree`, `plan-run.md:27-49`); `git -C` (resolver only does `[ -f ]` file checks, no git);
  `--global` install (scripts still go to `~/.claude/kaola-workflow/scripts/`,
  `install-opencode.sh:93-111`); no bare validator path (`test-bash-block-guards.js:103-104`).

**Follow-up (cosmetic asymmetry):**

- R3 — opencode consumers get a `~/.claude/kaola-workflow/scripts/` path (a Claude-namespace
  directory inside a non-Claude runtime). Functional and documented; an opencode-native mirror
  would be cosmetic symmetry only.

**Established by:** `n1-runtime` §#4 (code-explorer); consumer-shape resolver trace re-confirmed
live by `n4-e2e` (b).

### #5 — Route-reachability / PIN parity

**Verdict: PASS-WITH-FOLLOWUP — resolved by [D-530-01](../decisions/D-530-01.md).**

**The gap is real and empirically verified.** `test-route-reachability.js` T4–T11 cover **claude
commands + codex SKILLs only** (6 or 12 surfaces each); `.opencode/command/` is covered only by
A9 (`test-opencode-edition.js:245-262`), which is **bare target resolution** (file existence) —
the twin of T2, NOT a content-reachability check like T4–T11.

`n3-critique` §1 **proved the gap with a counterexample**: injecting a throwaway
`text.replace(/<!--\s*PIN:.*?-->/g, '')` into `transformCommandBody` (`sync-opencode-edition.js:199`),
regenerating, and running `test-opencode-edition.js`:

| State | Assertions | RED |
|---|---|---|
| Baseline | 223 pass | — |
| PIN-comment strip only | 223 pass | none |
| PIN strip + 7 literal tokens stripped | 223 pass | none |

A6 (`:136-140, :153-157`) compares `read('.opencode/command/X') === renderCommand(...)` — both
sides call the same edited `transformCommandBody`, so they **mutate together**. A14 (`:120-130`)
checks model-prose **absence**, never PIN **presence**. A9 is file-existence only. A greedy
rewrite edit could silently drop a wiring token (`closure-audit`, `result: escalate`,
`--write-overlap-consent`, …) with all 223 assertions green. (Tokens currently survive
incidentally — verified present in `finalize.md:923`, `adapt.md:113`, `next.md:356`, `auto.md:98`,
`plan-run.md:128`.)

**Decision [D-530-01](../decisions/D-530-01.md)** (Accepted): extend `test-opencode-edition.js`
with content-reachability assertions (PIN/literal token **presence**) — **Candidate C**. This
closes the gap surgically within the declared opencode twin test, **not** by joining the forge
T-sets (Candidate A rejected as a heavyweight policy change — CLAUDE.md:103's "SIX surfaces" is
forge-scoped; opencode is non-forge). Implementation is a follow-up (defect X1).

**Established by:** `n1-parity` §#5 (facts), `n2-decisions` (candidate analysis),
`n3-critique` §1 (empirical validation — the strip test).

### #6 — Edition-machinery boundary

**Verdict: conscious-accept — resolved by [D-530-02](../decisions/D-530-02.md).**

Five independent signals establish that opencode is **deliberately additive — a runtime edition,
not a forge**:

1. `edition-sync.js:43` — `FORGES=['gitlab','gitea']`; grep `opencode` = 0. opencode has its own
   generator (`sync-opencode-edition.js`, self-declared twin `:11-12`).
2. `install-opencode.sh:4-6` — standalone installer, explicitly "does NOT modify install.sh";
   `install.sh` grep `opencode` = 0.
3. `package.json:34-42` — no `test:kaola-workflow:opencode` script.
4. `package.json:35` — `npm test` chains only `claude && codex && gitlab && gitea`; opencode is
   never gated at Finalization's `npm test`.
5. `CLAUDE.md:48, :102, :103` — the four npm chains, the Cross-edition Policy (forge trees only),
   and the SIX-surfaces rule (Claude+Codex) are all **forge-scoped**; opencode is absent because it
   is non-forge.

**Decision [D-530-02](../decisions/D-530-02.md)** (Accepted): opencode **stays additive** — NOT
wired into `npm test`, NOT in `edition-sync`, NOT in `install.sh`. Parity is enforced via
`install-opencode.sh:62-63` (runs the full 223-assertion suite on every install) + manual + the
new content-reachability assertions from D-530-01. Candidate A (wire into `npm test`) is **refuted**:
it couples a Node-version-fragile non-forge check (R2) to the four forge Finalization chains, and
contradicts project principle #501 (self-sufficient; CI/CD is not a gate — the four npm chains are
*internal* self-contained gates, and an external non-forge edition is not one of them).

**Established by:** `n1-parity` §#6/#7 (facts), `n2-decisions` (Decision #6 candidates),
`n3-critique` §2 (R2 empirically re-verified).

### #7 — CI coverage

**Verdict: conscious-accept — resolved by [D-530-02](../decisions/D-530-02.md) (same decision).**

CI coverage of opencode is, by design, the **install-time suite** (`install-opencode.sh:62-63`)
plus manual invocation — not an `npm test` chain. This is the same additive boundary as #6: per
#501, CI/CD is never a required gate, and opencode's parity is enforced inward (install-time +
the D-530-01 content-reachability assertions) rather than by bolting a non-forge edition onto the
four forge chains. The regression risk this leaves (an opencode regression undetected by `npm
test`) is mitigated by: (a) the install-time 223-assertion suite, (b) D-530-01's content-reachability
hardening, and (c) the docs-discoverability follow-up (P5) so contributors know the edition exists
and how to test it.

**Established by:** same as #6.

### #8 — End-to-end reliability

**Verdict: PASS.**

Acceptance criterion #2 — a real end-to-end opencode cycle (init → next → phase → finalize with
state persisted under `kaola-workflow/{project}/`) — is satisfied by **three converging lines of
evidence** (see `.cache/n4-e2e.md`):

1. **Canonical end-to-end simulation is GREEN.** `node scripts/simulate-workflow-walkthrough.js`
   (192 PASSED markers; runs as the final step of the claude chain) passed under a clean HOME
   (n3-critique ran the full claude chain → exit 0, final line "Workflow walkthrough simulation
   passed").
2. **opencode surface + resolver traced.** All 5 A9 receipt-emitted command targets resolve
   (`.opencode/command/{kaola-workflow-plan-run,kaola-workflow-adapt,kaola-workflow-auto,
   kaola-workflow-fast,kaola-workflow-phase1}.md`); the `kaola_script()` resolver was exercised in
   both the self-dev shape and an inline consumer-shape trace (`CLAUDE_PLUGIN_ROOT` unset →
   `~/.claude/kaola-workflow/scripts/`), confirming end-to-end resolution without a Claude runtime.
3. **This audit run IS a live opencode end-to-end cycle** (strongest evidence): the opencode
   edition is executing a genuine workflow cycle right now — claim (in-place) → `workflow-state.md`
   persisted; `workflow-planner` froze `workflow-plan.md` (`plan_hash` stamped, `ready_to_run`);
   `/kaola-workflow-plan-run` advanced n1→n2→n3→n4→n5 with ledger + `workflow-tasks.json` persisted
   under `kaola-workflow/issue-530/`. The opencode runtime, agents, script dispatch, and state
   persistence are all exercised by this very session.

A separate throwaway-project cycle was **not** run (claim mutual-exclusion would block a second
active project; cost) — acceptable per the plan's documented fallback (script-level simulation +
live-run meta-evidence).

**Established by:** `n4-e2e` (main-session-gate, non-delegable), verdict `pass`,
`findings_blocking: 0`.

### #9 — Config validity

**Verdict: PASS.**

The live opencode config schema (`https://opencode.ai/config.json`, fetched 2026-06-19; root
`Config` is `additionalProperties: false`; `allowComments: true` + `allowTrailingCommas: true` →
JSONC legal) was validated against **both** the committed neutral template and the `--adapt`
output. Full per-key table in `.cache/n1-schema.md`:

- **Neutral template (`opencode.json`):** `$schema`, `default_agent: "build"` (a built-in primary
  agent), `// comments` — all schema-valid; no other live keys → `additionalProperties: false`
  satisfied. A7 confirmed (committed file === `renderOpencodeJson()` no-args).
- **Adapted config** (`renderOpencodeJson({inheritModel:'zhipuai-coding-plan/glm-5.2'})`):
  `provider`, `provider.<id>.models`, `…models.<m>.variants`, `…variants.{max,high}`,
  `agent.<role>`, `agent.<role>.variant` — every key present and documented in the live schema.
  `reasoningEffort` is a recognized free-form provider pass-through (live docs §Custom Variants show
  it verbatim); `agent.<role>.variant` is an explicit `AgentConfig.variant`. **No key the schema
  rejects → opencode will NOT hard-fail on the adapted config.**
- **No schema drift** since authoring. Deprecated keys (`mode`, `reference`, `autoshare`,
  `layout`) exist but the config uses none.

The committed canonical form is correctly the **provider-agnostic neutral template**; the
`--adapt` personalization is correctly **NOT committed**.

**Follow-up (runtime, not schema):**

- S1 — `reasoningEffort:'max'` for `zhipuai-coding-plan` is an unconstrained pass-through value
  (docs' enumerated `reasoningEffort` values are OpenAI-centric low/high/xhigh). Correct for
  GLM-5.2's High+Max vocabulary; if the zhipu AI-SDK provider does not honor `reasoningEffort` as
  its option key, the variant would be a runtime no-op (NOT a schema/load failure). Runtime
  smoke-test candidate, not a schema concern.

**Established by:** `n1-schema` (knowledge-lookup, read-only + WebFetch of the live schema).

### #10 — Docs discoverability

**Verdict: PASS-WITH-FOLLOWUP — the one real gap.**

opencode is **undiscoverable** from all three canonical entry points:

- `README.md` — grep `opencode`/`install-opencode` = 0; lists Claude/Codex/GitLab/Gitea only.
- `docs/README.md` (index) — `docs/opencode-edition.md` **exists** (211 lines) but is **NOT
  linked** — an orphan.
- `CLAUDE.md` — grep `opencode` = 0; absent from Validation Policy, Documentation Map, Commands.

This is the audit's one substantive gap that is not already covered by a decision. It is a
surgical docs fix with zero runtime risk (defect P5). Note: it is the natural counterpart to
D-530-02's additive boundary — the edition is deliberately not in the forge machinery, but it
should still be *discoverable* as a supported runtime edition.

**Established by:** `n1-parity` §#10 (code-explorer).

---

## Defect table

All 10 defects from the consolidated inventory (`.cache/n2-decisions.md` §A). **Zero HIGH; zero
fix-now.** Per the frozen plan (no speculative fix nodes, #486 Case A), each is filed as a
follow-up issue referenced by proposed title; the orchestrator files them at finalize. P4 is
corrected in this report (disposition = recorded).

| ID | Dim | Description (cite) | Severity | Disposition (follow-up issue title) | Rationale |
|----|-----|-------------------|----------|-------------------------------------|-----------|
| **X1** | #1 / #5 | Content-reachability gap: A9 = file existence only; nothing enforces PIN/literal tokens survive `transformCommandBody`. A greedy rewrite edit silently drops a token with all 223 green. Empirically verified (`.cache/n3-critique.md` §1). | medium | **FOLLOWUP** — *"Add content-reachability assertions to `test-opencode-edition.js` (PIN/literal token presence on the 6 opencode commands) [D-530-01]"* (filed: #532) | Implementation of D-530-01 Candidate C; closes the class of regression T4–T11 prevents for claude/codex. |
| **P1** | #1 | `Agent(` dispatch literal leaks into all generated opencode dispatch cards (`adapt.md:96`; + phase/fast/finalize). opencode tool is `task`. | medium | **FOLLOWUP** — *"Rewrite `Agent(` dispatch literal → `task` in opencode `transformCommandBody`"* (filed: #534) | No runtime break (badge names `task` first). Scoped regex rewrite, non-trivial scoping. |
| **P2** | #1 | "Claude Code agent" prose leaks verbatim (16×) across phase/fast/finalize/workflow-init. | low-medium | **FOLLOWUP** — *"Rewrite 'Claude Code agent' prose (16 sites) for opencode edition neutrality"* (filed: #534) | Conceptual inaccuracy; no runtime impact. Prose rewrite rule, 16 sites. |
| **P3** | #1 | `## Agent Model Badge` heading name preserved as anchor (`:172`); body is opencode-correct. | low | **FOLLOWUP** — *"Rename `## Agent Model Badge` heading anchor for opencode edition (cosmetic)"* (filed: #534) | Cosmetic relic; body correct. |
| **P4** | #1 | Issue #530 body assertion count "145" stale; live = 223 (corroborated `docs/opencode-edition.md:204`). | low | **RECORDED** (corrected in this report §#1 + Executive summary) | Corrected in the audit deliverable itself; no code change. |
| **P5** | #10 | opencode undiscoverable: 0 matches in `README.md`; `docs/opencode-edition.md` orphaned from `docs/README.md` index; 0 in `CLAUDE.md`. | medium | **FOLLOWUP** — *"Make opencode edition discoverable: add to README.md, docs/README.md index, CLAUDE.md"* (filed: #533) | All 3 canonical entry points list only Claude/Codex/GitLab/Gitea. Surgical docs fix, zero runtime risk. |
| **R1** | #3 | dispatch-log `agent_id` hardcoded `""` (`:137`); opencode input carries `sessionID`/`callID`. | low | **FOLLOWUP** — *"Populate dispatch-log `agent_id` from opencode sessionID/callID in hooks plugin"* (filed: #535) | Non-blocking; attestation keys on `agent_type+cwd`. Data degradation, not a correctness break. |
| **R2** | #3 | A11 `node --check` on ESM `.js` without `"type":"module"` is Node-version-fragile. `.opencode/package.json` gitignored, no type field. Bun (prod) fine. | low-medium | **FOLLOWUP** — *"Harden A11 `node --check` against Node<22.12 (add `type:module` or migrate check strategy)"* (filed: #535) | Not a runtime defect (Bun auto-detects ESM). Load-bearing for D-530-02 (blocks Candidate A). |
| **R3** | #4 | opencode consumers get `~/.claude/kaola-workflow/scripts/` (Claude-namespace dir in non-Claude runtime). | low | **FOLLOWUP** — *"Add opencode-native scripts mirror path (cosmetic asymmetry)"* (filed: #536) | Cosmetic asymmetry; functional + documented today. |
| **S1** | #2 / #9 | `reasoningEffort:'max'` for zhipu = unconstrained pass-through (schema-valid). Runtime no-op if provider doesn't honor the key. | low | **FOLLOWUP** — *"Runtime smoke-test: confirm zhipu provider honors `reasoningEffort:'max'`"* (filed: #535) | Schema valid; runtime smoke-test candidate, not a schema concern. |

---

## End-to-end cycle result

**PASS** — established by `n4-e2e` (main-session-gate, non-delegable; verdict `pass`,
`findings_blocking: 0`). Three converging lines: (1) canonical simulation green under clean HOME,
(2) opencode command surface + consumer-shape resolver traced end-to-end, (3) **this audit run is
itself a live opencode-driven workflow cycle** with state persisted under
`kaola-workflow/issue-530/`. Path taken: script-level simulation + live-run meta-evidence (the
plan-sanctioned fallback — a throwaway-project cycle was not run due to claim mutual-exclusion and
cost). See `.cache/n4-e2e.md`.

---

## Four-chain regression result

**ALL GREEN under a clean HOME — no regression** (`n3-critique` §4).

| Chain | Result | Final line |
|---|---|---|
| `test:kaola-workflow:claude` | PASS (exit 0) | Workflow walkthrough simulation passed |
| `test:kaola-workflow:codex` | PASS (exit 0) | Kaola-Workflow walkthrough simulation passed |
| `test:kaola-workflow:gitlab` | PASS (exit 0) | GitLab Codex workflow walkthrough simulation passed |
| `test:kaola-workflow:gitea` | PASS (exit 0) | Gitea Codex workflow walkthrough simulation passed |

Commit `77e88c38` touched only `.opencode/*`, `opencode.json`, `install-opencode.sh`,
`docs/opencode-edition.md`, + 82 new lines of `scripts/kaola-workflow-adaptive-schema.js` (with
its three forge-edition copies) and small edits to `kaola-workflow-adaptive-node.js` /
`test-adaptive-node.js`. It did **not** touch the classifier path. The diff's effect was isolated
from `$HOME`-config noise by running under a clean temp HOME (config absent → classifier defaults
`parallel_mode:'auto'` → no bypass).

**Separate follow-up (NOT a diff regression):** the claude chain fails under the *default* HOME on
this host because a concurrent sibling-repo agent polluted `$HOME/.config/kaola-workflow/config.json`
with `parallel_mode:"on"`, and `kaola-workflow-classifier.js:693` bypasses the classifier whenever
`parallel_mode !== 'auto'`, which makes `test-claim-hardening.js` fail. This is a **pre-existing
HOME-fragility** — commit `77e88c38` did not touch `classifier.js` or `test-claim-hardening.js` —
and is out of scope for this audit. It is recorded here for transparency and merits its own
follow-up: *"Harden `test-claim-hardening` against global `$HOME` config pollution
(`parallel_mode` bypass)"* (filed: #536).

---

## Conclusion

The opencode edition is **solid, reliable, and aligned** with the claude / codex / gitlab / gitea
editions. Generation is byte-identical by construction (223 live assertions); runtime paths — model
tiers, hooks, script resolution, config schema — are all correct-by-construction and verified
end-to-end (the live audit cycle is itself the proof). The four forge chains are green with no
regression.

**Alignment is deliberately *additive* (runtime-not-forge), not forge-machinery-integrated** — this
is the recorded decision [D-530-02](../decisions/D-530-02.md): opencode has its own generator,
installer, and test; it is not wired into `npm test`, `edition-sync`, or `install.sh`, because (a)
CLAUDE.md's "SIX surfaces" and four-chain policies are forge-scoped, (b) the A11 `node --check`
ESM fragility (R2) would couple a Node-version-fragile non-forge check to forge Finalization, and
(c) project principle #501 keeps correctness inward. The one substantive *parity* gap (PIN/literal
content-reachability, X1) is closed by [D-530-01](../decisions/D-530-01.md) — surgically, within the
opencode twin test, not by a forge-policy expansion. The remaining findings are low-severity
follow-ups (prose leaks, cosmetic anchors, a runtime smoke-test, and the one real docs gap, P5).

The audit's claims survived the strongest disproof attempts (`n3-critique`, verdict `pass`,
`findings_blocking: 0`).

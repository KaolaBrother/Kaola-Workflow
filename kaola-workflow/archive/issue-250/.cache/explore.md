# Node `explore` evidence — issue #250 (`implementer` role) edit-point map

Read-only discovery by code-explorer. This is the sole input for the implement nodes.

## T1 — Validator Sets ×4 (ALL BYTE-IDENTICAL today, lines 46–54)

Files:
- `scripts/kaola-workflow-plan-validator.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js`  (must stay BYTE-IDENTICAL to root — validate-script-sync)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js` (renamed fns, same Set membership)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js` (renamed fns, same Set membership)

Current (identical in all four):
```js
const CANONICAL_ROLES = [
  'code-explorer', 'docs-lookup', 'planner', 'code-architect', 'tdd-guide',
  'build-error-resolver', 'code-reviewer', 'security-reviewer', 'doc-updater',
  'adversarial-verifier',
];
const WRITE_ROLES = new Set(['tdd-guide', 'build-error-resolver', 'doc-updater', 'security-reviewer']);
const IMPLEMENT_ROLES = new Set(['tdd-guide', 'build-error-resolver']);
```
Edits (apply identically to all 4; keep root+github byte-identical):
- CANONICAL_ROLES: append `'implementer'`.
- WRITE_ROLES: add `'implementer'`.
- IMPLEMENT_ROLES: add `'implementer'`  ← **CRITICAL / LOAD-BEARING** (G1 post-dominance computed over this set; miss = unreviewed code).
- Comment near line 43–45 references the role count ("nine"/"ten") — update wording for consistency (apply identically to root+github to preserve byte-identity).

## T2 — Post-dominance test seam: `scripts/simulate-workflow-walkthrough.js`

Helper `validatePlanFixture(tmp, nodesRows, labels)` at L800–808 builds a plan + runs the validator `--json`.
In-grammar/auto-run assert pattern (L814–820) and G1-refusal pattern (L832–839) shown below.
Add INSIDE `testAdaptiveValidatorGovernance` try-block (after existing asserts ~L839–858, before finally):
```js
// implementer in-grammar (code-reviewer post-dominates) -> auto-run
v = validatePlanFixture(tmp, [
  '| explore | code-explorer | — | — | 1 | sequence |',
  '| impl | implementer | explore | lib/foo.js | 1 | sequence |',
  '| review | code-reviewer | impl | — | 1 | sequence |',
  '| done | finalize | review | — | 1 | sequence |',
], []);
assert(v.result === 'in-grammar' && v.decision === 'auto-run', 'implementer node with code-reviewer must be in-grammar+auto-run, got: ' + JSON.stringify(v));
// implementer G1 fires when code-reviewer removed
v = validatePlanFixture(tmp, [
  '| impl | implementer | — | lib/foo.js | 1 | sequence |',
  '| doc | doc-updater | impl | — | 1 | sequence |',
  '| done | finalize | doc | — | 1 | sequence |',
], []);
assert(v.result === 'refuse' && /G1/.test((v.errors||[]).join(';')), 'implementer without code-reviewer post-dominance must refuse (G1), got: ' + JSON.stringify(v));
```
(Verify the exact G1 error token by running the validator on the refusal fixture; adjust the `/G1/` match to whatever the validator emits — RED first, then GREEN.)

## T3 — Model resolver ×4 (BYTE-IDENTICAL, DEFAULT_AGENT_MODELS L8–21)

Files: `scripts/kaola-workflow-resolve-agent-model.js` + 3 `plugins/*/scripts/kaola-workflow-resolve-agent-model.js`.
Insert `'implementer': 'sonnet',` immediately after the `'tdd-guide': 'sonnet',` line. Apply identically to all 4 (byte-identity enforced).

## T4 — install.sh / uninstall.sh

`install.sh`:
- `REQUIRED_AGENTS` (L40): append `"implementer"` (place after `"tdd-guide"` to match CANONICAL order).
- `default_agent_model()` (~L408–420, L410): add `implementer` to the sonnet pipe-list beside `tdd-guide`.
- `model_for_placeholder()` (~L453–467): add line `IMPLEMENTER_MODEL) resolve_agent_model_for_install implementer ;;` beside the TDD_GUIDE_MODEL line.
- `render_command_file()` placeholders array (~L506–518): add `IMPLEMENTER_MODEL` after `TDD_GUIDE_MODEL`.
- `.kaola-workflow-agent-manifest`: `emit_agent_model_manifest()` (~L473) iterates REQUIRED_AGENTS — no separate edit once REQUIRED_AGENTS + resolver updated.

`uninstall.sh`: `REQUIRED_AGENTS` (L8) — append `"implementer"` (uninstall enumerates by name + confirms via managed marker).

## T5 — Agent profiles (NEW files)

`implementer` is LOCALLY-AUTHORED (like adversarial-verifier/contractor/workflow-planner) → local-agent format, NO upstream/source-commit/sha lines. Model `agents/implementer.md` on `agents/workflow-planner.md` (a local agent), NOT on tdd-guide.md (which is vendored with provenance).
Required `agents/implementer.md` frontmatter + body:
- `---` front matter at byte 0: `name: implementer`, `description: ...`, `tools: ["Read","Write","Edit","Bash","Grep"]`, `model: sonnet`.
- managed marker block `<!-- kaola-workflow-managed-agent: true ... -->` (local form; see workflow-planner.md).
- Prompt Defense Baseline block (copy from tdd-guide.md/workflow-planner.md).
- Charter (issue #250): "Implementation of changes with no natural failing-unit-test — refactors, scaffolding, config/IaC, UI, migrations, glue — verified by a change-type-appropriate check (regression-green, build-green, or executable smoke/integration), never a ceremonial failing test, never ordinary new behavioral logic (that stays tdd-guide). Record `non_tdd_reason`. Evidence → kaola-workflow/{project}/.cache/{node-id}.md."
- validate-vendored-agents asserts (local): front matter @byte0, `name: implementer`, `model:` set, managed marker. No provenance.

TOML editions — ALL FOUR BYTE-IDENTICAL to each other (clone `tdd-guide.toml`, swap tdd-guide→implementer text):
- `plugins/kaola-workflow/agents/implementer.toml`
- `plugins/kaola-workflow-gitlab/agents/implementer.toml`
- `plugins/kaola-workflow-gitea/agents/implementer.toml`
- `.codex/agents/kaola-workflow/implementer.toml`
tdd-guide.toml template (17 lines): `model_reasoning_effort = "medium"` + `developer_instructions = """..."""` describing the role, output contract, and `kaola-workflow/{project}/.cache/...md` save target. Rewrite the body for implementer's change-type-appropriate verification (no RED→GREEN).

## T6 — config/agents.toml ×3 (BYTE-IDENTICAL)

Files: `plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/config/agents.toml`.
`[agents.tdd-guide]` block (L24–27) is the template. Insert `[agents.implementer]` block after it (before `[agents.build-error-resolver]`):
```toml
[agents.implementer]
description = "Kaola-Workflow for Codex adaptive implementer: implements work without test-first ceremony (refactors, scaffolding, config, UI, migrations), verified by change-type-appropriate checks."
config_file = "./agents/kaola-workflow/implementer.toml"
nickname_candidates = ["Implementer", "Builder", "Executor"]
```
Apply identical block to all 3.

## T7 — validate-vendored-agents localAgents (L25–29)

`scripts/validate-vendored-agents.js`: add `'implementer'` to the `localAgents` array (keep alpha-ish order: after 'contractor', before 'workflow-planner'). ONLY edit in this file. `allAgents` union + `actualAgents` dir-scan auto-include it.

## T8 — Planner-heuristic + RED→GREEN evidence-rule prose

Heuristic (issue #250 fences): default tdd-guide; pick implementer only for enumerated non-test-first category + record `non_tdd_reason`; asymmetric tie-breaker (if a meaningful failing unit test CAN be written → tdd-guide; doubt → tdd-guide); "hard to test" is NOT an implementer reason; bug fixes always tdd-guide; mixed node → split or route to stricter (tdd-guide).

- `commands/kaola-workflow-adapt.md`: `## Shaping guidance` (L133) — add implementer bullet; "Free" enumeration (L65) mentions tdd-guide → add implementer.
- `commands/kaola-workflow-plan-run.md`: tdd-guide dispatch block (L144–156) uses `model="{TDD_GUIDE_MODEL}"`, `subagent_type="tdd-guide"` — add an analogous implementer dispatch block (`{IMPLEMENTER_MODEL}`, `subagent_type="implementer"`) after it; extend the contractor commit-bracket evidence check (~L198–202: "a tdd-guide node cannot transition to complete without both RED and GREEN") to add: an `implementer` node requires change-type-appropriate verification evidence (+ recorded `non_tdd_reason`) in place of RED→GREEN.
- `plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md`: shaping guidance (L74); "Free" line (L48). Same as adapt.md.
- `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md`: contractor step-3 RED→GREEN sentence (L98), barrier (L103), post-dominance note (L125) — extend for implementer.
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md` (shaping L131, Free L63, example L108/109) — same.
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md` — same structure/lines.
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md` (L144–156, L202, ~L198) — same as root.
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md` — same.
- `agents/workflow-planner.md`: shaping paragraph (L70–73, gates G1/G2) — add tdd-guide-vs-implementer choice sentence.
- `plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/agents/workflow-planner.toml`: Codex `developer_instructions` body — add same implementer guidance note.

NOTE: root commands and gitlab/gitea commands are SEPARATE editions (root = Claude, github = skills, gitlab/gitea = commands). They are NOT byte-identity-enforced for these prose files (validate-workflow-contracts only checks token presence on root commands + the kaola-workflow-next skill parity), so per-edition phrasing is fine but keep the SUBSTANCE identical across editions.

## T9 — docs/api.md + README.md

`docs/api.md`: Grammar paragraph at L197 — "the ten canonical roles" → "the eleven canonical roles"; the G1 line already says "implement roles" generically (no list to extend). No per-role table exists; add implementer to the role enumeration prose if present.
`README.md`: agent table (L105–118) — add row after tdd-guide: `| `implementer` | 4 — Execute (implementation without test-first ceremony; refactors, scaffolding, config, UI, migrations) | Sonnet | |`. Badge Sonnet list (L163) — add `implementer`.

## Cross-cutting correctness
- The single silent-miss to guard: implementer in CANONICAL+WRITE but NOT IMPLEMENT_ROLES → G1 won't fire for implementer nodes. T2 test is the proof.
- Gates (run by review node, not the per-node barrier): `validate-script-sync.js`, `validate-vendored-agents.js`, `simulate-workflow-walkthrough.js`, `npm test`, `install.sh --dry-run` (default+higher).
- Reduction: correctness ⇔ `implementer ∈ IMPLEMENT_ROLES ∩ WRITE_ROLES ∩ CANONICAL_ROLES` in all 4 validators.

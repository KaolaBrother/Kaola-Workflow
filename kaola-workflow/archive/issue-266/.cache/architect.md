# architect — implementation blueprint for issue #266 (code-architect, read-only)

Codex harness hardening: native dispatch text, hard role-profile preflight, durable
task mirror, Codex-native compact/resume hook. Grounded in source reads of
`validate-script-sync.js`, `kaola-workflow-plan-validator.js`, the 3 contract validators,
`install.sh`, `install-codex-agent-profiles.js`, the compact-context hook, and the
`next-action.js`/`commit-node.js`/`adaptive-node.js` edition ports.

## ⚠️ HEADLINE FINDING (drives D1, D3, D7)

The frozen plan declares `kaola-workflow-codex-preflight.js` and
`kaola-workflow-task-mirror.js` as **byte-identical across all 4 trees** (4 base-named
copies + COMMON_SCRIPTS). That is **structurally impossible for any script that
`require()`s the plan-validator's parse helpers**, and `task-mirror` MUST reuse them
(D3, explore §8). Evidence:

- `next-action.js`, `commit-node.js`, `adaptive-node.js` are in **COMMON_SCRIPTS** (a
  TWO-tree claude↔codex check, `validate-script-sync.js:10-11,39-60`). Their gitlab/gitea
  copies are **EDITION-NAMED ports** (`kaola-gitlab-workflow-next-action.js`) whose
  `require` line is DIFFERENT:
  `require('./kaola-gitlab-workflow-plan-validator')` (verified: gitlab line 22, gitea
  line 22, adaptive-node gitlab line 246). They are NOT byte-identical ×4.
- The TRUE 4-tree byte-identical scripts (`adaptive-schema`, `closure-contract`,
  `resolve-agent-model`) live in **BYTE_IDENTICAL_GROUPS** and `require()` NOTHING
  edition-specific (`adaptive-schema` has zero `require()`).
- `parseNodes`/`parseLedger` in the validator call `classifier.sectionBody` +
  `classifier.parseWriteSetCell` (plan-validator lines 123, 140, 160). The classifier is
  base-named in claude/codex but **edition-named** in gitlab/gitea
  (`kaola-gitlab-workflow-classifier.js`). So reuse transitively pulls the edition-named
  classifier through the edition-named validator.

CONCLUSION: `task-mirror` follows the **COMMON_SCRIPTS + edition-named-port** pattern of
`next-action.js`, NOT the BYTE_IDENTICAL_GROUPS pattern. Two of its four copies
(gitlab, gitea) are edition-NAMED with a one-line `require` swap and are NOT byte-synced.
The frozen `task-mirror` write set (4 base-named identical paths) is WRONG for gitlab/gitea
and needs a plan-repair-via-`--freeze` BEFORE the node runs (D7). `preflight` has the same
issue IF it reuses the validator; it can be written WITHOUT reusing it (it reads
`.codex/config.toml` + role profiles, not the ledger parse) and so CAN stay true 4-tree
byte-identical — but only if authored require-free. See D1/D4.

---

## Architecture: Codex harness hardening (#266)

### Design Decisions

- **D-PATTERN: two distinct cross-tree shapes.** "Shared script" in this repo means ONE
  of two things, never freely interchangeable: (1) **true 4-tree byte-identical**
  (BYTE_IDENTICAL_GROUPS, require-free of edition code) — e.g. `adaptive-schema`; or
  (2) **COMMON_SCRIPTS 2-tree (claude↔codex) byte-identical + edition-named gitlab/gitea
  ports** that swap their `require` of the classifier/validator — e.g. `next-action`.
  A script that reuses `parseNodes`/`parseLedger` is forced into shape (2).
- **D-PREFLIGHT-PURE:** write `kaola-workflow-codex-preflight.js` to NOT `require()` the
  validator/classifier (it only needs `fs`, `path`, and a tiny inline TOML-block scan), so
  it qualifies for shape (1) true 4-tree byte-identical — minimizing edition surface.
- **D-MIRROR-PORTED:** `kaola-workflow-task-mirror.js` reuses the validator helpers ⇒
  shape (2): base-named in claude+codex (byte-identical, COMMON_SCRIPTS), edition-named in
  gitlab+gitea with the one-line classifier/validator require swap.
- **D-HOOK-EDITION:** the compact/resume hook follows the existing compact-context
  edition-named ×3 pattern (codex / gitlab / gitea), NOT byte-synced, NOT in
  validate-script-sync. Registration is the genuine unknown — resolved in D2.

---

## D1. preflight + task-mirror — shared-byte-identical vs edition-named

**Forge-neutrality confirmed.** Both scripts read only local artifacts — `.codex/config.toml`,
`.codex/agents/kaola-workflow/*.toml`, the frozen `workflow-plan.md` (`## Nodes`, `## Node
Ledger`, `plan_hash`). NO forge API. So they are forge-neutral in BEHAVIOR. But "forge-neutral
behavior" ≠ "byte-identical bytes": `task-mirror`'s reuse of the edition-named classifier (via
the validator) makes its bytes edition-specific in gitlab/gitea.

### preflight — TRUE 4-tree byte-identical (shape 1)

- Author it **require-free of edition code** (only `fs`/`path` + an inline managed-block
  scanner). Then it is byte-identical in all 4 trees.
- File paths (4 copies, all base-named, byte-identical):
  - `scripts/kaola-workflow-codex-preflight.js`
  - `plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js`
  - `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js`
  - `plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js`
- `validate-script-sync.js` edits: add `'kaola-workflow-codex-preflight.js'` to
  **COMMON_SCRIPTS** (2-tree guard) **AND** add a new **BYTE_IDENTICAL_GROUPS** entry
  listing all 4 paths (the explore §2 finding — COMMON_SCRIPTS alone is INCOMPLETE because
  it never checks gitlab/gitea). Matches the frozen `preflight` write set exactly (it owns
  `scripts/validate-script-sync.js`).

### task-mirror — COMMON_SCRIPTS + edition-named ports (shape 2)

- Reuses `parseNodes`/`parseLedger`/`readStoredHash` (D3). Therefore:
  - **claude + codex copies are BYTE-IDENTICAL and base-named**, require
    `./kaola-workflow-plan-validator`:
    - `scripts/kaola-workflow-task-mirror.js`
    - `plugins/kaola-workflow/scripts/kaola-workflow-task-mirror.js`
  - **gitlab + gitea copies are EDITION-NAMED ports**, require
    `./kaola-{forge}-workflow-plan-validator` (one-line swap, NOT byte-identical):
    - `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-task-mirror.js`
    - `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-task-mirror.js`
- `validate-script-sync.js` edits: add `'kaola-workflow-task-mirror.js'` to
  **COMMON_SCRIPTS** ONLY (the claude↔codex base-named pair). Do **NOT** add a 4-path
  BYTE_IDENTICAL_GROUPS entry for task-mirror — the gitlab/gitea copies are deliberately
  divergent (exactly how next-action/commit-node are handled: COMMON_SCRIPTS entry, no
  4-tree group).

**SEQUENCING resolution (explore §2 + the open concern).** `validate-script-sync.js` runs
inside `npm test` but NOT inside the per-node Phase-6 `--barrier-check`. The per-node
barrier only checks exact-path write-set coverage. So:

- The COMMON_SCRIPTS guard fails only when a base-named script exists in `scripts/` (claude)
  but not in `plugins/kaola-workflow/scripts/` (codex) or they differ. Both new scripts'
  base-named copies are created TOGETHER inside their own node, so within a node each base
  pair is consistent.
- The DANGER is the BYTE_IDENTICAL_GROUPS entry for preflight: if `preflight` registers a
  4-path group but its node write set creates all 4 copies in the SAME node, the group is
  satisfied at node end. The `preflight` frozen write set already lists all 4 preflight
  copies + `validate-script-sync.js` ⇒ self-consistent. GOOD.
- For task-mirror: its COMMON_SCRIPTS allowlist edit lives in `validate-script-sync.js`,
  which is **owned by the `preflight` node, NOT the task-mirror node** (the plan batches
  BOTH sync-allowlist edits into preflight on purpose — Per-node intent, task-mirror bullet).
  This is CORRECT and must be preserved: `preflight` adds BOTH the preflight COMMON_SCRIPTS
  entry + its 4-path group AND the task-mirror COMMON_SCRIPTS entry, up front.
  - ⚠️ BUT: a COMMON_SCRIPTS entry for `kaola-workflow-task-mirror.js` added in `preflight`
    references a file that does NOT yet exist (task-mirror runs AFTER preflight). At the
    `preflight` node's own Phase-6 barrier this is fine (the barrier doesn't run npm test).
    But if ANY intermediate full `npm test` is run between `preflight` and `task-mirror`
    completion, `validate-script-sync.js` will report task-mirror as a MISSING file and
    exit 1. RESOLUTION: do NOT run a full `npm test` mid-spine between those two nodes; the
    per-node barrier is the only gate that runs per node, and it ignores
    `validate-script-sync.js`. End-state consistency at the final Phase-6 / finalize is what
    governs. This matches explore §2 / the plan's "end-state consistency at Phase-6 is what
    matters." (If the orchestrator wants strict monotonic greenness, swap the order: register
    each script's COMMON_SCRIPTS entry in the SAME node that creates the script. That would
    move the task-mirror COMMON_SCRIPTS edit OUT of preflight INTO task-mirror — see D7 for
    the explicit move + plan-repair note.)

**D1 file-move verdict (explicit):** The frozen `task-mirror` write set
(`scripts/...`, `plugins/kaola-workflow/scripts/...`,
`plugins/kaola-workflow-gitlab/scripts/kaola-workflow-task-mirror.js`,
`plugins/kaola-workflow-gitea/scripts/kaola-workflow-task-mirror.js`) is WRONG: the last two
paths must be RENAMED to the edition-named `kaola-gitlab-workflow-task-mirror.js` /
`kaola-gitea-workflow-task-mirror.js`. **This requires a plan-repair-via-`--freeze` of the
`task-mirror` node BEFORE it runs.** Named in D7.

---

## D2. AC-E Codex compact/resume hook — registration surface

**Confirmed (explore §5):** Codex has NO `hooks/hooks.json`. `.codex-plugin/plugin.json`
exposes only `skills`/`interface` keys — NO `hooks` / lifecycle key. I did NOT find any
schema field for hooks in the Codex plugin manifest, so option (a) "plugin-bundled hook via
plugin.json" is NOT real — DO NOT invent a `hooks` key.

**Decision: option (c) — self-contained script + documented project-local invocation,
with NO new wiring surface this issue.** Rationale: the issue's AC-E/F and the directional
principle ask for a Codex-native compact/resume hook that "rehydrates from durable workflow
artifacts," AC-F demands NO `CLAUDE_PLUGIN_ROOT` and NO Claude settings schema, and the
out-of-scope list forbids replacing Codex's subagent system. The minimal REAL surface is:

- Ship the script as a **self-contained stdin/stdout filter** exactly like
  `kaola-workflow-compact-context.js` (reads optional JSON on stdin for `cwd`, walks up to
  find `kaola-workflow/`, emits a deterministic text resume packet on stdout, never mutates
  state, swallows errors to a `[skipped]` stderr line). The compact-context script proves
  the pattern is self-contained — it does NOT reference `CLAUDE_PLUGIN_ROOT` in its body
  (that env var lives only in the Claude `hooks.json` WIRING, which Codex lacks). AC-F is
  satisfied structurally by copying that body shape.
- **Invocation:** the script is invoked the same way the codex simulate walkthrough already
  invokes compact-context — via a repo-absolute / `.codex/agents`-relative path from the
  main session or a documented `.codex/config.toml` `[hooks]`-style/trusted-config entry
  IF/where the consumer's Codex build supports lifecycle events. Because the binding is not
  guaranteed, the contract is: **the script is correct and runnable standalone;** the
  resume packet is produced on demand (`node <path> < session.json`) and DOCUMENTED in
  `docs/` (the `docs` node) as the Codex compact/resume entrypoint. This satisfies AC-E
  ("a Codex-native compact/resume hook OR equivalent lifecycle hook path") without
  inventing an unsupported manifest key.
- **DO NOT** add a `SUPPORT_HOOK_NAMES` entry — that array installs `.sh` hooks for
  Claude/gitlab/gitea hooks.json wiring; the compact-context `.js` precedent ships under
  `SUPPORT_SCRIPT_NAMES`, NOT `SUPPORT_HOOK_NAMES`. The compact/resume hook is a `.js`
  script and rides `SUPPORT_SCRIPT_NAMES` identically.

**Hook script contract (deterministic resume packet):**
- Inputs (read-only): `kaola-workflow/{project}/workflow-state.md` (active project, phase,
  step, next_command, consent/inline-fallback markers), `workflow-plan.md`
  (`## Node Ledger` → in-progress node + pending gates; `## Nodes` → role of next node),
  `workflow-tasks.json` (task-mirror summary: counts by status + the in-progress task).
- Output: a fixed-order plaintext packet — `active project`, `next skill/command`,
  `in-progress node`, `pending gates`, `consent-halt markers`, `task-mirror summary`.
  Deterministic ordering, no timestamps in the body (or an injected clock if one is shown —
  prefer omitting time from the packet entirely, like compact-context does).
- Self-contained: no `require()` of edition code (so it can be the simplest possible
  edition-named ×3 copy — each copy differs ONLY in the script name and any
  edition-named-artifact references; if it reads only generic `kaola-workflow/{project}/`
  paths it can even be near-identical across editions, but it stays edition-NAMED ×3 and
  NOT byte-synced, matching compact-context).

**File paths (edition-named ×3, exactly the frozen `compact-hook` write set):**
- `plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-codex-compact-resume.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-codex-compact-resume.js`
(Note: codex copy keeps the `kaola-workflow-` base prefix per the codex tree convention;
gitlab/gitea use their `kaola-{forge}-workflow-` prefix. This matches compact-context exactly.)

**`script-registration` write-set sufficiency for the hook:** the frozen
`script-registration` write set (`install.sh` + the 4 contract validators) IS sufficient
to register the hook by name:
- `install.sh`: add the codex base-named copy to the **github** `SUPPORT_SCRIPT_NAMES`
  block (lines 142-160) — the codex tree installs through the github lane; add the
  edition-named copies to the gitlab block (172-191) and gitea block (203-222). NO
  `SUPPORT_HOOK_NAMES` edit.
- Contract validators: registration is OPTIONAL for greenness (see D2-NOTE below) but
  recommended for parity — add an `exists(...)` assert in the codex-only
  `validate-kaola-workflow-contracts.js` (NOT in the byte-identical claude/codex
  `validate-workflow-contracts.js` pair, because the hook does not exist in the claude
  `scripts/` tree — see D7) and to the gitlab/gitea `scriptFiles[]`+`installSupportScripts[]`
  arrays. NO additional file is needed beyond the frozen write set.

**D2-NOTE (validator coverage reality):** the gitlab/gitea contract validators'
`scriptFiles[]` arrays do NOT currently enumerate `next-action`/`commit-node`/
`adaptive-handoff`/`adaptive-node` (verified gitlab lines 159-175). So per-edition contract
validators do NOT fail merely because a new adaptive script is unlisted. Registration of the
new scripts in those arrays is therefore for PARITY/discoverability, not a hard green-gate.
The hard green-gates are: `validate-script-sync.js` (COMMON_SCRIPTS / byte groups) and
`install.sh` enumeration (only where a script's existence is asserted). This relaxes D7
risk: the `script-registration` node will not refuse for an unlisted edition-named script,
but SHOULD list them for parity.

---

## D3. workflow-tasks.json schema + generator contract (AC-C)

`kaola-workflow-task-mirror.js` — base-named claude/codex, edition-named gitlab/gitea (D1).

**Reuse (explore §8, verified):** `require('./kaola-workflow-plan-validator')` (or the
edition-named validator in gitlab/gitea) and pull `parseNodes`, `parseLedger`,
`readStoredHash`. These are already `module.exports`-ed and reused by `next-action.js`
(line 22). DO NOT re-implement table parsing.

**Source file:** `kaola-workflow/{project}/workflow-plan.md`.
**Write path:** `kaola-workflow/{project}/workflow-tasks.json`.

**Exact JSON schema (stable key order, 2-space indent, trailing newline):**
```json
{
  "source_plan_hash": "<64-hex from readStoredHash(planContent)>",
  "tasks": [
    { "id": "explore", "role": "code-explorer", "status": "completed", "ledger_status": "complete" }
  ],
  "last_synced_from_ledger": "<injected deterministic value>"
}
```

**Field rules:**
- `source_plan_hash`: `readStoredHash(planContent)` (the 64-hex inside
  `<!-- plan_hash: ... -->`). If null (unfrozen plan) → refuse to write a mirror (the mirror
  is only meaningful for a FROZEN plan); emit a typed `{ "status": "plan_not_frozen" }` and
  exit non-zero, OR write nothing — pick the refusal, do not write a hashless mirror.
- `tasks[]`: ordered by `## Nodes` row order (parseNodes order). Each entry:
  - `id` ← node id (parseNodes)
  - `role` ← node role (parseNodes)
  - `ledger_status` ← raw ledger value from parseLedger (`complete` / `in_progress` /
    `pending` / `n/a`), lowercased (parseLedger already lowercases).
  - `status` ← UI-facing mapping (below).
- `last_synced_from_ledger`: **DETERMINISM RULE** — do NOT call `Date.now()`/`new Date()`
  in the core generator. Accept an injected value: CLI `--now <iso>` and/or an exported
  function `generateMirror({ planContent, now })` that takes `now`. When `--now` is absent
  on the CLI, the CLI handler MAY stamp `new Date().toISOString()` at the OUTERMOST layer
  only (like `claim.js` does at line 226), but the testable core function takes `now` as an
  argument so the AC-7 mirror-regeneration test is deterministic. Mirror this on the
  established split: pure exported core (no clock) + thin CLI wrapper (clock at the edge).

**ledger_status → status mapping (exact):**
| ledger_status | status      | ledger_status field emitted |
|---------------|-------------|-----------------------------|
| complete      | completed   | "complete"                  |
| in_progress   | in_progress | "in_progress"               |
| pending       | pending     | "pending"                   |
| n/a           | completed   | "n/a"                        |
(Any unknown/absent ledger value → treat as `pending` / `status:"pending"`, conservative.)

**CLI surface:**
- `node kaola-workflow-task-mirror.js --project <name> [--now <iso>] [--json]`
- Resolves `kaola-workflow/<project>/workflow-plan.md`, writes
  `kaola-workflow/<project>/workflow-tasks.json`. `--json` echoes the written object to
  stdout (for tests). Exit 0 on write, non-zero typed refusal on missing/unfrozen plan.
- Exported API: `module.exports = { generateMirror, mapLedgerStatus }` for RED-first unit
  tests.

**Rebuild-if-stale-on-resume rule:** on resume, the caller (plan-run / the compact hook /
the orient step) compares the on-disk `workflow-tasks.json.source_plan_hash` against the
current `readStoredHash(planContent)`. If they differ, OR the file is missing/unparseable,
regenerate. Same hash ⇒ regenerate from the current ledger anyway (the ledger advances
under a fixed plan_hash) but it is cheap and idempotent; the staleness signal is purely the
hash for "this mirror belongs to a different/old plan." Spec the rule as: regenerate when
`(missing || unparseable || stored_hash !== current_hash)`; otherwise refresh task statuses
from the current ledger (idempotent rewrite). Document the rule in `docs` (AC-D / api).

---

## D4. AC-B preflight contract

`kaola-workflow-codex-preflight.js` — TRUE 4-tree byte-identical (D1), authored require-free
of edition code (only `fs`/`path` + inline managed-block scan). It hard-gates BEFORE any
`subagent-invoked` compliance is claimed.

**Behavior (exact):**
1. Resolve `projectRoot` (CLI `--project-root <dir>` or `process.cwd()`) and
   `.codex/agents/kaola-workflow/` + `.codex/config.toml`.
2. **Profiles present:** assert `.codex/agents/kaola-workflow/` exists and contains a
   `.toml` for every REQUIRED role (set defined below). Missing dir or missing role file →
   stale/missing.
3. **Managed block fresh:** read `.codex/config.toml`, locate the managed block between
   `# BEGIN kaola-workflow agents` and `# END kaola-workflow agents` (the exact markers
   from `install-codex-agent-profiles.js:12-13`). Parse the `[agents.{role}]` table headers
   inside the block (regex `^\[agents\.([a-z0-9-]+)\]` line-scan — no TOML lib needed).
   Assert every REQUIRED role has an `[agents.{role}]` entry inside the managed block.
   Missing block, OR a required role absent from the block → stale.
4. **No silent continue:** if profiles/block are missing or stale, the script MUST NOT
   return a success/`subagent-invoked`-ok verdict.

**Which roles the freshness check compares against (REQUIRED set):**
The UNION of (a) the **13 template roles** read from the PROFILE FILE SET present in the
plugin (`.codex/agents/kaola-workflow/*.toml` once installed corresponds to
`plugins/kaola-workflow/config/agents.toml` — verified 13: code-explorer, docs-lookup,
planner, code-architect, tdd-guide, implementer, build-error-resolver, code-reviewer,
security-reviewer, doc-updater, adversarial-verifier, contractor, workflow-planner) AND
(b) the **roles named in the frozen plan's `## Nodes` `role` column** (when a `--plan
<path>` arg is supplied). The plan-roles subset is the OPERATIONAL minimum (a plan that
only uses 5 roles still needs those 5 fresh); the template set is the COMPLETENESS check
(the consumer's managed block must carry the full current template, per the issue's "newer
roles … older managed block" gap). DECISION: the gate FAILS if EITHER (a) any template role
is missing from the managed block (template drift) OR (b) any plan role is missing from the
installed profiles/block (operational gap). To keep the byte-identical script edition-neutral
and require-free, derive the template role set by reading the bundled
`config/agents.toml` relative to the script via `path` (each tree has its own
`config/agents.toml`; the script reads `../config/agents.toml` from its own scripts dir) —
NO hardcoded count, so a future 13→14 role addition needs no edit here.

**auto-install-when-safe vs typed-repair-refusal (policy):**
- **SAFE → auto-run `install-codex-agent-profiles.js`:** when the ONLY problem is a stale or
  missing MANAGED BLOCK / missing profile files (i.e. the fix is purely re-running the
  idempotent installer, which only rewrites the marker-delimited managed block + copies
  bundled profiles — it touches nothing user-owned outside the markers, confirmed by
  `stripManagedBlocks`/`upsertBlock` only operating between the markers). The installer is
  invoked with `--project-root`; on success, re-verify; if now fresh → pass.
- **REFUSE (typed) → NOT safe:** when (i) `.codex/config.toml` exists but contains a
  CONFLICTING hand-authored `[agents.*]` table OUTSIDE the managed markers (auto-install
  would not reconcile it), or (ii) the installer is unavailable / errors, or (iii) the plan
  names a role that does NOT exist in the bundled template at all (cannot be installed —
  genuine version mismatch). Refusal is typed, never a silent `subagent-invoked`.
- Provide a `--no-autofix` flag so the AC-7 tests can assert the REFUSAL path deterministically
  without mutating a fixture (refuse instead of auto-install).

**CLI surface + exit codes:**
- `node kaola-workflow-codex-preflight.js --project-root <dir> [--plan <plan-path>]
  [--no-autofix] [--json]`
- Exit `0` = fresh (or auto-fixed-then-fresh); JSON `{ "status": "ok", "roles_checked": [...],
  "autofixed": false|true }`.
- Exit non-zero = refusal; JSON typed-refusal shape:
  `{ "status": "config_stale" | "profiles_missing" | "role_not_in_template" |
  "autofix_unsafe" | "installer_failed", "missing_roles": [...], "stale": true,
  "repair": "run install-codex-agent-profiles.js --project-root <dir>", "safe_autofix":
  false }`. Never emits `subagent-invoked`. The caller (adapt front-end / plan-run orient)
  treats any non-`ok` status as STOP.

---

## D5. AC-A skill-text rewrite spec

Confirmed (verified by grep): the `Agent(...)` leak is **identical** in all 3 init
SKILL.md editions at **line 66**, and the adapt clause is at **line 105-106** (codex only —
no gitlab/gitea adapt SKILL exists). **AC-A stays ONE node** (the 3 finalize SKILL.md files
contain NO `Agent(` / `subagent_type=` call-syntax — "MUST delegate" is legit enforcement
prose, NOT in scope; explore §6).

### Edit 1 — `kaola-workflow-init/SKILL.md` line 66 (×3 editions, byte-identical line)

BEFORE (exact, all 3 editions):
```
- Use the vendored agent names exactly as installed under `~/.claude/agents`; prefer short names like `planner`. When spawning a Kaola subagent, resolve its installed frontmatter model and pass it explicitly as `model=` on the `Agent(...)` call.
```
AFTER (Codex-native dispatch description — role + prompt + cwd + expected_cache +
declared_write_set + model packet; no Claude `Agent(...)` example):
```
- Dispatch a Kaola subagent through the Codex-native role surface: name the installed agent role (e.g. `planner`, `workflow-planner`) and pass a dispatch packet — `role`, `prompt`, `cwd`, `expected_cache`, `declared_write_set`, and the role's resolved `model` (read from its installed `.codex/agents/kaola-workflow/<role>.toml` profile). Do not use Claude `Agent(...)` call-syntax as the runtime contract.
```
(Apply the SAME replacement to all three init SKILL.md files — the line is byte-identical
across editions, so the AFTER text is byte-identical too. Each is in its own edition path in
the write set; they do NOT need to be byte-synced by a validator, but keeping the line
identical is the cleanest result.)

### Edit 2 — codex `kaola-workflow-adapt/SKILL.md` line 105-106 (surgical deletion)

BEFORE (lines 103-107, the relevant sentence spans 105-107):
```
the DAG authoring to the `workflow-planner` agent role** (Opus) — do NOT run the claim or author
the `## Nodes` table inline in this session. In Claude Code dispatch it via the Agent tool
(`subagent_type="workflow-planner"`); in Codex delegate to the `workflow-planner` agent role when its
profile is present at `.codex/agents/kaola-workflow/`. Only if the agent tool is genuinely
```
AFTER (remove ONLY the Claude parenthetical clause; the Codex clause already exists — keep
it; surgical, single-sentence edit):
```
the DAG authoring to the `workflow-planner` agent role** (Opus) — do NOT run the claim or author
the `## Nodes` table inline in this session. In Codex, delegate to the `workflow-planner` agent role when its
profile is present at `.codex/agents/kaola-workflow/`. Only if the agent tool is genuinely
```
(i.e. delete the substring `In Claude Code dispatch it via the Agent tool
(\`subagent_type="workflow-planner"\`); in Codex delegate to` and replace with
`In Codex, delegate to`. The `subagent_type="workflow-planner"` token is REMOVED here.)

⚠️ **Do NOT touch** the adapt SKILL.md line ~124 `kaola_script()` shell fn that uses
`CLAUDE_PLUGIN_ROOT` inside a code fence — that is install-path resolution, NOT a dispatch
call-syntax leak, and is out of AC-A scope (explore §6 note). Also do NOT touch any
gitlab/gitea/codex COMMAND file `subagent_type` text-locks — those ENFORCE dispatch and are
contract-asserted (`validate-workflow-contracts.js:558-559`); removing them would BREAK the
build (Per-node intent, skill-dispatch-text bullet). AC-A is SKILL prose only.

**AC-A node verification (non-TDD):** after edit, the implementer runs the 4 contract
validators + a grep-absence assertion: `grep -rn 'Agent(' plugins/*/skills/kaola-workflow-init/SKILL.md`
returns nothing, and `grep -n 'subagent_type' plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md`
returns nothing. (Skill prose has no natural failing unit test — matches the frozen
`non_tdd_reason`.)

---

## D6. Test plan (AC-7)

Each Codex-facing walkthrough tests its OWN surface — they are NOT byte-synced (the
`validate-script-sync.js:16-22` comment forbids it). Map of required case → file + harness:

| AC-7 required case            | Where it lands (file)                                                              | Harness |
|-------------------------------|-------------------------------------------------------------------------------------|---------|
| stale `.codex/config.toml`    | codex `simulate-kaola-workflow-walkthrough.js`; gitlab `simulate-gitlab-codex-…`; gitea `simulate-gitea-codex-…` | spawnSync the preflight script against a fixture `.codex/config.toml` with an OLD managed block; assert typed refusal / autofix |
| missing role profiles         | same 3 simulate walkthroughs                                                        | remove a `.toml` from the fixture `.codex/agents/kaola-workflow/`; assert `profiles_missing` |
| task-mirror regeneration      | same 3 simulate walkthroughs + edition unit tests below                            | write a fixture plan + ledger, run task-mirror, assert JSON schema + `n/a`→completed + stale-hash regen |
| compact/resume packet         | same 3 simulate walkthroughs                                                        | run the compact-resume script against a fixture project; assert the deterministic packet ordering + fields |
| no-silent-inline-fallback     | codex `simulate-kaola-workflow-walkthrough.js` + gitlab/gitea `test-{forge}-workflow-scripts.js` | assert preflight refusal blocks `subagent-invoked`; assert NO `local-fallback` row is auto-written when a profile is absent |

**Standalone RED-first unit tests (the tdd-guide nodes own these):**
- `preflight` (tdd-guide): RED-first unit test of the freshness logic (fresh / stale-block /
  missing-profile / role-not-in-template / autofix-unsafe). Lands inside the codex
  `simulate-kaola-workflow-walkthrough.js` (which already spawnSyncs scripts) AND the
  gitlab/gitea `test-{forge}-workflow-scripts.js` (which `require('assert')` + spawnSync —
  verified). A separate standalone test file is NOT required; the established pattern is to
  add cases to the existing edition test/walkthrough files (the frozen `tests` node write set
  is exactly those 5 files).
- `task-mirror` (tdd-guide): RED-first unit test of `generateMirror({planContent, now})` —
  deterministic output (injected `now`), the 4 ledger→status mappings, stale-hash regen.
  Same homes.
- `compact-hook` (tdd-guide): RED-first unit test of the packet generator — deterministic
  field order, reads-all-4-artifacts, no-mutation. Same homes.

⚠️ The frozen `preflight`/`task-mirror`/`compact-hook` nodes are tdd-guide and their write
sets are SCRIPT-ONLY (no test file). The test CASES land in the `tests` node (whose write
set IS the 5 test/walkthrough files). This is a deliberate split: a tdd-guide node here
cannot commit its test outside its frozen write set (the per-node barrier would refuse —
see the "tdd-guide node can't commit a test outside its frozen write-set" project memory).
**SEE D7 for the consequence:** either the RED-first test must live in the `tests` node
(authoring the script in node N, the test in the later `tests` node — acceptable since
`npm test` only runs at the end), OR each tdd-guide node's write set must be widened to
include its target test file. RECOMMENDATION: keep tests in the `tests` node (simplest, no
write-set churn) and treat the tdd-guide nodes' "RED-first" as authored-against-a-local-
repro in `$TMPDIR`/`.cache` during development, with the committed test landing in `tests`.
This matches the frozen plan's structure and the adaptive-run-barrier memory.

---

## D7. Write-set reconciliation verdict (THE critical output)

Cross-check of every node's frozen write set against D1–D6. **PR = plan-repair-via-`--freeze`
required BEFORE the node runs.**

| node | declared write set (frozen) | VERDICT |
|------|------------------------------|---------|
| explore | — | OK (done) |
| architect | — | OK (this node) |
| skill-dispatch-text | init SKILL ×3 + adapt SKILL | **OK / SUFFICIENT.** D5 confirmed exactly these 4 paths; AC-A does not split; no command files touched. |
| preflight | preflight ×4 (base-named) + `scripts/validate-script-sync.js` | **OK / SUFFICIENT.** D1: preflight is TRUE 4-tree byte-identical (require-free) ⇒ all 4 copies are base-named exactly as declared. `validate-script-sync.js` is correctly owned here for BOTH new scripts' COMMON_SCRIPTS edits + the preflight 4-path BYTE_IDENTICAL_GROUPS entry. NO change. (Caveat: do not run a full mid-spine `npm test` before task-mirror exists — D1 sequencing.) |
| task-mirror | `scripts/kaola-workflow-task-mirror.js`, `plugins/kaola-workflow/scripts/kaola-workflow-task-mirror.js`, `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-task-mirror.js`, `plugins/kaola-workflow-gitea/scripts/kaola-workflow-task-mirror.js` | **⚠️ PR REQUIRED — RENAME 2 paths.** The gitlab/gitea copies MUST be edition-NAMED (they require the edition-named validator/classifier; cannot be byte-identical — see HEADLINE). Replace `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-task-mirror.js` → `…/kaola-gitlab-workflow-task-mirror.js` and `plugins/kaola-workflow-gitea/scripts/kaola-workflow-task-mirror.js` → `…/kaola-gitea-workflow-task-mirror.js`. claude + codex copies stay base-named (byte-identical). Apply plan-repair-via-`--freeze` to the `task-mirror` node before it runs. |
| compact-hook | codex `kaola-workflow-codex-compact-resume.js`, gitlab `kaola-gitlab-workflow-codex-compact-resume.js`, gitea `kaola-gitea-workflow-codex-compact-resume.js` | **OK / SUFFICIENT.** D2: edition-named ×3 exactly as declared; no claude `scripts/` copy (Codex-only feature); no hooks.json wiring. NO change. |
| script-registration | `install.sh`, `scripts/validate-workflow-contracts.js`, `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`, `scripts/validate-kaola-workflow-contracts.js`, gitlab+gitea contract validators | **OK / SUFFICIENT (superset), with one consistency rule.** Registers: in `install.sh` the codex base-named copies of preflight+task-mirror+compact-resume to the github block, edition-named to gitlab/gitea blocks. ⚠️ The two byte-identical claude/codex `validate-workflow-contracts.js` files must receive IDENTICAL edits (they are in COMMON_SCRIPTS — `validate-script-sync.js:49`; any asymmetric edit breaks sync). Only assert in the claude/codex pair the scripts that EXIST in the claude `scripts/` tree: `preflight` (4-tree, exists in `scripts/`) ✔ and `task-mirror` base copy (exists in `scripts/`) ✔; do NOT assert the compact-resume hook there (it has NO claude `scripts/` copy → `exists('scripts/…')` would fail). Assert the compact-resume hook ONLY in the codex-only `validate-kaola-workflow-contracts.js` + gitlab/gitea validators. Per D2-NOTE the gitlab/gitea `scriptFiles[]` additions are parity (not a hard gate). **No file needs adding to this write set** — the superset covers it. NO PR required. |
| tests | codex/gitlab-codex/gitea-codex simulate walkthroughs + gitlab/gitea `test-{forge}-workflow-scripts.js` | **OK / SUFFICIENT.** D6 maps every AC-7 case to exactly these 5 files. The tdd-guide nodes' RED-first cases land HERE (not in the script nodes' write sets) — acceptable because `npm test` runs only at the end. NO change. |
| version-parity | 3 `.codex-plugin/plugin.json` + README.md | **OK / SUFFICIENT.** Owns README (version-parity contract `validate-workflow-contracts.js:418`); docs node must NOT write README. NO change. |
| docs | architecture, workflow-state-contract, api, conventions, AGENTS.md | **OK / SUFFICIENT.** AC-D (UI mirror ≠ source of truth), the new script CLIs + workflow-tasks.json schema (api), the Codex-native dispatch + no-silent-inline rule (conventions), the compact/resume entrypoint doc (D2). NO README, NO CHANGELOG. NO change. |
| security-review | — | OK (read-only; post-dominates preflight + compact-hook). |
| code-review | — | OK (read-only; post-dominates all code nodes). |
| finalize | CHANGELOG.md | OK (sink; [Unreleased] entry). |

**SINGLE PLAN-REPAIR REQUIRED:** the `task-mirror` node only — rename its two gitlab/gitea
write-set paths to the edition-named form (`kaola-gitlab-workflow-task-mirror.js` /
`kaola-gitea-workflow-task-mirror.js`). Apply ledger-preserving plan-repair-via-`--freeze`
(the hash covers `## Meta` + `## Nodes`; the ledger is preserved) BEFORE the `task-mirror`
node runs. No other node needs a repair. If the orchestrator additionally wants strict
monotonic green and decides to move the task-mirror COMMON_SCRIPTS allowlist edit out of
`preflight` into `task-mirror`, that is a SECOND optional repair touching `preflight` +
`task-mirror` write sets (D1) — NOT required for end-state correctness and NOT recommended
(adds churn); the default is: keep both sync edits in `preflight`, do not run a full mid-spine
`npm test` between preflight and task-mirror.

---

## Build sequence (dependency order — matches the frozen spine)

1. skill-dispatch-text (D5 prose edits — no script deps)
2. preflight (D4 logic + D1 sync registration for BOTH new scripts)
3. task-mirror (D3 generator) — **PR the write set first**
4. compact-hook (D2 packet generator)
5. script-registration (D2/D1 install.sh + validator asserts)
6. tests (D6 AC-7 cases — RED-first, all 5 files)
7. version-parity (3 manifests + README lockstep)
8. docs (AC-D + CLIs + schema)
9. security-review → code-review → finalize (CHANGELOG)

---

## Summary (D1–D7)

- **D1:** preflight = TRUE 4-tree byte-identical (author require-free) → COMMON_SCRIPTS +
  a 4-path BYTE_IDENTICAL_GROUPS entry. task-mirror = COMMON_SCRIPTS (claude↔codex
  byte-identical) + EDITION-NAMED gitlab/gitea ports (NOT byte-synced, no 4-path group).
  Sequencing: keep both sync-allowlist edits in `preflight`; do not run a full mid-spine
  `npm test` before task-mirror exists.
- **D2:** Codex has NO hooks manifest key (confirmed) → ship the compact/resume hook as a
  self-contained stdin/stdout `.js` filter (compact-context shape, AC-F satisfied
  structurally), edition-named ×3, installed via `SUPPORT_SCRIPT_NAMES` (NOT
  `SUPPORT_HOOK_NAMES`), invocation documented in `docs`. The `script-registration` write
  set is sufficient.
- **D3:** workflow-tasks.json = `{source_plan_hash (readStoredHash), tasks[]:{id,role,status,
  ledger_status}, last_synced_from_ledger}`; reuse parseNodes/parseLedger/readStoredHash;
  `n/a`→completed (+`ledger_status:"n/a"`); deterministic core takes injected `now` (no
  Date.now in core); regenerate when missing/unparseable/stale-hash.
- **D4:** preflight hard-gates `.codex/agents/kaola-workflow/*.toml` + the managed
  `.codex/config.toml` block (markers `# BEGIN/END kaola-workflow agents`) against the
  template role set (read from bundled `config/agents.toml`, no hardcoded 13) ∪ the frozen
  plan's `## Nodes` roles; auto-install only when the fix is a pure managed-block re-run,
  else typed refusal; NEVER a silent `subagent-invoked`. Typed-refusal JSON + non-zero exit.
- **D5:** AC-A = ONE node. init SKILL line 66 ×3 → Codex-native dispatch-packet bullet;
  adapt SKILL line 105-106 → delete the Claude `Agent`/`subagent_type` parenthetical only.
  Do not touch command text-locks or the `kaola_script` CLAUDE_PLUGIN_ROOT fence.
- **D6:** all 5 AC-7 cases land in the 3 Codex simulate walkthroughs + the gitlab/gitea
  `test-{forge}-workflow-scripts.js` (the frozen `tests` write set); tdd-guide nodes'
  RED-first cases land in the `tests` node (not the script nodes' write sets).
- **D7 PLAN-REPAIR VERDICT:** exactly ONE required plan-repair-via-`--freeze` — the
  `task-mirror` node: RENAME its gitlab/gitea write-set paths from
  `kaola-workflow-task-mirror.js` to `kaola-gitlab-workflow-task-mirror.js` /
  `kaola-gitea-workflow-task-mirror.js` BEFORE the node runs (they cannot be byte-identical
  because they require the edition-named validator/classifier). Every other node's frozen
  write set is sufficient as declared.

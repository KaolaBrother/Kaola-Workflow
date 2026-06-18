evidence-binding: n1-design b5edef33e399

# Implementation Blueprint — issue #524: roadmap-priority-aware issue-scout

## 0. Confirmed facts (read end-to-end)

- `agents/issue-scout.md` read in full (146 lines). Sections to touch: **What You May Read** (L29-35), **Survey Process → 1. Backlog Inventory** (L51-56), **2. Clustering Analysis** (L58-72), **3. Bundle Selection Rules** (L73-84), **Goal Context** (L86-94), **Output Format** (L96-135).
- `plugins/kaola-workflow/agents/issue-scout.toml` read in full (35 lines). The 3 `.toml` ports are **byte-identical** to each other (verified `diff` → IDENTICAL for gitlab and gitea vs github). They mirror the `.md`'s substantive logic in condensed codex-runtime prose, forge-neutral ("the forge CLI", "Open issues via the forge CLI").
- **Roadmap shape** (verified by reading `scripts/kaola-workflow-roadmap.js`). The generated `ROADMAP.md` carries, durably and machine-readably:
  - `## Active Work` table with columns: **`Issue | Title | Status | Workflow Project | Next Step`** (HEADER L46-51, `buildTableRow` L83-92). The **`Next Step`** column is the per-issue drive-order signal sourced from each `.roadmap/issue-N.md`'s `next_step:` field (`readRoadmapIssues` L70-81).
  - Rows are emitted in **ascending issue-number order** (`readRoadmapIssues` sort L64-69). Issue number order is NOT priority order — this is exactly the trap (the scout currently treats lowest-number-cohesive as the winner).
  - A `## Rules` block (`RULES_BLOCK` L37-44), and crucially an **optional `### Project rules` sub-block** appended verbatim from `kaola-workflow/.roadmap/_rules.md` when present (`buildRoadmapContent` L98-105: `rules += '\n\n### Project rules\n' + extra`). This is the durable home of guardrails like "X must not preempt the correctness frontier Y" and master-epic drive-order statements.
  - The per-issue `.roadmap/issue-N.md` source files carry `next_step:` (drive-order) and free-form body that can encode epic/depends-on relations.
- **Auto surfaces verified untouched-safe** — `commands/kaola-workflow-auto.md`, `commands/workflow-next.md`, and all 6 SKILL/command edition mirrors reference the scout ONLY by: dispatch-by-name, `--scout-result` path wiring, `goal_alignment` field passthrough, `primary_issue`/`issues` → env mapping, and the `backlog_empty` terminal signal. NONE describes the scout's internal ranking criteria (cohesion vs priority). The ranking objective lives entirely inside the scout profile. **LOCUS CALL HOLDS: the 4 scout files are the complete and sufficient edit set.**

---

## 1. Priority-signal reading instructions

The scout already reads `.roadmap/*` and `ROADMAP.md`; the gap is that it mines them for *scope* only. Add the priority signals as named extraction targets in two places.

### 1a. `agents/issue-scout.md` — "What You May Read" (L29-35)

REPLACE the bullet at L33:
> `- kaola-workflow/ROADMAP.md — the generated mirror only (do not hand-edit it);`

WITH (add the explicit priority-signal callout as a continuation under the same bullet):
```
- `kaola-workflow/ROADMAP.md` — the generated mirror only (do not hand-edit it). Read it for BOTH scope signals AND **priority/drive-order signals**: the `## Active Work` table's **`Next Step`** column (per-issue drive-order), and any **`### Project rules`** block (durable sequencing guardrails — e.g. "X must not preempt the correctness frontier Y", master-epic drive-order, "frontier" / "drive" statements). These are first-class ranking inputs, not just scope hints;
```

### 1b. `agents/issue-scout.md` — "Survey Process → 1. Backlog Inventory" (L51-56)

REPLACE L54:
> `- Read each .roadmap/issue-*.md source for scope signals (subsystem, area label, feature name, dependency relations);`

WITH:
```
- Read each `.roadmap/issue-*.md` source for scope signals (subsystem, area label, feature name, dependency relations) AND priority signals (the `next_step:` drive-order field, any epic / frontier / `depends-on:#N` ordering in the body);
```

INSERT a new bullet immediately after L56 (after the "Note dependency labels…" bullet):
```
- Extract the **roadmap priority frontier**: read the `### Project rules` block in `ROADMAP.md` (if present) for sequencing guardrails and the master-epic drive-order, and read the `Next Step` column for per-issue drive-order. Record which open issue(s) the roadmap drives FIRST (the frontier) and any guardrail that forbids preempting a frontier with named lower-priority work. Absence of any priority signal is itself a finding — fall back to scope-cohesion ranking and say so in `priority_basis`.
```

### 1c. `.toml` ports — "What you may read:" (L9-14) and add a survey instruction

REPLACE L12 in the `.toml`:
> `- kaola-workflow/ROADMAP.md (generated mirror, read-only);`

WITH:
```
- kaola-workflow/ROADMAP.md (generated mirror, read-only) — read it for BOTH scope signals AND priority/drive-order signals: the ## Active Work table's Next Step column (per-issue drive-order) and any ### Project rules block (durable sequencing guardrails such as "X must not preempt the correctness frontier Y", master-epic drive-order). These are first-class ranking inputs, not just scope hints;
```

INSERT after L14 (after the "Recently archived summaries…" bullet) a new bullet:
```
- Read each .roadmap/issue-*.md source for priority signals too (the next_step: drive-order field, any epic / frontier / depends-on:#N ordering in the body). Extract the roadmap priority frontier — which open issue(s) the roadmap drives first — and any guardrail forbidding preemption of a frontier by named lower-priority work. Absence of any priority signal is itself a finding: fall back to scope-cohesion ranking and say so in priority_basis.
```

---

## 2. Ranking precedence rewrite

New objective: **priority/drive-order tier first → scope-cohesion second → actionability as a within-tier tiebreak only.** Actionability NEVER overrides a tier; it breaks ties *inside* one priority tier. This is the core fix for the "most easily verifiable, rationalized as priority" trap.

### 2a. `agents/issue-scout.md` — "2. Clustering Analysis" (L58-72)

The clustering itself (grouping by scope signal) stays. Add a **ranking** step on top of the clusters. REPLACE the opening line L60:
> `Group candidate issues by coherent scope signal:`

WITH:
```
First **rank** candidates by the roadmap priority frontier, THEN group by scope. The ranking precedence is strict and ordered:

1. **Priority / drive-order tier (hard rank, first).** A cluster that contains or advances the roadmap's top-priority frontier issue (per `### Project rules` and the `Next Step` drive-order) outranks every lower-priority cluster. A `### Project rules` guardrail (e.g. "X must not preempt the correctness frontier Y") is a HARD constraint: while a higher-priority frontier issue is open and actionable, the guarded-against issue must NOT be recommended.
2. **Scope-cohesion (second).** Within the highest available priority tier, prefer the most coherent same-scope cluster.
3. **Actionability (within-tier tiebreak ONLY).** Ease of verification / cleanest write-lanes / smallest dependency surface breaks ties *between equally-prioritized* clusters. Actionability NEVER promotes a lower-priority cluster over a higher-priority one. "Closest actionable proxy" is an explicit anti-pattern: do not substitute an easier lower-priority issue for an open, actionable frontier issue.

Group the candidates within the winning priority tier by coherent scope signal:
```
(L61-66 bullet list "Same subsystem…" stays unchanged below this.)

### 2b. `agents/issue-scout.md` — "3. Bundle Selection Rules" (L73-84)

The existing ALL-true gate stays (open/unclaimed/red/deps/scope/write-area/count). Add the priority criterion as the FIRST rule. REPLACE the list intro L75:
> `Auto-bundle mode should only recommend a set when ALL of the following are true:`

WITH (insert a new leading bullet before "All issues are open…"):
```
Auto-bundle mode should only recommend a set when ALL of the following are true:

- The set sits in the **highest open-and-actionable priority tier** the roadmap drives: no open, actionable, higher-priority frontier issue is being skipped in its favor (honor every `### Project rules` guardrail; see the Frontier-Blocked Rule below);
```
(L76-82 existing bullets remain unchanged after this new bullet.)

### 2c. `.toml` ports — "Bundle selection rules" (L21-27)

The `.toml` collapses Clustering + Selection into one "Bundle selection rules" block. REPLACE L21:
> `Bundle selection rules (auto-bundle mode — recommend a set only when ALL are true):`

WITH (insert ranking precedence + the new leading rule):
```
Ranking precedence (strict, ordered) — rank BEFORE clustering:
1. Priority / drive-order tier (hard rank, first): a cluster that advances the roadmap's top-priority frontier (per ### Project rules and the Next Step drive-order) outranks every lower-priority cluster. A ### Project rules guardrail (e.g. "X must not preempt the correctness frontier Y") is a HARD constraint — while a higher-priority frontier issue is open and actionable, the guarded-against issue must NOT be recommended.
2. Scope-cohesion (second): within the top open priority tier, prefer the most coherent same-scope cluster.
3. Actionability (within-tier tiebreak ONLY): ease of verification / clean write-lanes breaks ties between equally-prioritized clusters; it NEVER promotes a lower-priority cluster. "Closest actionable proxy" substitution for an open, actionable frontier issue is an explicit anti-pattern.

Bundle selection rules (auto-bundle mode — recommend a set only when ALL are true):
- The set sits in the highest open-and-actionable priority tier the roadmap drives — no open, actionable, higher-priority frontier issue is skipped in its favor (honor every ### Project rules guardrail; see the frontier-blocked rule below);
```
(L22-27 existing bullets remain unchanged after this new bullet.)

---

## 3. Frontier-blocked rule (no silent proxy substitution)

Insert a dedicated rule that fires when the top-priority frontier issue cannot be taken.

### 3a. `agents/issue-scout.md` — new sub-section after "3. Bundle Selection Rules" (after L84, before "## Goal Context")

INSERT:
```
### 4. Frontier-Blocked Rule

When the roadmap's top-priority frontier issue is genuinely blocked or unverifiable — unclaimed-but-red against active work, has an open external dependency outside any claimable bundle, or its acceptance is unverifiable in this run — you may fall to the next-priority actionable item, but ONLY after saying so **explicitly**:

- State in `priority_basis` (see Output Format) WHICH frontier issue you skipped and the **concrete reason** it is blocked/unverifiable ("frontier blocked because…"), then name the next-priority item you fell to.
- List the skipped frontier issue in `rejected` with that same blocking reason.
- Never silently substitute an easier, lower-priority, more-cohesive cluster for an open and actionable frontier issue and call it the "closest actionable proxy." Silent substitution is forbidden; an explicit, reasoned fall-through is required.

A frontier issue that is open AND actionable AND verifiable is NOT blocked — recommend it (or its frontier-advancing cluster) even if a lower-priority cluster is more cohesive or easier to verify.
```
(Renumber is local — the existing sections are "1. Backlog Inventory", "2. Clustering Analysis", "3. Bundle Selection Rules"; this becomes "4. Frontier-Blocked Rule". The implementer should keep the numbering consistent.)

### 3b. `.toml` ports — append to the "Bundle selection rules" block (after L27, before "Output contract:")

INSERT:
```
Frontier-blocked rule:
- When the roadmap's top-priority frontier issue is genuinely blocked/unverifiable (red against active work, open external dependency outside any claimable bundle, or acceptance unverifiable this run), you may fall to the next-priority actionable item ONLY after saying so explicitly: state in priority_basis WHICH frontier issue you skipped and the concrete blocking reason ("frontier blocked because…"), then name the next-priority item you fell to, and list the skipped frontier issue in rejected with that reason.
- Never silently substitute an easier, lower-priority, more-cohesive cluster for an open, actionable frontier issue ("closest actionable proxy" is forbidden). A frontier issue that is open AND actionable AND verifiable is NOT blocked — recommend it even when a lower-priority cluster is more cohesive or easier to verify.
```

---

## 4. `priority_basis` output field

A REQUIRED field (always present, unlike the optional `goal_alignment`) that forces the scout to reconcile its pick against the roadmap's stated drive-order/guardrails.

### Schema position & type
- Position: inside `recommended_bundle`, alongside `rationale`/`risks`. Place it **immediately after `rationale`** (priority is the new primary justification, so it reads right after the cohesion rationale).
- Type: **object** with three string fields:
  - `frontier`: the roadmap's top-priority open issue(s) the scout identified, as a short string (e.g. `"#488/#502/#561 epic frontier (per ### Project rules drive-order)"`), or `"none — no priority signal in roadmap"` when the roadmap encodes no priority.
  - `pick_vs_frontier`: how the recommended pick reconciles against the frontier — one of the discrete states, in prose: `"advances frontier"` | `"is the frontier"` | `"frontier blocked because <concrete reason>; fell to next-priority <issue>"` | `"no priority signal; ranked by scope-cohesion"`.
  - `guardrails_honored`: a one-line statement of which `### Project rules` guardrail(s) were applied, or `"none documented"`.
- When `backlog_empty: true` is emitted, `recommended_bundle` is `null`, so `priority_basis` is naturally absent (it lives inside the bundle object) — no special-casing needed.

### 4a. `agents/issue-scout.md` — Output Format JSON example (L100-119)

INSERT into the JSON object, immediately after the `"rationale": ...,` line (L107), with a trailing comma:
```
    "priority_basis": {
      "frontier": "#488/#502/#561 epic frontier (per ### Project rules drive-order)",
      "pick_vs_frontier": "advances frontier — primary_issue 488 is the top-priority open frontier issue",
      "guardrails_honored": "did not recommend #82/#652 (lower-priority) while the #488 frontier is open and actionable"
    },
```

### 4b. `agents/issue-scout.md` — Fields list (L121-133)

INSERT a bullet immediately after the `rationale` bullet (L125):
```
- `priority_basis` _(required)_: object reconciling the pick against roadmap priority/drive-order:
  - `frontier`: the roadmap's top-priority open issue(s) (per `### Project rules` and `Next Step` drive-order), or `"none — no priority signal in roadmap"`;
  - `pick_vs_frontier`: `"is the frontier"` / `"advances frontier"` / `"frontier blocked because <reason>; fell to next-priority <issue>"` / `"no priority signal; ranked by scope-cohesion"`;
  - `guardrails_honored`: which `### Project rules` guardrail(s) were applied, or `"none documented"`.
```

### 4c. `.toml` ports — Output contract (L29-34)

REPLACE L30:
> `- Return a single JSON object with a recommended_bundle key containing: primary_issue (int), issues (sorted int[]), scope (string), confidence (high|medium|low), rationale (string), expected_write_areas (string[]), risks (string[]), rejected ([{issue, reason}]), and optionally goal_alignment ({aligned: bool, reason: string}).`

WITH:
```
- Return a single JSON object with a recommended_bundle key containing: primary_issue (int), issues (sorted int[]), scope (string), confidence (high|medium|low), rationale (string), priority_basis ({frontier: string, pick_vs_frontier: string, guardrails_honored: string}, REQUIRED), expected_write_areas (string[]), risks (string[]), rejected ([{issue, reason}]), and optionally goal_alignment ({aligned: bool, reason: string}).
```

INSERT a new line after L31 (after the "primary_issue is the lowest-numbered member" line):
```
- priority_basis (required) reconciles the pick against roadmap priority/drive-order: frontier names the top-priority open issue(s) (per ### Project rules and Next Step drive-order) or "none — no priority signal in roadmap"; pick_vs_frontier is one of "is the frontier" / "advances frontier" / "frontier blocked because <reason>; fell to next-priority <issue>" / "no priority signal; ranked by scope-cohesion"; guardrails_honored names the applied ### Project rules guardrail(s) or "none documented".
```

---

## 5. Cross-edition parity note

- This is ONE semantic change mirrored identically across the 4 files. The code-reviewer's parity check requires the 3 `.toml` ports to remain **byte-identical to each other** after the edit (they are byte-identical today — verified). Apply the SAME `.toml` text to all three (`plugins/kaola-workflow/`, `plugins/kaola-workflow-gitlab/`, `plugins/kaola-workflow-gitea/`).
- The `.md` (github edition) carries the SAME semantics in its richer markdown form; it MAY name `gh issue list` (it already does at L31/L53) — leave those as-is, they are github-edition tokens.
- **Forge-neutrality (#341) — the new prose MUST NOT introduce forge-specific tokens into the `.toml` ports.** None of the new text above references a forge CLI at all (priority signals come from `ROADMAP.md`/`.roadmap/*`, which are forge-neutral files). The only legitimately-differing wording between `.md` and `.toml` is the pre-existing condensation/runtime phrasing ("the forge CLI" vs `gh issue list`, "Codex" runtime framing) — the priority logic prose is identical in substance across all 4.
- Do NOT introduce any new forge token, env var, or script reference. The change is pure agent-reasoning prose. No `validate-*-contracts.js` count bumps, no `install.sh` SUPPORT_SCRIPT_NAMES changes, no walkthrough fixture changes — there is no machine-testable unit (LLM reasoning prose). The walls that bind are cross-edition parity + the four npm chains staying green.

---

## 6. Goal-as-soft-filter interaction

Priority is a **hard rank**; goal stays a **soft filter**. They operate on different axes and must not collide. Add one clarifying sentence so the implementer wires them correctly.

### 6a. `agents/issue-scout.md` — "Goal Context" (L86-94)

INSERT after the first bullet (after L90 "Treat it as a soft filter…"):
```
- Priority/drive-order ranking takes precedence over goal alignment: the goal is a soft *tiebreak/preference within the chosen priority tier*, never a reason to skip the roadmap frontier. If the goal points at lower-priority work while a higher-priority frontier issue is open and actionable, recommend the frontier and note the goal divergence in `goal_alignment.reason` — do not let the goal override the priority rank.
```

### 6b. `.toml` ports — "Goal context" (L16-19)

INSERT after L18 (after the "prefer bundles whose scope aligns…" line):
```
- Priority/drive-order ranking takes precedence over goal alignment: the goal is a soft tiebreak/preference WITHIN the chosen priority tier, never a reason to skip the roadmap frontier. If the goal points at lower-priority work while a higher-priority frontier issue is open and actionable, recommend the frontier and note the divergence in goal_alignment.reason.
```

---

## 7. Acceptance-criteria trace (design self-check)

- **AC: rank by priority/drive-order first, honor guardrail** → §2 ranking precedence (tier-first) + §1 reading instructions extract `### Project rules` + `Next Step`. Guarded-against issue not recommended while frontier open+actionable → §2a rule 1 + §2b/2c leading selection bullet.
- **AC: frontier-blocked → explicit, no silent proxy** → §3 Frontier-Blocked Rule (explicit `priority_basis` + `rejected` reason; "closest actionable proxy" named as anti-pattern).
- **AC: `priority_basis` present + reconciled** → §4 (required field, both `.md` and `.toml`, includes the frontier-blocked case via `pick_vs_frontier`).
- **AC: replaying vrpai-cli surfaces #488/#502/#561 (or explicit frontier-blocked), not #82/#652** → §2 demotes the easier-but-lower-priority #82/#652 cluster below the open frontier; §3 forbids the silent proxy substitution that produced them; §4's `guardrails_honored` example literally encodes the #82/#652-not-while-#488-open reconciliation.

## 8. Build sequence for n2 (near-mechanical)

1. `agents/issue-scout.md`: apply §1a, §1b, §2a, §2b, §3a, §4a, §4b, §6a (top-to-bottom by line number to keep offsets stable: What You May Read → Backlog Inventory → Clustering → Bundle Selection → new Frontier-Blocked section → Output Format JSON → Fields → Goal Context).
2. `plugins/kaola-workflow/agents/issue-scout.toml`: apply §1c, §2c, §3b, §4c, §6b.
3. Copy the EXACT `.toml` result to `plugins/kaola-workflow-gitlab/agents/issue-scout.toml` and `plugins/kaola-workflow-gitea/agents/issue-scout.toml` (must stay byte-identical — `diff` them to confirm).
4. Run the four npm chains sequentially (cross-edition diff): `npm run test:kaola-workflow:claude && :codex && :gitlab && :gitea`.

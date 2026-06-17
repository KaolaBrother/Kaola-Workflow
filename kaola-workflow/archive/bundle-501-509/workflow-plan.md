# Adaptive Workflow Plan — bundle-501-509

<!-- plan_hash: 16add758502ded8042b6bebbdbe4c752f6ee02ed090e8e6c5cf37bbddb0e76e6 -->

## Meta

labels: bug, area:scripts
project: bundle-501-509
issues: 501, 509

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-fix | tdd-guide | — | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, scripts/test-adaptive-node.js, scripts/test-commit-node.js | 10 | sequence | opus |
| n2-prose | doc-updater | n1-fix | agents/adversarial-verifier.md, plugins/kaola-workflow/agents/adversarial-verifier.toml, plugins/kaola-workflow-gitlab/agents/adversarial-verifier.toml, plugins/kaola-workflow-gitea/agents/adversarial-verifier.toml, commands/kaola-workflow-finalize.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md, docs/decisions/D-509-01.md | 11 | sequence | sonnet |
| n3-review | code-reviewer | n1-fix, n2-prose | — | 1 | sequence | opus |
| n4-finalize | finalize | n3-review | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

This bundle ships TWO DISJOINT-region fixes to the same `plan-validator.js` family
(×4 editions; the canonical aggregator + its three ports — `generated_port_split`
keeps all four in ONE node). Both fixes, their tests, and the prose reconciliation
are authored as a short serial chain because the prose node and the fix node both
touch the `plugins/` area (shared, exact-file-disjoint); sequencing them avoids the
ambiguous-concurrency ASK while preserving correctness coherence (prose reviewed
against a settled fix snapshot).

### n1-fix (tdd-guide, opus) — the two validator-logic fixes + their tests

**#501 — extend `SENSITIVE_PATTERNS` (validator ~:248-255, ×4).** Add the two
uncovered high-blast-radius surfaces so the workflow's OWN INTERNAL G2
`security-reviewer` post-dominator fires on them. This is a PATTERN-LIST EXTENSION
ONLY — it triggers the existing internal security gate, adds NO CI/CD prose, NO
external dependency, and is explicitly consistent with the "CI/CD is not a required
gate" principle (the updated #501 says so directly):
  1. Secret dotfiles (precedence #1, pure secret-leak prevention): `/(^|\/)\.env(\.|$)/`.
  2. Pipeline/deploy config (defense-in-depth): `/(^|\/)\.github\/workflows\//`,
     `/\.gitlab-ci\.yml$/`, `/(^|\/)Dockerfile$/`.
Add patterns case-insensitively in the SAME relative position the issue suggests.
Do NOT add any CI/CD process-gate prose anywhere.

**#509 — scope `--verdict-check` for the investigation adversarial-verifier
(validator ~:171, :707-784 `verifyVerdictBlock`, ×4).** OPTION A (cheapest-sufficient;
recorded in D-509-01). Exempt an `adversarial-verifier` node from `--verdict-check`
WHEN it does NOT post-dominate any code-producing or sensitive node — i.e. it is an
investigation skeptic, not a change gate. Implementation guidance:
  - Add a pure graph helper (e.g. `advVerifierIsChangeGate(node, nodes, sink)`) that
    returns true iff the adversarial-verifier node lies on a path from SOME
    code-producing (`producesCode`) or sensitive (`nodeIsSensitive` || sensitive
    labels) node to the unique sink — reuse the existing reachability machinery
    (`adjacency` / the `gateUncovered` reach-after-removal idiom), NO fs.
  - In `verifyVerdictBlock`'s `checkOne` (and the whole-plan loop), when
    `node.role === 'adversarial-verifier'` AND `!advVerifierIsChangeGate(...)`,
    return `{ ok: true, ... }` (exempt) REGARDLESS of shape (sequence OR fanout) —
    keying on post-dominance alone, NOT on the "non-fanout" simplification in the
    issue text. The #486 RECOMMENDED investigation shape is the read-only
    majority-refute FANOUT (walkthrough:1925); a non-fanout-only exemption would be
    a HALF-FIX leaving the recommended shape false-blocking. This is a deliberate
    planner design call over the issue's "non-fanout" wording.
  - The gate STAYS STRONG: an adversarial-verifier that DOES post-dominate a
    code/sensitive node keeps its full verdict-check coverage (both the fanout
    majority-refute branch :720-740 and the sequence pass/fail branch :742-764).
    `code-reviewer` (G1) and `security-reviewer` (G2) post-dominance are UNCHANGED —
    only the adversarial-verifier verdict-check membership is scoped.

**Tests (TDD: RED first, both directions — the #509 CRITICAL is only provable if
both are pinned).** Add to the four walkthroughs (and `test-adaptive-node.js` /
`test-commit-node.js` if their verdict-check assertions ripple):
  - #509 (a): an investigation adversarial-verifier (sequence AND fanout) that
    post-dominates NO code/sensitive node and emits `verdict: refuted` /
    `findings_blocking>0` → `--verdict-check` PASSES (exit 0). This is the fix.
  - #509 (b): an adversarial-verifier that DOES post-dominate a code/sensitive node
    and emits `verdict: refuted` → `--verdict-check` STILL BLOCKS (nonzero). This
    proves the fix did NOT weaken the gate (distinguishes Option A from
    "exempt all adversarial-verifiers").
  - #501: a node whose declared write set is `.env` / `.env.local` / `Dockerfile` /
    `.github/workflows/deploy.yml` / `.gitlab-ci.yml` on a NON-security-labeled plan
    with no G2 post-dominator → freeze REFUSES (security gate now required). Control:
    the same path WITH a `security-reviewer` post-dominator freezes green.
  - **#501 FIXTURE LANDMINE (must fix in all four walkthroughs):** existing
    scenarios assert `Dockerfile` (walkthrough:1674, :1828) and
    `.github/workflows/deploy.yml` (:1674) FREEZE GREEN as ordinary exact-path
    files (the #381/#388 checks). After #501 those paths become SENSITIVE and
    require a G2 post-dominator — those scenarios WILL break unless updated. Either
    add a `security-reviewer` post-dominator to those fixtures, or repoint them to a
    non-sensitive filename if the scenario's intent is purely exact-path-freeze.
    The forge walkthroughs each carry their OWN copies of these scenarios (grep
    `Dockerfile` / `adversarial-verifier` / `verdict-check` per file). Run all four
    `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains GREEN before
    the gate.

**Cross-edition (#306/#307/#340):** root + codex twin are byte-identical (enforced
by `validate-script-sync.js`); the two forge ports have PRE-EXISTING #294 drift, so
mirror the FULL accumulated root diff modulo forge nouns with SURGICAL edits —
NEVER regenerate. Since both fixes land in n1-fix, the forge ports take the combined
root diff as their canonical spec.

### n2-prose (doc-updater, sonnet) — reconcile the contradictory "never a gate" prose

Reconcile the prose with the now-true code (#509 requirement: "reconcile the
contradictory 'never a gate' prose either way"). Option A makes the investigation
adversarial-verifier GENUINELY exempt from the finalize verdict-check, so the prose
becomes consistent rather than contradictory:
  - `agents/adversarial-verifier.md` (lines ~3, ~74) + the 3 byte-identical
    `plugins/*/agents/adversarial-verifier.toml` mirrors: clarify that an
    investigation adversarial-verifier (one that post-dominates no code/sensitive
    node) is exempt from `--verdict-check` — its refutation is analytical OUTPUT,
    not a finalize block — while one that DOES post-dominate code/sensitive keeps
    full verdict-check coverage. Keep the tomls byte-identical to each other; keep
    all plugin prose FORGE-NEUTRAL (#341 — no `gh`/`glab`/forge brand).
  - `commands/kaola-workflow-finalize.md` (~:54) + the 3
    `plugins/*/skills/kaola-workflow-finalize/SKILL.md` mirrors (#400 finalize half
    of the six-surface): refine the `--verdict-check` description to note that an
    investigation adversarial-verifier that post-dominates no code/sensitive node is
    exempt (only change-gate adversarial-verifiers are required to record
    `verdict: pass`). The `kaola-workflow-adapt` command/skill #486 prose (the other
    3 of the six surfaces) needs NO change — Option A makes its "never a gate"
    assertion TRUE, so it is now consistent as-is.
  - `docs/decisions/D-509-01.md`: NEW record — Option A (scope the gate by
    post-dominance) chosen over Option B (new `verdict: complete` vocab, heavier
    6-surface propagation) and Option C (document-only, does NOT remove the false
    finalize-block = insufficient). Record that the exemption keys on post-dominance
    alone (covers BOTH sequence and fanout investigation shapes), deliberately
    generalizing the issue's "non-fanout" wording, and that the gate stays strong
    for change-gate adversarial-verifiers.

`D-501` needs no decision record — it is a determined, right-sized pattern-list
extension.

### n3-review (code-reviewer, opus) — G1 gate over the subtle correctness change

OPUS because the #509 gate-semantics change is subtle correctness: verify the
exemption keys on post-dominance and does NOT weaken `--verdict-check` for genuine
code/sensitive post-dominating adversarial-verifiers (test (b) must block),
verify #501 patterns fire G2 on the new surfaces without false positives, and
verify the prose matches the shipped behavior. Post-dominates both code-producing
nodes (n1-fix, n2-prose) — G1.

### n4-finalize (finalize, sonnet) — docs/state sink

CHANGELOG.md entry under [Unreleased] for both #501 and #509. Docs/state only.

## Node Ledger

| id | status |
| --- | --- |
| n1-fix | complete |
| n2-prose | complete |
| n3-review | complete |
| n4-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-fix) | subagent-invoked | evidence-binding: n1-fix 5752fde8f3f6 | |
| doc-updater (n2-prose) | subagent-invoked | evidence-binding: n2-prose 10312945e679 | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review 22331ed936d2 | |

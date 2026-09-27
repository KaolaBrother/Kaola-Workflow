# ADR 0029 — Native subagents only: Kaola-Workflow defines no roles

Status: Accepted · Date: 2026-09-27 · Issue: #1101

Supersedes ADR 0025 (lean orchestrator; one subagent binding per runtime; seven roles) in full,
and every earlier decision that ADR carried forward about Kaola role profiles, role catalogs,
subagent model or effort bindings, and named-role fallback. ADR 0017/0027 (the mission ledger) and
ADR 0024 (finalize measures; one authority per constant) are unaffected.

## Context

ADR 0025 narrowed fourteen roles to seven and one subagent binding per runtime, and made the
OpenCode, Kimi, ZCode, Devin, Droid, and DSH adapters native-only. Claude, the three Codex plugins,
Grok, and Cursor still shipped 42 generated profiles from `templates/agents/behavior-contracts.json`
through `scripts/generate-agent-profiles.js`, pinned a subagent model (and, on Codex, Grok, and
Cursor, an effort), and taught a dispatch contract built around the named role: a default binding,
a cheaper child, named/built-in/generic route identities, and a `capability_gap` when a role was
missing.

The Owner's direction for #1101: retire the Kaola-specific subagent structure on every runtime. No
fast or cheap implementers, no Kaola-defined roles. Subagent capability belongs to the Agent
Harness; however the harness supports and specifies it, Kaola follows its native rules. This is a
deletion, not a rename of the seven roles, not roles hidden in prompts, not a new default model
set, and not a ban on the harness's own subagents. An explicit user choice still wins.

## Decision

1. **No roles anywhere.** Kaola-Workflow ships no role authority, no role profile on any runtime,
   no profile generator or generated-profile manifest, no Codex `agents.toml` registration, no
   role→model map, and no pinned subagent model or effort. Deleted: `templates/agents/behavior-
   contracts.json`, `scripts/generate-agent-profiles.js`, `agents/` (seven Claude profiles and the
   manifest), `plugins/*/agents/` (21 Codex profiles), `plugins/*/config/agents.toml`,
   `scripts/validate-vendored-agents.js`, and the Grok/Cursor edition agent renders.
2. **The dispatch contract is native-only.** `templates/routing/dispatch-contract.md` states that
   Kaola defines no subagent roles, role profiles, or subagent model and effort bindings; that
   dispatch goes through the host's native tool, schema, and catalog, with the host's defaults,
   limits, and permissions and the user's explicit instructions deciding model, effort, tools,
   nesting, concurrency, isolation, and resume; that a required native type parameter takes a type
   the host reports, under its real meaning; and that Kaola installing no profiles is never
   evidence that the host lacks subagent capability. The per-item dispatch-or-inline judgment,
   the evidence-not-verdict handback, and the bounded brief stay: they are Kaola's orchestration
   contract, not a role layer.
3. **Custody is a task/result constraint.** Test custody reads "when someone other than the
   implementing context holds the acceptance tests, the implementation does not delete, weaken, or
   reinterpret them"; a finalize repair goes through the host's native route with a self-sufficient
   brief and may change acceptance meaning only where the orchestrator holds it. The claim, mission
   ledger, worktree, validation, finalize, archive, and sink contracts are unchanged.
4. **Runtime adapter facts stay, as facts.** `templates/agents/runtime-capabilities.json`
   (schema 2) keeps each runtime's measured instruction loading, hook scope, native subagent
   routes and their availability, compact-recovery carrier, and install scope. Every role,
   profile, and model-binding capability (`named_roles`, `role_dispatch`, `subagent_default`,
   `model_carrier`, `profile_format`, `tool_binding`, `dispatch_conformance`, `capability_gap`, …)
   is gone and `scripts/runtime-adapter-facts.js` rejects its return. Unknown capability stays
   unknown.
5. **Mixed-duty tools keep their unrelated duties.** `kaola-workflow-resolve-agent-model.js` keeps
   only the Codex session proof (the model and effort the current Codex session actually runs);
   the kernel keeps only the retired Codex profile inventory (`MANIFEST_BASENAME`,
   `RETIRED_PROFILE_FILES`) as ownership candidates for migration; the Codex preflight/doctor no
   longer requires or validates profiles and instead reports retired-role residue in a
   Kaola-owned location; `kaola-workflow-cursor-surface.js` stops shipping agents.
6. **Migration removes only what Kaola can prove it owns.** Install, upgrade, reinstall, and
   uninstall stop installing roles and remove earlier Kaola profiles, managed config blocks, model
   bindings, and receipts only on ownership evidence (manifest plus digest, or a frozen release
   digest); an unprovable, modified, or user-owned file is preserved and reported. The installer
   entry points keep their names.
7. **Negative guard.** `scripts/test-issue-1101-native-only.js` fails when a tracked role profile,
   the generator, the manifest, a role name or roster, a role call card, a cheap/fast child tier, a
   pinned subagent model or effort, a retired adapter capability, a role→model map, or a pinned
   Codex model in the kernel comes back; each detector is mutation-proven.

## Consequences

- Six profile-installing adapters and 42 renders disappear, with their hashes, manifest, sync
  triples, and documentation matrices. Every runtime now follows one principle.
- A harness's built-in subagent types (`general-purpose`, `Explore`, `worker`, `explorer`, …) are
  used under their real meaning; Kaola neither copies nor overrides them.
- The orchestrator can no longer rely on a Kaola-pinned cheaper child; cost control belongs to the
  host's own defaults and the user's configuration.
- Historical ADRs, investigations, CHANGELOG entries, and `kaola-workflow/archive/` keep their
  historical meaning; `templates/agents/provenance.json` and `docs/agents-source.md` keep the
  attribution for the retired contracts that remain readable in git history.

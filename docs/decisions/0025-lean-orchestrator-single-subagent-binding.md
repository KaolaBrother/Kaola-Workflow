# ADR 0025 — Lean orchestrator; one subagent binding per runtime; seven roles

Status: Accepted · Date: 2026-09-12 · Issue: #1062 · Release: 12.0.0

Supersedes ADR 0019's remaining three-tier axis, its 14-role roster, and Heavy as the planner-class
default; supersedes ADR 0021's "exactly three intent classes"; supersedes the D-687-01 structural
guarantee that Codex profiles omit both runtime-strength keys. ADR 0017 (the Mission List) and ADR
0024 (finalize measures; one authority per constant) are unaffected. #1059's "when more power is
needed, the main orchestrator does the work itself" continues and is carried to its conclusion here.

## Context

The workflow was built when the orchestrator was the weak link, so judgment was spread across a
graded roster: a `standard / reasoning / heavy` intent axis, fourteen roles, and per-tier model
bindings on every runtime adapter. Three facts, measured on 2026-09-12 against the tree at
`db5c3484` (release 11.1.1), no longer support that shape.

1. **Observed: the strongest reviewers overreached.** ADR 0019 §1 records the failure that first
   motivated a tier above `reasoning`: top-tier review output re-litigated architecture and proposed
   redesigns the dispatch never asked about, and the orchestrator then spent its own context
   narrowing the scope again. That observation stands; it argues for a cheaper, scope-clamped
   reviewer, not a stronger one.
2. **Observed: most of the roster was never dispatched.** Across the 81 archived ADR-0017-format
   Mission Lists (33 from the `10xx` era), `dispatched` fields named `tdd-guide` 187 times,
   `implementer` 160, `investigator` 80, `code-reviewer` 42, `doc-updater` 43, `adversarial-verifier`
   37 (single-dispatched once), `code-explorer` 15, and then `planner` 3, `code-architect` 3,
   `security-reviewer` 2 (never alone), `knowledge-lookup` 2, `build-error-resolver` 1,
   `metric-optimizer` 1 (a FAIL), `synthesizer` 0. Roughly a third of `10xx` items were
   `dispatched: self`. Planning and design were essentially never delegated: the Heavy tier was
   already dead in practice, and the Reasoning tier's real use was `code-reviewer` plus the
   `adversarial-verifier` dispatched alongside it. Meanwhile the full roster cost 140 native
   renders, contract validators, edition suites, and documentation matrices on every change.
3. **Owner value decisions (Yanlei, 2026-09-12).** The main session runs the strongest available
   model so the final result is right and the orchestrator has full autonomy; a subagent exists for
   one reason, to do token-heavy work on a cheaper model. Independent review and the
   `tdd-guide`/`implementer` split are tools the orchestrator may pick up, not structural
   requirements. On a runtime where a subagent cannot be made cheaper — because children inherit the
   session model (OpenCode, Kimi, ZCode) or because a vendor router chooses the child model and a
   Kaola profile has no lever on that axis (Devin) — Kaola installs no role profiles at all and the
   orchestrator dispatches through the vendor's native harness. Owner's words: "if subagents cannot
   save cost on an agent runtime, just use the vendor's own harness."

Vendor documentation read on 2026-09-12 is consistent with this direction without dictating it.
Strong-model judgment with cheaper-model execution is an official shape (Claude Code's `opusplan`
alias; Gemini CLI's "strategic orchestrator"); subagents are context isolation that returns a summary
(Anthropic, Cursor, Codex all say so); dispatch is not free (Codex: "subagent workflows consume more
tokens than comparable single-agent runs"; Anthropic measured multi-agent research at about 15× chat
tokens). No vendor defaults every subagent to a cheap tier — the default everywhere is `inherit` —
so "one cheap binding for all subagents" is recorded here as the Owner's value choice, not as a best
practice. A clean-context reviewer catching what the author's context cannot is supported by Claude
Code's best-practices page and by Cognition's measured review results, which is why one independent
review route survives as an option. Prompt-cache pricing (Anthropic, OpenAI, Google, xAI: cached
reads at roughly a tenth of fresh input) supports keeping the main session one continuous prefix and
pushing prefix-breaking work (logs, search results, large diff generation) into children; no vendor
publishes a coding-scenario net-cost comparison between "one long main session" and "many fresh
children", and this ADR does not pretend to have that number.

## Decision

1. **The orchestrator holds judgment.** Issue selection and decomposition, design, the reading of
   acceptance meaning, the final verdict on a candidate it has actually read (the diff and the
   findings, not the `result` prose), and finalization are the orchestrator's. Subagents execute in
   a clean context and hand back evidence. `next.skeleton.md` states this in one sentence;
   `dispatch-contract.md` carries the mindset (below) and nothing mechanical.
2. **The intent axis is retired, not collapsed to one value.** `intent_class` leaves
   `behavior-contracts.json`; `intent_mapping` and `delegation_guidance.tiers` leave every adapter in
   `runtime-capabilities.json`. A single-valued enum is dead vocabulary that invites re-expansion, so
   the axis is gone entirely. Each adapter that still installs profiles declares exactly one
   `subagent_default` (`model`, optional `effort`, and a one-sentence `summary` the rendered
   `KW-RUNTIME-DELEGATION` block prints as `**Subagent default:**`). ADR 0021's clause survives in
   new words: the subagent default binding guides selection but never disables a task-sensitive
   override the host actually exposes; Kaola adds no surface for that override.
3. **Fourteen roles become seven.** Retained: `implementer`, `tdd-guide`, `doc-updater` (produce);
   `investigator`, `code-explorer`, `knowledge-lookup` (read and measure, protecting the main
   context); `code-reviewer` (independent check). Retired, with their capability kept as a brief
   mode of a surviving role rather than a profile:
   - `adversarial-verifier` → a `code-reviewer` brief that names the claim to refute;
   - `security-reviewer` → a `code-reviewer` brief focused on trust boundaries and exploitability;
   - `build-error-resolver` → an `implementer` brief; its two constraints (do not change dependency
     resolution or architecture to get green — report it instead; do not disable or narrow a check
     to silence it) move into the `implementer` body as general constraints (`behavior_contract_version` 2);
   - `metric-optimizer` → an `implementer` brief that states the metric, the direction, and the
     correctness boundary;
   - `synthesizer` → the orchestrator resolves conflicts, or asks the user on a real content conflict
     as finalize already says;
   - `planner`, `code-architect` → the orchestrator; a written design, when wanted, goes into the run
     folder by the orchestrator's own hand.
   What is lost is a profile and a tier word, not a capability; Heavy was only ever a default binding.
4. **`code-reviewer` is an optional, cheap, scope-clamped clean-context check.** Its body
   (`behavior_contract_version` 4) positions it as an independent examination of the exact frozen
   candidate; the brief may name a focus (refute a stated claim, trust-boundary and exploitability,
   correctness and test custody) and without one it examines the whole diff; architecture-level
   observations are reported as observations, never expanded into a redesign (ADR 0019 §5's clamp).
   Whether to dispatch it is decided per item; the orchestrator's blind spot is its own design and
   its own reading of acceptance, so the brief gives the reviewer the issue text, the acceptance
   basis, and the frozen diff — not just the orchestrator's design. Finalize's "walk the issue
   statement for every claimed member" is the second guard on the same blind spot.
5. **Mindset, not mechanism.** `dispatch-contract.md` tells the orchestrator three things and adds
   no counter, cap, threshold, or automatic escalation: a subagent is an executor in a clean context
   whose handback is evidence, and the verdict is reached by reading the candidate; the subagent's
   own narrow context is cheap while what the orchestrator reads back costs main context and drives
   compaction, so handbacks are small and structured rather than many and fully read; fan-out pays
   where breadth pays and every handback stays small (exploring, measuring, refuting one claim,
   reviewing one frozen diff along different cuts, producing candidates to choose between) and is
   harmful when it writes the same production surface in parallel or asks the same model the same
   question again — more dispatch changes the cut, not the count. "Supplies independent judgment"
   becomes "lets a clean context check what your own cannot", because judgment is the orchestrator's.
   When the cheaper child keeps failing an item the orchestrator finishes it inline (#1059); that is
   a judgment sentence, not an escalation ladder.
6. **No role dispatch is written as mandatory.** The `tdd-guide`/`implementer` guard is conditional
   ("when a `tdd-guide` holds the acceptance tests, the implementer does not delete, weaken, or
   reinterpret them to pass; when you wrote the tests yourself, you hold that meaning"). Writing the
   tests, implementing, and reviewing oneself are legitimate paths. Finalize's failure routing is
   written as suggested routes (`tdd-guide` or yourself; `implementer` or yourself; after your own
   verdict on a review finding, `implementer` or yourself) and its dispatch example names
   `implementer` with no `model=` field. `custody` keeps its meaning at the brief level (who owns this
   brief's output); the category "custody-bearing named role" is gone.
7. **Runtimes split into two classes by whether Kaola has a cost lever.**

   | Runtime | Kaola role profiles | Subagent binding and carrier |
   |---|---|---|
   | Claude Code | 7 | profile frontmatter `model: sonnet`; effort not pinned |
   | Codex (GitHub, GitLab, Gitea plugins) | 7 TOML each | TOML pins `model = "gpt-5.6-luna"` and `model_reasoning_effort = "max"`; file values take precedence over spawn parameters and the parent session, so dispatch omits per-call `model`/`reasoning_effort` |
   | Grok Build | 7 | `model: grok-4.6` + `effort: medium` (`model: inherit` retired; `AgentDefinition.model` accepts a concrete id) |
   | Cursor | 7 | `model: grok-4.6[effort=medium]`; the call omits `model` because a custom subagent that omits it inherits the parent and is not routed by Auto |
   | Devin | none | vendor harness: `run_subagent` / `read_subagent` with built-in `subagent_general` or user-owned profiles; an unpinned custom profile would be routed by the organization's Default subagent model router, a lever Kaola does not own |
   | OpenCode | none | vendor harness (`general` / `explore` / `scout`); children inherit the session model and variant; the `KAOLA_OPENCODE_*_MODEL` scaffold retired |
   | Kimi Code | none | vendor harness (`coder` / `explore` / `plan`, `AgentSwarm`); children inherit the session |
   | ZCode | none | vendor harness (`general-purpose` / `Explore`); children follow the main Agent |

   Binding adapters keep `role_dispatch: "named_profile"` and gain `subagent_default`; Codex and
   Grok `model_carrier` become `profile_model_effort`, the value Cursor already carried. The four
   others carry
   `role_dispatch: "native_only"`, `named_roles: false`, `deterministic_profiles: false`, no
   `subagent_default`, and a `delegation_guidance` of exactly `native_routes` and `availability`.
   On those four, the absence of a named Kaola role is design, not a `capability_gap`; the rendered
   adapter block says so and points at the dispatch contract's per-item choice. The generator renders
   7 × 6 = 42 native profiles (was 14 × 10 = 140); the four native_only editions render commands,
   skills, hooks, and the global contract only, and their installers remove the fourteen profiles an
   earlier release deployed, recognising Kaola ownership by the managed marker (and, where a manifest
   exists, its recorded hash) and never touching a user-owned file.
8. **Codex pins `gpt-5.6-luna` at `max` in the file.** #1059's reason stands: `luna` sits below
   `astra` and needs `max` to be reliable, and this repository has dispatched it per call at
   `luna/max` throughout. Moving the pin from the call into the TOML flips the kernel validator and
   the preflight from "both runtime-strength keys must be omitted" to "both must be present and equal
   the binding"; a pre-#1062 installed profile that omits them is classified as migration input and
   reinstalled. `CODEX_PINNED_STANDARD/REASONING/HEAVY_ROLES` become one `CODEX_PINNED_ROLES` plus
   `CODEX_PINNED_MODEL` / `CODEX_PINNED_EFFORT`.
9. **Version.** Deleting installed role directories and dispatch vocabulary breaks consumers that
   dispatch a retired name (they fall into the inline `capability_gap` path), so the release is major:
   11.1.1 → 12.0.0, Codex plugin versions in lockstep. The changelog carries the migration map above
   and the fact that every machine must rerun `./install-all.sh --yes` and Cursor Cloud must rebuild
   its environment before the new adapter blocks take effect.

## Consequences

- Always-loaded carriers (`~/.claude/commands`, the Codex SessionStart carrier, `~/.grok/rules`,
  `~/.cursor/rules/kaola-workflow-global.mdc`, `~/.config/devin/AGENTS.md`, the OpenCode / Kimi /
  ZCode global carriers) render `**Subagent default:**` / `**Roles:**` or the native_only sentence
  only after reinstall; until then a machine runs the 11.1.1 blocks. Devin's profile catalog is fixed
  at session start, so the removal takes effect on the next session.
- A cheaper reviewer may miss finer defects; the mitigation is structural — the orchestrator reads the
  diff itself and the reviewer is a second signal, never the verdict.
- Consumer repositories that hard-coded a retired role name in a brief dispatch inline with a
  `capability_gap` on the six binding runtimes, and use a native route on the four native_only ones.
- On OpenCode, Kimi, ZCode, and Devin, Kaola no longer offers a clean-context named role at all; the
  vendor's own general/explore routes are the clean context. This is the Owner's stated trade-off,
  not a defect.
- A one-off, bounded before/after cost comparison from provider usage panels is Owner-owned and is
  recorded as an issue comment when done; it does not block closure and no run-cost ledger is built
  (the `_rules.md` ruling stands).
- Open, non-blocking follow-ups recorded in #1062 §10: Codex issues openai/codex #33667 / #33881
  report TOML `model`/`model_reasoning_effort` being ignored on some builds (verify one child's
  `turn_context` on the Owner's machine); Grok CLI 1.0.5 recorded a pinned-medium child at `high`
  under an xhigh parent (re-measure with `model: grok-4.6` pinned); whether Cursor
  `grok-4.6[effort=medium]` lands on Fast pricing (read `providerOptions.cursor.modelName`).

## Not built

Recorded so they are not silently re-proposed: automatic escalation, dispatch counters, caps,
parallel schedulers, or checkers; a review gate or machine-parsed reviewer protocol (ADR 0024);
any Kaola role profile or model scaffold on OpenCode / Kimi / ZCode / Devin; a swarm that writes the
same surface in parallel; a run-cost ledger; recording Grok Build's built-in
`/workflow review-changes` / `/deep-research` as `native_routes` (Owner decision, no follow-up
issue); a single-valued tier axis kept "for later".

## Sources

Issue #1062 body and its two appendix comments (external research and repository analysis, both
2026-09-12) hold the full evidence. Vendor pages read 2026-09-12: code.claude.com `model-config`,
`sub-agents`, `best-practices`; cursor.com/docs/subagents (custom subagent omitting `model`
inherits the parent); developers.openai.com/codex subagents (TOML field precedence over spawn
parameters); xai-org/grok-build `config.rs` and `16-subagents.md` (`AgentDefinition.model`);
docs.devin.ai/cli/subagents (Default subagent model router); zcode.z.ai/docs/subagents (omitted
`model` follows the main Agent). Dated publications: Anthropic multi-agent research system
(2025-06-13) and "Effective context engineering for AI agents" (2025-09-29); Cognition "Don't Build
Multi-Agents" (2025-06-12) and "Multi-agents working" (2026-04-22); Huang et al., arXiv 2310.01798;
Manus context engineering (2025-07-18). Local: `kaola-workflow/archive/` Mission List statistics
(method in #1062 §3), ADR 0016–0024, `kaola-workflow/.roadmap/_rules.md`.

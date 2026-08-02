evidence-binding: doc-updater 14a8cd0db8e5

status: DOCKED
issue: #924
working_tree: /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-924
reviewed_candidate_files: 15
final_audit_doc_edits: none

## Ground truth reviewed

The candidate changes exactly these 15 files:

- `CHANGELOG.md`
- `README.md`
- `docs/api.md`
- `docs/architecture.md`
- `docs/conventions.md`
- `docs/decisions/D-687-01.md`
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
- `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md`
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md`
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md`
- `scripts/test-route-reachability.js`
- `templates/routing/next.skeleton.md`
- `templates/routing/finalize.skeleton.md`

The two skeletons and all six generated Codex dispatch skills agree on the live contract:

- existing role classifications are unchanged;
- standard dispatch is `gpt-5.6-luna` with `max` effort;
- reasoning dispatch is `gpt-5.6-sol` with `xhigh` effort;
- temporary standard `gpt-5.6-sol` with `medium` effort requires one independently applicable,
  task-specific trigger recorded before spawn: broad repository understanding, serial latency or
  cost erosion, repeated concrete Luna failures, or architecture/migration/subtle persistent-state
  risk;
- routine implementation is not a trigger and the override changes neither classification nor later
  defaults;
- unavailable Luna/max fails closed to a recorded inline outcome without silent substitution, and
  unavailability alone does not make Sol/medium eligible;
- both `model` and `reasoning_effort` are required at the live Codex next/finalize call sites.

No CLI flag, configuration key, environment variable, schema field, role-profile field, installer
behavior, preflight behavior, classification, lifecycle state, scheduler behavior, or worktree
behavior changes in this candidate.

## Documentation docking

| Surface | Result | Reconciliation |
|---|---|---|
| `README.md` | DOCKED | User-facing role-tier and Codex setup text now states the exact per-spawn pairs, closed four-trigger override, inline capability outcome, unpinned profiles, and unchanged non-Codex routing. |
| `docs/api.md` | DOCKED | The existing agent-model-resolution section now distinguishes Claude resolution from the Codex native spawn packet and documents only the real `model` and `reasoning_effort` dispatch inputs; no CLI or repository schema was invented. |
| `CHANGELOG.md` | DOCKED | The active top release section, `[9.3.0] - 2026-08-02`, contains one concise #924 entry covering the mapping, closed override, and unavailable-capability outcome. |
| `docs/architecture.md` | DOCKED | No structure changed. Its existing model-resolution passage nevertheless directly contradicted the new behavior, so it was narrowly reconciled; no diagram, hierarchy, or unrelated architecture section changed. |
| `docs/conventions.md` | DOCKED | The native Codex packet now carries both fields and the policy is explicitly located only in live `kaola-workflow-next` / `kaola-workflow-finalize` dispatch. It states that `kaola-workflow-init` does not render the policy into runtime-neutral shared guidance. |
| `docs/decisions/D-687-01.md` | DOCKED | Historical #687 reasoning is preserved and narrowly qualified by #924; superseded parent-inheritance consequences are labeled historical rather than rewritten as if they were current. |

No further documentation edit was needed during this final audit.

## No-impact documentation surfaces

- `docs/README.md`: no new document or documentation-tree entry was added, so the index has nothing
  to register.
- `docs/workflow-state-contract.md`: no workflow-state, mission-list, receipt, or durable-field change.
- `docs/agents-source.md`: no role source, generated reviewer source, or attribution change.
- `docs/opencode-edition.md` and `docs/kimi-edition.md`: the candidate is Codex-only and explicitly
  preserves both additive runtimes' routing.
- `CLAUDE.md`, `AGENTS.md`, `templates/routing/init.skeleton.md`, and all six generated init surfaces:
  no shared repository guidance rule changed. The init skeleton and all init surfaces are byte-clean
  against `origin/main`.
- Claude next/finalize command surfaces: byte-clean against `origin/main`; the skeleton change is
  confined to declared Codex skill regions, and generation reproduces the unchanged command bytes.
- Inline production comments: no public script interface changed, so no production comment update is
  owed. The focused test contains its own scoped rationale for the prose-contract validator.
- Roadmap and issue-state documentation: no roadmap structure, issue lifecycle, or state contract
  changed.

## Validation evidence

- `git diff --check origin/main` — passed.
- `node scripts/test-route-reachability.js` — passed: 456 assertions.
- `node scripts/generate-routing-surfaces.js --check` — passed: all 18 surfaces byte-match their
  skeletons.
- `git diff --name-only origin/main | wc -l` — `15`.
- Exact `git diff --name-only origin/main` review — only the 15 candidate files listed above.
- Scoped `git diff --quiet origin/main -- ...` over the init skeleton, all init surfaces, and all
  Claude next/finalize command surfaces — passed with no changed path.
- Focused search across both skeletons and all six generated skills confirmed the exact standard,
  reasoning, four-trigger, fail-closed inline, no-availability-fallback, and two-field call-site
  clauses on every dispatched surface.
- Focused contradictory-claim search across the six direct docs returned no live claim that Codex
  reads the dispatch pair from profiles, forbids per-spawn values, or omits transient model/effort.
- One preliminary supplemental `rg` invocation used Markdown backticks inside a double-quoted shell
  pattern, causing zsh to attempt `model` and `reasoning_effort` command substitutions and print two
  `command not found` diagnostics. It made no filesystem change and was rerun with safe single-quoted
  patterns; the rerun passed and produced the evidence described above.

## Remaining documentation risks

No open docking gap. Luna/max availability remains a runtime capability fact rather than a promise;
the documented contract handles that fact explicitly by recording the mismatch and doing the work
inline without substituting another model pair.

## Result location

The docked documentation is in the six direct documentation files listed in the table above. This
full audit record is `/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/issue-924/.cache/doc-updater.md`.

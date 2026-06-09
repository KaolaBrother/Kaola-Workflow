# Conventions

Document coding style, testing rules, Git practices, naming, and review expectations.

## Subagent Seam Rule (issue #277)

The lean-orchestrator boundary is enforced through role-profile placement, not agent willpower.

- **Procedure lives in agent profiles.** The complete Finalization procedure (scripts, bookkeeping, archive, roadmap regen) lives solely in the `contractor` agent profile. The claim + author + adaptive-handoff procedure lives solely in the `workflow-planner` profile. Orchestrator command files (`finalize.md`, `kaola-workflow-adapt.md`) keep only thin dispatch handles — they invoke the contractor or planner subagent and wait for their result; they do not duplicate bookkeeping inline.
- **Main runs dispatch handles, the per-node loop, and the sink.** The main Opus session dispatches subagents and judges their output. It also owns the adaptive per-node lifecycle transactions (`kaola-workflow-adaptive-node.js`, main-direct by design) and the Finalization sink (merge/PR + issue close). These two are explicitly out of attestation scope.
- **Script-side enforcement.** `validate-workflow-contracts.js` text-locks the contractor dispatch handle on all four editions. A contractor-reference removal from an orchestrator command file fails the contract gate.

## Codex Subagent Dispatch (issue #266)

Codex subagent dispatch uses a **native role-dispatch packet**, not a Claude `Agent(subagent_type=..., model=...)` call. When the main Codex session invokes a Kaola subagent, it names the installed agent role and passes a dispatch packet:

- `role` — the installed agent role name (e.g. `workflow-planner`, `contractor`)
- `prompt` — the task prompt
- `cwd` — the working directory
- `expected_cache` — the expected evidence-cache path(s)
- `declared_write_set` — the files this node may write
- `model` — the resolved model, read from the installed `.codex/agents/kaola-workflow/<role>.toml` profile (via `resolve-agent-model`)

Do not present Claude `Agent(...)` call-syntax as the Codex runtime contract.

**No-silent-inline-fallback rule (hard gate):** Before any `subagent-invoked` compliance row is written, `kaola-workflow-codex-preflight.js` MUST return `status:"ok"` (exit 0). A non-ok preflight result is a STOP — the caller records a typed refusal, not an inline execution. There is no silent fallback when role profiles are absent or stale; the preflight gate is the enforcement point for the `delegation_policy: delegate` / `subagent-invoked` contract (see `docs/workflow-state-contract.md` § Workflow State Fields). Specifically:

- `subagent-invoked` — only valid after preflight passes.
- `local-fallback-tool-unavailable` — only valid when subagent tooling is genuinely unavailable (runtime detection, not a silent config-drift shortcut).
- `local-fallback-explicit` — only valid when the user explicitly set `delegation_policy: local-authorized`.

See `docs/api.md` § Codex Harness Scripts for the preflight CLI and typed-refusal shapes.

## Testing — Cross-Edition Validation (issue #307)

The repo ships four editions (claude / codex / gitlab / gitea), each with its own validators and walkthroughs wired as a separate `npm` chain: `test:kaola-workflow:claude`, `:codex`, `:gitlab`, `:gitea`. `npm test` runs all four — but **chained with `&&`, so it short-circuits on the first failure**. A red codex/gitlab/gitea chain sitting *behind* a green claude chain is therefore never reached, and a Finalization gate that records only `npm test` (or only the claude walkthrough) can ship a change that broke an edition validator or walkthrough undetected.

- **A cross-edition diff MUST have all four chains green, recorded before Finalization.** "Cross-edition" = the diff touches any of: `plugins/kaola-workflow-{gitlab,gitea}/…`, the codex `validate-kaola-workflow-contracts.js`, or any edition-port script (the forge-renamed `kaola-{gitlab,gitea}-workflow-*.js`, the codex byte-mirrors under `plugins/kaola-workflow/scripts/`, or shared scripts in `COMMON_SCRIPTS` / `BYTE_IDENTICAL_GROUPS`).
- **Run the four chains sequentially**, not in parallel — concurrent runs trip the known `testClosureAuditExecuteLabelRemovalTimeoutBreaks` CPU-contention timing flake. The canonical invocation is in `CLAUDE.md` § Running Tests.
- A claude-only green is **insufficient evidence** for such a diff: surface each chain's exit code, do not infer the other three from `npm test` passing.

## Bundle Lane — Cross-Edition Requirement (issue #328)

The bundle lane (`--target-issues` / `KAOLA_TARGET_ISSUES` / `issue-scout`) spans all four editions. Any change to bundle-related code — `claimExplicitBundle`, `claimBundle`, bundle state fields, bundle branch naming, bundle finalization, or the `issue-scout` agent file — is a **cross-edition diff** and MUST have all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green before Finalization. The cross-edition validation rules from § Testing — Cross-Edition Validation apply without exception.

## Release

- Before merging a version bump, create the matching local git tag (`git tag kaola-workflow--v<version> <sha>`); `npm test` enforces the tag exists (unless `KAOLA_WORKFLOW_OFFLINE=1`).

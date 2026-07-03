evidence-binding: n2-preflight b7c91606027c
delegation_outcome: completed

# n2-preflight — Codex preflight/installer report MultiAgentV2 concurrency + wait-timeout bounds (AC6)

TDD RED→GREEN. Extends the existing #598-style dispatch-posture report (kaola-workflow-codex-preflight.js
+ install-codex-agent-profiles.js) with the effective v2 slot budget + wait-timeout bounds, version-guarded
the same way, per issue Design arm F and the "Slot semantics — resolved by controlled probe" section.

## RED (captured against the pre-fix code via `git stash` of all 7 production files, test-only diff live)

RED: `scripts/test-install-model-rendering.js` new `assertMultiAgentV2BoundsForConfig` fixture "#611 v2 not
enabled -> not_applicable, all null" — `AssertionError [ERR_ASSERTION]: #611 v2 not enabled -> not_applicable,
all null: expected max_concurrent_threads_per_session null, got undefined` (no such field existed on the
preflight JSON envelope before this change; confirms the new fields are genuinely new, not already present).

## GREEN (post-implementation)

GREEN: `node scripts/test-install-model-rendering.js` → `Install model rendering tests passed` (all existing
+ new #611 fixtures: pure-function `deriveMultiAgentV2Bounds` unit matrix on both the installer's and the
preflight's copy, the E2E `--json` preflight fixture matrix via `assertMultiAgentV2BoundsForConfig`, and the
installer stdout REPORT assertions for a fresh install + a re-install with explicit v2 bounds configured).
GREEN: `node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` → `Kaola-Workflow Codex
walkthrough simulation passed` (new `testCodexMultiAgentV2Bounds611`, wired into the call list right after
`testCodexDispatchPosture598`).
GREEN: `node scripts/validate-script-sync.js` → `OK: 24 common scripts, 25 byte-identical groups, ...` (the
preflight ×4 and installer ×3 sync groups stay byte-identical after the edit).
GREEN: `node scripts/validate-kaola-workflow-contracts.js` → `Kaola-Workflow Codex contract validation passed`.
GREEN: `npm run test:kaola-workflow:codex` (validate-script-sync + validate-kaola-workflow-contracts + the
codex walkthrough + test-active-folders-field-parity) → all green, ends `active-folders-field-parity tests
passed (61 assertions)`.
GREEN (spot-check, not the full four-chain — that is n6-review's obligation): both forge-codex walkthroughs
that exercise the byte-identical installer/preflight copies also pass — `node
plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js` → `GitLab Codex workflow
walkthrough simulation passed`; `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js`
→ `Gitea Codex workflow walkthrough simulation passed`.

## Report shape (JSON, additive — 6 new fields alongside the existing 5 `dispatch_posture*`/`dispatch_mode*` fields)

Added to every `runPreflight` result branch (ok/global-scope/all typed refusals/autofix-then-ok), every
`runDoctor` scope (user/project/plugin_cache), and `scopeReport()`:

```
max_concurrent_threads_per_session: number | null,
max_concurrent_threads_per_session_source: 'config' | 'observed_default' | 'not_applicable' | 'n/a',
effective_subagent_width: number | null,
min_wait_timeout_ms: number | null,
max_wait_timeout_ms: number | null,
default_wait_timeout_ms: number | null,
```

Gating + defaults chosen (documented inline in both files, `MULTI_AGENT_V2_BOUNDS_NOTE` +
`OBSERVED_DEFAULT_MAX_CONCURRENT_THREADS_PER_SESSION = 4`):
- All six fields are gated on `multi_agent_v2_enabled` (the same boolean `detectCodexDispatchMode` already
  derives) — when v2 is not active, every field reports `null`/`not_applicable` (mirrors how `dispatch_posture`
  itself collapses to `'none'` when features are off). This matches AC6's own framing ("report effective **v2**
  slots") — the width concept is v2-specific.
- `max_concurrent_threads_per_session`: when present and a positive integer, reported verbatim
  (`source: 'config'`); when absent OR non-positive/non-integer (Codex's own validator rejects <1 per the
  binary's embedded error string, confirmed via `strings` on the installed codex-tui 0.142.5 binary on this
  box), falls back to the OBSERVED default of 4 (`source: 'observed_default'`) — this default comes from the
  issue's own controlled probe evidence ("4 available concurrency slots, including you"), NOT from published
  Codex docs, so it is explicitly labeled observed rather than asserted as guaranteed behavior (Non-Negotiable
  Rule: verify facts, don't fabricate).
- `effective_subagent_width = max(threads - 1, 0)` — the budget INCLUDES the orchestrator thread per the
  issue's Design arm F.
- `min_wait_timeout_ms` / `max_wait_timeout_ms` / `default_wait_timeout_ms`: read ONLY when explicitly present
  in `[features.multi_agent_v2]` (either the inline-object or dotted-table TOML syntax — both already parsed
  elsewhere in this file for `enabled`); `null` when absent. Deliberately NO fabricated numeric fallback for
  these three — I could not find an independently verified Codex-published default for them (checked the
  issue's own evidence, README.md's existing Codex audit section, and `strings`-searched the installed
  codex-tui 0.142.5 binary for the three key names — only found the struct field names / validation-error
  strings, no default constant), so "report absent values as the documented defaults" is honored literally:
  only `max_concurrent_threads_per_session` has one.
- `MULTI_AGENT_V2_BOUNDS_NOTE`: documents the recommended `[features.multi_agent_v2]` block naming
  `max_concurrent_threads_per_session` + `max_wait_timeout_ms` (per the issue's exact framing) with an
  illustrative example, states `[agents].max_threads` is invalid once v2 is enabled, and carries the same
  `codex-tui 0.142.5` version-guard as `DISPATCH_POSTURE_VERSION_NOTE`. Printed unconditionally by the
  installer (mirrors how `DISPATCH_POSTURE_VERSION_NOTE` is always printed); preflight prints a `note:`
  concrete-width line only when v2 is active (mirrors the `warn:` line for a non-proactive posture).

## Write-set / edition sync

- Canonical edits: `scripts/kaola-workflow-codex-preflight.js` (root) + `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js`,
  byte-copied to the gitlab/gitea preflight (×4 total) and installer (×3 total) sync groups —
  `node scripts/validate-script-sync.js` confirms byte-identity.
- `scripts/test-install-model-rendering.js`: new pure-function fixture block (`boundsFixtures`, exercised
  against BOTH the installer's and the preflight's copy of `deriveMultiAgentV2Bounds` — the semantic
  lock-step check the whole-file byte-identity validator cannot itself express, mirroring the existing
  `postureFixtures` pattern), a new E2E `--json` fixture matrix (`assertMultiAgentV2BoundsForConfig`), and
  installer-stdout REPORT assertions appended to the existing `postureProj`/`postureHome` fixture.
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`: new `testCodexMultiAgentV2Bounds611`
  function + wired into the call list.
- All 9 declared write-set files touched; nothing outside the set (`git status --short` shows exactly these
  9 paths).

## Deviations / notes for siblings

- Did NOT touch README.md's "Config audit for effort-safe subagents" section (not in this node's declared
  write set) — n5-docs should consider whether the new report fields/recommended-config note warrant a
  README mention there, alongside the AC6 decision-record note.
- Did NOT touch docs/api.md's "Codex Harness Scripts" JSON field enumeration (also not in this node's
  write set, and it's inside n5-docs's declared write set) — the 6 new fields listed above (report shape
  section) are ready to hand off verbatim for that doc update.
- Testing caution for future runs: an installer invocation WITHOUT an explicit `HOME=` override touches the
  REAL `~/.codex` global hooks/stable-home (hooks are intentionally global, not project-scoped) — I made this
  mistake once during manual smoke-testing (installer invoked without `HOME=` override) and verified
  afterward via `~/.codex/hooks.json` mtime that no actual mutation occurred (content-identical no-op, stale
  mtime unchanged from a prior real install), but always pass `HOME=<tmpdir>` for any manual installer
  invocation to avoid this risk entirely.
- Did not attempt to derive a verified numeric default for the three wait-timeout fields beyond what the
  issue's own evidence supports (see report-shape section above) — if a future probe pins one down, extend
  `deriveMultiAgentV2Bounds`'s fallback the same way `max_concurrent_threads_per_session` already does.

# #1054 mission 9 — plumbing (item 25, item 28 generator side, hash appendix, item 21 grep)

Implementer: impl-1054-roles. Worktree: `.kw/worktrees/bundle-1054`. Scope: item 25 (per-runtime
compact-recovery dedupe), item 28 generator-side grep, hash-appendix carrier trace, item 21
propagation grep. Did not touch tests/validators/package.json/claim.js/gap-sweep/closure-audit/
finalize.skeleton/docs (owned by other concurrent agents in the shared worktree).

## Item 25 — per-runtime recovery seam

File: `scripts/generate-routing-surfaces.js`.

Seam chosen: a per-runtime flag on `renderCompactRecoveryPrompt`, not the adapter registry.
Inspected `templates/global/runtime-contract-adapters.json` first — its `carrier.kind` is
`"dedicated"` for claude AND grok AND cursor alike, so that field cannot distinguish the
full-dispatch-carrier runtimes (grok/cursor, whose Rule is the host's only always-loaded carrier
of dispatch+adapter) from claude (which needs the same "omit and defer" treatment as codex,
despite also having a `"dedicated"` carrier kind, because claude's Next/Finalize reload already
carries dispatch/adapter). No registry field expressed the actual distinguishing fact, so the
registry was not the right seam; the function-level flag was.

Added:
- `RECOVERY_FULL_DISPATCH_RUNTIMES = ['grok', 'cursor']` (exported) — the runtime set whose
  recovery render is the host's only always-loaded dispatch/adapter carrier.
- `RECOVERY_DISPATCH_DEFERRED_NOTE` — one-sentence pointer used for every other runtime.

`renderCompactRecoveryPrompt` now overrides both the `runtime-dispatch-common` and
`runtime-delegation` slots: grok/cursor keep the full blocks exactly once (byte-unchanged from
before this change); claude/codex collapse to the one-sentence note, with a `\n{3,}` → `\n\n`
cleanup for the resulting blank line from the now-empty second slot.

`scripts/kaola-workflow-global-contract.js`'s `renderContract` previously re-declared
`['grok', 'cursor']` as a second `persistentCompactCarrier` literal — same fact as
`RECOVERY_FULL_DISPATCH_RUNTIMES`, authored twice. Changed it to import and reuse
`routing.RECOVERY_FULL_DISPATCH_RUNTIMES` so the runtime set has one authoring source (also
closes part of item 29, "人工多源", touched by the same fact).

**Orchestrator correction applied on top (not mine):** the deferred claude/codex recovery
renders no longer carry the `<!-- KW-RUNTIME-DISPATCH-START/END -->` markers around the
one-sentence pointer — those markers are now emitted only when the full blocks render (grok/
cursor). `generate-routing-surfaces.js` was regenerated after that correction; the routing/
adapters/edition suites below were re-verified green post-correction (routing 480, runtime
adapters 65, grok-edition 705, cursor-edition 834).

Regenerated via `node scripts/generate-routing-surfaces.js --write` (also refreshed the 5
present edition trees: `.opencode*`, `.kimi*`, `.grok*`, `.cursor*`, `.zcode*`).

Verified content: `hooks/kaola-workflow-compact-recovery.md` (claude) and
`plugins/*/hooks/kaola-workflow-codex-compact-recovery.md` (codex) carry only the deferral
sentence after "Resume the active operation"; grok/cursor renders (checked via
`renderCompactRecoveryPrompt('grok'|'cursor', 'github')`) are unchanged — still include
"Runtime dispatch contract (always loaded)" and the `KW-RUNTIME-DELEGATION-START/END` block.

## Item 28 — generator side

Grepped `scripts/`, `plugins/*/scripts/`, `install*.sh`, `templates/` for `'Prompt Defense'`,
`'Solution ladder'`, `'When Your Tools Fall Short'`, `'review_conclusion'`, `'finding: id='`.

- `'Prompt Defense'`, `'Solution ladder'`, `'When Your Tools Fall Short'`, `'review_conclusion'`:
  zero hits anywhere in production code.
- `'finding: id='`: zero hits in production code. All 5 hits are in **validator** files (test
  custody, not edited, reported instead):
  - `scripts/validate-workflow-contracts.js:779`
  - `scripts/validate-kaola-workflow-contracts.js:362`
  - `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:412`
  - `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js:406`
  - `plugins/kaola-workflow/scripts/validate-workflow-contracts.js:779`
  These all assert `reviewerBody` includes `'finding: id='`, the retired column-zero review
  protocol — matches the coupling already noted for audit item 28 in the earlier
  `roles-rewrite.md` measurement; needs the acceptance/test author to rewrite.

`REQUIRED_COVERAGE` (`scripts/generate-agent-profiles.js:36`) is metadata-completeness only —
checks `contract.coverage[key]` truthiness (one-line summary strings), never body content or
length. Confirmed no coupling from the generator to old long-body shape; a short body generates
and validates cleanly today (`generate-agent-profiles --check` green, `validate-vendored-agents`
green).

## Hash appendix carrier

File: `scripts/generate-agent-profiles.js`, function `runtimeAppendix`.

Traced every consumer of `behavior_contract_hash`, `adapter_capabilities_hash`,
`resolved_profile_hash` across: `install.sh` (`agent_manifest_metadata`,
`refresh_agent_resolved_profile_hash`), `scripts/kaola-workflow-codex-preflight.js`,
`plugins/*/scripts/install-codex-agent-profiles.js`, `scripts/validate-vendored-agents.js`
(`behaviorIdentityFromCore`, `verifyResolvedProfileHash`), and every edition test
(`test-opencode-edition.js`, `test-kimi-edition.js`, `test-grok-edition.js`,
`test-cursor-edition.js`, `test-zcode-edition.js`, `test-install-model-rendering.js`,
`validate-kaola-workflow-contracts.js` + its gitlab/gitea mirrors,
`plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`).

Finding: Claude alone already carries `behavior_contract_version`, `behavior_contract_hash`, and
`resolved_profile_hash` as machine-readable YAML frontmatter (`markdownFrontmatter`, the
`runtime === 'claude'` branch). No installer, preflight, validator, or test reads a second copy
of those three fields from the prose appendix for Claude — `behaviorIdentityFromCore` matches the
first (frontmatter) occurrence and never asserts a count; `verifyResolvedProfileHash` already
required exactly one `resolved_profile_hash` occurrence before this change (the appendix already
skipped it for claude). Additionally, **nothing anywhere reads `adapter_capabilities_hash` for
Claude** — its only real consumers are Codex-specific (`kaola-workflow-codex-preflight.js`,
`install-codex-agent-profiles.js`, and the codex-only `parseCodexAgentIdentity` in
`test-install-model-rendering.js`), which have no frontmatter and need the value in prose.

Change: `runtimeAppendix` now emits only `runtime: <name>` plus the two prose bullets for Claude
(dropping the duplicate `behavior_contract_version`/`behavior_contract_hash` and the unconsumed
`adapter_capabilities_hash`); every other runtime keeps the full 4-line hash block exactly as
before, because prose is their *only* carrier — Codex TOML has no frontmatter at all, and
opencode/kimi/grok/cursor/zcode's `markdownFrontmatter` branches never add hash fields, and their
edition tests do read `behavior_contract_hash`/`behavior_contract_version` from the prose (e.g.
`test-grok-edition.js:592-595`, `test-cursor-edition.js:1457-1460`,
`test-opencode-edition.js:553-556`).

**Unconsumed-field finding, not acted on:** `adapter_capabilities_hash` also has zero consumers
for the five non-Claude, non-Codex runtimes (opencode, kimi, grok, cursor, zcode) — grepped their
edition test files and sync scripts, no hits. Left as-is because removing it there touches 5
runtimes' generated identity blocks and their sync/edition machinery, which is a wider
cross-runtime design call outside this task's stated "claude vs codex" framing; flagging for the
orchestrator/owner to decide rather than acting unilaterally.

Sample verification: `agents/implementer.md` frontmatter carries `behavior_contract_hash` /
`resolved_profile_hash`; its appendix now reads just `runtime: claude` + the two prose bullets.
`plugins/kaola-workflow/agents/implementer.toml` (codex) unchanged shape — all 4 hash lines still
present inside `developer_instructions`.

## Item 21 propagation grep

Searched all generated surfaces and docs for the retired "stays `tdd-guide`" misrouting
sentence. Only literal hit: `kaola-workflow/archive/issue-250/.cache/explore.md:76` — an
**archived historical evidence snapshot**, not a live doc or generated surface; not edited (past
record, not rewritten for new rules per repo convention).
`plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md:105` ("`tdd-guide` for acceptance
meaning, `build-error-resolver` for build/type/lint/tooling...") looked adjacent but is a correct
custody split (acceptance-meaning fixes to tdd-guide, build/tooling fixes to build-error-resolver)
— not the retired misrouting pattern, not a finding.

## Files changed (this implementer)

- `scripts/generate-routing-surfaces.js`
- `scripts/generate-agent-profiles.js`
- `scripts/kaola-workflow-global-contract.js`
- Regenerated (via `--write`, not hand-edited): `hooks/kaola-workflow-compact-recovery.md`;
  `plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/hooks/
  kaola-workflow-codex-compact-recovery.md`; `agents/*.md` (14); `plugins/*/agents/*.toml`
  (14 × 3); `agents/generated-agent-manifest.json`; `plugins/*/config/agents.toml`; the 5 present
  edition trees (`.opencode*`, `.kimi*`, `.grok*`, `.cursor*`, `.zcode*` — gitignored, refreshed
  not committed).

## Verification (tier: build-green — routing/generator surfaces, no new behavioral logic)

```
generate-agent-profiles --check         exit=0  "agent profiles current: 14 roles, seven runtimes, 126 native renders"
generate-routing-surfaces --check       exit=0  "all 24 surfaces byte-match the skeleton"
validate-vendored-agents                exit=0  "Generated agent validation passed for 14 roles"
validate-script-sync                    exit=1  ONLY on kaola-workflow-claim.js — pre-existing concurrent edit by another agent (impl-1054-finalize's in-progress work), confirmed via git status: claim.js dirty in both scripts/ and plugins/kaola-workflow/scripts/, untouched by this implementer
test-install-manifest-single-source     exit=0
test-agent-model-resolver               exit=0
test-issue-1044-prompt-bundle           exit=1  17 failed / 136 passed — EXPECTED per the orchestrator's item-25 note: B2/B5/C1/C2 (claude+codex) assert the dispatch block/byte-budget that no longer renders there by design; acceptance author needs to rewrite for the one-sentence-pointer behavior
test-issue-1044-runtime-adapters        exit=0  65 passed, 0 failed
test:kaola-workflow:editions (8 suites) exit=0  opencode 875 / kimi 824 / grok 705 / cursor 834 / issue-1045-cursor 24 / zcode 854 / zcode-hook 32 / zcode-install 47 — ALL PASS, all 3-tree drift-checks in parity
test-runtime-agent-architecture         exit=1  2 failed / 807 passed — NEW coupling found: A1049 ("...compact carriers/tracked bytes carry the requested tier defaults") pins the tier-roster wording that used to live in Codex's compact-recovery runtime-delegation block, now correctly absent there. Needs acceptance-author update alongside the previously-known A1050 pin (metric-optimizer's retired continuous/pass-rate protocol).
```

Re-verified green after the orchestrator's marker correction: `generate-agent-profiles --check`,
`generate-routing-surfaces --check`, `validate-vendored-agents` all still exit 0; edition suites
(routing 480 assertions via `test-generate-routing-surfaces`, `test-issue-1044-runtime-adapters`
65, grok-edition 705, cursor-edition 834) re-run green post-correction.

Not run per instructions: `npm test`, the integration walkthrough.

## Coupling to hand to the roles/acceptance test author

- `test-runtime-agent-architecture.js` A1049 (new) and A1050 (already known) — both pin retired
  or now-relocated wording tied to the role-body rewrite and the item-25 recovery-slot omission.
- `test-issue-1044-prompt-bundle.js` B2/B5/C1/C2 — assert the dispatch block/byte budget for
  claude/codex compact recovery that item 25 intentionally removed.
- `scripts/validate-workflow-contracts.js:779`, `scripts/validate-kaola-workflow-contracts.js:362`,
  and the gitea/gitlab/plugin mirrors — assert the retired `'finding: id='` column-zero review
  protocol (item 28).

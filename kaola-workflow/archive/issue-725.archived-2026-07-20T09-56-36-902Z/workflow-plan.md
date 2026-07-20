# Workflow Plan — issue #725 (epic Phase D: prompt diet + validator narrowing) — epoch 2 review repair

<!-- plan_hash: cf65f3b4483faeb3643b2027d94b0321e18eccbe30b4efbf690c900998ca31e3 -->

## Meta

project: issue-725
labels: area:scripts, area:workflow-phases, area:workflow-router, enhancement, workflow:in-progress
speculative_open_policy: auto
plan_schema_version: 2
contract_version: 2
epoch_schema_version: 2
plan_epoch: 2
epoch_lineage_id: 38b676b0455daf24e54be04c4959f0a7ab3b353454db2876849df081cb4407bb
parent_plan_hash: 4fd7e95ef6792bd9c1ee0af846b49c51c1f358332974e1d349e87b9553ec6f4c
parent_snapshot_manifest_digest: 0e63f18520a689a4d3bc0b80a95a9a0af9971b1431cda3a208b3a70f22acaa45
claim_root_base_digest: 8f7efe185c6c969d37e68d0c3becfd2cb9b76d8a5f9135d5dc69b4f100c4e197
transition_reason: review_repair_requires_replan
source_evidence_digest: 21d7f75f67b7759085f281c88ceb565fd2295714b5881a237a623f4a4268fe5a
planner_binding: 195ca4e71caa
inherited_frontier_digest: ff81bb20dd3df09d4aed717e1f48d1cfc7c165827600ec01cd258b90c78660bd
inherited_frontier_classes: code,security
validation_command: npm test && node scripts/test-opencode-edition.js && node scripts/test-kimi-edition.js
validation_cwd: .
validation_repetitions: 1
validation_pass_rule: all
validation_timeout_minutes: 120
validation_env_allowlist:
code_certifier: n2-code-certify
security_certifier: n3-security-certify

## Plan Notes

Epoch 2 of the issue #725 Phase D adaptive run. The epoch-1 plan (`plan_hash`
4fd7e95ef6792bd9c1ee0af846b49c51c1f358332974e1d349e87b9553ec6f4c) accumulated the whole Phase D
candidate, but its tail common code certifier `n12-code-certify` returned `verdict: fail` with three
blocking findings on the recorded validation command. This epoch repairs exactly those three findings
against the SAME accumulated candidate (run base `1491c7e5`) and re-certifies. Nothing else in the
epoch-1 diff is re-opened: the certifier's re-execution proved the whole four-chain frontier is green
except the single candidate-caused R1 plus the two pre-existing retired-hook defects R2/R3.

The three findings (from `n12-code-certify` evidence; both pre-existing defects are seeded in
`.cache/run-gaps-manual.md`):
- R1 (in_scope, candidate-caused, high). The Phase D finalize trim folded the `## Validation
  Delegation Policy` heading out of `commands/kaola-workflow-finalize.md`; the out-of-set claude-chain
  test `scripts/test-install-model-rendering.js` pins the literal needle
  `\n\n## Validation Delegation Policy\n\n` in the installed finalize command (as a vehicle for its
  "installer rendering should preserve blank markdown lines" assertion), so the claude chain reds and
  `npm test` short-circuits.
- R2 (pre_existing, high). `scripts/sync-kimi-edition.js` still lists the Phase-C-retired
  `hooks/kaola-workflow-pre-commit.sh` in `HOOK_SCRIPTS` (:58), emits its `[[hooks]]` fragment in
  `renderKimiHooksToml` (:422), and `readFileSync`s it in `writeHooks` (:538), so `test-kimi-edition.js`
  FATALs ENOENT before any assertion.
- R3 (pre_existing, medium). `templates/opencode/plugins/kaola-workflow-hooks.js` still maps
  `preCommit: "kaola-workflow-pre-commit.sh"` (:32, comment :11); the retired hook is no longer
  deployed, so the opencode `hookPath` H1/#F3 fixture resolves null and `test-opencode-edition.js` reds.

Fix approach (all in one cohesive node — same defect class, retired-hook / stale-pin cleanup):
- R1: RE-POINT the blank-line probe. The Phase D trim of the Validation Delegation Policy heading is
  intentional and MUST stay — do NOT restore the trimmed prose. Re-point the
  `test-install-model-rendering.js` assertion at a `\n\n## <heading>\n\n` token that survives the trim
  in the installed finalize command (e.g. `\n\n## Steps\n\n` or another surviving `## ` heading);
  verify by running `node scripts/test-install-model-rendering.js` (exit 0). The assertion's intent
  (install rendering preserves blank markdown lines) is preserved with any surviving heading.
- R2 + R3: complete the Phase-C pre-commit-hook retirement in the two ADDITIVE editions (kimi,
  opencode), matching how Phase C retired it in the claude + three forge editions. Kimi: drop
  `kaola-workflow-pre-commit.sh` from `sync-kimi-edition.js` `HOOK_SCRIPTS` and from
  `renderKimiHooksToml` (the PreToolUse/Bash fragment), and update the mirrored assertions in
  `test-kimi-edition.js` (the `[[hooks]]` block count 4->3, the byte-copied-hook count 3->2, and the
  PreToolUse/Bash pre-commit needle). Opencode: drop `preCommit` from the `HOOK` map + comment in
  `templates/opencode/plugins/kaola-workflow-hooks.js`, and re-point the `test-opencode-edition.js`
  H1/#F3 fixture (`KW_SCRIPT`) to a surviving deployed hook (`kaola-workflow-subagent-dispatch-log.sh`,
  the sole entry still in the opencode `HOOK_SCRIPTS`). Update the `docs/kimi-edition.md` and
  `docs/opencode-edition.md` hook tables to drop the retired-hook rows. Both suites self-render their
  gitignored `.kimi/` / `.opencode/` trees via `sync --write` at test start, so only the generators,
  templates, tests, and docs are edited — no tracked generated artifact.
- CHANGELOG: fold a one-line note into the existing `[Unreleased]` Phase C/D entry recording the
  additive-edition pre-commit-hook retirement and the installer-rendering pin re-point. Write it in the
  SAME implementer node BEFORE the certifier runs the chains so the validation receipt is not
  `chains_stale`.

Certifier walls. This epoch inherits both a code and a security frontier from epoch 1
(`inherited_frontier_classes: code,security`; the epoch-1 candidate touched the security-relevant
`templates/routing/required-blocks.js`), so BOTH a common code certifier (`n2-code-certify`) and a
common security certifier (`n3-security-certify`) post-dominate the sole producer/root
`n1-hook-pin-repair` and re-certify the whole accumulated candidate. They are sequenced
(n1 -> n2 -> n3 -> n4) so each wall lies on every path from the producer to the sink. `n2` re-runs the
full recorded validation command over the final tree (all four `npm` chains plus the opencode and kimi
suites) and re-confirms AC-D; `n3` re-certifies the inherited security frontier shows no regression.

Validation. Cross-edition + additive-edition diff -> the recorded `validation_command`
(`npm test && node scripts/test-opencode-edition.js && node scripts/test-kimi-edition.js`) must be green
end to end. On this host, run the four `npm` chains serially
(`KAOLA_RUN_CHAINS_CONCURRENCY=serial`) to avoid the known git-merge-octopus SIGKILL under concurrent
chain execution; capture real exit codes (never a piped `| tail`). The epoch-1 candidate is unchanged
except the epoch-2 repair diff, so the certifier need only re-run the full command once over the final
tree.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | selector_source | model | wait_budget_minutes | observes | gate_claim | gate_surface | gate_aggregation | certifies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| n1-hook-pin-repair | implementer | — | scripts/test-install-model-rendering.js, scripts/sync-kimi-edition.js, scripts/test-kimi-edition.js, docs/kimi-edition.md, templates/opencode/plugins/kaola-workflow-hooks.js, scripts/test-opencode-edition.js, docs/opencode-edition.md, CHANGELOG.md | 8 | sequence | — | standard | — | — | — | — | — | — |
| n2-code-certify | code-reviewer | n1-hook-pin-repair | — | 1 | sequence | — | reasoning | — | — | the accumulated Phase D candidate (epoch-1 diff plus this epoch's repair) is green over the recorded validation command across all four npm chains plus the opencode and kimi suites — R1 (the installer-rendering blank-line pin) is resolved WITHOUT un-trimming the finalize Validation Delegation Policy prose, R2 (the kimi sync FATAL on the retired pre-commit hook) and R3 (the opencode hooks-template retired-hook resolution) are cleared by completing the Phase-C pre-commit-hook retirement in the additive editions, and AC-D still holds (trim targets met or one-line miss, six-surface contracts and route-reachability green, no provenance token in any prompt surface, the validate-workflow-contracts byte-twin identical, and the #736 self-dev guard intact) | the full accumulated candidate vs run base 1491c7e5 across all four editions plus the opencode/kimi suites, focused on the epoch-2 repair diff and the recorded validation command being green end to end | sequence | — |
| n3-security-certify | security-reviewer | n2-code-certify | — | 1 | sequence | — | reasoning | — | — | the accumulated candidate carries no security regression over the inherited security frontier — the epoch-1 security-relevant surface (templates/routing/required-blocks.js and the routing/contract manifests) keeps its intent, and the epoch-2 repair (test-pin re-point, retired-hook cleanup in the kimi/opencode generators and templates, edition-doc tables, CHANGELOG) introduces no new sensitive behavior, no executable-injection surface, and weakens no guard | the full accumulated candidate vs run base 1491c7e5, with attention to the inherited security frontier (required-blocks.js and the routing/contract surfaces) and the epoch-2 repair diff | sequence | — |
| n4-finalize | finalize | n3-security-certify | — | 1 | sequence | — | — | — | — | — | — | — | — |

## Node Briefs

### n1-hook-pin-repair

Repair the three blocking findings from `n12-code-certify`; declared write set is exactly the eight
files above. Approach:

1. R1 — `scripts/test-install-model-rendering.js`: the assertion at ~:3180-3183 pins
   `finalize.includes('\n\n## Validation Delegation Policy\n\n')` purely to prove install rendering
   preserves blank markdown lines. That heading was intentionally folded out by the Phase D finalize
   trim and must NOT be restored. Re-point the needle to a `\n\n## <heading>\n\n` that survives the
   trim in the installed finalize command (inspect `commands/kaola-workflow-finalize.md` for a stable
   surviving `## ` heading — e.g. `## Steps` — that renders with surrounding blank lines). Keep the
   assertion message intent ("installer rendering should preserve blank markdown lines"). Verify with
   `node scripts/test-install-model-rendering.js` (real exit 0).
2. R2 — kimi edition: in `scripts/sync-kimi-edition.js` remove `'kaola-workflow-pre-commit.sh'` from
   `HOOK_SCRIPTS` (:58) and remove its PreToolUse/Bash `[[hooks]]` fragment from `renderKimiHooksToml`
   (:420-424); confirm no `HOOK_ADAPTATIONS` entry references it. In `scripts/test-kimi-edition.js`
   update the mirrored K7 assertions: `[[hooks]]` block count 4->3, byte-copied-hook count 3->2, and
   remove the PreToolUse/Bash pre-commit needle (:354). The two surviving kimi hooks (write-lane,
   dispatch-log) stay. Verify with `node scripts/test-kimi-edition.js` (real exit 0).
3. R3 — opencode edition: in `templates/opencode/plugins/kaola-workflow-hooks.js` remove
   `preCommit: "kaola-workflow-pre-commit.sh"` from the `HOOK` map (:32) and its comment line (:11).
   In `scripts/test-opencode-edition.js` re-point the H1/#F3 fixture `KW_SCRIPT` (:1137) and the
   resolved-path assertion (:1144) from `kaola-workflow-pre-commit.sh` to
   `kaola-workflow-subagent-dispatch-log.sh` (the sole hook still in the opencode `HOOK_SCRIPTS`, so it
   is the only one deployed and resolvable). Verify with `node scripts/test-opencode-edition.js`
   (real exit 0).
4. Docs: drop the retired `kaola-workflow-pre-commit.sh` rows from the hook tables in
   `docs/kimi-edition.md` (:168) and `docs/opencode-edition.md` (:379).
5. CHANGELOG.md: fold a one-line note into the existing `[Unreleased]` Phase C/D entry — the additive
   kimi/opencode editions' pre-commit-hook references are retired to match Phase C, and the
   installer-rendering blank-line pin is re-pointed after the Phase D finalize trim. Write it in THIS
   node (before the certifier's chain run) so the validation receipt is not `chains_stale`.

Do not touch any epoch-1 surface beyond these eight files. Traps still bind: no grep-and-delete of the
substring "full"; `scripts/classifier.js` and `scripts/validation-runner.js` are untouchable; the 12
routing surfaces are generated (not touched here); no provenance (issue refs, ADR/decision IDs) in any
agent-facing prompt surface — none of the eight files here is a prompt surface, but keep CHANGELOG
provenance in CHANGELOG only.

### n2-code-certify

Common code certifier wall. Read `n1-hook-pin-repair`'s evidence file first. Re-run the FULL recorded
validation command over the final tree with real exit codes:
`npm test && node scripts/test-opencode-edition.js && node scripts/test-kimi-edition.js`, on this host
with `KAOLA_RUN_CHAINS_CONCURRENCY=serial`. Because `npm test` short-circuits on the first `&&`
failure, if any chain reds, also run the failing chain's commands individually (continue-on-failure) to
locate the exact command, as the epoch-1 certifier did. Certify: (a) R1/R2/R3 resolved and the command
green end to end; (b) R1 was fixed by re-pointing the pin, NOT by un-trimming the Validation Delegation
Policy prose (confirm the finalize command still lacks that heading); (c) AC-D still holds over the
accumulated candidate (trim targets, six-surface contracts + route-reachability, provenance-free prompt
surfaces, validate-workflow-contracts byte-twin identical, #736 self-dev guard intact). Record
`verdict: pass` and `findings_blocking: 0` only if all hold; otherwise record the blocking findings.

### n3-security-certify

Common security certifier wall (inherited security frontier from epoch 1). Read `n1-hook-pin-repair`'s
and `n2-code-certify`'s evidence first. Certify the accumulated candidate introduces no security
regression: the inherited security-relevant surface (`templates/routing/required-blocks.js` and the
routing/contract manifests) keeps its guard semantics, and the epoch-2 repair (a re-pointed test pin,
retired-hook removal from the kimi/opencode generators + opencode plugin template, edition-doc tables,
a CHANGELOG line) adds no sensitive behavior, no new executable-injection or path-resolution surface,
and weakens no containment/guard. Record `verdict: pass` / `findings_blocking: 0` if clean.

### n4-finalize

Sink. Finalize the Phase D run as the recorded partial close per the preserved `## Sink` metadata in
`workflow-state.md`: close #718 and #736, keep #725 OPEN with the `workflow:in-progress` label
(Phase E remains). Docs/state only — no code writes. Do not re-run the chains here (the fresh receipt
comes from `n2-code-certify`); a CHANGELOG or chain-asserted-doc write at this stage would make the
receipt stale.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (n1-hook-pin-repair) | subagent-invoked | evidence-binding: n1-hook-pin-repair fb4376cd9880 | |
| code-reviewer (n2-code-certify) | subagent-invoked | evidence-binding: n2-code-certify 4705633604ca | |
| security-reviewer (n3-security-certify) | subagent-invoked | evidence-binding: n3-security-certify 4a9584f553ab | |
| finalize (n4-finalize) | pending | | |

## Node Ledger

| id | status |
| --- | --- |
| n1-hook-pin-repair | complete |
| n2-code-certify | complete |
| n3-security-certify | complete |
| n4-finalize | in_progress |

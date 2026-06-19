evidence-binding: n8-review a3a4ee7ece84
verdict: pass
findings_blocking: 0

# n8-review (G1 code-review gate) — issue #538

Adversarial review of the full uncommitted working-tree diff (58 files, +1143/−1390, net
subtraction). This gate post-dominates the CODE/PROSE frontier (n2–n7b); the doc node
(n9-docs) and finalize (n10) are DOWNSTREAM of this gate per the frozen plan and are NOT in
this gate's scope.

## Verdict: PASS — 0 blocking findings

All 8 ACs met; cross-edition mirror + correctness checks clean; both heavy chains green
(independently run, not trusted from n6b). The four flagged judgment calls (a)/(b)/(c)/(d)
are each correct/non-blocking. The only fail-pointer (the retired-switch vocab still live in
user-facing docs + missing D-538-01) is DOWNSTREAM-OWNED by n9-docs/n10 and would DEADLOCK
the DAG if blocked here (n9-docs depends on n8-review) — recorded as a non-blocking handoff.

## AC verification (all PASS)

- AC1 — default install ships no fast/full: install.sh gates kaola-workflow-fast.md on
  EFFECTIVE_FAST and kaola-workflow-phase[1-5].md on EFFECTIVE_FULL (install + verify loops);
  router has no path-selection step (workflow-next.md Step 0a-1 collapsed to unconditional
  default→adaptive). PASS.
- AC2 — --with-fast/--with-full install + fire only on explicit keyword: install.sh arms set
  WITH_FAST/WITH_FULL; claim path_not_installed gate admits fast/full only when in
  installed_paths; router prose fires fast/full only on explicit path-name keyword/KAOLA_PATH.
  PASS.
- AC3 — re-install PRESERVES installed (union): R1 EFFECTIVE_* computed from PRE-union config
  before the stale loop; D4 python unions existing installed_paths (never removes); a bare
  reinstall re-writes a previously-installed path's files (spare AND refresh). PASS.
- AC4 — uninstall→reinstall = adaptive-only: uninstall.sh removes
  ~/.config/kaola-workflow/config.json (D5); fresh install writes installed_paths:[]. PASS.
- AC5 — --enable-adaptive warns-and-ignores; no disable path: install.sh arm prints the
  retirement warning and shifts (no var set); no isLegalWorkflowPath branch can make adaptive
  illegal (value===ADAPTIVE_PATH short-circuits unconditionally). PASS.
- AC6 — no downgrade; exhaustion floor = repair→discard+restart→stop+ask; "downgrade to full"
  GONE: adapt.md tail rewritten ("NEVER downgrade to fast/full … no automatic fallback");
  workflow-next.md "Adaptive fallback → full" sub-bullet deleted; offending-wording scan
  across all router surfaces returns zero hits; all 6 surfaces converge. PASS.
- AC7 — non-installed KAOLA_PATH = typed path_not_installed (not silent sub, not crash):
  claimProject returns {status:'path_not_installed', result:'refuse'} with Array.isArray guard
  in resolveInstalledPaths (malformed config → [] → adaptive-only, never throws). PASS.
- AC8 — dead code removed: WORKFLOW_PATHS_NO_ADAPTIVE, ENABLE_ADAPTIVE_FIELD/ENV,
  resolveEnableAdaptive removed from schema (+exports) ×4 byte-identical; target_set_not_adaptive
  → bundle_requires_adaptive; path_requires_explicit_opt_in block + adaptive-under-OFF
  authoring_refused branch deleted. PASS.

## Cross-edition + correctness checks (all PASS)

- Dead-symbol scan (scripts/ plugins/ commands/ install.sh uninstall.sh): only 3 hits, ALL
  descriptive #538/#515 retirement comments (test-claim-hardening.js:783,
  simulate-workflow-walkthrough.js:3602, test-route-reachability.js:321) — category (a), allowed.
  Zero LIVE code/assertion references.
- validate-script-sync.js → OK (26 common scripts, 25 byte-identical groups, 9 rename-normalized
  families in sync). Schema ×4 md5-identical (4802b5bf…).
- Forge claim mirrors equivalent: path_not_installed ×2, bundle_requires_adaptive ×1,
  resolveInstalledPaths ×2, 0 dead symbols in all 3 (root + gitlab + gitea claim copies).
- 6-surface convergence (#400): 3 Claude next/adapt commands + 3 Codex next/adapt SKILLs all
  carry the identical new model (unconditional-default×3, bundle_requires_adaptive×2, 0 dead
  tokens per next-surface; bundle_requires_adaptive×2 + NEVER-downgrade floor + 0 dead per
  adapt-surface).
- No auto-fallback wording survives anywhere (downgrade to full / fall back to full / adaptive
  fallback / safety floor / switch ON-OFF): zero offending hits.
- Contract validators ×4 moved in lockstep: each asserts path_not_installed (×4) + new vocab;
  the lone resolveEnableAdaptive/workflow_path_refused hit per file is a #538 rename COMMENT,
  not a live assertion.
- Chains: npm run test:kaola-workflow:claude → exit 0 (independently run). npm run
  test:kaola-workflow:codex → exit 0 (the #400 historic dead-zone with heavily-rewritten SKILLs).

## Flagged judgment calls — adjudication

- (a) claim.js writeState `data.workflow_path || 'full'` (L541): CORRECT to leave. Both
  writeState callers (claimProject L935 → ||'adaptive'; bundle L1133 → 'adaptive') explicitly
  pass workflow_path, so the ||'full' fallback is unreachable-with-consequence under #538. SPEC
  B5 named only the 3 claim-DEFAULT sites (all flipped). Latent-consistency LOW only (a future
  caller omitting the field would misroute) — NON-BLOCKING. Uniformly ported in all 4 copies.
- (b) fast-specific vs generic #538 wording: CORRECT. All 6 fast surfaces (3 commands + 3 Codex
  SKILLs) carry BYTE-IDENTICAL fast-specific wording (no canonical↔forge drift); phase1/research
  surfaces carry generic fast/full wording (semantically right for an entry surface). Both
  variants contain path_not_installed and retire the switch framing. NON-BLOCKING.
- (c) Codex skill install ungated in install.sh: NON-BLOCKING. Codex skills ship in-place via
  the plugin manifest ("skills":"./skills/") — there is no per-skill install loop to gate (the
  SPEC's skill-gating intent had no landing surface; the whole plugin tree is the unit). The
  load-bearing fail-closed property holds uniformly: EVERY route to fast/full passes through the
  claim front door (claim.js path_not_installed). The fast executor SKILL operates on an
  ALREADY-CLAIMED project (claim happens upstream via workflow-next→claim startup); the research
  SKILL invokes claim.js directly. On a default install installed_paths=[] → any fast/full claim
  is refused. No bypass route. AC1 enumerates command .md files, not skill dirs, so on-disk skill
  presence is not a literal AC1 breach. Cosmetic residue at most → follow-up.
- (d) .env.example stale KAOLA_ENABLE_ADAPTIVE=1 row (L43): reasonable DEFER. Behaviorally inert
  2-line stale-doc deletion behind the security-sensitive .env* G2 gate; .env.example is not in
  this diff. NON-BLOCKING (reasoned, filed defer — contrast with the §F doc cluster below which
  is downstream-owned, not deferred).

## Non-blocking downstream handoff (NOT a finding against this gate)

The retired-switch vocabulary is still LIVE in user-facing docs at this instant (README
L289-300/L662/L803 incl. the env-var table row; docs/api.md L622-629/L744; 
docs/workflow-state-contract.md §244-258; docs/architecture.md L12/L326), the CHANGELOG has no
[Unreleased] #538 entry, and docs/decisions/D-538-01.md does not yet exist (leaving 0007's
`Status: Superseded by D-538-01` pointer transiently dangling — n6b correctly did its half by
editing 0007). These are NOT dropped: the frozen plan assigns ALL of them to n9-docs (README,
api.md, architecture.md, conventions.md, workflow-state-contract.md, D-538-01.md) and n10-finalize
(CHANGELOG), both DOWNSTREAM of n8-review (n9-docs depends-on n8-review). Blocking on them here
would DEADLOCK the DAG. The obligation is recorded so it stays durable:
  - n9-docs MUST purge KAOLA_ENABLE_ADAPTIVE / enable_adaptive / --enable-adaptive=no-as-a-
    working-disable from README/api.md/state-contract/architecture and WRITE D-538-01.md
    (resolving 0007's pointer).
  - n10-finalize MUST add the CHANGELOG [Unreleased] entry.

Plan-design observation (advisory, not a block): there is no code-review gate AFTER n9-docs, so
its doc output is not independently gated before the n10 sink. This gate cannot block a node it
does not post-dominate.

## Findings (machine-readable)

finding: id=R1 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=claim.js-L541-writeState-default-full-unreachable-both-callers-set-workflow_path-adaptive
finding: id=R2 scope=out_of_scope action=follow_up status=open severity=medium fix_role=implementer rationale=n9-docs-must-purge-retired-switch-vocab-from-README-api-state-contract-architecture-and-write-D-538-01-downstream-owned-not-this-gate
finding: id=R3 scope=out_of_scope action=follow_up status=open severity=low fix_role=implementer rationale=n10-finalize-must-add-CHANGELOG-unreleased-538-entry-downstream-owned
finding: id=R4 scope=out_of_scope action=document status=open severity=low fix_role=none rationale=no-review-gate-after-n9-docs-doc-output-not-independently-gated-before-n10-sink-plan-design-note

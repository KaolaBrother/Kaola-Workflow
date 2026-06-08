verdict: pass
findings_blocking: 0

finding: id=R1 scope=out_of_scope action=none status=open severity=low fix_role=none rationale=gitlab/gitea commands/kaola-workflow-plan-run.md still reference resolve-agent-model.js but those are Claude-style command cards not Codex skills; on a Claude install ~/.claude/agents exists so the resolver is correct there; AC1 scopes to the Codex skills/ surface which greps clean
finding: id=R2 scope=pre_existing action=follow_up status=open severity=low fix_role=none rationale=gitlab/gitea sink-merge build a closure receipt without checkDispatchAttestations so it ships the stale failed attestation default; pre-existing at HEAD (github sink-merge=1 call from #280, forge=0) AND outside the 13-file #286 diff (no sink-merge file touched); warn-first advisory field never blocks closure; recommend own follow-up issue (checkDispatchAttestations already exported in forge claim.js, ~3-line port)

# G1 Review — Issue #286 (post-dominates 3 implement nodes)

## Verdict: APPROVE

Both orthogonal fixes are correct, complete within their declared scope, and
fully covered. npm test exits 0 across all four editions. Zero blocking findings.

## Fix 1 — drop Claude-only model resolver from Codex skills (AC1)

- Fix 1a (init template, 6 files / 3 byte-identity pairs): the new sentence is
  byte-identical across all 6 files (shared SHA c6a09e8…). github/gitlab/gitea
  command↔skill pairs each verified identical. Edition-neutral text reads
  correctly for both Claude and Codex; no dangling `~/.claude/agents`.
- Fix 1b (plan-run + adapt SKILL.md, github Codex): resolver clause dropped,
  replaced with the Codex-correct `model_reasoning_effort` tier in
  `agents/<role>.toml` (selected by role name).
- Completeness: `grep -rn "resolve-agent-model|.claude/agents" plugins/*/skills/`
  returns ZERO hits across ALL editions. AC1 satisfied for the Codex skill surface.
- R1 (out of scope): gitlab/gitea `commands/kaola-workflow-plan-run.md` still
  carry `resolve-agent-model.js` refs — Claude-style command cards, correct for a
  Claude install. AC1 scopes to skills/. Not a defect.

## Fix 2 — run closure attestation on all receipt paths (AC2)

- AC2 names THREE claim.js callers: cmdFinalize (pre-existing) + the two watch-pr
  callers. All three now run checkDispatchAttestations in ALL FOUR editions:
  github :965/:1337/:1361, gitlab :935/:1249/:1273, gitea :922/:1236/:1260.
- Complete buildClosureReceipt surface enumerated: claim.js ×4 (3 callers each,
  all attested) + sink-merge ×4. github sink-merge already attested (#280, :306).
- Scoping: the duplicated `const liveCacheDir`/`archiveCacheDir` live in separate
  `if`/`else if` block scopes — no redeclaration error. Verified.
- Ordering: attestation runs BEFORE checkClosureInvariants, matching the
  canonical cmdFinalize/sink-merge call sites. Archive-cache candidate first, live
  fallback — correct given archiveProjectDir renames the live folder first.
- Forge ports: gitlab/gitea use forge-correct `folder.issue_iid` receipt key and
  thread `archiveResult.dest`; checkDispatchAttestations defined+exported in both.
  State tokens correct (MERGED/merged, CLOSED/closed).
- Pre-fix defaults: emptyReceipt sets both attestation fields to 'failed'
  (closure-contract.js:66-67); nothing flipped them on watch-pr. Post-fix the
  detector sets 'missing' when no dispatch-log exists (function :62-63).
- R2 (pre-existing, non-blocking): gitlab/gitea SINK-MERGE receipts lack the
  attestation call — pre-existing #280 port gap, outside the #286 diff. Follow-up.

## AC3 — editions + tests

- github claim.js pair (scripts/ ↔ plugins/kaola-workflow/scripts/) BYTE-IDENTICAL
  including the new Fix-2 hunks.
- RED→GREEN test (testWatchPrMergedClosureReceipt) drives the real watch-pr
  command via a gh shim returning MERGED, asserts both attestation fields ===
  'missing'. Genuine RED (would have failed on the stale 'failed' default).
  Note: only the MERGED branch is asserted; CLOSED branch is structurally
  symmetric (read both) — not blocking.
- npm test: exit 0; all 4 edition contract validators + walkthroughs PASSED
  (validate-script-sync confirms byte-identical groups;
  validate-kaola-workflow-contracts enforces the init-template pairs).

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 0     | pass   |
| LOW      | 2     | note (out of scope / pre-existing follow-up) |

Verdict: APPROVE — both fixes correct, complete in declared scope, fully tested,
4 editions green. Two LOW findings are non-blocking (R1 out of scope, R2
pre-existing follow-up).

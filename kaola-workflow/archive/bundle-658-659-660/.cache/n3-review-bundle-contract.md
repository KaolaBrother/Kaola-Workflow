evidence-binding: n3-review-bundle-contract aac646f8d545
upstream_read: n1-canonical-fanout-evidence 79e83c23ba85
upstream_read: n2-fence-parser-and-hermetic-fixtures 398b6320c00d
verdict: pass
findings_blocking: 0
finding: id=R1 scope=in_scope action=fix status=resolved severity=critical fix_role=tdd-guide rationale=legacy_multi_group_verification_refuses_before_receipt_access
finding: id=R3 scope=in_scope action=fix status=resolved severity=critical fix_role=tdd-guide rationale=gitlab_classification_fixtures_are_dependency_complete_and_hermetic
finding: id=R2 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=walkthrough_explicit_fanout_uses_bound_node_id_receipts
finding: id=R4 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=real_dispatch_evidence_lifecycle_reaches_whole_plan_verdict
finding: id=NBA scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=node_brief_h3_parser_reuses_family_run_and_suffix_aware_fence_transition
finding: id=NBB scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=brief_presence_hash_and_validation_distinguish_absent_present_and_ambiguous
finding: id=R5 scope=in_scope action=fix status=resolved severity=medium fix_role=tdd-guide rationale=four_edition_plan_consumer_parse_hash_freeze_resume_matrix_is_committed

# Code Review — n3-review-bundle-contract (final full-union review)

## Findings

No open CRITICAL, HIGH, MEDIUM, or LOW findings. No blocking findings were found in the final repaired union.

### Original R1–R5 dispositions

- R1 — RESOLVED. `scripts/kaola-workflow-plan-validator.js:644-662` resolves canonical groups by exact node ids sharing fan-out label and sorted dependency origin, and marks multiple legacy identities ambiguous. `:1143-1151` refuses ambiguous legacy plans before any role-prefix glob/read. The per-node and whole-plan repair controls remain at `scripts/test-adaptive-node.js:165-190`.
- R2 — RESOLVED. `scripts/simulate-workflow-walkthrough.js:12281-12323` uses canonical `sk*.md` receipts with matching baseline nonces and an empty glob seam; the separate unique cardinality>1 compatibility control remains at `:12359-12370`.
- R3 — RESOLVED. `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js:49-79` requires `viewIssue`, `discoverProject`, and `listIssueNotes` and supplies local `listIssues`; `:682-729` runs the deterministic note matrix and negative missing-dependency sentinels under sandbox HOME and hostile CLI. The captured default driver passed with zero ambient CLI/auth/host diagnostics.
- R4 — RESOLVED. `scripts/test-adaptive-node.js:5810-5855` freezes a real temporary plan, calls real `open-ready`, writes only each returned `dispatch.evidence_file`, closes both canonical skeptics, proves no role-prefix bridge exists, and passes the real whole-plan verdict check.
- R5 — RESOLVED. `scripts/simulate-workflow-walkthrough.js:5491-5543` retains the four-edition h2 section matrix over Meta, Nodes, Node Briefs, and Node Ledger with fence families/run lengths, duplicate/unclosed refusal, identical hashes, freeze, and resume.

### Adversarial Node Briefs dispositions

- NBA — RESOLVED. All classifier editions export `markdownFenceTransition` and `sectionBodyState`: root/Codex at `scripts/kaola-workflow-classifier.js:285-326` and its common copy, GitLab/Gitea at their classifier files `:228-269`. `parseNodeBriefs` at `scripts/kaola-workflow-plan-validator.js:1449-1471` applies that transition before testing each `###` candidate. A closer must match family, meet/exceed the opener run, and have an empty suffix, so shorter delimiters, different-family markers, and equal-length info-suffixed lines cannot expose fenced h3 ghosts.
- NBB — RESOLVED. `scripts/kaola-workflow-plan-validator.js:1441-1449` consumes one structured Briefs section state; `:1473-1485` hashes present Briefs, leaves truly absent Briefs byte-compatible, and gives ambiguity an explicit marker; `:1494-1500` returns typed `briefs_section_ambiguous` before normal plan validation. Fenced-decoy-only and no-heading plans are both absent/hash-identical, while duplicate genuine or unclosed Briefs cannot freeze silently.
- The authoritative four-edition regression at `scripts/simulate-workflow-walkthrough.js:5546-5592` covers a five-backtick opener plus shorter triple delimiter, equal-length info-suffixed non-closer, four-tilde analog, fenced `###` ghosts, a genuine `### impl`, decoy-only absence/hash identity, identical valid hashes, freeze/resume, duplicate genuine Briefs, and unclosed ambiguity.

## Full-union fan-out trace

- Plan parse/member identity: `scripts/kaola-workflow-plan-validator.js:644-662`.
- Seed/dispatch: `scripts/kaola-workflow-adaptive-node.js:5228-5245` records each baseline/nonce and seeds `.cache/<node-id>.md`; `:5283-5314` emits the project-qualified `dispatch.evidence_file` from the same node id.
- Close-time evidence: `scripts/kaola-workflow-adaptive-node.js:5471-5515` resolves the canonical evidence path and validates the binding id/current nonce before mutation.
- Per-node/whole-plan tally: `scripts/kaola-workflow-plan-validator.js:1143-1200` and `:1234-1244` reject absent, foreign, duplicate, stale, blocking, and unresolved-fix votes; canonical groups never use a role-prefix glob and ties remain refuted.
- Reset/reopen: `scripts/kaola-workflow-adaptive-node.js:3385-3399` folds the exact collective group; `:3460-3490` deletes only attributable member receipts; `:3492-3534` rotates the reopened baseline/seed.
- Focused canonical, legacy, reset, and real lifecycle tests remain in `scripts/test-adaptive-node.js:96-190`, `:2594-2621`, and `:5810-5855`. No global canonical glob, foreign-group vote, duplicate vote, stale-binding reuse, cross-group purge, manual bridge, or orchestrator bridge requirement remains.

## Parser/Briefs implementation review

- `sectionBodyState` performs the fence transition before requested-h2 and next-h2 recognition and returns `absent|present|ambiguous`. `sectionBody` preserves the prior string API by returning a body only for `present`.
- `parseNodeBriefs` reuses exactly the same transition, processes h3 candidates only at fence depth zero, trims only leading/trailing blank lines, and preserves internal brief text.
- `nodeBriefsPresent` is true only for the structured `present` state. `computePlanHash` treats fenced-decoy-only exactly like no Briefs, covers genuine Briefs, and separates ambiguity. `validatePlan` refuses ambiguity with a stable typed reason; valid Briefs freeze/resume unchanged.
- Root/Codex classifier common copies and all four generated validator aggregators expose the same contract. No divergent family/run/suffix implementation remains.

## Hermeticity and scope review

- Static classifier dependency review remains limited to the owned forge seams; in-process classification fixtures use complete stubs, while deliberate subprocess degradation tests use local shims and temporary HOME values.
- Independent actual-source negative probes passed for missing `viewIssue`, `discoverProject`, and `listIssueNotes`; no callback executed.
- A captured default GitLab driver run exited 0 with `GitLab workflow script tests passed` and zero matches for unknown-flag, 401, auth-login, known-host, configured-remotes, or unexpected-forge diagnostics.
- The tracked full union remains the declared 16 product/test files plus n1/n2 evidence. The second cycle changes only the four classifiers, four generated validators, walkthrough, and n2 evidence; no product/docs/agent/installer/changelog/dependency file is out of scope.

## Candidate and validation reuse boundary

- Frozen plan hash: `e69753f11f9e10b14148d196259867a6b0ebd8805d552fe3033fdd4250f62b2f`.
- Independent `--candidate-hash --json` returned exactly `a290dbce5bbd321c97390039b5a19e0eb579f66cfbc5d1334820b8c845ac1e12`, matching the authoritative second-cycle n2 receipt.
- Every relevant code/test file mtime precedes the repaired n2 receipt; no relevant post-validation edit was found. The current tracked file boundary and generated-port checks are unchanged after that receipt.
- Broad Meta was deliberately not rerun. `kaola-workflow/bundle-658-659-660/.cache/n2-fence-parser-and-hermetic-fixtures.md`, binding `398b6320c00d`, records a complete post-Node-Briefs-edit sequential PASS of Claude, Codex, GitLab, then Gitea at candidate `a290dbce...`. Its earlier interrupted attempt is explicitly non-acceptance evidence; the subsequent from-the-beginning aggregate exited 0 across all four editions.

## Generated-port audit

- `node scripts/edition-sync.js --check` — PASS: 10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in canonical parity.
- `node scripts/test-edition-sync.js` — PASS, 41 assertions.
- `node scripts/validate-script-sync.js` — PASS across common, byte-identical, rename-normalized, hooks, and forge export-superset families.
- These checks cover the full accumulated validator/adaptive-node diff and the second-cycle classifier/validator changes, not only a patch subset. No generated drift was found.

## Bounded independent probes

- `node scripts/kaola-workflow-plan-validator.js kaola-workflow/bundle-658-659-660/workflow-plan.md --candidate-hash --json` — PASS, exact `a290dbce...` boundary.
- `node scripts/simulate-workflow-walkthrough.js --only testNodeBriefAuthoritativeSectionMatrix` — PASS; exact four-edition Briefs subset passed.
- Ambiguous legacy fan-out probe with throwing read/glob seams — PASS; per-node and whole-plan refused before any receipt access.
- Three actual-source negative dependency probes — PASS for `viewIssue`, `discoverProject`, and `listIssueNotes`.
- Captured `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — PASS, exit 0, ambient diagnostic matches 0.
- `node scripts/edition-sync.js --check` — PASS.
- `node scripts/test-edition-sync.js` — PASS, 41 assertions.
- `node scripts/validate-script-sync.js` — PASS.
- `git diff --check a55bd247` — PASS.
- Full adaptive/walkthrough and broad edition chains were not redundantly rerun; the current candidate boundary proves the complete n2 Meta receipt covers all code/test edits.

## Maintainability and security scan

- The shared transition removes the previous h2/h3 fence-logic drift and gives presence/hash/validation one explicit state vocabulary. Naming, error handling, and regression coverage are coherent across editions.
- No authentication, payments, secrets, user-data, or deployed external-API behavior changed. Test-only forge isolation was reviewed as a correctness boundary; a separate security-reviewer was not required.

## Verdict

APPROVE. Original R1–R5 and adversarial Node Briefs findings NBA/NBB are resolved; targeted falsification, generated-port parity, hermeticity, and the current post-edit four-edition Meta boundary are green. No blocking findings remain.

delegation_outcome: code-reviewer role executed directly as dispatched; no sub-delegation; security-reviewer not invoked because the final union contains no security-sensitive product behavior.

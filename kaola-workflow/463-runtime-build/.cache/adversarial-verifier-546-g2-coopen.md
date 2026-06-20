verdict: pass
findings_blocking: 0
finding: id=R1 scope=in_scope action=document status=open severity=low fix_role=implementer rationale=stale-comments-in-adaptive-node-mention-retired-resolveLegIsolation-and-writeOverlapConsent-gating-for-shared-infra;code-is-safe-but-prose-misleads

## Claim Under Test
#546 G2 (DECISION B, accuracy-first): a file-disjoint shared-infra write frontier WITH a
post-dominating code-reviewer gate and NO PROTECTED file now co-opens --parallel-safe BY DEFAULT
(no write_overlap_policy:'coarse', no --write-overlap-consent), while (2) gateless frontiers still
refuse, (3) PROTECTED files still refuse, (4) exact overlap still blocks, (5) classifier verdict
stays pure, and (6) the executor co-opens with per-leg worktree isolation + commit-union barrier.
Scoped surface: scripts/kaola-workflow-plan-validator.js (writeOverlapRelaxable + call site),
classifier.js (verdict purity), adaptive-node.js (executor), forge ports, test files.

## Disproof Attempt
Ran the validator CLI directly on 10+ hand-built fixtures + an end-to-end open-ready executor run
on a real git repo + all four cross-edition chains.
- (1) DEFAULT-ON: shared-infra-disjoint + code-reviewer gate, NO consent/policy => result:ok with
  relaxed:[{kind:shared-infra,policy:off}]. T546G2-GREEN-NEW green. writeOverlapRelaxable returns
  true on dj.kind==='shared-infra' before the policy/consent guard. CONFIRMED.
- (2) GATELESS REFUSES (CRITICAL): same frontier with finalize depending directly on A,B => refuse
  (gatePresent=false via gateUncovered leg-scoped). Could NOT make a gateless code-producing
  frontier co-open: DOUBLY blocked — (a) plan-freeze G1 refuses "code-reviewer does not
  post-dominate code-producing node(s)"; (b) --parallel-safe leg-scoped gate refuses even if freeze
  bypassed. Partial coverage (one leg bypasses the gate) ALSO refuses. adversarial-verifier-only and
  synthesizer-only gates do NOT count (code-reviewer specifically required) — stricter than the loose
  comment, errs safe. CONFIRMED — could not falsify.
- (3) PROTECTED: schema-anchor basename (probe 8) AND .archived-/roadmap path-marker within the
  shared scripts area (probe 10) both REFUSE with gate present. CONFIRMED.
- (4) EXACT: scripts/same.js vs scripts/same.js => refuse, kind:exact. CONFIRMED.
- (5) VERDICT PURITY: classifier.js byte-UNCHANGED vs ~1; disjointWriteSets still returns
  {verdict:'yellow',kind:'shared-infra'}. The change is solely in writeOverlapRelaxable. CONFIRMED.
- (6) EXECUTOR ACTS: end-to-end open-ready on a real repo co-opened A+B in ONE call with NO consent,
  formed lane_group lg-A-B, AND provisioned two real per-leg git worktrees (.kw/legs/.../A,B with
  separate branches+baselines; `git worktree list` shows all three). Close path runs parent-clean
  fence -> synthesizer octopus-merge -> COMMIT-based union barrier on M (ancestor-inclusion, no
  silent loss). Provisioning gate is groupForm && legCoupled (legCoupled=parallelWritesDefaultOn,
  default TRUE); groupForm => legCoupled invariant holds. CONFIRMED.
Forge ports (gitlab/gitea/plugins) carry byte-identical writeOverlapRelaxable. All four cross-edition
chains green (claude/codex/gitlab/gitea, exit 0). test-commit-node 119, test-adaptive-node 1050,
test-run-chains 114, canonical walkthrough all pass.
NON-BLOCKING R1: stale comments in adaptive-node.js (~3451-3452, ~3419-3423) still describe the
retired `resolveLegIsolation(env) && opts.writeOverlapConsent` provisioning gate and assert "an
overlapping frontier forms a group ONLY when consent is present, so a shared-infra co-open is always
explicitly authorized" — the live code now co-opens shared-infra WITHOUT consent. Code is correct;
prose misleads a future maintainer. Documentation-only, does not affect any safety property.

## Verdict
NOT-REFUTED (confidence: high)
Every safety property survived a strong, executed disproof attempt; the critical gateless-co-open
property is doubly enforced (freeze-G1 + leg-scoped parallel-safe gate). Only a non-blocking
stale-comment documentation finding surfaced.

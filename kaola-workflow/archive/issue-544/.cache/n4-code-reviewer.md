evidence-binding: n4-code-reviewer 8fe4ee8c1673
<!-- verdict: paste verdict here -->
verdict: pass
<!-- findings_blocking: paste findings_blocking here -->
findings_blocking: 0

## Verification matrix (issue #544 acceptance)
1. Contract-keying correctness — PASS. CONTRACT_EFFORT_TABLE (4 contracts; anthropic thinking 32000/16000 variant max/high; openai xhigh/high; google high/low; default high/medium). contractForProvider GLM regex FIRST (zhipuai-coding-plan→anthropic). effortForProvider falsy-guard intact (null→null, unknown→default). mapTier/dispatchEffortOpencode/resolveOpencodeProvider unchanged. module.exports updated. Runtime spot-check returned exactly: anthropic {thinking 32000} / xhigh / high(unknown) / null(falsy).
2. ×4 byte-identity — PASS. validate-script-sync in sync; 4 schema copies md5 1f7cd6ee00e2c1edc2ffd377e410ece3.
3. Variant-name preservation — PASS. test-adaptive-node.js 1030 assertions (Cases 4/5/6/7/9 green; variant max for zhipu).
4. Flipped tests — PASS. test-opencode-edition.js 300 assertions. S1/S1-contract/A12-unknown assert Anthropic thinking for GLM, contract-keying openai/google, safe-default unknown, null for falsy.
5. #307 four cross-edition chains — PASS. claude/codex/gitlab/gitea all exit 0 (sequential).
6. opencode parity --check — PASS. 15 agents + 12 commands in parity.
7. opencode.json untouched — PASS. git diff empty.
8. No stale PROVIDER_EFFORT_TABLE refs — FAIL (see R1 below; README.md:361).
9. Docs accuracy — PASS. docs/opencode-edition.md (contract-keyed table, GLM thinking example matches generator, Switching-models subsection); D-544-01 complete; install-opencode.sh echo + bash -n OK.
10. Canonical top-tier role parity — PASS. topTierRoles = {code-architect,code-reviewer,planner,security-reviewer,synthesizer,workflow-planner}→top; 9 standard→second.

## Findings
finding: id=R1 scope=in_scope action=fix status=resolved severity=low fix_role=main-session-trivial-inline rationale=README.md:361 named PROVIDER_EFFORT_TABLE, a constant removed/renamed to CONTRACT_EFFORT_TABLE by this change; broken pointer on a primary active doc (check #8). RESOLVED via Trivial Inline Edit during finalize: README.md:361 now reads `mapTier + CONTRACT_EFFORT_TABLE + contractForProvider` (contract-keyed). Re-verified: no stale PROVIDER_EFFORT_TABLE refs in any active doc/script (only D-544-01 narrative "before/replace" context remains, which is legitimate).
finding: id=R2 scope=out_of_scope action=document status=open severity=low fix_role=none rationale=contractForProvider regex /zhipu|^zai|z-?ai|glm/ does not match bare 'z.ai' dotted token (→ default); real provider id 'zhipuai-coding-plan' resolves correctly to anthropic. Advisory only.

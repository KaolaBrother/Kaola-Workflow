evidence-binding: n8-adversary 07997ebe56a7
verdict: pass
findings_blocking: 0

## Claim under test (2nd pass)
The two cosmetic-nit fixes on HEAD c4ae5c43 (R2: drop the repo-only templates/axioms.md referent from the axiom pointer; obs1: reword the scout note to "The model above is resolved at install time; the router does not substitute it.") are correct and regression-free. Change-gate adversarial-verifier, nonce 07997ebe56a7. NOT-REFUTED (high).

## Disproof attempts — all four failed
1. Re-mangle risk: ran sync-opencode-edition.js --write on the real tree, scanned entire regenerated .opencode/: zero ISSUE_SCOUT_MODEL/_MODEL} residue, zero double-backtick empty spans, zero "resolved at install time"/"does not substitute"/"renders this placeholder"/install.sh prose in opencode workflow-next, clean rewrite present (1x), FP pointer + init embed intact. opencode test 517 green (+1 obs1 command-surface pin).
2. A27 under-assertion: proved load-bearing with TWO mutations in a scratch copy. (a) Neutralized rewrite regex → 4 A27 FAILs. (b) Reverted commands/workflow-next.md to OLD wording (de-anchors the regex without touching it) → 3 FAILs: empty-span negative catches the silent re-mangle, positive rewrite assert catches the miss, new obs1 guard catches the wording revert on the command surface. Fail-closed both directions.
3. R2 completeness: grepped every shipped surface (3 commands, 3 codex SKILLs, skeleton, regenerated .opencode/) for templates/axioms + "canonical source": ZERO hits. Sole referent now "the ## First Principles block in your project's workflow-init CLAUDE.md". Both nx-first-principles content tokens still present; route-reachability 333 green → all 6 next surfaces carry them.
4. Regression: generate-routing-surfaces --check all 12 byte-match; validator mirror cmp byte-identical + script-sync green; all 4 contract validators green (model="{ISSUE_SCOUT_MODEL}" + 'the governed issue-scout tier' pins hold — placeholder line untouched); test-install-model-rendering green (temp-HOME install; higher→opus/common→sonnet); full walkthrough green (210 scenarios incl. testAxiomBlockByteIdentity — init embeds + axioms.md untouched by this delta). Post-render truthfulness: "The model above is resolved at install time" true with model="opus" in view. Tree clean.

## Verdict
NOT-REFUTED (high). Both fixes correct, machine-guarded (obs1 reword now has its own pin), regression-free; unchanged remainder stands on the 1st-pass verification.

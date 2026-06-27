evidence-binding: n4-contracts 7d5b120d3fba
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: contract-assertion alignment to the new global-default — additive regression locks that pin an already-running behavioral change (n2/n3); no isolated unit logic exists to drive RED→GREEN.
<!-- regression-green|build-green|smoke-integration -->
regression-green: all three contract validators (codex, gitlab, gitea) exit 0 before and after; validate-script-sync.js exit 0.

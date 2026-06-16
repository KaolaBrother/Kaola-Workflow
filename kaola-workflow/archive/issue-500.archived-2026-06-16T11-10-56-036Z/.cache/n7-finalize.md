evidence-binding: n7-finalize 6f3c202116c0

# n7-finalize — sink node (CHANGELOG) — main-session-direct

compliance: main-session-direct

Wrote the declared write-set CHANGELOG.md only: a [Unreleased] ### Changed entry for the #500 build (L1 leg-coupled safe wire + e2e test, L2 activation-recipe prose + DORMANT-comment reword, L3 speculative-open card/markers/driver), cross-edition + adversarial-verified + code-reviewed, follow-ups #513/#514. References D-500-02 accepting D-500-01 (existing).

GOAL (end-state): every #500 makespan lever is reachable on the live path (wired) — achieved (L1 wired safe, L2 recipe documented, L3 prose reachable).

Before-close gate (FINALIZE skill owns the actual 4-chain run + sink + #500 close): all four npm run test:kaola-workflow:{claude,codex,gitlab,gitea} chains must be green (one at a time); on a #512 claude false timeout use --accept-known-red claude:512 with standalone-green evidence. This run CLOSES #500 (the build delivers the end-state; not keep-open).

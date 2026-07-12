# Run-gap manual seeds — issue-672

Adversary A1 (test-coverage) + A2 (existsSync stat-failure fail-open): two residuals in the same
legacy/stale worktree-cleanup surface, OUTSIDE #672's porcelain-probe family, filed together as #677.

gap: sweep-consumer-residuals — worktree-cleanup existsSync stat-failure fail-open plus untested stale-sweep unprobeable-keep both outside the porcelain-probe family

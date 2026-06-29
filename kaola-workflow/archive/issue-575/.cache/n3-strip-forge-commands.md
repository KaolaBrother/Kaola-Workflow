evidence-binding: n3-strip-forge-commands 4d26f8b94e0b
# n3-strip-forge-commands — evidence

Stripped provenance from the 12 forge command ports (gitlab+gitea × {adapt,fast,finalize,phase1,plan-run,workflow-next}), mirroring the already-stripped Claude commands modulo forge nouns. No rule meaning changed.

## Changed files (12; verified `git status` = exactly the declared set)
Per forge (×2): adapt(6), fast(3), phase1(1), workflow-next(10), plan-run(17), finalize(22) = 59/forge, 118 total.

## Clause-rewrites (meaning preserved)
- adapt: `inheriting #472 concurrency` → `with concurrent dispatch` (mirrors canonical).
- finalize bash comments: `#541:`/`#539's`/`#261/#294:` lead-ins stripped, rule text kept.
- plan-run: `#543 G7 stall` truncation clause removed; VERBATIM-surface instruction kept.
- workflow-next: `(AC#5/AC#6)`, `(AC#6)` acceptance-criteria labels dropped.

## Canonical-diff confirmation
For all 6 commands × both editions, `diff commands/<name>.md plugins/kaola-workflow-{gitlab,gitea}/commands/<name>.md` contains NO provenance on either side — remaining diff lines are forge-noun-only (MR/PR, glab/tea, GitLab/Gitea, watch-mr/watch-pr, sink-mr/sink-pr).

## Residual grep
Zero except allowed user-command examples (`"work on #42"`, `"finish issues #42 #47 #53"`) in workflow-next.md.

## Functional tokens / forge nouns
All preserved: forge nouns + scripts (kaola-gitlab-*/kaola-gitea-*), env vars, reason codes, FANOUT_CAP/LOOP_CAP, file paths, FEATURE_TOKENs.

verdict: pass

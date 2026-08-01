# #878 — make the watch list self-sufficient in the committed doc, then close the backlog pointer

Branch `workflow/issue-878`, worktree `.kw/worktrees/issue-878`. User decision: **close it and keep it
documented.**

**My initial concern was overstated and is retracted.** I warned that closing #878 would discard the
watch-list register. It would not: the issue's own body says "the table lives in the committed doc",
and `docs/decisions/0017-the-mission-list.md:121` § *The watch list — derived, never observed,
therefore not built* holds all seven rows with their arming observations. #878 is a **pointer**, and
its stated purpose is only "so the analysis is discoverable from the backlog rather than only from a
doc nobody thinks to open." Closing it costs discoverability, not content.

What IS at risk is small and real, which is why this run exists at all.

---

item: two watch-list rows lack the recovery pointer their siblings carry. The lexicon row already ends
"deleted 2026-08-01, recoverable from git history at `b3bc7acf`". The **two honest live writers** row
says only "CAS with the conflict returned as data; lease with liveness probe", and the **a value call
taken by the agent** row says only "the consent valve" — neither names the symbols already written nor
where to recover them. That detail currently lives ONLY in the generated roadmap `Next Step`, whose
source `.roadmap/issue-878.md` closure deletes. Measured by me: `acquireProjectLock`,
`probeLockLiveness` and `consentScopeDigest` were all removed in `c4caa8d3` and are present at
**`b3bc7acf`** — the very same anchor the lexicon row cites, so the addition is consistent rather than
novel. The consent-valve row additionally owes the halt marker and its two journals.
status: done
dispatched: self, in the worktree — a two-cell table edit where the wording is the whole decision.
result: Both rows now carry their recovery information inline. The live-writers row names
`acquireProjectLock` / `probeLockLiveness`; the consent-valve row names the halt marker, its two
journals and `consentScopeDigest`; both record "removed in `c4caa8d3`, recoverable from git history at
`b3bc7acf`", matching the lexicon row's existing phrasing exactly. Shas measured, not recalled: all
three symbols return the same removal commit and the same last-present parent.
Also added a paragraph making the table self-sufficient: it states that this table is the register of
record and the only one, that the backlog pointer is closed because a permanently-open issue which is
explicitly not work is a standing invitation to schedule it, and that every row carries its own
recovery information so consulting it never requires reading a closed issue or a deleted roadmap entry.

item: `kaola-workflow/.roadmap/_rules.md:57` reads "recorded, not built — see #878", which dangles the
moment #878 closes. Repoint it at the committed doc. Note `_rules.md` is NOT removed by closure (only
`issue-878.md` is), so this survives and must be correct. Check whether anything else references #878
— a sweep of `docs/`, `CLAUDE.md` and `templates/` found none, but `.opencode`/`.kimi` are
dot-directories that ugrep SKIPS, so name them explicitly before concluding.
status: done
dispatched: self, in the worktree.
result: `_rules.md:57` now points at `docs/decisions/0017-the-mission-list.md` § *The watch list*
instead of `#878`, and mentions that a removed mechanism's row names its recovery commit. Swept
`docs/ CLAUDE.md templates/ commands/ agents/ plugins/ .opencode .kimi kaola-workflow/.roadmap/` with
the dot-directories named explicitly: **zero** remaining `#878` references besides
`.roadmap/issue-878.md` itself, which closure removes.

item: USER-REQUESTED mid-run — document the changelog citation convention that refused this session's
release. `docs/conventions.md:565` already covers references to ANOTHER forge, but not the case that
actually bit: this repo's OWN historical issues cited as background. The extractor's known set is
`--issues-closed` plus every `#\d+` in commit messages since the last tag, so a real, closed, local
issue cited as context still refuses `changelog_unknown_reference`. Minimal fix, and
`docs/conventions.md` is validation-invisible so it costs no receipt.
status: done
dispatched: self, in the worktree — one bullet appended to the existing rule rather than a new section,
since the two cases share a cause and "one rule, one wording" argues against splitting them.
result: Added as a sibling bullet naming the measured refusal (555, 700, 832, 346 all refused cutting
v9.1.0), the correct form (*"the issue-555 export-drift class"*), and the reason `#N` in `[Unreleased]`
is reserved for issues the release DELIVERS — the refusal is the only thing standing between a
background citation and a release receipt claiming to have closed an issue it never touched.

item: dock and finish — CHANGELOG `[Unreleased]` (fresh section, the 9.1.0 release just closed the
previous one). `CHANGELOG.md` is in `SELF_HOST_TEST_CONSUMED`, so write ALL prose before the chain run.
`docs/decisions/` is validation-invisible, so the ADR edit alone would not stale a receipt — the
CHANGELOG entry is what forces the chain run. Then `run-chains.js --project issue-878`, finalize, sink.
A docs-only diff is not edition-touching, so expect the `claude` chain alone to be demanded; run
`KAOLA_RUN_CHAINS_CONCURRENCY=serial` regardless.
status: todo
dispatched:
result:

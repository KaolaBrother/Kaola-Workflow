# m984: re-point the edition-name matcher's positive control after `migrate`'s row was deleted

Agent `tdd984` (tdd-guide), worktree `bundle-984-985`, branch `workflow/bundle-984-985`. **Nothing
committed.** Test path only: `scripts/test-forge-finalize-findings.js`. `docs/api.md` **not touched**
— confirmed by `git status --porcelain -- docs/api.md` returning empty both before and after this
pass.

## What happened, and why the single-suite gate never saw it

ADR 0018 §8 step 5 (commit `25054b07`) deleted `kaola-workflow-roadmap.js` in all four editions and,
with it, the whole `## Roadmap Operations` section of `docs/api.md` — including the `migrate` row the
positive control at `test-forge-finalize-findings.js:958-969` read. Confirmed via
`git show 25054b07^:docs/api.md | grep '^| \`migrate\`'`: the row was genuinely edition-scoped —
`GitLab and Gitea swap this for \`refresh\`` — a real divergence description, not a synthetic one.
`docsRow('migrate')` now correctly returns `undefined`; the control's own assertion (which requires
the row to exist AND name both forges) failed, correctly, on the row's absence.

**The mechanism the control protects (`editionsNamedIn` / `EDITION_WORD`) is not retired — only its
witness died**, same shape as `plantRoadmapIssue` (Job 1) and the classifier seam (Job 2): I ran the
suite directly and it was exit 0 (238/9 → fixed to 253/0 in the prior pass, see
`m984-fixture-rebuild.md`), and stayed exit 0 until `docs/api.md`'s Roadmap Operations section was
deleted afterward. Nobody re-ran the single-suite gate after that deletion; the four-chain run
(`gitlab`/`gitea`/`codex`) did and caught it.

## The replacement row, and why it's the only real candidate

Searched exhaustively rather than picking the first plausible row: grepped **every** `|`-led line in
`docs/api.md` (the whole file, not just table sections that looked promising) for both `gitlab` and
`gitea` as literal substrings, case-insensitive:

```
$ grep -n "^|" docs/api.md | grep -i gitlab | grep -i gitea
369: | `archive_unstaged` | **canonical and Codex only** — the GitLab and Gitea ports raise ...
1463: | `kaola-workflow-install-manifest.js --forge=<github\|gitlab\|gitea> (--scripts\|--hooks)` | ...
```

**Exactly two rows in the entire document.** `archive_unstaged` (line 369) is disqualified — it's the
SAME row the assertions immediately below the control already read as `archiveRow`; using it for the
control too would make the control depend on the very thing it exists to independently verify, not
prove the matcher works on a row unrelated to what it's about to be trusted for. That leaves exactly
one candidate: the install-manifest row (line 1463), whose own key literally enumerates
`--forge=<github|gitlab|gitea>` — `gitlab` and `gitea` are genuinely present in the document's own
text, not synthesized. Re-pointed to it.

**A wrinkle in the lookup, not the row choice:** the install-manifest row's key contains unescaped `|`
characters as far as JS regex construction is concerned (markdown's own escape for a literal pipe
inside a table cell is `\|`, which is not a regex escape). Threading that raw key through the existing
`docsRow(name)` helper (`new RegExp('^\\|\\s*\`' + name + '\`\\s*\\|')`) would read those `|`
characters as regex alternation, not literal text, and silently misbehave. Looked the row up by a
distinctive substring instead (`l.includes('kaola-workflow-install-manifest.js')`) rather than
reusing `docsRow` for this one case — `docsRow` itself is untouched, since the other three call sites
(`archive_unstaged`, `residue_unstaged`) use simple alphanumeric names it handles correctly.

## Gates, each echoed separately, never through a pipe

```
$ node scripts/test-forge-finalize-findings.js
...
static: finding-type registries and their docs/api.md statements: done

253 passed, 0 failed
GATE_FINALIZE_FINDINGS_EXIT:0
```

```
$ node scripts/simulate-workflow-walkthrough.js   (full, unsharded)
...
##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":185,"ran":185,"passed":185,"failed":0}
Workflow walkthrough simulation passed
GATE_WALKTHROUGH_EXIT:0
```

(Scenario count is 185, not 186 — `testRoadmapEmptySourceGuard` and `testRoadmapInProcessRegenerateGuard`
went with `kaola-workflow-roadmap.js`'s deletion in the same commit that forced this repoint. Not
something I removed; confirmed pre-existing at the committed baseline before I touched anything.)

## Mutation proof — the control itself, not the downstream assertions

Per the standard of proof, broke `editionsNamedIn` / `EDITION_WORD` **one site at a time**, confirmed
each reds the control specifically, restored from a snapshot, re-verified 253/0 after each restore.

1. `EDITION_WORD.gitea = /gitea/i` → `/gitea-MUTATION-984/i` (the regex no longer matches the literal
   substring "gitea"):
   ```
   FAIL: static: the edition-name matcher failed its positive control — docs/api.md's install-manifest
   row names GitLab and Gitea (as `--forge=<github|gitlab|gitea>`) and the matcher must see both. ...
   252 passed, 1 failed
   ```
   Restored; re-verified 253/0.
2. `EDITION_WORD.gitlab = /gitlab/i` → `/gitlab-MUTATION-984/i` (same shape, the other forge):
   ```
   FAIL: static: the edition-name matcher failed its positive control — ...
   252 passed, 1 failed
   ```
   Restored; re-verified 253/0.
3. `editionsNamedIn = row => EDITION_KEYS.filter(k => EDITION_WORD[k].test(row))` → short-circuited to
   always return `[]` (`filter(k => false && ...)`) — this ALSO breaks the downstream
   `archive_unstaged`/`residue_unstaged` scope checks, which is expected (they share the matcher):
   ```
   FAIL: static: the edition-name matcher failed its positive control — ...
   251 passed, 2 failed
   ```
   Restored; re-verified 253/0.

All three mutations reproduce the exact failure shape the four-chain run reported for the ORIGINAL
control (a positive control redding, naming what it expected to see and didn't), confirming this is a
real, working control rather than one that happens to pass because nothing exercises it.

## Where this leaves things

- `scripts/test-forge-finalize-findings.js` and `scripts/simulate-workflow-walkthrough.js` are the
  only files touched this pass; both at their prior state plus this one repoint.
- Nothing committed. `docs/api.md` untouched throughout, verified before writing this report.
- Confirmed no stray `MUTATION-984` markers remain: `grep -c MUTATION-984 scripts/test-forge-finalize-findings.js` → 0.

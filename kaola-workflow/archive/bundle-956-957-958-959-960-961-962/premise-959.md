# Premise check — issue #959 (docs/architecture.md:287)

VERDICT: PREMISE HOLDS — not_refuted. Re-measured from scratch: four trees, three CLIs. The Codex tree's six `gh` exec sites are file-for-file, line-for-line identical to canonical's six, so "against a different forge CLI" is false exactly as filed. The repair surface is one live doc line. Two non-blocking refinements: the issue's absolute counts (127/64/34/41) did not reproduce under any of my four counting methods (structure confirmed under all of them), and the "exactly three hits" blast-radius list has since grown by three self-referential defect-tracking surfaces (none a live doc).

verdict: pass
findings_blocking: 0

Analytical result: **not_refuted** (execution: completed cleanly; no missing/stale inputs).
Claim under test (echoed unchanged): docs/architecture.md:287 says the four forge editions each ship "against a different forge CLI"; issue #959 says the measured reality is four trees, three CLIs — canonical calls `gh`, the Codex tree calls the same `gh` (not `glab`, not `tea`), gitlab calls `glab`, gitea calls `tea` — so the Codex tree's axis is runtime, not forge, and the false clause is specifically "against a different forge CLI". Filed narrowly: "four editions" vocabulary is NOT in question.
Surface (echoed unchanged): docs/architecture.md:287 and its section; the four script trees; repo-wide occurrences of "four forge edition" and "four editions" outside `kaola-workflow/archive/**`.

---

## 1. The target text, verbatim (docs/architecture.md, lines 285–326)

Read via the Read tool (line numbers as shown):

```
285	## Editions and runtimes
286
287	**Four forge editions** ship the same workflow against a different forge CLI: the canonical GitHub
288	tree in `scripts/` plus `plugins/kaola-workflow/` (Codex), `plugins/kaola-workflow-gitlab/`, and
289	`plugins/kaola-workflow-gitea/`. Most scripts are rename-normalized copies —
290	`kaola-workflow-<name>.js` becomes `kaola-{forge}-workflow-<name>.js` — and `scripts/edition-sync.js`
291	plus `scripts/validate-script-sync.js` enforce that. `kaola-workflow-adaptive-schema.js` is the one
292	file held **byte-identical** across all four trees: it is the cross-edition drift anchor, and every
293	constant shared between a producer and a consumer lives there so the two cannot disagree.
294
295	**Two additive runtime editions** — opencode and Kimi — are runtimes, not forges. They are not wired
296	into `npm test`, `edition-sync.js`, `install.sh`, or the routing-surface propagation set, and they
297	carry their own suites (`test-opencode-edition.js`, `test-kimi-edition.js`). See
298	`opencode-edition.md` and `kimi-edition.md`.
299
300	### Runtime capability divergence
301
302	Where the four runtimes differ, they differ **here** — one table, one place. Every cell is a **tier
303	label plus a pointer**, never a restatement of the mechanism: a restated fact rots away from its
304	source, and the re-derivation this table exists to end is exactly what a rotted copy causes. Read the
305	label for how much of the capability exists; read the pointer for what it is.
```

Confirmed: the #955 "Runtime capability divergence" table opens at line 300, directly below this section (one intervening paragraph, lines 295–298, about opencode/kimi). Its axis preamble, lines 313–317, is the coherence constraint for the repair:

```
313	**The forge axis multiplies two of the four columns.** claude and codex each ship against three
314	forges (github, gitlab, gitea), so a claude or codex pointer may resolve to three trees rather than
315	one — where it does, the pointer's own path says so, and where the artifact is forge-independent it
316	does not. opencode and kimi take `--forge` inside their own standalone installers instead. Runtimes
317	and forge editions are different axes; this table is indexed by runtime.
```

The table itself (lines 319–325) is indexed by runtime (claude / codex / opencode / kimi) and never names the CLIs `gh`/`glab`/`tea` — so a repair that names them does not duplicate the table, and a repair that says "three forge CLIs" agrees with line 313's "three forges".

## 2. Re-measurement from scratch

### Tree enumeration (not assumed)

```
$ find /Users/ylpromax5/Workspace/Kaola-Workflow -maxdepth 3 -name scripts -type d -not -path "*/node_modules/*" -not -path "*/.git/*"
/Users/ylpromax5/Workspace/Kaola-Workflow/scripts
/Users/ylpromax5/Workspace/Kaola-Workflow/plugins/kaola-workflow/scripts
/Users/ylpromax5/Workspace/Kaola-Workflow/plugins/kaola-workflow-gitea/scripts
/Users/ylpromax5/Workspace/Kaola-Workflow/plugins/kaola-workflow-gitlab/scripts

$ ls scripts/*.js | wc -l                                → 81
$ ls plugins/kaola-workflow/scripts/*.js | wc -l         → 26
$ ls plugins/kaola-workflow-gitlab/scripts/*.js | wc -l  → 30
$ ls plugins/kaola-workflow-gitea/scripts/*.js | wc -l   → 30
```

Exactly four trees. Non-.js content of all four trees is only `scripts/prose-census-baseline.json` and `plugins/kaola-workflow-gitlab/scripts/.gitkeep`; a `find … | xargs grep` sweep of those non-.js files for `gh`/`glab`/`tea` tokens returned nothing (exit 1) — the .js measurement covers the whole surface.

### Counting methods (exact patterns, over `<tree>/*.js`, tracked, via `git grep -P -o … | wc -l`)

- **M1 exec-call-site**: `(execFileSync|execFile|spawnSync|spawn|execSync|exec)\(\s*['"]<cli>['"]` — a child-process API invoked with the CLI as its command argument.
- **M2 quoted-string**: `['"]<cli>['"]` — the CLI name as a standalone quoted string token.
- **M3 blunt token**: `(?<![\w-])<cli>(?![\w-])` — the bare word anywhere, comments included (hyphen-aware boundary so `gh-token`-style names don't match).
- **M4** = M3 excluding `test-*.js` and `simulate-*.js`.

### Per-tree counts (M1 / M2 / M3 / M4)

| tree | `gh` | `glab` | `tea` |
|---|---|---|---|
| canonical `scripts/` | **6** / 49 / 357 / 72 | 0 / 0 / 12 / 5 | 0 / 0 / 11 / 4 |
| `plugins/kaola-workflow/scripts/` (Codex) | **6** / 6 / 70 / 70 | 0 / 0 / 1 / 1 | 0 / 0 / 0 / 0 |
| `plugins/kaola-workflow-gitlab/scripts/` | 0 / 0 / 4 / 4 | **2** / 15 / 84 / 33 | 0 / 0 / 0 / 0 |
| `plugins/kaola-workflow-gitea/scripts/` | 0 / 0 / 3 / 3 | 0 / 0 / 1 / 1 | **3** / 17 / 96 / 39 |

**My numbers differ from the issue's 127/64/34/41 and I could not reproduce those figures under any of the four methods** (closest: M4 gives gitlab `glab` 33 vs prior 34, gitea `tea` 39 vs prior 41; canonical `gh` is 72–357 depending on method, never 127). The issue's figures are a prior with an unstated pattern, not an oracle; every method I ran confirms the structural claim the numbers were cited for: **four trees, three CLIs**, `gh` invoked only from canonical + Codex, `glab` only from gitlab, `tea` only from gitea.

## 3. Positive control — mandatory

Under the invocation-grade methods (M1, M2): `glab` is nonzero **only** in the gitlab tree, `tea` nonzero **only** in the gitea tree, `gh` nonzero **only** in canonical + Codex. The method separates the trees; it does not find the tokens everywhere or nowhere.

Under the blunt M3, every cross-tree occurrence was captured **in full** (no `head`) and individually inspected — all 21 distinct lines are comments or negative-guard regexes, zero invocations:

```
$ git grep -P -n "(?<![\w-])glab(?![\w-])" -- 'scripts/*.js'          (12 tokens, 12 lines)
scripts/kaola-workflow-claim.js:2084:// … Forge-neutral + stateless (no gh/glab, no issue field, no folder requirement)
scripts/runtime-edition-forge.js:11:// `gh` vs `glab` vs `tea`, PR vs MR, and per-forge support-script basenames.
scripts/sync-kimi-edition.js:28:// … the workflow PROSE is forge-shaped (`gh` vs `glab` vs `tea`, PR vs
scripts/sync-opencode-edition.js:15:// … the workflow PROSE is forge-shaped (`gh` vs `glab` vs `tea`, PR vs
scripts/test-active-folders-field-parity.js:25:// Prevent accidental remote (gh / glab / tea) calls in all active-folders modules.
scripts/test-release.js:148:  … assert(!/\b(gh|glab|tea)\s+(release|repo|api|auth|pr)\b/.test(src), 'no forge-specific CLI token');
scripts/test-sink-merge.js:3349, 3353, 4410, 4568, 4617: comments about the ports/mocks
scripts/validate-script-sync.js:478:// glab/tea CLI calls). Those names are SUBTRACTED …

$ git grep -P -n "(?<![\w-])tea(?![\w-])" -- 'scripts/*.js'           (11 tokens — same lines as above minus claim.js:2084)

$ git grep -P -n "(?<![\w-])gh(?![\w-])" -- 'plugins/kaola-workflow-gitlab/scripts/*.js'   (4)
…/install-codex-agent-profiles.js:2589://   gh api "repos/openai/codex/…"   (comment)
…/kaola-workflow-codex-preflight.js:950://   gh api "repos/openai/codex/…"  (comment)
…/validate-kaola-workflow-gitlab-contracts.js:155:// defect: a `gh` leak in issue-scout.toml was masked …
…/validate-kaola-workflow-gitlab-contracts.js:366:  assert(!/\bgh\b/.test(nonCommentText), file + ' must not execute or mention gh');

$ git grep -P -n "(?<![\w-])gh(?![\w-])" -- 'plugins/kaola-workflow-gitea/scripts/*.js'    (3)
…/install-codex-agent-profiles.js:2589 (comment) · …/kaola-workflow-codex-preflight.js:950 (comment)
…/validate-kaola-workflow-gitea-contracts.js:154 (comment about a past `gh` leak)

$ git grep -P -n "(?<![\w-])glab(?![\w-])" -- 'plugins/kaola-workflow/scripts/*.js'        (1)
…/kaola-workflow-claim.js:2084 (the same forge-neutral comment as canonical)

$ git grep -P -n "(?<![\w-])glab(?![\w-])" -- 'plugins/kaola-workflow-gitea/scripts/*.js'  (1)
…/validate-kaola-workflow-gitea-contracts.js:373:  assert(!/\bglab\b/.test(nonCommentText), … ' must not execute or mention glab');
```

Note the gitlab/gitea contract validators actively **assert the absence** of `gh` in their agent surfaces — the trees themselves encode the separation the control demands. **Control passes.**

## 4. The key question — Codex calls the same `gh` as canonical

All `gh` exec sites, both trees, captured in full:

```
$ git grep -P -n "(execFileSync|execFile|spawnSync|spawn|execSync|exec)\(\s*['\"]gh['\"]" -- 'plugins/kaola-workflow/scripts/*.js'
plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js:41:  return execFileSync('gh', args, Object.assign({ encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }, opts || {})).trim();
plugins/kaola-workflow/scripts/kaola-workflow-claim.js:216:  return execFileSync('gh', args, Object.assign({ encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }, opts || {})).trim();
plugins/kaola-workflow/scripts/kaola-workflow-classifier.js:27:  return execFileSync('gh', args, { encoding: 'utf8' }).trim();
plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js:59:  return execFileSync('gh', args, Object.assign({ encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }, opts || {})).trim();
plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js:333:  return execFileSync('gh', args, Object.assign({ encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }, opts || {})).trim();
plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js:30:  return execFileSync('gh', args, { encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }).trim();

$ git grep -P -n "(execFileSync|execFile|spawnSync|spawn|execSync|exec)\(\s*['\"]gh['\"]" -- 'scripts/*.js'
scripts/kaola-workflow-active-folders.js:41:   (identical line)
scripts/kaola-workflow-claim.js:216:           (identical line)
scripts/kaola-workflow-classifier.js:27:       (identical line)
scripts/kaola-workflow-closure-audit.js:59:    (identical line)
scripts/kaola-workflow-sink-merge.js:333:      (identical line)
scripts/kaola-workflow-sink-pr.js:30:          (identical line)
```

Six exec sites each, **same six files, same six line numbers, same bytes** — the Codex tree is a copy of the canonical GitHub tree invoking the identical `gh` binary (its files even keep canonical names, no `kaola-{forge}-` rename). Meanwhile `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js` (lines 19, 23) invokes `glab` and `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` (lines 23, 31, 41) invokes `tea`. The Codex tree differs from canonical by **runtime**, not by forge CLI. **The clause "against a different forge CLI" is false.** Confirmed.

## 5. Blast radius

### `four forge edition` — tracked, excluding archive, full hit list

```
$ git grep -i -n "four forge edition" -- ':(exclude)kaola-workflow/archive/**'
CHANGELOG.md:4234                                    — history (issue #124 entry)                     [issue's hit 1]
docs/architecture.md:287                             — THE LIVE DOC, the target                        [issue's hit 2]
docs/decisions/D-530-02.md:76                        — history (decision record)                       [issue's hit 3]
docs/audits/2026-08-11-subtraction-audit.md:90,117   — the D10 finding itself (self-referential)       [new since audit]
kaola-workflow/.roadmap/issue-959.md:2,5             — this issue's own source (self-referential)      [new since audit]
kaola-workflow/ROADMAP.md:13                         — generated mirror of the above (self-referential)[new since audit]
```

(Archive: 13 further hits, all under `kaola-workflow/archive/**`, excluded as the issue specifies. An explicit `find`-based sweep including dot-directories found no additional files beyond the above, archive copies, and byte-identical copies under the `.kw/worktrees/bundle-956-957-958-959-960-961-962/` worktree of the same tracked paths. Neither `.opencode` nor `.kimi` contains the phrase.)

**Refinement, non-blocking:** the issue's "exactly three hits" was true when the audit measured it; today there are 8 hit lines in 6 files, because the audit doc, the issue-959 roadmap source, and the generated ROADMAP mirror now quote the phrase *in order to describe this defect*. None is a live doc asserting the claim — `docs/architecture.md:287` remains **the only live-doc assertion**, so the operative conclusion (repair surface = one line) stands unchanged. The roadmap source and mirror row disappear at closure; the audit is a dated record.

### `different forge CLI` — same sweep

Only `docs/architecture.md:287` plus the same self-referential defect-tracking surfaces (audit:90,113; issue-959.md:2,5; ROADMAP.md:13). No other live doc carries the clause.

### `four editions` — the load-bearing phrase that must NOT be touched

```
$ git grep -i -n "four editions" -- ':(exclude)kaola-workflow/archive/**' | wc -l   → 243
```

243 lines across ~70 files: `CLAUDE.md` (1), `docs/api.md` (3), `docs/conventions.md` (3), ~35 `docs/decisions/` ADRs, 10 `docs/investigations/`, `CHANGELOG.md` (133), `install-all.sh`, and script comments in all four trees (incl. every `kaola-workflow-adaptive-schema.js` copy — the byte-identical anchor). Widespread and load-bearing, exactly as the issue says. The proposed repair edits only line 287 of `docs/architecture.md` and leaves every one of these untouched (it *converts* the one "four forge editions" into a "four editions", the sanctioned vocabulary).

## 6. RECOMMENDED REPAIR — docs/architecture.md:287, single line

**Before (verbatim):**

```
**Four forge editions** ship the same workflow against a different forge CLI: the canonical GitHub
```

**After (verbatim):**

```
**Four editions** ship the same workflow across three forge CLIs: the canonical GitHub
```

Why this exact edit:
- **Fixes the false clause**: "across three forge CLIs" states the measured fact (four trees, three CLIs), and the four-vs-three tension is visible inside the one sentence, which then enumerates the four trees.
- **Keeps the vocabulary**: "**Four editions**" is the repo-wide term (CLAUDE.md: "Byte-identical across all four editions"), and the next paragraph's "**Two additive runtime editions** — … are runtimes, not forges" contrast still reads cleanly.
- **Coheres with, and does not duplicate, the #955 table below**: line 313 already says "claude and codex each ship against three forges (github, gitlab, gitea)" and line 316–317 "Runtimes and forge editions are different axes" — "three forge CLIs" agrees with "three forges" and leaves the axis explanation to the table preamble, its one home.
- **Zero rewrap ripple**: the replacement line is 86 characters (< the file's ~100-char wrap); lines 288–293 are byte-untouched, so the diff is one line.
- The lines that carry the runtime fact for the Codex tree already exist: the "(Codex)" parenthetical on line 288 and the table preamble.

If the repairer wants the CLIs named at the point of claim, the variant `…across three forge CLIs (`gh`, `glab`, `tea`): …` is also true and does not duplicate the table (which never names them), but at 108 characters it forces a rewrap of the whole paragraph (lines 287–293) — a larger diff for the same truth. The single-line form above is the smallest true edit.

---

## Non-blocking findings

finding: id=R1 scope=out_of_scope action=report status=open severity=low fix_role=orchestrator rationale=Issue #959's cited counts (canonical gh 127, Codex gh 64, gitlab glab 34, gitea tea 41) did not reproduce under any of four counting methods (mine: exec-sites 6/6/2/3; quoted 49/6/15/17; blunt 357/70/84/96; non-test blunt 72/70/33/39). Every method confirms the structural claim the counts support, so the premise stands; the issue prose's arithmetic is unreproducible, not wrong in substance. No repair-text change needed — the recommended repair cites no counts.

finding: id=R2 scope=out_of_scope action=report status=open severity=low fix_role=orchestrator rationale=The issue's "exactly three hits" blast-radius figure is stale as of 2026-08-12: 8 hit lines in 6 files, the 3 extra files being the audit doc, issue-959's own roadmap source, and the generated ROADMAP mirror — all self-referential descriptions of this defect, none a live-doc assertion. Operative conclusion (one live line to repair) unchanged.

finding: id=R3 scope=out_of_scope action=report status=open severity=low fix_role=orchestrator rationale=Adjacent imprecision in the same paragraph, outside #959's filed target: line 289–290 "Most scripts are rename-normalized copies — `kaola-workflow-<name>.js` becomes `kaola-{forge}-workflow-<name>.js`" holds for the gitlab/gitea trees only; the Codex tree keeps canonical filenames (e.g., `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`). "Most" hedges it; pre-existing; do not fold into this repair without the orchestrator widening scope.

## Confidence

High. The decisive evidence is structural, reproduced under four independent counting patterns, and the positive control passed with every cross-tree token individually enumerated and shown to be a comment or negative-guard regex. Nothing in the falsification attempts (alternate patterns, non-.js sweep, untracked-tree find sweep, per-token inspection) broke the claim.

# premise-961 — fixtures-orphan-legality.js zero-consumer verification

VERDICT: SAFE WITH CONDITIONS — deletion alone breaks nothing (zero live consumers, zero manifest/parity/enumeration exposure); the conditions are two companion edits in the same change (a stale exclusion-comment line in BOTH byte-paired install-manifest copies) and doing the deletion in the tree where this bundle's change lands. Every factual sub-claim of issue #961 verified true: 102 lines, exactly 8 exports, exactly two importers, both deleted, all 8 exports unreferenced outside archive/history prose. Analytical result: **not_refuted**.

Claim under test (verbatim from dispatch): "scripts/fixtures-orphan-legality.js (102 canonical lines) is a shared anti-drift fixture whose TWO importers were both deleted, and all 8 of its exports are unreferenced. Classified `delete:` rather than `yagni:` because the capability has no remaining caller at all — not a feature nobody needs yet, but a fixture whose consumers are already gone."

Surface: the MAIN tree at /Users/ylpromax5/Workspace/Kaola-Workflow (the only tree containing the untracked `.opencode`/`.kimi` edition trees), two-part search (git grep -P over tracked tree + explicit find|xargs sweep over every rendered edition tree), per-export-name searches, git history, positive control. All captures were full; nothing was piped through `head`/`tail`.

---

## 1. File exists; line count

```
$ ls -la scripts/fixtures-orphan-legality.js && wc -l scripts/fixtures-orphan-legality.js
-rw-r--r--@ 1 ylpromax5  staff  4098  6月  9 13:47 scripts/fixtures-orphan-legality.js
     102 scripts/fixtures-orphan-legality.js
```

102 lines — matches the issue. Tracked (`git ls-files --error-unmatch` → TRACKED).

## 2. Export enumeration — exactly 8

`module.exports` block, verbatim (scripts/fixtures-orphan-legality.js:93-102):

```js
module.exports = {
  ORPHAN_LEGALITY_MANIFEST,
  ORPHAN_LEGALITY_IN_PROGRESS_IDS,
  CROSS_CHECK_EXPECTED,
  RUN_ORIENT_EXPECTED,
  TOPUP_INCOMPLETE_MANIFEST,
  TOPUP_INCOMPLETE_IN_PROGRESS_BEFORE,
  TOPUP_INCOMPLETE_IN_PROGRESS_AFTER,
  TOPUP_INCOMPLETE_REASON,
};
```

Count = 8. The issue is right about its own subject. No other `module.exports`/`exports.` statement exists in the file.

## 3. Full consumer enumeration

### Part A — tracked tree, STEM search (`git grep -Pn 'fixtures-orphan-legality'`, plus `orphan-legality`, plus `orphanLegality`)

`orphanLegality`: **zero hits** (exit 1). `fixtures-orphan-legality` / `orphan-legality`: every hit, deduplicated by file, classified:

| hit | class |
|---|---|
| `scripts/fixtures-orphan-legality.js:4` | the module itself |
| `scripts/kaola-workflow-install-manifest.js:55` | **comment only** — exclusion note `//   kaola-workflow-fixtures-orphan-legality.js — CI-only fixture validator` (note: this name, with the `kaola-workflow-` prefix, NEVER matched the real filename — a known comment-accuracy nit, archive review R3 of bundle-414-418-422) |
| `plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js:55` | same comment, byte-paired copy |
| `CHANGELOG.md:3030, 3240, 3300` | release history |
| `docs/audits/2026-08-11-subtraction-audit.md:62` | the audit that filed #961 |
| `kaola-workflow/.roadmap/issue-961.md:2,5` + `kaola-workflow/ROADMAP.md:15` | the issue under test itself |
| `kaola-workflow/archive/issue-293/` (workflow-plan.md, phase6-summary.md, .cache/{align,code-review,doc-docking,finalize,advisor-closure}.md) | archive prose (the fixture's birth run) |
| `kaola-workflow/archive/issue-281/.cache/aggregator-core.md:37` | archive prose (`orphan-legality` phrase only) |
| `kaola-workflow/archive/bundle-414-418-422/` (workflow-plan.md, .cache/{review,t418-manifest-twin}.md) | archive prose (the comment's birth run) |
| `kaola-workflow/archive/bundle-952-953-954-955/` (finalization-summary.md, mission-list.md, reports/audit-952-scripts.md) | archive prose (the audit run) |

**Zero live-code consumers. Zero test references. Zero docs/api.md, docs/architecture.md, walkthrough, or package.json references.**

### Part A — per-export-name searches (8 separate `git grep -Pn` runs)

| export | hits outside the module itself |
|---|---|
| `ORPHAN_LEGALITY_MANIFEST` | archive prose only (audit-952 report, issue-293 code-review) |
| `ORPHAN_LEGALITY_IN_PROGRESS_IDS` | CHANGELOG:3240 (history) + archive prose only |
| `CROSS_CHECK_EXPECTED` | archive prose only |
| `RUN_ORIENT_EXPECTED` | archive prose only (bundle-593-594-595 scheduler note, audit-952) |
| `TOPUP_INCOMPLETE_MANIFEST` | archive prose only |
| `TOPUP_INCOMPLETE_IN_PROGRESS_BEFORE` | **zero hits anywhere** |
| `TOPUP_INCOMPLETE_IN_PROGRESS_AFTER` | **zero hits anywhere** |
| `TOPUP_INCOMPLETE_REASON` | archive prose only |

8/8 unreferenced by live code — matches the issue.

Supplementary: the raw string value `'batch_topup_incomplete'` (the value of `TOPUP_INCOMPLETE_REASON`) appears in live `.js` **only inside the fixture itself** — its producing mechanism (`kaola-workflow-parallel-batch.js`) is gone from all four former locations. Dynamic-require check: `git grep -Pn "fixtures-" -- '*.js'` minus the fixture's own name → **zero hits**; no code constructs a `fixtures-…` path dynamically.

### Part B — explicit find|xargs sweep over ALL rendered edition trees (ugrep skips dot-dirs; git grep cannot see untracked trees)

Swept more than the six trees the issue names — all nine edition trees plus `.codex`, `.claude`, `.agents`, `.cache`, `.kw`. Pattern: `fixtures-orphan-legality|ORPHAN_LEGALITY_|TOPUP_INCOMPLETE_|orphanLegality|orphan-legality`. Per-tree file counts prove no sweep was silently empty:

| tree | files swept | hits |
|---|---|---|
| `.opencode` | 22 (excl. node_modules) | 0 |
| `.opencode-gitea` | 19 | 0 |
| `.opencode-gitlab` | 19 | 0 |
| `.kimi` | 19 | 0 |
| `.kimi-gitea` | 19 | 0 |
| `.kimi-gitlab` | 19 | 0 |
| `plugins/kaola-workflow` | 47 | 1 — `kaola-workflow-install-manifest.js` (the comment) |
| `plugins/kaola-workflow-gitea` | 56 | 0 |
| `plugins/kaola-workflow-gitlab` | 62 | 0 |
| `.codex` / `.claude` / `.agents` / `.cache` | 1/1/1/2 | 0 |
| `.kw` | 9125 | 21 files — ALL of them the bundle worktree's checkout of the SAME tracked files already classified above (the fixture, the two install-manifest comments, CHANGELOG, ROADMAP, issue-961, audit doc, archive prose) |

Interpretation guard for the six `.opencode*`/`.kimi*` zeros: those trees carry only rendered agent/command markdown, hooks, and node_modules — **no scripts at all** (full `find` listing captured). The positive control (§7) returns the same 0 there for a known-live module, so these zeros are structural, not a broken sweep.

## 4. Historical claim: "both importers were deleted" — VERIFIED, exactly two, both deleted

```
$ git log --oneline --diff-filter=A -- scripts/fixtures-orphan-legality.js
c6c7a6c7 fix(#293): align crossCheckStatus with runOrient on single-in_progress + non-matching manifest

$ git log --oneline --diff-filter=D -- scripts/test-parallel-batch.js
1fc33c9d refactor: retire the vestigial parallel-batch subsystem (#586)

$ git log --oneline --diff-filter=D -- scripts/test-adaptive-node.js
c0b48043 docs(claude): rewrite CLAUDE.md onto the mission list; remove the banner
```

Complete `.js` referencer set at each boundary (full `git grep -ln` at the commit):

- At `1fc33c9d^` (pre-#586): the module itself + the two comment-only install-manifest copies (verified comment-only at that commit: both line 55, leading `//`) + **`scripts/test-parallel-batch.js` + `scripts/test-adaptive-node.js`** — i.e. exactly TWO real importers ever, matching the issue.
- `1fc33c9d` (#586) deleted `test-parallel-batch.js` (importer 1) along with all four `*parallel-batch.js` copies; it modified `test-adaptive-node.js` but the import survived.
- At `c0b48043^`: `test-adaptive-node.js` still imported the fixture.
- `c0b48043` (the mission-list rewrite) deleted `test-adaptive-node.js` (importer 2).
- At `HEAD`: `.js` referencers = the module + the two comment-only copies. Nothing else.

No third importer ever existed; neither importer was renamed — both are `D` in history and absent from disk repo-wide (`find . -name 'test-parallel-batch*' -o -name 'test-adaptive-node*'` → nothing).

## 5. Test custody — nothing to remove

No test file in the tracked tree references the fixture by stem or by any of its 8 export names (Part A above covers `scripts/test-*.js` in full). The tests that existed to consume it WERE `test-parallel-batch.js` and `test-adaptive-node.js`, already deleted with their mechanisms in 1fc33c9d and c0b48043. No test uses it incidentally. The issue's custody clause is already satisfied by history; the deletion commit removes no test.

## 6. What else breaks on deletion — nothing mechanical

- **Copies on disk (`find . -name 'fixtures-orphan-legality*'`, dot-dirs included): exactly 2** — `scripts/fixtures-orphan-legality.js` (the tracked copy) and `.kw/worktrees/bundle-956-957-958-959-960-961-962/scripts/fixtures-orphan-legality.js` (this bundle's git worktree checkout of the same tracked file — one `git rm`, not two deletions). Multiplier ×1 confirmed: no plugins/opencode/kimi copy exists.
- **Install manifest**: the fixture is deliberately ABSENT from `SUPPORT_SCRIPTS` (exclusion comment at scripts/kaola-workflow-install-manifest.js:55, both copies byte-paired — sha256 both `2a8224ef…`). The FA9 assertions in `test-kimi-edition.js:1287-1293` and `test-opencode-edition.js:1829-1835` compare deployed sets against `manifest.supportScripts(forge)` — the fixture is on neither side; deletion is invisible to them. `install.sh` consumes the manifest emission (test-install-manifest-single-source.js), so the fixture was never installed anywhere.
- **Directory enumerations of `scripts/`** — all filtered by patterns the fixture cannot match:
  - `test-kernel-conformance.js:209` — `/^kaola-workflow-[a-z0-9-]+\.js$/`
  - `test-route-reachability.js:771` and `simulate-workflow-walkthrough.js:12023` — `/^sync-[a-z0-9-]+-edition\.js$/`
  - `test-suite-registration.js:103` — `/^test-.*\.js$/`
  - `test-spawn-classification.js:105-108` (`isSuiteFile`) — `test-*.js` / `simulate-*walkthrough*.js`
  No count assertion anywhere sees this file. `package.json` carries no `scripts/*` glob and no fixture reference (grep exit 1).
- **The one thing that DOES go stale**: the exclusion-comment line 55 in both byte-paired `kaola-workflow-install-manifest.js` copies will name a file that no longer exists (it already names it wrongly). No test reads that comment; this is prose hygiene, not breakage — but it is the same change's business.

## 7. Positive control — method validated

Identical two-part method against known-live `kaola-workflow-adaptive-schema`:

- Part A: `git grep -l 'kaola-workflow-adaptive-schema' -- '*.js'` → **80 files** (full list captured: all four run-chains/claim/classifier/sink copies, walkthroughs, 20+ test suites, edition-sync, templates/routing/slots.js, …).
- Part B, same tree loop: `plugins/kaola-workflow: 13`, `plugins/kaola-workflow-gitea: 16`, `plugins/kaola-workflow-gitlab: 16`, all `.opencode*`/`.kimi*`: 0 — and the 0 is explained structurally (§3 Part B: those trees ship no scripts; a live module scores 0 there too).

A method that returns 80 and 13/16/16 for a live module and 0-plus-one-comment for the fixture is discriminating. The fixture's zero is a real zero.

---

## DELETION PLAN

Every path to remove, across every tree:

1. `git rm scripts/fixtures-orphan-legality.js` — the ONLY tracked copy. Do it in the tree where this bundle's change is being made (the bundle worktree `.kw/worktrees/bundle-956-957-958-959-960-961-962/` holds the same tracked file as a checkout; one `git rm` in the working tree covers both appearances). No other tree — plugins ×3, `.opencode` ×3, `.kimi` ×3, `.codex`, `.claude` — holds a copy; nothing to remove there.
2. **Same commit, companion edit**: delete line 55 (`//   kaola-workflow-fixtures-orphan-legality.js — CI-only fixture validator`) from BOTH byte-paired copies — `scripts/kaola-workflow-install-manifest.js` AND `plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js` — byte-identically, preserving their byte pairing (currently sha256-equal).
3. No test to delete or repair — both custodian tests are already gone (§5).
4. No manifest, installer, parity check, contract validator, or edition-sync change — the fixture was never registered or shipped (§6).
5. `CHANGELOG.md` `[Unreleased]` entry per project convention.
6. Leave untouched: CHANGELOG history lines 3030/3240/3300, all `kaola-workflow/archive/` mentions, `docs/audits/2026-08-11-subtraction-audit.md` (historical records). `kaola-workflow/.roadmap/issue-961.md` + `ROADMAP.md` are removed/regenerated by normal issue closure, not by this deletion.

---

finding: id=R1 scope=out_of_scope action=follow_up status=open severity=low fix_role=none rationale=install-manifest exclusion comment (both byte-paired copies, line 55) names the fixture under a never-correct kaola-workflow- prefixed name and goes stale on deletion; remove the line in both copies in the same change — prose hygiene, no test reads it, pre-existing nit (archive R3 of bundle-414-418-422)

verdict: pass
findings_blocking: 0

Analytical result: **not_refuted** — strong falsification attempts (stem + 8 per-export searches over the tracked tree; full sweep of nine edition trees with per-tree counts; history enumeration at both deletion boundaries; enumeration-filter audit; positive control) all failed to produce a surviving consumer, and every quantitative sub-claim (102 lines, 8 exports, 2 importers, ×1 multiplier) reproduced exactly. Execution: completed cleanly, no missing or truncated captures. Confidence: high.

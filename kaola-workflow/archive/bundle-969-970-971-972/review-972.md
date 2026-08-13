# Review — #972: install-all.sh content convergence (adversarial, Fable)

Candidate: worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-969-970-971-972`,
branch `workflow/bundle-969-970-971-972`, `git diff 7e962bdc -- install-all.sh` (128 insertions,
32 deletions). Subject: install-all.sh only. Method: read the full shipped file, then ran the repo
suite plus my own scratch fixtures (`attack-972.js`, `ccs-drive.sh` in the session scratchpad —
the repo's `test-install-all.js` was not edited). All wrapper executions ran with HOME and
CODEX_HOME redirected into per-fixture temp dirs and KAOLA_CODEX_BIN pointed at a stub CLI.

Verdict up front: the headline mechanism is sound and the claimed properties held under attack —
but two real defects were found, both demonstrated by execution, both medium. No high/critical.

---

## Findings (most severe first)

### F1 — MEDIUM: every "unanswerable" state reports a bare PASS indistinguishable from a verified row (the silently-disabled check)

- Anchor: `install-all.sh:503-514` (trigger fallback), `install-all.sh:379` (the `return 2` guard),
  secondary `install-all.sh:120-125` (the PASS/PARTIAL definitions the behavior contradicts).
- Failure class: silently-disabled guard / shipped-contract divergence.
- Trigger: `sourceType == "local"`, `installed == tree`, and `codex_cache_content_state` returns
  state 2 (unanswerable). Every state-2 door lands here: row missing `source.path` (empty string),
  `source.path` nonexistent or unreadable, the derived cache dir absent (layout drift, a CODEX_HOME
  that does not match what the real CLI uses, a marketplace name containing `@` breaking the
  `${plugin_id%@*}` split), or the walk aborting mid-way (EACCES on a subdir — probed directly:
  state 2).
- Observed (demonstrated, fixtures E1/E1b/E1c): with the cache serving stale content and the
  comparison unanswerable, the wrapper prints `>>> [codex] marketplace plugin already at 5.0.0`,
  the row reads `codex PASS (exit 0) — plugin 5.0.0`, the run prints `all runtimes OK`, exit 0,
  zero mutating calls. The row is byte-identical to a genuinely verified row.
- Expected: the wrapper's own shipped vocabulary. `install-all.sh:124-125` defines PARTIAL as
  "installer succeeded but a check that DOES apply could not be completed (reason printed); never
  a bare PASS" — a local marketplace is exactly a box where the content check applies, and state 2
  is exactly "could not be completed". Meanwhile `install-all.sh:120-121` now strengthens PASS to
  "the marketplace plugin serves what its source installs", which state 2 did not verify. Both
  `codex_degrade` call sites for the analogous version-axis unanswerables (unreadable manifest,
  unparseable listing, timeout) go to PARTIAL; the content-axis unanswerable alone goes to silent
  PASS.
- Why existing guards do not catch it: the implementer's note is right that UNKNOWN must never
  REFRESH (churn on a misread box) — but that argument rules out the refresh, not the reporting.
  No test pins state 2 (the implementer flagged this themselves, impl-972.md finding 2), and on a
  box where the cache-dir derivation is wrong the check silently vanishes forever while the help
  text claims content currency — the original defect's shape (false "current") through a new door.
- Impact bound, honestly stated: on such boxes behavior equals the pre-#972 baseline (version-only
  check), so this is not a behavioral regression; the defect is that the new PASS claim and the
  PARTIAL contract are now false on those boxes, and the operator cannot distinguish "verified
  current" from "could not look". Fix direction (orchestrator's call): route state 2 on a local
  marketplace through `codex_degrade` (a third call site, no new vocabulary — premise-972 claim 6),
  or weaken the PASS text to match; the no-refresh stance stays.

### F2 — MEDIUM: a content-triggered refresh that converges is reported FAIL when the marketplace's plugin version differs from the invoking tree's — entering a permanently-red churn loop

- Anchor: `install-all.sh:503-516` (the new content trigger) interacting with
  `install-all.sh:558-564` (the pre-existing tree-version proof); secondary
  `install-all.sh:261-263` (section-comment overclaim).
- Failure class: mixed-oracle incoherence / false-negative verdict with self-inflicted churn.
- Trigger (reachable in this repo's routine shape): the marketplace points at main; main bumps the
  plugin version (every release does) and the cache has not been refreshed since; a non-dry
  `install-all` runs from a worktree whose manifest still carries the old version. Fixture E2:
  invoking tree manifest 5.0.0, marketplace checkout 6.0.0 with moved content, installed 5.0.0,
  cache stale.
- Observed (demonstrated, E2): run 1 — the content trigger fires (`installed == tree` = 5.0.0,
  cache differs from `source.path`), remove+add installs 6.0.0 from the marketplace, the cache now
  serves byte-exactly what its source installs (verified in the fixture) — and the wrapper reports
  `!!! plugin still reports 6.0.0 after refresh (tree 5.0.0) — NOT converged`, `codex FAIL`,
  exit 1, because `install-all.sh:559` judges `after` against `$ROOT`'s manifest. Run 2, same box:
  the version trigger (6.0.0 != 5.0.0) churns remove+add again and FAILs again — every run, until
  the invoking tree and main re-align.
- Expected: the candidate's own ruled doctrine, pinned by W1 in the suite — "a converged runtime is
  never FAIL just because the invoking tree differs from its source". After run 1 the runtime IS
  serving its source's content; the FAIL is a false negative. At baseline this exact state was
  quiescent (version equality -> PASS, zero mutations), so the entry into the loop is
  candidate-caused: the new trigger performs a mutation and then the old proof condemns its result.
- Why existing tests do not catch it: W1-W3 separate the marketplace's CONTENT from the invoking
  tree but keep the two manifests' VERSIONS equal by construction (stubRoot copies the tree's
  manifest into the marketplace checkout), so the version-skew corner of the worktree shape is
  never exercised.
- Why it matters beyond the row: wrapper exit 1 (a false red for automation), remove+add churn on
  every run, and under `--strict` the abort fires before kimi installs — a healthy runtime is
  skipped because of a wrong verdict. The section comment at `install-all.sh:261-263` ("run from a
  linked worktree, this answers about that marketplace and not about the worktree") overclaims:
  it is true of the content axis only; the version trigger and the post-refresh version proof still
  answer about the worktree. Fix direction (orchestrator's call — the S7/S8 constraint said the
  version TRIGGER stays, and it can): on the content-triggered path, judge `after` against the
  source's manifest (or accept the content proof as subsuming the version equality that held by
  construction); alternatively amend the comment to state the version-skew boundary honestly.

---

## Attacked and found SOUND

1. Non-convergent loop, content axis proper (the ruled-for property): with version-consistent
   trees, no reachable state loops — W3 pins it, and my E2 variant shows the only loop found comes
   from the version-skew interaction (F2), not from the content oracle itself. The oracle IS
   `source.path` — the two comparison sites (`install-all.sh:506-507`, `:566-567`) pass
   `"$source_path"`, not `$ROOT/$CODEX_PLUGIN_DIR` and not a path rebuilt from the marketplace
   root.
2. The non-vacuous re-read (attack 4): fixture E3 — `add` exits 0 at the equal version but never
   materializes the cache; the post-refresh content read is unanswerable and the wrapper FAILS
   (`plugin does not serve its source's content after refresh`, exit 1). `if ! codex_cache_content_state`
   treats state 2 as failure on the proof side — fails closed, asymmetric with the trigger side by
   design. The version-equal-throughout fixture (S5) plus E3 confirm only a content observation can
   produce the green.
3. Version trigger not over-gated (attack 6), from the code: the `source_type == "local"` gate at
   `install-all.sh:505` sits inside the `installed == tree` branch; a version mismatch bypasses the
   whole block and refreshes regardless of sourceType (S8 green, and the E2 run-2 git-free variant
   exercises the same path).
4. Row parsing (`install-all.sh:485-490`): traced by hand and by execution — 4-field TSV with both
   trailing fields empty, sourceType-only, and full rows all parse correctly (E1b hit the empty
   `source.path` -> `[[ -d "" ]]` -> state 2 exactly as the implementer claimed).
5. Comparison semantics, probed one-by-one against the shipped function (extracted verbatim,
   `install-all.sh:377-407`): identical -> 0; extra file in either direction -> 1 (both
   directions); same-count-different-names -> 1; newline-vs-none -> 1; dotfiles ARE compared
   (`.codex-plugin/plugin.json` included — that is how a manifest edit is seen); empty dirs
   invisible -> 0 (benign); spaces in paths and names -> correct; order-stable (Map keyed by
   relative path, lookup not positional); mode-only drift -> 0 (invisible, same as every baseline
   axis — no churn, no regression); symlink-vs-materialized-file -> 1, symlink-on-both-sides -> 0
   (symlinks are skipped by the walk; see watch items); unreadable subdir -> 2; relative
   `tree_dir` resolves against CWD (watch item).
6. Benign-forever-differs: a cache-only extra file (`.DS_Store`) reads differ -> refresh — but
   `remove` clears the whole cache dir (documented CLI behavior, modeled by the stub), so the
   refresh converges rather than looping; only a persistently-failing `remove` would loop, and
   loudly (FAIL), never silently. Premise-972 measured zero extra-in-install files live.
7. Shell correctness: `bash -n install.sh uninstall.sh install-all.sh` exit 0 (run directly, no
   pipe). All new expansions quoted (`"$source_path"`, both `"$(codex_plugin_cache_dir ...)"`
   sites); no new pipes carry a status (`verdict="$(node ...)"` is a plain substitution, its `||`
   reads node's real exit); `local content_stale=0 cstate=0` correctly scoped; set -u safe
   (`${CODEX_HOME:-${HOME:-}/.codex}`); the only `|| true` is the pre-existing best-effort
   `remove`, whose masking is bounded by the loud post-proof (E3). The pre-existing
   `tee`/`PIPESTATUS[0]` pattern is untouched.
8. Suite: `node scripts/test-install-all.js` -> `install-all contract test passed (196 assertions)`,
   exit 0, reproduced in the worktree. S1-S8/W1-W3 assert what they claim (read in full); the
   mutation table in tests-972.md is consistent with the code paths I traced.
9. Prose and citations (attack 7): the heading `# Codex marketplace-plugin convergence.` at
   `install-all.sh:252` is byte-intact, and `docs/architecture.md` (line 335 in the worktree; the
   brief's :328 has shifted with other agents' doc edits) still cites it verbatim — resolves. The
   file header, `--help` mechanism text, and trigger comments are accurate about what ships, with
   the two exceptions folded into F1 (PASS definition, `:120-121`) and F2 (worktree sentence,
   `:261-263`).

## Watch items (not admitted as defects — no reachable trigger today)

- A symlink introduced into `plugins/<name>/` would read differ forever if `codex plugin add`
  materializes it as a regular file (walk skips symlinks on both sides): loud churn+FAIL loop.
  Zero symlinks in the live tree (premise-972: 47 files, zero symlinks).
- A relative `source.path` on the row would be resolved against the wrapper's CWD (probed: wrong-dir
  compare). The live row is absolute; unknown whether the CLI can ever emit relative.
- `source_path` is not re-parsed from the post-refresh row (`install-all.sh:552-558` re-reads
  version only); a marketplace reconfigured mid-run gives one loud FAIL, self-correcting next run.
- The cache-dir derivation is coupled to the observed codex-cli 0.147.0 layout; a future layout
  change degrades to F1's silent-PASS door, which is the reason F1 wants the PARTIAL routing.

## Constraint compliance

- No file in the worktree or main checkout was edited; this evidence file is my only write besides
  session-scratchpad files.
- The live `~/.codex` was never mutated and never even reachable: no `codex plugin add/remove`, no
  non-dry run against the real HOME — every wrapper execution used a stub CLI and fixture
  HOME/CODEX_HOME. Verified by whole-cache digest: `find ~/.codex/plugins/cache -type f | shasum`
  over 1310 files, snapshotted before any execution and after all of it — diff empty (exit 0), and
  the staleness witness `.../7.8.0/skills/kaola-workflow-next/SKILL.md` still reads
  mtime Aug 10 23:22:29, size 14803.

finding: id=F1 scope=in_scope action=fix status=open severity=medium fix_role=implementer rationale=unanswerable-content-state-reports-bare-pass-indistinguishable-from-verified-contradicting-shipped-pass-partial-contract
finding: id=F2 scope=in_scope action=fix status=open severity=medium fix_role=implementer rationale=content-triggered-refresh-judged-by-invoking-tree-version-oracle-reports-converged-runtime-fail-and-enters-permanent-churn
verdict: fail
findings_blocking: 2
review_conclusion: The content-convergence mechanism, its local gate, its oracle swap, and its non-vacuous post-refresh proof all held under adversarial fixtures; two demonstrated medium defects remain — every unanswerable comparison state yields a bare PASS identical to a verified row, and a version-skewed marketplace turns a successful content refresh into a permanently red churning FAIL.

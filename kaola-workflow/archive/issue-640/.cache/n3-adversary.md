evidence-binding: n3-adversary 010acb47b1c8
verdict: pass
findings_blocking: 0

## Claim Under Test
"The OPT-2 `metric_paths` shape check in the adaptive plan-validator (issue #640, `scripts/kaola-workflow-plan-validator.js` `shapeReason` at line 1537) now refuses THREE additional shape classes — absolute-path (`/`-prefix and Windows `C:` drive-letter), backslash-separated, and bare existing-directory (statSync-detected, no trailing slash) — under an `OPT-2:` refusal, while legitimate metric paths stay in-grammar; no legitimate metric path regressed; and all four edition chains are green."

## Battery Results (19 scratch plans, actual CLI runs)
Method: minimal in-grammar optimize DAG (explore -> opt[write: src/hot.js] -> review -> adv -> done) written per-variant under $SCRATCH/adv640 with a `.git` dir to pin findRepoRoot there; real fs fixtures under that root: `metricdir/` (dir), `bench/sub/` (dir), `Makefile` (file), `dirlink` (symlink->metricdir). Each run: `node <worktree>/scripts/kaola-workflow-plan-validator.js $SCRATCH/adv640/plan-<name>.md --json`.

1. absolute REFUSE — `/tmp/suite.js` -> refuse, OPT-2 `(absolute_path)`. PASS.
2. Windows-absolute + precedence — `C:\bench\suite.js` -> refuse, OPT-2 `(absolute_path)`, NOT backslash_in_path (absolute-before-backslash proven). Also `C:/bench/suite.js` and drive-relative `C:suite.js` -> `(absolute_path)`. PASS.
3. backslash REFUSE — `bench\suite.js` -> refuse, OPT-2 `(backslash_in_path)`. Also `\bench\suite.js` and mixed `bench/sub\suite.js` -> backslash_in_path. PASS.
4. bare-existing-directory REFUSE — real dir `metricdir` (slash-less) -> refuse, OPT-2 `(bare-existing-directory)`. Also nested real dir `bench/sub` (no trailing slash) and symlink-to-dir `dirlink` -> same refuse. Soundness negative-control: bare NONEXISTENT `notyetcreated` -> in-grammar (statSync-throw clean skip), proving the refusals were genuinely fs-driven, not name-pattern matching. PASS.
5. accept control (root FILE) — real `Makefile` -> in-grammar, no OPT-2 error. PASS.
6. accept control (nested file) — `bench/nested/suite.js` (nonexistent, slash-bearing) -> in-grammar. PASS.
7. no regression — `bench/` (dir-shaped), `bench/*.js` (glob), `bench/../src/hot.js` (`..`) all still refuse under OPT-2; `src/hot.js` still trips the write-set disjointness refuse. PASS.
8. four chains — `KAOLA_RUN_CHAINS_CONCURRENCY=serial npm test` from the worktree ran to completion: output ends with the gitea chain's FINAL command succeeding (`Gitea Codex workflow walkthrough simulation passed` -> `generate-routing-surfaces --check: all 12 surfaces byte-match the skeleton.`), reachable under package.json's `&&` chaining only after claude/codex/gitlab exited 0; no `npm ERR!`. The claude chain includes simulate-workflow-walkthrough.js, so the #640 assertions (simulate-workflow-walkthrough.js:2367-2383) executed green. Also directly verified: the change is present in all 4 validator copies (canonical + plugins/kaola-workflow + gitlab + gitea; grep -c bare-existing-directory = 2 each) and `node scripts/edition-sync.js --check` is in parity (10 ports, 24 mirrors, 27 byte-groups). PASS.

## Bypass probes (searched, none found)
- `//tmp/suite.js` -> normalizeRepoPath collapses to `/tmp/suite.js` -> absolute refuse (no slash-collapse bypass).
- `./src/hot.js`, `src/./hot.js` -> normalize to `src/hot.js` -> disjointness refuse (no dot-segment aliasing bypass; metric_paths routes through parseWriteSetCell, plan-validator.js:479).
- Multi-token `bench/suite.js /tmp/x.js` -> the absolute token caught individually.
- `/tmp` (absolute AND existing dir) -> absolute refuse (precedence; still refused).
- `~/bench/suite.js` -> in-grammar. NOT a refutation: `~` is not one of the three claimed classes and the declared_write_set freeze wall (plan-validator.js:1398-1433) has no `~` arm either — exact mirror parity; pre-existing shared shape, non-blocking observation.
- Cosmetic non-blocking note: for overlap shapes OPT-2's arm order differs from the freeze wall (dir/glob/`..` first, so `/tmp/dir/` reports the dir-shape reason where the freeze wall would say absolute) — both refuse under OPT-2 regardless; the claim's only precedence requirement (absolute before backslash) is proven by plant 2.

## Verdict
NOT-REFUTED (confidence: high). Every claimed refuse class fired with the correct typed reason against genuine fs state; precedence proven; accept controls and pre-existing shapes unregressed; normalization evasions closed; propagation to all 4 edition copies confirmed; four chains green (serial). Zero repo files touched — all plants under the session scratchpad.

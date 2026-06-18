# Workflow Plan — issue-527

<!-- plan_hash: 40588a3077458c0b2db7ae56bc08b7b2974adff37b7247a0e421828078eed09e -->

bug(tests): the gitlab/gitea adaptive-node `orient --summary` smoke test for a NONEXISTENT
project leaks an untracked `kaola-workflow/nonexistent-{gl,gt}-445-test/.cache/orient-envelope.json`
scratch tree into the repo cwd on every `test:kaola-workflow:{gitlab,gitea}` chain run, and never
cleans it up.

## Meta

labels: bug
issue: 527
sink: merge

## Design rationale (not part of the frozen grammar — orientation for the executor)

Localization is settled (no probe node needed — over-engineering it would waste tokens, precedence
#3): the leak is the `--summary` branch in the forge `kaola-{gitlab,gitea}-workflow-adaptive-node.js`
`main()` (gitlab ~L5317, gitea twin), which UNCONDITIONALLY `fs.mkdirSync(cacheDir,{recursive})` +
writes `<subcommand>-envelope.json` into `kaola-workflow/<project>/.cache/` even for a `refuse`
(`plan_missing`) result. `cacheDir` is `getRoot()`-relative (`git rev-parse --show-toplevel`, falling
back to `process.cwd()`), so the two forge smoke tests (which spawn `orient --project
nonexistent-{gl,gt}-445-test --json --summary` with NO `cwd` opt → repo cwd) materialize the scratch
inside the repo tree and leave it behind.

CHOSEN DIRECTION — (b)+(a) test-local hybrid (the cheapest sufficient mechanism; smallest blast
radius; zero shared-orient-source risk):
- Redirect each test's `orient --summary` spawn to a fresh `tempRoot('kw-{gl,gt}-orient-summary-')`
  cwd via the `spawnSync` `cwd` option, so the scratch lands in `$TMPDIR` (a non-git dir →
  `getRoot()` falls back to `process.cwd()` = the tmp dir), NOT the repo. EMPIRICALLY VERIFIED at
  authoring time: tmp cwd redirects the scratch out of the repo.
- Clean that tmp tree up in a `try { ... } finally { fs.rmSync(tmp, {recursive,force}) }` so the test
  is fully self-contained and leaves NOTHING behind anywhere.
- The two editions are the SAME logical change mirrored modulo the `gl`/`gt` forge noun and the
  edition script name — kept in ONE node (#309 semantic-coupling: two parallel implementers would
  risk prose divergence; no file-count ceiling forces a split, #453) so the twins converge by
  construction.

Why NOT direction (c) (make `orient --summary` not materialize a `.cache` tree for a refuse): it
changes the SHARED orient source in ALL FOUR editions (the `--summary` envelope-cache block is a
byte-mirror at gitlab/gitea/codex/claude-base ~L5317-5327), changes a documented #446 behavior (the
`<op>-envelope.json` drill-in cache), and risks other walkthrough/test consumers — far wider blast
radius and cross-edition drift for a low-severity test-hygiene bug. Rejected per precedence #1
(accuracy/rework risk) + #3 (cheapest sufficient).

HARD CONSTRAINTS for n1-fix:
- PRESERVE the `--summary` sentinel assertion verbatim: `summaryOut.startsWith('summary:')` (#446
  anchor) — only the scratch side-effect (the spawn cwd + cleanup) changes.
- This is a bug fix → `tdd-guide`: write the RED test FIRST — assert that after the smoke test runs,
  NO `kaola-workflow/nonexistent-{gl,gt}-445-test` directory exists under the repo root (the leak is
  the failing observation); then GREEN by redirecting the spawn cwd to tmp + finally-cleanup.
- `fs`, `os`, `path`, `tempRoot(name)` are already module-scope in both forge test files (verified).
- Keep the `env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }` spawn env; ADD the `cwd` opt.

CROSS-EDITION (#307): the bug lives in the gitlab + gitea ports; the fix is test-local so the
claude/codex chains are behaviorally unaffected, but the four-chain gate (n3) still requires all four
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` GREEN run SEQUENTIALLY (a green claude
chain alone is insufficient evidence — `npm test` short-circuits on the first `&&` failure). The
four long chains cannot be reliably run by a subagent (subagent-can't-run-long-chains), so that
verification is the non-delegable acceptance gate `main-session-gate` (n3).

No decision record needed (test-hygiene bug, no architectural decision). No `security-reviewer`
(label `bug`, not sensitive). No `doc-updater` node — the only doc change is a CHANGELOG `[Unreleased]`
entry, written by the `finalize` sink (a permitted docs/state write).

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-fix | tdd-guide | — | plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 1 | sequence | sonnet |
| n2-review | code-reviewer | n1-fix | — | 1 | sequence | opus |
| n3-fourchain | main-session-gate | n2-review | — | 1 | sequence | — |
| n4-finalize | finalize | n3-fourchain | CHANGELOG.md | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-fix | complete |
| n2-review | complete |
| n3-fourchain | complete |
| n4-finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-fix) | subagent-invoked | evidence-binding: n1-fix ef098cd790b4 | |

| code-reviewer | subagent-invoked | evidence-binding: n2-review 9282ff9fcac0 | |
| main-session-gate (n3-fourchain) | subagent-invoked | evidence-binding: n3-fourchain bc7a59b3ef15 | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize 2339ddc8eee4 | |
## Plan Notes

- n1-fix (tdd-guide, sonnet): single cohesive cross-edition test fix. RED first: assert no
  `kaola-workflow/nonexistent-{gl,gt}-445-test` scratch dir remains under the repo root after the
  `orient --summary` smoke test runs. GREEN: pass `cwd: tempRoot('kw-{gl,gt}-orient-summary-')` to the
  `spawnSync(orient ... --summary)` call in each forge test and wrap the assertion + cleanup in
  `try { assert(...summary sentinel preserved...) } finally { fs.rmSync(tmp,{recursive,force}) }`.
  PRESERVE `summaryOut.startsWith('summary:')` (#446). Mirror gl↔gt modulo the forge noun + the
  edition script name `kaola-{gitlab,gitea}-workflow-adaptive-node.js`. Write evidence with the RED
  and GREEN tokens to `kaola-workflow/issue-527/.cache/n1-fix.md`.
- n2-review (code-reviewer, opus): G1 gate over n1-fix. Confirm BOTH editions: (1) the `--summary`
  sentinel assertion is byte-preserved, (2) the spawn now redirects to a tmp cwd AND cleans it up in
  a finally, (3) the gl/gt edits are prose-converged mirrors (only the forge noun + script name
  differ), (4) no scratch leaks into the repo when each forge chain runs. Emit lowercase
  `verdict: pass` + `findings_blocking: 0` to `kaola-workflow/issue-527/.cache/n2-review.md`.
- n3-fourchain (main-session-gate): NON-DELEGABLE four-chain acceptance gate (#307). The main
  session runs, SEQUENTIALLY, `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex
  && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea` and confirms all four
  exit 0 with their success sentinels (capture REAL exit codes — never gate on a piped `| tail`).
  ALSO confirm `git status --porcelain` shows NO untracked `kaola-workflow/nonexistent-{gl,gt}-445-test`
  scratch after the gitlab+gitea chains (the actual bug acceptance). Record `verdict: pass` evidence to
  `kaola-workflow/issue-527/.cache/n3-fourchain.md`. Finalization is provably impossible until this
  records pass (G3 post-dominance).
- n4-finalize (finalize): unique sink. Add a CHANGELOG.md `[Unreleased]` entry under `### Fixed`
  noting the gitlab/gitea `orient --summary` smoke-test scratch leak fix (#527). Docs/state write only.

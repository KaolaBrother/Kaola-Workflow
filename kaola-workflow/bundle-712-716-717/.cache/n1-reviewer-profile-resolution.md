evidence-binding: n1-reviewer-profile-resolution 0126b9d3ef32
RED: node scripts/test-adaptive-node.js (pre-impl) — 14 FAIL / 2411 passed: 9× "#717[kaola-workflow|-gitlab|-gitea]: installed Codex cache tuple resolves {code-reviewer,security-reviewer,adversarial-verifier}" and 4× "#712[native]/[native-default]" each got {"ok":false,"reason":"review_profile_unavailable"}; "#712[legacy]" got {"ok":true,"runtime":"opencode"} proving ~/.claude/kaola-workflow/scripts misdetects as opencode (#708 side effect). node scripts/simulate-workflow-walkthrough.js (pre-impl) — throws "Error: #717[kaola-workflow]: installed Codex cache tuple binds code-reviewer to the exact active edition TOML — got {"ok":false,"reason":"review_profile_unavailable",...}" at the first new reviewer-identity assertion. RED fixtures synthesized only under $TMPDIR (mkdtemp kw-reviewer-layout-*), never in the repo.
GREEN: same assertions pass post-impl — node scripts/test-adaptive-node.js: "adaptive-node tests passed (2425 assertions)" (0 failures; all 9 codex-cache tuple probes return ok runtime "codex" bound to the exact versioned edition TOML; all 3 gate roles return ok runtime "claude" via the native agent dir); node scripts/simulate-workflow-walkthrough.js: "testReviewerContractV2Conformance: PASSED" + "Workflow walkthrough simulation passed".

## What changed (write set exactly as declared; git status shows only these 6 files)

- `scripts/kaola-workflow-adaptive-node.js` (+36 lines, purely additive):
  - `detectReviewRuntime()` (#717): new codex branch matching the installed plugin-cache tuple
    `/[/\\]plugins[/\\]cache[/\\][^/\\]+[/\\]kaola-workflow(?:-(?:gitlab|gitea))?[/\\][^/\\]+[/\\]scripts$/`
    (single-segment marketplace + version, tail-anchored) immediately after the unchanged
    source-tree pattern. The explicit `KAOLA_WORKFLOW_RUNTIME` override stays first; the kimi
    branch still fires before the opencode pattern; unknown layouts keep falling through to the
    claude default and fail closed.
  - `detectReviewRuntime()` (#712): new claude branch `/[/\\]\.claude[/\\]kaola-workflow[/\\]scripts$/`
    BEFORE the #708 opencode pattern. Root cause found during RED: install.sh SUPPORT_DIR is
    `$HOME/.claude/kaola-workflow`, and that layout was swallowed by the #708 opencode pattern
    (verified empirically: profile planted only at the opencode global candidate resolved with
    runtime "opencode"). The -gitlab/-gitea claude-forge dirs never matched the opencode pattern
    and still fall through to claude — unchanged.
  - `reviewerProfilePath()` claude branch (#712): ordered candidate list in the #708 opencode/kimi
    shape — [1] `path.join(__dirname, '..', 'agents', role + '.md')` (self-dev canonical AND the
    documented symlink-workaround dir ~/.claude/kaola-workflow/agents/ — already-linked installs
    keep resolving), [2] native installed location `path.join($KAOLA_AGENT_DIR || $HOME/.claude/agents, role + '.md')`
    (same convention as install.sh AGENTS_DIR and kaola-workflow-resolve-agent-model.js:264; this
    is the repo's claude config-dir env override — CLAUDE_CONFIG_DIR appears nowhere in this repo).
    Probe order keeps self-dev byte-identical even on machines with a live install (decoy-profile
    test pins this). Total miss defaults to the native candidate → review_profile_unavailable,
    never a silent wrong-runtime binding. No hash re-stamping / installer change (per issue: the
    installed claude profiles carry a valid resolved_profile_hash self-hash — resolver-side fix only).
- `scripts/test-adaptive-node.js` (+215): layout-matrix block before the summary. Subprocess probes
  (K9 pattern) of `resolveReviewerProfileIdentity(role, {})` against script copies seeded into
  $TMPDIR layouts: 3 codex cache tuples × 3 gate roles, codex source-tree guard, override-wins
  (no path hints) + override-beats-cache, unknown-layout fail-closed, claude native
  ($KAOLA_AGENT_DIR + default ~/.claude/agents), legacy probed dir, self-dev decoy order guard,
  kimi + opencode detection-unchanged guards. Hermetic HOME on every probe.
- `scripts/simulate-workflow-walkthrough.js` (+124): reviewer-identity section — the task-listed
  five syntheses (3 cache tuples × 3 gate roles incl. resolved_profile_hash equality with the
  deployed TOML, claude native install × 3 gate roles, legacy probed dir, unknown fail-closed,
  override precedence).
- Edition ports regenerated via `node scripts/edition-sync.js --write` (never hand-edited):
  `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js` (codex-sync copy),
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js`,
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js` (rename-generated;
  new regexes carry no `kaola-workflow-<name>` token so the rename pass leaves them byte-intact —
  spot-verified in the gitlab port).

## Check results (all in the leg worktree)

- `node scripts/test-adaptive-node.js` → "adaptive-node tests passed (2425 assertions)" (RED was 14 FAIL / 2411)
- `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed" (incl. testReviewerContractV2Conformance: PASSED)
- `node scripts/edition-sync.js --check` → "12 forge aggregator ports, 25 COMMON_SCRIPTS mirrors, and 28 byte-identical groups in parity with canonical."
- `node scripts/test-kimi-edition.js` → "kimi-edition test passed (577 assertions)." (K9 install-layout probes incl. kimi-before-opencode guard stay green)
- `node scripts/test-opencode-edition.js` → "opencode-edition test passed (547 assertions)." (#708 explicit-runtime probes stay green)
- `npm test` not run: the task direction scopes the gate to the five focused checks above (it explicitly notes npm test does not run the edition suites).

## Guards honored

- RED-fixture-in-$TMPDIR: every synthesized layout lives under `fs.mkdtempSync(os.tmpdir())` and is
  rmSync'd in a finally; the repo tree carries zero fixture files (git status = 6 declared files only).
- sync:editions: the three ports were regenerated by `node scripts/edition-sync.js --write`; `--check` green.

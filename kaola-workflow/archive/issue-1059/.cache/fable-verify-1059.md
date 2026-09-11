# Fable verification — #1059 frozen candidate (pre merge-sync)

VERDICT: PASS
findings_blocking: 0
verified_sha: e6c1d809e245c50da04e876e3eab14169a19b1ee
base_sha: cc1c9a2e34a70e9af8f430dd3edfcb57b1c9842b
branch: docs/retire-reviewer-heavy-escalation
upstream: origin/docs/retire-reviewer-heavy-escalation @ e6c1d809 (in sync, 0 ahead / 0 behind)
verified_at: 2026-09-11 (UTC+8)
verifier_actions_withheld: no push, no merge, no PR, no issue close, no tmux interaction

## Frozen-candidate facts (measured)

- `git rev-parse HEAD` = `e6c1d809e245c50da04e876e3eab14169a19b1ee`; `git merge-base HEAD main` = `main` = `cc1c9a2e`.
- `git log main..HEAD` = exactly two commits: `a5c005f5`, `e6c1d809`.
- `git diff --stat main...HEAD`: 14 files, +127 / -83. Only path outside `docs/` and `CHANGELOG.md` is
  `scripts/test-runtime-agent-architecture.js` (8 changed lines: A6/A9 assertion-message wording "seven" → "eight").
- `git diff --stat main...HEAD -- templates/ agents/ commands/ plugins/ .cursor/ .claude/ install-all.sh scripts/generate-agent-profiles.js` is empty.
- `git diff --check main...HEAD` exit 0. Working tree clean apart from untracked `kaola-workflow/issue-1059/`.

## Check 1 — ADR 0019 formally retires reviewer→Heavy/fable escalation; Heavy stays planner-class; no restored surfaces — HOLDS

- `docs/decisions/0019-the-heavy-reasoning-tier.md` @ HEAD: status header adds a 2026-09-11 partial-supersession
  note marking reviewer→`fable` re-dispatch **retired** (since #1032 / `7e116d6c`); §3 heading is now
  "Role defaults (reviewer→heavy escalation retired)" with an explicit "Retired" bullet and "no workflow-owned
  reviewer→`fable` / heavy re-dispatch path"; §5 adds "Retired as an upgrade trigger"; §6 first bullet replaces the
  grok/cursor divergence with "No runtime carries a workflow-owned reviewer→heavy escalation"; §7 watch-list marks
  auto-escalation triggers/inspectors "superseded by retirement; do not rebuild"; §8 blast-radius text says the
  carve-out is retired. Three-tier model remains Accepted; planner-class = `planner` + `code-architect` retained.
- Heavy binding unchanged in live sources: `templates/agents/behavior-contracts.json` `intent_class` —
  `planner`, `code-architect` = `heavy`; `code-reviewer`, `adversarial-verifier`, `security-reviewer`,
  `build-error-resolver`, `synthesizer` = `reasoning`; the remaining 7 = `standard` (14 roles total).
  `agents/planner.md` / `agents/code-architect.md` `model: fable`; the three reviewer profiles `model: opus`.
- No restored escalation surface: grep `fable|escalat` across `templates/` returns only
  `templates/agents/runtime-capabilities.json:192,200` (the Claude heavy-tier model token `"heavy": "fable"`),
  no reviewer upgrade path. `templates/routing/` has no `fable`/`escalat`; the only `re-dispatch` hits
  (`next.skeleton.md:101`, `required-blocks.js:191`) are the pre-existing mission-reconciliation wording.
- Live edition docs (`docs/README.md`, `docs/grok-edition.md`, `docs/opencode-edition.md`) now state the carve-out
  is retired for every runtime; grep of `docs/*.md` for escalation-as-current (`bounded reviewer`, `one-bounded`,
  `omit Claude`, `escalation target`) returns only ADR 0019 retirement text and the `docs/README.md` "retired" blurb.

## Check 2 — live inventory 8/10/140; historical ADR 0020 and CHANGELOG 10.0.0 keep 7/9/126 with annotation — HOLDS

- `node scripts/generate-agent-profiles.js --print-manifest` parsed live: 140 profiles; 8 runtimes
  (`claude,codex,cursor,devin,grok,kimi,opencode,zcode`); 10 adapter variants
  (`claude,codex-gitea,codex-github,codex-gitlab,cursor,devin,grok,kimi,opencode,zcode`).
- Live docs updated to eight/ten/140 in the diff: `docs/architecture.md`, `docs/agents-source.md`,
  `docs/runtime-capabilities.md`, `docs/api.md`, `docs/conventions.md`, `docs/README.md` (ADR 0022 blurb "ten"),
  and the install-all "eight-runtime sequence" notes in `docs/grok-edition.md`, `docs/opencode-edition.md`,
  `docs/cursor-edition.md`. `install-all.sh` ordinals (grok fifth, cursor sixth) unchanged and still correct.
- Historical annotate-not-rewrite: `docs/decisions/0020-agents-first-runtime-bridges.md:47` keeps
  "seven runtime families and nine adapter variants … 126" followed by the new "(Inventory note, 2026-09-11 / #1059)"
  paragraph; line 104 keeps "nine adapter variants" plus "*(Later inventory: ten adapter variants / #1059.)*".
  `CHANGELOG.md` `[10.0.0]` #1033 census keeps 7/9/126 with the "*(At 10.0.0. Later Devin made this eight … 140 …)*"
  annotation; `[9.15.0]` #1018 keeps the bounded-`fable` shipping sentence with a later-retired note.
- Remaining "seven/nine/126" hits after the change are all in released-version CHANGELOG blocks (11.0.1, 10.x, 9.x)
  or historical ADRs (0020 annotated; 0024:97 "126 renders" in a #1054 validator paragraph). None is a live
  inventory page. Not blocking.

## Check 3 — test evidence coherent with HEAD e6c1d809 — HOLDS

- `.cache/final-validation.md`: `verdict: pass`, `validation_command: npm test`,
  `validated_candidate_hash: 8efa712c9c184afefb82f4f1ad668111614138ad231d87f40a81e6e6eacb7759`.
  Recomputed independently via `computeCodeTreeHash(<repo>, "issue-1059")` from
  `scripts/kaola-workflow-adaptive-schema.js` on the current tree @ `e6c1d809` → identical hash
  `8efa712c…eacb7759`. The recorded PASS is bound to this exact candidate tree.
- `.cache/walkthrough.md`: names `e6c1d809e245c50da04e876e3eab14169a19b1ee`, unsharded
  `simulate-workflow-walkthrough` 178/178 passed, exit 0.
- `.cache/code-review.md`: PASS, `findings_blocking: 0`, `reviewed_sha: e6c1d809…`, base `cc1c9a2e`.
- Independent re-execution by this verifier on HEAD `e6c1d809` (tree unchanged before/after):
  - `node scripts/generate-agent-profiles.js --check` → exit 0, "agent profiles current: 14 roles, eight runtimes, 140 native renders".
  - `node scripts/test-runtime-agent-architecture.js` → passed (820 assertions).
  - `npm test` → exit 0 (log `/tmp/kw-1059-npm-test.log`, 980 s): Claude/canonical, Codex, GitLab, Gitea contract
    validation and walkthrough simulations passed; walkthrough shard `index 5/12` 15/15; no `failed` > 0 lines.

## Check 4 — scope is docs/test-architecture alignment only — HOLDS

- Diff touches only `CHANGELOG.md`, 12 files under `docs/` (incl. ADR 0019/0020/0021), and assertion-message
  wording in `scripts/test-runtime-agent-architecture.js`. The A6/A9 asserts already compared against the
  eight-name `RUNTIME_NAMES` roster (`claude … devin`, lines 31–33); no new inspector or auto-trigger logic.
- No role deletion: 14 roles in behavior-contracts and manifest, unchanged. No tier-count change: standard /
  reasoning / heavy, unchanged. No Heavy binding change: `planner` / `code-architect` heavy, `model: fable`, unchanged.
  No Codex effort matrix change: `templates/agents/runtime-capabilities.json` and
  `scripts/kaola-workflow-resolve-agent-model.js` are not in the diff.
- No restored auto-triggers/inspectors: `templates/`, `agents/`, `commands/`, `plugins/` untouched (empty diff).

## Non-blocking observations

1. `.cache/pr-draft.md` still says "no upstream; do not push" and "Sink: recorded as `pr`", but the branch is now
   pushed (`origin/docs/retire-reviewer-heavy-escalation` @ `e6c1d809`) and `workflow-state.md` records
   `sink: merge`. The draft is a local artifact and does not affect the candidate; refresh or discard before
   any later use.
2. `docs/decisions/0022-machine-global-workflow-contract.md:20` ("nine real host surfaces") and ADR 0024:97
   ("126 renders") are historical records without the annotation style used on ADR 0020/0021; not in the #1059
   named drift list. Optional follow-up.
3. `workflow-state.md` carries `worktree_error` (worktree add failed; `run_posture: in-place`). The in-place tree
   is the tree whose hash was bound and re-verified, so this does not weaken the evidence.

FABLE_VERDICT=PASS

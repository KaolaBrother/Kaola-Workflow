# Workflow Plan — issue-640

<!-- plan_hash: 2ec5c35d162c615150b67e8c9f5d84b8828dae93191a47d551e03e892cbf8441 -->

Harden the OPT-2 `metric_paths` shape check in the adaptive plan-validator to refuse three
additional shape classes the write-set freeze wall already refuses but OPT-2 does not yet mirror:
bare existing-directory (no trailing slash, `statSync`-detected), backslash-separated, and
absolute-path entries. Pure defense-in-depth completeness of the same OPT-2 metric-harness-isolation
guard #639 tightened (R2/R5). Reuse the freeze wall's existing refusals rather than hand-rolling new
shape checks.

## Meta
labels: —
validation_command: npm test
speculative_open_policy: auto

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-opt-shape | tdd-guide | — | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/simulate-workflow-walkthrough.js | 5 | sequence | standard |
| n2-review | code-reviewer | n1-opt-shape | — | 1 | sequence | reasoning |
| n3-adversary | adversarial-verifier | n2-review | — | 1 | sequence | reasoning |
| n4-docs | doc-updater | n2-review | docs/api.md, docs/decisions/D-640-01.md | 2 | sequence | standard |
| n5-finalize | finalize | n3-adversary, n4-docs | CHANGELOG.md | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-opt-shape | complete |
| n2-review | complete |
| n3-adversary | complete |
| n4-docs | complete |
| n5-finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-opt-shape) | subagent-invoked | evidence-binding: n1-opt-shape 392b0e9e3c87 | |

| code-reviewer | subagent-invoked | evidence-binding: n2-review 2ff3eabac0f5 | |
| adversarial-verifier (n3-adversary) | subagent-invoked | evidence-binding: n3-adversary 010acb47b1c8 | |
| doc-updater (n4-docs) | subagent-invoked | evidence-binding: n4-docs e585c2bd2d46 | |
| finalize (n5-finalize) | main-session-direct | evidence-binding: n5-finalize 3f27def5cd56 | |
## Plan Notes

**Shape of the work.** One mechanical implement (n1) → the code-reviewer cut vertex (n2, the G1
post-dominator of the code node) → a verification/docs antichain (n3 ∥ n4, both depend only on n2
over disjoint lanes) → the sink (n5). n2 must be the sole cut vertex between n1 and the sink so G1
holds; n3 and n4 overlap after it for zero-added critical path. No `planner`/`code-architect` node:
the design is fully specified — mirror three refusals the freeze wall already implements into the
OPT-2 `metric_paths` shape test. No `security-reviewer` (G2): no write path matches a
SENSITIVE_PATTERN. No OPT-5 gate: there is no `metric-optimizer` node in this plan; the
`adversarial-verifier` here is a plain change-gate, not an OPT-5 reproduction gate.

**n1-opt-shape (tdd-guide, RED-first).** Canonical spec — extend the OPT-2 `metric_paths` shape
filter in `scripts/kaola-workflow-plan-validator.js` (~line 1529, the
`hasUnresolvableEntry(...) || '..'-split` filter) to ALSO refuse the three shapes the write-set
freeze wall already refuses, reusing those exact checks (do NOT hand-roll new detection):
- **absolute path** — `/`-prefix and Windows drive-letter `C:` (freeze wall ~:1402-1405);
- **backslash** — `tok.includes('\\')` (freeze wall ~:1410);
- **bare existing-directory** — `fs.statSync(path.join(freezeRoot, p)).isDirectory()` in a
  try/catch, a `statSync` throw (not-yet-created new file) being a clean skip (freeze wall
  ~:1428-1432).
  Preserve the precedence order the freeze wall uses (absolute BEFORE backslash) so a Windows
  absolute path reports as `absolute_path`, not `backslash_in_path`. RED FIRST: add accept +
  typed-refuse fixtures to `scripts/simulate-workflow-walkthrough.js` in the existing OPT-2 fixture
  block (~:2354-2365) — one refuse case per new shape (bare existing dir e.g. `bench`, backslash
  e.g. `bench\\suite.js`, absolute e.g. `/tmp/suite.js`) asserting `result:refuse` + `OPT-2`, plus
  an ACCEPT control (a slash-less root FILE that exists — e.g. a real repo file — must stay
  in-grammar, mirroring the freeze wall's Makefile control, so the bare-dir check does not
  over-refuse a legitimate root-file metric path). Confirm RED (fixtures fail pre-fix), then GREEN.
- **Cross-edition (#307).** `plan-validator.js` is a GENERATED_AGGREGATOR: edit ONLY canonical,
  then `npm run sync:editions` to regenerate the codex twin + the gitlab/gitea forge ports — never
  hand-edit the 3 ports. All four editions are in this node's write set (`generated_port_split`).
  The OPT-2 refusal strings carry no `kaola-workflow-<NAME>` script token, so the rename pass leaves
  them intact. Run all four chains green (`npm test`) before this node's evidence.

**n2-review (code-reviewer, G1 cut vertex).** Post-dominates the code-producing n1. Reviews the
OPT-2 mirror for parity with the freeze-wall refusals it reuses, precedence-order correctness, and
that the ACCEPT control (legitimate root-file metric path) is not over-refused.

**n3-adversary (adversarial-verifier, change-gate).** Independent read-only falsification: plant
OPT-2 `metric_paths` values for each new shape (bare existing dir, backslash, absolute — plus a
green control root-file and a green nested-file) and RUN the validator to confirm each new shape
refuses under `OPT-2` while the controls stay in-grammar; confirm no legitimate metric path
regressed and the four chains are green. This is the exact OPT-2 family whose absolute-path gap
#639's own adversary surfaced (finding A1, now in scope), so an independent run-the-validator gate
earns its place on this freeze-wall change.

**n4-docs (doc-updater).** Update the OPT-2 bullet in `docs/api.md` (~:403-411) to name the three
newly-refused shapes alongside the existing directory/glob/`../` set. Author a brief
`docs/decisions/D-640-01.md` recording the completion — D-640-01 is the next free number
(D-639-01 (existing); no D-640 record yet) and it closes the limitation D-639-01 (existing)
explicitly deferred to #640 (its Consequences section names bare-existing-directory / backslash /
absolute as unfixed there). Docs-only write lane, disjoint from n1 — runs in parallel with the
adversary gate.

**n5-finalize (sink).** CHANGELOG.md entry under [Unreleased]; the unique docs/state sink.

verdict: pass
findings_blocking: 0

# review node (G1 code-reviewer gate) — issue #263 Classify-And-Act selective execution

Post-dominates impl-schema, impl-validator, impl-commit-node, impl-tests-sync.
Reviewed the four implementation evidence files and the actual changed source across
all four editions. No blocking findings.

## Verification performed (primary-source, not transcribed)

- Read parseNodeSelector in scripts/kaola-workflow-adaptive-schema.js (L120-126) + export (L243).
- Read parseShape select branch (L99), selectorSource column read (L140), and the full
  G-SEL-1..4 block (L598-658) + --selector-check CLI (L982-1037) in the validator.
- Read selectorCheck integration in scripts/kaola-workflow-commit-node.js (L80-102, L131-135,
  L190-208) and shellValidator (L55-65).
- Read parseNodeSelector unit tests, --selector-check CLI tests, tripwire flip, and the five
  G-SEL refusal cases in scripts/simulate-workflow-walkthrough.js (L6387-6413, L6572-6630,
  L6762-6903).
- Ran: node scripts/simulate-workflow-walkthrough.js => exit 0, "Workflow walkthrough
  simulation passed".
- Ran: npm test => real exit 0 (captured via $? + NPM_TEST_REAL_EXIT sentinel, not a pipe).
  All six edition pass-sentinels present (claude/codex/gitlab/gitlab-codex/gitea/gitea-codex).
- Ran: test-commit-node (27 assertions), test-next-action (33 assertions),
  validate-script-sync (OK), all exit 0. node --check on validator + commit-node OK.

## Criterion-by-criterion

1. parseNodeSelector mirrors parseNodeVerdict discipline: column-0 anchor (^selector:),
   native multiline regex /^selector:[ \t]*([^\s]+)[ \t]*$/gm (no fence-detection logic),
   last-match-wins via while-loop, returns { found, selector }, no require() of kaola-workflow
   scripts. Exported. The token class differs intentionally ([^\s]+ vs verdict's [A-Za-z-]+):
   arm ids are plan-relative, not a fixed vocabulary — documented and checked by --selector-check.

2. G-SEL-1..4 all fail-closed (push to errors => refuse):
   - G-SEL-1: >= 2 arms (1a); the NAMED selector_sources agree and at least one exists (1b —
     see observation below: this is "named sources agree", NOT "every arm names a source");
     source exists (1c); source read-only via !WRITE_ROLES.has(role) — same predicate as the
     fanout carve-out, not a hand-list (1d); arms depend_on source (1e).
   - G-SEL-2: GATE_VERDICT_ROLES (code-reviewer, security-reviewer, adversarial-verifier)
     cannot be arms. Note security-reviewer is also in WRITE_ROLES, so it is additionally
     barred from being a selector_source by G-SEL-1d — both gate-as-arm and gate-as-source
     are covered.
   - G-SEL-3: documented no-op; G1/G2 below already post-dominate all arms (all arms are frozen
     in the DAG). Correct — no separate code needed.
   - G-SEL-4: classifier.disjointWriteSets over arm write sets; only verdict==='red' is fatal
     (exact-path/coarse-area overlap). yellow (shared-infra) is allowed because arms are
     mutually exclusive, not concurrent — distinct from the fanout yellow push. Correct.

3. --selector-check CLI mode is fail-closed: missing --node-id, unparseable nodes table, and
   node-not-found all exit 1; non-selector node returns {ok:true,isSelector:false,armsToNa:[]}
   exit 0; missing/foreign selector returns ok:false exit 1. armsToNa = all arms except the
   selected one. Cache-dir resolution matches the existing --verdict-check convention
   (dirname(resolve(planPath))/.cache).

4. selectorCheck in commit-node is BLOCKING (not informational): selectorPass threaded into
   overallOk = barrierPass && selectorPass; exit 1 / ok:false drives overallOk false =>
   process.exitCode 1. Shelled only in the per-node branch (which has --node-id). Back-compat:
   (selectorCheck == null) ? true catches both null and undefined; whole-plan and per-node-start
   leave it null; return field is null when absent. Confirmed by test-commit-node (27 assertions).

5. Four-edition parity:
   - schema: all four byte-identical (diff empty).
   - validator: codex byte-identical to root; gitea/gitlab differ ONLY at L38 (classifier
     require path). All G-SEL rules + --selector-check + selectorSource present in all four.
   - commit-node: codex byte-identical to root; gitea/gitlab differ ONLY at L33 (VALIDATOR
     filename constant). selectorCheck logic structurally identical in all four.

6. Test coverage: 5 parseNodeSelector unit cases (col-0 match, last-match-wins, empty, indented
   non-match, no-keyword); 4 --selector-check CLI cases (non-selector, missing cache, valid,
   foreign); tripwire flipped from refuse/"invalid shape" to in-grammar; 5 G-SEL refusal cases
   (1a/2/1d/1e/4) with matching error substrings.

7. Regression safety: npm test real exit 0; walkthrough exit 0; 6-column legacy plans still
   parse in-grammar (selector_source column is genuinely optional — get() returns '' when
   absent); --selector-check on a legacy-plan node returns isSelector:false exit 0.

## Non-blocking observations (not defects)

- G-SEL-1e fixture (walkthrough L6862) gives arm-html depends_on=— which could also trip a
  reachability/orphan check; the .some(e => /must depend_on selector_source/) assertion still
  holds because it only requires the G-SEL-1e error to be present. Fine as written.
- G-SEL-1b emits two distinct messages (no source / conflicting sources). Both are reasonable;
  only the no-source path is exercised by the tripwire fixture. Acceptable coverage.
- selector_source token regex [^\s]+ accepts any non-whitespace; a malformed/foreign arm id is
  caught downstream by --selector-check's armIds membership test (fail-closed). Correct layering.

- MEDIUM (non-blocking) — G-SEL-1b phantom-arm gap. Validator L612 uses
  `new Set(members.map(m => m.selectorSource).filter(Boolean))`. The `.filter(Boolean)` drops
  arms whose selector_source is blank/—, so a mix of {arm-csv: classify, arm-html: blank}
  gives srcs.size===1 and PASSES. Confirmed empirically: such a plan returns in-grammar, and
  --selector-check on `classify` returns armsToNa:[] (arm-html is invisible because line 1006
  finds arms via `n.selectorSource === nodeId`). The blank-source arm therefore runs
  UNCONDITIONALLY regardless of the classifier pick. NOT blocking: the phantom arm is still in
  the frozen DAG, so G1/G2 post-dominate it and G-SEL-4 still checks its write set; worst case
  degrades to "both arms run" — exactly the pre-#263 both-arms-fanout cost the tripwire at
  walkthrough L6895 already locks. No new security/data-loss/merge-correctness hazard. Suggest
  a follow-up: G-SEL-1b should additionally require EVERY select-shape group member to carry a
  non-empty selector_source (e.g. members.some(m => !m.selectorSource) => refuse).

- LOW (non-blocking) — selectGroups keying. Validator L567 keys select groups by bare
  `n.shape.group`, unlike fanout which keys by (label, fanoutOriginKey) per audit B6/#233.
  Two independent select(fix) groups in different branches would merge into one. This only ever
  OVER-blocks (a spurious "conflicting selector_source" refusal), never under-blocks, so it is
  not a verdict concern. Note only for fanout-parity; skip if intentional.

Verdict: pass. No CRITICAL or HIGH findings. The barrier may pass.

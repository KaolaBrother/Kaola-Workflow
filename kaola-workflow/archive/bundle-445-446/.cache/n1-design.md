evidence-binding: n1-design 50272d119991

# n1-design — Decision records D-445-01 + D-446-01 (issue bundle #445/#446)

non_tdd_reason: design/decision-record authoring — no natural failing unit test; the written artifact IS the design

verification_tier: regression-green
regression-green: n/a — decision records only, no code change

## Task

Author the two canonical decision records that settle the #445/#446 bundle specs. All downstream
nodes (n2–n10) mirror these records exactly: schemas, flag names, registry/constant names, and
method signatures.

## Write set (exactly as declared)

- docs/decisions/D-445-01.md (created) — operator_hint on every typed envelope + plan-run
  skeleton/card split
- docs/decisions/D-446-01.md (created) — route-findings subcommand + --summary envelope diet on
  adaptive-node.js

No other file touched.

## Category justification

This node is design/decision-record authoring. The deliverable is two Markdown ADRs — pure design
artifacts that carry no behavioral logic and have no natural failing unit test. The artifact IS the
design; verification is "does the record state precise, internally-consistent, downstream-mirrorable
contracts in the house ADR format (D-440-01)," not an executable assertion. This fits the
scaffolding / design-record category of the adaptive (non-TDD) path. No code changed, so the
appropriate tier is regression-green: n/a.

## Contracts settled

### D-445-01 — operator_hint + skeleton/card split (#445)

1. OPERATOR_HINT_REGISTRY — a per-aggregator module-level `const` map of `reason → templateFn(ctx)`,
   one in each of the four aggregators (adaptive-node.js, commit-node.js, plan-validator.js,
   parallel-batch.js); NOT a shared module. `getOperatorHint(reason, ctx)` is the single emit-time
   accessor; hints are generated at emit time, never stored.
2. Hint shape — `operator_hint: string`, top-level (sibling of `result`/`reason`), never nested;
   present on every actionable outcome (`refuse`/`halt`/`warn`), absent on a reason-less success
   envelope; additive (existing `result`/`reason` consumers unaffected).
3. Hint vocabulary contract — `revert-overflow` for the write_set_overflow family (incl. the
   write_set_granularity/lockfile_write/mirror_write/count_bump subtypes), `repair-node` for
   crash-repair; `drop-base` is BANNED (laundering, per D-424-01); NO forge CLI token (gh/glab/tea)
   in any hint. Aligns with #424/#434 and the structured proposed_repair vocabulary (D-440-01).
4. Skeleton content contract — ~150-line loop skeleton on the ×6 surfaces; retains the `frontier
   unit` literal + route-reachability pin verbatim; introduces `--summary` mode reference (D-446-01)
   and `<!-- CARD: <name> -->` markers.
5. Card scope — exactly 5 cards under docs/plan-run-cards/: resume.md, governance.md,
   repair-routing.md, reopen-complete-node.md, frontier-batch.md (~100–200 lines each; live ONCE,
   not six-surface-replicated).
6. Route-reachability pin — `<!-- PIN: frontier unit -->` immediately precedes the `frontier unit`
   literal so the contract validators assert the pin positionally.
7. The skeleton/card rewrite rides the SAME combined ×6 pass as #438 (D-419 P3) — one node, six
   files; bound by the #400 six-surface rule.

### D-446-01 — route-findings + envelope diet (#446)

1. route-findings — a SUBCOMMAND on adaptive-node.js (NOT a new script); inherits the host's existing
   COMMON_SCRIPTS + install.sh registration, so NO install-manifest/SUPPORT_SCRIPT_NAMES count-bump.
   Parses `.cache/{node-id}.md` `finding:` lines into `.cache/findings-route.json`.
2. findings-route.json schema — array of `{ finding_id, file, owning_node, fix_role, status }`.
   `owning_node` = write-set lookup over frozen-plan nodes; unowned file → `owning_node: null` (the
   plan-repair signal). `fix_role` precedence: `security` in finding → security-reviewer; else last
   code-producing node that declared the file → implementer; else code-reviewer. `status` ∈
   {open, n/a}.
3. close-and-open-next auto-invokes route-findings on a VERDICT_ROLES close;
   `VERDICT_ROLES = ["code-reviewer","security-reviewer","adversarial-verifier"]`. The call is silent
   and non-blocking (errors → log, never block the advance).
4. --summary mode — new flag on adaptive-node.js. Prints one line:
   `summary: <result> [| reason: <reason>] [| hint: <operator_hint>]`. Full envelope written to
   `.cache/<op>-envelope.json` (named by the subcommand). The skeleton drills into the cached
   envelope only on `result: refuse`.
5. Compat contract — `--summary` is additive; default (no-flag) output is unchanged FULL JSON, so
   scripts/tests that parse full JSON are unaffected.
6. ×4 edition propagation — both features are adaptive-node-only and propagate to all four editions
   (root + codex + gitlab + gitea) in ONE node (n5) per #340/#431; all four
   npm run test:kaola-workflow:{claude,codex,gitlab,gitea} chains green, run sequentially (#307).

## Format conformance

Both records follow the D-440-01 house format: title line, Date/Status/Issue/Related header,
## Problem, numbered ## Decision with per-decision rationale, ## Consequences ending in a binding
"test fixtures the implementation must cover" list and a "for downstream implementation" load-bearing
summary. Vocabulary cross-checked against D-434-01 (revert-overflow/repair-node) and D-424-01
(drop-base laundering ban) before authoring.

## Verification

- Verification commands: none run — decision records only, no code change. regression-green: n/a.
- before_result: n/a (no code under test changed by this node).
- after_result: n/a (no code under test changed by this node); both ADRs created in the declared
  write set, no other file touched.

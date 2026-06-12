<!-- plan_hash: 9eb488f0572b23242826c5e10e2976afde799dfa60ed1a4cc82060fc3a93f2e5 -->
<!-- adaptive workflow plan — bundle-424-432-433 -->

## Meta

project: bundle-424-432-433
issue_numbers: 424,432,433
bundle_id: bundle-424-432-433
labels: bug, enhancement, area:scripts

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-design | implementer | — | docs/decisions/D-424-01.md, docs/decisions/D-432-01.md, docs/decisions/D-433-01.md | 1 | sequence | opus |
| n2-validator | tdd-guide | n1-design | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/simulate-workflow-walkthrough.js, scripts/test-barrier-base-integrity.js | 6 | sequence | opus |
| n3-run-chains | tdd-guide | n1-design | scripts/kaola-workflow-run-chains.js, plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js, scripts/test-run-chains.js | 5 | sequence | sonnet |
| n4-node-evidence | tdd-guide | n2-validator | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js | 6 | sequence | sonnet |
| n5-registration | implementer | n3-run-chains | scripts/kaola-workflow-install-manifest.js, plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js, scripts/validate-script-sync.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 5 | sequence | sonnet |
| n6-prose-planrun | implementer | n4-node-evidence, n5-registration | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md | 4 | sequence | sonnet |
| n7-prose-finalize | implementer | n4-node-evidence, n5-registration | commands/kaola-workflow-finalize.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md | 4 | sequence | sonnet |
| n8-prose-contractor | implementer | n4-node-evidence, n5-registration | agents/contractor.md, plugins/kaola-workflow/agents/contractor.toml, plugins/kaola-workflow-gitlab/agents/contractor.toml, plugins/kaola-workflow-gitea/agents/contractor.toml | 4 | sequence | sonnet |
| n9-walkthrough | tdd-guide | n4-node-evidence, n5-registration | scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, scripts/test-install-manifest-single-source.js | 5 | sequence | sonnet |
| n10-review | code-reviewer | n1-design, n2-validator, n3-run-chains, n4-node-evidence, n5-registration, n6-prose-planrun, n7-prose-finalize, n8-prose-contractor, n9-walkthrough | — | 1 | sequence | opus |
| n11-docs | doc-updater | n10-review | README.md, docs/architecture.md, docs/api.md, docs/conventions.md | 4 | sequence | sonnet |
| n12-finalize | finalize | n11-docs | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

Bundle of three tightly-coupled adaptive-machinery issues. #424 (barrier hardening), #432
(machine-verifiable chain receipts), #433 (open-time evidence seeding) all touch the same core
aggregators (`kaola-workflow-plan-validator.js`, `kaola-workflow-adaptive-node.js`), so the
write-role nodes that share those files are SERIALIZED on the shared lane — they cannot fan out
(file-disjointness is required for parallel write-role siblings, and these overlap by construction).

Cross-edition scoping (#306/#431): `kaola-workflow-plan-validator.js` and
`kaola-workflow-adaptive-node.js` are GENERATED_AGGREGATORS (see `scripts/edition-sync.js`), so each
write-role node touching one declares all four edition files together (#431 generated_port_split
coupling) and regenerates the codex twin + gitlab/gitea forge ports via `npm run sync:editions`
after the canonical edit — never hand-edit a forge port of a generated aggregator. The new #432
script `kaola-workflow-run-chains.js` is a SUPPORT script (renamed-IFF-ported, NOT a generated
aggregator): its codex twin is byte-identical and its two forge ports are edition-named hand-mirrors
(`kaola-{gitlab,gitea}-workflow-run-chains.js`), all four authored in n3 under one shared canonical
spec (#309: mirror the canonical script verbatim modulo forge chain-name parameterization).

Node intent:
- **n1-design** (opus, implementer): unified design pass settling the three coupled contracts,
  captured durably as three decision records (the design IS the records — `code-architect` is
  read-only and cannot write, so an implementer authors the records with the design reasoning).
  non_tdd_reason: authoring decision-record markdown is documentation scaffolding with no natural
  failing unit test. Records: `D-424-01` — the #424 barrier-attribution model (narrow `.md`
  allowband `docs/**` + `CHANGELOG.md` + `README.md` + `kaola-workflow/{project}/**`; drop-base
  window-lock; lifecycle provenance log schema; finalize attribution sweep; root-pinning); `D-432-01`
  — the chain-receipt schema + `chains_unverified`/`chains_stale`/`chains_red` gate +
  `--accept-known-red <name>:<open-issue>` waiver semantics; `D-433-01` — the single-source role-token
  registry (the evidence-shape grammar moved out of the checker into one registry consumed by both
  the validator checker AND adaptive-node's open-seed) + the open-time evidence contract. D-424/432/
  433-01 are the next-free numbers (no existing records for these issues at authoring time). opus —
  the design constrains every downstream node.
- **n2-validator** (opus, tdd-guide): all plan-validator-side changes for the three issues in ONE
  pass over the four edition files — #424 (kill blanket `.md` exemption: run the allowlist over `.md`
  writes with the narrow allowband, keep docs out of `SENSITIVE_PATTERNS` only; window-lock
  `--drop-base` with `drop_base_window_open` typed refusal reading the ledger; finalize-time
  attribution sweep `unattributed_change`; root-pinning `root_mismatch`), #433 (single-source the
  role-token registry the evidence-shape checker reads — exported so adaptive-node consumes the same
  source), #432 (finalize/verdict path gate on the chain receipt: `chains_unverified`/`chains_stale`/
  `chains_red`, waiver via `--accept-known-red`). High reasoning depth — subtle, security-adjacent
  barrier semantics; opus.
- **n3-run-chains** (sonnet, tdd-guide): the new `kaola-workflow-run-chains.js` (spawnSync per chain,
  real exit codes, no shell pipes; receipt `{headSha, workTreeHash, startedAt, chains:[...]}`;
  per-edition chain-name parameterization) + codex twin + two forge ports. Sibling of n2 (disjoint
  files; depends only on the n1 design). Receipt shape, exit aggregation, and waiver acknowledgment
  are naturally test-first → tdd-guide.
- **n4-node-evidence** (sonnet, tdd-guide): adaptive-node ×4 — #424 lifecycle provenance-log
  emission on record-base/drop-base/open/close, and #433 open-time evidence seeding (open-next/
  open-ready/fused advance seed `.cache/<node-id>.md` with the `evidence-binding: <id> <nonce>` line
  + role-specific token stubs drawn from n2's single-source registry; `opened` payload carries
  `evidence_file`/`required_tokens`; re-nonce propagation rewrites the seeded line and reports
  `nonce_rotated`). Depends n2 (consumes the registry). Behavioral seeding/rotation logic → tdd-guide.
- **n5-registration** (sonnet, implementer): register the new run-chains script — `install-manifest.js`
  SUPPORT_SCRIPTS (root + byte-identical codex twin), `validate-script-sync.js` enumeration, and the
  two forge contract validators' hardcoded `installSupportScripts` lists (add
  `kaola-{gitlab,gitea}-workflow-run-chains.js`). Pure registration wiring, no behavioral test →
  implementer (non_tdd_reason: registration/manifest wiring with no natural failing unit test).
  Depends n3 (the script must exist before registration is meaningful). The two forge
  `test-*-workflow-scripts.js` assert per-name existence, not a hardcoded count, so they need no bump.
- **n6-prose-planrun / n7-prose-finalize / n8-prose-contractor** (sonnet, implementer): the #400
  six-surface prose propagation, split by disjoint family so all three are batch-eligible siblings.
  n6 = plan-run command + 3 plan-run SKILLs (#433 "append findings to the seeded evidence file; never
  modify the binding line" dispatch prose + #432 chain-verify in the plan-run lane). n7 = finalize
  command + 3 finalize SKILLs (#432 receipt-gate finalize prose). n8 = contractor.md + 3 contractor
  tomls (#432: contractor cites the receipt path instead of asserting greenness in prose; the inline
  `npm run … && …` blocks are replaced by the run-chains helper invocation). Each multi-file member
  shares a canonical spec (#309): mirror the base/canonical surface verbatim modulo forge nouns; the
  plugin tomls stay forge-neutral (#341 — name "the forge CLI", never `gh`/`glab`). non_tdd_reason:
  documentation/dispatch-prose with no natural failing unit test (route-reachability + forge contract
  validators machine-check the wiring).
- **n9-walkthrough** (sonnet, tdd-guide): per-edition walkthrough barrier asserts ×4 — a stray line
  into `agents/<role>.md` during a node window → close refuses `write_set_overflow`; `drop-base` on
  an `in_progress` node → `drop_base_window_open`; a finalize gap-write fixture → `unattributed_change`;
  a red chain → finalize `chains_red` and `--accept-known-red <name>:<open-issue>` passes + records the
  waiver, stale tree → `chains_stale`; after open-next the seeded evidence file exists with binding
  line + role stubs and an agent that only fills stubs closes with zero edits; a doc-updater node
  declaring `.md` targets still closes clean. Test fixtures → tdd-guide. Each edition has its own
  walkthrough (flip the edition-local asserts), shared canonical spec.
- **n10-review** (opus, code-reviewer): G1 post-dominates every code-producing node (n1–n9). Opus —
  high-risk barrier/laundering-defense surface; mutation-grade review of the new refusals and the
  receipt/evidence single-source.
- **n11-docs** (sonnet, doc-updater): README (new run-chains helper + receipt gate), docs/architecture
  (barrier attribution sweep + provenance log + evidence-seeding lifecycle), docs/api (new typed
  refusals `drop_base_window_open`/`unattributed_change`/`root_mismatch`/`chains_unverified`/
  `chains_stale`/`chains_red`, receipt schema, run-chains CLI), docs/conventions (the `.md` files are
  now declarable production surfaces; chain-receipt is the only valid greenness evidence). Public
  interfaces + new gates changed → doc-updater required before finalize.
- **n12-finalize** (finalize): sink — CHANGELOG.md only (docs/state). [Unreleased] entries for #424/
  #432/#433. No model cell (the sink is never dispatched as a subagent).

Sequencing note (#432 bootstrap): this bundle's own finalize chain-receipt gate must run against a
main already made green by #423 (`test-bash-block-guards.js`) — verified GREEN at authoring time, so
#423 is already landed and the bootstrap ordering constraint is satisfied. Four-chains rule (#307):
this is a cross-edition diff; all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`
chains must be green (recorded via the new receipt) before finalize.

## Node Ledger

| id | status |
| --- | --- |
| n1-design | complete |
| n2-validator | complete |
| n3-run-chains | complete |
| n4-node-evidence | complete |
| n5-registration | complete |
| n6-prose-planrun | complete |
| n7-prose-finalize | complete |
| n8-prose-contractor | complete |
| n9-walkthrough | complete |
| n10-review | complete |
| n11-docs | complete |
| n12-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (n1-design) | subagent-invoked | evidence-binding: n1-design ab68f963be9d | |
| tdd-guide (n2-validator) | subagent-invoked | evidence-binding: n2-validator 07525fe6fb33 | |
| tdd-guide (n3-run-chains) | subagent-invoked | evidence-binding: n3-run-chains a31cb744d967 | |
| tdd-guide (n4-node-evidence) | subagent-invoked | evidence-binding: n4-node-evidence 26988a8e363d | |
| implementer (n5-registration) | subagent-invoked | evidence-binding: n5-registration 392ccca7add4 | |
| implementer (n6-prose-planrun) | subagent-invoked | evidence-binding: n6-prose-planrun bcad91ba1832 | |
| implementer (n7-prose-finalize) | subagent-invoked | evidence-binding: n7-prose-finalize c788461cfe26 | |
| implementer (n8-prose-contractor) | subagent-invoked | evidence-binding: n8-prose-contractor b85db5ff66de | |
| tdd-guide (n9-walkthrough) | subagent-invoked | evidence-binding: n9-walkthrough 921070ccf698 | |
| code-reviewer | subagent-invoked | evidence-binding: n10-review a623fcafd4f4 | |
| doc-updater (n11-docs) | subagent-invoked | evidence-binding: n11-docs fe3a409a4a6d | |
| finalize (n12-finalize) | main-session-direct | evidence-binding: n12-finalize 9dc44c0fb9e5 | |

evidence-binding: n8-code-certify e5d144bbf842
contract_version: 2
review_context_hash: 739bf13afd5e0939580eb036f38c1d93397aa33d3d9c8d0dbb9b49f60dd5b1fa
behavior_contract_hash: 07ef4e53a864c847dc84bb684e0f163f9f08215090f7474a81b469da10bfeca5
resolved_profile_hash: b9ad48f1eafd7f5123e74b85f23d5eda85268626e52c7b9a3b3116f541719453
candidate_digest: 8c12d53b7acc71c0c8a14d26493c8968e4937ae070d9497718903dbb1d0d39ff
domain_outcome: approved
gate_claim: the complete issue 819 candidate satisfies every acceptance item and introduces no regression: capability_gap recovery is reachable end to end with no hand patch of a nonce-bound artifact, the P5 guard still refuses a genuine-deliverable swap, the gap-versus-deliverable distinction is structural rather than a prose string match, a substituted node is dispatchable under a fresh and replay-stable identity while the unsubstituted dispatch card is byte-unchanged, a self-substitution is refused, the regression coverage is mutation-proven rather than merely green, plugin prose touched under plugins remains forge-neutral, and the recorded validation command is green across all four chains run sequentially
gate_surface: the entire accumulated diff for issue 819 against the run base across all four editions, validated by running the recorded validation_command end to end as four explicit sequential chain runs, by running node scripts/test-adaptive-node.js unsharded so the new coverage is actually executed rather than left to the fast gate's rotating one-twelfth slice, and by the forbidden-token check on every touched file under plugins
gate_aggregation: sequence
plan_schema_version: 2
behavior_contract_version: 2
gate_mode: change_gate
review_phase: discovery
review_context_path: .cache/review-contexts/739bf13afd5e0939580eb036f38c1d93397aa33d3d9c8d0dbb9b49f60dd5b1fa.json

upstream_read: n1-surface c88971e73a76
upstream_read: n2-mechanism cb782b26822d
upstream_read: n3-tests bcb81dd402a2
upstream_read: n4-scripts 62e0af8d9649
upstream_read: n5-prose 89e5dde2bea3
upstream_read: n6-docs 78609a6c6101
upstream_read: n7-falsify bab5de04e791

# n8-code-certify — the code certifier wall for issue 819

STATUS: written incrementally. Three prior attempts at this node died on API transport errors, so
every measurement below was persisted as it completed rather than at the end.

## What I measured myself vs what I relied on

MEASURED HERE (my own commands, real `$?` on the command itself, never through a pipe):
  - `node scripts/test-adaptive-node.js` UNSHARDED
  - all four validation chains, RE-RUN by me sequentially as four separate commands
  - the forge-neutrality forbidden-token check on every touched file under `plugins/`
  - `node scripts/test-route-reachability.js`
  - an independent in-process probe of the classifier / refusal / dispatch-identity seams (40 checks)
  - an independent END-TO-END drive of the shipped CLI in a throwaway git fixture, including the
    full gap -> substitute -> re-dispatch -> record -> CLOSE path, which no upstream node ran
  - cross-edition parity of the change by direct file comparison
  - the six routing surfaces by direct token count
  - the producer-role/manifest enumeration behind n7's forward-compat observation

RELIED ON `n7-falsify` (its own re-measurements, which I did not repeat in full): the 18-mutation
kill table, the 2707-comparison dispatch-card byte-identity grid, the 24 adversarial T3b bodies,
and the 18/18 per-role production-seed classification. I spot-reproduced the load-bearing edge of
each (see below) rather than duplicating the whole grid.

NOT RELIED ON: the orchestrator's own chain run. It offered its results and disclosed that it had
adjudicated the in-scope call on the T3b repair earlier in this run, so it is an interested party
on that point. I re-ran all four chains myself. Its results are recorded below only as a
cross-check, not as my evidence.

## Candidate composition (measured)

HEAD `88d97b8a`; run base `b81bc93f`. `git diff b81bc93f -- . ':!kaola-workflow'` = 15 files,
+1491 / -139; 6 of those are still UNCOMMITTED in the worktree (CHANGELOG.md, docs/api.md, and the
four adaptive-node editions) plus untracked `docs/decisions/D-819-01.md`. Candidate = HEAD +
working tree. Candidate file mtimes run 10:55-11:27; my chain runs started after 12:40, so the
chains cover this exact tree.

I introduced no repository change. `git status --porcelain -- . ':!kaola-workflow'` at the end of
this node is the same 6 modified files + 1 untracked ADR. Every probe wrote only to `mktemp -d`
directories and to the scratchpad; the two commits that landed on origin/main during this run were
NOT merged and are not in this candidate.

## Validation ledger

- adaptive_node_unsharded=0 (`##KW-SHARD {"suite":"test-adaptive-node","index":1,"total":1,
  "scenarios":420,"ran":420,"passed":3553,"failed":0}` — index 1 of 1 confirms this was NOT the
  fast gate's 1/12 slice; the claude chain runs this file as `--shard auto/12`, so the chains alone
  would not have executed the new #819 coverage)
- chain claude=0 (my own run)
- chain codex=0 (my own run)
- chain gitlab=0 (my own run)
- chain gitea=0 (my own run)
- route_reachability=0 (2263 assertions)
- forbidden_token_own_forge=0 (see the forge-neutrality section)

## A1 — a gap body does not block the swap; P5 still refuses a deliverable; the distinction is structural

MEASURED. `classifyEvidenceBody(content, role)` is a three-way classifier whose gap arm requires
BOTH a typed column-0 marker AND the absence of any non-empty value for a content-bearing token in
the role's own `ROLE_TOKEN_REGISTRY` row. The second conjunct is the load-bearing one, and it is a
VALUE check, not a prose match. My own in-process probe, driving the REAL `seedEvidenceFile` output
rather than a hand-written body:

    the shipped opener's own seed for code-explorer ......... 'seeded'      (swap proceeds)
    capability_gap: <text> + findings empty ................ 'capability_gap' (swap proceeds, resets)
    delegation_outcome: capability_gap + findings empty .... 'capability_gap' (swap proceeds, resets)
    capability_gap: <text> + findings NON-EMPTY ............ 'deliverable'  (swap REFUSED)
    findings NON-EMPTY, no marker .......................... 'deliverable'  (swap REFUSED)
    INDENTED capability_gap: + findings empty .............. 'deliverable'  (column-0 anchoring holds)

The third and fourth rows are the anti-relabel proof: identical marker prose, opposite verdicts,
decided solely by whether the role's own contract token carries a value. P5 is not deleted — P5a
(ledger status) is byte-unchanged and still runs FIRST, and I confirmed a `complete` row refuses
`substitute_node_closed` naming the STATUS arm even when the body is a pure gap.

I did not re-run n7's 24 adversarial T3b bodies. I did independently confirm the two edges that
carry that argument: the comment tolerance is anchored at both ends (`^<!--(?:(?!-->)[\s\S])*-->$`
applied per line after `split('\n')` + `trim()`, so it cannot span lines and cannot swallow trailing
prose), and the marker regexes are `/m`-anchored at column 0.

## A2 — no hand patch anywhere in the recovery path; the reset is owned atomically by the subcommand

MEASURED, end to end through the shipped CLI in a throwaway git fixture (guard prologue, scheduler
lock, worktree-authority guard all live), using the PRODUCTION opener's seed as the starting body:

    open-next writes the seed + `.cache/barrier-base-n1`; the gapped role APPENDS its own typed
    `capability_gap:` line (nobody hand-edits anything)
      -> substitute-role --to-role investigator: result ok, evidence_reset: true
      -> LINE 1 BYTE-IDENTICAL before and after: the binding nonce is PRESERVED, not rotated
      -> no `^capability_gap:` line survives; the re-seeded body classifies 'seeded'
      -> the frozen plan is byte-unchanged
      -> replay of the identical command: ok / idempotent:true / evidence_reset:false / ONE record /
         evidence byte-identical

Nonce preservation is the right call and I checked why: `readNonce` reads
`.cache/barrier-base-<id>`, i.e. the barrier baseline's SHA prefix, so rotating it would re-snapshot
the worktree mid-node and launder whatever the gapped role already wrote into the "before" picture.
Preserving it is what lets the re-dispatched role's evidence still close against the same baseline.

Both failure modes fail LOUD rather than silently, and both write nothing:

    absent/empty baseline -> refuse substitute_evidence_reset_failed, evidence + store untouched
    atomic re-seed failure -> refuse substitute_evidence_reset_failed (the `reseed.ok === false`
      arm; `seedEvidenceFile` returns that shape only when `forceRotate && hadExistingBody`, which
      is exactly this call site, and it unlinks the stale body as defence in depth)

I confirmed at the REAL emit point (not the raw envelope) that the operator hint on that refusal
reads "Do NOT hand-edit the evidence file; escalate: ... write-halt --reason consent". Both new
`OPERATOR_HINT_REGISTRY` entries are wired and neither falls through to the generic "Run orient"
line, which for these two states would actively misdirect.

Guard purity: every guard above the commit phase is a pure read, so a refusal is a byte-for-byte
no-op on disk. I verified that for all four refusal paths I exercised.

## A3 — the substituted node is dispatchable, fresh and replay-stable; the unsubstituted card is unchanged

MEASURED. `buildDispatch` now resolves the substitution BEFORE deriving the task name, and
`codexTaskNameForNode(nodeInfo, dispatchRole)` falls back to the frozen cell when the second
argument is null / undefined / '' — I checked all three fallbacks explicitly.

    no record  -> agent_type=code-explorer  codex_task_name=n1_code_explorer   (unchanged)
    recorded   -> agent_type=investigator   codex_task_name=n1_investigator    (FRESH)
    re-derived -> byte-identical card (pure function of node id + the active record's to_role)

`codexTaskNameForNode` has exactly ONE production caller in each of the four editions
(`buildDispatch`); `dispatchSummarySegments` echoes `d.codex_task_name` off the card, so the summary
line cannot diverge from it.

I went past what the acceptance item asks and drove the WHOLE recovery loop to a close, which no
upstream node did:

    gap body -> substitute-role (evidence_reset:true) -> open-next re-issues the card with
    agent_type "investigator" / codex_task_name "n1_investigator" and the SAME nonce ->
    the substituted role records a real deliverable -> close-and-open-next exit 0, ledger row
    n1 -> complete, the next node opens, and the compliance row reads
    "role_substituted: code-explorer -> investigator (manifest superset ..., kind producer,
    identical token contract [evidence-binding, findings])".
    plan_hash identical before and after; the whole pre-Ledger plan region byte-identical.

So the repaired path does not merely unblock the swap — it closes the node.

On byte-identity of the unsubstituted card I relied on n7's 2707-comparison old-vs-new grid rather
than rebuilding it, and cross-checked the one pin that would break first
(`simulate-workflow-walkthrough.js:21452`, `d.codex_task_name === 'n1_tdd_guide'`), which is green
in my own claude-chain re-run below.

## A4 — a self-substitution is refused, not recorded

MEASURED, both arms, through the CLI and in process:

    --to-role <the frozen role>                    -> refuse substitute_self_noop, NO store file
    record investigator, then --to-role <frozen>   -> refuse substitute_self_noop, row count UNCHANGED

P0 sits above the manifest read, above the substitution-store read, and above the idempotent-replay
branch. That precedence is what makes it total: a legacy self-substitution row already on disk would
otherwise replay to `ok` forever. Its operator hint names a different move from the other family
(name a DIFFERENT in-kind role, or halt) and does not misdirect to orient. The disclosed precedence
cost — a `--to-role <frozen role>` whose frozen role has no manifest row now reports
`substitute_self_noop` instead of `substitute_unknown_role` — is the more specific defect, and is
stated in the code comment.

## A5 — coverage is mutation-proven, not merely green

I ran the suite unsharded myself: 420/420 scenarios, 3553 assertions, 0 failed, exit 0, with the
shard header proving index 1 of 1. 23 distinct `#819-` assertion ids are present (T1..T13, T2b,
T2c, T3b, T4b, T7b, T8-w1, T8b, T12b, U1, U2).

I did NOT rebuild the 18-mutation kill table; I relied on n7, which built its probe from scratch in
an isolated copy and drove the SHIPPED assertions (18 applied, 18 killed, zero survivors), having
itself declined to accept n4's twelve rows on trust. Two independent mutation probes agreeing on
the overlapping twelve, with n7 adding six more, is sufficient for me.

What I did add is a NON-VACUITY check of a guard nobody mutated: the forge-neutrality forbidden-token
checker. Pointed at its own edition's touched files it passes; pointed at a foreign edition's file
it FAILS with `contains forbidden reference: /plugins\/kaola-workflow\/scripts/` (exit 1, both the
gitlab and the gitea validator). The guard is armed, not vacuous.

## A6 — four editions, six routing surfaces, four chains green

EDITIONS (measured by direct comparison, not by trusting `--check`):

    plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js  BYTE-IDENTICAL to canonical
    gitlab port, rename-normalized                                   differs only by the
                                                                     `@generated` banner line
    all four editions carry substitute_self_noop, substitute_evidence_reset_failed,
      classifyEvidenceBody, CAPABILITY_GAP_MARKERS, and the dispatchRole parameter at identical
      occurrence counts

ROUTING SURFACES (all SIX: 3 Claude commands + 3 Codex SKILL packs) each carry all four newly
pinned tokens exactly once — `substitute_self_noop`, `substitute_evidence_reset_failed`,
`evidence_reset: true`, `derived from the DISPATCH TARGET` — and `templates/routing/
required-blocks.js` pins all four, so the propagation is machine-enforced rather than incidental.
`node scripts/test-route-reachability.js` exit 0, 2263 assertions.

FORGE NEUTRALITY on every touched file under `plugins/`:

    gitlab --forbidden-only on its 3 touched files (adaptive-node port, plan-run command,
      plan-run SKILL)                                                        exit 0
    gitea  --forbidden-only on its 3 touched files                           exit 0

CHAINS: see the ledger above. Run by me sequentially as four separate commands, so no `&&`
short-circuit can hide a red chain behind a green one.

## Non-blocking observations (recorded, not counted against the candidate)

1. FORWARD-COMPAT, UNREACHABLE TODAY. `classifyEvidenceBody`'s anti-forgery conjunct iterates the
   role's `ROLE_TOKEN_REGISTRY` row; a role with no contentful token would make that conjunct
   vacuous, so any marker-bearing body would classify as a gap. I enumerated the shipped library
   rather than inheriting n7's version of this: all five producer-kind roles (code-explorer,
   planner, knowledge-lookup, code-architect, investigator) carry at least one contentful token,
   and `SUBSTITUTABLE_KINDS` admits producers only. Narrowing further than n7 did: applying P2+P3+P4
   together, exactly ONE substitution pair is viable on the shipped library at all —
   code-explorer -> investigator, token contract [evidence-binding, findings]. The hole is
   unreachable and becomes reachable only if `SUBSTITUTABLE_KINDS` widens. Worth a forward-compat
   note in whatever change widens it; not a defect here.

2. DISCLOSED WORK DESTRUCTION. A body with a typed gap marker, real prose, and every required token
   empty classifies as a gap and its prose is destroyed by the reset. Stated in D-819-01 and in the
   routing prose. The close gate would refuse that body anyway. Not a relabeling hole: the swap
   still requires the role's own typed self-declaration and the re-seeded file is empty.

3. PRE-EXISTING, OUT OF SCOPE. The routing card says "Spawn it anew from the re-issued card" without
   naming the command that re-issues it. I measured that `open-next` on an already-in_progress node
   re-emits the card with the fresh identity and the unchanged nonce, so the route exists and the
   acceptance item holds. The unnamed-command sentence predates this candidate (the diff only
   appends the task-identity clause to it), so it is not candidate-caused.

4. PRE-EXISTING / PROVENANCE PRECISION. CHANGELOG.md and D-819-01.md say the seed comment is written
   "for all 15 roles". `ROLE_CAPABILITY_MANIFEST` has 18 entries: 15 agent roles + 3 `kind: built-in`
   (finalize, main-session-gate, expansion-point). Read as "the 15 agent roles" the sentence is
   accurate; read as the manifest size it understates. Neither file is an agent-facing prompt
   surface, and the measured behaviour covers all 18.

## Regression judgement

I looked specifically for the ways a change of this shape usually breaks something else:

  - LOOSENED PREDICATE LEAK. `hasEvidenceBodyBelowHeader` is now more permissive. Verified by grep
    across all four editions that it has exactly one definition, exactly one production call site
    (`classifyEvidenceBody`), and one export line; `classifyEvidenceBody` in turn has exactly one
    production caller (`runSubstituteRole`). The only consumer of the new export is the test file.
    It cannot reach `checkEvidenceShape`, the barrier, or any close-time gate.
  - CLOSE-TIME VOCABULARY. `delegation_outcome: capability_gap` is still outside the close-time
    vocabulary — the diff touches neither the schema nor the plan-validator — so a gap is READ at
    substitute time and still REFUSED at close time. n7 measured both halves; I confirmed the
    diff is empty for both files.
  - SIGNATURE WIDENING. The new second parameter of `codexTaskNameForNode` is optional and every
    existing one-argument caller is unaffected; I checked null / undefined / '' explicitly.
  - REVIEW-GATE SEED REGRESSION. The C1 reset calls `seedEvidenceFile(..., reviewOpen = null)`,
    which would drop a reviewer-contract-derived token list. Not reachable: `SUBSTITUTABLE_KINDS`
    is producer-only, and producer tokens come from the static registry, so passing null is correct
    at this call site. Flagged here because it is the seam that would break first if substitution
    is ever widened to reviewer or gate kinds.
  - GUARD ORDERING. P5a (ledger) before P5b (body), and the whole guard block before the commit
    phase. Both confirmed by execution, not by reading.

## Chain evidence

I RE-RAN all four chains myself rather than relying on the orchestrator's run. Four separate
commands, no `&&` between them, exit code captured on each command:

    npm run test:kaola-workflow:claude    exit 0
    npm run test:kaola-workflow:codex     exit 0
    npm run test:kaola-workflow:gitlab    exit 0
    npm run test:kaola-workflow:gitea     exit 0

Each log ends on the last command of its own chain — `test-runtime-lexicon-parity: PASS (580
derived typed codes, 0 asymmetric across 6 runtimes)` for claude, `generate-routing-surfaces
--check: all 30 surfaces byte-match the skeleton` for the other three — so no chain was truncated
mid-run. Running them as four separate commands is what makes this evidence: `npm test` chains the
four with `&&` and short-circuits, so a red codex/gitlab/gitea behind a green claude would never
be reached.

This is an EDITION-TOUCHING diff (three plugin trees), so all four chains are mandatory here, not
optional. `test:kaola-workflow:claude:full` was not run and is not mandated.

CROSS-CHECK ONLY, not my evidence: the orchestrator's earlier run reported the same four zeros. It
disclosed that it had adjudicated the in-scope call on the T3b repair earlier in this run and is
therefore not disinterested on that point, so I treated its results as an artifact from an
interested party and re-measured. The two runs agree.

## The in-scope question I was asked to look at independently

The orchestrator ruled the late T3b repair (the whole-line HTML-comment tolerance in
`hasEvidenceBodyBelowHeader`) in scope, and disclosed that it is not disinterested on that call. I
formed my own view from the code rather than from that ruling.

Without the tolerance, a body carrying a gap marker would still classify `capability_gap`, so the
narrow gap case alone does not require it. What it does require is the `'seeded'` arm: a PRISTINE
production seed — a node whose role has returned nothing at all — classifies `deliverable` without
it, so `substitute-role` refuses on every freshly-opened node. That is the case the shipped routing
prose names FIRST ("If the card's role manifest cannot cover the node brief ... run
substitute-role"), i.e. the pre-dispatch swap. Shipping the classifier without the tolerance would
leave its `'seeded'` arm unreachable — dead code inside a fail-closed guard — and would leave the
subcommand's primary documented use still wedged. Same subcommand, same guard, same predicate,
required for the issue's own acceptance items to hold. I concur that it is in scope, on my own
measurement.

## Documentation precision, stated as prose rather than as a finding

`docs/api.md` says the replay branch "now re-validates P1-P4 before returning `idempotent: true`
(pre-#819 it short-circuited above them)". The statement is true but incomplete in both directions:
the replay detection now sits below P5b, so it re-validates P5a and P5b as well, and pre-#819 P1
already ran above the short-circuit. It understates how strict the guard is, changes no behaviour
and no reader's decision, so it is a nit for whoever next touches that section, not a finding.

## Verdict

Every acceptance item A1-A6 holds, measured rather than inherited where it mattered. The recovery
path is reachable end to end and closes; the anti-relabel conjunct is structural and I broke it in
both directions to confirm; the reset is atomic, binding-preserving, and fails loud on both its
failure modes with no record written; the self-substitution refusal is total, including the revert
case; the loosened predicate is provably contained to one call site in all four editions; the new
coverage really executed (unsharded, 3553 assertions) and is mutation-proven by two independent
probes; the change is present in all four editions and all six routing surfaces; forge neutrality
holds and its checker is armed rather than vacuous; and all four chains are green on my own
sequential run. Zero blocking findings. The four non-blocking observations are pre-existing,
unreachable on the shipped library, disclosed-intended, or documentation precision.

findings_none: zero admitted findings against this candidate; the four observations recorded above as prose are pre-existing, unreachable on the shipped library, disclosed-intended behaviour, or documentation precision, and none is a candidate-caused defect
verdict: pass
findings_blocking: 0
review_summary: no_blocking_findings
review_attestation: full_review_completed
review_conclusion: The issue 819 candidate is certified approved on independent measurement rather than on inherited receipts, with capability_gap recovery reachable end to end through the shipped CLI, the anti-relabel conjunct broken in both directions and holding, the unsubstituted dispatch card unchanged, and all four validation chains green on my own sequential re-run.

evidence-binding: n7-falsify bab5de04e791
contract_version: 2
review_context_hash: af91eb0e6e7ffcb2700e81e6a095a664918159b5878b0aa55c316764fe35de80
behavior_contract_hash: ba82d58558d88bd8dd43ad3c2306d0d4230a80ce17b781acc5213b5b4f08c1fd
resolved_profile_hash: 6c2120956ddaf2ededc4dec581451fec6ca7d6ad0915ed9f55d38e1e7cebd776
candidate_digest: 8c12d53b7acc71c0c8a14d26493c8968e4937ae070d9497718903dbb1d0d39ff
domain_outcome: not_refuted
claim_outcome: not_refuted
gate_mode: change_gate
gate_claim: the candidate makes capability_gap recovery genuinely reachable without opening a relabeling hole: substitute-role invoked on a node whose evidence carries only a capability gap succeeds and leaves that evidence file atomically re-seeded and correctly nonce-bound with no hand patch anywhere in the path, the same guard still refuses a swap on a node carrying a genuine deliverable, a recorded substitution yields a dispatch identity that differs from the pre-substitution identity and is stable across an idempotent replay while an unsubstituted node's dispatch card stays byte-identical to before, a self-substitution is refused rather than recorded, every new regression assertion actually fails when its seam is reverted rather than merely passing after the fix, and all four adaptive-node editions plus all six plan-run routing surfaces carry the change
gate_surface: the entire accumulated diff for issue 819 against the run base — the four adaptive-node editions, scripts/test-adaptive-node.js, the plan-run routing skeleton and required-blocks table with the six rendered surfaces, scripts/test-route-reachability.js, and the docs and decision record — read together with the n1 surface inventory and the n2 mechanism spec, and re-verified by running node scripts/test-adaptive-node.js unsharded, node scripts/generate-routing-surfaces.js --check, node scripts/test-route-reachability.js, and node scripts/validate-script-sync.js, plus a mutation probe that reverts each seam in turn and confirms the matching assertion turns red
gate_aggregation: sequence

# n7-falsify — adversarial falsification of the issue-819 change gate

STATUS: COMPLETE. Written incrementally (a prior attempt at this node died on a transport error
after ~22 min with nothing persisted), so this file was appended probe by probe.

## Upstream evidence read

upstream_read: n1-surface c88971e73a76
upstream_read: n2-mechanism cb782b26822d
upstream_read: n3-tests bcb81dd402a2
upstream_read: n4-scripts 62e0af8d9649
upstream_read: n5-prose 89e5dde2bea3
upstream_read: n6-docs 78609a6c6101

## Candidate composition (measured, not assumed)

`git log --oneline b81bc93f..HEAD` → lane-group merge `88d97b8a` plus leg commits `787d128c`
(n3-tests) and `1348fe9a` (n5-prose); base `8d881aaf` is the run base for the issue.

`git diff --stat b81bc93f -- . ':!kaola-workflow'` → 15 files, +1491 / -139.
`git diff --stat HEAD -- . ':!kaola-workflow'` → 6 files still UNCOMMITTED in the worktree
(CHANGELOG.md, docs/api.md, and the four adaptive-node editions), i.e. the n4 + n6 work is in
the working tree, not in a commit. Plus untracked `docs/decisions/D-819-01.md`.
The candidate under test is therefore HEAD + working tree.

## Probe 1 — the four named surface commands, real `$?`

    node scripts/test-adaptive-node.js              (UNSHARDED)  exit 0
      ##KW-SHARD {"suite":"test-adaptive-node","index":1,"total":1,"scenarios":420,"ran":420,
                  "passed":3553,"failed":0}
    node scripts/generate-routing-surfaces.js --check            exit 0  ("all 30 surfaces byte-match the skeleton")
    node scripts/test-route-reachability.js                      exit 0  (2263 assertions)
    node scripts/validate-script-sync.js                         exit 0
    node scripts/edition-sync.js --check                         exit 0  (12 forge aggregator ports in parity)

Each exit code captured on the command itself, never through a pipe. `n4`'s reported
420/3553/0 reproduces exactly.

## Probe 2 — does the production seed actually classify `seeded`? (the T3b claim, re-measured)

`n3` contested `n2`'s spec on the ground that a COMPLIANT role — one that obeys "never hand-edit
the seeded evidence file" — leaves the opener's own scaffold behind, which `n2`'s classifier as
written called a `deliverable`. I did not take the repair on trust. I drove the REAL
`seedEvidenceFile` for every one of the 18 roles in `ROLE_CAPABILITY_MANIFEST` and classified
the bytes it wrote:

    18/18 roles: hasEvidenceBodyBelowHeader=false, classifyEvidenceBody='seeded'   (0 exceptions)
    incl. the three change-gate reviewOpen variants (code-reviewer / security-reviewer /
    adversarial-verifier), which add the routable-anchor note: also 'seeded'.

REFUTATION ATTEMPT FAILED. The wedge is genuinely lifted on the compliant path, for every role,
not only for the one role in the recorded incident.

Supporting structural measurement (from the same probe):
    producer-kind roles = code-explorer, planner, knowledge-lookup, code-architect, investigator
    IMPLEMENT_ROLES    = tdd-guide, build-error-resolver, implementer, metric-optimizer
    ⇒ no producer role is in IMPLEMENT_ROLES, so `upstreamReadStubIds` is [] for every
      substitutable node and the seed carries no VALUE-bearing `upstream_read:` stub. `n2` §2's
      "seeding with toRole is provably identical to fromRole" holds on the shipped library.

## Probe 3 — call-site containment of the loosened predicate

`grep` over `scripts/` + all three `plugins/*/scripts/` shows `hasEvidenceBodyBelowHeader` has
exactly ONE caller in production code: `classifyEvidenceBody`, which itself has exactly ONE
caller: `runSubstituteRole`. It is now also EXPORTED, and the only consumer of that export is
`scripts/test-adaptive-node.js`. The T3b tolerance therefore cannot reach `checkEvidenceShape`,
the barrier, or any other guard. `n3` §5 and `n4` §1 both claimed this; both are correct.

## Probe 4 — THE MUTATION PROBE (the core of this gate)

I did not accept `n4`'s twelve-row table. I rebuilt the probe from scratch in an isolated tree
(`cp -R scripts templates` to a scratch dir; `diff -q` confirmed the copy byte-exact; the
repository tree was NEVER mutated) and drove the SHIPPED assertions, not my own.

Method: the 8 scenario ordinals that carry `#819-` assertions are 412-419 of 420. `--shard i/N`
partitions by `ordinal % N === i-1`, so `--shard (k+1)/420` runs ordinal k alone. Control run of
those 8 shards on the unmutated copy: all exit 0 (21/27/37/23/7/3/16/7 assertions). Then one
mutation at a time, all 8 shards, real `$?` per shard, restore, next.

    mut  seam reverted                                          RED shards  failing assertion ids
    M1   drop the whole-line HTML-comment tolerance (T3b seam)   414,419     T3b, T8, T8-w1, U1
    M2   classifier never returns 'capability_gap'               414,418,    T1, T8, T8-w1, T9,
                                                                 419,420     T8b, U1, T13
    M3   drop the no-non-empty-required-token conjunct           415,419     T2b, U1
    M4   unanchor CAPABILITY_GAP_MARKERS (/^../m -> /../)        415,419     T2c, U1
    M5   remove P0 (substitute_self_noop)                        415,417     T10, T7, T7b
    M6   task name from the FROZEN role again                    416,417     T4, T7b
    M7   ROTATE the nonce in C1 instead of preserving it         414,420     T1, T13
    M8   hoist the reset ABOVE the guard block                   415         T10, T2, T2b, T2c
    M9   swallow seedEvidenceFile's ok:false and record anyway   418         T8b
    M10  fall back to an empty-string nonce instead of refusing  414         T9
    M11  run P5b (body) before P5a (ledger status)               414         T12b
    M12  move C1 after C3 (record without ever resetting)        414,418,420 T1, T8, T9, T8b, T13
    M13  drop evidence_reset from the C3 (fresh) ok return       413,414,420 T3, T1, T3b, T8-w1, T13
    M13r drop evidence_reset from the C2 (replay) ok return      414         T8
    M14  remove both new OPERATOR_HINT_REGISTRY entries          419         U2
    M15  remove classifyEvidenceBody from module.exports         419         U1
    M16  kill the seeded arm (only a literally empty file seeds) 413,414,419 T3, T3b, T8, T8-w1, U1
    M17  agent_type itself derived from the frozen role          413,416,417 T4, T7b (+ a non-819 row)

**18 mutations applied, 18 killed, ZERO survivors.** Every seam the claim names is
mutation-proven non-vacuous, independently of `n4`'s own probe. `n4`'s twelve rows reproduce;
the six I added (M13, M13r, M14, M15, M16, M17) also kill.

Two honest qualifications on my own method:
- M5/M9/M10/M12 are implemented as `if (false && ...)` / predicate-narrowing disables rather
  than textual deletions of the guard. The observable behaviour is the specified revert.
- M17 also reddens one non-`#819` assertion in the pre-existing `#798` block (shard 413). That
  is a pre-existing pin catching the same seam, not a new-assertion result.

## Probe 5 — the T3b tolerance, attacked directly (24 adversarial bodies)

The strongest way this change could be wrong is a body that SHOULD read as a deliverable but now
reads as seeded or as a gap. I built 24 bodies aimed at exactly that and classified each:

    multi-line <!-- ... --> block spanning 3 lines .......... deliverable  (only a WHOLE line matches)
    <!-- a --> real work still here --> ..................... deliverable  (both ends anchored)
    <!-- x --> findings are here (comment then prose) ....... deliverable
    findings are here <!-- x --> (prose then comment) ....... deliverable
    CRLF deliverable ....................................... deliverable
    CRLF gap marker ........................................ capability_gap  (correct)
    trailing whitespace after --> ........................... seeded  (trim() runs first; correct)
    BOM + deliverable ...................................... deliverable
    U+00A0-indented prose / tab-indented prose ............. deliverable
    unterminated <!-- comment .............................. deliverable  (fail-closed)
    markdown heading only .................................. deliverable
    forged: marker + non-empty findings .................... deliverable  (refuses; conjunct holds)
    indented-only marker occurrence ........................ deliverable  (column-0 anchoring holds)
    binding line not on line 1 ............................. deliverable
    plain prose with no token at all ....................... deliverable

REFUTATION ATTEMPT FAILED on every row. `[\s\S]` inside the tempered-greedy group cannot span a
line because the predicate is applied per-line after `split('\n')` + `trim()`; the `-->$` anchor
is what rejects `<!-- a --> b -->`.

ONE row needs a judgement rather than a verdict, and it is DISCLOSED behaviour, not a hole:

    body = column-0 `delegation_outcome: capability_gap` + real PROSE + every required token EMPTY
        -> classifies capability_gap -> the prose is destroyed by the reset.

That is not a relabeling hole (the swap still requires the role's own typed self-declaration, and
the re-seeded file is empty, so the substitute must produce fresh work), and `n2` §4c states it in
terms: "a role that jotted partial notes and then gapped loses those notes". The close gate would
refuse that body anyway (empty required token). Recorded as non-blocking.

## Probe 6 — INDEPENDENT byte-identity of the unsubstituted dispatch card

`n4` reported 293 comparisons. I did not reuse its harness. I materialised the pre-change module
(`git show HEAD:scripts/kaola-workflow-adaptive-node.js` into a full copy of `scripts/`; confirmed
`HEAD` is byte-identical to the run base for that file, so this is the true "before") and compared
`JSON.stringify(buildDispatch(nodeInfo, ctx))` — KEY ORDER included — old vs new over
18 roles x 5 node-id shapes x 5 model tiers x 6 contexts (incl. `runtime:'codex'`,
`opencode_provider`, `session_proof`, `forge_rider`), plus 7 degenerate one-argument
`codexTaskNameForNode` inputs.

    2707 comparisons, 0 mismatches.

The `simulate-workflow-walkthrough.js:21452` pin (`d.codex_task_name === 'n1_tdd_guide'`), which
is in NO node's write set, is therefore preserved by construction — and I ran the walkthrough
UNSHARDED myself to prove the pin EXECUTED rather than inferring it:

    node scripts/simulate-workflow-walkthrough.js   exit 0
    ##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,
                "scenarios":280,"ran":280,"passed":280,"failed":0}

No write-set overflow. `n1` I3 and `n4`'s byte-identity claim both reproduce.

Identity distinctness + stability, measured directly:
    18 distinct task identities over the 18 manifest roles for one node id (sanitizer injective)
    pre = n1_code_explorer   post = n1_investigator   -> differ
    repeated derivation identical (pure function of (node id, active record's to_role))
    dispatchRole null / undefined / '' all fall back to the frozen cell -> n1_code_explorer

## Probe 7 — end-to-end through the REAL CLI subprocess (not the exported function)

The claim says "with no hand patch anywhere in the path", so I drove the shipped CLI in a real git
fixture — full guard prologue, scheduler lock, worktree-authority guard included — across 8
scenarios, 41 checks, using the PRODUCTION `seedEvidenceFile` output as the starting evidence
rather than a hand-written body. All 41 passed:

    E1 production seed only      -> exit 0, ok, evidence_reset=false, evidence + plan bytes UNCHANGED,
                                    one record                        [the compliant path unwedges]
    E2 self-persisted gap body   -> exit 0, evidence_reset=true, LINE 1 BYTE-IDENTICAL (nonce
                                    preserved), no gap trace survives, re-seeded file classifies
                                    'seeded', plan bytes unchanged, one record;
                                    replay -> ok/idempotent:true/evidence_reset:false/ONE record/
                                    evidence byte-identical
    E3 genuine deliverable       -> exit 1, substitute_node_closed, bytes UNCHANGED, NO store file
    E4 forged marker over work   -> exit 1, substitute_node_closed, the real findings survive
    E5 self-substitution         -> exit 1, substitute_self_noop, NO store file, gap body untouched,
                                    hint does NOT say "Run orient"; and the REVERT case (record ->
                                    investigator, then --to-role code-explorer) also refuses with the
                                    row count unchanged
    E6 complete row + gap body   -> exit 1, substitute_node_closed whose detail names the STATUS arm
                                    (P5a decides first), body untouched, no store
    E7 gap body, no baseline     -> exit 1, substitute_evidence_reset_failed, bytes UNCHANGED,
                                    no store, hint forbids the hand edit

P5 is NOT deleted. Every refusal is a byte-for-byte no-op on disk.

## Probe 8 — the close-time asymmetry, BOTH halves

My first attempt at this used the wrong argument order and read `{"ok":true}`; the signature is
`checkEvidenceShape(role, nodeId, evidence, opts)`. Re-run correctly:

    substitute time (classifyEvidenceBody)     -> capability_gap                     [READ]
    close time (checkEvidenceShape, gap body)  -> ok:false, missingTokenClass:
        delegation_outcome, "unknown delegation_outcome \"capability_gap\" (allowed:
        completed | returned_partial | interrupted_unresponsive | interrupted_obsolete)"  [REFUSED]
    close time, marker over a FULL deliverable -> ok:false, same code (the vocabulary alone decides)
    control, delegation_outcome: completed     -> ok:true

`DELEGATION_OUTCOME_VOCABULARY` is unchanged, and `git diff <base> -- adaptive-schema.js
plan-validator.js` is EMPTY — no shared constant moved. A gap is read at substitute time and can
still never close a node.

## Probe 9 — the pre-fix wedge, re-measured against the OLD module

`n1` 1B and the whole T3b argument rest on "the production seed alone already refused". I proved
it rather than inheriting it, by running the PRE-CHANGE `runSubstituteRole` against a fixture whose
evidence is the pre-change `seedEvidenceFile` output:

    PRE-FIX  substitute-role on the production seed -> refuse / substitute_node_closed
    POST-FIX substitute-role on the production seed -> ok / evidence_reset:false

(My first pass at this measured 0/18 and was VOID — `hasEvidenceBodyBelowHeader` was not exported
before this diff, so the probe was reading `undefined`. Corrected above.)

## Probe 10 — cross-edition + routing-surface completeness

    node scripts/edition-sync.js --check                    exit 0  (12 forge aggregator ports in parity)
    node scripts/validate-script-sync.js                    exit 0
    node scripts/validate-workflow-contracts.js             exit 0
    node scripts/validate-kaola-workflow-contracts.js       exit 0
    …gitlab-contracts.js                                    exit 0
    …gitea-contracts.js                                     exit 0
    …gitlab-contracts.js --forbidden-only <gitlab+codex ports>   exit 0  (forge-neutral)
    …gitea-contracts.js  --forbidden-only <gitea+codex ports>    exit 0  (forge-neutral)

Parity is not enough on its own, so I loaded each of the three PORTS and exercised the new
behaviour directly rather than trusting `--check`:

    kaola-workflow / -gitlab / -gitea  ALL THREE:
      seed=seeded  gap=capability_gap  deliverable=deliverable  forged=deliverable
      task(1-arg)=n1_code_explorer  task(2-arg)=n1_investigator
      both new OPERATOR_HINT_REGISTRY entries present as functions

Routing surfaces — all SIX carry all FOUR new pinned tokens (`substitute_self_noop`,
`substitute_evidence_reset_failed`, `evidence_reset: true`, `derived from the DISPATCH TARGET`),
one occurrence each; `<!-- PIN: role-capability-coverage -->` occurs ONCE in the skeleton (outside
every `REGION:` block), so all six render from one copy; `generate-routing-surfaces.js --check`
confirms no surface was hand-edited.

## Probe 11 — do the docs describe the TREE?

`n6` corrected two catalogs `n1` 5D flagged as pre-existing drift. I re-measured both against the
shipped `SPLIT_GUARDED_SUBCOMMANDS` (16 members) rather than against the spec:

    shipped set: open-next, open-ready, close-node, close-and-open-next, reconcile-running-set,
                 write-halt, clear-halt, expand-open, expand-close, reopen-node, revert-overflow,
                 repair-node, route-findings, record-evidence, substitute-role, discard-speculative

Both `docs/api.md` lists (the `worktree_authority_split` roster and the scheduler-lock roster) now
enumerate exactly those 16. Both guards are keyed on the SAME constant in `main()`
(`SPLIT_GUARDED_SUBCOMMANDS.has(subcommand) && !(subcommand === 'record-evidence' &&
args.includes('--verify'))`), so the doc's derivation is correct. Verified in source, not inferred.

---

## REFUTATION ATTEMPTS THAT FAILED — the full ledger

Recorded so this gate is auditable, not only its positives. Every attempt below was RUN.

    #   attack                                                        result
    A1  construct a deliverable that the comment-skip now calls seeded  FAILED (24 bodies, Probe 5)
    A2  break the comment regex with an internal --> / multi-line       FAILED (both stay 'deliverable')
    A3  CRLF / BOM / trailing-whitespace / unicode-indent evasion       FAILED (trim + multiline $)
    A4  find a role whose PRODUCTION seed still wedges                  FAILED (18/18 'seeded')
    A5  find a second call site where the loosened predicate leaks      FAILED (1 caller, 1 caller up)
    A6  move the unsubstituted dispatch card by one byte                FAILED (2707 comparisons)
    A7  break the walkthrough's n1_tdd_guide pin (write-set overflow)   FAILED (280/280 unsharded)
    A8  get a genuine deliverable through P5                            FAILED (E3, E4, T2/T2b/T2c)
    A9  launder real work by stamping the gap marker                    FAILED (E4; M3 kills the seam)
    A10 admit capability_gap at CLOSE time                              FAILED (vocabulary untouched)
    A11 record a self-substitution, incl. via the replay branch         FAILED (E5 both arms)
    A12 make a refusal leave a footprint on disk                        FAILED (E3-E7 + T10 + M8)
    A13 find a new assertion that stays green under its own mutation    FAILED (18/18 killed)
    A14 find an edition or routing surface missing the change           FAILED (4/4 + 6/6)
    A15 find a docs catalog that describes the spec, not the tree       FAILED (both match source)
    A16 find a vacuous conjunct via a role with no content token        FAILED-as-blocking: the three
                                                                        such manifest entries are not
                                                                        producer-kind, so P2 blocks
                                                                        them (see below)

## Non-blocking observations (NOT counted against the claim)

1. **Latent, unreachable today.** `workflow-planner`, `finalize`, and `expansion-point` have NO
   `ROLE_TOKEN_REGISTRY` row, so `classifyEvidenceBody`'s anti-forgery conjunct would be VACUOUS
   for them — a marker-bearing body would classify `capability_gap` regardless of content. P2
   admits only `kind: producer`, and all five producers (`code-explorer`, `planner`,
   `knowledge-lookup`, `code-architect`, `investigator`) carry a content token, so the hole is
   unreachable on the shipped library. It becomes reachable only if `SUBSTITUTABLE_KINDS` ever
   widens — which `n2` §2 explicitly anticipates as a future change. Worth a forward-compat note;
   not a defect in this candidate.
2. **Disclosed work destruction.** Probe 5's judgement row: a self-declared gap body carrying real
   prose but no non-empty required token loses that prose. Stated in `n2` §4c.
3. **Provenance-doc imprecision.** `CHANGELOG.md` and `docs/decisions/D-819-01.md` both say the
   seed comment is written "for all 15 roles in the manifest". `ROLE_CAPABILITY_MANIFEST` has 18
   entries (15 agent roles + 3 `kind: built-in`). It UNDERSTATES — I measured the behaviour for all
   18 — and neither file is an agent-facing prompt surface.
4. **Pre-existing wording, untouched by this diff.** `docs/api.md`'s
   `worktree_authority_split` roster says `record-evidence --stdin`; the code exempts only
   `record-evidence --verify`, so a bare `record-evidence` is guarded too.

## Scope note

The four validation chains (`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`) are NOT in
my gate surface and I did not run them. This IS an edition-touching diff (three plugin trees), so
that obligation is live and belongs to the certifier / finalize nodes. Every command my surface
DOES name was run, unsharded where the surface says unsharded, with `$?` captured on the command.

## Repository cleanliness

I declared no write set. My only write is this file. `git status --short -- . ':!kaola-workflow'`
at the end of this node is byte-identical to the snapshot at the start (the same 6 modified files
and 1 untracked ADR that constitute the candidate). The 18 mutations ran against a `cp -R` copy of
`scripts/` + `templates/` in a scratch directory; the repository tree was never mutated.

## Verdict

Presuming the claim false, I attacked all six of its conjuncts with the strongest counterexamples I
could construct, and every attempt failed. Confidence: HIGH on the mechanism, the mutation
non-vacuity, the byte-identity, and the cross-edition/routing completeness — each was measured
here, not inherited from an upstream node. Where an upstream claim was load-bearing (`n1` 1B, `n3`
§1's contested T3b, `n4`'s byte-identity and mutation tables, `n6`'s docs corrections) I
re-measured it independently and all four reproduced.

verdict: pass
findings_blocking: 0

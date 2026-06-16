evidence-binding: n1-design 7011b4f18b80

# n1-design — L1 leg-coupled safe wire — implementation SPEC (contract for n2)

## Part 1 — L1 leg-couple wire (production: scripts/kaola-workflow-adaptive-node.js)

Inert path today: `tryFormLaneGroup` (:3348-3362) calls validator `--parallel-safe --nodes <ids> --json` at :3351 WITHOUT `--write-overlap-consent`. Validator's `--parallel-safe` already reads it (`plan-validator.js:1878`) → `writeOverlapRelaxable` (:606-614) returns false when !consent → shared-infra refuses → group never forms. Sole caller: `runOpenReady` at :3816. Provisioning at :3899 already gates on `groupForm && resolveLegIsolation(process.env) && opts.writeOverlapConsent`. `opts.writeOverlapConsent` parsed :5124, in scope at 3816.

**Edit A — signature + conditional append (:3348-3351):** add 4th param `writeOverlapConsent`:
```
function tryFormLaneGroup(writeNodes, planPath, shell, writeOverlapConsent) {
  ...
  const vArgs = [planPath, '--parallel-safe', '--nodes', ids.join(','), '--json'];
  if (writeOverlapConsent) vArgs.push('--write-overlap-consent');
  const ps = shell(validatorPath, vArgs);
```
Update the header comment (:3338-3346): consent forwarded only when leg-coupled (disjoint-green co-open unaffected).

**Edit B — leg-coupled call site (:3816):**
```
const grp = tryFormLaneGroup(writeNodes, planPath, shell, resolveLegIsolation(process.env) && opts.writeOverlapConsent);
```
(`resolveLegIsolation` defined :3376-3379, used at :3899; `opts.writeOverlapConsent` in scope.) THE load-bearing change.

**Preservation invariants (n2 MUST NOT violate):** gate the FLAG FORWARD only — leave `if (containment && writeNodes.length >= 2)` at :3814-3815 and the `else { toOpen=[writeNodes[0]] }` degrade branches UNTOUCHED. Disjoint-green stays byte-identical (green short-circuits at plan-validator.js:1895 before writeOverlapRelaxable, so consent value is irrelevant for disjoint). Tests D437-OPEN-READY-GROUP (:5016) + LEG-FLAG-OFF-BYTE-IDENTITY (:5272-5297) must still pass.

**Why it closes #283/#303:** formation (:3811-3834) and provisioning (:3899-3935) are distinct gates. Consent-ALONE forward would let a shared-infra group FORM with LANE_CONTAINMENT=1 + consent even if LEG_ISOLATION=0, but provisioning at 3899 needs resolveLegIsolation → no legs provisioned while group formed → both overlapping shared-infra writers execute against the SHARED parent worktree → clobber. Gating the forward on the SAME conjunction (resolveLegIsolation && consent) couples formation to provisioning: a shared-infra group can only form when legs WILL be provisioned. Unreachable when LEG_ISOLATION=0.

## Part 2 — New shared-infra-coarse END-TO-END test (scripts/test-adaptive-node.js)

`makeLaneRepo` (:4918-4963) is disjoint-only (ax.js/by.js, no write_overlap_policy) → green short-circuit, never exercises writeOverlapRelaxable.

**Parameterize makeLaneRepo (keep all current defaults byte-unaffected):** add `opts.writeOverlapPolicy` → when set, emit `write_overlap_policy: <value>` into `## Meta` (alongside :4930; parse confirmed plan-validator.js:322-324). aSet/bSet params already exist (:4920-4921). `provisionedRepo()` (:5480-5490) hardcodes disjoint — don't repurpose; new test builds its provisioned repo inline.

**Fixture:** `makeLaneRepo({ writeOverlapPolicy:'coarse', aSet:'scripts/aa.js', bSet:'scripts/bb.js' })`. Both → areaForPath 'scripts' ∈ SHARED_INFRA → disjointWriteSets yellow/shared-infra (classifier :404-410). Policy MUST be `coarse` (shared-infra kind relaxes only at policy===coarse, validator :612 — don't confuse coarse policy vs coarse kind). aa.js/bb.js NOT protected (:318-331). Existing review→finalize topology already satisfies gatePresent (:1881). Freeze succeeds: shared-infra sets concurrentAmbiguousOverlap (:1396)→decision:ask but still in-grammar (exact-only hard-errors at :1385); makeLaneRepo passes `--freeze --repair` (:4958).

**Discriminator probe (proves RELAXATION path, not green short-circuit) — direct validator exec (mirror :5473/:5506), NOT in production code:**
- Positive: `--parallel-safe --nodes A,B --write-overlap-consent --json` → assert `result==='ok'` AND `relaxed` contains `kind==='shared-infra'` (validator surfaces out.relaxed :1897/:1906). Pins writeOverlapRelaxable→true at :1896, not the :1895 continue.
- Negative: same WITHOUT consent → `result==='refuse'`. Proves fixture is genuinely shared-infra + consent is the flip.

**Positive e2e (translate SYNTH-DISJOINT :5666-5692 with new paths), open-ready --write-overlap-consent under LEG_ON:**
1. open-ready ok, r.laneGroup members [A,B] (FORMS via relaxation, fixture yellow not green).
2. rs.lane_group.legs.A/.B present (legPath/legBranch/baseline) — mirror :5249-5255.
3. writeEvidence A,B; write real files INTO legs at `path.join(legX,'scripts','aa.js'/'bb.js')` — mkdirSync the scripts/ subdir first (SYNTH writes root files; this needs the subdir).
4. close A → barrier deferred_to_group; close B (last) → ok, barrier group_passed, synthesized true, mergeCommit ≥7-char sha — mirror :5676-5680.
5. rev-parse HEAD === M (advanced) — :5681.
6. M contains both scripts/aa.js + scripts/bb.js; diff base→M == those two (union barrier over union) — :5684-5686.
7. legs torn down: no .kw/legs worktree — :5692.

**Negative (the coupling — BOTH conjuncts; mirror :5045-5047):**
- (a) toggle OFF, consent ON (env ON = LANE_CONTAINMENT=1 only, args include --write-overlap-consent): assert !r.laneGroup, !rs.lane_group, r.opened.length===1 (serial degrade). **THE #283/#303 headline guard** — old code would FORM+skip legs; fixed must degrade.
- (b) toggle ON, consent OFF (env LEG_ON, args without consent): assert !r.laneGroup, !rs.lane_group, r.opened.length===1.

**RED-provable:** against today's code the positive block fails (un-coupled call → shared-infra refuses → no group → serial degrade → r.laneGroup absent). After Edit A/B passes. Reuse helpers: runNode :4966, readRS :4981, ledgerStatus :4984, writeEvidence :4996, cleanup :5008, worktreePaths :5212, branchExists :5217, gitOut :5473, LEG_ON :5210, ON :5009.

## Part 3 — Cross-edition
Forge-neutral + byte-identical-able: new param `writeOverlapConsent`, `resolveLegIsolation`, literal `--write-overlap-consent` carry no forge vocab. n2 edits canonical adaptive-node.js then `node scripts/edition-sync.js --write` → regenerates codex byte-twin + gitlab/gitea rename ports (all in n2 write-set). `generated_port_split` gate (plan-validator.js:1196-1200) needs canonical+3 ports atomic; edition-sync --write satisfies, --check (n5) verifies. test-adaptive-node.js root-only (claude chain); no edition propagation. All 4 chains green before finalize.

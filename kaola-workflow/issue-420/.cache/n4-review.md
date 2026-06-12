# n4-design-review evidence
evidence-binding: n4-design-review 2db3fb6f31aa

## Review findings

Adversarial method: for each of the eight probes I attempted the strongest disproof —
constructing a falsifying scenario or auditing the load-bearing factual claim against the
actual source. Every line-number citation in both ADRs that I spot-checked was verified
accurate against the worktree code. No probe yielded a concrete counterexample.

### Finding 1: Autopilot stop conditions — silent-exit + confidence:null
**Severity:** non-blocking
**ADR:** D-420-01
**Probe:** Probe 1 (autopilot stop conditions going silent, violates #44)
**Finding:** [INV-2]'s proceed predicate is `confidence == "high"` (line 86) — an allow-list-by-equality:
ONLY the exact value `"high"` proceeds. A `confidence: null` or a missing field is NOT `"high"`, so it
falls structurally into the park branch ("medium / low parks ... never a silent proceed, never a silent
skip", lines 82-83). The null/missing-field silent-proceed gap is closed by the equality framing, not left
open. [INV-4] (lines 106-109) is a complete normative statement: "There is no code path on which the
autopilot exits with no emission." It names `process.exit(0)` as the violation. It does NOT explicitly
enumerate an unhandled-exception/crash exit, BUT the crash-exit + digest-on-crash path is explicitly named
as OQ-4 (lines 206-210, "If the autopilot session crashes mid-loop, can it resume the digest") — it is a
named open question, not a silently dropped path. For a Status:Proposed ADR this is the correct resolution
level; crash-path try/finally is an implementation concern routed to OQ-4.
**Verdict on finding:** refuted (the ADR addresses it)

### Finding 2: Subagent-dispatch constraint strength
**Severity:** non-blocking
**ADR:** D-420-01
**Probe:** Probe 2 (subagent-dispatch constraint)
**Finding:** [INV-5] (lines 111-119) states the orchestrator-level boundary strongly: "The autopilot driver
lives at the ORCHESTRATOR level (the main session loop), NOT inside any subagent", cites #242
("Subagents cannot dispatch subagents"), and explicitly partitions the responsibility — "the aggregator
computes, the orchestrator dispatches" — while permitting a `kaola-workflow-autopilot.js` aggregator to
emit typed results + own the digest. An implementer could NOT misconstrue this to put the scout/planner/role
dispatch inside an aggregator without contradicting the explicit "the actual Task/dispatch ... MUST stay in
the orchestrator" clause. OQ-1 (lines 187-192) fixes the residual boundary (which computations move into an
aggregator) at implementation. Stated strongly enough.
**Verdict on finding:** refuted (the ADR addresses it)

### Finding 3: hash-coverage "for free" claim accuracy
**Severity:** non-blocking
**ADR:** D-420-01
**Probe:** Probe 3 (hash-coverage claim accuracy)
**Finding:** [INV-8] (lines 146-152) claims `computePlanHash` hashes the ENTIRE `## Meta` body and a `goal:`
line is "covered with NO hash code change." VERIFIED accurate: `computePlanHash`
(plan-validator.js:682-686) computes `body = norm('Meta') + '\n---NODES---\n' + norm(NODES_HEADING)`, where
`norm` = `sectionBody(content, section).split('\n').map(l => l.trim()).filter(Boolean).join('\n')` — i.e.
the FULL Meta section body, every non-blank line, no field skipped. Adding `goal:` to `## Meta` is therefore
hash-covered with no validator code change. The "for free" claim is accurate. [INV-9]/[INV-10]'s `parseGoal`
`## Meta`-scoped-read requirement (the #B1 lesson from `parseLabels`) is addressed and matches the verified
code: `parseLabels` (lines 128-132) is read via `parseLabels(classifier.sectionBody(content, 'Meta'))` at
line 702, with the #B1 audit comment at lines 698-701 confining it to `## Meta` against an out-of-region
decoy. The ADRs explicitly require `parseGoal` to mirror this scoping.
**Verdict on finding:** refuted (the ADR addresses it)

### Finding 4: Forge-neutral violations
**Severity:** non-blocking
**ADR:** D-420-01 / D-420-02
**Probe:** Probe 4 (forge-neutral violations)
**Finding:** A grep for `\b(gh|glab|tea)\b` across both ADRs returned exactly 3 hits, NONE of which is a
Decision-section prescription to USE a forge CLI: (1) D-420-01:40 is a `## Context` CITATION of the EXISTING
`gh issue close` call (`sink-merge.js:442/486`) as a factual reference; (2) D-420-02:127 ([INV-17]) names the
tokens precisely to FORBID them ("No `gh` / `glab` / `tea` token appears in the classifier"); (3) D-420-02:203
([INV-21]) names "NOT `gh release create`" precisely to prohibit it, prescribing "run the forge release-create
command with `--latest`" instead. The release aggregator's publish step preserves forge-neutrality: [INV-21]
(lines 197-205) explicitly states `--cut` PRINTS the publish command forge-neutrally and "never crosses into
executing it." Forge-neutrality is preserved in all Decision-section prose.
**Verdict on finding:** refuted (the ADR addresses it)

### Finding 5: Repair-consent boundary consistency
**Severity:** non-blocking
**ADR:** D-420-01 / D-420-02
**Probe:** Probe 5 (repair-consent boundary)
**Finding:** D-420-01 [INV-6] (lines 121-126) defers the repair-consent POLICY as OQ-2 but states the
DEFAULT: "Absent an explicit operator opt-in, a repair-eligible halt parks as `consent_halt`." D-420-02
[INV-15] (lines 102-114) is consistent: "`runWriteHalt` COMPUTES and ATTACHES the diff; it does NOT apply it
(the script never re-freezes from inside a halt). Applying the diff is the orchestrator's decision under
D-420-01 [INV-6]'s repair-consent boundary." I searched for any auto-applied-without-consent scenario: the
only "the autopilot applies the swap" text (investigation:224) is gated by the preceding "the operator's
decision collapses to yes/no, THEN the autopilot applies." There is no path where the attached diff is
applied without an explicit decision: the halt script structurally cannot apply (attach-only), and the
orchestrator's application is gated by [INV-6]. Consistent; no falsifying scenario.
**Verdict on finding:** refuted (the ADR addresses it)

### Finding 6: goal_line hash mutation / backwards-compat
**Severity:** non-blocking
**ADR:** D-420-01
**Probe:** Probe 6 (goal_line hash mutation)
**Finding:** [INV-9] (lines 154-160) addresses backwards-compat: "Old frozen plans WITHOUT a `goal:` line
stay valid and hash-stable: an absent optional line changes nothing in the normalized `## Meta` body."
VERIFIED: `computePlanHash`'s `norm` applies `.filter(Boolean)`, so an absent line is simply absent from the
hashed body — identical back-compat to the verified optional `model`/`selector_source` columns
(parseNodes lines 163-166, "old plans hash-stable"). On the "does the stored hash change when a planner adds
`goal:`" concern: the freeze transaction stamps `plan_hash` AFTER authoring (adaptive-handoff SPAWN-2,
investigation §1.1 line 48), so a plan authored WITH `goal:` has that hash as its frozen baseline — there is
no mutation-after-freeze. Post-freeze goal tampering correctly trips `plan_hash_mismatch` ([INV-8], verified
at plan-validator.js:1234). Expected and safe.
**Verdict on finding:** refuted (the ADR addresses it)

### Finding 7: CHANGELOG-completeness "which issues in batch" data source
**Severity:** non-blocking
**ADR:** D-420-02
**Probe:** Probe 7 (CHANGELOG completeness check design)
**Finding:** [INV-20] (lines 187-195) proposes `changelog_incomplete` reporting missing issue numbers. The
"how does the aggregator know which issues are in the current batch" data-source question is NOT a hidden
gap — it is explicitly raised as OQ-P4-a (lines 253-260), which names the exact problem ("needs the
closed-issue set since the tag — which requires a forge query ... a FORGE-SPECIFIC read") and enumerates
three forge-neutral options (sink-receipts / injected-parameter / CHANGELOG-vs-git-log), recommending the
injected-parameter form to preserve [INV-21]'s forge-neutrality. Named open question, correctly deferred to
implementation, not a design gap.
**Verdict on finding:** refuted (the ADR addresses it)

### Finding 8: Cross-references accuracy
**Severity:** non-blocking
**ADR:** D-420-01 / D-420-02
**Probe:** Probe 8 (cross-references are accurate)
**Finding:** All five referenced ADR files exist on disk: D-419-01, D-419-02, D-420-01, D-420-02, D-422-01.
Invariant numbering is self-consistent and the inter-ADR handoff is accurate: D-420-01 numbers [INV-1]..
[INV-12] (the lone `INV-13` token in D-420-01:258 is the forward-handoff sentence "D-420-02 continues the
invariant numbering from [INV-13]", not a stray 13th invariant); D-420-02 numbers [INV-13]..[INV-23] and its
header (line 22) states "numbers invariants [INV-1]..[INV-12]; this record continues at [INV-13]." The
D-420-01 ↔ D-420-02 mutual Related links match the actual filenames and Parts split (D-420-01 = Parts 1+3,
D-420-02 = Parts 2+4). D-419-01/D-419-02 cited as the Parts-1+3 / Parts-2+4 structural matches; D-422-01
referenced. The slightly loose "invariants continue here from [INV-12]" phrasing on D-420-02:6 is
disambiguated precisely by line 22 ("continues at [INV-13]") — not a contradiction.
**Verdict on finding:** refuted (the ADR addresses it)

## Summary
findings_blocking: 0
findings_non_blocking: 8

I attempted the strongest disproof on all eight probes and could not construct a single concrete
falsifying input, state, or execution path against either ADR. Every load-bearing factual claim
(computePlanHash full-Meta coverage:682-685; parseLabels Meta-scoping:128-132/702; barrierCheck arrays +
#406 reason precedence:578-672; write_set_granularity subtype:557/659-668; runWriteHalt reasons +
return:1454/1457/1542-1550; plan_hash_mismatch:1234; deriveMemberSet:636; VERDICT_ROLES:543; reopen-node
plan-repair:1632; scout confidence:84/112/118) was verified accurate against the worktree source. No forge
CLI is prescribed in any Decision section. The repair-consent boundary ([INV-6] <-> [INV-15]) is consistent
with no applied-without-consent path. All deferred concerns (crash-resume, autopilot home, repair-consent
policy, changelog data source, test_thrash capture) are named as explicit OQs, not silent gaps. The two ADRs
survive the inverted burden of proof.

verdict: pass
findings_blocking: 0

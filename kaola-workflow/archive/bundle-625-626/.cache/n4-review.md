# Review — n4-review (bundle-625-626), G1 gate over n1/n2/n3

Reviewed the full accumulated diff (3 legs + octopus synth): 29 files, 100% inside agents/ and
the three plugins/*/agents/ trees, 0 lines changed under scripts/ or anywhere else.

## 1. Evidence-contract direction per role-kind -- CORRECT both halves
Authoritative source check: the contract section is byte-identical between
commands/kaola-workflow-plan-run.md and the codex SKILL. Write half (n1): implementer/synthesizer/
tdd-guide all now say SELF-WRITE + preserve evidence-binding header verbatim (0->4 occurrences).
Gate half (n2): adversarial-verifier/code-reviewer/security-reviewer + both higher variants all
now say RETURN the block, orchestrator persists via record-evidence --stdin. No half-fix residue
(grep for old "do not self-write"/"save to .cache" framing: zero matches).

## 2. finding: id= needle -- intact, machine-verified
All five reviewer bodies contain exactly one column-0 finding: id= line each; pinned by
scripts/validate-workflow-contracts.js, ran green inside the claude chain.

## 3. security-reviewer tools + route-out reframe -- exact
Both security-reviewer.md and profiles/higher/security-reviewer.md now read exactly
tools: ["Read","Grep","Glob","Bash"] (Write/Edit dropped). Remediation prose reframed as
route-out (fix_role=security), no self-edit language remains.

## 4. The three n3 fixes -- surgical
workflow-planner.md: single-line removal, nothing else touched. build-error-resolver.md: exactly
two route-name substitutions, both targets verified to exist. doc-updater.md: genuine Detection-
first gate on scripts/codemaps//docs/CODEMAPS/, real fallback to actual doc surfaces + skip-with-
reason -- behavioral gating, not cosmetic.

## 5. No scope creep
scripts/ diff is 0 lines; WRITE_ROLES untouched; no new contract/grep test added; only the two
intended profiles/higher/ files touched (no adversarial-verifier higher variant exists -- plan
claim confirmed correct, not an oversight); nine defensively-declared n3 tomls correctly
unwritten; no provenance tokens added to any agent surface.

## 6. Cross-edition parity -- byte-exact
All 18 tomls (6 agents x 3 editions) carry the identical directional fix, byte-identical across
editions after path normalization. No forge CLI/brand nouns introduced; forbidden-token scans
green inside gitlab/gitea chains.

## 7. validation_command -- all four chains green, run sequentially
claude/codex/gitlab/gitea all exit 0, full walkthroughs + active-folders-field-parity
(61 assertions) passed in each.

## Findings (non-blocking, all pre-existing/out-of-scope)

finding: id=R1 scope=pre_existing action=document status=deferred severity=low fix_role=none rationale=canonical contract enumeration in plan-run.md/SKILL.md names only implementer+tdd-guide as WRITE and omits synthesizer/code-reviewer/security-reviewer; direction remains unambiguous via tool grants and plan spec; deliberately out of this bundle's scope

finding: id=R2 scope=pre_existing action=follow_up status=deferred severity=low fix_role=none rationale=workflow-planner.md knowledge-lookup bullet states the trigger twice (pre-existing duplication; the surgical sentence removal did not introduce or worsen it)

finding: id=R3 scope=out_of_scope action=follow_up status=deferred severity=low fix_role=none rationale=doc-updater.md frontmatter description still advertises /update-codemaps + docs/CODEMAPS/*; body Detection-first gate governs actual behavior so conditionalization is genuine

## Review Summary
CRITICAL 0, HIGH 0, MEDIUM 0, LOW 3 (all pre-existing/out-of-scope, deferred, no action needed)

Verdict: APPROVE -- both halves of the evidence-contract direction land correctly on all 24
surfaces, the finding-needle pinning holds, the tools drop is exact, the n3 fixes are surgical,
scope boundaries respected, all four edition chains green.

evidence-binding: n4-review ff1e8f853326
verdict: pass
findings_blocking: 0

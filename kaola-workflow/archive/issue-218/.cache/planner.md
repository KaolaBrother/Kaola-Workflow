# planner — issue-218 ideation (model: opus)

## Confirmed grounding (Phase 1 facts verified in-tree)
- Root probe `scripts/kaola-workflow-active-folders.js:56-70` correct three-way; no forge layer.
- GitLab port `kaola-gitlab-workflow-active-folders.js:51-62` + Gitea `kaola-gitea-workflow-active-folders.js:51-65`: binary `closed?:open` ternary; emit `unavailable` only on throw/timeout, never on exit-0 degraded stdout.
- Forge `viewIssue` (gitlab `:138-141`, gitea `:168-171`) = `normalizeIssue(parseJson(raw,{}))`; `parseJson` → `{}` for empty/non-JSON; `normalizeState({})` → `'unknown'`.
- `claimProject` gitlab-claim `:354/361/365` gates on `probe.state === 'unavailable'` downstream of probe → fixing the probe is sufficient.
- Validators: gitlab `:391` rejects `/\bgh\b/`; gitea `:398` rejects `/\bglab\b/` and `/\bgh\b/`. New reasons: `glab` / `tea`.
- No existing test covers degraded exit-0; only `unavailable` test is the throw case (gitlab test `:419-427`).

## Option A — fail-closed three-way inside port probeIssueState (RECOMMENDED)
Replace the binary ternary with three-way on returned state: `closed`→closed, `open`→open, **residual (everything else, incl. 'unknown')→unavailable**. Justified by Phase 1 invariant: GitLab/Gitea issues are only opened/closed, so residual is definitionally degraded. Add degraded reason string with allowed token. No forge change.
- Pros: minimal/surgical (one fn per port); zero new forge export → no parity-surface growth; conflates nothing; keying on residual catches any future unexpected state fail-closed; each port edits own tree (no root/Codex byte-sync churn).
- Cons: loses empty-vs-nonJSON reason distinction (cosmetic — guard reads only `state`; root collapses both too); does not fix classifier's parallel gap (→ follow-up).
- Risk L · Complexity S · Fit High · Blast radius: NONE (`viewIssue` untouched; `issueIsClosed` degraded→false stays, which is the safe direction).

## Option B — add viewIssueRaw + replicate root literal three-way
Pros: byte-faithful root mirror; preserves empty-vs-nonJSON reason. Cons: new public forge export in both trees → grows #211–#213 parity surface; marginal gain (guard never reads reason); re-implements parsing the forge centralizes. Risk M · Complexity M · Fit Lower.

## Option C — make viewIssue itself signal degraded (throw/sentinel)
Pros: one change fixes every caller incl. classifier. Cons: widest blast radius — `viewIssue` has multiple callers (`issueIsClosed` wants false=safe, roadmap `:256`, classifier `:157/302/352`) with divergent degraded expectations; flips `issueIsClosed` to exception path; changes classifier verdicts outside scope; violates "surgical changes." Risk H · Complexity L–XL · Fit Poor for #218 scope.

## Recommendation: Option A
Minimal, root-consistent in outcome (same `state==='unavailable'` the guard gates on), contract-safe (`glab`/`tea` reasons), parity-safe (no new symbol), conflates nothing. Fix shape: a three-way that fails closed on the RESIDUAL (not literal `'unknown'` bolted onto the ternary).

## Do not build
- No `viewIssueRaw`/new forge export (rejects B).
- No `viewIssue` contract change — no throw/sentinel (rejects C).
- Don't touch `issueIsClosed` (port `:42-49`, roadmap `:254-260`) — degraded→false is the safe direction.
- Don't fix the classifier parallel gap here (`checkDependsOn:157`, `classifyIssue:302`, `cmdClassify:352`) — track as a NAMED follow-up issue, not silent breakage. In-scope only if reviewer intends forge-wide parity.
- Don't edit root/Codex (already correct, out of scope).
- No new env/config flags.

## Test strategy
Discriminator: `withForge` (test `:28-39`) monkey-patches `forge.viewIssue` wholesale → bypasses the real `glabExec→parseJson→normalizeIssue` pipeline that MANUFACTURES the bug; a `withForge` stub only tests the mapping branch while trusting the layer #218 distrusts.
PRIMARY (proves the fix): point `KAOLA_GLAB_MOCK_SCRIPT`/`KAOLA_TEA_MOCK_SCRIPT` at a mock `.js` shim (per existing `writeShimFiles`/`glabMockEnv` `:122-128`) emitting, both EXIT 0: (1) empty stdout, (2) a non-JSON warning/progress line (case root never tested). Then call `active.probeIssueState(N)` IN-PROCESS (test file deletes `KAOLA_WORKFLOW_OFFLINE` at load `:14`, so live path runs). Assert per port `state === 'unavailable'` for BOTH empty AND non-JSON.
SUPPLEMENTARY (optional): `withForge` stub returning `{state:'unknown'}` (and another unexpected state) asserting `unavailable` — fast residual-branch coverage, framed as supplementary (skips pipeline).
REGRESSION: keep closed/open/throw green (`:410-439`).
OPTIONAL integration: `claimProject` (gitlab-claim `:354`, guard `:365`) under same mock env asserting no active folder created for degraded target.
GATE: `node scripts/simulate-workflow-walkthrough.js` exits 0; per-edition simulate walkthroughs + `test-gitlab/gitea-workflow-scripts.js` pass.

## Missing facts
1. SCOPE INTENT (only fact that could flip A→C): #218 crux scopes to claimProject guard (A fully addresses). But classifier `:157/302/352` has identical latent fail-open. If reviewer intends forge-wide fail-closed parity, A alone is incomplete → favor C or coordinated probe+classifier fix. Default reading = probe-only, classifier as follow-up → favors A. Confirm scope.
2. Whether a mock-driven in-process probe test already exists somewhere not fully enumerated (low-risk; resolve in impl).

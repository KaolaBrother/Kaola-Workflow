# Adaptive Workflow Path — Full Audit (v3.19.0)

- **Date:** 2026-06-03
- **Scope:** the adaptive workflow path shipped in `v3.19.0` (#227 Tier 1 / #228 Tier 2 / #229 note) across all four editions (Claude, Codex, GitLab, Gitea).
- **Method:** 12-dimension multi-agent audit (59 agents), each finding citing live `file:line`; every material finding adversarially verified (refute-by-default, independent re-read / re-run); completeness critic. The author of this report then independently reproduced the headline criticals by hand with controls. Baseline `npm test` is GREEN on all four lanes — that is the *static floor*, not the verdict.

---

## Verdict (TL;DR)

**Does the adaptive feature "function well and leave no gaps"? No.** The validator that *is* the auto-run authorization gate can be bypassed in at least five independent, empirically-reproduced ways, and the entire **runtime** gate-enforcement layer is unenforced prose with one critical backstop that is dead code on the adaptive path.

Two axes, kept apart:

- **Severity: critical.** These are bypasses of the mechanism that decides whether a plan may auto-run without human review.
- **Exposure: bounded.** Adaptive is opt-in and **OFF by default** (`--enable-adaptive=yes` / `enable_adaptive` / `KAOLA_ENABLE_ADAPTIVE`). Default installs are **not** exposed. The bugs bite only installs that explicitly enabled adaptive. The release is not "broken"; **the new opt-in feature has critical holes that must be fixed before anyone relies on adaptive `auto-run`.**

Confirmed counts (refuted findings excluded): **6 critical, 4 high, 8 medium, 22 low, 6 info.** All four editions are affected (verified by running the GitLab and Gitea validators on the same exploit plans).

The initialization command was **not** upgraded for adaptive, and — after verifying how path selection actually works — it **should not be**. See [Initialization analysis](#initialization-command--design-gap-analysis).

---

## Resolution (2026-06-03)

- **Tier 1 — FIXED + TESTED (all four editions).** A1, A2, A2′, B1, B2/B3 patched in `kaola-workflow-classifier.js` + `kaola-workflow-plan-validator.js` (byte-synced Claude↔Codex) and hand-ported to the GitLab/Gitea forks. Fixes: declared_write_set is now parsed structurally (`parseWriteSetCell`, capturing root-level + dot-leading paths, fail-closed on a non-empty cell that yields none); non-docs writes on a `finalize` sink count as code (G1 fires); labels are read only from the hash-covered `## Meta`; and the validator + plan_hash now use the classifier's single fence-aware section reader. Each exploit re-runs as a typed refusal; a legit docs-writing finalize still auto-runs. Behavioral regression tests added (`testAdaptiveAuditFixes` in the Claude walkthrough; gate-refusal cases in both fork walkthroughs — also closing **I1**). `npm test` GREEN on all four lanes.
- **Tier 2 — DEFERRED by decision.** The static-vs-runtime architecture call (script-enforce the barrier vs document the limitation) was deferred to a follow-up. The findings below stand as the spec for that work. Note: the Tier-1 fix materially shrinks Tier-2's blast radius — the static `auto-run` boundary is no longer fed a write-set that under-counts sensitive files.
- **Init — NO CHANGE** (correct by design; see [Initialization analysis](#initialization-command--design-gap-analysis)).

---

## Tier 1 — Validator soundness bugs (PATCH CODE)

The static validator's job is to refuse out-of-grammar / gate-bypassing plans and to classify the rest as `auto-run` or `ask`. Its `auto-run` verdict is the de-facto authorization to execute without human review. These are unambiguous defects in that gate. All reproduced first-hand with controls (commands in the [appendix](#appendix-a--reproduction)).

### A1 — `finalize` sink is a free, unreviewed write slot (CRITICAL) ✅ reproduced

Code declared on the terminal `finalize` node escapes the G1 code-review gate entirely.

- **Root cause:** `producesCode()` (`scripts/kaola-workflow-plan-validator.js:205-210`) returns `false` for `finalize` (it is in neither `IMPLEMENT_ROLES` nor `WRITE_ROLES`), so G1's target set (`:305`) never includes it; and the read-only write-set check (`:260`) explicitly exempts `n.role !== TERMINAL_ROLE`, so a `finalize` node may declare an arbitrary write set unchecked.
- **Evidence:** a plan with `finalize` declaring `src/app.js` and **no `code-reviewer` anywhere** → `{"result":"in-grammar","decision":"auto-run"}` (exit 0). The identical write moved to a `tdd-guide` node → `{"result":"refuse","errors":["G1: code-reviewer does not post-dominate code-producing node(s): n1"]}` (exit 1).
- **Fix:** include non-docs `finalize` writes in `producesCode`/`nodeIsSensitive` targeting, or forbid any non-docs/non-state write set on a `finalize` node. (Simply dropping the `:260` `TERMINAL_ROLE` guard also blocks legitimate finalize state/docs writes — prefer the targeting fix.)

### A2 — Slashless root-level paths silently dropped from every write set (CRITICAL) ✅ reproduced

One regex defeats G1, G2 **and** `FILE_CEILING` at once.

- **Root cause:** `FILE_PATH_REGEX` (`scripts/kaola-workflow-classifier.js:77`) requires at least one `/`, and `extractFilePaths` (`:104`) double-requires it (`if (filePath.includes('/'))`). Any root-level filename — `Dockerfile`, `Makefile`, `.env`, `secrets.yaml`, `credentials`, `package.json` — parses to the empty set.
- **Effect:** a `doc-updater` node writing `Dockerfile` → write set `{}` → `producesCode` false (G1 dodge), `nodeIsSensitive` false (G2 dodge), file count 0 (`FILE_CEILING` dodge).
- **Evidence:** `doc-updater` declaring `Dockerfile` → `auto-run` (exit 0). Same node declaring `docker/Dockerfile` (with a slash) → `refuse` G1 (exit 1).
- **Fix:** recognize root-level filenames in `extractFilePaths`; **and** treat a non-empty `declared_write_set` cell that parses to an empty set as a parse failure → fail-closed (refuse/ask) so silent drops can never pass.

### A2′ — Dot-leading paths *with slashes* also dropped (HIGH) ✅ reproduced — A2's fix alone does NOT close this

The first path segment in `FILE_PATH_REGEX` is `[A-Za-z0-9_-]+` (no leading dot) and the preceding-char guard `[^A-Za-z0-9_./-]` rejects a `.` before the token. So `.github/workflows/deploy.yml`, `.gitlab-ci.yml`, `.circleci/config.yml`, `.npmrc` are dropped **despite containing slashes** — exactly the CI/CD + supply-chain surface most worth gating.

- **Evidence:** `doc-updater` declaring `.github/workflows/deploy.yml` → `auto-run` (exit 0), `risk.sensitivity:false`, no G1, no G2.
- **Fix scope note:** a fix scoped to A2's wording ("accept slashless root files") leaves this hole open. The remediation must widen the first segment to admit a leading dot **and** handle root files. Same root file (`scripts/kaola-workflow-classifier.js:77`), but a materially wider patch than A2 implies. Affects the byte/port copies too (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js`, `…gitea…`).

### B1 — Decoy `labels:` line drops the G2 security gate, invisibly to the hash (CRITICAL) ✅ reproduced

`parseLabels` (`scripts/kaola-workflow-plan-validator.js:97-101`) matches the **first** `^labels:` line anywhere in the document, but `computePlanHash` (`:220-225`) covers only the `## Meta` and `## Nodes` sections.

- **Effect:** a column-0 `labels: chore` line placed **above** `## Meta` (while `## Meta` legitimately holds `labels: security`) makes the validator read the non-sensitive decoy, dropping G2 — and the decoy is outside the hashed region.
- **Evidence:** the clean plan (security label, code node, no `security-reviewer`) → `refuse` G2 (exit 1). With the decoy line → `auto-run` (exit 0). **Both produce the identical `planHash`** (`1cbf6df…`), so `--freeze` then `--resume-check` both return `ok:true` — the tamper is undetectable on resume.
- **Fix:** read labels only from the frozen section: `parseLabels(sliceSection(content, 'Meta'))`, so reader and hash agree on where labels live.

### B2 / B3 — A fenced `## ` line inside `## Nodes` hides nodes from the validator *and* the integrity hash, but not the executor (CRITICAL) ✅ reproduced

The validator's local `sliceSection` (`:132-141`) is **not** fence-aware and breaks on any `^##\s+` line; the classifier's `sectionBody` (`scripts/kaola-workflow-classifier.js:129-160`) **is** fence-aware. `computePlanHash` uses the non-fence-aware slicer. So content after a fenced `## …` line inside `## Nodes` is invisible to validation and to the hash, but visible to the executor (which reads via the classifier).

- **Evidence:** a plan with `n1, n2(finalize)`, then a fenced ` ``` / ## x / ``` ` block, then an appended `n3 = tdd-guide writing src/evil.js`:
  - `--freeze` → `auto-run` (exit 0); `--resume-check` → `ok:true` (exit 0).
  - `validator.parseNodes` returns `["n1","n2"]`; `classifier.readPlanNodes` returns `["n1","n2","n3"]`.
- **Impact:** an ungated, unreviewed code node can be appended after freeze without changing the hash; the executor dispatches it. This voids the `plan_hash` author-immutability guarantee for anything after a fenced heading in `## Nodes`.
- **Fix:** share **one** fence-aware section reader between the validator, the hash, and the classifier so they cannot diverge.

> Lower-severity validator findings (confirmed): `B4` finalize write-set exempt from G1 (same root as A1); `B6` fan-out groups keyed globally by name (same label across independent branches merges); `B7` `loop(0)` accepted; `A3` write-disjointness RED only runs on declared `fanout()` groups, not structurally-parallel ready-set siblings; `A4`/`G4`/`J6` the `cardinality` column is parsed but never validated or used.

---

## Tier 2 — Static floor vs unenforced runtime (ARCHITECTURE CALL)

The validator enforces a **static floor** at freeze time (gate *presence* via post-dominance, grammar, caps, declared-set disjointness). Whether the gates actually **execute** at runtime over the authored topology is **agent-discipline prose** in the executor skill — not script-enforced. `npm test` GREEN proves the contract validators + walkthrough pass; it says nothing about runtime barrier behavior. This split is partly the design's **stated** residual — *except* H5, which pushes it past "known limitation."

| ID | Behavior | Enforcement | Risk |
|----|----------|-------------|------|
| G1 | A post-dominating `code-reviewer`/`security-reviewer` node can be marked `n/a` at runtime; phase6 re-checks only hash/structure, not gate execution (`commands/kaola-workflow-plan-run.md:141`, `commands/kaola-workflow-phase6.md:21-32`) | prose only | review silently skipped |
| H1 | Runtime sensitivity re-scan of files *actually written* → forced `security-reviewer` escalation (`commands/kaola-workflow-plan-run.md:133-138`) | **prose only, zero script, no backstop** | sensitive/auth code merges with no security review — defeats G2 |
| H3 | Post-run diff of actual writes vs declared allowlist / disjointness (`…plan-run.md:138-140`) | prose only | clobber + containment bypass on the shared worktree |
| H5 | `delegationPolicyCompliance` — the **only** script-backed gate-row cross-check — is **unreachable** on adaptive | **dead code on adaptive** | even G1 *execution* has no script backstop |

**H5 (HIGH) confirmed first-hand:** `routeAdaptive` (`scripts/kaola-workflow-repair-state.js:505-538`) hardcodes `pendingGates: []` (`:536`) and never calls `unresolvedCompliance`/`delegationPolicyCompliance` (those run only in the non-adaptive route at `:424`). So "ledger row = complete" is a status string the agent writes; no script verifies a `code-reviewer`/`security-reviewer` node was dispatched and passed before phase6 merges.

**H1 is the single most dangerous prose-only behavior:** the validator deliberately ships a weak static G2 and delegates the strong signal (re-scan actual writes) to prose. A frozen `labels: refactor` plan with a node declaring `src/utils/foo.js` auto-runs with no `security-reviewer`; if the implementation also writes `src/auth/session.js`, nothing script-enforced ever notices. The agent must voluntarily revoke an authorization it already holds — the least natural action, the highest silent-skip probability.

> Note: G1/H1/H3 are about executor *behavior* and are established by **absence of enforcement** (grep `scripts/` and `sink-*.js` shows no writes-diff / re-scan / gate-execution script — only prose), not by "running" them. H5 is the exception that is code-checkable, which is why it is confirmed directly. Related prose-only mechanisms with no implementation: quorum tally, `validateNodeOutput`, `loop-until-dry`/`dry_streak` convergence, consent-halt marker write (`H4`, `H6`, `G3`).

**The compounding risk (most important single line in this report):** because no runtime script enforces the barrier, the validator's **static `auto-run` verdict is effectively the entire enforceable authorization boundary** — and that boundary is computed over `extractFilePaths`, which silently under-counts the most sensitive files (A2 / A2′). The one layer that *is* script-enforced is fed a blind input.

**Decision required:** is "gate *presence* is plan-checked; gate *execution* is agent discipline" an acceptable, clearly-documented limitation, or does the barrier need real script enforcement? The minimal script backstop that closes H1 **and** H3 together: a `--barrier-check {node-id}` (or sink-side gate-verify) that runs `git diff --name-only` for the node's actual writes, re-applies `SENSITIVE_PATTERNS`/`areaForPath` to real paths, and refuses completion/merge on a sensitivity hit or out-of-allowlist write unless the required reviewer post-dominates.

---

## Other findings (selected)

- **I1 (HIGH):** GitLab/Gitea adaptive **gate-refusal** behavior is exercised by **no test**; it rests entirely on a ~526-line manual classifier port matching root semantics, which nothing asserts. A future fork edit could route code/sensitive nodes around the gates undetected. (Confirmed: the forks reproduce A1/A2/B1 today — see edition coverage.)
- **I2–I7 (MEDIUM/LOW):** the four contract validators assert only existence + substring-"concept" presence for adaptive — **zero behavioral coverage** of the validator. No test exercises: G1/G2 leak refusal, RED disjointness, `FANOUT_CAP`/`FILE_CEILING` overflow, `LOOP_CAP` boundary, sensitivity→`ask`, multiple-sink/unknown-role/cycle/dangling refusals, the toggle resolution layer, or `--resume-check` via CLI.
- **Docs (LOW):** `api.md` documents a `--json` refusal shape that omits `sink`/`planHash` on 2 of 3 paths (`J1`); calls validator modes "mutually exclusive" though the CLI silently prioritizes (`J3`); `architecture.md`/CHANGELOG describe G1 as gating an "implement node" — stale vs the shipped code-producing gate (`J2`).
- **Usability (MEDIUM/LOW):** no complete copyable example `workflow-plan.md` anywhere user-facing — the first plan must be reverse-engineered against the validator (`K1`); the `## Nodes` grammar, `LOOP_CAP=5`, `FILE_CEILING=6` are absent from the authoring command (`K3`,`K4`); `cardinality` is a mandatory author column with no documented semantics that the validator ignores (`G4`); "nine vs ten canonical roles" inconsistency across surfaces (`K5`).
- **Toggle (LOW):** README says `--enable-adaptive=no … stays off` but `=no` never **revokes** a prior `true` (`D7`); `/kaola-workflow-adapt` authoring entry is gated only by command prose, not a hard script guard (`D8`).
- **Governance edges (MEDIUM/INFO):** the same path-extraction hole blinds cross-project claim-overlap detection (`scanClaimedOverlap`) — two concurrent projects editing the same CI/secrets/root file do not collide-detect on the shared worktree (silent clobber); `routeAdaptive` skips re-validation when the `plan_hash` comment is **deleted** (not just mismatched), relying on the `--resume-check` prose as the only backstop (`scripts/kaola-workflow-repair-state.js:510-518`, confirmed); flipping the toggle OFF does not halt an already-frozen in-flight plan (correct-by-design, but means there is no kill-switch for the criticals once a plan is frozen); the validator has no input-size guard / unbounded recursive DFS (low under the author-trust model, but a crash is not a typed refusal).

---

## Initialization command — design-gap analysis

**Your two questions, answered.**

1. **Was init upgraded for adaptive?** No. `grep` across all four init surfaces — `commands/workflow-init.md`, `plugins/kaola-workflow-gitlab/commands/workflow-init.md`, `plugins/kaola-workflow-gitea/commands/workflow-init.md`, `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md` — finds **no** mention of adaptive, `--enable-adaptive`, `enable_adaptive`, `KAOLA_ENABLE_ADAPTIVE`, `/kaola-workflow-adapt`, `/kaola-workflow-plan-run`, three-way selection, or `adversarial-verifier`. Init also never reads config or env.

2. **Should it be upgraded? Recommendation: NO — not even conditionally.** The reasoning rests on a fact verified this session:
   - **Path *selection* is the router's job, not init's.** `commands/workflow-next.md` Step 0a-1 ("Path Intent", `:80-130`) reads the switch at runtime — *"If the switch is OFF, `adaptive` is removed from the menu entirely … `adaptive` can never fire when the switch is off."* Init's CLAUDE.md template describes full-path **phase mechanics** (Phase 1→`code-explorer`, Phase 4→`tdd-guide`) but **advertises no path choice** (it names neither fast nor full nor adaptive as a selectable path) — it just says *"Use `/workflow-next` as the workflow entrypoint and router."*
   - **There is no visibility gap to close.** On an adaptive-ON install, the feature is reachable at the correct layer — `CLAUDE.md` → `/workflow-next` → Step 0a-1 switch read — regardless of what init writes. Omitting adaptive from init is **consistent** with how every path is handled; **adding** it would be the anomaly.
   - **A conditional emit would be actively worse:** it would make init read `config.json`/env (nothing else in init does), create an OFF-default **leakage surface** in a durable file (a buggy gate could bake adaptive mechanics into a project's `CLAUDE.md`), and break the clean symmetry where all four routers gate adaptive at runtime and all four inits stay uniform.

   **Optional, not recommended now:** if path *discoverability* in `CLAUDE.md` is ever wanted, the only OFF-safe move is a single **static** one-liner under the Kaola-Workflow template pointing at `/workflow-next` for path selection across **all** paths (fast/full/adaptive) with **no** config read. That is a documentation nicety touching five surfaces for marginal value — defer it.

---

## Edition coverage

- **Claude ≡ Codex** by byte-sync (`validate-script-sync.js`): the Tier-1 bugs (A1, A2, A2′, B1, B2/B3) live in the shared `scripts/` and are identical in both.
- **GitLab + Gitea** (manual ports): the forks **reproduce A1, A2, and B1** (`in-grammar/auto-run`) when run directly on the exploit plans — so all four editions are affected. Their gate logic is otherwise untested (I1).
- **Default installs are unaffected** — adaptive is OFF unless explicitly enabled.

---

## Recommended remediation (held for sign-off — no fixes applied)

**P0 — Tier 1 validator/classifier patches (byte-synced Claude/Codex + manual fork port):**
1. **A2 + A2′** — fix `extractFilePaths`/`FILE_PATH_REGEX` to capture root-level files and dot-leading paths; **and** fail-closed when a non-empty `declared_write_set` cell parses to empty. *(Highest leverage: this is the input to the only enforced layer.)*
2. **A1 / B4** — target `finalize` non-docs writes in G1/G2 (or forbid them).
3. **B1** — slice labels from `## Meta` only.
4. **B2 / B3** — share one fence-aware section reader across validator, hash, and classifier.
5. Add **behavioral** regression tests for each of the above (refusal/ask assertions, not substring presence) to all four contract suites; add the gate-refusal cases to the fork walkthroughs (closes I1, I2).

**P1 — Tier 2 architecture decision (needs your call):** decide whether the barrier becomes script-enforced. If yes, implement `--barrier-check` (closes H1 + H3) and wire `delegationPolicyCompliance`/a sink-side gate-verify into `routeAdaptive` + phase6's adaptive branch (closes H5); else, **explicitly document** the static/runtime split as a known limitation in `architecture.md` and the executor skill, and remove the misleading `plan-run.md:145` claim that the matcher guards adaptive.

**P2 — docs/usability polish:** publish a complete example `workflow-plan.md` + the `## Nodes` grammar and caps in the authoring command; fix the `api.md`/`architecture.md` drift; resolve the nine-vs-ten role count; decide `=no` revoke semantics (D7).

---

## Appendix A — Reproduction

All run against `scripts/kaola-workflow-plan-validator.js` this session; full plan files under `/tmp/advrepro/`.

| Case | Plan | Verdict | Expected |
|------|------|---------|----------|
| A1 | `finalize` writes `src/app.js`, no `code-reviewer` | `in-grammar/auto-run` (0) | refuse |
| A1 control | same write on `tdd-guide` | `refuse` G1 (1) | refuse ✓ |
| A2 | `doc-updater` writes `Dockerfile` | `in-grammar/auto-run` (0) | refuse/ask |
| A2 control | `doc-updater` writes `docker/Dockerfile` | `refuse` G1 (1) | refuse ✓ |
| A2′ | `doc-updater` writes `.github/workflows/deploy.yml` | `in-grammar/auto-run` (0) | refuse/ask |
| B1 clean | `labels: security`, code node, no `security-reviewer` | `refuse` G2 (1) | refuse ✓ |
| B1 decoy | decoy `labels: chore` above `## Meta` | `auto-run` (0), **same planHash**; `--resume-check` `ok:true` | refuse |
| B3 | fenced `## x` then appended `n3=tdd-guide src/evil.js` | `--freeze` `auto-run`, `--resume-check` `ok:true`; validator sees `[n1,n2]`, classifier sees `[n1,n2,n3]` | refuse |

## Appendix B — Method & confidence

- 12 dimensions × adversarial verification: 83 findings total, **0 refuted**, 16 downgraded to `partial` (verifiers did push back on scope/severity). The five Tier-1 criticals and H5 were re-verified by the report author independently (commands above); G1/H1/H3 are established by absence-of-enforcement.
- The full machine-readable findings set (all 83, with per-finding verdicts and `file:line`) was produced by the audit workflow; this report captures the load-bearing subset. Completeness-critic confidence that the answer to "no gaps" is **No**: high.

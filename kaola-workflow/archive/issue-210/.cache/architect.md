## Architecture: Issue #210 — Codex Kaola-Workflow defaults to delegated compliance (no startup prompt)

### Design Decisions
- **Prose-only behavior change, zero code paths touched.** Default-delegate is encoded in SKILL.md prose; `delegationPolicyCompliance` in the 3 repair-state modules is unchanged. Rationale: the enforcement semantics ("delegate requires subagent-invoked unless every role row is evidenced local-fallback-tool-unavailable") already support the new default — only the *startup ritual* (ask vs. auto-establish) changes, which lives entirely in prose. Confirmed: no validator/test asserts the OLD prose strings (`ask the user once at startup`, `User-authorized delegation mode`, `At startup, Codex workflows ask...`), so removing them breaks nothing.
- **Canonical block is byte-identical across all 3 forge next-SKILLs.** Verified `diff` of L27-55 across github/gitlab/gitea = IDENTICAL, and resume clause (github L224-225, gitlab/gitea L236-237) = IDENTICAL. One canonical old_string/new_string pair drives all 3 skill edits.
- **No version bump.** Ship at codex 1.8.2 (README L406-408 already shows 1.8.2). Do not touch package.json (3.17.2) or README version rows L403-408. `test-release-surface-drift.js` (claude suite) passes because no surface version moves.
- **Validator additions are split into two insertion sites per file (TDZ-safe).** The sentinel `assertIncludes`/`assertNotIncludes` go in the next-skill sentinel cluster (top of file, only hoisted helpers needed). The two #210 policy tests go AFTER the `*RepairState = require(...)` const, appended to the existing policy-test cluster. Rationale below (CRITICAL gap #1).
- **`validate-kaola-workflow-contracts.js` (codex/github validator) has NO sync twin.** `validate-script-sync.js` comment block explicitly excludes it as "Codex-only"; the Claude validator is the separate `validate-workflow-contracts.js`. So editing the codex validator requires NO `plugins/kaola-workflow/scripts/` mirror edit and does not trip script-sync.
- **Anchor every edit on verbatim `old_string`, never post-edit line numbers.** The new contract block is shorter (2 write-order steps vs 3), so all content below shifts up ~9 lines after the block edit — including the resume clause. Confirmed line numbers are reference-only; executable anchors are the unique verbatim strings.

### Files to Modify
| File | Changes | Priority |
|------|---------|----------|
| scripts/validate-kaola-workflow-contracts.js | (T1) sentinel block @~L89; (T7) 2 policy tests appended after L221 | P1 (sentinels), P3 (policy) |
| plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js | (T2) sentinel block @~L256 (after `gitlabNextSkill` L249); (T8) 2 policy tests appended after L325 | P1 / P3 |
| plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | (T3) sentinel block @~L263 (after `giteaNextSkill` L256); (T9) 2 policy tests appended after L332 | P1 / P3 |
| plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md | (T4) replace Delegation Contract block (L27-55) + resume line-2 (L225) | P2 |
| plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md | (T5) same block (L27-55) + resume line-2 (L237) | P2 |
| plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md | (T6) same block (L27-55) + resume line-2 (L237) | P2 |
| README.md | (T10) rewrite L373-378 paragraph to default-delegate framing; DO NOT touch L403-408 | P4 |
| docs/workflow-state-contract.md | (T11) reframe `delegation_policy:` field L39-42; PRESERVE L44-47 + L49-56 verbatim | P4 |
| CHANGELOG.md | (T12) add bullet under `## [Unreleased]` (L3); no version heading | P4 |

Files to Create: **none.**

### Per-file write set (task list)

**T1 — github validator sentinels** (MODIFY `scripts/validate-kaola-workflow-contracts.js`)
- Action: insert after L89 (`assertIncludes(... 'extract and reassign \`delegation_policy:\`...')`), still ABOVE the `repairState` require at L167. Use hoisted `assertIncludes`/`assertNotIncludes` + `pluginRoot`.
- Insert:
  - `assertNotIncludes(next, 'Ask the user once at startup')`
  - `assertNotIncludes(next, 'How should delegation be handled')`
  - `assertIncludes(next, 'Codex subagent delegation is the default.')`
  - ``assertIncludes(next, 'The default `delegation_policy` is `delegate`')``
  - `assertIncludes(next, '.codex/agents/kaola-workflow/')`
  - ``assertIncludes(next, 'record `local-fallback-tool-unavailable` with a non-empty Evidence value')``
  - `assertIncludes(next, 'only when the user explicitly')`
  - ``assertIncludes(next, 'default `delegation_policy` to `delegate` without prompting')``
  - (where `next = \`${pluginRoot}/skills/kaola-workflow-next/SKILL.md\``)
- depends-on: none. parallel group: **G1**.
- validate: `node scripts/validate-kaola-workflow-contracts.js` → expect RED (4 includes fail) until T4 lands.

**T2 — gitlab validator sentinels** (MODIFY gitlab validator)
- Action: insert after `gitlabNextSkill` decl (~L249), ABOVE `gitlabRepairState` require (L271). Idiom: `assertIncludes(gitlabNextSkill, ...)` / `assertNotIncludes(gitlabNextSkill, ...)`. Same 2 NOT + 6 includes sentinels as T1.
- depends-on: none. parallel group: **G1**.
- validate: `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` → RED until T5.

**T3 — gitea validator sentinels** (MODIFY gitea validator)
- Action: insert after `giteaNextSkill` decl (~L256), ABOVE `giteaRepairState` require (L278). Idiom: `assertIncludes(giteaNextSkill, ...)`. Same 8 sentinels.
- depends-on: none. parallel group: **G1**.
- validate: `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` → RED until T6.

**T4 — github next-SKILL prose** (MODIFY github next-SKILL)
- Action A: replace block L27-55 (old_string starts `## Delegation Contract\n\nBefore proceeding with any phase work,...` through `...unless the user explicitly changes policy or \`workflow-state.md\` is absent.`) with the LOCKED canonical block.
- Action B: replace resume line-2 old_string `if it is absent, return to the Delegation Contract before phase work continues.` with `if it is absent, default \`delegation_policy\` to \`delegate\` without prompting and continue.` (PRESERVE line-1 verbatim — it is the anchor for validator L89.)
- depends-on: T1 (RED first). parallel group: **G2**.
- validate: `node scripts/validate-kaola-workflow-contracts.js` → GREEN.

**T5 — gitlab next-SKILL prose** (MODIFY gitlab next-SKILL)
- Same two edits as T4 (block L27-55 byte-identical; resume line-2 at L237). depends-on: T2. parallel group: **G2**.
- validate: gitlab validator → GREEN.

**T6 — gitea next-SKILL prose** (MODIFY gitea next-SKILL)
- Same two edits as T4 (block L27-55; resume line-2 at L237). depends-on: T3. parallel group: **G2**.
- validate: gitea validator → GREEN.

**T7 — github #210 policy tests** (MODIFY github validator)
- Action: append after the existing policy-test cluster (after L221, the `assertPolicyBlocked('tool-unavailable',...)`), i.e. BELOW `repairState` require L167 and `assertPolicyAllowed` def L188. Add:
  - `assertPolicyAllowed('delegate', [['code-explorer','local-fallback-tool-unavailable','.codex/agents/kaola-workflow/ absent','']], 'issue #210 default-delegate: all role rows evidenced tool-unavailable under delegate')`
  - `assertPolicyAllowed('local-authorized', [['code-explorer','local-fallback-explicit','user disabled delegation','']], 'issue #210 explicit local-authorized on user request')`
- depends-on: none (passes on arrival — tests unchanged compliance fn). parallel group: **G3**. MUST NOT be placed at L89.
- validate: github validator → GREEN (these pass immediately).

**T8 — gitlab #210 policy tests** (MODIFY gitlab validator)
- Append after L325 (`assertPolicyBlocked('tool-unavailable',...)`), below `gitlabRepairState` require L271. Same 2 calls, label idiom "issue #210 ...". parallel group: **G3**.

**T9 — gitea #210 policy tests** (MODIFY gitea validator)
- Append after L332, below `giteaRepairState` require L278. Same 2 calls. parallel group: **G3**.

**T10 — README** (MODIFY README.md)
- Replace ONLY the paragraph L373-378 (old_string `At startup, Codex workflows ask the user to authorize\na delegation policy ... under explicit\nuser authorization.`) with default-delegate framing: default `delegate` established without prompting; tool-unavailability auto-detected and recorded as per-row `local-fallback-tool-unavailable` evidence under `delegate`; `local-authorized` only on explicit user request. Keep enum names accurate. DO NOT touch L371-372 lead-in beyond the sentence boundary, and DO NOT touch L403-408 version rows.
- depends-on: none. parallel group: **G4**. validate: covered by final `npm test` (no dedicated assertion).

**T11 — workflow-state-contract.md** (MODIFY docs/workflow-state-contract.md)
- Reframe L39 (and sub-bullets L40-42) from `delegation_policy: — User-authorized delegation mode for Codex workflows:` to default-delegate: default `delegate` established without prompting; tool-unavailable auto-detected as per-row evidence under `delegate`; `local-authorized` only on explicit user request. PRESERVE L44-47 (4-token vocab paragraph) and L49-56 (enforcement paragraph) BYTE-VERBATIM. Editable span is L39-42 only.
- depends-on: none. parallel group: **G4**.

**T12 — CHANGELOG** (MODIFY CHANGELOG.md)
- Insert one bullet under `## [Unreleased]` (L3), before `## [3.17.2]` (L5). No version heading, no bump. Mention issue #210, default-delegate, all 3 Codex forge next-SKILLs + 3 validators + 2 docs, ship at codex 1.8.2.
- depends-on: none. parallel group: **G4**.

### Build Sequence (TDD RED -> GREEN; note: sentinels are validators-FIRST)
1. **G1 — validator sentinels (T1,T2,T3) in parallel.** Run the 3 codex/gitlab/gitea validators -> RED (new `assertIncludes` fail on each; `assertNotIncludes` pass because old strings still present). This is the intended RED: the binding intent is the parenthetical "assertNotIncludes go RED first / new assertIncludes RED until prose lands", which means the assertion is added BEFORE the prose. (The task's lead phrase "prose-first" is superseded by its own parenthetical.)
2. **G2 — skill prose (T4,T5,T6) in parallel.** Apply canonical block + resume line-2 to all 3 next-SKILLs. Re-run the 3 validators -> GREEN. (`assertNotIncludes` still pass: old prose removed; `assertIncludes` now satisfied.)
3. **G3 — policy regression locks (T7,T8,T9) in parallel.** Append the two #210 `assertPolicyAllowed` calls below each `*RepairState` require. They PASS on arrival (compliance fn unchanged) — additive regression locks, not RED/GREEN.
4. **G4 — docs (T10,T11,T12) in parallel.** README + contract + CHANGELOG. No test gate; verified only by final full `npm test` running clean and the whitelist.
5. **Final gate** (below).

### Parallelization groups (disjoint write sets)
- **G1** {T1, T2, T3} — three different validator files, top-of-file region. Disjoint.
- **G2** {T4, T5, T6} — three different SKILL.md files. Disjoint. (G2 depends on G1 per-forge for the RED demonstration but the writes are independent.)
- **G3** {T7, T8, T9} — same three validator files as G1 but a DIFFERENT region (bottom policy cluster). To avoid two concurrent edits to one validator file, run G1 then G3 sequentially per file, OR (recommended) fold each forge's T7/T8/T9 into the SAME edit pass as its T1/T2/T3 (two non-overlapping insertions in one file). They never touch the same lines, so a single executor pass per validator file is safe and cleaner than two passes.
- **G4** {T10, T11, T12} — three unrelated doc files. Fully independent of G1-G3; can run anytime.

### Validation commands
- Per validator: `node scripts/validate-kaola-workflow-contracts.js` ; `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` ; `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`
- **Final gate:**
  - `npm test` -> all 4 suites (claude, codex, gitlab, gitea) exit 0. Codex suite runs `validate-script-sync.js` (must stay green — proves no mirror drift introduced) + `validate-kaola-workflow-contracts.js`. Claude suite runs `test-release-surface-drift.js` (must stay green — proves no version moved).
  - Whitelist: `git diff --name-only main` -> EXACTLY these 9, nothing else:
    ```
    CHANGELOG.md
    README.md
    docs/workflow-state-contract.md
    plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
    plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
    plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
    plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
    plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
    scripts/validate-kaola-workflow-contracts.js
    ```
  - Complement assertion (do-not-touch set unmoved): confirm NONE of package.json, any commands/, scripts/validate-workflow-contracts.js, scripts/simulate-workflow-walkthrough.js, scripts/kaola-workflow-fast-audit.js, scripts/test-fast-audit.js, *kaola-workflow-repair-state.js, *release-surface-drift.js, *validate-script-sync.js, and NO `plugins/kaola-workflow/scripts/` file appears in the diff.

### Gap check (primary-source verified)
- **(a) sentinels** — VERIFIED by simulating the post-edit prose (canonical block + new resume line-2) in node: all 6 includes-sentinels PRESENT, both not-includes-sentinels ABSENT. PASS.
- **(b) preserved per-forge tokens** — github next-SKILL: all 3 status tokens (`subagent-invoked`, `local-fallback-explicit`, `local-fallback-tool-unavailable`) currently appear ONLY inside the replaced block (L37/L38/L39) and ALL 3 are re-present in the canonical block; validator loop L155-157 (github) / L240-242 (gitlab) / L247-249 (gitea) asserts all 3 in the next-SKILL — stays GREEN. The gitlab/gitea `gitlabDelegationSkills`/`giteaDelegationSkills` loops assert `subagent-invoked` per skill — canonical block contains it. PASS.
- **(c) no retired token** — VERIFIED: none of the 14 `retired` tokens (`.locks`,`.sessions`,`.tickers`,`heartbeat`,`ticker`,`derive-session`,`verify-startup`,`can-handoff`,`handoff`,`startup receipt`,`session_id`,`last_heartbeat`,`## Lease`,`KAOLA_SESSION_ID`) appears in the new prose (github validator loops `retired` over all skills at L83/L251/L270; gitlab/gitea equivalents). PASS.
- **(d) printf patch + KAOLA_DELEGATION_POLICY enum survive** — VERIFIED present in canonical block: the ```bash printf '\ndelegation_policy: %s\n' "$KAOLA_DELEGATION_POLICY"...``` patch and the `KAOLA_DELEGATION_POLICY defaults to delegate ... local-authorized` enum sentence, plus the legacy `tool-unavailable remains a valid delegation_policy: value`. PASS.
- **(e) files missed / assertions that would break:**
  - **CRITICAL (TDZ) — placement, not a missed file.** The two #210 policy tests call `assertPolicyAllowed`, whose body dereferences the `const` `repairState`/`gitlabRepairState`/`giteaRepairState` initialized at L167 / L271 / L278. Placing the policy tests at the sentinel site (~L89 github) executes them top-down BEFORE that `const` -> `ReferenceError: Cannot access 'repairState' before initialization` (the validator CRASHES, not fails-clean). Mitigation baked into T7/T8/T9: append the policy tests to the existing policy-test cluster (after L221 / L325 / L332), below the require. Sentinel assertions (T1-T3) are safe at L89 because they use only hoisted helpers + a string path.
  - **No file missed.** Cross-checked: no `.js` asserts the OLD README/contract prose (`At startup, Codex workflows`, `User-authorized delegation mode`, `Ask the user once at startup`) -> doc reframes break nothing. `validate-script-sync.js` excludes the codex validator by name (comment block) and does not compare SKILL.md prose -> no mirror twin edit, no script-sync break. `test-release-surface-drift.js` keys on versions, which are untouched.
  - **Anchor hazard (advisory):** the canonical block is shorter than the original (2 write-order steps vs 3), so every line below it (incl. the resume clause) shifts UP ~9 lines after Action A. Executor MUST anchor Action B (resume line-2) on its verbatim `old_string`, not on L225/L237. Both target strings are unique within each file (confirmed).
  - **Baseline GREEN confirmed** before any edit (`npm test` exit 0, all 4 suites), so any RED during G1 is attributable to the new sentinels, and final GREEN is a true GREEN.

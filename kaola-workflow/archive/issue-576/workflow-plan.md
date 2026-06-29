# Workflow Plan — issue-576

<!-- plan_hash: 2a389b204ea4f3cc77defd7181cc4c86dcd77e81d49bbc3f05f6412c00552f8f -->

## Meta
labels: documentation, enhancement, area:scripts
validation_command: KAOLA_RUN_CHAINS_CONCURRENCY=serial npm test

## Plan Notes

**Goal (#576).** Machine-enforce the "keep provenance out of agent-facing prompts" convention that
#575 established as prose-only. Two coupled halves: **(A) clean the stragglers** the manual #575
strip missed (bare `INV-17` ×4 + example issue numbers `#42`/`#47`/`#53` + `#142`), and **(B) add a
`PROVENANCE_BAN` regression guard** to the contract validators + the opencode suite so re-introduced
provenance fails a chain instead of shipping silently. This is the deferred guard from D-575-01 (existing).

**Authoring-time grep-oracle (full ban pattern, re-run against the live tree — NOT trusting the
issue's inventory).** Pattern `#[0-9]{1,4}|D-[0-9]{3}-[0-9]{2}|\bINV-[0-9]+|ADR[ -][0-9]{2,4}|\b(PR|MR|AC)#[0-9]+`
across the COMPLETE prompt-surface set (`agents/*.md`, `plugins/*/agents/*.toml`, `commands/*.md`,
the two forge `commands/*.md`, all `plugins/*/skills/*/SKILL.md`) returns **exactly 16 lines in 13
files — and nothing else**:
- **INV-17 (bare), 4 files:** `agents/workflow-planner.md:209`, `plugins/kaola-workflow/agents/workflow-planner.toml:22`,
  `plugins/kaola-workflow-gitlab/agents/workflow-planner.toml:22`, `plugins/kaola-workflow-gitea/agents/workflow-planner.toml:22`.
- **`#42`/`#47`/`#53`, 6 files (workflow-next surface):** `commands/workflow-next.md` (lines 70 +
  113), the two forge `commands/workflow-next.md` (lines 70 + 113), and the three
  `skills/kaola-workflow-next/SKILL.md` (line 111).
- **`#142`, 3 files (adapt skill):** the three `skills/kaola-workflow-adapt/SKILL.md:80`
  (`# Workflow Plan — issue #142`).

This CONFIRMS the issue's inventory is complete: there are **no hidden stragglers** and — crucially —
**no false-positive collateral** (zero other `#\d`/`INV-\d`/`ADR \d`/`D-\d{3}-\d{2}`/`(PR|MR|AC)#\d`
in any prompt surface), so after the 13-file strip the guard's live scan over every prompt surface
matches ZERO. The grey-zone audit/gate labels (`G1`/`G3`/`H5`/`AC7`/`M4`) carry NO `#`, no
`INV-`/`ADR `/`D-NNN` prefix, so the banlist regex never matches them — they are out of scope and must
stay (issue Non-goals). This is the precise hazard D-575-01 (existing) deferred the guard over (a mis-scoped
regex destabilizing the four chains); the oracle above proves the issue's regex has no live collateral.

**Why strip + guard are ONE node (barrier-coupling, the #572 precedent).** The `PROVENANCE_BAN`
live-tree scan REDs against the current stragglers and GREENs only after they are stripped — the guard
IS the failing test for the strip (a genuine `tdd-guide` cycle: write the ban → RED on `INV-17`/`#42`/
`#142` → strip → GREEN). They cannot be split across nodes: if the guard lived in a separate node from
the strip and its scan red on a missed straggler, that node could NOT fix the offending prompt surface
(it is outside that node's frozen write set) → mid-run stall. So the node that adds the guard must also
OWN every prompt surface the guard scans-and-reds-on. Enforcement + the surfaces it enforces = one
node (exactly the #572 phase-ban shape).

**The guard (Part B) — surface set, regex, per-edition placement.**
- **Banlist (issue taxonomy, EXACT):** `/#\d{1,4}|D-\d{3}-\d{2}|\bINV-\d+|ADR[ -]\d{2,4}|\b(?:PR|MR|AC)#\d+/`.
  Bans external-pointer provenance incl. **bare `INV-NN`** (the #575 miss) and **`ADR `-space form** (the
  other #575 miss). Allows placeholders (`#N`/`#<issue>`/`#<n>`), runtime vars (`KAOLA_TARGET_ISSUE=N`,
  `--target-issue <N>`, `Closes #<issue>`) — none contain `#\d` — and the grey-zone labels.
- **Each edition's validator scans ITS OWN edition's surfaces** (the hand-ported validators are
  structurally different; get each glob right — this per-edition completeness is what the
  adversarial-verifier independently re-derives):
  - `scripts/validate-workflow-contracts.js` (CLAUDE chain) → claude surfaces `agents/*.md` +
    `commands/*.md`. Its byte-identical codex copy `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`
    is a **#274 COMMON_SCRIPTS pair** — both move in THIS node, byte-for-byte (sync-group co-occurrence;
    the codex copy is not separately run but `validate-script-sync.js` byte-checks it).
  - `scripts/validate-kaola-workflow-contracts.js` (CODEX chain, already hosts `PHASE_NUMBER_BAN` ~line
    498 — mirror that loop shape) → codex surfaces `plugins/kaola-workflow/agents/*.toml` +
    `plugins/kaola-workflow/skills/*/SKILL.md`.
  - `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` (GITLAB chain) →
    gitlab surfaces `agents/*.toml` + `commands/*.md` + `skills/*/SKILL.md`.
  - `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` (GITEA chain) →
    gitea surfaces (same shape).
  - `scripts/test-opencode-edition.js` (opencode suite, additive, D-530-02 (existing)) → the regenerated opencode
    `.opencode/agent` + `.opencode/command` mirrors (mirror the #572 A24 phase-ban+parity placement).
- **Failure message** names `file:line` + the offending token + points at `docs/conventions.md`.
- **Positive/negative behavior coverage (AC3):** the guard must demonstrably FAIL on a re-introduced
  `#123`/`D-100-01`/`INV-9`/`ADR 0005` and PASS on the allowed placeholder/runtime forms AND not flag
  `G1`/`AC7`/`M4`. Put these assertions in an ALREADY-DECLARED file — `scripts/test-opencode-edition.js`
  is the natural home (it is in this node's write set and is a test surface). Do NOT add a NEW test file:
  that would require a `package.json` chain-wiring edit (not in the write set) → barrier stall. The five
  contract validators are already wired into the four chains, so the live-tree guard needs no
  `package.json` change.

**The strip (Part A) — shared canonical spec (#309, mirror identically across editions).**
- **INV-17 → "validator-derived":** reword `…eligibility stays validator/runtime-derived (the same
  INV-17 discipline as `parallel_safe` above)` → `…(the same validator-derived discipline as
  `parallel_safe` above)`. Apply IDENTICALLY to `agents/workflow-planner.md` AND the three
  `workflow-planner.toml` editions. The three toml are **byte-identical (agent-profile toml triple,
  #422.1)** so the reword must keep them byte-identical (sync-group co-occurrence — all three in this
  node); the claude `.md` must stay md↔toml-parity-clean (`test-agent-profile-parity.js`) — `parallel_safe`
  is preserved, so no FEATURE_TOKEN is touched. Meaning is preserved (the `parallel_safe above`
  cross-reference already carries it).
- **Example numbers → placeholders:** `commands/workflow-next.md` line 70 `…"work on #42"` → `…"work on
  #N"`; line 113 `…"finish issues #42 #47 #53…"` → `…"finish issues #N #N #N…"` (or `#<N>`); apply the
  same to the two forge `commands/workflow-next.md` and the line-111 occurrence in the three
  `skills/kaola-workflow-next/SKILL.md`. `# Workflow Plan — issue #142` → `# Workflow Plan — issue #<N>`
  in the three `skills/kaola-workflow-adapt/SKILL.md`. Genericize symmetrically across all editions so
  the cross-forge surfaces stay symmetric and NO concrete `#\d` survives.
- Preserve every functional token, route-wiring string, env var, and the byte-mirror parity; strip only
  provenance. Forge plugin prose stays forge-neutral (no `gh`/`glab`/`tea` CLI, no brand noun) — these
  are number-only edits, so no forge-namespace risk.

**opencode (gitignored — NOT in the write set).** `.opencode/` is fully gitignored (0 tracked files),
generated from canonical `agents/*.md` + `commands/*.md` by `sync-opencode-edition.js`. The strip cleans
the canonical sources; `test-opencode-edition.js` regenerates the opencode edition internally and runs
the new `PROVENANCE_BAN` scan over the regenerated mirrors — so "opencode regenerated from canonical"
(AC) is satisfied with NO committed `.opencode/*` file in any write set (the #572 approach; #575
declared them but they produce no tracked diff). Skills are NOT mirrored to opencode (only agents +
commands), so the skill/toml strips need no opencode entry.

**Accuracy gates (precedence #1 — this is the precedence-#1 hazard D-575-01 (existing) named).**
- **n3 adversarial-verifier (opus, read-only) — independent grep-ORACLE.** Re-derives the match set
  from scratch: (1) scan ALL prompt surfaces with the committed banlist and confirm ZERO matches
  (completeness of the strip); (2) confirm each edition's validator globs its COMPLETE surface set (the
  enforcement-HOLE the four chains cannot catch — absence of error ≠ presence of coverage); (3) confirm
  the regex bans the full taxonomy (bare `INV-NN`, `ADR `-space) and does NOT flag `G1`/`AC7`/`M4`/
  placeholders/runtime-vars; (4) confirm the `INV-17` reword preserved meaning and broke no
  `test-agent-profile-parity.js` FEATURE_TOKEN. This is the direct antidote to the "missed spelling/
  surface" failure mode that birthed this issue.
- **n4 code-reviewer (sonnet, read-only) — G1 + mechanical acceptance.** Post-dominates the
  code-producing node (the `.toml` + `.js` writes). Runs the recorded `validation_command`
  (`KAOLA_RUN_CHAINS_CONCURRENCY=serial npm test` — serial is REQUIRED on this host: default `auto`
  SIGKILLs the octopus-merge test inside `test-adaptive-node.js`) for all four chains green sequentially
  + `simulate-workflow-walkthrough.js` + `test-route-reachability.js` (inside the claude chain), then
  `node scripts/test-opencode-edition.js` for the opencode suite (NOT part of `npm test`).

**Cross-edition obligation (#307/#400).** The diff touches the edition trees (3 forge prompt surfaces +
the codex/forge contract validators) → all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`
chains must be green (run sequentially) + the opencode suite. The claude chain runs the claude validator
(#17) and byte-checks the codex copy (#18) via `validate-script-sync.js`; codex/gitlab/gitea chains run
their respective validators — so all five validator edits are exercised.

**Decision record.** `docs/decisions/D-576-01.md` is the next free number (only `D-575-01 (existing)` exists). It
records the now-machine-enforced guard and supersedes the "machine enforcement is deferred" note in
D-575-01 (existing). `docs/conventions.md` is referenced by no test (only as a string in the failure message), so
no `validation_test_consumes` entry is needed and its timing is chain-neutral.

**Acceptance mapping.** AC1/AC2 (zero stragglers; examples are placeholders) → n1 strip. AC3
(`PROVENANCE_BAN` wired into the validators + opencode test; fails on re-introduced provenance, passes
on placeholders) → n1 guard + behavior assertions. AC4 (does not flag grey-zone/exempt surfaces) → the
banlist taxonomy + n3 oracle. AC5 (#307 four chains + walkthrough + route-reachability + opencode green)
→ n4. AC6 (`docs/conventions.md` + `D-576-01`) → n2.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-provenance-guard | tdd-guide | — | agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, commands/workflow-next.md, plugins/kaola-workflow-gitlab/commands/workflow-next.md, plugins/kaola-workflow-gitea/commands/workflow-next.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md, scripts/validate-kaola-workflow-contracts.js, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/test-opencode-edition.js | 19 | sequence | sonnet | — |
| n2-docs | doc-updater | n1-provenance-guard | docs/conventions.md, docs/decisions/D-576-01.md | 2 | sequence | sonnet | — |
| n3-meaning-verify | adversarial-verifier | n2-docs | — | 1 | sequence | opus | — |
| n4-review | code-reviewer | n3-meaning-verify | — | 1 | sequence | sonnet | — |
| n5-finalize | finalize | n4-review | CHANGELOG.md | 1 | sequence | — | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-provenance-guard | complete |
| n2-docs | complete |
| n3-meaning-verify | complete |
| n4-review | complete |
| n5-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-provenance-guard) | subagent-invoked | evidence-binding: n1-provenance-guard 88a854b94d12 | |
| doc-updater (n2-docs) | subagent-invoked | evidence-binding: n2-docs b9b3bad4cd19 | |
| adversarial-verifier (n3-meaning-verify) | subagent-invoked | evidence-binding: n3-meaning-verify 632eb702344a | |
| code-reviewer | subagent-invoked | evidence-binding: n4-review dd5cca64418b | |
| finalize (n5-finalize) | main-session-direct | evidence-binding: n5-finalize 9e8b7d82643b | |

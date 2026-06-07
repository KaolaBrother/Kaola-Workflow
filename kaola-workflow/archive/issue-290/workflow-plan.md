# Adaptive Workflow Plan — issue-290

<!-- plan_hash: 92b906a452fc7d32e06bc1cb7694e7a75c4f0375043e1e40d642c21414231f90 -->

adaptive: regression-pin the reviewer findings-emission contract PRESENCE across all four editions
(#279/#288 follow-up). PR #288 relocated the #279 machine-readable findings-emission contract INTO
the reviewer agent bodies; nothing pins that section's presence, so a future re-vendor/refactor could
silently drop it while `npm test` stays green — quietly reverting the feature. The mechanical gate
(parseNodeFindings/--verdict-check) is well-tested; only the EMISSION half is unguarded. Add a
PRESENCE pin on the cross-format token `finding: id=` to each of the four edition contract validators
so removing the emission section from ANY reviewer body (.md or .toml, any edition) fails `npm test`
(AC1), edition-aware and without false-flagging the .md-vs-.toml format differences (AC2). Reviewer
agent bodies are READ-ONLY here — we pin their presence; we never edit them, and they are in NO
node's write-set. Linear chain pin → review → adversary → finalize: review (code-reviewer)
post-dominates the only code producer (G1); no `*security*` path in any write-set and non-sensitive
labels (G2 not triggered); finalize is the unique docs/state sink (CHANGELOG.md only).

## Meta

labels: enhancement, workflow:in-progress, area:scripts

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| pin | tdd-guide | — | scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 1 | sequence |
| review | code-reviewer | pin | — | 1 | sequence |
| adversary | adversarial-verifier | review | — | 1 | sequence |
| finalize | finalize | adversary | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
| --- | --- |
| pin | complete |
| review | complete |
| adversary | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (pin) | subagent-invoked | # Node pin (tdd-guide) — issue #290 findings-emission contract presence pin | |

| code-reviewer | subagent-invoked | verdict: pass | |
| adversarial-verifier (adversary) | subagent-invoked | verdict: pass | |
| finalize (finalize) | subagent-invoked | # Node finalize (Phase-6 sink evidence) — issue #290 | |
## Design Notes

Goal: pin the PRESENCE of the reviewer findings-emission section in all 14 reviewer bodies (5 .md +
9 .toml) so its silent removal goes RED under full `npm test`. The robust cross-format pin token is
`finding: id=` — verified present in all 14 reviewer agent bodies. The .md heading is
"Machine-Readable Findings" and the .toml heading is "Findings contract (Kaola-Workflow adaptive
gate):", but `finding: id=` is the common emission line; pin on it (optionally also pin the
format-specific heading per edition for extra fidelity — `finding: id=` alone satisfies AC1).

- pin node (tdd-guide, RED→GREEN): adds a PRESENCE assertion to each of the FOUR edition contract
  validators (forge-parity = YES; pin in ALL FOUR). Each validator already exposes
  `assert(cond,msg)` + `assertIncludes(file, needle)` + `read()` reading paths relative to
  repo-root; mirror the existing prose-pins (e.g. validate-workflow-contracts.js
  `assertIncludes(file, 'subagent_type="build-error-resolver"')`). The forge validators already
  iterate `agents/*.toml`; a targeted `assertIncludes` per reviewer file is cleaner than touching
  that loop. Each implementation MUST read the target validator's OWN path/root convention before
  editing. The four editions map to FIVE write-set paths because the CLAUDE validator is a #274
  byte-identical SYNC PAIR:
    1a. scripts/validate-workflow-contracts.js (CLAUDE root) AND
    1b. plugins/kaola-workflow/scripts/validate-workflow-contracts.js (CLAUDE plugin mirror) — these
        two are BYTE-IDENTICAL (#274 sync group) and MUST stay byte-identical: apply the IDENTICAL
        `assertIncludes` edit to BOTH, not an "analogous" one, or the #274 gate trips at commit. They
        pin the 5 .md bodies carry `finding: id=`: agents/code-reviewer.md, agents/security-reviewer.md,
        agents/adversarial-verifier.md, agents/profiles/higher/code-reviewer.md,
        agents/profiles/higher/security-reviewer.md (there is NO
        agents/profiles/higher/adversarial-verifier.md — do NOT assert one).
    2. scripts/validate-kaola-workflow-contracts.js (CODEX, standalone — no mirror) — pin 3 .toml
       bodies: plugins/kaola-workflow/agents/{code-reviewer,security-reviewer,adversarial-verifier}.toml.
    3. plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js (GITLAB,
       standalone) — pin 3 .toml: plugins/kaola-workflow-gitlab/agents/{code-reviewer,security-reviewer,adversarial-verifier}.toml.
    4. plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js (GITEA,
       standalone) — pin 3 .toml: plugins/kaola-workflow-gitea/agents/{code-reviewer,security-reviewer,adversarial-verifier}.toml.
  Only the CLAUDE pair must be byte-identical; CODEX/GITLAB/GITEA each get their OWN analogous edit
  (different files/sizes — no cross-edition byte-identity among the three). 5 ≤ FILE_CEILING (6). It
  is `tdd-guide` because AC1's mandated mutation RED proof IS the failing-test-first signal: today a
  removal of the emission section stays green (the defect); after the pin, removal goes RED.
- RED proof (MANDATORY, on FULL `npm test`, not just the walkthrough — the codex/gitlab/gitea
  contract validators do NOT run under simulate-workflow-walkthrough.js alone): plant a removal of
  `finding: id=` in ONE .md AND ONE .toml reviewer body, confirm the corresponding edition
  validator(s) go RED under `npm test`, then RESTORE byte-identically via a `.bak` copy or an
  inverse edit. NEVER `git checkout -- <file>` — it would nuke the in-flight validator edits.
  Reviewer bodies are READ-ONLY and MUST net to zero diff.
- review node (code-reviewer, G1): post-dominates the only code producer (pin). No `*security*` path
  in any write-set and non-sensitive labels (enhancement / area:scripts) ⇒ code-reviewer alone
  suffices; G2 not triggered, no security-reviewer node required (test-infra only — no
  runtime/user-input/auth/secret surface).
- adversary node (adversarial-verifier): adversarially confirm the guard ACTUALLY fails on removal
  in EACH of the four editions, and does NOT false-flag the .md-vs-.toml format differences (AC2).
  This is the core risk of the change, so it is given a dedicated node.
- finalize node: unique docs/state sink. CHANGELOG.md [Unreleased] entry authored as Phase-6
  evidence. docs/api.md + docs/architecture.md are NOT needed (internal test-infra, no user-facing
  API). FINALIZE FLAG: another machine concurrently owns issue #281; the repo carries UNTRACKED
  #281 leftovers (docs/investigations/2026-06-07-parallel-ready-set-execution-design.md and
  kaola-workflow/.roadmap/issue-281.md) — keep these OUT of the Phase-6 commit and ensure the
  ROADMAP regen does NOT inject a stray #281 row. Our write-set (validators only) is disjoint from
  #281's DAG-execution surface — clean.

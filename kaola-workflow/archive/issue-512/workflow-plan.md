# Adaptive Workflow Plan — issue-512

<!-- plan_hash: 2a2185029b1555d4178a526a6ec557ff6946e0f79196cafc0bee59f3e7dc3429 -->

## Meta
issue: 512
title: run-chains.js 600s spawnSync timeout is too tight for the claude chain (~574s standalone) → false chains_red at finalize
labels: bug
sink: CHANGELOG.md

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-impl | tdd-guide | — | scripts/kaola-workflow-run-chains.js, plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js, scripts/test-run-chains.js | 5 | sequence | sonnet |
| n2-docs | doc-updater | — | docs/api.md, README.md, .env.example, docs/decisions/D-512-01.md | 4 | sequence | sonnet |
| n3-review | code-reviewer | n1-impl, n2-docs | — | 1 | sequence | opus |
| n4-finalize | finalize | n3-review | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

### Issue shape & decision (deferral recorded for D-512-01)
This is a **build**, not a Case-B shaping run: the fix shape is fully knowable. The issue's "Decision
needed" lists raise-timeout / speed-up-chain / both, and directs "pick the cheapest sufficient that
makes a passing chain reliably capturable." The cheapest sufficient fix is to **parameterize the
`spawnSync` timeout** (currently hardcoded `timeout: 600000` at `kaola-workflow-run-chains.js:272`)
via a new env var `KAOLA_RUN_CHAINS_TIMEOUT_MS` (default **900000** ms). The "speed up the chain"
option is DEFERRED because the issue explicitly records the slowness is **not yet root-caused**
(genuine suite growth vs. environment slowness — both plausible) — speeding up an un-diagnosed suite
is the larger, uncertain effort, while raising/parameterizing the timeout reliably captures a
passing-but-slow chain at near-zero risk. D-512-01 records this deferral rationale so the owner can
reopen the speed-up track if they disagree (not an escalation — the cheapest-sufficient directive
makes this a fact, not a value call).

### Env-var contract (pin so impl + docs converge by construction)
- **Name:** `KAOLA_RUN_CHAINS_TIMEOUT_MS`
- **Default:** `900000` (ms) — ≥ the issue-requested floor of 900000; comfortably above the ~574s
  observed claude-chain standalone runtime plus `spawnSync` overhead and environmental jitter.
- **Fallback semantics (mirror `KAOLA_GH_REMOTE_TIMEOUT_MS`, `docs/api.md:168`):** a non-numeric,
  zero, or negative value falls back to the `900000` default. (No upper clamp is required — unlike
  the forge-API timeout's #185 hang-protection clamp, a long-running local test suite is not a hang
  risk; the larger the ceiling the safer for capture. Keep it simple: parse-or-default only.)
- **Receipt schema is UNCHANGED** (issue requirement): the timeout knob only governs the `spawnSync`
  kill ceiling; `.cache/chain-receipt.json` fields (`headSha`, `workTreeHash`, `startedAt`,
  `completedAt`, `source`, `chains[]`) are untouched.

### n1-impl (tdd-guide, sonnet) — parameterize the timeout across all four editions + test
- **Why tdd-guide:** a meaningful failing-first unit test exists. Export a pure helper
  `resolveTimeoutMs(env)` from `kaola-workflow-run-chains.js` (current exports:
  `{ main, KNOWN_CHAINS, CHAIN_COMMANDS, resolveChains }` → add `resolveTimeoutMs`) and replace the
  literal `timeout: 600000` at `:272` with `resolveTimeoutMs(process.env)`. RED test cases (added to
  `scripts/test-run-chains.js`): default (unset → `900000`); valid override (`"1200000"` →
  `1200000`); invalid/zero/negative (`"abc"`, `"0"`, `"-5"` → `900000` default). These fail before
  the helper exists (the export is undefined) and pass after.
- **CROSS-EDITION COHESION (#306/#309/#431 + validate-script-sync lockstep — ONE node, do NOT fan
  out):** `validate-script-sync.js` (lines 80-82, 261-269) enforces that the four run-chains editions
  move as one byte-identical / rename-normalized family:
  - `scripts/kaola-workflow-run-chains.js` (canonical reference)
  - `plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js` (byte-identical codex twin)
  - `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js` (rename-normalized port)
  - `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js` (rename-normalized port)
  The script carries **no forge-specific CLI tokens** (forge-neutral), so the canonical edit applies
  byte-for-byte to the codex twin and modulo the base-name prefix to the two forge ports. Splitting
  these across nodes/legs is `generated_port_split`-by-construction (#291/#431) AND a parity-divergence
  risk (#254/#309) — the canonical spec for every edition is "the canonical
  `scripts/kaola-workflow-run-chains.js` diff, byte-identical (codex) / rename-normalized (forge)."
  Verify immediately after editing with `node scripts/validate-script-sync.js` (it runs first in every
  chain).
- `scripts/test-run-chains.js` is the direct (root-only) test for this script; it lives in the same
  node as the editions so the new timeout coverage is real. (Note: `test-run-chains.js` is not wired
  into any `npm run test:kaola-workflow:*` chain — a known pre-existing orphaning condition, out of
  scope for #512; the role agent runs it directly for the RED→GREEN proof.)

### n2-docs (doc-updater, sonnet) — document the new env var (3 surfaces) + decision record
The env var must be documented wherever the `KAOLA_*` runtime-knob family is registered (grepped from
the `KAOLA_GH_REMOTE_TIMEOUT_MS` / `KAOLA_FANOUT_CAP` siblings):
- `docs/api.md` — add a `KAOLA_RUN_CHAINS_TIMEOUT_MS` entry near the existing env-var docs (the
  `KAOLA_GH_REMOTE_TIMEOUT_MS` pattern, ~line 168) and a note in the `kaola-workflow-run-chains.js`
  § (~line 312) that the `spawnSync` kill ceiling is now configurable (default 900000; receipt schema
  unchanged).
- `README.md` — add a row to the Environment Variables table (~line 796) mirroring the
  `KAOLA_GH_REMOTE_TIMEOUT_MS` / `KAOLA_FANOUT_CAP` rows: name | `900000` | purpose (configurable
  per-chain `spawnSync` kill ceiling; invalid/zero/negative → default; #512).
- `.env.example` — add a commented stanza mirroring the existing `KAOLA_GH_REMOTE_TIMEOUT_MS` block.
  (NOTE: `.env.example` is a dot-leading non-`.md` write, so the validator classifies this node as
  code-producing — that is why n3-review post-dominates n2-docs (G1). Intended.)
- `docs/decisions/D-512-01.md` — NEW decision record (D-512-01 is the next free id; no prior D-512
  record exists). Records: chosen fix = parameterize timeout (default 900000); DEFERRED = speed-up
  chain (root cause unresolved, cheapest-sufficient directive); receipt schema unchanged; cross-edition
  via validate-script-sync lockstep.
- **DISJOINT from n1-impl** (docs/README.md/.env.example vs scripts/plugins) → authored as an
  ANTICHAIN with n1 (no dep edge between them) so the scheduler overlaps the two work nodes per the
  scheduler-default posture (D-419-01 (existing)); both then join at the n3-review gate. The env-var
  contract above is the shared canonical pin so the parallel impl and docs converge by construction.

### n3-review (code-reviewer, opus) — G1 gate over BOTH work nodes
Post-dominates both code-producing nodes (n1-impl, and n2-docs by virtue of its dot-leading
`.env.example` write) — the G1 wall. **opus**: the change is mechanical but the adversarial value is
in the cross-edition parity check (four-edition byte-identity / rename-normalized diff
hand-verification) and confirming `resolveTimeoutMs` fallback semantics match the documented
`KAOLA_GH_REMOTE_TIMEOUT_MS` family — a strong reviewer over a cheap mechanical implementer is the
defensible posture (gate-up-when-impl-is-sonnet). Emits lowercase `verdict: pass` /
`findings_blocking: 0`.

### n4-finalize (finalize, no model) — unique sink
Writes only `CHANGELOG.md` (docs/state only — the sink may not write code, and never declares a model
since it is never dispatched as a subagent). Depends on the G1 gate (n3-review), which post-dominates
both work nodes, so finalization is provably after all work. CHANGELOG entry under `[Unreleased]` →
`### Fixed`: parameterizable run-chains timeout, default 900000, all four editions, receipt schema
unchanged, #512. No code on the sink (would trip code-reviewer).

## Node Ledger

| id | status |
| --- | --- |
| n1-impl | complete |
| n2-docs | complete |
| n3-review | complete |
| n4-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-impl) | subagent-invoked | evidence-binding: n1-impl 9a18318b6e47 | |
| doc-updater (n2-docs) | subagent-invoked | evidence-binding: n2-docs f83e3e7890da | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review e0d9f9849fb2 | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize 081f258c3132 | |

<!-- plan_hash: aaba91234453b6b5375604a9e7f3960a0409e1624b4d03d6bd34540c23437f7f -->
## Meta

labels: enhancement, area:scripts, area:workflow-state
validation_command: npm test

Archived projects strand `refs/kaola-workflow/barrier/<projectTag>/*` git refs forever (audit
2026-07-14: 239 refs across ~42 archived projects). Root cause: `--drop-base` — the only ref
deleter — is window-locked to ledger status `pending` per D-424-01 (existing), so it structurally
cannot fire for a `complete` node; `archiveProjectDir` copies the `barrier-base-*` evidence FILES into
the archive but never reaps the anchored refs; and no sweep enumerates them. Group
`barrier-base/<group_id>` refs (dropped after a barrier pass) sit at zero, confirming per-node
retention is an omission, not design.

Fix (agent-decided shape): (1) an archive-time reap of EXACTLY the archived project's own
`refs/kaola-workflow/barrier/<tag>/*` refs, placed inside `archiveProjectDir` so it fires on every
archive path (finalize-closed, discard-abandoned, active-folders backstop) — FAIL-SOFT, a ref-delete
failure must NEVER block or roll back finalize; (2) a keep-set-disciplined legacy one-shot sweep
subcommand on the claim.js family that enumerates all `refs/kaola-workflow/barrier/<tag>/*` and
deletes only tags with NO active `kaola-workflow/<project>/` folder and NO running-set — mirroring the
#680 orphan-baseline sweep discipline (sanitizer collisions only ever ADD to the keep set = fail-safe
under-reap; unprobeable ⇒ keep; fail-soft on any error); (3) document the ref lifecycle. The whole
code change is concentrated in ONE writer node (the 4 claim.js editions + its tests) so any adversarial
refutation is single-writer repairable — never a fan-out over independent writers.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-reap-sweep | tdd-guide | — | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/test-claim-hardening.js | 5 | sequence | standard |
| n2-review | code-reviewer | n1-reap-sweep | — | 1 | sequence | reasoning |
| n3-adversary | adversarial-verifier | n2-review | — | 1 | sequence | reasoning |
| n4-docs | doc-updater | n3-adversary | docs/workflow-state-contract.md, docs/decisions/D-686-01.md | 2 | sequence | standard |
| n5-finalize | finalize | n4-docs | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

- **Single-writer, serial-gate topology (deliberate, per the run brief).** n1-reap-sweep is the SOLE
  code writer; n2 (code-reviewer, G1) and n3 (adversarial-verifier, change gate) are serial so BOTH
  post-dominate the single writer over the unique sink (parallel read gates would break post-dominance:
  removing one gate would leave a sink path through the other). There is no write fan-out — the prior
  bundle-wide fan-out over an antichain wedged (`repair_requires_replan` with no repairable owner), so
  a refutation here reopens exactly n1 and is single-writer repairable.
- **claim.js is COMMON_SCRIPTS + rename-normalized, NOT a GENERATED_AGGREGATOR.** The 4 copies move
  atomically in n1: canonical `scripts/kaola-workflow-claim.js` ↔ codex
  `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` are BYTE-IDENTICAL (COMMON_SCRIPTS);
  `plugins/kaola-workflow-{gitlab,gitea}/scripts/kaola-{gitlab,gitea}-workflow-claim.js` are
  RENAME-NORMALIZED-identical (only the self-referential `kaola-workflow-` → `kaola-{forge}-workflow-`
  script-name token differs; the body is otherwise identical). `edition-sync.js --write` does NOT
  regenerate these (claim.js is absent from `GENERATED_AGGREGATORS`) — apply the same body by hand to
  all four, then `node scripts/validate-script-sync.js` (claude+codex chains) and
  `node scripts/edition-sync.js --check` (gitlab+gitea chains) must be clean. If the new subcommand adds
  a helper to `module.exports`, keep the forge export superset identical across all four ports.
- **projTag sanitizer must byte-match the validator.** The barrier ref key is
  `refs/kaola-workflow/barrier/<projTag>/<nid>` with `projTag = String(project).replace(/[^A-Za-z0-9_-]/g, '_')`
  (plan-validator.js ~2911). The reap and sweep MUST reuse this exact sanitizer so the tag they
  enumerate matches the tag `--record-base` anchored. Barrier refs are SHARED common refs (not
  per-worktree), so reaping from the main root is correct.
- **Scope strictly to `refs/kaola-workflow/barrier/`.** Never touch group `refs/kaola-workflow/barrier-base/*`
  or leg `refs/kaola-workflow/leg-base/*` refs (different lifecycle: dropped on barrier pass / leg
  teardown). Never touch a live project's refs.
- **Decision-record numbering.** `docs/decisions/` currently holds up to D-683-01 (existing); no
  `D-686-*` record exists, so `D-686-01` is the next free id for this issue (verified at authoring).
- **CI/CD is not a gate** — finalize's evidence is the four internal `npm run test:kaola-workflow:*`
  chains, not any external pipeline.

## Node Briefs

### n1-reap-sweep

Implement BOTH behaviors in the 4 claim.js editions, test-first in `scripts/test-claim-hardening.js`.
Docs are OUT of this node (n4 owns them).

Behavior A — archive-time reap: inside `archiveProjectDir` (canonical ~line 1926), AFTER the live copy
is deleted and `verifyArchiveComplete` passed, near the end before the return, delete every ref matching
`refs/kaola-workflow/barrier/<sanitize(project)>/*`. Enumerate with
`git for-each-ref --format=%(refname) refs/kaola-workflow/barrier/<tag>/` and delete each with
`git update-ref -d <ref>`. Because `archiveProjectDir` is the convergence point for finalize-closed,
discard-abandoned, and the active-folders backstop, this one insertion covers every archive path.
FAIL-SOFT is correctness-critical: wrap the whole reap in try/catch and swallow all errors — a
ref-delete failure must never throw, block, or roll back finalize (evidence files are already
archived). Run against the resolved main root (`archiveProjectDir` already computes `mainRoot`); barrier
refs are shared common refs so either root works, but never throw.

Behavior B — legacy keep-set sweep: add a new claim.js CLI subcommand (suggested `barrier-ref-sweep`;
wire it into the dispatcher near line ~3670). Enumerate ALL `refs/kaola-workflow/barrier/<tag>/*` refs,
group by `<tag>`. Build a KEEP set: for every active `kaola-workflow/<project>/` folder (reuse the
existing active-folder enumeration helper in claim.js — confirm its name; do not re-implement) add
`sanitize(project)`; also KEEP any tag whose project has a live `.cache/running-set.json`. Delete only
refs whose `<tag>` is NOT in KEEP. Mirror the #680 orphan-baseline sweep discipline
(adaptive-node.js ~7557): (1) sanitizer collisions only ever ADD to KEEP — fail-safe under-reap, never
over-reap; (2) any tag that cannot be probed ⇒ KEEP; (3) fail-soft — any error aborts the sweep
silently. Scope strictly to the `barrier/` prefix (never `barrier-base/` or `leg-base/`). Emit a `--json`
summary (e.g. refsDeleted / tagsKept).

Tests (RED-first, both required by the AC): (1) reap — create a barrier ref for a project, archive it,
assert zero `refs/kaola-workflow/barrier/<tag>/*` remain AND archive still succeeds; plus a fail-soft
case proving a reap failure does not throw or roll back. (2) sweep keep / false-positive guard — create
refs for an ACTIVE project (folder present) and an ARCHIVED project (no folder); run the sweep; assert
the archived refs are deleted and the active refs are KEPT; add a sanitizer-collision case that must KEEP
(under-reap). Confirm each test fails RED before the impl.

Validate locally: `node scripts/test-claim-hardening.js` GREEN, then `node scripts/simulate-workflow-walkthrough.js`
still passes (the reap is fail-soft). Full four-chain is n5's job.

### n2-review

Review n1's diff. Focus: (a) the reap is truly fail-soft — no throw path can reach finalize rollback;
(b) the reap is scoped to EXACTLY the archived project's tag (no over-broad glob); (c) the sweep keep-set
is ADD-only on sanitizer collision and keeps unprobeable / live-folder / running-set tags; (d) the sweep
never touches non-`barrier/` refs (`barrier-base/*`, `leg-base/*`); (e) the projTag sanitizer byte-matches
the validator's `/[^A-Za-z0-9_-]/g → _`; (f) 4-edition parity (byte canonical↔codex; rename-normalized
forge ports; export superset). Confirm the RED-first tests genuinely fail without the implementation.
Post `verdict: pass` or `verdict: fail` with specifics.

### n3-adversary

Try to REFUTE the keep-set discipline and the fail-soft guarantees (you have Bash — build a synthetic
`refs/kaola-workflow/barrier/*` namespace in a scratch repo). Attacks: (1) make the sweep drop a LIVE
project's ref — sanitizer collision between a live and an archived project name; a running-set-only
project with no folder; a project folder present but mid-run. (2) make the reap block or roll back
finalize — a ref-delete that errors (read-only/packed refs, a concurrent lock). (3) over-reap — does the
sweep ever delete a `barrier-base/*` group ref or a `leg-base/*` ref (wrong prefix)? (4) does the reap
fire on the DISCARD (abandoned) path, not just closed? Any successful attack ⇒ `verdict: fail` with the
exact repro; otherwise `verdict: pass`. This node is a change gate (it lies on n1→…→sink), so
`--verdict-check` applies.

### n4-docs

Read n3's evidence first. Document the barrier-ref LIFECYCLE in `docs/workflow-state-contract.md`:
record (per-node/leg/group baseline anchored at open via `--record-base`) → guard window (the active
`barrier_base_mismatch` laundering guard, #368) → reap-at-archive (`archiveProjectDir` deletes the
project's `refs/kaola-workflow/barrier/<tag>/*`) → legacy keep-set sweep (one-shot for pre-fix stranded
refs). State that group `barrier-base/*` and `leg-base/*` refs follow their own drop-on-pass /
teardown lifecycle and are NOT reaped by this path. Write `docs/decisions/D-686-01.md` recording the
decision: archive-time reap + keep-set legacy sweep; fail-soft; ADD-only collision discipline mirroring
#680; scope = `barrier/` only; why the pending window-lock (D-424-01 (existing)) on `--drop-base` left
the gap. Diff all prose against the ACTUAL final claim.js behavior from n1 — cite the real subcommand
name the implementer chose; do NOT fabricate flag/subcommand names. Docs paths only.

### n5-finalize

Sink. Add a `CHANGELOG.md` entry under `[Unreleased]` (barrier-ref archive-time reap + legacy sweep).
This is a cross-edition diff (claim.js ×4), so run all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`
chains sequentially for the run-chains receipt, then finalize/archive/sink-merge per the terminal-node
lifecycle. Note: the archive step now reaps issue-686's own barrier refs — the fix dogfoods itself.

## Node Ledger

| id | status |
| --- | --- |
| n1-reap-sweep | complete |
| n2-review | complete |
| n3-adversary | complete |
| n4-docs | complete |
| n5-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-reap-sweep) | subagent-invoked | evidence-binding: n1-reap-sweep e725d95472fb | |
| code-reviewer | subagent-invoked | evidence-binding: n2-review 41fd131b08b7 | |
| adversarial-verifier (n3-adversary) | subagent-invoked | evidence-binding: n3-adversary 81dab05a1c8d | |
| doc-updater (n4-docs) | subagent-invoked | evidence-binding: n4-docs 48261cd509ef | |

# Goal-Driven Automation Design — Runtime-Grounded Investigation

**Date:** 2026-06-12
**Status:** Complete
**Relates to:** issue #420, D-420-01, D-420-02

## 0. Summary

This document grounds the four parts of issue #420 (goal-driven automation) in the
actual code that exists in this repository at v5.15.0 / codex 3.15.0, so the two
downstream ADRs (D-420-01 autopilot + halt triage; D-420-02 goal line + release
aggregator) can cite real file/line facts rather than speculation. The four surfaces
are **(A)** the existing scout→claim→plan→run→finalize pipeline that an autopilot would
drive (Parts 1 + 3), **(B)** the `write-halt` / `clear-halt` consent machinery whose
payload Part 2 wants to enrich, **(C)** the `plan_hash`-covered `## Meta` region a
`goal:` line would live in (Part 3), and **(D)** the manual release surfaces (tag, three
manifests, README, CHANGELOG completeness) Part 4 wants to fuse into one aggregator. The
recurring finding: every piece #420 needs already exists as a primitive — the missing
work is a *driver* (autopilot), *payload enrichment* (halt triage), *one additive Meta
field* (goal line), and *one composition* (release aggregator). None of the four parts
requires new core mechanics; all four compose over scripts that already emit the data.

## 1. Surface A — Autopilot Pipeline (Parts 1 + 3)

### 1.1 Current scout→claim→plan→run→finalize flow

The pipeline today is human-driven through user-facing commands; nothing chains the
stages automatically. The concrete stages and their scripts:

1. **Survey (read-only).** `commands/workflow-next.md` (the router) may dispatch the
   read-only `issue-scout` agent (`agents/issue-scout.md`) to recommend ONE bundle
   before any claim. The router maps `scout.recommended_bundle.primary_issue` into the
   `KAOLA_TARGET_ISSUE` env (`commands/workflow-next.md:143-147`, the "#380 Output → env
   wiring" block) and then runs startup. The scout is explicitly permitted to be
   dispatched from the router because it "claims nothing, writes nothing, and only
   recommends" (`commands/workflow-next.md:22-24`).
2. **Claim.** `scripts/kaola-workflow-claim.js` `cmdStartup` (line 1193) →
   `claimExplicitTarget` (line 805) → `claimProject` (line 665). The claim validates the
   explicit `--target-issue N`, classifies it (green/yellow/red/blocked), provisions a
   worktree or in-place branch, and writes `workflow-state.md` via `writeState`
   (line 487). For the adaptive path, `claimProject` records `workflow_path: 'adaptive'`
   (the bundle analog sets it at `claim.js:958`).
3. **Plan (freeze + handoff).** The `workflow-planner` agent authors `workflow-plan.md`
   then runs `scripts/kaola-workflow-adaptive-handoff.js`. SPAWN 1 (`--freeze-checked
   --json`, `adaptive-handoff.js:268`) validates and returns the governance payload
   WITHOUT writing; SPAWN 2 (`--freeze --governance-ack <planHash> --json`,
   `adaptive-handoff.js:328`) re-validates, asserts the hash is unchanged, writes the
   `plan_hash`, folds `--resume-check`, and inserts `## Planning Evidence` into
   `workflow-state.md` (`adaptive-handoff.js:428-446`). Success returns
   `handoff_status: 'ready_to_run'` (`adaptive-handoff.js:464`).
4. **Run (per-node lifecycle).** `commands/kaola-workflow-plan-run.md` drives
   `scripts/kaola-workflow-adaptive-node.js` per node: `orient` (read-only, line 572) →
   `open-next` / `open-ready` (ledger + baseline) → role-agent dispatch + `record-evidence`
   → `close-and-open-next` (`runCloseAndOpenNext`, line 1151: evidence-shape check →
   barrier shell → close → compliance row → fused advance). Halts surface here via
   `write-halt` (`runWriteHalt`, line 1454) and clear via `clear-halt` (`runClearHalt`,
   line 1584).
5. **Finalize + sink.** `commands/kaola-workflow-finalize.md` + the contractor archive +
   `scripts/kaola-workflow-sink-merge.js` (`main`, line 609) merge the branch, close the
   issue (`gh issue close`, the only issue-close call lives here at
   `sink-merge.js:442`/`486`), remove the roadmap source file, and emit a receipt.

State threads between stages through three durable artifacts: `workflow-state.md`
(`workflow_path`, `## Planning Evidence`, `## Sink`), `workflow-plan.md` (the
hash-covered `## Meta` + `## Nodes` plus the mutable `## Node Ledger`), and the
`.cache/` evidence + baseline files. There is no script today that owns *crossing* the
stage boundaries — that is the orchestrator's job, invoked command by command.

### 1.2 issue-scout role contract

`agents/issue-scout.md` defines a read-only Sonnet agent (`model: sonnet`, line 4) whose
hard boundaries forbid claiming, writing repo files, authoring `workflow-plan.md`,
closing issues, or dispatching other agents (`issue-scout.md:39-47`). It returns a single
JSON object (`issue-scout.md:90-105`) with `recommended_bundle` carrying:
`primary_issue` (lowest-numbered, or the single issue), `issues` (sorted ascending
array), `scope` (shared-scope label), `confidence` (`"high"|"medium"|"low"`),
`rationale`, `expected_write_areas`, `risks`, and `rejected[]` (excluded issues with
reasons). The auto-bundle rule fires only when ALL of: all open + unclaimed, none red
against active work, deps inside-bundle-or-closed, coherent scope, write areas compatible
with one DAG, and count ≤ `KAOLA_BUNDLE_MAX_ISSUES` (default 4)
(`issue-scout.md:75-84`). When confidence is not high it must recommend single-issue mode
(`issue-scout.md:118`). This is the natural input to an autopilot: `confidence: "high"`
is already the gating signal Part 1 asks for.

### 1.3 Claim mechanics

`cmdStartup` (`claim.js:1193`) refuses an auto-pick: with no scalar/bundle target it
emits a typed `no_target` refusal whose reasoning explicitly states "the workflow never
auto-picks an issue (#44)" (`claim.js:1225-1226`). `claimExplicitTarget` (line 805)
validates the target through `classifyIssue` and returns typed refusals for each failure
class — `user_target_blocked`, `user_target_red`, `target_unavailable`,
`target_unverified` (`claim.js:811-828`) — before delegating to `claimProject` only on a
clean verdict (line 829). `claimProject` (line 665) whitelists the persisted
`workflow_path` and writes state via `writeState`. `writeState` (line 487) records, for
the adaptive path: `phase: adaptive`, `workflow_path: adaptive` (line 514-516), and the
adaptive resume command/skill (`PLAN_RUN_COMMAND` / `PLAN_RUN_SKILL`, lines 504-505,
519-520). The `workflow_path: adaptive` line is **toggle-agnostic** on resume — an
already-frozen plan resumes via plan-run regardless of the install switch
(`claim.js:499-503`, `resumeFallbackCommand` at line 1251 reads
`/^(?:workflow_path|phase):\s*adaptive\s*$/m`). For a bundle, `claimBundle`
(`claim.js:874`) writes `issue_numbers`, `bundle_id`, and `closure_policy:
all_or_nothing` (lines 950-958), again with `workflow_path: 'adaptive'` (the bundle lane
is adaptive-only — see the `workflow_path_refused` guard at `claim.js:1092`).

### 1.4 Design notes for Part 1 — autopilot loop design space

An autopilot loop would iterate scout→claim→plan→run→finalize until a typed stop
condition. The grounding shows the invariants it must preserve and the seams it can use:

- **#44 selection-aloud invariant.** The hard rule is that selection is an agent
  decision, not a hidden script decision (CLAUDE.md "Agent Owns Reasoning; Scripts Own
  Atomicity"). The autopilot must therefore *state the selected issue aloud* (auditable in
  the claim comment posted by `postAdvisoryClaim`, `claim.js:577-588`) BEFORE calling
  `cmdStartup --target-issue N`. The scout's `confidence: "high"` + the "no active state +
  no ambiguity" gate from the issue body is the proceed predicate; anything below high
  parks.
- **Typed stop conditions.** Every existing claim/handoff/node refusal is already typed
  (`no_target`, `user_target_red`, `plan_invalid`, `evidence_absent`,
  `write_set_overflow`, a consent/security/test_thrash halt). An autopilot can branch
  structurally on these — it never has to string-match. The natural typed stop set:
  *backlog-empty* (scout returns no candidate), *ambiguity* (`target_ambiguity`,
  `claim.js:1201`), *halt* (any `runWriteHalt` reason), *plan-invalid after N repairs*
  (`adaptive-handoff.js` `plan_invalid`), and *gate-blocking-finding* (a verdict gate
  emits `verdict: fail`). Part 3's goal line (Section 3.3) adds *goal-satisfied* as a
  cleaner terminal than backlog-empty.
- **Seam for the driver.** The loop does not need new core mechanics — it shells the
  existing commands. The orchestrator already drives the bounded repair loop on
  `plan_invalid` (per CLAUDE.md adaptive-handoff bullet); an autopilot generalizes that
  one loop to the whole pipeline. The one thing missing is a *digest* surface (the issue's
  "user reviews a digest" goal): the autopilot accumulates the per-stage typed results and
  presents them, rather than the user re-typing `/workflow-next`.

### 1.5 Design notes for Part 3 — goal-conditioned bundles

A `goal:` line in `## Meta` (Section 3.2) flows: scout (clusters by goal, not just scope)
→ planner (`workflow-planner` writes the `goal:` line into `## Meta` at authoring time) →
hash (the line is hash-covered, so tampering after freeze trips `--resume-check`) →
finalize (an AC-vs-goal check at the sink gate). The reach-the-scout mechanism is already
half-built: the router maps scout output into env (`commands/workflow-next.md:143-147`);
a goal/milestone input would be a new env (e.g. `KAOLA_GOAL`) the scout reads and clusters
against. A finalize AC-vs-goal check would live alongside the existing sink-gate checks in
`sink-merge.js` (which already gates on completeness — see the `deriveMemberSet` close-loop
at line 636) — it would compare the bundle's closed-issue ACs against the frozen `goal:`
line and refuse a sink that closes the bundle without satisfying the stated goal. The goal
line gives the autopilot (Part 1) a termination condition better than "backlog empty":
*goal-satisfied* is auditable from the frozen Meta region.

## 2. Surface B — write-halt / clear-halt Machinery (Part 2)

### 2.1 Current halt implementation

`runWriteHalt` (`kaola-workflow-adaptive-node.js:1454`) accepts exactly three reasons:
`['consent', 'security', 'test_thrash']` (line 1457); any other reason returns
`{ result: 'refuse', reason: 'invalid_reason' }` (line 1459). It writes TWO durable
markers:

- **State markers** in `workflow-state.md`: `escalated_to_full: <reason>`. A `consent`
  halt is the documented coupling — it writes BOTH `escalated_to_full: consent` (the
  cause) AND `escalated_to_full: security` (the full-escalation state) in lockstep
  (lines 1470-1472, 1481-1500); `security` and `test_thrash` write the single
  `escalated_to_full: <reason>` line (lines 1473-1475, 1501-1503).
- **Ledger marker** in the plan's `## Node Ledger`: a freeform `consent_halt: pending`
  line inserted just below the ledger heading (lines 1505-1526). It is written PLAN-FIRST
  (the durable marker), then state LAST (line 1528-1529), so a crash leaves the recoverable
  marker.

The halted node STAYS `in_progress` — write-halt adds the marker, it does NOT flip the
ledger row (`adaptive-node.js:1542-1543`); the return carries a
`taskTransitions: [in_progress → write-halt 'HALTED: <reason>']` transition (line 1548).

`runClearHalt` (`adaptive-node.js:1584`) is the script-owned inverse. It accepts
`['consent', 'security']` (line 1587 — note `test_thrash` is NOT a clear reason; a
test-thrash escalation clears via the security path). It refuses `no_halt_present` with
zero mutation only when NEITHER the ledger `consent_halt: pending` marker NOR a durable
`escalated_to_full:` state marker is present (the #391a widened gate, lines 1594-1600).
It writes state FIRST (removing the `escalated_to_full:` lines, lines 1607-1613) then the
plan ledger marker LAST (`removeDurableConsentHalt`, lines 1615-1618) so a crash between
the two writes leaves the ledger marker and the re-run finishes the clear.

### 2.2 Current halt payload vs. proposed enrichment

**What exists today** in the `runWriteHalt` return (`adaptive-node.js:1544-1550`):
`result: 'ok'`, `halt: 'written'`, `markers` (the literal marker strings), the
`taskTransitions`, and a refreshed `taskMirror`. **That is the entire payload** — it tells
the operator a halt was recorded and which markers were written, but NOT *why mechanically*
or *what to do about it*.

**What #420 Part 2 asks for** (issue body): a classified payload attaching (1) the
offending paths, (2) the matched mechanical class (lockfile / generated mirror / forgotten
count-bump file), and (3) a ready-made plan-repair diff (write-set swap + `--freeze`).
Same enrichment for `test_thrash`: attach the failing-test delta across attempts. The gap
is that `runWriteHalt` is invoked AFTER the orchestrator has already diagnosed the
overflow; the halt itself carries none of the diagnosis forward.

### 2.3 Design notes for Part 2 — enriched halt payload

The classifier already computes everything Part 2 needs — it is just not threaded into the
halt:

- **Offending paths.** `barrierCheck` (`kaola-workflow-plan-validator.js:578`) already
  returns the offending arrays: `outOfAllow` (production writes outside the declared
  allowlist, line 623), `sensitiveHits` (line 618), `foreignArchiveHits` (line 612), and
  `unattributed` (line 645). These are surfaced in the return at line 671. The halt that
  *results from* a `barrier_failed` close (`runCloseAndOpenNext` returns `reason:
  'barrier_failed'` with the `barrierOut` envelope, `adaptive-node.js:1230-1237`) already
  has the offending paths in hand.
- **Matched mechanical class.** The validator already emits a typed `reason` (the #406
  emit envelope, `plan-validator.js:650-671`): the precedence-ordered family
  `foreign_archive > sensitive_write_unreviewed > write_set_overflow > unattributed_write`.
  Crucially, #404 already added a SUBTYPE — `write_set_granularity`
  (`plan-validator.js:659-668`): a per-node overflow whose every out-of-allow path is a
  strict subtree of one of the node's OWN directory-shaped declared tokens (`src/` or bare
  `src`). That is exactly the "operator authored a directory grant; the exact-path barrier
  can never match the real files" mechanical class. Part 2's "matched mechanical class" is
  a generalization of this typed `reason`: add classes for *lockfile* (e.g.
  `package-lock.json`), *generated mirror* (e.g. an edition-sync target), and
  *forgotten count-bump file* (the validate-*-contracts.js / test-*.js count surfaces the
  run-lesson history repeatedly cites).
- **Plan-repair diff.** A write-set swap + `--freeze` is already the sanctioned repair
  primitive — `reopen-node` (`adaptive-node.js`, the `--freeze`-after-write-set-swap path)
  preserves the ledger because `plan_hash` covers only `## Meta` + `## Nodes`
  (`plan-validator.js:177`, `682-686`). The enriched payload would attach the exact
  proposed `declared_write_set` cell edit (the offending paths added to the node's write
  set) so the operator's decision collapses to yes/no, then the autopilot applies the swap
  and re-freezes.
- **test_thrash delta.** No structured failing-test capture exists today; the
  `test_thrash` reason is accepted (`adaptive-node.js:1457`) but carries no payload. Part 2
  would attach the failing-test delta across attempts — new capture, but it lives in the
  same `runWriteHalt` return shape.
- **Forge-neutral.** The halt machinery is in `kaola-workflow-adaptive-node.js`, which
  ships byte-identical (canonical→codex) and is mirrored to gitlab/gitea ports; any payload
  enrichment must stay forge-neutral (no `gh`/`glab`/`tea` token in the classifier) and
  propagate across the four editions — the cross-edition contract (CLAUDE.md Validation
  Policy) applies.

## 3. Surface C — plan_hash Coverage and the Goal Line (Part 3)

### 3.1 Current plan_hash coverage

`computePlanHash` (`kaola-workflow-plan-validator.js:682`) hashes EXACTLY two sections:
`## Meta` and `## Nodes` (line 685: `body = norm('Meta') + '\n---NODES---\n' +
norm(schema.NODES_HEADING)`), normalized (each line trimmed, blank lines dropped,
line 683-684). The mutable `## Node Ledger` (statuses update during the run) and the
`plan_hash` comment itself are deliberately EXCLUDED (`plan-validator.js:675-681`,
`177-178`). The stored hash lives inside the plan as an HTML comment `<!-- plan_hash:
<64-hex> -->` (`readStoredHash`, line 688-691). The reason `## Meta` is covered: it closes
the integrity hole where tampering the `labels:` after freeze (e.g. security → chore) would
silently drop the G2 security requirement on resume (`plan-validator.js:679-681`).

### 3.2 Adding a goal: line to ## Meta

`## Meta` currently holds `labels: a, b` as a non-author field — `parseLabels`
(`plan-validator.js:128-132`) matches `^labels:[ \t]*(.*)$` and is read ONLY from the
hash-covered `## Meta` section body (`validatePlan` calls `parseLabels(sectionBody(content,
'Meta'))`, line 702; the #B1 audit deliberately scoped it to `## Meta` so a decoy `labels:`
outside the region cannot override it, lines 698-701). Adding a `goal:` line to `## Meta`
means:

- **The goal is hash-protected for free.** Because `computePlanHash` normalizes and hashes
  the WHOLE `## Meta` section body (`plan-validator.js:683-685`), a `goal:` line is
  automatically covered — no hash code change is required. Tampering the goal after freeze
  trips `plan_hash_mismatch` on `--resume-check` (`plan-validator.js:1234`).
- **The validator needs a reader, not a gate.** A `parseGoal` mirroring `parseLabels`
  (same `^goal:[ \t]*(.*)$` shape, same `## Meta`-scoped read) would expose the goal. The
  validator does NOT need to *enforce* the goal at freeze — it is metadata, like the model
  column. Old frozen plans without a `goal:` line stay hash-stable (an absent optional line
  changes nothing in the normalized body, exactly as the optional `model`/`selector_source`
  columns do — `plan-validator.js:163-166`).
- **Downstream effects.** Any consumer reading the goal (the finalize AC-vs-goal check)
  reads it from the same `## Meta`-scoped reader, guaranteeing it sees the hash-covered
  value, not a decoy.

### 3.3 Design notes for Part 3 — goal line contract

The goal line flows planner → `## Meta` → finalize:

- **Planner authors it.** `workflow-planner` writes `goal: <text>` into `## Meta` at
  authoring time, alongside `labels:`. The handoff freezes it as part of the existing
  `--freeze`/`--governance-ack` transaction (`adaptive-handoff.js:328`) — no new freeze
  spawn.
- **"goal satisfied" vs "backlog empty".** The autopilot's terminal check (Section 1.4)
  upgrades from *backlog empty* to *goal satisfied*: at the sink gate, compare the closed
  bundle's acceptance criteria against the frozen `goal:` line. This is an agent-judged
  check (the goal is prose), surfaced as a typed finalize result — it does NOT mechanically
  parse the goal, it presents the goal + the closed ACs for an attestation, mirroring how
  the verdict gates work (`VERDICT_ROLES`, `adaptive-node.js:543`). The check lives at the
  same gate `sink-merge.js` already owns (the close-loop at line 636), keeping the goal
  audit at the single sink seam.

## 4. Surface D — Release Surfaces (Part 4)

### 4.1 Current release flow

Releases today are a manual, multi-step, error-prone phase. The checks that exist (all
enforced inside `validate-workflow-contracts.js`, which runs in the claude `npm test`
chain) are:

- **Tag-before-test.** `validate-workflow-contracts.js:556-568` asserts the git tag
  `kaola-workflow--v<X.Y.Z>` exists for the current `package.json` version — so `npm test`
  is RED until the tag is created. The tag is the single source of truth for the entire
  release surface (`release-surface-drift.js:4-11`).
- **Tag-ancestry (orphan guard).** `validate-workflow-contracts.js:580-590` calls
  `tagAncestry` (`release-surface-drift.js:82-102`) to refuse a tag orphaned by an
  origin-advance rebase or a `gh release create` against an unpushed tag (#402). Only a
  DEFINITIVE "not an ancestor" reds; indeterminate stays inert
  (`release-surface-drift.js:57`).
- **3-manifest lockstep.** Two lockstep families are enforced:
  - *Claude plugin manifests* (`validate-workflow-contracts.js:469-475`): each
    `plugins/kaola-workflow-{gitlab,gitea}/.claude-plugin/plugin.json` version must equal
    `package.json` version; README must carry "Claude Code command install, <edition>
    edition: `<version>`" for each of GitHub/GitLab/Gitea (lines 463-468).
  - *Codex plugin manifests* (`validate-workflow-contracts.js:478-496`): all three
    `.codex-plugin/plugin.json` files (`kaola-workflow`, `-gitlab`, `-gitea`) must share
    ONE version (the codex baseline, lines 488-495), and README must carry "Codex
    `<name>` plugin manifest: `<version>`" for each (line 485).
- **README version bump.** Enforced as part of both lockstep families above (the
  `assertIncludes('README.md', ...)` calls at lines 464-467 and 485).
- **CHANGELOG presence.** `validate-workflow-contracts.js:552` asserts CHANGELOG.md
  contains a `## [<rootVersion>]` heading matching `package.json` version (the #156 drift
  guard). This is PRESENCE only — it checks the heading exists, NOT that every shipped
  issue has an entry (the #417 gap, Section 4.2).
- **Codex release-surface drift.** `validate-workflow-contracts.js:592-595` calls
  `detectCodexReleaseSurfaceDrift` (`release-surface-drift.js:107-118`) to fail when a
  Codex manifest version moved after the tag (#193 Branch A).
- **Publish.** `gh release create --latest` is run by hand (it is NOT scripted — and per
  the editions contract, a forge CLI name cannot be hardcoded into a shipped script).
- **Sink-merge.** `scripts/kaola-workflow-sink-merge.js` (`main`, line 609) is NOT the
  release cut — it is the per-issue merge/close/archive transaction. It merges the feature
  branch, closes the issue (`gh issue close`, lines 442/486), removes the roadmap source
  file (lines 527-535), and emits a receipt. A release rides a SEPARATE main commit AFTER
  the issue sinks (run-lesson: "release CANNOT ride the barrier-scoped adaptive branch").

### 4.2 The #417 CHANGELOG-gap audit finding

#417 (the post-v5.15.0 staleness sweep, shipped in CHANGELOG.md:31 under [Unreleased]
Fixed) found that the v5.15.0 release cut had CHANGELOG gaps: commit 91d9e5e (carrying
#385/#388/#389/#390) was never given a CHANGELOG entry, and #401 Part 2 was missing. #417
backfilled them by hand. The root cause is that the only CHANGELOG enforcement
(`validate-workflow-contracts.js:552`) checks the *version heading exists*, NOT that every
issue closed in the release has a corresponding entry. A completeness check would detect a
shipped issue (closed since the last tag) with no `#N` mention in the `## [Unreleased]` /
current-version section. #417 also surfaced the "Prose ×4" → "Prose ×6" propagation gap
(the two forge-codex SKILL packs), corroborating that release prose gaps are a recurring,
mechanically-detectable class.

### 4.3 Design notes for Part 4 — release aggregator

`kaola-workflow-release.js --verify / --cut` would compose the EXISTING checks into one
typed transaction:

- **`--verify`.** Run, as one transaction, the checks currently scattered through
  `validate-workflow-contracts.js`: tag existence + ancestry (`tagAncestry`,
  `release-surface-drift.js:82`), the two manifest lockstep families (the loops at
  `validate-workflow-contracts.js:469-496`), the README version assertions, the Codex
  surface-drift check (`detectCodexReleaseSurfaceDrift`,
  `release-surface-drift.js:107`), AND the NEW changelog-completeness check (every closed
  issue since the tag has an entry — closing the #417 gap). Emit one typed envelope
  (`{ result: 'pass' | 'refuse', reason, ... }`) so an un-changelogged issue becomes a
  typed refusal instead of an audit finding.
- **`--cut`.** Stamp the version across `package.json` + the four claude manifests + the
  three codex manifests + README in lockstep, then guide the tag-before-test step. The
  bump itself is out-of-allowlist for any barrier-scoped adaptive branch, so `--cut` runs
  on a separate main commit (run-lesson: release rides its own commit).
- **Forge-neutral constraint.** The PUBLISH step (`gh release create --latest`) cannot
  name a forge CLI in a shipped script — the editions contract forbids it (the same reason
  the classifier in Surface B must stay forge-neutral). The aggregator can VERIFY the
  release is publishable and emit the publish command as operator guidance, but the actual
  `gh`/`glab`/`tea release create` stays a human step (or a forge-specific, non-shipped
  wrapper). The 3-manifest lockstep is ALREADY machine-enforced
  (`validate-workflow-contracts.js:469-496`); the aggregator reuses these checks rather
  than reimplementing them.

## 5. Open Questions

1. **Autopilot stop-on-halt vs. proceed-on-mechanical-halt (Parts 1 + 2 interaction).**
   Once Part 2 attaches a ready-made plan-repair diff, should the autopilot auto-apply a
   `write_set_granularity` / lockfile / generated-mirror repair and continue, or always
   park for the yes/no? The #44 invariant covers *selection*, not *repair* — D-420-01
   should state the repair-consent policy explicitly.
2. **Goal line: free prose vs. structured ACs (Part 3).** Is `goal:` a single prose line
   (agent-judged at the sink gate) or a structured list the validator can mechanically
   check against closed-issue ACs? The grounding supports prose (mirrors `labels:`); a
   structured form would need a grammar and a new validator gate. D-420-02 should pick one.
3. **CHANGELOG-completeness data source (Part 4).** Detecting "every closed issue since the
   tag has an entry" needs the closed-issue set since the last tag — that requires a forge
   query (`gh issue list --state closed`), which is forge-specific. How does `--verify`
   stay forge-neutral while reading the closed-issue set? (Option: read the set the sink
   receipts already recorded, or accept the issue list as an injected parameter.)
4. **test_thrash payload capture (Part 2).** No structured failing-test capture exists
   today. Where is the per-attempt test delta recorded so `runWriteHalt --reason
   test_thrash` can attach it — a new `.cache/test-thrash-<node>.md`, or a field threaded
   from the dispatching role agent?
5. **Where does the autopilot live (Part 1)?** A new `kaola-workflow-autopilot.js`
   aggregator, or orchestrator prose in a command/SKILL? An aggregator can emit typed
   per-stage results, but the dispatch of subagents (scout, planner, role agents) is the
   orchestrator's job — subagents cannot dispatch subagents (run-lesson #242). D-420-01
   should fix the boundary.

## 6. File/Line Reference Index

| Surface | File | Line/Section | Purpose |
|---------|------|--------------|---------|
| A | `commands/workflow-next.md` | 22-24, 64-70, 143-147 | scout dispatch + `KAOLA_TARGET_ISSUE` env wiring |
| A | `agents/issue-scout.md` | 4, 39-47, 75-84, 90-118 | read-only contract, bundle rules, JSON output shape |
| A | `scripts/kaola-workflow-claim.js` | 1193 (`cmdStartup`) | startup entry; refuses auto-pick (#44) |
| A | `scripts/kaola-workflow-claim.js` | 805 (`claimExplicitTarget`) | typed target validation + refusals |
| A | `scripts/kaola-workflow-claim.js` | 665 (`claimProject`) | provision + write state |
| A | `scripts/kaola-workflow-claim.js` | 487-566 (`writeState`) | `workflow_path: adaptive`, resume command |
| A | `scripts/kaola-workflow-claim.js` | 874 (`claimBundle`) | bundle fields: `issue_numbers`, `closure_policy` |
| A | `scripts/kaola-workflow-adaptive-handoff.js` | 268, 328, 428-446, 464 | freeze SPAWN 1/2, Planning Evidence, `ready_to_run` |
| A | `commands/kaola-workflow-plan-run.md` | 92-181 | orient → open → dispatch → close loop |
| A | `scripts/kaola-workflow-sink-merge.js` | 609 (`main`), 442/486, 636 | merge/close/archive, close-loop gate |
| B | `scripts/kaola-workflow-adaptive-node.js` | 1454-1551 (`runWriteHalt`) | halt reasons, state+ledger markers, payload |
| B | `scripts/kaola-workflow-adaptive-node.js` | 1457 | valid reasons `[consent, security, test_thrash]` |
| B | `scripts/kaola-workflow-adaptive-node.js` | 1584-1625 (`runClearHalt`) | inverse transaction, #391a widened gate |
| B | `scripts/kaola-workflow-adaptive-node.js` | 1230-1237 | `barrier_failed` close return carrying `barrierOut` |
| B | `scripts/kaola-workflow-plan-validator.js` | 578-672 (`barrierCheck`) | offending arrays + typed `reason` envelope |
| B | `scripts/kaola-workflow-plan-validator.js` | 659-668 | `write_set_granularity` subtype (#404) |
| C | `scripts/kaola-workflow-plan-validator.js` | 682-687 (`computePlanHash`) | hashes `## Meta` + `## Nodes` only |
| C | `scripts/kaola-workflow-plan-validator.js` | 128-132 (`parseLabels`) | `## Meta`-scoped `labels:` reader (goal mirror) |
| C | `scripts/kaola-workflow-plan-validator.js` | 698-702 | `## Meta`-scoped label read (audit B1) |
| C | `scripts/kaola-workflow-plan-validator.js` | 1234 | `plan_hash_mismatch` on tamper |
| D | `scripts/validate-workflow-contracts.js` | 552 | CHANGELOG version-heading presence (#156) |
| D | `scripts/validate-workflow-contracts.js` | 556-568 | tag-existence (tag-before-test) |
| D | `scripts/validate-workflow-contracts.js` | 580-590 | tag-ancestry orphan guard (#402) |
| D | `scripts/validate-workflow-contracts.js` | 469-496 | 3-manifest lockstep (claude + codex) |
| D | `scripts/release-surface-drift.js` | 82-102 (`tagAncestry`), 107-118 (`detect...Drift`) | release-surface drift checks |
| D | `CHANGELOG.md` | 31 ([Unreleased] #417) | the CHANGELOG-gap audit finding |

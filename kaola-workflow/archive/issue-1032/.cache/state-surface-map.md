# Issue #1032 D2 — `workflow-state.md` state-surface deletion map

Read-only repository map prepared from `main` at `ef0a6d594ffa4e8713d1daaece53966b99b525e3` (`kaola-workflow--v9.17.1`). This file is the only file written for this investigation. No tracked product, test, issue, or contract file was changed.

## Executive result

`workflow-state.md` has two different surfaces that must not be conflated:

1. The claim/liveness/sink record is load-bearing. In particular, `claim_ts` is not merely display liveness: sink merge uses it to reject stale sink receipts. `session_marker` is used by lane classification. Issue, bundle, status, claim identity, branch/worktree, sink, and terminal archive bookkeeping are also part of the retained surface.
2. Most of `## Current Position`, all of `## Last Evidence`, and `## Last Updated` are run-progress or terminal breadcrumbs. They are written by claim/finalize/sink-fallback paths and are read by compact-context/resume display code, but they do not drive execution or sink correctness. `phase`, `phase_name`, `step` (while a run is live), `next_command`, `next_skill`, ownership/fallback prose, evidence breadcrumbs, and the timestamp are candidates for subtraction.

There are three scope gates that must be resolved before deleting fields:

- `step: complete` is a current archive/finalize safety invariant, not only a live progress field. `scripts/kaola-workflow-closure-contract.js:92` (and its three edition copies) requires an archived state with `status: closed` and `step: complete`; `docs/api.md:1073-1087` documents the same gate. Removing `step` therefore changes closure/release semantics and is larger than simply removing a progress mirror.
- `workflow_path` plus persisted `next_command` is the compatibility path for legacy non-adaptive state in `scripts/kaola-workflow-claim.js:2208-2228`. Current adaptive runs make the value constant and have a mission list, but deleting both without a legacy decision changes how old folders resume.
- Runtime is stamped and edition command surfaces still pass `--runtime`, but no production reader of `workflow-state.md` runtime was found. Removing the state field may be safe for state consumers, but removing the CLI/edition runtime surface is a separate scope decision shared with the other prompt/role/hook explorer.

The minimal dependency order below treats those as explicit decisions, not assumptions.

## Authority and current shape

The issue body for #1032 says the state file is a claim record and explicitly lists active-run fields to delete. It also says Mission List and evidence/finalization receipts are the run-position/evidence records and that no active run should be rewritten retroactively. The latest owner comment refines adaptive delegation economics; it does not authorize a new state schema or a blanket inline replacement.

The repository’s binding guidance agrees with the claim/run split:

- `CLAUDE.md:45-50`: `workflow-state.md` is the claim record; `mission-list.md` is the run record with item/status/dispatched/result; active folders are inventory.
- `docs/architecture-decisions/0017-*.md:57-77`: one run record with four mission-list fields and explicit separation of claim state from run state.
- `docs/workflow-state-contract.md:19-21` describes the same separation, but later sections are stale/contradictory (see below).

The active issue folder currently contains (untracked, pre-existing) state at `kaola-workflow/issue-1032/workflow-state.md`. Its `## Current Position` is `phase: adaptive`, `phase_name: Adaptive`, `workflow_path: adaptive`, `runtime: codex`, `step: start`, `next_command: /workflow-next issue-1032`, and so on; its `## Last Evidence` is startup/folder-claim metadata; `## Last Updated` is a current timestamp; `## Sink` and claim identity follow. The actual adaptive `phase` is not numeric, so the active-folder parser turns it into `null` (the parser calls `parseInt`); this is direct evidence that the field is not a reliable active-folder fact.

## Complete field map

Line numbers below are from the canonical root scripts. The Codex copies are byte-identical where noted; GitLab and Gitea are hand-adapted copies with the same field blocks and are listed explicitly in the copy matrix.

### A. `## Current Position`

| Field | Live producers | Live consumers | Classification | Compatibility/archive consequence |
|---|---|---|---|---|
| `phase` | `scripts/kaola-workflow-claim.js:893-907` (`writeState`); the same claim writer in `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`, `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`, and `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | `scripts/kaola-workflow-active-folders.js:200-228,275-276`; the three forge active-folder copies; `scripts/kaola-workflow-claim.js:2330-2331,2381-2386` resume display (forge claim copies have the equivalent output); the four compact-context scripts at `scripts/kaola-workflow-compact-context.js:85-99` and edition equivalents; `scripts/kaola-workflow-adaptive-schema.js:265-285`/`scripts/test-active-folders-field-parity.js` parity contract | Run-progress mirror; current writer emits constant `adaptive`, not a claim, liveness, or sink fact | Current adaptive state parses to `null` because the active-folder parser expects an integer. Removing it changes resume JSON/text shape and old numeric-phase fixture shape. It is not required for archive safety. |
| `phase_name` | Claim writer only: `scripts/kaola-workflow-claim.js:893-907`; four claim copies | No production reader found; fixtures, contract prose, and historical references only | Static run-progress prose; dead field | No archive or sink dependency found. Remove writer and fixture/contract references with the mechanism. |
| `workflow_path` | Claim writer: `scripts/kaola-workflow-claim.js:885-907`; scalar/bundle callers pass adaptive at `:1338-1360`, `:1785-1804`, and startup bundle path `:1980-1992`; four claim copies | `scripts/kaola-workflow-claim.js:2208-2228` (`reconcileNextCommand`) reads raw state text; equivalent logic exists in GitLab/Gitea claim ports. Structural validators/docs also mention it | Routing/progress mirror, presently constant; not a claim/liveness/sink fact | This is the compatibility gate. The reader uses `workflow_path: adaptive` (or a mission/plan file) to select adaptive fallback; otherwise it trusts persisted legacy `next_command`. Deleting it requires an explicit legacy non-adaptive resume policy. No archive invariant reads it. |
| `runtime` | `resolveRuntime`/writer: `scripts/kaola-workflow-claim.js:64-76,893-907`; callers at `:1338-1360,1785-1804,1980-1992`; four claim copies. Edition sync rewrites command literals for opencode/kimi/cursor/grok/zcode | No `field(...runtime)`, `state.runtime`, or equivalent production state reader found. README/edition tests inspect the CLI/runtime command surface, not state consumption | Diagnostic stamp, with no demonstrated state consumer; not claim/liveness/sink | D2 says retain runtime routing where genuinely consumed. Current state measurement finds none. Do not infer that the separate `--runtime <edition>` command/edition surface can be removed: that is a cross-surface scope decision. Removing only the state stamp requires claim writer, resolver, docs, and direct state fixtures to be reconciled. |
| `step` | Claim writer: `scripts/kaola-workflow-claim.js:893-907`; terminal stamp `:2390-2413` sets `step: complete` at `:2397-2398`; four claim copies; archive path calls stamp at `:2600-2609` and the closure/backstop path at `:4568` | Four compact-context scripts read/print it (`scripts/kaola-workflow-compact-context.js:85-99`); closure invariant `scripts/kaola-workflow-closure-contract.js:92` and three copies; `docs/api.md:1073-1087`; archive/finalize tests and walkthrough assertions | Live value is run-progress; terminal `step: complete` is currently a closure/sink safety fact | Highest-risk field. D2’s deletion list includes `step`, but current code makes `step: complete` part of `archive-state-closed`. Deleting it requires changing the closure contract, archive/finalize tests, docs, and any release-safety gate in one scoped decision. A report-only deletion map cannot choose whether to retain a terminal-only marker or replace the invariant. |
| `next_command` | Claim writer `scripts/kaola-workflow-claim.js:893-907`; terminal stamp `:2404-2409`; sink fallback `:6155-6170` changes `last_result`, not this field; four claim copies | Four active-folder parsers/output objects (`scripts/kaola-workflow-active-folders.js:200-228,275-276` and forge copies); `reconcileNextCommand`/resume output `scripts/kaola-workflow-claim.js:2208-2228,2318-2343,2381-2387`; four compact-context scripts (`:85-99`); three Codex compact-resume scripts (`plugins/kaola-workflow*/scripts/*codex-compact-resume.js:132-161`); parity schema/test; structural tests | Run-progress pointer/hint; no executor consumes it as an instruction in the current adaptive path | Legacy non-adaptive folders can use it when `workflow_path` is not adaptive. Fresh adaptive runs derive their path from the mission/plan and static adaptive fallback. Removing it changes resume output and legacy behavior. Terminal archiving currently neutralizes it to `none (archived)`, so archive tests directly pin the breadcrumb. |
| `next_skill` | Claim writer `scripts/kaola-workflow-claim.js:893-907`; terminal stamp `:2408-2409`; four claim copies | Only Codex compact-resume state readers: `plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js:123-170`, plus the GitLab/Gitea copies; reachability validators `scripts/validate-kaola-workflow-contracts.js:592-611` and edition validators; corresponding hook/config tests | Run-progress handoff hint; no claim/liveness/sink fact | Old archived values can be ignored. Removing it requires compact-resume to stop reading it and validators/fixtures to stop asserting the persisted skill; the surviving packet can be mission-list based. |
| `main_session_role` | Claim writer only: `scripts/kaola-workflow-claim.js:908-910`; four claim copies | No production reader found; test fixtures and docs/historical text only | Static role residue (`orchestrator`); not a claim/liveness/sink fact | No archive/finalize dependency found. Remove writer and inert fixtures. |
| `implementation_owner` | Claim writer only: `scripts/kaola-workflow-claim.js:908-910`; four claim copies | No production reader found; fixtures/docs only | Static owner residue (`N/A`); not a claim/liveness/sink fact | No archive/finalize dependency found. Remove writer and inert fixtures. |
| `fix_owner` | Claim writer only: `scripts/kaola-workflow-claim.js:908-910`; four claim copies | No production reader found; fixtures/docs only | Static owner residue (`N/A`); not a claim/liveness/sink fact | No archive/finalize dependency found. Remove writer and inert fixtures. |
| `inline_emergency_fallback_authorized` | Claim writer only: `scripts/kaola-workflow-claim.js:911`; four claim copies | Four compact-context scripts read/print it at the corresponding `:85-100` block; no behavior gate found | Obsolete policy/progress hint; not claim/liveness/sink | Latest owner refinement makes inline and multi-agent execution both first class, so this field cannot be treated as a dispatch authority. Delete the read/print path and tests with the field; do not invent a replacement policy field. |

#### Current Position producer details

`writeState` is the sole normal constructor for the block. It initializes `phase`, `phase_name`, `workflow_path`, `runtime`, `step`, `next_command`, `next_skill`, the role/owner values, and the fallback flag in one write (`scripts/kaola-workflow-claim.js:852-969`, especially `:893-920`). `claimProject` and `claimBundle` supply the adaptive path/runtime/status (`:1338-1360`, `:1785-1804`); startup’s bundle route does likewise (`:1980-1992`). The generic `updateState` helper (`:971-977`) is not an independent producer of these fields in normal operation: the current branch patch only changes `branch` (`:5482-5499`), while sink fallback changes `last_result` as described below.

`stampTerminalState` is a second producer, but only for terminal/archive bookkeeping: it always writes `step: complete` (`:2397-2398`), writes `last_command`, `last_result`, neutral `next_command`/`next_skill`, and refreshes the timestamp for `status: closed` (`:2404-2411`). It is invoked before moving an archive (`:2600-2609`) and by the closure/backstop path (`:4568`). This distinction is why `step` cannot be classified as disposable solely from its live value.

### B. `## Last Evidence`

| Field | Live producers | Live consumers | Classification | Compatibility/archive consequence |
|---|---|---|---|---|
| `phase_file` | Claim writer only: `scripts/kaola-workflow-claim.js:913-915`; four claim copies | No production reader; fixtures/docs only | Run evidence-pointer residue | No archive/sink dependency found. Remove writer and fixture/schema mentions. |
| `cache_file` | Claim writer only: `scripts/kaola-workflow-claim.js:913-915`; four claim copies | No production reader; fixtures/docs only | Run evidence-pointer residue | No archive/sink dependency found. Remove writer and fixture/schema mentions. |
| `last_command` | Claim writer `:916`; terminal stamp `:2404`; four claim copies | No production reader found | Terminal breadcrumb, not authoritative evidence | Walkthrough tests assert it after archive, but sink/finalize correctness uses sink/closure receipts and validation. Delete writer/stamp/tests that assert the breadcrumb. |
| `last_result` | Claim writer `:917`; terminal stamp `:2405-2406`; sink fallback `:6155-6162` for archived state and `:6168-6170` for live state; corresponding GitLab/Gitea ports (`kaola-gitlab-workflow-claim.js:5821-5833`, `kaola-gitea-workflow-claim.js:5813-5825`) | No production reader found. `sink`, receipt, closure status, and issue labels are consumed instead | Terminal/sink-fallback breadcrumb, not the sink fact itself | Removing this field must leave the actual fallback sink mutation/report intact. Archive tests that only verify result text are retired; retain sink receipt and closure tests. |

`Last Evidence` is therefore not a hidden release authority in the current code. The docs’ claim that the fields are terminal disposition tokens is descriptive only; no reader was found. The authoritative data is the `Sink` block, sink receipt/journal, validation result, and archive/issue status.

### C. `## Last Updated`

| Field | Live producers | Live consumers | Classification | Compatibility/archive consequence |
|---|---|---|---|---|
| `Last Updated` timestamp | Claim writer `scripts/kaola-workflow-claim.js:920`; terminal close refresh `:2411`; four claim copies | No embedded-timestamp reader found. Compact context sorts files by filesystem `mtimeMs` (`scripts/kaola-workflow-compact-context.js:46-60`), and classifier liveness uses `claim_ts`, not this timestamp | Progress/display timestamp, not liveness | No archive/sink authority found. Remove initial and terminal timestamp writes and direct assertions. Issue wording calls it “agent-authored”; source shows script-authored claim/archive stamping, which is a wording contradiction but not a consumer. |

The headings `## Current Position` and `## Last Evidence` are not parsed as sections by active-folder code; parsing is flat key lookup. They can disappear with their fields, provided the surviving `## Project`, claim identity/liveness, and `## Sink` blocks remain valid.

## Retained state that must not be mistaken for deletion candidates

These fields are outside the active-run residue map and have demonstrated consumers:

- `session_marker`: `scripts/kaola-workflow-classifier.js:444-476` classifies mine/co-tenant/stale/ambiguous claims and drives `status`/`resume` reporting.
- `claim_ts`: the same classifier uses freshness (`:470-476`), and sink merge reads current state claim timestamps across branch refs, live state, and archive collision variants (`scripts/kaola-workflow-sink-merge.js:1361-1424`). Receipt loading rejects/reinitializes a stale receipt when its timestamp predates current state (`:1437-1515`, especially `:1478-1492`). GitLab/Gitea sink ports have the same dependency. This is a release/finalization safety authority acknowledged by the claim/sink design and must remain.
- Claim identity, issue/bundle identity, `status`, branch, worktree, sink, run posture, and terminal archive/closure bookkeeping are consumed by claim overlap, active-folder inventory, sink selection, archive-loss protection, and closure. Do not delete them as a side effect of removing the position block.
- `main_root` is emitted in the liveness/sink area and appears in topology fixtures, but no live state reader beyond the documented topology/claim comments was found. It is not safe to remove in this map because the issue explicitly retains branch/worktree resolution and the sink block; parent scope should decide after the separate claim/topology mapping.

## Consumer and copy matrix

### Canonical and forge source copies

| Surface | Paths | Relationship |
|---|---|---|
| Claim writer | `scripts/kaola-workflow-claim.js`; `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Root/Codex copies are byte-identical. |
| Claim writer ports | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`; `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Hand-adapted forge names/paths; retain the same field producers, terminal stamp, and sink-fallback write. |
| Active-folder parser | `scripts/kaola-workflow-active-folders.js`; Codex, GitLab, and Gitea edition copies | All parse/return `phase` and `next_command`; none parse target Last Evidence/Last Updated fields. |
| Claude-style compact packet | `scripts/kaola-workflow-compact-context.js`; Codex support copy; GitLab/Gitea compact-context ports | Generated aggregator family. All read `phase`, `step`, `next_command`, `inline_emergency_fallback_authorized`; none read runtime, phase name, workflow path, next skill, Last Evidence, or Last Updated. |
| Codex compact-resume packet | `plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js`; GitLab/Gitea ports | Reads `name`, `next_command`, `next_skill` (`:123-170`); mission-list goal/items/progress are the intended surviving run packet. |
| Closure contract | `scripts/kaola-workflow-closure-contract.js` plus Codex/GitLab/Gitea copies | Shared/byte-identical family; `archive-state-closed` checks `status: closed` and `step: complete` at `:92`. |

### Hooks and generated/runtime copies

The source-level hook/config consumers are:

- `hooks/hooks.json:4-16`: Claude SessionStart invokes root `kaola-workflow-compact-context.js`.
- `plugins/kaola-workflow/config/hooks.json:3-15`: Codex SessionStart invokes `kaola-workflow-codex-compact-resume.js`.
- GitLab/Gitea config hooks at `plugins/kaola-workflow-gitlab/config/hooks.json:3-15` and `plugins/kaola-workflow-gitea/config/hooks.json:3-15` invoke their Codex compact-resume ports.
- Kimi PostCompact (`scripts/sync-kimi-edition.js:550-573`, with contract assertions in `scripts/test-kimi-edition.js:773-827`), Cursor compact wrapper (`scripts/sync-cursor-edition.js:441-475`), Grok SessionStart compact hook (`scripts/sync-grok-edition.js:317-335`), and ZCode compact wrapper (`scripts/sync-zcode-edition.js:454-470`) all invoke the generated compact-context packet. Their wrappers do not parse state fields themselves.
- `.cursor/hooks/kaola-workflow-compact-context.sh`, `.kimi/hooks/kimi-hooks.toml`, `.grok/hooks/hooks.json`, `.opencode/plugins/kaola-workflow-hooks.js`, and equivalent generated `.zcode` wrappers are runtime copies/launchers, not independent field producers. The current opencode plugin’s `buildResumeContext` reads old `current_phase`/`issue` keys and does not consume the target state keys; this is a separate stale surface rather than evidence that target fields are live.

`scripts/edition-sync.js:51-89,107-132,210-280` materializes shared compact-context and forge ports. `scripts/validate-script-sync.js:14-32,45-86,167-178,287-300` checks common scripts, byte-identical groups, and renamed compact-resume families. A canonical compact-context change therefore has to propagate through edition generation and sync validation; hidden `.zcode-*`/other runtime trees are regenerated/ignored copies, not new source authorities.

Runtime command rewriting is separate: `scripts/sync-opencode-edition.js:512-516`, `sync-kimi-edition.js:520-524`, `sync-cursor-edition.js:355`, and corresponding Grok/ZCode sync paths rewrite `--runtime claude` in command surfaces. This proves runtime routing exists in generated commands, not that a consumer reads `workflow-state.md:runtime`.

## Tests and validation surfaces

The following tests pin the fields or seed them in mechanisms that must be deleted, simplified, or deliberately retained. “Update” means adjust the fixture/expected packet while preserving the test’s independent claim/liveness/sink assertion; “delete” means remove a test whose only purpose is the retired field/mechanism, per `CLAUDE.md` test custody.

| Test/mechanism | Current target-field dependency | Required disposition if the corresponding field is deleted |
|---|---|---|
| `scripts/test-active-folders-field-parity.js:4-19,28,71-99,102-177`; `scripts/kaola-workflow-adaptive-schema.js:265-285` | `SHARED_STATE_FIELDS` includes `phase` and `next_command`; sentinel/parser parity checks compare them across four parsers | Update/delete `phase` and `next_command` from the shared field list, sentinel, and expectations; retain status/identity/sink/liveness parity. This is a schema-contract change, not just fixture cleanup. |
| `scripts/test-bundle-state.js:100-125,131-180` | Bundle fixtures seed `phase`/`next_command`, but assertions exercise issue/bundle parsing | Update fixtures to omit inert fields; retain bundle identity/status assertions. |
| `scripts/test-claim-hardening.js:905-913` | Resume ambiguity fixtures seed numeric phase/next values; assertions focus candidate/project/resume details | Update fixtures/expected resume shape if phase/next output is removed; retain ambiguity/liveness behavior. |
| `scripts/test-claim-hardening.js:1002-1128` (especially `:1079-1107,1125-1128`) | Direct #538/#770 assertions pin adaptive `workflow_path` and exact `next_command` | Delete/update these retired routing-mechanism assertions only after the legacy non-adaptive compatibility decision; replace with a test of the surviving adaptive/mission-list behavior if required by scope. |
| `scripts/test-claim-hardening.js:1276-1315,2062-2101,2133-2177,4700-4707,4842-4850` | Finalize/topology/liveness fixtures seed many target fields; comments show the assertions use Sink or `main_root/session_marker/claim_ts` | Remove target fields from fixtures; retain liveness, topology, closure, and sink assertions. |
| `scripts/test-bundle-finalize.js:132-183,185-229` | State writers seed every progress/evidence field; comments at `:147-149` say tests are bundle closure/archive, not run progress | Simplify fixtures. Preserve closure invariant coverage; `step` remains conditional on the closure-contract decision. |
| `scripts/test-finalize-door.js:102-145,1374-1383,1663-1671,1957-1965` | Planless/topology gate fixtures seed target fields although gates read Sink/validation; direct archive behavior may include `step` | Remove inert fields; retain any `step: complete` fixture only if the current closure invariant is intentionally retained. |
| `scripts/test-sink-merge.js:262-277,5107-5116,5926` | Sink fixtures seed Current Position/Last Updated/last_result alongside claim state; sink logic tests `claim_ts` (`:9-12,575-624`) and archive claim timestamp (`:811`) | Remove target residue, retain `claim_ts` and stale-receipt tests. At `:5926`, remove `last_result` if not asserted; retain `step` only for the closure invariant. |
| `scripts/simulate-workflow-walkthrough.js:267-271,294-345,369-370,681-683,7930,7981-7986,8239-8248,10575-10578,12871-12873` | Direct archive assertions pin `last_command`, `last_result`, neutral next fields, refreshed Last Updated, and retired routing; other fixtures carry workflow path/target fields | Delete/update assertions that only prove terminal breadcrumbs. Keep archive-loss/closure/sink evidence; resolve the `step` invariant before changing the `step: complete` assertions. |
| `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js:274-281,444-476,486-563` | Hook target command is compact-resume; archive assertions pin last_result/next; packet assertions are mission-list based | Keep hook wiring/mission-list packet checks, remove breadcrumb assertions, and update state fixture/packet expectations for removed next fields. |
| GitLab/Gitea simulate walkthroughs (GitLab `:583-591,808-816,868-876`; Gitea `:731-739,895-903,954-962`) | Edition fixtures carry target state values; archive/compact behavior mirrors root | Apply the same fixture/assertion disposition to both ports; do not leave one edition with the retired schema. |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js:103-108,2504,2592,2626,2666,2727,2793,3745-3769,4070-4093`; Gitea equivalent | Initial state fixture carries phase/phase_name/step/next; archive fixtures pin step; Codex compact-resume fixtures pin next command/skill; #579 test is liveness | Remove phase-name/next fixtures and direct retired packet assertions; retain `session_marker`/`claim_ts` liveness checks and conditionally retain closure `step` checks. |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js:1813-1818`; Gitea sink suite analogous around its liveness fixture | Sink fixtures include Last Updated/step while assertions exercise liveness/sink | Remove unrelated target fields; retain claim timestamp and sink receipt tests. |
| `scripts/validate-workflow-contracts.js:168,321`; `scripts/validate-kaola-workflow-contracts.js:164,592-611`; GitLab validator `:519-545`; Gitea equivalent | Structural assertions pin `workflow_path` writer text and `next_skill` derivation/reachability | Update/delete assertions with the mechanism; do not leave validators requiring retired fields. |
| `scripts/test-kimi-edition.js:773-827`; Cursor/Grok/ZCode edition tests (`scripts/test-cursor-edition.js:535-647`, `test-grok-edition.js:405-486`, `test-zcode-edition.js:533-620`) | Hook/config and generated runtime command contracts; runtime tests assert edition runtime command surface, not state Last Evidence | Keep hook invocation tests with the new packet. Treat `--runtime` test changes as a separate runtime-surface decision; do not delete them merely because state runtime has no reader. |

The full validation set named by the repository guidance remains relevant after the scoped update: `node scripts/generate-routing-surfaces.js --check`, `node scripts/simulate-workflow-walkthrough.js`, `npm test`, and script-sync/edition tests. Because the producer/consumer family exists in four editions, run the Claude/Codex/GitLab/Gitea workflow suites and `node scripts/validate-script-sync.js` after propagation. These are validation commands only; this investigation did not execute a product change.

## Backward compatibility and archive/finalize matrix

| Concern | Current fact | Impact of deletion |
|---|---|---|
| Fresh adaptive claim | Claim writer emits constant adaptive values and creates the mission-list/run record | Fresh adaptive execution does not need persisted phase/next fields for actual dispatch; compact packets can derive progress from Mission List. This is an observation, not a retroactive rewrite authorization. |
| Existing adaptive state | Active `phase: adaptive` is parsed as `null` by active-folders; compact hooks still print the literal | Removing the field mostly removes a misleading display field; update resume/compact output contracts. |
| Legacy non-adaptive state | `reconcileNextCommand` checks `workflow_path`/mission record before choosing adaptive fallback; otherwise trusts old `next_command` | Removing workflow path/next command without a compatibility rule changes old resume behavior. Preserve a read-only migration/compatibility path or explicitly scope the break; do not silently assume. |
| Archive close | `stampTerminalState` sets `step: complete`, terminal breadcrumb fields, neutral next fields, and timestamp; closure contract requires status + step | Last Evidence/Last Updated/next can be deleted as breadcrumbs. `step` is coupled to archive safety and needs a separate decision. |
| Abandoned/release/discard paths | `stampTerminalState` sets `step: complete` before returning for non-closed statuses, but the documented invariant is for closed archives | Do not infer that every `step: complete` is a closure proof. Tests must distinguish closed archive from abandoned/release/discard state if the invariant is changed. |
| Sink fallback | Fallback changes sink and writes `last_result`; sink receipt and `claim_ts` are the authoritative safety path | Remove only the breadcrumb write; preserve sink mutation/report and receipt reconciliation. |
| Liveness/stale receipt | Classifier consumes `session_marker`/`claim_ts`; sink merge compares receipt timestamp to current claim timestamp | These are not scheduler residue. Removing them would violate claim/liveness/sink safety and is outside D2 as stated. |

## Minimal dependency order (observed edges, not an implementation choice)

1. Resolve the three gates in this report: whether terminal `step: complete` remains the archive invariant, what old non-adaptive `workflow_path`/`next_command` folders do, and whether runtime means only command routing or also a state field. Record the decision before deleting writers.
2. Remove or update consumers and contracts first: compact-context readers, Codex compact-resume readers, active-folder output/parity schema, `reconcileNextCommand` compatibility branch, closure contract if `step` is removed, and structural validators. Keep Mission List progress/evidence packet behavior intact.
3. Remove the corresponding claim writer fields in all four claim copies. Remove terminal stamp writes only for fields whose archive role was retired; remove sink-fallback `last_result` mutation only as a breadcrumb cleanup while retaining sink/receipt behavior.
4. Regenerate the compact-context/forge generated family through the normal edition machinery and update hook/config/runtime wrappers. Validate that no generated or ignored runtime copy still expects a retired key. Keep independent runtime CLI rewrites unless the parent scope explicitly changes them.
5. Delete or simplify tests with the mechanism: terminal Last Evidence/Last Updated tests, obsolete adaptive route/next-skill structural pins, inert state fixtures, and target fields from sink/liveness fixtures. Retain closure/archive-loss tests, `claim_ts` stale-receipt tests, session-marker classifier tests, sink receipt tests, and Mission List packet tests.
6. Run sync/generated checks, walkthrough, all relevant edition suites, and `npm test`; then inspect the final diff for any tracked state contract/fixture that still claims the retired fields. This investigation itself must remain read-only.

## Contradictions and scope changes to surface to Issue #1032 owner

1. The issue groups `step` with active-run position, but the current closure contract treats terminal `step: complete` as an archive safety invariant. A deletion of `step` is therefore not a pure residue subtraction unless the closure contract changes too.
2. `docs/workflow-state-contract.md` is internally stale: `:45-69` and `:109-115` call state a position/resume pointer and list phase/step/pending gates; `:232-268` documents the Current Position block; `:304-325` later says state records claim identity and nothing else. `README.md:1275,1293` likewise describes next/phase/fallback state while `CLAUDE.md:45-50` says claim only. Documentation must be reconciled as part of the scoped change; the current docs are not evidence of a live consumer.
3. The issue calls Last Updated “agent-authored,” but the code stamps it in the claim writer and terminal archive code (`:920`, `:2411`). The field is still removable based on no readers, but the owner should not use the wording to infer an external authoring contract.
4. Runtime has visible generated command routing (`--runtime` rewrites) but no state reader. Removing `workflow-state.md:runtime` and removing runtime routing are different changes; the latter is not justified by this state-surface map.
5. The claim writer comment around liveness/main-root mentions an adaptive-node reader, but no live state reader for `main_root`/runtime/role/owner was found in the current source. Treat the comment as stale until the separate claim/topology investigation proves otherwise.
6. `workflow-state.md` is flat key/value parsed; section headings do not provide a compatibility namespace. Removing a field removes it from old and new readers alike unless a deliberate compatibility parser is retained.

## Highest-risk consumers for parent review

1. `scripts/kaola-workflow-closure-contract.js:92` and its Codex/GitLab/Gitea copies: `step: complete` is currently a release/archive gate.
2. `scripts/kaola-workflow-sink-merge.js:1361-1515` and forge ports: `claim_ts` is stale-receipt protection and must remain.
3. `scripts/kaola-workflow-claim.js:2208-2228`: `workflow_path`/`next_command` preserve legacy non-adaptive resume behavior.
4. Four compact-context scripts and three Codex compact-resume scripts: the only live display/packet consumers of the removable progress fields, with generated hook copies downstream.
5. Four claim writers plus `stampTerminalState` and sink-fallback paths: all producers must be changed consistently; otherwise fields will be regenerated or terminal state will be partially written.
6. `scripts/test-active-folders-field-parity.js`, structural validators, and walkthrough/archive tests: these encode the retired schema and closure breadcrumbs in different mechanisms and cannot be handled as one fixture-only edit.


# Port notes — #902 and #901's claim-side half, to the gitlab and gitea `claim.js` editions

## Task

Port two already-proven canonical fixes to the two forge editions of `claim.js`:
**#902** (`finalize --check` must agree with the execute path) and **#901's claim-side half** (the
`deferred_to_sink` ignored-evidence NOTE, and the live-copy disposal gate). Measure each defect in
each port before fixing it; prove the fix and the arming per port; introduce no new port-to-port
divergence.

## Verification tier

`tests-green` — the eight named suites pass, and each behaviour change is proven per port with the
five #902 fixture legs (including the mandatory fail-closed negative), three #901 `.gitignore` legs,
three #901 disposal legs with a real negative control, and four scratch-mirror mutants (M1/M2 × 2
ports). **No test file was written or edited** (custody is `tdd-guide`'s). See "Where tests are
needed".

## Files changed

Exactly the two briefed files. Nothing else — not `scripts/kaola-workflow-claim.js`, not
`plugins/kaola-workflow/scripts/kaola-workflow-claim.js`, no `*-sink-merge.js`, no
`templates/routing/`, no `README.md` / `docs/api.md` / `CHANGELOG.md` /
`validate-workflow-contracts.js`, no test file.

- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903/plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903/plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`

`git diff --numstat`: **163 insertions, 25 deletions each** — byte-for-byte the same counts as the
canonical's own `scripts/kaola-workflow-claim.js` diff (`163 / 25`). Work is UNCOMMITTED on branch
`workflow/bundle-900-901-902-903`. Sibling agents' uncommitted edits in the same tree are untouched.

### No new exports

`predictFinalizeAuthority`, `archiveRelFromRoot` and `ignoredArchiveEvidence` are **unexported** in
both ports, exactly as the canonical left them, so the `FORGE_EXPORT_SUPERSET_FAMILY` relation
(`validate-script-sync.js:485-486`) is untouched. `node scripts/validate-script-sync.js` exits **0**
both before and after: *"OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized
families, 2 hooks.json families, and 6 forge export-superset families in sync. committed kernel
parity: 4 Oracle Kernel copies identical at HEAD."*

## The ports carry the canonical text, not a paraphrase

The **added** lines of all three diffs (canonical, gitlab, gitea) are byte-identical after
normalizing the one genuine forge difference — the claim-script name in the stderr NOTE prefix:

| comparison | added lines | `diff` exit | removed lines | `diff` exit |
|---|---|---|---|---|
| gitlab vs gitea | 163 vs 163 | **0** | 25 vs 25 | **0** |
| canonical vs gitlab | 163 vs 163 | **0** | 25 vs 25 | **0** |

(Files: `…/implclaimports/added-{canonical,gitlab,gitea}.txt`,
`removed-{canonical,gitlab,gitea}.txt`.)

## Port-to-port normalized diff — before and after

Normalizer: `…/implclaimports/norm.sh` (folds `gitlab`↔`gitea`, `glab`↔`tea`, merge-request↔pull-request
vocabulary, `mr_`↔`pr_`).

| | whole-file normalized diff |
|---|---|
| BEFORE | **761 lines** (`…/BEFORE-port-to-port.diff`) |
| AFTER | **761 lines** (`…/AFTER-port-to-port.diff`) |

Stronger than the line count: the *content* of the divergence (all `+`/`-` bodies, hunk headers
stripped) is **byte-identical before and after** — `diff` exit **0** on
`BEFORE-divergence-body.txt` vs `AFTER-divergence-body.txt`, 286 lines each. **Zero new divergence
introduced; none removed.**

Every remaining divergence is pre-existing and genuinely forge-specific: GitLab notes API vs Gitea
comments API (`createIssueNote`/`listIssueNotes`/`deleteIssueNote` vs `createIssueComment`/…),
`project_id` + `path_with_namespace` vs `full_name` + `html_url`, `mr_iid`/`mr_url` vs
`pr_number`/`pr_url`, `state: 'opened'` vs `'open'`, `cmdWatchMr` vs `cmdWatchPr`, `glab` vs `tea` in
prose, plus a handful of pre-existing comment-wording differences (gitea's copies are abridged in
several places).

**Region-level** normalized diffs, before and after, over the four bands the fixes touch:

| region | BEFORE | AFTER | note |
|---|---|---|---|
| `archiveProjectDir` band | 11 lines | 11 lines | the one divergence is prose: `watch-mr` vs `watch-pr` |
| `probeFinalizeMirror` / `resolveFinalizeAuthority` / `finalizeAuthorityHint` | **0** | **0** | identical |
| `evaluateFinalizePreconditions` / `--check` emit | **0** | **0** | identical |
| the `archiveDisposition` site in `cmdFinalize` | 17 lines | 17 lines | two pre-existing structural differences (an abridged `#356` comment; gitea's extra `.roadmap`/`ROADMAP.md` residue line) |

## Functions changed, with post-change line refs

Line numbers: **gitlab / gitea**. File lengths after: 5552 / 5544.

### Fix 1 — #902

| # | site | gitlab | gitea |
|---|---|---|---|
| 1 | `probeFinalizeMirror` — contract comment extended with why the bit is needed | :3176-3180 | :3173-3177 |
| 1 | `probeFinalizeMirror` — `destAbsent` on **every** return; `!fs.existsSync(destDir)` hoisted to one `const` | `function` at :3181, `const destAbsent` at :3189 | :3178 / :3186 |
| 2 | `predictFinalizeAuthority` — **new, unexported**, placed after `finalizeAuthorityHint` | :3294 | :3291 |
| 3 | `evaluateFinalizePreconditions` — contract comment rewritten (new token, new return key) | :3413-3430 | :3410-3427 |
| 3 | `evaluateFinalizePreconditions` — consumes the prediction; `pending` → `checks.workflow_state='pending_mirror'`, pushes nothing into `reasons` | :3460-3469 | :3457-3466 |
| 3 | validation-rung comment corrected (a predicted authority carries the same `.cache/`) | :3489-3493 | :3486-3490 |
| 3 | `return { checks, reasons, authority: prediction.topology }` | :3504 | :3501 |
| 4 | `cmdFinalize` `--check` emit — adds `authority`, comment updated | :3509-3525 | :3506-3522 |

`predictFinalizeAuthority` fires only when **all** of: inner reason is exactly
`archive_authority_missing`; `mirror.mainRoot` truthy (linked worktree); `mirror.state === 'ready'`;
`mirror.destAbsent`; and `resolveFinalizeAuthority(mirror.mainRoot, project).livePresent`. Any failure
leaves the original resolution and therefore the original refusal untouched. `dest_dir` is
`projectDir(root, project)` — **the authority is not relocated to main.**

### Fix 2 — #901's claim-side half

| # | site | gitlab | gitea |
|---|---|---|---|
| 5 | `archiveProjectDir` — the disposal gate: `missingSidecars` probe folded into the existing `missing[]` refusal, before `fs.rmSync(src)` | :2271-2292 (`const missingSidecars` :2280) | :2270-2291 (:2279) |
| 6 | `classifyArchiveDisposition` — now uses `archiveRelFromRoot`; **token derivation unchanged**, `deferred_to_sink` preserved; comment explains why the dir granularity is deliberate here | :2387-2409 (`function` :2396) | :2386-2408 (:2395) |
| 7 | `archiveRelFromRoot` — **new, unexported**, the shared relativization | :2412 | :2411 |
| 8 | `ignoredArchiveEvidence` — **new, unexported**, per-FILE `ls-files -o -i --exclude-standard -z`, #520 journals subtracted | :2427 | :2426 |
| 9 | `cmdFinalize` — new `deferred_to_sink` branch: `finalizeTx.archive_ignored_evidence` + stderr NOTE | :4066-4080 | :4061-4075 |

No new token was introduced anywhere: `deferred_to_sink` and `skipped_gitignored` are unchanged, so
the value pinned at `simulate-workflow-walkthrough.js:4818-4819` and documented at
`docs/workflow-state-contract.md:135` is not touched. No git-presence gate was attempted at the
disposal decision (structurally impossible — there is no commit at that point by design).

## New output keys (both ports)

Identical to the canonical's. `checks.workflow_state` gains `pending_mirror` (state token; never in
`reasons`; does not make `ok` false). New `--check`-only top-level `authority` block:
`{ main_root, linked_root, source ∈ live|archive|pending_mirror|none, source_dir, dest_dir }`.
`finalize_transaction.archive_ignored_evidence` (conditional on non-empty). `checks.mirror`'s
vocabulary is unchanged — `destAbsent` is internal to the probe and never emitted.

---

# Evidence

All exit codes read with bare `echo $?` directly on the command, or from `spawnSync().status` in the
Node drivers. Never through a pipe; never `${PIPESTATUS[0]}`. Suites run **serially**.

Scratch base: `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/implclaimports/`

## A. #902 — the defect measured in BOTH ports before the fix

Builder `…/implclaimports/fixture902.js` — the #902 impl agent's builder with `CLAIM_PATH` as the only
axis. Real `git worktree add -b workflow/<p>`, self-host `package.json`, implementation commit on the
branch, main-resident ledger + `.cache/chain-receipt.json` bound to the worktree HEAD,
`KAOLA_WORKFLOW_OFFLINE=1`. Every leg runs `--check` **and then the real transaction from the same
cwd** (the linked worktree). Logs `BEFORE-{gitlab,gitea}-leg{A..E}.log`,
`AFTER-{gitlab,gitea}-leg{A..E}.log`; summarizer `sum.js`.

The premise report had only *located* the construct in both ports (`gitlab:3181`, `gitea:3178`). It is
now measured. **Both ports carried the defect, identically.**

### BEFORE — identical in both ports

| leg | topology | `--check` | execute | agree? |
|---|---|---|---|---|
| **A** | #902: main-resident folder, worktree does NOT carry it, no archive | exit **1**, `mirror: ready`, `workflow_state: archive_authority_missing`, `validation: not_checked`, `changed_paths: []`, `reasons: ["archive_authority_missing"]`, **no `authority` block** | exit **0**, `archived: true`, `validation: chains_green`, `tx.mirror: mirrored`, `tx.archive_commit: deferred_to_sink` | **NO — the defect** |
| **B** | CONTROL — worktree folder seeded | exit 0, `workflow_state: ok`, `validation: chains_green` | exit 0, `archived: true` | yes |
| **C** | NEGATIVE, unrepairable — no live folder in either root, no archive | exit 1, `mirror: source_absent`, `archive_authority_missing` | exit 1, `finalize_gate_unverified`, inner `archive_authority_missing` | yes |
| **D** | NEGATIVE, ambiguous — two matching archives in main | exit 1, `mirror: skipped_post_archive`, `archive_authority_ambiguous` | exit 1, inner `archive_authority_ambiguous` | yes |
| **E** | main source present but **without** `workflow-state.md` | exit 1, `archive_authority_missing` | exit 1, inner **`state_missing`** | **NO — different tokens** |

### AFTER — identical in both ports

| leg | `--check` | execute | agree? |
|---|---|---|---|
| **A** | exit **0**, `workflow_state: **pending_mirror**`, `validation: **chains_green**`, `changed_paths: ["impl.txt"]`, `reasons: []`, `authority.source: pending_mirror`, `source_dir ≠ dest_dir` | exit **0**, `archived: true`, `validation: chains_green`, `tx.mirror: mirrored` | **yes — fixed** |
| **B** | exit 0, `workflow_state: ok`, `authority.source: live`, `source_dir == dest_dir` | exit 0, `archived: true` | **yes, and identical to pre-change behaviour** |
| **C** | exit **1**, `mirror: source_absent`, `archive_authority_missing`, `reasons: ["archive_authority_missing"]`, `authority.source: none` | exit **1**, inner `archive_authority_missing` | **yes — still FAILS CLOSED** |
| **D** | exit **1**, `archive_authority_ambiguous`, `authority.source: none` | exit **1**, inner `archive_authority_ambiguous` | **yes — still fails closed** |
| **E** | exit **1**, `workflow_state: **state_missing**`, `reasons: ["state_missing"]`, `authority.source: pending_mirror` | exit **1**, inner **`state_missing`** | **yes — the tokens now match** |

`checks.validation` is recovered on the #902 topology in both ports: `not_checked` → `chains_green`,
matching what the transaction reports over the identical tree; `checks.changed_paths` recovers with it
(`[]` → `["impl.txt"]`).

`--check` is still read-only: every leg prints `wt project folder exists AFTER check: false` after the
check and before the execute.

Full leg-A envelope, **gitlab** (gitea identical modulo tmpdir):

```json
{"project":"issue-902a","ok":true,"checks":{"mirror":"ready","workflow_state":"pending_mirror","implementation_commit":"not_applicable","staging_guard":"ok","validation":"chains_green","changed_paths":["impl.txt"],"dirty_paths":[]},"reasons":[],"authority":{"main_root":"…/main","linked_root":"…/wt","source":"pending_mirror","source_dir":"…/main/kaola-workflow/issue-902a","dest_dir":"…/wt/kaola-workflow/issue-902a"}}
```

`dest_dir` is the **worktree** tree — the authority is not relocated to main.

## B. #902 arming — two mutants, per port, in scratch mirrors

Mutants built by `…/implclaimports/mkmutant.js` into `mut-<forge>-{M1,M2}/` — a full copy of the
plugin's `scripts/` outside the repo. **Nothing in the tree was edited and reverted** (a sibling's
uncommitted work is here). Logs `MUT-M1-*`, `MUT-M2-*`.

**M1 — blanket suppression** (`reasons.push` skipped for `archive_authority_missing`):

| leg | gitlab with M1 | gitea with M1 | correct |
|---|---|---|---|
| **C** | exit **0**, `reasons: []`, `workflow_state: archive_authority_missing` | same | exit 1, `reasons: ["archive_authority_missing"]` |
| A | exit 0 (unchanged) | same | exit 0 |

**Leg C detects a blanket suppression; leg A does not.** My fix and a suppression are
indistinguishable on leg A alone — which is exactly why leg C is mandatory.

**M2 — the fix disabled** (`const destAbsent = false`):

| leg | gitlab with M2 | gitea with M2 | with the fix |
|---|---|---|---|
| **A** | exit **1**, `archive_authority_missing`, `validation: not_checked` | same | exit 0, `pending_mirror`, `chains_green` |
| **E** | exit **1**, `archive_authority_missing`, `validation: not_checked` | same | exit 1, `state_missing`, `chains_green` |
| C | exit 1, `archive_authority_missing` (unchanged) | same | unchanged |

M2 reproduces the original defect exactly. The `destAbsent` bit is load-bearing for A and E, inert for
C: **armed, and not a suppression.**

## C. #901 piece 1 — the `deferred_to_sink` NOTE, measured end-to-end in both ports

Builder `…/implclaimports/fixture901note.js`. Main-resident run folder + linked worktree, a
**committed** `.gitignore` in main whose body is the only axis, the five evidence files #901 names
plus the two #520 journals under the run's `.cache/`, then the **real** `finalize --keep-worktree`
from the worktree. (The canonical implementer recorded this half as *inferred, not measured*; it is
now measured, on the ports.)

| `.gitignore` | | exit | `tx.archive_commit` | `tx.archive_ignored_evidence` | NOTE on stderr |
|---|---|---|---|---|---|
| `.cache/` — the #901 shape | **before** | 0 | `deferred_to_sink` | **undefined** | **no** |
| `.cache/` | **after** | 0 | `deferred_to_sink` | **6 paths** | **yes** |
| `node_modules/` — NEGATIVE CONTROL | after | 0 | `deferred_to_sink` | undefined | no |
| `kaola-workflow/archive/` — #832 BAND | after | 0 | **`skipped_gitignored`** | undefined | no |

Identical in both ports. Three things this measures rather than infers:

- **The journal subtraction is armed.** Raw `git ls-files -o -i --exclude-standard` under the archive
  returns **8** paths; the reported set is **6**. `sink-receipt.json` and `sink-fallback.json` are
  absent from `tx.archive_ignored_evidence` (grep count 0). A no-op filter would have reported 8.
- **No false positive.** The `node_modules/` control leg reports nothing, with `check-ignore` on the
  archive directory exiting 1 in both the control and the #901 leg — so the axis is the per-FILE
  probe, not the directory probe.
- **#832 preserved and mutually exclusive.** The BAND leg still yields `skipped_gitignored` (dir
  probe exit **0**) and the NOTE does **not** fire; the two branches cannot both run.

The NOTE text, per port (the one deliberate divergence is the script-name prefix):

```
kaola-gitlab-workflow-claim finalize: NOTE: 6 run-evidence file(s) under …/kaola-workflow/archive/issue-901n are covered by this repository's .gitignore while the archive directory itself is not — the sink's archive_commit step force-adds them and verifies each one became a blob: …/.cache/chain-receipt.json, …/.cache/doc-docking.md, …/.cache/doc-updater.md, …/.cache/final-validation.md, …/.cache/run-gaps-manual.md, …/.cache/run-gaps.json
kaola-gitea-workflow-claim  finalize: NOTE: 6 run-evidence file(s) …  (identical thereafter)
```

## D. #901 piece 2 — the disposal gate, measured and arm-proven in both ports

Driver `…/implclaimports/drive-disposal.js`; mirrors built by `mkmirror.sh` into
`mirror-<forge>-{shipped,fixed}/`, each carrying the **identical** `copyDir` mutation
(`KW901_DROP_SIDECAR` names one file to skip). The single axis between shipped and fixed is the
port's disposal gate. Under the shipped `copyDir` the sidecar exemption is unreachable (copyDir is
fully recursive), so mutating it is the only available arming proof. **No repo file was mutated.**

| axis | shipped port | fixed port |
|---|---|---|
| copyDir drops `.cache/final-validation.md` (a **sidecar**) | `archived:true`; **live source DELETED**; the file exists **nowhere** | `archived:false`, `archive_incomplete:true`, `missing:[".cache/final-validation.md"]`; **live source RETAINED** with the file intact |
| copyDir drops `.cache/run-gaps.json` (a **non**-sidecar) | — | `missing:[".cache/run-gaps.json"]`, live retained — the pre-existing byte verifier still does its half |
| **NEGATIVE CONTROL** — mutation present but names nothing (`KW901_INERT=1`) | `archived:true`, all 5 `.cache` files at dest, live deleted | **identical**: `archived:true`, all 5 at dest, live deleted — **no false refusal** |

Identical in both ports. Logs `BEFORE-{gitlab,gitea}-disposal.log`,
`BEFORE-{gitlab,gitea}-disposal-inert.log`,
`AFTER-{gitlab,gitea}-disposal-{sidecar,nonsidecar,inert}.log`.

> **Reading note on my own first attempt at the control leg.** I initially ran it as
> `KW901_DROP_SIDECAR= ` (empty) and the driver's `|| 'final-validation.md'` default silently
> backfilled the positive value, so the "control" was byte-identical to the positive leg and appeared
> to refuse. That was a driver defect, not a measurement. The driver now takes `KW901_INERT=1` and
> **deletes** the variable from the child env; the table above is from the corrected run. A control
> leg that agrees with the positive leg is the signal to check the control, not the code.

## Suites — real exit codes (bare `echo $?`, never through a pipe), run serially

Baseline taken from this worktree immediately before the edits (so a green "after" is green
*including* the sibling agents' uncommitted edits in the same tree — it is not an isolation of mine;
sections A–D are the isolation, where the claim-script path is the only axis).

| suite | before | after |
|---|---|---|
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | **0** | **0** |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | **0** | **0** |
| `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | **0** (112 spawns) | **0** (112 spawns) |
| `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` | **0** (127 spawns) | **0** (127 spawns) |
| `node scripts/simulate-workflow-walkthrough.js` (**FULL scope**, not the 1/12 shard) | **0** — 184/184 scenarios, 1958 spawns | **0** — 184/184 scenarios |
| `node scripts/validate-script-sync.js` | **0** | **0** |
| `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | — | **0** |
| `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | — | **0** |
| `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js` | — | **0** |
| `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js` | — | **0** |
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | — | **0** |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | — | **0** |
| `node scripts/test-active-folders-field-parity.js` | — | **0** |
| `node --check` + `require()` on both ports | — | **0** (all four) |

The last seven were added beyond the brief because both fixes change an *edition's* emitted envelope
and archive lane, and those are the validators and walkthroughs that read them. Logs
`BEFORE-*.log` / `AFTER-*.log`, roll-ups in `BEFORE-suites.txt` / `AFTER-suites.txt`.

## Structural divergence that forced adaptation

Almost none — the four bands the fixes touch turned out to be line-for-line the same in both ports
*and* the same as the canonical's pre-change text, so the port is a literal application. Three
adaptations, all naming-only:

1. **The stderr NOTE prefix** is `kaola-gitlab-workflow-claim` / `kaola-gitea-workflow-claim`, matching
   the adjacent `skipped_gitignored` WARNING in each port. This is the only textual divergence from
   the canonical's added lines.
2. **No blank line before `function cmdFinalize()`** in either port (the canonical has one). Pre-existing
   port formatting, preserved rather than converged.
3. **The canonical's extra `#832` comment line at its `:4275`** ("…escapes the worktree. The archive's
   fate is recorded honestly below (archiveDisposition)…") is absent from both ports. Pre-existing;
   I did not add it, since doing so would have been an unbriefed convergence edit.

## What I deliberately did NOT change, and why

1. **`archiveRequiredContent`'s dead retired-Node-Ledger code** in both ports (`plan_hash` probing, a
   `workflow-plan.md` demand, a lazy `require` of the vanished `listRecordedNodeEvidence`). Out of
   scope per the brief; it gets its own issue. It is inert and did not affect any measurement here.
2. **`classifyArchiveDisposition`'s token derivation** — `deferred_to_sink` preserved, per the brief
   and the canonical's decision. Adding a third token would break
   `simulate-workflow-walkthrough.js:4818-4819` and `docs/workflow-state-contract.md:135`.
3. **A git-presence gate at the disposal decision** — structurally impossible; there is no commit at
   that point by design.
4. **`verifyArchiveComplete`'s sidecar exemption** and `ARCHIVE_CACHE_SIDECAR_MD` — untouched; the new
   condition is presence-only, at the disposal decision.
5. **No `operator_hint`, no `owner`/`actionable`/severity field, no new `checks.mirror` token** — same
   reasoning as the canonical; additive derivation, and the observed failure is the false obligation.
6. **The live probe was not widened to search the main root** — that would make `--check` name main as
   the authority while execution names the worktree: the same defect inverted.
7. **No refusal added anywhere** by fix 1; fix 2's disposal refusal only fires where the alternative
   is destroying the only copy of a file.
8. **`plugins/kaola-workflow/scripts/kaola-workflow-claim.js`, `scripts/kaola-workflow-claim.js`, both
   `*-sink-merge.js`, `templates/routing/`, `README.md`, `docs/api.md`, `CHANGELOG.md`,
   `validate-workflow-contracts.js`** — other agents' write sets.

## Where tests are needed (for `tdd-guide` — I authored none)

**Each edition's suite defends its own copy, so a canonical pin does not cover a port.** The gaps
below need arms in `plugins/kaola-workflow-gitlab/scripts/` and
`plugins/kaola-workflow-gitea/scripts/` (`test-gitlab-sinks.js` / `test-gitea-sinks.js` and the two
forge walkthroughs), not only in the canonical suites. Everything in sections A–D is uncovered today.

Priority order, matching what the ports now do:

1. **The #902 topology (leg A), per edition** — a linked-worktree fixture with the worktree project
   folder **deliberately unseeded**: `--check` from the worktree must exit 0 with
   `checks.workflow_state === 'pending_mirror'`, `reasons` empty, `archive_authority_missing` absent.
   This is the one axis no existing fixture varies (the canonical's three `--check` fixtures all seed
   the folder into both roots; I found no forge fixture that varies it either).
2. **The fail-closed negative (leg C), per edition** — no live folder in either root, no archive:
   `--check` must still exit 1 with `archive_authority_missing` in `reasons`. **Without this arm, arm
   1 passes identically against a blanket suppression** — proven by mutant M1 on both ports.
3. **The ambiguous arm (leg D), per edition** — `archive_authority_ambiguous` must survive the mirror
   prediction untouched.
4. **check-vs-execute agreement where they used to differ (legs A and E), per edition** — leg E is the
   sharper one: the two surfaces named *different tokens* for the same tree before the fix.
5. **The `authority` block, per edition** — `linked_root` non-null only on a linked worktree, `source`
   cycling through `live`/`archive`/`pending_mirror`/`none`, and `dest_dir !== source_dir` **exactly**
   on `pending_mirror`.
6. **The cwd axis** — a fixture that runs `--check` from **both** cwds and asserts they agree would
   have caught #902 directly, and has the widest reach.
7. **#901's `archive_ignored_evidence`, per edition** — the `.cache/` basename leg must set
   `finalize_transaction.archive_ignored_evidence` naming every covered file; the `node_modules/` leg
   must set nothing; the `kaola-workflow/archive/` BAND leg must still yield `skipped_gitignored` and
   must **not** set it. And `archive_ignored_evidence` must never name a #520 journal (assert on the
   *count* against the raw `ls-files -o -i` set, or a no-op filter passes).
8. **#901's disposal gate, per edition** — a lossy `copyDir` dropping an `ARCHIVE_CACHE_SIDECAR_MD`
   file must yield `archive_incomplete:true` naming it and must retain the live source, **plus** an
   inert-mutation negative control asserting no false refusal. Note this needs a **seam** to make the
   copy lossy; my proof used a scratch mirror with a doctored `copyDir`, which an in-repo suite cannot
   do. The tidy in-repo alternative is a `KAOLA_WORKFLOW_FORCE_*` env seam, and **adding one is a
   design call I did not make unilaterally** — whoever writes this should decide it first.

## Anything I could not verify

- **The doc surfaces appear already covered by the sibling doc pass, and I did not audit them.** At the
  time I checked, `docs/api.md` documents `pending_mirror`, the whole `authority` block
  (`:230-245`) and `finalize_transaction.archive_ignored_evidence` (`:687`); `CHANGELOG.md` carries
  both entries; and `templates/routing/finalize.skeleton.md` now says *"clear everything in `reasons`"*
  with an explicit "a token in `checks` that `reasons` does not repeat is not yours to clear". That
  prose is edition-neutral, so it reaches the forge editions as written — but those files are a
  sibling's write set and I verified only that the tokens are present, not that every statement about
  them is accurate.
- **A symlinked `workflow-state.md` in the main source** — `mergeCopyDir` skips symlinks, so execution
  would land on `state_missing` while the prediction resolves the symlink and could report
  `state_invalid_type`. Both fail closed at exit 1, but the *token* could differ on that one shape.
  Not built; carried over unchanged from the canonical's record.
- **Non-linked-worktree reachability** — both paths short-circuit to `not_needed` when
  `mainRoot === realpath(root)`, and the prediction additionally requires `mirror.mainRoot`, so an
  in-place run cannot enter it. Not separately measured.
- **The `opencode` / `kimi` editions** — not examined; they are additive runtime editions and were not
  in my write set. If either vendors its own `claim.js` copy, it is unported.
- **`npm test` (the four chains) and the fast gate** — not run. Chain selection belongs to the producer
  at finalize, and a chain run now would be stale the instant a sibling lands.
- **The real forge round-trip** — every fixture ran with `KAOLA_WORKFLOW_OFFLINE=1`, so remote closure
  is skipped (`claim_label_removed: skipped_offline`, `issue_disposition: close-pending`). Neither fix
  touches the remote lane, but the forge-CLI path is unexercised by my measurements. The forge suites,
  which do exercise it with their own CLI mocks, are green.
- **`checks.dirty_paths` was empty in every fixture leg** (clean fixture trees), so the interaction
  between the new `authority` block and a dirty run root is untested here.

# Implementation: #906 + #907 in `kaola-workflow-claim.js` (all four editions)

Verification tier: **tests-green** (behavioural change; the authored suites pass, and every guard
added is mutation-proven in a scratch mirror).

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-904-905-906-907-908-909-910/`
Nothing committed. Nothing outside the four claim scripts was written.

---

## Files changed (only these four)

| edition | path |
|---|---|
| canonical | `scripts/kaola-workflow-claim.js` |
| Codex | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (byte-identical `cp`, md5 verified) |
| GitLab | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (HAND-ported) |
| Gitea | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` (HAND-ported) |

`md5 -q scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
→ both `d42d5c31076313691564e6d4a1667ac9` at the time of the run below.

The GitLab and Gitea ports were applied by an exact-match script that asserts an occurrence count of
1 per hunk and aborts loudly on a miss, then verified by **running** each edition, never by diffing.

---

## GOAL 1 — #906 route 1: the #395.4 backstop moves aside instead of deleting

| edition | the backstop | the move |
|---|---|---|
| canonical / Codex | 4180–4227 | `fs.renameSync` at **4213** |
| GitLab | 3968–4015 | **4001** |
| Gitea | 3965–4012 | **3998** |

**What it does now.** When main's live folder survives a #395.4 crash, it is renamed to
`<archive-authority>/.orphan-main-live-<ISO-ts>/` instead of `fs.rmSync`'d. Exit stays 0; the run
still closes; nothing refuses.

**Design decisions, and why.**

1. **Nested INSIDE the resolved archive authority, not beside it.** The premise proposed
   `kaola-workflow/archive/<project>.orphan-<ts>` and flagged the sink interaction as unmeasured. I
   measured it (see "flagged risk" below) — the sibling placement **blocks the sink**. Nesting also
   makes authority ambiguity structurally impossible: `findArchiveAuthorities` scans archive-band
   entry NAMES at depth 1, and a nested directory is at depth 2, so no suffix rule can ever collide.
2. **Only when the authority sits under MAIN.** Otherwise `result.main_live_orphan =
   'skipped_authority_outside_main'` and main's folder is left exactly where it is. Reason: an
   authority in the linked worktree (only reachable for an archive predating #832's one-resolution
   rule) is a tree `removeWorktree` force-removes ~40 lines later, so moving into it would be a *new*
   destruction route wearing a rescue's name.
3. **A failed rename reports and leaves the folder alone** (`main_live_orphan: 'failed'` +
   `main_live_orphan_error`). Worst case is the phantom claim the operator can see, never a loss.

**New envelope fields:** `main_live_orphan` (`moved` | `failed` | `skipped_authority_outside_main`),
`main_live_orphaned_to`, `main_live_orphan_error`. `main_live_cleaned_on_resume: true` is retained
and is now set only when the move actually succeeded. Nothing in the repo pinned it (grepped).

**Also corrected, because the new code branches on it:** the comment at canonical `:4134-4139` said
the backstop's destination was worktree-aware (`main` for a plain linked run, the linked worktree for
`--keep-worktree`). That is **stale** — #832 (`archiveProjectDir`, canonical `:2470-2482`) replaced it
with one rule: a linked run archives under MAIN regardless of cwd and regardless of `keepWorktree`.
The comment was corrected rather than left.

### FLAGGED RISK — measured, and it decided the design

`impl-sink-orphan.js`: three fixtures identical except where the orphan sits, each run through the
real `scripts/kaola-workflow-sink-merge.js --sink`:

```
C_control  (no orphan)                                        exit=0  status="sinked"
A_nested   archive/<project>/.orphan-main-live-<ts>/…         exit=0  status="sinked"
           orphan paths COMMITTED at HEAD:
             kaola-workflow/archive/<p>/.orphan-main-live-<ts>/.cache/ONLY-IN-MAIN.md
             kaola-workflow/archive/<p>/.orphan-main-live-<ts>/workflow-state.md
B_sibling  archive/<project>.orphan-<ts>/…                     exit=1  result="refuse"
           reason="sink_blocked"
           foreign_dirt=["kaola-workflow/archive/<p>.orphan-<ts>/.cache/ONLY-IN-MAIN.md",
                         "kaola-workflow/archive/<p>.orphan-<ts>/workflow-state.md"]
```

So the premise's flagged risk is **real for the sibling placement and absent for the nested one**.
Nested, the orphan is covered by the #893 own-archive-mirror exemption
(`sink-merge.js:1569-1591`, keyed on the `kaola-workflow/archive/<project>/` prefix) and the sink's
`archive_commit` step **commits it** — the rescued evidence ends up in git history, not just on disk.
No change to `sink-merge.js` was needed, and none was made.

### Dead code at `archiveStateStamped = 'repaired'` — KEPT, with the finding recorded in the source

Canonical `:4145`, GitLab `:3945`, Gitea `:3942`. The premise is right that it is unreachable from
`cmdFinalize`, and I can strengthen its confidence: `destDir` resolves to `finalizeAuthorityDir`
because `:4087` assigns `result.dest = result.dest || finalizeAuthorityDir` **before** the backstop,
and `resolveFinalizeAuthority` already refused `archive_state_not_closed` against that exact file.

**I kept it.** It is a crash-repair backstop; "the ordinary path cannot produce this state" is the
weakest possible argument for removing one, and no observed failure demands the subtraction. What I
did instead is record the reachability finding as a comment at the site, so the next reader does not
re-derive it. If the orchestrator wants it deleted, that is a one-line change and a value call.

---

## GOAL 2 — #906 route 2: "cannot be compared" is now distinguishable from "bytes differ"

**`verifyArchiveComplete` gains a THIRD key, `uncomparable[]`** — canonical `:5494` / `:5510`,
GitLab `:5203` / `:5219`, Gitea `:5197` / `:5213`.

- `uncomparable` is a **strict subset of `mismatched`**, never a replacement. Every existing reader
  and every existing pin keeps the exact answer it had; a reader needing the distinction subtracts.
  This is why **no third comparison reader was added** — still one walk, one call, one answer. It is
  also why #699 (`test-bundle-finalize.js:1494`) and #941 (`test-claim-hardening.js:4056`), which the
  premise flagged as expecting entry-kind faults in `mismatched[]`, did not have to move.
- It carries the source-side kind fault (`invalid[]`, incl. symlinks and the `<root>` sentinel) and
  the dest-side kind fault at the byte-compare step.

**The `mainLive` leg now reads it** — canonical `:2550-2568`, GitLab `:2327-2345`, Gitea `:2326-2344`
— with the *same* two subtractions the missing[] half gets (journal names, repo-wide ignored names;
a probe fault yields the empty set so an unprobeable repo refuses rather than destroys).

`missingArchiveSidecars`' `isFile()` filter (premise leg R4) needed **no change**: a symlink is not
`isFile()` under `withFileTypes`, so the sidecar-skip in the walk does not fire for it either, and it
reaches `invalid[]` → `uncomparable[]`. One change closes R2, R3, R4 and R5.

### An additional defect this exposed, and fixed — the refusal named NOTHING

First end-to-end run: R2–R5 refused correctly and **reported an empty list**. `cmdRelease`, `watch-pr`
and the abandon sweep reported `missing` only; an uncomparable entry refuses with an EMPTY `missing[]`.
`cmdFinalize` has reported both halves since #676; these three — the three routes that run no Step-8a
mirror, i.e. exactly where a main-only entry appears — did not. Fixed at canonical `:4749`, `:5706`,
`:5801` (GitLab `:4498`/`:4885`/`:4980`, Gitea `:4493`/`:4880`/`:4975`).

### Measured, all four editions (`impl-route2-verify.js`, linked-worktree `release`, `KAOLA_WORKFLOW_OFFLINE=1`)

```
PASS  C0_clean          exit=0  archive  mainGone=true
PASS  C1_file           exit=1  refuse   entrySurvived=true  missing=[".cache/EXTRA.md"]
PASS  R1_cache_link     exit=1  refuse   entrySurvived=true  missing=[…] mismatched=[".cache/link-evidence.md"]
PASS  R2_top_link       exit=1  refuse   entrySurvived=true  mismatched=["extra-link.txt"]
PASS  R3_notes_link     exit=1  refuse   entrySurvived=true  mismatched=["notes-link.md"]
PASS  R4_sidecar_link   exit=1  refuse   entrySurvived=true  mismatched=[".cache/final-validation.md"]
PASS  R5_dangling       exit=1  refuse   entrySurvived=true  mismatched=["mission-list.md"]
```
identical on canonical, codex, gitlab, gitea. `ROUTE 2: all legs behaved as specified.` exit 0.

- **C0 is the anti-blanket-refusal control**: a clean linked `release` still archives at exit 0.
- **C1 is the POSITIVE CONTROL for the environment**: an ordinary main-only file refuses under the
  *identical* `KAOLA_WORKFLOW_OFFLINE=1`, so the offline flag is demonstrably not what arms or
  silences the comparison under test.

---

## GOAL 3 — the cross-edition name-set divergence, converged

GitLab `:5117` and Gitea `:5111` listed three fixed names (`'workflow-plan.md'`, `'workflow-state.md'`,
`'finalization-summary.md'`); canonical/Codex list four. Both ports now read
`adaptiveSchema.MISSION_LIST_FILE` and `adaptiveSchema.PLAN_FILE` — the constants, so the set is closed
by construction rather than by a fourth hand-typed copy. Both ports already required `adaptiveSchema`.

Oracle (`four-editions.js`, all four exported `verifyArchiveComplete` over one identical fixture,
`M`=missing[] `X`=mismatched[] `U`=uncomparable[]):

```
probe                       kind     canonical codex     gitlab    gitea
mission-list.md             symlink  MXU       MXU       MXU       MXU
workflow-plan.md            symlink  MXU       MXU       MXU       MXU
finalization-summary.md     symlink  MXU       MXU       MXU       MXU
notes.md                    symlink  -XU       -XU       -XU       -XU
mission-list.md             dangling -XU       -XU       -XU       -XU
.cache/evidence.md          symlink  MXU       MXU       MXU       MXU
.cache/final-validation.md  symlink  -XU       -XU       -XU       -XU
.cache/evidence.md          file     M--       M--       M--       M--
.cache/final-validation.md  file     --- ok    --- ok    --- ok    --- ok
CONVERGED: all four editions agree on every probe.
```

Last row confirms T6g's exempt-sidecar blindness is preserved exactly.

### HONEST CAVEAT — after GOAL 2, GOAL 3 is no longer independently load-bearing

The `names` mutation (ports reverted to three names) makes the direct probe diverge again
(`mission-list.md` symlink: `MXU` canonical vs `-XU` gitlab/gitea) — but the **end-to-end R5 leg still
passes on the mutant**, because the entry now reaches `uncomparable[]` regardless of the name set.
Working through it: a main-only *plain file* is required via the walk's `sourceFiles` no matter what
the name set says; a non-plain-file entry now reaches `uncomparable[]`; an unreadable subtree pushes
`'<source>'` into `invalid[]` → `uncomparable[]`. So after GOAL 2 the residual behaviour the name set
alone decides is an *empty directory* named `mission-list.md`, which carries no evidence.

The convergence is still correct and still worth having — it is a real divergence in shipped source
and a one-rule-one-wording violation — but it is a **parity fix, not a second destruction fix**, and
the discriminating oracle is the direct four-edition probe, not the release door. Stating this so
nobody records a stronger claim than the measurement supports.

---

## GOAL 4 — #907: the swallowed `git add` failure now reports

Canonical `:4620-4657` (ledger default at `:3928`), GitLab `:4369-4406` / `:3733`,
Gitea `:4364-4401` / `:3730`.

**Posture: REPORT, NOT REFUSE — exit stays 0.** On a failed residue `git add`:

- `finalize_transaction.residue_stage` = `'failed'` (new ledger step; default `'skipped'`,
  `'staged'` on success)
- `finalize_transaction.residue_stage_detail` — git's own `fatal: …`, captured by switching that one
  call's stderr from `inherit` to `pipe`, and **re-emitted on this process's stderr** with a WARNING
  prefix so a terminal reader loses nothing the inherited form used to show
- `finalize_transaction.residue_unstaged` — the paths (capped at 50)
- **durably**: `## Finalize Findings` appended to `result.dest/finalization-summary.md` via the
  existing `appendSummarySection` (idempotent by heading, swallow-on-error, like every other summary
  writer). On a linked run `result.dest` is under MAIN, outside the worktree index, so this write
  dirties nothing the commit below weighs; the sink's `archive_commit` lands it.

The parse half was fixed upstream in the kernel by another agent; this half covers every *other*
cause of a failed stage — disk-full, permissions, a held index lock — which the parse fix cannot reach.

**`finalize --check` `dirty_paths`** (the related item): fixed, and the fix is the **kernel's**
`parsePorcelainPaths`, not mine. Verified end-to-end on a linked worktree:

```
git status --porcelain  →  ?? "notes.md "
finalize --check         →  dirty_paths=["notes.md ","src/"]
                            exists on disk? "notes.md " -> true
```
The literal name, with its trailing space, and it exists. The premise's measured defect (a reported
path that is not on disk) is gone.

---

## GOAL 5 — path readers and the duplicated regexp

**Converted to `-z` + `splitNulPaths`** (the three that can genuinely see a path):

| site | canonical | GitLab | Gitea |
|---|---|---|---|
| `probeImplementationCommit` net diff | 3392 | 3198 | 3195 |
| `probeImplementationCommit` history | 3407 | 3213 | 3210 |
| `checkFinalizeStagingGuard` staged set | 3426 | 3232 | 3229 |

`log --name-only --pretty=format: -z` was **measured**, not assumed: paths verbatim and
NUL-terminated, with an empty record between commits, which `splitNulPaths` drops.

**Documented, NOT converted** (ref-name streams, canonical `:2609` and `:5298`; GitLab `:2386`/`:5589`;
Gitea `:2385`/`:5580`): each carries the two measurements that make the split lossless — verbatim
`%(refname)` output, and git's own refusal of LF/TAB/space/`\` in a ref name. Converting them would be
churn on a hand-ported file for no behaviour.

**Journal regexp: one definition.** `SINK_JOURNAL_RE` at canonical `:49` / GitLab `:44` / Gitea `:44`;
the three copies now read it (canonical `:2555`, `:2753`, `:4603`).

**Deliberately not touched:** `ignoredArchiveEvidence` already splits a `-z` stream with
`out.split('\0').filter(Boolean)` and its comment states it is kept byte-identical to the sink's two
`-z` readers. Switching it to `splitNulPaths` alone would falsify that comment on a file I do not own
(`sink-merge.js`). Only the regexp there was hoisted. Flagging the choice rather than making it
silently.

---

## Verification

### Baseline (before any edit)

```
node scripts/test-claim-hardening.js                                 exit 0  (557 assertions)
node scripts/test-finalize-door.js                                   exit 0  (233 assertions)
node scripts/simulate-workflow-walkthrough.js                        exit 0  198/198 scenarios, FULL scope
node scripts/validate-script-sync.js                                 exit 0
node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js   exit 0
node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js     exit 0
```

### After

```
node scripts/simulate-workflow-walkthrough.js     exit 0
    {"scenarios":198,"ran":198,"passed":198,"failed":0}      FULL scope, not a shard
node scripts/test-claim-hardening.js              exit 0   claim-hardening tests passed (557 assertions)
node scripts/test-finalize-door.js                exit 0   finalize-door tests passed (301 assertions)
node scripts/test-bundle-finalize.js              exit 0   all 149 tests passed
node scripts/test-sink-merge.js                   exit 0   423 assertions
node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js   exit 0
node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js     exit 0
node scripts/validate-script-sync.js              exit 1   -- NOT MINE, see below
```

`test-finalize-door.js` grew 233 → 301 assertions during this work: the test author landed **T9
(#907)**, which drives the hazard-named-residue false green across all four editions plus a T9c/T9d
"unstageable file" leg per edition. It is green. I read it and did not touch it.

### `validate-script-sync.js` exit 1 — pre-existing, not from these files

```
Out of sync (scripts/ vs plugins/kaola-workflow/scripts/):
  - validation-runner module copies: plugins/kaola-workflow/scripts/kaola-workflow-validation-runner.js …
  - validation-runner module copies: plugins/kaola-workflow-gitlab/scripts/… 
  - validation-runner module copies: plugins/kaola-workflow-gitea/scripts/…
```

`kaola-workflow-claim.js` is **absent from the list** — canonical↔Codex byte parity holds. The three
named files are an in-flight change by another agent (`git status` shows them modified alongside
`scripts/test-validation-runner.js`). It was exit 0 at my baseline, so it broke during the session and
not from my write set. **The orchestrator must re-run this at the end**; I cannot clear it from here.

### Behavioural drives (all four editions, every one re-run against the final tree)

```
impl-route2-verify.js   exit 0   ROUTE 2: all legs behaved as specified.
impl-route1-verify.js   exit 0   ROUTE 1: all legs behaved as specified.
four-editions.js        exit 0   CONVERGED: all four editions agree on every probe.
impl-sink-orphan.js     exit 0   C_control sinked / A_nested sinked+committed / B_sibling sink_blocked
```

Route 1 asserts five things per leg, on each of `finalize` and `finalize --keep-worktree`:
exit 0 + `status:"closed"`; main's live folder no longer at `kaola-workflow/<project>`; **`status --json`
run from MAIN reports `count: 0`** (the claim is measured cleared, not inferred); the main-only
evidence file still readable at the orphan path; and `finalize --check` still `ok:true` afterwards
(the moved folder created no second archive authority).

### Mutation proofs — every guard, in a scratch mirror

Mirror at `…/scratchpad/mirror` (`cp -R scripts plugins`); rebuilt between mutations. **No
`git checkout --`, no `git stash`** — the worktree is shared with other agents.

| mutation | reverts | result |
|---|---|---|
| `route2` | the `mainLive` leg stops reading `uncomparable[]` | R2–R5 go **exit 0, archived, entry DESTROYED** on all four editions — 16 failures. Exactly the premise's baseline. C0/C1/R1 stay green, so the mutation is surgical. |
| `route1` | `renameSync` → `rmSync` | `evidenceSurvived=false` on all four editions, both legs — 8 failures. `mainLiveGone`/`activeFromMain=0`/`checkOk` stay true, i.e. the *claim-clearing* half was never what changed. |
| `names` | ports lose `mission-list.md` | direct probe diverges again (`MXU` vs `-XU`). End-to-end R5 still passes — see the honest caveat under GOAL 3. |
| `stage` | the whole #907 report → `catch (_) {}` | `test-finalize-door.js` **exit 1**: T9c and T9d(codex/gitlab/gitea) all red, on both the envelope assertion and the durable-summary assertion. |

Mirror control (unmutated) ran `test-finalize-door.js` at exit 0 first, so the mutant reds are
attributable to the mutation and not to the mirror.

---

## Not done / needs an owner outside my write set

1. **`docs/api.md` needs the third key.** `:629` still says *"`mismatched` names files that arrived
   with different bytes"* — already inaccurate before this change (it carried entry-kind faults) and
   now there is a named half for exactly that. `:1309` lists `verifyArchiveComplete` among the
   exported API. `docs/api.md` is test-consumed by `validate-workflow-contracts.js` (which does not
   assert on this shape — checked) and, per prior sessions, editing it stales a chain receipt. Not in
   my write set; **needs a docs owner.**
2. **`CHANGELOG.md` under `[Unreleased]`** — new envelope fields (`main_live_orphan`,
   `main_live_orphaned_to`, `main_live_orphan_error`, `finalize_transaction.residue_stage` +
   `residue_stage_detail` + `residue_unstaged`), the new `uncomparable[]` key, and `mismatched` now on
   the release / watch-pr / sweep refusals. Not in my write set.
3. **`validate-script-sync.js` is red on `kaola-workflow-validation-runner.js`** (three copies), from
   another agent's in-flight work. Must be green before the run closes.
4. **Not attempted, and outside this brief:** the premise for #907 identifies further live path-reader
   defects the issue does not name — `sink-merge.js:1449` (preflight bucket classifier, fails CLOSED
   and un-clearable), `run-chains.js:628/630` (`isEditionCouplingPath` fails open), and the `.git`
   **gitlink** subtree block. All are in files owned by other agents.

## Where the premise reports were wrong or incomplete, loudly

- **`premise-906.md` under-measured the move-aside.** Its own "open, unmeasured" item — whether the
  orphan trips the sink — is **real and decisive**: the `.orphan-<ts>` *sibling* placement it proposed
  produces `sink_blocked` with the orphan named as foreign dirt (measured above). The suffix-collision
  constraint it did measure (`.archived-` → `archive_authority_ambiguous`) is correct but is not the
  binding constraint; the sink is.
- **`premise-906.md`'s inference that Route 2's fix "must also close `missingArchiveSidecars`'
  `isFile()` filter" is wrong.** It does not: the sidecar-skip in `verifyArchiveComplete`'s walk is
  *also* `isFile()`-gated, so a symlink named as an exempt sidecar is not skipped and reaches
  `invalid[]`. Leg R4 is closed by the `uncomparable[]` read alone — verified end-to-end on all four
  editions. `missingArchiveSidecars` was not touched.
- **`premise-906.md` did not notice that the release/watch-pr/sweep refusals report `missing` only**,
  so its Route-2 fix as specified would have refused while naming nothing. Found by running it.
- **A stale comment at canonical `:4134`** (backstop destination "worktree-aware") contradicts #832
  and was corrected.
- **`premise-907.md` is accurate everywhere I worked**, including its appendix's reachability
  correction (the staging block is `--keep-worktree` + linked-worktree only). Its line numbers for the
  five claim.js readers matched HEAD.

---
---

# ROUND 2 — adversarial review findings R1 (blocking) and R2

Verification tier: **tests-green**. Both findings reproduced FAILING with the reviewer's own
harnesses before any edit, and PASSING after; both fixes mutation-proven in a scratch mirror.

Same four files, still the only ones touched. Nothing committed.
Canonical↔Codex md5 after: `b4e9240fcf0f731e5bd8e24ecb8cd215` (both).

**I did NOT need to touch `run-chains.js` or `resolveRecordFolder`.** The lead's stop-condition does
not fire: R1 is a destruction, and the destruction is entirely inside Step 8a's mirror. Proven rather
than argued — the mirror change alone turns the reviewer's `w910.js` from `chains_stale` to
`chains_green`, with `w910ctl.js` (the green control) unchanged. The two resolvers are consistent with
each other and neither destroys anything; even if their local-first rule were reconsidered later, a
mirror that overwrites a newer artifact would still be a bug.

---

## R1 — the Step 8a mirror no longer overwrites a tree-bound artifact

### Reproduced FAILING first (reviewer's harness, unmodified, before any edit)

```
$ node scratchpad/adv/w910.js
STEP A: run-chains from the worktree      -> receipt in MAIN
STEP B: finalize --keep-worktree          -> exit 1 implementation_commit_missing
                                             wt run folder now: true   wt receipt now: true
STEP C: commit + re-run the chains        -> main 959a31b7…  wt 5051d3c9…  LANDED -> WORKTREE
STEP D: finalize again
  validation = { "classification": "chains_stale", "green": false,
    "detail": ["chain receipt codeTreeHash \"959a31b7…\" != current code-tree hash \"5051d3c9…\""],
    "stale_paths": ["src/app.js","src/pending-good.js"], "stale_kind": "code" }
```

### The change

| file | what |
|---|---|
| canonical `:3190-3215` | `mergeCopyDir(src, dest, keepExisting, keepExistingRel, relBase)` — a second skip set keyed on a POSIX path RELATIVE TO THE MIRROR ROOT, and unlike `keepExisting` it IS carried through the recursion |
| canonical `:3220-3236` | `FINALIZE_MIRROR_TREE_BOUND = { '.cache/chain-receipt.json', '.cache/' + adaptiveSchema.OUTCOME_LOG_NAME }` |
| canonical `:3333` | the ledger-repair up-sync now passes it |
| canonical `:3371` | the Step 8a down-mirror now passes it |

GitLab `:2994`/`:3011`/`:3110`/`:3148` and Gitea `:2991`/`:3008`/`:3107`/`:3145` — same four, hand-ported.

**Why this shape and not a staleness test.** An mtime rule freezes the mirror after its first run:
`fs.copyFileSync` stamps the destination with the copy time, so every mirrored file is permanently
"newer" than its source and would never be refreshed again. The artifact-identity rule has no such
failure mode. `mergeCopyDir`'s own comment already promised that a worktree-authored chain receipt
survives the mirror; it was only ever true while MAIN happened not to carry one too. This makes the
sentence true.

**Both directions, deliberately.** The rule is about the artifact, not about which way the copy is
pointed: a receipt binds a `codeTreeHash` and the outcome log's rows were appended in the tree that
holds it, so neither is a record one checkout can hold on another's behalf. Keeping the destination's
copy is fail-safe by construction — if the kept copy is the stale one the gate says `chains_stale` and
the operator re-runs the chains, with every byte still on disk in both trees; if we overwrite, the
newer copy is gone from everywhere.

**`OUTCOME_LOG_NAME` is read from the kernel** (`adaptiveSchema.OUTCOME_LOG_NAME`, exported at
`adaptive-schema.js:1708`) rather than re-typed, so the name has one definition.

### Verified AFTER

```
$ node scratchpad/adv/w910.js        -> STEP D validation.classification = "chains_green"
$ node scratchpad/adv/w910ctl.js     -> chains_green (the green control is unchanged)
```

And the same A–D sequence with the two assertions the reviewer's probe stopped short of
(`scratchpad/impl-r1-verify.js`, run against canonical, Codex, GitLab and Gitea — 5/5 PASS on each):

```
hashC worktree / main     = 5730bab02f946003 / b8c3fd3de25069a0
step D classification     = chains_green
archive receipt hash      = 5730bab02f946003          <- the FRESH one reaches the archive
wt outcome-log rows  C->D = 3 -> 3 (main held 1)

PASS  step B refused as designed (implementation_commit_missing)
PASS  step C: main and the worktree hold DIFFERENT receipts (the setup this is about)
PASS  step D: the gate reports chains_green over the tree the chains just ran on
PASS  step D: the ARCHIVE carries the FRESH receipt, not the stale one
PASS  step D: the worktree outcome log kept ITS OWN rows (not overwritten by main's)
```

**Two harness corrections I had to make, both of which had produced a false PASS first:**

1. The outcome-log assertion was **vacuous** on the first run — `appendOutcomeRecord` only appends for
   an ok result into an existing `.cache/`, so both logs were empty (`0 -> 0`) and any mutation would
   have passed. Fixed by seeding the two trees with distinguishable content (`{"tag":"WT"}` ×3 vs
   `{"tag":"MAIN"}` ×1) and asserting the WT rows survive AND no MAIN row appears.
2. It then read the LIVE worktree log after a successful finalize, which legitimately no longer exists
   (the archive step removes the folder) — `3 -> 0`, a red measuring the wrong step. Fixed by reading
   the ARCHIVED copy, which is a snapshot of the worktree folder taken after Step 8a.

### Mutation proof

Fresh mirror; the down-mirror call reverted to `mergeCopyDir(srcDir, destDir, FINALIZE_MIRROR_DEST_OWNED)`:

```
CONTROL (unmutated mirror)  5/5 PASS, classification chains_green
MUTANT r1                   classification = chains_stale
                            archive receipt hash = b8c3fd3d…  (main's STALE one)
                            3 of 5 FAIL — gate, archive, and the outcome log
```

---

## R2 — the three unconverted catches around the converted one

### Reproduced FAILING first (reviewer's harness, unmodified)

```
$ node scratchpad/adv/w907.js statusfail
PREMISE: `git status --porcelain` exits 128 "index file smaller than expected"
exit = 0 · status = closed · closure_invariants.ok = true
finalize_transaction = {…,"roadmap_staged":true,"archive_commit":"deferred_to_sink",
                        "residue_stage":"skipped","finalize_commit":"nothing_to_commit"}
git log = feat: implementation | init        <- no chore: archive, no chore: finalize
src/pending-good.js committed?  false
archived summary names "## Finalize Findings"?  false
```

### The change — one accumulator, five conversions

**The accumulator** (canonical `:3962-3990`). `appendSummarySection` is idempotent BY HEADING, so the
per-fault write I shipped in round 1 would have landed the first fault and silently dropped every one
after it — the same silence the ruling converts. Faults are now collected and flushed ONCE, and
flushed at EVERY exit from the block including the refusing ones (`flushFinalizeFindings()` before the
archive-commit failure, the staging-guard refusal, and the finalize-commit failure), or a run that
refuses downstream would lose findings it had already made. The envelope carries a de-duplicated
`finalize_transaction.findings` type list; the durable body keeps every entry, each naming its step.
`gitFaultDetail(e)` gives the envelope and the archived record one wording for the same fault.

| # | site (canonical) | was | now |
|---|---|---|---|
| 1 | `:4576` `git rm -r --cached` | `catch (_) {}` | `archive_stage: 'failed'` + `archive_stage_detail` + finding `archive_unstage_failed` |
| 2 | `:4600` `git add -A -- …existingPaths` | `catch (_) {}` | `archive_stage: 'failed'` + `archive_unstaged` + finding `archive_stage_failed` |
| 3 | `:4620` `roadmap_staged` | `existingPaths.some(…)` — true whenever the paths exist ON DISK | `archiveAddOk && existingPaths.some(…)` — derived from the OUTCOME |
| 4 | `:4686` `git diff --cached --quiet` (archive) | non-1 exit read as "nothing staged" | three-way: 0/1 are answers, anything else is `archive_commit_probe: 'failed'` + finding |
| 5 | `:4741` `git status --porcelain` (residue) | `catch (_) {}` → empty list → `residue_stage: 'skipped'` | `residue_stage: 'unprobeable'` + `residue_probe_detail` + finding `residue_probe_failed` |
| 6 | `:4809` `git diff --cached --quiet` (finalize) | non-1 exit read as "nothing staged" | `finalize_commit_probe: 'failed'` + finding |
| 7 | `:4832` `finalize_commit` | `'nothing_to_commit'` regardless | `'unknown'` when the residue probe or the staged probe failed |

`finalize_commit: 'unknown'` is the point of #7: `nothing_to_commit` is a claim about the WORKING
TREE, and neither fault supports it — one could not enumerate what to stage, the other could not read
what was staged. Exit stays 0 on every one of these.

**On `archive_commit: "deferred_to_sink"`** — the reviewer lists it as a second false statement. I do
not think it is: `classifyArchiveDisposition` returns that token when the archive path resolves under
main and is not gitignored, which means "no archive commit is authored here; the sink's
archive_commit step owns it", and that stayed true. What was missing was any statement about the
STAGING, which is now `archive_stage`. Recording the disagreement rather than silently acting on it.

**Forge ports do NOT share canonical's shape here, and that is a real pre-existing divergence.** My
first port attempt missed three hunks and said so loudly rather than half-applying. GitLab/Gitea stage
the archive with a single unscoped `git add -A 'kaola-workflow/'` — no `git rm --cached`, no
`candidatePaths`/`existingPaths` list — and derive `roadmap_staged` from `fs.existsSync`. **They never
received #832's scoped archive staging.** The conversion was applied to the shape they actually have
(so they get `archive_stage` + an honest `roadmap_staged` and one `archive_stage_failed` type instead
of two). Closing the #832 divergence itself is a behaviour change well outside these two findings —
**flagged for routing, not done.**

### Verified AFTER, all four editions, three legs each

```
                       control                      statusfail
canonical  residue_stage staged                     unprobeable
           archive_stage staged                     failed
           roadmap_staged true                      false
           finalize_commit committed                unknown
           deliverable committed  TRUE               FALSE (correctly — and now SAID)
           findings      (none)                     archive_unstage_failed, archive_stage_failed,
                                                    archive_commit_probe_failed, residue_probe_failed,
                                                    finalize_commit_probe_failed
           archived "## Finalize Findings"  false    TRUE
codex / gitlab / gitea: identical on both legs (gitlab/gitea emit 4 types, not 5 — they have one
           archive-staging call, not two)
unreadable (the leg round 1 already converted): residue_stage failed, residue_unstaged
           ["locked.md","src/pending-good.js"], findings ["residue_stage_failed"], archived record
           names the lost path — unchanged, so the conversion did not regress it
```

The **control leg is the load-bearing one**: a healthy run reports `staged`/`staged`/`committed`, has
NO findings, and commits the deliverable. The new reporting does not fire on a good run.

The durable section, read back out of the archived `finalization-summary.md`:

```
## Finalize Findings

### archive_unstage_failed
The archive bookkeeping could not be staged: `git rm -r --cached` failed on `kaola-workflow/issue-9070`,
so the branch may still carry the live run folder that `chore: archive` exists to remove.
git said: ``` fatal: …/index: index file smaller than expected ```

### archive_stage_failed …   ### archive_commit_probe_failed …   ### residue_probe_failed …
### finalize_commit_probe_failed …
```

**One honest limit.** In the `statusfail` leg the record cannot NAME the uncommitted paths — the probe
that would have enumerated them is the one that failed. The finding says exactly that
("What the run left uncommitted is therefore UNKNOWN and this record cannot name it … Re-read the
worktree by hand before trusting this closure") rather than implying a list exists. The reviewer's
`names the lost path?` line stays `false` on that leg for that reason, and `true` on the `unreadable`
leg where the paths ARE known.

### Mutation proofs (two, because the finding has two halves)

| mutation | reverts | result |
|---|---|---|
| `r2probe` | the `git status` residue catch → bare swallow | `residue_stage` returns to the false `"skipped"` and `residue_probe_failed` disappears from `findings`. The other four conversions still fire, which is what makes it a clean isolation of this one. |
| `r2flush` | the durable write → early return | envelope keeps all five typed findings; the archived record goes SILENT (`names Finalize Findings? false`) on BOTH the `statusfail` and `unreadable` legs. Envelope-arming and durable-arming proven separately. |

---

## Round-2 verification commands

```
node scripts/simulate-workflow-walkthrough.js       exit 0  198/198 scenarios, FULL scope
node scripts/test-claim-hardening.js                exit 0  766 assertions   (was 557 — tdd-guide added #906 pins)
node scripts/test-finalize-door.js                  exit 0  310 assertions   (was 301)
node scripts/test-bundle-finalize.js                exit 0  149 tests
node scripts/test-sink-merge.js                     exit 0  423 assertions
node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js   exit 0
node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js     exit 0
node scripts/validate-script-sync.js                exit 1  -- validation-runner only, NOT MINE
```

Run serially, as instructed. `validate-script-sync.js` still fails on the three
`kaola-workflow-validation-runner.js` copies — another agent's in-flight work, unchanged from round 1;
`kaola-workflow-claim.js` is absent from its list.

The round-1 #906 drives were all re-run against the finished tree and still pass:

```
impl-route2-verify.js   exit 0   ROUTE 2: all legs behaved as specified.   (7 legs × 4 editions)
impl-route1-verify.js   exit 0   ROUTE 1: all legs behaved as specified.   (2 legs × 4 editions)
four-editions.js        exit 0   CONVERGED: all four editions agree on every probe.
impl-sink-orphan.js     exit 0   C sinked / A_nested sinked+committed / B_sibling sink_blocked
```

## What needs pinning (for `tdd-guide`)

1. **R1**: the A–D sequence in `scratchpad/impl-r1-verify.js`. Three distinct assertions, and the
   third is the one a naive test misses — the ARCHIVE must carry the receipt bound to the finalized
   tree. **The outcome-log leg must seed both trees with distinguishable content**, or it is vacuous
   (measured: it passes on the unfixed code when both logs are empty), and it must read the ARCHIVED
   copy, not the live worktree one. Include `w910ctl`'s shape as the green control.
2. **R2**: the `statusfail` leg (corrupt the linked worktree's index) asserting `residue_stage !==
   'skipped'`, `finalize_commit !== 'nothing_to_commit'`, `roadmap_staged === false`, a non-empty
   `findings`, and `## Finalize Findings` in the ARCHIVED summary — plus the healthy control asserting
   NO findings and `finalize_commit === 'committed'`. Drive all four editions: the forge ports have a
   different archive-staging shape, so a canonical-only pin cannot witness them.
3. A pin that the two `git diff --cached --quiet` probes distinguish exit 1 from exit 128.

## Still outstanding from round 1 (unchanged, outside my write set)

`docs/api.md:629`/`:1309` (the `uncomparable[]` key) · `CHANGELOG.md` under `[Unreleased]` — now also
covering `finalize_transaction.archive_stage`, `archive_commit_probe`, `finalize_commit_probe`,
`findings`, `finalize_commit: 'unknown'`, and the `roadmap_staged` derivation change · the
`validation-runner.js` script-sync red · R3 (`isEditionCouplingPath` rename pre-image) is
`run-chains.js`, another agent's file.

---
---

# ROUND 3 — edition-parity review finding R3: `watch-pr` on the GitLab port

Verification tier: **tests-green**. Comment-only, one edition, two lines.

## What I changed

`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — two comments, both naming a
subcommand that does not exist on that edition:

| line | was | now | provenance |
|---|---|---|---|
| `:4643` | `// route, watch-pr and the abandon sweep are the three that run NO Step-8a mirror` | `watch-mr` | **mine, this bundle** (the review cites `:4494`; round-2's edits shifted it to `:4643`) |
| `:2291` | `// here — release / discard, watch-pr on a merged PR, the abandon backstop` | `watch-mr on a merged MR` | pre-existing, present at `main` |

**I fixed the pre-existing one too.** It is genuinely the same mistake and then some: on GitLab the
subcommand is `watch-mr` AND the forge noun is MR, and the port's own established idiom already says
both — `:2557` reads "release / watch-mr", `:5058` reads "a merged MR". So `:2291` was the odd one
out against its own file, not a deliberate difference. After the fix the port has **zero** `watch-pr`
mentions and **zero** "merged PR" (it had 1 of each; "merged MR" went 1 → 2).

**Gitea is untouched and correct.** `watch-pr` genuinely IS its subcommand, so the same ported
sentence is right there. Verified by running it, not by reading it.

## Verification — by RUNNING each dispatcher, since nothing else polices this surface

```
$ KAOLA_WORKFLOW_OFFLINE=1 node <edition claim> <sub>

gitlab     watch-pr  exit=1  unknown subcommand: watch-pr
gitlab     watch-mr  exit=0  {"watched":0,"offline":true}      <- what the fixed comments now name
gitea      watch-pr  exit=0  {"watched":0,"offline":true}      <- correct as-is, left alone
gitea      watch-mr  exit=1  unknown subcommand: watch-mr
canonical  watch-pr  exit=0  {"watched":0,"offline":true}      <- correct as-is
canonical  watch-mr  exit=1  unknown subcommand: watch-mr
```

That table is the whole proof in both directions: the name each edition's comments now use resolves,
and the name they do not use does not. Cross-checked against the dispatch and usage strings —
GitLab `:5952 if (sub === 'watch-mr')` / USAGE `:5918`; Gitea `:5944 if (sub === 'watch-pr')` /
USAGE `:5910`; canonical `:6246 if (sub === 'watch-pr')`.

## Suites (run SERIALLY)

```
node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js   exit 0
node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js     exit 0
node scripts/test-finalize-door.js            exit 0   394 assertions  (was 310 — test authors still adding)
node scripts/test-claim-hardening.js          exit 0   766 assertions
node scripts/simulate-workflow-walkthrough.js exit 0   198/198 scenarios, FULL scope
node scripts/validate-script-sync.js          exit 1   validation-runner mirrors ONLY (0 lines mention claim)
```

Canonical↔Codex parity unchanged and intact: `b4e9240fcf0f731e5bd8e24ecb8cd215` both. Canonical and
Codex were not touched this round — the defect was GitLab-only.

## Note on R4 (not mine to fix, but it is about my code)

The reviewer's R4 corrects `docs/api.md:361` from "four vs five" finding types to **five vs six**, the
delta being exactly `archive_unstage_failed`. That matches what I reported in round 2: the forge ports
make ONE archive-staging call (`git add -A 'kaola-workflow/'`) where canonical makes TWO
(`git rm -r --cached` then a scoped `git add`), so there is one fewer call to fail and one fewer
finding type. The cause is the pre-existing #832 scoped-staging divergence, not this bundle. `docs/`
is outside my write set.

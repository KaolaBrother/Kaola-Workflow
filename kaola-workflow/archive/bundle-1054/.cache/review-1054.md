# Independent review — #1054 candidate `5743eb15` (base `662bcd33`)

Reviewer: code-reviewer, mission 12. Frozen candidate; no tracked file modified. All mutation
probes ran against `git archive`-exported copies of `5743eb15` and `662bcd33` under
`.../scratchpad/review/{tree,base}`, never against the worktree, because the verification runner
was still executing from it.

Verdict: **fail** — 5 admitted findings (0 critical, 0 high, 3 medium, 2 low). None is a data-loss
or security defect. Three of the five are statements about the candidate's own behavior that the
candidate falsified: an operator-facing refusal message, the CHANGELOG/ADR record of what the
validators now do, and `docs/api.md`. One is a behavioral over-refusal reachable on a re-run.

---

## R1 (medium) — the record mirror refuses its own prior write when the main-side record advances

**Failure class:** behavioral regression / over-refusal on the mirror's intended forward direction.

**Trigger.** `mirrorFinalizationArtifacts(root, project)` runs once and copies main's
`mission-list.md` down into the linked worktree. The orchestrator then updates
`kaola-workflow/<project>/mission-list.md` in the **main** checkout. A second finalize attempt runs
the mirror again.

**Expected.** The copy proceeds. Main is strictly newer; the worktree holds nothing but the older
copy this same transaction wrote a moment earlier. This is the exact direction the mirror exists to
perform.

**Observed.** `{ refused: true, inner_reason: 'mirror_sync_failed' }` — a fail-closed stop that only
manual reconciliation clears.

**Anchors.**
- `scripts/kaola-workflow-ledger-compare.js` — `compareLedgers` returns `content_diverged` for any
  destination that is neither absent/empty (`first_sync`) nor byte-identical (`identical`).
- `scripts/kaola-workflow-claim.js:3546-3568` — the write path turns that verdict into the refusal.
- `scripts/kaola-workflow-claim.js:4385-4390` — Step 8a runs **before any gate**, so a finalize that
  refuses at a later rung has already written the worktree copy that blocks the next attempt.

**How established.** A probe built a real main root plus `git worktree add` linked worktree, called
the production `mirrorFinalizationArtifacts` twice with a main-side append in between:

```
PASS 1 (first sync): {"mirror":"mirrored","ledger_compare":"pass"}
PASS 2 (main advanced): {"refused":true,"inner_reason":"mirror_sync_failed", ...}
```

The identical probe at `662bcd33` returns `{"mirror":"mirrored","ledger_compare":"pass"}` on pass 2,
because the old guard refused only when the destination recorded strictly **more** done work.

**Why existing guards do not catch it.** `scripts/test-issue-1054-ledger-guard.js` covers 2a first
sync, 2b byte-identical repeat, 2c/2d/2f staler-source refusal per port, and 2g read-only `--check`.
No case exercises a source that legitimately advanced after a prior mirror. ADR 0024 states "an
idempotent re-run of the mirror is never refused", which is true only of a byte-identical re-run.

**Note on scope.** Refusing a genuine divergence is the owner-directed design and is correct. What
is not covered by that direction is the transaction reading state it manufactured itself as an
operator conflict — the same principle `kaola-workflow-claim.js:3605` already states for
`machineryAuthoredPaths`.

---

## R2 (medium) — the mirror refusal's `operator_hint` still describes the retired repair

**Failure class:** incorrect user-facing guidance emitted by production code.

**Anchor.** `scripts/kaola-workflow-claim.js:4397-4405`, byte-identical in
`plugins/kaola-workflow/scripts/kaola-workflow-claim.js`,
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`, and
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`.

**Trigger.** Any `finalize_mirror_refused` envelope, which now includes every `content_diverged`
refusal the candidate introduces.

**Observed text, verbatim:**

```
The transaction owns the project-folder sync between the main checkout and the linked worktree,
in BOTH directions, and could not perform it — one of the two trees is unwritable, or the main
copy could not be repaired. `detail` names the tree and the error. Make that tree writable, then
re-run finalize. Never hand-copy a staler main ledger over the worktree.
```

Every clause is wrong for the new refusal:

- "in BOTH directions" — the worktree→main direction was removed by this candidate.
- "one of the two trees is unwritable, or the main copy could not be repaired" — on
  `content_diverged` both trees are writable and no repair is attempted.
- "Make that tree writable, then re-run finalize" — does not clear a content divergence; the re-run
  produces the identical refusal.
- "Never hand-copy a staler main ledger over the worktree" contradicts the `detail` string the same
  candidate added one field above: "Reconcile by hand (the Main Orchestrator owns which side is
  current) and rerun `finalize --check`."

The stale code comment at `scripts/kaola-workflow-claim.js:4386-4388` ("#837: a staler main copy is
REPAIRED here (the transaction syncs worktree→main itself)") describes the same retired mechanism.

**How established.** Read both strings at the call site; confirmed `sync_required` and the
worktree-wins merge exist nowhere in the candidate outside comments
(`grep -rn "sync_required" scripts/ plugins/` returns only comment lines).

---

## R3 (medium) — CHANGELOG and ADR 0024 claim a concept-level replacement that was not shipped

**Failure class:** documentation of record contradicts the code it describes.

**Anchors.**
- `CHANGELOG.md` `[Unreleased]`: "role-body wording pins (`smoke-integration`, `finding: id=`,
  `verdict: pass`) were replaced with concept-level checks against each role's current wording".
- `docs/decisions/0024-finalize-measures-roles-state-one-authority.md`, Decision 4: "A wording pin
  tied to retired procedure (the tier-name vocabulary, the column-zero review format) is replaced by
  a concept-level check against the role's current, real wording — still able to fail if the concept
  the role must still deliver disappears".
- `kaola-workflow/bundle-1054/.cache/implementation-validators.md`, Outcome A table: five of seven
  rows say "kept as behavior — replaced with `assertConcept`".

**Observed.** No `assertConcept` call in any of the four validators targets a role body. The pins
were deleted outright, and the code's own comments say so:
`scripts/validate-workflow-contracts.js:819` ("no pin on the implementer body's CURRENT wording
replaces it") and `:844`, `scripts/validate-kaola-workflow-contracts.js:346-355`,
`plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js:395-406`,
`plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:401-412` — each
citing a later "#1054 owner ruling (19:03 heartbeat)" that supersedes the record's plan.

**How established.** Instrumented each validator's `assert` helper in both exported trees to log
every executed assertion message, then diffed the sets. Complete accounting:

| Validator | base | candidate | delta |
|---|---|---|---|
| `scripts/validate-workflow-contracts.js` | 754 | 676 | −78 |
| `scripts/validate-kaola-workflow-contracts.js` | 598 | 590 | −8 |
| `plugins/kaola-workflow-gitlab/.../validate-kaola-workflow-gitlab-contracts.js` | 540 | 534 | −6 |
| `plugins/kaola-workflow-gitea/.../validate-kaola-workflow-gitea-contracts.js` | 508 | 502 | −6 |

Root validator: 86 removed (78 proven-duplicate + 3 reviewer `finding: id=` + 1 `smoke-integration`
+ 3 `kaola-workflow-claim.js` source-shape pins + 1 inverted `run-gaps-manual.md`), 8 added
(2 `assertExcludes`, 3 `compareLedgers` fixtures, 1 `mirrorFinalizationArtifacts` fixture, 2 export
checks). Net −78, fully reconciled. The other three: 2 proven-duplicate plus 6/6/6 reviewer `.toml`
pins, with **zero** additions.

So 22 assertions that protected a role-body concept were removed with nothing in their place. That
is defensible under the cited owner ruling and it satisfies "no wording gates on role prose remain".
What is not accurate is the CHANGELOG and the new ADR asserting a replacement that does not exist.

**Related, verified clean.** The 80-candidate subtraction proof holds. I re-ran the mutant for five
rows drawn at random (seeded sample) from the table in `implementation-validators.md`, deleting
every occurrence of the needle from the target surface, running `test-route-reachability.js`, and
restoring from an in-memory snapshot with SHA-256 verification:

| block | validator site | token | target | result |
|---|---|---|---|---|
| nx-mission-list | `validate-workflow-contracts.js:265` | `status: todo` | `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | RED |
| nx-concurrency-is-judgment | `:222` | `Keep one owner for the current cohesive production surface` | same | RED |
| nx-mission-list | `:263` | `nothing depends on a stable ID` | `commands/workflow-next.md` | RED |
| fn-validation-report | `:548` | `## Validation` | `commands/kaola-workflow-finalize.md` | RED |
| nx-resume-rule | `:282` | `if the output the dispatch promised has landed` | `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | RED |

Every one failed with a genuine `FAIL: MANIFEST missing-token: block <id> token "<token>" absent
from <file>`, i.e. real manifest-coverage evidence, and every restore verified byte-identical.
`measure-validator-duplication.js` at the candidate reports 0 DUP against 483/236/71/69 KEEP.

---

## R4 (low) — `docs/api.md` still documents the retired bidirectional mirror and `sync_required`

**Anchors.** `docs/api.md:387-388` and `docs/api.md:415`.

- `:387-388` — "it owns the project-folder sync itself, in **both** directions — worktree→main and
  main→worktree." The worktree→main direction is gone.
- `:415` — "A token that appears only in `checks` is state the transaction settles itself:
  `sync_required` is the long-standing case." `sync_required` no longer exists as an emitted value
  (`scripts/kaola-workflow-claim.js:3834` records its retirement), and a diverged mirror now reaches
  `reasons` as `mirror_sync_failed` (`scripts/kaola-workflow-claim.js:4182`), which is the opposite
  of "state the transaction settles itself".

**How established.** Both sentences are present at `662bcd33` and were accurate there — the base
`probeFinalizeMirror` emits `sync_required` and the base mirror performs the worktree→main repair
(`git show 662bcd33:scripts/kaola-workflow-claim.js`, lines 3561/3605/3938). The candidate changed
the behavior and left the prose.

---

## R5 (low) — `docs/api.md`'s `compareLedgers` return enumeration omits `diff_unavailable`

**Anchor.** `docs/api.md:1803-1808`.

The entry enumerates `reason` as `first_sync`, `identical`, or `content_diverged`. The function also
returns `{ safe: false, reason: 'diff_unavailable', diff: '' }` when neither `diff` nor
`git diff --no-index` can produce output, and the script's own `--help` documents that value. A
reader handling the documented three would not handle the fourth. Reachability is narrow (both diff
tools would have to fail), which is why this is low, not medium.

---

## Areas verified clean

**Finalize / claim.** No Mission List parsing, counting, or statistic survives anywhere on the
finalize path: `probeMissionListCoherence`, `persistMissionListToSummary`, `countComplete`,
`net_backlog_delta`, `follow_ups_filed`, and `parseGapSection` are absent from every production
script in all four editions (one explanatory comment in the walkthrough is the only textual
remnant). `mirrorFinalizationArtifacts` is byte-identical across canonical, Codex, GitLab, and Gitea
after forge-token normalization; `probeFinalizeMirror` agrees with it on every branch.
`kaola-workflow-ledger-compare.js`, `kaola-workflow-adaptive-schema.js`,
`kaola-workflow-resolve-agent-model.js`, and `kaola-workflow-codex-preflight.js` are byte-identical
across all four trees. `gap-sweep --check/--summary/--offline` each exit 1 with
`gap-sweep: unknown argument` (measured directly, not through a pipe), and no shipped command,
skill, hook, or script invokes the script any more. The `ARCHIVE_CACHE_SIDECAR_MD` narrowing from
five names to three is strictly stricter: a legacy `.cache/doc-updater.md` moves from the exempt set
into the recursive byte-checked walk, so no historical archive loses protection. `issues_closed`
survives in the `## Closure` block and still derives from the claimed set.

**Roles.** All fourteen bodies state positioning, deliverable, unique custody, and stop condition;
none carries a ritual section, machine field, numeric threshold, default command, or output
template. `intent_class`, `capability_requirements`, `tools`, and `model` are unchanged from
`662bcd33` for every role — only `description` and `body` moved. The three reviewer bodies each hand
consequences to the orchestrator explicitly. `metric-optimizer` states the fixed-destination stop in
full and no longer names `tdd-guide` anywhere. A scan of all 126 renders for `finding: id=`,
`verdict: pass`, `median-of-K`, `>80%`, `smoke-integration`, `tests-green`, `solution ladder`,
`rm -rf node_modules`, `50 lines`, and `4 layers` returns nothing.

**Compact recovery.** `RECOVERY_FULL_DISPATCH_RUNTIMES = ['grok', 'cursor']`, and
`kaola-workflow-global-contract.js` now consumes that export instead of restating the list. All six
tracked Claude/Codex recovery renders carry zero `KW-RUNTIME-DISPATCH-START` markers, one deferral
sentence, and no runtime-adapter block; Grok and Cursor take the full block through the global
contract render. `kaola-workflow-global-contract.js` and `generate-routing-surfaces.js` are not in
the install manifest, so the new unconditional `require` cannot reach an installed home that lacks
the sibling.

**Constants.** `CODEX_PINNED_*`, `MANIFEST_BASENAME`, `RETIRED_PROFILE_FILES`, `EFFORT_VALUES`,
`CODEX_ROLE_TOP_LEVEL_FIELDS`, `agentProfileContract`, and `validateProfileText` are exported from
`kaola-workflow-adaptive-schema.js`; the preflight and the installer `require()` them and the
preflight re-exports the rosters for its existing consumers. `DEFAULT_AGENT_MODELS` is a generated
marked block whose fourteen values are identical to base, and
`kaola-workflow-resolve-agent-model.js` requires only `fs`, `os`, and `path`.

**Provenance and README.** `provenance.json` is schema 2, all fourteen `kaola_authored`, and exactly
the six roles that were `ecc_derived` at base carry a `history` record with origin, pinned commit,
blob and content hashes, `retired_by`, and a measurement. `validateProvenance` and
`validate-vendored-agents.js` enforce both halves; the 126-render manifest confirms 14 roles × 9
adapter variants. Every command and exported name cited by `docs/agents-source.md` resolves. README
carries no ECC identity, no prompt-pack framing, no self-deprecation, and no competitor claim.

**Suites.** In the exported candidate tree, all four contract validators, the four new #1054 suites
(116 / 28 / 193 / 142 assertions), `edition-sync --check`, `generate-agent-profiles --check`, and
`generate-routing-surfaces --check` pass. The team's own runner at
`.cache/verify-5743eb15/summary.txt` reports 32 green legs including `test-sink-merge`,
`test-forge-archive-scoping`, `test-claim-hardening`, the edition lane, and the walkthrough at full
scope (178/178 scenarios, 2088 spawns). Suite-count drops are all accounted for by the recorded
subtractions: `test-gap-sweep` 173→75 (retired `--check`/`--summary`/`--offline`/manual-seed
grammar), `test-ledger-compare` 40→22 (count semantics retired),
`test-runtime-agent-architecture` 859→812 (item 28 long-body coupling), `test-finalize-door`
846→871 (net gain).

**Native behavior.** `.cache/native-behavior.md` records a real regression the first rewrite
introduced — Grok and Codex hardcoded a fixed destination under the new metric-optimizer body where
they had correctly declined under the old — the one-sentence repair, and a re-measurement showing
Grok, Codex, and Kimi corrected and Claude unchanged. The repair is in the candidate: all four
tracked metric-optimizer renders carry `behavior_contract_hash: 4f5215b7...`, the hash the record
names. OpenCode still fails that probe, and the record proves it failed identically under the old
body, so it is pre-existing rather than candidate-caused.

## Observations (not findings)

- `templates/routing/finalize.skeleton.md` still requires a `searched:` line with "its query and its
  hit count", while issue item 6 names query-hit numbers for deletion. The disposition was recorded
  deliberately in `.cache/implementation-finalize.md` ("Kept, as concept: … the duplicate-search
  `searched:` line"), and item 6 also says to keep the real duplicate check, so this is a contestable
  reading rather than a defect.
- `kaola-workflow-prose-census.js` silently ignores the retired `--fail-on-regression` rather than
  refusing it the way `gap-sweep` refuses its retired flags. No caller exists anywhere in the tree,
  and the base behaves the same way, so nothing is reachable.
- `renderCompactRecoveryPrompt` applies `.replace(/\n{3,}/g, '\n\n')` to the whole document, not just
  the region where the dispatch markers were removed. The six tracked renders are unaffected, but a
  future skeleton with a deliberate triple newline in a fenced block would be silently reflowed for
  Claude and Codex only.
- `behavior_contract_version` was not bumped for any role despite every body being rewritten (still
  ten 1s, one 2, three 3s, as at base). `behavior_contract_hash` moves, so drift is still detected.

---

# Delta review — `db6af1be` (against `5743eb15`)

Second frozen candidate, worktree HEAD `db6af1be`, tree clean. Diff scope `5743eb15..db6af1be`,
21 files, one commit. Read-only again: every probe ran against a `git archive db6af1be` export under
`.../scratchpad/review/tree2`, verified byte-identical to the worktree for the files it exercises.
I did not start the walkthrough or `npm test` in the worktree.

Status: **R1–R5 all closed.** One new finding, R6 (medium), introduced by the repair's own
documentation.

## R1 — CLOSED

The repair adds `opts.priorDigest` to `compareLedgers` and a self-written receipt,
`.cache/mirror-digest.json`, in the destination project folder.

**Original probe, re-run on `db6af1be`.** Mirror once, advance the main record, mirror again:

```
A1 first sync       : {"mirror":"mirrored","ledger_compare":"pass"}
A  receipt written  : true  {"mission-list.md":"fcd0b80c…"}
A2 main advanced    : {"mirror":"mirrored","ledger_compare":"pass"}
A  dest now == v2   : true
A  receipt refreshed: true
```

Pass 2 now mirrors, the destination actually receives the advanced bytes, and the receipt is
rewritten to the new digest. At `5743eb15` this same probe refused.

**Negative variants, all still refusing.** A one-byte edit of the worktree copy between the two
calls returns `{refused:true, inner_reason:'mirror_sync_failed'}` and leaves the edited destination
untouched. Deleting the receipt, and corrupting it to `{not json`, each degrade to the identical
pre-R1 `content_diverged` refusal with no throw. So the leniency is bounded exactly to "this mirror
wrote these bytes and nothing has touched them since".

**`--check` agrees, and writes nothing.** For the main-advanced/worktree-untouched pair, in all four
editions:

| edition | mirror pass 1 | `--check` `checks.mirror` | `reasons` | `--check` wrote nothing | mirror pass 2 |
|---|---|---|---|---|---|
| canonical | mirrored | ready | `[]` | yes | mirrored |
| codex | mirrored | ready | `[]` | yes | mirrored |
| gitlab | mirrored | ready | `[]` | yes | mirrored |
| gitea | mirrored | ready | `[]` | yes | mirrored |

"Wrote nothing" was checked by byte-comparing the receipt and the destination record before and
after the `--check` invocation.

**End to end.** A real `finalize --project P --keep-worktree --json`, run after a prior mirror had
already written the receipt and main had since advanced, exits 0 with
`finalize_transaction.mirror = mirrored`, `ledger_compare = pass`, status `closed`, and the archive
contains the **advanced** record, not the stale pass-1 copy. The receipt rides into the archive,
matching the recorded decision.

**Four-edition parity.** `mirrorFinalizationArtifacts`, `probeFinalizeMirror`, `readMirrorDigest`,
`writeMirrorDigest`, and `sha256Hex` are all identical across canonical, Codex, GitLab, and Gitea
after forge-token normalization. `kaola-workflow-ledger-compare.js` and
`kaola-workflow-adaptive-schema.js` remain byte-identical across the three plugin trees. All four
claim scripts and the comparator pass `node --check`.

**Tests are armed.** `test-issue-1054-ledger-guard.js` grew 28 → 96 assertions with legs R1a–R1f
covering the exact trigger I reported, per edition, plus the hand-edited and missing/corrupt cases,
plus `--check` agreement. Mutating the guard (`if (false && priorDigest && …)`) in a scratch copy
reds R1a on three distinct assertions — must-not-refuse, must-actually-copy, must-refresh-the-receipt
— and R1e on two, in every edition; the snapshot restored byte-identical and the suite returned to
96 passing. `test-ledger-compare.js` 22 → 30.

**Kernel registry and Layer-0 table.** `KERNEL_ARTIFACT_REGISTRY` gained
`['.cache/mirror-digest.json', 'record', 'evidence', 'script', …]` at index 4, and
`docs/workflow-state-contract.md`'s ruling table gained the matching row at the same index. Running
`test-kernel-conformance.js`'s partB logic directly through its own exported `parseRulingTable`:
all 22 rows agree on matcher, ruling, record, and writer. (The full
`test-kernel-conformance.js` fails in my scratch export for an unrelated sandbox reason — it runs
the walkthrough as its vehicle and the export is not a git repository. The team runner's own
`test-kernel-conformance` leg for `db6af1be` subsequently reported exit 0, which is the
authoritative result; every other leg in `verify-db6af1be/summary.txt` is exit 0 too.)

**Archive decision.** Recorded inline at `scripts/kaola-workflow-claim.js:3459-3472` and in
`.cache/implementation-finalize.md`, and its load-bearing premise checks out: `mergeCopyDir`
(`scripts/kaola-workflow-claim.js:3420-3433`) iterates `fs.readdirSync(src)` only, so it can never
delete or clobber a destination-only file — no exclusion entry was needed, exactly as claimed.

## R2 — CLOSED

The `in BOTH directions … or the main copy could not be repaired` hint is gone from all four claim
scripts, replaced by a one-way hint that names the two real causes separately and points the
operator at `detail` for which one fired. The reconcile-by-hand instruction now agrees with the
`detail` string instead of contradicting it. The stale `#837: a staler main copy is REPAIRED here`
comment at the call site is also gone in all four.

## R3 — CLOSED

`CHANGELOG.md` and ADR 0024 Decision 4 both now state the shipped truth: "22 role-body wording pins
(`smoke-integration`, `finding: id=`, `verdict: pass`) across all four validators were deleted
outright under the owner's ruling, with nothing added in their place", and name what carries the
responsibility instead. That count matches my measurement exactly (3 + 1 root, 6 Codex, 6 GitLab,
6 Gitea). ADR 0024's Consequences section was updated to match. The ADR also now names the R1
regression as a review finding rather than presenting the first shape as complete.

## R4 — CLOSED

`docs/api.md` and `docs/architecture.md` both now describe the mirror as one direction,
main→worktree, and `docs/api.md` explicitly records that `#1054` retired `sync_required` and that a
divergent mirror is an operator obligation in `reasons`, not a self-settling check state.

## R5 — CLOSED

`docs/api.md`'s comparator entry now enumerates all five module reasons including
`diff_unavailable`, and separates the module API from the CLI. The CLI claim is accurate: `main()`
calls `compareLedgers(srcText, destText)` with no third argument
(`scripts/kaola-workflow-ledger-compare.js:167`), so `prior_mirror` is unreachable from it.
`--help` mentions it only as a programmatic-caller aside. `CHANGELOG.md` and ADR 0024 also gained
`diff_unavailable`.

## R6 (medium, NEW) — `docs/api.md` asserts a `--check`/transaction gap that does not exist, and contradicts itself

**Failure class:** documentation of record states the opposite of the shipped behavior, twice over,
in the same file.

**Anchor.** `docs/api.md:440-442`:

> One gap in that agreement: `--check`'s prediction does not read the R1 mirror receipt described
> above, so it can report `sync_failed` for a divergence the write path would actually accept as
> `prior_mirror` and proceed past.

**Observed.** `probeFinalizeMirror` does read the receipt — `scripts/kaola-workflow-claim.js:3917-3924`
calls `readMirrorDigest(destDir)` and passes `priorDigest` into `compareLedgers`, in all four
editions. I measured `--check` returning `checks.mirror: "ready"` with `reasons: []` for exactly that
pair in all four editions (table under R1 above).

**It contradicts its own file.** `docs/api.md:404-406`, thirty-five lines earlier, says the opposite
and is correct:

> `finalize --check`'s read-only prediction reads the same receipt through the same helper
> (`probeFinalizeMirror` passes `priorDigest` too, and never writes it), so the prediction and the
> transaction agree on the `prior_mirror` case as well as on a genuine divergence.

**It also contradicts a shipped, passing test.** `test-issue-1054-ledger-guard.js` leg R1e asserts,
per edition, that `--check` must **not** predict `sync_failed` for a `prior_mirror`-safe pair, and it
passes. The stale sentence reads as a leftover from before the `probeFinalizeMirror` follow-up
landed — `.cache/implementation-finalize.md` records that follow-up as a separate, later step.

**Impact.** A reader is told the check and the transaction disagree on the one case the repair
exists for, which is the opposite of the guarantee `docs/api.md` states two paragraphs later and the
guarantee the suite pins. Delete the sentence.

## Also verified in the delta

- **Scoped newline collapse.** `renderCompactRecoveryPrompt` now rewrites only the marker region
  instead of collapsing every 3+ newline run in the document. All six tracked compact-recovery
  renders are byte-identical to `5743eb15`, and `generate-routing-surfaces.js --check` exits 0. The
  narrower regex cannot silently leave markers behind unnoticed:
  `scripts/test-issue-1054-role-redesign.js:462` asserts marker presence equals
  `RECOVERY_FULL_DISPATCH_RUNTIMES` membership per runtime, so a region-match failure reds.
- **prose-census unknown-flag refusal.** `--fail-on-regression` and `--bogus` now print
  `{"result":"refuse","reason":"unknown_argument","argument":…}` and exit 1 (measured directly, not
  through a pipe). `--help` and `-h` still exit 0 with usage, and `--compare <path>` /
  `--write-baseline <path>` still accept their path values.
- **`native-behavior.md` corrections.** The record now separates three execution modes, and retracts
  the earlier "opencode fails regardless of body version" conclusion in full: the opencode legs had
  been invoked with `opencode run --agent <name>` against a `mode: subagent` file, which silently
  falls back to opencode's own default agent. Re-measured through real `task`-tool dispatch, opencode
  declines correctly on the old, new, and revised bodies. It attributes the fault to the measurement
  harness rather than the repository and explains why, which matches the render (`mode: subagent` is
  the intended declaration). My earlier observation about an opencode instruction-following gap is
  therefore withdrawn.

## Observation (not a finding)

`partC`'s totality scanner would not have caught a missing ruling for the new artifact.
`collectDeclaredArtifactNames` matches `'.cache/…'` string literals and `const *NAME = '…'` lines;
`MIRROR_DIGEST_REL` is built as `path.join('.cache', 'mirror-digest.json')`
(`scripts/kaola-workflow-claim.js:3476`), which neither pattern sees. The registry row is correct and
was added proactively — nothing would have failed had it been omitted, which is worth knowing the
next time an artifact is introduced through `path.join`.

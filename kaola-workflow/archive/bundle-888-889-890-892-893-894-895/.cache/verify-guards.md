# Adversarial verification — are the new guards armed, and does anything pass for the wrong reason?

**Lens:** is every new or widened guard actually armed, and does any assertion pass for a reason
unrelated to the property it names?
**Method:** executed, not read. Every mutation ran against a full tar-copy scratch mirror at
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/f018e2ef-7526-4575-bcc6-e529af9f0e2f/scratchpad/v`.
No `git checkout --`, no `git stash`, no tracked file in the worktree touched — `git status --short`
is 64 entries before and after, and `md5` on `scripts/kaola-workflow-sink-merge.js`
(`007998d3…`), `scripts/kaola-workflow-active-folders.js` (`483d3818…`),
`scripts/test-install-model-rendering.js` (`ab5db926…`) and
`templates/routing/required-blocks.js` (`16fb1f89…`) is unchanged.

| claim | verdict |
|---|---|
| 1 · #895 walkthrough scenario | **WEAKER-THAN-CLAIMED** — armed as claimed; two decorrelation gaps found |
| 2 · #893 sink archive exemption | **REFUTED** — a divergent branch copy is exempted on any read fault, three triggers, all four ports |
| 3 · #892 field-table row tokens | **CONFIRMED** — negative control independently reproduced |
| 4 · #889 fixtures (`replaceOnce`, derived `:3000`) | **CONFIRMED** — both arms armed; the derived pin is not tautological today |
| 5 · #889 `checkContractVersionPins` | **WEAKER-THAN-CLAIMED** — the sweep works; the sweep's own wiring and site list are unguarded |

---

## DEFECT 1 (REFUTED) — #893: `git show` failing for ANY reason is read as "absent on the branch", so a divergent archive copy is exempted

**Where:** `scripts/kaola-workflow-sink-merge.js:1410-1421`, and byte-for-byte the same defect in
all four copies:

| file | lines |
|---|---|
| `scripts/kaola-workflow-sink-merge.js` | 1411-1419 |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | 1411-1419 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | 1383-1388 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | 1390-1395 |

```js
let branchBytes = null;
try {
  branchBytes = execFileSync('git', ['-C', mainRoot, 'show', archiveKey + ':' + filePath],
    { maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] });
} catch (_) {}
if (branchBytes === null) continue;      // <-- "absent → exempt" also swallows every read fault
```

`branchBytes === null` conflates two different facts: *the branch does not carry this path* and
*this process could not read what the branch carries*. The three-way rule the implementation record
states — absent → exempt, byte-equal → exempt, **divergent → refuse loudly** — silently loses its
third arm whenever the read fails. The claim under attack was "divergent branch copies still
refuse." They do not.

`w4` cannot see this: it only ever exercises the happy read.

### Reproduction — three independent triggers, all executed

Scenarios appended to a mirror copy of `scripts/test-sink-merge.js`; snippet kept at
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/f018e2ef-7526-4575-bcc6-e529af9f0e2f/scratchpad/attack-893.snippet.js`,
full log at `…/scratchpad/attack893b.log`.

**A1 — unreadable object (the "corrupt repo / permission" case).** `w4`'s exact fixture; the branch
carries a divergent `mission-list.md`; the only change is `chmod 000` on that loose object. The
branch **tree still names the blob** (asserted in the fixture), so this is a read fault, not an
absence. A genuinely foreign file forces the refusal so classification is directly observable:

```
FAIL: A1 DEFECT: the branch carries DIVERGENT bytes at
  kaola-workflow/archive/issue-89401/mission-list.md but the copy could not be read,
  and the exemption fired anyway;
  foreign_dirt=["kaola-workflow/foreign-89491/workflow-state.md"]
```

**A2 — no tampering at all.** The branch's divergent copy is 65 MiB, above `GIT_MAX_BUFFER`
(`scripts/kaola-workflow-sink-merge.js:51`, 64 MiB), so `execFileSync` throws `ENOBUFS`. Nothing is
corrupt, nothing is unreadable, the repo is healthy:

```
FAIL: A2 DEFECT: a branch copy too large to read was silently exempted;
  foreign_dirt=["kaola-workflow/foreign-89492/workflow-state.md"]
```

**A1e — the end-to-end consequence, and it is worse than a mis-classification.** Same shape, no
foreign file. `w4` emits a clean typed `sink_blocked`. With the object unreadable the sink instead
gets past preflight, reaches `push_upstream`, and dies on an unhandled git error **with no JSON
envelope at all**:

```
A1e OBSERVED: exit=1 envelope=null
stderr="Everything up-to-date\nerror: The following untracked working tree files would be
  overwritten by checkout:\n\tkaola-workflow/archive/issue-89411/mission-list.md\nPlease move or
  remove them before you switch branches.\nAborting\nCommand failed: git -C … checkout
  workflow/issue-89411…"
```

An untyped crash where a typed refusal used to be. The orchestrator gets nothing to route on.

### Why bucket 2 does not have this defect — measured, not reasoned

Bucket 2 (`:1355-1365`) probes with `cat-file -e`, which asks only *does the object exist* and
**produces no output**. Under the identical fault:

```
$ chmod 000 .git/objects/45/b983…    # the blob HEAD:f.txt names
$ git cat-file -e HEAD:f.txt ; echo $?      -> 0        (still answers)
$ git show HEAD:f.txt        ; echo $?      -> 128      (fatal: bad object)
```

So `cat-file -e` cannot hit an `ENOBUFS` (no bytes to buffer) and shrugs off an unreadable object.
The new probe reads content and therefore has failure modes bucket 2 does not — and it resolves
every one of them toward **exempt**. The implementation record argues (correctly) that `cat-file -e`
cannot express the divergence test; the gap is that the replacement never distinguishes "no answer"
from "the answer is: absent".

### Suggested shape of the repair (not applied — read-only pass)

Separate the two facts before deciding. `git cat-file -e <key>:<path>` first: if it exits non-zero,
the path is genuinely absent → exempt (the observed shape, unchanged). If it exits zero, the branch
carries the path and the content read must succeed; a failed `git show` there is *unverifiable*, not
absent, and belongs in `foreignDirt` with the rest. That keeps `w1`/`w4` green and closes A1, A2 and
A1e together, in all four copies.

---

## DEFECT 2 (observation, in-scope, lower severity) — #893: the exemption is a directory prefix, and archive_commit then commits whatever it swallowed

The exemption keys on `'kaola-workflow/archive/' + project + '/'`, not on the four files finalize
writes. Before #893, **anything** untracked under that path refused the sink. Now it is exempt, and
`archive_commit` (`:1997`) stages the whole `kaola-workflow/archive/<project>/` pathspec — so
whatever the exemption swallowed is committed to `main` and pushed.

```
ATTACK A4: a stray untracked file under THIS project's archive dir that finalize never wrote
   A4 OBSERVED: exit=0 status="sinked" strayCommittedAtHead="AWS_SECRET_ACCESS_KEY=planted\n"
```

The implementation record's "classification-only" claim is true **of the block** (it only `continue`s
and does two reads) but not of the run: the classification is what lets the commit happen. Whether
that is acceptable is a values call, so I am reporting rather than deciding it — but the record's
three-fact proof of "classification-only" does not cover it, and the four `w`-scenarios do not
exercise it.

---

## Claim 1 · #895 — WEAKER-THAN-CLAIMED

The scenario is armed and the control is genuinely non-vacuous. Independently reproduced:

| attack | result |
|---|---|
| baseline `--only testActiveFoldersExcludesClosedIssue895` | PASSED |
| parent env `KAOLA_WORKFLOW_OFFLINE=1` | PASSED — the driver's `KAOLA_*` scrub + explicit `OFFLINE=0` really do isolate |
| parent env `OFFLINE=1` **and** `KAOLA_ISSUE_STATE_SNAPSHOT='{"10":"open","11":"open"}'` (a snapshot that would pre-answer the memo *wrongly*) | PASSED — the scrub defeats the pre-seed |
| the same hostile parent env **plus** M1 (`if (false && …)`) | **RED** — `#895 (batched): default options must keep ONLY the open issue's folder, got ["closed-project","open-project"]`. So the isolation is not masking the arming. |
| **T1 trivial replacement** — `readActiveFolders` ignores `opts` and hard-returns `[{project:'open-project',issue_number:10}]` | **RED** on the control: `#895 fixture (batched): both folders must be visible with the filter OFF, got ["open-project"]`. The control does its job. |

Two gaps, both of the "passes for a reason unrelated to the property it names" class:

**T2 — the fixture correlates *closed* with *odd issue number*, and the scenario cannot tell them
apart.** Both sub-cases use the same pair (10 open, 11 closed), so any confound keyed on the number
survives:

```
mutation: if (opts.excludeClosedIssues && state.issue_number != null && issueIsClosed(...)) continue;
       -> if (opts.excludeClosedIssues && state.issue_number != null && state.issue_number % 2 === 1) continue;
result:  testActiveFoldersExcludesClosedIssue895: PASSED
```

A number-parity filter is not a plausible bug, so this is low severity — but the cheap fix is real:
invert the assignment in sub-case B (11 open, 10 closed) and no number-keyed confound survives
either sub-case.

**T3/T4/T5 — three plausible regressions in `issueIsClosed` that the scenario does not see.** All
three PASSED:

| mutation (`scripts/kaola-workflow-active-folders.js`) | meaning | scenario |
|---|---|---|
| `catch (_) { return false; }` → `return true;` (`:110`) | an **unreachable** issue is treated as closed — the folder silently vanishes from the active inventory | PASSED |
| `if (!raw) return false;` → `return true;` (`:105`) | an empty `gh` answer is treated as closed | PASSED |
| `if (OFFLINE \|\| issueNumber == null)` → `if (issueNumber == null)` (`:100`) | the OFFLINE short-circuit is removed — a live network call in an offline run | PASSED |

T5 is the notable one: the whole reason `callReadActiveFolders` spawns a subprocess is that `OFFLINE`
is frozen at module load, and removing the `OFFLINE` short-circuit is invisible to the scenario.

None of this contradicts the report's stated claim (the closed-issue exclusion *is* canonically
asserted and every assertion in the scenario *is* armed). One wording overstates slightly: the
summary says "the two `control` non-vacuity assertions [are armed] by M4", while M4's own transcript
in the report shows it reds at the **per-issue** sub-case only — an `assert` throw aborts the
scenario, so the batched control assertion is armed by fixture defects, not by M4. The report's body
says exactly this; only the summary line rounds it up.

---

## Claim 3 · #892 — CONFIRMED

**The negative control was re-run independently and reproduces exactly.** Sequence, in the mirror:

1. Baseline `node scripts/test-route-reachability.js` → EXIT=0 (323 assertions).
2. Strip the locator from `templates/routing/next.skeleton.md:227` (the `dispatched` row only; write
   moment 2 untouched), then `generate-routing-surfaces.js --write`.
3. **With the pin present:** `generate-routing-surfaces.js --check` EXIT=0,
   `validate-workflow-contracts.js` EXIT=0, `test-generate-routing-surfaces.js` EXIT=0,
   `test-route-reachability.js` **EXIT=1 with 12 `missing-token` failures** — and I confirmed the
   twelve by name: the 6 tracked surfaces **plus** `.opencode/`, `.opencode-gitlab/`,
   `.opencode-gitea/`, `.kimi/`, `.kimi-gitlab/`, `.kimi-gitea/`. The tokens do reach the six
   additive-edition surfaces.
4. **Remove the four token lines from `templates/routing/required-blocks.js`** (pre-pin state), same
   stripped skeleton:

```
generate-routing-surfaces.js --check   -> EXIT=0
test-route-reachability.js             -> EXIT=0
validate-workflow-contracts.js         -> EXIT=0
test-generate-routing-surfaces.js      -> EXIT=0
validate-kaola-workflow-contracts.js   -> EXIT=0
test-opencode-edition.js               -> EXIT=0
test-kimi-edition.js                   -> EXIT=0
validate-script-sync.js                -> EXIT=0
```

Every guard green with the locator gone from the field table on all 18 surfaces. The four tokens are
the only thing that closes it. **The claim holds.**

*"Does `checkManifest` silently skip a surface that is not on disk?"* — No, and this is well built.
`GENERATED_SURFACE_CONTENT` (`scripts/test-route-reachability.js:558`) renders the six gitignored
trees **in memory** through the sync modules' own renderers; `readSurface` returning `null` produces
an `absent-surface` failure (`:661`), not a skip. There is no "skip when absent" path.

**Bound worth recording (not a defect in the claim).** The pin is substring presence after
whitespace normalization (`norm = s => s.replace(/\s+/g,' ')`), so it cannot see *context*. I
destroyed the field table on all 18 surfaces — removed the header row, the delimiter and all four
rows from the prose, replacing them with `(the field table was here)` — and re-emitted the identical
four rows inside an inert fenced block at the end of the skeleton under
`<!-- historical, not the format -->`. All five guards stayed EXIT=0. The implementation record is
explicit that it deliberately did not pin the header/delimiter, so this is the declared boundary
being wider than "a reader sees it at a glance", not an undisclosed hole.

---

## Claim 4 · #889 fixtures — CONFIRMED

Both `replaceOnce` arms proven armed independently, and the derived `:3000` pin proven non-tautological.

| attack | result |
|---|---|
| `replaceOnce` no-op: replacement made identical to the matched text (`'…: 1'` → `'…: 3'`) | **RED** — `reviewer fixture /^behavior_contract_version: \d+$/m substituted nothing and would test nothing` |
| pattern matches **two** sites (`/contract_[a-z]+/`) | **RED** — `must match exactly one site; matched 2` |
| pattern matches **zero** sites (field renamed to `behaviour_`) | **RED** — `must match exactly one site; matched 0` |
| **the installer writes a WRONG version** — `install.sh:272` `installedIdentity.behavior_contract_version` → literal `2` | **RED** — `Claude managed-agent manifest must record the behavior contract version this code renders for code-reviewer` |

So the answer to the flagged risk is **no, it has not become tautological** — the producer reads the
version out of the installed bytes, the assertion reads it out of the generator, and a producer-side
defect between those two still reds.

Two things it cannot see, both consistent with the report's own §B accounting:

- `install.sh:272` → `contractVersion` (i.e. the producer echoes the generator constant instead of
  the installed bytes): **EXIT=0**. That is the exact refactor that *would* make the assertion
  vacuous, and nothing would notice. Worth a comment at the producer, not a change here.
- `install.sh:272` → `sourceIdentity.behavior_contract_version`: **EXIT=0**, but no signal is
  possible — `install.sh:251-255` already guards the two identities equal.

`reviewerGenerator.ROLES` is `["code-reviewer","adversarial-verifier","security-reviewer"]`, so the
loop carrying the `:3000` assertion is genuinely driven.

---

## Claim 5 · #889 `checkContractVersionPins` — WEAKER-THAN-CLAIMED

The sweep itself is well built and **more** robust than the brief assumed: the pattern
`CONTRACT_VERSION_PIN_PATTERN` is *not* anchored (`scripts/generate-reviewer-profiles.js:772`), and
every drift the brief named is loud. Executed, one site at a time:

| drift | sweep |
|---|---|
| site **renamed** (identical copy at a new path) | `contract_version_pin_site_missing: …` |
| `const` → `let` | `contract_version_pin_not_unique: … declarations=0` |
| extra spaces around `=` | `contract_version_pin_not_unique: … declarations=0` |
| declaration **duplicated** | `contract_version_pin_not_unique: … declarations=2` |
| stale **value** | `contract_version_pin_stale: … pins 2, generate-reviewer-profiles.js renders 3` |
| trailing comment after the `;` | clean — correctly tolerated (unanchored pattern) |
| leading indentation | clean — correctly tolerated |

Three things a site *can* drift past:

**E1 — the sweep's own wiring is unguarded, and this is the finding that matters.** Nothing in the
repo references `checkContractVersionPins` outside `generate-reviewer-profiles.js` — no test, no
validator assertion. Replacing both call sites' `…checkContractVersionPins(…)` with `[]` (a
syntactically clean disarm, exactly what a careless refactor produces) leaves every guard green:

```
scripts/validate-vendored-agents.js       -> EXIT=0
scripts/validate-kaola-workflow-contracts.js -> EXIT=0
scripts/test-agent-profile-parity.js      -> EXIT=0
scripts/test-install-model-rendering.js   -> EXIT=0
scripts/validate-script-sync.js           -> EXIT=0
```

The project's own rule is that a guard is evidence only once mutation-proven. This one was
mutation-proven *by hand, once*, and nothing durable keeps it armed. Impact is bounded, and I
measured that too: with the sweep disarmed **and all seven pins stale** (byte-identity preserved so
the twin checks stay quiet), `validate-kaola-workflow-contracts.js` and
`test-install-model-rendering.js` still red — so deleting the sweep would not blind the repo
entirely; it would lose the one-message, all-seven diagnosis and would let
`validate-vendored-agents.js` (which the gitlab and gitea chains run) go green over a half-done bump.

**D9 — `CONTRACT_VERSION_PIN_SITES` is a hand-typed list with no completeness guard.** An eighth
copy of the constant added at a path the list does not name is invisible:

```
D9 an EIGHTH declaration in a NEW plugin script the list does not name
   sweep -> CLEAN (no error)
```

Today the list is complete (I enumerated every `REVIEWER_BEHAVIOR_CONTRACT_VERSION` reference in
`scripts/`, `plugins/`, `install.sh`, `templates/`, `agents/`, `commands/`, `hooks/`, `docs/` and
all six `.opencode*`/`.kimi*` trees: seven declarations plus the generator, all seven listed, and no
additive-edition copy exists). The exposure is a future port.

**D8 — the sweep pins the *declaration*, not the *use*.** With the declaration correct and unique at
all four preflight twins, changing the comparison to a bare literal
(`coreVersion !== REVIEWER_BEHAVIOR_CONTRACT_VERSION` → `coreVersion !== 2`, applied to all four so
byte-identity is preserved) leaves the sweep clean and `validate-vendored-agents.js`,
`validate-kaola-workflow-contracts.js` and `validate-script-sync.js` all EXIT=0.
`test-install-model-rendering.js` catches it (EXIT=1) — but that suite runs in the claude chain only.

---

## The strongest attacks that FAILED (so you can judge whether this had teeth)

- Path traversal into a sibling (`kaola-workflow/archive/<p>/../other/x`): unreachable —
  `git status --porcelain -uall` normalizes and never emits `..` segments.
- Symlinked archive dir: git reports the symlink as a single untracked entry with **no** trailing
  slash, so `startsWith('…/<project>/')` is false and it stays bucket-3. Fails closed.
- Quoted porcelain paths (spaces / non-ASCII trigger `core.quotePath`): the leading `"` defeats the
  prefix test → bucket-3. Fails closed.
- Case-insensitive macOS: a case-variant archive dir (`…/ARCHIVE/…`, `…/ISSUE-X/…`) does not match
  the prefix → bucket-3. Fails closed. (The one case-related hole that *is* reachable —
  disk-case `Mission-List.md` vs branch-case `mission-list.md` making `git show` fail — is the same
  root cause as DEFECT 1 and is covered by its repair.)
- `git show` returning a *tree* listing or a symlink target instead of file bytes: the compare fails
  and the path falls through to bucket-3. Fails closed.
- `#892`: `checkManifest` skipping an absent surface — no such path exists; `null` reds as
  `absent-surface`.
- `#895`: trivial replacement of `readActiveFolders`, and a hostile parent env (`OFFLINE=1` plus a
  wrong `KAOLA_ISSUE_STATE_SNAPSHOT`) — the control and the env scrub both hold.
- `#889`: making `replaceOnce` no-op, and making the derived `:3000` pin tautological from the
  test side — both red.

## Suites run at full scope in the mirror

`test-sink-merge.js` (208 assertions, EXIT=0 unmutated) · `test-route-reachability.js` (323) ·
`test-generate-routing-surfaces.js` (432) · `test-install-model-rendering.js` ·
`test-opencode-edition.js` (490) · `test-kimi-edition.js` (505) · `validate-script-sync.js` ·
`validate-workflow-contracts.js` · `validate-kaola-workflow-contracts.js` ·
`validate-vendored-agents.js` · `test-agent-profile-parity.js` ·
`simulate-workflow-walkthrough.js --only testActiveFoldersExcludesClosedIssue895`.
The full walkthrough was **not** run at full scope — that belongs to whoever integrates the bundle.

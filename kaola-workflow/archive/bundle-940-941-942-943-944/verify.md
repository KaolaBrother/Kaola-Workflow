# Adversarial verification — bundle 940/941/943/944

Subject: branch `workflow/bundle-940-941-942-943-944`, worktree
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-940-941-942-943-944`.
`HEAD == d2ab06c2` — **the whole bundle is uncommitted**, so everything below reads the working
tree, not a commit range.

Method: read-only on the real tree; every mutation ran in a scratch mirror at
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/e2e7977c-.../scratchpad/mirror`,
restored between legs. Exit codes captured on their own line, never off a pipeline tail.

**The tree moved mid-review.** At first snapshot: 34 files, 832+/509−. At final snapshot: 35 files,
879+/510− — `CHANGELOG.md` landed while I was working. Every claim below is re-anchored to the final
state.

## Verdicts

| claim | verdict |
|---|---|
| #940 — the reasoning floor was removed | **UPHELD** |
| #941 — the `--check` footer names a remedy that works | **UPHELD** |
| #943 — `investigator` pinned, table cannot go short | **UPHELD** |
| #944 — the Codex role→tier roster ships | **UPHELD** |

No finding blocks closure. Three low-severity findings and one pre-existing residual are recorded.

---

## #940 — the reasoning floor was removed — UPHELD

### Removal is complete and the four copies are genuinely byte-identical

```
$ find . -name 'kaola-workflow-resolve-agent-model.js' -not -path './.git/*' -exec shasum -a 256 {} \; | awk '{print $1}' | sort -u
46fcbd3774a2fba6b811e486b84e5edd536cb0d90b0b9d9a15182954faf40fea
```
One hash across four paths. Same for the schema (`0ac70c1d3fb8ba3e…`, four copies).

```
$ node -e "const r=require('./scripts/kaola-workflow-resolve-agent-model.js'); ..."
floor exports present: REASONING_FLOOR_ROLES=false isReasoningClass=false enforceReasoningFloor=false
```

### The sweep for dangling references

Live code + prompt surfaces (`scripts plugins agents commands templates hooks install*.sh
opencode.json package.json`), pattern
`enforce-floor|enforceFloor|REASONING_FLOOR_ROLES|isReasoningClass|enforceReasoningFloor|reasoning_floor_violation`:

```
scripts/prose-census-baseline.json:401:      "reasoning_floor_violation",
```
— that one line, nothing else.

**The frozen-snapshot reasoning holds, verified rather than assumed.** `kaola-workflow-prose-census.js`
is in no chain (`grep prose-census package.json` → no match), its own header calls it "a MEASURING
TOOL, not a gate", and `--compare` exits 0 unless `--fail-on-regression` is passed:

```
$ node scripts/kaola-workflow-prose-census.js --compare >/dev/null 2>&1; echo $?
0
```
(verdict `proportional` on all three metrics). Editing the baseline would corrupt the "before"
reading; leaving it is inert.

**The generated trees that actually ship were swept too** (ugrep skips dot-dirs, so `find` + `/usr/bin/grep`):
114 files across `.opencode{,-gitlab,-gitea}` and `.kimi{,-gitlab,-gitea}` — zero floor tokens.
Positive control on the same sweep: it *does* find `reasoning-class` in
`.opencode/agent/synthesizer.md` and `.kimi/skills/kaola-role-synthesizer/SKILL.md`, and it finds no
`non-lowerable` — while `git show HEAD:agents/synthesizer.md | grep -c non-lowerable` → `1`. The
generated trees carry the post-bundle wording.

### No unique non-floor assertion left with the deleted blocks

I reproduced impl-940's table independently by reading the surviving
`scripts/test-agent-model-resolver.js`, not by trusting it:

| assertion inside a deleted floor block | still covered by |
|---|---|
| `synthesizer` → `opus` | `:43-50` (every role's tier must equal its Codex profile class) and `:59-66` (source frontmatter byte-equal to the map) |
| frontmatter override lowers the default | `:101-102` (`doc-updater` → `haiku`), `:97-98` |
| `inherit` frontmatter falls through to the static default, never to empty | `:106-107` (`planner`), `:129-132` (`code-architect`, `security-reviewer`) |
| static default with no agent file present | `:92` (`tdd-guide` → `sonnet` on a fresh empty dir) |

**Two of the deleted assertions were already vacuous at HEAD.** The `missingProof` / `freshProof`
cases passed `{runtime, currentThreadId, sessionProof}` to `enforceReasoningFloor`, whose body read
`options.runtime` and nothing else — `sessionProof` and `currentThreadId` were never consulted. They
proved nothing before deletion. `loadCodexSessionProof` itself is untouched and still exported,
asserted, and exercised by the surviving `tmpSessionHome` blocks.

### No role re-tiered

```
cur  {"code-explorer":"sonnet","investigator":"sonnet",...,"synthesizer":"opus"}
base {"code-explorer":"sonnet","investigator":"sonnet",...,"synthesizer":"opus"}
IDENTICAL(order+values) = true
```
(current working tree vs `git show HEAD:` copy, compared as `JSON.stringify` so key order counts.)

### The CHANGELOG's factual claims, each checked

- *"fails honestly with `unexpected argument`"* —
  ```
  $ node scripts/kaola-workflow-resolve-agent-model.js synthesizer --enforce-floor
  unexpected argument: --enforce-floor
  EXIT=2
  $ node <HEAD copy> synthesizer --enforce-floor
  opus
  EXIT=0
  ```
  Verified breaking-loud, and no caller in the repo or in any shipped tree passes the flag.
- *"its one production consumer `kaola-workflow-next-action.js` was deleted by `c0b48043`"* —
  `git show --stat c0b48043` shows `scripts/kaola-workflow-next-action.js | 416 -` and
  `scripts/test-next-action.js | 1191 -`. The only surviving matches in `git ls-files` are four
  archive `.cache` records.
- *"the only remaining caller — the dispatch-log hook — invokes the resolver without the flag and is
  fail-open"* — `hooks/kaola-workflow-subagent-dispatch-log.sh:36`:
  `MODEL_PLANNED=$(node "$_KW_RESOLVER" "$AGENT_TYPE" --raw 2>/dev/null || printf '')`. Confirmed.
- The resolver stays dependency-free (`fs`, `os`, `path` only), which the surviving comment asserts.

### `test-agent-profile-parity.js` lost its only `synthesizer` pin — not a new vacuity

`grep -n synthesizer scripts/test-agent-profile-parity.js` → no matches. The file has no per-role
completeness assertion (`ROLE_PINS` is an explicit opt-in list), and its own header at `:35-36` says
*"Deleting a pin whose mechanism is gone is the correct repair; keeping a pin that matches nothing is
not an option the guard leaves open."* Suite still green at 784 assertions.

### FINDING 940-L1 (low, non-blocking) — a decision record whose subject vanished

`docs/decisions/D-687-01.md:76-80`, point 6, still reads:

> **Reasoning-floor roles inspect the inherited parent, not a profile pin.** A reasoning-floor
> dispatch requires fresh current-session proof … refuse as `reasoning_floor_proof_missing`,
> `reasoning_floor_proof_stale`, or `reasoning_floor_violation`.

Its Codex-dispatch half is already annotated as superseded by the file's own `## Qualification`
section, and this repo demonstrably *does* retro-annotate ADRs — D-687-01 already carries two
"Superseded"/"Re-qualified" banners. #940 retires the last mechanism point 6 names and added no
banner. `docs/decisions/D-646-01.md:41,83` also names `REASONING_FLOOR_ROLES`, but only to record
what that decision deliberately did *not* touch — a scope statement about the past, correct to leave.

Not a defect in the claim under review (which is about resolver copies, tests and tiers), and ADRs
are historical by this repo's convention. Recorded so the orchestrator can decide.

---

## #941 — the `--check` remediation footer — UPHELD

### All 14 classes carry a remedy, in the ratio the CHANGELOG states

```
$ grep -c 'mismatches.push' scripts/sync-opencode-edition.js   -> 14
$ grep -c 'remedy: REMEDY\.'  scripts/sync-opencode-edition.js -> 14
    of which WRITE_CONFIG = 1, SOURCE_EDIT = 1  =>  WRITE = 12
```
Matches "correct for twelve" exactly.

### I tried to construct a mismatch set the new logic advises wrongly. All 7 mixtures are right.

Driven through the real `--check` in a scratch mirror (planting real drift, not synthetic objects):

| planted set | footer | correct? |
|---|---|---|
| WRITE only | `Fix: … --write` | yes |
| WRITE_CONFIG only | `Fix: … --write-config` + the destructive-overwrite caveat | yes |
| SOURCE_EDIT only (C9) | **no command at all**, only "No flag of this script clears …" | yes |
| WRITE + WRITE_CONFIG | `--write-config` + caveat | yes |
| WRITE + SOURCE_EDIT | `--write` **and** the "No flag clears …" line | yes |
| WRITE_CONFIG + SOURCE_EDIT | `--write-config` + caveat + "No flag clears …" | yes |
| all three (2 rogue plugins) | `--write-config` + caveat + "No flag clears X, Y — … their reasons name" | yes |

Plural agreement is handled ("its reason names" / "their reasons name").

### `--write-config` is never advised unnecessarily, and it is genuinely sufficient

`REMEDY.WRITE_CONFIG` is set at exactly one site — `opencode.json` byte-differs from
`renderOpencodeJson()` — so the flag is advised **iff** that file is actually stale. `runWrite(true)`
is `writeAgents + writeCommands + writeHooks + writePlugin + writeConfig(true) + pruneRetired`, a
strict superset of `--write`. Measured, not read:

```
# WRITE + WRITE_CONFIG planted, then run what it advised
WRITE_CONFIG_EXIT=0
CHECK_AFTER=0
# premise re-confirmed: the OLD advice on a C14-only state
preserve   opencode.json (user-owned; use --write-config to overwrite)
sync-opencode-edition[github]: write complete (0 file(s) updated — tree already in sync).
CHECK_AFTER_PLAIN_WRITE=1
```

### The guard is armed — two mutations

Reverting `runCheck`'s footer to the old blanket `--write`:
```
opencode-edition test FAILED: 7 failure(s), 550 passed.
FAIL: A30[stale user-owned opencode.json]: after running what --check advised, the only mismatches left … left behind ["opencode.json"], irreducible []
FAIL: A30[unregistered canonical plugin]: NO flag of this script clears anything in this set … it offered [["--forge=github","--write"]]
```
Forcing a blanket `--write-config`:
```
opencode-edition test FAILED: 4 failure(s), 553 passed.
FAIL: A30[stale generated agent]: --write-config is NOT advised here … it rewrites the user-owned opencode.json, destroying the model pins that file invites the user to hand-edit
```
Both directions bite. A30's fixture controls are real: it asserts the scratch repo is green *before*
planting, asserts the reported set equals the planted set, and measures the flag-irreducible
remainder per scenario rather than assuming it.

### `sync-kimi-edition.js:780` — untouched and still correct

All ten kimi mismatch classes (role skills, command skills, hook scripts, hooks fragment, retired
skill dirs, retired hooks) are generator-owned artifacts; kimi has no user-owned config file, no
plugin allowlist, and no `--write-config` mode. The blanket `--write` line is right there. K12 pins
it as an outcome (run what it advised, the report must be gone) and asserts no `--write-config` is
ever named. `test-kimi-edition.js` exit 0, 516 assertions.

There is exactly one copy of `sync-opencode-edition.js` — no ×4 duplication to drift.

### FINDING 941-L1 (low, watch-list) — nothing asserts a mismatch *has* a remedy. Measured.

I added an env-gated 15th push with no `remedy` field to the mirror:

```
# probe + a stale agent
  - .opencode/agent/planner.md — stale — regenerate
  - probe/new-class.txt — a fifteenth class whose author forgot the remedy field
Fix: node scripts/sync-opencode-edition.js --forge=github --write     <-- names a remedy that does NOT clear the probe
# probe alone
  - probe/new-class.txt — a fifteenth class whose author forgot the remedy field
(no footer at all)
```

A class added without a `remedy` silently reintroduces the exact defect #941 closes. `remedies` is a
`Set` built by `mismatches.map(m => m.remedy)`, so `undefined` is neither a flag nor a source-edit and
falls out of both branches. A30's `CLASSES` table is hand-maintained (3 of 14), so it cannot notice.

**This does not refute the claim** — all 14 classes carry a remedy today, verified. It is a residual
for the ADR 0017 watch list, recorded rather than built, per "derive additively".

### FINDING 941-L2 (low, informational) — one mixture is untested

`A30.SCENARIOS` omits `{WRITE + SOURCE_EDIT}` (stale generated artifact alongside an unregistered
plugin). I drove it by hand and the footer is correct, so this is coverage, not a defect.

---

## #943 — `investigator` is pinned and the table cannot go short — UPHELD

### The completeness assertion is armed in BOTH directions

Three mutations, all in a scratch mirror, all naming the same assertion:

```
M2a: delete `investigator: 'sonnet'` from EXPECTED_ROLE_MODELS
  EXIT=1  AssertionError: the pinned install-tier table must cover exactly the resolver role registry
M2b: add a bogus key `'ghost-role'` to EXPECTED_ROLE_MODELS
  EXIT=1  AssertionError: the pinned install-tier table must cover exactly the resolver role registry
M2c: add `'ghost-role'` to DEFAULT_AGENT_MODELS (the resolver side)
  EXIT=1  AssertionError: the pinned install-tier table must cover exactly the resolver role registry
```
Table-short and registry-short both red. `Object.keys(...).sort()` on both sides is order-independent.

### The value is NOT copied from the resolver map

Flipping only the value:
```
M3: investigator: 'sonnet' -> 'opus'
  EXIT=1  AssertionError: fresh install must resolve investigator -> opus; got sonnet
```
The value is adjudicated by **spawning the resolver against an installed tree**, not by comparing to
`DEFAULT_AGENT_MODELS`. The `deepStrictEqual` is keys-only, so the map contributes membership and
never a tier. Corroborated from two further rendered/authored artifacts:
`agents/investigator.md:5` → `model: sonnet`; `README.md:146` tier column → `standard`.

### No cycle, no load-order problem, no inherited offline switch

`scripts/kaola-workflow-resolve-agent-model.js` requires only `fs`, `os`, `path`; it contains zero
occurrences of `KAOLA_WORKFLOW_OFFLINE`; its only top-level effect is
`if (require.main === module) main();`, which does not fire under `require`. It does not require the
schema or anything in `scripts/`, so importing it into `test-install-model-rendering.js` cannot close
a cycle. Suite exit 0.

Union check on the two registries (independent of both files under review):
`[...CODEX_PINNED_STANDARD_ROLES, ...CODEX_PINNED_REASONING_ROLES].sort()` **equals**
`Object.keys(DEFAULT_AGENT_MODELS).sort()`, n=14.

---

## #944 — the Codex role→tier roster ships — UPHELD

### It is genuinely derived, not a literal that happens to agree

**Mutate the constants, do not regenerate:**
```
$ # add 'zzz-probe-role' to CODEX_PINNED_STANDARD_ROLES
$ node scripts/generate-routing-surfaces.js --check
DRIFT: plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md (next/skill/github)
    L14:
      committed: "`implementer`, `doc-updater`, `metric-optimizer`."
      rendered:  "`implementer`, `doc-updater`, `metric-optimizer`, `zzz-probe-role`."
… 6 surface(s) drifted from the skeleton.
EXIT=1
```
**Then regenerate — and check where the new role lands:**
```
$ node scripts/generate-routing-surfaces.js --write   # WRITE_EXIT=0, 18 surfaces
$ find . -name '*.md' … -exec grep -l 'zzz-probe-role' {} \;
./plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
./plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
./plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
./plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
./plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
./plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
```
Exactly six files, exactly the ones claimed. This is the "read what ships" test #944 exists for, and
it passes.

### No leak into the 12 command/init surfaces

```
$ git grep -lP '^Standard-tier roles:' -- commands plugins/*/commands plugins/*/skills/kaola-workflow-init
(no matches, rc=1)
```
Structural reason, verified: `init.skeleton.md` carries no `<!-- PIN: codex-dispatch-model-routing -->`
at all, and in `next`/`finalize` the slot sits inside the `REGION:skill` block. Six, not nine, not
eighteen.

All six rosters are byte-identical: `cbe9432f4030de91070c699709e1b2db44c5cc611e4ee6b2af50263a8730c9b0`.

### The tier→effort mapping is correct and pinned to the constants

```
$ node -e "…codex-preflight…" -> STANDARD=medium REASONING=xhigh
```
matching the shipped sentences. Every role in `CODEX_PINNED_STANDARD_ROLES` is `sonnet` in
`DEFAULT_AGENT_MODELS` and every role in `CODEX_PINNED_REASONING_ROLES` is `opus` — checked directly,
not inferred.

### T19b bites on the SHIPPED bytes, independently of the byte-compare

Hand-editing one shipped SKILL.md (not the skeleton, not the constants):
```
$ # move `synthesizer` onto the standard line in gitea/finalize SKILL.md
$ node scripts/test-route-reachability.js ; EXIT=1
FAIL: T19b roster: plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md must ship the
role->tier membership its own instruction demands — 1 defect(s): synthesizer: claimed as reasoning
AND standard — one role, one tier
```
And on the effort binding:
```
$ # CODEX_STANDARD_EFFORT 'medium' -> 'low', surfaces untouched
FAIL: T19b effort: … must state the tier->effort pair the Codex profile constants define —
standard-tier is not stated as reasoning_effort "low"
```
So the roster is guarded twice over: `--check` (constants ⇄ shipped bytes) and T19b (registry ⇄
shipped bytes, both directions), and neither is a restatement of the other.

I also traced `codexRosterTiers`'s context-carry by hand over the real block. `reasoning_effort` does
not match `\breasoning\b` (underscore is a word character), so the effort sentences do not
masquerade as tier labels; the wrapped continuation lines inherit the correct tier; the "These
mappings are fixed…" paragraph names two tier words and clears context rather than mis-attributing.

### Nothing reads a stale copy

`templates/routing/slots.js` requires `../../scripts/kaola-workflow-adaptive-schema.js` — the root
copy. All four schema copies are byte-identical (`0ac70c1d…`), and `validate-script-sync.js` +
`edition-sync.js --check` both pass. There is exactly one `slots.js`. I swept every consumer of
`generate-routing-surfaces.js` / `templates/routing/` for a second fixture that copies `slots.js`
into a sandbox: only `test-generate-routing-surfaces.js` does, and that is the one that was fixed.

### The fixture fix is load-bearing, and now names its own cause

Deleting the added `'scripts/kaola-workflow-adaptive-schema.js'` copy line:
```
EXIT=1
FAIL: mutation proof: sandbox baseline --check exits 0
    sandbox stderr: Error: Cannot find module '../../scripts/kaola-workflow-adaptive-schema.js'
test-generate-routing-surfaces: 16 assertion(s) FAILED (416 passed).
```
Before the stderr surfacing, that first line said nothing and the cause lived only in a child
process.

### RESIDUAL 944-R1 (pre-existing, not introduced, non-blocking)

The 16 failures above decompose as 1 (`clean.status`) + 1 (`18 surfaces` stdout) + 7 (`DRIFT:` named)
+ 7 (`exits 0 again`). The seven `eq(red.status, 1, …)` assertions **passed** — a dead sandbox exits
1 for the same reason a detected drift does. That vacuity predates this bundle and #944 does not
widen it; the `clean.status === 0` control catches the dead sandbox first and now prints the reason.
Recorded because the dispatch asked for this exact shape.

### Minor note on T19b's prose vs its code

The header says "THE UNIVERSE IS DERIVED, NOT LISTED — a seventh surface that acquires the
instruction acquires the obligation with it." The roster loop *is* derived from committed bytes, but
the control above it pins the cardinality to `codexEditions.length * 2`, so a seventh surface reds on
the count message before the roster loop runs. That is arguably the right behaviour (a new surface
acquiring the routing PIN should be a noticed event), but the comment slightly oversells it.

---

## Cross-cutting attacks

**Two agents in one worktree — no collision found.** `scripts/test-route-reachability.js` shows 232
insertions and **0 deletions**: only #944's T19b landed, and #940 owed it nothing —
`git grep REASONING_FLOOR HEAD -- scripts/test-route-reachability.js` returns nothing, so there was
never a floor reference there to remove. `docs/conventions.md` carries **both** agents' edits (#944's
render-input sentence at `:133`; #940's `REASONING_FLOOR_ROLES` column removal *and* #944's new
six-SKILL-surfaces row in the same table at `:205-216`). Every other touched file has a single owner.

**Suites run individually, all exit 0** (not the chains — those are the orchestrator's):

| suite | result |
|---|---|
| `test-agent-model-resolver` | 0 |
| `test-install-model-rendering` | 0 |
| `test-route-reachability` | 0 (331 assertions) |
| `test-agent-profile-parity` | 0 (784) |
| `test-generate-routing-surfaces` | 0 (432) |
| `test-opencode-edition` | 0 (555, 3 trees in parity) |
| `test-kimi-edition` | 0 (516, 3 trees in parity) |
| `validate-script-sync` / `edition-sync --check` | 0 / 0 |
| all four `validate-*-contracts.js` | 0 |
| `validate-vendored-agents` | 0 (14 agents) |
| `test-forge-roadmap-rules` / `test-spawn-classification` / `test-edition-sync` / `test-suite-registration` | 0 / 0 / 0 / 0 |
| `test-claim-hardening` (**full-tier only, not in the fast gate**) | 0 (766) |
| `simulate-workflow-walkthrough` **at full scope** | 0 — `scenarios:209, ran:209, passed:209, failed:0` |

`test-claim-hardening.js` reads `templates/routing/finalize.skeleton.md`, which #944 modified, and it
runs only in `claude:full` — which is never mandated. I ran it deliberately for that reason.

## Findings, ranked

| id | sev | claim | summary | blocking |
|---|---|---|---|---|
| 940-L1 | low | #940 | `docs/decisions/D-687-01.md` point 6 still describes the retired floor refusals; the file already carries two retroactive supersession banners, so the repo's own pattern suggests a third | no |
| 941-L1 | low | #941 | nothing asserts a mismatch carries a `remedy`; a 15th class added without one silently reintroduces the defect (measured, not hypothesised) | no |
| 941-L2 | low | #941 | A30 does not cover the `{WRITE + SOURCE_EDIT}` mixture; verified correct by hand | no |
| 944-R1 | info | #944 | 7 sandbox assertions still pass vacuously on a dead sandbox — pre-existing, not widened, and caught in aggregate by the `clean.status` control | no |

Nothing found refutes any of the four claims. I attacked each along the lines the dispatch named and
several it did not, and none of them broke.

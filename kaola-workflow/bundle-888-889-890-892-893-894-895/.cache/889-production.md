# #889 — production half: one reviewer contract version, one edit surface

**Verification tier: `tests-green`** (the authored validators and the two adjacent suites pass; plus
an executed acceptance demonstration and three mutation proofs).

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-888-889-890-892-893-894-895`

---

## 1. The measurement I started from, and where the brief's site list was wrong

I re-measured every site rather than trusting the handed list. Two corrections:

**The issue's constraint (a) is factually false.** `install.sh`'s heredoc is `<<'NODE'` and cannot
expand shell variables, but it is *not* a `require`-less island. It already does, at `install.sh:238`:

```js
const generator = require(process.argv[2]);
```

where `process.argv[2]` is `"$SCRIPT_DIR/scripts/generate-reviewer-profiles.js"`, passed by the
`reviewer_manifest_metadata()` wrapper on the line above the heredoc. The module was in hand the
whole time; only the version wasn't read from it. **This is the single most load-bearing fact in the
fix** — it removes `install.sh` from the bump surface entirely, which the issue assumed impossible.

**Three more stale-message instances than the brief named.** The brief flagged
`validate-vendored-agents.js`. The same defect is live in all three contract validators, and two of
them were *already wrong in the tree* at the moment I started — condition `=== 3`, message `"version
2"`:

| file:line (pre-change) | condition | message |
|---|---|---|
| `scripts/validate-vendored-agents.js:119,123` | `=== 3` | `"behavior_contract_version 3"` (hand-synced, correct by luck) |
| `scripts/validate-kaola-workflow-contracts.js:622` | `=== 3` | **`"must bind behavior contract version 2"`** |
| `plugins/kaola-workflow-gitlab/.../validate-kaola-workflow-gitlab-contracts.js:564` | `=== 3` | **`"must expose reviewer contract version 2"`** |
| `plugins/kaola-workflow-gitea/.../validate-kaola-workflow-gitea-contracts.js:566` | `=== 3` | **`"must expose reviewer contract version 2"`** |

All four now interpolate the same constant the condition reads, so the two cannot disagree again.

---

## 2. Design

### The single source

`scripts/generate-reviewer-profiles.js` now exports **`REVIEWER_BEHAVIOR_CONTRACT_VERSION = 3`** —
one literal, in the module that renders the contract, and the module every site that can reach
anything already reaches: `install.sh`'s heredoc requires it, and all four in-repo contract
validators require it. No new module, no new require edge anywhere.

**Why a literal and not a value read back out of `templates/reviewers/behavior-contracts.json`.**
The constant's job is to state which contract version this code *understands*, so
`validateBehaviorContracts` refuses a source the renderers have not been updated for. Deriving it
from the file it validates would make that check agree with whatever the JSON said — an unfalsifiable
assertion, which is the same defect class as #889's own companion finding (two fixture regexes that
silently matched nothing). I kept it falsifiable, and the acceptance proof below shows it firing.

### The anchor constraint (b) — I did **not** need it

`scripts/kaola-workflow-adaptive-schema.js` is untouched. It is the wrong home on the merits, not
merely off-limits: the anchor exists to be byte-identical across four editions, and this constant is
consumed by exactly one subsystem (reviewer profile generation/installation) whose canonical module
already sits in `scripts/`. Putting a reviewer constant in the cross-edition kernel would widen the
kernel's surface for no reader that the generator does not already serve. **No sequencing needed from
the orchestrator on this.**

### The heredoc — removed from the bump surface

`install.sh:248-253` now reads:

```js
const contractVersion = generator.REVIEWER_BEHAVIOR_CONTRACT_VERSION;
if (sourceIdentity.behavior_contract_version !== contractVersion
    || installedIdentity.behavior_contract_version !== contractVersion) {
  throw new Error(`reviewer_contract_version_mismatch: expected ${contractVersion} for ${role}`);
}
```

Three literals gone; the heredoc stays `<<'NODE'` (no shell expansion introduced, nothing to quote).
Nothing in the repo pins the old error string — I grepped `reviewer_contract_version_mismatch` and
`expected 3 for` across all `*.js`/`*.sh` before changing it.

### The seven that genuinely cannot derive

`kaola-workflow-codex-preflight.js` (×4) and `install-codex-agent-profiles.js` (×3) run **from an
installed plugin tree**, where neither `scripts/generate-reviewer-profiles.js` nor
`templates/reviewers/` exists. The preflight four are additionally a byte-identical group whose
identity `validate-kaola-workflow-contracts.js` asserts, so a require path that resolves in `scripts/`
but not in a plugin would break them. These seven must embed the number. That makes acceptance branch
A (*one edit sufficient*) **unreachable**, and branch B the deliverable.

So: `checkContractVersionPins(root)` in the generator reads
`^const REVIEWER_BEHAVIOR_CONTRACT_VERSION = (\d+);$` out of each of the seven listed paths and
reports **every** disagreement in one array. It is called from:

- `scripts/validate-vendored-agents.js` — **step 4** of the claude chain, and also run by the gitlab
  and gitea chains;
- `scripts/validate-kaola-workflow-contracts.js` — **step 3** of the codex chain, the only chain that
  does not run `validate-vendored-agents.js`;
- `generate-reviewer-profiles.js --check`.

Two call sites cover all four chains. The sweep runs *before* the existing
`checkGeneratedProfiles` call in both, so it is the first thing to speak.

I deliberately did **not** hang it off `checkGeneratedProfiles` itself, which would have been
one-line wiring: `test-agent-profile-parity.js` calls that function against a synthetic `tempRoot`
that has no `plugins/*/scripts/`, and the sweep would have thrown there.

I also considered and declined a `--sync-version-pins` writer that would rewrite the seven from the
constant. It would get closer to branch A, but the issue asks for no new mechanism and the sweep
already satisfies the acceptance; a writer is additional machinery this project does not need.

---

## 3. Every site changed (13 files)

| file | change |
|---|---|
| `scripts/generate-reviewer-profiles.js` | **defines** `REVIEWER_BEHAVIOR_CONTRACT_VERSION`; its own `!== 3` reads it; adds `CONTRACT_VERSION_PIN_SITES` + `checkContractVersionPins`; `--check` runs the sweep; all three exported |
| `scripts/validate-vendored-agents.js` | calls the sweep first; 2 conditions + **2 messages** derive |
| `scripts/validate-kaola-workflow-contracts.js` | calls the sweep first; condition + **stale "version 2" message** derive |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | condition + **stale "version 2" message** derive |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | condition + **stale "version 2" message** derive |
| `install.sh` | heredoc reads the constant off the module it already requires; 3 literals removed |
| `scripts/kaola-workflow-codex-preflight.js` + 3 plugin twins | value unchanged (`3`); 4-line comment naming the source and the sweep |
| `plugins/*/scripts/install-codex-agent-profiles.js` ×3 | value unchanged (`3`); same 4-line comment |

The seven annotations were applied by one script writing identical bytes, so both byte groups stayed
consistent — verified by `md5`, and by `validate-script-sync.js` not listing either file.

`agents/*.md` and `plugins/*/agents/*.toml` **did not need regenerating**: the rendered value is
still 3 and `generate-reviewer-profiles.js --check` is green. (For a real future bump the command is
`node scripts/generate-reviewer-profiles.js --write && node scripts/generate-reviewer-profiles.js --check`,
which is what `REVIEWER_SOURCE_REPAIR` already says.)

---

## 4. Executed acceptance proof

Two full-tree copies under
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/f018e2ef-7526-4575-bcc6-e529af9f0e2f/scratchpad/889/`:
`before/` = the worktree with my 13 files restored to `HEAD` via `git show HEAD:<path>` (no
`git checkout --`, no `git stash`); `after/` = the worktree as I left it. Both green before the
experiment. Then the **same partial bump** in each: `behavior_contract_version` 3 → 4 for all three
roles in `templates/reviewers/behavior-contracts.json`, nothing else. Then run-read-patch, applying
only the minimal fix each message points at.

### `before/` (HEAD) — nine rounds, and still not finished

| round | failing step | message | patch it demanded |
|---|---|---|---|
| 1 | `generate-reviewer-profiles.js --write` | `behavior_contract_version_unsupported: code-reviewer=4` | generator `!== 3` |
| 2 | `validate-vendored-agents.js` | `agents/code-reviewer.md must carry behavior_contract_version 3` | its 2 conditions |
| 3 | `validate-kaola-workflow-contracts.js` | `reviewer_contract_version_unsupported: expected=3 got=4` | `install-codex-agent-profiles.js` ×3 |
| 4 | `validate-kaola-workflow-contracts.js` | **`must bind behavior contract version 2 for code-reviewer`** | its condition |
| 5 | gitlab contracts | **`must expose reviewer contract version 2 for code-reviewer`** | its condition |
| 6 | gitea contracts | **`must expose reviewer contract version 2 for code-reviewer`** | its condition |
| 7 | `test-install-model-rendering.js` | `reviewer_contract_version_unsupported: expected=3 got=4` | preflight ×4 |
| 8 | `test-install-model-rendering.js` | `reviewer_contract_version_mismatch: expected 3 for code-reviewer` | `install.sh` |
| 9 | `test-install-model-rendering.js` | `manifest must record installed sha, behavior version/hash…` (`columns[2] === '3'`) | a test file — see findings |

Rounds 4, 5 and 6 are the stale-message defect happening live: the tree is at 4, the condition wants
3, and the message says **2**.

**And after round 6 the five reviewer validators all reported green while five sites were still
wrong** — the four preflight copies, `install.sh`, and five stale messages. Only
`test-install-model-rendering.js` (claude chain step 9, absent from the other three chains) caught
them. That is worse than the issue's "fails on the fifth": a whole chain can pass over a half-done
bump.

### `after/` (the fix) — three rounds, the last one mechanical

Round 1 — the generator refuses, now saying what it renders:

```
FIRST FAILING STEP: node scripts/generate-reviewer-profiles.js --write   (exit 1)
Error: behavior_contract_version_unsupported: code-reviewer=4 (this generator renders 3)
```

Round 2 — **the single edit**, `REVIEWER_BEHAVIOR_CONTRACT_VERSION = 3` → `= 4`. The very next
step is the first validator in the chain, and it names **every remaining site in one message**:

```
FIRST FAILING STEP: node scripts/validate-vendored-agents.js   (exit 1)
Error: reviewer behavior contract version pins must all match generate-reviewer-profiles.js (4):
  contract_version_pin_stale: scripts/kaola-workflow-codex-preflight.js pins 3, generate-reviewer-profiles.js renders 4;
  contract_version_pin_stale: plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js pins 3, … renders 4;
  contract_version_pin_stale: plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js pins 3, … renders 4;
  contract_version_pin_stale: plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js pins 3, … renders 4;
  contract_version_pin_stale: plugins/kaola-workflow/scripts/install-codex-agent-profiles.js pins 3, … renders 4;
  contract_version_pin_stale: plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js pins 3, … renders 4;
  contract_version_pin_stale: plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js pins 3, … renders 4
```

(the wrapping is mine; it is one line at runtime.)

Round 3 — patch the seven the message named, mechanically, no searching:

```
after/: patched 7 pins named by the ONE message -> 4

######## AFTER (fix) — ROUND 3 ########
ALL REVIEWER STEPS GREEN
steps.sh exit=0

-- after/ byte groups still consistent? --
       1
-- after/ install.sh syntax + no version literal left --
bash -n exit=0
install.sh: zero embedded version literals
```

`install.sh` never appears in the `after/` table at all. The stale-message rounds cannot occur,
because message and condition now read one variable.

**Acceptance, branch B: met and executed.** An incomplete bump fails on the *first* validator in
every chain (claude step 4, codex step 3, and `validate-vendored-agents.js` in the gitlab and gitea
chains too), and names every outstanding site with its path and both numbers.

### Mutation proofs that the sweep is armed (three branches, `[]` control)

```
=== mutation A: a listed pin site is renamed away ===
[ 'contract_version_pin_site_missing: plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js' ]

=== mutation B: a second declaration appears in one site ===
[ 'contract_version_pin_not_unique: plugins/kaola-workflow/scripts/install-codex-agent-profiles.js declarations=2' ]

=== unmutated control (must be []) ===
[]
```

(Branch C — a stale value — is the round-2 output above.) Done on a scratch mirror, never by
reverting in place.

---

## 5. Verification results (real worktree)

Before (baseline, recorded before any edit) — all six of the brief's commands exit 0, plus the two
forge validators, plus `md5`: preflight ×4 one hash, install-codex ×3 one hash.

After:

| command | exit | last line |
|---|---|---|
| `node scripts/validate-vendored-agents.js` | 0 | `Vendored agent validation passed for 14 agents at 922d2d8f…` |
| `node scripts/validate-kaola-workflow-contracts.js` | 0 | `Kaola-Workflow Codex contract validation passed` |
| `node scripts/generate-reviewer-profiles.js --check` | 0 | `Reviewer profile generation check passed.` |
| `node scripts/edition-sync.js --check` | 0 | `edition-sync: committed kernel parity verified at HEAD.` |
| `bash -n install.sh` | 0 | — |
| `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | 0 | `Kaola-Workflow GitLab contract validation passed` |
| `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | 0 | `Kaola-Workflow Gitea contract validation passed` |
| `node scripts/test-agent-profile-parity.js` | 0 | `agent-profile parity tests passed (768 assertions)` |
| `node scripts/test-install-model-rendering.js` | 0 | `Install model rendering tests passed` |

The last two are not on the brief's list; I ran them because I changed the generator's exports and
`install.sh`, and those are the two suites that exercise them. `test-install-model-rendering.js` is
in another agent's write-set — I only **ran** it, and it passes on the tree as it currently stands.

`node scripts/edition-sync.js --write` was **not** run, as instructed. Byte groups were kept
consistent by hand and verified: preflight ×4 → 1 distinct hash; install-codex ×3 → 1 distinct hash.

`node scripts/validate-script-sync.js` exits **1**, on files that are not mine and were already
modified when I arrived: `kaola-workflow-run-chains.js`, `kaola-workflow-release.js`, and the three
`kaola-workflow-adaptive-schema.js` kernel copies. Neither
`kaola-workflow-codex-preflight.js` nor anything else I touched appears in its output. Not caused by
this change; noted so nobody re-diagnoses it.

The full walkthrough was not run, as instructed.

---

## 5a. Where the two sites outside the issue's table fall in the ordering

Raised by w2-889t via the lead after my first pass. Both were already in my measurement; this states
the ordering they asked for. My design takes the **"fail on the first site"** branch, so the question
is what each site's *position* is. The full four-step bump procedure is now written into the
`REVIEWER_BEHAVIOR_CONTRACT_VERSION` comment block, which is what the next bumper reads.

**`templates/reviewers/behavior-contracts.json` (×3 roles) — position 1, and consciously not the home
of the single edit.** It reds *first*, before anything else in any chain, with
`behavior_contract_version_unsupported: <role>=N (this generator renders M)`. I did not make the
constant derive from it, and would push back on doing so: the constant's job is to say which version
the *code* understands, so `validateBehaviorContracts` can refuse a source the renderers have not
caught up with. A constant read out of the JSON would agree with whatever the JSON said, and that
check would assert nothing. So the bump is two edits at the top (JSON ×3 roles, constant ×1) rather
than one — and the second is announced by the first failing, not found by grepping.

**`scripts/test-install-model-rendering.js` (the manifest column pin) — SUPERSEDED, see §7.** What
this section originally said — that it is position 4, that the sweep cannot reach it, and that it is
a deliberately independent hand-edit site — described the tree as it stood when I wrote it. The lead
subsequently ruled that it derive from the exported constant, and it now does. **The bump is three
steps, not four.** §7 records the correction; the prose in `generate-reviewer-profiles.js` has been
brought into line.

Net ordering under the fix: **3 rounds** (JSON → constant → seven-named-at-once), against **9+** at
HEAD, with the seven collapsed into one message and `install.sh` gone entirely.

Also confirmed by w2-889t and not re-derived by me: the fixture half is independent of this
consolidation — the fixtures now match the version as `\d+` off the generated profile rather than
against any constant, so they hold whether or not the constant moves. I did verify by reading that
`replaceOnce` and the `\d+` patterns are present in the tree (`test-install-model-rendering.js:2650`,
`:2664`, `:2671`).

## 6. Findings I am not fixing (out of write-set)

1. **A twelfth site, in a test file.** `scripts/test-install-model-rendering.js:2993` asserts
   `columns[2] === '3'` on the Claude managed-agent manifest row — the *only* thing left failing in
   the fully-bumped `after/` copy at the time. **Resolved since, by the lead's ruling: it now derives
   from the exported constant and is no longer a hand-edit site.** See §7. I never touched that file.

2. **`CHANGELOG.md` entry is owed and I did not write it**, to avoid racing `changelog-draft-2`.
   Suggested text for `[Unreleased]`:

   > - **The reviewer behavior contract version is now one exported constant, and an incomplete bump
   >   fails on the first validator instead of the fifth (#889).** Bumping it took eleven hand edits
   >   found one validator run at a time. `scripts/generate-reviewer-profiles.js` now exports
   >   `REVIEWER_BEHAVIOR_CONTRACT_VERSION`, and every site that can read it does — including
   >   `install.sh`, whose heredoc already had the generator module in hand, so the installer is off
   >   the bump surface entirely. The seven Codex preflight and profile-installer copies ship inside
   >   plugin trees and must embed the number; they are swept instead, so a half-finished bump now
   >   reports **all** outstanding sites in one message from the first validator in every chain. The
   >   four contract validators' failure messages derive from the same constant as their conditions —
   >   three of them were reporting "version 2" while asserting `=== 3`.

3. `validate-script-sync.js` red — see above; another agent's in-flight work, not a #889 defect.

---

## 7. Correction — the manifest column pin now derives; my prose no longer did

**What changed under me.** After I wrote §5a, the lead ruled that the Claude managed-agent manifest
column check in `scripts/test-install-model-rendering.js` derive from the exported constant. It now
reads, at `:3000`:

```js
assert.strictEqual(columns[2], String(reviewerGenerator.REVIEWER_BEHAVIOR_CONTRACT_VERSION),
```

I verified this in the tree before rewriting anything, rather than taking it on report: `grep -c
'^const REVIEWER_BEHAVIOR_CONTRACT_VERSION = [0-9]+;'` on that file returns **0**, so it *reads* the
constant and *declares* none.

**Why this is not a reversal of my reasoning.** My objection, and w2-889t's, was to deriving the
column from the **source profile the installer had just read** — that would make the manifest agree
with its own input by construction and pin nothing. The ruling derives it from the **exported
constant** instead, which asserts a different property: that the installed manifest records the
version *this code understands*. That stays falsifiable, and w2-889t mutation-proved it both ways
(still reds when the installer writes a wrong version; no longer reds on a correct bump). Neither of
us proposed it; it is a better answer than either objection.

**What was stale, and is now fixed** — two sites, both in `scripts/generate-reviewer-profiles.js`,
both mine, both written before the ruling:

1. The bump procedure in the `REVIEWER_BEHAVIOR_CONTRACT_VERSION` comment block claimed **four
   steps**, and its step 4 named that file as unreachable by the sweep and instructed *"Expect it; do
   not 'fix' it by deriving."* That instruction forbade exactly what the tree now does, and step 4
   was empty besides — a full simulated bump no longer touches the file. Now **three steps**, closing
   with: *"There is no fourth step: every other consumer, in the repo and in the suites, reads this
   constant."*
2. The non-membership note above `CONTRACT_VERSION_PIN_SITES` gave the right conclusion (stay out of
   the list) for a reason that had become wrong ("an independent expectation… folding it in would
   erase that independence"). Replaced with the mechanical reason, which is durable: membership is
   files that **declare** the constant, since that is what `CONTRACT_VERSION_PIN_PATTERN` matches; a
   file that merely **reads** it cannot be a pin site and needs no entry, because a bump reaches it
   through the export.

Grepped afterwards for residual `four steps` / `step 4` / `do not "fix" it by deriving` in the file:
the only hit is `:753`, `"step 4 of the claude chain"`, an unrelated and still-correct statement
about where `validate-vendored-agents.js` sits in the chain ordering.

`§5a` and `§6` above are corrected in place, since a report asserting a false fact about the shipped
tree is the same defect in a different file.

**Not touched, as instructed**: `scripts/test-install-model-rendering.js` (test custody, and already
correct), `CHANGELOG.md` (its `:241` mention of "three literals" is accurate as history of the 2→3
bump), `README.md`, `docs/architecture.md`, `docs/api.md`, `templates/routing/**`,
`scripts/validate-workflow-contracts.js`. No `git checkout --`, no `git stash`, no
`edition-sync --write`.

**Re-verified after the correction** (comment-only change; the three commands the lead asked for):

| command | exit | last line |
|---|---|---|
| `node scripts/generate-reviewer-profiles.js --check` | 0 | `Reviewer profile generation check passed.` |
| `node scripts/validate-vendored-agents.js` | 0 | `Vendored agent validation passed for 14 agents at 922d2d8f…` |
| `node scripts/validate-kaola-workflow-contracts.js` | 0 | `Kaola-Workflow Codex contract validation passed` |

**The CHANGELOG draft in §6 is now slightly stale too** — it says a bump "fails on the first
validator instead of the fifth", which is still true, but the ordering is now three steps with no
test-file hand edit. Whoever writes the entry should take the three-step framing.

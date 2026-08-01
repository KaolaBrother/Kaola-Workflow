# #889 — test half: un-pinning the vacuous reviewer fixtures

**Write-set:** `scripts/test-install-model-rendering.js` only. Nothing else in the worktree was
touched (`plugins/kaola-workflow/agents/code-reviewer.toml` md5-verified unchanged:
`56c1d54c4e519d1f3fe218041a32a0df` before and after).

**Baseline:** worktree HEAD `fa5157b3` plus the other agents' uncommitted edits.
Suite before my change: `node scripts/test-install-model-rendering.js` → **EXIT=0**, 17.1s.
Suite after my change (re-run against the current tree): **EXIT=0**.

---

## 1. The new fixture shape

```js
  // A fixture regex that names the live contract version goes vacuous the moment the version
  // moves: the replacement matches nothing, hands back the input unchanged, and its mutation case
  // still runs and is still counted while asserting nothing. The version is matched as a digit run
  // rather than a literal, and every substitution proves it landed on exactly one site and changed
  // the text — so a pattern that stops matching fails here, naming itself, instead of surfacing as
  // a puzzling downstream code mismatch.
  function replaceOnce(source, pattern, replacement) {
    const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
    const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
    assert.strictEqual(matches.length, 1,
      `reviewer fixture ${pattern} must match exactly one site; matched ${matches.length}`);
    const mutated = source.replace(pattern, replacement);
    assert.notStrictEqual(mutated, source,
      `reviewer fixture ${pattern} substituted nothing and would test nothing`);
    return mutated;
  }
```

Both fixtures now read:

```js
      text: replaceOnce(reviewer, /^behavior_contract_version: \d+\n/m, ''),
      ...
      text: replaceOnce(reviewer, /^behavior_contract_version: \d+$/m,
        'behavior_contract_version: 1'),
```

No version literal remains in either **pattern**. The version is matched as `\d+`, so the fixture
tracks whatever the generated profile says. I deliberately did **not** import the production
constant: a fixture that derived its pattern from the same constant the guard checks would go blind
to a profile carrying the wrong version. Deriving from the artifact under test is the point.

`plugins/kaola-workflow/agents/code-reviewer.toml` carries exactly **one** `behavior_contract_version`
line (`grep -c` = 1), so `must match exactly one site` is the correct bound, not merely a lower one.

## 2. How it now fails loudly

Two arms, both mutation-proven below, both firing **at fixture construction** — before any validator
runs, and naming the pattern that broke:

| arm | fires when | message |
|---|---|---|
| `strictEqual(matches.length, 1)` | the pattern stops matching (a rename, a format change) or starts matching twice | ``reviewer fixture /^behaviour_contract_version: \d+\n/m must match exactly one site; matched 0`` |
| `notStrictEqual(mutated, source)` | the pattern matches but the substitution is a no-op — e.g. a bump makes the "unsupported" replacement coincide with the live version | ``reviewer fixture /^behavior_contract_version: \d+$/m substituted nothing and would test nothing`` |

The second arm is what makes the hardcoded `1` safe: if the contract version were ever set to 1, the
replacement would equal the matched text and the fixture would red instead of validating a pristine
profile.

## 3. Verdict on the nearby version literals

| site | literal | verdict | why |
|---|---|---|---|
| `:2662` | `'behavior_contract_version = 2\ndeveloper_instructions ='` | **keep** | The *pattern* is `/^developer_instructions =/m` — version-independent, cannot go vacuous on a bump. The `2` is an arbitrary payload for a negative case: the code asserted is `reviewer_adapter_field_forbidden`, forbidden because it is a **top-level TOML assignment** (`=`, outside `developer_instructions`), not because of its value. Any number behaves identically. |
| `:2695` | `'"behavior_contract_version" = 2'` | **keep** | Same shape — the quoted-key top-level assignment is forbidden regardless of value; the anchor pattern is `/^developer_instructions/m`. |
| `:2719` | `'behavior_contract_version: 1'` inside the instructions block | **keep** | Anchor is `/^developer_instructions = """$/m`. The asserted code is `reviewer_behavior_contract_version_not_unique` — triggered by there being **two** version lines. The value is irrelevant; it must merely be a version line. Hardcoding a wrong one is correct for a negative case. |
| `:2993` (**found while working, not on the brief's list**) | `columns[2] === '3'` | **keep, but report** | This is a *fourth* version literal in the file, missed by a `behavior_contract_version: 3` grep because it is a bare string compare on the Claude managed-agent manifest's behavior-version column. It is **not** the silent-no-op defect: it is a positive equality assertion and it **reds loudly** on a bump — proven below, it is the site that stopped my simulated bump-to-4 run. It is nevertheless a hand-edit site the next bump must touch, so the production half may want it in scope. I did not change it: deriving it from the source profile would make the manifest agree with the source by construction and would weaken what the column currently pins. That is a judgement about what the assertion is *for*, so I am surfacing it rather than deciding it. |

Only the two on the brief were changed. Nothing else in the file was churned.

## 4. The corrected comment (`:157`)

Was:

> Profile **and shared-config** replacement stages must never reuse the predictable historical
> `.tmp-<pid>` path, follow a planted symlink, or clobber a colliding randomized stage. A collision
> is retried with a fresh exclusive candidate; exhausting the retry budget preserves both the live
> target and the collision.

Now:

> Profile replacement staging must never reuse the predictable historical `.tmp-<pid>` path, follow
> a planted symlink, or clobber a colliding randomized stage. A collision is retried with a fresh
> exclusive candidate; exhausting the retry budget preserves both the live target and the collision,
> and a failed rename removes only the stage this writer created.

**Verified against the assertions it heads**, not assumed. The block contains exactly four
`runStageRegression` cases, all calling `codexProfileInstaller.copyAgentProfiles` — no shared-config
path remains:

1. `profile predictable-stage symlink` (:188) — planted `.tmp-<pid>` symlink; asserts the target gets
   the new bytes, the outside sentinel is unchanged, and the planted symlink is left intact.
2. `randomized-stage collision retry` (:216) — asserts `random.calls === 2` (fresh candidate on
   collision), target written, sentinel unchanged, the other process's symlink preserved.
3. `randomized-stage collision exhaustion` (:246) — typed `atomic_stage_collision:` throw; live target
   and collision both preserved.
4. `owned-stage cleanup after rename failure` (:279) — asserts the stage this writer created is gone
   and the live target survives.

Two facts the old wording got wrong, not one: `git show 9dbd6b8a` shows the block originally held
**six** cases including `shared-config predictable-stage symlink` and `shared-config randomized-stage
collision retry`; both are gone (`grep -rn seedKaolaConfig scripts plugins install.sh` → no hits in
live code, only two obituary comments in the gitlab/gitea suites). And the old final sentence stopped
at case 3 — it never described case 4 at all. The new clause covers it.

## 5. Mutation proofs

All simulation done on a full `tar`-copied scratch mirror at
`/private/tmp/claude-501/…/scratchpad/mirror`. The worktree was never bumped and never reverted
(no `git checkout --`, no `git stash`).

### (a) The fixtures are armed — each reds when its production guard is disabled

Mirror baseline: `Install model rendering tests passed`, EXIT=0.

Guard 1 disabled — `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js:386`,
`reasons.push('reviewer_behavior_core_version_missing')` → `void 0`:

```
EXIT=1
AssertionError [ERR_ASSERTION]: missing behavior contract version must fail with
reviewer_behavior_core_version_missing; got ["reviewer_resolved_profile_hash_mismatch: expected=a07a79ae…
    at .../scripts/test-install-model-rendering.js:2794:5
```

Guard 2 disabled — same file `:402`, the `reviewer_contract_version_unsupported` push → `void 0`:

```
EXIT=1
AssertionError [ERR_ASSERTION]: unsupported behavior contract version must fail with
reviewer_contract_version_unsupported; got ["reviewer_resolved_profile_hash_mismatch: expected=8c91cc9b…
    at .../scripts/test-install-model-rendering.js:2794:5
```

The `resolved_profile_hash_mismatch` in the residual reasons is itself evidence the fixture
substituted: the mutated text no longer matches its own self-hash. Installer restored to pristine
between runs, md5-verified (`e77dc3e206d089e31e1eb8ff9c876c5e`).

### (b) The fixtures survive a version bump — and the old ones do not

Simulated a full bump to contract version **4** in the mirror: `templates/reviewers/behavior-contracts.json`
(3 roles), `generate-reviewer-profiles.js:361`, `REVIEWER_BEHAVIOR_CONTRACT_VERSION` in 7 preflight
and installer copies, `install.sh`'s heredoc (`!== 3` ×2 + its message), then
`node scripts/generate-reviewer-profiles.js --write` → `Wrote 12 reviewer profiles.` and
`plugins/kaola-workflow/agents/code-reviewer.toml:7` → `behavior_contract_version: 4`.

*Incidentally reproduces the issue's own complaint:* the first bumped run died inside `install.sh`
with `Error: reviewer_contract_version_mismatch: expected 3 for code-reviewer` — the heredoc site,
found one failure at a time exactly as #889 describes.

**With the new fixtures, bumped to 4:**

```
EXIT=0
Install model rendering tests passed
```

(after also bumping the `:2993` manifest pin *in the mirror only* — that assertion was the one
blocking, with `Claude managed-agent manifest must record installed sha, behavior version/hash, and
resolved profile hash for code-reviewer` at `:2993`. Execution reaching `:2993` already proves the
reviewer fixture block at `:2770–2795` ran and passed under the bump.)

**With the old pinned fixtures restored on that same bumped tree:**

```
EXIT=1
AssertionError [ERR_ASSERTION]: missing behavior contract version must fail with
reviewer_behavior_core_version_missing; got []
    at .../scripts/test-install-model-rendering.js:2793:5
```

`got []` is the signature of vacuity: the `: 3` regex matched nothing, the "mutated" text was the
pristine valid profile, and the validator correctly found no reasons. Worth stating precisely,
because it refines the issue's wording: on a **fully consistent** bumped tree the old fixture does
not silently go green — it reds, but with a message that accuses the production guard of having
stopped reporting a code. The defect is that it tests nothing *and* misdirects. Under the real 2→3
bump the tree was mid-flight and the suite died elsewhere first, which is how they survived.

### Loud-failure arms

Pattern deliberately broken (`behavior` → `behaviour`) on the bumped mirror:

```
EXIT=1
AssertionError [ERR_ASSERTION]: reviewer fixture /^behaviour_contract_version: \d+\n/m must match
exactly one site; matched 0

0 !== 1
    at replaceOnce (.../scripts/test-install-model-rendering.js:2653:12)
    at Object.<anonymous> (.../scripts/test-install-model-rendering.js:2664:13)
```

Replacement made to coincide with the live version (`…: 1` → `…: 4` on the bumped mirror):

```
EXIT=1
AssertionError [ERR_ASSERTION]: reviewer fixture /^behavior_contract_version: \d+$/m substituted
nothing and would test nothing
    at replaceOnce (.../scripts/test-install-model-rendering.js:2656:12)
```

Both fire at the fixture, before the validator, and name the pattern — the `got []` misdirection is
converted into a self-identifying failure.

## 6. Notes for the production half (#889)

- The production consolidation does not interact with this change: the fixture derives from the
  generated profile, not from any constant, so it holds whether or not the constant moves to
  `kaola-workflow-adaptive-schema.js`.
- The bump sites I had to touch in the mirror to reach green, for cross-checking their list:
  `templates/reviewers/behavior-contracts.json` (×3 roles), `scripts/generate-reviewer-profiles.js`,
  `REVIEWER_BEHAVIOR_CONTRACT_VERSION` ×7 (`scripts/kaola-workflow-codex-preflight.js`,
  `plugins/{kaola-workflow,-gitlab,-gitea}/scripts/kaola-workflow-codex-preflight.js`,
  `plugins/{kaola-workflow,-gitlab,-gitea}/scripts/install-codex-agent-profiles.js`), `install.sh`
  heredoc, and — not in the issue's table — `scripts/test-install-model-rendering.js:2993`.
  `scripts/validate-vendored-agents.js` and `scripts/validate-kaola-workflow-contracts.js` are also
  pinned but are not exercised by this suite.
- There is no edition twin of this suite: `test-install-model-rendering.js` exists only under
  `scripts/`, and the two pinned regexes appeared nowhere else in the tree.

---

# Addendum — `:2993` derived from the generator's constant (lead ruling)

Second pass, same write-set. The lead ruled: derive the Claude managed-agent manifest version column
from `generate-reviewer-profiles.js`'s exported `REVIEWER_BEHAVIOR_CONTRACT_VERSION`, not from the
source profile. I agree with the distinction and it survived mutation proof — **I am not invoking
the STOP clause.** One cross-write-set contradiction needs the lead's attention; see §D.

## A. The change

Was (now at `:2993` after my first pass shifted lines):

```js
    assert(columns.length === 5 && columns[2] === '3'
      && /^[0-9a-f]{64}$/.test(columns[3]) && /^[0-9a-f]{64}$/.test(columns[4]),
    'Claude managed-agent manifest must record installed sha, behavior version/hash, and resolved profile hash for ' + role);
```

Now:

```js
    assert(columns.length === 5
      && /^[0-9a-f]{64}$/.test(columns[3]) && /^[0-9a-f]{64}$/.test(columns[4]),
    'Claude managed-agent manifest must record installed sha, behavior version/hash, and resolved profile hash for ' + role);
    // The version column is read from the generator, not pinned, so a contract bump carries it
    // instead of leaving a hand-edit site here. It is not a restatement of the source profile:
    // this column is what the INSTALLER recorded about the bytes it wrote, so a writer that
    // reports a version it did not verify still reds.
    assert.strictEqual(columns[2], String(reviewerGenerator.REVIEWER_BEHAVIOR_CONTRACT_VERSION),
      'Claude managed-agent manifest must record the behavior contract version this code renders for '
      + role);
```

Two deliberate choices beyond the ruling:

- **The version condition is split out of the lumped `assert`.** The old four-condition assert
  reported one message for four different failures, so a version mismatch said "must record installed
  sha, behavior version/hash, and resolved profile hash" and left the reader to work out which. Given
  that this issue is about failures that do not name themselves, `assert.strictEqual` earns its two
  extra lines: the transcript in §C prints `'4' !== '3'`. `columns.length === 5` and the two
  hash-shape checks are unchanged.
- **`String(...)` rather than `Number(columns[2])`.** A missing or renamed export yields
  `String(undefined) === 'undefined'`, which reds; `Number(columns[2])` against a missing export
  would compare `NaN !== NaN` and also red, but the string form keeps the message readable. The
  module already resolves — `require('./scripts/generate-reviewer-profiles.js')
  .REVIEWER_BEHAVIOR_CONTRACT_VERSION` → `3 number` — and the suite already requires it as
  `reviewerGenerator` at `:23`, so no new dependency.

`scripts/test-install-model-rendering.js` after this pass: **EXIT=0** (worktree, current tree).

## B. Falsifiability analysis — why this is not the vacuity class

The producer is `install.sh`'s `reviewer_manifest_metadata` heredoc. It emits the column at
`install.sh:272-276` as `installedIdentity.behavior_contract_version` — parsed out of the **installed
bytes on disk** — and it separately guards, at `install.sh:251-255`:

```sh
const contractVersion = generator.REVIEWER_BEHAVIOR_CONTRACT_VERSION;
if (sourceIdentity.behavior_contract_version !== contractVersion
    || installedIdentity.behavior_contract_version !== contractVersion) {
  throw new Error(`reviewer_contract_version_mismatch: expected ${contractVersion} for ${role}`);
}
```

So the honest accounting of what the assertion catches, before and after:

| failure class | literal `'3'` | derived from the constant |
|---|---|---|
| the writer reports a version it did not verify (wrong expression, stale metadata, shifted column) | reds | **reds** — proven in §C |
| the export is removed or renamed | passes (independent of it) | reds (`'undefined'`) |
| a consistent, intentional contract bump | reds — that was step 4 of the bump procedure | passes, by design of the ruling |
| the installed profile carries a version this code does not understand | reds | never reached: `install.sh:251-255` throws first, and the install itself fails |

The last row is the real cost and I want it recorded plainly: for that class the assertion is now a
downstream restatement of a guard the installer already runs against the same constant. Its
*independent* value is row 1 — a producer-side defect between "verify the identity" and "write the
row". That class is real (the row is assembled in a separate expression and travels through shell
plumbing), and it is exactly what the lead's ruling named. It is not vacuous, and §C is the proof
rather than the argument.

## C. Mutation proofs

Fresh mirror (`scratchpad/mirror2`) tar-copied from the worktree *after* the production half's edits
landed, so the constant, the export and the pin sweep are all the shipped ones. Mirror baseline:
`Install model rendering tests passed`, EXIT=0. Worktree never bumped; no `git checkout --`, no stash.

**Mutation 1 — the installer writes a version it did not verify.** `install.sh:273`
`installedIdentity.behavior_contract_version` → `installedIdentity.behavior_contract_version + 1`
(the guard at `:251-255` left fully armed, so this is precisely "verified one number, recorded
another"):

```
EXIT=1
AssertionError [ERR_ASSERTION]: Claude managed-agent manifest must record the behavior contract
version this code renders for code-reviewer

'4' !== '3'
    at .../scripts/test-install-model-rendering.js:3000:12
```

`install.sh` restored, md5-verified `fdb65bb4dc14d2010ad1de95a2ae9d0e`.

**Mutation 2 — it is derived, not frozen: a full bump no longer touches this file.** Bumped the
mirror to contract version 4 following the production half's own documented procedure —
`templates/reviewers/behavior-contracts.json` (3 roles), `generate-reviewer-profiles.js:38`, the
seven `CONTRACT_VERSION_PIN_SITES` — then `--write` (`Wrote 12 reviewer profiles.`).
`scripts/test-install-model-rendering.js` **not edited**, `install.sh` **not edited** (0 hits for the
old literal — the production half's heredoc fix holds):

```
EXIT=0
Install model rendering tests passed

version 4
pin errors []
```

Compare the first pass, where the same bump stopped dead at this exact assertion with `Claude
managed-agent manifest must record installed sha, behavior version/hash, and resolved profile hash
for code-reviewer`. The bump procedure is now three steps, not four.

Together: mutation 1 shows it still reds on a real defect; mutation 2 shows it no longer reds on a
correct bump. That pair is what distinguishes "derived" from "vacuous".

## D. Cross-write-set contradiction — needs the lead or w2-889p, not me

`scripts/generate-reviewer-profiles.js` is not my write-set, and it now documents the opposite of
what ships. Three sites, all written before this ruling:

1. **`:23-37`, the four-step bump procedure.** Step 4 reads: *"`scripts/test-install-model-rendering.js`
   — the Claude managed-agent manifest column pin (`columns[2] === '<version>'`). THE SWEEP DOES NOT
   REACH IT and nothing above will warn you… **Expect it; do not "fix" it by deriving.**"* Step 4 is
   now empty — mutation 2 above is the evidence — and its instruction directly forbids what the tree
   now does.
2. **`:764-767`, above `CONTRACT_VERSION_PIN_SITES`.** *"One version literal is deliberately NOT a
   member: the managed-agent manifest column pin… It is an independent expectation about what the
   installer wrote, not a copy of this constant, and folding it in would erase that independence."*
   The membership conclusion is still right for the wrong reason: the file should stay out of
   `CONTRACT_VERSION_PIN_SITES` because it **reads** the constant rather than declaring one (the
   sweep pattern is `const REVIEWER_BEHAVIOR_CONTRACT_VERSION = (\d+);`, which my file does not
   match), not because it holds an independent literal.
3. The same claim appears in `CHANGELOG.md:241` as *"three literals in `test-install-model-rendering.js`"*
   — that historical entry describes the 2→3 bump and is accurate as history; I flag it only so
   nobody edits it by reflex.

Worth noting for the record: the production half's stated *reason* was never refuted. Its argument is
against deriving from **the profile the installer just read** — "would make the manifest agree with
its own source by construction and pin nothing" — which is the same objection I raised and which the
ruling upheld. It simply does not address deriving from the constant. So this is stale prose, not a
disagreement about the design.

## E. First-pass work, unchanged

Everything in the sections above this addendum stands as delivered: the two un-pinned fixtures, the
`replaceOnce` loud-failure helper and its two proven arms, the `:2662`/`:2695`/`:2719` verdicts
(keep, all three), and the corrected `:157` staging comment. Final worktree state: one file changed,
`scripts/test-install-model-rendering.js`, +36/−7.

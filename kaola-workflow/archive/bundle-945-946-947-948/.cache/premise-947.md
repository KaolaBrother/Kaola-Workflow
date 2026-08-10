# Investigation: premise of #947 — the dangling "Codex Profile Freshness Gate" cross-reference

## VERDICT: **CONFIRMED** (premise holds exactly as filed), with one **material correction to its
scope** and one finding the issue did not anticipate.

- The dangling sentence is real, at the exact installed lines the issue cites.
- The issue's routing claim is right: the fix belongs in `templates/routing/next.skeleton.md`.
- **Correction to scope:** the issue says the reference ships to Codex. That is true of *installed*
  surfaces on this box, but it is carried by **four tracked files** in the repo (1 skeleton + 3
  rendered Codex skill surfaces, one per forge), and a fifth *authoring-only* carrier — the
  `<!-- REGION:skill … -->` comment at `next.skeleton.md:237` whose stated justification is *also*
  the dead gate. A retire/restore edit that misses line 237 leaves the region's recorded reason
  dangling.
- **Unanticipated finding:** the guard that was installed by the very commit that removed the gate —
  T19 in `scripts/test-route-reachability.js` — forbids the token `'profile freshness gate'`
  (lowercase) via case-sensitive `String.prototype.includes`. The surviving prose spells it
  `Profile Freshness Gate`. **The guard built to prove the gate is gone cannot see the reference that
  survived it.** T19 is green today (331 assertions) with the dangling sentence in place.

---

## Setup

- Repo: `/Users/ylpromax5/Workspace/Kaola-Workflow`, branch `main`, commit **`a339e5df`** (clean;
  only untracked `kaola-workflow/bundle-945-946-947-948/`).
- Repo version: `package.json` → **9.5.5**.
- No tracked file was modified. One scratch copy of a historical blob was written under the session
  scratchpad; nothing else was written outside this report.

### Installed Codex location (and the shadowing check the task asked for)

| what | path | verdict |
|---|---|---|
| plugin cache (live) | `~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/7.5.5/skills/` | **this is the live copy**; exactly one version dir (`7.5.5`) — the cache has pruned everything else |
| standalone skills | `~/.codex/skills/` | contains 14 skills, **none** of them `kaola-workflow-*` (only the unrelated `kaola-music-generation`) → **no shadowing copy exists on this box** |

The plugin's cache version string (`7.5.5`) is the *plugin manifest* version, not `package.json`'s
`9.5.5`; mtime `2026-08-09 16:03` matches the v9.5.5 resync.

Byte provenance of the installed file (measured):

```
installed sha256 : 768ac32368f02692c582dd13a9545ac21a01fe1fbb1d2104b8898cef070fd67b
HEAD  plugins/kaola-workflow/.../SKILL.md : 28e94966...4287eed
660fec1d plugins/kaola-workflow/.../SKILL.md : 768ac323...070fd67b   <-- identical to installed
```

So the installed skill is **byte-identical to the github-edition render at `660fec1d` (v9.5.5)**; the
only delta against `HEAD` is the six-line #935 tier-list block added *above* the Delegation section,
which is exactly why the installed line numbers are **251–253** and the repo's are **257–259**. The
staleness is a resync fact, not a defect, and does not affect this finding.

---

## Observations

| # | Measurement | Command | Result | Exit |
|---|---|---|---|---|
| 1 | dangling sentence, installed | `grep -rniI 'profile freshness' <cache>/skills` | 1 hit: `kaola-workflow-next/SKILL.md:251` | 0 |
| 2 | "freshness" across all 3 installed skills | `grep -rni 'freshness' <cache>/skills/` | 2 hits: `:68 ## Step 2 — Freshness, before the claim` and `:251` the self-reference | 0 |
| 3 | headings of the installed `next` skill | `grep -n '^#' <cache>/skills/kaola-workflow-next/SKILL.md` | 14 headings; **no `Codex Profile Freshness Gate`** | 0 |
| 4 | generated-surface parity | `node scripts/generate-routing-surfaces.js --check` | `all 18 surfaces byte-match the skeleton.` | **0** |
| 5 | every tracked carrier | `git grep -n -F 'The Codex Profile Freshness Gate' -- .` | 4 live files + 3 archive/run-record files | 0 |
| 6 | T19 route-reachability | `node scripts/test-route-reachability.js` | `Route-reachability test passed (331 assertions).` | **0** |
| 7 | T19 token predicate vs today's skeleton | node, `content.includes(token)` | `'profile freshness gate'` → **false**; `'Profile Freshness Gate'` → **true** | 0 |
| 8 | T19 token predicate vs the pre-#926 skeleton | node, same predicate on `17296a65^` blob | **6 of 9** forbidden tokens present | 0 |

### The offending text, with real file:line

Installed (`~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/7.5.5/skills/kaola-workflow-next/SKILL.md`):

```
244: ## Delegation
…
250: If the runtime genuinely cannot spawn a role agent, do the work inline and say so — that is a fact
251: about tool availability, not a choice to present as a question. The Codex Profile Freshness Gate
252: above is authoritative for profile availability; profile drift is not tool unavailability and must
253: not be recorded as one.
```

Confirmed absent: the installed file's complete heading list is
`## Codex Per-Spawn Model Routing` (6), `# Kaola-Workflow Next` (18), `## Step 1 — Pick the work`
(39), `## Step 2 — Freshness, before the claim` (68), `## Step 3 — Claim` (114), `## Step 4 — Write
the mission list` (143), `## Step 5 — Run it` (186), `## Step 6 — Resume` (213), `## Step 7 — Finish`
(229), `## Co-active Folders` (237), `## Delegation` (244), `## Required output` (255), `##
Completion contract` (267). **No section named "Codex Profile Freshness Gate" exists.**

Note the near-miss: `## Step 2 — Freshness, before the claim` is about **git/roadmap** freshness
(`git status`, `git fetch`, `gh issue list`, `roadmap validate`) — it is **not** the renamed gate, and
the word "above" cannot point at it either, since the sentence says *profile* availability and Step 2
never mentions profiles. Measured by reading lines 68–112 of the installed skill.

By contrast the paragraph's **other** cross-reference resolves cleanly: "the Codex Per-Spawn Model
Routing contract above" points at the real heading at line 6. So the paragraph is half-valid — one
live pointer, one dead one.

---

## Every surface carrying the sentence

### Tracked, live (4)

| path | line(s) | role |
|---|---|---|
| `templates/routing/next.skeleton.md` | **245–246** (prose) and **237** (region comment) | **authoring source** |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | 257–259 | rendered, github edition |
| `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | 257–259 | rendered, gitlab edition |
| `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` | 257–259 | rendered, gitea edition |

The skeleton's second carrier is the region directive itself, which is authoring-only (stripped at
render) but states the dead gate as its *reason for existing*:

```
templates/routing/next.skeleton.md:237
<!-- REGION:skill — it defers to the Codex Profile Freshness Gate above as the authority on profile availability, and that gate renders on this surface only -->
```

### Installed (1)

- `~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/7.5.5/skills/kaola-workflow-next/SKILL.md:251–253`

### Tracked, run-record only (3, not shipped prose — the #944 paper trail)

`kaola-workflow/archive/bundle-940-941-942-943-944/{.cache/run-gaps-manual.md, .cache/run-gaps.json, premise-944.md}`

### Measured NOT to carry it

- Command surfaces (all six): `commands/workflow-next.md`,
  `plugins/kaola-workflow-{gitlab,gitea}/commands/workflow-next.md`, and the `init`/`finalize`
  topics on every edition. The `commands/workflow-next.md` heading list has **no `## Delegation`
  section at all** — the `REGION:skill` wrapper drops the whole block on command surfaces.
- `templates/routing/finalize.skeleton.md` — carries no reference (`git grep -i -P
  'profile\s+(freshness|availability)' -- templates/routing/` returns hits in `next.skeleton.md`
  only).
- Installed opencode: `~/.config/opencode/command/` + `agent/` → 0 hits.
- Installed Kimi Code: `~/.kimi-code/skills/` → 0 hits. `~/.kimi-code/skills/workflow-next/SKILL.md`
  has **no `## Delegation` section**, confirming the skill-region drop reaches Kimi too.
- Installed Claude: `~/.claude/commands/` + `~/.claude/agents/` → 0 hits.
- Repo-local generated edition trees (gitignored: `.gitignore:5` `.opencode/`, `.gitignore:6`
  `.kimi/`): `.kimi{,-gitlab,-gitea}`, `.opencode{,-gitlab,-gitea}`, `.claude` → **0 carriers each**.

**Answer to "which runtimes does it reach": Codex only** — but on all three forge editions, and via
four tracked files, not one.

---

## Reproduction

**Reproduces.** Observations 1, 3 and 5 above are the reproduction; the issue's characterisation of
the installed state is accurate line-for-line.

### The skeleton is genuinely the authoring source (issue's routing claim verified)

`node scripts/generate-routing-surfaces.js --check` exits **0** with
`all 18 surfaces byte-match the skeleton.` The registry
(`scripts/generate-routing-surfaces.js:66–130`) derives 18 rows = 3 topics × (3 command editions + 3
skill editions); every rendered surface path is *computed*, never hand-typed. So the three rendered
Codex `SKILL.md` files are byte-derived from `templates/routing/next.skeleton.md` and **are not
hand-authored**. Editing a rendered surface would be reverted by `--check`, which runs in every
chain. The issue is correct: the fix belongs in the skeleton.

---

## GONE / RENAMED / NEVER EXISTED

### Answer: **GONE** — deliberately removed at `17296a65`, with its *responsibility* relocated to a
### different surface and a different mechanism. It was **not renamed on the `next` surface**, and it
### was **not** an always-dangling reference.

#### Per-commit presence (the decisive measurement)

```
commit        heading '## Codex Profile Freshness Gate'   dangling sentence
3b4ad2a4      1                                            0
c110754c      1                                            0
ea84673d      1                                            1   <-- sentence introduced, VALID
523f1241      1                                            1
17296a65^     1                                            1
17296a65      0                                            1   <-- DANGLE CREATED HERE
```

- **Introduced:** `ea84673d` — `wip(877): extraction, agent prompts, and the routing surfaces`. The
  sentence was **correct when written**: the gate section existed on the same rendered surface,
  physically above it.
- **Orphaned:** **`17296a65`** — `fix: verify Codex profiles at install time` (kaolabrother,
  Mon Aug 3 2026, issue **#926**). `git show --numstat` for that commit on the two skeletons:

  ```
  0  78  templates/routing/finalize.skeleton.md
  0  78  templates/routing/next.skeleton.md
  ```

  **78 deletions, zero insertions** on each — the commit removed the gate section and touched nothing
  else in those files, so the Delegation cross-reference was left standing by omission. It also
  deleted 76 lines from each of the six rendered Codex skills and cut 199 lines from
  `scripts/test-route-reachability.js`.

#### The removed section, recoverable at `17296a65^:templates/routing/next.skeleton.md`

It sat at the very top of the skeleton (immediately after `<!-- SLOT:nx-frontmatter -->`), inside a
`REGION:skill` wrapper — which is why the reference said "above" and why it rendered on Codex skills
only:

```markdown
<!-- REGION:skill — the gate resolves the one enabled edition from `codex plugin list --json` and runs the preflight out of that plugin-cache tuple; neither the CLI nor the cache exists on the command runtime -->

<!-- PIN: codex-profile-preflight -->
## Codex Profile Freshness Gate

On every entry or resume into this skill, before any role probe, retry, or real
dispatch, run the normal preflight gate, not `--doctor`. Resolve exactly
one enabled installed Kaola edition from `codex plugin list --json`, then execute
the bundled `kaola-workflow-codex-preflight.js` from that edition's exact
marketplace/name/version cache tuple.
Never search `$PWD/plugins` or select the lexically first cache entry:

```bash
… ~55 lines of `codex plugin list --json` parsing, cache-tuple path hardening,
   `node "$KAOLA_CODEX_PREFLIGHT" --project-root "$PWD" --no-autofix --json`,
   and `profile_preflight_refused: …` emissions …
```

The exact active cache root is
`$HOME/.codex/plugins/cache/$KAOLA_CODEX_MARKETPLACE/$KAOLA_CODEX_PLUGIN_NAME/$KAOLA_CODEX_PLUGIN_VERSION`.
The base invocation is `--project-root "$PWD" --no-autofix --json`; the gate
merges persisted config from HOME through the repository root to `"$PWD"`. Read
the exit code and parsed `status`. On drift such as `profile_bytes_mismatch` the
gate reports `profile_preflight_refused` with the offending profile and its
remediation: weigh that against what you are about to dispatch and decide. Drift
is a profile/config fact about the install, never a judgement about the work, so
record it as what it is. Re-run the gate if the installed profile set changes.
<!-- /PIN -->
<!-- /REGION -->
```

Recovery command (verbatim, if the section were ever wanted back):
`git show 17296a65^:templates/routing/next.skeleton.md`

#### It was removed on purpose, and the removal is the *design*, not an accident

`git show 17296a65 -- CHANGELOG.md`:

> **Codex profile readiness is now proved at install/upgrade time, not on every workflow entry or
> resume (#926).** `install-codex-agent-profiles.js` remains the authoritative transaction … The six
> Codex `kaola-workflow-next` / `kaola-workflow-finalize` skills no longer invoke or parse the
> recurring preflight, autofix configuration, or refuse work because Codex-owned persisted bytes
> report `config_stale` / `managed_block_drift`. `kaola-workflow-codex-preflight.js --doctor` remains
> an explicit read-only diagnostic …

The run's own mission list, `kaola-workflow/archive/issue-926/mission-list.md:1`, is titled
*"Replace recurring Codex profile freshness gates with install-time verification only"*.

#### Where the responsibility went (this is the "renamed?" half of the question — answered precisely)

The *gate on the `next` surface* is gone. The *job it did* now lives in two places, **neither of them
"above" on the `next` surface**:

1. **Install/upgrade transaction** — `plugins/kaola-workflow{,-gitlab,-gitea}/scripts/install-codex-agent-profiles.js`
   (Codex-plugin-only; there is no `scripts/install-codex-agent-profiles.js`). It ends with
   `postVerify()` (`plugins/kaola-workflow/scripts/install-codex-agent-profiles.js:2007`, invoked at
   `:2802–2805`, emitting `post_verify_failed: …`).
   - `README.md:580–585`: *"Installation and upgrade are the Codex profile-readiness boundary. The
     authoritative `install-codex-agent-profiles.js` transaction … Ordinary `kaola-workflow-next` and
     `kaola-workflow-finalize` entry and resume do not re-run that proof, inspect profile/config
     freshness, autofix configuration, or refuse work because persisted bytes drifted."*
   - `docs/architecture.md:319`, `docs/conventions.md:54`, `docs/api.md:1488–1489` say the same.
2. **An explicit, user-invoked diagnostic on the `init` surface** —
   `templates/routing/init.skeleton.md:228–264` (its own `REGION:skill`), which runs
   `install-codex-agent-profiles.js --global` and then
   `kaola-workflow-codex-preflight.js --doctor --project-root "$PWD" --json`. It has **no `##`
   heading of its own** (it is numbered item 5 under `## Required Behavior`), so there is no
   renamed section for the `next` surface to point at, on `next` or anywhere else.

The second clause of the dangling sentence — *"profile drift is not tool unavailability"* — also has
a surviving home, in docs rather than prompt: `README.md:603–604`, *"Re-run the profile installer (and
restart Codex) rather than treating profile or config drift as a local-tool fallback."*

**So: GONE from the surface, RELOCATED in substance to install-time + `/workflow-init`, and never
renamed into anything the word "above" could reach.**

---

## Narrowing

- **Leg A — is `## Step 2 — Freshness` the renamed gate?** Eliminated. Read lines 68–112 of the
  installed skill: it classifies git/remote state and roadmap-mirror staleness. No profile, no
  preflight, no `~/.codex`.
- **Leg B — does the gate exist on a *different* installed skill?** Eliminated for `finalize`
  (`grep -rni 'freshness'` over all three installed skills returns only the two hits in `next`), and
  qualified for `init`: `init` carries the *mechanism* (profile install + `--doctor`), but under no
  section name, on a different surface, and only after #926 relocated it there.
- **Leg C — is the reference command-runtime-reachable?** Eliminated. Zero carriers in the six
  command surfaces or in any installed Claude / opencode / Kimi tree.
- **Leg D — could the rendered surfaces have drifted from the skeleton (i.e. is this a render bug
  rather than a source bug)?** Eliminated: `--check` exits 0, 18/18 byte-match.

### The guard that should have caught this, and why it did not

`scripts/test-route-reachability.js:308–334` (T19, "install boundary") asserts that
`templates/routing/{next,finalize}.skeleton.md` and every dispatch-capable Codex skill contain **none**
of nine forbidden recurring-gate tokens, and it is **mutation-proven** — lines 323–326 assert that
appending each token to the content *reds* the check. Token #7 in that list is:

```js
scripts/test-route-reachability.js:315
    'profile freshness gate',
```

`recurringGateAbsent` (line 319) uses `content.includes(token)`, which is case-sensitive. Measured
against today's skeleton:

```
"profile freshness gate" => includes: false      <-- what the guard looks for
"Profile Freshness Gate" => includes: true       <-- what actually ships
```

T19 therefore passes (measured: exit 0, 331 assertions) while the dead reference is on a shipped
prose surface. Its own mutation proof is intact — the guard is armed, it is simply aimed one
capitalization away from the survivor. This is a textbook instance of the project's own rule that a
threshold cannot see a rule beneath its bar.

### What T19 implies for the two candidate remedies (evidence, not a pick)

I evaluated T19's exact nine-token predicate against the **pre-#926 skeleton** — i.e. against the
"restore the section verbatim" hypothetical:

| forbidden token | present in the removed section? |
|---|---|
| `<!-- PIN: codex-profile-preflight -->` | **yes** |
| `profile_preflight_refused` | **yes** |
| `--no-autofix` | **yes** |
| `kaola-workflow-codex-preflight.js` | **yes** |
| `KAOLA_CODEX_PREFLIGHT` | **yes** |
| `normal preflight gate` | **yes** |
| `profile freshness gate` | no (capitalized in the original too) |
| `config_stale` | no |
| `managed_block_drift` | no |

**Restoring the section verbatim would red T19 on six independent tokens**, because #926 built T19
specifically to keep it out. Restoring would therefore require reversing #926's design decision and
the four documentation surfaces that record it (`README.md:580`, `docs/architecture.md:319`,
`docs/conventions.md:54`, `docs/api.md:1488–1489`). Retiring the sentence trips no guard. I am not
picking between them; that is the evidence that decides it.

---

## Inferences

1. **The dangling reference is collateral damage from #926's deletion, not an authoring error** —
   confidence: **high**. Refuted by: any commit between `ea84673d` and `17296a65` showing the heading
   absent while the sentence was present (measured: none; heading=1 at every intermediate sampled
   commit including `17296a65^`).
2. **The gate is GONE, not renamed** — confidence: **high**. The mechanism relocated, but nothing on
   any surface now bears a name the word "above" could resolve to. Refuted by: finding a `##`-level
   section on `kaola-workflow-next/SKILL.md` that adjudicates profile availability (measured: the 14
   headings are exhaustive; none does).
3. **The `REGION:skill` comment at `next.skeleton.md:237` is stale in the same way** — confidence:
   **high**. Its whole recorded justification for scoping `## Delegation` to skill surfaces is the
   dead gate. Note the block would still *deserve* skill-only scoping on other grounds (it also cites
   the live `## Codex Per-Spawn Model Routing`, which is genuinely Codex-only) — so the region's
   *behaviour* is right and only its *recorded reason* is dead. Refuted by: a second justification
   already present in that comment (measured: there is none; the comment is one clause).
4. **T19 would not catch a re-introduction of this exact wording either** — confidence: **high**,
   measured directly at observation 7.
5. **The installed-copy staleness is orthogonal** — confidence: **high**. The installed bytes equal
   the `660fec1d` render; the only delta to HEAD is the #935 tier list. Re-installing would move the
   sentence from 251→257 and change nothing else about this finding.

---

## Open

- **Whether to restore or retire is not measured here, by instruction.** The fact the issue said the
  answer depends on — "does that gate still exist under another name" — is answered above: **it does
  not; it was removed on purpose at `17296a65` (#926) and its responsibility moved to install time
  and to `/workflow-init`.**
- **Not measured:** whether T19's token list should gain a case-insensitive form. That is a guard
  design question (and a #947-adjacent one), not part of this premise check.
- **Not measured:** the full chain suite. I ran the two checks that bear on this claim
  (`generate-routing-surfaces --check`, `test-route-reachability.js`), both exit 0. No edition-touching
  change was made, so no four-chain run was owed.
- **Not run:** any command that would mutate tracked files, the installed trees, or the plugin cache.

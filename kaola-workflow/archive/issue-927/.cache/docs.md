# #927 — documentation

**Worktree**: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-927` (branch
`workflow/issue-927`). Five files changed, all inside the assigned set. No script, test, shell
script or generated tree touched; no suite run; nothing reverted.

Every claim below was verified against the shipped source in the worktree before rewriting — line
numbers in the brief had all moved, and two of them named text that no longer existed at that line.

---

## 1. Files changed

| file | hunks | what |
|---|---|---|
| `CHANGELOG.md` | 1 (`:3-47`) | new `[Unreleased]` — 2 × Added, 2 × Fixed |
| `README.md` | 2 (`:366`, `:369`) | `--adopt-config` in the flag block; the effort paragraph restated |
| `docs/opencode-edition.md` | 31 | the whole effort story, installer flags, deploy layout, verification |
| `docs/kimi-edition.md` | 5 (`:83-86`, `:88`, `:100`, `:321`, `:323`) | comparative references to the opencode mechanism |
| `docs/investigations/2026-08-03-…-design.md` | 4 (`:3`, `:142`, `:166`, `:201`) | status, hook correction, closed side defect |

---

## 2. `CHANGELOG.md` — `[Unreleased]` at `:3-47`

Follows the file's convention exactly (verified against `17296a65`, the last pre-release staging
commit): `## [Unreleased]` at the top, keep-a-changelog section order (`Added` before `Fixed`),
bold lead sentence closing with `(#927)`, ~100-column wrap.

Four entries, covering the four things asked for:

- **Added** — `--adopt-config`: what drift is, that the report names roles in both directions and
  writes nothing, that adoption **regenerates the whole file rather than merging**, and the two
  cases that stay deliberately silent (nothing drifted; no inherited model detectable).
- **Added** — the `effort-tiers.json` sidecar: what it carries, that it ships with the plugin and
  not the support scripts so `--no-scripts` cannot un-tier, both deploy paths, uninstall, and that
  a failed generation warns rather than failing or deleting a working map.
- **Fixed** — the tier fix itself: the measured scale of the failure, the `variant`/`model`
  coupling, why it was abandoned rather than repaired, `options` + per-call re-resolution, both
  tiers still inheriting, and the `provider.*.variants` block removed rather than left beside.
- **Fixed** — the retirement of the model-switch regeneration warning, plus what a user with a
  pre-existing `opencode.json` sees (old `variant` keys, inert, roles still tiered correctly;
  `--adopt-config` rewrites).

## 3. `README.md`

- `:366` — added `./install-opencode.sh --adopt-config` to the opencode flag block.
- `:369` — the stale paragraph (was `:368`, *"two model tiers as reasoning-effort variants … gets
  the model's **top** effort variant"*). Now states the result: two levels of reasoning effort on
  one inherited model, top / one-below, the four contract knob values, re-resolved per call so a
  model switch needs no regenerate, and the preserve-report-`--adopt-config` shape of the config.
  Dropped `mapTier` + `CONTRACT_EFFORT_TABLE` + `contractForProvider` — a function-name trio on the
  project's front page is a mechanism claim that rots; the schema file is still named in
  `docs/opencode-edition.md` where a maintainer needs the anchor.

## 4. `docs/opencode-edition.md`

Every line the brief flagged, verified at its current position first:

| brief said | found at | done |
|---|---|---|
| `:87` heading *"as reasoning-effort variants"* | `:88` | → `## Model effort — two tiers on one inherited model` |
| `:92` `mapTier(tier, provider)` as the mechanism | `:92-95` | restated as the result; the contract-keying kept |
| `:98` *"effort variant **and knob**"* | `:100` | → *"effort **knob and value**"* |
| `:114` `mapTier` + table + resolver location | `:114-119` | `mapTier` dropped; table + resolver kept (they are real anchors); adds that each cell's `variant` name is descriptive only |
| `:124-132` *"defines the two effort variants under `provider.*` and selects each role's variant"* | `:133-157` | replaced with the shipped shape + a literal abridged example rendered from the live generator |
| `:268` `mapTier` / per-role variant / `buildDispatch` | `:274-278` | restated; see §6 — two of those symbols no longer exist |
| `:359` `--no-scripts` | `:363-364` | notes the sidecar ships with the plugin, so `--no-scripts` leaves tiers working |
| `:376-377` install flag block | `:384-385` | added `--no-scripts` and `--adopt-config` |
| `:457` comparison-table Models row | `:492` | restated |
| `:465` *"`provider.*` sentence flatly false"* | `:500-508` | see below |

Additionally, and beyond the list:

- `:50-51` — `opencode.json` bullet now says preserved **and drift-reported**, rewritten only under
  `--adopt-config`.
- `:103-112` — the contract table's `reasoning`/`standard` cells said `max (budget 32000)` /
  `high (budget 16000)`; the variant names are gone from the emitted config, so the cells now carry
  the budget alone. The contract callout's claim that *"already-seeded `agent.<role>.variant`
  references keep resolving"* was deleted — it is the exact sentence the fix disproves.
- `:170-186` — **`### Switching models (resilience)` rewritten as `### Switching models`**. Its
  entire premise (variant definitions going stale under a new `provider/<model>`) is retired by
  per-call resolution. Its two "safety nets" were both dead: see §6.
- `:188-200` — **new `### Why not \`variant\``**, ~11 lines. This is the one section I added rather
  than edited. Justification: the retired key is still present in every already-seeded config on
  every user's machine and is still a legal opencode key, so "we do not use it, and here is the
  falsifiable reason" is a question a reader will ask and the doc previously answered wrongly. It
  also gives `:117` and the CHANGELOG somewhere to point.
- `:202-272` — `### Computer-wide activation`. The merge recipe merged `provider` **and** `agent`;
  there is no `provider` block any more, so the recipe would have thrown on its own
  `if(!a.provider||!a.agent)` guard. Reduced to `agent`, the two `g.provider` lines and the
  `provider:` console line removed, and the "why this isn't automatic" bullets now include
  `--global --adopt-config` as the one-command path when the global carries no keys of your own.
- `:393-410` — **new `### Config drift and \`--adopt-config\``** under Install, where the other
  installer flags are documented, per the brief. States that it **regenerates the whole file rather
  than merging into it**, points at the merge recipe for a config with `model`/`mcp`, and records
  the two silent cases.
- `:416-419` — the deploy-layout table gained an **Effort-tier sidecar** column with both scopes'
  real paths, plus `:430-437` explaining why it rides with the plugin and what an absent one does.
- `:448` — uninstall now lists the sidecar among what is removed.
- `:459-461` — the seed paragraph now says an existing file is preserved *and reported on*.
- `:477` — `--write-effort-tiers-to PATH` added to Develop / regenerate.
- `:500-508` — the Verification paragraph. Beyond the false `mapTier` reference, **the sentence was
  syntactically broken**: `**adaptive effort tiers** (`mapTier` per provider + the` opened a paren
  that was never closed and ran straight into the next item. Replaced with the real block labels,
  read out of the shipped test file: `S1-contract`, `A12-options`, `A26-sidecar`, `A26-hook`,
  `A26-degraded`, `A27`, `A27-neg`.

## 5. `docs/kimi-edition.md`

- `:83-86` (brief said `:83`) — *"not the opencode `mapTier` effort-variant one"*. The contrast it
  drew was wrong in both directions: opencode **also** inherits the session model — the difference
  is that it additionally varies reasoning effort on it. Restated, and Kimi's own position sharpened
  to "inherits the session model **and runs at its default effort**".
- `:88` — "no effort-variant config is seeded anywhere" → "no effort config".
- `:100` — "maps to no variant, effort, or model at runtime" → "no effort or model" (not on the
  list; the term is retired and the sentence loses nothing).
- `:321` (brief said `:320`) and `:323` — the comparison table's **Models** and **Config seeded**
  rows. `:323` was not on the list and said the opencode config carries *"variant definitions"*;
  it now names the effort payloads and the sidecar.

## 6. `docs/investigations/2026-08-03-…-design.md`

- `:3-6` — status flipped from *"design only. Nothing in this document is applied"* to **applied,
  with one correction**, pointing forward to the correction section.
- `:142-145` — a callout immediately under the Layer 2 hook sketch saying its last line is wrong and
  is not what shipped. Placed there rather than only at the end because the sketch is copy-pasteable
  and someone will copy it.
- `:166` — the watch-list bullet that says Layer 2 is the answer to the wrong-contract exposure now
  records that the sketch above does not actually deliver it.
- `:201-206` — the *"Separate defect found alongside"* section (the stale
  `~/.config/opencode/opencode.json`) marked **closed alongside #927**, with the owner ruling's
  shape: report, name what drifted, act only behind the explicit opt-in, never overwrite silently.
- `:208-227` — **new `## Correction — the hook replaces the knob, it does not spread over it`**, as
  instructed. Records *why* the spread-merge fails (Layer 1's payload is already inside
  `output.options` by the time `chat.params` runs, so a spread ships the stale knob *alongside* the
  fresh one — the exposure, plus an extra key), the stronger result to reach (no knob belonging to
  any other contract survives), and that the clear-set is **derived from the effort table** rather
  than hand-typed, with the reason (a hand-typed list goes stale on the next contract, which is the
  same failure class the hook removes).

I did **not** rewrite the Layer 2 sketch itself. It is a design record; rewriting the sketch would
erase the fact that the design was wrong there, which is the part worth keeping.

---

## 7. Found stale, NOT on the list — corrected (all inside my file set)

1. **`docs/opencode-edition.md` "Tier membership" listed six top-tier roles, including
   `adversarial-verifier`.** The top tier is exactly five: `code-architect`, `code-reviewer`,
   `planner`, `security-reviewer`, `synthesizer` — confirmed at
   `scripts/sync-opencode-edition.js:565-583` (`topTierRoles() === reasoningRoles()`, with an
   explicit comment that a sixth member means a frontmatter tier moved) and against a live render,
   in which `adversarial-verifier` carries the 16000 (standard) budget. Pre-existing, unrelated to
   this issue, and it sat four lines above a block I was rewriting. Corrected.
2. **The computer-wide merge recipe was broken, not merely stale.** `if(!a.provider||!a.agent)
   throw` — the adaptive render no longer emits `provider`, so the documented procedure would have
   thrown on step 2 for every user who followed it. Corrected to `agent` only.
3. **The Verification sentence had an unclosed parenthesis** and two run-together list items
   (`opencode-edition.md`, old `:465`). Repaired while replacing its content.
4. **`docs/kimi-edition.md:323`** described the opencode seeded config as carrying *"variant
   definitions"*. Not on the list; corrected.

## 8. Still wrong, OUTSIDE my file set — not touched

**Live prose (worth routing):**

1. **`docs/opencode-edition.md` cited two functions that no longer exist**, in the section I was
   told to fix at `:268` and in `### Switching models` at `:179-183`. `dispatchEffortOpencode`,
   `resolveOpencodeProvider` and `buildDispatch` return **zero** definitions repo-wide; only a
   stale comment at `scripts/kaola-workflow-adaptive-schema.js:56` still names
   `dispatchEffortOpencode`. `opencode_variant` — described at old `:174-175` as something the
   dispatch envelope carries — also has no producer anywhere in `scripts/`. I removed the doc's
   dependence on all four (that was inside my file set); **the schema comment at
   `kaola-workflow-adaptive-schema.js:56` is not, and still names a function that is gone.** It is
   on the ×4 byte-identical anchor, so a fix there is a four-copy edit.
2. **`scripts/kaola-workflow-adaptive-schema.js:136-137`** — *"Variant NAMES are provider-relative
   and preserved across the contract-keying flip (GLM stays max/high) — only the OPTIONS payload
   changes."* True as a statement about the table, but it is the header for a table whose `variant`
   column is now consumed by nothing on the opencode path. `:144-145` already says so correctly;
   `:136-137` reads as though `variant` still selects something. Same ×4 anchor.
3. **The drift check compares role *names* only, so a config with the correct 14 roles but the old
   `variant` shape reports nothing** and is never suggested for `--adopt-config`. This is not a
   defect — Layer 2 tiers those roles correctly regardless, and it is only visible with the plugin
   unloaded — but it means "no drift reported" does not mean "current shape". I documented the
   consequence (`opencode-edition.md:198-200`, CHANGELOG) rather than implying the check catches it.
4. **`docs/audits/opencode-edition-audit.md:284-286`** lists `agent.<role>.variant` among the keys
   the edition emits and validates against the live schema. The key is no longer emitted. It is an
   audit record of a point in time, so it may be correct to leave — but it is the one *non-decision*
   doc still asserting the retired shape.

**Decision records — historical, my judgement is leave them, but flagging:**

5. **`docs/decisions/D-610-01.md:10`** cites `docs/opencode-edition.md` by the exact heading I
   renamed (*"Model effort — two tiers as reasoning-effort variants"*). The pointer is now
   unresolvable. A one-word repair, but it is a superseded-ruling citation and I did not want to
   silently move a decision record's evidence.
6. **`docs/decisions/D-544-01.md`** is the record that established contract-keyed effort *variants*
   (`:13`, `:31`, `:63`, `:98`, `:100`). Its contract-keying survives intact; its variant delivery
   mechanism does not. It has no superseded-by note.
7. **`docs/decisions/D-703-01.md:31`** — *"opencode's `mapTier` two-tier effort-variant machinery"*.
   The kimi ruling it supports is unaffected; only the characterization is stale.

**Not a doc problem, but recorded because the design record now points at it:** implementer A left
the badge heading `## Effort Variant Resolution` in place (test-custody reasons — `S2` anchors on
it), while the block's body no longer names variants. The heading and its body now disagree, on a
prompt surface. That is a test-custody call for the owner, not mine, and I did not touch it.

## 9. Nothing in my set was skipped

All five assigned files had real changes. No section of any of them is now wholly obsolete and
left standing — the two whose premises died (`### Switching models (resilience)` and the
`provider`-half of the merge recipe) were rewritten in place rather than left beside a correction.

## 10. Verification performed

Read-only, no suite:

- `scripts/sync-opencode-edition.js:20-64, 560-588, 615-675, 738-780, 1070-1110` — the emitted
  shape, the tier functions, the sidecar writer, `usage()`.
- `scripts/kaola-workflow-adaptive-schema.js:125-163` — `CONTRACT_EFFORT_TABLE`, the four contracts
  and their knob values, and the `variant`-is-descriptive-only comment.
- `templates/opencode/plugins/kaola-workflow-hooks.js:36-120, 251-274` — `deployedPath`,
  `loadEffortTiers`, and the shipped `chat.params` body (the `delete opts[knob]` loop that the
  correction section describes).
- `install-opencode.sh:20-135, 275-312, 470-583` — the header prose, `usage()`, the parser, the
  sidecar deploy block, `report_config_drift`, `seed_config`.
- One in-memory render, `renderOpencodeJson({inheritModel:'zhipuai-coding-plan/glm-5.2'})`, to
  transcribe the example config literally rather than reconstruct it. Wrote nothing.
- Code-fence parity checked in all five files (16 / 10 / 8 / 76 / 0 — all even).
- Anchor targets checked: `#why-not-variant`, `#config-drift-and---adopt-config`,
  `#computer-wide-activation-merge-into-the-global-config`,
  `#correction--the-hook-replaces-the-knob-it-does-not-spread-over-it`. No pre-existing inbound
  anchor pointed at any heading I renamed (grepped `docs/`, `README.md`, `CHANGELOG.md`,
  `scripts/`) — see §8.5 for the one prose citation that did.

## 11. One thing I reverted mid-edit, deliberately

I briefly rewrote *"the adaptive planner authors `reasoning`/`standard` per **node**"* to *"per
**item**"* on ADR-0017 grounds, then put it back. `per-node` is still the live vocabulary in
`docs/kimi-edition.md:96`, `docs/architecture.md:66` and `opencode-edition.md:98`
(`NODE_MODEL_TIERS`), so changing it in one place would have made this doc disagree with its own
sibling for a reason unrelated to #927. Whether that vocabulary should retire is a real question
and is not this issue's.

---

# Follow-up round (coordinator, same session)

Two items from §8 above ruled back into scope. File set for this round was exactly
`docs/audits/opencode-edition-audit.md` and `docs/decisions/D-610-01.md`. No suite run, nothing
reverted, no other file touched. `D-544-01.md` and `D-703-01.md` left alone per the coordinator's
ruling, which I agree with.

## F1. `docs/audits/opencode-edition-audit.md` — §9 Config validity

Added a supersession blockquote at `:288-300`, immediately after the finding. **I did not rewrite
the measurement itself, and that is a deliberate deviation from "fix it the same way" — see the
reasoning below, which the coordinator should overturn if they disagree.**

**What the note says.** The adapted config emits none of the `variant` keys the audit measured; it
emits `agent.<role>.options`, no `provider` block, no `model` key on any role. Why they were
dropped (the `variant`/`model` coupling, so every tier shipped was inert). That the keys were
schema-valid exactly as the audit found — **being accepted by the schema was never the same as
being applied, and no key-presence check could have caught this** — so the PASS verdict stands but
was re-established against the current key set rather than carried over. Points at
`docs/opencode-edition.md` § "Why not `variant`".

**Why a supersession note and not a rewrite of `:283-287`.** The lines the coordinator named are
not live descriptive prose like the ones I corrected in round 1 — they are a *measurement result*,
dated 2026-06-19, against a schema fetched that day, at commit `77e88c38`, attributed to a named
evidence node (`n1-schema`) and closed with "**Established by:**". Restating them as
"`agent.<role>.options` — every key present and documented in the live schema" would assert that a
June audit validated an August key against a June-fetched schema. It did not. The only evidence
that `agent.<role>.options` is schema-accepted is #927's own read of the opencode **1.18.11**
binary (`options: D.optional(D.Record(D.String, D.Any))`, design brief), which is a different
version and a different method. Writing that into the audit's key list would fabricate provenance —
the failure mode CLAUDE.md's "verify facts, don't fabricate" names, and worse than the staleness it
would fix. So: the reader now learns the true current shape (the coordinator's actual goal), the
audit keeps its own evidence, and the two are not conflated.

**One extra thing the note disposes of, in one clause.** Follow-up **S1** (`:296-300`, and its row
in the follow-up table at `:342`) is stale in two independent ways and sits nine lines below the
corrected finding — leaving it would be exactly the rot-beside-the-correction the round-1 brief
objected to. It says `reasoningEffort:'max'` is zhipu's key and asks whether the provider honours
it. `reasoningEffort` stopped being GLM's knob at **#544** (z.ai is served on the Anthropic
contract → `thinking` budget), and its hypothesized "runtime no-op" turned out **true but for an
unrelated cause** — the `variant` coupling, not an unhonoured option key. The note records both. I
did **not** edit S1's own text or the table row: they are the record of what was filed, and the
same argument that protects `:283-287` protects them.

## F2. `docs/decisions/D-610-01.md:9-12` — citation repaired

The `Supersedes:` header cited `docs/opencode-edition.md` by the heading I renamed in round 1.
Now reads: *the "Model effort" section — titled "… as reasoning-effort variants" when this decision
was written, renamed under #927*.

Citation only; the ruling, its scope and every other line are untouched. Two deliberate choices:

- **Cites the stable part of the heading** ("Model effort"), which survived both the #610 rewrite
  and the #927 rename, rather than the current full title — a citation that names only today's
  title breaks again at the next rename.
- **Says "titled … when this decision was written"** rather than silently swapping in the new
  title. The section no longer carries the superseded ruling at all — #610 itself rewrote it, so
  `:97-99` now records the *post*-decision state (`reasoning`/`standard` portable, `opus`/`sonnet`
  legacy aliases). A bare heading swap would have read as though the current section still holds
  the ruling being superseded, which would be a second false pointer replacing the first.

**Left alone, flagged:** `D-610-01.md:19-22`, in `## Context`, says *the opencode-edition doc's
"Model effort" section states "`opus`/`sonnet` stay the plan's portable per-node vocabulary"*. The
pointer still resolves ("Model effort" is intact) and the sentence is describing the pre-decision
state that motivated the ADR, so its present tense is narrative, not a live claim. Not repaired,
because repairing it would edit the decision's reasoning rather than its citation.

## Verification (read-only)

- Re-read both targets at their current line numbers before editing; both matched what §8 reported.
- Confirmed the audit is a dated point-in-time report (`:3-10`: date, audit commit, evidence base)
  — the fact that drove F1's shape.
- Confirmed `S1` occurs at `:296-300` and `:342` only.
- Confirmed the cross-reference the audit note makes (`docs/opencode-edition.md` § "Why not
  `variant`") exists — I created it in round 1 at `:188`.
- Code-fence parity: both files 0 fences, unchanged.
- `git status` after: only my seven files plus the two implementers' concurrent files. No suite run.

## Still open after both rounds, outside every file set I have been given

Unchanged from §8, minus the two now closed:

1. `scripts/kaola-workflow-adaptive-schema.js:56` names `dispatchEffortOpencode`, which has zero
   definitions repo-wide; `:136-137` reads as though `variant` still selects something. Both on the
   ×4 byte-identical anchor, so either fix is a four-copy edit.
2. The drift check compares role *names* only — a config with the right 14 roles but the old
   `variant` shape reports nothing. Documented as a consequence, not a defect.
3. The badge heading `## Effort Variant Resolution` still disagrees with its own body, on a prompt
   surface. Test-custody call (`S2` anchors on the heading).

---

# Round 3 — `--adopt-config` backup (installer changed after round 1)

Implementer B added a backup to adoption after my round-1 text was written. My text was accurate
about the replacement and silent about the recovery, which read as more destructive than the
behaviour is. Verified against the current `install-opencode.sh` before editing — B's second round
had moved every line the coordinator named.

## What the installer actually does now (read, not assumed)

| fact | source |
|---|---|
| Backup path shape is `<config>.<timestamp>.bak`, timestamp `%Y%m%d%H%M%S` | `config_backup_path()` `:490-494`, called at `:591` |
| **Collision-proof, not timestamp-only** — falls through to `…<timestamp>-1.bak`, `-2`, … while the candidate exists | `:491-492` |
| The copy happens **before** the replace | `:590-592` (`cp` precedes the `--write-config-to` at `:608`) |
| A backup that cannot be written **fails the install and leaves the config alone** (`exit 1`) | `:592-595` |
| The install **prints the real path**: `Your previous config, hand edits and model pins included → $backup` | `:597` |
| The **drift report promises the same shape** before the flag is run, from one spelling (`KW_DRIFT_BACKUP`) | `:482-484`, `:502`, `:571` |
| `--write-config-to` (the blind overwrite) makes **no** backup — bare `fs.writeFileSync` | `scripts/sync-opencode-edition.js:968-973` |

The comment at `:486-489` records *why* the collision guard exists, and it is a measured failure,
not a hypothetical: two adoptions inside one clock second had the second overwrite the first's
backup with a copy of the *generated* config — destroying the pins the backup exists to preserve.
That is worth carrying into the CHANGELOG, so I did.

## Edits — five, not three

The coordinator named three lines. Two more in my file set carried the same defect and would have
rotted beside the correction.

1. **`docs/opencode-edition.md:403-411`** (named; was `:401-405`). *"so save any hand edits first"*
   → keeps both facts in the coordinator's order: regenerates rather than merges, **so hand edits
   and model pins are gone from the live config**; the replaced file is copied to
   `<config>.<timestamp>.bak` and the path is printed; a backup that cannot be written fails the
   install instead. Then the limit, stated plainly: *"the previous file is recoverable, but
   recovering a pin means putting it back by hand"* — which is why the merge recipe is still the
   advice for a config carrying `model` / `mcp`.
2. **`README.md:369`** (named). `--adopt-config` *"rewrites it — whole-file, not a merge, after
   copying the old one to a timestamped `.bak` it names."* One clause; the README paragraph is
   already dense and the detail belongs in the edition doc.
3. **`CHANGELOG.md:12-22`** (named, `:7` entry). Adds: pins gone from the **live** config; copies
   to `<config>.<timestamp>.bak` and prints it; **fails without touching the config if the backup
   cannot be written**, with B's framing that passing the flag is *"a decision to take the new
   config, not consent to lose the old one"*; and the collision-proofing with the measured failure
   that forced it.
4. **`docs/opencode-edition.md:218-224`** (not named). The Computer-wide-activation bullets said
   `--adopt-config` is *"wrong if it carries your `model` / `mcp` keys"* with no mention of
   recovery — the same overstatement. Now: replaces after a named timestamped backup, failing
   rather than replacing if it cannot; still removes those keys from the live file; putting them
   back is a manual restore.
5. **`docs/opencode-edition.md:221-224`** (not named, and my round-1 text was **now false**). I had
   written that the blind overwrite *"has the same effect with no confirmation"*. Since the backup
   landed, the two no longer have the same effect, and I verified the difference at source rather
   than assuming it: `runWriteConfigTo` is a bare `fs.writeFileSync` with no backup and no check.
   Now: the blind overwrite *"reaches the same end state with **no backup and no confirmation** —
   it is a bare write."* This is the one place where the round-3 change made an existing sentence
   wrong rather than merely incomplete.

Two further touch-ups for the same reason:

- **`docs/opencode-edition.md:270-273`** — the future-improvement note said neither the renderer's
  output nor `--adopt-config` *"can be written blindly over"* a global carrying your own keys,
  which now overstates ( `--adopt-config` can be, it just costs you a manual restore). Restated as
  the real reason: both produce a whole file that drops those keys from the live config, and the
  backup makes them **recoverable by hand, not preserved**.
- **`docs/investigations/…-design.md:204-208`** — the closed-side-defect note recorded the owner
  ruling (report, opt-in, never silently overwrite) but not what shipped to honour it. Added the
  decision-to-take-the-new-config framing, the timestamped backup, and the fail-rather-than-replace
  behaviour.

## Where I deliberately did not add the backup

Six other `--adopt-config` mentions across the set are neutral references ("rewrites the file into
the current shape", "see Config drift", the two flag-block one-liners that mirror the installer's
own `--help`). None asserts or implies destructiveness, so none was touched — repeating the backup
at every mention would be the noise this project's standing instruction warns about.

One ambiguity I looked at and left: `opencode-edition.md:265` says "or restoring the `.bak`", which
is the **merge recipe's own** `opencode.json.bak`, not the installer's `<config>.<timestamp>.bak`.
It sits wholly inside the recipe's scope note, so it is unambiguous in place; disambiguating it
would add words to say nothing new.

## Not overstated

Per the instruction, the safety net is never presented as a merge. Every one of the five edits
keeps "replaces / not a merge / pins gone from the live config" as the leading fact and the backup
as recovery, and two of them say explicitly that recovering a pin is a **manual** restore.

## Verification (read-only)

- `install-opencode.sh:22-31, 94-106, 478-506, 560-574, 576-614` — header, `--help`, the backup path
  builder, the drift report's promise, and `seed_config`'s copy/fail/print.
- `scripts/sync-opencode-edition.js:968-973` — positive check that the blind-overwrite path has no
  backup, which is what makes edit 5 a correction rather than a guess.
- Confirmed the drift report and `seed_config` derive the backup name from one function, so the
  shape the user is promised is the shape that gets written — that is why the docs can name the
  shape at all without it rotting.
- Code fences even in all four touched files (76 / 0 / 16 / 8). `git status`: only my seven files
  plus the implementers' concurrent work (`scripts/sync-kimi-edition.js` has appeared since round 2
  — implementer A's, untouched by me). No suite run; nothing reverted.

## Closed by the coordinator this round

- The dated `:283-287` audit measurement stays as written — deviation upheld.
- S1 and its follow-up-table row stay.
- The D-610-01 citation call stays.
- `kaola-workflow-adaptive-schema.js:56` / `:136-137` and the `## Effort Variant Resolution`
  heading are dispatched to implementer A. Removed from my open list; I am not tracking them.

Nothing in my file set is now known-stale.

---

# Round 4 — the premise flipped; the machinery is deleted

Probe C retired the design. Rounds 1–3 documented a feature that no longer exists. Read
`pivot-brief.md` + `live-oracle/README.md` (probe C) + `deletion-blast-radius.md` §6, then verified
every claim against current source before editing — §6's doc line numbers predate my round-3 edits
and had all moved.

## Files changed (6)

| file | what |
|---|---|
| `CHANGELOG.md` | `[Unreleased]` rebuilt: 1 Added, 1 Removed, 1 Fixed |
| `README.md` | opencode paragraph restated as inheritance |
| `docs/opencode-edition.md` | −154 lines of tier machinery, 11 further edits |
| `docs/kimi-edition.md` | 3 comparative claims |
| `docs/investigations/2026-08-03-…-design.md` | status + a new "Why this was removed" section |
| `docs/audits/opencode-edition-audit.md` | §9 note rewritten; §#2 note added |

`docs/decisions/D-610-01.md` was **not** in this round's file set and is now broken by my own work —
see "Outside my file set" below.

## Source facts I verified before writing (not taken from any report)

| claim | verified at |
|---|---|
| generator emits the neutral template only; `renderOpencodeJson` → `renderNeutralConfig` | `sync-opencode-edition.js:546-549`, plus a live render |
| `--adapt`, `--write-effort-tiers-to`, `detectInheritModel`, `renderAdaptiveConfig` gone | residue grep → 0 hits each in `scripts/`, `install-opencode.sh`, `templates/` |
| `chat.params` gone from the plugin; two hooks remain | `kaola-workflow-hooks.js:148,168` |
| plugin exports **only** `default`; helpers hung off it | `:145`, `:185-186` |
| drift subject is now inert per-role effort | `install-opencode.sh:497` (`STALE_KEYS = ["variant","options"]`), `:518-522` |
| a `model`-only entry is deliberately not flagged | `STALE_KEYS` membership + the installer's own printed line |
| badge states inheritance and "no model or effort parameter" | `sync-opencode-edition.js:251-261` |
| the loader guard is **A29**, and A12/A26-* are fully gone | label sweep of `test-opencode-edition.js` (A12-options / A26-hook / A26-sidecar / A26-degraded → 0 hits) |

## A conflict I had to resolve rather than transcribe

**The coordinator's message and the pivot brief say the load bug was "taking the
subagent-dispatch-log and compaction-resume hooks down with it". The measurement says otherwise,
and I wrote the measurement.**

`review-adversarial.md:92-126` reproduces the loader in isolation:

```
exports: [ 'default', 'findRoot', 'hookPath' ]
factory candidates: 3
  ok: KaolaWorkflowHooks
THREW: TypeError "The \"paths[0]\" argument must be of type string…"
hooks pushed before throw: 1 [[ 'tool.execute.before', 'experimental.session.compacting', 'chat.params' ]]
```

and states why: *"`Q` in `Jy` is the shared array `K` … so the default export's hook table is already
pushed before the later export throws"*, with ESM namespace keys sorted `default` < `findRoot` <
`hookPath`. The A29 test comment (`test-opencode-edition.js:1878-1882`), written independently and
after, says the same: *"the hooks survived only because ESM namespace keys are sorted and `default`
happened to be collected before `findRoot` threw."*

Two independent sources agree the hooks **did keep working**; the pivot brief's one-liner is the
outlier and reads like a compression of "the plugin failed to load" into "the hooks went down".

So the CHANGELOG says: the load errored on **every** startup; the two hooks **did** keep working,
but only by an accident of sort order; and any future export name sorting before `default` would
have taken every hook down with nothing but that already-normalised error line as signal. That is
the whole severity argument and it survives intact — without a user-facing claim that their
dispatch-log has been broken, which the measurement does not support. **Flagging it rather than
quietly diverging: if the brief's version is right and the reproduction is wrong, this line needs
changing.**

## `CHANGELOG.md`

Both `### Fixed` entries and the `effort-tiers.json` `### Added` entry are **deleted** — they
described machinery that will not ship. Now:

- **Added** — `--adopt-config`, kept, with the backup detail from round 3 and the **new drift
  subject** (names entries pinning per-role effort; a `model`-only entry is yours and is not
  counted).
- **Removed** — per-role effort configuration. Leads with what the user gets (a subagent runs the
  session's model *and* effort; raise the session's effort and every role follows; the `task` tool
  has no model or effort parameter). Carries probe C's numbers (0/0/0 → 26/560/641), the correct
  reading of the ~80 sessions (inheriting, not failing), both corroborating measurements (560 vs 641
  = no separation; the 32000/16000 split unmeasured on a provider that routes through
  `@ai-sdk/openai-compatible`), that the older `variant` form never applied at all, the migration
  path, and that the **model**-pin opt-in is untouched.
- **Fixed** — the plugin load, per §above.

## `docs/opencode-edition.md`

**Deleted outright, 154 lines** (`### Default install: adaptive (--adapt)`, `### Switching models`,
`### Why not variant`, `### Computer-wide activation` incl. its merge recipe, `### Adaptive effort
selection in the workflow`). Not softened — the coordinator's instruction, and there is no way to
soften a section whose subject does not exist.

`## Model effort — two tiers on one inherited model` → **`## Model and effort — inherited from the
session`**: the result first, probe C as the evidence, then that the tier machinery was *removed*
(not deprecated) with a pointer to the design record, and that a stale config is named at install.

`### Opt-out: pin tiers to different models` → **`### Opt-in: …`**, kept because
`renderNeutralConfig` and the two `KAOLA_OPENCODE_*_MODEL` vars survive. It now names the five
reasoning-tier roles the scaffold covers, and carries one thing the doc never said and should have:
**a role that pins a model stops inheriting the session's effort too** — `TaskTool`'s
`variant: b.model ? void 0 : q` suppresses the inherited variant precisely when a model is pinned.
That is the trade the opt-in makes, and it was invisible while tiers existed to mask it.

Also: `### Config drift` reframed with the installer's real output quoted and the `model`-only
exclusion explained; deploy-layout table lost its sidecar column; sidecar paragraph, uninstall
mention, `--no-scripts` note, `--adapt` seed paragraph and `--write-effort-tiers-to` all removed;
Codex-comparison **Models** row restated; Verification list rebuilt on the blocks that exist (A29,
A27/A27-neg/A27-quiet) instead of the deleted A12/A26/S1-contract; and the `## Hooks` section gained
**"One export, and it must be the default"**, because that is a real constraint a future editor of
this plugin will otherwise re-break.

## `docs/kimi-edition.md`

Its whole framing was "Kimi inherits, opencode tiers" — the contrast is gone. `:83-86` now says all
three inherit-family runtimes agree; the comparison table's **Models** and **Config seeded** rows
follow.

## `docs/investigations/…-design.md` — the one worth reading

Status → **BUILT, MEASURED, THEN REMOVED**, with "Nothing described below is in the product" and a
forward pointer. **The design body is left unedited on purpose** — a design record that quietly
becomes a description of the final state loses the only thing that made it worth keeping.

New `## Why this was removed — probe C`: the setup, the table, the native-`TaskTool` explanation,
and the additive-derivation reading (*"the agent might not think hard enough"* argues against the
premise, not for a mechanism).

Then, as the coordinator asked, **the two errors recorded honestly**:

1. **The tier separation was never demonstrated.** Probe C's 560/641 is no separation — correct with
   no payload. But the probes meant to *prove* separation did not either: B's 305-vs-182 was
   reported as consistent-with, and A1's 350-vs-0 confounds the role's system prompt with the
   payload. Honest within-role comparison is n=1 per arm. The 32000/16000 split shipped with no
   measurement showing it did anything.
2. **The contract was keyed off the provider brand, and the brand was wrong.**
   `zhipuai-coding-plan` routes through `@ai-sdk/openai-compatible`, not the Anthropic contract — so
   the one provider ever measured was sent a `thinking` payload derived from its brand id. A rule
   that keys on a brand and calls itself contract-keyed is the same class of error as a config key
   that reads as live and is not.

Plus `### What survived, and why` (the four real, tiering-independent defects) and
`### The lesson worth keeping` — the premise went unexamined while four probes, two layers, a
sidecar, a hook and a suite were built on it; **the cheapest probe in the investigation was the last
one run**. The `## Correction` section is re-framed as the most useful thing in the document: a
design of record that could not have done the job it was derived for, caught by re-derivation rather
than by reading code. The drift paragraph records that the feature **outlived the design** and that
its subject changed, with the measured reason (no generator baseline → detector went silent).

## `docs/audits/opencode-edition-audit.md`

§9's note said the config "emits `agent.<role>.options`" — my own round-2 sentence, now false.
Rewritten: **none** of the audited keys is emitted, and no per-role effort payload of any kind.

Extended **only as far as the measurement supports**, per instruction. The dated `:283-287`
measurement is still untouched. The load-bearing sentence is now stronger and stated once:
*schema-accepted was never the same as applied* — **and no key-presence check could have caught
that, not this audit's and not the one #927 briefly added in its place.** That second clause is the
part probe C earned.

S1's disposition is upgraded rather than restated: its hypothesis (*the option key may simply not be
honoured*) was **closer to right than the answer it got**. #544 replied "wrong knob, use `thinking`"
and keyed that off the brand id; the transport is `@ai-sdk/openai-compatible`. S1 asked the right
question of the right provider and was never answered. I removed a "shipped for a year" phrase I had
drafted — I have not verified any duration, and the sentence works without it.

One line added to §#2, which still described `--adapt` as "the ONLY path that materializes per-agent
effort" (and cites `topTierRoles()`/`higherProfileRoles()`, both deleted): a pointer to §9, not a
restatement.

## Outside my file set

1. **`docs/decisions/D-610-01.md:10` — broken by me, twice.** Round 2 repaired its citation to
   *the "Model effort" section*; this round renamed that heading to **"Model and effort — inherited
   from the session"**, so the literal no longer matches. `:20` and `:74` cite it the same way, and
   `:27`/`:42` name `mapTier` and `dispatchEffortOpencode`, both deleted. It was in round 2's file
   set and not in round 4's, so I left it. **It needs one more citation repair, and I caused it.**
2. **`docs/decisions/D-703-01.md:31,55,95`** — three references to "opencode's `mapTier` two-tier
   effort-variant machinery" as a live contrast for the Kimi inherit ruling. The ruling is
   unaffected and *more* right now; only the contrast is stale. You ruled this historical in round
   2 and I have not revisited that.
3. **`docs/decisions/D-544-01.md`** — the record that established contract-keyed effort variants.
   Historical by your round-2 ruling, but worth noting that probe C's transport finding
   (`@ai-sdk/openai-compatible`) contradicts its central premise, not just its mechanism.
4. **`docs/decisions/D-646-01.md:62`** — quotes the retired badge wording *"its effort variant
   resolves centrally from `opencode.json`"* as the substitution it mandated. That wording is gone
   from the badge.
5. **`scripts/test-opencode-edition.js`** carries the removed names in **comments only** (`:27`,
   `:504`, `:663-664`, `:757`, `:844`, `:1856`) — explanatory notes about what was deleted, which is
   the right place for them. No live assertion references them. Test author's file; not flagged as a
   defect.

## Verification (read-only; no suite)

- Residue sweep across my six files for `effort-tiers` / `sidecar` / `chat.params` / `mapTier` /
  `CONTRACT_EFFORT` / `contractForProvider` / `--adapt` / "effort variant" → the only hits left are
  the design-record **filename** and the surviving "two tiers ... different models" opt-in heading.
- Code fences even in all six (76 / 0 / 12 / 10 / 0 / 8).
- Every internal anchor re-resolved against current headings, including the two I created this round
  (`#why-this-was-removed--probe-c`) and the one whose target I deleted
  (`#computer-wide-activation-…` — no remaining referrers).
- The 154-line deletion was done with an assertion on both boundary lines before writing, and a
  scratch copy taken first.
- `git status`: my six files plus the implementers' concurrent work. Nothing reverted.

---

# Round 5 — the two decision records

Coordinator confirmed the loader reproduction against the installed v9.4.2 plugin: namespace order
`default`, `findRoot`, `hookPath`; `default` registers both hooks, *then* the named exports throw;
one hook table collected. The round-4 CHANGELOG wording stands unchanged. The brief and the user
both carry the correction.

Two files this round: `docs/decisions/D-610-01.md` (repair every citation) and
`docs/decisions/D-544-01.md` (add a dated measurement note; do not rewrite). Left alone per ruling:
`D-703-01`, `D-646-01:62`, and the test file's deliberate comments.

## Verified before writing

| claim | how |
|---|---|
| `NODE_MODEL_TIERS = ['reasoning','standard']` and `normalizeTier` both survive | `kaola-workflow-adaptive-schema.js:51,63` |
| the decision's core is **live**, not just historical | `dispatchEffort:103` calls `normalizeTier` first |
| `TIER_RANK` deleted | `def=0` in the schema |
| `mapTier` deleted | `def=0` |
| `dispatchEffortOpencode`, `dispatchModelClaude` deleted **earlier**, at #880 | `def=0`, and #880's own CHANGELOG entry names `dispatchEffortOpencode` and "the per-runtime dispatch-model pair" |
| the `resolve-agent-model` reasoning-floor check survives | `kaola-workflow-resolve-agent-model.js:30,398` (`--enforce-floor`) |
| **`contractForProvider` really did key on the brand id** | `git show HEAD:…adaptive-schema.js:169` → `if (/zhipu\|^zai\|z-?ai\|glm/.test(lo)) return 'anthropic'` — a match on the provider **id** |

That last one mattered: the sharpest sentence in the D-544-01 note is that the replacement repeated
the defect it was written to fix. I would not have written it from the decision's prose alone.

## `D-610-01.md` — four citation sites, three dispositions

Applied the historical-vs-current distinction site by site rather than uniformly.

**Broken pointers → repaired (2).** `:9-12` (Supersedes) and `:74` (Consequences) both cited the
`docs/opencode-edition.md` *"Model effort"* heading, which I renamed in round 4. Both now cite the
document and the **section by subject** ("model-and-effort section"), not by title. The Supersedes
line says why in six words — *"cited by document, not by heading, the title having moved twice
since"* — so the next person to rename it does not have to rediscover that this citation is a
repeat offender. Chasing the current title would have been the third repair of the same line.

**Asserting current mechanism → tense-corrected (2).** `:20` and `:26-27` describe the pre-decision
world in the **present** tense (*"the opencode-edition doc's 'Model effort' section states…"*,
*"Codex maps them… opencode maps them… via `mapTier`"*). The content is legitimately historical —
it is the context that motivated the rename — but the tense makes it read as a live claim about a
deleted function. Past-tensed; not a word of the reasoning touched. This is the site I judged
"narrative past, leave it" in round 2 and got wrong: it was narrative in intent and assertive in
grammar.

**Recording what was decided → kept, scoped (2).** Decision point 1's six-consumer list and the
third non-goal's three dispatch destinations are the decision **as taken**, and a decision record is
allowed to name what existed then. Kept verbatim, with the list marked "**then existing**" and one
clause making the actual rule explicit: *"the rule is 'every consumer routes through the
normalizer', not this list"*. That is the load-bearing distinction — the rule survives all four
deletions untouched, and only the inventory moved.

**One dated note at the top** carries what changed, so the four sites below do not each need their
own annotation. It opens with **"This decision stands"**, because it does, and that is the first
thing a reader needs: the vocabulary and the permanent aliases are live. Then the shrunken
inventory, with each deletion attributed to the issue that made it (#880 for two, #927 for two), and
the closing scope line: *"Everything below is the record as of 2026-07-03 and names what existed
then; it is not a current inventory."*

## `D-544-01.md` — a measurement, not a verdict

Added at the top, above `## Context`. Nothing in the decision rewritten.

What it records, and nothing more: `zhipuai-coding-plan` routes through `@ai-sdk/openai-compatible`,
not the Anthropic contract; defect 1 diagnoses the opposite; **that premise was never verified
against the transport — it was inferred from the provider's brand**; and the `thinking` 32000/16000
split it chose was measured on that provider with **no measurement showing any effect in either
direction**, because the probes that looked either compared across roles (confounding system prompt
with payload) or were n=1 per arm.

Three deliberate restraints:

- **No verdict.** It does not say the decision was wrong. It says what was measured and what was
  never checked. Whether that changes the ruling is not a doc agent's call.
- **No overclaim.** I do not assert that `thinking` is unhonoured by that provider — nobody measured
  that. The measurement is the routing fact plus the absence of a demonstrated effect. Those are
  different sentences and the note keeps them apart.
- **Scoped.** An explicit line for what the measurement does **not** reach: decision (b), the safe
  default for unrecognized providers, and decision (c), the documented re-sync — neither depends on
  which contract any provider speaks. Naming the limit of a measurement is the opposite of a
  verdict, and without it the note would read as retiring the whole record.

The one thing I added beyond the brief, because the source supported it: **the replacement repeated
the defect.** Defect 1's own words are *"the table keyed on brand name, not on the API contract the
provider actually speaks"* — and `contractForProvider` keyed on brand name too, reaching a different
wrong answer for the same provider. Verified against the pre-deletion source at HEAD, not inferred.

Closes with the mootness (per-role effort removed at #927; the four symbols deleted; *"Nothing below
describes shipping behaviour"*) and a pointer to the design record.

## Deliberately not touched

`D-544-01:119` still says the change *"gains a 'Switching models (resilience)' subsection"* in
`docs/opencode-edition.md` — a subsection I deleted in round 4. Left: it records what the decision
**did at the time**, which is the category that stays, and the new top note already says nothing
below describes shipping behaviour. Repairing it would be editing the decision's own account of
itself.

## Verification (read-only; no suite)

- Repo-wide sweep for citations of the headings I moved or deleted (`Model effort`,
  `Switching models (resilience)`, `Why not variant`, `Computer-wide activation`) across `docs/`,
  `README.md`, `CHANGELOG.md` → the only survivor is `D-544-01:119` above, deliberate.
- Fences: 0 in both files, correct — neither has code blocks; nothing unbalanced was introduced.
- `git status`: my eight files plus the implementers' concurrent work. Nothing reverted.

## Standing record — nothing known-stale in my file set

Across five rounds the file set is: `CHANGELOG.md`, `README.md`, `docs/opencode-edition.md`,
`docs/kimi-edition.md`, `docs/investigations/2026-08-03-…-design.md`,
`docs/audits/opencode-edition-audit.md`, `docs/decisions/D-610-01.md`,
`docs/decisions/D-544-01.md`. No open item remains on any of them.

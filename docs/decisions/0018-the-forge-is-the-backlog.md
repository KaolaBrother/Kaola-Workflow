# 0018 — The forge is the backlog

- **Status:** Accepted, and **§8 steps 1–5 shipped 2026-08-15** — the pick step reads shortlisted
  issues' bodies and comments, priority is a bare `P0`–`P3` forge label with the sorter connected as
  *ordering*, the injected `CLAUDE.md` guidance sits in a named region under a cross-surface pin,
  finalize requires a run to comment what it corrected, and the whole roadmap layer — four
  `roadmap.js` copies, the mirror, the per-issue sources, the receipt fields, the invariants, the
  drift classes, the sink's stash bucket — is deleted. **Step 6 shipped 2026-08-16 (#986)** as
  `/workflow-init`'s `## Step 5 — Legacy Backlog Layer`: diagnose, report, ask, act only on the
  answer. Read what it ships precisely — it is the *capability*, and **no consumer has been migrated
  through it**; a repo still carrying the layer stays exactly as it was until its owner answers.
  Step 6 also corrected this record on one point, by measurement rather than reading: the halfway
  state fails in **both** directions, not one. An untracked mirror `sink_blocked`s every sink, as
  §8 said — and sources deleted from disk but left in the index are staged by the next finalize's
  `git add -A -- kaola-workflow/.roadmap` and committed, unreviewed, inside an unrelated run's
  `chore: archive`. Same one-line rule, twice as forced. Acceptance was a run, not a suite: with
  `roadmap.js` gone, `claim.js status` and `list-open` both execute and answer correctly.
- **Date:** 2026-08-15
- **Supersedes (if accepted):** the 2026-08-12 ruling that `ROADMAP.md`'s *active work* means claimed
  runs only, and with it the `.roadmap/issue-N.md` per-issue source file. **Does not supersede** ADR
  0017 — the mission list is the *run* record and is untouched here; this record is about the
  *backlog*, which 0017 deliberately says nothing about.
- **Resolves:** the per-run mirror drift whose repair has now fired three times on one consumer repo
  (#675–#681, #686–#693, and the eight filings of 2026-08-15).
- **Review:** every §1 figure was independently re-derived by a second party against a fresh forge
  fetch of all 81 open issues. Two of this draft's claims were **refuted** in that pass and are
  rewritten below; three were weakened. See the method note.

## 1. What forced this

Not a design review. A measurement on the consumer repo `VRPCadCore` at 81 open issues and 81 local
sources — a state every existing check calls **reconciled**.

| field | who reads it | measured |
|---|---|---|
| `issue:` | nobody — `roadmap.js:72` states the filename is authority | 81/81 present, 81/81 matching the filename |
| `title:` | mirror rendering only | **78/81** carry stray quotes the renderer never strips; after unquoting, **4** disagree with the forge (#254 #409 #624 #656) |
| `status:` | `validateRemote`'s `!== 'open'` filter (`roadmap.js:318`) | **7** hold local-only values (`deferred`×6, `blocked`×1) and are therefore **skipped by the only remote check that exists** |
| `workflow_project:` | `claim.js:293` `projectNameForIssue` | **0/81 set** — and it duplicates `workflow-state.md`, which the contract already names as the claim record |
| `next_step:` | mirror rendering **and** `classifier.js:293-305`, which parses the prose offline for `/blocked by #\d+/i` and synthesizes a `depends-on:#N` label | 110,398 bytes = 72% of the 154,163-byte mirror |
| `url:` / `updated_at:` / `labels:` | **nothing** | present on 18/81; **2 already wrong** — #1's cached labels still assert `workflow:in-progress`, #678's carry a `kind:gap` the forge dropped |

`next_step` splits into a leading `[...]` tag (2,943 bytes, or 3,022 counting the 79 separator
spaces) and 107,376 bytes of prose. Of the prose:

- **9/81 are verbatim body copies** (similarity 0.995–1.000; next closest 0.841). #638's is 5,158
  characters against a 5,133-character body — the whole body, pipe-escaped, in one table cell.
- **72/81 are not body copies** — they are digests of material recorded elsewhere, and *elsewhere* is
  frequently **not the issue's own thread**: #494's volumes live in open #509's thread, `D-505-01` in
  closed #501/#504/#510, and #334's `D-392-01` literal is in **#146's**. Measured over the whole set
  rather than sampled: 652 checkable atoms from all 81, searched against **512 issues (81 open + 431
  closed)** and the repo's committed files. **Result: 79 of 81 are fully forge-held, 0 are
  repo-held-only, and exactly 2 are homeless** — #535's *"the remainder outside the issue-528
  umbrella, same issue-497-rooted family"* and #536's *"Same issue-497 family."* No thread anywhere
  attributes either to an "issue-497 family", though 22 other issues cross-reference #497 directly.
  (An earlier 20-file hand sample put three more in a repo-held-only class; the full sweep dissolved
  it — #143's `0.1227` mm, cited as living only in a test file, is stated in **#393's** thread. The
  sample was not wrong about the two homeless lines, only about the class above them.) One editorial
  token is genuinely homeless as well: **`REFRAMED` appears in no body or comment of any open issue.**
- The tag's version part duplicates `milestone:*` (77/79) and its severity part duplicates
  `severity:*` (47/79). **`P1`–`P4` (47/81) match no label the consumer's forge defines.**
- Counter-evidence found while checking, and it points the same way: **#535's local blob is already
  stale** — the forge body carries a 2026-08-14 correction (D-607-01) superseding the headline the
  local file still asserts.

**Row order is issue number ascending** (`roadmap.js:63-70`, commented "ascending workflow order").
No shipped machinery orders by the `P`-tier — a sorter exists at `claim.js:268-291` but has zero
production call sites (§5 item 2). So ranking by tier depends **entirely on the agent reading prose
tags** out of a table cell.

## 2. The authorities that disagree

Four shipped texts answer *"what is `ROADMAP.md`?"*, and they do not agree:

1. **The 2026-08-12 owner ruling** — *active work* = claimed runs only; the backlog reading declined,
   and any reverse-direction check declined with it.
2. **`next.skeleton.md:46-49`** — with no issue named, *"you read the backlog and rank it"* from five
   sources: the `ROADMAP.md` table, each `.roadmap/issue-*.md`, **the open issue list**, the active
   folders, and the archived summaries — *"Rank by the roadmap priority frontier, then by scope."*
   ~~This is only meaningful under the backlog reading.~~ **Refuted, and the correction matters:**
   the open issue list is in that enumeration, so under the claimed-runs reading the instruction
   still functions — the forge supplies the backlog and an empty mirror simply contributes nothing.
   What survives is narrower and still real: the *ranking key* is named as "the roadmap priority
   frontier", and under reading (1) that key is empty in exactly the situation the instruction fires.
3. **The generated header** (`roadmap.js:41`) — *"`workflow-next` fetches GitHub issues and mirrors
   active implementation work here."* On the **GitHub** edition no such path exists. On GitLab and
   Gitea it does (§3), so this sentence is false for one edition and true for two.
4. **The generated preamble** (`roadmap.js:49`) — *"GitHub issues are the source of truth when
   available"* — siding with forge authority, in the same file as (3).

One consumer adopted the backlog reading and grew an 81-row mirror; this repo runs (1). On
2026-08-15 that consumer's `CLAUDE.md` gained a mandatory count assertion which is precisely the
reverse-direction check (1) declined. **The mechanism admits both readings because nothing in it
ever states which one it is** — that conclusion stands; the misquote in item (2) does not carry it.

## 3. The defect (GitHub edition), and the evidence the other two forges supply

> **On the GitHub edition, shrinking is automated and growing is manual.**

Closure removes a source. **No GitHub code path creates one**: `roadmap.js:412-418` offers only
`generate` / `migrate` / `validate` / `validate-remote` / `init-issue` / `project-name`, and
`claim.js` only reads (`:294`) and removes (`:2461ff`). `migrate` is a one-time back-fill from the
old hand-maintained table; `init-issue` takes CLI flags only, defaults every field to an em dash,
and is named in no command, skill or doc.

Finalize Step 7 **mandates** filing a follow-up per real run-discovered defect. So the workflow
requires the one action that breaks its own invariant, and every filing run drifts by its filing
count while `validate` returns ok, `validate-remote` returns ok, and all six closure-audit classes
return 0. This holds under either reading of §2 — only the identity of the missing creator changes.

**GitLab and Gitea already built the other half, and it settles the design question.** Both ports
swap `migrate` for `refresh` (`kaola-gitlab-workflow-roadmap.js:247-257`, Gitea identical): it
enumerates open forge issues and writes a source per issue, then regenerates the mirror. Read what
it writes (`writeIssueRecord:230-245`): `workflow_project` ← `issue-<N>`, and `next_step` ←
the issue URL, **unconditionally, every run**. Those two ports therefore already treat the local file
as a pure forge cache.

The consequence is the strongest single piece of evidence in this record: **had `refresh` been
ported to GitHub, its first run on the consumer would have overwritten all 110KB of hand-written
prose with 81 URLs.** The local-content-store model that consumer depends on was never protected by
anything; it survives only because the GitHub edition happens to lack the port.

## 4. The cost of a run-mutated tracked file

Grep-level, not semantic attribution: **~290 lines mentioning the roadmap across four production
scripts** (claim ~164, roadmap 59, sink ~37, audit ~29). Ten issues whose scope included
roadmap-source maintenance (#297 #328 #336 #395 #403 #428 #554 #700 #705 #916; six are unambiguous
drift repairs by title). The sink's bucket-1 auto-stash, keep-open source retention, and dual-root
worktree reconciliation exist for this file class alone. On the consumer, **371 commits touch
`.roadmap/`** (exact), a recurring share of them pure hand re-entry
(`chore: file run follow-ups #N with roadmap sources`).

## 5. The design

**The forge is the backlog. There is no local copy of it.**

1. **Retire `.roadmap/issue-N.md`** — including `refreshFromGitLab` / `refreshFromGitea` and their
   tests. Not reshaped, not slimmed: every field has been walked to a producer.
2. **Priority becomes a forge label, spelled bare `P0`–`P3`.** Not `priority:P1`, which this draft
   originally proposed: `claim.js:274` matches `/^P\d+$/i`, and the shipped consumer guidance
   (`kaola-workflow-init/SKILL.md`) already says *"declare `priority_top_tier_labels` when the repo
   uses something other than P0–P3 naming"*. Bare-P connects a sorter that has been dormant since it
   shipped (zero production call sites) to the pick flow that has never had one. Retiring the sorter,
   the knob and its docs was the coherent alternative; **ruling 2 took connect over retire**, so the
   `P`-tier stops being prose in a table cell and becomes queryable:
   `gh issue list --label P1`.

   **Connecting the sorter means ordering, never selecting.** `next.skeleton.md:39` says *"You select
   the target. No script picks for you"*, and that is untouched: the sorter replaces the raw
   `gh issue list` splice's arrival order with tier order, and the orchestrator still reads the list
   and decides. Stated here because the ruling is otherwise reachable two wrong ways — leaving the
   sorter dormant a second time (ruling unfulfilled), or wiring it as a selector (ADR 0017 violated).
3. **Decision provenance goes where the decision goes** — an issue comment, and the repo's `D-NNN-NN`
   record. Not a table cell citing a record that may not exist.
4. **`ROADMAP.md` is deleted, not cached.** The earlier draft kept it as an untracked regenerable
   cache; that is refuted by the sink. `sink-merge.js:1775` enumerates with `git status --porcelain
   -uall`, which **includes** untracked files; an untracked, non-gitignored `kaola-workflow/ROADMAP.md`
   in a main root matches no bucket, lands in bucket-3 foreign dirt, and refuses **every** sink with
   `sink_blocked` and zero mutation (`:1935-1947`) — and this tool does not own consumer `.gitignore`
   files. `gh issue list` renders the same view with real sorting and filtering. This retires
   `roadmap.js` in all four editions, `test-forge-roadmap-rules.js`, and the init surface's ROADMAP
   template block. Per ruling 3 the tool stops generating and tracking it; deleting the file in an
   existing consumer repo is proposed once per repo and never done by an upgrade.
5. **The pick step reads issues, not titles — on the shortlist only.** `next.skeleton.md` fetches
   `number,title,state,labels` and never opens an issue (zero occurrences of `comment`, `issue view`
   or `acceptance criteria`). Before claiming, read each **shortlisted** candidate's body and
   comments, treating comments as current state where they contradict the body. Forced by
   observation: on 2026-08-15 a four-issue run found **three of the four wrong as filed** — one
   issue's *title* asserted a figure the measurement disproved — with every correction already in
   the comment thread the workflow never reads. Scoped to the shortlist because reading all 81
   candidates is ~160 forge round-trips per pick, trading a drift class for a rate class.
6. **`_rules.md` survives, and its reader is re-pointed.** Today the pick reaches it through the
   mirror's generated `### Project rules` section (`roadmap.js:100-105`, `next.skeleton.md:47-48`).
   With the mirror gone the skeleton must read `.roadmap/_rules.md` directly.

7. **`workflow-init` owns migration; the installer never does.** Init is already the only surface
   that touches consumer-repo structure, is already specified as re-runnable and additive on an
   existing repo (`init.skeleton.md:66`), and is **user-invoked** — which is what makes it the seam
   ruling 3 requires. Its shape is **diagnose → report → ask → act**, never auto-migrate, and the
   diagnosis must be worth reading even when the user declines. `./install.sh` upgrading a consumer
   must leave the backlog layer untouched: separating upgrade from migration is what prevents the
   half-migrated state that §8 identifies as sink-bricking. Init's own `.roadmap/` bootstrap and
   `generate` call (`init.skeleton.md:457-462`) are deleted in the same change.

9. **`CLAUDE.md` carries the mechanism, never the backlog.** The injected block states which source
   answers which question and the format to write back in. It names no issue, no priority and no
   piece of work: that content has a producer on the forge, and copying it into a prompt surface
   would rebuild §1's defect in a new file. Mechanism is the one thing with **no producer anywhere
   except the prompt**, which is why it belongs there and why it is all that belongs there.

   Two questions, two sources, no overlap:

   - **What the work is** — open/closed, title, tier, and every correction since filing → the forge
     issue, its labels, and **its comments, which override its body**.
   - **What this run owns** — claimed issues, branch, worktree, what is done → `workflow-state.md`
     and `mission-list.md` (ADR 0017). Unchanged by this record.

   And two moments, which are what the block exists to guarantee. **Before**: read the shortlist's
   bodies and comments (item 5). **After**: write back to the forge — close, file follow-ups
   *tiered* (item 8), and **post the run's corrections as comments on the issues they correct**. That
   last one closes the loop: the next run's read is only as good as this run's write.

   **The enforcement is the next reader, not a validator** — and the asymmetry against §3 is what
   makes that sufficient. A missing roadmap source was **silent**: three checks returned clean while
   eight issues sat unmirrored, for three runs running. A missing comment is **self-revealing**: the
   next run reads a stale issue and gets it wrong — which is precisely how the 2026-08-15 run
   discovered three of its four issues were wrong as filed. The old failure hid; this one surfaces at
   the next read, in the hands of the party who can fix it.

   **Keeping that block current needs a named region, and today there is none.** Injected guidance
   lands **unmarked** — `<!-- SPLICE:in-shared-001 -->` exists only on the authoring side and is
   resolved away at render, so a consumer `CLAUDE.md` carries no `PIN`, region or comment marker at
   all. Init cannot tell its own wording from the user's, which is why its contract can only ever
   *"add only missing durable guidance"* (`init.skeleton.md:66`) — **structurally incapable of
   retiring a stale rule.** Already realised: `VRPCadCore`'s `CLAUDE.md:114` has **fused** the
   injected wording with a hand-added 2026-08-15 amendment into one line, so the tool's half cannot
   be retired without editing the user's, and that same line hardcodes a script path this ADR
   deletes. A region (tool-owned inside, user-owned outside) converts init from *add-only* to
   *reconcile*. It is an anchor, not a gate; it refuses nothing. It also satisfies "one rule, one
   wording", under which a runtime is a rendering target and divergence must be a **declared named
   region, never an incidental rewrite** — a consumer `CLAUDE.md` is today an unmarked rendering
   target that consumers author into, and one of them demonstrably carries an owner rule that
   *overrides* shipped command prose. Everything outside the region stays theirs, that rule included.

   The block **shrinks**: roughly five roadmap rules become three. Adding the region to an existing
   consumer is itself an edit to a user-owned file, so it cannot be retroactive — for existing repos
   the first migration proposes it (*"this is what I would own; everything else stays yours"*), and
   repos initialized afterwards carry it from the start.

   **The rule spans surfaces, so it takes a PIN — and a PIN is not the region.** This record's rule
   is stated in three places by nature: `init.skeleton.md` (standing facts, → consumer `CLAUDE.md`),
   `next.skeleton.md` (read the shortlist before claiming), and `finalize.skeleton.md` (tag what you
   file, comment what you corrected). §2 is a record of what happens when one rule sits on several
   surfaces with no declared relationship — so this one is pinned, e.g.
   `<!-- PIN: forge-is-the-backlog -->`. That admits per-surface wording (the consent pin already
   differs between next and finalize) while making silent disappearance from one surface impossible.
   The three §2 statements drifted precisely because they were unpinned incidental prose.

   **Correction, measured during the build.** This record first claimed `test-route-reachability.js`
   *derives* a pin's universe from shipped bytes "the way it already does for
   `consent-in-conversation`". **False, and the error is instructive:** the byte-scan
   (`test-route-reachability.js:550`) is purpose-built for `codex-dispatch-model-routing` alone, and
   the sentence this record generalised — *"the universe is derived, not listed"* — is scoped to that
   one pin. `consent-in-conversation` is **listed**, in the hand-authored `REQUIRED_BLOCKS` array of
   `templates/routing/required-blocks.js` (16 entries, one per surface topic). So a new pin **owes a
   manifest entry per topic that carries it**, and that entry is a test artifact — the party placing
   the markers must not also author the thing that judges their presence. Adding the markers without
   it took the suite from 331/0 to **330 passing / 73 failing**, every failure an `orphan-surface`
   report naming the unregistered marker. That red is the reverse-orphan sentinel doing its job, and
   it is this record's own proof of the convention that **a guard is evidence only once
   mutation-proven**: the pin mechanism was demonstrated armed by an unplanned mutation rather than
   asserted from a green run.

   Keep the two mechanisms distinct in the build: **the pin** says a rule must appear on the surfaces
   that invoke it (tool-side, cross-surface, tested); **the region** says which lines the tool owns
   inside a user-owned file (consumer-side, an ownership boundary). Conflating them would put a
   fail-closed test on a file the tool does not own.
8. **The run loop's only new duty is tagging what it files.** Finalize Step 7 mandates a follow-up
   per real defect; an issue filed without a `P` label is tier 99 and invisible to the sorter item 2
   connects. So the tier is written in the same breath as `filed: #N`. **That is the whole of it.**
   The point of this record is that after migration there is no local copy, therefore no drift,
   therefore nothing to reconcile — adding a maintenance mechanism to the loop would rebuild exactly
   what §5 removes. A repo that upgraded but never ran init still carries frozen sources; the loop
   **says so once and does not act** (a report, never a gate), and that report is transitional.

**Named accepted losses.** Retirement is not free and these are not to be discovered later:

- **Offline claim evidence.** `classifier.js:292-299` treats `.roadmap/issue-N.md` as the only local
  proof an issue exists; without it, an offline claim with no active folder answers
  `target_unverified` (`api.md:78`). Offline filing, closing and label reads are already unavailable,
  so this narrows an already-degraded mode — but it is a loss, not a no-op.
- **The offline dependency hint.** `classifier.js:300-305` synthesizes `depends-on:#N` by parsing
  `blocked by #N` out of `next_step`. That inference disappears.
- **Homeless local content.** §1 found ~1 in 10 sampled digests carrying an atom with no forge home,
  and 2 in 20 with no home anywhere. Deleting the files deletes those unless migration preserves them
  (§8).

Retired with the above: `migrate`, `refresh`, `init-issue`, `project-name`, `validate`,
`validate-remote`, the `Status` and `Workflow Project` mirror columns (0/81 populated), the sink's
roadmap stash bucket, keep-open source retention, dual-root reconciliation, and the
`roadmap_source_removed` / `roadmap_regenerated` / `roadmap_regenerated_by_root` envelope fields.

**Untouched:** ADR 0017's mission list, `workflow-state.md`, active folders, the archive, the chains,
and the sink's merge behaviour.

## 6. The watch list — recorded, not built

Per 0017's method, mechanisms answering failures nobody has observed are written down, not shipped.

- **A tracked ordering file** (`order.md`: issue numbers with a one-line local note). The fallback if
  §7's ruling keeps a local backlog artifact. Nothing observed demands it once the `P`-tier is a
  label, so it is not built.
- **An offline backlog view.** No observation shows a run that picked work offline and needed the
  list.
- **A drift detector.** With no local copy there is nothing to drift, so the check declined on
  2026-08-12 and re-mandated on 2026-08-15 becomes unnecessary in both directions rather than
  adjudicated.

**Rejected with evidence, not watch-listed:** the untracked `ROADMAP.md` cache (§5 item 4). It would
brick every sink on any consumer that does not gitignore it.

## 7. Rulings — all settled 2026-08-15

1. **The backlog reading replaces the claimed-runs reading.** §2's disagreement is a definition, not
   a measurement, and the owner ruled the backlog reading. This is what makes §5's removals legal,
   and it supersedes the 2026-08-12 ruling named in the header.
2. **Priority is a bare `P0`–`P3` forge label**, and the dormant sorter is connected rather than
   retired (§5 item 2).
3. **`ROADMAP.md` is deleted from version control — with per-repo consent.** The tool stops
   generating and tracking it; the actual deletion in any consumer repo is proposed once per repo and
   executed on that repo's owner's answer. Never performed as a side effect of an upgrade.
4. **The workflow does not create labels on a consumer forge.** It proposes the exact
   `gh label create` commands and the per-issue tier mapping derived from the 47 existing local tags;
   the owner executes or approves them. Writing to someone's tracker stays a consent action.

## 8. Build sequence

**Two ordering principles, both forced.** *Give every surviving fact its new home before deleting the
old one* — §1 measured facts that live nowhere else, so deletion-first would destroy them. And *no
consumer may pass through a state that refuses work* — §5 item 4 found one such state, and an
ordering that opens it is wrong however tidy it looks.

1. **The pick step reads the shortlist's issues** (§5 item 5). Ships alone, deletes nothing, and no
   later step depends on it — but it repays immediately, because the observation that forced it (a
   run finding three of its four issues wrong as filed) recurs on every run until it lands.
2. **Give the tier its new home.** Create `P0`–`P3` on the forge (ruling 4: proposed, owner-executed)
   and connect the dormant sorter as *ordering, never selecting* (§5 item 2). **This gates every
   deletion below it**: retirement deletes `next_step`, which is physically where 47 of 81 tiers live
   today.
3. **Give the mechanism text its region and its pin** (§5 item 9). Init gains the marked region;
   the rule gains `<!-- PIN: forge-is-the-backlog -->`, **and each surface topic carrying it owes a
   `REQUIRED_BLOCKS` entry in `templates/routing/required-blocks.js`** — the universe is listed, not
   derived (§5 item 9's correction), and placing a marker without registering it reds the suite by
   design. That entry is a test artifact and belongs to whoever did not place the markers. Additive
   for new repos, and it is what converts init from *add-only* to *reconcile* — so **step 6 is
   impossible before this one.**
4. **Stop reading the sources, one capability at a time.** Each slice is independently green and
   takes its own tests and doc rows with it: the classifier's offline arm, `projectNameForIssue`'s
   roadmap door, closure-audit's roadmap classes with their finding types and registries, and the
   sink's stash bucket + keep-open retention + dual-root reconciliation + envelope fields. The file
   still exists throughout, so nothing yet claims a capability it does not have.
5. **Delete the file and every sentence describing it, as one movement.** `roadmap.js` in all four
   editions, the `nx-roadmap-*` splices, init's `.roadmap/` bootstrap, the mirror, and the roadmap
   prose in all three skeletons plus `README.md` and `docs/api.md`, with routing surfaces regenerated
   in the same commit. **Prose ships with its mechanism** — a rule describing a deleted mechanism is
   the same defect as a test repaired ahead of one. Tests fall out here, deleted with what they pin,
   never repaired ahead of it. The installer manifests lose the roadmap script and gain its
   retired-name prune entry.

   **Inside this step the order is not free, and getting it wrong locks the run out of its own
   tooling.** `roadmap.js` is required at **module load** by eight production call sites — `claim.js`
   and `closure-audit.js`, each in canonical plus all three plugin copies. Deleting the script before
   those requires are removed breaks claim, startup, resume, finalize and the audit **at require
   time, in every edition**. This repo is the self-host: the run performing the deletion is finalized
   by `claim.js`. So the requires come out first, in the same commit as or before the file, and the
   step is verified by *running* a claim and a finalize — not by a green suite, which loads the same
   module the same way and would pass right up until the file is gone.
6. **Migrate consumers, one repo at a time, on consent** (ruling 3). Never as a side effect of an
   upgrade. The constraints below are what make this step the risky one:

**Migration carries the risk, not the design.** It needs its own movement rather than falling out of
the upgrade:

- Retiring the shrink machinery and `validate-remote` while a consumer still carries sources leaves
  its tracked files permanently frozen yet authoritative-looking, with the detector retired in the
  same change.
- A half-migrated consumer — mirror off the index, still on disk, not ignored — hits §5 item 4 and
  bricks every sink. **The operative rule is one line: the mirror leaves disk and index in the same
  movement, never `git rm --cached`.** A *tracked* frozen mirror is harmless (the tree stays clean);
  an *untracked* one refuses every sink. So the dangerous state is not "not yet migrated" — it is
  "migrated halfway", and only one command produces it.
- **The consumer's own `CLAUDE.md` becomes self-failing.** `VRPCadCore`'s line 114 mandates asserting
  `ls .roadmap/issue-*.md | wc -l` equals the open-issue count; the moment sources are deleted it
  reads `0 == 81` and every finalize violates the project's own rule. That file is owner-owned: the
  tool cannot edit it, and the edit must be offered in conversation. The same repo's `_rules.md`
  first paragraph, which tells readers to consult the per-row band tag in each `Next Step` cell,
  dangles the same way.
- Nothing is lost in bytes — sources and mirror are tracked, so the retirement commit SHA preserves
  them, and that SHA belongs in the migration report. What history does not make *findable* is §5's
  homeless content. Migration closes §1's sampling gap mechanically rather than by argument: diff
  every digest against `gh issue view N --comments` and the repo, then post the residue as a comment
  **only on the issues where residue actually exists**. That set is now measured over all 81 rather
  than extrapolated: **79 forge-held, 0 repo-held-only, exactly 2 homeless** (#535 and #536, both the
  same "issue-497 family" attribution). So the preservation step is **two comments, not eighty-one**,
  and ruling 4's consent ask is that small. Deletion manifest, for the record: 82 tracked files /
  287,087 bytes, preserved by the pre-deletion HEAD.
- **Two surfaces this record did not name, both found by measuring rather than reading.** The
  consumer cites `ROADMAP.md` **11 more times across five live documents** (`concerns.md`,
  `development-state.md`, `requirements.md`, `milestones.md`, `docs/README.md`) as a status pointer —
  outside this tool's build sequence, which only touches its own skeletons, `README.md` and
  `docs/api.md`, so **only the consumer can repair those** and the migration proposal must say so.
  And a shipped test (`oracle_495_498_fillet_landed_honesty.rs:62`) already cites a
  `.roadmap/issue-495.md` that closure deleted long ago: **the dangling-citation failure mode exists
  today**, under the shrink-only mechanism. Migration does not invent it; it generalises it from
  "whichever issues happen to be closed" to all 81 at once, which is an argument for doing the
  citation sweep as part of step 6 rather than a reason to hesitate.

## Method note

Derived by measuring one consumer's live state and walking each field to a producer, then handed to
an independent falsifier with instructions to refute. **Five claims in this record were reversed
before it stabilized**, and they are listed rather than quietly corrected:

- `next_step` is not predominantly an issue-body copy — 9/81, not most.
- The `P`-tier is not a duplicated label — no such label exists, and a dormant sorter already expects
  a different spelling than this draft first proposed.
- "No code path creates a source" is a **GitHub-edition** fact; two forges shipped the creator years
  of commits ago.
- §2 item (2) **misquoted its own source** by omitting "the open issue list" from a five-item
  enumeration, which inverted what that instruction proves.
- The local prose is a digest of the forge **or the repo**, not of "the issue's own comment thread" —
  cross-references resolve through sibling and closed issues, and a measurable residue resolves
  nowhere.

**That weakest link is now closed, and closing it corrected this record twice.** The 20-of-72 hand
sample has been replaced by a full sweep — 652 atoms from all 81 sources against 512 issues (81 open
+ 431 closed) and the repo. It confirmed the two homeless lines exactly, and **dissolved the
repo-held-only class this record had asserted**: #143's `0.1227` mm turned out to be stated in #393's
thread, invisible to a sample that searched only #143's own. The lesson generalises past this record:
a cross-referencing corpus cannot be sampled per-item, because *elsewhere* is usually **another
item**. Where the count now stands — 79 forge-held, 0 repo-held-only, 2 homeless — is measured, not
inferred.

# 0018 — The forge is the backlog

- **Status:** Accepted — all four §7 rulings settled 2026-08-15. **Build sequence deliberately not
  written yet**, per the owner; migration (§8) owns the risk and gets its own step when it is.
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
- **72/81 are not body copies.** Twenty were hand-traced. About three-quarters are digests of
  material durably recorded **on the forge or in the repo** — but frequently *not* the issue's own
  thread: #494's volumes live in open #509's thread, `D-505-01` in closed #501/#504/#510, and #334's
  `D-392-01` literal is in **#146's** thread. Of the twenty, **3 carried a measurement whose only
  non-roadmap home is a committed test or `CHANGELOG.md`** (#143's `0.1227` mm lives in
  `crates/cadcore-verify/tests/probe_143_filleted_box.rs`), and **2 carried a family-attribution
  link recorded nowhere else at all** (#535/#536's "issue-497 family"). The editorial vocabulary is
  homeless too: **`REFRAMED` appears in no body or comment of any of the 81 open issues.**
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

## 8. The risk is the deployment seam, not the design

The build sequence follows the rulings and is deliberately not written here. What must be recorded
now is that **migration carries the risk, not the design**, and it needs its own step rather than
falling out of the upgrade:

- Retiring the shrink machinery and `validate-remote` while a consumer still carries sources leaves
  its tracked files permanently frozen yet authoritative-looking, with the detector retired in the
  same change.
- A half-migrated consumer — mirror off the index, still on disk, not ignored — hits §5 item 4 and
  bricks every sink.
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
  **only on the issues where residue actually exists**. The sample sizes that set: ~15 of 20 were
  already forge-held, 3 more had their atom in a committed test or `CHANGELOG.md`, and **2 of 20 were
  homeless** — roughly eight issues repo-wide, not eighty-one. Consent (ruling 4) is then a
  single-digit ask, and the measurement decides its size rather than an assumption.

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

Twenty of the seventy-two digests were traced by hand; the generalisation from twenty to
seventy-two is the weakest remaining link and is stated rather than hidden. "Nowhere on the forge"
rests on the full open corpus plus targeted search of the specific closed issues cited; decimal
tokenization in forge search makes a closed-issue occurrence impossible to exclude with certainty.

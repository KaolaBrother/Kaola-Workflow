# Investigation: issue #892 — the `next` surfaces point at `docs/mission-list.md`, a path that resolves only in this repo

Read-only reconnaissance. **No tracked file was modified.** This is the edit plan; execute it without
re-reading the issue.

## Setup

- Worktree measured: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-888-889-890-892-893-894-895`
- Branch `workflow/bundle-888-889-890-892-893-894-895`, HEAD `fa5157b3`, tree clean at read time.
- Generated runtime trees measured in the MAIN checkout (`/Users/ylpromax5/Workspace/Kaola-Workflow`)
  because `.opencode*/` and `.kimi*/` are gitignored and exist only there.
- Surface count command: `node scripts/generate-routing-surfaces.js --check`
  → `generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.` **exit 0.**
  **18 is correct** — 3 topics (`next`/`init`/`finalize`) × (3 command editions + 3 skill editions),
  computed at `scripts/generate-routing-surfaces.js:105-130`, never hand-typed.

---

## Part 1 — Verification of the six named claims

### Claim 1 — the pointer's surface reach: **PARTIAL (the count is 12 installed surfaces, not 6)**

CONFIRMED at the three named locations, verbatim identical at all of them:

- `templates/routing/next.skeleton.md:205-207`
- `commands/workflow-next.md:137`
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md:213`

```
An H1 carrying the goal in one line, then one item per mission. The format — the four fields, the
three write moments, and how to resume from it — is `docs/mission-list.md`; read it there rather
than reconstructing it from memory.
```

**Full tracked reach — 6 rendered surfaces** (all at the same line numbers):

| surface | line |
|---|---|
| `commands/workflow-next.md` | 137 |
| `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | 137 |
| `plugins/kaola-workflow-gitea/commands/workflow-next.md` | 137 |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | 213 |
| `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | 213 |
| `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` | 213 |

**MISSED BY THE ISSUE — 6 more untracked, generated, installed surfaces.** The opencode and Kimi
editions render their trees from `commandSurfacesForForge()`
(`scripts/generate-routing-surfaces.js:150-154`), so the pointer propagates there too:

```
.opencode/command/workflow-next.md:136
.opencode-gitlab/command/workflow-next.md:136
.opencode-gitea/command/workflow-next.md:136
.kimi/skills/workflow-next/SKILL.md:137
.kimi-gitlab/skills/workflow-next/SKILL.md:137
.kimi-gitea/skills/workflow-next/SKILL.md:137
```

**The dead pointer reaches 12 installed surfaces across 4 runtimes.** These 6 regenerate from the
skeleton — no separate edit, but the fix is not verified until they are re-synced (commands in Part 6).

### Claim 2 — pinned token in `required-blocks.js`: **CONFIRMED**

`templates/routing/required-blocks.js:78-91`, block `nx-mission-list`, `topic: 'next'`,
`runtime_tag: 'both'`, `surface_type_tag: 'both'` (⇒ obligates all 6 tracked next surfaces).
`content_tokens[1]` at **line 84** is the literal `'docs/mission-list.md'`.

### Claim 3 — nothing ships it: **CONFIRMED**

- `scripts/kaola-workflow-install-manifest.js` — `grep -c "docs/" → 0`. It exports only
  `SUPPORT_SCRIPTS` (:61) and `SUPPORT_HOOKS` (:83).
- `install.sh` — the only directories it creates are `$AGENTS_DIR` (:406), `$COMMANDS_DIR` (:628),
  `$SUPPORT_SCRIPTS_DIR` (:651), `$SUPPORT_HOOKS_DIR` (:673). No docs path anywhere.
- `plugins/kaola-workflow/` contains exactly `agents config hooks scripts skills`. **No `docs/`.**

### Claim 4 — nothing creates it: **CONFIRMED**

`commands/workflow-init.md:277-288` (skeleton source `templates/routing/init.skeleton.md:326-337`):

```text
kaola-workflow/
  ROADMAP.md
  archive/
docs/
  README.md
  architecture.md
  api.md
  conventions.md
  decisions/
CHANGELOG.md
```

No `mission-list.md`. (Also no `workflow-state-contract.md` — see Part 5.)

### Claim 5 — why no guard caught it: **CONFIRMED**

`scripts/test-route-reachability.js:805-806`:

```js
  assert(exists('docs/mission-list.md'),
    'the canonical mission-list format the next surfaces point at must exist');
```

with `const exists = rel => fs.existsSync(path.join(REPO, rel));` at **:21** and
`const REPO = path.resolve(__dirname, '..');` at **:18** — the authoring repository. The assertion is
green for a reason unrelated to the property it names.

**MISSED BY THE ISSUE — a second, stronger assert in the same file.**
`scripts/test-route-reachability.js:156`:

```js
  assert(n.includes('kaola-workflow/{project}/mission-list.md') && n.includes(norm('docs/mission-list.md')),
    `T4[${ed.name}]: next SKILL names the run's mission list AND points at the canonical format`);
```

This one runs per Codex edition and **requires** the dead pointer to be present on each next SKILL.
It will red the moment the pointer is removed. It is not in the issue's call-site list.

### Claim 6 — `init` never names `docs/mission-list.md`: **CONFIRMED**

A whole-tree `git grep -n "docs/mission-list"` returns zero hits in any init surface, init skeleton,
or init SKILL. The only mission-list path init injects is `kaola-workflow/{project}/mission-list.md`
at `commands/workflow-init.md:134` (skeleton `init.skeleton.md:154`) — **correct, must stay.**

---

## Part 2 — The wordings. The issue says four. **There are seven.**

### The locator sub-claim: **CONFIRMED in substance, REFUTED in its attribution**

The issue says *"#1's field table says `dispatched` is 'what went out and to whom, and **where the
output was to land**'"*. It does not. Measured:

| site | `dispatched` cell text | locator in the table? |
|---|---|---|
| `docs/mission-list.md:41` | `what went out and to whom, enough to decide re-dispatch vs. wait` | **NO** |
| root `CLAUDE.md:23` | `what went out and to whom, and **where the output was to land**` | **YES — the only one** |
| `README.md:918` | `what went out and to whom, enough to decide re-dispatch vs. wait` | NO |
| `docs/architecture.md:38` | `what went out and to whom, enough to decide re-dispatch vs. wait` | NO |
| `docs/decisions/0017…md:65` | `what went out and to whom, enough to decide re-dispatch vs. wait` | NO |

`docs/mission-list.md` carries the locator only as prose in *Resuming*, at **:88-89**:
> This is why `dispatched` should name *where the output was to land*: that locator is what makes
> the check possible at all.

**The substantive claim stands and is worse than stated:** `init.skeleton.md`'s KW-CLAUDE-TEMPLATE
region carries the locator **nowhere on the write side**. Grep over the region (lines 106-208) for
`where the output` / `locator` / `dispatched: self` / `status: todo` returns **zero hits**. Line 177
uses the locator on the *read* side only ("if the output its `dispatched` line promised has landed"),
which tells a successor to check a thing the same template never told anyone to write.

### Coverage matrix — what each site carries

`A` fenced literal example · `B` field table · `C` four field names inline · `D/E/G` write moments
1/2/3 · `F` **write-side locator instruction** · `H` `dispatched: self` · `I` frontier · `J` mission-
not-spec · `K` resume procedure · `L` work-not-worker · `M` order-identified / no stable ID ·
`N` items may be added · `O` file location · `P` absent fields absent · `Q` origin story ·
`R` "what is not here" · `S` the sink

| # | Site | Lines | A | B | C | D | E | **F** | G | H | I | J | K | L | M | N | O | P | Q | R | S | Reaches |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `docs/mission-list.md` | 1-114 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓(prose :88) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | this repo only |
| 2 | `templates/routing/next.skeleton.md` | 200-255 | ✗ | ✗ | ✓ | ✓ | ✓ | **✓ :238** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ~ | ~ | (finalize) | **12 installed next surfaces** |
| 3a | `init.skeleton.md` KW-CLAUDE-TEMPLATE | 154-157, 176-177 | ✗ | ✗ | ✓ | ✓ | ✓ | **✗** | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ~ | ✗ | 6 init surfaces **+ every consumer `CLAUDE.md`** |
| 3b | `init.skeleton.md` § How a run is coordinated | 314-319 | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | **3 SKILL surfaces only** (inside `<!-- REGION:skill -->`, :228-342) |
| 4 | root `CLAUDE.md` | 14-35 | ✗ | **✓ w/ locator** | ✓ | ✓ | ✓ | ✓ (:23) | ✓ | ✗ | ✓(:99) | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ~ | ✓ | this repo, always in context |
| 5 | `README.md` | 894-942 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (:938) | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | this repo, published |
| 6 | `docs/decisions/0017-…md` | 57-100 | ✗ | ✓ | ✓ | ~ | ✓ | ✗ | ~ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | this repo (decision record) |
| 7 | `docs/architecture.md` | 30-55 | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ (:51) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ~ | ✓ | this repo |

Partial statements not counted as full wordings: `docs/workflow-state-contract.md:47` (one-row
summary) + `:106-109`; `docs/conventions.md:76-80` (the join rule, carries `L` and the locator noun).

**What lives ONLY in `docs/mission-list.md`** — the issue's claim of "~18 lines at :21-46" is close
but the block is **:21-49** (29 lines) and two of its facts appear nowhere else at all:

- the fenced literal example `A` (:21-35) — also in `README.md:898-912`, nowhere in any skeleton;
- the field table `B` (:37-42) — also in CLAUDE.md / README / ADR / architecture, nowhere in a skeleton;
- **`P` "Fields appear in the order above and absent fields are simply absent" (:45-46) — UNIQUE;**
- `M` "identified by their order in the file; nothing depends on a stable ID" (:44-45) — otherwise
  only in `README.md:921-922`, never on a shipped surface.

`M` is load-bearing beyond prose: `kaola-workflow/archive/bundle-881-882-883-884-885/mission-list.md:125`
records a real decision made by citing it. If it is dropped in the inline it leaves the shipped
surfaces with no statement that items have no stable ID.

### Verbatim diff — what each says that the others do not

**#2 `next.skeleton.md` says, and #3a does not:**
- `status: todo` and `dispatched: self` as literal field values (:234, :242).
- The write-side locator: *"Name **where the output was to land** — that locator is what makes recovery possible at all."* (:238-239).
- The window argument: *"everything between dispatch and return is exactly the window in which a process dies and takes the only record of what was in flight with it."* (:236-238).
- The re-dispatch economics: *"Re-dispatching read-only work costs a little time; waiting on a worker that died costs the run."* (:254-255).

**#3a `init.skeleton.md` says, and #2 does not:** nothing about the format. Every one of its format
sentences is a shortened paraphrase of a #2 sentence. Its only non-overlapping content is
runtime-neutral framing for a consumer repo ("The agent writes it; no script owns it.", :154).

**#4 `CLAUDE.md` says, and #2 does not:** the field table, and the locator *inside the table*
(the single site in the repo that binds the locator to the field definition rather than to a
procedure).

**#5 `README.md` says, and #2 does not:** the fenced example, the field table, `M` (order-identified).
Its fenced example is **internally inconsistent**: the `in-flight` item's placeholder reads
`<what went out and to whom, and where its output was to land>` (:906) but the `done` item's reads
`<what went out and to whom>` (:910).

---

## Part 3 — Call sites. Verified, plus eleven the issue missed

### 3.1 Named by the issue — all verified present

| # | Site | Verified at | What must change |
|---|---|---|---|
| 1 | `templates/routing/next.skeleton.md` | **:205-207** | Delete the pointer sentence; inline the file shape. See 4.1. |
| 2 | root `CLAUDE.md` | **:10-12** and **:191** | :11 `the file format is [`docs/mission-list.md`](docs/mission-list.md)` → drop the second link, keep the ADR link. :191 `- `docs/mission-list.md` — **the run record's format.** · ` → delete that entry from the Documentation Map line. |
| 3 | `docs/conventions.md` | **:5-6** | `**The workflow itself is `docs/mission-list.md`**` → re-point at the ADR, which is already named on the next line. |
| 4 | `docs/README.md` | **:3** and **:9** | Two markdown links `[The mission list](mission-list.md)`. Both become dead links. Nothing checks them — there is no link checker in `scripts/`. |
| 5 | `scripts/test-route-reachability.js` | **:805-806** | Delete the `exists('docs/mission-list.md')` assert. Do **not** repair it into an assert on a different path — the mechanism it guarded is gone (test-custody rule: a test is deleted with its mechanism). |
| 6 | `scripts/test-route-reachability.js` | **:842** | `LEGACY_PAIRS` entry `{ token: 'docs/mission-list.md', surfaces: NX_ALL }` — delete the row. Keep `:841` (`'mission-list.md'`). |
| 7 | `templates/routing/required-blocks.js` | **:84** | Delete `'docs/mission-list.md'` from `nx-mission-list.content_tokens`; add tokens for the inlined shape (see 4.1). |
| 8 | `scripts/validate-workflow-contracts.js` | **:245** | `assertIncludes(file, 'docs/mission-list.md');` inside the `nextSurfaces` loop (:220-227, all 6 surfaces). Delete; replace with an assert on an inlined-shape token. Also fix the comment at **:242-243** (`point at the canonical format rather than paraphrasing it`). |
| 9 | `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` | **:245** | Byte-twin of #8. Identical edit. (`plugins/kaola-workflow-gitlab/…` and `…-gitea/…` validators have **zero** mission-list references — verified — so this is exactly one twin.) |
| 10 | `scripts/test-generate-routing-surfaces.js` | **:300** | `'docs/mission-list.md',` in the `next:` token list (:296-308). Delete; add the inlined-shape token. Leave `'mission-list.md'` at :299 and the `init:` `'mission-list.md'` at :290. |
| 11 | `scripts/kaola-workflow-adaptive-schema.js` | **:1016** | Delete `'docs/mission-list.md',` from `SELF_HOST_TEST_CONSUMED` (:1010-1017). **See 3.3 — a different agent owns this file.** |

### 3.2 MISSED BY THE ISSUE — must also change

| # | Site | Line | Classification / what must change |
|---|---|---|---|
| 12 | `scripts/test-route-reachability.js` | **:156** | **RED-ON-FIX.** `assert(n.includes(...) && n.includes(norm('docs/mission-list.md')), 'T4[…]: next SKILL … points at the canonical format')`. Runs per Codex edition. Drop the second conjunct and reword the message; keep the first conjunct. |
| 13 | `README.md` | **:923** | `Full convention: [docs/mission-list.md](docs/mission-list.md).` — dead link on deletion. Delete the sentence. |
| 14 | `README.md` | **894-942** | The **fifth wording** (Part 2 #5). At minimum fix the inconsistent fenced placeholder at :910. See 4.4 for the scope call. |
| 15 | `docs/api.md` | **:7** | "`mission-list.md` for the file format" — a relative sibling reference, dead on deletion. Re-point at `decisions/0017-the-mission-list.md`. |
| 16 | `docs/architecture.md` | **:27** | "`mission-list.md` for the file format" — same. Re-point at the ADR. |
| 17 | `docs/architecture.md` | **30-55** | The **seventh wording** (full field table + write moments + resume). Its table lacks the locator. See 4.4. |
| 18 | `docs/workflow-state-contract.md` | **:7** | "(the coordination record — see `mission-list.md` for its format)" — dead sibling reference. Re-point at the ADR. |
| 19 | `docs/workflow-state-contract.md` | **:109** | "…zero-context successor needs; see `mission-list.md`." — same. |
| 20 | `scripts/test-ledger-compare.js` | **:11**, **:29** | Comments: "`status: done` lines of docs/mission-list.md's format" and "A mission list in the DOCUMENTED format (docs/mission-list.md)". Re-point the citation. No assertion depends on the path. |
| 21 | `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` | **:479**, **:542** | Comments: "derived from the format in docs/mission-list.md" and "The record-derived half, per docs/mission-list.md." Re-point. Verified: the gitlab/gitea walkthrough twins and root `scripts/simulate-workflow-walkthrough.js` carry **zero** mission-list references, so this is one file. |
| 22 | `scripts/validate-kaola-workflow-contracts.js` | **:304** | Comment `// #882: ADR 0017 (docs/decisions/0017-the-mission-list.md, docs/mission-list.md) retired…` — historical citation inside a rationale block. **Recommend leaving it**: it describes a past state, and the ADR path beside it still resolves. Flagged for the executor's judgment. |
| 23 | `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js` | **:1016** | Byte-identical twin of #11. |
| 24 | `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js` | **:1016** | Byte-identical twin of #11. |
| 25 | `plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js` | **:1016** | Byte-identical twin of #11. |

### 3.3 Note for the agent who owns `kaola-workflow-adaptive-schema.js`

All four copies are byte-identical — verified, md5 `9b77e989a978f2ca3226966dd52a9be1` on
`scripts/`, `plugins/kaola-workflow/scripts/`, `plugins/kaola-workflow-gitlab/scripts/`,
`plugins/kaola-workflow-gitea/scripts/`. `edition-sync.js --check` runs in the gitlab and gitea
chains, so a one-copy edit reds those two.

**The exact change: delete line 1016, `  'docs/mission-list.md',`, from `SELF_HOST_TEST_CONSUMED`.**
Nothing else in that file changes. Specifically, the explanatory comment block at **:1001-1007**
lists five entries and never mentioned `docs/mission-list.md` — so no comment line needs touching,
and no comment goes stale. The entry was added by #877 after a near-miss (a change to the file could
otherwise have skipped the chains); with the file deleted the entry is dead, not merely stale.

### 3.4 Verified NOT affected (do not touch)

`scripts/test-claim-hardening.js` (11 hits), `scripts/test-outcome-recorder.js:170`,
`scripts/test-bash-block-guards.js:88`, `scripts/kaola-workflow-compact-context.js:94,100`,
`scripts/kaola-workflow-ledger-compare.js:10,77`, `templates/routing/slots.js:34`,
`templates/routing/finalize.skeleton.md:102,191`, `commands/kaola-workflow-finalize.md:27,113`,
`kaola-workflow/ROADMAP.md:21`, `kaola-workflow/.roadmap/_rules.md:1`, `CHANGELOG.md:55`, and every
file under `kaola-workflow/archive/` and `kaola-workflow/.origin/`. These reference either
`kaola-workflow/{project}/mission-list.md` (the per-run file, which is correct) or the ADR path, or
are frozen historical records.

---

## Part 4 — The edit plan

### 4.1 `templates/routing/next.skeleton.md` — inline the shape, drop the pointer

Replace **:205-207** (the three-line pointer sentence, ending `…than reconstructing it from memory.`)
with the file shape, transcribed from `docs/mission-list.md:21-49` with **two required changes**:

1. the `in-flight` and `done` items' `dispatched` placeholders gain the locator half;
2. the field table's `dispatched` row uses the locator wording from root `CLAUDE.md:23`, not
   `docs/mission-list.md:41`'s wording — the acceptance criterion forbids dropping the locator, and
   the table is the definition of the field.

Proposed replacement body (keep the surrounding paragraphs at :202-203 and :209 unchanged):

````markdown
An H1 carrying the goal in one line, then one item per mission:

```markdown
# <the goal, one line>

- item: <the mission, one line of prose>
  status: todo

- item: <the mission>
  status: in-flight
  dispatched: <what went out and to whom, and where its output was to land>

- item: <the mission>
  status: done
  dispatched: <what went out and to whom, and where its output was to land>
  result: <where the outcome landed — a path, or a few lines inline>
```

| field | content | written |
|---|---|---|
| `item` | the mission — one line of prose, hints and facts | at creation |
| `status` | `todo` \| `in-flight` \| `done` | on change |
| `dispatched` | what went out and to whom, and **where the output was to land** | at dispatch |
| `result` | where the outcome landed — a path, or a few lines inline | at close |

Items are identified by their order in the file; nothing depends on a stable ID. Fields appear in
the order above and absent fields are simply absent — a `todo` item has no `dispatched`, an
`in-flight` item has no `result`.
````

That is ~25 lines and preserves `M` and `P`, the two facts that otherwise die with the file.
`next.skeleton.md` already contains fenced blocks (```bash at :15), so a nested ```markdown fence
is not a new construct on these surfaces.

**Do not delete `next.skeleton.md:232-242` or `:244-255`** — the write moments and the resume rule
are pinned by `nx-mission-list` and `nx-resume-rule` and are the surviving single wording.

### 4.2 `templates/routing/required-blocks.js` — re-pin `nx-mission-list`

At **:84**, replace `'docs/mission-list.md',` with tokens that pin the inlined shape. Suggested:

```js
      'mission-list.md',
      'status: todo',
      'in-flight',
      'nothing depends on a stable ID',
      'absent fields are simply absent',
      'before the work goes',
      'dispatched: self',
      'mission, not a specification',
```

Rationale: the block's job is to make the shape undeletable on all 6 surfaces. Pinning
`'nothing depends on a stable ID'` and `'absent fields are simply absent'` is what makes the inline
load-bearing rather than decorative — without them a later edit can strip the two unique facts and
stay green. Update the block's leading comment (:72-77) to say the shape is carried here, not
pointed at.

### 4.3 Delete `docs/mission-list.md`

Verified the issue's premise: `docs/decisions/0017-the-mission-list.md` already carries the origin
story (**:41**, the usage-limit wipe), the design and field table (**:57-100**), mission-not-spec
(**:79-89**), concurrency-carries-no-machinery (**:90-100**), what-is-retired (**:102**), and R3 the
sink (**:171**). What is *not* in the ADR and must land in `next.skeleton.md` first is the fenced
example, `M`, and `P` — covered by 4.1.

**Deletion order matters.** Land 4.1 + 4.2 + every call site in Part 3 in the same commit as the
deletion; `test-route-reachability.js:156` and `:805` red the instant either half lands alone.

### 4.4 The other four wordings — scope call for the lead

The issue's acceptance line reads *"The mission-list format has **one** wording, in
`templates/routing/`"*. Taken literally that also demands collapsing `README.md:894-942`,
`docs/architecture.md:30-55`, `docs/decisions/0017:57-100`, and root `CLAUDE.md:14-35` — four sites
the issue's own call-site list does not mention.

**Recommended reading, and why:** `CLAUDE.md`'s *one rule, one wording* governs **prompt surfaces and
generated templates** — *"A rule, or a generated template, has exactly one wording, and every runtime
reads it. A runtime is a rendering target, never an authoring surface."* README, `docs/architecture.md`
and the ADR are reference documentation, not rendering targets, and an ADR is a historical record that
must not be rewritten to match a later state. So:

- **In scope (prompt surfaces):** `next.skeleton.md`, `init.skeleton.md` — collapse per 4.5.
- **In scope (this repo's always-in-context instructions):** root `CLAUDE.md:14-35` — keep the field
  table (it is the only site binding the locator to the field definition), remove the pointer at
  :11 and the Documentation Map entry at :191.
- **Out of scope for collapsing, in scope for the dead pointer:** `README.md`, `docs/architecture.md`,
  `docs/api.md`, `docs/workflow-state-contract.md`, `docs/conventions.md`, `docs/README.md` —
  fix every reference to the deleted path, and fix `README.md:910`'s inconsistent placeholder.
  Do not rewrite their prose.
- **Untouched:** `docs/decisions/0017-the-mission-list.md`. It is the design of record.

If the lead wants the literal reading instead, that is a materially larger diff across four more
files and should be said out loud rather than absorbed.

### 4.5 THE DESIGN QUESTION — init's copy: **restatement, declared in `required-blocks.js`**

**Recommendation: collapse by RESTATEMENT, with the divergence declared as a new `in-mission-list`
block in `templates/routing/required-blocks.js`. Do NOT use a `REGION` marker, and do NOT add a
pointer of any kind.**

Four measured reasons:

1. **A pointer is already mechanically impossible.** `scripts/validate-workflow-contracts.js:470-471`
   (and its plugin twin) positively pins the KW-CLAUDE-TEMPLATE region to contain
   `['mission-list.md', '`item`', '`status`', '`dispatched`', '`result`', 'Three write moments',
   'the list minus done minus in-flight']`, asserted over both `commands/workflow-init.md` and
   `templates/routing/init.skeleton.md`, scoped between the `<!-- KW-CLAUDE-TEMPLATE-START/END -->`
   markers with an explicit non-vacuity assert. No pointer sentence satisfies that token set.
   Restatement is forced by an existing armed guard, not only by design taste.

2. **`REGION` is the wrong construct.** Measured at `scripts/generate-routing-surfaces.js:167-178`:
   a region's condition matches `surface_type` or `forge` — it expresses **command-vs-skill variance
   within one skeleton**, nothing else. To wrap init's restatement you would need
   `<!-- REGION:command,skill — … -->`, which `condMatches` evaluates to always-true: a no-op wrapper
   whose only function is to smuggle a justification string. It would pass
   `test-generate-routing-surfaces.js:711-792` (the REGION-REASON guard requires a reason and proves
   no reason reaches a shipped surface), but it would tell a reader "this text is in both lanes",
   which says nothing about init-vs-next. A declaration that misdescribes itself is worse than none.

3. **`required-blocks.js` is the project's own declaration surface for exactly this.** Every block
   already carries a leading comment giving its derivation (`nx-mission-list` at :72-77,
   `nx-resume-rule` at :92-95). There is already an init-topic precedent:
   `in-consent-in-conversation` at **:50-58**. The file is authoring-side only — it ships nowhere and
   renders nowhere, so the declaration costs a consumer zero bytes. And the declaration is
   **machine-enforced**: `test-route-reachability.js :: checkManifest` computes the obligated surface
   set from `topic + tags`, so obligating 4-of-6 init surfaces by omission is structurally impossible.

4. **An HTML comment is the actively wrong answer.** Plain comments pass through the generator
   verbatim (`<!-- PIN: … -->` renders into every surface — measured, count 1 in
   `commands/workflow-init.md`). A comment placed inside KW-CLAUDE-TEMPLATE is copied into the
   consumer's `CLAUDE.md`, violating *keep provenance out of agent-facing prompts*; placed outside it,
   it still renders onto 6 shipped prompt surfaces. Regions are stripped; plain comments are not.

**Concrete edits:**

**(a) `templates/routing/init.skeleton.md:155`** — add the locator. Reuse `next.skeleton.md:238-239`'s
exact clause so init's sentence is a strict subset, never a paraphrase:

> `- Three write moments, and they are the whole discipline: write the item at creation; write `dispatched` and flip to `in-flight` BEFORE the work goes out, naming **where the output was to land** — that locator is what makes recovery possible at all; write `result` and flip to `done` at close. Writing `dispatched` afterwards is the failure the file exists to prevent.`

This is the criterion *"No wording of the format drops the `dispatched` locator"* and it repairs the
read/write asymmetry with :177 measured in Part 2.

**(b) `templates/routing/required-blocks.js`** — add, immediately after `in-consent-in-conversation`
(:58):

```js
  {
    // The consumer's CLAUDE.md is the one artifact loaded in EVERY session of the
    // repo the workflow was installed into; the next surface loads only when the
    // command is invoked, and its text is not addressable from a consumer repo at
    // all — it lives in the installed command/skill tree, not in the repo. So the
    // format is RESTATED here rather than pointed at. This restatement is a
    // declared subset of the next skeleton's wording: every sentence below appears
    // verbatim in next.skeleton.md, shortened by omission and never rephrased. A
    // pointer of any kind is the defect this block exists to prevent.
    block_id: 'in-mission-list',
    topic: 'init',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      'kaola-workflow/{project}/mission-list.md',
      'Three write moments',
      'BEFORE the work goes out',
      'where the output was to land',
      'the list minus done minus in-flight',
      'mission, not a specification',
    ],
  },
```

**(c) The subset rule, stated once as the acceptance test:** every format sentence in the
KW-CLAUDE-TEMPLATE region must appear verbatim (whitespace-normalized) in `next.skeleton.md`.
Currently true after edit (a) for the locator clause, the frontier clause (:157 vs :219-220), and the
mission-not-spec clause (:156 vs :209-213); the resume clauses (:176-177 vs :246-255) are already
shortened-by-omission subsets. Nothing else in the region states the format.

**(d) `templates/routing/init.skeleton.md:316-319`** (the skill-only `### How a run is coordinated`
block). It names only the file path and the four field names — no write moments, no locator. It is
already inside a declared region (`<!-- REGION:skill — … -->`, :228-342) whose stated reason is about
Codex profile install, so the format restatement rides along inside a region justified by something
else. **Recommend: delete lines 316-319's format sentence**, leaving the section's other content.
It is the one restatement with no reader who is not already served — a Codex init SKILL reader also
receives the KW-CLAUDE-TEMPLATE region, three screens earlier in the same file. Removing it costs
nothing and drops the copy count from 7 to 6. (Check: no pin depends on it — `required-blocks.js`
has no init block naming it, and `validate-workflow-contracts.js`'s init assertions are all scoped
to the KW-CLAUDE-TEMPLATE region.)

**(e) Step 4 scaffold list stays exactly as it is** — no `docs/mission-list.md` line. This is an
explicit acceptance criterion and the mirror-image of the bug.

---

## Part 5 — The second instance: `docs/workflow-state-contract.md`

**Verified.** `commands/workflow-init.md:178` (skeleton `templates/routing/init.skeleton.md:198`),
inside the KW-CLAUDE-TEMPLATE Documentation Map at :170-180:

```
- `docs/workflow-state-contract.md` — detailed durable state and generated mirror contract.
```

- Not in the Step 4 scaffold list (`commands/workflow-init.md:277-288`) — confirmed.
- Not shipped: install manifest has zero `docs/` entries; `plugins/kaola-workflow/` has no `docs/`.
- The file exists in this repo at 374 lines.

**One correction to the issue's framing:** it says *"Every other entry in that map is a file Step 4
creates."* Not quite — root `README.md` (:172) is also not in the scaffold tree. The difference is
that a real repo already has a README, whereas `docs/workflow-state-contract.md` is a Kaola-internal
document that will never spontaneously exist in a consumer repo. The substance of the claim holds.

**Recommendation: DROP THE LINE** (delete `init.skeleton.md:198`, regenerate).

1. Scaffolding it would mean authoring a durable-state contract into every consumer's `docs/`. This
   repo's copy is 374 lines of Kaola-internal detail; a consumer-appropriate version would be a new
   template maintained forever.
2. It would grow the Step 4 scaffold list with a workflow-internal document — the same move the issue
   explicitly forbids for `docs/mission-list.md`, on the same reasoning: *the format does not belong
   in a consumer's `docs/`.* Applying the rule to one path and not its twin, in the same change,
   is the inconsistency the issue was filed against.
3. The consumer already gets the contract's operative content as four bullets in the same template —
   `init.skeleton.md:172-175`: ROADMAP is generated, `.roadmap/` is not purged, active work lives in
   `kaola-workflow/{project}/`, roadmap sessions vs. workflow runs. That is what a consumer needs.

Note: `docs/workflow-state-contract.md` stays in `SELF_HOST_TEST_CONSUMED` — the file is not being
deleted, only unlisted from the consumer template.

---

## Part 6 — Regeneration and verification

Surfaces render from `templates/routing/*.skeleton.md` + `slots.js` + `splices` via
`scripts/generate-routing-surfaces.js`. Never edit a rendered surface.

```bash
cd /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-888-889-890-892-893-894-895

# 1. Regenerate the 18 tracked surfaces
node scripts/generate-routing-surfaces.js --write     # expect: rendered 18 surfaces.
node scripts/generate-routing-surfaces.js --check     # expect: all 18 surfaces byte-match the skeleton.

# 2. The guards that touch this change, individually and fast
node scripts/test-route-reachability.js
node scripts/validate-workflow-contracts.js
node scripts/test-generate-routing-surfaces.js
node scripts/test-ledger-compare.js
node scripts/edition-sync.js --check                  # adaptive-schema byte-identity across 4 editions

# 3. Prove the pointer is gone from every tracked surface (expect NO output)
git grep -n "docs/mission-list" -- . ':!kaola-workflow/archive' ':!kaola-workflow/.origin' ':!CHANGELOG.md'

# 4. The additive runtime editions — NOT in npm test; regenerate and prove them too
node scripts/sync-opencode-edition.js --write
node scripts/sync-kimi-edition.js --write
node scripts/test-opencode-edition.js
node scripts/test-kimi-edition.js
# then, from the MAIN checkout where the trees live (expect NO output):
grep -rn "docs/mission-list" /Users/ylpromax5/Workspace/Kaola-Workflow/.opencode \
  /Users/ylpromax5/Workspace/Kaola-Workflow/.opencode-gitlab \
  /Users/ylpromax5/Workspace/Kaola-Workflow/.opencode-gitea \
  /Users/ylpromax5/Workspace/Kaola-Workflow/.kimi \
  /Users/ylpromax5/Workspace/Kaola-Workflow/.kimi-gitlab \
  /Users/ylpromax5/Workspace/Kaola-Workflow/.kimi-gitea
```

**Chain scope: all four.** The diff touches `kaola-workflow-adaptive-schema.js` (×4 copies) and the
plugin twins, which is edition-touching by definition. `npm test` runs
`test:kaola-workflow:{claude,codex,gitlab,gitea}`. Per the recorded gotcha, pass
`--project bundle-888-889-890-892-893-894-895` to `run-chains.js` when the run will be finalized, and
set `KAOLA_RUN_CHAINS_CONCURRENCY=serial` on this box.

**The fast gate samples.** `test:kaola-workflow:claude` runs
`simulate-workflow-walkthrough.js --shard auto/12`. Run `node scripts/simulate-workflow-walkthrough.js`
at full scope before calling the suite verified.

**Mutation proof owed.** The new `in-mission-list` block and the re-pinned `nx-mission-list` tokens
are guards; a green suite is not proof either is armed. Prove each on a scratch mirror (never
`git checkout --`): delete the locator clause from `init.skeleton.md:155` → `test-route-reachability.js`
must red; delete `nothing depends on a stable ID` from `next.skeleton.md` → must red.

---

## Open / unmeasured

- **Whether the lead wants the literal or the scoped reading of the one-wording acceptance criterion**
  (4.4). Unmeasurable from here — a values call, four extra files either way.
- **Whether `scripts/validate-kaola-workflow-contracts.js:304`'s historical citation should be
  re-pointed** (call site #22). It describes a past state accurately; re-pointing it would make the
  comment describe something #882 did not do.
- **Consumer-repo acceptance** — *"Initializing a fresh repo with no `docs/` reports nothing missing"*
  was not executed. It needs a scratch repo, an `install.sh`, and a `/workflow-init` run, which is a
  write-side action outside this read-only role. Recommend it be dispatched as its own item after
  the edits land; it is the only check that measures the reading site rather than the authoring site,
  which is the entire point of the issue.

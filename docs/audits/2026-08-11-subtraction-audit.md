# Subtraction audit — `scripts/` and `docs/`, 2026-08-11

Report-only. **No cut is applied by this audit.** Each accepted finding escalates as its own
follow-up, because the decision to remove working capability is not the auditor's to take.

Measured at `483a5e5e` (v9.6.0) plus this bundle's working tree. Three readers: one over `scripts/`,
two independently over `docs/`. The second docs reader was kept deliberately — where the two agree,
the finding is corroborated by separate measurement; where they disagree, the disagreement is
recorded below and resolved on evidence.

## What the filed premise got wrong, and what the audit is instead

The issue directed this audit at a "24% byte-identical duplication" figure. Re-measured over all 167
`.js` files across `scripts/` and `plugins/*/scripts/` (10,406,933 bytes, capture proven complete at
167 = 167): **23.3% of bytes, 26.3% of files.** The number holds. Its conclusion does not.

```
all redundant bytes:      2,421,305  (23.3% of tree)
edition-port redundancy:  2,417,612  (23.2%)
NON-PORT redundancy:          3,693  ( 0.04%)
```

23.2 of those 23.3 points are the four-edition port structure — load-bearing, guarded by
`edition-sync.js --check`, and named in `CLAUDE.md` as the cross-edition drift anchor. No duplicate
file lives twice inside one tree. The single differing-basename group is a rename-normalized forge
port. **Genuine copy-paste duplication in this tree is effectively zero**, so duplication was struck
from the finding classes before any reader opened a file. An audit that filed `delete:` against those
25 duplicate groups would have been filing against the architecture.

Two further corrections to the brief: `scripts/` is **82** files (81 `.js` + 1 `.json`), not 84; and
the real script surface is **167** once `plugins/*/scripts/` is counted, so a `scripts/`-only audit
sees 48% of it.

**Ranking rule, which the issue did not specify.** Findings rank by **canonical lines**, with the
port multiplier stated separately. One line cut from a ported file is cut ×3 or ×4 downstream, so
ranking by shipped lines would let portedness decide the order instead of merit. F5 below is the
worked example: ×4 ported, it would sort 4th by shipped lines and 5th by canonical — and it deletes
nothing at all.

## Prerequisite established: the test-consumed doc set

No doc may be called deletable until this is known. Both docs readers arrived at it independently and
agreed exactly — **three docs**, declared at `SELF_HOST_TEST_CONSUMED`
(`scripts/kaola-workflow-adaptive-schema.js`) and `TEST_CONSUMED_PATHS`
(`scripts/kaola-workflow-validation-runner.js`):

| doc | consequence |
|---|---|
| `docs/api.md` | editing it stales the chain receipt |
| `docs/workflow-state-contract.md` | same |
| `docs/agents-source.md` | same |

Two findings below land inside test-consumed docs and are marked; they are not freely deletable.

## Findings — `scripts/`

Ranked by canonical lines. Total **643 canonical / 667 shipped**.

| rank | id | class | finding | canonical | ×N |
|---:|---|---|---|---:|---|
| 1 | S1 | `yagni:` | `run-chain-pool.js` — a within-chain step pool with no chain, no CLI and no installer caller; its only consumer is the test that exists to test it, and its shard registry is empty | 428 | ×1 |
| 2 | S2 | `delete:` | `fixtures-orphan-legality.js` — a shared anti-drift fixture whose two importers were both deleted; 8 of 8 exports unreferenced | 102 | ×1 |
| 3 | S3 | `yagni:` | three dead `transformCommandBody` strips across both sync scripts (Path Intent, Codex-note, `Step 0a-1`) — all three match nothing today, and removing all three renders byte-identical output | 87 | ×1 |
| 4 | S4 | `yagni:` | `runtime-edition-forge.js` — the `--commands-dir` and `--forges` CLI modes have no caller anywhere | 14 | ×1 |
| 5 | S5 | rot | 8 comment lines naming the deleted `plan-validator.js`; **0 net deletable** — corrective, not subtractive | 8 | ×4 |
| 6 | S6 | `yagni:` | two self-declared "legacy alias" exports and one dead constant, all with zero consumers | 4 | ×1 |

**S3 corroborates a finding routed in from the #954 premise pass** — the Codex-note strip
(`sync-opencode-edition.js`, `sync-kimi-edition.js`) matches nothing and no edition suite observes
it. The audit measured two siblings in the same shape and proved the stronger claim: removing all
three leaves rendered output byte-identical.

**`native:` and `stdlib:` came up EMPTY**, and the measurement says why rather than the class being
skipped: the repo declares no Node version floor, so "a built-in now covers this" cannot be asserted
without inventing a target. That is a finding about the absent floor, not about the helpers.

## Findings — `docs/`

| id | class | finding | net lines | note |
|---|---|---|---:|---|
| D1 | `yagni:` | `docs/conventions.md:281-293` documents `FEATURE_TOKENS` in `test-agent-profile-parity.js` **and tells the reader to add tokens to it**; the constant was removed at `523f1241` (the #881–#885 audit), which took the code and left the instructions | 9–13 | **highest-value docs finding**; positive control: `CONFIG_HOOKS_FAMILY`, named twelve lines later, still resolves 6× |
| D2 | `yagni:` | `docs/README.md:17` sells the opencode edition on a per-role model/effort mapping that was **removed, not deprecated** | 1 | found independently by both readers |
| D3 | `yagni:` | `docs/kimi-edition.md` credits the rendering to a function that was deleted | 2–3 | found independently by both readers |
| D4 | `yagni:` | `docs/api.md` attributes behaviour to a function that never existed | 2 | **test-consumed doc** |
| D5 | `shrink:` | `LANE_STALENESS_MS = 86400000` restated in three live docs rather than pointed at | 2 | **two sites in a test-consumed doc** |
| D6 | `shrink:` | the Codex model/effort pair restated in `docs/api.md:1535-1538` and `docs/conventions.md:45-47`, neither copy bound to its source (`kaola-workflow-codex-preflight.js:89-92`) | 7 | **mutation-proven**; see below |
| D7 | `shrink:` | `docs/opencode-edition.md` re-types the reasoning-tier roster the generator derives | 3 | |
| D8 | `shrink:` | `docs/architecture.md` inlines `PARKED_LANE_PREFIXES`'s values without naming it | 1 | |
| D9 | `yagni:` | `docs/architecture.md:295-297` says opencode/kimi are not wired into "the routing-surface propagation **set**" — false as written, and the false half is the half with a behavioural consequence | 1 | **third by value**; operationally proven |
| D10 | `yagni:` | `docs/architecture.md:287` says four forge editions ship "against a different forge CLI" — measured, four trees call **three** CLIs | 1 | blast radius measured at one live line |

**D9 is a one-word defect with a real cost.** Split into sub-claims and measured individually, three
of the four hold: opencode/kimi are genuinely absent from `npm test`, `edition-sync.js` and
`install.sh`. The fourth does not. The generator writes 3 topics × 6 dirs = 18 surfaces and neither
`.opencode` nor `.kimi` is among them — so the doc is right about *render targets* — but both sync
scripts **derive their command list from that registry**, and the code says the precise thing ("the
six routing surfaces") where the doc generalized it to "the propagation set". Proven operationally
for opencode: `--check` clean at exit 0, append one comment line to `commands/workflow-next.md`,
`--check` exits 1 with "`.opencode/command/workflow-next.md` — stale — regenerate". Negative control:
`commandSources` returns 0 for `classifier.js` and `sink-merge.js`.

The consequence is why this ranks above findings with fifty times the line count: **a reader who
believes the current sentence edits a routing skeleton and never regenerates the opencode tree.**

The kimi leg of that A/B carries **no signal and is reported as carrying none** — `.kimi` is
untracked, so `sync-kimi-edition.js --check` is red in both legs and the diff is empty. Kimi's
coupling rests on the direct `listCanonCommands()` measurement alone, which is weaker evidence.

**D10 was filed narrowly, and it corrects an assumption made earlier in this run.** The finding is
*not* "four editions is wrong". Measured by which forge CLI each tree actually calls: canonical `gh`
127, Codex `gh` 64 / `glab` 0 / `tea` 0, gitlab `glab` 34, gitea `tea` 41 — four trees, **three**
CLIs. The Codex tree calls the same `gh` as canonical, so its axis is runtime, not forge, and the
false clause is "against a different forge CLI". Positive control: the method finds `glab` only in
the gitlab tree and `tea` only in gitea.

Blast radius was measured rather than assumed, and the assumption it overturns was made in this run:
`four forge edition` appears in exactly three places outside the archive — `CHANGELOG.md` (history),
`docs/decisions/D-530-02.md` (history), and `docs/architecture.md:287`, **the only live doc**. The
load-bearing repo-wide vocabulary is the *different* phrase "four editions" (`CLAUDE.md`, `api.md`,
`conventions.md`, ~20 ADRs), which dropping one word from that single line does not touch.

**D6 was independently confirmed three times in this run, from three directions**, and it is the
clearest example of what this audit is for. The docs reader found it as a restated constant and
**mutation-proved** it: setting both doc copies to `gpt-4o-mini`/`low` leaves the fast gate exit 0,
while a positive control in the same file (`raise **seven**` → `**five**`) reds
`test-forge-finalize-findings.js` — so the runner is not blind and the file is not unread; one claim
is bound to its source and the other was copied. The #955 adversarial reviewer found the same fact as
a *wrong pointer*. And the audit reader caught a third instance mid-flight, in this bundle's own
in-progress `docs/architecture.md` rewrite.

That third catch matters, because the first two repairs were **both wrong about the source**. There
is no single source: the pair sits as four named constants
(`CODEX_STANDARD_MODEL` / `CODEX_STANDARD_EFFORT` / `CODEX_REASONING_MODEL` /
`CODEX_REASONING_EFFORT`) in `kaola-workflow-codex-preflight.js:89-92`, **and** as typed literals in
the dispatch-routing pin of `templates/routing/next.skeleton.md` and `finalize.skeleton.md` — which
is what actually ships to the SKILL surfaces, across 22 carrier files in all.

**And the two are bound**, which sharpens the finding rather than dissolving it.
`test-route-reachability.js:530-545` builds its expected efforts directly from
`codexPreflight.CODEX_STANDARD_EFFORT` / `CODEX_REASONING_EFFORT` and asserts every shipped Codex
SKILL states the matching one, over an obligated universe it computes rather than hand-lists — its
own comment says the binding exists "so the prose and the validator cannot drift apart" — and
`validate-kaola-workflow-contracts.js:444-452` cross-binds preflight to the installer's copies. It
runs in the fast gate. Worth knowing precisely: that check pins the **effort** and accepts any model
string (`model: "[^"]+"`), so a model change is caught by the contract validator, not by the prose
check.

So D6 is not "nobody binds this fact". It is: **the repo binds this fact in every prose surface it
ships, and the two `docs/` copies are the sole exception.** The mutation proof already showed it and
was under-read at the time — with both docs stating `gpt-4o-mini`/`low`, `test-route-reachability.js`
still exits 0, because it reads the constants and the SKILL prose and never opens a doc. The binding
mechanism exists, runs today, and is about nine lines.

`docs/architecture.md` now states this correctly; **`docs/api.md:1535-1538` and
`docs/conventions.md:45-47` remain unrepaired** and are what escalates. A follow-up must not be sent
to `adaptive-schema.js` for this pair — it is not there.

**`delete:` is EMPTY for `docs/`, and this is where the two readers disagreed.** Both found ~26 docs
with zero inbound references. The second reader filed them as a 3,831-line `delete:` finding (its own
first figure, 3,940, was a hand-summed total it corrected by measuring). That is
**rejected**: all of them live under `docs/decisions/` or `docs/investigations/`, which
`docs/README.md` indexes *as directories* while stating the retention policy explicitly — "they
remain accurate as history and as rationale for machinery that still ships". Filing against them
would be filing against a stated retention decision, not against waste. The brief's own criterion
("not indexed by `docs/README.md`") is not met: they are indexed, by directory.

`stdlib:` and `native:` are structurally inapplicable to Markdown and are recorded empty, not padded.

## Method notes — three traps, each of which nearly shipped a wrong answer

Recorded because every one produced a clean, plausible, **wrong** number, and each was caught only by
a control rather than by inspection.

1. **A truncated capture reads as a complete one.** The first duplication measurement died partway
   (`xargs: command line cannot be assembled, too long`), returned 82 of 167 files, and would have
   reported **0.2%** — killing the audit's premise in the wrong direction. Caught by asserting
   captured-lines == expected-files. This is the failure `scripts/measure-validator-duplication.js`
   exists to document, and it recurred anyway.
2. **A basename is not a stem.** The first `scripts/` reference sweep searched `run-chain-pool.js` and
   reported zero consumers; the real consumer is `require('./run-chain-pool')`, no extension. Every
   sweep was re-run on the stem. **A basename-anchored search is not a zero-consumer search.**
3. **An unquoted variable silently matches nothing.** The first docs reachability sweep reported all
   198 docs as zero-inbound, including `docs/api.md`. `git grep -- $ROOTS` under zsh passes the whole
   root list as one pathspec, so every hit count was a silent 0. Caught by a positive control that
   demanded known inbound links appear.

A fourth, from the same family, hit the review layer rather than the audit: a repo-wide grep piped
through `head -10` dropped its remaining hits, and a true citation was briefly recorded as fabricated.

4. **A path named in a test is not a doc the test reads.** `docs/architecture.md` and
   `docs/decisions/D-547-01.md` appear in `test-validation-allowband.js`, which looks like
   consumption and is not: they are arguments to a path-*shape* predicate, and their bytes are never
   read, so those assertions survive the files' deletion. The same shape appears in
   `templates/routing/init.skeleton.md`, which names `docs/README.md` as the *consumer project's*
   scaffold rather than this repo's. The test-consumed set was therefore established twice — from the
   declared constants, and by running the shipped `isValidationInvisible` predicate over all 198 docs
   (195 invisible) — and both methods returned the same three files.

**One process hazard, recorded so it is not repeated.** A read-only auditor started a traced
`npm test` inside the shared worktree while other agents were editing it. The chain opens with
`edition-sync.js --materialize-kernel`, which **writes**. It was killed and the tree verified
undamaged, and all later execution ran in disposable clones. A read-only measurement must never run a
suite in a tree that other agents are writing to — the suite is not read-only even when the auditor
is.

Two structural blind spots apply to every `delete:` finding here and were handled explicitly:
`grep` on this box is ugrep and **skips dot-directories**, and the six rendered edition trees are
gitignored so `git grep` cannot see them at all. Each zero-consumer search therefore ran in two parts
— `git grep -P` over the tracked tree plus an explicit `find` sweep over all six dot-edition trees.

## What was excluded, and why

- The four-edition port structure, including `kaola-workflow-adaptive-schema.js`'s ×4 byte-identity —
  it is the cross-edition drift anchor, not redundancy.
- ADR 0017's "built once, removed, recoverable" rows — the register of record for deliberately
  unbuilt mechanisms.
- `kaola-workflow/archive/**`.
- Test files on their own merits. **Test custody holds**: a finding on a test names the mechanism
  whose removal takes it. S1 and S2 each name the test that dies with the mechanism; neither proposes
  deleting a test ahead of the thing it tests.

## Hypotheses checked and CLEARED — recorded so they are not re-derived

The retired-machinery sweep was run against six candidates and **five came back clean**. That the same
method over the same eight docs produced D1, D3 and D7 is what makes these clears credible rather than
merely unfound.

| candidate | verdict |
|---|---|
| the consent valve | **not stale.** What was deleted is the ***durable*** valve, and every live text naming the deletion says "durable"; `dirty_tree_refused` is live in `claim.js`, and "the consent valve" is the code's own vocabulary in five places. |
| `--profile` | **not stale.** The single hit names Codex's *own* launch override, inside a sentence about what the doctor cannot see. |
| the model badge (#949) | zero hits. |
| `issue-scout` | the role is gone, and both surviving hits are *about* its absence. |
| the DAG / node-id era | every live mention sits inside an explicit removal record. |

## Open

- The `native:` class cannot be measured until the project declares a Node version floor.
- D1's block was measured at 9 and 13 net deletable lines by the two readers; the discrepancy is in
  how much surrounding prose survives the removal, and should be settled when that finding is cut.

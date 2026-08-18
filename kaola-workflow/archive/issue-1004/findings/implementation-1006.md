# implementation-1006 — the premise-check standing default, and its 14-surface propagation

**Task**: implement #1006 — add a fourth standing-default paragraph to the canonical axiom layer,
re-scope the intro sentence that mis-covers the standing paragraphs, and propagate to all fourteen
surfaces that embed the canonical block byte-for-byte.

**Verification tier**: `tests-green` — the authored guard `testAxiomBlockByteIdentity` (custody:
another role; read and run here, never written) passes at its full 14-surface width, alongside the
generator check, both contract/reachability validators, and the harness self-check.

**Worktree**: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-1004`
(base `e82adb6d`, clean at start). **Nothing was committed** — the orchestrator commits.

---

## 1. The final paragraph text, verbatim

Written as one unwrapped line in `templates/axioms.md`, between the tie-breaker protocol and
`**Dispatch production; keep decisions:**`:

```
**Check the premise before it shapes the work:** an issue is a claim recorded earlier against a tree that has since moved, so establish what is true *now* at the place it points and let the measurement rather than the filed text decide what gets built. The usual outcome is neither *right* nor *wrong* but right-with-a-detail-that-misroutes — a stale locator, a miscounted set, a clause that breaks if executed literally — so carry the measurement forward, never a bare verdict. Where the two disagree the issue gets corrected, not quietly worked around. Nothing inspects that you did this.
```

### Colon, not period — the reconciliation the brief asked for

The issue's non-binding draft ended the bolded lede with a **period**. The file does not do that for
standing paragraphs: all three siblings (`**Tie-breaker protocol:**`, `**Dispatch production; keep
decisions:**`, `**Parallel by default:**`) use a **colon followed by a lowercase continuation**, and
the period-after-lede form belongs exclusively to the five *numbered* axioms. Since the whole point
of the placement decision is that this is a standing default and not a sixth axiom, adopting the
axioms' punctuation would have visually filed it with the numbered list it is deliberately not part
of. **I chose the colon**, and lowercased the following word (`an issue is a claim…`) to match.

### The four required claims, each still present

| claim | where it survives |
|---|---|
| measure now | "establish what is true *now* at the place it points" |
| carry the measurement, not a verdict | "carry the measurement forward, never a bare verdict" |
| the issue gets corrected on disagreement | "Where the two disagree the issue gets corrected, not quietly worked around" |
| nothing inspects that you did it | "Nothing inspects that you did this." |

Other deltas from the draft are voice-fit only: its first two sentences were joined with "so" (each
sibling paragraph opens with a single long clause-chained sentence rather than two short ones); "not
*right* or *wrong*" became "neither *right* nor *wrong*"; and the draft's "let the measurement rather
than the filed text decide what gets built" was folded into that joined opening sentence instead of
standing alone. Provenance-free: no issue numbers, no dates, no "as of", no history.

## 2. The final intro text, verbatim (`templates/axioms.md:3`)

Before:

```
These are the workflow's tie-breaking axioms, applied in priority order whenever a situation is not already settled.
```

After:

```
The numbered axioms are tie-breakers, applied in priority order whenever a situation is not already settled; the paragraphs that follow them are standing defaults that hold whether or not anything else settles the case.
```

One sentence in, one sentence out — no inflation. It now names two scopes rather than one: the
numbered list keeps the "only when nothing else settles it" condition, and the paragraphs after it are
explicitly *not* conditioned on that. Left as it was, a reader applying the sentence literally would
have reached the new paragraph only when nothing else settled the case, which is the exact inverse of
a standing default. Note this also un-breaks the two pre-existing standing paragraphs, which the old
sentence mis-scoped silently; the new one is what made it load-bearing.

`README.md:22` still reads "It is codified as **five** first-principles axioms" — checked, and still
true: the axiom count is unchanged at five. No edit needed there.

## 3. Files changed, and why

Eleven files, three classes.

**Authored by hand (4):**

| file | why |
|---|---|
| `templates/axioms.md` | the canonical source: +1 paragraph, intro re-scoped. 15 → 17 lines |
| `templates/routing/init.skeleton.md` | hand-inlines the canonical text at `:134`; still a hand-inline, **not** converted to a splice (D-645-01 §2) |
| `CLAUDE.md` | hand-maintained embed of the canonical block; `--write` does not touch it |
| `README.md` | hand-maintained embed of the canonical block; `--write` does not touch it |

**Regenerated by `node scripts/generate-routing-surfaces.js --write` (6 tracked init surfaces), never hand-edited:**

- `commands/workflow-init.md`
- `plugins/kaola-workflow-gitlab/commands/workflow-init.md`
- `plugins/kaola-workflow-gitea/commands/workflow-init.md`
- `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md`
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md`
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md`

**Documentation (1):** `CHANGELOG.md` — a new entry at the head of `[Unreleased] / ### Added`.

`git diff --stat`, final:

```
 CHANGELOG.md                                       | 42 ++++++++++++++++++++++
 CLAUDE.md                                          |  4 ++-
 README.md                                          |  4 ++-
 commands/workflow-init.md                          |  4 ++-
 .../kaola-workflow-gitea/commands/workflow-init.md |  4 ++-
 .../skills/kaola-workflow-init/SKILL.md            |  4 ++-
 .../commands/workflow-init.md                      |  4 ++-
 .../skills/kaola-workflow-init/SKILL.md            |  4 ++-
 .../skills/kaola-workflow-init/SKILL.md            |  4 ++-
 templates/axioms.md                                |  4 ++-
 templates/routing/init.skeleton.md                 |  4 ++-
 11 files changed, 72 insertions(+), 10 deletions(-)
```

Every one of the ten prose surfaces shows the identical `4 ++-` shape: one line replaced (the intro),
two added (blank + paragraph). Method: the replacement was performed as a **single whole-block
substitution** built from the live `templates/axioms.md` bytes, applied to each of the four
hand-maintained files, with a pre-check asserting the old block occurred exactly once in each. Byte
identity is therefore true by construction, not by retyping.

## 4. CLAUDE.md and README.md were hand-updated — confirmed, and independently checked

Both were edited by hand in the same whole-block substitution; `--write` cannot reach them and did
not. Beyond the authored guard, I ran an **independent** sweep that reads `templates/axioms.md` off
disk and asserts `includes()` on every embedding file, including the six gitignored edition renders
the guard only renders in memory:

```
OK    CLAUDE.md
OK    README.md
OK    templates/routing/init.skeleton.md
OK    commands/workflow-init.md
OK    plugins/kaola-workflow-gitlab/commands/workflow-init.md
OK    plugins/kaola-workflow-gitea/commands/workflow-init.md
OK    plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md
OK    plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md
OK    plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md
OK    (main root) .opencode/command/workflow-init.md
OK    (main root) .opencode-gitlab/command/workflow-init.md
OK    (main root) .opencode-gitea/command/workflow-init.md
OK    (main root) .kimi/skills/workflow-init/SKILL.md
OK    (main root) .kimi-gitlab/skills/workflow-init/SKILL.md
OK    (main root) .kimi-gitea/skills/workflow-init/SKILL.md
stale=0   exit 0
```

All 14 guarded surfaces agree, and so do the 6 on-disk edition renders (which overlap the guard's
in-memory six).

## 5. The five exit codes

Run from the worktree, each `$?` read directly and never after a pipe.

| # | command | before | after |
|---|---|---|---|
| 1 | `node scripts/simulate-workflow-walkthrough.js --only testAxiomBlockByteIdentity` | `PASSED (14 surfaces)`, **0** | `PASSED (14 surfaces)`, **0** |
| 2 | `node scripts/generate-routing-surfaces.js --check` | `all 18 surfaces byte-match the skeleton`, **0** | `all 18 surfaces byte-match the skeleton`, **0** |
| 3 | `node scripts/validate-workflow-contracts.js` | **0** | `Workflow contract validation passed`, **0** |
| 4 | `node scripts/test-route-reachability.js` | **0** | `Route-reachability test passed (368 assertions).`, **0** |
| 5 | `node scripts/simulate-workflow-walkthrough.js --only testHarnessSelfCheck` | **0** | `testHarnessSelfCheck: PASSED`, **0** |

Final combined line, one process each: `axiom=0 gen=0 contracts=0 reach=0 harness=0`.

**Nothing red.**

Command 1 was run **by name**, not as part of a chain, so the 1/12 walkthrough shard could not silently
skip it — the `PASSED (14 surfaces)` line is the scenario's own output.

`git diff` confirms the six tracked init surfaces genuinely moved (they are six of the eleven modified
paths above, each `4 ++-`); `--check` alone would have been satisfied by a no-op.

## 6. Edition trees present, and one thing the orchestrator should know

`--write` reported:

```
sync-opencode-edition: refreshed 3 present tree(s): .opencode, .opencode-gitlab, .opencode-gitea.
sync-kimi-edition:     refreshed 3 present tree(s): .kimi, .kimi-gitlab, .kimi-gitea.
```

All six were present — but **not in this worktree**. The worktree has none (they are gitignored, so a
fresh worktree never has them); the six live in the **main root**
`/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow`, and the script said so itself:

> `sync-opencode-edition: NOTE — 3 change(s) in a checkout that is not this one.`
> `… now render THIS checkout's canonical sources … including anything uncommitted here.`

So the main root's six edition trees now carry this branch's **uncommitted** axiom block. They are
gitignored and appear in no diff. This is the documented behaviour of `--write`, not a defect, but it
means the main root's edition trees are ahead of `main` until this lands. If the orchestrator wants
them back on `main`'s content, re-run `--write` from the main root after the sink.

`--check` deliberately does not read those trees, which is why command 2 is unaffected either way.

## 7. Line count

`CLAUDE.md`: **195 → 197 lines** (+2, exactly as forecast). The 200-line cap has been advisory since
2026-08-12 and cannot fail a build at any size, so **nothing was contorted, trimmed or deleted to fit
it** — no other section of `CLAUDE.md` was touched at all.

`templates/axioms.md`: 15 → 17. `README.md`: 1607 → 1609.

## 8. The CHANGELOG entry

Head of `[Unreleased] / ### Added`, ahead of the #1001 entry (newest-first, matching how #1005 sits at
the head of `### Fixed`). It carries, in the neighbours' dense measurement-forward voice: the 62/406
and 19/20 incidence; the two grep hits being one sentence rendered twice that obliges *reporting* a
dead premise and nothing to look for one; why this is a standing default rather than a sixth axiom
(numbering it would condition it on the absence of a rule); the 15-of-52 verdict-line figure with the
three quoted verdicts; the three instances from this run itself (3 call sites vs 12 across 4 copies;
archive figure 15 vs 16 filed; a day-of-month read as a duration, 22 days claimed vs 12 days 20
hours); that the intro was re-scoped and that leaving it would have inverted the paragraph; that the
refusal count stays zero and no mechanism was added; and the propagation cost, 14 surfaces of which
two are hand-maintained.

## 9. What I deliberately did not do

- **Did not touch `scripts/simulate-workflow-walkthrough.js`.** Read it (the guard is at `:11421`) and
  ran it by name. It needs no change: `NAMED_SURFACES` and the `+ 2` literal in the width floor are
  about the *set* of surfaces, and this issue changes the block's *content*, not the set.
- **Did not convert the `init.skeleton.md` hand-inline into a splice.** D-645-01 §2 makes the embed
  deliberate; the brief forbids it explicitly.
- **Did not hand-edit any rendered surface.** All six moved via `--write`.
- **Added no mechanism of any kind** — no standard location, filename or schema for the premise
  artifact, no gate, no evidence line, no close-time check, no `required-blocks.js` entry, no new
  `test-route-reachability.js` obligation. The issue rules the measured scatter watch-list material,
  and "derive additively" refuses a mechanism justified by *the agent might file it untidily*. The
  refusal count for this stays **zero**.
- **Did not add a `next`-surface pointer.** D-645-01 §3 put a pointer paragraph on the six `next`
  surfaces for the tie-breaker and tighten-only rules; extending it to this paragraph would be a new
  `required-blocks.js` obligation across six more surfaces, which is scope the issue does not grant.
  Flagging it as a judgement call, not doing it.
- **Did not run `npm test` or `kaola-workflow-run-chains.js`**, and did not commit or `git add`. The
  diff is edition-touching (six rendered edition surfaces are byte-derived from the moved skeleton),
  so the orchestrator should expect the four-chain fail-closed path at finalize.
- **Did not touch `docs/decisions/D-645-01.md`.** Its §2 says the block is embedded in "all six
  workflow-init CLAUDE.md-template surfaces" — a count that predates both the additive editions and
  the #1005 convergence of the two repo-root prose surfaces, so it is already stale at 6 where the
  guard now checks 14. That is pre-existing, outside my write set, and unrelated to this paragraph.
  **Reporting it as a finding, not fixing it.**

## 10. Verification-tier honesty

`tests-green` is the tier, but the authored guard verifies **byte identity across surfaces**, not that
the sentence is the right sentence. No automated check can — and by the paragraph's own last line,
none is supposed to. The prose judgement (voice fit, the colon reconciliation, the intro re-scope
wording) is mine and is the part that wants a human read.

# Investigation: Is root `CLAUDE.md`'s `## First Principles` divergence a deliberate condensation for the 200-line cap, or accumulated drift?

Read-only archaeology for issue #1005. No tracked file was modified. No `.kw/worktrees/` path was
read or written. Only read-only git (`log`, `show`, `rev-list`, `merge-base`, `rev-parse`,
`cat-file`-equivalent `show`) plus two read-only Node checks were run.

### Setup

- Repo root: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow`
- Commit: `3380cafe48108509cc76f0f02f19c563b5d4ea88` on `main`
- `git status --porcelain` → `?? kaola-workflow/issue-1004/` only (this run's own folder)
- `wc -l CLAUDE.md templates/axioms.md AGENTS.md` → `198 / 15 / 20`
- Scratch workspace (not in the repo):
  `/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/78702dee-4f41-433d-a4c1-d211e999da70/scratchpad`

---

## Q1 — When did each divergence enter?

### The instrument

`git log --follow -p` and `git log -L` are **both insufficient here** and I say so before resting
anything on them. `git log -L 52,64:CLAUDE.md` returns only three commits:

```
$ git log -L 52,64:CLAUDE.md --format='COMMIT %h %ad %s' --date=short | grep '^COMMIT'
COMMIT c0b48043 2026-07-31 docs(claude): rewrite CLAUDE.md onto the mission list; remove the banner
COMMIT 06d22d35 2026-07-09 docs: refresh CLAUDE workflow-init wording
COMMIT 4739b19a 2026-06-17 docs: codify CI/CD-not-a-required-gate independence principle (#501)
```

It **misses `e2669641`** (a real edit inside the block on 2026-07-29) because the paragraph that
commit rewrote was later deleted, so it no longer occupies lines 52-64. The line-range walk would
have produced a two-commit story that is wrong.

So the primary instrument is a full-history walk that, for **every** commit touching either file,
extracts the CLAUDE.md `## First Principles` block, strips trailing blanks, and hashes it against
`templates/axioms.md` at that same commit. Script:
`<scratchpad>/walk.sh` (reproduced verbatim at the end of this section).

```
$ bash <scratchpad>/walk.sh <scratchpad>
06d22d35 2026-07-09 | ax=2863abe1 cm=2863abe1 | AGREE  | CLAUDElines=141 | docs: refresh CLAUDE workflow-init wording
f6dbf40d 2026-07-17 | ax=2863abe1 cm=2863abe1 | AGREE  | CLAUDElines=143 | feat: add additive Kimi Code runtime edition ...
1146e3ac 2026-07-19 | ax=2863abe1 cm=2863abe1 | AGREE  | CLAUDElines=142 | feat: retire fast/full paths ...
d4bf9e65 2026-07-20 | ax=2863abe1 cm=2863abe1 | AGREE  | CLAUDElines=143 | feat: receipt diet for run-chains ...
2a48342c 2026-07-20 | ax=2863abe1 cm=2863abe1 | AGREE  | CLAUDElines=143 | feat: guard dedup ...
31faef2c 2026-07-22 | ax=2863abe1 cm=2863abe1 | AGREE  | CLAUDElines=153 | docs(principles): adopt Parallel by Default; Serial Requires Evidence in README Philosophy + CLAUDE.md design principles
ad196273 2026-07-22 | ax=ea71ecad cm=2863abe1 | DIFFER | CLAUDElines=153 | docs(principle): propagate Parallel by Default / Serial Requires Evidence to axioms template (+6 init embeds), ...
e99ba2a5 2026-07-24 | ax=ea71ecad cm=2863abe1 | DIFFER | CLAUDElines=153 | feat(cutover): planner authors plan_form: spine always ...
7c4422e8 2026-07-24 | ax=ea71ecad cm=2863abe1 | DIFFER | CLAUDElines=153 | chore(cleanup): retire the KAOLA_PATH ...
1f227bd2 2026-07-24 | ax=2c6d63b0 cm=2863abe1 | DIFFER | CLAUDElines=154 | docs(principles): add the "Dispatch Production, Keep Decisions" standing principle (#784)
   ... 17 commits, block unchanged on both sides ...
ffa822e1 2026-07-29 | ax=2c6d63b0 cm=2863abe1 | DIFFER | CLAUDElines=198 | docs: derive, never reduce ...
e2669641 2026-07-29 | ax=2c6d63b0 cm=de56e814 | DIFFER | CLAUDElines=198 | docs: the axioms cut both ways; ambiguity routes rather than stops
   ... 9 commits, block unchanged on both sides ...
c110754c 2026-07-31 | ax=2c6d63b0 cm=de56e814 | DIFFER | CLAUDElines=198 | ADR 0016 campaign execution + ADR 0017 (the mission list) accepted
c0b48043 2026-07-31 | ax=2c6d63b0 cm=c4bf04a1 | DIFFER | CLAUDElines=205 | docs(claude): rewrite CLAUDE.md onto the mission list; remove the banner
2c95a7ab 2026-07-31 | ax=cd9636b3 cm=c4bf04a1 | DIFFER | CLAUDElines=205 | refactor(claim): the claim record stops carrying the deleted plan's shadow
95c4a38f 2026-07-31 | ax=cd9636b3 cm=c4bf04a1 | DIFFER | CLAUDElines=198 | docs(claude): fit CLAUDE.md inside its own 200-line contract
   ... 8 commits to HEAD, both sides unchanged ...
25054b07 2026-08-16 | ax=cd9636b3 cm=c4bf04a1 | DIFFER | CLAUDElines=198 | feat: the forge is the backlog ...
```

Confirmed against HEAD (so no transition is unaccounted for):

```
$ git show HEAD:CLAUDE.md | awk '/^## First Principles$/{f=1;print;next} f&&/^## /{exit} f{print}' | <strip trailing blanks> | shasum
c4bf04a15962cf82e9ac340e719c04087885ff04  -
$ git show HEAD:templates/axioms.md | <strip trailing blanks> | shasum
cd9636b31a70ae297e269ae3785dae5323978bab  -
```

**Every hash transition on both sides is attributed.** Canonical moved three times
(`ad196273`, `1f227bd2`, `2c95a7ab`); the root block moved twice (`e2669641`, `c0b48043`).

### The single most important structural fact

```
$ comm -12 <(git log --format='%H' -- CLAUDE.md | sort) \
           <(git log --format='%H' -- templates/axioms.md | sort) \
  | while read h; do git log -1 --format='%h %ad %s' --date=short $h; done
1f227bd2 2026-07-24 docs(principles): add the "Dispatch Production, Keep Decisions" standing principle (#784)
```

**In the entire history of this repository, exactly ONE commit ever touched both files.** And in
that one commit, the CLAUDE.md edit did not land in the axiom block — it landed as a bullet in
`§ Maximize Workflow Efficiency by Faithful Decomposition`, in different words (shown under
divergence 2 below).

### Divergence-by-divergence attribution

| # | divergence | introduced by | date | also touched `templates/axioms.md`? |
|---|---|---|---|---|
| A | intro `not already **settled**` (canon) vs `not already **resolved by a rule**` (root) | **both sides moved**: root at `c0b48043`, canon at `2c95a7ab`, **10 minutes apart** | 2026-07-31 15:46:25 / 15:56:17 | `c0b48043`: **NO**. `2c95a7ab`: yes (canonical only) |
| B | axiom 4 (root adds the consent-valve sentence, drops "leave everything checkable") | `c0b48043` for root; `2c95a7ab` independently rewrote canon's axiom 4 | 2026-07-31 15:46:25 / 15:56:17 | `c0b48043`: **NO** |
| C | axiom 5 adds "This says do not outsource the judgement — it does not say a door must slam." | `c0b48043` | 2026-07-31 15:46:25 | **NO** |
| D1 | Tie-breaker protocol absent from root block | `c0b48043` (dropped in the rewrite) | 2026-07-31 15:46:25 | **NO** |
| D2 | *Dispatch production; keep decisions* absent from root block | **`1f227bd2`** — canon gained it, root's block never did | 2026-07-24 19:10:17 | **YES** — the one commit touching both; it put a *different* sentence in a *different* CLAUDE.md section |
| D3 | *Parallel by default* absent from root block | **`ad196273`** — canon gained it, root's block never did | 2026-07-22 17:46:42 | **YES to axioms.md; CLAUDE.md not in the commit at all** |

Supporting evidence for each.

**A / B / C — one commit, `c0b48043`, authored all three:**

```
$ git show c0b48043 -- CLAUDE.md | grep -n '^+' | grep -iE 'First Principles|Machines decide|Own your own|Tie-break|consent valve|door must slam'
129:+## First Principles
132:+Tie-breaking axioms, applied in priority order whenever a situation is not already resolved by a rule.
141:+4. **Machines decide facts; humans decide values.** Irreversible and value-laden calls belong to the
142:+   user: ask, in conversation, before taking one. There is no durable consent valve; that sentence is
144:+5. **Own your own verdicts.** Never let a system the workflow does not own (CI, an external service)
145:+   be the judge of done. This says do not outsource the judgement — it does not say a door must slam.
```

It is the sole introducer of every distinctive root phrase:

```
$ git log --format='%h %ad %s' --date=short -S'not already resolved by a rule'
c0b48043 2026-07-31 docs(claude): rewrite CLAUDE.md onto the mission list; remove the banner
$ git log --format='%h %ad %s' --date=short -S'There is no durable consent valve'
c0b48043 2026-07-31 docs(claude): rewrite CLAUDE.md onto the mission list; remove the banner
$ git log --format='%h %ad %s' --date=short -S'do not outsource the judgement'
c0b48043 2026-07-31 docs(claude): rewrite CLAUDE.md onto the mission list; remove the banner
```

And it touched **no** canonical or embed surface:

```
$ git show c0b48043 --name-only --format='' | grep '^templates/'
(NONE)
$ git show c0b48043 --name-only --format='' | grep -E 'workflow-init'
(NONE)
```

**The mirror-image commit, 10 minutes later, moved canonical the other way** — and did *not* touch
`CLAUDE.md`:

```
$ git show 2c95a7ab -- templates/axioms.md
-These are the workflow's tie-breaking axioms, applied in priority order whenever a situation is not already resolved by a specific rule, gate, or refusal.
+These are the workflow's tie-breaking axioms, applied in priority order whenever a situation is not already settled.
...
-4. **Machines decide facts; humans decide values.** Route irreversible or value-laden calls to the consent valve; leave everything checkable to run automatically.
+4. **Machines decide facts; humans decide values.** Take irreversible and value-laden calls to the user and ask, in conversation; leave everything checkable to run automatically.
...
-**Tie-breaker protocol:** when no shipped rule covers a situation, ... in the node's evidence file. This derivation is optional — its absence never blocks a gate.
-
-**Tighten-only boundary:** an axiom may only make an agent stricter, never looser. ...
+**Tie-breaker protocol:** when nothing else covers a situation, ... alongside the work. Recording it is useful and never required.
...
-**Parallel by default:** ... requires present-tense, checkable evidence — a named data dependency ...
+**Parallel by default:** concurrency is the standing default for independent work, and work that genuinely feeds other work runs in order because it has to. ...

$ git show 2c95a7ab --name-only --format='' | grep -x 'CLAUDE.md'
(NO — CLAUDE.md not in 2c95a7ab)
```

Both edits were driven by the **same** underlying design change (the consent valve was deleted in
that campaign). Neither references the other. Axiom 4 was rewritten **twice, independently, ten
minutes apart, into two files, with two different results.**

**D3 — `ad196273` is the first divergence in the file's history.** It propagated to nineteen files
and root `CLAUDE.md` was not among them:

```
$ git show ad196273 --stat --format='' | tail -3
 templates/axioms.md                                                | 2 ++
 templates/routing/plan-run.skeleton.md                             | 7 +++++++
 19 files changed, 71 insertions(+), 5 deletions(-)
```

Eighteen minutes earlier, `31faef2c` had put the *same principle* into `CLAUDE.md` — as a `###`
subsection under `## Workflow Design Principles`, in ~10 lines of different prose (S1/S2/S3
serializer taxonomy), not into the axiom block:

```
$ git show 31faef2c -- CLAUDE.md
+### Parallel by Default; Serial Requires Evidence
+
+Concurrency is the standing default for any frontier. Holding work serial is a positive claim that must cite **present-tense, checkable evidence** for a named serializer — never a guess, anticipation, or prediction:
+
+- **S1 — data dependency**: name the concrete artifact one unit consumes from another ("name it or co-open").
...
```

**D2 — `1f227bd2`, the only both-files commit, split the wording on purpose.** Its own message
enumerates the propagation set, and the root axiom block is not in it:

```
$ git show 1f227bd2 --format='%B' -s
docs(principles): add the "Dispatch Production, Keep Decisions" standing principle (#784)

One bullet in CLAUDE.md § Maximize Workflow Efficiency by Faithful
Decomposition, and a one-sentence sibling in templates/axioms.md (propagated
byte-identically to the six workflow-init embeds across the Claude/Codex/GitLab/
Gitea editions — enforced by the walkthrough's testAxiomBlockByteIdentity):
...
Change is exactly: CLAUDE.md (+1 bullet), templates/axioms.md (+1 sentence),
and the six init embeds.
```

The CLAUDE.md half landed here:

```
$ git show 1f227bd2 -- CLAUDE.md | tail -6
@@ -42,6 +42,7 @@ The objective is **minimum makespan and minimum wasted work at fixed correctness
+- **Dispatch production; keep decisions.** The orchestrator's context is the run's scarcest resource — a handoff costs once, inline residue taxes every later decision — so delegating discretionary production is the default, and what stays inline is the deciding itself. Weigh these economics per case with your own judgment; no justifier, evidence line, or approval attaches to the choice.
```

**One further root-only edit the issue does not mention** — `e2669641` (2026-07-29) replaced the
block's **Tighten-only boundary** paragraph with a longer **Gate boundary** paragraph in
`CLAUDE.md` only, while canonical still carried *Tighten-only*. Canonical later deleted the
paragraph entirely (`2c95a7ab`) and `c0b48043` deleted the root's replacement, so both are gone
today — but it is a fourth independent movement of the block, and it moved *away* from canonical
while the file sat at exactly 198 lines.

### The walk script, verbatim

```bash
#!/bin/bash
SP="$1"
cd /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow || exit 9
for c in $(git rev-list --reverse 06d22d35^..HEAD -- CLAUDE.md templates/axioms.md); do
  short=$(git log -1 --format='%h %ad' --date=short "$c")
  subj=$(git log -1 --format='%s' "$c")
  git show "$c:templates/axioms.md" 2>/dev/null > "$SP/a.md" || echo "(missing)" > "$SP/a.md"
  git show "$c:CLAUDE.md" 2>/dev/null | awk '/^## First Principles$/{f=1;print;next} f&&/^## /{exit} f{print}' > "$SP/b.md"
  awk '{lines[NR]=$0} END{last=NR; while(last>0 && lines[last]=="") last--; for(i=1;i<=last;i++) print lines[i]}' "$SP/a.md" > "$SP/a2.md"
  awk '{lines[NR]=$0} END{last=NR; while(last>0 && lines[last]=="") last--; for(i=1;i<=last;i++) print lines[i]}' "$SP/b.md" > "$SP/b2.md"
  ah=$(shasum "$SP/a2.md" | cut -c1-8); bh=$(shasum "$SP/b2.md" | cut -c1-8)
  cl=$(git show "$c:CLAUDE.md" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$ah" = "$bh" ]; then st="AGREE"; else st="DIFFER"; fi
  printf '%s | ax=%s cm=%s | %s | CLAUDElines=%s | %s\n' "$short" "$ah" "$bh" "$st" "$cl" "$subj"
done
```

---

## Q2 — Which came first, and did they ever agree?

### They agreed. For 22 days.

`templates/axioms.md` is **older**, by nineteen hours:

```
$ git log --format='%h %ad %s' --date=short --diff-filter=A -- templates/axioms.md
9e79cad8 2026-07-09 kw-leg: n4-axiom
$ git log -1 --format='%h author:%ad' --date=iso 9e79cad8
9e79cad8 author:2026-07-09 02:13:11 +0800

$ git log --format='%h %ad %s' --date=short -S'## First Principles' -- CLAUDE.md
06d22d35 2026-07-09 docs: refresh CLAUDE workflow-init wording
$ git log -1 --format='%h %ad' --date=iso 06d22d35
06d22d35 2026-07-09 21:07:03 +0800

$ git merge-base --is-ancestor 9e79cad8 06d22d35; echo "EXIT:$?"   # canon is ancestor
EXIT:0
$ git merge-base --is-ancestor 06d22d35 9e79cad8; echo "EXIT:$?"   # not the reverse
EXIT:1
```

At `06d22d35` the root block was **byte-identical** to canonical:

```
$ git show 06d22d35:templates/axioms.md > $SP/axioms_at_06d22d35.md
$ git show 06d22d35:CLAUDE.md | awk '/^## First Principles$/{f=1} f&&/^## Workflow Design Principles$/{exit} f{print}' > $SP/claude_block_at_06d22d35.md
$ diff $SP/axioms_at_06d22d35.md $SP/claude_block_at_06d22d35.md
13a14
>
DIFF_EXIT:1
```

The only difference is the blank separator line my extraction picks up before the next `##`
heading — i.e. **the content matched byte-for-byte.**

They **last agreed at `31faef2c` (2026-07-22 17:28:55)** and broke eighteen minutes later at
`ad196273` (17:46:42), by omission from a propagation set.

### So: extraction, or written alongside?

**Neither, precisely — and this is the crux the issue asked me to settle.** It was not an extraction
that left the original behind (canonical did not come out of `CLAUDE.md`; canonical existed first
and `CLAUDE.md` had no axiom block at all before it). It was a **same-day copy-in to a file the
design never listed as a consumer.**

The design's declared consumer set, from the founding CHANGELOG entry for #645
(`CHANGELOG.md:3604`):

> Design choice: reach consumers by EMBEDDING the identical block into the **six workflow-init
> CLAUDE.md-template surfaces (3 Claude commands + 3 Codex SKILL packs)** rather than per-edition
> file copies … the drift guard is instead a new `simulate-workflow-walkthrough.js` scenario
> (`testAxiomBlockByteIdentity`) asserting `templates/axioms.md` opens with `## First Principles`
> and is embedded byte-identically in all six surfaces.

And from the founding implementation leg, `kaola-workflow/archive/bundle-645-646/.cache/n4-axiom.md`:

> Inserted the identical `## First Principles` block into **all six workflow-init surfaces** … Same
> anchor, same content, byte-for-byte, in all six files.
> `git status --short` confirms exactly these seven paths changed, nothing else.

Root `CLAUDE.md` is in neither list. The block arrived there nineteen hours later, in a commit
titled *"docs: refresh CLAUDE workflow-init wording"* whose diff also rewrote five unrelated
sections — a copy made while editing prose about workflow-init, into a file no propagation
mechanism was ever pointed at.

**Verdict for Q2: they agreed once, from 2026-07-09 21:07 to 2026-07-22 17:46. The break was an
omission from a propagation set, not a decision.**

---

## Q3 — Is there contemporaneous evidence of intent?

I searched the added phrases across the working tree, all of `git log -S`, `CHANGELOG.md`,
`docs/decisions/`, and every archived run under `kaola-workflow/archive/*/`.

### What exists

**One genuine intent record, and it is for axiom 5 only.** The added clause "it does not say a door
must slam" was authored in the #877 design spec *four days before* it reached `CLAUDE.md`:

```
$ git grep -n 'door must slam' -- .
CLAUDE.md:64:   be the judge of done. This says do not outsource the judgement — it does not say a door must slam.
kaola-workflow/archive/issue-877/step3-extraction-spec.md:85:be the judge of done; it does not say a door must slam. We still compute our own verdict from our
```

In context (`step3-extraction-spec.md:84-86`):

> This is not a weakening of First Principle 5. That principle says never let a system we do not own
> be the judge of done; it does not say a door must slam. We still compute our own verdict from our
> own chains — we hand it to the party accountable for the result instead of enforcing it against them.

That is a **gloss written to defend a design change against an axiom** — a rebuttal argument
promoted into the axiom's own text. It is deliberate authorship. It is not a condensation, and it
says nothing about `templates/axioms.md`.

**The CHANGELOG documents the two-place, two-wording landing — without ever noticing the block.**

`CHANGELOG.md:3278` (Parallel by Default): *"Stated in the README Philosophy and CLAUDE.md Workflow
Design Principles now … Propagated 2026-07-22 to the agent-facing surfaces: `templates/axioms.md`
gains a **Parallel by default** paragraph mirrored byte-identically into its six workflow-init
embeds."*

`CHANGELOG.md:3281` (Dispatch Production): *"One bullet added to `CLAUDE.md` § Maximize Workflow
Efficiency and a mirroring sentence in `templates/axioms.md`, propagated byte-identically to the six
`workflow-init` embeds."*

Both entries treat `CLAUDE.md` and the axiom layer as **two separate destinations with separately
authored prose**. Neither entry, nor `CHANGELOG.md:2839` (the #877 mission-list entry that carries
`c0b48043`), mentions the root `CLAUDE.md` axiom block, the 200-line cap as a reason to shorten it,
or a decision to let the two wordings differ.

### What does not exist

```
$ grep -rn -i 'condens' CHANGELOG.md docs/ kaola-workflow/archive/ | grep -i 'claude.md\|axiom\|first principle'
```
→ three hits, **none** about the axiom block: two are about condensing `## Key Scripts` /
`### Nothing refuses` for the line budget, one about a CHANGELOG edit.

```
$ grep -rn 'axioms.md' kaola-workflow/archive/ docs/ CHANGELOG.md | grep -i 'CLAUDE.md'
```
→ five hits, all about the **workflow-init CLAUDE.md *template*** (the generated consumer surface),
none about the repository's own root `CLAUDE.md`.

`docs/decisions/D-645-01.md` and `docs/conventions.md § First Principles axiom layer (#645)` both
describe the consumer set as the twelve workflow-init surfaces. Neither mentions root `CLAUDE.md`.

**Conclusion for Q3:** there is contemporaneous evidence of *deliberate authorship* for axiom 5's
added clause (and, by the same campaign's design work, for axiom 4's consent-valve sentence — the
valve really was deleted that day). There is **zero** contemporaneous evidence anywhere in the repo
that anyone considered the root block a copy of canonical, that anyone decided the two may differ,
or that the 200-line cap motivated dropping the three paragraphs.

---

## Q4 — Does the line-budget motive hold up arithmetically?

### Was the cap even a forcing function then?

**Yes — and this cuts *for* the hypothesis, so it must be said first.** The project memory's rule
("the cap is a RECOMMENDATION that can never fail a build") is **true today and false on
2026-07-31**. At `c0b48043` the check was a hard assert that reds the whole contracts validator:

```
$ git show c0b48043:scripts/validate-workflow-contracts.js | grep -n '200-line target'
342:assert(read('CLAUDE.md').split(/\r?\n/).length < 200, 'CLAUDE.md must stay below the 200-line target');
```

It became advisory only on **2026-08-12**, at `e4522be9` *"change: CLAUDE.md length recommends and
notifies, and can no longer fail a build"* — twelve days after every divergence had already landed.
Current form, `scripts/validate-workflow-contracts.js:347-348`, writes a `notice:` to stderr.

### Line count at each divergence

```
$ for c in ad196273 1f227bd2 e2669641 c0b48043 2c95a7ab 95c4a38f; do ... done
ad196273 2026-07-22  beforeLines=153  afterLines=153
1f227bd2 2026-07-24  beforeLines=153  afterLines=154
e2669641 2026-07-29  beforeLines=198  afterLines=198
c0b48043 2026-07-31  beforeLines=198  afterLines=205
2c95a7ab 2026-07-31  beforeLines=205  afterLines=205
95c4a38f 2026-07-31  beforeLines=198  afterLines=198   (205 → 198)
```

Effective ceiling is **198 by `wc -l`** (the assert splits on newlines and counts the trailing empty
element — recorded independently in `kaola-workflow/archive/bundle-963-964-966/mission-list.md:21`).

**Divergences D3 (2026-07-22) and D2 (2026-07-24) were introduced at 153 and 153 lines — 45 lines
of headroom.** There was no budget pressure whatsoever. The line-budget explanation **fails outright
for the two paragraphs that went missing first.**

**Divergences A/B/C/D1 (`c0b48043`, 2026-07-31) were introduced by a commit that took the file from
198 to 205 — i.e. it *breached* the hard cap** rather than respecting it. Budget pressure existed,
and the commit ignored it.

### The decisive leg: the one commit authored *for* the cap did not touch the block

Twenty-three minutes later, `95c4a38f` — *"docs(claude): fit CLAUDE.md inside its own 200-line
contract"*, message body: *"The contract validator asserts it, and the rewrite came in at 205"* —
cut 205 → 198. Its hunk headers:

```
$ git show 95c4a38f -- CLAUDE.md | grep -n -E '^@@'
15:@@ -38,15 +38,15 @@ ...
36:@@ -89,10 +89,9 @@ ...
50:@@ -102,9 +101,8 @@ ...
62:@@ -118,15 +116,14 @@ ...
82:@@ -155,9 +152,7 @@ ...
93:@@ -167,9 +162,8 @@ ...
105:@@ -179,7 +173,7 @@ ...
114:@@ -188,18 +182,17 @@ ...
```

`## First Principles` appears in that diff **only as trailing context** of the first hunk:

```
 - Active work lives in `kaola-workflow/{project}/`; those active folders are the run inventory a
   successor reads first, and stay until archived or safely discarded.

 ## First Principles
```

The seven lines came out of the Durable State Contract bullets, `### Concurrency carries no
machinery`, and the sections below. **Not one line inside the axiom block was touched by the only
commit in this repository's history that was explicitly authored to satisfy the 200-line cap.**

The same behaviour repeats later. `kaola-workflow/archive/bundle-900-901-902-903/mission-list.md:196`
records a run that hit **zero headroom** at 198 and had to evict content to add a rule. What it
chose to cut: *"(1) merged the two `### Nothing refuses` paragraphs … (2) condensed `## Key Scripts`
… (3) folded the new rule into the EXISTING pointer bullet"* — explicitly *"none deleting a rule"*.
The axiom block was never a candidate.

### The direction test: the edits ADD

The issue's arithmetic objection is measurable and it is correct.

```
canon intro : 117 chars      root intro : 103 chars    (−14)
canon ax4   : 179 chars      root ax4   : 224 chars    (+45)
canon ax5   : 123 chars      root ax5   : 203 chars    (+80)
```

Axioms 4 and 5 are **125 characters longer** in the file that is supposedly being squeezed.

The one place the budget argument has real arithmetic is the three missing paragraphs: they are 947
characters, and at `CLAUDE.md`'s wrap width (max observed line length 108) they cost **13 lines**.

```
$ sed -n '11,15p' templates/axioms.md | wc -lc
       5     947
$ sed -n '11,15p' templates/axioms.md | fold -s -w 100 | wc -l
      13
```

Restoring them at `c0b48043` would have given 218 against a hard ceiling of 198. So a
budget-shaped constraint was genuinely operating on *that* omission — but only there, only on
2026-07-31, and only for content that was **not lost**: two of the three were re-authored into the
same file, 26 lines further down.

```
$ grep -n -A6 '### Concurrency carries no machinery' CLAUDE.md
90:### Concurrency carries no machinery
92-No disjointness check, no antichain sweep, no serializer taxonomy, no evidence line, no fan-out cap.
...
96-**Dispatch production; keep decisions.** Your context is the run's scarcest resource, so delegating
```

The third — the tie-breaker protocol's *record a one-line derivation* instruction — has **no home
anywhere in `CLAUDE.md`**:

```
$ grep -n -i 'derivation' CLAUDE.md
11:derivation, not the format; the format is the table below. ...
85:Subtractive derivation asks *"may I remove this?"* ...
86:Additive derivation asks *"what forced this to exist?"* ...
```

Three hits, none of them the protocol.

---

## Q5 — Are there other unguarded wordings?

The guard's surface set is 12 and is real — I ran it:

```
$ node scripts/simulate-workflow-walkthrough.js --only testAxiomBlockByteIdentity
testAxiomBlockByteIdentity: PASSED (12 surfaces)
Walkthrough --only subset passed (1 scenarios)
$ node scripts/simulate-workflow-walkthrough.js --only testAxiomBlockByteIdentity > /dev/null 2>&1; echo "EXIT:$?"
EXIT:0
```

Six tracked (`commands/workflow-init.md` + the two forge command twins + the three
`kaola-workflow-init/SKILL.md` packs) and six rendered in memory from
`sync-opencode-edition.js` / `sync-kimi-edition.js` (the `.opencode*` / `.kimi*` trees are
gitignored).

Full sweep of every tracked, non-archive file carrying the axiom prose:

```
$ for p in 'Correct first' 'Then save human time' 'Then spend as little as possible' \
           'Machines decide facts' 'Own your own verdicts'; do
    git ls-files -z | xargs -0 grep -l -- "$p" | grep -v '^kaola-workflow/archive/'; done
```

| location | kind | matches canonical byte-for-byte? |
|---|---|---|
| `templates/axioms.md` | **canonical** | — |
| `commands/workflow-init.md` + 5 sibling init surfaces (tracked) | guarded embeds | **YES** (guard PASSED, 12 surfaces) |
| `.opencode*/command/workflow-init.md`, `.kimi*/skills/workflow-init/SKILL.md` (untracked, 6) | guarded embeds, rendered | **YES** (same guard) |
| `templates/routing/init.skeleton.md` | hand-maintained copy | **YES today** — see below |
| **`CLAUDE.md:52-64`** | **third wording** | **NO** — 4 differences |
| **`README.md:22-28`** | **FOURTH wording — the issue does not know about it** | **NO** — 3 differences |
| `docs/conventions.md:846-852` | parenthetical paraphrase, not the block | n/a |
| `commands/workflow-next.md` + 5 `next` surfaces | provenance-free pointer (`nx-first-principles`) | n/a |
| `scripts/kaola-workflow-claim.js:1184` (+ gitlab/gitea hand-ports) | axiom-4 headline quoted in a code comment | n/a |

### `templates/routing/init.skeleton.md` — a copy, but **not** a hole

```
$ awk '/^## First Principles/{f=1} f{print} f&&/Parallel by default/{exit}' templates/routing/init.skeleton.md > $SP/skel.md
$ diff templates/axioms.md $SP/skel.md; echo "DIFF_EXIT:$?"
DIFF_EXIT:0
```

It is transitively pinned: the skeleton renders the six tracked surfaces, the surfaces are asserted
byte-equal to their render, and the render is asserted to contain canonical.

```
$ node scripts/generate-routing-surfaces.js --check; echo "EXIT:$?"
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
EXIT:0
```

Skeleton drift with no regeneration reds `--check`; skeleton drift *with* regeneration reds
`testAxiomBlockByteIdentity`. Either way it is caught. **I would not count this as an unguarded
wording** — contrary to the issue's framing of it as "a second copy" standing outside the guard.

### `README.md` — the fourth wording, unguarded, user-facing

```
$ diff <(sed -n '5,9p' templates/axioms.md) <(sed -n '24,28p' README.md)
1c1
< 1. **Correct first.** ... rework is the most expensive outcome.
---
> 1. **Correct first.** ... rework is the most expensive outcome there is.
4,5c4,5
< 4. **Machines decide facts; humans decide values.** Take irreversible and value-laden calls to the user and ask, in conversation; leave everything checkable to run automatically.
< 5. **Own your own verdicts.** Never let a system the workflow does not own (CI, an external service) be the judge of done.
---
> 4. **Machines decide facts; humans decide values.** Irreversible or value-laden calls go to you; leave everything checkable to run automatically.
> 5. **Own your own verdicts.** Never let a system the workflow does not own — CI, an external service — be the judge of done.
```

Its intro line **agrees with canonical** ("not already settled") while `CLAUDE.md`'s disagrees, so
the three surfaces are pairwise inconsistent in different places — this is genuinely 3-way, not a
canonical-vs-one-fork.

Its history is different in kind, and worth the distinction:

```
$ git log --format='%h %ad %s' --date=short -S'rework is the most expensive outcome there is' -- README.md
f05f15f7 2026-07-09 docs: refresh README to the shipped v6.21.0 surface
$ git log --format='%h %ad %s' --date=short -S'Irreversible or value-laden calls go to you' -- README.md
bbacd271 2026-07-31 docs: rewrite the documentation set onto the mission list
```

`f05f15f7` is 2026-07-09 **10:36:34** — between canonical's creation (02:13) and the `CLAUDE.md`
copy-in (21:07). README's copy was **never** byte-identical: it shipped with "there is" appended to
axiom 1 and em-dashes in axiom 5 on day one. `bbacd271` (2026-07-31 **15:46:49**, twenty-four
seconds after `c0b48043`) then rewrote its axiom 4 into a *third* independent phrasing of the same
consent-valve deletion.

Note also that `docs/architecture.md` briefly carried the `CLAUDE.md`-style axiom 4 after
`bbacd271` and no longer carries any axiom headline — one more surface that has already churned
through this text.

Root `AGENTS.md` carries no axiom text at all (it is a 20-line pointer to `CLAUDE.md`).

---

## Verdict on the hypothesis

# **MIXED — and the condensation half is narrower than the issue allows.**

The hypothesis under test was: *"The divergence is a deliberate condensation for the 200-line cap,
not accumulated drift."*

**DRIFT (accumulated, by omission from a propagation set) — divergences D2 and D3.**
*Parallel by default* went missing at `ad196273` (2026-07-22) and *Dispatch production; keep
decisions* at `1f227bd2` (2026-07-24), at 153 and 153 lines against a 198-line ceiling — **45 lines
of headroom**. A budget motive is arithmetically impossible for both. `ad196273` did not touch
`CLAUDE.md` at all; `1f227bd2` touched it and put a *different* sentence in a *different* section
while its own commit message enumerated a propagation set that never included the block. The root
cause is structural and measured: **root `CLAUDE.md` was never a declared consumer of the axiom
layer** (`CHANGELOG.md:3604`, `bundle-645-646/.cache/n4-axiom.md`), it acquired the block by an
undeclared same-day copy-in (`06d22d35`), and in the whole history **exactly one commit ever touched
both files.**

**DELIBERATE AUTHORSHIP, but not condensation — divergences B and C (axioms 4 and 5), and A.**
`c0b48043` re-authored these knowingly: axiom 5's added clause was pre-written as a design argument
in `archive/issue-877/step3-extraction-spec.md:85` four days earlier, and axiom 4's consent-valve
sentence records a real deletion made in that campaign. But they are **+45 and +80 characters** —
authorship, not compression. And the deliberateness was about the *content*, not about *diverging*:
canonical was rewritten for the identical reason ten minutes later, in `2c95a7ab`, by a commit that
did not touch `CLAUDE.md` and produced different words. **Two independent rewrites of the same axiom
minutes apart, neither aware of the other.** That is drift in the mechanism even though each edit
was intentional in itself.

**PARTIAL CONDENSATION — divergence D1 only.** The three-paragraph omission at `c0b48043` was made
under a genuinely hard 198-line ceiling, and restoring them costs 13 lines against a file that
already stood at 205. That is real budget pressure. But three measurements bound how much it
explains:
1. `c0b48043` itself **breached** the ceiling (198 → 205), so it was not respecting the budget;
2. `95c4a38f`, the only commit in repo history authored *for* the cap, cut 205 → 198 **without
   touching one line of the block** — it took the lines from the Durable State Contract bullets and
   `### Concurrency carries no machinery` instead;
3. two of the three paragraphs were **re-authored 26 lines further down** in the same file, so the
   content was relocated, not budgeted away. Only the tie-breaker protocol's *record a one-line
   derivation* instruction is genuinely absent from `CLAUDE.md` with no home anywhere in it.

**The issue's own tell is confirmed and is decisive.** The wording differences in axioms 4 and 5 add
125 characters; a line-budget motive does not explain adding. And the budget itself only became a
constraint on 2026-07-29 (198 lines) — a week *after* the first divergence entered at 153.

**One correction to the issue's premise:** root `CLAUDE.md` is the **third** wording only if you
stop counting. `README.md:22-28` is a **fourth**, unguarded, user-facing, and divergent from
canonical in three places including a *different* axiom-4 phrasing than `CLAUDE.md`'s. Conversely
`templates/routing/init.skeleton.md`, which the issue counts as an unguarded copy, is transitively
pinned by two green checks and is byte-identical today.

---

## What I could not establish

- **Whether any human ever intended the root block to be a copy.** No commit message, CHANGELOG
  entry, ADR, or archived run summary anywhere in the repo states a position on the relationship
  between root `CLAUDE.md`'s block and `templates/axioms.md`. The absence is itself the finding —
  it is consistent with the block having been copied in incidentally at `06d22d35` and never
  registered as a consumer — but absence of a record cannot prove absence of an intent that was
  formed in a conversation. Only the user can settle that, and it is a values call, not a
  measurement.
- **The `06d22d35` copy-in's motive.** Its message is *"docs: refresh CLAUDE workflow-init
  wording"* and its diff rewrites five unrelated sections at once. I cannot tell from the record
  whether the author meant to mirror the canonical block or was simply pasting the day's new
  section while editing nearby prose.
- **Whether `git rev-list` pathspec simplification hid a block edit inside a merge.** One merge
  commit (`5d589b35`) appears in the walk. Every observed hash transition on both sides is
  attributed to a non-merge commit and the endpoints match HEAD exactly, so no unattributed change
  exists — but I did not re-run the walk under `--full-history` to prove that independently.
- **Whether the untracked `.opencode*` / `.kimi*` on-disk trees match canonical.** The guard renders
  them in memory rather than reading them; the disk copies were checked by a prior run
  (`archive/bundle-881-882-883-884-885/.cache/doc-claims-audit.md`) and found conformant, but I did
  not re-measure the on-disk files myself.
- **Any remedy.** Out of scope by instruction, and correctly so — which divergences (if any) should
  converge, and in which direction, is a values call about what the root file is *for*.

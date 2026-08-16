# #985 implementation report — the pick step reads the shortlist before claiming

## Task

ADR 0018 §5 item 5 / §8 step 1: before claiming, read each **shortlisted** candidate's body and
comments (not the whole backlog), treating comments as current state where they contradict the body.
Prose-only; no script gains a subcommand; nothing retired; scoped away from #984's roadmap retirement.

## What changed

Premise verified before editing: `git show HEAD:templates/routing/next.skeleton.md | grep -c
"comment\|issue view\|acceptance criteria"` → `0`. The brief's claim was accurate.

### Files changed (git diff --stat)

```
 CHANGELOG.md                                                       | 16 ++++++++++++++++
 commands/workflow-next.md                                          | 10 ++++++++++
 plugins/kaola-workflow-gitea/commands/workflow-next.md             | 12 ++++++++++++
 plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md   | 12 ++++++++++++
 plugins/kaola-workflow-gitlab/commands/workflow-next.md            | 10 ++++++++++
 plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md  | 10 ++++++++++
 plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md         | 10 ++++++++++
 templates/routing/next.skeleton.md                                 | 13 +++++++++++++
 templates/routing/slots.js                                         |  6 ++++++
 9 files changed, 99 insertions(+)
```

- `templates/routing/next.skeleton.md` (+13) — hand-authored source. Inserted between the end of
  Step 2's `nx-watch-run` block and the `## Step 3 — Claim` heading: an intro paragraph, a new
  `REGION:gitea`-gated `nx-scripts-resolver` slot, the new `nx-issue-detail-fetch` splice, and a
  one-line follow-up instructing the reader to repeat the command per shortlisted issue.
- `templates/routing/slots.js` (+6) — one new `SPLICES["nx-issue-detail-fetch"]` entry (github/gitlab
  plain porcelain one-liners; gitea a `node -e` call into `kaola-gitea-forge.js`), plus a 5-line
  comment explaining the per-forge divergence.
- The 6 rendered `next` surfaces (`commands/workflow-next.md` + the 3 forges' command/skill pairs) —
  generated output only, via `node scripts/generate-routing-surfaces.js --write`. No other topic
  (`init`, `finalize`) touched; no `.opencode*`/`.kimi*` tree changed in git (those refreshed on disk
  as part of `--write` but are gitignored, confirmed by `git status --porcelain -uall` showing none).
- `CHANGELOG.md` (+16) — new `## [Unreleased]` / `### Added` section (none existed before this
  change), one entry for #985, matching the house style (bold lead line ending `— #985 (...)`,
  narrative body, provenance/rationale included per CLAUDE.md's "Provenance belongs in
  CHANGELOG.md, docs/decisions/, and commit messages"). Not requested explicitly in the brief but
  mandated by this project's own CLAUDE.md ("On any user-visible change, update: ... CHANGELOG.md
  under `[Unreleased]`") — flagging this addition since it goes slightly beyond the brief's literal
  file list.

I did **not** touch README.md, docs/api.md, or docs/architecture.md. Their `/workflow-next`
descriptions are diagram/summary-level ("you read the backlog and rank it") that stay accurate at
that level of abstraction and don't enumerate every step (freshness sync, roadmap-validate sweep,
watch-pr sweep are likewise unmentioned there), so adding this one wasn't required for accuracy. Also
avoided touching README's "Priority label configuration" section since it's `/workflow-next`
sort-order prose adjacent to #984's roadmap territory, which the brief said to leave alone.

## `--check` surface count

- Before: `generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.`
- After `--write` + `--check`: `generate-routing-surfaces --check: all 18 surfaces byte-match the
  skeleton.`

Count is unchanged at 18 (3 topics x 2 surface types x 3 forges) — this change alters content of the
6 `next`-topic surfaces, not the surface count.

## Exact new prose per forge (as rendered)

Shared intro (identical on all six `next` surfaces, no forge divergence needed for this sentence):

```
Before claiming, read each shortlisted candidate's own body and comments — the handful you are
ranking for this claim, never the full list fetched above. Comments are current state: where a
comment contradicts the body, the comment wins, and you say so aloud when you state the selection.
```

**github** (`commands/workflow-next.md`, `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`):

```bash
gh issue view {N} --json body,comments
```

**gitlab** (`plugins/kaola-workflow-gitlab/.../workflow-next.md` + `SKILL.md`):

```bash
glab issue view {N} --comments -F json
```

**gitea** (`plugins/kaola-workflow-gitea/.../workflow-next.md` + `SKILL.md`) — `tea` has no porcelain
comments view, so this reuses `kaola-gitea-forge.js`'s existing `tea api` transport (its
`discoverProject`/`viewIssue`/`listIssueComments` exports) instead of re-deriving owner/repo in shell.
The `nx-scripts-resolver` slot is emitted here (and only here, via a `REGION:gitea` gate) to set
`$KAOLA_SCRIPTS`:

```bash
kaola_script(){ ... }
CLAIM_JS="$(kaola_script kaola-gitea-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node -e "try{const f=require(require('path').join(process.argv[1],'kaola-gitea-forge.js'));const n=process.argv[2];const p=f.discoverProject();const iss=f.viewIssue(n);const cm=f.listIssueComments(p,n);console.log(JSON.stringify({body:iss.body,comments:cm}));}catch(e){console.error(e.message)}" "$KAOLA_SCRIPTS" {N}
```

Followed on all six surfaces by:

```
Repeat this once per shortlisted issue, substituting its number for `{N}`.
```

(`{N}` matches the existing placeholder convention already used at `init.skeleton.md:520`'s
`--issue {N}` — not auto-substituted by the render engine, filled in by the reading agent per issue,
same as `{project}` elsewhere on these surfaces.)

## A real bug the suite caught (worth recording)

First draft's closing sentence read "Run it once per shortlisted issue, substituting its number for
`{N}`." — `scripts/validate-workflow-contracts.js:258` pins `assertBefore(file, 'Write the mission
list', 'Run it')` (Step 4 must precede Step 5's heading). Because I'd placed my new paragraph inside
Step 2, my own literal substring "Run it" now preceded "Write the mission list" in the rendered file,
failing the walkthrough's `testContractValidatorOfflineSkip`. Reworded to "Repeat this once per
shortlisted issue..." to drop the colliding substring; re-verified clean. Left in this report because
it's a concrete instance of the class of defect this ADR is about — a literal-string reader (the
validator) getting the wrong answer because of an accidental textual collision — caught here by the
existing suite, not by me reading carefully enough the first time.

## Verification

- `node scripts/generate-routing-surfaces.js --write` then `--check`: 18/18 byte-match, both runs.
- `KAOLA_WORKFLOW_OFFLINE=1 node scripts/validate-workflow-contracts.js`: `Workflow contract
  validation passed`, exit 0.
- `node scripts/simulate-workflow-walkthrough.js` (full, not sharded): `##KW-SHARD
  {"scenarios":210,"ran":210,"passed":210,"failed":0}` / `Workflow walkthrough simulation passed`.
- `npm test` (all four chains: claude, codex, gitlab, gitea): exit 0. Tail of the gitlab and gitea
  chains both end `generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.` with
  0 failures across every named assertion group (253/253, 188/188, 120/120, 364/364, 90/90, 119
  assertions, etc.) — full output captured, no `FAIL`/`Error:`/nonzero-exit lines anywhere in it.
- Verification tier: **regression-green**. This is prose-only, additive machinery reuse with no new
  script surface — there is no natural new unit test for "does the pick step read shortlisted
  comments" (that's agent-executed prose, not a testable function), so per test custody I authored
  none. The existing four-chain suite (which already pins the next-surface contract, byte-parity, and
  cross-forge SKILL parity) is what verified this, and it caught one real regression I introduced
  (above) before I fixed it. I did not run a literal pre-edit `npm test`; the pre-edit baseline is the
  clean `v9.9.0` release commit this worktree branched from, plus the pre-edit `generate-routing-
  surfaces --check` (18/18 clean) on the specific artifact touched.

## Manual verification of the forge-CLI claims (both `gh` and `glab` present on this machine)

- `gh issue view --json body,comments` confirmed live against a public repo (`cli/cli#1`, no auth
  needed): returns `{"body":...,"comments":[...]}`.
- `glab issue view -F json` confirmed live against a public repo (`gitlab-org/cli#1`, no auth): body
  arrives under GitLab's own `description` field (not `body` — a GitLab API naming difference, noted
  here since it's a fact about the JSON shape, not something the splice text needed to hardcode).
  `glab issue view --comments -F json` on the same repo returned `401` specifically on the `/notes`
  endpoint — confirms `--comments` does trigger a real (auth-gated) notes fetch in JSON mode, not a
  silently-ignored flag; full success requires GitLab auth, which is already assumed elsewhere on this
  surface ("authenticated `glab`").
- `tea` is not installed on this machine, so the gitea one-liner was dry-run tested against a stub
  `kaola-gitea-forge.js` (matching the real module's exported shape) in the scratchpad — confirmed the
  `node -e` argv-passing and JSON output shape work as written.

## git status --porcelain -uall (final)

```
 M CHANGELOG.md
 M commands/workflow-next.md
 M plugins/kaola-workflow-gitea/commands/workflow-next.md
 M plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
 M plugins/kaola-workflow-gitlab/commands/workflow-next.md
 M plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
 M plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
 M templates/routing/next.skeleton.md
 M templates/routing/slots.js
```

No untracked files (`.opencode*`/`.kimi*` refreshed on disk by `--write` but stay gitignored — not
listed even under `-uall`). Nothing committed, per instructions.

## Things in the brief worth flagging (not wrong, but worth stating)

1. The brief's premise checks (zero `comment`/`issue view`/`acceptance criteria` occurrences in the
   skeleton; the `nx-issue-list` splice fetching only the 6 listed fields) were both verified true
   against the pre-edit tree — nothing to correct there.
2. The brief didn't mention CHANGELOG.md; I added an entry anyway because the project's own CLAUDE.md
   makes that non-optional for a user-visible change, and it's the one place this repo's own
   convention says provenance (issue number, ADR citation, rationale) belongs. Flagged per the
   reporting instructions rather than silently expanding scope.
3. Nothing else in the brief was inaccurate. The suggested reuse of `kaola-gitea-forge.js`'s `tea api`
   transport (rather than re-deriving owner/repo in shell) turned out to be the right call once I read
   the file — it already exports exactly the three functions (`discoverProject`, `viewIssue`,
   `listIssueComments`) needed, so the gitea splice is a thin `node -e` shim around existing code
   rather than a second implementation of Gitea's comments API.

# m984: dock docs/api.md and docs/workflow-state-contract.md (ADR 0018 sequencing gap)

Scope: `docs/api.md` and `docs/workflow-state-contract.md` only, per brief, plus the one smaller
`README.md` item the brief asked me to check. Nothing committed. Worked entirely in
`/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-984-985`.

## Edits made

### `docs/api.md`

1. **Command-surface table (line 16).** `/workflow-init` row said it bootstraps "roadmap tracking" —
   verified against `templates/routing/init.skeleton.md` Step 4 ("Required structure"): the scaffold
   it creates is `kaola-workflow/archive/`, `docs/*`, `CHANGELOG.md` only; no `.roadmap/` bootstrap
   survives (ADR 0018 §8 step 5 deleted it). Changed `roadmap tracking` → `backlog guidance`.
2. **`## Roadmap Operations — kaola-workflow-roadmap.js` (was ~1393-1422) → `## Roadmap layer —
   retired`.** Deleted the subcommand table (`generate`/`validate`/`validate-remote`/`migrate`/
   `init-issue`/`project-name`) and the `Exports:` paragraph — all describe a script `git status`
   confirms deleted on all three trees (canonical + both plugin copies). Replaced with a short
   retired notice (linking `decisions/0018-the-forge-is-the-backlog.md` §5) plus a **"What
   survives"** paragraph covering the two facts that are still true and still worth a reader's
   attention: `kaola-workflow/.roadmap/` is still a reserved project-name directory holding the one
   optional `_rules.md` file, and finalize's `roadmap_staged` field (already documented at line ~370,
   confirmed live by reading `kaola-workflow-claim.js:4825-4877` — it still stages
   `kaola-workflow/.roadmap/`/`kaola-workflow/ROADMAP.md` when found on disk, for a not-yet-migrated
   consumer) is unaffected by the retirement.
3. **Dead script-index entries**, `## Module Exports`:
   - `**scripts/kaola-workflow-roadmap.js** — see Roadmap Operations above.` — deleted.
   - `**kaola-gitlab-workflow-roadmap.js** — regenerateRoadmap(root), validateRemote(root[, stats]).` — deleted.
   - `**kaola-gitea-workflow-roadmap.js** — regenerateRoadmap(root), validateRemote(root[, stats]).` — deleted.

Left untouched (verified live, or already correctly historical): lines 84/92 (`.roadmap/` as a
reserved directory name, still enforced by `isReservedWorkflowDirName`), 223/370 (`roadmap_staged`,
confirmed live), 1064-1067 and 1198 (already explicitly marked "Retired ...", "this is history, not
current behaviour" by whatever pass wrote them — accurate, no change needed).

### `docs/workflow-state-contract.md`

1. **`## Durable Sources` bullet (was line 103-105).** Replaced the `.roadmap/issue-*.md files are
   the durable local source for active roadmap rows` bullet (file/producer both deleted) with a
   bullet naming `_rules.md` as the one surviving local file, plus a fold-in of the "comments override
   the body" forge-is-the-backlog fact onto the existing first bullet, linking ADR 0018.
2. **`### Roadmap issue-source fields` → `### Reserved directory names and the archive refusal (issue
   #930)`.** The old section documented `.roadmap/issue-{N}.md`'s `issue`/`title`/`status`/
   `workflow_project`/`next_step` fields and how `workflow_project` was adopted verbatim as a project
   name — verified in `kaola-workflow-claim.js:302-307` that `projectNameForIssue` is now a stub
   (`return 'issue-' + issueNumber`), i.e. that whole read door is gone. What is **not** gone is the
   general reserved-name / `archive_reserved_directory` archive refusal (issue #930), which is now
   reached solely through the surviving `--project` flag door — kept that part, rewrote it to name the
   one surviving door, and cross-referenced `api.md` (which already carries the general
   `reserved_project` claim-side story at "Claiming is bookkeeping, not a gate" and the
   `archive_reserved_directory` finalize-envelope row) instead of re-deriving both stories twice.
   Dropped the trailing "This field is not how a bundle is formed" sentence — its referent (the dead
   `workflow_project` field) is gone and the Bundle section below is self-contained without it.
3. **`## Generated Mirrors` (was lines 418-438) — deleted entirely.** Every bullet described
   `roadmap.js generate`/`validate`/GitLab-Gitea `refresh` regenerating `ROADMAP.md`, or `_rules.md`
   being appended into the mirror's `## Rules` section — all dead, no successor mirror to describe.
   The one surviving fact in it (`_rules.md` survives) was already relocated into `## Durable Sources`
   in edit 1, so nothing was lost.
4. **`## Sink` keep-open prose (line ~263).** "`finalize` / `sink-merge` then preserve the roadmap
   source, comment instead of closing" — the roadmap source no longer exists to preserve. Matched the
   wording `README.md` already carries for the same fact (`there is no local roadmap source left to
   preserve`) rather than inventing new phrasing.

### `README.md` (the "one smaller item")

Verified the team lead's suspicion by reading the source: `listOpenIssues`/`readPriorityConfig` are
invoked only from `cmdListOpen()` (the `list-open` subcommand, `kaola-workflow-claim.js:6522`), which
is called from `templates/routing/next.skeleton.md:101` (the pick step) — **not** from `cmdStartup`
(`kaola-workflow-claim.js:2100`, grepped for `listOpenIssues`/`priority`, zero hits). So "The issue
sort order in `/workflow-next` startup is determined by:" (line 1105) was genuinely wrong. Reworded to
name the actual call site: "The issue sort order, applied by `kaola-workflow-claim.js list-open`
(called from the pick step, not from claim startup), is determined by:". Every other `roadmap` hit in
`README.md` was already accurate (a prior pass had already corrected them — see categorized grep
below); none needed a change.

## Categorized grep — `grep -rn -i roadmap docs/api.md docs/workflow-state-contract.md README.md`

Every surviving hit, post-edit:

**`docs/workflow-state-contract.md`**
| Line | Category |
|---|---|
| 106, 108 | (a) live — `_rules.md` survival, verified on disk |
| 127 | (b) history — explicitly says "but it was retired under ADR 0018 §5" |
| 144 | (b) history — "Previously finalization derived..."; clarifies "today just `_rules.md`" |
| 264 | (a) live — accurate current fact, matches README's wording |

**`docs/api.md`**
| Line | Category |
|---|---|
| 84, 92 | (a) live — `.roadmap/` reserved-directory name, `isReservedWorkflowDirName` |
| 223, 370 | (a) live — `roadmap_staged` field, confirmed against `claim.js:4825-4877` |
| 1064-1067 | (b) history — "Retired: the roadmap-source invariants..." (pre-existing, correct) |
| 1198 | (b) history — "...that reconciliation was retired under ADR 0018 §5, so this is history, not current behaviour" (pre-existing, correct) |
| 1393-1409 | (a)+(b) — my new "Roadmap layer — retired" section: retired notice + the two live survivors |

**`README.md`** — all pre-existing, all (a) live or (b) explicitly-negative-history ("there is no
local roadmap source left to ..."); none touched except the unrelated line-1105 wording fix above.
No (c) out-of-scope hits in any of the three files — every surviving mention is accounted for.

## Verification gates

```
node scripts/validate-workflow-contracts.js         → exit 1  (see finding below)
node scripts/validate-kaola-workflow-contracts.js    → exit 0
```

Echoed separately, not through a pipe.

## FINDING — a stale guard outside my scope, blocking a fully clean run

`node scripts/validate-workflow-contracts.js` fails, but not because of an over-deletion in my two
files. The exact throw:

```
Error: docs/workflow-state-contract.md must document durable sources and generated mirrors;
missing: kaola-workflow/.roadmap/issue-*.md, generated mirrors
    at ... scripts/validate-workflow-contracts.js:372:1
```

That's `assertConcept('docs/workflow-state-contract.md', 'durable sources and generated mirrors', [
'durable sources', 'kaola-workflow/.roadmap/issue-*.md', 'workflow-state.md', 'generated mirrors',
'fast-summary.md' ])` at `scripts/validate-workflow-contracts.js:372-378` — a hard-coded pin that
requires the doc to still contain the literal string `kaola-workflow/.roadmap/issue-*.md` and a
`generated mirrors` heading. Both are exactly the machinery this bundle's brief told me to remove
("the whole `## Generated Mirrors` section... All of that machinery is gone"), and ADR 0018 §5 is
explicit that the mirror and per-issue sources are retired. I did not weaken or repair this pin — per
the project's test-custody rule ("never rewrite a pin so it keeps passing against machinery that is
gone") and because `scripts/validate-workflow-contracts.js` is not one of my two assigned files, I
left it exactly as it is and let the check fail honestly rather than leaving dead content in the doc
to keep it green.

**This is the same defect class the brief itself is fixing, one layer down**, and it was missed for
an explainable reason: `kaola-workflow/.cache/m984-contract-validators.md` (an earlier dispatch in
this same run, scoped to the validators) already swept both `validate-workflow-contracts.js` and
`validate-kaola-workflow-contracts.js` for stale roadmap tokens and fixed one (`roadmap_source_removed`
in an `assertConcept('docs/api.md', ...)` block) — but that dispatch's candidate list was built from
retired **closure-receipt fields**, not from this separate `assertConcept` block that pins
`docs/workflow-state-contract.md` prose. It genuinely never checked this one.

**`validate-kaola-workflow-contracts.js` passes (exit 0)** because it does not duplicate this check —
it has a comment at line 195-197 explicitly deferring both `docs/workflow-state-contract.md` concept
checks ("durable sources / generated mirrors, and legacy coordination as transitional only") to
`scripts/validate-workflow-contracts.js` "on the same repo-root path," to avoid asserting the same
thing twice. So only the canonical validator carries this pin — but per the same m984-contract-
validators.md precedent, `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` must be
byte-identical to it (enforced by both `validate-kaola-workflow-contracts.js`'s `sharedScripts` loop
and `validate-script-sync.js`'s byte-identical-groups check), so **that plugin mirror carries the same
stale pin and will need the identical fix.**

**Suggested minimal fix (not applied — out of my scope):** in
`scripts/validate-workflow-contracts.js:372-378`, drop `'kaola-workflow/.roadmap/issue-*.md'` and
`'generated mirrors'` from that term list (the remaining three terms — `'durable sources'`,
`'workflow-state.md'`, `'fast-summary.md'` — are all still genuinely true of the doc, so the concept
name and the rest of the list can stay), then copy the fix byte-for-byte to
`plugins/kaola-workflow/scripts/validate-workflow-contracts.js` and re-run both validators plus
`node scripts/validate-script-sync.js`, exactly the sequence `m984-contract-validators.md` already
used for the prior stale token in this same file.

## Anything in the brief that turned out to be wrong

Nothing in the brief's factual claims was wrong — every claim I could verify (the roadmap.js deletion,
the `.roadmap/_rules.md` survival, the `roadmap_staged` field being live, the `list-open` sourcing of
the priority sort) checked out exactly as stated. The one thing the brief could not have known is the
stale validator pin above, since it sits in a third file outside the two I was told to touch, and the
dispatch that previously audited that same validator file was scoped to a different token list.

## Files changed

- `docs/api.md`
- `docs/workflow-state-contract.md`
- `README.md` (one line, the smaller item)

No test files touched. Nothing committed.

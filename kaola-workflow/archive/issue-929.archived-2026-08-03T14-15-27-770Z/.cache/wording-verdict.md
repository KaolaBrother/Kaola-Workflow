# Adversarial verification — issue #929 (pass 3: per-edition sweep of § Roadmap issue-source fields)

Scope, as assigned: **every assertion** in `docs/workflow-state-contract.md` § *Roadmap issue-source
fields* (`:121-144`), checked against **all four editions** — root, Codex plugin, GitLab, Gitea. I did
not re-review anything already cleared outside that section.

Analytical result: **not_refuted**.

Method: no claim below rests on reading the root edition and assuming the ports match — that
assumption is what produced R9. Every shared predicate was **normalized-hashed across its copies** so
a silent divergence would show as a different digest, and every per-edition string was read
individually. Two cheap in-scope guards re-run because I was going to sign off clean:
`generate-routing-surfaces --check` → `all 18 surfaces byte-match the skeleton`, exit 0; and
`scripts/validate-workflow-contracts.js` → `Workflow contract validation passed`, exit 0 — that one
matters because this doc **is test-consumed** (`validate-workflow-contracts.js:337, 360, 367, 399,
441`) and the section was reworded after your last green run.

---

## The answer to your question

**None.** There is no remaining assertion in § *Roadmap issue-source fields* that is untrue of any of
the four editions. Every sentence in `:121-144` holds on root, Codex, GitLab and Gitea.

The three fixes you applied are each correct, and the class you were sweeping for is closed in that
section.

---

## Per-edition sweep — every assertion in the section

| # | assertion (`:line`) | ×4 | evidence |
|---|---|---|---|
| 1 | carries `issue`,`title`,`status`,`workflow_project`,`next_step`; **GitLab and Gitea add `labels` and `url`** (`:123-124`) | **TRUE** | root/Codex write 5 fields (`scripts/kaola-workflow-roadmap.js:340-347`, Codex identical); GitLab/Gitea `issueRecordContent` writes 7 (`kaola-gitlab-workflow-roadmap.js:217-228`, `kaola-gitea-...:217-228` — textually identical to each other) |
| 2 | **Only `workflow_project` is read back as an identifier** (`:124-125`) | **TRUE** | detailed below |
| 3 | `—` sole token; absent/empty/whitespace-only the same; else `issue-{N}` (`:127-129`) | **TRUE** | `projectNameForIssue` normalized-identical ×4 → `575f1673057c`; `field()` identical ×4 → `c21341618902` |
| 4 | adopted value becomes the **active folder** (`:130`) | **TRUE** | `projectDir` identical ×4: `path.join(root,'kaola-workflow',project)` |
| 5 | …the **worktree directory** (`:130`) | **TRUE** | `worktreePathFor` identical ×4: `path.join(mainRoot,'.kw','worktrees',project)` |
| 6 | …the **archive destination** (`:131`) | **TRUE** | `dest = path.join(archiveBase, project + (suffix\|\|''))` — root/Codex `:2518,:2614`; GitLab `:2252,:2346`; Gitea `:2251,:2345` |
| 7 | …the sink receipt's **`project`** (`:131`) | **TRUE** | `buildClosureReceipt(args.project, args.issue, {` ×4 (root/Codex `:937`, GitLab `:869`, Gitea `:864`) → `emptyReceipt`'s `project: project` in all four `*closure-contract.js` copies |
| 8 | **branch clause, as reworded** (`:131-132`) | **TRUE, exactly** | see below |
| 9 | `isSafeName`'s four clauses (`:134`) | **TRUE** | **12** production copies, every one normalized-identical → `32237a7c0f3d` |
| 10 | a failing value **"is not reported — silently replaced by `issue-{N}`"** (`:134-135`) | **TRUE** | same normalized-identical `projectNameForIssue` ×4: bare `catch (_) {}`, no throw, no stderr, no exit code — the fallback is the only observable |
| 11 | `archive` / dot-names skipped **before path safety is even consulted** (`:138-139`) | **TRUE** | skip line then `isSafeName` line, in that order, ×4: root `:240/:241`, Codex `:240/:241`, GitLab `:219/:220`, Gitea `:218/:219` |
| 12 | such a run is **invisible to status and the active-folder sweep** (`:139-140`) | **TRUE** | driven against the real `status` subcommand in pass 2 (`count:1`, the two absent from `active[]` and `drift[]`); the reader is the same `readActiveFolders` in all four editions |
| 13 | bundle sentence + cross-reference (`:143-144`) | **TRUE** | `const project = 'bundle-' + targets.join('-')` ×4 (root/Codex `:1801`, GitLab `:1369`, Gitea `:1370`); **zero** `projectNameForIssue` calls anywhere in `claimExplicitBundle` or `claimBundle`, ×4 |

### #2 — "Only `workflow_project` is read back as an identifier", answered per edition

You asked specifically whether anything reads `labels`, `url`, `status` or `title` as an identifier.
Enumerated every reader of `.roadmap/issue-*.md` across all four editions:

- **`readRoadmapIssues` ×4** reads `title`, `status`, `workflow_project`, `next_step` — and takes the
  issue number from the **filename**, not the `issue:` field (`// filename is authority`, root/Codex
  `:73`, GitLab/Gitea `:75`). So `issue:` is not read back at all, anywhere.
- **`labels` and `url` are write-only.** A grep for any read of either field from a roadmap source
  across `scripts/` and all three `plugins/*/scripts/` returns **nothing** — including in the two
  editions that write them. `readRoadmapIssues` on GitLab/Gitea does not read them either.
- **All four classifiers read exactly one field**, `next_step` (root/Codex
  `kaola-workflow-classifier.js:305`; GitLab/Gitea `*-classifier.js:60`), and only to pull a
  `blocked by #N` dependency into a synthesized label. That is a state input, not a name or key.
- `title` is display text in the mirror; `status` is a state gate for `validate-remote`; `next_step`
  is prose.

Nothing but `workflow_project` is used as a name or key, in any edition. **Assertion holds ×4.**

### #8 — the reworded branch clause is accurate and does not over-generalize the other way

> The branch is unaffected: it stays `workflow/issue-{N}`, and `workflow/gitlab-issue-{N}` or
> `workflow/gitea-issue-{N}` on those forges.

Measured against `buildBranchName` in each edition:

| edition | emits | anchor |
|---|---|---|
| root | `workflow/issue-` + N | `scripts/kaola-workflow-claim.js:304` |
| Codex | `workflow/issue-` + N | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js:304` |
| GitLab | `workflow/gitlab-issue-` + N | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:198` |
| Gitea | `workflow/gitea-issue-` + N | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:198` |

Three forms named, four editions covered, and the one form that covers two editions covers exactly
the two that are byte-identical there. It asserts no fourth behaviour and invents no divergence that
does not exist — **no over-generalization in either direction**. It also agrees now with
`docs/api.md:166-167`, so the repo is back to one wording of that rule.

### #13 — does "branch stem" survive the admission that prefixes are per-forge?

You were right to ask; the word is load-bearing. On GitLab a bundle branch is
`workflow/gitlab-bundle-42-47-53` — so the *branch* is not derived from the issue set alone, but the
**stem** `bundle-42-47-53` is, on all four editions, and the per-forge prefix is added on top of it.
The cross-referenced section spells out all three full names in its own table
(`docs/workflow-state-contract.md:385-389`), so a reader who follows the pointer gets the complete
per-forge picture rather than an absolute.

Verdict: **accurate as written.** The sentence's load-bearing claim — "never read from here" — is
true in all four editions, and "stem" is the correct word for what is derived. If you wanted it
belt-and-braces, "identifier" would be marginally tighter than "branch stem", but the current wording
is not wrong and I am not asking you to change it.

### #1 — your new `labels`/`url` clause is exactly right, including between the two forges

The risk here was one forge differing from the other, which would make "the GitLab and Gitea editions
add `labels` and `url`" true of one and false of the other. It does not: `issueRecordContent` is
textually identical in both (`:217-228` in each), emitting the same seven fields in the same order,
and both forge editions call it from **both** their write paths (`:235` refresh, `:350` init-issue).
Root and Codex have no `issueRecordContent` at all and no `labels:`/`url:` writer anywhere. The
clause is precise.

---

## One observation, explicitly NOT a refutation

Found during the sweep, reported because it is the same per-forge class you asked about — but it
does **not** make any sentence in the section false, and it does not change the answer above.

On GitLab and Gitea the `refresh` path defaults `workflow_project` to **`issue-{N}`, not `—`**:

```js
// kaola-gitlab-workflow-roadmap.js:239   (gitea identical)
workflowProject || 'issue-' + issueIid,
```

Their `cmdInitIssue` *does* default to `—` (`:354`, matching root's `:335`), so the divergence is
confined to the bulk `refresh` path. The consequence is that on those two editions the routine
generator pre-fills the field with the fallback name rather than the unassigned token, and a reader
there may never see `—` in a generated source.

Why this is not a finding: the section states a **read-back** rule ("`—` is the sole token meaning
not yet assigned"), which is true ×4, and gives **authoring advice** ("Write `—` when no project is
assigned yet"), which remains valid ×4 — writing `—` still yields `issue-{N}` everywhere. Nothing in
the section claims what any tool writes into the field. And no observed failure demands the extra
sentence, so by this repo's own additive-derivation rule I am recording it rather than asking for it.
Yours to weigh.

---

## Finding accounting

| id | status |
|---|---|
| R9 — branch absolute wrong on GitLab/Gitea | **RESOLVED** (rewording verified exact ×4) |
| R3 nit — "Two path-safe values" | **RESOLVED** ("Two cases"; the added "before path safety is even consulted" is verified ×4 at the line-order level) |
| R1, R4, R6, R7, R8 | RESOLVED in pass 2, untouched since, not re-reviewed |
| R2 residual — CLAUDE.md bullet's unqualified "Any other value" | open, **non-blocking**, and **outside this section** — untouched since pass 2, where I cleared it as a defensible one-line compression |
| R5, A4 | open, out of scope, deferral agreed |

finding: id=R2 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=carried unchanged from pass 2; the CLAUDE.md bullet at workflow-init.md:153 still omits the path-safe qualifier; non-blocking and outside the section swept here

finding: id=R5 scope=out_of_scope action=none status=open severity=low fix_role=doc-updater rationale=pre-existing api.md:151 target-key enumeration; deferral agreed

finding: id=A4 scope=out_of_scope action=none status=open severity=low fix_role=doc-updater rationale=pre-existing cmdProjectName pipe-strip divergence; deferral agreed

---

## Plainly

**Nothing blocks.** Every assertion in § *Roadmap issue-source fields* is true of all four editions.
The failure class that produced three findings across two passes — a prose absolute true of
root/Codex and false or incomplete for GitLab/Gitea — I attacked deliberately this pass by hashing
each shared predicate across its copies instead of reading one and assuming, and it turned up no
fourth instance in that section. The two doc-consuming guards are green after the rewording.

I could not refute the section. Ship it.

Confidence: high. Every row rests on a normalized cross-edition hash, a per-edition line read, or
driven output — not on inference from the root edition, which is the specific mistake that made
passes 1 and 2 necessary. The residual uncertainty I can name honestly: my sweep covers the four
editions that this repository builds and tests; the additive `opencode` and `kimi` runtime editions
ship no claim path of their own, so there is nothing in them for these assertions to be false about.

verdict: pass
findings_blocking: 0

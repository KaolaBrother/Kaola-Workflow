# doc-updater — issue #968

Working from `.kw/worktrees/issue-968` (branch `workflow/issue-968`), reconciling the "On any
user-visible change, update:" checklist against the bundle-width rule change (a run's default
shape moves from one issue to three-to-five; admission moves from "share a coherent scope" to
"each member closeable on its own evidence", disjoint write surfaces preferred over shared scope).

## Already done (verified, not redone)

Confirmed present and consistent with the new rule — not re-edited:

- `README.md` — four hand-maintained restatements of "three to five" (`README.md:132`, `:884`,
  `:1179`, `:1301`), the bundle-admission paragraph (`:1309`), the runs-alone test (`:1311`), and
  every `which issue` → `which issues` / `per-issue` → `per-claim` site the diff touches. Grepped
  the whole file afterward for `same-scope`, `coherent scope`, `per-issue`, `one issue` — no
  survivors.
- `CLAUDE.md` (repo root) — `workflow-state.md is the claim record: which issues...` — the one site
  that used the retired singular. Grepped the rest of the file — clean.
- `docs/architecture.md:86` — `which issues` fixed; rest of the file greped clean for the same
  patterns.
- `docs/workflow-state-contract.md:21`, `:306` — `which issues` fixed; the file's other `bundle` /
  `per-issue` / `single-issue` hits (lines 156, 366-408, 423-424) are all state-schema description
  (field shapes, folder/branch-name patterns) that the shape rule doesn't touch — `single-issue
  projects retain only issue_number` stays true regardless of which shape is now the norm.
- `docs/decisions/0017-the-mission-list.md` — new watch-list row ("a bundle member that cannot
  close while its siblings are finished"). Spot-verified its three most load-bearing citations
  against the current tree rather than trusting them: `templates/routing/next.skeleton.md:58`
  reads exactly `A run normally carries **three to five issues**...`, `:70` reads exactly `since
  all-or-nothing closure would hold every finished sibling behind that one decision`, and
  `README.md:1332` matches the `all_or_nothing` restatement the row cites. All three check out
  byte-for-byte.
- `scripts/test-bundle-claim.js` — comment-only edit, no test assertion changed (confirmed via
  `git diff`: only `//` lines touched).

## Checked and found clean (no edit needed)

- `docs/api.md` — grepped for `bundle`, `per-issue`, `same-scope`, `coherent scope`, `which issue`,
  `one issue`, `target-issue`. Every hit is mechanical/schema description (claim exit codes,
  `TARGET_SET_TWINS`, `workflow-state.md` field shapes, `closure` receipt fields) — none of it
  asserts a shape norm or an admission test the routing prose owns. In particular the Bundle claim
  section already said "Bundle SIZE is not one of the validations" in spirit (no size gate exists in
  the API surface either) and needed no wording change.
- `docs/conventions.md` — `bundle` hits are all about cross-edition test-coverage obligations
  (§ Bundle Lane — Cross-Edition Requirement, edition behavioral coverage), unrelated to run shape
  or admission criteria.
- `docs/README.md` (the docs index) — no `bundle`/`issue`-count content at all; it only links out.
- `docs/opencode-edition.md`, `docs/kimi-edition.md` — no `issue`/`bundle` shape content at all
  (grepped for bare `issue` too, to catch paraphrase); these are runtime-capability docs, orthogonal
  to the change.
- `docs/agents-source.md` — no matches.
- `agents/*.md` (all 14 vendored role profiles) — grepped for `same-scope`, `coherent scope`,
  `carries one issue`, `normally carries one` and for `bundle`/`target-issue` near `scope`/
  `carries`/`normally`/`one issue` — no role profile restates the admission rule (`issue-scout`,
  the one role that once carried backlog-survey judgement, was retired before this run — confirmed
  absent from the 14).
- `docs/decisions/D-*.md` and `docs/investigations/*.md` — all pre-date or are contemporaneous
  historical records (like old CHANGELOG entries); several use "same-scope"/"coherent scope" in
  describing the *original* #328 design intent, which is correct as history and is explicitly the
  kind of record ADR 0017 and CHANGELOG entries are never rewritten to match a later rule. Left
  untouched, same convention as CHANGELOG's own historical entries.
- `kaola-workflow/ROADMAP.md` and `kaola-workflow/.roadmap/issue-968.md` — both quote the *old* rule
  ("A run normally carries one issue" / "share a coherent scope") as the problem statement inside
  #968's own `next_step:` proposal text — i.e. they describe the defect being fixed, not a still-live
  claim. This is generated/durable-state content the CLAUDE.md contract forbids hand-editing
  (`do not hand-edit the mirror`), and the source file is removed at this issue's own closure
  regardless. Left untouched.

## Gap found and fixed

- **`.env.example:37-38`** — `# Worktree-native mode: ON by default — issue claims provision a
  per-issue repo-local worktree at ...`. This is the exact phrase README's own "Per-issue Git
  worktrees" section carried before this run retitled it "Per-claim Git worktrees" (a claim covering
  several issues is one project and one worktree, not one per member — `README.md:1391-1396`). The
  `.env.example` comment was the one surface still asserting the retired one-worktree-per-issue
  framing. Fixed to:

  ```
  # Worktree-native mode: ON by default — a claim provisions a per-claim repo-local worktree at
  # `<repo-root>/.kw/worktrees/<project>/`, one per claimed set (not one per issue) — set to 0 to
  # opt out and run on a branch in the repo root.
  ```

  No trailing whitespace on either changed line (checked); line widths (95/97/47 chars) match the
  file's existing ~99-char wrap convention.

## Verified, not assumed

- `node scripts/generate-routing-surfaces.js --check` → `all 18 surfaces byte-match the skeleton.`
  Confirms the CHANGELOG's "renders to 18 tracked surfaces" claim against the live tree (check-only,
  no write, per the team lead's constraint).
- `grep -n "BUNDLE_SIZE_ADVISORY" scripts/kaola-workflow-claim.js` → `const BUNDLE_SIZE_ADVISORY = 8;`
  at line 1907, matching the team lead's citation and CHANGELOG's "untouched" claim.
- `git diff -- CHANGELOG.md CLAUDE.md README.md docs/ scripts/test-bundle-claim.js templates/
  .env.example` grepped for trailing-whitespace additions and the nine banned tokens — zero hits.

## Not touched (authoring-source constraint)

`commands/*.md`, `plugins/*/commands/*.md`, `plugins/*/skills/*/SKILL.md` are rendered surfaces of
`templates/routing/{finalize,init,next}.skeleton.md` + `slots.js`; confirmed byte-matching via
`--check` above, so nothing there needs a hand-edit or a flag back to the orchestrator.

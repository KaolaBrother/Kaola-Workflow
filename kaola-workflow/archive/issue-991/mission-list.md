# Settle #991 — finalize stages all of kaola-workflow/.roadmap, not just _rules.md

Single issue by direction: it is the whole open backlog. Its body offers three closings (narrow the
pathspec / accept the prose / establish reachability first) and warns against narrowing before
answering what the breadth covers. Pre-claim measurement answered that: under the Durable State
Contract nothing but `_rules.md` is generated or tracked there, so the breadth covers only cases the
contract does not support — plus one real casualty, staging the deletion of `_rules.md` itself.

- item: Establish reachability by RUNNING, not reading — a walkthrough scenario that plants a legacy `.roadmap/issue-N.md`, deletes it from DISK ONLY, runs finalize, and asserts the deletion is not staged. It must go RED on current code; a test that passes before the fix has established nothing. This is the step the issue names as the rigorous route, and the RED is the reachability evidence the filing lacked.
  status: done
  dispatched: self, inline — new `T13` in `scripts/test-finalize-door.js`, all four editions
  result: |
    RED on the pre-fix build in ALL FOUR editions: the disk-only deletion was committed, and the
    file was gone from HEAD after finalize. Reachability is now MEASURED, not reasoned — which is
    what the filing itself said it lacked.
    Two fixture bugs the test caught on itself first: (a) seeding the source in mainRoot left the
    linked worktree's index without the entry, so the premise assertion fired and said exactly that
    — it now commits in `fx.wt`, the tree finalize actually stages against; (b) the first append
    landed AFTER this file's "AUTHORITATIVE" final-result footer, where failures cannot set the exit
    code, and the name `T12` was already taken by an earlier appended block. Moved before the footer
    and renamed `T13`.

- item: Narrow the staging to what it is for. `claim.js:4840` `candidatePaths = ['kaola-workflow/.roadmap']` -> the `_rules.md` path. MUST move with `claim.js:4892`, where `roadmap_staged` is derived by comparing against the literal string `'kaola-workflow/.roadmap'` — narrowing one without the other flips the field false and reds test-finalize-door's control leg for the wrong reason. The field's MEANING is unchanged, so the existing assertions stay as authored: this is not repairing a pin ahead of a mechanism.
  status: done
  dispatched: self, inline — `claim.js` + the three plugin edition copies
  result: |
    The pathspec narrowing alone did NOT fix it, and finding out why is the substance of this item.
    T13 stayed red, so I stopped guessing and measured which commit removed the file: it was
    `chore: finalize`, not `chore: archive`. The residue enumerator has its OWN `.roadmap` arm
    (`claim.js:4981`) that swept the whole directory plus `ROADMAP.md` into the finalize commit —
    the second and larger half of the same defect, which the issue did not name because the issue
    was written from reading one call site.
    Both sites now narrowed in all four editions: archive `candidatePaths` -> the `_rules.md` path
    (with the `roadmap_staged` string comparison moved in the same edit, and the gitlab/gitea
    editions' `fs.existsSync` form moved likewise), and the residue arm -> `_rules.md` only, with
    the `ROADMAP.md` arm dropped entirely. Dropping it is consistent with #988, which already
    removed the mirror from the archive candidate list, and it RESTORES the designed loud failure:
    an untracked mirror now stays untracked and `sink_blocked`s the sink instead of being quietly
    committed.
    The staging guard at `:3535` shares the literal but NOT the polarity — it excludes `.roadmap`
    from being read as a project name. Left alone.
    BOTH SITES INDEPENDENTLY MUTATION-PROVEN, one at a time, canonical edition only so the mutant is
    single-site: reverting the archive narrowing reds `T13(root)` alone; reverting the residue arm
    reds `T13(root)` alone; restoring either returns 515 green. Neither is redundant.

- item: Name the one thing the narrowing does lose — a DELETED `_rules.md` is filtered out by `fs.existsSync` and its deletion no longer reaches the archive commit. Decide whether that is acceptable (it is the same silent-sweep hazard, so probably yes) and record the decision rather than letting it pass unmentioned.
  status: done
  dispatched: self, inline
  result: |
    The loss is smaller than the item assumed, and the correction is worth more than the decision.
    `fs.existsSync` does filter a deleted `_rules.md` out of the ARCHIVE staging — but the residue
    enumerator still admits it (` D kaola-workflow/.roadmap/_rules.md` splits to length 3 with
    `seg[2] === '_rules.md'`), so the deletion is still carried by `chore: finalize`. No capability
    is lost; only the commit it lands in can change. Nothing to accept and nothing to warn about.

- item: Dock docs and correct what this run makes false. `CHANGELOG.md`; and ADR 0018's status line plus #986's shipped migration prose both currently assert the SILENT direction exists — after this fix it does not, on the tool side. Correct precisely: the one-movement rule stays right for a consumer, what changes is that the tool no longer sweeps up a disk-only deletion.
  status: done
  dispatched: self, inline — `CHANGELOG.md`, `docs/decisions/0018-…md`, `templates/routing/init.skeleton.md` + regenerated surfaces
  result: |
    Three statements this run made false, all corrected rather than left standing:
    (1) #986's shipped migration prose said a disk-only deletion "is staged by the next finalize and
    lands, unreviewed, inside an unrelated run's archive commit". Rewritten — the advice not to
    delete from disk alone STANDS, but the reason is now that index and worktree disagree with the
    deletion uncommitted, not that this tool will commit it for you. Surfaces regenerated (18,
    byte-match); the revised sentence is not one of the `in-backlog-migration` content_tokens, and
    route-reachability stays green at 331.
    (2) ADR 0018's status line carried the same claim. Now says the second direction was real and
    that #991 removed it from the tool, keeping the one-line rule as advice about the owner's repo.
    (3) The #986 CHANGELOG entry, in the same `[Unreleased]` block, asserted it in the present
    tense. Past-tensed and pointed at the new Fixed entry.

- item: Verify — full-scope walkthrough (not the 1/12 shard), and mutation-prove the new test by reverting the pathspec to the directory form and watching it red. Then the four-chain receipt at finalize via run-chains --project.
  status: done
  dispatched: self, inline — outputs quoted here
  result: |
    Full-scope walkthrough: 184/184, exit 0, `{"index":1,"total":1}` — not the 1/12 shard.
    `test-finalize-door.js`: 515 assertions, T13 green in all four editions.
    Mutation proof done in the right ORDER (red before the fix), and per site: reverting the archive
    narrowing reds `T13(root)` alone; reverting the residue arm reds `T13(root)` alone.
    Two suites went red on the first full pass and were NOT regressions — `test-forge-finalize-findings`
    and `test-forge-archive-scoping` both seeded a retired `.roadmap/issue-1.md` as the archive
    candidate, which the narrowing correctly stops admitting, leaving `archive_stage: "skipped"` and
    their scoping assertions vacuous. Their assertions are untouched; only the seeded filename moved
    to `_rules.md`. That is a fixture premise following its mechanism, the same edit #989 made in the
    opposite direction — not a pin rewritten to keep passing against machinery that is gone.
    Both now PASS. Four-chain receipt below.

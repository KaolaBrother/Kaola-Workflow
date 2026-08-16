# Ship ADR 0018 §8 step 6 (consumer migration, #986) and settle the plantRoadmapIssue name (#990)

- item: Measure what step 6 must actually ship here — confirm nothing in the tool still reads `.roadmap/issue-*.md` or a `ROADMAP.md` (steps 1–5 claim this), confirm `install.sh`/`install-all.sh` touch no consumer backlog layer, and find where init's reconcile pass would host a migration section. Evidence for #986's premise, not a rewrite of it.
  status: done
  dispatched: self, inline in the main session (subagents declined for this run) — findings land inline in this item's `result`
  result: |
    (1) #986's premise HOLDS. No production code reads the layer's CONTENT: zero reads of
    `.roadmap/issue-*.md` or `ROADMAP.md` survive in `scripts/`. What remains in `claim.js` is path
    handling only — the name-safety filter (`.roadmap` cannot be claimed as a project), the finalize
    archive candidate list, and a residue skip.
    (2) Installers are already clean: zero `roadmap` matches in `install.sh`, `install-all.sh`,
    `install-opencode.sh`, `install-kimi.sh`. "install.sh must leave the backlog layer untouched" is
    true today; nothing to build for it.
    (3) NEW TRAP, measured, not in the issue body. `claim.js:4856` runs `git add -A --
    kaola-workflow/.roadmap` at finalize (guarded only by `fs.existsSync`, which `_rules.md` keeps
    true). Frozen TRACKED sources make it a no-op — harmless, as the ADR predicts. But sources
    deleted from DISK ONLY are staged as deletions by the next finalize and land, unreviewed, inside
    an unrelated run's `chore: archive` commit. So the ADR's one-line rule has a second and opposite
    reason on the `.roadmap/` side. Confirmed the mirror side too: `sinkPreflight`
    (`sink-merge.js:1774`) reads main-root `git status --porcelain -uall`, so an untracked
    `ROADMAP.md` reaches `foreignDirt` -> `sink_blocked`. Halfway fails in BOTH directions.

- item: Build the migration capability into `templates/routing/init.skeleton.md` — diagnose → report → ask → act, never automatic, and the diagnosis worth reading even when declined. Must carry: the mirror leaves disk and index in one movement (never `git rm --cached`); the residue diff posting only genuinely homeless content; the owner-owned `CLAUDE.md`/`_rules.md` edits the tool cannot make; the `P0`–`P3` tier landing BEFORE deletion; the dangling-citation sweep; the pre-deletion SHA as the byte-preserving record. Regenerate routing surfaces in the same movement — never hand-edit a rendered surface.
  status: done
  dispatched: self, inline — skeleton `templates/routing/init.skeleton.md`, regenerated surfaces
  result: |
    New `## Step 5 — Legacy Backlog Layer` (skill surfaces: unnumbered `## Legacy Backlog Layer`),
    placed after Active Folder Initialization and before the summary, under a new
    `<!-- PIN: backlog-migration -->`. Heading divergence rides the SPLICE mechanism
    (`in-migration-heading` in `templates/routing/slots.js`), not a REGION — the only difference is
    step numbering, so no capability claim is made; `in-summary-heading` renumbered to Step 6, and
    nothing else in the repo referenced init's Step 5. Carries: never-automatic framing; a read-only
    diagnose block; a five-part report (manifest + SHA, tier, residue, citations, owner-owned rules);
    four separate consent asks; a four-step forced order with tier BEFORE deletion and deletion as
    one movement; both halfway failure directions; and declining as a complete answer. Summary
    section gained a "what was decided" line. All four diagnose commands RUN on this repo (no legacy
    layer present, the common case): none hangs, all exit 0. Regenerated: 18 surfaces, `--check`
    byte-matches.

- item: Register any new marked region in `templates/routing/required-blocks.js` — ADR 0018 §8 step 3 says the universe is listed, not derived, and placing a marker without registering it reds the suite by design. Test artifact: authored by whoever did not place the marker.
  status: done
  dispatched: self, inline — `templates/routing/required-blocks.js`
  result: |
    Added `in-backlog-migration` (topic init, runtime_tag both, surface_type_tag both). Six
    content_tokens drawn from four independent spans — never-automatic framing, the tier-first
    ordering step, the halfway rule, the declining-is-an-answer close — none a substring of the
    marker, per the file's own vacuity warning. `test-route-reachability.js` green at 331 assertions
    over 228 obligated file-checks.
    CUSTODY DEVIATION, stated rather than hidden: subagents are declined this run, so the same actor
    placed the marker and registered it — the ADR assigns that entry to whoever did not place it.
    Substituted the stronger evidence instead: MUTATION-PROVEN. Gutting only the halfway rule
    ("Never `git rm --cached`, and never delete from disk alone.") while leaving the marker and the
    other three spans intact reds three surfaces by name (`commands/workflow-init.md`,
    `.opencode/command/workflow-init.md`, `.kimi/skills/workflow-init/SKILL.md`); restoring returns
    it to 331 green. A green suite was not taken as proof the guard is armed.

- item: #990 — decide rename-vs-written-acceptance for `simulate-workflow-walkthrough.js:602`'s `plantRoadmapIssue` (42 call sites, unused `root` param, body only registers a classifier verdict). Precedent is #988's accept-inert-fixtures ruling; the counter is that a name asserts at every call site. Whichever way it goes, it must be all-or-nothing across the 42 sites and written down on the issue.
  status: done
  dispatched: self, inline — DECIDED RENAME. `plantRoadmapIssue` -> `seedClassifierVerdictFromBody`, `root` dropped. Lands in `scripts/simulate-workflow-walkthrough.js` (42 call sites: 38 `tmp`, 4 `root`, all bare identifiers) plus the two cross-file comment citations in `scripts/test-forge-finalize-findings.js:971` and `scripts/test-forge-bundle-lane.js:159`, which the issue body did not name. Reasoning goes on #990 as a comment.
  result: |
    Renamed all-or-nothing: 42 call sites, the definition, its comment block, the six other in-file
    comment mentions, and the two cross-file citations. Zero `plantRoadmapIssue` survivors anywhere
    under `scripts/`. Two comments needed rewording rather than substitution, because the new name
    made them false: the one calling the helper "an OFFLINE local-roadmap-evidence read", and the
    definition's own "`root` is kept in the signature so call sites are untouched".
    Scope correction to the issue body: it named only the walkthrough, but the identifier was cited
    by name in two OTHER test files. Renaming without them would have left exactly the dangling
    citation the issue is about.
    The plugin editions' walkthrough copies never carried the helper, so this is canonical-only.
    VERIFIED: full-scope walkthrough 184/184 scenarios, exit 0 (`total:1`, not the 1/12 shard).

- item: Dock the documentation — `CHANGELOG.md` under `[Unreleased]`, `README.md`/`docs/api.md` if the init surface's contract changed, and ADR 0018's status line, which currently reads "Step 6, consumer migration, is not done and owns the remaining risk."
  status: done
  dispatched: self, inline — `CHANGELOG.md`, `docs/api.md`, `docs/architecture.md`, `docs/decisions/0018-the-forge-is-the-backlog.md`
  result: |
    CHANGELOG `[Unreleased]`: an Added entry for #986 and a new Changed section for #990.
    `docs/api.md` and `docs/architecture.md`: init's one-line contract now names the reconcile pass.
    ADR 0018 status line: steps 1–5 -> step 6 shipped 2026-08-16, stated PRECISELY — what shipped is
    the capability, not any consumer's migration, and the record says no consumer has been migrated
    through it. The status line also carries the correction this run made to the record: halfway
    fails in both directions, not one.
    README left alone deliberately: its `/workflow-init` mentions are install/overview lines that do
    not enumerate the command's steps, so none of them became wrong.

- item: Verify — `node scripts/generate-routing-surfaces.js --check` (surface count, zero drift) and the walkthrough at FULL scope, not the 1/12 fast-gate shard. Then the four-chain receipt at finalize via `run-chains --project`, never `npm test`.
  status: done
  dispatched: self, inline — outputs quoted here
  result: |
    `generate-routing-surfaces --check`: all 18 surfaces byte-match the skeleton.
    `test-route-reachability.js`: passed, 331 assertions over 228 obligated file-checks.
    Full-scope walkthrough: 184/184 scenarios, exit 0, shard header `{"index":1,"total":1}` — the
    full suite, not the fast gate's rotating 1/12.
    Additive editions, whose surfaces this diff regenerates: `test-opencode-edition.js` 663
    assertions, `test-kimi-edition.js` 627, both with the drift-check ARMED rather than vacuous —
    each resolved its tree root to the main checkout and reported 3 trees in parity, which is the
    known fresh-worktree trap not firing here.
    Diff is 16 tracked files and IS edition-touching (both plugin editions' init surfaces), so
    finalize's `run-chains --project` will correctly fail closed to all four chains.

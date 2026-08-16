# `test-finalize-door.js` — the 4th chain-attempt witness-death (T3a-g), plus two report-only spots

## 1. Line 567 — CONFIRMED redundant, DELETED (not re-pointed)

Verified your hypothesis directly rather than taking it on trust:

- **All 7 T3a-g cases reach `passedWithFinding` (line 565) unconditionally before the old line
  567** — no branch, no early `continue`, one call per iteration of the `cases` loop.
- `passedWithFinding` (`:344-351`) already asserts `out.status === 'closed'` for every case.
- `status: 'closed'` is set exactly once, in `cmdFinalize`, at the very end of the transaction
  (`kaola-workflow-claim.js:5149`, `Object.assign({ status: 'closed' }, result, {...})`) — after
  `flushFinalizeFindings()` and all archive/closure steps. There is no earlier return path that
  reaches this object with `status: 'closed'` while the transaction is incomplete; refusal paths
  are already excluded by `passedWithFinding`'s own `!refusal(out)` check at `:348`.
- Bonus: I checked whether the deleted assertion could ever have failed even in principle, post
  ADR 0018. It couldn't — `reconcileRoadmapForClosure` and every unlink of the local roadmap
  source is retired (`kaola-workflow-claim.js:2727`, `:3037`, `:4514-4515`, `:4728`, all say so
  explicitly). Nothing in `cmdFinalize` removes `kaola-workflow/.roadmap/<project>.md` any more,
  so the file the old assertion checked for absence of can never be removed by any code path —
  the assertion was not just redundant, it was unconditionally true regardless of outcome.

**Mutation proof** (one site, `kaola-workflow-claim.js:5149`, snapshot-restored): forced
`status: 'closed-but-not-really'` unconditionally. `passedWithFinding`'s own check catches it —
all 7 T3a-g cases went red (`got "closed-but-not-really"`), plus T2/T8m/T9b/T10/T10b/T11 (19
failures total). Restored from snapshot; `diff` clean, `grep -c MUTATION-984` = 0,
`git status --porcelain scripts/kaola-workflow-claim.js` empty.

Deleted lines 566-568 and replaced with a comment explaining why (the old witness died with
ADR 0018, the subject it stood in for is still covered by `passedWithFinding` above it). No
assertion weakened — `test-finalize-door.js` reaches exit 0 at 483 assertions (up from the prior
count only because the run now completes instead of stopping at T3's first failure).

## 2. `:150`/`:159` (`writeRoadmap`) and `:2313` (T12 DOORS[0] `.roadmap` mkdir) — inert, reporting not deleting

Both are now confirmed write-only, per your framing ("report on rather than assume"):

- **`writeRoadmap`** (`:149-164`) is called at `:424` (`buildFinalizeFixture`, feeding T2/T3) and
  `:603` (T4). It writes `kaola-workflow/.roadmap/issue-<N>.md` and `kaola-workflow/ROADMAP.md`.
  Before my edit, the ONLY reader of that content anywhere in the file was the line-567 assertion
  I just deleted (grep for `.roadmap`/`ROADMAP.md` across the whole file, post-deletion, returns
  exactly `:150`, `:159`, `:2180`(`roadmap_staged`, unrelated — see below), `:2313`). Note the
  naming lines up: T3's `project` is literally `'issue-' + issueNumber` (`:548`), so
  `project + '.md'` really did equal the `issue-<N>.md` writeRoadmap wrote — the old assertion
  wasn't checking a phantom path, it just never had a live reason to fail (see §1). With line 567
  gone, `writeRoadmap`'s output is planted and never read by anything.
- **`:2313`** (`fs.mkdirSync(... '.roadmap' ...)` inside `DOORS[0].build`, the
  `finalize_gate_unverified` door) — confirmed via the full T12 consumer loop (`:2388-2429`): the
  loop only asserts on `r.status`, `r.json.reason`, and `r.json.operator_hint`. Nothing touches
  `.roadmap`. The door is reached because the *project folder* doesn't exist under
  `kaola-workflow/`, not because of anything about `.roadmap`.

I did not remove either — you framed this one as report-and-decide, distinct from the explicit
delete-conditional-on-verification framing for `:567`, so leaving both in place pending your call.
Deleting them would be low-risk (nothing downstream depends on either), but it's your call whether
that's worth a separate pass or bundled with something else.

## 3. `:2180` (`tx.roadmap_staged === false`, T11 `statusfail` leg) — found otherwise, left alone

You said you'd verified this one survives and to leave it "unless you find otherwise." I found
otherwise, in a narrow but real way — reporting rather than touching it, since you didn't ask me
to fix it and fixing it is a fixture-design call, not a mechanical one.

**What's true:** the assertion is not vacuous outright — it does catch *something*.
**What's not true:** it does not exercise the specific mechanism its own comment names (the
`archiveAddOk &&` gate from #907).

Why: T11's `statusfail` leg runs on `buildMainResidentRun` (`:1918-1951`), whose only repo content
comes from `initSelfHostRepo` (`:81-100`, writes `package.json`/`.gitignore`/`src/app.js`/
`README.md`/`CHANGELOG.md`/`docs/note.md`) plus mission-list/workflow-state/`.cache` files
`buildMainResidentRun` adds itself. Neither ever creates `kaola-workflow/.roadmap` or
`kaola-workflow/ROADMAP.md`. That means in `cmdFinalize`'s staging block, `existingPaths` is
structurally always empty for this fixture — `existingPaths.some(p => p === '...roadmap' || p ===
'...ROADMAP.md')` is `false` regardless of `archiveAddOk`.

**Mutation A** (`kaola-workflow-claim.js:4876-4877`, snapshot-restored): removed just the
`archiveAddOk &&` gate, kept `existingPaths.some(...)` — i.e. reproduced the literal #907 bug
("reads true whenever the two roadmap paths existed on disk"). Result: **0 new failures**, exit 0,
483 assertions unchanged. T11's assertion did not see it, because `existingPaths.some(...)` stays
`false` either way in this fixture.

**Mutation B** (same site): `finalizeTx.roadmap_staged = true;` unconditionally (an override
gross enough to ignore both operands). Result: **caught** — `FAIL: T11(root statusfail):
... got true`.

Both restored from snapshot; `diff` clean, `grep -c MUTATION-984` = 0 after each,
`git status --porcelain scripts/kaola-workflow-claim.js` empty at the end.

So: the assertion is real (catches a total override) but doesn't pin the #907 regression its
comment describes, because this fixture never populates `existingPaths`. Closing that gap would
mean planting `.roadmap`/`ROADMAP.md` files in `buildMainResidentRun` (or a variant), which is
exactly the kind of "plant roadmap-shaped content back in" move that's easy to get subtly wrong
post-ADR-0018 (see §2) — I left it for you to decide whether it's worth doing, and didn't touch
the assertion or the fixture.

## Gates

Both run standalone, exit codes echoed separately, not piped:

- `node scripts/test-finalize-door.js` — **EXIT 0**, `finalize-door tests passed (483 assertions)`
- `node scripts/simulate-workflow-walkthrough.js` (full, unsharded) — **EXIT 0**,
  `##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":185,
  "ran":185,"passed":185,"failed":0}`, `Workflow walkthrough simulation passed`

No production file left mutated (`git status --porcelain` on the worktree shows only the intended
`scripts/test-finalize-door.js` edit — checked after every mutation round). Nothing committed.

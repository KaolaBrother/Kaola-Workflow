# #1098 docs consistency fix (round 3 follow-up, for the finalize summary)

Round-3 targeted re-check of `b1f91c40` PASSED; one documentation inaccuracy remained. Fixed in
**`933cdce5`** (docs only). Frozen candidate = **`933cdce5cc454c53c24e688d16fa9ddd7cf22320`**.

## The inconsistency and the fix

`docs/api.md` defined the non-linked posture twice, incompatibly:
- Contract bullet: "main checkout HEAD is the run branch".
- Offline bullet: "the checkout the sink runs in IS the main root".

The code tests `getRoot() === root`, so the **second** definition is the measured one. The Contract
bullet now opens with a single **"Postures, defined once"** definition — non-linked = the checkout the
sink runs in IS the main root (a single checkout, whether or not its HEAD is the run branch); linked =
the sink runs in a worktree other than the main root, so `root` is the shared main checkout — and both
bullets use it.

The Offline bullet also claimed main's HEAD stays untouched in the linked posture, which overstated it.
**Measured at `b1f91c40`** (`/tmp/kw1098-offline-case.js`, three fixtures):

| Case | Result |
|---|---|
| A — OFFLINE run FROM the MAIN checkout, run branch in a linked dev worktree | exit 0, **local main committed** (commits 1 → 2) |
| B — OFFLINE run FROM the DEV worktree | exit 0, main NOT moved (commits stay 1) |
| C — non-linked (main checkout on the run branch) | exit 0, local commit (commits → 3) |

That is the pre-#1098 baseline behavior, and the scope requires OFFLINE semantics to stay unchanged.
Both bullets now state it plainly: in the non-linked posture the sink stages and commits the metadata
follow-up locally exactly as before #1098 — including an OFFLINE run started from the main checkout
while the run branch lives in a linked dev worktree; in the linked posture (run from the dev worktree)
main is left untouched.

`CHANGELOG.md` repeated the same blanket claim ("never touching the main checkout's index or HEAD").
It is now scoped to the linked-posture publish ("only `kaola-workflow/archive/<project>/` is
published, so the publish itself does not touch the main checkout's index or HEAD") and records the
unchanged OFFLINE behavior.

Docs only — no code or test change: `git diff --name-only b1f91c40..HEAD` is exactly
`CHANGELOG.md` and `docs/api.md`.

## Checks on `933cdce5` (isolated HOME)

| Command | Exit |
|---|---|
| `node scripts/kaola-workflow-prose-census.js` | 0 |
| `node scripts/validate-script-sync.js` | 0 (18 byte-identical + 5 export-superset families) |
| `node scripts/generate-routing-surfaces.js --check` | 0 (24 surfaces) |
| `scripts/validate-workflow-contracts.js` | 0 |
| `scripts/validate-kaola-workflow-contracts.js` | 0 |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | 0 |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | 0 |
| `scripts/test-route-reachability.js` | 0 |
| `scripts/test-release-surface-drift.js` | 0 |
| `node scripts/simulate-workflow-walkthrough.js` | 0 (199/199) |
| `npm test` | 0 (all four producer chains) |
| `run-chains --output /tmp/kw1098-receipt5/chain-receipt.json` | 0 |
| `run-chains --release-check --candidate HEAD --receipt <above>` | 0 |

Chain receipt: `/tmp/kw1098-receipt5/chain-receipt.json` — `headSha=933cdce5…`,
`codeTreeHash=2dc72973623ecbcb47edde11917140815fb69517964e828e620d0096f4014c2a`,
4 chains exit 0, unwaived.

## Freeze

`origin/main` unchanged at `209be26f` (no rebase needed). Worktree clean, `0 behind / 8 ahead`.
`git diff --shortstat b1f91c40..HEAD` = 2 files changed, 28 insertions(+), 15 deletions(-).
`git diff --shortstat origin/main..HEAD` = 29 files changed, 4712 insertions(+), 401 deletions(-).
Ledger untouched (6 × `done`), no new mission, main checkout has no tracked changes.

Not finalized — the Host accepts the docs diff and then dispatches finalize.

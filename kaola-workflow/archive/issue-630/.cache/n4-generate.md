evidence-binding: n4-generate 31c72e54f720

# n4-generate evidence — wire #630 routing-surface generator into the build

## task
Wire the #630 routing-surface generator (`scripts/generate-routing-surfaces.js`, n3's
skeletons under `templates/routing/`, and `scripts/test-generate-routing-surfaces.js`) into
the build so the 12 template-shaped plan-run/next surfaces are `@generated` (out-of-band,
per Spec §4.6 — no in-file banner) and hand-edit drift reds its own chain. Confirm the
generator is a true no-op on the current 12 committed surfaces, then wire `--check` into all
four npm chains and the engine self-test into the claude chain only.

## non_tdd_reason
category: **Glue / wiring**. This node connects an already-built, already-self-tested
generator engine (n3's `generate-routing-surfaces.js` + `test-generate-routing-surfaces.js`,
proven byte-for-byte no-op) to the four `npm run test:kaola-workflow:*` chains via a
`package.json` script-string edit. No new behavioral logic is introduced — the wiring itself
is a straight-line `&&`-chain append. Proof = integration/smoke check: run the appended
commands directly (both exit 0), then run the pre-existing wired checks
(`test-route-reachability.js`, `validate-script-sync.js`) to confirm nothing else in the
chain was disturbed. This is not "hard to test" — it genuinely has no unit-test shape; it is
a build-wiring change.

## verification_tier
`smoke-integration`

## write_set
- `package.json` (only tracked file this node modified — the 4 chain script strings)

Not written by this node (pre-existing from n1/n2/n3, confirmed untouched):
- `scripts/test-route-reachability.js` (n2's modification, already present/modified before n4 started)
- `scripts/generate-routing-surfaces.js`, `scripts/test-generate-routing-surfaces.js`, `templates/routing/` (n3's, untracked, unmodified)
- The 12 generated surfaces themselves (byte-unchanged, confirmed below)

## Step 1 — confirm no-op regen (BEFORE any package.json edit)

Ran, in order:
```
node scripts/generate-routing-surfaces.js --check
→ "generate-routing-surfaces --check: all 12 surfaces byte-match the skeleton." exit 0

node scripts/generate-routing-surfaces.js --write
→ "generate-routing-surfaces --write: rendered 12 surfaces." exit 0

git diff --stat
→  scripts/test-route-reachability.js | 327 +++++++++++++++++++++++++++++++++++++
   1 file changed, 327 insertions(+)
```
The only diff after `--write` is `scripts/test-route-reachability.js`, which was ALREADY
modified (by n2) before this node started (`git status --porcelain` showed it as `M` prior to
any n4 action). None of the 12 generated surfaces
(`commands/kaola-workflow-plan-run.md`, its gitlab/gitea command twins, the 3 plan-run
SKILL.md files, `commands/workflow-next.md`, its gitlab/gitea command twins, and the 3
kaola-workflow-next SKILL.md files — enumerated via
`GENERATED_SURFACES.map(s => s.path)`) appear in the diff. **`--write` was confirmed a true
byte-for-byte no-op on all 12 surfaces** — proceeded to step 2 per the task's stop-condition.

## Step 2 — package.json wiring (exact edits)

Edited the 4 `test:kaola-workflow:{claude,codex,gitlab,gitea}` script strings, appending to
the END of each existing `&&`-chain (matching existing style/quoting, no reformatting):

- **claude** chain: appended
  `&& node scripts/generate-routing-surfaces.js --check && node scripts/test-generate-routing-surfaces.js`
  (both the byte-guard AND the engine self-test — self-test runs once, in this chain only).
- **codex** chain: appended
  `&& node scripts/generate-routing-surfaces.js --check`
  (byte-guard only).
- **gitlab** chain: appended
  `&& node scripts/generate-routing-surfaces.js --check`
  (byte-guard only; chain already carries `node scripts/edition-sync.js --check` near the
  front of the chain, so the new `--check` lands after it, per the ordering requirement).
- **gitea** chain: appended
  `&& node scripts/generate-routing-surfaces.js --check`
  (byte-guard only; same edition-sync-then-generate ordering as gitlab).

No other lines in `package.json` were touched (verified via `git diff --stat`: only
`package.json` +8/-4 lines, i.e. the 4 script-string lines rewritten in place).

## verification_commands (all run after the package.json edit)

| command | exit |
|---|---|
| `node scripts/generate-routing-surfaces.js --check` → "all 12 surfaces byte-match the skeleton." | 0 |
| `node scripts/test-generate-routing-surfaces.js` → "all 33 assertions passed." | 0 |
| `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` | 0 |
| `grep -o 'scripts/generate-routing-surfaces.js --check' package.json \| wc -l` → 4 | 0 |
| `grep -o 'scripts/test-generate-routing-surfaces.js' package.json \| wc -l` → 1 | 0 |
| `node scripts/test-route-reachability.js` → "Route-reachability test passed (281 assertions)." | 0 |
| `node scripts/validate-script-sync.js` → "OK: 24 common scripts, 25 byte-identical groups, 8 rename-normalized families, 1 config/hooks.json family, and 7 forge export-superset families in sync." | 0 |

Total wiring occurrences: 4 `--check` (one per chain) + 1 self-test (claude chain only) = 5,
matching the spec.

## before_result
Baseline (pre-edit, this node's session start): `package.json` scripts block had the 4
chains WITHOUT any `generate-routing-surfaces` reference. `node scripts/generate-routing-surfaces.js --check`
already passed independently (n3's deliverable) but was not yet reachable from any npm
chain. `git status --porcelain` at session start showed `M scripts/test-route-reachability.js`
(pre-existing, n2's) plus untracked generator/template/cache files; `package.json` was clean.

## after_result
`package.json` now has all 4 chains ending with `&& node scripts/generate-routing-surfaces.js --check`
(claude additionally with `&& node scripts/test-generate-routing-surfaces.js`). Both the
byte-guard and the engine self-test pass standalone (exit 0, shown above).
`test-route-reachability.js` and `validate-script-sync.js` (pre-existing chain members) still
pass, confirming the new appended commands did not need — and did not get — any reordering
of, or interference with, the rest of the chain. `git diff --stat` confirms the only tracked
file this node changed is `package.json` (8 insertions, 4 deletions — the 4 rewritten script
lines); `scripts/test-route-reachability.js` remains n2's pre-existing diff, untouched by n4.
Untracked files (`scripts/generate-routing-surfaces.js`, `scripts/test-generate-routing-surfaces.js`,
`templates/routing/`, `kaola-workflow/issue-630/`) are n1/n2/n3 artifacts, not touched by n4.

Per task instruction, the full four `npm run test:kaola-workflow:*` chains were NOT run in
this node (explicitly out of scope for this pass) — only the newly-appended pieces plus the
two named pre-existing checks were verified directly.

delegation_outcome: completed

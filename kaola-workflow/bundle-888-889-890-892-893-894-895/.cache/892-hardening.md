# Hardening record — issue #892, the mission-list field table

Executed against `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-888-889-890-892-893-894-895`
(branch `workflow/bundle-888-889-890-892-893-894-895`, baseline HEAD `fa5157b3`). Nothing committed.

**The gap closed:** #892's acceptance criterion is *"No wording of the format drops the `dispatched`
locator."* Before this change the criterion was satisfied by the text and defended by nothing — the
four-field table rendered onto the twelve next surfaces could be deleted, or the locator clause
stripped from its `dispatched` row, with every guard staying green. Proven, not assumed: see the
negative control in §3.

---

## 1. What I pinned, and where

**One file changed: `templates/routing/required-blocks.js`** — four `content_tokens` appended to the
existing `nx-mission-list` block, plus the comment deriving them.

```js
'| `item` | the mission — one line of prose, hints and facts | at creation |',
'| `status` | `todo` \\| `in-flight` \\| `done` | on change |',
'| `dispatched` | what went out and to whom, and **where the output was to land** | at dispatch |',
'| `result` | where the outcome landed — a path, or a few lines inline | at close |',
```

### Why the manifest, and only the manifest

`required-blocks.js` is the declared-once home by construction: `checkManifest` in
`scripts/test-route-reachability.js` derives the obligated surface set from `topic` + tags rather
than a hand-typed file list, so a `next`/`both`/`both` block obligates **all twelve** next surfaces —
the 6 tracked ones off disk plus the 6 additive-edition renders (`.opencode*`, `.kimi*`) out of
`GENERATED_SURFACE_CONTENT`. One declaration, twelve surfaces, no way to obligate 10-of-12 by
omission.

I deliberately did **not** duplicate the tokens into `scripts/validate-workflow-contracts.js` (or its
byte-twin), nor into `test-generate-routing-surfaces.js`'s `requiredByTopic.next`. Both read a strict
**subset** of what the manifest already covers (the 6 tracked surfaces), so a second copy would add
zero coverage and a second authoring site for one rule — which is the defect `required-blocks.js`'s
own header comment says it exists to prevent. Consequence: neither of those twin files was touched,
so there is no byte-identity exposure from this change (`validate-script-sync.js` exit 0, §4).

`test-route-reachability.js` runs in `test:kaola-workflow:claude`, the always-selected chain, so the
pin executes on every finalize regardless of diff scope. Verified against `package.json`.

### Why the ROW and not the clause — the reason the obvious pin is the wrong one

`**where the output was to land**` appears **twice** on every next surface:

- `commands/workflow-next.md:158` — the `dispatched` table row (the site under threat);
- `commands/workflow-next.md:194` — write moment 2, *"Name **where the output was to land** — that
  locator is what makes recovery possible at all."*

A bare-clause token (`'where the output was to land'`) would therefore have stayed **green** while
the locator was stripped from the table row, because write moment 2 still carries it. That is
precisely the shape #892 was filed against: a guard green for a reason unrelated to the property it
names. Pinning the whole row is what binds the locator to the field definition.

(Note the fenced example above the table uses a different wording — *"where **its** output was to
land"* — so it does not mask the row either.)

### What I deliberately did NOT pin

| not pinned | why |
|---|---|
| the header row `\| field \| content \| written \|` and the `\|---\|---\|---\|` delimiter | Deleting them breaks the table's *rendering*, which any reader sees at a glance, and costs **no rule** — the four rows carry the format. Pinning them buys no safety and adds two more tokens a future reflow must chase. |
| the fenced `markdown` example block as a whole | Already covered where it matters: `nx-mission-list` pins `status: todo`, `in-flight` and `dispatched: self`, which only the fence carries. Pinning the fence verbatim would freeze illustrative placeholder prose. |
| the four write-moment paragraphs verbatim | `'before the work goes'` (ordering) and the `dispatched` row's `at dispatch` cell already pin the load-bearing half; the surrounding rationale prose is explanation, not rule. |
| a duplicate in `validate-workflow-contracts.js` / `test-generate-routing-surfaces.js` | Strict subset of the manifest's coverage; see above. |

The judgment call throughout: **the row is the unit**, because a row is one field's complete
definition — name, content, and the write moment it is written at. The `written` column is half the
format's contract (*"Four fields per item. Three write moments."*) and exists nowhere else on a
shipped surface, so a partial-row pin would have dropped it.

---

## 2. Mutation proofs — every pin armed

Backups taken **before** any mutation into
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/f018e2ef-7526-4575-bcc6-e529af9f0e2f/scratchpad/pristine-892h/`.
Restores by `cp` only. No `git checkout --`, no `git stash`.

### A1 — the locator-strip on a RENDERED surface (the brief's required probe)

`plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`, table row only:

```
-| `dispatched` | what went out and to whom, and **where the output was to land** | at dispatch |
+| `dispatched` | what went out and to whom | at dispatch |
```

Write moment 2 left intact — verified in the mutation script itself
(`write-moment 2 still carries the clause: true`).

```
node scripts/test-route-reachability.js            EXIT=1   RED — ARMED
  FAIL: MANIFEST missing-token: block nx-mission-list token
    "| `dispatched` | what went out and to whom, and **where the output was to land** | at dispatch |"
    absent from plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
  FAIL: MANIFEST: derived-universe presence check clean over 168 obligated file-checks

node scripts/validate-workflow-contracts.js        EXIT=0   green (expected — single home, §1)
node scripts/generate-routing-surfaces.js --check  EXIT=1   1 surface(s) drifted from the skeleton
```

Restored; all 18 surfaces + `next.skeleton.md` md5-identical to the pre-mutation snapshot.

### A2 — the REAL regression: the skeleton edit that regenerates clean

A1 is caught by `--check` too, because a rendered-surface edit is drift by definition. The regression
that actually threatens the criterion follows the project's own rule (*edit the skeleton and
regenerate, never a rendered surface*), and `--check` is blind to it. So I ran it:

`templates/routing/next.skeleton.md:227`, same strip, then `generate-routing-surfaces.js --write`
(EXIT=0, rendered 18 surfaces).

```
node scripts/generate-routing-surfaces.js --check  EXIT=0   all 18 surfaces byte-match the skeleton
node scripts/validate-workflow-contracts.js        EXIT=0   green
node scripts/test-generate-routing-surfaces.js     EXIT=0   green
node scripts/test-route-reachability.js            EXIT=1   RED — ARMED, on all 12 surfaces
```

The twelve, verbatim from the failure output:

```
absent from commands/workflow-next.md
absent from plugins/kaola-workflow-gitlab/commands/workflow-next.md
absent from plugins/kaola-workflow-gitea/commands/workflow-next.md
absent from plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
absent from plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
absent from plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
absent from .opencode/command/workflow-next.md
absent from .opencode-gitlab/command/workflow-next.md
absent from .opencode-gitea/command/workflow-next.md
absent from .kimi/skills/workflow-next/SKILL.md
absent from .kimi-gitlab/skills/workflow-next/SKILL.md
absent from .kimi-gitea/skills/workflow-next/SKILL.md
```

### C — the `status` structural row, mutated on a canonical command surface

`commands/workflow-next.md`: `| \`status\` | \`todo\` \| \`in-flight\` \| \`done\` | on change |`
→ `| \`status\` | one of three values | on change |`

```
node scripts/test-route-reachability.js  EXIT=1   RED — ARMED
  missing-token … "| `status` | `todo` \| `in-flight` \| `done` | on change |" absent from commands/workflow-next.md
  missing-token … absent from .opencode/command/workflow-next.md
  missing-token … absent from .kimi/skills/workflow-next/SKILL.md
```

Three surfaces, because the two additive renders derive from the mutated canonical — the pin follows
the render, not just the tracked file.

### D — the `item` and `result` rows, deleted from a skill surface

`plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`, both rows removed:

```
node scripts/test-route-reachability.js  EXIT=1   RED — ARMED (both tokens named)
  missing-token … "| `item` | the mission — one line of prose, hints and facts | at creation |" absent from …gitlab/skills/kaola-workflow-next/SKILL.md
  missing-token … "| `result` | where the outcome landed — a path, or a few lines inline | at close |" absent from …gitlab/skills/kaola-workflow-next/SKILL.md
```

All four row tokens are individually mutation-proven armed.

---

## 3. The negative control — proof the pin is in the right place

With the A2 regression **still in place** (locator stripped from the skeleton's `dispatched` row,
all 18 surfaces regenerated), I reverted `required-blocks.js` to its pre-pin state and re-ran
everything:

```
PRE-PIN manifest + locator stripped from the dispatched table row:
  generate-routing-surfaces.js --check     EXIT=0   all 18 surfaces byte-match the skeleton
  test-route-reachability.js               EXIT=0   Route-reachability test passed (323 assertions).
  validate-workflow-contracts.js           EXIT=0   Workflow contract validation passed
  test-generate-routing-surfaces.js        EXIT=0   all 432 assertions passed.
  validate-kaola-workflow-contracts.js     EXIT=0   Kaola-Workflow Codex contract validation passed
```

**Every guard green with the locator gone from the field table.** That is the gap #892's own
criterion left open, and these four tokens are the only thing that closes it.

Restore path: pinned manifest back, pristine skeleton back, `--write` (EXIT=0), then md5 over all 18
surfaces + `next.skeleton.md` — `diff` against the pre-mutation snapshot empty:
`RESTORED: all 18 surfaces + next.skeleton.md byte-identical to baseline`. Same verification after
A1, C and D. The only file left changed by me is `templates/routing/required-blocks.js`.

---

## 4. Verification (all real exit codes, sequential, worktree)

```
node scripts/generate-routing-surfaces.js --check   EXIT=0  all 18 surfaces byte-match the skeleton.
node scripts/test-route-reachability.js             EXIT=0  Route-reachability test passed (323 assertions).
node scripts/validate-workflow-contracts.js         EXIT=0  Workflow contract validation passed
node scripts/test-generate-routing-surfaces.js      EXIT=0  test-generate-routing-surfaces: all 432 assertions passed.
node scripts/validate-script-sync.js                EXIT=0  OK: 15 common scripts, 27 byte-identical groups, 1
                                                            rename-normalized families, 2 hooks.json families,
                                                            6 forge export-superset families in sync.
                                                            committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
node scripts/validate-kaola-workflow-contracts.js   EXIT=0  Kaola-Workflow Codex contract validation passed
node scripts/test-suite-registration.js             EXIT=0  Suite registration passed (472 assertions).
node scripts/edition-sync.js --check                EXIT=0  8 forge aggregator ports in parity with canonical.
                                                            committed kernel parity verified at HEAD.
```

`validate-script-sync.js` was RED in the #892 implementation record (five entries, all other agents'
in-flight files). It is now **exit 0** — those agents landed their work. Nothing of mine was in it
either way: I touched no twinned script.

### Additive editions — the six next surfaces still carry the format

```
node scripts/sync-opencode-edition.js --write                 EXIT=0  0 file(s) updated — tree already in sync.
node scripts/sync-opencode-edition.js --write --forge=gitlab  EXIT=0  tree already in sync.
node scripts/sync-opencode-edition.js --write --forge=gitea   EXIT=0  tree already in sync.
node scripts/sync-kimi-edition.js --write                     EXIT=0  0 file(s) updated — tree already in sync.
node scripts/sync-kimi-edition.js --write --forge=gitlab      EXIT=0  tree already in sync.
node scripts/sync-kimi-edition.js --write --forge=gitea       EXIT=0  tree already in sync.
node scripts/test-opencode-edition.js                         EXIT=0  opencode-edition test passed (490 assertions).
node scripts/test-kimi-edition.js                             EXIT=0  kimi-edition test passed (505 assertions).
```

Measured directly on the six generated next surfaces — all four rows present, locator intact:

```
.opencode/command/workflow-next.md          rows=4  dispatched-row-with-locator=1
.opencode-gitlab/command/workflow-next.md   rows=4  dispatched-row-with-locator=1
.opencode-gitea/command/workflow-next.md    rows=4  dispatched-row-with-locator=1
.kimi/skills/workflow-next/SKILL.md         rows=4  dispatched-row-with-locator=1
.kimi-gitlab/skills/workflow-next/SKILL.md  rows=4  dispatched-row-with-locator=1
.kimi-gitea/skills/workflow-next/SKILL.md   rows=4  dispatched-row-with-locator=1
```

`opencode.json` preserved (user-owned); `git status` over `opencode.json .opencode .kimi` is empty —
the six trees are gitignored and nothing leaked onto the branch.

### Rules honoured

- No rendered surface edited as a fix. The only file changed is the manifest; the skeleton was not
  touched either, so `--check` was green throughout without any regeneration being part of the fix.
- `edition-sync.js --write` never run (`--check` only).
- Nothing on the do-not-touch list touched: `CHANGELOG.md`, `README.md`, `docs/architecture.md`,
  `docs/api.md`, `scripts/test-install-model-rendering.js`, `scripts/kaola-workflow-adaptive-schema.js`.
- No twin-script edit, so no byte-identity risk introduced.

### One measurement caveat, so nobody chases it

An early verification loop reported `generate-routing-surfaces.js --check EXIT=1` with a Node
module-not-found trace. That was **my** shell error, not a red: zsh does not word-split unquoted
parameter expansion, so `node scripts/$s` with `s="generate-routing-surfaces.js --check"` passed the
flag as part of the filename. Every result above comes from a correctly-quoted invocation; the check
is green in five consecutive standalone runs.

---

## 5. Not done

- `scripts/simulate-workflow-walkthrough.js` not run. Grepped: it contains **zero** references to
  `mission-list`, the field table, or any token in this diff, and it is mid-edit by other agents in
  this worktree, so a full-scope run would prove nothing here and risks a red attributable to
  someone else's in-flight work. Flagged rather than claimed.
- `npm test` / the fast gate not run: its first step is `edition-sync.js --materialize-kernel`, a
  **write** over plugin kernel copies other agents hold.
- No `CHANGELOG.md` entry — `changelog-draft-2` owns that file in this run.

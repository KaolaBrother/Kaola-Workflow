evidence-binding: n5-prose 89e5dde2bea3
upstream_read: n2-mechanism cb782b26822d
upstream_read: n1-surface c88971e73a76

## Task

Transcribe `n2-mechanism` §6.3's replacement prose into the `role-capability-coverage` PIN region of
`templates/routing/plan-run.skeleton.md`, add the four new pinned tokens to
`templates/routing/required-blocks.js`'s `pr-role-capability-coverage` entry, regenerate the six
rendered `kaola-workflow-plan-run` surfaces, and verify.

## Orchestrator-flagged correction, independently verified

The node brief said the skeleton "carries command and skill variants as parallel regions, so locate
and apply both copies of every passage." I verified this does NOT hold for the `role-capability-coverage`
PIN before editing:

```
$ grep -n 'PIN: role-capability-coverage' templates/routing/plan-run.skeleton.md
427:<!-- PIN: role-capability-coverage -->
```

Exactly one occurrence, at line 427, outside every `REGION:` marker (nearest `/REGION` at :418,
nearest `REGION:skill` at :494) — confirming n1's C4 finding. I edited this single copy; there is no
second copy to find, and I did not manufacture one.

## Write set (all 8 files touched, none outside the declared set)

- `templates/routing/plan-run.skeleton.md` — replaced skeleton lines 427-447 (the paragraph after the
  typed-refusal list through "substitute and re-dispatch, or halt.") with the §6.3 replacement text
  verbatim: task-identity-derived-from-dispatch-target sentence, the extended
  capability_gap-is-NOT-evidence paragraph (never hand-edit to clear it; only `substitute-role` may
  clear it; `evidence_reset: true` reporting), and the new "two refusal families" list separating
  `substitute_self_noop` from the six-code no-in-kind-role-covers-the-brief family (the five original
  codes plus `substitute_evidence_reset_failed`).
- `templates/routing/required-blocks.js` — appended exactly the four new `content_tokens` to
  `pr-role-capability-coverage` (lines 186-199 pre-edit): `'substitute_self_noop'`,
  `'substitute_evidence_reset_failed'`, `'evidence_reset: true'` (with its value, per §6.4's stated
  reason), `'derived from the DISPATCH TARGET'`. All seven pre-existing tokens preserved verbatim,
  unreordered.
- Six rendered surfaces (regenerated via `--write`, never hand-edited):
  `commands/kaola-workflow-plan-run.md`,
  `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md`,
  `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md`,
  `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md`,
  `plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md`,
  `plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md`.

`git diff --stat` shows exactly these 8 files, each with the identical +21/-7 shape on the rendered
surfaces (skeleton/required-blocks differ in line count as expected) — no overflow beyond the declared
write set.

## Constraint compliance

- **Never hand-edited a rendered surface.** All six outputs came from `node
  scripts/generate-routing-surfaces.js --write`; confirmed byte-match with `--check` afterward.
- **Preserved every existing pinned needle** not changed by the n2 spec: `<!-- PIN:
  role-capability-coverage -->`, `cannot cover the node brief`, `capability_gap`, `substitute-role`,
  `BYTE-IDENTICAL`, `write-halt --reason consent`, `is **NOT evidence**` — all still present verbatim
  (verified: `test-route-reachability.js` FORWARD check passed, which asserts every
  `pr-role-capability-coverage` token is a substring of all 6 obligated surfaces).
- **Kept provenance out of the surfaces** — no issue ref, decision id, or ADR citation in any edited
  passage.
- **Forge-neutral prose.** My diff hunks (grepped across all six rendered files) contain no
  gitlab/gitea/github/codex/claude/kimi/opencode vocabulary. `--forbidden-only` run scoped to each
  forge's own touched files (gitlab checker against the two gitlab files; gitea checker against the two
  gitea files) — both pass. (Running a forge's forbidden-checker against the OTHER forge's file or the
  base `plugins/kaola-workflow/` file is a scoping error, not a real defect: the gitlab checker forbids
  the literal string `plugins/kaola-workflow/scripts`, which is the base plugin's own, pre-existing,
  unrelated-to-this-diff script path — confirmed via `git diff` that this string does not appear in my
  added hunk for that file. Correctly scoped, both forge checks are clean.)

## Verification commands + exit codes (all real, captured via $?)

```
$ node scripts/generate-routing-surfaces.js --write
generate-routing-surfaces --write: rendered 30 surfaces.
EXIT=0

$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 30 surfaces byte-match the skeleton.
EXIT=0

$ node scripts/test-generate-routing-surfaces.js
test-generate-routing-surfaces: all 674 assertions passed.
EXIT=0

$ node scripts/test-route-reachability.js
Route-reachability test passed (2263 assertions).
EXIT=0

$ node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only \
    plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md \
    plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md
Kaola-Workflow GitLab forbidden-only check passed (2 file(s))
EXIT=0

$ node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only \
    plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md \
    plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md
Kaola-Workflow Gitea forbidden-only check passed (2 file(s))
EXIT=0
```

## Notes for downstream nodes

- `n7`/`n8`: this node did not run the full four-chain suite or `test-adaptive-node.js` — that is
  scripts/mechanism work owned by `n4`/`n8`. The three checks above are the complete verification
  surface for a prose/generation-only change per my node brief.
- `n6` (docs): §7.3 of `n2-mechanism` notes `docs/api.md` currently has no `substitute-role` entry at
  all — not amending, authoring the first one. Not this node's concern, flagging for continuity.
- The `pr-role-capability-coverage` token table now carries 11 `content_tokens` (7 preserved + 4 new).

## Verification tier

build-green: `node scripts/generate-routing-surfaces.js --check` exit 0; `node
scripts/test-generate-routing-surfaces.js` exit 0; `node scripts/test-route-reachability.js` exit 0.
This is agent-facing prose + generated-surface rendering with no natural failing unit test; the machine
pin for this text is the `required-blocks.js` token table updated in this same node, exercised by
`test-route-reachability.js`'s forward/reverse/non-vacuity checks (all passing above).

evidence-binding: n4-agents ecd8af887fc3

## Task (reopen — gate finding R1 fix)

n8-cr-surface reviewed the original n4-agents deliverable and verified it mechanically clean
(byte-parity ×3, forbidden-only, canonical-text fidelity) with ONE blocking prose finding (R1):
the `## Node Briefs` authoring GRAMMAR was stated nowhere planner-facing — a wrong-layout section
(bullets, tables, bold names) silently parses to ZERO briefs and the channel no-ops. This reopen
adds the one-sentence syntax rule ×4 files, exactly per the gate's fix text. **The prior
gate-reviewed scope stands unchanged** — all 32 files of the original n4 deliverable (8 root
`.md` evidence contracts + workflow-planner posture + 24 byte-identical `.toml` mirrors,
synthesizer skipped as already-compliant) are already merged into this parent worktree; this
reopen adds ONLY the syntax sentence ×4.

non_tdd_reason: scaffolding/boilerplate prose — a one-sentence syntax addendum appended to the
existing Compact-plan posture paragraph in 4 agent-profile files; no behavioral logic.

verification_tier: build-green

## write_set (files actually changed in this reopen — exactly the 4 the gate named)

- agents/workflow-planner.md — appended the syntax sentence (4 wrapped lines, file's 2-space
  continuation style) to the end of the `**Compact-plan posture.**` bullet (now :174-185),
  verbatim per the gate's fix text: "Syntax: under the `## Node Briefs` h2, author one column-0
  `### <node-id>` heading per brief (the id must match a `## Nodes` row — an unknown id is a
  freeze refusal, `brief_unknown_node`; a repeated id is `brief_duplicate_node`); the heading's
  body is the brief. Any other layout (bullets, tables, bold names) parses as NO briefs."
- plugins/kaola-workflow/agents/workflow-planner.toml — condensed equivalent (same sentence,
  backticks dropped to match the file's plain flowing-prose style) appended to the end of the
  COMPACT-PLAN POSTURE sentence (line 27).
- plugins/kaola-workflow-gitlab/agents/workflow-planner.toml — identical edit.
- plugins/kaola-workflow-gitea/agents/workflow-planner.toml — identical edit.

Forge-neutral: `brief_unknown_node`/`brief_duplicate_node` are typed refusal reasons (legal in
agent prose, not provenance); no forge CLI/brand, no issue refs, no decision IDs in the added
text.

## verification_commands + exit codes (all run in the parent worktree)

1. Byte-identity across the 3 `.toml` editions:
   `diff plugins/kaola-workflow/agents/workflow-planner.toml plugins/kaola-workflow-gitlab/agents/workflow-planner.toml`
   and `diff plugins/kaola-workflow-gitlab/agents/workflow-planner.toml plugins/kaola-workflow-gitea/agents/workflow-planner.toml`
   → both empty, exit 0 (triple BYTE-IDENTICAL).
2. `node scripts/test-agent-profile-parity.js` → exit 0, "agent-profile parity tests passed
   (33 assertions)".
3. `--forbidden-only` on the changed `.toml` files (real exit codes captured directly, no pipe):
   - `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only plugins/kaola-workflow-gitlab/agents/workflow-planner.toml` → exit 0.
   - `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only plugins/kaola-workflow-gitea/agents/workflow-planner.toml` → exit 0.
   - gitlab validator over the codex-edition twin `plugins/kaola-workflow/agents/workflow-planner.toml` → exit 0.
4. `--forbidden-only agents/workflow-planner.md` → exit 1 — **pre-existing, NOT introduced by
   this change, proven mechanically**: the flagged token is
   `/\$HOME\/\.claude\/kaola-workflow\/scripts/` at `agents/workflow-planner.md:287`, the file's
   long-standing "Method (in order)" script-path re-derivation guidance
   (`$CLAUDE_PLUGIN_ROOT/scripts` → `$HOME/.claude/kaola-workflow/scripts` → `./scripts`).
   Proof: extracted `git show HEAD:agents/workflow-planner.md` (which does NOT contain this
   reopen's sentence) to a scratch file and ran the same gitlab `--forbidden-only` on it → exit 1
   with the IDENTICAL forbidden-reference; the current file fails with the same single token and
   no other. The root `.md` is the Claude edition's profile — Claude-specific install paths are
   legitimately present there and legitimately forbidden in the gitlab/gitea PLUGIN trees the
   check is designed for; the `.toml` mirrors (the surfaces those validators own), which carry
   the condensed equivalent of the same added sentence, pass cleanly (item 3). `git diff
   agents/workflow-planner.md` confirms this reopen adds exactly the 4 syntax-sentence lines and
   nothing else.

## before_result

Parent worktree at reopen baseline (prior n4 scope merged): Compact-plan posture bullet present
at `agents/workflow-planner.md:174` WITHOUT the syntax sentence; `.toml` triple byte-identical
WITHOUT the syntax sentence; `test-agent-profile-parity.js` green (33 assertions, exit 0);
`git show HEAD:agents/workflow-planner.md` fails gitlab `--forbidden-only` on the pre-existing
`$HOME/.claude/kaola-workflow/scripts` token (exit 1) — the same failure signature as after.

## after_result

Syntax sentence present in all 4 files; `.toml` triple byte-identical (diff empty ×2);
`test-agent-profile-parity.js` exit 0 (33 assertions); gitlab + gitea `--forbidden-only` exit 0
on all 3 changed `.toml` files; the root `.md`'s forbidden-only failure is byte-for-byte the same
pre-existing token as at HEAD (no new forbidden reference introduced). No file outside the
declared 4-file reopen write set touched.

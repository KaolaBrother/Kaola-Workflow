# Independent code review - issue #1016

verdict: pass
findings_blocking: 0

Candidate: worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1016` branch `workflow/issue-1016` HEAD `f3642cb0` plus uncommitted production and G10 tests. Plan of record comment 5383907624; Layer 1-2 overridden by freshness amendment 5383958037. Edition-only; overlay and install-manifest frozen vs HEAD.

## Admitted findings

None. No in-scope candidate-caused defects admitted.

## Freeze and forbidden surfaces

- `git diff HEAD -- templates/routing/init.skeleton.md scripts/kaola-workflow-install-manifest.js` is empty.
- `supportScripts('github')` does not include `kaola-workflow-ensure-cursor-catalog.js` (16 github scripts; filename absent from the manifest file).
- Diff does not touch `agents/*.md` or `CURSOR_MODEL_CLASS_PINS`. No #1013 restamp.
- Generated `.cursor/commands/workflow-next.md` has no `Task(model=`. Production diffs add no `Task(model=` workaround.
- `init.skeleton.md` contains neither `generalPurpose` nor `kaola-workflow-ensure-cursor-catalog`.

## Production vs amendment 5383958037

- `scripts/kaola-workflow-ensure-cursor-catalog.js` is self-contained. Dest is always `<cwd>/.cursor/agents`. Source is `$cursorHome/agents` only. No git-toplevel probe.
- `already-present` requires every `listCanonAgents()` name to exist under dest and be byte-identical to global. A lone dest `implementer.md` is not present (G10-ensure[lone-implementer]).
- Incomplete or drifted dest copies only canon names from global; dest `user-agent.md` is left alone; home `user-agent.md` is not copied.
- `missing-source` when global has no `implementer.md` (or an empty name list). CLI: `already-present`/`copied` exit 0; `missing-source` non-zero.
- Inlined `CANON_AGENT_NAMES` matches the 14 tracked `agents/*.md` names.
- `CURSOR_MODEL_DISPATCH_BLOCK` names the ensure script and the three status routes; `already-present` proceeds to named omit-model Task; `copied` stops for a new chat; `missing-source` prints `install-cursor.sh --target`. Dropped `in order: git toplevel`. Still forbids `generalPurpose` / `inherit` and keeps Invalid-enum inline. Does not name `kaola-workflow-claim.js` (G8-gitlab).
- `install-cursor.sh` copies the extra script into `$CURSOR_HOME/kaola-workflow/scripts/`, adds it to `deployed[]` so stale-clean keeps it, and `--uninstall --global` `rm -f`s it.
- Second `sessionStart` command: `kaola-workflow-ensure-cursor-catalog.sh`, timeout 5, stdout `{}`. Compact wrapper remains. `rewriteHooksJsonForGlobal` still rewrites `.cursor/hooks/` to `./hooks/`. Generated github/gitlab/gitea trees all carry the second sessionStart entry.

## G10 mutation binding (would G10 stay green if unbound?)

Unbinding the ensure path fails G10:

- Delete or stub `ensureCursorCatalog` / the JS file: G10-ensure and G10-cli fail.
- Prefer git toplevel over `$cursorHome/agents`: G10-ensure[global-source] fails.
- Treat lone dest `implementer.md` as present: G10-ensure[lone-implementer] fails.
- Drop the script name or status tokens from `CURSOR_MODEL_DISPATCH_BLOCK` / generated next: G10-block fails.
- Stop deploying or stale-clean the extra script: G10-install fails.
- Fold ensure into the compact wrapper, drop the hook file, or no-op the wrapper (empty dest, no copy): G10-hook fails.
- Put the filename in `supportScripts('github')`: G10-install exclusion fails.
- Rewrite `init.skeleton.md` with `generalPurpose` or the script name: G10-overlay-untouched fails.

Needle-not-semantics limits that did not become findings: G10-block conjunctions can match omit/inherit text elsewhere in the same block; G10-hook after driving the wrapper only asserts dest `implementer.md` (all-14 is on the JS module, and the wrapper invokes that module); G10-cli isolated `require()` does not spawn the isolated copy as a CLI (repo-path spawn still has the sibling). None of those is a reachable production miss on this candidate.

Reviewer re-ran `node scripts/test-cursor-edition.js` from the worktree: exit 0, 687 assertions, D0 three trees in parity.

## Live close evidence (independent parse)

Claims in `live-cursor.md` are confirmed against the raw streams. SHA-256 matches the note: `probe-control.ndjson` `8620b27c89d5537b8af17751444fa79ceef1bafa3e387d8508ce06c14291cbc8`; `probe-envelopes.ndjson` `89dcca573d78a1397ea9534af45c0bb0da24eda7ac4016a6460869356002b6b4`. Control 45/45 JSON.parse clean. Envelopes 44/44 JSON.parse clean.

Control session `27f72171-d1f7-40bb-8040-06d9d5d1a311`, parent model Cursor Grok 4.6 Extra High, cwd `/private/tmp/kw-1016-live-LaSoWE`. Exactly one `taskToolCall`, completed with Invalid enum: Expected `generalPurpose` | `cursor-guide` | `bugbot` | `security-review` | `best-of-n-runner`, received `implementer`. Assistant quoted that error and stopped. No second Task call. No generalPurpose retry.

Envelope session `812b7b22-b409-46e6-9509-5b4350ab6e3d`, same parent model. Started/completed pairs: `subagentType.custom.name=implementer` envelope `model=cursor-grok-4.6-medium` child `STANDARD_CHILD_1016_LIVE` agent `445b8326-2628-424c-a359-7b0e0d2ccf58`; `code-reviewer` envelope `model=cursor-grok-4.6-high` agent `1188b778-4861-4943-a5b7-37749b7e5aab`. Zero `generalPurpose` in Task args. Zero `inherit` in Task args. Parent xhigh cannot produce that split by inherit-from-parent. code-reviewer child text was a capability_gap note rather than `REASONING_CHILD_1016_LIVE`; that is outside the Layer 5 close bar (envelope split, not the echo token).

review_conclusion: The finished issue-1016 worktree matches the amended catalog-ensure plan, G10 stays bound to the ensure path, and the live streams confirm Invalid-enum then medium versus high named omit-model envelopes with no generalPurpose retry.

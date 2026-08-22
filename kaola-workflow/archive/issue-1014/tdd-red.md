# tdd-red — issue #1014 Layer 4 pins

baseline: `3a289108917d6fa5b3e8df625d2edceba83710d9` (`main` / this worktree HEAD; no production fix)

Worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-1014`

Production / skeletons / generators / installers / docs / CHANGELOG: **not edited**.

`scripts/test-route-reachability.js`: **untouched**. T19 conflict needles stay; overlay lives in the stripped KW-CLAUDE-TEMPLATE region, so no new Codex-skill pin is required for GREEN-cannot-lie after the overlay rewrite.

---

## Files changed (tests only)

- `scripts/test-cursor-edition.js`
- `scripts/validate-workflow-contracts.js`
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`

---

## New assertions (one line each)

### A. `scripts/test-cursor-edition.js`

- Canonical `commands/workflow-next.md` carries `## Agent Model Dispatch`.
- Canonical gitlab twin `plugins/kaola-workflow-gitlab/commands/workflow-next.md` carries the same heading.
- Canonical gitea twin `plugins/kaola-workflow-gitea/commands/workflow-next.md` carries the same heading. (Codex skills are not required to carry it.)
- Shared `CURSOR_MODEL_DISPATCH_BLOCK` omits per-call `model=` including inherit (do not pass inherit).
- Shared block forbids `generalPurpose` impersonation (names `generalPurpose`; do not substitute / no prompt costume).
- Shared block names catalog-preflight sentinel `.cursor/agents/implementer.md` in cwd.
- Shared block: if files were just copied this session, stop named dispatch and start a new chat.
- Shared block: Invalid-enum / advertised catalog lacks the role → work inline; do not retry as generalPurpose/inherit.
- Shared block still names `subagent_type: "<role>"` (already true on the weak constant; lock).
- Generated `.cursor/commands/workflow-next.md` contains the same `CURSOR_MODEL_DISPATCH_BLOCK` text as the constant.
- Generated next carries the inherit / generalPurpose / sentinel / cold-start / Invalid-enum / `subagent_type: "<role>"` needles.
- Generated `.cursor/commands/kaola-workflow-finalize.md` matches the same strengthened block needles (inherit / generalPurpose / sentinel / cold-start / Invalid-enum).
- `runInstaller` accepts `cwd` (git-fixture only; never `--global` with cwd = this repo).
- G8-global-git: `--global` from `G.init` fixture writes `<toplevel>/.cursor/agents/implementer.md`.
- G8-global-git: still no nested `.cursor/` under `CURSOR_HOME`; un-nested `$CURSOR_HOME/agents` remains.
- G8-global-nongit: `--global` from a directory with no git toplevel does not invent a project `.cursor/` tree (lock; already true).
- G9-catalog: `sync-cursor-edition.js` exports `copyListCanonAgents(srcDir, destDir)`.
- G9-catalog (when export exists): `implementer.md` is copied; stray `user-agent.md` is not.

### B. `scripts/validate-workflow-contracts.js`

- `phaseCommands` still does not include `workflow-next` (comment + assert; lock).
- Three forge command copies carry `## Agent Model Dispatch`.
- Those copies include `You MUST pass \`model=`.
- Those copies do **not** include `model="{`.
- KW-CLAUDE-TEMPLATE (init command + `init.skeleton.md`) must not contain `configured model`.
- Same region must not contain `ships its model in its installed profile`.
- Same region must contain the plan overlay: spawn the type installed next/finalize name; follow those instructions for whether the spawn call carries a model argument; do not substitute a generic built-in unless those instructions map the role.

### C. Gitlab / gitea twins

- Separate next pin on each twin `commands/workflow-next.md`: heading present, `You MUST pass \`model=` present, `model="{` absent.
- Overlay wording **not** duplicated (twins only byte-identity the KW-CLAUDE-TEMPLATE; github validator is overlay source of truth).
- Existing `kaola-workflow-` basename loop left finalize-only.

---

## Prove RED — exact failing output

### `node scripts/test-cursor-edition.js` — exit 1

```
FAIL: G2-dispatch[commands/workflow-next.md]: canonical command next MUST carry ## Agent Model Dispatch (Codex skills are not required to carry this heading)
FAIL: G2-dispatch[plugins/kaola-workflow-gitlab/commands/workflow-next.md]: canonical command next MUST carry ## Agent Model Dispatch (Codex skills are not required to carry this heading)
FAIL: G2-dispatch[plugins/kaola-workflow-gitea/commands/workflow-next.md]: canonical command next MUST carry ## Agent Model Dispatch (Codex skills are not required to carry this heading)
FAIL: G2-dispatch[CURSOR_MODEL_DISPATCH_BLOCK]: omit per-call model= including inherit (do not pass inherit)
FAIL: G2-dispatch[CURSOR_MODEL_DISPATCH_BLOCK]: forbid generalPurpose impersonation — name generalPurpose; do not substitute it / do not use a prompt costume
FAIL: G2-dispatch[CURSOR_MODEL_DISPATCH_BLOCK]: catalog-preflight sentinel names .cursor/agents/implementer.md in cwd
FAIL: G2-dispatch[CURSOR_MODEL_DISPATCH_BLOCK]: if files were just copied this session, stop named dispatch and start a new chat
FAIL: G2-dispatch[CURSOR_MODEL_DISPATCH_BLOCK]: Invalid-enum / advertised catalog lacks the role → do the work inline; do not retry as generalPurpose/inherit
FAIL: G2-dispatch[.cursor/commands/workflow-next.md]: must contain the same CURSOR_MODEL_DISPATCH_BLOCK text as the shared constant
FAIL: G2-dispatch[.cursor/commands/workflow-next.md]: omit per-call model= including inherit (do not pass inherit)
FAIL: G2-dispatch[.cursor/commands/workflow-next.md]: dispatch names subagent_type: "<role>"
FAIL: G2-dispatch[.cursor/commands/workflow-next.md]: forbid generalPurpose impersonation — name generalPurpose; do not substitute it / do not use a prompt costume
FAIL: G2-dispatch[.cursor/commands/workflow-next.md]: catalog-preflight sentinel names .cursor/agents/implementer.md in cwd
FAIL: G2-dispatch[.cursor/commands/workflow-next.md]: if files were just copied this session, stop named dispatch and start a new chat
FAIL: G2-dispatch[.cursor/commands/workflow-next.md]: Invalid-enum / advertised catalog lacks the role → do the work inline; do not retry as generalPurpose/inherit
FAIL: G2-dispatch[.cursor/commands/kaola-workflow-finalize.md]: omit per-call model= including inherit (do not pass inherit)
FAIL: G2-dispatch[.cursor/commands/kaola-workflow-finalize.md]: forbid generalPurpose impersonation — name generalPurpose; do not substitute it / do not use a prompt costume
FAIL: G2-dispatch[.cursor/commands/kaola-workflow-finalize.md]: catalog-preflight sentinel names .cursor/agents/implementer.md in cwd
FAIL: G2-dispatch[.cursor/commands/kaola-workflow-finalize.md]: if files were just copied this session, stop named dispatch and start a new chat
FAIL: G2-dispatch[.cursor/commands/kaola-workflow-finalize.md]: Invalid-enum / advertised catalog lacks the role → do the work inline; do not retry as generalPurpose/inherit
FAIL: G8-global-git: --global from a git-fixture cwd writes <toplevel>/.cursor/agents/implementer.md
FAIL: G9-catalog: sync-cursor-edition.js exports copyListCanonAgents(srcDir, destDir) (copies only listCanonAgents() names; not a glob of *.md)

cursor-edition test FAILED: 22 failure(s), 560 passed.
```

All 22 FAILs are the new pins. Existing asserts still pass (560).

### `node scripts/validate-workflow-contracts.js` — exit 1

Throws on the first new next pin (this validator does not continue):

```
Error: commands/workflow-next.md must include: ## Agent Model Dispatch
```

Queued behind that throw (measured on the same baseline; not printed because the suite exits):

- gitlab/gitea command next heading + `You MUST pass \`model=` + `model="{` absent
- KW-CLAUDE-TEMPLATE still contains `configured model` and `ships its model in its installed profile` on both `commands/workflow-init.md` and `templates/routing/init.skeleton.md`; new overlay sentence is absent

### `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` — exit 1

```
Error: plugins/kaola-workflow-gitlab/commands/workflow-next.md must include: ## Agent Model Dispatch
```

### `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — exit 1

```
Error: plugins/kaola-workflow-gitea/commands/workflow-next.md must include: ## Agent Model Dispatch
```

---

## Implementer notes (result, not method)

- Strengthen `CURSOR_MODEL_DISPATCH_BLOCK` (shared text) then regenerate Cursor next/finalize so both contain that block.
- Canonical command next (three forges) must gain `## Agent Model Dispatch` with `You MUST pass \`model=` and **without** `model="{`. Do not put next in `phaseCommands`. Do not require the heading on Codex next skills.
- `--global` from a git toplevel must also write `<toplevel>/.cursor/agents/implementer.md` without nesting `.cursor/` under `CURSOR_HOME`.
- Export `copyListCanonAgents(srcDir, destDir)` that copies only `listCanonAgents()` names (stray `user-agent.md` stays out).
- Rewrite the KW-CLAUDE-TEMPLATE overlay to the plan sentence; drop “configured model” / “ships its model in its installed profile”.

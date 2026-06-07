verdict: pass
findings_blocking: 0

# security-review — G2 gate node evidence (issue #266)

Role: security-reviewer | Node: security-review | Issue: #266 | Date: 2026-06-07

Post-dominates the TRUST-BOUNDARY nodes (preflight, compact-hook, task-mirror).
READ-ONLY review of the new Codex harness scripts on branch workflow/issue-266
vs origin/main. All security-relevant claims were verified FUNCTIONALLY (scratch
fixtures in $TMPDIR), not just by reading.

## Scope reviewed (as-built source)

1. `scripts/kaola-workflow-codex-preflight.js` (+ 3 byte-identical plugin copies,
   all SHA256 `ed1d633e…`)
2. `plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js`
   (+ gitlab/gitea edition copies — differ only by the line-2 filename comment)
3. `scripts/kaola-workflow-task-mirror.js` (+ byte-identical codex copy; gitlab/gitea
   ports differ only by the line-25 plan-validator require path)

Byte-identity verified across trees, so reviewing the base copies covers all editions.

## Threat questions and findings

### A. Preflight fail-closed integrity (AC-7 "no silent inline fallback")

CAN a crafted/missing config or a missing/partial agents dir WRONGLY return
`status:"ok"`? NO. Verified empirically:

- Missing template (`config/agents.toml` absent — the claude `scripts/` tree case)
  → `template_missing` (exit 2) at the TOP of `runPreflight`, before any profile
  check. `requiredRoles` can never be empty when the `ok` branch is reached.
- Empty template (file present, zero `[agents.*]`) → `template_missing` (exit 2).
- Missing role profile `.toml` + `--no-autofix` → `profiles_missing` (exit 1).
- Stale managed block (role missing from block) → `config_stale` (exit 1).
- `config.toml` unreadable (read throws) → caught → `configContent=''` →
  `blockFound:false` → `isStale:true` → refuse/autofix. Fail-closed.
- Stale + installer absent (claude tree) → `installer_failed` (exit 5), never `ok`.
- Post-autofix re-verify: if profiles/block still stale → `installer_failed` (exit 5).

The only path to `status:"ok"` is full coverage of the union(template ∪ plan) role
set in BOTH the profile files AND the managed block, with no outside conflict.
Confirmed by a fully-covered happy-path fixture returning `ok` (exit 0).

### B. Auto-install safety

- Invocation is `spawnSync(process.execPath, [installerPath, projectRoot], {timeout:30000})`
  — args ARRAY, no `shell:true`, no shell string. `--project-root` / `projectRoot`
  cannot inject shell. Not exploitable.
- "Refuse vs safe" policy is CORRECT and ORDERED: the conflict check
  (`conflictingRolesOutside.length > 0` → `autofix_unsafe`, exit 4) runs BEFORE the
  installer is ever invoked. Verified a fixture with a hand-authored `[agents.my-custom-agent]`
  OUTSIDE the markers: result `autofix_unsafe`, installer NOT run, and the target
  `config.toml` was byte-IDENTICAL before/after (no clobber of user config).
- Plan role absent from template → `role_not_in_template` (exit 3) — no autofix.

### C. Path traversal / arbitrary read-write

- preflight `--project-root` / `--plan`: `path.resolve`d, used only to locate
  `.codex/...` and to READ a plan. preflight itself performs NO direct fs writes
  (grep clean) — all mutation is delegated to the installer (positional arg).
- task-mirror `--project`: write target is the FIXED filename
  `kaola-workflow/<project>/workflow-tasks.json` joined off the git repo root.
  A traversal `--project ../../…` is theoretically out-of-tree, BUT the write only
  occurs AFTER a valid FROZEN `workflow-plan.md` is read at that SAME joined dir
  (read → frozen-check → write). It is not an arbitrary-overwrite primitive (fixed
  filename; requires an attacker-planted frozen plan already at that path). `--project`
  is a trusted operator CLI arg, not network input. Verified: traversal project with
  no plan → `plan_not_found` (exit 1), no write. NON-BLOCKING observation only.
- compact-resume `cwd` (from stdin JSON): used ONLY to locate the workflow dir via a
  read-only walk-up. Script performs ZERO write/mutate fs calls (grep clean). Malicious
  cwd and malformed/non-JSON stdin both degrade gracefully (exit 0, no crash, no path
  or secret leak). Confirmed READ-ONLY.

### D. No-silent-inline-fallback invariant

A profile-absent / config-stale state cannot be coerced into a `subagent-invoked`
success: every stale/missing/conflict/installer-failure path returns a non-zero
typed refusal with `safe_autofix:false`. The gate hard-refuses; it cannot emit a
silent pass or a `local-fallback` row.

### E. Self-containment / unsafe constructs

- NO `eval`, NO `new Function`, NO dynamic code loading.
- NO `child_process` with a shell string. The only process calls are
  `spawnSync(execPath,[...])` (preflight) and `execFileSync('git',[...])`
  (task-mirror getRepoRoot) — both args-array, no shell.
- compact-resume requires ONLY `fs` + `path` (AC-F satisfied structurally).
- preflight requires ONLY `fs` + `path` + lazy `child_process` for the installer.
- `regexp.exec()` hits are JS pattern matching, not process execution — benign.

### F. Secrets / credentials

Grep for password/secret/api-key/token/credential/private-key/bearer across all
three scripts: CLEAN. No secret literals introduced, none logged. Error/stderr
output carries only paths and installer error text — no credentials. The
compact-resume packet emits only project name, node ids, roles, gate names, and
status counts — no sensitive data.

## Non-blocking observations (NOT defects)

1. task-mirror `--project` is not sanitized for traversal, but the fixed output
   filename + frozen-plan-required precondition + trusted-operator-arg trust model
   make it non-exploitable. If desired, a future hardening could reject a `--project`
   containing `..` or path separators (defense-in-depth), but this is style, not a
   blocking security defect.
2. preflight `runInstaller` swallows installer stderr into the `repair` field; this
   is operator-facing diagnostics, not a sink for untrusted data. Acceptable.

## Verdict reasoning

Fail-closed integrity HOLDS (verified across 6 refusal paths + 1 happy path).
Auto-install safety HOLDS (conflict-refusal ordered before any install; no shell;
no config clobber — config byte-unchanged on refuse). No traversal, arbitrary
read/write, code execution, or secret exposure is reachable. No CRITICAL or HIGH
findings. Zero blocking findings.

verdict: pass
findings_blocking: 0

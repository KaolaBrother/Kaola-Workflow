# ADR 0032 — Per-repo forge resolution and the edition guard

Status: Accepted · Date: 2026-10-27 · Issue: #1123

## Context

Kaola-Workflow ships GitHub, GitLab, and Gitea editions, but forge selection was an install-time
choice: at run time no component asked which forge the repository belonged to. #1123 designs the
coexistence model, and its P0 measurement period established the facts this ADR builds on:

- tea does not refuse an origin whose host does not match a login; with a single login it falls back
  to the default login (and, in the measured environment, its only accessible repo). Two-login
  selection remains unmeasured — no second authorized login was available.
- tea matches the login URL host as an exact string: `localhost:3000` and
  `ssh://localhost:2222/...` did not match `127.0.0.1:3000`.
- `tea api` returns exit 0 for an HTTP 404 body, so a gitea error path cannot trust the exit code.
- Codex namespaces same-name skills by plugin (`<plugin>:<skill>`), and Claude Code namespaces
  plugin commands/skills by plugin. Both plugins can be enabled together.
- `git config --local` is visible from a linked worktree and is not tracked.

P1 (this ADR) adds the neutral resolver and the edition guard, and nothing else. Multi-forge entry
rendering, union installation, and the PR/MR sinks' install layout stay P2/P3. Automatic tea login
binding stays P4 and remains gated on the unmeasured two-login behavior.

## Decision

1. **One neutral resolver.** `scripts/kaola-workflow-forge-resolve.js` owns per-repo resolution. It
   makes no forge CLI call, carries no remote URL in its decision path, reads no credential, and is
   byte-identical in all four script trees (canonical GitHub, the Codex GitHub copy, GitLab,
   Gitea). It is enrolled in `COMMON_SCRIPTS`, the byte group covering the forge trees,
   `edition-sync`'s materializer, and the install manifest.

2. **Tier order.** The first decisive layer wins:
   - T1: `kaola-workflow/config.json#forge` (tracked, team-level).
   - T2: `git config --local kaola-workflow.forge` (clone-local marker; never tracked).
   - T3: the host of `git remote get-url origin`, mapped through machine `forge_hosts` (exact
     `host:port`, then `host`) and the built-ins `github.com` / `gitlab.com` / `gitea.com`.
   - T4: the installed forge set, only when it contains exactly one forge.
   `git remote get-url` expands `url.<base>.insteadOf`, so T3 matches the rewritten destination
   host. Local paths, `file://`, and unparseable remotes are unknown, never guessed.

3. **Refusal semantics.**
   - Invalid T1/T2 value, or unreadable/unparseable/non-object config → `forge_config_invalid` /
     `forge_marker_invalid`. The resolver does not fall through to a lower tier.
   - T1 ≠ T2 → T1 wins, with warning `forge_marker_shadowed`.
   - T1/T2 against a decisive T3 → `forge_conflict`.
   - T3 unknown and T1–T3 unresolved with an installed set of two or more → `forge_unresolved`.
   - A resolved forge outside the installed set → `forge_not_installed`.
   - An unknown `forge_hosts` value is `forge_config_invalid`; host matching never uses substrings.

4. **No URL userinfo in output.** The parser strips userinfo before anything is reported; `--json`
   and `--shell` output carry only the host (and optional port). Credentials are never read,
   printed, or stored.

5. **The edition guard.** Every edition's claim `startup` / `resume` and sink entry
   (`sink-merge`, `sink-pr` / `sink-mr`) calls the resolver before its first forge CLI call. In P1
   the guard fixes the installed set to the edition's own forge. A different resolution is
   `forge_mismatch` — including the resolver's `forge_not_installed`, which is how a foreign origin
   appears from a single-edition install. Other refusals (`forge_config_invalid`,
   `forge_marker_invalid`, `forge_conflict`, `forge_unresolved`) pass through typed rather than
   being flattened. A non-git root has no repo-scoped declaration or origin, so T4 would select the
   edition itself; the guard passes there, preserving pre-guard behavior for non-git fixture/main
   roots. The CLI `resolve` command still reports `not_a_git_repo` when asked directly.

6. **Marker writes are explicit.** `set <forge>` writes T2 with `git config --local`; `unset`
   removes it idempotently. Global installers never write T2. Per ADR 0018 §5.7, a tracked T1
   declaration is written only by the owner or by `workflow-init` after the owner answers.

7. **Output contract.** `resolve --json` emits
   `{ok, forge, source, host, tiers, warnings}` on success and the typed refusal plus available
   context on failure. `resolve --shell` emits only `KW_FORGE`, `KAOLA_SCRIPTS`, and `CLAIM_JS`,
   single-quoted for shell evaluation; the forge value is whitelist-validated. The scripts
   directory is supplied by the caller (`--scripts-dir`, default the resolver's own directory), so
   the neutral module never hardcodes an edition path.

8. **P4 remains gated.** The resolver accepts `--installed` from the entry block but does not
   discover installed editions itself, does not create or switch tea logins, and does not pass
   `--login` to tea. P4's precondition — whether multiple logins make tea ignore the remote host —
   is still unmeasured. The `tea api` 404 finding above means any future gitea error path must
   inspect the response body/status rather than the exit code.

## Update — P2 (2026-10-27)

P2 implements the Claude multi-forge path on top of this guard. `--forge` accepts a comma list;
two or more forges install their support directories plus three committed `multi` command entries,
and one compact hook pinned to the first forge. `multi` is a render mode, not a fourth forge:
command splices are composed from the existing per-forge values into `case "$KW_FORGE"` blocks, and
the entry calls `resolve --shell --installed <csv>` with `--scripts-dir-<forge>`. A per-forge
uninstall keeps the multi entry and repoints the hook, so a repo that resolves the removed forge
gets `forge_not_installed`. `install-all.sh --check` reports installed vs expected. The measured
multi increment is +2,830 estimated tokens for Next+Finalize, under the proposed 3,000-token D5
cap (pending owner ratification).
P3 then resolved the remaining runtimes: Codex keeps both forge plugins installed (namespaced
skills, separate caches), while the additive runtimes take the explicit single-forge alternative
with this guard as the safety net; each edition doc records the choice. P4 (tea login binding)
remains open.

## Consequences

- Existing single-edition behavior is unchanged when there is no contrary signal: a `github.com`
  repo on the GitHub edition resolves `github` from T3; an unknown host on a single Gitea edition
  resolves `gitea` from T4; no origin behaves the same way. The full four-chain suite and the
  integration walkthrough pin this.
- A repo that truthfully belongs to another forge now fails before any `gh`/`glab`/`tea` call,
  which is the safety the design asked for. A self-hosted host must be mapped explicitly in
  `~/.config/kaola-workflow/config.json#forge_hosts`; SSH and host aliases are not assumed equal.
- P2 rendered the Claude `multi` entry; P3 added Codex's two-plugin coexistence and recorded the
  additive runtimes' single-forge posture. No additive runtime installs a union of forge scripts;
  the P1 guard is their safety net.
- The P0 measurement record is
  [2026-10-27-multi-forge-p0-measurements.md](../investigations/2026-10-27-multi-forge-p0-measurements.md).

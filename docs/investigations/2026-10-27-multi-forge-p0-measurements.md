# Multi-forge P0 measurements (issue #1123)

Measurement period: **2026-10-27T16:20Z–16:45Z** (2026-10-28 00:20–00:45 CST).
Scope: issue #1123 §4 **P0 only**. No product code was written. No installed runtime carrier was
reinstalled, overwritten, or otherwise mutated.

## Environment

| Fact | Value |
| --- | --- |
| Host | macOS 27.2, arm64 |
| git | 2.54.0 (Apple Git-157) |
| Local test forge | Gitea 28.2.0, `http://127.0.0.1:3000` (`brew services gitea`) |
| Smoke repo | `kaola-test/kaola-gitea-smoke`, open issue #1 |
| tea | 0.16.0 (go 1.27.1) |
| Codex CLI | `codex-cli 0.162.1` |
| Claude Code | 2.1.311 |

Credential boundary honored: the token file was never read, printed, or copied into this table; no
`tea login` was created, removed, or switched; M2/M3 used isolated temporary `HOME` plus
`CODEX_HOME` / `CLAUDE_CONFIG_DIR`.

## M1 — tea login and repo selection

The machine has exactly **one** tea login: `local` (`kaola-test`, URL `http://127.0.0.1:3000`,
`default: true`). A two-host-login test is therefore **N/A** (needs a second authorized login). The
single-login behavior below is still sufficient to expose the hazard the design guards against.

| # | Date | Version | Command | Observation | Result |
| --- | --- | --- | --- | --- | --- |
| M1.1 | 2026-10-27 | tea 0.16.0 | `tea api --help`; `tea issues list --help` | Both expose `--login/-l`, `--repo/-r`, and `--remote/-R`; `tea api` documents the same three flags. | **Accepts both flags** |
| M1.2 | 2026-10-27 | tea 0.16.0 | `tea api --login local /repos/kaola-test/kaola-gitea-smoke/issues`; `tea api --login local --repo kaola-test/kaola-gitea-smoke '/repos/{owner}/{repo}/issues/1'` | Returns the smoke repo issue #1; `{owner}`/`{repo}` placeholders resolve from `--repo`. | **Works** |
| M1.3 | 2026-10-27 | tea 0.16.0 | `tea api --repo kaola-test/no-such-repo-xyz '/repos/{owner}/{repo}/issues'` | Body `{"message":"not found",...}` but **exit 0**. | **HTTP 404 is not a nonzero exit** |
| M1.4 | 2026-10-27 | tea 0.16.0 | In a temp git repo with `origin=http://127.0.0.1:3000/kaola-test/kaola-gitea-smoke.git`: `tea issues list -o json` | Returns issue #1 of `kaola-test/kaola-gitea-smoke`. | **Origin path used** |
| M1.5 | 2026-10-27 | tea 0.16.0 | Same, with `origin=http://127.0.0.1:3000/other-owner/kaola-gitea-smoke.git` | `Error: not found`, exit 1 — it asked the login host for the origin's owner/repo, not the local smoke path. | **Host match → origin path authoritative** |
| M1.6 | 2026-10-27 | tea 0.16.0 | Temp repo, `origin=https://github.com/other-fork/kaola-gitea-smoke.git`, `tea issues list -o json` | No refusal. Returns `kaola-test/kaola-gitea-smoke` issue #1 — the default login's only accessible repo; the origin owner/repo is ignored. | **Host mismatch → silent fallback to default login/repo** |
| M1.7 | 2026-10-27 | tea 0.16.0 | Temp repo, `origin=https://git.example.com/kaola-test/kaola-gitea-smoke.git`; also `origin=http://localhost:3000/...`; also `origin=ssh://git@localhost:2222/...` | All three return the local smoke repo (no refusal). `localhost:3000` and `localhost:2222` do **not** match the login URL host `127.0.0.1:3000`. | **Match is exact login-URL host; aliases and SSH origins do not match** |
| M1.8 | 2026-10-27 | tea 0.16.0 | Temp non-git directory, `tea issues list -o json` | Still returns the single accessible repo. | **No origin context also falls back to the single repo** |
| M1.9 | 2026-10-27 | tea 0.16.0 | Mismatch repo: `tea issues list --login local`; `tea issues list --repo kaola-test/kaola-gitea-smoke`; `tea issues list --remote origin` | All succeed. `--remote upstream` (absent remote) errors `remote 'upstream' not found`. `--login does-not-exist` errors `login name 'does-not-exist' does not exist`. | **Explicit flags work; `--remote` does not turn a host mismatch into a refusal** |
| M1.10 | 2026-10-27 | tea 0.16.0 | Two different hosts' logins, origin matching login B | **N/A — 需第二个授权 login.** The only login is `local`; creating or switching one is outside the authorized boundary. | **N/A** |

**M1 conclusion (single login).** tea does not compare the origin host against the login list and
refuse on mismatch. With a matching host it uses the origin's owner/repo; with a non-matching host
(or no origin) it silently uses the **default login**, and in this environment collapsed to that
login's only accessible repo. The dangerous cross-forge shape in §1.3 is therefore real at the
single-login level: an origin that points elsewhere can still drive a tea call against the local
Gitea. Whether a **second** login changes this (origin host selecting login B) is exactly the
unmeasured case and remains the P4 gate.

Not measured, and why:

- Two logins on two hosts: N/A, second authorized login required (hard boundary).
- Multiple accessible repos on one login: unmeasured; with only one repo, "single-repo fallback"
  cannot be separated from "interactive repo picker auto-picks the only choice".
- SSH/`insteadOf` rewriting: the SSH origin above was tested as written; `url.<base>.insteadOf`
  expansion was not added to this probe.

## M2 — Codex: two same-name skills from two plugins

Sandbox: `HOME=/tmp/kw-p0-m2/home`, `CODEX_HOME=/tmp/kw-p0-m2/home/.codex`, marketplace
`/tmp/kw-p0-m2/market`. The installed `~/.codex` was never used.

| # | Date | Version | Command | Observation | Result |
| --- | --- | --- | --- | --- | --- |
| M2.1 | 2026-10-27 | codex-cli 0.162.1 | `codex plugin marketplace add /tmp/kw-p0-m2/market --json`; `codex plugin add kw-a@p0-m2-market --json`; `codex plugin add kw-b@p0-m2-market --json`; `codex plugin list --json` | Both synthetic plugins install and report `enabled: true`. Each ships `skills/shared-skill/SKILL.md` with the same `name: shared-skill` and a different marker. | **Both enabled** |
| M2.2 | 2026-10-27 | codex-cli 0.162.1 | `codex debug prompt-input` (from a sandbox git repo) | Model-visible skills list contains both `kw-a:shared-skill` and `kw-b:shared-skill`, with separate file roots. | **Both load, plugin-namespaced; no refusal, no shadowing** |
| M2.3 | 2026-10-27 | codex-cli 0.162.1 | Real marketplace: `codex plugin add kaola-workflow@kaolabrother-kaola-workflow --json` and `codex plugin add kaola-workflow-gitea@kaolabrother-kaola-workflow --json`, then `codex debug prompt-input` | Both KW plugins are installed and `enabled: true`. The same skill base name appears as `kaola-workflow:kaola-workflow-next` and `kaola-workflow-gitea:kaola-workflow-next` (likewise `-init` / `-finalize`). | **Both real KW plugins load side by side** |

**M2 conclusion.** Codex namespaces skills by plugin (`<plugin>:<skill>`), so two same-name KW
skills from one marketplace coexist. The design branch "allow multiple plugins + edition guard" is
supported by this observation. The cache is version-keyed under
`$CODEX_HOME/plugins/cache/<marketplace>/<plugin>/<version>/`, as the installer assumes.

## M3 — Claude Code: two installed KW plugins and their command namespace

Sandbox: `HOME=/tmp/kw-p0-m3/home`, `CLAUDE_CONFIG_DIR=/tmp/kw-p0-m3/config`, marketplace
`/tmp/kw-p0-m3/market`. The installed `~/.claude` was never used.

The GitHub edition ships no `.claude-plugin/plugin.json` (its Claude path is `install.sh`); the two
in-tree installable Claude plugins are `plugins/kaola-workflow-gitlab` and
`plugins/kaola-workflow-gitea`. Both declare the same three command filenames, so they exercise the
same collision. Sandbox copies were used.

| # | Date | Version | Command | Observation | Result |
| --- | --- | --- | --- | --- | --- |
| M3.1 | 2026-10-27 | Claude Code 2.1.311 | `claude plugin marketplace add /tmp/kw-p0-m3/market --json`; `claude plugin install kaola-workflow-gitlab@p0-m3-market`; `claude plugin install kaola-workflow-gitea@p0-m3-market`; `claude plugin list --json` | Both report `enabled: true`, `scope: user`, version 12.6.0. | **Both installed and enabled** |
| M3.2 | 2026-10-27 | Claude Code 2.1.311 | `claude plugin details kaola-workflow-gitlab`; `claude plugin details kaola-workflow-gitea` | Each lists 6 skills: three `kaola-workflow-*` skills plus the three `workflow-*` command-backed entries. No refusal. | **Components coexist** |
| M3.3 | 2026-10-27 | Claude Code 2.1.311 | `claude -p "hi" --output-format stream-json --verbose` with an intentionally invalid `ANTHROPIC_API_KEY`, then read the `system/init` line | `slash_commands` contains `kaola-workflow-gitlab:workflow-next`, `kaola-workflow-gitea:workflow-next`, `…:workflow-init`, `…:kaola-workflow-finalize`; `skills` contains `kaola-workflow-gitlab:kaola-workflow-next`, `kaola-workflow-gitea:kaola-workflow-next`, and the `-init` / `-finalize` pairs. No unprefixed `workflow-next` is present. | **Commands and skills are plugin-namespaced; both plugins coexist** |

The invalid key means the init event was captured before authentication failed; no model response
was produced. `plugin details` alone does not show the namespace, so the init inventory is the
decisive evidence.

## M4 — additive runtimes: N/A

**N/A.** P3's layout question is "union of installed-forge scripts + multi entry, and prune only
outside the union". That is installer/routing logic over facts already anchored in #1123 §1.2
(installer source, manifest, prune code), and it is exercised by P2/P3 acceptance in sandboxes. It
does not depend on an unmeasured capability of opencode/Kimi/Grok/ZCode/Cursor/Devin/Droid/DSH/
Antigravity. If P3 later chooses "single forge + P1 guard" for a runtime, that also needs no new
runtime probe.

## D1–D6 — recommended defaults

The instruction was: record the recommended defaults; list a **true fork** only where a measurement
contradicts the recommendation. No measurement contradicts a recommendation, so there are **no true
forks**.

| # | Recommended default | Measurement bearing on it | Verdict |
| --- | --- | --- | --- |
| D1 | Multi-forge machine with T1–T3 unresolved → refuse `forge_unresolved` | M1 shows tea itself silently falls back to the default login on a host mismatch; silent defaulting is a real failure path, not hypothetical. | **Confirmed, no fork** |
| D2 | T2 in `git config --local kaola-workflow.forge` | Re-verified on git 2.54.0: the value is read from `main` and from a linked worktree; it is stored in the common `.git/config` (`--show-origin` = `file:.git/config`) and is not tracked. | **Confirmed, no fork** |
| D3 | T1/T2 conflicting with a decisive T3 → refuse `forge_conflict` | M1.6/M1.7: a mismatched origin neither refused nor used the origin path; it landed on the default login's repo. That is the wrong-repo hazard D3 is meant to stop. | **Confirmed, no fork** |
| D4 | `--forge` accepts a list; a single value keeps today's "replace the entry" semantics | No P0 measurement contradicts it; it is an installer contract, not a measured runtime behavior. | **Confirmed, no fork** |
| D5 | Measure prompt-size increment first, then set the `multi` cap | Not measured in P0; belongs to the P2 rendering work. No number is proposed here. | **Confirmed, no fork (number deferred)** |
| D6 | Include GitLab in the same mechanism; acceptance still needs only GitHub + Gitea | M3 exercised the GitLab and Gitea Claude plugins with the same result, so the mechanism is not Gitea-specific. | **Confirmed, no fork** |

## Open items reported to Host (not forks)

1. **P4 gate is undetermined.** The two-login selection test is N/A because no second authorized
   login exists. §3.4's precondition ("only if P0-M1 proves tea ignores the remote host when
   multiple logins exist") therefore cannot be evaluated. P4 must stay gated until a second
   authorized login is available; this run must not create one.
2. **Exact host matching.** tea matched the origin only when the host string equalled the login URL
   host (`127.0.0.1:3000`). `localhost:3000` and SSH `localhost:2222` did not match and fell back.
   P1's T3/`forge_hosts` must treat SSH origins and host aliases as unknown unless explicitly
   mapped; do not assume "same machine" means "same host string".
3. **`tea api` exit status.** An HTTP 404 body still exits 0. Any gitea-edition guard/error path that
   relies on `tea api`'s exit code alone would treat that 404 as success; body parsing or an
   explicit status check is required. (Observed on tea 0.16.0; not a design fork, an implementation
   caution for P1.)

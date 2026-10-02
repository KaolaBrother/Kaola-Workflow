# Issue 1113 origin-fallback micro-repair

Seat: cursor-KW-i1113-originfix. Host: zcode-KW-orchestrator-keepopen-pr.
Worktree: `/Users/ylmacstudio/Workspace/kaola-workflow/.kw/worktrees/issue-1113`
Branch: `workflow/issue-1113`
Base: `45e6deb17f57adc98e04e4cc56cd426d8b54a3f9`
Commit: `969b11b6bc7192361bfc5e6b840ef6773ebf655c`
Subject: `fix(#1113): restrict the scanner origin fallback to GitHub remotes`
Author and committer: KaolaBrother <yanleichen@hotmail.com>. No trailers. Not pushed.
Parent of the delivered commit is `45e6deb1`. Worktree status after the commit: clean (`## workflow/issue-1113` only).

No new claim, worktree, branch, or ledger write. No finalize, merge, close, or push.
Specification: Host ruling 2 in `host-indqa-v5-acceptance.md`, measured in section 4.4 of
`keepopen-independent-pins-v5/REPORT.md`.

## Code change

Canonical file `scripts/kaola-workflow-sink-pr.js`. The Codex mirror
`plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js` is the edition-sync byte copy of that
file (`cmp` identical). Line numbers below are the canonical file at `969b11b6`.

`originOwnerRepo` no longer calls `asOwnerRepo`. A relative two-segment origin such as
`repo/origin.git` or `../origin.git` does not become an identity.

- Scanner comment, lines 157–171. State still normalizes `claim_repository_id` from the GitHub
  URL forms and from an already-normalized `OWNER/REPO`. If those lines do not yield one
  identity, the fallback is `git remote get-url origin` on the main checkout root. That remote
  yields an identity only for those GitHub URL forms. A non-GitHub remote yields no identity,
  and every keyword-qualified reference counts.
- `GITHUB_URL_OWNER_REPO`, lines 175–183: the four URL forms, unchanged from the previous
  `asOwnerRepo` URL alternatives (`https://github.com/`, `ssh://` with an optional user,
  `git://github.com/`, `git@github.com:`).
- `BARE_OWNER_REPO`, lines 185–189. Each segment must start with an alphanumeric. `../` and
  `./` shapes do not parse. `KaolaBrother/Kaola-Workflow` still parses. The comment on these
  lines states the inherent limitation below.
- `firstOwnerRepo`, lines 191–197. `githubUrlOwnerRepo`, lines 199–203, uses only the URL
  patterns. `asOwnerRepo`, lines 205–210, uses the URL patterns plus the tightened bare
  alternative. State reading (`claimRepositoryFromTexts`, line 238) and
  `closingIssueNumbers` (line 220) still call `asOwnerRepo`.
- `originOwnerRepo`, lines 250–259, returns `githubUrlOwnerRepo(remote)`.
- `main`, lines 775–780: origin accepts only a GitHub remote URL; empty identity still means
  qualified references count.
- `module.exports`, lines 1016–1019, also exports `asOwnerRepo` and `githubUrlOwnerRepo` so the
  walkthrough can call the two parsers.

`CLOSING_ASSOC_RE` (line 172) is unchanged. Full-URL references are still not matched.

## Parser split

| input | `githubUrlOwnerRepo` (origin) | `asOwnerRepo` (state) |
|---|---|---|
| `https://github.com/OWNER/REPO(.git)` optional trailing slash | `OWNER/REPO` | `OWNER/REPO` |
| `git@github.com:OWNER/REPO(.git)` | `OWNER/REPO` | `OWNER/REPO` |
| `ssh://[user@]github.com/OWNER/REPO(.git)` | `OWNER/REPO` | `OWNER/REPO` |
| `git://github.com/OWNER/REPO(.git)` | `OWNER/REPO` | `OWNER/REPO` |
| `KaolaBrother/Kaola-Workflow` | `''` | `KaolaBrother/Kaola-Workflow` |
| `../origin.git`, `./origin.git` | `''` | `''` |
| `repo/origin.git` | `''` | `repo/origin` (inherent limitation) |
| absolute local path, other host | `''` | `''` unless the string is a bare slug |

An empty origin identity makes `sameRepository` count every qualified reference (line 213).

## Tests

Extended `testExplicitKeepOpenPrP1Repairs` in `scripts/simulate-workflow-walkthrough.js`. No new
scenario and no new framework.

- Helper, lines 7992–8023. `githubUrlOwnerRepo` parses `https://github.com/…`,
  `git@github.com:…`, `ssh://git@github.com/…`, `ssh://github.com/…` (no user), and
  `git://github.com/…`. It returns `''` for `../origin.git`, `repo/origin.git`,
  `/tmp/fixture/repo/origin.git`, and `https://gitlab.com/Fixture-Owner/Fixture-Repo.git`.
  `asOwnerRepo('KaolaBrother/Kaola-Workflow')` and the https state form still parse.
  `asOwnerRepo('../origin.git')` and `asOwnerRepo('./origin.git')` return `''`.
- `runCase` lines 8067–8074: an optional `originUrl` moves the bare remote to that relative
  path and asserts `git remote get-url origin` stays that string. Cleanup of a path outside
  the fixture root is lines 8114–8116. `repo/origin.git` stays inside the fixture root.
- Absolute local origin, lines 8191–8201 (`scan-unknown`, v5-c1 semantics): no parseable
  `claim_repository_id`, origin remains the absolute bare path from `initGitRepoWithBareRemote`,
  commit `Fixes other/repo#143`. Still `explicit_keep_open_refused: closing_linkage` before
  push (`assertNoEffects`).
- Relative origin, lines 8203–8216 (`scan-rel-origin`): same state and the same commit, origin
  set to `repo/origin.git`. Same refusal before push.

## Checks

All commands were run in the issue-1113 worktree. The combined walkthrough ran after the mirror
write. Canonical bytes did not change between that walkthrough and the commit.

| command | exit |
|---|---|
| `node scripts/edition-sync.js --write` | 0 |
| `node scripts/validate-script-sync.js` | 0 |
| `node scripts/edition-sync.js --check` | 0 |
| `node scripts/generate-routing-surfaces.js --check` | 0 (24 surfaces) |
| `node scripts/validate-workflow-contracts.js` | 0 |
| `node scripts/simulate-workflow-walkthrough.js --only testExplicitKeepOpenPrP1Repairs --only testSinkPr` | 0 (21 scenarios) |

`validate-script-sync.js` reported the common scripts and byte-identical groups in sync.
An earlier isolated `--only testExplicitKeepOpenPrP1Repairs` also exited 0, before the mirror
write.

Mirror regen: `codex-sync plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js`;
`edition-sync: write complete (1 file(s) updated).`

## Docs

- ADR 0031 decision 10, lines 67–72: when `claim_repository_id` does not yield one repository,
  origin is the fallback and yields an identity only for `https://github.com/`,
  `ssh://[user@]github.com/`, `git://github.com/`, and `git@github.com:`. A non-GitHub remote
  yields no identity, and every keyword-qualified reference counts.
- ADR 0031 consequences, lines 106–108: the same origin-fallback sentence. Status stays
  Accepted. No other ADR text was rewritten.
- CHANGELOG `[Unreleased]` does not mention the origin fallback. Those lines were left as
  written. No release header was added.

## Inherent limitation

A corrupted state `claim_repository_id` whose value is slug-shaped, for example
`repo/origin.git`, is syntactically the same as a legitimate normalized `OWNER/REPO`.
`asOwnerRepo` parses it as `repo/origin`. This repair does not reject that state shape: doing
so would also reject a real normalized slug. The origin fallback does not use `asOwnerRepo`,
so the same string as a remote URL yields no identity. The limit is stated in the
`BARE_OWNER_REPO` comment (lines 185–188) and is not given a walkthrough assertion that would
freeze the garbage parse as required behavior.

## Not done, and why

- Mission ledger was not written. The Host owns it. This seat resumed the existing issue-1113
  context and did not claim.
- No finalize, merge, issue close, or push.
- `npm test` was not run. A later seat re-binds that chain.
- `docs/api.md` does not mention the origin fallback. It was left unchanged. The public
  scanner sentence there still describes the known-identity rule only.
- Full-URL references remain the recorded unverified gap and were not asserted.
- GitLab and Gitea sink ports were not edited. This mode is GitHub-only, and edition-sync
  does not generate those sinks.
- The first commit object created for this change, `325f41a2`, carried an environment-injected
  `Co-authored-by: Cursor` trailer. It was not pushed. The branch tip was replaced, before
  any push, with `969b11b6`: same tree, same parent `45e6deb1`, same author and committer,
  message exactly as specified, no trailer. Earlier commits on the branch were not rewritten.

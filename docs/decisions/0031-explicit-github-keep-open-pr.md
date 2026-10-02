# ADR 0031 — Explicit GitHub singleton keep-open PR

Status: Accepted · Date: 2026-10-02 · Issue: #1113

## Context

#1098 D4=(a) made keep-open merge-sink-only. A PR body of `Closes #N` would close the issue the run
had decided to keep open, so `sink-pr` refuses `issue_action: comment_keep_open` before any effect.
That refusal, and the tests that pin the `merge-sink-only` sentence, stay accurate as history and as
the default.

VRPCadCore #143 needs a GitHub review request for a research/artifact publication while the issue
stays open. Astra's standing closeout memo (SHA-256
`3eedcc40d7568d4a9bfa95a5890e1e5b28e687abf54ad812cc1cf0a28213747a`) and the Host adoption record
(SHA-256 `4aeedbcf2d0e8cbba4eefcaa3a82355cb91c1220a7ea038efd1d82417fcdad50`) authorize that narrow
capability under Yanlei's standing authority, relayed 2026-10-02. This ADR records the delegated
decision. It does not rewrite #1098.

On 2026-10-02 the owner corrected issue #1113, and that correction is this capability's governing
authorization. The scoped-adoption decision and any installer, adoption, activation, or uninstall
scope are superseded and out of scope for this issue; none is implemented here. The memo and
adoption records cited above remain historical motivation only. #1098 history is unchanged.

## Decision

1. Default close mode is unchanged. A keep-open state that does not carry the explicit agreement is
   still refused with the historical merge-sink-only sentence.
2. The only new mode is GitHub, singleton, and explicit. All of these must agree: CLI
   `--keep-open-pr explicit_singleton`, `issue_action: comment_keep_open`,
   `keep_open_pr: explicit_singleton`, `sink: pr`, and exactly one issue. The branch, and a
   `base_branch` when one is recorded, must match. Each of those identity fields is declared once.
   A repeated field, a repeated CLI identity flag, or a repeated member token is
   `ambiguous_identity`. An issue token that is not a canonical positive integer is
   `malformed_issue`. Both refuse before push, create, or an OFFLINE placeholder. Close mode still
   uses the first matching field and the filtered member parser. A bundle, another forge, a partial
   marker, or a mismatched issue, branch, base, or head is refused before push or create.
3. The request does not close the issue. The body is `Keeps #N open.` plus non-closing sentences.
   Commit messages on `base..head`, and an open request's body and title, are refused when the
   association rule below links the retained issue. Reuse still requires the open request to name
   `#N`.
4. The mode is request-only. It does not probe the merge queue and does not call `gh pr merge`, even
   when `pr_auto_merge` is true. It does not edit that config.
5. The watcher tells the truth. An issue still open is `intentionally_kept_open`. An issue actually
   closed is `keep_open_violation` and is not reopened. An unreadable probe is `unknown`, not
   `skipped_offline` and not a success. Run archive status `closed` still means the run archived.
6. GitLab and Gitea keep the unconditional keep-open request refusal. No other forge semantics change.
7. Intent is line existence. Any `keep_open_pr` line counts, including an empty value, and any
   `--keep-open-pr` token counts. Intent without the full agreement refuses with
   `explicit_keep_open_refused` before push, create, archive publication, or an OFFLINE
   placeholder. A duplicate line or token is `ambiguous_identity`. A wrong token is
   `mode_mismatch`. A marker without the flag is `partial_marker`. A flag with no state file is
   `state_missing`. No `keep_open_pr` line and no flag leaves close mode unchanged, and
   `issue_action: comment_keep_open` with neither is still the #336/#1098 refusal.
8. Explicit OPEN reuse and OPEN discovery read `closingIssuesReferences`. Objects in that array
   contribute their `number`s. If the set contains the retained issue, refuse
   `native_closing_linkage`. If the field is missing or unparseable, refuse
   `native_closing_unmeasured`. An empty array stays reusable. The sink does not unlink or edit
   the pull request.
9. The same lookup reads `autoMergeRequest`. `null` is disabled and stays reusable. A non-null
   object refuses `auto_merge_enabled` before push or archive publication. The sink does not
   disable that setting and does not describe merge-queue behavior it did not measure. A missing
   or unparseable value refuses `auto_merge_unmeasured`. MERGED and CLOSED-unmerged lanes stay
   as they are.
10. A closing keyword associates only the reference it immediately precedes. The keywords are
    `close`/`closes`/`closed`, `fix`/`fixes`/`fixed`, and `resolve`/`resolves`/`resolved`, with
    optional whitespace or punctuation before that one reference. A qualified `owner/repo#N`
    counts when that owner/repo is the run's own repository, compared case-insensitively, and
    does not count for another repository. A full issue URL
    `https://github.com/OWNER/REPO/issues/N` after that keyword counts as a closing reference
    to N exactly when OWNER/REPO matches that same identity. A URL for another repository does
    not count. When the identity is empty, a URL reference counts, the same fail-closed rule as
    a qualified reference. Same-repository issue-URL references are recognized per the supplied
    native observations
    (`.kaola/outer-review-1113/github-url-reference-observations.json`; nodejs/node pull
    requests 66406, 66240, 66371, and 66325), including `Fixes: URL`, `Fixes URL`, and
    `Fixes URL.` with other text on the same line. Foreign-repository URLs are ignored.
    Unknown identity counts them. A bare `#N` that the keyword does not immediately precede
    does not count. Commit messages, reused body and title, and the generated body use this
    rule.
11. In explicit mode the repository fact is reconciled with the publication target before any
    closing scan, push, create, or OFFLINE placeholder, and after the marker and OFFLINE gates.
    The state identity is `claim_repository_id` through the existing parser. The origin identity
    is `git remote get-url origin` on the main checkout, GitHub URL forms only
    (`https://github.com/`, `ssh://[user@]github.com/`, `git://github.com/`, and
    `git@github.com:`), and it is always read in explicit mode. If both yield identities and
    they disagree case-insensitively, explicit mode refuses `repository_conflict` and the
    message names both identities. If the state yields an identity and origin does not parse,
    the state identity stands. If the state yields none, origin decides. If neither yields one,
    the identity is empty and qualified references and issue URLs count.

## Consequences

Finalize captures `keep_open_pr` and passes the flag only when the value is `explicit_singleton`.
The script re-checks the full agreement, so a rendered flag without the durable lines still refuses.
The explicit gate rejects a second identity line instead of keeping the first. The close-mode parser
is unchanged. On `watch-pr`, any `keep_open_pr` line is explicit intent. The live MERGED lane and the
archived MERGED lane require one unambiguous canonical agreement of `issue_action`, `keep_open_pr`,
`sink`, `issue_number`, `branch`, and optional `issue_numbers` / `base_branch` before archive,
mainline advance, claim cleanup, worktree removal, or a successful receipt. A repeated field or a
repeated member is `ambiguous_identity`. A non-canonical issue token is `malformed_issue`. A partial
or conflicting marker refuses with `explicit_keep_open_refused` and does not fall through to ordinary
close. A valid explicit singleton still records an open issue as `intentionally_kept_open`, a CLOSED
issue as `keep_open_violation` with no reopen, and an unreadable probe as `unknown`, and its existing
cleanup stays. Ordinary close, which has no `keep_open_pr` line, is unchanged. The watcher is not a
second publisher. Active-folder `field()` remains first-match for close mode.
`remote_issue_closed` gains the token `unknown` in the shared closure schema. Only this GitHub
watcher emits it. `checkClosureInvariants` skips `remote-members-closed` for an intentionally open
explicit receipt and adds `keep-open-pr-violated` or `keep-open-pr-unknown` otherwise. Those ids are
not new `CLOSURE_INVARIANTS` entries.

Active-folder readers expose `issue_action` and `keep_open_pr` as empty strings when absent. They
are not shared-state fields.

Any `keep_open_pr` line is explicit intent on this sink as well as on `watch-pr`, including an
empty value. A duplicate marker refuses before close-mode selection. Explicit OPEN reuse refuses
a native closing association with the retained issue, an unreadable `closingIssuesReferences`
value, and an already-enabled `autoMergeRequest`, and it leaves the pull request unchanged. The
closing scan associates a keyword only with the reference it immediately precedes. A qualified
reference counts when it matches the run's own repository and does not count for another
repository. A same-repository issue URL `https://github.com/OWNER/REPO/issues/N` counts the
same way. A URL for another repository does not. When the identity is empty, qualified
references and issue URLs count. Same-repository issue-URL references are recognized per the
supplied native observations
(`.kaola/outer-review-1113/github-url-reference-observations.json`; nodejs/node pull requests
66406, 66240, 66371, and 66325). In explicit mode the state identity and the origin identity
are both read. If both parse and disagree case-insensitively, the sink refuses
`repository_conflict` before any scan, push, create, or placeholder, and the message names both
identities. A state identity stands when origin does not parse. When state yields none, origin
decides.

Status is Accepted. This repair round is the final freeze of the semantics in this record.
Acceptance here is not a merge and not a release.

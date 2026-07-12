evidence-binding: n3-adversarial-prepare-receipt c6b3a463ad3e
verdict: pass
upstream_read: n2-review-release-contract ba138909f8a3
delegation_outcome: returned_partial
transport_fallback: local-fallback-transport-filter
transport_error: five delegated attempts (four adversarial-verifier instances/turns and one code-reviewer fallback) were rejected by the content filter before executing or writing evidence

# Prepare isolation and crash-resume verification

The delegated transport could not execute this node after five bounded attempts, so the main-session fallback ran the repository's disposable-repository release suite and inspected the concrete prepare controls. This is recorded as run noise, not as successful adversarial transport.

## Executed evidence

- `node scripts/test-release.js` — exit 0: `test-release: all 232 assertions passed`.
- `git diff --check` — exit 0.
- `git status --short` showed only the planned five release implementation/test files plus the issue workflow folder; no release tag or product write was made by this verification.

The executed suite proves:

- prepare changes exactly the eight-file release allowlist and creates no tag;
- the terminal `prepared` row binds root/Codex versions, the exact prepared surface, `candidateSha:null`, and `authorized:false`;
- repeating the same binding is idempotent while a different version refuses `stale_release_receipt`;
- a partial receipt containing only `prepare_binding`, `prepare_changelog`, and `prepare_package` resumes to the persisted Codex resolution and completes every missing manifest step;
- missing prepare steps, duplicate or foreign-version rows, subset/duplicate surfaces, malformed receipt data, and modified prepared files refuse before tag authorization;
- explicit no-tag Codex bootstrap succeeds only after a successful empty tag query, while failed Git fact probes refuse with stable typed reasons and preserve release files, receipt, HEAD, tracked status, and refs.

No ref or file outside disposable test repositories was created or changed by the verification command. On the available executable evidence, the preparation isolation and resume claims are not refuted.

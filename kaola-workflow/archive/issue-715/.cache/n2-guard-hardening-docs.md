evidence-binding: n2-guard-hardening-docs 29e34dc5f164
upstream_read: n1-guard-hardening-fix f6077183028a
role: doc-updater
node: n2-guard-hardening-docs (issue-715, plan epoch 3)
docs_updated: CHANGELOG.md (one [Unreleased]/Fixed entry for the guard-hardening follow-up repair —
  sentinel/falsified-base rejection before staging + post-commit re-verification with truthful downgrade,
  appended directly after the epoch-2 F1-repair #715 entry; existing epoch-1 and epoch-2 entries untouched);
  docs/api.md (NATIVE=0 in-place branch paragraph AND the Closure Contract "Discard-archive commit
  (issue #715)" paragraph — the base-branch guard now validates that the recorded base names a real
  surviving branch: 'HEAD' detached sentinel rejected outright, rev-parse --verify refs/heads/<base>
  required, base naming the discarded branch refused, sweep posture requires the repo default branch; and
  the landed commit is re-verified via re-resolved checkout + merge-base --is-ancestor HEAD base, any
  violation downgrading to discard_archive_committed: false with the ACTUAL receiving branch disclosed and
  residue recoverable); docs/workflow-state-contract.md (§ Terminal journal disposal — added the
  validation-and-truthful-downgrade distinction in two sentences). Docs only; no decision record.
fields_mirrored: emit fields mirrored verbatim from n1 and re-verified against the shipped code —
  discard_archive_committed / discard_archive_branch / discard_archive_commit_detail at both emit sites
  (scripts/kaola-workflow-claim.js release lines 3496-3499, sweep lines 4492-4495); helper result shape
  { committed, branch, detail } (commitDiscardArchive, lines 2364-2469). No field names invented.
anti_fabrication: read n1 epoch-3 evidence FIRST; the upstream_read nonce f6077183028a was copied from that
  file's own line-1 evidence-binding header, not from the node prompt. Every documented guard was
  cross-checked against the shipped helper before writing: base==='HEAD' rejection (claim.js:2389-2393),
  rev-parse --verify refs/heads/<base> (2394-2406), discardedBranch refusal (2407-2413), sweep defaultBase
  constraint (2414-2422), current-branch===base skip retained from epoch-2 (2423-2427), post-commit
  re-resolve + actual-receiver downgrade (2440-2453), merge-base --is-ancestor reachability fail-closed
  (2454-2461). No doc sentence claims behavior absent from the helper.
write_set: CHANGELOG.md, docs/api.md, docs/workflow-state-contract.md, and this evidence file — nothing else.

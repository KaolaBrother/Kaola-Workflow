# Host acceptance — independent micro-recheck v6 (devin-KW-i1113-indqa4)

Event: devin idle, fingerprint sha256:2436662f8c2c093361d9e8ad062bf3e483aedc19f26722d8f8506a0c32c8ba84 matched dispatch. Worktree clean at 969b11b6bc7192361bfc5e6b840ef6773ebf655c throughout; v1-v5 immutable (full v5 shasum -c OK); repository read-only; no network transport in any row (push-URL override + protocol.allow=never; noNetworkTransportInGitTrace asserted). REPORT sha256 35bc8b18d96d423c34c60dd75878b39efb163982b1380fdf3375c617c67e4183.

ACCEPTED as the factual independent micro-recheck of 969b11b6: 9/9 rows PASS (five origin-fallback discriminations: relative repo/origin.git, relative ../origin.git, absolute local path, GitHub-URL identity match, GitHub-URL foreign ignored, other-host count-all; plus clean-create smoke, malformed-intent smoke, 49-check parser helper) with full no-effect assertions, per-row origin-byte and identity evidence, decoy-state check, fail-closed empty-selection exit 1, and the discrimination control on 45e6deb1 reproducing the v5 finding end to end (a1/a2/h1 RED there; all three PASS on 969b11b6). Carryover from v5 by the recorded blob-diff scope (parsers/comments/one-line originOwnerRepo/exports only).

Host notes for the outer record:
- The relative-path origin defect is fixed in the fail-closed direction and independently verified end to end; the prior repair report's incorrect "a local path does not parse" sentence is superseded by measured behavior (absolute always; relative now too).
- http:// and www.github.com origin shapes yield no identity (over-count, fail-closed) - recorded, not a defect.
- Slug-shaped garbage in a corrupted state claim_repository_id line remains syntactically indistinguishable from a legitimate normalized slug (recorded inherent limitation, disclosed to the outer; not reachable via origin).
- Full-URL closing references remain the recorded unverified gap.

Remaining before the round-2 outer delivery: droid-KW-i1113-chains4 final walkthrough + producer chain bound to 969b11b6 (in flight). No waiver issued.
